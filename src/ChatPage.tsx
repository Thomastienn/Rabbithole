import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Text, Heading } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { TextArea } from '@astryxdesign/core/TextArea';
import { TextInput } from '@astryxdesign/core/TextInput';
import { ChatComposer, ChatComposerInput, ChatLayout, ChatMessage, ChatMessageBubble, ChatMessageList, type ChatComposerInputHandle } from '@astryxdesign/core/Chat';
import TreeOverview, { type Summary, type Source } from './TreeOverview';
import { withTurn, type Message, type Turn } from './turn';

type Anchor = { messageId: string; start: number; end: number; text: string };
type Branch = Anchor & { parent: string; question: string; snapshot: string };
type Tree = { id: string; title: string; messages: Message[]; branch: Branch | null };
type State = { csrf: string; auth: { connected: boolean; email: string | null }; trees: Summary[]; active: string[] };

function Passage({ message, onBranch, reveal }: { message: Message; onBranch: (anchor: Anchor) => void; reveal?: Source }) {
  const [selecting, setSelecting] = useState(false);
  const [anchor, setAnchor] = useState<Anchor>();
  const passage = useRef<HTMLElement>(null);
  const highlight = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!reveal) return;
    highlight.current?.scrollIntoView({ block: 'center' });
    highlight.current?.focus({ preventScroll: true });
  }, [reveal]);
  function capture(start: number, end: number) {
    setAnchor(end > start ? { messageId: message.id, start, end, text: message.text.slice(start, end) } : undefined);
  }
  return <VStack gap={2}>
    <section ref={passage} onMouseUp={() => {
      const selection = window.getSelection();
      if (!selection?.rangeCount) return;
      const range = selection.getRangeAt(0), root = passage.current;
      if (!root?.contains(range.startContainer) || !root.contains(range.endContainer)) return;
      const prefix = range.cloneRange(); prefix.selectNodeContents(root); prefix.setEnd(range.startContainer, range.startOffset);
      const start = prefix.toString().length;
      capture(start, start + range.toString().length);
    }}><ChatMessageBubble variant="ghost"><Text style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{reveal ? <>{message.text.slice(0, reveal.start)}<mark ref={highlight} tabIndex={-1} aria-label="Source passage">{message.text.slice(reveal.start, reveal.end)}</mark>{message.text.slice(reveal.end)}</> : message.text}</Text></ChatMessageBubble></section>
    {selecting && <TextArea label="Select tutor passage" description="Select with your mouse, or hold Shift and use arrow keys. Tab to Ask about selection." value={message.text} isReadOnly rows={4} hasAutoFocus onBlur={e => capture(e.currentTarget.selectionStart, e.currentTarget.selectionEnd)} />}
    <HStack gap={2} wrap="wrap">
      <Button label={selecting ? 'Close passage selection' : 'Select passage'} variant="ghost" onClick={() => setSelecting(v => !v)} />
      <Button label="Ask about selection" variant="secondary" onClick={() => { if (anchor) onBranch(anchor); else setSelecting(true); }} />
    </HStack>
  </VStack>;
}

export default function ChatPage() {
  const [state, setState] = useState<State>();
  const [tree, setTree] = useState<Tree>();
  const [name, setName] = useState('');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [root, setRoot] = useState<string>();
  const [overview, setOverview] = useState(true);
  const [transitionBox, setTransitionBox] = useState<string>();
  const overviewOrigin = useRef<{ id: string; control: string }>(undefined);
  const [reveal, setReveal] = useState<{ tree: string; source: Source }>();
  const [branch, setBranch] = useState<{ parent: string; anchor: Anchor; question: string }>();
  const [branching, setBranching] = useState(false);
  const composer = useRef<ChatComposerInputHandle>(null);
  const focusComposer = useRef(false);
  const selected = useRef<string | undefined>(undefined);
  const request = useRef(0);
  const turns = useRef(new Map<string, Turn>());
  const checkpoints = useRef(0);

  function changeView(showOverview: boolean, id?: string) {
    if (!document.startViewTransition || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setOverview(showOverview);
      return;
    }
    flushSync(() => setTransitionBox(id));
    document.startViewTransition(() => flushSync(() => setOverview(showOverview)));
  }
  function returnToTree() {
    changeView(true, overviewOrigin.current?.id ?? tree?.id);
  }
  async function openConversation(id: string, source?: Source) {
    if (overview) {
      const control = document.activeElement as HTMLElement | null;
      const box = control?.closest<HTMLElement>('.react-flow__node')?.dataset.id;
      overviewOrigin.current = box ? { id: box, control: control!.id || `open-${box}` } : undefined;
    }
    setReveal(source ? { tree: id, source } : undefined);
    focusComposer.current = !source;
    await select(id);
    if (selected.current === id) changeView(false, overviewOrigin.current?.id ?? id);
  }
  function openTree(id: string) {
    overviewOrigin.current = undefined;
    setRoot(id); setOverview(true);
    void select(id);
  }

  async function api(path: string, body?: unknown) {
    const response = await fetch(path, body === undefined ? undefined : { method: 'POST', headers: {
      'Content-Type': 'application/json', 'X-TreeTutor-CSRF': state?.csrf ?? '' }, body: JSON.stringify(body) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? 'Request failed. Reload and try again.');
    return data;
  }
  async function savePosition(id: string, position: { x: number; y: number }) {
    await api(`/api/trees/${id}/position`, position);
    setState(s => s && { ...s, trees: s.trees.map(t => t.id === id ? { ...t, ...position } : t) });
  }
  async function refresh() {
    const data: State = await api('/api/state');
    setState({ ...data, active: [...new Set([...data.active, ...turns.current.keys()])] });
    return data;
  }
  async function select(id: string) {
    selected.current = id;
    const version = ++request.current;
    const checkpoint = checkpoints.current;
    setError('');
    setTree(undefined);
    setLoading(true);
    setMobileNav(false);
    try {
      let next: Tree = await api(`/api/trees/${id}`);
      if (request.current === version && checkpoints.current !== checkpoint) next = await api(`/api/trees/${id}`);
      if (request.current === version) { setTree(withTurn(next, turns.current.get(id))); if (next.branch && !next.messages.length) setDrafts(d => ({ ...d, [id]: d[id] ?? next.branch!.question })); }
    } catch (e) { if (request.current === version) setError((e as Error).message); }
    finally { if (request.current === version) setLoading(false); }
  }
  useEffect(() => {
    refresh().then(data => { const first = data.trees.find(t => !t.parent); if (first) openTree(first.id); else setMobileNav(true); }).catch(e => setError(e.message));
  }, []);
  useEffect(() => {
    if (!overview && tree && focusComposer.current) { composer.current?.focus(); focusComposer.current = false; }
  }, [tree?.id, overview]);
  // Reopening a page during a turn recovers saved checkpoints without tying work to focus.
  useEffect(() => {
    if (!state?.active.length) return;
    const timer = setInterval(() => {
      void refresh().then(async () => {
        const id = selected.current;
        if (!id || turns.current.has(id)) return;
        const version = request.current, checkpoint = checkpoints.current;
        const next: Tree = await api(`/api/trees/${id}`);
        if (selected.current === id && request.current === version && checkpoints.current === checkpoint && !turns.current.has(id)) setTree(next);
      }).catch(e => setError(e.message));
    }, 1500);
    return () => clearInterval(timer);
  }, [state?.active.join(',')]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !name.trim()) return;
    setBusy(true); setError('');
    try {
      const next: Tree = await api('/api/trees', { title: name });
      await refresh();
      setName('');
      setRoot(next.id); setOverview(false);
      focusComposer.current = true;
      await select(next.id);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  async function signIn() {
    try { const result = await api('/api/auth', {}); window.location.assign(result.url); }
    catch (e) { setError((e as Error).message); }
  }
  async function send(text: string, target = tree) {
    if (!target || !text.trim() || state?.active.includes(target.id) || turns.current.has(target.id)) return;
    const id = target.id;
    const turn: Turn = {};
    turns.current.set(id, turn);
    ++checkpoints.current;
    setError('');
    setState(s => s && { ...s, active: [...s.active, id] });
    try {
      const response = await fetch(`/api/trees/${id}/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-TreeTutor-CSRF': state?.csrf ?? '' }, body: JSON.stringify({ text }) });
      if (!response.ok) throw new Error((await response.json()).error);
      setDrafts(d => ({ ...d, [id]: '' }));
      const reader = response.body!.getReader(), decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const result = await reader.read();
        buffer += decoder.decode(result.value, { stream: !result.done });
        let end;
        while ((end = buffer.indexOf('\n\n')) >= 0) {
          const frame = buffer.slice(0, end); buffer = buffer.slice(end + 2);
          if (!frame.startsWith('data: ')) continue;
          const event = JSON.parse(frame.slice(6));
          if (event.type === 'error' && selected.current === id) setError(event.error);
          if (event.type === 'saved') {
            turn.user = event.user;
            turn.reply = { id: event.id, role: 'assistant', text: '', status: 'streaming' };
          }
          if (turn.reply && (event.type === 'text' || event.type === 'done')) {
            turn.reply = { ...turn.reply, text: event.text ?? turn.reply.text, status: event.status ?? turn.reply.status };
          }
          if (event.type === 'saved' || event.type === 'text' || event.type === 'done') {
            setTree(t => t?.id === id ? withTurn(t, turn) : t);
          }
        }
        if (result.done) break;
      }
    } catch (e) { if (selected.current === id) setError((e as Error).message); }
    finally {
      try {
        const saved = await api(`/api/trees/${id}`);
        if (selected.current === id) { ++checkpoints.current; setTree(saved); }
      } catch { if (selected.current === id) setError('Connection lost. Reload to recover saved messages.'); }
      finally {
        turns.current.delete(id);
        await refresh().catch(() => { if (selected.current === id) setError('Connection lost. Reload to recover saved messages.'); });
      }
    }
  }
  async function submitBranch(e: React.FormEvent) {
    e.preventDefault();
    if (!branch || branching || !branch.question.trim()) return;
    setBranching(true); setError('');
    try {
      const next: Tree = await api(`/api/trees/${branch.parent}/branches`, { ...branch.anchor, question: branch.question });
      setDrafts(d => ({ ...d, [next.id]: branch.question }));
      overviewOrigin.current = undefined;
      setBranch(undefined);
      await refresh();
      focusComposer.current = true;
      await select(next.id);
      await send(branch.question, next);
    } catch (e) { setError((e as Error).message); }
    finally { setBranching(false); }
  }
  const source = !overview && reveal?.tree === tree?.id ? reveal?.source : undefined;
  const validSource = source && tree?.messages.some(m => m.id === source.messageId && m.role === 'assistant' && m.status === 'completed' && source.start >= 0 && source.end > source.start && m.text.slice(source.start, source.end) === source.text);
  const active = !!tree && !!state?.active.includes(tree.id);
  return <VStack gap={0} style={{ height: '100dvh' }}>
    <header><HStack padding={5} gap={4} vAlign="center" wrap="wrap">
      <Heading level={1}>TreeTutor</Heading>
      <Text color="secondary">Room to follow a question.</Text>
      <Button label={mobileNav ? 'Hide learning trees' : 'Show learning trees'} className="mobile-nav" variant="ghost" aria-expanded={mobileNav} aria-controls="tree-navigation" onClick={() => setMobileNav(v => !v)} />
    </HStack></header>
    <HStack gap={0} style={{ flex: 1, minHeight: 0 }} className="workspace">
      <aside id="tree-navigation" aria-label="Learning trees" className="trees" data-open={mobileNav}><VStack padding={5} gap={5}>
        <Heading level={2}>Your trees</Heading>
        <form onSubmit={create}><VStack gap={3}>
          <TextInput label="New tree name" value={name} onChange={setName} />
          <Button label={busy ? 'Creating…' : 'Create tree'} type="submit" isDisabled={busy || !name.trim()}>{busy ? 'Creating…' : 'Create tree'}</Button>
        </VStack></form>
        <nav aria-label="Saved learning trees"><VStack gap={2}>
          {state?.trees.filter(t => !t.parent).map(t => <Button label={t.title} key={t.id} variant={root === t.id ? 'secondary' : 'ghost'} aria-current={root === t.id ? 'page' : undefined} onClick={() => openTree(t.id)}>{t.title}</Button>)}
          {state && !state.trees.length && <Text color="secondary">Your first tree starts with a question.</Text>}
        </VStack></nav>
        <VStack gap={3}>
          <Text type="supporting" color="secondary">Trees save on this computer. Questions go to ChatGPT using your plan.</Text>
          <Button label={state?.auth.connected ? 'Reconnect ChatGPT' : 'Continue with ChatGPT'} variant="secondary" data-oai-siwc-button="" onClick={() => void signIn()}>{state?.auth.connected ? 'Reconnect ChatGPT' : 'Continue with ChatGPT'}</Button>
          {state?.auth.connected && <Text type="supporting">Connected {state.auth.email ?? 'to ChatGPT'}</Text>}
        </VStack>
      </VStack></aside>
      <main className="conversation">
        {error && <section role="alert"><VStack padding={4}><Text>{error}</Text></VStack></section>}
        <section className="tree-workspace">
        {root && state && <section className="overview" style={{ opacity: overview ? 1 : 0 }} inert={!overview} aria-hidden={!overview} aria-label="Learning tree">
          <header><VStack padding={5} gap={1}><Heading level={2}>{state.trees.find(t => t.id === root)?.title}</Heading><Text color="secondary">Follow a connection or open a conversation.</Text></VStack></header>
          <TreeOverview key={root} root={root} trees={state.trees} active={state.active} open={openConversation} save={savePosition} focus={overview ? overviewOrigin.current?.id ?? tree?.id : undefined} focusControl={overviewOrigin.current?.control} transition={overview ? transitionBox : undefined} />
        </section>}
        <section className="focused-chat" style={{ display: overview && root ? 'none' : 'flex' }} onKeyDown={e => { if (e.key === 'Escape' && !branch) { e.preventDefault(); returnToTree(); } }}>
        {tree ? <>
          <header><VStack padding={5} gap={1}><Button label="Return to tree" variant="ghost" onClick={returnToTree} /><Heading level={2} style={{ viewTransitionName: !overview && transitionBox ? 'conversation' : undefined }}>{tree.title}</Heading><Text type="supporting" color="secondary">Codex · saved automatically</Text>{tree.branch && <Button label="Return to parent conversation" variant="ghost" onClick={() => openConversation(tree.branch!.parent)} />}</VStack></header>
          {source && !validSource && <Text role="alert">Saved source passage is unavailable. No replacement passage was selected.</Text>}
          <ChatLayout density="balanced" composer={<ChatComposer elevation="none" value={drafts[tree.id] ?? ''} onChange={value => setDrafts(d => ({ ...d, [tree.id]: value }))} onSubmit={text => void send(text)} isStopShown={active} onStop={() => { void api(`/api/trees/${tree.id}/stop`, {}).catch(e => setError(e.message)); }} input={<ChatComposerInput handleRef={composer} label="Your question" value={drafts[tree.id] ?? ''} onChange={value => setDrafts(d => ({ ...d, [tree.id]: value }))} isDisabled={active} placeholder="What would you like to understand?" />} footerActions={<Text type="supporting" color="secondary">Enter to send · Shift+Enter for a new line</Text>} />}>
            <ChatMessageList>
              {branch?.parent === tree.id && <form onSubmit={submitBranch}><VStack padding={4} gap={3}>
                <Heading level={3}>Follow this passage</Heading>
                <Text style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{branch.anchor.text}</Text>
                <TextArea label="Question about this passage" value={branch.question} onChange={question => setBranch(b => b && { ...b, question })} isDisabled={branching} hasAutoFocus />
                <HStack gap={2} wrap="wrap"><Button label={branching ? 'Preparing context…' : 'Create focused chat'} type="submit" isDisabled={branching || !branch.question.trim() || active} /><Button label="Cancel branch" variant="ghost" isDisabled={branching} onClick={() => setBranch(undefined)} /></HStack>
                <Text type="supporting" color="secondary">Creates a saved chat with fixed context from this conversation.</Text>
              </VStack></form>}
              {!tree.messages.length && <VStack gap={3} padding={6}><Heading level={3}>What are you curious about?</Heading><Text color="secondary">Ask about a concept, work through an example, or pick up a question you have been carrying.</Text></VStack>}
              {tree.messages.map(message => <ChatMessage key={message.id} sender={message.role === 'user' ? 'user' : 'assistant'}>
                <Text type="label" weight="semibold">{message.role === 'user' ? 'You' : 'Tutor'}</Text>
                {message.role === 'assistant' && message.status === 'completed' ? <Passage message={message} reveal={validSource && source?.messageId === message.id ? source : undefined} onBranch={anchor => { setBranch({ parent: tree.id, anchor, question: '' }); setError(''); }} /> : <ChatMessageBubble variant="ghost"><Text style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{message.text || (message.status === 'streaming' ? 'Thinking…' : 'No reply received.')}</Text></ChatMessageBubble>}
                {message.status !== 'completed' && <Text type="supporting" role="status">{message.status === 'streaming' ? 'Responding…' : `Reply ${message.status}. You can send another question.`}</Text>}
              </ChatMessage>)}
            </ChatMessageList>
          </ChatLayout>
        </> : <VStack gap={3} padding={6}><Heading level={2}>{loading ? 'Loading tree…' : selected.current ? 'Tree could not load' : 'Start a learning tree'}</Heading>{selected.current ? <Button label="Retry loading tree" onClick={() => void select(selected.current!)} /> : <Text color="secondary">Give your topic a name, then ask your first question. Come back any time.</Text>}</VStack>}
        </section>
        </section>
      </main>
    </HStack>
  </VStack>;
}
