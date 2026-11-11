import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { VStack, HStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { Selector } from '@astryxdesign/core/Selector';

type Concept = { name: string; topics: string[]; familiarity: number; correction: 'known' | 'unknown' | null; evidence: { met: number; asked: number; used: number; ignored: number } };
export type Graph = { topics: string[]; concepts: Concept[]; links: { from: string; to: string; kind: 'related' | 'builds on' }[] };
type Api = (path: string, body?: unknown) => Promise<Graph>;
const familiarity = (c: Concept) => c.correction === 'known' ? 'You marked this as known' : c.correction === 'unknown' ? 'You marked this as not understood' : `Estimated familiarity: ${c.familiarity >= 0.8 ? 'familiar' : c.familiarity >= 0.35 ? 'some familiarity' : 'unfamiliar'}`;

const level = (c: Concept) => c.correction === 'known' ? 'Marked known' : c.correction === 'unknown' ? 'Marked not understood' : c.familiarity >= 0.8 ? 'Familiar' : c.familiarity >= 0.35 ? 'Some familiarity' : 'Unfamiliar';
const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
type Line = { x1: number; y1: number; x2: number; y2: number; key: string; selected: boolean };

export default function KnowledgePage({ api, activity }: { api: Api; activity: string }) {
  const [graph, setGraph] = useState<Graph>();
  const [error, setError] = useState(''), [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [merge, setMerge] = useState<string>(), [into, setInto] = useState('');
  const origin = useRef<HTMLElement | null>(null);
  const mergedFocus = useRef<string>(undefined);
  const version = useRef(0);
  const [chosen, setChosen] = useState<string>();
  const field = useRef<HTMLDivElement>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const selected = graph?.concepts.find(c => c.name === chosen) ?? graph?.concepts[0];
  // Relations are drawn between the closest pair of cards, since a multi-topic concept has one card per topic.
  useLayoutEffect(() => {
    const box = field.current;
    if (!box || !graph) return setLines([]);
    const draw = () => {
      const o = box.getBoundingClientRect();
      const centres = (name: string) => [...box.querySelectorAll<HTMLElement>(`[data-concept="${CSS.escape(name)}"]`)].map(e => { const r = e.getBoundingClientRect(); return { x: r.left - o.left + r.width / 2, y: r.top - o.top + r.height / 2 }; });
      setLines(graph.links.flatMap(l => {
        const pairs = centres(l.from).flatMap(a => centres(l.to).map(b => ({ x1: a.x, y1: a.y, x2: b.x, y2: b.y })));
        const best = pairs.sort((p, q) => Math.hypot(p.x2 - p.x1, p.y2 - p.y1) - Math.hypot(q.x2 - q.x1, q.y2 - q.y1))[0];
        return best ? [{ ...best, key: `${l.from}-${l.to}-${l.kind}`, selected: l.from === selected?.name || l.to === selected?.name }] : [];
      }));
    };
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(box);
    return () => observer.disconnect();
  }, [graph, selected?.name]);
  useEffect(() => {
    // Native close completes the dialog's focus restoration before focusing the surviving concept.
    function restore() {
      const name = mergedFocus.current;
      if (name) { mergedFocus.current = undefined; requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-concept="${CSS.escape(name)}"]`)?.focus()); }
    }
    document.addEventListener('close', restore, true);
    return () => document.removeEventListener('close', restore, true);
  }, []);
  async function load() {
    const current = ++version.current;
    setError('');
    try { const data = await api('/api/graph'); if (current === version.current) setGraph(data); }
    catch (e) { if (current === version.current) setError((e as Error).message); }
  }
  useEffect(() => { void load(); return () => { version.current++; }; }, [activity]);
  async function correct(name: string, kind: 'known' | 'unknown') {
    version.current++; setBusy(true); setError(''); setStatus('');
    try { const data = await api('/api/graph/correct', { name, kind }); version.current++; setGraph(data); setStatus(`${name}: ${kind === 'known' ? 'marked as known' : 'marked as not understood'}. Your correction overrides the estimate.`); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  function closeMerge() {
    if (busy) return;
    setMerge(undefined);
    requestAnimationFrame(() => origin.current?.focus());
  }
  async function submitMerge(e: React.FormEvent) {
    e.preventDefault();
    if (!merge || !into || busy) return;
    version.current++; setBusy(true); setError(''); setStatus('');
    try {
      const data = await api('/api/graph/merge', { from: merge, into });
      version.current++;
      mergedFocus.current = into; setChosen(into);
      setGraph(data); setMerge(undefined);
      setStatus(`Merged ${merge} into ${into}. Topics, evidence and concept links combined; the latest correction takes precedence.`);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  return <VStack padding={5} gap={5} className="knowledge-content">
    <VStack gap={2}>
      <HStack gap={3} hAlign="between" vAlign="center" wrap="wrap"><Heading level={1}>Knowledge</Heading><Button label="Refresh Knowledge" variant="ghost" size="sm" isDisabled={busy} onClick={() => void load()} /></HStack>
      <Text color="secondary">Concepts from all your learning trees. Familiarity is an estimate, not measured mastery. Your corrections take precedence.</Text>
      <Text role="status">{status}</Text>
      {error && !merge && <Text role="alert">{error}</Text>}
      {!graph && !error && <Text role="status">Loading knowledge…</Text>}
      {graph && !graph.concepts.length && <Text>No concepts yet. Concepts appear here after suggestions find them in a saved tutor reply.</Text>}
    </VStack>
    {graph && selected && <div className="knowledge-body">
      <div className="knowledge-field" ref={field}>
        <svg className="knowledge-links" aria-hidden="true">{lines.map(l => <line key={l.key} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} data-selected={l.selected} />)}</svg>
        {graph.topics.map(topic => <section key={topic} aria-label={topic} className="knowledge-topic">
          <Heading level={2}>{topic}</Heading>
          <div className="knowledge-cards">
            {graph.concepts.filter(c => c.topics.includes(topic)).map(c => <button key={c.name} type="button" className="concept-card" data-concept={c.name} aria-pressed={c === selected} aria-controls="concept-detail" onClick={() => setChosen(c.name)}>
              <span className="concept-name"><span className="activity-dot" />{c.name}</span>
              <span className="concept-level">{level(c)}</span>
            </button>)}
          </div>
        </section>)}
      </div>
      <aside id="concept-detail" className="knowledge-detail" aria-label={`${selected.name} details`}><VStack gap={3}>
        <Heading level={2}>{selected.name}</Heading>
        <Text className="knowledge-reading">{familiarity(selected)}</Text>
        <Text className="knowledge-reading" color="secondary">Evidence: met in {count(selected.evidence.met, 'reply', 'replies')} · asked about {count(selected.evidence.asked, 'time', 'times')} · used {count(selected.evidence.used, 'time', 'times')} in questions · ignored {count(selected.evidence.ignored, 'underline', 'underlines')} (weak hint).</Text>
        {graph.links.filter(l => l.from === selected.name || l.to === selected.name).map(l => <Text key={`${l.from}-${l.to}-${l.kind}`} className="knowledge-reading" color="secondary">{l.from} {l.kind === 'related' ? 'is related to' : 'builds on'} {l.to}</Text>)}
        <HStack gap={2} wrap="wrap" role="group" aria-label={`Corrections for ${selected.name}`}>
          <Button label="I know this" size="sm" variant={selected.correction === 'known' ? 'secondary' : 'ghost'} aria-pressed={selected.correction === 'known'} isDisabled={busy} onClick={() => void correct(selected.name, 'known')} />
          <Button label="I don't get this" size="sm" variant={selected.correction === 'unknown' ? 'secondary' : 'ghost'} aria-pressed={selected.correction === 'unknown'} isDisabled={busy} onClick={() => void correct(selected.name, 'unknown')} />
          <Button label={`Merge ${selected.name}…`} size="sm" variant="ghost" isDisabled={busy || graph.concepts.length < 2} onClick={e => { origin.current = e.currentTarget; setError(''); setInto(''); setMerge(selected.name); }}>Merge…</Button>
        </HStack>
      </VStack></aside>
    </div>}
    <Dialog isOpen={!!merge} onOpenChange={open => { if (!open) closeMerge(); }} purpose={busy ? 'required' : 'form'} width="32rem">
      <DialogHeader title="Merge duplicate concepts" />
      <form onSubmit={submitMerge}><VStack padding={5} gap={4}>
        <Text>Merge “{merge}” into another concept. Keep the chosen name and combine topics, evidence and links. The latest correction from either concept takes precedence. This cannot be undone.</Text>
        <Selector label="Concept to keep" placeholder="Choose the duplicate concept" options={graph?.concepts.filter(c => c.name !== merge).map(c => c.name) ?? []} value={into} onChange={setInto} hasSearch isDisabled={busy} width="100%" />
        {error && <Text role="alert">{error}</Text>}
        <HStack gap={2} wrap="wrap"><Button label={busy ? 'Merging…' : 'Merge concepts'} type="submit" isDisabled={busy || !into} /><Button label="Cancel merge" variant="ghost" isDisabled={busy} onClick={closeMerge} /></HStack>
      </VStack></form>
    </Dialog>
  </VStack>;
}
