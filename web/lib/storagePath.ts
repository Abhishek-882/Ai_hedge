import fs from "fs";
import path from "path";

/**
 * Bulletproof Multi-Directory Storage Path Resolver
 * Ensures state files (bot_daemon_state.json, bot_set_files.json, user_accounts_store.json)
 * are seamlessly loaded and saved regardless of whether the process was launched from
 * the repository root or the 'web/' subfolder.
 */

export function resolveDataFilePath(filename: string): string {
  // 1. Explicit environment variable path (e.g. Render persistent disk /data)
  if (process.env.DATA_DIR && fs.existsSync(process.env.DATA_DIR)) {
    return path.join(process.env.DATA_DIR, filename);
  }

  const cwd = process.cwd();
  const rootPath = path.join(cwd, filename);
  const webSubdirPath = path.join(cwd, "web", filename);

  // If file already exists in web/ subdirectory, prefer it
  if (fs.existsSync(webSubdirPath)) {
    return webSubdirPath;
  }

  // If file exists directly in cwd, use it
  if (fs.existsSync(rootPath)) {
    return rootPath;
  }

  // If 'web' directory exists in cwd, place it inside web/ by default
  const webDir = path.join(cwd, "web");
  if (fs.existsSync(webDir) && fs.statSync(webDir).isDirectory()) {
    return webSubdirPath;
  }

  return rootPath;
}

/**
 * Read data file safely with fallback
 */
export function readDataFile<T>(filename: string, defaultValue: T): T {
  try {
    const filePath = resolveDataFilePath(filename);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, "utf-8");
      return JSON.parse(content) as T;
    }
  } catch (err: any) {
    console.warn(`[STORAGE] Could not read ${filename}:`, err.message);
  }
  return defaultValue;
}

/**
 * Save data file safely to primary path AND mirror to sibling path if applicable
 */
export function saveDataFile(filename: string, data: any): void {
  const jsonStr = JSON.stringify(data, null, 2);

  // 1. If DATA_DIR is configured, save there
  if (process.env.DATA_DIR && fs.existsSync(process.env.DATA_DIR)) {
    try {
      fs.writeFileSync(path.join(process.env.DATA_DIR, filename), jsonStr, "utf-8");
    } catch (e: any) {
      console.error(`[STORAGE] Error saving to DATA_DIR:`, e.message);
    }
  }

  const cwd = process.cwd();
  const primaryPath = resolveDataFilePath(filename);

  try {
    fs.writeFileSync(primaryPath, jsonStr, "utf-8");
  } catch (err: any) {
    console.error(`[STORAGE] Error saving primary ${filename}:`, err.message);
  }

  // 2. Dual-persistence: Also mirror to root or web/ to avoid cwd mismatch on restart
  try {
    const rootPath = path.join(cwd, filename);
    const webPath = path.join(cwd, "web", filename);

    if (primaryPath === webPath) {
      fs.writeFileSync(rootPath, jsonStr, "utf-8");
    } else if (fs.existsSync(path.join(cwd, "web"))) {
      fs.writeFileSync(webPath, jsonStr, "utf-8");
    }
  } catch {
    // Non-critical mirror write
  }
}
