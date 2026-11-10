import { useEffect, useRef, useState } from 'react';
import { VStack, HStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { List, ListItem } from '@astryxdesign/core/List';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { Selector } from '@astryxdesign/core/Selector';

type Concept = { name: string; topics: string[]; familiarity: number; correction: 'known' | 'unknown' | null; evidence: { met: number; asked: number; used: number; ignored: number } };
type Graph = { topics: string[]; concepts: Concept[]; links: { from: string; to: string; kind: 'related' | 'builds on' }[] };
type Api = (path: string, body?: unknown) => Promise<Graph>;
const familiarity = (c: Concept) => c.correction === 'known' ? 'You marked this as known' : c.correction === 'unknown' ? 'You marked this as not understood' : `Estimated familiarity: ${c.familiarity >= 0.8 ? 'familiar' : c.familiarity >= 0.35 ? 'some familiarity' : 'unfamiliar'}`;

export default function KnowledgePage({ api, activity }: { api: Api; activity: string }) {
  const [graph, setGraph] = useState<Graph>();
  const [error, setError] = useState(''), [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [merge, setMerge] = useState<string>(), [into, setInto] = useState('');
  const origin = useRef<HTMLElement | null>(null);
  const mergedFocus = useRef<string>(undefined);
  const version = useRef(0);
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
      mergedFocus.current = into;
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
    {graph?.topics.map(topic => <section key={topic} aria-label={topic}>
      <List edge="flush" hasDividers header={<Heading level={2}>{topic}</Heading>}>
        {graph.concepts.filter(c => c.topics.includes(topic)).map(c => <ListItem key={c.name} label={<Heading level={3} data-concept={c.name} tabIndex={-1}>{c.name}</Heading>} description={<VStack gap={2}>
          <Text>{familiarity(c)}</Text>
          <Text type="supporting" color="secondary">Evidence: met in {c.evidence.met} replies · asked about {c.evidence.asked} times · used {c.evidence.used} times in questions · ignored {c.evidence.ignored} underlines (weak hint).</Text>
          {graph.links.filter(l => l.from === c.name || l.to === c.name).map(l => <Text key={`${l.from}-${l.to}-${l.kind}`} type="supporting">{l.from} {l.kind === 'related' ? 'is related to' : 'builds on'} {l.to}</Text>)}
          <HStack gap={2} wrap="wrap" role="group" aria-label={`Corrections for ${c.name}`}>
            <Button label="I know this" size="sm" variant={c.correction === 'known' ? 'secondary' : 'ghost'} aria-pressed={c.correction === 'known'} isDisabled={busy} onClick={() => void correct(c.name, 'known')} />
            <Button label="I don't get this" size="sm" variant={c.correction === 'unknown' ? 'secondary' : 'ghost'} aria-pressed={c.correction === 'unknown'} isDisabled={busy} onClick={() => void correct(c.name, 'unknown')} />
            <Button label={`Merge ${c.name}…`} size="sm" variant="ghost" isDisabled={busy || graph.concepts.length < 2} onClick={e => { origin.current = e.currentTarget; setError(''); setInto(''); setMerge(c.name); }}>Merge…</Button>
          </HStack>
        </VStack>} />)}
      </List>
    </section>)}
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
