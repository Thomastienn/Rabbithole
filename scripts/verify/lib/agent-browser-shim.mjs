#!/usr/bin/env node
// Put on PATH as `agent-browser` by verify-all: under parallel load a map control can stay covered by the
// map's loading layer for a moment, and agent-browser then refuses the click without clicking. Retry those for up to 5s.
import { spawnSync } from 'node:child_process';

const real = process.env.VERIFY_REAL_AGENT_BROWSER;
for (let i = 0; ; i++) {
  const r = spawnSync(real, process.argv.slice(2), { maxBuffer: 64 * 1024 * 1024 });
  if (r.error) throw r.error;
  if (r.status !== 0 && i < 20 && /is covered by/.test(r.stderr)) {
    await new Promise((done) => setTimeout(done, 250));
    continue;
  }
  process.stdout.write(r.stdout);
  process.stderr.write(r.stderr);
  process.exit(r.status ?? 1);
}
