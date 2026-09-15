const http = require('node:http')
const next = require('next')
const { Server } = require('socket.io')

const dev = process.env.NODE_ENV !== 'production'
const hostname = '0.0.0.0'
const port = Number(process.env.PORT || 3000)
const app = next({ dev, hostname, port })
const handle = app.getRequestHandler()

const waiting = []
const partners = new Map()
const rooms = new Map()

function removeFromWaiting(id) {
  const index = waiting.indexOf(id)
  if (index !== -1) waiting.splice(index, 1)
}

app.prepare().then(() => {
  const httpServer = http.createServer((req, res) => handle(req, res))
  const io = new Server(httpServer, {
    cors: { origin: true, credentials: true },
  })

  io.on('connection', (socket) => {
    socket.on('find-match', () => {
      removeFromWaiting(socket.id)
      const availableId = waiting.shift()
      const available = availableId && io.sockets.sockets.get(availableId)

      if (!available || available.id === socket.id) {
        waiting.push(socket.id)
        socket.emit('match-status', { status: 'waiting' })
        return
      }

      const roomId = [socket.id, available.id].sort().join(':')
      socket.join(roomId)
      available.join(roomId)
      rooms.set(roomId, new Set([socket.id, available.id]))
      partners.set(socket.id, available.id)
      partners.set(available.id, socket.id)
      socket.emit('match-status', { status: 'matched', roomId, initiator: true })
      available.emit('match-status', { status: 'matched', roomId, initiator: false })
    })

    for (const event of ['offer', 'answer', 'ice-candidate', 'chat-message']) {
      socket.on(event, (payload) => {
        const partnerId = partners.get(socket.id)
        if (partnerId) io.to(partnerId).emit(event, payload)
      })
    }

    socket.on('leave-session', () => {
      const partnerId = partners.get(socket.id)
      removeFromWaiting(socket.id)
      if (partnerId) {
        partners.delete(socket.id)
        partners.delete(partnerId)
        for (const [roomId, members] of rooms) if (members.has(socket.id)) rooms.delete(roomId)
        io.to(partnerId).emit('partner-left')
      }
    })

    socket.on('disconnect', () => {
      const partnerId = partners.get(socket.id)
      removeFromWaiting(socket.id)
      partners.delete(socket.id)
      if (partnerId) {
        partners.delete(partnerId)
        io.to(partnerId).emit('partner-left')
      }
    })
  })

  httpServer.listen(port, hostname, () => {
    console.log(`MeetNext signaling server ready on port ${port}`)
  })
})
