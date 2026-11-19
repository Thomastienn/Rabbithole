import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dataDir, desktopFor } from '../../server/desktop.mjs';

const recorder = (failRun = false) => {
  const calls = [];
  return {
    calls,
    run: async (cmd, args, options) => {
      calls.push({ cmd, args, env: options?.env?.RABBITHOLE_TRASH });
      if (failRun) throw new Error('no file manager');
    },
    open: async (cmd, args) => calls.push({ cmd, args, detached: true }),
  };
};

test('Windows shows the file in Explorer and trashes it to the Recycle Bin, with the path never in script text', async () => {
  const r = recorder();
  const win = desktopFor('win32', r.run, r.open);
  const path = "C:\\Users\\L\\AppData\\Roaming\\rabbithole\\media\\a b'; rm.mp4";
  await win.reveal(path);
  await win.trash(path);
  assert.deepEqual(r.calls[0], { cmd: 'explorer.exe', args: ['/select,', path], detached: true });
  const { cmd, args, env } = r.calls[1];
  assert.equal(cmd, 'powershell.exe');
  assert.deepEqual(args.slice(0, 3), ['-NoProfile', '-NonInteractive', '-Command']);
  assert.match(args[3], /SendToRecycleBin/);
  assert.ok(!args.join(' ').includes(path));
  assert.equal(env, path, 'the path travels in an environment variable');
});

test('Linux keeps the FileManager1 reveal with an xdg-open fallback, and gio trash', async () => {
  const r = recorder(true);
  const linux = desktopFor('linux', r.run, r.open);
  await linux.reveal('/data/media/v.mp4');
  await assert.rejects(linux.trash('/data/media/v.mp4'));
  assert.equal(r.calls[0].cmd, 'gdbus');
  assert.ok(r.calls[0].args.includes('["file:///data/media/v.mp4"]'));
  assert.deepEqual(r.calls[1], { cmd: 'xdg-open', args: ['/data/media'], detached: true });
  assert.deepEqual(r.calls[2].args, ['trash', '--', '/data/media/v.mp4']);
});

test('the data folder is %APPDATA%\\rabbithole on Windows and $XDG_DATA_HOME/rabbithole on Linux', () => {
  assert.equal(
    dataDir({ APPDATA: 'C:\\Users\\L\\AppData\\Roaming' }, 'win32'),
    'C:\\Users\\L\\AppData\\Roaming\\rabbithole',
  );
  assert.equal(dataDir({ XDG_DATA_HOME: '/x' }, 'linux', '/home/l'), '/x/rabbithole');
  assert.equal(dataDir({}, 'linux', '/home/l'), '/home/l/.local/share/rabbithole');
});
