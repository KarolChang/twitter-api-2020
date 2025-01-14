const express = require('express')
const bodyParser = require('body-parser')
const cors = require('cors')
const http = require('http')
const socketIo = require('socket.io')

// .env
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config()
}

const app = express()
const port = process.env.PORT || 3000

// 載入 cors
app.use(cors())

// 載入 bodyParser
app.use(bodyParser.urlencoded({ extended: true }))
app.use(bodyParser.json())

// 載入 routes
require('./routes')(app)

// 設置錯誤訊息
app.use((err, req, res, next) => {
  if (err) {
    res.status(500).json({ status: 'error', message: String(err) })
    return next()
  }
})

// set socket.io
app.get('/chat', (req, res) => {
  res.sendFile( __dirname + '/sockets/index.html')
})
app.get('/chat/pub', (req, res) => {
  res.sendFile( __dirname + '/sockets/pub.html')
})
app.get('/chat/room', (req, res) => {
  res.sendFile( __dirname + '/sockets/room.html')
})
const server = http.createServer(app)
const io = socketIo(server, {
  cors: {
    origin: '*',
    credentials: true
  }
})
require('./sockets/socketServer.js')(io)
server.listen(port, () => console.log(`Socket server listening on port ${port}!`))

module.exports = app
