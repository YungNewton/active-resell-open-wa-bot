"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = createSessionRoutes;
// === routes/session.ts ===
const express_1 = __importDefault(require("express"));
const clientManager_1 = require("../controllers/clientManager");
const state_1 = require("../utils/state");
const chromeKiller_1 = require("../utils/chromeKiller");
function createSessionRoutes() {
    const router = express_1.default.Router();
    router.post('/start-session', async (req, res) => {
        const { userId, forceDelete = false } = req.body;
        if (!userId) {
            return res.status(400).json({ error: 'Missing userId' });
        }
        try {
            const qr = await (0, clientManager_1.initClient)(userId, forceDelete);
            return res.json({ qr });
        }
        catch (err) {
            return res.status(500).json({ error: 'Failed to create session' });
        }
    });
    router.post('/get-status', async (req, res) => {
        const { userId } = req.body;
        const status = await (0, clientManager_1.getClientState)(userId);
        return res.json({ status: status || 'DISCONNECTED' });
    });
    router.post('/get-groups', async (req, res) => {
        const clientPromise = clientManager_1.clients[req.body.userId];
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
            res.json({ groups: groupData });
        }
        catch (err) {
            console.error('Group fetch failed:', err);
            res.status(500).json({ error: 'Failed to fetch groups' });
        }
    });
    router.post('/register-message-hook', async (req, res) => {
        const { userId, registeredGroups: groups } = req.body;
        if (!userId || !Array.isArray(groups)) {
            return res.status(400).json({ error: 'Missing userId or groups' });
        }
        state_1.registeredGroups[userId] = new Set(groups);
        res.json({ detail: 'Registered group hooks.' });
    });
    router.post('/cancel-session', async (req, res) => {
        const { userId } = req.body;
        const chromeKilled = await (0, chromeKiller_1.killChromeByUserId)(userId);
        if (chromeKilled) {
            console.log(`🧹 Chrome forcefully terminated for userId ${userId}`);
        }
        if (!userId) {
            return res.status(400).json({ error: 'Missing userId' });
        }
        const clientPromise = clientManager_1.clients[userId];
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
            delete clientManager_1.clients[userId];
            delete state_1.registeredGroups[userId];
            return res.json({ detail: 'Session cancelled successfully.' });
        }
        catch (err) {
            console.error('Cancel error:', err);
            // Cleanup even if creation failed mid-way
            delete clientManager_1.clients[userId];
            delete state_1.registeredGroups[userId];
            return res.status(200).json({ detail: 'Session force-cancelled during startup.' });
        }
    });
    return router;
}
