import { memo, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { flushSync } from 'react-dom';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Text, Heading } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { IconButton } from '@astryxdesign/core/IconButton';
import { DropdownMenu, DropdownMenuGroup, DropdownMenuItem, DropdownMenuRadioGroup, DropdownMenuRadioItem } from '@astryxdesign/core/DropdownMenu';
import { AdjustmentsHorizontalIcon, Cog6ToothIcon, EllipsisHorizontalIcon, XMarkIcon, ArrowsPointingOutIcon, ArrowsPointingInIcon, ArrowUturnLeftIcon, ChatBubbleLeftRightIcon, ChatBubbleBottomCenterTextIcon, PlusIcon } from '@heroicons/react/24/outline';
import { TextArea } from '@astryxdesign/core/TextArea';
import { TextInput } from '@astryxdesign/core/TextInput';
import { AlertDialog } from '@astryxdesign/core/AlertDialog';
import { Tab, TabList } from '@astryxdesign/core/TabList';
import { ChatComposer, ChatComposerInput, ChatLayout, ChatMessage, ChatMessageBubble, ChatMessageList, type ChatComposerInputHandle } from '@astryxdesign/core/Chat';
import TreeOverview, { type Summary, type Source, type Preview, type MapActions, type Layout } from './TreeOverview';
import { replyUsageLine, underlineRanges, usageLine, withTurn, type Message, type Suggestions, type Turn, type Usage } from './turn';
import { layoutSaver, type Batch } from './layoutSave';
import type { Point, Viewport } from './canvas';
import DiagramCard from './DiagramCard';
import VideoCard from './VideoCard';
import SettingsWindow, { type SettingsRequest, type SettingsTab } from './SettingsWindow';
import { bubbleTints, type BubbleTint } from './bubbleTint';
import KnowledgePage, { type Graph } from './KnowledgePage';
import { artifactsAt, mergeArtifact, type Artifact } from './artifacts';
import { renderMarkdown, rawOffsets } from './markdown';
import { previewText } from './markdownText';
import { ensureHighlightStyles } from '@astryxdesign/core/CodeBlock';

type Anchor = { messageId: string; start: number; end: number; text: string; at?: Point; suggestion?: boolean };
type Branch = Anchor & { parent: string; question: string; snapshot: string };
type Tree = { id: string; title: string; provider: string; model: string | null; messages: Message[]; branch: Branch | null; artifacts: Artifact[]; suggestions?: Suggestions[] };
type Model = { provider: string; model: string; label: string; isDefault: boolean };
type Providers = Record<string, { label: string; connected: boolean }>;
type State = { csrf: string; auth: { connected: boolean; email: string | null }; trees: Summary[]; active: string[]; videos: string[]; suggesting?: string[]; usage?: Usage & { replies: number }; conceptNameTokens?: number };
// The in-flight question and streaming reply become the last rows of the node, cut like saved rows.
const withLiveTurn = (preview: Preview = [], turn?: Turn): Preview => withTurn({ messages: preview }, turn && { user: turn.user && { ...turn.user, text: previewText(turn.user.text, 'user') }, reply: turn.reply && { ...turn.reply, text: previewText(turn.reply.text, 'assistant'), ...(turn.artifacts && { artifacts: turn.artifacts.filter(a => a.message === turn.reply!.id).map(({ id, kind, title, status }) => ({ id, kind, title, status })) }) } }).messages;

function TitleEditor({ title, save, cancel }: { title: string; save: (title: string) => Promise<void>; cancel: () => void }) {
  const [value, setValue] = useState(title), [saving, setSaving] = useState(false), [error, setError] = useState('');
  const valid = !!value.trim() && value.trim().length <= 200;
  function submit() { if (!valid || saving) return; setSaving(true); void save(value.trim()).catch(e => { setError(e.message); setSaving(false); }); }
  return <VStack gap={2} onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (!saving) cancel(); } }}>
    <TextInput label="Conversation title" value={value} onChange={setValue} size="sm" hasAutoFocus isDisabled={saving} description="Up to 200 characters." onEnter={submit} status={value.trim().length > 200 ? { type: 'error', message: 'Use 200 characters or fewer.' } : undefined} />
    {error && <Text role="alert">{error}</Text>}
    <HStack gap={1} wrap="wrap"><Button label={saving ? 'Saving…' : 'Save title'} size="sm" isDisabled={saving || !valid} onClick={submit} /><Button label="Cancel rename" variant="ghost" size="sm" isDisabled={saving} onClick={cancel} /></HStack>
  </VStack>;
}

function PassageCorrection({ name, api, disabled }: { name: string; api: (path: string, body?: unknown) => Promise<Graph>; disabled: boolean }) {
  const [correction, setCorrection] = useState<'known' | 'unknown' | null>(null);
  const [saving, setSaving] = useState<'known' | 'unknown'>();
  const [error, setError] = useState(''), [status, setStatus] = useState('');
  const version = useRef(0);
  useEffect(() => {
    const current = ++version.current;
    void api('/api/graph').then(graph => { if (current === version.current) setCorrection(graph.concepts.find(c => c.name.toLowerCase() === name.toLowerCase())?.correction ?? null); }).catch(e => { if (current === version.current) setError(e.message); });
    return () => { version.current++; };
  }, [name]);
  async function correct(kind: 'known' | 'unknown') {
    if (saving || disabled) return;
    version.current++; setSaving(kind); setError(''); setStatus('');
    try {
      await api('/api/graph/correct', { name, kind });
      setCorrection(kind); setStatus(`${name}: ${kind === 'known' ? 'marked as known' : 'marked as not understood'}. Your correction overrides the estimate.`);
    } catch (e) { setError((e as Error).message); }
    finally { setSaving(undefined); }
  }
  return <VStack gap={1}>
    <Text type="supporting" color="secondary">{name}</Text>
    <HStack gap={2} wrap="wrap" role="group" aria-label={`Corrections for ${name}`}>
      <Button label="I know this" size="sm" variant={correction === 'known' ? 'secondary' : 'ghost'} aria-pressed={correction === 'known'} isLoading={saving === 'known'} isDisabled={disabled || saving === 'unknown'} onClick={() => void correct('known')} />
      <Button label="I don't get this" size="sm" variant={correction === 'unknown' ? 'secondary' : 'ghost'} aria-pressed={correction === 'unknown'} isLoading={saving === 'unknown'} isDisabled={disabled || saving === 'known'} onClick={() => void correct('unknown')} />
    </HStack>
    <Text type="supporting" role="status">{status}</Text>
    {error && <Text type="supporting" role="alert">{error}</Text>}
  </VStack>;
}

// Parsing is memoised so streaming chunks and selection state changes reuse the rendered tree.
const Reply = memo(function Reply({ text, reveal, underlines }: { text: string; reveal?: Source; underlines: { start: number; end: number; child?: string }[] }) {
  useEffect(ensureHighlightStyles, []);
  const key = JSON.stringify(underlines);
  return <Text as="div" type="body" className="reply-md">{useMemo(() => renderMarkdown(text, reveal, underlines), [text, reveal?.start, reveal?.end, key])}</Text>;
});

function Passage({ message, index, onBranch, onOpenChild, reveal, selecting, openSelection, closeSelection, form, suggestions }: { message: Message; index: number; suggestions?: Suggestions; onBranch: (anchor: Anchor, origin: React.RefObject<HTMLElement | null>) => void; onOpenChild: (id: string) => void; reveal?: Source; selecting: boolean; openSelection: () => void; closeSelection: () => void; form?: { node: React.ReactNode; at?: Point } }) {
  const formOpen = !!form;
  const highlighted = useRef(false);
  const [anchor, setAnchor] = useState<Anchor & { at?: Point }>();
  const wrapper = useRef<HTMLElement>(null);
  const passage = useRef<HTMLElement>(null);
  const action = useRef<HTMLButtonElement>(null);
  const completed = message.status === 'completed';
  const underlines = useMemo(() => completed ? underlineRanges(message.text, suggestions) : [], [completed, message.text, suggestions]);
  useEffect(() => {
    const highlight = reveal && passage.current?.querySelector<HTMLElement>('mark, [data-reveal]');
    highlight?.scrollIntoView({ block: 'center' });
    highlight?.focus?.({ preventScroll: true });
  }, [reveal]);
  function capture(start: number, end: number, at?: Point) {
    setAnchor(end > start ? { messageId: message.id, start, end, text: message.text.slice(start, end), at } : undefined);
  }
  function captureSelection(e: React.MouseEvent | React.KeyboardEvent) {
      highlighted.current = false;
      if (!completed) return;
      const selection = window.getSelection();
      if (!selection?.rangeCount || selection.isCollapsed) { setAnchor(undefined); return; }
      const range = selection.getRangeAt(0), root = passage.current;
      if (!root?.contains(range.startContainer) || !root.contains(range.endContainer)) { setAnchor(undefined); return; }
      const span = rawOffsets(root, range);
      if (!span) { setAnchor(undefined); return; }
      // Float the action just under the end of the selection, inside this reply.
      const rects = range.getClientRects(), last = rects[rects.length - 1], box = wrapper.current!.getBoundingClientRect();
      // A pointer highlight opens the passage textbox above it and wins over any underline it covers; keyboard selection keeps the Ask button.
      if (e.type === 'mouseup' && span.end > span.start) {
        highlighted.current = true; setAnchor(undefined);
        onBranch({ messageId: message.id, start: span.start, end: span.end, text: message.text.slice(span.start, span.end), at: { x: 0, y: rects[0].top - box.top } }, passage);
        return;
      }
      capture(span.start, span.end, last && { x: Math.min(last.right - box.left, box.width), y: last.bottom - box.top });
  }
  // An unexplored underline opens the passage textbox; an explored one opens its existing child.
  function activate(target: EventTarget) {
    const piece = (target as Element).closest?.('u.suggestion') as HTMLElement | null;
    const u = piece && underlines.find(u => +piece.dataset.o! >= u.start && +piece.dataset.o! < u.end);
    if (!u || !completed) return false;
    if (u.child) { onOpenChild(u.child); return true; }
    const stop = [...passage.current!.querySelectorAll<HTMLElement>('u.suggestion[tabindex]')].find(e => +e.dataset.o! >= u.start && +e.dataset.o! < u.end) ?? piece;
    setAnchor(undefined);
    onBranch({ messageId: message.id, start: u.start, end: u.end, text: message.text.slice(u.start, u.end), suggestion: true, at: { x: 0, y: stop.getBoundingClientRect().top - wrapper.current!.getBoundingClientRect().top } }, { current: stop });
    return true;
  }
  useEffect(() => {
    function dismiss(e: PointerEvent) { if (!passage.current?.contains(e.target as Node) && !action.current?.contains(e.target as Node) && !selecting && !formOpen) setAnchor(undefined); }
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [selecting, formOpen]);
  const ask = anchor && !formOpen && <Button ref={action} label="Ask about selection" variant="primary" size="sm" elevation="med" icon={<ChatBubbleBottomCenterTextIcon />} onClick={() => onBranch({ ...anchor, at: undefined }, action)} />;
  return <VStack ref={wrapper} gap={2} className="passage" onKeyDown={e => { if (e.key === 'Escape' && (anchor || selecting)) { e.preventDefault(); e.stopPropagation(); setAnchor(undefined); closeSelection(); passage.current?.focus(); } }}>
    <section ref={passage} tabIndex={-1} onMouseUp={captureSelection} onKeyUp={captureSelection} onClick={e => { if (!highlighted.current) activate(e.target); }} onKeyDown={e => { if ((e.key === 'Enter' || e.key === ' ') && activate(e.target)) e.preventDefault(); }}><ChatMessageBubble variant="ghost"><Reply text={message.text || (message.status === 'streaming' ? 'Thinking…' : 'No reply received.')} reveal={reveal} underlines={underlines} /></ChatMessageBubble></section>
    {/* Mounted before suggestions arrive so their arrival is announced once; reopened replies are not re-announced. */}
    <Text role="status" className="sr-only">{underlines.length ? `${underlines.length} suggested ${underlines.length === 1 ? 'passage' : 'passages'} in tutor reply ${index}` : ''}</Text>
    {completed && !selecting && <Button className="focus-reveal" label={`Select passage in tutor reply ${index}`} variant="ghost" size="sm" onClick={openSelection} />}
    {selecting && <><TextArea label="Select tutor passage" description="Hold Shift and use arrow keys to select. Tab to Ask about selection." value={message.text} isReadOnly rows={4} hasAutoFocus onSelect={e => { const input = e.target as HTMLTextAreaElement; capture(input.selectionStart, input.selectionEnd); }} /></>}
    {ask && (anchor.at ? <HStack className="selection-action" style={{ left: anchor.at.x, top: anchor.at.y }}>{ask}</HStack> : ask)}
    {form && (form.at ? <VStack className="passage-box" style={{ top: form.at.y }}>{form.node}</VStack> : form.node)}
    {selecting && <Button label="Close passage selection" variant="ghost" size="sm" onClick={() => { setAnchor(undefined); closeSelection(); passage.current?.focus(); }} />}
  </VStack>;
}

export default function ChatPage() {
  const [state, setState] = useState<State>();
  const [tree, setTree] = useState<Tree>();
  const [previews, setPreviews] = useState<Record<string, Preview>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [models, setModels] = useState<Model[]>();
  const [providers, setProviders] = useState<Providers>();
  const [modelError, setModelError] = useState('');
  const [savingModel, setSavingModel] = useState<string>();
  const [modelMenuOpen, setModelMenuOpen] = useState(false), [openingModels, setOpeningModels] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [tab, setTab] = useState('learning');
  const [settings, setSettings] = useState<SettingsRequest>();
  const settingsOpener = useRef<HTMLElement | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; place: 'header' | 'sidebar' }>();
  const [deletion, setDeletion] = useState<{ id: string; root: string; title: string; count: number; parent: string | null }>();
  const [deleting, setDeleting] = useState(false), [deleteError, setDeleteError] = useState('');
  const deleteOrigin = useRef<HTMLElement | null>(null);
  const removed = useRef(new Set<string>());
  const renamed = useRef(new Map<string, string>());
  const streams = useRef(new Map<string, AbortController>());
  // Only this boolean is stored, per browser and app origin; unreadable storage means off.
  const [vim, setVim] = useState(() => { try { return localStorage.getItem('treetutor.vim') === 'on'; } catch { return false; } });
  const [bubbleTint, setBubbleTint] = useState<BubbleTint>(() => {
    try { const saved = localStorage.getItem('treetutor.bubble-tint'); return bubbleTints.find(t => t.id === saved)?.id ?? 'accent'; }
    catch { return 'accent'; }
  });
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
  // The ask button remounts after the branch form closes, so keep its ref, not the element.
  const branchOrigin = useRef<React.RefObject<HTMLElement | null>>(undefined);
  const composer = useRef<ChatComposerInputHandle>(null);
  const focusComposer = useRef(false);
  const selected = useRef<string | undefined>(undefined);
  const request = useRef(0);
  const modelRequest = useRef(0);
  const turns = useRef(new Map<string, Turn>());
  const checkpoints = useRef(0);
  const [layoutFailed, setLayoutFailed] = useState(false);
  const saver = useRef<ReturnType<typeof layoutSaver<Layout>>>(undefined);
  const writeLayout = useRef<(root: string, batch: Batch<Layout>) => Promise<unknown>>(undefined);
  writeLayout.current = (id, batch) => api(`/api/trees/${id}/layout`, { ...batch.layout, positions: batch.positions });
  useEffect(() => {
    const s = layoutSaver<Layout>((id, batch) => writeLayout.current!(id, batch), setLayoutFailed);
    saver.current = s;
    return s.dispose;
  }, []);

  function changeView(showOverview: boolean, id?: string) {
    // Snapshotting thousands of preview rows stalls large maps; their viewport still animates.
    if (visibleIds.length > 50 || !document.startViewTransition || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
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
    // Chats reached by branching have no map origin; return focus to their own box.
    if (!overviewOrigin.current && tree) overviewOrigin.current = { id: tree.id, control: `open-${tree.id}` };
    changeView(true, overviewOrigin.current?.id);
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
    setRoot(id); setOverview(layout?.panel !== 'beside' && layout?.panel !== 'expanded'); setExpanded(layout?.panel === 'expanded');
    void select(saved);
  }
  function rootOf(id: string, trees: Summary[]) {
    const seen = new Set<string>();
    for (let t = trees.find(t => t.id === id); t && !seen.has(t.id); t = trees.find(p => p.id === t!.parent)) { seen.add(t.id); if (!t.parent) return t.id; }
  }
  // Trees show unsaved layout immediately; the saver writes it in one batch per minute.
  function withUnsaved(trees: Summary[]) {
    const dirty = saver.current?.pending() ?? new Map<string, Batch<Layout>>();
    const moved: Record<string, Point> = Object.assign({}, ...[...dirty.values()].map(b => b.positions));
    return trees.map(t => dirty.has(t.id) || moved[t.id] ? { ...t, ...(dirty.has(t.id) && { layout: dirty.get(t.id)!.layout }), ...moved[t.id] } : t);
  }
  function markLayout(id: string, layout: Layout, positions?: Record<string, Point>) {
    saver.current?.mark(id, layout, positions);
    setState(s => s && { ...s, trees: withUnsaved(s.trees) });
  }
  const layoutOf = (id: string): Layout => saver.current?.pending().get(id)?.layout ?? state?.trees.find(t => t.id === id)?.layout ?? { folded: [], selected: null, panel: overview ? 'collapsed' : 'beside' };
  // One current snapshot per root: fold IDs, selected conversation, panel mode and viewport.
  useEffect(() => {
    if (!root || !state || !tree || folds?.root !== root || rootOf(tree.id, state.trees) !== root) return;
    const current = state.trees.find(t => t.id === root)?.layout;
    const layout: Layout = { folded: folds.ids, selected: tree.id, panel: overview ? 'collapsed' : expanded ? 'expanded' : 'beside', ...(current?.viewport && { viewport: current.viewport }) };
    if (JSON.stringify(layout) !== JSON.stringify(current)) markLayout(root, layout);
  }, [root, tree?.id, overview, expanded, folds, state?.trees]);

  async function api(path: string, body?: unknown) {
    const response = await fetch(path, body === undefined ? undefined : { method: 'POST', headers: {
      'Content-Type': 'application/json', 'X-TreeTutor-CSRF': state?.csrf ?? '' }, body: JSON.stringify(body) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? 'Request failed. Reload and try again.');
    return data;
  }
  function savePositions(positions: Record<string, Point>) { if (root) markLayout(root, layoutOf(root), positions); }
  function saveViewport(viewport: Viewport) {
    const layout = root ? layoutOf(root) : undefined;
    if (layout && JSON.stringify(layout.viewport) !== JSON.stringify(viewport)) markLayout(root!, { ...layout, viewport: { x: viewport.x, y: viewport.y, zoom: viewport.zoom } });
  }
  async function refresh() {
    const data: State = await api('/api/state');
    setState(previous => {
      const known = new Map(previous?.trees.map(t => [t.id, t]));
      const trees = withUnsaved(data.trees.filter(t => !removed.current.has(t.id))).map(t => {
        if (renamed.current.has(t.id)) t = { ...t, title: renamed.current.get(t.id)! };
        const old = known.get(t.id);
        // A status poll must not replace every unchanged node's data during a stream.
        return old && (Object.keys(t) as (keyof Summary)[]).every(key => key === 'layout' ? JSON.stringify(t.layout) === JSON.stringify(old.layout) : t[key] === old[key]) ? old : t;
      });
      return { ...data, trees, active: [...new Set([...data.active, ...turns.current.keys()])].filter(id => !removed.current.has(id)), videos: data.videos.filter(id => !removed.current.has(id)) };
    });
    return data;
  }
  const visibleIds = (() => {
    if (!root || !state) return [];
    const ids = [root];
    for (let i = 0; i < ids.length; i++) for (const child of state.trees) if (child.parent === ids[i] && !ids.includes(child.id)) ids.push(child.id);
    return ids;
  })();
  const previewKey = JSON.stringify(visibleIds);
  // Running video jobs and suggestion calls poll like replies until they settle.
  const activeKey = [...(state?.active ?? []), ...(state?.videos ?? []), ...(state?.suggesting ?? [])].join(',');
  useEffect(() => {
    let cancelled = false;
    async function load(ids: string[]) {
      try {
        const batches = [];
        for (let i = 0; i < ids.length; i += 500) {
          const params = new URLSearchParams();
          ids.slice(i, i + 500).forEach(id => params.append('id', id));
          batches.push(api(`/api/previews?${params}`));
        }
        const results: Record<string, Preview>[] = await Promise.all(batches);
        if (!cancelled) {
          const next: Record<string, Preview> = Object.assign({}, ...results);
          for (const id of ids) if (turns.current.has(id)) next[id] = withLiveTurn(next[id], turns.current.get(id));
          setPreviews(p => ({ ...p, ...next }));
        }
      } catch (e) { if (!cancelled) setError((e as Error).message); }
    }
    const visible: string[] = JSON.parse(previewKey);
    void load(visible);
    // While replies run, refetch only the conversations that are replying.
    const replying = visible.filter(id => activeKey.split(',').includes(id));
    const timer = replying.length ? setInterval(() => load(replying), 1500) : undefined;
    return () => { cancelled = true; if (timer) clearInterval(timer); };
  }, [previewKey, activeKey]);
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
    const version = ++modelRequest.current;
    setModelError('');
    try { const data = await api('/api/models'); if (version === modelRequest.current) { setModels(data.models); setProviders(data.providers); } }
    catch (e) { if (version === modelRequest.current) { setModelError((e as Error).message); setProviders(undefined); } }
  }
  useEffect(() => { if (state) void loadModels(); }, [!!state, state?.auth.connected]);
  async function openModels(open: boolean) {
    if (!open) { setModelMenuOpen(false); return; }
    if (openingModels) return;
    const id = selected.current;
    setOpeningModels(true);
    await loadModels();
    setOpeningModels(false);
    if (selected.current === id) setModelMenuOpen(true);
  }
  async function changeModel(provider: string, model: string) {
    if (!tree || savingModel) return;
    const id = tree.id;
    setSavingModel(id); setError('');
    try {
      const saved = await api(`/api/trees/${id}/model`, { provider, model });
      ++checkpoints.current;
      setTree(t => t?.id === id ? { ...t, provider: saved.provider, model: saved.model } : t);
    } catch (e) { if (selected.current === id) setError((e as Error).message); }
    finally { setSavingModel(undefined); }
  }
  useEffect(() => {
    if (!overview && tree && focusComposer.current) { composer.current?.focus(); focusComposer.current = false; }
  }, [tree?.id, overview]);
  // Reopening a page during a turn recovers saved checkpoints without tying work to focus.
  useEffect(() => {
    if (!activeKey) return;
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
  }, [activeKey]);

  // Cancel and Retry update only their own card; refreshing state resumes polling for a retried job.
  async function videoAction(id: string, artifactId: string, action: 'cancel' | 'retry') {
    setError('');
    try {
      const next: Artifact = await api(`/api/trees/${id}/artifacts/${artifactId}/${action}`, {});
      setTree(t => t?.id === id ? { ...t, artifacts: t.artifacts.map(a => a.id === next.id ? next : a) } : t);
      await refresh();
    } catch (e) { setError((e as Error).message); }
  }
  // The server reopens an existing unstarted chat rather than creating a second one.
  async function create() {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const next: Tree = await api('/api/trees', {});
      await refresh();
      overviewOrigin.current = undefined; focusComposer.current = true;
      setRoot(next.id); setOverview(false); setExpanded(false); setMobileNav(false);
      await select(next.id);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  async function signIn() {
    const result = await api('/api/auth', {}); window.location.assign(result.url);
  }
  function finishRename() {
    const target = renaming;
    setRenaming(undefined);
    requestAnimationFrame(() => document.getElementById(target?.place === 'sidebar' ? `chat-actions-${target.id}` : 'rename-conversation')?.focus());
  }
  async function rename(id: string, title: string) {
    const saved = await api(`/api/trees/${id}/rename`, { title });
    renamed.current.set(id, saved.title);
    ++checkpoints.current;
    setTree(t => t?.id === id ? { ...t, title: saved.title } : t);
    setState(s => s && { ...s, trees: s.trees.map(t => t.id === id ? { ...t, title: saved.title } : t) });
    finishRename();
  }
  function askDelete(id: string, origin: HTMLElement | null) {
    const target = state?.trees.find(t => t.id === id), owner = state && rootOf(id, state.trees);
    if (!target || !owner) return;
    const ids = [id];
    for (let i = 0; i < ids.length; i++) for (const t of state!.trees) if (t.parent === ids[i] && !ids.includes(t.id)) ids.push(t.id);
    deleteOrigin.current = origin;
    setDeleteError('');
    setDeletion({ id, root: owner, title: target.title, count: ids.length, parent: target.parent });
  }
  function cancelDelete() {
    if (deleting) return;
    setDeletion(undefined);
    requestAnimationFrame(() => deleteOrigin.current?.focus());
  }
  async function deleteConversation() {
    if (!deletion || deleting) return;
    setDeleting(true); setDeleteError('');
    try {
      const result: { deleted: string[]; parent: string | null } = await api(`/api/trees/${deletion.root}/delete`, { conversation: deletion.id, count: deletion.count, title: deletion.title });
      const ids = new Set(result.deleted), pending = saver.current?.pending().get(deletion.root);
      for (const id of ids) { removed.current.add(id); streams.current.get(id)?.abort(); turns.current.delete(id); renamed.current.delete(id); }
      ++checkpoints.current;
      saver.current?.discard(deletion.root);
      const cleanLayout = (layout: Layout): Layout => ({ ...layout, folded: layout.folded.filter(id => !ids.has(id)), selected: layout.selected && ids.has(layout.selected) ? result.parent : layout.selected });
      if (result.parent && pending) saver.current?.mark(deletion.root, cleanLayout(pending.layout), Object.fromEntries(Object.entries(pending.positions).filter(([id]) => !ids.has(id))));
      const trees = (state?.trees ?? []).filter(t => !ids.has(t.id)).map(t => t.id === deletion.root && t.layout ? { ...t, layout: cleanLayout(t.layout) } : t);
      setState(s => s && { ...s, trees, active: s.active.filter(id => !ids.has(id)), videos: s.videos.filter(id => !ids.has(id)) });
      setFolds(f => f && { ...f, ids: f.ids.filter(id => !ids.has(id)) });
      setDrafts(d => Object.fromEntries(Object.entries(d).filter(([id]) => !ids.has(id))));
      setPreviews(p => Object.fromEntries(Object.entries(p).filter(([id]) => !ids.has(id))));
      setRenaming(r => r && ids.has(r.id) ? undefined : r);
      setBranch(b => b && ids.has(b.parent) ? undefined : b);
      setReveal(r => r && ids.has(r.tree) ? undefined : r);
      if (selected.current && ids.has(selected.current)) setSelectingMessage(undefined);
      setError(''); setLayoutFailed(false);
      setDeletion(undefined);
      if (result.parent && root === deletion.root) {
        overviewOrigin.current = undefined; focusComposer.current = true; setOverview(false);
        await select(result.parent);
      } else if (root === deletion.root) {
        const roots = trees.filter(t => !t.parent), index = state!.trees.filter(t => !t.parent).findIndex(t => t.id === deletion.root);
        const next = roots[Math.min(index, roots.length - 1)];
        if (next) { focusComposer.current = true; openTree(next.id, trees); }
        else { ++request.current; selected.current = undefined; setTree(undefined); setRoot(undefined); setOverview(true); setExpanded(false); setLoading(false); }
        if (!next || (next.layout?.panel !== 'beside' && next.layout?.panel !== 'expanded')) requestAnimationFrame(() => document.querySelector<HTMLElement>(next ? '.map-toolbar button' : '.empty-map button')?.focus());
      } else requestAnimationFrame(() => document.querySelector<HTMLElement>(`#chat-actions-${root}`)?.focus());
      await refresh();
    } catch (e) { setDeleteError((e as Error).message); }
    finally { setDeleting(false); }
  }
  async function send(text: string, target = tree) {
    if (!target || !text.trim() || savingModel === target.id || state?.active.includes(target.id) || turns.current.has(target.id)) return;
    const id = target.id;
    const controller = new AbortController();
    streams.current.set(id, controller);
    const turn: Turn = {};
    turns.current.set(id, turn);
    ++checkpoints.current;
    setError('');
    setState(s => s && { ...s, active: [...s.active, id] });
    try {
      const response = await fetch(`/api/trees/${id}/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-TreeTutor-CSRF': state?.csrf ?? '' }, body: JSON.stringify({ text }), signal: controller.signal });
      if (removed.current.has(id)) return;
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
          if (removed.current.has(id)) continue;
          if (event.type === 'error' && selected.current === id) setError(event.error);
          if (event.type === 'saved') {
            turn.user = event.user;
            const title: string = renamed.current.get(id) ?? event.title;
            setTree(t => t?.id === id ? { ...t, title } : t);
            setState(s => s && { ...s, trees: s.trees.map(t => t.id === id ? { ...t, title } : t) });
            turn.reply = { id: event.id, role: 'assistant', text: '', status: 'streaming' };
          }
          if (turn.reply && (event.type === 'text' || event.type === 'done')) {
            turn.reply = { ...turn.reply, text: event.text ?? turn.reply.text, status: event.status ?? turn.reply.status };
          }
          if (event.type === 'artifact' && turn.reply) turn.artifacts = mergeArtifact(turn.artifacts ?? [], event.artifact, id, [turn.reply]);
          if (event.type === 'saved' || event.type === 'text' || event.type === 'done' || event.type === 'artifact') {
            setTree(t => t?.id === id ? withTurn(t, turn) : t);
            setPreviews(p => ({ ...p, [id]: withLiveTurn(p[id], turn) }));
          }
        }
        if (result.done) break;
      }
    } catch (e) {
      if (removed.current.has(id)) return;
      // The composer clears itself on submit; give back a question the server never saved.
      if (!turn.user) setDrafts(d => ({ ...d, [id]: d[id] || text }));
      if (selected.current === id) setError((e as Error).message);
    }
    finally {
      streams.current.delete(id);
      if (removed.current.has(id)) return;
      const version = request.current;
      try {
        const saved = await api(`/api/trees/${id}`);
        if (selected.current === id && request.current === version) { ++checkpoints.current; setTree(saved); }
      } catch { if (selected.current === id && !removed.current.has(id)) setError('Connection lost. Reload to recover saved messages.'); }
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
      const { at: _at, ...anchor } = branch.anchor;
      const next: Tree = await api(`/api/trees/${branch.parent}/branches`, { ...anchor, question: branch.question });
      setDrafts(d => ({ ...d, [next.id]: branch.question }));
      overviewOrigin.current = undefined;
      setBranch(undefined);
      await refresh();
      if (selected.current === branch.parent) { focusComposer.current = true; setOverview(false); await select(next.id); }
      await send(branch.question, next);
    } catch (e) { if (selected.current === branch.parent) setError((e as Error).message); }
    finally { setBranching(false); }
  }
  const providerLabel = (id: string) => providers?.[id]?.label ?? ({ claude: 'Claude', codex: 'Codex', openai: 'Custom endpoint' } as Record<string, string>)[id] ?? id;
  const modelLabel = (t: Tree) => {
    const label = models?.find(m => m.provider === t.provider && m.model === t.model)?.label ?? t.model ?? models?.find(m => m.provider === t.provider && m.isDefault)?.label ?? 'default model';
    return label.startsWith(providerLabel(t.provider)) ? label : `${providerLabel(t.provider)} · ${label}`;
  };
  const source = !overview && reveal?.tree === tree?.id ? reveal?.source : undefined;
  const validSource = source && tree?.messages.some(m => m.id === source.messageId && m.role === 'assistant' && m.status === 'completed' && source.start >= 0 && source.end > source.start && m.text.slice(source.start, source.end) === source.text);
  const active = !!tree && !!state?.active.includes(tree.id);
  const branchConcept = branch?.anchor.suggestion ? tree?.suggestions?.find(s => s.message === branch.anchor.messageId)?.passages.find(p => p.start === branch.anchor.start && p.end === branch.anchor.end)?.concept : undefined;
  function openSettings(tab?: SettingsTab, focus?: string, opener = document.activeElement as HTMLElement | null) {
    settingsOpener.current = opener; setSettings({ tab, focus });
  }
  function closeSettings() {
    setSettings(undefined);
    // Menu items that opened the window are gone by now; fall back to the menu trigger that held them.
    const opener = settingsOpener.current;
    requestAnimationFrame(() => (opener?.isConnected ? opener : document.querySelector<HTMLElement>('.map-toolbar [aria-label="Map menu"]'))?.focus());
  }
  const mapMenuTrigger = () => document.querySelector<HTMLElement>('.map-toolbar [aria-label="Map menu"]');
  const menu = (actions?: MapActions) => <DropdownMenu presentation="popover" renderTrigger={props => <IconButton {...props} label="Map menu" tooltip="Map menu" icon={<EllipsisHorizontalIcon />} variant="ghost" size="sm" />} items={[
    { label: 'Learning trees', onClick: () => setMobileNav(true) },
    { label: 'Settings', onClick: () => openSettings(undefined, undefined, mapMenuTrigger()) },
    { label: 'Expand all', isDisabled: !actions, onClick: actions?.expand },
    { label: 'Collapse all', isDisabled: !actions, onClick: actions?.collapse },
    { label: 'Keep current branch', isDisabled: !actions?.canKeep, onClick: actions?.keep },
    { label: tree?.branch ? 'Delete branch…' : 'Delete chat…', isDisabled: !tree, onClick: () => tree && askDelete(tree.id, document.querySelector<HTMLElement>('.map-toolbar [aria-label="Map menu"]')) },
    { label: 'Help', onClick: () => openSettings('interface', undefined, mapMenuTrigger()) },
  ]} />;
  return <VStack gap={0} style={{ height: '100dvh', '--question-bubble-tint': bubbleTints.find(t => t.id === bubbleTint)!.color } as CSSProperties}>
    <VStack gap={0} padding={2}><TabList value={tab} onChange={setTab} role="tablist" aria-label="Workspace" size="sm" hasDivider>
      <Tab value="learning" label="Learning" panelId="learning-panel" id="learning-tab" />
      <Tab value="knowledge" label="Knowledge" panelId="knowledge-panel" id="knowledge-tab" />
    </TabList></VStack>
    <HStack id="learning-panel" role="tabpanel" aria-labelledby="learning-tab" hidden={tab !== 'learning'} gap={0} style={{ flex: 1, minHeight: 0 }} className="workspace">
      <aside id="tree-navigation" aria-label="Learning trees" className="trees" data-open={mobileNav}><VStack padding={5} gap={5}>
        <HStack vAlign="center" gap={2} hAlign="between"><Heading level={2}>Your trees</Heading><HStack gap={1}><IconButton label="Settings" tooltip="Settings" icon={<Cog6ToothIcon />} variant="ghost" size="sm" onClick={e => openSettings(undefined, undefined, e.currentTarget)} /><IconButton label="Close learning trees" tooltip="Close" icon={<XMarkIcon />} variant="ghost" size="sm" onClick={() => { setMobileNav(false); document.querySelector<HTMLButtonElement>(overview ? '[aria-label="Map menu"]' : '[aria-label="Model for next reply"]')?.focus(); }} /></HStack></HStack>
        <Button label={busy ? 'Opening…' : 'New chat'} variant="primary" icon={<PlusIcon />} isDisabled={busy} onClick={() => void create()}>{busy ? 'Opening…' : 'New chat'}</Button>
        <nav aria-label="Saved learning trees"><VStack gap={2}>
          {state?.trees.filter(t => !t.parent).map(t => <VStack key={t.id} gap={1}>
            {renaming?.id === t.id && renaming.place === 'sidebar' ? <TitleEditor title={t.title} save={title => rename(t.id, title)} cancel={finishRename} /> : <HStack gap={1} vAlign="center">
              <Button className="saved-chat-title" label={t.title} variant={root === t.id ? 'secondary' : 'ghost'} aria-current={root === t.id ? 'page' : undefined} onClick={() => openTree(t.id)}>{t.title}</Button>
              <DropdownMenu presentation="popover" alignment="end" renderTrigger={props => <IconButton {...props} id={`chat-actions-${t.id}`} label={`Actions for ${t.title}`} icon={<EllipsisHorizontalIcon />} variant="ghost" size="sm" />} items={[
                { label: 'Rename chat', onClick: () => setRenaming({ id: t.id, place: 'sidebar' }) },
                { label: 'Delete chat…', onClick: () => askDelete(t.id, document.getElementById(`chat-actions-${t.id}`)) },
              ]} />
            </HStack>}
          </VStack>)}
          {state && !state.trees.length && <Text color="secondary">Your first tree starts with a question.</Text>}
        </VStack></nav>
      </VStack></aside>
      <main className="conversation">
        <Heading level={1} className="sr-only">TreeTutor</Heading>
        {error && <section role="alert"><VStack padding={4}><Text>{error}</Text></VStack></section>}
        <section className="tree-workspace" data-expanded={expanded && !overview}>
        {root && state && <section className="overview" data-chat-open={!overview} aria-label="Learning tree">
          {layoutFailed && <HStack padding={3} gap={2} role="alert"><Text>Map layout not saved. It retries every minute while this tree stays open.</Text><Button label="Retry saving layout" variant="secondary" onClick={() => void saver.current?.flush()} /></HStack>}
          <TreeOverview vim={vim} toolbar={overview && tree && <IconButton label="Reopen chat" tooltip={`Open chat: ${tree.title}`} icon={<ChatBubbleLeftRightIcon />} variant="ghost" size="sm" onClick={() => { focusComposer.current = true; changeView(false, tree.id); }} />} menu={menu} key={root} root={root} trees={state.trees} previews={previews} active={state.active} open={openConversation} save={savePositions} saveViewport={saveViewport} focus={overview ? overviewOrigin.current?.id : undefined} focusControl={overviewOrigin.current?.control} transition={overview ? transitionBox : undefined} selected={overview ? undefined : tree?.id} current={tree?.id} initialFolded={state.trees.find(t => t.id === root)?.layout?.folded} onFold={ids => setFolds({ root, ids })} />
        </section>}
        <section className="focused-chat" style={{ display: overview && root ? 'none' : 'flex' }} onKeyDown={e => { if (e.key === 'Escape' && !branch && !e.defaultPrevented && !(e.target as Element).closest('[role=menu], video')) { e.preventDefault(); returnToTree(); } }}>
        {tree ? <>
          <header className="chat-header"><VStack padding={3} gap={1}>
            <HStack gap={1} vAlign="center">
              <VStack gap={0} className="chat-title">
                {renaming?.id === tree.id && renaming.place === 'header' ? <TitleEditor key={tree.id} title={tree.title} save={title => rename(tree.id, title)} cancel={finishRename} /> : <Button id="rename-conversation" className="rename-title" label="Rename conversation" tooltip={`Rename ${tree.title}`} variant="ghost" size="sm" onClick={() => setRenaming({ id: tree.id, place: 'header' })}><Heading level={2} style={{ viewTransitionName: !overview && transitionBox ? 'conversation' : undefined }}>{tree.title}</Heading></Button>}
                <Text type="supporting" color="secondary">{modelLabel(tree)} · saved automatically</Text>
              </VStack>
              <DropdownMenu presentation="popover" alignment="end" menuWidth="16rem" isMenuOpen={modelMenuOpen} onOpenChange={open => void openModels(open)} renderTrigger={props => <IconButton {...props} label="Model for next reply" tooltip={active ? 'Wait for this reply to finish before changing models' : openingModels ? 'Loading models' : savingModel ? 'Saving model selection' : `Model for next reply: ${modelLabel(tree)}`} icon={<AdjustmentsHorizontalIcon />} variant="ghost" size="sm" isDisabled={active || !!savingModel || openingModels} isLoading={openingModels || savingModel === tree.id} />}>
                {['claude', 'codex', 'openai'].map(id => { const p = providers?.[id] ?? { label: providerLabel(id), connected: false }; return <DropdownMenuGroup key={id} title={p.label}>
                  {p.connected && models?.some(m => m.provider === id) ? <DropdownMenuRadioGroup label={`${p.label} models`} value={tree.provider === id ? tree.model ?? models?.find(m => m.provider === id && m.isDefault)?.model : undefined} onChange={model => void changeModel(id, model)}>
                    {tree.provider === id && tree.model && !models?.some(m => m.provider === id && m.model === tree.model) && <DropdownMenuRadioItem value={tree.model} label={`${tree.model} (saved)`} isDisabled />}
                    {(models ?? []).filter(m => m.provider === id).map(m => <DropdownMenuRadioItem key={m.model} value={m.model} label={m.label} />)}
                  </DropdownMenuRadioGroup>
                  : id === 'openai' ? <DropdownMenuItem label="Custom endpoint settings" description="Add an endpoint or check its URL, API key and connection" onClick={() => openSettings('connections', '.endpoint-settings input', document.querySelector<HTMLElement>('[aria-label="Model for next reply"]'))} />
                  : id === 'codex' ? <DropdownMenuItem label="Continue with ChatGPT" description="Sign in to use Codex with your ChatGPT plan" onClick={() => void signIn().catch(e => setError(e.message))} />
                  : <DropdownMenuItem label={`Check ${p.label} sign-in`} description={id === 'claude' ? 'Run claude in a terminal and sign in, then check again' : 'Sign in, then check again'} onClick={() => void loadModels()} />}
                </DropdownMenuGroup>; })}
              </DropdownMenu>
              <IconButton className="expand-chat" label={expanded ? 'Show map beside chat' : 'Expand chat'} tooltip={expanded ? 'Show map beside chat' : 'Expand chat'} icon={expanded ? <ArrowsPointingInIcon /> : <ArrowsPointingOutIcon />} variant="ghost" size="sm" onClick={toggleExpanded} />
              <IconButton label="Return to tree" tooltip="Back to map (Esc)" icon={<XMarkIcon />} variant="ghost" size="sm" onClick={returnToTree} />
            </HStack>
            {tree.branch && <HStack gap={1} vAlign="center" wrap="wrap">
              <Button label="Return to parent conversation" variant="ghost" size="sm" icon={<ArrowUturnLeftIcon />} onClick={() => openConversation(tree.branch!.parent)}>{state?.trees.find(t => t.id === tree.branch!.parent)?.title ?? 'Parent conversation'}</Button>
              <Text type="supporting" color="secondary" maxLines={1}>from “{tree.branch.text}”</Text>
            </HStack>}
            {modelError && <HStack gap={2} vAlign="center" role="alert"><Text type="supporting">{modelError}</Text><Button label="Retry loading models" variant="ghost" size="sm" onClick={() => void loadModels()} /></HStack>}
            {!modelError && models && !models.length && <Button label="Retry loading models" variant="ghost" size="sm" onClick={() => void loadModels()} />}
          </VStack></header>
          {source && !validSource && <Text role="alert">Saved source passage is unavailable. No replacement passage was selected.</Text>}
          <ChatLayout density="balanced" composer={<ChatComposer elevation="none" value={drafts[tree.id] ?? ''} onChange={value => setDrafts(d => ({ ...d, [tree.id]: value }))} onSubmit={text => void send(text)} isStopShown={active} onStop={() => { void api(`/api/trees/${tree.id}/stop`, {}).catch(e => setError(e.message)); }} input={<ChatComposerInput handleRef={composer} label="Your question" value={drafts[tree.id] ?? ''} onChange={value => setDrafts(d => ({ ...d, [tree.id]: value }))} isDisabled={active} placeholder="What would you like to understand?" />} footerActions={<Text type="supporting" color="secondary">Enter to send · Shift+Enter for a new line</Text>} />}>
            <ChatMessageList>
              {!tree.messages.length && <VStack gap={3} padding={6}><Heading level={3}>What are you curious about?</Heading><Text color="secondary">Ask about a concept, work through an example, or pick up a question you have been carrying.</Text></VStack>}
              {tree.messages.map(message => <ChatMessage key={message.id} sender={message.role === 'user' ? 'user' : 'assistant'}>
                <Text type="label" weight="semibold">{message.role === 'user' ? 'You' : 'Tutor'}</Text>
                {message.role === 'assistant' ? <Passage message={message} suggestions={tree.suggestions?.find(s => s.message === message.id)} index={tree.messages.filter(m => m.role === 'assistant' && m.status === 'completed').indexOf(message) + 1} reveal={validSource && source?.messageId === message.id ? source : undefined} form={branch?.parent === tree.id && branch.anchor.messageId === message.id ? { at: branch.anchor.at, node: <form className="branch-form" onSubmit={submitBranch} onKeyDown={e => { if (e.key === 'Escape' && !branching) { e.preventDefault(); e.stopPropagation(); setBranch(undefined); requestAnimationFrame(() => branchOrigin.current?.current?.focus()); } }}><VStack padding={3} gap={2}>
                  {/* Small empty box: Enter submits through the form; a disabled submit button blocks sending an empty prompt. */}
                  <TextInput label="Question about this passage" description={branch.anchor.text.length > 80 ? branch.anchor.text.slice(0, 80) + '…' : branch.anchor.text} size="sm" value={branch.question} onChange={question => setBranch(b => b && { ...b, question })} isDisabled={branching} hasAutoFocus />
                  {branchConcept && <PassageCorrection key={`${branch.parent}:${branch.anchor.messageId}:${branch.anchor.start}:${branch.anchor.end}`} name={branchConcept} api={api} disabled={branching} />}
                  <HStack gap={2} wrap="wrap"><Button label={branching ? 'Preparing context…' : 'Create focused chat'} type="submit" size="sm" isDisabled={branching || !branch.question.trim() || active} /><Button label="Cancel branch" variant="ghost" size="sm" isDisabled={branching} onClick={() => { setBranch(undefined); requestAnimationFrame(() => branchOrigin.current?.current?.focus()); }} /></HStack>
                </VStack></form> } : undefined} onOpenChild={id => void openConversation(id)} selecting={selectingMessage === message.id} openSelection={() => setSelectingMessage(message.id)} closeSelection={() => setSelectingMessage(undefined)} onBranch={(anchor, origin) => { branchOrigin.current = origin; setBranch({ parent: tree.id, anchor, question: '' }); setError(''); }} /> : <ChatMessageBubble variant="ghost"><Text style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{message.text}</Text></ChatMessageBubble>}
                
                {!overview && message.role === 'assistant' && artifactsAt(tree.artifacts ?? [], tree.id, message.id).map(artifact => artifact.kind === 'video' ? <VideoCard key={artifact.id} artifact={artifact} onAction={action => videoAction(tree.id, artifact.id, action)} /> : <DiagramCard key={artifact.id} artifact={artifact} />)}
                {!overview && message.role === 'assistant' && message.status === 'completed' && message.usage !== undefined && (() => {
                  const suggestions = tree.suggestions?.find(s => s.message === message.id);
                  return <>
                    <Text type="supporting" color="secondary">{replyUsageLine(message.usage, suggestions?.usage)}</Text>
                    {suggestions?.status === 'failed' && <Text type="supporting" color="secondary">Suggestions unavailable</Text>}
                  </>;
                })()}
                {message.status !== 'completed' && <Text type="supporting" role="status">{message.status === 'streaming' ? 'Responding…' : `Reply ${message.status}. You can send another question.`}</Text>}
              </ChatMessage>)}
            </ChatMessageList>
          </ChatLayout>
        </> : <VStack gap={0} className="overview">
          <HStack padding={1} className="map-toolbar" role="group" aria-label="Tree view controls">{menu()}</HStack>
          <VStack padding={6} gap={3} hAlign="center" vAlign="center" className="empty-map"><Heading level={2}>{loading ? 'Loading tree…' : selected.current ? 'Tree could not load' : 'Start a learning tree'}</Heading>{selected.current ? <Button label="Retry loading tree" onClick={() => void select(selected.current!)} /> : <><Text color="secondary">Ask your first question; it becomes the chat's title. Come back any time.</Text><Button label="New chat" variant="primary" icon={<PlusIcon />} isDisabled={busy} onClick={() => void create()} /></>}</VStack>
        </VStack>}
        </section>
        </section>
      </main>
    </HStack>
    <main id="knowledge-panel" role="tabpanel" aria-labelledby="knowledge-tab" hidden={tab !== 'knowledge'} className="knowledge-panel">
      {tab === 'knowledge' && <KnowledgePage api={api} activity={activeKey} />}
    </main>
    <SettingsWindow request={settings} close={closeSettings} api={api} models={models} providers={providers} modelError={modelError} loadModels={loadModels} usage={state?.usage?.replies ? usageLine(state.usage) : undefined} conceptNameTokens={state?.conceptNameTokens} auth={state?.auth} signIn={signIn} vim={vim} setVim={on => { setVim(on); try { localStorage.setItem('treetutor.vim', on ? 'on' : 'off'); } catch { /* Preference stays for this session only. */ } }} bubbleTint={bubbleTint} setBubbleTint={tint => { setBubbleTint(tint); try { localStorage.setItem('treetutor.bubble-tint', tint); } catch { /* Preference stays for this session only. */ } }} />
    <AlertDialog isOpen={!!deletion} onOpenChange={open => { if (!open) cancelDelete(); }} title={`Delete ${deletion?.parent ? 'branch' : 'chat'} “${deletion?.title ?? ''}”?`} description={`${deletion?.count ?? 0} ${(deletion?.count ?? 0) === 1 ? 'conversation' : 'conversations'} and their messages, branches, diagrams, videos and saved layout will be permanently deleted. Active replies and video jobs in these conversations will stop. This cannot be undone.${deleteError ? ` Deletion failed: ${deleteError}` : ''}`} actionLabel={deletion?.parent ? 'Delete branch' : 'Delete chat'} cancelLabel="Keep conversations" isActionLoading={deleting} onAction={() => void deleteConversation()} />
  </VStack>;
}
