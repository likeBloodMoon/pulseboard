import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const nextBin = require.resolve("next/dist/bin/next");

const root = process.cwd();
const nextDir = path.join(root, ".next");
const srcManifest = path.join(nextDir, "routes-manifest.json");
const devManifestDir = path.join(nextDir, "dev");
const devManifest = path.join(devManifestDir, "routes-manifest.json");

let lastCopiedMtimeMs = 0;

function ensureDevManifest() {
  try {
    if (!fs.existsSync(srcManifest)) return;
    fs.mkdirSync(devManifestDir, { recursive: true });

    const st = fs.statSync(srcManifest);
    if (st.mtimeMs <= lastCopiedMtimeMs && fs.existsSync(devManifest)) return;
    lastCopiedMtimeMs = st.mtimeMs;
    fs.copyFileSync(srcManifest, devManifest);
  } catch {
    // best-effort
  }
}

ensureDevManifest();

let debounce = null;
let watcher = null;
try {
  watcher = fs.watch(nextDir, () => {
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(ensureDevManifest, 200);
  });
} catch {
  // best-effort
}

// Fallback polling (slow) for filesystems where watch is unreliable.
const interval = setInterval(ensureDevManifest, 5000);

const child = spawn(process.execPath, [nextBin, "dev", "--webpack"], {
  stdio: "inherit",
  env: process.env
});

child.on("exit", (code) => {
  clearInterval(interval);
  if (watcher) watcher.close();
  if (debounce) clearTimeout(debounce);
  process.exit(code ?? 0);
});
