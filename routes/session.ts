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
      const groups = chats.filter((c) => c.isGroup);
  
      const groupData = groups.map((g) => ({
        name: g.name,
        id: g.id,
        icon: g.pic || null,
      }));
  
      res.json({ groups: groupData });
    } catch (err) {
      console.error('Group fetch failed:', err);
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

  router.post('/cancel-session', async (req, res) => {
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ error: 'Missing userId' });
    }
  
    const client = clients[userId];
    if (!client) {
      return res.status(404).json({ error: 'No active session to cancel' });
    }
  
    try {
      const state = await client.getConnectionState(); // ✅ fixed method
      const disallowedStates = ['CONNECTED', 'SYNCING'];
  
      if (disallowedStates.includes(state)) {
        return res.status(400).json({ error: `Cannot cancel session in state: ${state}` });
      }
  
      await client.logout();  // Optional: logout before kill
      await client.kill();    // Kill browser + session
      delete clients[userId];
      delete registeredGroups[userId];
  
      return res.json({ detail: 'Session cancelled successfully.' });
    } catch (err) {
      console.error('Cancel error:', err);
      return res.status(500).json({ error: 'Failed to cancel session' });
    }
  });
  

  return router;
}
