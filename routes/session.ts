// === routes/session.ts ===
import express, { Router } from 'express';
import { initClient, getClientState, clients } from '../controllers/clientManager';
import { registeredGroups } from '../utils/state';

export default function createSessionRoutes(): Router {
  const router = express.Router();

  router.post('/start-session', async (req, res) => {
    const { userId, forceDelete = false } = req.body;
    if (!userId) {
      return res.status(400).json({ error: 'Missing userId' });
    }

    try {
      const qr = await initClient(userId, forceDelete);
      return res.json({ qr });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to create session' });
    }
  });

  router.post('/get-status', async (req, res) => {
    const { userId } = req.body;
    const status = await getClientState(userId);
    return res.json({ status: status || 'DISCONNECTED' });
  });

  router.post('/get-groups', async (req, res) => {
    const client = clients[req.body.userId];
    if (!client) {
      return res.status(404).json({ error: 'Session not found' });
    }

    try {
      const chats = await client.getAllChats();
      const groups = chats
        .filter((c) => c.isGroup)
        .map((g) => ({ name: g.name, id: g.id }));
      res.json({ groups });
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch groups' });
    }
  });

  router.post('/register-message-hook', async (req, res) => {
    const { userId, registeredGroups: groups } = req.body;
    if (!userId || !Array.isArray(groups)) {
      return res.status(400).json({ error: 'Missing userId or groups' });
    }

    registeredGroups[userId] = new Set(groups);
    res.json({ detail: 'Registered group hooks.' });
  });

  return router;
}
