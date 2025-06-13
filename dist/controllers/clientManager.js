"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.clients = void 0;
exports.getClientState = getClientState;
exports.initClient = initClient;
// === controllers/clientManager.ts ===
const path_1 = __importDefault(require("path"));
const fs_extra_1 = __importDefault(require("fs-extra"));
const wa_decrypt_1 = require("@open-wa/wa-decrypt");
const wa_automate_1 = require("@open-wa/wa-automate");
const axios_1 = __importDefault(require("axios"));
const dotenv_1 = __importDefault(require("dotenv"));
const cloudinary_1 = require("cloudinary");
const mime_types_1 = __importDefault(require("mime-types"));
const chromeKiller_1 = require("../utils/chromeKiller");
dotenv_1.default.config(); // Load .env
cloudinary_1.v2.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});
const BACKEND_BASE_URL = process.env.BACKEND_BASE_URL || 'http://127.0.0.1:8000';
exports.clients = {};
// Global event listener — required once
wa_automate_1.ev.on('**', async (data, sessionId, namespace) => {
    if (!sessionId)
        return;
    if (namespace === 'qrData') {
        if (typeof data !== 'string') {
            console.error(`❌ QR data is not a string for ${sessionId}`, data);
            return;
        }
        console.log(`🟡 QR string received for ${sessionId}`);
        try {
            await axios_1.default.post(`${BACKEND_BASE_URL}/main/wa/qr-code/`, {
                user_id: sessionId,
                qr_string: data, // ✅ send raw QR string here
            });
        }
        catch (err) {
            if (err instanceof Error) {
                console.error(`❌ Failed to send QR to Django for ${sessionId}:`, err.message);
            }
            else {
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
            await axios_1.default.post(`${BACKEND_BASE_URL}/wa/session-status/`, {
                user_id: sessionId,
                status: data,
            });
        }
        catch (err) {
            if (err instanceof Error) {
                console.error(`❌ Failed to send global state for ${sessionId}:`, err.message);
            }
            else {
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
async function getClientState(userId) {
    const client = await exports.clients[userId];
    if (!client)
        return null;
    try {
        return await client.getConnectionState();
    }
    catch (_) {
        return null;
    }
}
/**
 * Initializes a WhatsApp session and returns QR code if needed
 */
async function initClient(userId, forceDelete = false) {
    const sessionPath = path_1.default.resolve(__dirname, '..', 'sessions', userId);
    let qrCodeData = null;
    if (forceDelete) {
        await fs_extra_1.default.remove(sessionPath).catch(() => { });
        delete exports.clients[userId];
    }
    if (exports.clients[userId] !== undefined) {
        const state = await getClientState(userId);
        if (state === 'CONNECTED') {
            console.log(`🟢 Client for ${userId} already connected`);
            return '';
        }
    }
    const clientPromise = (0, wa_automate_1.create)({
        sessionId: userId,
        multiDevice: true,
        qrTimeout: 120,
        authTimeout: 200,
        headless: true,
        killProcessOnBrowserClose: true,
        executablePath: '/usr/bin/google-chrome',
        sessionDataPath: sessionPath,
        onBrowser: (browserProcess) => {
            const pid = browserProcess?.pid;
            if (pid) {
                (0, chromeKiller_1.saveChromePid)(userId, pid);
                console.log(`💾 Chrome PID saved from onBrowser for ${userId}: ${pid}`);
            }
            else {
                console.warn(`⚠️ onBrowser called but no PID found for ${userId}`);
            }
        }
    });
    exports.clients[userId] = clientPromise;
    const client = await clientPromise;
    client.onStateChanged(async (state) => {
        console.log(`🔁 [Client-level] State changed for ${userId}: ${state}`);
        try {
            await axios_1.default.post(`${BACKEND_BASE_URL}/main/wa/session-status/`, {
                user_id: userId,
                status: state,
            });
        }
        catch (err) {
            if (err instanceof Error) {
                console.error(`❌ Failed to send client-level state for ${userId}:`, err.message);
            }
            else {
                console.error(`❌ Unknown client state error for ${userId}:`, err);
            }
        }
        if (["CONFLICT", "UNPAIRED", "UNLAUNCHED"].includes(state)) {
            delete exports.clients[userId];
        }
    });
    client.onMessage(async (msg) => {
        if (!msg.isGroupMsg || msg.type !== 'image')
            return;
        const caption = msg.caption || '';
        const albumId = msg.parentMsgKey?._serialized || null;
        const clientUrl = msg.clientUrl;
        if (!clientUrl)
            return;
        try {
            const mediaData = await (0, wa_decrypt_1.decryptMedia)(msg);
            const ext = mime_types_1.default.extension(msg.mimetype) || 'jpg';
            const filename = `${Date.now()}.${ext}`;
            const tempDir = path_1.default.join(__dirname, '..', 'temp');
            await fs_extra_1.default.ensureDir(tempDir);
            const tempPath = path_1.default.join(tempDir, filename);
            await fs_extra_1.default.writeFile(tempPath, mediaData);
            const uploadRes = await cloudinary_1.v2.uploader.upload(tempPath, {
                folder: 'whatsapp_images',
            });
            const imageUrl = uploadRes.secure_url;
            await axios_1.default.post(`${BACKEND_BASE_URL}/main/chat-groups/${encodeURIComponent(msg.chatId)}/messages/`, {
                sender_name: msg.sender?.pushname || 'Unknown',
                content: caption,
                image_url: imageUrl,
                timestamp: msg.timestamp * 1000,
                media_type: 'image',
                album_parent_key: albumId,
            });
            await fs_extra_1.default.remove(tempPath);
        }
        catch (err) {
            console.error(`❌ Error handling image message:`, err instanceof Error ? err.message : err);
        }
    });
    return qrCodeData || '';
}
