import { useEffect, useRef, useState } from 'react';
import type { Graph } from './knowledge';
import { request as api } from '../serverAccess';

export function useKnowledge({ activity }: { activity: string }) {
    const [graph, setGraph] = useState<Graph>();
    const [error, setError] = useState('');
    const version = useRef(0);
    const [chosen, setChosen] = useState<string>();
    const selected = graph?.concepts.find((c) => c.name === chosen) ?? graph?.concepts[0];
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
    return {
        graph,
        error,
        selected,
        setChosen,
        load,
    };
}
export type KnowledgeState = ReturnType<typeof useKnowledge>;
