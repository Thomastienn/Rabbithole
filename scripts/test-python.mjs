// Manual only: runs model-style code in real bubblewrap with the real .venv-python; never part of npm test.
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pythonTool, pythonWorkspace } from '../server/tools/python.mjs';
import { readPage } from '../server/tools/readPage.mjs';

if (process.env.RABBITHOLE_REAL_PYTHON !== '1') {
  console.log('Real Python sandbox skipped. Opt in with npm run test:python.');
  process.exit(0);
}

// App data lives under home like the real data directory, holding a secret the sandbox must not see.
const dir = mkdtempSync(join(homedir(), '.rabbithole-test-python-'));
writeFileSync(join(dir, 'secret.txt'), 'app data');
const homeEntry = readdirSync(homedir()).find(
  (name) => !name.startsWith('.rabbithole-test-python-'),
);
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/csv' }).end('x,y\n1,2\n3,4\n');
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
const tool = pythonTool({ dir });
const turn = (signal = new AbortController().signal) => ({ conversation: 'c1', signal });
const run = (code, timeout) => tool.run({ code, ...(timeout && { timeout }) }, turn());
try {
  const status = await tool.status();
  assert.ok(status.ready, status.error);

  const math = await run(
    'import numpy as np, sympy as sp, scipy, pandas\nx = sp.symbols("x")\nprint(np.linalg.det(np.array([[2,1],[1,3]])).round(6), sp.integrate(x**2, (x, 0, 3)))',
  );
  assert.match(math, /^Exit code: 0\n--- stdout ---\n5\.0 9\n/);
  console.log('PASS: numpy and sympy compute and return raw stdout.');

  const net = await run(
    `import socket\nfor host, port in [("1.1.1.1", 80), ("127.0.0.1", ${port})]:\n    try:\n        socket.create_connection((host, port), timeout=3); print("connected", host)\n    except OSError as e: print("refused", host, e.errno)`,
  );
  assert.doesNotMatch(net, /connected/);
  assert.match(net, /refused 1\.1\.1\.1/);
  assert.match(net, /refused 127\.0\.0\.1/);
  console.log('PASS: internet and host loopback are unreachable.');

  const hidden = await run(
    `import os\nprint(os.path.exists(${JSON.stringify(join(homedir(), homeEntry))}), os.path.exists(${JSON.stringify(join(dir, 'secret.txt'))}), os.listdir(${JSON.stringify(dir)}))`,
  );
  assert.match(hidden, /stdout ---\nFalse False \['python'\]\n/);
  console.log(`PASS: home (${homeEntry}) and app data (secret.txt) are invisible.`);

  await readPage(
    { url: `http://127.0.0.1:${port}/data.csv`, save_as: 'data.csv' },
    { workspace: pythonWorkspace(dir, 'c1'), isPublic: () => true },
  );
  const data = await run('import pandas as pd\nprint(pd.read_csv("data.csv")["y"].sum())');
  assert.match(data, /stdout ---\n6\n/);
  await run('open("kept.txt", "w").write("kept")');
  assert.match(await run('print(open("kept.txt").read())'), /stdout ---\nkept\n/);
  console.log('PASS: read_page save_as data and earlier files are readable from Python.');

  let started = Date.now();
  assert.match(await run('while True: pass', 2), /^Stopped: the time limit of 2 seconds/);
  assert.ok(Date.now() - started < 5000);
  const stop = new AbortController();
  setTimeout(() => stop.abort(), 500);
  started = Date.now();
  await assert.rejects(tool.run({ code: 'while True: pass' }, turn(stop.signal)), {
    name: 'AbortError',
  });
  assert.ok(Date.now() - started < 3000);
  console.log('PASS: the time limit and Stop kill a stuck run.');
  console.log('Real Python sandbox passed.');
} finally {
  server.close();
  rmSync(dir, { recursive: true, force: true });
}
