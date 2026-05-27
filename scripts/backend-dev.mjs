import { spawn } from 'node:child_process';
import net from 'node:net';

const port = Number(process.env.BACKEND_PORT || 4000);
const backendUrl = `http://127.0.0.1:${port}`;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function isBackendHealthy() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1500);

  try {
    const response = await fetch(`${backendUrl}/health`, { signal: controller.signal });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function isPortListening() {
  return await new Promise((resolve) => {
    const socket = net.createConnection({ host: '127.0.0.1', port });

    const finish = (result) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(750);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

async function waitForHealthy(maxWaitMs = 15000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < maxWaitMs) {
    if (await isBackendHealthy()) {
      return true;
    }

    await wait(500);
  }

  return false;
}

if (await isBackendHealthy()) {
  console.log(`Backend already running at ${backendUrl}`);
  process.exit(0);
}

if (await isPortListening()) {
  if (await waitForHealthy()) {
    console.log(`Backend already running at ${backendUrl}`);
    process.exit(0);
  }

  console.error(`Port ${port} is already in use, but ${backendUrl} never became healthy.`);
  console.error('Stop the other process or set BACKEND_PORT to a free port.');
  process.exit(1);
}

const child = spawn('python', [
  '-m',
  'uvicorn',
  'backend.main:app',
  '--host',
  '127.0.0.1',
  '--port',
  String(port),
  '--reload',
], {
  cwd: process.cwd(),
  stdio: 'inherit',
  shell: false,
});

const shutdown = () => {
  child.kill();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
