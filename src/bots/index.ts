// bots/index.ts
import path from 'path';
import fs from 'fs';
import { Client } from '@open-wa/wa-automate';
import { initClient } from '../controllers/clientManager';

const sessionMap = new Map<string, Client>();

export async function initBotSession(userId: string, forceDelete: boolean = false) {
  if (!forceDelete && sessionMap.has(userId)) return;

  try {
    const sessionDir = path.join(__dirname, '..', 'sessions', userId);
    if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });

    await initClient(userId, forceDelete);
  } catch (error) {
      console.error(`Failed to initialize session for ${userId}:`, error);
  }
}
