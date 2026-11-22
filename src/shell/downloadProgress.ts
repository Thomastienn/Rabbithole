export type Download = {
    id: string;
    name: string;
    state: 'queued' | 'running' | 'failed' | 'ready';
    bytes: number | null;
    total: number | null;
    percent: number | null;
    error?: string;
    // An installed add-on fetching the newer version an app update needs.
    update?: boolean;
};

// The ring shows the running total: ready tools count as done, unknown progress as nothing yet.
export const overallPercent = (list: Download[]) =>
    Math.round(
        list.reduce((sum, d) => sum + (d.state === 'ready' ? 100 : (d.percent ?? 0)), 0) /
            Math.max(1, list.length),
    );

export const formatSize = (bytes: number | null) =>
    bytes === null ? null : `${(bytes / 1e6).toFixed(bytes < 1e7 ? 1 : 0)} MB`;

export const downloadStatus = (d: Download) =>
    d.state === 'queued'
        ? 'Queued'
        : d.state === 'ready'
          ? 'Ready'
          : d.state === 'failed'
            ? `Failed: ${d.error}`
            : d.percent === null
              ? `${d.update ? 'Updating' : 'Downloading'}…`
              : `${d.update ? 'Updating' : 'Downloading'}, ${d.percent}%`;
