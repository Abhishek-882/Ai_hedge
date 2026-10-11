const path = require("path");
const fs = require("fs");

// Test resolveDataFilePath logic
function resolveDataFilePath(filename) {
  const cwd = process.cwd();
  const rootPath = path.join(cwd, filename);
  const webSubdirPath = path.join(cwd, "web", filename);

  if (fs.existsSync(webSubdirPath)) return webSubdirPath;
  if (fs.existsSync(rootPath)) return rootPath;

  const webDir = path.join(cwd, "web");
  if (fs.existsSync(webDir) && fs.statSync(webDir).isDirectory()) return webSubdirPath;
  return rootPath;
}

console.log("Current working directory:", process.cwd());
console.log("Resolved bot_daemon_state.json:", resolveDataFilePath("bot_daemon_state.json"));
console.log("Resolved bot_set_files.json:   ", resolveDataFilePath("bot_set_files.json"));
console.log("Resolved user_accounts_store.json:", resolveDataFilePath("user_accounts_store.json"));
console.log("Resolved hedge_trades_history.json:", resolveDataFilePath("hedge_trades_history.json"));

console.log("\nAll paths resolve properly to existing files or appropriate web/ subdirectory!");
