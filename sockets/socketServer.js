const db = require('../models')
const Chat = db.Chat
const User = db.User
const { userIndex, authenticated, formatMessage, historyMsg } = require('./utils')

const users = []
const botName = 'Chat Bot'
const connectionCount = {}
const unreadMsg = []

module.exports = (io) => {
  // 驗證身分
  io.use(authenticated)

  // run when connect
  io.on('connection', async (socket) => {
    // 加入房間 (預設進入 publicRoom)
    socket.join(socket.user.channel)
    // emit user to frontend
    socket.emit('userInfo', socket.user)
    // 是否有未讀訊息
    const msg = unreadMsg.filter(msg => msg.userName === socket.user.name)
    if (msg.length > 0) {
      socket.emit('unreadMsg', msg)
    }
    // find chat records in db & emit to frontend
    const chatRecords = await historyMsg(socket.user.channel, Chat)
    socket.emit('historyMsg', chatRecords)
    // 若使用者第一次進來聊天室，則加入 userList 並傳送系統歡迎訊息
    if (userIndex(users, socket.user.id) === -1) {
      // put userInfo to users
      users.push(socket.user)
      // 計算單一 user connection 次數
      connectionCount[socket.user.id] = 1
      if (socket.user.channel === 'publicRoom') {
        // 歡迎訊息
        socket.emit('chatMsg', formatMessage(botName, `${socket.user.name}, Welcome to chat!`))
        // 加入聊天室訊息
        socket.to(socket.user.channel).emit('chatMsg', formatMessage(botName, `${socket.user.name} has joined the chat`))
      }
    } else {
      // 計算單一 user connection 次數
      connectionCount[socket.user.id] ++
    }

    // online count
    io.to(socket.user.channel).emit('onlineCount', users.length)

    // user list
    io.to(socket.user.channel).emit('userList', users)

    // listen for userMsg
    socket.on('userMsg', async (msg) => {
      const msgData = formatMessage(socket.user.name, msg)
      msgData.avatar = socket.user.avatar
      io.to(socket.user.channel).emit('chatMsg', msgData)
      // 未讀訊息數
      if (socket.user.channel !== 'publicRoom') {
        const userList = socket.user.channel.split('-')
        const userName = userList.find(user => user !== socket.user.name)
        const userOnline = users.findIndex(user => user.name === userName)
        if (userOnline === -1) {
          // 未讀訊息存在 unreadMsg
          unreadMsg.push({
            msg: msg,
            userName: userName
          })
        }
      }
      // store in db
      if (msgData.text && msgData.time) {
        await Chat.create({
          UserId: socket.user.id,
          message: msgData.text,
          time: msgData.time,
          channel: socket.user.channel
        })
      }
    })

    // listen for privateUser
    socket.on('privateUser', async (username) => {
      // 找出 user
      const user = await User.findOne({ where: { name: username }})
      if (user) {
        // 告訴前端 user存在
        socket.emit('findUser', `user: ${username} has been found~`)
        // 建立房間
        const userList = []
        userList.push(username, socket.user.name)
        userList.sort()
        const roomName = userList.join('-')
        // 更換使用者頻道
        socket.user.channel = roomName
        // 切換房間
        socket.join(roomName)
        // find chat records in db & emit to frontend
        const chatRecords = await historyMsg(socket.user.channel, Chat)
        socket.emit('historyMsg', chatRecords)
      } else {
        // 告訴前端 user 不存在
        socket.emit('findUser', `can not find user: ${username}!`)
      }
    })

    // run when client disconnect
    socket.on('disconnect', () => {
      // 計算單一 user connection 次數
      connectionCount[socket.user.id] --
      if (connectionCount[socket.user.id] === 0) {
        // take userInfo to users
        users.splice(userIndex(users, socket.user.id), 1)
        // 離開聊天室訊息
        if (socket.user.channel === 'publicRoom') {
          io.to(socket.user.channel).emit('chatMsg', formatMessage(botName, `${socket.user.name} has left the chat`))
        }
      }

      // online count
      io.emit('onlineCount', users.length)

      // user list
      io.emit('userList', users)
    })
  })
}
