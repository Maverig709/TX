const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*' },
  pingTimeout: 60000,
  pingInterval: 25000
});

const PORT = process.env.PORT || 3000;
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB

// Ensure uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Multer config - store in uploads/
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${uuidv4().slice(0, 8)}${path.extname(file.originalname) || ''}`)
});
const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (req, file, cb) => cb(null, true)
});

app.use(express.json());
app.use(express.static('public'));
app.use('/uploads', express.static(UPLOADS_DIR));

// File upload endpoint
app.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  res.json({
    id: req.file.filename,
    url: `/uploads/${req.file.filename}`,
    name: req.file.originalname,
    mimetype: req.file.mimetype,
    size: req.file.size
  });
});

// Rooms: { roomId: { users: Set<socketId>, messages: [] } }
const rooms = new Map();
const userToRoom = new Map();

function getOrCreateRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, { users: new Map(), messages: [] });
  }
  return rooms.get(roomId);
}

io.on('connection', (socket) => {
  socket.on('join', ({ roomId, userName }) => {
    const room = getOrCreateRoom(roomId);
    room.users.set(socket.id, userName || `User ${socket.id.slice(0, 6)}`);
    socket.join(roomId);
    userToRoom.set(socket.id, roomId);
    socket.userName = userName;
    socket.roomId = roomId;

    io.to(roomId).emit('users', Array.from(room.users.entries()).map(([id, name]) => ({ id, name })));
    socket.emit('history', room.messages.slice(-100));
  });

  socket.on('message', (data) => {
    const roomId = userToRoom.get(socket.id);
    if (!roomId) return;
    const room = getOrCreateRoom(roomId);
    const msg = {
      id: uuidv4(),
      userId: socket.id,
      userName: room.users.get(socket.id) || 'Unknown',
      text: data.text || '',
      files: data.files || [],
      time: Date.now(),
      delivered: true
    };
    room.messages.push(msg);
    io.to(roomId).emit('message', msg);
  });

  socket.on('typing', () => {
    const roomId = userToRoom.get(socket.id);
    if (roomId) {
      const room = getOrCreateRoom(roomId);
      socket.join(roomId);
      socket.to(roomId).emit('typing', { id: socket.id, name: room.users.get(socket.id) });
    }
  });

  socket.on('stopTyping', () => {
    const roomId = userToRoom.get(socket.id);
    if (roomId) {
      getOrCreateRoom(roomId);
      socket.join(roomId);
      socket.to(roomId).emit('stopTyping', socket.id);
    }
  });

  // WebRTC signaling for audio calls
  socket.on('join-call', () => {
    const roomId = userToRoom.get(socket.id);
    if (roomId) {
      const room = getOrCreateRoom(roomId);
      socket.join(roomId);
      socket.to(roomId).emit('peer-joined-call', { id: socket.id, name: room.users.get(socket.id) });
    }
  });
  socket.on('webrtc-offer', ({ to, offer }) => socket.to(to).emit('webrtc-offer', { from: socket.id, offer }));
  socket.on('webrtc-answer', ({ to, answer }) => socket.to(to).emit('webrtc-answer', { from: socket.id, answer }));
  socket.on('webrtc-ice', ({ to, candidate }) => socket.to(to).emit('webrtc-ice', { from: socket.id, candidate }));

  socket.on('disconnect', () => {
    const roomId = userToRoom.get(socket.id);
    if (roomId) {
      const room = getOrCreateRoom(roomId);
      room.users.delete(socket.id);
      io.to(roomId).emit('users', Array.from(room.users.entries()).map(([id, name]) => ({ id, name })));
      if (room.users.size === 0) rooms.delete(roomId);
      userToRoom.delete(socket.id);
    }
  });
});

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`TX Messenger on http://0.0.0.0:${PORT}`);
});
