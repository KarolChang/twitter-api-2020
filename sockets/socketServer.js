const db = require('../models')
const Chat = db.Chat
const User = db.User
const { authenticated, userIndex, formatMessage } = require('./utils')

const users = []
const botName = 'Chat Bot'
const connectionCount = {}

module.exports = (io) => {
  // 驗證身分
  io.use(authenticated)

  // run when connect
  io.on('connection', async (socket) => {
    // emit user to frontend
    socket.emit('userInfo', socket.user)
    // 若使用者第一次進來聊天室，則加入 userList 並傳送系統歡迎訊息
    if (userIndex(users, socket.user.id) === -1) {
      // put userInfo to users
      users.push(socket.user)
      // 計算單一 user connection 次數
      connectionCount[socket.user.id] = 1
      // send to single user
      socket.emit('chatMsg', formatMessage(botName, `${socket.user.name}, Welcome to chat!`))
      // send to other users
      socket.broadcast.emit('chatMsg', formatMessage(botName, `${socket.user.name} has joined the chat`))
    } else {
      // 計算單一 user connection 次數
      connectionCount[socket.user.id] ++
      // find chat records in db & emit to frontend
      let chatRecords = await Chat.findAll({
        raw: true,
        nest: true,
        include: [User]
      })
      chatRecords = chatRecords.map(record => ({
        id: record.id,
        text: record.message,
        time: record.time,
        UserId: record.UserId,
        username: record.User.name,
        avatar: record.User.avatar
      }))
      socket.emit('historyMsg', chatRecords)
    }

    // online count
    io.emit('onlineCount', users.length)

    // user list
    io.emit('userList', users)

    // listen for userMsg
    socket.on('userMsg', async (msg) => {
      const msgData = formatMessage(socket.user.name, msg)
      msgData.avatar = socket.user.avatar
      io.emit('chatMsg', msgData)
      // store in db
      if (msgData.text && msgData.time) {
        await Chat.create({
          UserId: socket.user.id,
          message: msgData.text,
          time: msgData.time
        })
      }
    })

    // run when client disconnect
    socket.on('disconnect', () => {
      // 計算單一 user connection 次數
      connectionCount[socket.user.id] --
      if (connectionCount[socket.user.id] === 0) {
        // take userInfo to users
        users.splice(userIndex(users, socket.user.id), 1)
        io.emit('chatMsg', formatMessage(botName, `${socket.user.name} has left the chat`))
      }

      // online count
      io.emit('onlineCount', users.length)

      // user list
      io.emit('userList', users)
    })
  })
}
