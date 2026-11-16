import { useEffect, useRef, useState } from 'react';
import type { Graph } from './knowledge';
type Api = (path: string, body?: unknown) => Promise<Graph>;

export function useKnowledge({ api, activity }: { api: Api; activity: string }) {
  const [graph, setGraph] = useState<Graph>();
  const [error, setError] = useState(''),
    [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [merge, setMerge] = useState<string>(),
    [into, setInto] = useState('');
  const origin = useRef<HTMLElement | null>(null);
  const mergedFocus = useRef<string>(undefined);
  const version = useRef(0);
  const [chosen, setChosen] = useState<string>();
  useEffect(() => {
    // Native close completes the dialog's focus restoration before focusing the surviving concept.
    function restore() {
      const name = mergedFocus.current;
      if (name) {
        mergedFocus.current = undefined;
        requestAnimationFrame(() =>
          document.querySelector<HTMLElement>(`[data-concept="${CSS.escape(name)}"]`)?.focus(),
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
    setMerge(undefined);
    requestAnimationFrame(() => origin.current?.focus());
  }
  async function submitMerge(e: React.FormEvent) {
    e.preventDefault();
    if (!merge || !into || busy) return;
    version.current++;
    setBusy(true);
    setError('');
    setStatus('');
    try {
      const data = await api('/api/graph/merge', { from: merge, into });
      version.current++;
      mergedFocus.current = into;
      setChosen(into);
      setGraph(data);
      setMerge(undefined);
      setStatus(`Merged ${merge} into ${into}. Topics, observations and concept links combined.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function beginMerge(name: string, opener: HTMLElement) {
    origin.current = opener;
    setError('');
    setInto('');
    setMerge(name);
  }
  return {
    graph,
    error,
    status,
    busy,
    merge,
    into,
    setInto,
    chosen,
    setChosen,
    beginMerge,
    load,
    closeMerge,
    submitMerge,
  };
}
export type KnowledgeState = ReturnType<typeof useKnowledge>;
