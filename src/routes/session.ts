// === routes/session.ts ===
import express, { Router } from 'express';
import { initClient, getClientState, clients } from '../controllers/clientManager';
import { registeredGroups } from '../utils/state';

export default function createSessionRoutes(): Router {
  const router = express.Router();

  // Start WhatsApp session
  router.post('/start-session', async (req, res) => {
    const { userId, forceDelete = false } = req.body;
    if (!userId) return res.status(400).json({ error: 'Missing userId' });

    try {
      const qr = await initClient(userId, forceDelete);
      return res.json({ qr });
    } catch (err) {
      console.error('Start session error:', err);
      return res.status(500).json({ error: 'Failed to create session' });
    }
  });

  // Check session status
  router.post('/get-status', async (req, res) => {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'Missing userId' });

    try {
      const status = await getClientState(userId);
      return res.json({ status: status || 'DISCONNECTED' });
    } catch (err) {
      console.error('Status check error:', err);
      return res.status(500).json({ error: 'Failed to fetch status' });
    }
  });

  // Get user's WhatsApp groups
  router.post('/get-groups', async (req, res) => {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'Missing userId' });

    const clientPromise = clients[userId];
    if (!clientPromise) {
      return res.status(404).json({ error: 'Session not found' });
    }

    try {
      const client = await clientPromise;
      const chats = await client.getAllChats();
      const groups = chats.filter((c) => c.isGroup);

      const groupData = groups.map((g) => ({
        name: g.name,
        id: g.id,
        icon: g.pic || null,
      }));

      return res.json({ groups: groupData });
    } catch (err) {
      console.error('Group fetch failed:', err);
      return res.status(500).json({ error: 'Failed to fetch groups' });
    }
  });

  // Register group message hook
  router.post('/register-message-hook', async (req, res) => {
    const { userId, registeredGroups: groups } = req.body;
    if (!userId || !Array.isArray(groups)) {
      return res.status(400).json({ error: 'Missing userId or groups array' });
    }

    registeredGroups[userId] = new Set(groups);
    return res.json({ detail: 'Registered group hooks.' });
  });

  // Cancel/kill WhatsApp session
  router.post('/cancel-session', async (req, res) => {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'Missing userId' });

    const clientPromise = clients[userId];
    if (!clientPromise) {
      return res.status(404).json({ error: 'No active session to cancel' });
    }

    try {
      const client = await clientPromise;
      const state = await client.getConnectionState?.();
      const disallowedStates = ['CONNECTED', 'SYNCING'];

      if (disallowedStates.includes(state)) {
        return res.status(400).json({ error: `Cannot cancel session in state: ${state}` });
      }

      await client.logout?.();
      await client.kill?.();

      delete clients[userId];
      delete registeredGroups[userId];

      return res.json({ detail: 'Session cancelled successfully.' });
    } catch (err) {
      console.error('Cancel error:', err);
      delete clients[userId];
      delete registeredGroups[userId];

      return res.status(200).json({ detail: 'Session force-cancelled during startup.' });
    }
  });

  return router;
  
}
