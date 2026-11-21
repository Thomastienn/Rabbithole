import { ensureBrowser } from '@remotion/renderer';

// Runs in its own process: a failed ensureBrowser poisons Remotion's in-process queue, which would block Retry and renders.
// Progress goes to stdout as JSON lines.
await ensureBrowser({
    chromeMode: 'headless-shell',
    logLevel: 'error',
    onBrowserDownload: () => ({
        version: null,
        onProgress: ({ downloadedBytes, totalSizeInBytes, percent }) =>
            console.log(
                JSON.stringify({
                    bytes: downloadedBytes,
                    total: totalSizeInBytes,
                    percent: percent * 100,
                }),
            ),
    }),
});
