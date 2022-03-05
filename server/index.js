const meaasge = require('./modules/message')

module.exports = (server) => {
  const io = require('socket.io')(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
      allowedHeaders: ['Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization'],
      credentials: true
    },
    rejectUnauthorized: false
  })
  io.on('connection', (socket) => {
    // 可以在伺服器端顯示通道過來的所有事件，以及相關的參數
    socket.onAny((event, ...args) => {
      console.log(event, args)
    })
    socket.on('disconnect', (reason) => console.log(reason))
    meaasge(io, socket)
  })
}