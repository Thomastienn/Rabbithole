import { useSyncExternalStore } from 'react';
import type { Download } from './downloadProgress';

const listeners = new Set<() => void>();
let rows: Download[] = [];
let source: EventSource | undefined;

// Share one connection across the sidebar, setup and Settings in each tab.
export function subscribeDownloads(listener: () => void) {
    listeners.add(listener);
    if (!source && typeof EventSource !== 'undefined') {
        source = new EventSource('/api/downloads?includeSeen=1');
        source.onmessage = (event) => {
            rows = JSON.parse(event.data);
            for (const notify of listeners) notify();
        };
    }
    return () => {
        listeners.delete(listener);
        if (listeners.size) return;
        source?.close();
        source = undefined;
        rows = [];
    };
}

export function useDownloadRows() {
    return useSyncExternalStore(subscribeDownloads, () => rows);
}
