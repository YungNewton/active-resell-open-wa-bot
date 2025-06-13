"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.findChromePidByUserId = findChromePidByUserId;
exports.saveChromePid = saveChromePid;
exports.killChromeByUserId = killChromeByUserId;
const child_process_1 = require("child_process");
const chromePIDs = {};
async function findChromePidByUserId(userId) {
    return new Promise((resolve) => {
        (0, child_process_1.exec)(`ps aux | grep "${userId}" | grep -i "chrome" | grep -v "grep"`, (err, stdout) => {
            if (err || !stdout)
                return resolve(null);
            const lines = stdout.trim().split('\n');
            const pids = lines
                .map(line => parseInt(line.trim().split(/\s+/)[1]))
                .filter(pid => !isNaN(pid));
            resolve(pids[0] || null);
        });
    });
}
function saveChromePid(userId, pid) {
    chromePIDs[userId] = pid;
}
function killChromeByUserId(userId) {
    return new Promise((resolve) => {
        const pid = chromePIDs[userId];
        if (!pid) {
            console.warn(`⚠️ No saved Chrome PID for userId ${userId}`);
            return resolve(false);
        }
        (0, child_process_1.exec)(`kill -9 ${pid}`, (err) => {
            if (err) {
                console.error(`❌ Failed to kill Chrome PID ${pid} for ${userId}:`, err.message);
                return resolve(false);
            }
            console.log(`✅ Chrome PID ${pid} killed for userId ${userId}`);
            delete chromePIDs[userId];
            resolve(true);
        });
    });
}
