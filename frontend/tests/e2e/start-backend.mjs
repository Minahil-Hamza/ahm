// Starts a throwaway FastAPI backend for the offline Playwright test:
// a fresh SQLite file under backend/.pytest_tmp, migrated with Alembic,
// sync enabled with a test-only key. No network, no seed data.
//
// Python: set AHM_PYTHON to the interpreter that has backend/requirements.txt
// installed (for example backend/.venv/Scripts/python.exe). Defaults to
// `python` on Windows and `python3` elsewhere.

import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const E2E_BACKEND_PORT = 8765;
export const E2E_SYNC_KEY = "e2e-only-sync-key-not-a-secret";

const backend = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "backend");
const tmp = join(backend, ".pytest_tmp");
const dbFile = join(tmp, "e2e-offline.db");
const python = process.env.AHM_PYTHON ?? (process.platform === "win32" ? "python" : "python3");

mkdirSync(tmp, { recursive: true });
rmSync(dbFile, { force: true });

const env = {
  ...process.env,
  DATABASE_URL: `sqlite+aiosqlite:///${dbFile.split("\\").join("/")}`,
  SYNC_KEY: E2E_SYNC_KEY,
  SECRET_KEY: "e2e-only-secret-key-not-for-real-use",
  CORS_ORIGINS: "http://localhost:3100",
};

const migrate = spawnSync(python, ["-m", "alembic", "upgrade", "head"], {
  cwd: backend,
  env,
  stdio: "inherit",
});
if (migrate.status !== 0) process.exit(migrate.status ?? 1);

const server = spawn(
  python,
  ["-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", String(E2E_BACKEND_PORT)],
  { cwd: backend, env, stdio: "inherit" },
);
const stop = () => server.kill();
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
server.on("exit", (code) => process.exit(code ?? 0));
