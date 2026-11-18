import { ensureBrowser } from '@remotion/renderer';

// Runs in its own process: a failed ensureBrowser poisons Remotion's in-process queue, which would block Retry and renders.
// --check exits 1 when the browser is missing; otherwise progress goes to stdout as JSON lines.
const check = process.argv.includes('--check');
await ensureBrowser({
  chromeMode: 'headless-shell',
  logLevel: 'error',
  onBrowserDownload: () => {
    if (check) process.exit(1);
    return {
      version: null,
      onProgress: ({ downloadedBytes, totalSizeInBytes, percent }) =>
        console.log(
          JSON.stringify({
            bytes: downloadedBytes,
            total: totalSizeInBytes,
            percent: percent * 100,
          }),
        ),
    };
  },
});
