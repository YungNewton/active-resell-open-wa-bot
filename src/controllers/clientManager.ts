// === controllers/clientManager.ts ===
import path from 'path';
import fs from 'fs-extra';
import { decryptMedia } from '@open-wa/wa-decrypt';
import { create, Client, ev } from '@open-wa/wa-automate';
import axios from 'axios';
import dotenv from 'dotenv';
import { registeredGroups } from '../utils/state';
import { v2 as cloudinary } from 'cloudinary';
import mime from 'mime-types';

dotenv.config();

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME!,
  api_key: process.env.CLOUDINARY_API_KEY!,
  api_secret: process.env.CLOUDINARY_API_SECRET!,
});

const BACKEND_BASE_URL = process.env.BACKEND_BASE_URL || 'http://127.0.0.1:8000';
export const clients: Record<string, Promise<Client>> = {};

/**
 * GLOBAL EVENT LISTENERS (init once)
 */
ev.on('**', async (data, sessionId, namespace) => {
  if (!sessionId) return;

  try {
    switch (namespace) {
      case 'qrData':
        if (typeof data === 'string') {
          console.log(`🟡 QR received for ${sessionId}`);
          await axios.post(`${BACKEND_BASE_URL}/main/wa/qr-code/`, {
            user_id: sessionId,
            qr_string: data,
          });
        }
        break;

      case 'sessionData':
        console.log(`📦 Session data updated for ${sessionId}`);
        break;

      case 'state':
        console.log(`🔁 Global state: ${sessionId} → ${data}`);
        await axios.post(`${BACKEND_BASE_URL}/wa/session-status/`, {
          user_id: sessionId,
          status: data,
        });
        break;

      case 'error':
        console.error(`❗Error [${sessionId}]:`, data);
        break;
    }
  } catch (err) {
    console.error(`❗Error handling [${namespace}] for ${sessionId}:`, err instanceof Error ? err.message : err);
  }
});

/**
 * Returns the current connection state of a WhatsApp client
 */
export async function getClientState(userId: string): Promise<string | null> {
  const client = await clients[userId];
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

  if (clients[userId] !== undefined) {
    const state = await getClientState(userId);
    if (state === 'CONNECTED') {
      console.log(`🟢 Client for ${userId} already connected`);
      return '';
    }
  }  

  const clientPromise = create({
    sessionId: userId,
    multiDevice: true,
    qrTimeout: 120,
    authTimeout: 200,
    headless: true,
    killProcessOnBrowserClose: true,
    executablePath: '/usr/bin/google-chrome',
    sessionDataPath: sessionPath,
  });
  
  clients[userId] = clientPromise;
  
  const client = await clientPromise;

  /**
   * Listen for state changes
   */
  client.onStateChanged(async (state) => {
    console.log(`🔁 State change [${userId}]: ${state}`);

    try {
      await axios.post(`${BACKEND_BASE_URL}/main/wa/session-status/`, {
        user_id: userId,
        status: state,
      });
    } catch (err) {
      console.error(`❗State update failed for ${userId}:`, err instanceof Error ? err.message : err);
    }

    if (['CONFLICT', 'UNPAIRED', 'UNLAUNCHED'].includes(state)) {
      delete clients[userId];
    }
  });

  /**
   * Handle group image messages
   */
  client.onMessage(async (msg) => {
    if (!msg.isGroupMsg || msg.type !== 'image' || !msg.clientUrl) return;
  
    const userGroups = registeredGroups[userId];
    if (!userGroups || !userGroups.has(msg.chatId)) {
      console.log(`🔕 Ignoring message from unregistered group (${msg.chatId}) for ${userId}`);
      return;
    }
  
    const caption = msg.caption || '';
    const albumId = (msg as any).parentMsgKey?._serialized || null;
  
    try {
      const mediaData = await decryptMedia(msg);
      const ext = mime.extension(msg.mimetype!) || 'jpg';
      const filename = `${Date.now()}.${ext}`;
      const tempDir = path.join(__dirname, '..', 'temp');
      const tempPath = path.join(tempDir, filename);
  
      await fs.ensureDir(tempDir);
      await fs.writeFile(tempPath, mediaData);
  
      const uploadRes = await cloudinary.uploader.upload(tempPath, {
        folder: 'whatsapp_images',
      });
  
      await axios.post(`${BACKEND_BASE_URL}/main/chat-groups/${encodeURIComponent(msg.chatId)}/messages/`, {
        sender_name: msg.sender?.pushname || 'Unknown',
        content: caption,
        image_url: uploadRes.secure_url,
        timestamp: msg.timestamp * 1000,
        media_type: 'image',
        album_parent_key: albumId,
      });
  
      await fs.remove(tempPath);
    } catch (err) {
      console.error(`❗Error handling image message:`, err instanceof Error ? err.message : err);
    }
  });  

  return qrCodeData || '';
}