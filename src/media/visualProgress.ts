// Displayed state of a visual and a reply's visual count (docs/tutor-tools-and-polish-spec.md, Visual progress).
import type { Artifact, ArtifactSummary } from './artifacts.ts';
import { elapsed } from './videoProgress.ts';

export type VisualState = 'drawing' | 'interactive' | 'failed' | 'interrupted';
export type VisualProgress = { state: VisualState; partial: boolean; elapsed?: string };

// Canceled visuals render nothing; partial means drawn source has arrived but is not finished.
export function visualProgress(
    a: Pick<Artifact, 'status' | 'source' | 'created' | 'startedAt'>,
    now: number,
): VisualProgress | undefined {
    if (a.status === 'pending')
        return {
            state: 'drawing',
            partial: !!a.source,
            elapsed: elapsed({ startedAt: a.startedAt ?? a.created }, now),
        };
    if (a.status === 'ready') return { state: 'interactive', partial: false };
    if (a.status === 'failed' || a.status === 'interrupted')
        return { state: a.status, partial: false };
}

// The badge a visual shows for its displayed state.
export function visualBadge({ state, elapsed }: VisualProgress) {
    if (state === 'drawing') return { variant: 'info', label: `Drawing… ${elapsed}` } as const;
    if (state === 'interactive') return { variant: 'success', label: 'Interactive' } as const;
    return { variant: 'error', label: state === 'failed' ? 'Failed' : 'Interrupted' } as const;
}

// "n of m visuals ready" while any of a reply's visuals is still drawing; videos are not counted.
export function visualsReady(artifacts: Pick<ArtifactSummary, 'kind' | 'status'>[] = []) {
    const visuals = artifacts.filter((a) => a.kind === 'visual' && a.status !== 'canceled');
    if (!visuals.some((a) => a.status === 'pending')) return;
    const ready = visuals.filter((a) => a.status === 'ready').length;
    return `${ready} of ${visuals.length} ${visuals.length === 1 ? 'visual' : 'visuals'} ready`;
}
