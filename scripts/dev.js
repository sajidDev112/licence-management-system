'use strict';

/*
 * `npm run dev` — runs the API and the Vite dev server together.
 *
 * Vite proxies /api to the API (see vite.config.mjs), so in development the
 * browser talks to one origin exactly as it does in production.
 *
 * Open the dashboard on the Vite port; the API port is only used by the proxy
 * and by products calling the public endpoints directly.
 */

const { spawn } = require('child_process');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const root = path.join(__dirname, '..');
const apiPort = process.env.PORT || 5000;
const webPort = process.env.WEB_DEV_PORT || 5173;

// shell: true so the .cmd shims in node_modules/.bin resolve on Windows.
const run = (label, command, args) => {
  const child = spawn(command, args, { cwd: root, stdio: 'inherit', shell: true });
  child.on('exit', (code) => {
    if (code) console.error(`[dev] ${label} exited with code ${code}`);
    shutdown();
  });
  return child;
};

let children = [];
let closing = false;

function shutdown() {
  if (closing) return;
  closing = true;
  children.forEach((c) => {
    if (!c.killed) c.kill();
  });
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

console.log(`[dev] API    http://localhost:${apiPort}`);
console.log(`[dev] Web    http://localhost:${webPort}  <- open this one\n`);

children = [
  run('api', 'nodemon', ['server/server.js']),
  run('web', 'vite', []),
];
