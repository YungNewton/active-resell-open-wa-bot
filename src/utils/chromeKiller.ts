import { exec } from 'child_process';

const chromePIDs: Record<string, number> = {};

export async function findChromePidByUserId(userId: string): Promise<number | null> {
  return new Promise((resolve) => {
    exec(`ps aux | grep "${userId}" | grep -i "chrome" | grep -v "grep"`, (err, stdout) => {
      if (err || !stdout) return resolve(null);

      const lines = stdout.trim().split('\n');
      const pids = lines
        .map(line => parseInt(line.trim().split(/\s+/)[1]))
        .filter(pid => !isNaN(pid));
      resolve(pids[0] || null);
    });
  });
}

export function saveChromePid(userId: string, pid: number) {
  chromePIDs[userId] = pid;
}

export function killChromeByUserId(userId: string): Promise<boolean> {
  return new Promise((resolve) => {
    const pid = chromePIDs[userId];
    if (!pid) {
      console.warn(`⚠️ No saved Chrome PID for userId ${userId}`);
      return resolve(false);
    }

    exec(`kill -9 ${pid}`, (err) => {
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
