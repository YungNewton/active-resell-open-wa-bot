import { create, Client, ev } from '@open-wa/wa-automate';
import { Server } from 'socket.io';
import path from 'path';
import fs from 'fs-extra';

// In-memory store of active clients
const clients: Record<string, Client> = {};
let ioInstance: Server;

/**
 * Global QR event listener: Emits QR to correct socket room
 */
ev.on('**', (data, sessionId, namespace) => {
  if (namespace === 'qr') {
    ioInstance?.to(sessionId).emit('qr', data);
  }
});

/**
 * Returns current connection state of a WhatsApp session
 */
export async function getClientState(userId: string): Promise<string | null> {
  const client = clients[userId];
  if (!client) return null;

  try {
    return await client.getConnectionState();
  } catch (error) {
    return null;
  }
}

/**
 * Initialize a new WhatsApp client.
 * @param userId The session ID (unique per user)
 * @param io Socket.IO server instance
 * @param forceDelete If true, deletes existing session data for a fresh login
 */

export async function initClient(
  userId: string,
  io: Server,
  forceDelete = false
): Promise<void> {
  ioInstance = io;
  const sessionPath = path.resolve(__dirname, '..', 'sessions', userId);

  // Cleanup if forced
  if (forceDelete) {
    await fs.remove(sessionPath).catch(() => {});
    delete clients[userId];
  }

  // Reuse client if already connected
  const existingClient = clients[userId];
  if (existingClient) {
    try {
      const state = await existingClient.getConnectionState();
      if (state === 'CONNECTED') return;
    } catch (_) {
      // Continue to reinit
    }
  }

  try {
    const client = await create({
      sessionId: userId,
      multiDevice: true,
      qrTimeout: 0,
      authTimeout: 60,
      headless: true,
      killProcessOnBrowserClose: true,
      useChrome: true,
      executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      sessionDataPath: sessionPath,
    });

    clients[userId] = client;

    // State change listener
    client.onStateChanged((state) => {
      io.to(userId).emit('status', { id: userId, status: state });
      if (['CONFLICT', 'UNPAIRED', 'UNLAUNCHED'].includes(state)) {
        delete clients[userId];
      }
    });

    // Group message listener
    client.onMessage(async (msg) => {
      if (msg.isGroupMsg) {
        io.to(userId).emit('message', {
          group: msg.chat?.name || 'Unnamed Group',
          from: msg.sender?.pushname || msg.sender?.formattedName || 'Unknown',
          body: msg.body,
          timestamp: msg.timestamp,
          hasMedia: !!msg.mimetype,
          mediaType: msg.type,
        });
      }
    });
  } catch (error) {
    io.to(userId).emit('error', 'Failed to start WhatsApp session');
  }
}
