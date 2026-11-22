import { useEffect, useRef, useState } from 'react';
import type { Graph } from './knowledge';
import { request as api } from '../serverAccess';

export function useKnowledge({ activity }: { activity: string }) {
    const [graph, setGraph] = useState<Graph>();
    const [error, setError] = useState(''),
        [status, setStatus] = useState('');
    const [busy, setBusy] = useState(false);
    // The merge dialog keeps one concept and folds the chosen duplicate into it.
    const [keep, setKeep] = useState<string>(),
        [duplicate, setDuplicate] = useState('');
    const origin = useRef<HTMLElement | null>(null);
    const mergedFocus = useRef<string>(undefined);
    const version = useRef(0);
    const [chosen, setChosen] = useState<string>();
    const selected = graph?.concepts.find((c) => c.name === chosen) ?? graph?.concepts[0];
    useEffect(() => {
        // Native close completes the dialog's focus restoration before focusing the surviving concept.
        function restore() {
            const name = mergedFocus.current;
            if (name) {
                mergedFocus.current = undefined;
                requestAnimationFrame(() =>
                    document
                        .querySelector<HTMLElement>(`[data-concept="${CSS.escape(name)}"]`)
                        ?.focus(),
                );
            }
        }
        document.addEventListener('close', restore, true);
        return () => document.removeEventListener('close', restore, true);
    }, []);
    async function load() {
        const current = ++version.current;
        setError('');
        try {
            const data = await api('/api/graph');
            if (current === version.current) setGraph(data);
        } catch (e) {
            if (current === version.current) setError((e as Error).message);
        }
    }
    useEffect(() => {
        void load();
        return () => {
            version.current++;
        };
    }, [activity]);
    function closeMerge() {
        if (busy) return;
        setKeep(undefined);
        requestAnimationFrame(() => origin.current?.focus());
    }
    async function submitMerge(e: React.FormEvent) {
        e.preventDefault();
        if (!keep || !duplicate || busy) return;
        version.current++;
        setBusy(true);
        setError('');
        setStatus('');
        try {
            const data = await api('/api/graph/merge', { from: duplicate, into: keep });
            version.current++;
            mergedFocus.current = keep;
            setChosen(keep);
            setGraph(data);
            setKeep(undefined);
            setStatus(
                `Merged ${duplicate} into ${keep}. Topics, observations and concept links combined.`,
            );
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setBusy(false);
        }
    }
    function beginMerge(name: string, opener: HTMLElement) {
        origin.current = opener;
        setError('');
        setDuplicate('');
        setKeep(name);
    }
    function chooseKeep(name: string) {
        setKeep(name);
        if (name === duplicate) setDuplicate('');
    }
    return {
        graph,
        error,
        status,
        busy,
        keep,
        chooseKeep,
        duplicate,
        setDuplicate,
        selected,
        setChosen,
        beginMerge,
        load,
        closeMerge,
        submitMerge,
    };
}
export type KnowledgeState = ReturnType<typeof useKnowledge>;
