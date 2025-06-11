// === controllers/clientManager.ts ===
import path from 'path';
import fs from 'fs-extra';
import { create, Client, ev } from '@open-wa/wa-automate';
import axios from 'axios';
import dotenv from 'dotenv';
import { registeredGroups } from '../utils/state';

dotenv.config(); // Load .env

const BACKEND_BASE_URL = process.env.BACKEND_BASE_URL || 'http://127.0.0.1:8000';
export const clients: Record<string, Client> = {};

// Global event listener — required once
ev.on('**', async (data, sessionId, namespace) => {
  if (!sessionId) return;
  if (namespace === 'qrData') {
    if (typeof data !== 'string') {
      console.error(`❌ QR data is not a string for ${sessionId}`, data);
      return;
    }

    console.log(`🟡 QR string received for ${sessionId}`);

    try {
      await axios.post(`${BACKEND_BASE_URL}/main/wa/qr-code/`, {
        user_id: sessionId,
        qr_string: data, // ✅ send raw QR string here
      });
    } catch (err) {
      if (err instanceof Error) {
        console.error(`❌ Failed to send QR to Django for ${sessionId}:`, err.message);
      } else {
        console.error(`❌ Unknown QR error for ${sessionId}:`, err);
      }
    }
  }

  if (namespace === 'sessionData') {
    console.log(`📦 Session data updated for ${sessionId}`);
  }

  if (namespace === 'state') {
    console.log(`🔁 Global state change for ${sessionId}: ${data}`);
    try {
      await axios.post(`${BACKEND_BASE_URL}/wa/session-status/`, {
        user_id: sessionId,
        status: data,
      });
    } catch (err) {
      if (err instanceof Error) {
        console.error(`❌ Failed to send global state for ${sessionId}:`, err.message);
      } else {
        console.error(`❌ Unknown global state error for ${sessionId}:`, err);
      }
    }
  }

  if (namespace === 'error') {
    console.error(`❗ Error from ${sessionId}: ${data}`);
  }
});

/**
 * Returns the current connection state of a WhatsApp client
 */
export async function getClientState(userId: string): Promise<string | null> {
  const client = clients[userId];
  if (!client) return null;

  try {
    return await client.getConnectionState();
  } catch (_) {
    return null;
  }
}

/**
 * Initializes a WhatsApp session and returns QR code if needed
 */
export async function initClient(userId: string, forceDelete = false): Promise<string> {
  const sessionPath = path.resolve(__dirname, '..', 'sessions', userId);
  let qrCodeData: string | null = null;

  if (forceDelete) {
    await fs.remove(sessionPath).catch(() => {});
    delete clients[userId];
  }

  if (clients[userId]) {
    const state = await getClientState(userId);
    if (state === 'CONNECTED') {
      console.log(`🟢 Client for ${userId} already connected`);
      return '';
    }
  }

  const client = await create({
    sessionId: userId,
    multiDevice: true,
    qrTimeout: 0,
    authTimeout: 60,
    headless: true,
    killProcessOnBrowserClose: true,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    sessionDataPath: sessionPath,
  });

  clients[userId] = client;

  client.onStateChanged(async (state) => {
    console.log(`🔁 [Client-level] State changed for ${userId}: ${state}`);

    try {
      await axios.post(`${BACKEND_BASE_URL}/main/wa/session-status/`, {
        user_id: userId,
        status: state,
      });
    } catch (err) {
      if (err instanceof Error) {
        console.error(`❌ Failed to send client-level state for ${userId}:`, err.message);
      } else {
        console.error(`❌ Unknown client state error for ${userId}:`, err);
      }
    }

    if (["CONFLICT", "UNPAIRED", "UNLAUNCHED"].includes(state)) {
      delete clients[userId];
    }
  });

  client.onMessage(async (msg) => {
    if (!msg.isGroupMsg) return;
  
    const allowed = registeredGroups[userId];
    if (!allowed?.has(msg.chatId)) return;
  
    // Only handle image messages
    if (msg.type !== 'image') return;
  
    const base64Image = msg.body;
    const caption = msg.caption || '';
    const albumId = (msg as any).parentMsgKey?._serialized || null;
  
    try {
      await axios.post(
        `${BACKEND_BASE_URL}/main/chat-groups/${encodeURIComponent(msg.chatId)}/messages/`,
        {
          sender_name: msg.sender?.pushname || 'Unknown',
          content: caption,
          image_base64: base64Image,
          timestamp: msg.timestamp * 1000,
          media_type: 'image',
          album_parent_key: albumId, // New field sent to backend
        }
      );
    } catch (err) {
      if (err instanceof Error) {
        console.error(`❌ Failed to POST group message [${userId}]:`, err.message);
      } else {
        console.error(`❌ Unknown error posting group message [${userId}]:`, err);
      }
    }
  });  

  return qrCodeData || '';
}
