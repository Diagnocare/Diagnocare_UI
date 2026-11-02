'use strict';

/**
 * Brings up everything the recording needs, records, then tears it down.
 *
 *   mock API (node, no deps)  →  ng serve  →  wait for both to answer  →  record
 *
 * Both children are killed on the way out, including on Ctrl-C and on a failure, so a
 * cancelled run does not leave an Angular dev server holding the port.
 */

const { spawn } = require('node:child_process');
const path = require('node:path');
const http = require('node:http');

const ROOT = path.join(__dirname, '..');
const UI = path.join(ROOT, '..', 'Diagnocare-UI');
const API_PORT = Number(process.env.MOCK_API_PORT || 5099);
const APP_PORT = Number(process.env.APP_PORT || 4299);
const APP_URL = `http://127.0.0.1:${APP_PORT}`;
/**
 * Angular's own default. `ng serve` with no arguments binds localhost:4200, and
 * on Windows that is often IPv6-only (::1), so this is spelt `localhost` rather
 * than 127.0.0.1 — the numeric form does not always answer.
 */
const REUSE_URL = `http://localhost:${process.env.REUSE_PORT || 4200}`;

const children = [];

/**
 * Windows has no `npx`, only `npx.cmd`, and spawn() without a shell will not
 * find it — the whole run dies with ENOENT before the dev server is reached.
 */
const WINDOWS = process.platform === 'win32';

function start(name, cmd, args, opts = {}) {
  const child = spawn(cmd, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: WINDOWS && cmd !== process.execPath,
    ...opts,
  });
  children.push({ name, child });
  // stdio:'inherit' callers have no pipes to read from.
  const tag = line => process.stdout.write(`[${name}] ${line}`);
  child.stdout?.on('data', d => { if (process.env.VERBOSE) tag(d.toString()); });
  child.stderr?.on('data', d => { if (process.env.VERBOSE) tag(d.toString()); });
  child.on('exit', code => {
    if (code && code !== 0 && !shuttingDown) process.stdout.write(`[${name}] exited with ${code}\n`);
  });
  return child;
}

let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const { child } of children) {
    try {
      // SIGTERM on Windows kills only the shell we spawned, leaving the real
      // `ng serve` holding the port — the next run then fails to bind. taskkill
      // /T takes the whole tree.
      if (WINDOWS && child.pid) {
        spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
      } else {
        child.kill('SIGTERM');
      }
    } catch { /* already gone */ }
  }
}
process.on('SIGINT', () => { shutdown(); process.exit(130); });
process.on('SIGTERM', () => { shutdown(); process.exit(143); });
process.on('exit', shutdown);

function get(url) {
  return new Promise(resolve => {
    const req = http.get(url, res => {
      res.resume();
      resolve(res.statusCode);
    });
    req.on('error', () => resolve(null));
    req.setTimeout(2500, () => { req.destroy(); resolve(null); });
  });
}

async function waitFor(label, url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  process.stdout.write(`waiting for ${label} …`);
  while (Date.now() < deadline) {
    const status = await get(url);
    if (status && status < 500) {
      process.stdout.write(' up\n');
      return true;
    }
    await new Promise(r => setTimeout(r, 1200));
    process.stdout.write('.');
  }
  process.stdout.write(' TIMED OUT\n');
  return false;
}

(async () => {
  start('mock-api', process.execPath, [path.join(ROOT, 'mock-api', 'server.js')], {
    env: { ...process.env, MOCK_API_PORT: String(API_PORT) },
  });

  // Reuse a dev server that is already up.
  //
  // Which server it is does not matter: the app is pointed at the mock API from
  // inside the browser, through window.RUNTIME_CONFIG, so any `ng serve` of this
  // project will do. Starting a second one costs a cold Angular build — minutes —
  // and risks colliding with the one the developer is already using.
  // get() answers null when nothing is listening, and `null < 500` is true, so
  // the status has to be checked for being a number before it is compared.
  const answers = async url => {
    const status = await get(url);
    return typeof status === 'number' && status < 500;
  };

  let appUrl = APP_URL;
  if (await answers(APP_URL)) {
    process.stdout.write(`reusing the dev server already on ${APP_URL}\n`);
  } else if (await answers(REUSE_URL)) {
    appUrl = REUSE_URL;
    process.stdout.write(`reusing the dev server already on ${REUSE_URL}\n`);
  } else {
    start('ng-serve', 'npx', ['ng', 'serve', '--port', String(APP_PORT), '--host', '127.0.0.1'], {
      cwd: UI,
      env: { ...process.env, NG_CLI_ANALYTICS: 'false' },
    });
  }

  if (!await waitFor('mock api', `http://127.0.0.1:${API_PORT}/api/pathologyTest/GetAllGroupList`, 30000)) {
    shutdown(); process.exit(1);
  }
  // A cold Angular dev-server build is slow; give it room.
  if (!await waitFor('ng serve', appUrl, 420000)) {
    shutdown(); process.exit(1);
  }

  const recorder = start('record', process.execPath, [path.join(ROOT, 'recorder', 'record.js')], {
    cwd: ROOT,
    stdio: 'inherit',
    env: {
      ...process.env,
      APP_URL: appUrl,
      MOCK_API_URL: `http://127.0.0.1:${API_PORT}/`,
    },
  });

  const code = await new Promise(resolve => recorder.on('exit', resolve));
  shutdown();
  process.exit(code ?? 0);
})();
