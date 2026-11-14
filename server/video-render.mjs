// Runs inside the bubblewrap sandbox from videos.mjs; argv: workspace, output file, dependency directory.
import { join } from 'node:path';
import { bundle } from '@remotion/bundler';
import { selectComposition, renderMedia } from '@remotion/renderer';

const [workspace, output, modules] = process.argv.slice(2);
const serveUrl = await bundle({
  entryPoint: join(workspace, 'index.tsx'),
  publicDir: join(workspace, 'public'),
  outDir: join(workspace, 'bundle'),
  enableCaching: false,
  webpackOverride: (config) => ({ ...config, resolve: { ...config.resolve, modules: [modules] } }),
});
// The sandbox has no network, so use the browser installed beside the dependencies instead of downloading one.
const browserExecutable = join(
  modules,
  '.remotion/chrome-headless-shell/linux64/chrome-headless-shell-linux64/chrome-headless-shell',
);
let reported = 0;
const composition = await selectComposition({
  serveUrl,
  id: 'Video',
  browserExecutable,
  logLevel: 'error',
});
await renderMedia({
  serveUrl,
  composition,
  browserExecutable,
  codec: 'h264',
  outputLocation: output,
  concurrency: 1,
  logLevel: 'error',
  onProgress: ({ progress }) => {
    const step = Math.floor(progress * 100) / 100;
    if (step > reported) console.log(JSON.stringify({ progress: (reported = step) }));
  },
});
console.log(
  JSON.stringify({ durationInFrames: composition.durationInFrames, fps: composition.fps }),
);
