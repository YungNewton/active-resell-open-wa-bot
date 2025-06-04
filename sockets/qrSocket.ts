// sockets/qrSocket.ts

import { Server, Socket } from 'socket.io';
import { initBotSession } from '../bots/index';
import { getClientState } from '../controllers/clientManager';

export function setupSocketListeners(socket: Socket, io: Server) {
  const userId = socket.handshake.query.userId as string;

  if (!userId) {
    console.log('❌ Missing userId in socket query. Disconnecting.');
    socket.disconnect();
    return;
  }

  console.log(`🔌 Socket connected: ${userId}`);
  socket.join(userId);

  socket.on('init-session', (payload: { userId: string; forceDelete?: boolean }) => {
    const { forceDelete = false } = payload || {};

    console.log(`⚡ Session init requested for: ${userId}`);
    console.log(`🧹 forceDelete: ${forceDelete}`);

    initBotSession(userId, io, forceDelete);
  });

  socket.on('get-status', async () => {
    const state = await getClientState(userId);
    socket.emit('status', state || 'DISCONNECTED');
  });

  socket.on('disconnect', () => {
    console.log(`🔌 Disconnected: ${userId}`);
  });
}
