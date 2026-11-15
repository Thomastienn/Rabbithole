import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { protocol } from './protocol-fixture.mjs';

// Real provider adapters, in-memory protocol peer. Native subprocess transport stays covered in providers/.
export function fixtureLaunch(command, args) {
  const child = new EventEmitter();
  child.stdin = new PassThrough();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.exitCode = null;
  child.kill = (code = null) => {
    if (child.exitCode !== null) return;
    child.exitCode = code ?? 0;
    child.stdin.destroy();
    child.stdout.end();
    child.stderr.end();
    queueMicrotask(() => {
      child.emit('exit', code);
      child.emit('close', code);
    });
  };
  const held = Promise.withResolvers();
  child.release = held.resolve;
  queueMicrotask(async () => {
    try {
      await protocol(
        child.stdin,
        { write: (data) => child.exitCode === null && child.stdout.write(data) },
        args,
        child.kill,
        () => held.promise,
      );
      if (command === 'claude') child.kill(0);
    } catch (error) {
      child.emit('error', error);
      child.kill(1);
    }
  });
  return child;
}
