import { create, Client, ev } from '@open-wa/wa-automate';
import { Server } from 'socket.io';
import path from 'path';
import fs from 'fs-extra';

const clients: Record<string, Client> = {};
let ioInstance: Server;

// 🔄 Global QR listener
ev.on('**', (data, sessionId, namespace) => {
  if (namespace === 'qr') {
    console.log(`🟡 [EV QR NAMESPACE] triggered for ${sessionId}`);
    ioInstance?.to(sessionId).emit('qr', data);
  }
});

export async function getClientState(userId: string): Promise<string | null> {
  const client = clients[userId];
  if (!client) return null;

  try {
    const state = await client.getConnectionState();
    return state; // e.g., 'CONNECTED', 'UNPAIRED', etc.
  } catch (error) {
    console.error(`❌ Failed to get connection state for ${userId}:`, error);
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
  console.log(`\n=== [initClient called for ${userId}] ===`);

  if (forceDelete) {
    try {
      console.log(`🧨 forceDelete=true: Cleaning up session folder for ${userId}...`);
      await fs.remove(sessionPath);
      delete clients[userId];
      console.log(`✅ Deleted session folder for ${userId}`);
    } catch (err) {
      console.error(`❌ Failed to delete session folder for ${userId}:`, err);
    }
  }

  const existingClient = clients[userId];
  if (existingClient) {
    try {
      const state = await existingClient.getConnectionState();
      console.log(`ℹ️ Existing client state for ${userId}: ${state}`);

      if (state === 'CONNECTED') {
        console.log(`✅ Client already connected for ${userId}. Skipping reinit.`);
        return;
      }
    } catch (err) {
      console.warn(`⚠️ Could not get connection state for ${userId}. Proceeding with reinit.`);
    }
  }

  try {
    console.log(`🚀 Attempting to create client for ${userId}...`);

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

    console.log(`✅ Client successfully created for ${userId}`);
    clients[userId] = client;

    client.onStateChanged((state) => {
      console.log(`📶 [onStateChanged] ${userId}: ${state}`);
      io.to(userId).emit('status', state);

      if (['CONFLICT', 'UNPAIRED', 'UNLAUNCHED'].includes(state)) {
        console.warn(`⚠️ Bad state ${state} for ${userId}, cleaning up client.`);
        delete clients[userId];
      }
    });

    client.onMessage(async (msg) => {
      if (msg.isGroupMsg) {
        console.log(`💬 Group message received from ${msg.sender?.pushname}`);
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

    console.log(`✅ WhatsApp client fully initialized for user ${userId}`);
  } catch (error) {
    console.error(`❌ [initClient ERROR] Failed for ${userId}:`, error);
    io.to(userId).emit('error', 'Failed to start WhatsApp session');
  }
}
