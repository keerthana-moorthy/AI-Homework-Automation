import { spawn } from 'node:child_process';
import net from 'node:net';

const backendPort = Number(process.env.BACKEND_PORT || 4000);
const backendUrl = `http://127.0.0.1:${backendPort}`;
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
    const socket = net.createConnection({ host: '127.0.0.1', port: backendPort });

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

async function runProcess(command, args, env = process.env) {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      stdio: 'inherit',
      shell: false,
      env,
    });

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} ${args.join(' ')} exited with code ${code ?? 'unknown'}`));
      }
    });
  });
}

let backend = null;

if (!(await isBackendHealthy())) {
  if (await isPortListening()) {
    if (!(await waitForHealthy())) {
      console.error(`Port ${backendPort} is already in use, but ${backendUrl} never became healthy.`);
      console.error('Stop the other process or set BACKEND_PORT to a free port.');
      process.exit(1);
    }
  } else {
    backend = spawn('python', [
      '-m',
      'uvicorn',
      'backend.main:app',
      '--host',
      '127.0.0.1',
      '--port',
      String(backendPort),
      '--reload',
    ], {
      cwd: process.cwd(),
      stdio: 'inherit',
      shell: false,
    });

    if (!(await waitForHealthy())) {
      backend.kill();
      console.error(`Backend failed to become healthy at ${backendUrl}.`);
      process.exit(1);
    }
  }
}

await runProcess(process.execPath, ['scripts/vite-build.mjs'], {
  ...process.env,
  VITE_API_BASE_URL: `http://127.0.0.1:${backendPort}`,
});

backend?.on('exit', (code) => {
  process.exit(code ?? 0);
});

const shutdown = () => {
  backend?.kill();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

process.env.HOST = process.env.HOST || '127.0.0.1';
process.env.PORT = process.env.PORT || '3000';

await import('./vite-dev.mjs');
