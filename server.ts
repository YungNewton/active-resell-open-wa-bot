// server.ts
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import { setupSocketListeners } from './sockets/qrSocket';

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // secure in prod
  }
});

io.on('connection', (socket) => {
  setupSocketListeners(socket, io);
});

const PORT = 8000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
