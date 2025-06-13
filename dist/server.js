"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// server.ts
const express_1 = __importDefault(require("express"));
const session_1 = __importDefault(require("./routes/session"));
const app = (0, express_1.default)();
app.use(express_1.default.json());
// Mount the routes
app.use('/wa', (0, session_1.default)());
const PORT = 8080;
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});
