/**
 * Standalone 24/7 Keep-Alive Background Heartbeat Runner
 * Continuously triggers the bot daemon cycle and keeps the event loop active.
 */

const http = require("http");

const PORT = process.env.PORT || 3000;
const INTERVAL_MS = 5000;

console.log("=================================================");
console.log(` AI-Hedge 24/7 Background Daemon Heartbeat Runner`);
console.log(` Target Cockpit: http://localhost:${PORT}`);
console.log(` Ping Interval: ${INTERVAL_MS / 1000}s`);
console.log("=================================================");

function pingDaemon() {
  const req = http.get(`http://localhost:${PORT}/api/bot/daemon?action=cron_tick`, (res) => {
    let data = "";
    res.on("data", (chunk) => (data += chunk));
    res.on("end", () => {
      try {
        const json = JSON.parse(data);
        const uptime = json.uptimeSeconds ? `${Math.floor(json.uptimeSeconds / 60)}m` : "0m";
        console.log(`[${new Date().toLocaleTimeString()}] Heartbeat OK | Running: ${json.isRunning} | Active Bots: ${json.activeBotsCount} | Uptime: ${uptime}`);
      } catch {
        console.log(`[${new Date().toLocaleTimeString()}] Heartbeat OK (raw response)`);
      }
    });
  });

  req.on("error", (err) => {
    console.warn(`[${new Date().toLocaleTimeString()}] Cockpit not responding yet: ${err.message}`);
  });

  req.setTimeout(4000, () => {
    req.destroy();
  });
}

// Initial tick then recurring loop
pingDaemon();
setInterval(pingDaemon, INTERVAL_MS);
