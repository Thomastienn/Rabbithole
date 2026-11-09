import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Text, Heading } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { IconButton } from '@astryxdesign/core/IconButton';
import { DropdownMenu, DropdownMenuRadioGroup, DropdownMenuRadioItem } from '@astryxdesign/core/DropdownMenu';
import { AdjustmentsHorizontalIcon, EllipsisHorizontalIcon } from '@heroicons/react/24/outline';
import { TextArea } from '@astryxdesign/core/TextArea';
import { TextInput } from '@astryxdesign/core/TextInput';
import { ChatComposer, ChatComposerInput, ChatLayout, ChatMessage, ChatMessageBubble, ChatMessageList, type ChatComposerInputHandle } from '@astryxdesign/core/Chat';
import TreeOverview, { type Summary, type Source, type Preview, type MapActions, type Layout } from './TreeOverview';
import { withTurn, type Message, type Turn } from './turn';

type Anchor = { messageId: string; start: number; end: number; text: string };
type Branch = Anchor & { parent: string; question: string; snapshot: string };
type Tree = { id: string; title: string; model: string | null; messages: Message[]; branch: Branch | null };
type Model = { model: string; label: string; isDefault: boolean };
type State = { csrf: string; auth: { connected: boolean; email: string | null }; trees: Summary[]; active: string[] };
const previewText = (text: string) => { const chars = Array.from(text); return chars.slice(0, 512).join('') + (chars.length > 512 ? '…' : ''); };

function Passage({ message, onBranch, reveal, selecting, closeSelection, formOpen }: { message: Message; onBranch: (anchor: Anchor, origin: HTMLElement | null) => void; reveal?: Source; selecting: boolean; closeSelection: () => void; formOpen: boolean }) {
  const [anchor, setAnchor] = useState<Anchor>();
  const passage = useRef<HTMLElement>(null);
  const highlight = useRef<HTMLElement>(null);
  const action = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!reveal) return;
    highlight.current?.scrollIntoView({ block: 'center' });
    highlight.current?.focus({ preventScroll: true });
  }, [reveal]);
  function capture(start: number, end: number) {
    setAnchor(end > start ? { messageId: message.id, start, end, text: message.text.slice(start, end) } : undefined);
  }
  function captureSelection() {
      const selection = window.getSelection();
      if (!selection?.rangeCount || selection.isCollapsed) { setAnchor(undefined); return; }
      const range = selection.getRangeAt(0), root = passage.current;
      if (!root?.contains(range.startContainer) || !root.contains(range.endContainer)) { setAnchor(undefined); return; }
      const prefix = range.cloneRange(); prefix.selectNodeContents(root); prefix.setEnd(range.startContainer, range.startOffset);
      const start = prefix.toString().length;
      capture(start, start + range.toString().length);
  }
  useEffect(() => {
    function dismiss(e: PointerEvent) { if (!passage.current?.contains(e.target as Node) && !action.current?.contains(e.target as Node) && !selecting && !formOpen) setAnchor(undefined); }
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [selecting, formOpen]);
  return <VStack gap={2} onKeyDown={e => { if (e.key === 'Escape' && (anchor || selecting)) { e.preventDefault(); e.stopPropagation(); setAnchor(undefined); closeSelection(); passage.current?.focus(); } }}>
    <section ref={passage} tabIndex={-1} onMouseUp={captureSelection} onKeyUp={captureSelection}><ChatMessageBubble variant="ghost"><Text style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{reveal ? <>{message.text.slice(0, reveal.start)}<mark ref={highlight} tabIndex={-1} aria-label="Source passage">{message.text.slice(reveal.start, reveal.end)}</mark>{message.text.slice(reveal.end)}</> : message.text}</Text></ChatMessageBubble></section>
    {selecting && <><TextArea label="Select tutor passage" description="Select with your mouse, or hold Shift and use arrow keys. Tab to Ask about selection." value={message.text} isReadOnly rows={4} hasAutoFocus onSelect={e => { const input = e.target as HTMLTextAreaElement; capture(input.selectionStart, input.selectionEnd); }} /></>}
    {anchor && <Button ref={action} label="Ask about selection" variant="secondary" onClick={() => onBranch(anchor, action.current)} />}
    {selecting && <Button label="Close passage selection" variant="ghost" onClick={() => { setAnchor(undefined); closeSelection(); passage.current?.focus(); }} />}
  </VStack>;
}

export default function ChatPage() {
  const [state, setState] = useState<State>();
  const [tree, setTree] = useState<Tree>();
  const [previews, setPreviews] = useState<Record<string, Preview>>({});
  const [name, setName] = useState('');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [models, setModels] = useState<Model[]>();
  const [modelError, setModelError] = useState('');
  const [savingModel, setSavingModel] = useState<string>();
  const [mobileNav, setMobileNav] = useState(false);
  const [help, setHelp] = useState(false);
  const [root, setRoot] = useState<string>();
  const [overview, setOverview] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [folds, setFolds] = useState<{ root: string; ids: string[] }>();
  const [transitionBox, setTransitionBox] = useState<string>();
  const overviewOrigin = useRef<{ id: string; control: string }>(undefined);
  const [reveal, setReveal] = useState<{ tree: string; source: Source }>();
  const [branch, setBranch] = useState<{ parent: string; anchor: Anchor; question: string }>();
  const [branching, setBranching] = useState(false);
  const [selectingMessage, setSelectingMessage] = useState<string>();
  const branchOrigin = useRef<HTMLElement | null>(null);
  const composer = useRef<ChatComposerInputHandle>(null);
  const focusComposer = useRef(false);
  const startButton = useRef<HTMLButtonElement>(null);
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
  // Map stays mounted while hidden, so its pan and zoom are intact when it returns.
  function toggleExpanded() {
    const panel = document.querySelector<HTMLElement>('.focused-chat');
    if (!document.startViewTransition || !panel || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setExpanded(e => !e); return; }
    panel.style.viewTransitionName = 'chat-panel';
    document.startViewTransition(() => flushSync(() => setExpanded(e => !e))).finished.finally(() => { panel.style.viewTransitionName = ''; });
  }
  function returnToTree() {
    setExpanded(false);
    changeView(true, overviewOrigin.current?.id ?? tree?.id);
  }
  async function openConversation(id: string, source?: Source) {
    {
      const control = document.activeElement as HTMLElement | null;
      const box = control?.closest<HTMLElement>('.react-flow__node')?.dataset.id;
      overviewOrigin.current = box ? { id: box, control: control!.id || `open-${box}` } : undefined;
    }
    setReveal(source ? { tree: id, source } : undefined);
    focusComposer.current = !source;
    await select(id);
    if (selected.current === id) changeView(false, overviewOrigin.current?.id ?? id);
  }
  function openTree(id: string, trees = state?.trees ?? []) {
    overviewOrigin.current = undefined;
    const layout = trees.find(t => t.id === id)?.layout;
    const saved = layout?.selected && rootOf(layout.selected, trees) === id ? layout.selected : id;
    setRoot(id); setOverview(layout?.panel !== 'beside');
    void select(saved);
  }
  function rootOf(id: string, trees: Summary[]) {
    const seen = new Set<string>();
    for (let t = trees.find(t => t.id === id); t && !seen.has(t.id); t = trees.find(p => p.id === t!.parent)) { seen.add(t.id); if (!t.parent) return t.id; }
  }
  // One current snapshot per root: fold IDs, selected conversation and panel mode only.
  useEffect(() => {
    if (!root || !state || !tree || folds?.root !== root || rootOf(tree.id, state.trees) !== root) return;
    const layout: Layout = { folded: folds.ids, selected: tree.id, panel: overview ? 'collapsed' : 'beside' };
    if (JSON.stringify(layout) === JSON.stringify(state.trees.find(t => t.id === root)?.layout)) return;
    api(`/api/trees/${root}/layout`, layout).then(() => setState(s => s && { ...s, trees: s.trees.map(t => t.id === root ? { ...t, layout } : t) })).catch(e => setError(e.message));
  }, [root, tree?.id, overview, folds, state?.trees]);

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
  const visibleIds = (() => {
    if (!root || !state) return [];
    const ids = [root];
    for (let i = 0; i < ids.length; i++) for (const child of state.trees) if (child.parent === ids[i] && !ids.includes(child.id)) ids.push(child.id);
    return ids;
  })();
  const previewKey = JSON.stringify(visibleIds);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const ids: string[] = JSON.parse(previewKey);
        const batches = [];
        for (let i = 0; i < ids.length; i += 500) {
          const params = new URLSearchParams();
          ids.slice(i, i + 500).forEach(id => params.append('id', id));
          batches.push(api(`/api/previews?${params}`));
        }
        const results = await Promise.all(batches);
        if (!cancelled) {
          const next: Record<string, Preview> = Object.assign({}, ...results);
          for (const [id, turn] of turns.current) if (turn.user && ids.includes(id)) next[id] = { question: previewText(turn.user.text), answer: turn.reply ? previewText(turn.reply.text) : null, status: turn.reply?.status ?? null };
          setPreviews(next);
        }
      } catch (e) { if (!cancelled) setError((e as Error).message); }
    }
    void load();
    const timer = state?.active.length ? setInterval(load, 1500) : undefined;
    return () => { cancelled = true; if (timer) clearInterval(timer); };
  }, [previewKey, state?.active.join(',')]);
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
    refresh().then(data => { const first = data.trees.find(t => !t.parent); if (first) openTree(first.id, data.trees); }).catch(e => setError(e.message));
  }, []);
  async function loadModels() {
    setModelError('');
    try { setModels((await api('/api/models')).models); }
    catch (e) { setModelError((e as Error).message); }
  }
  useEffect(() => { if (state?.auth.connected) void loadModels(); }, [state?.auth.connected]);
  async function changeModel(model: string) {
    if (!tree || savingModel) return;
    const id = tree.id;
    setSavingModel(id); setError('');
    try {
      const saved = await api(`/api/trees/${id}/model`, { model });
      ++checkpoints.current;
      setTree(t => t?.id === id ? { ...t, model: saved.model } : t);
    } catch (e) { if (selected.current === id) setError((e as Error).message); }
    finally { setSavingModel(undefined); }
  }
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
      setRoot(next.id); setOverview(true);
      await select(next.id);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  async function signIn() {
    try { const result = await api('/api/auth', {}); window.location.assign(result.url); }
    catch (e) { setError((e as Error).message); }
  }
  async function send(text: string, target = tree) {
    if (!target || !text.trim() || savingModel === target.id || state?.active.includes(target.id) || turns.current.has(target.id)) return;
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
            if (turn.user) setPreviews(p => ({ ...p, [id]: { question: previewText(turn.user!.text), answer: turn.reply ? previewText(turn.reply.text) : null, status: turn.reply?.status ?? null } }));
          }
        }
        if (result.done) break;
      }
    } catch (e) {
      // The composer clears itself on submit; give back a question the server never saved.
      if (!turn.user) setDrafts(d => ({ ...d, [id]: d[id] || text }));
      if (selected.current === id) setError((e as Error).message);
    }
    finally {
      const version = request.current;
      try {
        const saved = await api(`/api/trees/${id}`);
        if (selected.current === id && request.current === version) { ++checkpoints.current; setTree(saved); }
      } catch { if (selected.current === id) setError('Connection lost. Reload to recover saved messages.'); }
      finally {
        turns.current.delete(id);
        await refresh().catch(() => { if (selected.current === id) setError('Connection lost. Reload to recover saved messages.'); });
      }
    }
  }
  async function submitBranch(e: React.FormEvent) {
    e.preventDefault();
    if (!branch || branching || savingModel === branch.parent || !branch.question.trim()) return;
    setBranching(true); setError('');
    try {
      const next: Tree = await api(`/api/trees/${branch.parent}/branches`, { ...branch.anchor, question: branch.question });
      setDrafts(d => ({ ...d, [next.id]: branch.question }));
      overviewOrigin.current = undefined;
      setBranch(undefined);
      await refresh();
      if (selected.current === branch.parent) { focusComposer.current = true; setOverview(false); await select(next.id); }
      await send(branch.question, next);
    } catch (e) { if (selected.current === branch.parent) setError((e as Error).message); }
    finally { setBranching(false); }
  }
  const source = !overview && reveal?.tree === tree?.id ? reveal?.source : undefined;
  const validSource = source && tree?.messages.some(m => m.id === source.messageId && m.role === 'assistant' && m.status === 'completed' && source.start >= 0 && source.end > source.start && m.text.slice(source.start, source.end) === source.text);
  const active = !!tree && !!state?.active.includes(tree.id);
  // A root joins the map only once its first question is saved; until then the map is empty.
  const starter = !!root && !!state && !state.trees.find(t => t.id === root)?.started && !previews[root]?.question;
  useEffect(() => { if (starter && overview) startButton.current?.focus(); }, [starter, overview, root]);
  const menu = (actions?: MapActions) => <DropdownMenu presentation="popover" renderTrigger={props => <IconButton {...props} label="Map menu" tooltip="Map menu" icon={<EllipsisHorizontalIcon />} variant="ghost" size="sm" />} items={[
    { label: 'Learning trees', onClick: () => { setHelp(false); setMobileNav(true); } },
    { label: 'Settings', onClick: () => { setHelp(false); setMobileNav(true); } },
    { label: 'Expand all', isDisabled: !actions, onClick: actions?.expand },
    { label: 'Collapse all', isDisabled: !actions, onClick: actions?.collapse },
    { label: 'Keep current branch', isDisabled: !actions?.canKeep, onClick: actions?.keep },
    { label: 'Help', onClick: () => { setMobileNav(true); setHelp(true); } },
  ]} />;
  return <VStack gap={0} style={{ height: '100dvh' }}>
    <HStack gap={0} style={{ flex: 1, minHeight: 0 }} className="workspace">
      <aside id="tree-navigation" aria-label="Learning trees" className="trees" data-open={mobileNav}><VStack padding={5} gap={5}>
        <HStack vAlign="center" gap={2}><Heading level={2}>Your trees</Heading><Button label="Close learning trees" variant="ghost" onClick={() => { setMobileNav(false); document.querySelector<HTMLButtonElement>('[aria-label="Map menu"]:not([aria-hidden])')?.focus(); }} /></HStack>
        {help && <VStack gap={2}><Heading level={2}>Map help</Heading><Text>Focus the map and use arrow keys to pan. Focus a conversation and use arrows to move it; hold Shift to move farther.</Text><Button label="Close help" variant="ghost" onClick={() => setHelp(false)} /></VStack>}
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
        <section className="tree-workspace" data-expanded={expanded && !overview}>
        {root && state && <section className="overview" data-chat-open={!overview} aria-label="Learning tree">
          {starter ? <VStack padding={6} gap={3} hAlign="start">
            {overview && menu()}
            <Heading level={2}>Empty map</Heading>
            <Text color="secondary">Your first question becomes the first conversation on this map.</Text>
            {overview && <Button ref={startButton} label="Start conversation" variant="primary" onClick={() => { focusComposer.current = true; changeView(false); }} />}
          </VStack> : <>
          {overview && tree && <HStack padding={2}><Button label="Reopen chat" variant="ghost" onClick={() => { focusComposer.current = true; changeView(false, tree.id); }} /></HStack>}
          <TreeOverview menu={menu} key={root} root={root} trees={state.trees} previews={previews} active={state.active} open={openConversation} save={savePosition} focus={overview ? overviewOrigin.current?.id : undefined} focusControl={overviewOrigin.current?.control} transition={overview ? transitionBox : undefined} selected={overview ? undefined : tree?.id} current={tree?.id} initialFolded={state.trees.find(t => t.id === root)?.layout?.folded} onFold={ids => setFolds({ root, ids })} />
          </>}
        </section>}
        <section className="focused-chat" style={{ display: overview && root ? 'none' : 'flex' }} onKeyDown={e => { if (e.key === 'Escape' && !branch) { e.preventDefault(); returnToTree(); } }}>
        <HStack padding={2}>{menu()}{tree && <DropdownMenu presentation="popover" renderTrigger={props => <Button {...props} label="Select tutor passage" variant="ghost" isDisabled={!tree.messages.some(m => m.role === 'assistant' && m.status === 'completed')} />} items={tree.messages.filter(m => m.role === 'assistant' && m.status === 'completed').map((m, i) => ({ label: `Tutor reply ${i + 1}: ${m.text.slice(0, 60)}`, onClick: () => setSelectingMessage(m.id) }))} />}</HStack>
        {tree ? <>
          <header><VStack padding={5} gap={1}><HStack gap={1} wrap="wrap"><Button label="Return to tree" variant="ghost" onClick={returnToTree} /><Button className="expand-chat" label={expanded ? 'Show map beside chat' : 'Expand chat'} variant="ghost" onClick={toggleExpanded} /></HStack><Heading level={2} style={{ viewTransitionName: !overview && transitionBox ? 'conversation' : undefined }}>{tree.title}</Heading><Text type="supporting" color="secondary">Codex · saved automatically</Text>{tree.branch && <Button label="Return to parent conversation" variant="ghost" onClick={() => openConversation(tree.branch!.parent)} />}</VStack></header>
          <VStack padding={4} gap={2}>
            <HStack vAlign="center" gap={2}>
              <DropdownMenu presentation="popover" renderTrigger={props => <IconButton {...props} label="Model for next reply" tooltip="Model for next reply" icon={<AdjustmentsHorizontalIcon />} variant="ghost" size="sm" isDisabled={active || !!savingModel || !models?.length} isLoading={savingModel === tree.id} />}>
                <DropdownMenuRadioGroup label="Model for next reply" value={tree.model ?? undefined} onChange={model => void changeModel(model)}>
                  {tree.model && !models?.some(m => m.model === tree.model) && <DropdownMenuRadioItem value={tree.model} label={`${tree.model} (saved)`} isDisabled />}
                  {(models ?? []).map(m => <DropdownMenuRadioItem key={m.model} value={m.model} label={m.label} />)}
                </DropdownMenuRadioGroup>
              </DropdownMenu>
              <Text type="supporting">Model for next reply: {models?.find(m => m.model === tree.model)?.label ?? tree.model ?? 'Provider default'}</Text>
            </HStack>
            {(active || savingModel || !models?.length) && <Text type="supporting" color="secondary">{active ? 'Wait for this reply to finish or stop it before changing models.' : savingModel ? 'Saving model selection.' : 'Connect ChatGPT and load its model catalog.'}</Text>}
            {modelError && <Text role="alert">{modelError}</Text>}
            {(modelError || (models && !models.length)) && <Button label="Retry loading models" variant="ghost" onClick={() => void loadModels()} />}
          </VStack>
          {source && !validSource && <Text role="alert">Saved source passage is unavailable. No replacement passage was selected.</Text>}
          <ChatLayout density="balanced" composer={<ChatComposer elevation="none" value={drafts[tree.id] ?? ''} onChange={value => setDrafts(d => ({ ...d, [tree.id]: value }))} onSubmit={text => void send(text)} isStopShown={active} onStop={() => { void api(`/api/trees/${tree.id}/stop`, {}).catch(e => setError(e.message)); }} input={<ChatComposerInput handleRef={composer} label="Your question" value={drafts[tree.id] ?? ''} onChange={value => setDrafts(d => ({ ...d, [tree.id]: value }))} isDisabled={active} placeholder="What would you like to understand?" />} footerActions={<Text type="supporting" color="secondary">Enter to send · Shift+Enter for a new line</Text>} />}>
            <ChatMessageList>
              {branch?.parent === tree.id && <form onSubmit={submitBranch} onKeyDown={e => { if (e.key === 'Escape' && !branching) { e.preventDefault(); e.stopPropagation(); setBranch(undefined); requestAnimationFrame(() => branchOrigin.current?.focus()); } }}><VStack padding={4} gap={3}>
                <Heading level={3}>Follow this passage</Heading>
                <Text style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{branch.anchor.text}</Text>
                <TextArea label="Question about this passage" value={branch.question} onChange={question => setBranch(b => b && { ...b, question })} isDisabled={branching} hasAutoFocus />
                <HStack gap={2} wrap="wrap"><Button label={branching ? 'Preparing context…' : 'Create focused chat'} type="submit" isDisabled={branching || !branch.question.trim() || active} /><Button label="Cancel branch" variant="ghost" isDisabled={branching} onClick={() => { setBranch(undefined); requestAnimationFrame(() => branchOrigin.current?.focus()); }} /></HStack>
                <Text type="supporting" color="secondary">Creates a saved chat with fixed context from this conversation.</Text>
              </VStack></form>}
              {!tree.messages.length && <VStack gap={3} padding={6}><Heading level={3}>What are you curious about?</Heading><Text color="secondary">Ask about a concept, work through an example, or pick up a question you have been carrying.</Text></VStack>}
              {tree.messages.map(message => <ChatMessage key={message.id} sender={message.role === 'user' ? 'user' : 'assistant'}>
                <Text type="label" weight="semibold">{message.role === 'user' ? 'You' : 'Tutor'}</Text>
                {message.role === 'assistant' && message.status === 'completed' ? <Passage message={message} reveal={validSource && source?.messageId === message.id ? source : undefined} formOpen={branch?.anchor.messageId === message.id} selecting={selectingMessage === message.id} closeSelection={() => setSelectingMessage(undefined)} onBranch={(anchor, origin) => { branchOrigin.current = origin; setBranch({ parent: tree.id, anchor, question: '' }); setError(''); }} /> : <ChatMessageBubble variant="ghost"><Text style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{message.text || (message.status === 'streaming' ? 'Thinking…' : 'No reply received.')}</Text></ChatMessageBubble>}
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
