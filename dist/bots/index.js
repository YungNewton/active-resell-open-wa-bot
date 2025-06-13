"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initBotSession = initBotSession;
// bots/index.ts
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const clientManager_1 = require("../controllers/clientManager");
const sessionMap = new Map();
async function initBotSession(userId, forceDelete = false) {
    if (!forceDelete && sessionMap.has(userId))
        return;
    const sessionDir = path_1.default.join(__dirname, '..', 'sessions', userId);
    if (!fs_1.default.existsSync(sessionDir))
        fs_1.default.mkdirSync(sessionDir, { recursive: true });
    await (0, clientManager_1.initClient)(userId, forceDelete);
}
