#!/usr/bin/env node
/**
 * Start exactly one Next.js dev server on port 3000.
 * Clears stale listeners and the Turbopack lock before launching.
 */
import { execSync, spawn } from "node:child_process";
import { existsSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PORT = 3000;
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const lockPath = join(root, ".next/dev/lock");

function pidsOnPort(port) {
  try {
    return execSync(`lsof -tiTCP:${port} -sTCP:LISTEN`, { encoding: "utf8" })
      .trim()
      .split("\n")
      .filter(Boolean)
      .map(Number);
  } catch {
    return [];
  }
}

function killPort(port) {
  const pids = pidsOnPort(port);
  if (pids.length === 0) return;
  for (const pid of pids) {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      // already gone
    }
  }
  const start = Date.now();
  while (Date.now() - start < 1200) {
    if (pidsOnPort(port).length === 0) return;
  }
  for (const pid of pidsOnPort(port)) {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // already gone
    }
  }
}

for (const port of [PORT, 3001]) {
  killPort(port);
}

if (existsSync(lockPath)) {
  unlinkSync(lockPath);
}

console.log(`Starting Next.js on http://localhost:${PORT}`);

const child = spawn("npx", ["next", "dev", "-p", String(PORT)], {
  cwd: root,
  stdio: "inherit",
  env: process.env,
});

const shutdown = (signal) => {
  if (!child.killed) child.kill(signal);
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 0);
});
