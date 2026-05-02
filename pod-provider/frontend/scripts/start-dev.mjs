import { spawn } from 'node:child_process';
import net from 'node:net';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

function canUsePort(port) {
  return new Promise(resolve => {
    const server = net.createServer();
    server.unref();

    server.on('error', () => resolve(false));

    server.listen({ port, host: '0.0.0.0' }, () => {
      server.close(() => resolve(true));
    });
  });
}

async function findAvailablePort() {
  const requestedPort = Number.parseInt(process.env.PORT || '', 10);
  const candidates = [];

  if (Number.isInteger(requestedPort) && requestedPort > 0) {
    candidates.push(requestedPort);
  }

  for (let port = 5001; port <= 5010; port += 1) {
    if (!candidates.includes(port)) {
      candidates.push(port);
    }
  }

  for (const port of candidates) {
    // Probe candidate ports to avoid CRA interactive Y/n prompt.
    if (await canUsePort(port)) {
      return port;
    }
  }

  throw new Error('No available frontend dev port found in range 5001-5010.');
}

async function main() {
  const port = await findAvailablePort();
  const startScript = require.resolve('react-scripts/scripts/start');
  const env = {
    ...process.env,
    PORT: String(port)
  };

  console.log(`[dev] Starting frontend on port ${port}`);

  const child = spawn(process.execPath, [startScript], {
    env,
    stdio: 'inherit'
  });

  process.on('SIGINT', () => child.kill('SIGINT'));
  process.on('SIGTERM', () => child.kill('SIGTERM'));

  child.on('exit', code => {
    process.exit(code ?? 0);
  });
}

main().catch(error => {
  console.error('[dev] Failed to start frontend dev server:', error.message);
  process.exit(1);
});
