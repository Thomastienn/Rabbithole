import {
  Fragment,
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { flushSync } from 'react-dom';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Text, Heading } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { IconButton } from '@astryxdesign/core/IconButton';
import {
  DropdownMenu,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from '@astryxdesign/core/DropdownMenu';
import {
  AdjustmentsHorizontalIcon,
  EllipsisHorizontalIcon,
  XMarkIcon,
  ArrowUturnLeftIcon,
  ChartBarIcon,
  ChevronRightIcon,
  ViewColumnsIcon,
  ChatBubbleLeftRightIcon,
  ChatBubbleBottomCenterTextIcon,
  PlusIcon,
  PencilSquareIcon,
  TrashIcon,
  ArrowUpIcon,
  ShareIcon,
  MagnifyingGlassIcon,
  FilmIcon,
  BookOpenIcon,
  MapIcon,
  RectangleStackIcon,
  ListBulletIcon,
  CheckIcon,
} from '@heroicons/react/24/outline';
import { TextArea } from '@astryxdesign/core/TextArea';
import { TextInput } from '@astryxdesign/core/TextInput';
import TreeSearch from './TreeSearch';
import ShellBand, { ContentsDrawer, SaveAlert, viewTab } from './ShellBand';
import { savedVim, savePreference } from './preferences';
import { treeSearchSource } from './treeSearch';
import { restoredTree, rootOf } from '../map/mapState';
import { AlertDialog } from '@astryxdesign/core/AlertDialog';
import {
  ChatComposer,
  ChatComposerInput,
  ChatLayout,
  ChatMessage,
  ChatMessageBubble,
  ChatMessageList,
  type ChatComposerInputHandle,
} from '@astryxdesign/core/Chat';
import TreeOverview, {
  type Summary,
  type Source,
  type Preview,
  type MapActions,
  type Layout,
} from '../map/TreeOverview';
import {
  replyUsageLine,
  underlineRanges,
  withTurn,
  type Message,
  type Suggestions,
  type Turn,
  type Usage,
} from '../chat/turn';
import { layoutSaver, type Batch } from '../map/layoutSave';
import type { Point, Viewport } from '../map/canvas';
import DiagramCard from '../media/DiagramCard';
import VideoCard from '../media/VideoCard';
import VisualFrame, { type PartAction, type VisualBranch } from '../media/VisualFrame';
import CopyButton from '../markdown/CopyButton';
import { FirstQuestion, TreeLoading, TreeLoadFailure } from '../chat/ChatStates';
import { firstQuestion as startFirstQuestion } from '../chat/firstQuestion';
import SettingsWindow, { type SettingsRequest, type SettingsTab } from '../settings/SettingsWindow';
import type { Appearance, ThemeChoice } from './appearance';
import {
  DEFAULT_MAP_WIDTH,
  MIN_MAP_WIDTH,
  clampMapWidth,
  keyMapWidth,
  maxMapWidth,
  resetMapWidth,
  savedMapWidth,
} from '../map/mapWidth';
import KnowledgePage, { type Graph } from '../knowledge/KnowledgePage';
import VideoLibrary from '../media/VideoLibrary';
import { artifactsAt, mergeArtifact, visualPassage, type Artifact } from '../media/artifacts';
import { renderMarkdown, rawOffsets, rawRange } from '../markdown/markdown';
import { withLiveTurn, previewRequests, replyingPreviews } from '../map/previews';
import { ensureHighlightStyles } from '@astryxdesign/core/CodeBlock';
import { Collapsible } from '@astryxdesign/core/Collapsible';
import { conversationAddresses, inkStyle, treeGroups, markLibraryScrolling } from '../map/treeList';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { effortLabel, type Model } from '../settings/models';
import Contents from '../chat/Contents';
import TurnRail from '../chat/TurnRail';
import { useTheme } from '@astryxdesign/core/theme';

// at.y is the passage's top in its reply; below is its bottom, where the prompt flips to when above would hit the header.
type Anchor = Source & { at?: Point & { below?: number }; suggestion?: boolean };
type Branch = {
  parent: string;
  messageId: string;
  text: string;
  question: string;
  snapshot: string;
};
type Tree = {
  id: string;
  title: string;
  provider: string;
  model: string | null;
  effort: string | null;
  messages: Message[];
  branch: Branch | null;
  artifacts: Artifact[];
  suggestions?: Suggestions[];
  compaction?: { status: 'compacting' | 'failed'; error?: string };
};
type ModelSelection = Pick<Tree, 'provider' | 'model' | 'effort'>;
type Providers = Record<string, { label: string; connected: boolean }>;
type State = {
  csrf: string;
  auth: { connected: boolean; email: string | null };
  trees: Summary[];
  active: string[];
  videos: string[];
  suggesting?: string[];
  conceptNameTokens?: number;
};

function TitleEditor({
  title,
  save,
  cancel,
}: {
  title: string;
  save: (title: string) => Promise<void>;
  cancel: () => void;
}) {
  const [value, setValue] = useState(title),
    [saving, setSaving] = useState(false),
    [error, setError] = useState('');
  const valid = !!value.trim() && value.trim().length <= 200;
  function submit() {
    if (!valid || saving) return;
    setSaving(true);
    void save(value.trim()).catch((e) => {
      setError(e.message);
      setSaving(false);
    });
  }
  return (
    <VStack
      gap={2}
      className="title-editor"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          if (!saving) cancel();
        }
      }}
    >
      <TextInput
        label="Conversation title"
        isLabelHidden
        value={value}
        onChange={setValue}
        size="sm"
        hasAutoFocus
        isDisabled={saving}
        description="Up to 200 characters."
        onEnter={submit}
        status={
          value.trim().length > 200
            ? { type: 'error', message: 'Use 200 characters or fewer.' }
            : undefined
        }
      />
      {error && <Text role="alert">{error}</Text>}
      <HStack gap={1}>
        <IconButton
          label={saving ? 'Saving…' : 'Save title'}
          icon={<CheckIcon />}
          variant="primary"
          size="sm"
          isDisabled={saving || !valid}
          onClick={submit}
        />
        <IconButton
          label="Cancel rename"
          icon={<XMarkIcon />}
          variant="ghost"
          size="sm"
          isDisabled={saving}
          onClick={cancel}
        />
      </HStack>
    </VStack>
  );
}

function PassageCorrection({
  name,
  api,
  disabled,
  children,
}: {
  name: string;
  api: (path: string, body?: unknown) => Promise<Graph>;
  disabled: boolean;
  children: React.ReactNode;
}) {
  const [correction, setCorrection] = useState<'known' | 'unknown' | null>(null);
  const [saving, setSaving] = useState<'known' | 'unknown'>();
  const [error, setError] = useState(''),
    [status, setStatus] = useState('');
  const version = useRef(0);
  useEffect(() => {
    const current = ++version.current;
    void api('/api/graph')
      .then((graph) => {
        if (current === version.current)
          setCorrection(
            graph.concepts.find((c) => c.name.toLowerCase() === name.toLowerCase())?.correction ??
              null,
          );
      })
      .catch((e) => {
        if (current === version.current) setError(e.message);
      });
    return () => {
      version.current++;
    };
  }, [name]);
  async function correct(kind: 'known' | 'unknown') {
    if (saving || disabled) return;
    version.current++;
    setSaving(kind);
    setError('');
    setStatus('');
    try {
      await api('/api/graph/correct', { name, kind });
      setCorrection(kind);
      setStatus(
        `${name}: ${kind === 'known' ? 'marked as known' : 'marked as not understood'}. Your correction overrides the estimate.`,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(undefined);
    }
  }
  // Overflow keeps both corrections reachable without two prominent buttons; selecting one saves it.
  return (
    <VStack gap={1}>
      <HStack gap={1} vAlign="center">
        {children}
        <DropdownMenu
          presentation="popover"
          alignment="end"
          renderTrigger={(props) => (
            <IconButton
              {...props}
              label={`Familiarity options for ${name}`}
              tooltip="Familiarity"
              icon={<EllipsisHorizontalIcon />}
              variant="ghost"
              size="sm"
              isLoading={!!saving}
              isDisabled={disabled}
            />
          )}
        >
          <DropdownMenuRadioGroup
            label={`Corrections for ${name}`}
            value={correction ?? undefined}
            onChange={(kind) => void correct(kind as 'known' | 'unknown')}
          >
            <DropdownMenuRadioItem value="known" label="I know this" />
            <DropdownMenuRadioItem value="unknown" label="I don't get this" />
          </DropdownMenuRadioGroup>
        </DropdownMenu>
      </HStack>
      <Text type="supporting" role="status" className="correction-status">
        {status}
      </Text>
      {error && (
        <Text type="supporting" role="alert">
          {error}
        </Text>
      )}
    </VStack>
  );
}

// Parsing is memoised so streaming chunks and selection state changes reuse the rendered tree.
const Reply = memo(function Reply({
  text,
  reveal,
  underlines,
  inlineArtifacts = [],
  onArtifactAction,
  onVisualPart,
  visualBranches,
}: {
  text: string;
  reveal?: Source;
  underlines: { start: number; end: number; child?: string }[];
  inlineArtifacts?: Artifact[];
  onVisualPart?: PartAction;
  visualBranches?: Record<string, VisualBranch[]>;
  onArtifactAction?: (id: string, action: 'cancel' | 'retry' | 'regenerate') => Promise<void>;
}) {
  useEffect(ensureHighlightStyles, []);
  const action = useRef(onArtifactAction),
    partAction = useRef(onVisualPart);
  action.current = onArtifactAction;
  partAction.current = onVisualPart;
  const key = JSON.stringify(underlines),
    artifactKey = JSON.stringify(inlineArtifacts),
    visualBranchKey = JSON.stringify(visualBranches);
  return (
    <Text as="div" type="body" className="reply-md">
      {useMemo(
        () =>
          renderMarkdown(
            text,
            reveal?.artifactId === undefined ? reveal : undefined,
            underlines,
            inlineArtifacts.map((v) => ({
              at: v.position!,
              node:
                v.kind === 'video' ? (
                  <VideoCard
                    key={v.id}
                    inline
                    artifact={v}
                    onAction={onArtifactAction && ((kind) => action.current!(v.id, kind))}
                  />
                ) : (
                  <VisualFrame
                    key={v.id}
                    artifact={v}
                    explored={visualBranches?.[v.id]}
                    reveal={reveal?.artifactId === v.id ? reveal : undefined}
                    onPart={(...args) => partAction.current?.(...args)}
                    onRetry={onArtifactAction && (() => action.current!(v.id, 'retry'))}
                    onRegenerate={onArtifactAction && (() => action.current!(v.id, 'regenerate'))}
                  />
                ),
            })),
          ),
        [
          text,
          reveal?.start,
          reveal?.end,
          reveal?.text,
          key,
          artifactKey,
          visualBranchKey,
          reveal?.artifactId,
          !!onArtifactAction,
        ],
      )}
    </Text>
  );
});

function Passage({
  message,
  addresses,
  index,
  onBranch,
  onOpenChild,
  reveal,
  selecting,
  openSelection,
  closeSelection,
  form,
  suggestions,
  branched,
  inlineArtifacts,
  onArtifactAction,
  onVisualPart,
  visualBranches,
}: {
  message: Message;
  addresses: ReturnType<typeof conversationAddresses>;
  index: number;
  inlineArtifacts?: Artifact[];
  onVisualPart?: PartAction;
  visualBranches?: Record<string, VisualBranch[]>;
  onArtifactAction?: (id: string, action: 'cancel' | 'retry' | 'regenerate') => Promise<void>;
  suggestions?: Suggestions;
  branched: { start: number; end: number; text: string; child: string }[];
  onBranch: (anchor: Anchor, origin: React.RefObject<HTMLElement | null>) => void;
  onOpenChild: (id: string) => void;
  reveal?: Source;
  selecting: boolean;
  openSelection: () => void;
  closeSelection: () => void;
  form?: { node: React.ReactNode; at?: Anchor['at']; start?: number; end?: number };
}) {
  const formOpen = !!form;
  const highlighted = useRef(false);
  // place is where a pointer highlight's passage box floats once Ask is clicked.
  const [anchor, setAnchor] = useState<Anchor & { at?: Point; place?: Anchor['at'] }>();
  const wrapper = useRef<HTMLElement>(null);
  const floating = useRef<HTMLDivElement>(null);
  const passage = useRef<HTMLElement>(null);
  const action = useRef<HTMLButtonElement>(null);
  const completed = message.status === 'completed';
  const branchKey = JSON.stringify(branched);
  const underlines = useMemo(
    () =>
      completed
        ? underlineRanges(message.text, suggestions, branched).map((u) =>
            u.child ? { ...u, ...addresses.get(u.child) } : u,
          )
        : [],
    [completed, message.text, suggestions, branchKey, addresses],
  );
  useLayoutEffect(() => {
    const box = floating.current;
    if (!box) return;
    const position = () => {
      box.style.transform = '';
      const top = wrapper
        .current!.closest('.focused-chat')!
        .querySelector('.chat-header')!
        .getBoundingClientRect().bottom;
      const at = form?.at;
      if (at && box.getBoundingClientRect().top < top)
        box.style.transform = `translateY(calc(${(at.below ?? at.y) - at.y}px + 2 * var(--spacing-1)))`;
    };
    position();
    const observer = new ResizeObserver(position);
    observer.observe(box);
    window.addEventListener('resize', position);
    document.addEventListener('scroll', position, true);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', position);
      document.removeEventListener('scroll', position, true);
    };
  }, [formOpen, form?.at?.y, form?.at?.below]);
  useEffect(() => {
    const highlight = reveal && passage.current?.querySelector<HTMLElement>('mark, [data-reveal]');
    if (!highlight) return;
    highlight.scrollIntoView({ block: 'center' });
    highlight.focus?.({ preventScroll: true });
    // ChatLayout jumps to the bottom on the frame after mount; reveal again if that jump hid the passage.
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        const box = highlight.getBoundingClientRect();
        if (box.bottom < 0 || box.top > innerHeight) highlight.scrollIntoView({ block: 'center' });
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [reveal]);
  // While the box is open its passage is painted with the CSS Custom Highlight API, leaving the DOM and native selection alone.
  useLayoutEffect(() => {
    const root = passage.current,
      range =
        form &&
        root &&
        typeof Highlight !== 'undefined' &&
        form.start !== undefined &&
        form.end !== undefined &&
        rawRange(root, form.start, form.end);
    if (!range) return;
    const mine = new Highlight(range);
    CSS.highlights.set('passage', mine);
    return () => {
      if (CSS.highlights.get('passage') === mine) CSS.highlights.delete('passage');
    };
  }, [form?.start, form?.end, formOpen, message.text, underlines, reveal]);
  function capture(start: number, end: number, at?: Point, place?: Anchor['at']) {
    setAnchor(
      end > start
        ? { messageId: message.id, start, end, text: message.text.slice(start, end), at, place }
        : undefined,
    );
  }
  function captureSelection(e: React.MouseEvent | React.KeyboardEvent) {
    highlighted.current = false;
    if (!completed) return;
    const selection = window.getSelection();
    if (!selection?.rangeCount || selection.isCollapsed) {
      setAnchor(undefined);
      return;
    }
    const range = selection.getRangeAt(0),
      root = passage.current;
    if (!root?.contains(range.startContainer) || !root.contains(range.endContainer)) {
      setAnchor(undefined);
      return;
    }
    const span = rawOffsets(root, range);
    if (!span) {
      setAnchor(undefined);
      return;
    }
    // Float the action just under the end of the selection, inside this reply.
    const rects = range.getClientRects(),
      last = rects[rects.length - 1],
      box = wrapper.current!.getBoundingClientRect();
    // A pointer highlight keeps the native selection (copy works) and only shows Ask; it wins over any underline it covers.
    const pointer = e.type === 'mouseup' && span.end > span.start;
    highlighted.current = pointer;
    capture(
      span.start,
      span.end,
      last && { x: Math.min(last.right - box.left, box.width), y: last.bottom - box.top },
      pointer ? { x: 0, y: rects[0].top - box.top, below: last.bottom - box.top } : undefined,
    );
  }
  // An unexplored underline opens the passage textbox; an explored one opens its existing child.
  function activate(target: EventTarget) {
    const piece = (target as Element).closest?.('u.suggestion') as HTMLElement | null;
    const u =
      piece && underlines.find((u) => +piece.dataset.o! >= u.start && +piece.dataset.o! < u.end);
    if (!u || !completed) return false;
    if (u.child) {
      onOpenChild(u.child);
      return true;
    }
    const stop =
      [...passage.current!.querySelectorAll<HTMLElement>('u.suggestion[tabindex]')].find(
        (e) => +e.dataset.o! >= u.start && +e.dataset.o! < u.end,
      ) ?? piece;
    setAnchor(undefined);
    const stopBox = stop.getBoundingClientRect(),
      top = wrapper.current!.getBoundingClientRect().top;
    onBranch(
      {
        messageId: message.id,
        start: u.start,
        end: u.end,
        text: message.text.slice(u.start, u.end),
        suggestion: true,
        at: { x: 0, y: stopBox.top - top, below: stopBox.bottom - top },
      },
      { current: stop },
    );
    return true;
  }
  useEffect(() => {
    function dismiss(e: PointerEvent) {
      if (
        !passage.current?.contains(e.target as Node) &&
        !action.current?.contains(e.target as Node) &&
        !selecting &&
        !formOpen
      )
        setAnchor(undefined);
    }
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [selecting, formOpen]);
  const ask = anchor && !formOpen && (
    <Button
      ref={action}
      label="Ask about selection"
      variant="primary"
      size="sm"
      elevation="med"
      icon={<ChatBubbleBottomCenterTextIcon />}
      onClick={() => {
        const { place, ...picked } = anchor;
        // Pointer Ask opens the box floating above the passage and returns focus to the reply; keyboard Ask keeps the inline box.
        if (place) {
          setAnchor(undefined);
          onBranch({ ...picked, at: place }, passage);
        } else onBranch({ ...picked, at: undefined }, action);
      }}
    />
  );
  return (
    <VStack
      ref={wrapper}
      gap={2}
      className="passage"
      onKeyDown={(e) => {
        if (e.key === 'Escape' && (anchor || selecting)) {
          e.preventDefault();
          e.stopPropagation();
          setAnchor(undefined);
          closeSelection();
          passage.current?.focus();
        }
      }}
    >
      <section
        ref={passage}
        tabIndex={-1}
        onMouseUp={captureSelection}
        onKeyUp={captureSelection}
        onClick={(e) => {
          if (!highlighted.current) activate(e.target);
        }}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && activate(e.target)) e.preventDefault();
        }}
      >
        <Reply
          text={
            message.text ||
            (message.status === 'streaming'
              ? message.phase === 'compacting'
                ? 'Compacting parent context…'
                : 'Thinking…'
              : '')
          }
          reveal={reveal}
          underlines={underlines}
          inlineArtifacts={inlineArtifacts}
          onArtifactAction={onArtifactAction}
          onVisualPart={onVisualPart}
          visualBranches={visualBranches}
        />
      </section>
      {/* Mounted before suggestions arrive so their arrival is announced once; reopened replies are not re-announced. */}
      <Text role="status" className="sr-only">
        {underlines.length
          ? `${underlines.length} suggested ${underlines.length === 1 ? 'passage' : 'passages'} in tutor reply ${index}`
          : ''}
      </Text>
      {completed && !selecting && (
        <Button
          className="focus-reveal"
          label={`Select passage in tutor reply ${index}`}
          variant="ghost"
          size="sm"
          onClick={openSelection}
        />
      )}
      {selecting && (
        <>
          <TextArea
            label="Select tutor passage"
            description="Hold Shift and use arrow keys to select. Tab to Ask about selection."
            value={message.text}
            isReadOnly
            rows={4}
            hasAutoFocus
            onSelect={(e) => {
              const input = e.target as HTMLTextAreaElement;
              capture(input.selectionStart, input.selectionEnd);
            }}
          />
        </>
      )}
      {ask &&
        (anchor.at ? (
          <HStack className="selection-action" style={{ left: anchor.at.x, top: anchor.at.y }}>
            {ask}
          </HStack>
        ) : (
          ask
        ))}
      {form &&
        (form.at ? (
          <VStack ref={floating} className="passage-box" style={{ top: form.at.y }}>
            {form.node}
          </VStack>
        ) : (
          form.node
        ))}
      {selecting && (
        <Button
          label="Close passage selection"
          variant="ghost"
          size="sm"
          onClick={() => {
            setAnchor(undefined);
            closeSelection();
            passage.current?.focus();
          }}
        />
      )}
    </VStack>
  );
}

const remPx = () => parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;

export default function ChatPage({
  appearance,
  setAppearance,
  theme,
  setTheme,
}: {
  appearance: Appearance;
  setAppearance: (next: Appearance) => void;
  theme: ThemeChoice;
  setTheme: (next: ThemeChoice) => void;
}) {
  const { mode } = useTheme();
  const [state, setState] = useState<State>();
  const [tree, setTree] = useState<Tree>();
  const addresses = useMemo(() => conversationAddresses(state?.trees ?? []), [state?.trees]);
  const [previews, setPreviews] = useState<Record<string, Preview>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [firstModel, setFirstModel] = useState<ModelSelection>();
  const [models, setModels] = useState<Model[]>();
  const [providers, setProviders] = useState<Providers>();
  const [modelError, setModelError] = useState('');
  const [modelNotice, setModelNotice] = useState('');
  const [savingModel, setSavingModel] = useState<string>();
  const [modelMenuOpen, setModelMenuOpen] = useState(false),
    [openingModels, setOpeningModels] = useState(false);
  const [mobile, setMobile] = useState(() => window.matchMedia('(max-width: 48rem)').matches);
  const [today, setToday] = useState(() => new Date());
  const [tab, setTab] = useState('learning');
  const [libraryQuery, setLibraryQuery] = useState('');
  const scrollQuiet = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [libraryLayout, setLibraryLayout] = useState<'shelf' | 'list'>(() => {
    try {
      return localStorage.getItem('treetutor.library-layout') === 'list' ? 'list' : 'shelf';
    } catch {
      return 'shelf';
    }
  });
  const [drawer, setDrawer] = useState(false);
  const [settings, setSettings] = useState<SettingsRequest>();
  const settingsOpener = useRef<HTMLElement | null>(null),
    settingsFrom = useRef('learning');
  const [searching, setSearching] = useState(false);
  const [renaming, setRenaming] = useState<{ id: string; place: 'header' | 'library' }>();
  const [deletion, setDeletion] = useState<{
    id: string;
    root: string;
    title: string;
    count: number;
    parent: string | null;
  }>();
  const [deleting, setDeleting] = useState(false),
    [deleteError, setDeleteError] = useState('');
  const deleteOrigin = useRef<HTMLElement | null>(null);
  const removed = useRef(new Set<string>());
  const renamed = useRef(new Map<string, string>());
  const streams = useRef(new Map<string, AbortController>());
  // Only this boolean is stored, per browser and app origin; unreadable storage means off.
  const [vim, setVim] = useState(savedVim);
  const [mapWidth, setMapWidth] = useState(() => {
    try {
      return savedMapWidth(localStorage.getItem('treetutor.map-width'));
    } catch {
      return DEFAULT_MAP_WIDTH;
    }
  });
  const [workspaceWidth, setWorkspaceWidth] = useState(() => window.innerWidth / remPx());
  useEffect(() => {
    try {
      localStorage.setItem('treetutor.map-width', String(mapWidth));
    } catch {}
  }, [mapWidth]);
  const workspace = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = workspace.current!,
      observer = new ResizeObserver(() => setWorkspaceWidth(el.clientWidth / remPx()));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const shownMapWidth = clampMapWidth(mapWidth, workspaceWidth);
  const [root, setRoot] = useState<string>();
  const [overview, setOverview] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [contentsOpen, setContentsOpen] = useState(() => {
    try {
      return localStorage.getItem('treetutor.contents') !== 'collapsed';
    } catch {
      return true;
    }
  });
  // The toggle unmounts with its panel, so focus moves to its counterpart.
  function toggleContents(open: boolean) {
    flushSync(() => setContentsOpen(open));
    document.querySelector<HTMLElement>(open ? '.contents-collapse' : '.contents-reopen')?.focus();
    try {
      localStorage.setItem('treetutor.contents', open ? 'open' : 'collapsed');
    } catch {
      /* Preference stays for this session only. */
    }
  }
  const [statsOpen, setStatsOpen] = useState(false);
  const statsPanel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!statsOpen) return;
    const frame = requestAnimationFrame(() =>
      statsPanel.current?.scrollIntoView({ block: 'nearest' }),
    );
    return () => cancelAnimationFrame(frame);
  }, [statsOpen, tree?.id]);
  const [folds, setFolds] = useState<{ root: string; ids: string[] }>();
  const [transitionBox, setTransitionBox] = useState<string>();
  const overviewOrigin = useRef<{ id: string; control: string }>(undefined);
  const [reveal, setReveal] = useState<{ tree: string; source: Source }>();
  const [figureTarget, setFigureTarget] = useState<{ conversation: string; artifact: string }>();
  const [messageTarget, setMessageTarget] = useState<{ conversation: string; message: string }>();
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
  useEffect(() => {
    const media = window.matchMedia('(max-width: 48rem)');
    const resize = () => {
      setMobile(media.matches);
      setDrawer(false);
    };
    media.addEventListener('change', resize);
    return () => media.removeEventListener('change', resize);
  }, []);
  useEffect(() => {
    const midnight = new Date();
    midnight.setHours(24, 0, 0, 0);
    const timer = setTimeout(() => setToday(new Date()), midnight.getTime() - Date.now());
    return () => clearTimeout(timer);
  }, [today]);
  const writeLayout = useRef<(root: string, batch: Batch<Layout>) => Promise<unknown>>(undefined);
  writeLayout.current = (id, batch) =>
    api(`/api/trees/${id}/layout`, { ...batch.layout, positions: batch.positions });
  useEffect(() => {
    const s = layoutSaver<Layout>((id, batch) => writeLayout.current!(id, batch), setLayoutFailed);
    saver.current = s;
    return s.dispose;
  }, []);

  function changeView(showOverview: boolean, id?: string) {
    // Snapshotting thousands of preview rows stalls large maps; their viewport still animates.
    if (
      visibleIds.length > 50 ||
      !document.startViewTransition ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      setOverview(showOverview);
      return;
    }
    flushSync(() => setTransitionBox(id));
    document.startViewTransition(() => flushSync(() => setOverview(showOverview)));
  }
  // Map stays mounted while hidden, so its pan and zoom are intact when it returns.
  function toggleExpanded() {
    const panel = document.querySelector<HTMLElement>('.focused-chat');
    if (
      !document.startViewTransition ||
      !panel ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      setExpanded((e) => !e);
      return;
    }
    panel.style.viewTransitionName = 'chat-panel';
    document
      .startViewTransition(() => flushSync(() => setExpanded((e) => !e)))
      .finished.finally(() => {
        panel.style.viewTransitionName = '';
      });
  }
  function returnToTree() {
    setExpanded(false);
    // Chats reached by branching have no map origin; return focus to their own box.
    if (!overviewOrigin.current && tree)
      overviewOrigin.current = { id: tree.id, control: `open-${tree.id}` };
    changeView(true, overviewOrigin.current?.id);
  }
  async function openConversation(
    id: string,
    source?: Source,
    artifact?: string,
    message?: string,
  ) {
    {
      const control = document.activeElement as HTMLElement | null;
      const box = control?.closest<HTMLElement>('.react-flow__node')?.dataset.id;
      overviewOrigin.current = box ? { id: box, control: control!.id || `open-${box}` } : undefined;
    }
    setReveal(source ? { tree: id, source } : undefined);
    setFigureTarget(artifact ? { conversation: id, artifact } : undefined);
    setMessageTarget(message ? { conversation: id, message } : undefined);
    focusComposer.current = !source && !artifact && !message;
    await select(id);
    if (selected.current === id) changeView(false, overviewOrigin.current?.id ?? id);
  }
  // A message match opens its own conversation in chat; otherwise the tree reopens as saved.
  function openTree(id: string, trees = state?.trees ?? [], focus?: string, read = false) {
    setTab('learning');
    overviewOrigin.current = undefined;
    const { saved, overview, expanded } = restoredTree(id, trees, focus, read);
    setRoot(id);
    setOverview(overview);
    setExpanded(expanded);
    void select(saved);
  }
  // Trees show unsaved layout immediately; the saver writes it in one batch per minute.
  function withUnsaved(trees: Summary[]) {
    const dirty = saver.current?.pending() ?? new Map<string, Batch<Layout>>();
    const moved: Record<string, Point> = Object.assign(
      {},
      ...[...dirty.values()].map((b) => b.positions),
    );
    return trees.map((t) =>
      dirty.has(t.id) || moved[t.id]
        ? { ...t, ...(dirty.has(t.id) && { layout: dirty.get(t.id)!.layout }), ...moved[t.id] }
        : t,
    );
  }
  function markLayout(id: string, layout: Layout, positions?: Record<string, Point>) {
    saver.current?.mark(id, layout, positions);
    setState((s) => s && { ...s, trees: withUnsaved(s.trees) });
  }
  const layoutOf = (id: string): Layout =>
    saver.current?.pending().get(id)?.layout ??
    state?.trees.find((t) => t.id === id)?.layout ?? {
      folded: [],
      selected: null,
      panel: overview ? 'collapsed' : 'beside',
    };
  // One current snapshot per root: fold IDs, selected conversation, panel mode and viewport.
  useEffect(() => {
    if (!root || !state || !tree || folds?.root !== root || rootOf(tree.id, state.trees) !== root)
      return;
    const current = state.trees.find((t) => t.id === root)?.layout;
    const layout: Layout = {
      folded: folds.ids,
      selected: tree.id,
      panel: overview ? 'collapsed' : expanded ? 'expanded' : 'beside',
      ...(current?.viewport && { viewport: current.viewport }),
    };
    if (JSON.stringify(layout) !== JSON.stringify(current)) markLayout(root, layout);
  }, [root, tree?.id, overview, expanded, folds, state?.trees]);

  async function api(path: string, body?: unknown) {
    const response = await fetch(
      path,
      body === undefined
        ? undefined
        : {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-TreeTutor-CSRF': state?.csrf ?? '',
            },
            body: JSON.stringify(body),
          },
    );
    const data = await response.json();
    if (!response.ok)
      throw Object.assign(new Error(data.error ?? 'Request failed. Reload and try again.'), {
        data,
      });
    return data;
  }
  function savePositions(positions: Record<string, Point>) {
    if (root) markLayout(root, layoutOf(root), positions);
  }
  function saveViewport(viewport: Viewport) {
    const layout = root ? layoutOf(root) : undefined;
    if (layout && JSON.stringify(layout.viewport) !== JSON.stringify(viewport))
      markLayout(root!, {
        ...layout,
        viewport: { x: viewport.x, y: viewport.y, zoom: viewport.zoom },
      });
  }
  async function refresh() {
    const data: State = await api('/api/state');
    setState((previous) => {
      const known = new Map(previous?.trees.map((t) => [t.id, t]));
      const trees = withUnsaved(data.trees.filter((t) => !removed.current.has(t.id))).map((t) => {
        if (renamed.current.has(t.id)) t = { ...t, title: renamed.current.get(t.id)! };
        const old = known.get(t.id);
        // A status poll must not replace every unchanged node's data during a stream.
        return old &&
          (Object.keys(t) as (keyof Summary)[]).every((key) =>
            key === 'layout'
              ? JSON.stringify(t.layout) === JSON.stringify(old.layout)
              : t[key] === old[key],
          )
          ? old
          : t;
      });
      return {
        ...data,
        trees,
        active: [...new Set([...data.active, ...turns.current.keys()])].filter(
          (id) => !removed.current.has(id),
        ),
        videos: data.videos.filter((id) => !removed.current.has(id)),
      };
    });
    return data;
  }
  const visibleIds = (() => {
    if (!root || !state) return [];
    const ids = [root];
    for (let i = 0; i < ids.length; i++)
      for (const child of state.trees)
        if (child.parent === ids[i] && !ids.includes(child.id)) ids.push(child.id);
    return ids;
  })();
  const previewKey = JSON.stringify(visibleIds);
  // Running video jobs and suggestion calls poll like replies until they settle.
  const activeKey = [
    ...(state?.active ?? []),
    ...(state?.videos ?? []),
    ...(state?.suggesting ?? []),
  ].join(',');
  useEffect(() => {
    let cancelled = false;
    async function load(ids: string[]) {
      try {
        const results: Record<string, Preview>[] = await Promise.all(
          previewRequests(ids).map((path) => api(path)),
        );
        if (!cancelled) {
          const next: Record<string, Preview> = Object.assign({}, ...results);
          for (const id of ids)
            if (turns.current.has(id)) next[id] = withLiveTurn(next[id], turns.current.get(id));
          setPreviews((p) => ({ ...p, ...next }));
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    }
    const visible: string[] = JSON.parse(previewKey);
    void load(visible);
    // While replies run, refetch only the conversations that are replying.
    const replying = replyingPreviews(visible, activeKey);
    const timer = replying.length ? setInterval(() => load(replying), 1500) : undefined;
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [previewKey, activeKey]);
  async function select(id: string) {
    selected.current = id;
    const version = ++request.current;
    const checkpoint = checkpoints.current;
    setError('');
    setTree(undefined);
    setLoading(true);
    try {
      let next: Tree = await api(`/api/trees/${id}`);
      if (request.current === version && checkpoints.current !== checkpoint)
        next = await api(`/api/trees/${id}`);
      if (request.current === version) {
        setTree(withTurn(next, turns.current.get(id)));
        if (next.branch && !next.messages.length)
          setDrafts((d) => ({ ...d, [id]: d[id] ?? next.branch!.question }));
      }
    } catch (e) {
      if (request.current === version) setError((e as Error).message);
    } finally {
      if (request.current === version) setLoading(false);
    }
  }
  function loadInitial() {
    setError('');
    void refresh()
      .then((data) => {
        const first = data.trees.find((t) => !t.parent);
        if (first) openTree(first.id, data.trees);
      })
      .catch((e) => setError(e.message));
  }
  useEffect(loadInitial, []);
  const titleSearch = useMemo(() => treeSearchSource(api, setError), []);
  async function loadModels() {
    const version = ++modelRequest.current;
    setModelError('');
    try {
      const data = await api('/api/models');
      if (version === modelRequest.current) {
        setModels(data.models);
        setProviders(data.providers);
      }
    } catch (e) {
      if (version === modelRequest.current) {
        setModelError((e as Error).message);
        setProviders((e as { data?: { providers?: Providers } }).data?.providers);
      }
    }
  }
  useEffect(() => {
    if (state) void loadModels();
  }, [!!state, state?.auth.connected]);
  useEffect(() => {
    if (!state || tree || selected.current || tab === 'settings') return;
    let canceled = false;
    void api('/api/settings/chat')
      .then((value) => {
        if (!canceled) setFirstModel(value);
      })
      .catch((e) => {
        if (!canceled) setError(e.message);
      });
    return () => {
      canceled = true;
    };
  }, [!!state, !tree && !selected.current, tab === 'settings']);
  async function openModels(open: boolean) {
    if (!open) {
      setModelMenuOpen(false);
      return;
    }
    if (openingModels) return;
    const id = selected.current;
    setOpeningModels(true);
    await loadModels();
    setOpeningModels(false);
    if (selected.current === id) setModelMenuOpen(true);
  }
  async function changeModel(provider: string, model: string, effort: string | null) {
    if (!tree || savingModel) return;
    const id = tree.id;
    setSavingModel(id);
    setError('');
    setModelNotice('');
    try {
      const saved = await api(`/api/trees/${id}/model`, { provider, model, effort });
      ++checkpoints.current;
      setTree((t) =>
        t?.id === id
          ? { ...t, provider: saved.provider, model: saved.model, effort: saved.effort }
          : t,
      );
      if (
        selected.current === id &&
        tree.effort &&
        effort === null &&
        (tree.provider !== provider || tree.model !== model)
      )
        setModelNotice('Effort changed to Provider default for this model.');
    } catch (e) {
      if (selected.current === id) setError((e as Error).message);
    } finally {
      setSavingModel(undefined);
    }
  }
  useEffect(() => {
    setModelNotice('');
  }, [tree?.id]);
  useEffect(() => {
    if (!overview && tree && focusComposer.current) {
      composer.current?.focus();
      focusComposer.current = false;
    }
  }, [tree?.id, overview]);
  useLayoutEffect(() => {
    if (!figureTarget || overview || tree?.id !== figureTarget.conversation) return;
    const frame = requestAnimationFrame(() => {
      const figure = document.querySelector<HTMLElement>(
        `.focused-chat [data-artifact="${CSS.escape(figureTarget.artifact)}"]`,
      );
      figure?.focus({ preventScroll: true });
      figure?.scrollIntoView({ block: 'center' });
      setFigureTarget(undefined);
    });
    return () => cancelAnimationFrame(frame);
  }, [tree?.id, overview, figureTarget]);
  // A bubble picked on the map opens with that message's top at the reading area top.
  useLayoutEffect(() => {
    if (!messageTarget || overview || tree?.id !== messageTarget.conversation) return;
    // ChatLayout follows the bottom until its scroll listener sees the reader move up, so hold the position for a few frames.
    let frame = 0,
      frames = 0;
    const tick = () => {
      const message = document.querySelector<HTMLElement>(
        `.focused-chat [data-chat-message="${CSS.escape(messageTarget.message)}"]`,
      );
      if (message && document.activeElement !== message) {
        message.tabIndex = -1;
        message.focus({ preventScroll: true });
      }
      message?.scrollIntoView({ block: 'start' });
      if (++frames < 12) frame = requestAnimationFrame(tick);
      else setMessageTarget(undefined);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [tree?.id, overview, messageTarget]);
  // Reopening a page during a turn recovers saved checkpoints without tying work to focus.
  useEffect(() => {
    if (!activeKey) return;
    const timer = setInterval(() => {
      void refresh()
        .then(async () => {
          const id = selected.current;
          if (!id || turns.current.has(id)) return;
          const version = request.current,
            checkpoint = checkpoints.current;
          const next: Tree = await api(`/api/trees/${id}`);
          if (
            selected.current === id &&
            request.current === version &&
            checkpoints.current === checkpoint &&
            !turns.current.has(id)
          )
            setTree(next);
        })
        .catch((e) => setError(e.message));
    }, 1500);
    return () => clearInterval(timer);
  }, [activeKey]);

  // Cancel and Retry (videos, visuals and diagrams) update only their own card; refreshing state resumes polling for a retried job.
  async function videoAction(
    id: string,
    artifactId: string,
    action: 'cancel' | 'retry' | 'regenerate',
  ) {
    setError('');
    try {
      const next: Artifact = await api(`/api/trees/${id}/artifacts/${artifactId}/${action}`, {});
      const focused =
        document.activeElement?.closest('[data-artifact]')?.getAttribute('data-artifact') ===
        artifactId;
      setTree((t) =>
        t?.id === id
          ? { ...t, artifacts: t.artifacts.map((a) => (a.id === artifactId ? next : a)) }
          : t,
      );
      if (focused)
        requestAnimationFrame(() => {
          if (document.activeElement === document.body)
            document
              .querySelector<HTMLElement>(`.focused-chat [data-artifact="${next.id}"] button`)
              ?.focus();
        });
      // A job that settled before this refresh never starts polling, so load its result once.
      if (!(await refresh()).videos.includes(id) && !turns.current.has(id)) {
        const saved: Tree = await api(`/api/trees/${id}`);
        if (selected.current === id && !turns.current.has(id))
          setTree((t) => (t?.id === id ? saved : t));
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }
  // New chat saves nothing: it shows the blank first-question composer; create() saves the tree on the first send.
  function newChat() {
    ++request.current;
    selected.current = undefined;
    setTree(undefined);
    setRoot(undefined);
    setTab('learning');
    setOverview(false);
    setExpanded(false);
    setLoading(false);
    setError('');
    requestAnimationFrame(() =>
      document.querySelector<HTMLElement>('.first-question [role=textbox]')?.focus(),
    );
  }
  async function create(question: string) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await startFirstQuestion<Tree>(
        question,
        firstModel && currentModel ? { ...firstModel, model: currentModel.model } : {},
        {
          api,
          refresh,
          send,
          open: async (next) => {
            overviewOrigin.current = undefined;
            focusComposer.current = true;
            setRoot(next.id);
            setTab('learning');
            setOverview(false);
            setExpanded(false);
            await select(next.id);
            setDrafts((d) => ({ ...d, first: '', [next.id]: question }));
          },
        },
      );
      if (result.empty) {
        // Keep send's error on screen; only drop the selection so the blank composer returns.
        ++request.current;
        selected.current = undefined;
        setTree(undefined);
        setRoot(undefined);
        setDrafts((d) => ({ ...d, first: question }));
        return;
      }
      requestAnimationFrame(() => {
        if (selected.current === result.id) composer.current?.focus();
      });
    } catch (e) {
      setError((e as Error).message);
      setDrafts((d) => ({ ...d, first: d.first || question }));
    } finally {
      setBusy(false);
    }
  }
  async function signIn() {
    const result = await api('/api/auth', {});
    window.location.assign(result.url);
  }
  function finishRename() {
    const target = renaming;
    setRenaming(undefined);
    requestAnimationFrame(() =>
      document
        .getElementById(
          target?.place === 'library' ? `chat-actions-${target.id}` : 'rename-conversation',
        )
        ?.focus(),
    );
  }
  async function rename(id: string, title: string) {
    const saved = await api(`/api/trees/${id}/rename`, { title });
    renamed.current.set(id, saved.title);
    ++checkpoints.current;
    setTree((t) => (t?.id === id ? { ...t, title: saved.title } : t));
    setState(
      (s) =>
        s && { ...s, trees: s.trees.map((t) => (t.id === id ? { ...t, title: saved.title } : t)) },
    );
    finishRename();
  }
  function askDelete(id: string, origin: HTMLElement | null) {
    const target = state?.trees.find((t) => t.id === id),
      owner = state && rootOf(id, state.trees);
    if (!target || !owner) return;
    const ids = [id];
    for (let i = 0; i < ids.length; i++)
      for (const t of state!.trees) if (t.parent === ids[i] && !ids.includes(t.id)) ids.push(t.id);
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
    setDeleting(true);
    setDeleteError('');
    try {
      const result: { deleted: string[]; parent: string | null } = await api(
        `/api/trees/${deletion.root}/delete`,
        { conversation: deletion.id, count: deletion.count, title: deletion.title },
      );
      const ids = new Set(result.deleted),
        pending = saver.current?.pending().get(deletion.root);
      for (const id of ids) {
        removed.current.add(id);
        streams.current.get(id)?.abort();
        turns.current.delete(id);
        renamed.current.delete(id);
      }
      ++checkpoints.current;
      saver.current?.discard(deletion.root);
      const cleanLayout = (layout: Layout): Layout => ({
        ...layout,
        folded: layout.folded.filter((id) => !ids.has(id)),
        selected: layout.selected && ids.has(layout.selected) ? result.parent : layout.selected,
      });
      if (result.parent && pending)
        saver.current?.mark(
          deletion.root,
          cleanLayout(pending.layout),
          Object.fromEntries(Object.entries(pending.positions).filter(([id]) => !ids.has(id))),
        );
      const trees = (state?.trees ?? [])
        .filter((t) => !ids.has(t.id))
        .map((t) =>
          t.id === deletion.root && t.layout ? { ...t, layout: cleanLayout(t.layout) } : t,
        );
      setState(
        (s) =>
          s && {
            ...s,
            trees,
            active: s.active.filter((id) => !ids.has(id)),
            videos: s.videos.filter((id) => !ids.has(id)),
          },
      );
      setFolds((f) => f && { ...f, ids: f.ids.filter((id) => !ids.has(id)) });
      setDrafts((d) => Object.fromEntries(Object.entries(d).filter(([id]) => !ids.has(id))));
      setPreviews((p) => Object.fromEntries(Object.entries(p).filter(([id]) => !ids.has(id))));
      setRenaming((r) => (r && ids.has(r.id) ? undefined : r));
      setBranch((b) => (b && ids.has(b.parent) ? undefined : b));
      setReveal((r) => (r && ids.has(r.tree) ? undefined : r));
      if (selected.current && ids.has(selected.current)) setSelectingMessage(undefined);
      setError('');
      setLayoutFailed(false);
      setDeletion(undefined);
      if (result.parent && root === deletion.root) {
        overviewOrigin.current = undefined;
        focusComposer.current = true;
        setOverview(false);
        await select(result.parent);
      } else if (root === deletion.root) {
        const roots = trees.filter((t) => !t.parent),
          index = state!.trees.filter((t) => !t.parent).findIndex((t) => t.id === deletion.root);
        const next = roots[Math.min(index, roots.length - 1)];
        if (next) {
          focusComposer.current = true;
          openTree(next.id, trees);
        } else {
          ++request.current;
          selected.current = undefined;
          setTree(undefined);
          setRoot(undefined);
          setTab('learning');
          setOverview(true);
          setExpanded(false);
          setLoading(false);
        }
        if (!next || (next.layout?.panel !== 'beside' && next.layout?.panel !== 'expanded'))
          requestAnimationFrame(() =>
            document
              .querySelector<HTMLElement>(next ? '.map-toolbar button' : '.shell-band .new-chat')
              ?.focus(),
          );
      } else
        requestAnimationFrame(() =>
          deleteOrigin.current?.isConnected &&
          deleteOrigin.current.id !== `chat-actions-${deletion.root}`
            ? deleteOrigin.current.focus()
            : document.getElementById(`chat-actions-${root}`)?.focus(),
        );
      await refresh();
    } catch (e) {
      setDeleteError((e as Error).message);
    } finally {
      setDeleting(false);
    }
  }
  async function retryFromMap(id: string) {
    try {
      const target: Tree = await api(`/api/trees/${id}`);
      await send(target.messages.at(-2)?.text ?? '', target, true);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  // retry streams over the latest failed reply; the question and composer draft are left alone.
  async function send(text: string, target = tree, retry = false) {
    if (
      !target ||
      !text.trim() ||
      savingModel === target.id ||
      state?.active.includes(target.id) ||
      turns.current.has(target.id)
    )
      return;
    const id = target.id;
    const controller = new AbortController();
    streams.current.set(id, controller);
    const turn: Turn = {};
    turns.current.set(id, turn);
    ++checkpoints.current;
    setError('');
    setState((s) => s && { ...s, active: [...s.active, id] });
    try {
      const response = await fetch(`/api/trees/${id}/${retry ? 'retry' : 'messages'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-TreeTutor-CSRF': state?.csrf ?? '' },
        body: JSON.stringify({ ...(!retry && { text }), theme: { name: theme, mode } }),
        signal: controller.signal,
      });
      if (removed.current.has(id)) return;
      if (!response.ok) throw new Error((await response.json()).error);
      if (!retry) setDrafts((d) => ({ ...d, [id]: '' }));
      const reader = response.body!.getReader(),
        decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const result = await reader.read();
        buffer += decoder.decode(result.value, { stream: !result.done });
        let end;
        while ((end = buffer.indexOf('\n\n')) >= 0) {
          const frame = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          if (!frame.startsWith('data: ')) continue;
          const event = JSON.parse(frame.slice(6));
          if (removed.current.has(id)) continue;
          if (event.type === 'error' && selected.current === id) setError(event.error);
          if (event.type === 'saved') {
            turn.user = event.user;
            turn.replaced = event.replaced;
            const title: string = renamed.current.get(id) ?? event.title;
            setTree((t) => (t?.id === id ? { ...t, title } : t));
            setState(
              (s) => s && { ...s, trees: s.trees.map((t) => (t.id === id ? { ...t, title } : t)) },
            );
            turn.reply = { id: event.id, role: 'assistant', text: '', status: 'streaming' };
          }
          // A focused chat's first reply waits for its inherited context: "compacting", then "thinking".
          if (turn.reply && event.type === 'status')
            turn.reply = {
              ...turn.reply,
              phase: event.status === 'compacting' ? 'compacting' : undefined,
            };
          if (turn.reply && (event.type === 'text' || event.type === 'done')) {
            turn.reply = {
              ...turn.reply,
              text: event.text ?? turn.reply.text,
              status: event.status ?? turn.reply.status,
            };
          }
          if (event.type === 'artifact' && turn.reply)
            turn.artifacts = mergeArtifact(turn.artifacts ?? [], event.artifact, id, [turn.reply]);
          if (
            event.type === 'saved' ||
            event.type === 'status' ||
            event.type === 'text' ||
            event.type === 'done' ||
            event.type === 'artifact'
          ) {
            setTree((t) => (t?.id === id ? withTurn(t, turn) : t));
            setPreviews((p) => ({ ...p, [id]: withLiveTurn(p[id], turn) }));
          }
        }
        if (result.done) break;
      }
    } catch (e) {
      if (removed.current.has(id)) return;
      // The composer clears itself on submit; give back a question the server never saved.
      if (!turn.user && !retry) setDrafts((d) => ({ ...d, [id]: d[id] || text }));
      if (selected.current === id) setError((e as Error).message);
    } finally {
      streams.current.delete(id);
      if (removed.current.has(id)) return;
      const version = request.current;
      try {
        const saved = await api(`/api/trees/${id}`);
        if (selected.current === id && request.current === version) {
          ++checkpoints.current;
          setTree(saved);
        }
      } catch {
        if (selected.current === id && !removed.current.has(id))
          setError('Connection lost. Reload to recover saved messages.');
      } finally {
        turns.current.delete(id);
        await refresh().catch(() => {
          if (selected.current === id)
            setError('Connection lost. Reload to recover saved messages.');
        });
      }
    }
  }
  // Escape returns focus to the passage or underline that opened the popup; an outside click keeps focus where it lands.
  function closeBranch(refocus: boolean) {
    setBranch(undefined);
    requestAnimationFrame(() => {
      if (refocus || !document.activeElement || document.activeElement === document.body)
        branchOrigin.current?.current?.focus({ preventScroll: !refocus });
    });
  }
  useEffect(() => {
    if (!branch || branching) return;
    // Capture phase so the popup closes before a new selection or underline reopens it; its menu popover counts as inside.
    const outside = (e: PointerEvent) => {
      if (!(e.target as Element).closest?.('.branch-form, [role=menu]')) closeBranch(false);
    };
    document.addEventListener('pointerdown', outside, true);
    return () => document.removeEventListener('pointerdown', outside, true);
  }, [!!branch, branching]);
  // Compaction never sees the question, so it starts when the form opens; closing cancels (a no-op after submit took it).
  const prepareKey = branch && JSON.stringify([branch.parent, { ...branch.anchor, at: undefined }]);
  useEffect(() => {
    if (!prepareKey) return;
    const [parent, anchor] = JSON.parse(prepareKey);
    api(`/api/trees/${parent}/prepare`, anchor).catch(() => {}); // submit reports any failure
    return () => {
      api(`/api/trees/${parent}/unprepare`, anchor).catch(() => {});
    };
  }, [prepareKey]);
  async function submitBranch(e: React.FormEvent) {
    e.preventDefault();
    if (!branch || branching || savingModel === branch.parent || !branch.question.trim()) return;
    setBranching(true);
    setError('');
    try {
      const { at: _at, ...anchor } = branch.anchor;
      const next: Tree = await api(`/api/trees/${branch.parent}/branches`, {
        ...anchor,
        question: branch.question,
      });
      setDrafts((d) => ({ ...d, [next.id]: branch.question }));
      overviewOrigin.current = undefined;
      setBranch(undefined);
      // Branch-first: the saved child opens at once from the response; its reply waits on the server for compaction.
      if (selected.current === branch.parent) {
        focusComposer.current = true;
        setOverview(false);
        selected.current = next.id;
        ++request.current;
        setTree(next);
        setLoading(false);
      }
      const sending = send(branch.question, next);
      await refresh();
      await sending;
    } catch (e) {
      if (selected.current === branch.parent) setError((e as Error).message);
    } finally {
      setBranching(false);
    }
  }
  const providerLabel = (id: string) => providers?.[id]?.label ?? id;
  const codexFallback = models?.find((m) => m.provider === 'codex' && m.defaultFallback);
  const composition = tree ?? firstModel;
  const currentModel =
    composition &&
    models?.find(
      (m) =>
        m.provider === composition.provider &&
        (composition.model ? m.model === composition.model : m.isDefault),
    );
  const unavailableSelection =
    !!tree &&
    !!models &&
    (!providers?.[tree.provider]?.connected ||
      !currentModel ||
      (!!tree.effort && !(currentModel.efforts ?? []).includes(tree.effort)));
  const modelLabel = (t: ModelSelection) => {
    const label =
      models?.find((m) => m.provider === t.provider && m.model === t.model)?.label ??
      t.model ??
      models?.find((m) => m.provider === t.provider && m.isDefault)?.label ??
      'default model';
    return label.startsWith(providerLabel(t.provider))
      ? label
      : `${providerLabel(t.provider)} · ${label}`;
  };
  const ancestors: Summary[] = [];
  for (let id = tree?.branch?.parent; id;) {
    const parent = state?.trees.find((t) => t.id === id);
    if (!parent) break;
    ancestors.unshift(parent);
    id = parent.parent ?? undefined;
  }
  const source = !overview && reveal?.tree === tree?.id ? reveal?.source : undefined;
  const validSource =
    source &&
    tree?.messages.some(
      (m) =>
        m.id === source.messageId &&
        m.role === 'assistant' &&
        m.status === 'completed' &&
        (source.artifactId !== undefined
          ? tree.artifacts.some(
              (a) =>
                a.id === source.artifactId &&
                a.message === m.id &&
                a.kind === 'visual' &&
                a.status === 'ready',
            )
          : source.start >= 0 &&
            source.end > source.start &&
            m.text.slice(source.start, source.end) === source.text),
    );
  // Keyed on ids so streaming text does not rebuild the rail's scroll listener.
  const questionIds =
    tree?.messages
      .filter((m) => m.role === 'user')
      .map((m) => m.id)
      .join(' ') ?? '';
  const questions = useMemo(
    () =>
      tree?.messages.filter((m) => m.role === 'user').map((m) => ({ id: m.id, text: m.text })) ??
      [],
    [tree?.id, questionIds],
  );
  const visualBranches: Record<string, VisualBranch[]> = {};
  for (const t of state?.trees ?? [])
    if (t.parent === tree?.id && t.artifactId && t.label && t.explanation)
      (visualBranches[t.artifactId] ??= []).push({
        child: t.id,
        label: t.label,
        explanation: t.explanation,
      });
  const openVisualPart: PartAction = (visual, part, origin) => {
    if (
      !tree ||
      overview ||
      visual.status !== 'ready' ||
      visual.conversation !== tree.id ||
      !tree.messages.some((m) => m.id === visual.message && m.status === 'completed')
    )
      return;
    const child = visualBranches[visual.id]?.find(
      (p) => p.label === part.label && p.explanation === part.explanation,
    )?.child;
    if (child) {
      void openConversation(child);
      return;
    }
    branchOrigin.current = origin;
    setBranch({
      parent: tree.id,
      anchor: {
        messageId: visual.message,
        artifactId: visual.id,
        ...part,
        text: visualPassage(visual, part),
      },
      question: '',
    });
    setError('');
  };
  const active = !!tree && !!state?.active.includes(tree.id);
  const branchConcept = branch?.anchor.suggestion
    ? tree?.suggestions
        ?.find((s) => s.message === branch.anchor.messageId)
        ?.passages.find((p) => p.start === branch.anchor.start && p.end === branch.anchor.end)
        ?.concept
    : undefined;
  function openSettings(
    section?: SettingsTab,
    focus?: string,
    opener = document.activeElement as HTMLElement | null,
  ) {
    settingsOpener.current = opener;
    if (tab !== 'settings') settingsFrom.current = tab;
    setTab('settings');
    setSettings({ tab: section, focus });
  }
  function closeSettings() {
    setSettings(undefined);
    setTab(settingsFrom.current);
    // Menu items that opened the window are gone by now; fall back to the menu trigger that held them.
    const opener = settingsOpener.current;
    requestAnimationFrame(() =>
      (opener?.isConnected
        ? opener
        : document.querySelector<HTMLElement>('.map-toolbar [aria-label="Map menu"]')
      )?.focus(),
    );
  }
  const mapMenuTrigger = () =>
    document.querySelector<HTMLElement>('.map-toolbar [aria-label="Map menu"]');
  const menu = (actions?: MapActions) => (
    <DropdownMenu
      presentation="popover"
      renderTrigger={(props) => (
        <IconButton
          {...props}
          label="Map menu"
          tooltip="Map menu"
          icon={<EllipsisHorizontalIcon />}
          variant="ghost"
          size="sm"
        />
      )}
      items={[
        { label: 'Learning trees', onClick: () => setTab('library') },
        { label: 'Settings', onClick: () => openSettings(undefined, undefined, mapMenuTrigger()) },
        { label: 'Expand all', isDisabled: !actions, onClick: actions?.expand },
        { label: 'Collapse all', isDisabled: !actions, onClick: actions?.collapse },
        { label: 'Keep current branch', isDisabled: !actions?.canKeep, onClick: actions?.keep },
        { label: 'Help', onClick: () => openSettings('interface', undefined, mapMenuTrigger()) },
        { type: 'divider' },
        {
          label: tree?.branch ? 'Delete branch…' : 'Delete chat…',
          isDisabled: !tree,
          onClick: () => tree && askDelete(tree.id, mapMenuTrigger()),
        },
      ]}
    />
  );
  const rootTitle = state?.trees.find((t) => t.id === root)?.title;
  const query = libraryQuery.trim().toLocaleLowerCase();
  const libraryGroups = treeGroups(
    (state?.trees ?? []).filter((t) => t.parent || t.title.toLocaleLowerCase().includes(query)),
    today,
  );
  const reading = tab === 'learning' && (!overview || !root),
    mapping = tab === 'learning' && overview && !!root;
  const views = [
    viewTab('Read', <BookOpenIcon />, reading, () => {
      setTab('learning');
      if (overview && root) {
        focusComposer.current = true;
        changeView(false, tree?.id);
      }
    }),
    viewTab(
      'Map',
      <MapIcon />,
      mapping,
      () => {
        setTab('learning');
        if (!overview) returnToTree();
      },
      !root,
    ),
    viewTab('Knowledge', <ShareIcon />, tab === 'knowledge', () => setTab('knowledge')),
    viewTab('Videos', <FilmIcon />, tab === 'videos', () => setTab('videos')),
  ];
  const contents = (collapse?: () => void) =>
    root &&
    state && (
      <Contents
        collapse={collapse}
        root={root}
        trees={state.trees.filter((t) => visibleIds.includes(t.id))}
        addresses={addresses}
        previews={previews}
        current={tree}
        active={state.active}
        open={(id) => {
          setTab('learning');
          void openConversation(id);
        }}
        openFigure={(id, artifact) => {
          setTab('learning');
          void openConversation(id, undefined, artifact);
        }}
      />
    );
  // Narrow band (mockup Narrow): views, the outline and Settings move into this drawer; any choice inside closes it.
  const narrowDrawer = (
    <ContentsDrawer
      tab={tab}
      drawer={drawer}
      setDrawer={setDrawer}
      views={views}
      contents={contents()}
      library={() => setTab('library')}
      settings={() =>
        openSettings(undefined, undefined, document.querySelector<HTMLElement>('.band-contents'))
      }
    />
  );
  const band = (
    <ShellBand
      mobile={mobile}
      rootTitle={rootTitle}
      tab={tab}
      busy={busy}
      drawer={drawer}
      views={views}
      saveAlert={
        root && state && layoutFailed && <SaveAlert retry={() => void saver.current?.flush()} />
      }
      setDrawer={setDrawer}
      search={() => setSearching(true)}
      newChat={newChat}
      library={() => setTab('library')}
      settings={(e) => openSettings(undefined, undefined, e.currentTarget)}
    />
  );
  const chooseModel = (provider: string, model: string, effort: string | null) =>
    tree ? changeModel(provider, model, effort) : setFirstModel({ provider, model, effort });
  const modelMenu = composition && (
    <DropdownMenu
      presentation="popover"
      alignment="end"
      menuWidth="16rem"
      isMenuOpen={modelMenuOpen}
      onOpenChange={(open) => void openModels(open)}
      renderTrigger={(props) => (
        <Button
          {...props}
          className="model-picker"
          label="Model for next reply"
          tooltip={
            active
              ? 'Wait for this reply to finish before changing models'
              : openingModels
                ? 'Loading models'
                : savingModel
                  ? 'Saving model selection'
                  : `Model for next reply: ${modelLabel(composition)} · ${effortLabel(composition.effort)}`
          }
          icon={<AdjustmentsHorizontalIcon />}
          variant="ghost"
          size="sm"
          isDisabled={active || !!savingModel || openingModels || busy}
          isLoading={openingModels || !!savingModel}
        >
          <span className="chat-model">
            {modelLabel(composition)} · {effortLabel(composition.effort)}
          </span>
        </Button>
      )}
    >
      {Object.entries(providers ?? {}).map(([id, p]) => {
        return (
          <DropdownMenuGroup key={id} title={p.connected ? p.label : `${p.label} · not connected`}>
            {p.connected && models?.some((m) => m.provider === id) ? (
              <DropdownMenuRadioGroup
                label={`${p.label} models`}
                value={
                  composition.provider === id
                    ? (composition.model ??
                      models?.find((m) => m.provider === id && m.isDefault)?.model)
                    : undefined
                }
                onChange={(model) =>
                  void chooseModel(
                    id,
                    model,
                    composition.effort &&
                      models
                        ?.find((m) => m.provider === id && m.model === model)
                        ?.efforts?.includes(composition.effort)
                      ? composition.effort
                      : null,
                  )
                }
              >
                {composition.provider === id &&
                  composition.model &&
                  !models?.some((m) => m.provider === id && m.model === composition.model) && (
                    <DropdownMenuRadioItem
                      value={composition.model}
                      label={`${composition.model} (saved)`}
                      isDisabled
                    />
                  )}
                {(models ?? [])
                  .filter((m) => m.provider === id)
                  .map((m) => (
                    <DropdownMenuRadioItem key={m.model} value={m.model} label={m.label} />
                  ))}
              </DropdownMenuRadioGroup>
            ) : /^openai(:|$)/.test(id) ? (
              <DropdownMenuItem
                label="Custom endpoint settings"
                description="Add an endpoint or check its URL, API key and connection"
                onClick={() =>
                  openSettings(
                    'connections',
                    '.endpoint-add',
                    document.querySelector<HTMLElement>('[aria-label="Model for next reply"]'),
                  )
                }
              />
            ) : id === 'codex' ? (
              <DropdownMenuItem
                label="Continue with ChatGPT"
                description="Sign in to use Codex with your ChatGPT plan"
                onClick={() => void signIn().catch((e) => setError(e.message))}
              />
            ) : (
              <DropdownMenuItem
                label={`Check ${p.label} sign-in`}
                description={
                  id === 'claude'
                    ? 'Run claude in a terminal and sign in, then check again'
                    : 'Sign in, then check again'
                }
                onClick={() => void loadModels()}
              />
            )}
          </DropdownMenuGroup>
        );
      })}
      <DropdownMenuGroup title="Effort for next reply">
        <DropdownMenuRadioGroup
          label="Conversation effort"
          value={composition.effort ?? 'default'}
          onChange={(value) => {
            if (currentModel)
              void chooseModel(
                composition.provider,
                currentModel.model,
                value === 'default' ? null : value,
              );
          }}
        >
          <DropdownMenuRadioItem
            value="default"
            label="Provider default"
            isDisabled={!currentModel}
          />
          {composition.effort && !currentModel?.efforts?.includes(composition.effort) && (
            <DropdownMenuRadioItem
              value={composition.effort}
              label={`${effortLabel(composition.effort)} (unavailable)`}
              isDisabled
            />
          )}
          {(currentModel?.efforts ?? []).map((effort) => (
            <DropdownMenuRadioItem key={effort} value={effort} label={effortLabel(effort)} />
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuGroup>
    </DropdownMenu>
  );
  const firstQuestion = (
    <FirstQuestion
      draft={drafts.first ?? ''}
      setDraft={(value) => setDrafts((d) => ({ ...d, first: value }))}
      busy={busy}
      available={!!currentModel}
      modelMenu={modelMenu}
      submit={(text) => void create(text)}
      modelError={modelError}
      loadModels={() => void loadModels()}
      noModels={!!models && !models.length}
    />
  );
  return (
    <VStack
      gap={0}
      style={{ height: '100dvh' }}
      onKeyDown={(e) => {
        if (e.key !== 'Escape' || e.defaultPrevented) return;
        if ((e.target as Element).closest('.delete-dialog')) {
          e.preventDefault();
          e.stopPropagation();
          cancelDelete();
        } else if (
          tab === 'settings' &&
          !(e.target as Element).closest('dialog, [role=listbox], [role=menu]')
        ) {
          e.preventDefault();
          closeSettings();
        }
      }}
    >
      {band}
      {mobile && narrowDrawer}
      {/* Outside the band so the palette keeps popover colours. */}
      <TreeSearch
        isOpen={searching}
        onOpenChange={setSearching}
        searchSource={titleSearch}
        onValueChange={(id) => id && openTree(id)}
      />
      <HStack gap={0} style={{ flex: 1, minHeight: 0 }} className="workspace">
        <main className="conversation" hidden={tab !== 'learning'} aria-label="Learning workspace">
          <Heading level={1} className="sr-only">
            TreeTutor
          </Heading>
          {error && (
            <section role="alert" className="failure-banner workspace-failure">
              <Text>{error}</Text>
            </section>
          )}
          <section
            className="tree-workspace"
            data-expanded={expanded && !overview}
            style={{ '--map-width': `${shownMapWidth}rem` } as CSSProperties}
          >
            {!overview &&
              !mobile &&
              (contentsOpen ? (
                contents(() => toggleContents(false))
              ) : (
                <aside className="contents-rail" aria-label="Learning tree contents">
                  <IconButton
                    className="contents-reopen"
                    label="Show contents"
                    tooltip="Show contents"
                    aria-expanded={false}
                    icon={<ChevronRightIcon />}
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleContents(true)}
                  />
                </aside>
              ))}
            <section ref={workspace} className="reading-workspace">
              <section
                id="focused-chat"
                className="focused-chat"
                style={{ display: overview && root ? 'none' : 'flex' }}
                onKeyDown={(e) => {
                  if (
                    e.key === 'Escape' &&
                    !branch &&
                    !e.defaultPrevented &&
                    !(e.target as Element).closest('[role=menu], video, dialog')
                  ) {
                    e.preventDefault();
                    returnToTree();
                  }
                }}
              >
                {tree ? (
                  <>
                    <header className="chat-header">
                      <VStack paddingInline={2} paddingBlock={1} gap={1}>
                        <HStack gap={1} vAlign="center" className="chat-heading-row">
                          {tree.branch && (
                            <IconButton
                              label="Return to parent conversation"
                              tooltip={`Back to ${state?.trees.find((t) => t.id === tree.branch!.parent)?.title ?? 'parent conversation'}`}
                              icon={<ArrowUturnLeftIcon />}
                              variant="ghost"
                              size="sm"
                              onClick={() => openConversation(tree.branch!.parent)}
                            />
                          )}
                          <nav className="crumbs" aria-label="Path in this learning tree">
                            {ancestors.map((t) => (
                              <Fragment key={t.id}>
                                <Button
                                  className="crumb"
                                  label={`${addresses.get(t.id)?.address ?? ''} ${t.title}`.trim()}
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => openConversation(t.id)}
                                >
                                  <span className="addr">{addresses.get(t.id)?.address}</span>{' '}
                                  {t.title}
                                </Button>
                                <ChevronRightIcon className="crumb-sep" aria-hidden />
                              </Fragment>
                            ))}
                            <strong aria-current="location">
                              <span className="addr">{addresses.get(tree.id)?.address}</span>{' '}
                              {tree.title}
                            </strong>
                          </nav>
                          <IconButton
                            className="stats-toggle"
                            label="Token stats"
                            tooltip={statsOpen ? 'Hide token stats' : 'Show token stats'}
                            aria-pressed={statsOpen}
                            icon={<ChartBarIcon />}
                            variant="ghost"
                            size="sm"
                            onClick={() => setStatsOpen((open) => !open)}
                          />
                          <IconButton
                            className="expand-chat"
                            aria-pressed={!expanded}
                            aria-controls="learning-tree-map"
                            label={expanded ? 'Show map beside chat' : 'Expand chat'}
                            tooltip={expanded ? 'Show map beside chat' : 'Expand chat'}
                            icon={<ViewColumnsIcon />}
                            variant="ghost"
                            size="sm"
                            onClick={toggleExpanded}
                          />
                          <IconButton
                            label="Return to tree"
                            tooltip="Back to map (Esc)"
                            icon={<XMarkIcon />}
                            variant="ghost"
                            size="sm"
                            onClick={returnToTree}
                          />
                          <DropdownMenu
                            presentation="popover"
                            alignment="end"
                            renderTrigger={(props) => (
                              <IconButton
                                {...props}
                                label="More conversation options"
                                tooltip="More"
                                icon={<EllipsisHorizontalIcon />}
                                variant="ghost"
                                size="sm"
                              />
                            )}
                          >
                            <DropdownMenuItem
                              label={statsOpen ? 'Hide token stats' : 'Show token stats'}
                              onClick={() => setStatsOpen((open) => !open)}
                            />
                            <DropdownMenuItem
                              label="Rename conversation"
                              icon={<PencilSquareIcon />}
                              onClick={() => setRenaming({ id: tree.id, place: 'header' })}
                            />
                          </DropdownMenu>
                        </HStack>
                        {modelNotice && (
                          <Text type="supporting" role="status">
                            {modelNotice}
                          </Text>
                        )}
                        {unavailableSelection && (
                          <Text type="supporting" role="alert">
                            Saved model or effort unavailable. Check Connections in Settings or
                            choose a listed model and effort. Your discussion is saved.
                          </Text>
                        )}
                        {tree.provider === 'codex' && codexFallback && (
                          <Text type="supporting" color="secondary" role="note">
                            GPT-6.1 Terra isn’t listed for this account. New conversations use{' '}
                            {codexFallback.label}, the account default.
                          </Text>
                        )}
                        {modelError && (
                          <HStack gap={2} vAlign="center" role="alert" className="failure-banner">
                            <Text type="supporting">{modelError}</Text>
                            <Button
                              label="Retry loading models"
                              variant="ghost"
                              size="sm"
                              onClick={() => void loadModels()}
                            />
                          </HStack>
                        )}
                        {!modelError && models && !models.length && (
                          <Button
                            label="Retry loading models"
                            variant="ghost"
                            size="sm"
                            onClick={() => void loadModels()}
                          />
                        )}
                      </VStack>
                    </header>
                    {source && !validSource && (
                      <Text role="alert">
                        Saved source passage is unavailable. No replacement passage was selected.
                      </Text>
                    )}
                    <ChatLayout
                      density="balanced"
                      composer={
                        <ChatComposer
                          elevation="none"
                          sendButton={
                            models && !models.length && !active ? (
                              <IconButton
                                label="Send"
                                icon={<ArrowUpIcon />}
                                variant="primary"
                                isDisabled
                              />
                            ) : undefined
                          }
                          footerActions={modelMenu}
                          value={drafts[tree.id] ?? ''}
                          onChange={(value) => setDrafts((d) => ({ ...d, [tree.id]: value }))}
                          onSubmit={(text) => {
                            if (!models || models.length) void send(text);
                          }}
                          isStopShown={active}
                          onStop={() => {
                            void api(`/api/trees/${tree.id}/stop`, {}).catch((e) =>
                              setError(e.message),
                            );
                          }}
                          input={
                            <ChatComposerInput
                              handleRef={composer}
                              label="Your question"
                              maxRows={4}
                              value={drafts[tree.id] ?? ''}
                              onChange={(value) => setDrafts((d) => ({ ...d, [tree.id]: value }))}
                              isDisabled={active || (!!models && !models.length)}
                              placeholder={
                                models && !models.length
                                  ? 'Sign in to a provider to ask'
                                  : 'What would you like to understand?'
                              }
                            />
                          }
                        />
                      }
                    >
                      <ChatMessageList gap={2} align="top" isStreaming={active}>
                        <VStack gap={0} className="chat-title conv-title">
                          {renaming?.id === tree.id && renaming.place === 'header' ? (
                            <TitleEditor
                              key={tree.id}
                              title={tree.title}
                              save={(title) => rename(tree.id, title)}
                              cancel={finishRename}
                            />
                          ) : (
                            <Button
                              id="rename-conversation"
                              className="rename-title"
                              label="Rename conversation"
                              tooltip={tree.title}
                              variant="ghost"
                              size="sm"
                              onClick={() => setRenaming({ id: tree.id, place: 'header' })}
                            >
                              <Heading
                                level={2}
                                style={{
                                  viewTransitionName:
                                    !overview && transitionBox ? 'conversation' : undefined,
                                }}
                              >
                                {tree.title}
                              </Heading>
                            </Button>
                          )}
                        </VStack>
                        {statsOpen && (
                          <VStack
                            ref={statsPanel}
                            gap={1}
                            className="chat-stats-body"
                            role="region"
                            aria-label="Token stats"
                          >
                            {tree.messages
                              .filter((m) => m.role === 'assistant' && m.status === 'completed')
                              .map((m, i) => (
                                <Text key={m.id} type="supporting" color="secondary">
                                  Reply {i + 1}:{' '}
                                  {replyUsageLine(
                                    m.usage ?? null,
                                    tree.suggestions?.find((s) => s.message === m.id)?.usage,
                                  )}
                                </Text>
                              ))}
                            {!tree.messages.some(
                              (m) => m.role === 'assistant' && m.status === 'completed',
                            ) && (
                              <Text type="supporting" color="secondary">
                                Token usage appears after a completed reply.
                              </Text>
                            )}
                          </VStack>
                        )}
                        {tree.branch && (
                          <Collapsible
                            style={inkStyle(addresses.get(tree.id)?.ink ?? 0)}
                            className="inherited-context"
                            defaultIsOpen={false}
                            trigger={
                              <Text weight="medium">
                                Inherited from{' '}
                                {state?.trees.find((t) => t.id === tree.branch!.parent)?.title ??
                                  'parent conversation'}
                              </Text>
                            }
                          >
                            <dl className="inherited-body">
                              <dt>Passage</dt>
                              <dd>{tree.branch.text}</dd>
                              <dt>Your question</dt>
                              <dd>{tree.branch.question}</dd>
                              <dt>Context the tutor received</dt>
                              <dd>{tree.branch.snapshot}</dd>
                            </dl>
                          </Collapsible>
                        )}
                        {!tree.messages.length && (
                          <VStack gap={3} padding={6}>
                            <Heading level={3}>What are you curious about?</Heading>
                            <Text color="secondary">
                              Ask about a concept, work through an example, or pick up a question
                              you have been carrying.
                            </Text>
                          </VStack>
                        )}
                        {tree.messages.map((message) => {
                          const suggestions = tree.suggestions?.find(
                              (s) => s.message === message.id,
                            ),
                            index =
                              tree.messages
                                .filter((m) => m.role === 'assistant' && m.status === 'completed')
                                .indexOf(message) + 1;
                          return (
                            <ChatMessage
                              key={message.id}
                              data-chat-message={message.id}
                              sender={message.role === 'user' ? 'user' : 'assistant'}
                              className={message.role === 'user' ? 'chat-question' : 'chat-reply'}
                              name={
                                message.role === 'assistant' && (
                                  <Text type="supporting" color="secondary">
                                    Tutor · {modelLabel(tree)}
                                  </Text>
                                )
                              }
                              metadata={
                                !overview &&
                                message.role === 'assistant' &&
                                message.status === 'completed' && (
                                  <HStack gap={2} vAlign="center">
                                    <CopyButton
                                      text={message.text}
                                      label={`Copy tutor reply ${index}`}
                                      className="reply-copy"
                                    />
                                    {message.usage !== undefined && (
                                      <Text
                                        type="supporting"
                                        color="secondary"
                                        className="reply-usage"
                                      >
                                        {replyUsageLine(message.usage, suggestions?.usage)}
                                      </Text>
                                    )}
                                  </HStack>
                                )
                              }
                            >
                              {message.role === 'assistant' ? (
                                <Passage
                                  message={message}
                                  addresses={addresses}
                                  suggestions={suggestions}
                                  onVisualPart={openVisualPart}
                                  visualBranches={visualBranches}
                                  onArtifactAction={(artifactId, action) =>
                                    videoAction(tree.id, artifactId, action)
                                  }
                                  inlineArtifacts={
                                    overview
                                      ? undefined
                                      : artifactsAt(
                                          tree.artifacts ?? [],
                                          tree.id,
                                          message.id,
                                        ).filter(
                                          (a) =>
                                            (a.kind === 'visual' || a.kind === 'video') &&
                                            a.position != null,
                                        )
                                  }
                                  branched={
                                    state?.trees.flatMap((t) =>
                                      t.parent === tree.id &&
                                      t.messageId === message.id &&
                                      t.start !== null &&
                                      t.end !== null &&
                                      t.passage !== null
                                        ? [
                                            {
                                              start: t.start,
                                              end: t.end,
                                              text: t.passage,
                                              child: t.id,
                                            },
                                          ]
                                        : [],
                                    ) ?? []
                                  }
                                  index={index}
                                  reveal={
                                    validSource && source?.messageId === message.id
                                      ? source
                                      : undefined
                                  }
                                  form={
                                    branch?.parent === tree.id &&
                                    branch.anchor.messageId === message.id
                                      ? {
                                          at: branch.anchor.at,
                                          node: (
                                            <form
                                              className="branch-form"
                                              onSubmit={submitBranch}
                                              onKeyDown={(e) => {
                                                if (
                                                  e.key === 'Escape' &&
                                                  !branching &&
                                                  !(e.target as Element).closest(
                                                    '[role=menu], [aria-expanded=true]',
                                                  )
                                                ) {
                                                  e.preventDefault();
                                                  e.stopPropagation();
                                                  closeBranch(true);
                                                }
                                              }}
                                            >
                                              <VStack padding={2} gap={2}>
                                                {(() => {
                                                  const row = (
                                                    <>
                                                      {/* The reply paints the passage; this quote only describes the question for screen readers. */}
                                                      <Text
                                                        id="branch-passage"
                                                        className="branch-passage sr-only"
                                                      >
                                                        {branch.anchor.text}
                                                      </Text>
                                                      <TextInput
                                                        label="Question about this passage"
                                                        isLabelHidden
                                                        placeholder="Ask about this passage"
                                                        aria-describedby="branch-passage"
                                                        size="sm"
                                                        value={branch.question}
                                                        onChange={(question) =>
                                                          setBranch((b) => b && { ...b, question })
                                                        }
                                                        isDisabled={branching}
                                                        hasAutoFocus
                                                        containerClassName="branch-question"
                                                      />
                                                      <IconButton
                                                        className="branch-send"
                                                        label={
                                                          branching
                                                            ? 'Preparing context…'
                                                            : 'Create focused chat'
                                                        }
                                                        type="submit"
                                                        icon={<ArrowUpIcon />}
                                                        variant="primary"
                                                        size="sm"
                                                        isLoading={branching}
                                                        isDisabled={
                                                          branching ||
                                                          !branch.question.trim() ||
                                                          active
                                                        }
                                                      />
                                                    </>
                                                  );
                                                  return branchConcept ? (
                                                    <PassageCorrection
                                                      key={`${branch.parent}:${branch.anchor.messageId}:${branch.anchor.start}:${branch.anchor.end}`}
                                                      name={branchConcept}
                                                      api={api}
                                                      disabled={branching}
                                                    >
                                                      {row}
                                                    </PassageCorrection>
                                                  ) : (
                                                    <HStack gap={1} vAlign="center">
                                                      {row}
                                                    </HStack>
                                                  );
                                                })()}
                                              </VStack>
                                            </form>
                                          ),
                                          start: branch.anchor.start,
                                          end: branch.anchor.end,
                                        }
                                      : undefined
                                  }
                                  onOpenChild={(id) => void openConversation(id)}
                                  selecting={selectingMessage === message.id}
                                  openSelection={() => setSelectingMessage(message.id)}
                                  closeSelection={() => setSelectingMessage(undefined)}
                                  onBranch={(anchor, origin) => {
                                    branchOrigin.current = origin;
                                    setBranch({ parent: tree.id, anchor, question: '' });
                                    setError('');
                                  }}
                                />
                              ) : (
                                <ChatMessageBubble variant="ghost" className="question-bubble">
                                  <Text
                                    style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}
                                  >
                                    {message.text}
                                  </Text>
                                </ChatMessageBubble>
                              )}

                              {!overview &&
                                message.role === 'assistant' &&
                                artifactsAt(tree.artifacts ?? [], tree.id, message.id)
                                  .filter((a) => a.kind === 'mermaid' || a.position == null)
                                  .map((artifact, _, all) =>
                                    artifact.kind === 'visual' ? (
                                      <VisualFrame
                                        key={artifact.id}
                                        artifact={artifact}
                                        explored={visualBranches[artifact.id]}
                                        reveal={
                                          validSource && source?.artifactId === artifact.id
                                            ? source
                                            : undefined
                                        }
                                        onPart={openVisualPart}
                                        onRetry={() => videoAction(tree.id, artifact.id, 'retry')}
                                        onRegenerate={() =>
                                          videoAction(tree.id, artifact.id, 'regenerate')
                                        }
                                      />
                                    ) : artifact.kind === 'video' ? (
                                      <VideoCard
                                        key={artifact.id}
                                        inline
                                        artifact={artifact}
                                        onAction={(action) =>
                                          videoAction(tree.id, artifact.id, action)
                                        }
                                      />
                                    ) : (
                                      <DiagramCard
                                        key={artifact.id}
                                        artifact={artifact}
                                        steps={all.filter((a) => a.kind === 'mermaid')}
                                        onRetry={() => videoAction(tree.id, artifact.id, 'retry')}
                                      />
                                    ),
                                  )}
                              {!overview &&
                                message.role === 'assistant' &&
                                message.status === 'completed' &&
                                suggestions?.status === 'failed' && (
                                  <Text type="supporting" color="secondary">
                                    Suggestions unavailable
                                  </Text>
                                )}
                              {message.status !== 'completed' && (
                                <HStack
                                  gap={2}
                                  vAlign="center"
                                  className={
                                    message.status === 'failed' ? 'failure-banner' : undefined
                                  }
                                >
                                  <Text
                                    type="supporting"
                                    role="status"
                                    className="reply-status"
                                    data-status={message.status}
                                  >
                                    {message.status === 'streaming'
                                      ? 'Responding…'
                                      : message.status === 'failed' &&
                                          message === tree.messages.at(-1) &&
                                          tree.compaction?.error
                                        ? `${tree.compaction.error} The focused chat is kept; no reply was written without its context.`
                                        : `Reply ${message.status}.${message.stopped === 'learner' ? ' You stopped this reply.' : ''} You can send another question.`}
                                  </Text>
                                  {!overview &&
                                    !active &&
                                    message === tree.messages.at(-1) &&
                                    (message.status === 'failed' ||
                                      message.stopped === 'shutdown') &&
                                    tree.messages.at(-2)?.role === 'user' && (
                                      <Button
                                        label="Retry reply"
                                        variant="secondary"
                                        size="sm"
                                        onClick={() =>
                                          void send(tree.messages.at(-2)!.text, tree, true)
                                        }
                                      />
                                    )}
                                </HStack>
                              )}
                            </ChatMessage>
                          );
                        })}
                      </ChatMessageList>
                    </ChatLayout>
                    {!mobile && !overview && questions.length > 1 && (
                      <TurnRail
                        questions={questions}
                        jump={(message) => setMessageTarget({ conversation: tree.id, message })}
                      />
                    )}
                  </>
                ) : (
                  <VStack gap={0} className="overview">
                    <HStack
                      padding={1}
                      className="map-toolbar"
                      role="group"
                      aria-label="Tree view controls"
                    >
                      {menu()}
                    </HStack>
                    <VStack
                      padding={6}
                      gap={3}
                      hAlign="center"
                      vAlign="center"
                      className="empty-map"
                    >
                      {!state && error ? (
                        <Button
                          label="Retry loading learning trees"
                          variant="secondary"
                          onClick={loadInitial}
                        />
                      ) : loading || !state ? (
                        <TreeLoading />
                      ) : selected.current ? (
                        <TreeLoadFailure retry={() => void select(selected.current!)} />
                      ) : (
                        tab === 'learning' && firstQuestion
                      )}
                    </VStack>
                  </VStack>
                )}
              </section>
              {root && state && !overview && !expanded && !mobile && (
                <div
                  className="chat-divider"
                  role="separator"
                  tabIndex={0}
                  aria-label="Resize map"
                  aria-controls="learning-tree-map"
                  aria-orientation="vertical"
                  aria-valuemin={MIN_MAP_WIDTH}
                  aria-valuemax={Math.round(maxMapWidth(workspaceWidth))}
                  aria-valuenow={Math.round(shownMapWidth)}
                  aria-valuetext={`Map width ${Math.round(shownMapWidth)} rem`}
                  title="Drag to resize the map. Double-click to reset."
                  onPointerDown={(e) => {
                    if (e.button) return;
                    e.preventDefault();
                    e.currentTarget.setPointerCapture(e.pointerId);
                  }}
                  onPointerMove={(e) => {
                    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
                    const box = workspace.current!.getBoundingClientRect();
                    setMapWidth(
                      clampMapWidth((box.right - e.clientX) / remPx(), box.width / remPx()),
                    );
                  }}
                  onDoubleClick={() => setMapWidth(resetMapWidth(workspaceWidth))}
                  onKeyDown={(e) => {
                    const next = keyMapWidth(shownMapWidth, e.key, workspaceWidth, e.shiftKey);
                    if (next === undefined) return;
                    e.preventDefault();
                    setMapWidth(next);
                  }}
                />
              )}
              {root && state && (
                <section
                  id="learning-tree-map"
                  className="overview"
                  data-chat-open={!overview}
                  aria-label="Learning tree"
                >
                  <TreeOverview
                    vim={vim}
                    toolbar={
                      overview &&
                      tree && (
                        <IconButton
                          label="Reopen chat"
                          tooltip={`Open chat: ${tree.title}`}
                          icon={<ChatBubbleLeftRightIcon />}
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            focusComposer.current = true;
                            changeView(false, tree.id);
                          }}
                        />
                      )
                    }
                    menu={menu}
                    key={root}
                    root={root}
                    trees={state.trees}
                    previews={previews}
                    active={state.active}
                    open={(id, source, message) =>
                      void openConversation(id, source, undefined, message)
                    }
                    retry={retryFromMap}
                    save={savePositions}
                    saveViewport={saveViewport}
                    focus={overview ? overviewOrigin.current?.id : undefined}
                    focusControl={overviewOrigin.current?.control}
                    transition={overview ? transitionBox : undefined}
                    selected={overview ? undefined : tree?.id}
                    current={tree?.id}
                    initialFolded={state.trees.find((t) => t.id === root)?.layout?.folded}
                    onFold={(ids) => setFolds({ root, ids })}
                  />
                </section>
              )}
            </section>
          </section>
        </main>
        <main
          hidden={tab !== 'library'}
          className="library-panel"
          aria-label="Learning trees"
          onScroll={(e) => {
            scrollQuiet.current = markLibraryScrolling(e.currentTarget, scrollQuiet.current);
          }}
        >
          {tab === 'library' && (
            <VStack gap={0} className="library-content">
              <HStack gap={4} vAlign="end" wrap="wrap" className="library-head">
                <VStack gap={2}>
                  <Heading level={1}>Library</Heading>
                  <Text color="secondary" className="library-intro">
                    Every learning tree you have started. A tree keeps its root conversation and
                    every branch.
                  </Text>
                </VStack>
                <Button
                  label={busy ? 'Opening…' : 'New chat'}
                  variant="primary"
                  icon={<PlusIcon />}
                  isDisabled={busy}
                  onClick={newChat}
                />
              </HStack>
              {error && (
                <Text className="failure-banner" role="alert">
                  {error}
                </Text>
              )}
              {state && !state.trees.length
                ? firstQuestion
                : state && (
                    <>
                      <HStack gap={2} vAlign="center" wrap="wrap" className="library-tools">
                        <TextInput
                          label="Search learning tree titles"
                          isLabelHidden
                          placeholder="Search learning trees"
                          startIcon={MagnifyingGlassIcon}
                          size="sm"
                          hasClear
                          value={libraryQuery}
                          onChange={setLibraryQuery}
                          width={320}
                        />
                        <SegmentedControl
                          label="Library layout"
                          value={libraryLayout}
                          onChange={(v) => {
                            setLibraryLayout(v as 'shelf' | 'list');
                            try {
                              localStorage.setItem('treetutor.library-layout', v);
                            } catch {
                              /* Preference stays for this session only. */
                            }
                          }}
                        >
                          <SegmentedControlItem
                            value="shelf"
                            label="Shelf"
                            icon={<RectangleStackIcon />}
                          />
                          <SegmentedControlItem
                            value="list"
                            label="List"
                            icon={<ListBulletIcon />}
                          />
                        </SegmentedControl>
                      </HStack>
                      <nav
                        aria-label="Saved learning trees"
                        className="tree-list"
                        data-layout={libraryLayout}
                      >
                        {libraryGroups.map((group) => (
                          <section key={group.label} aria-label={group.label}>
                            <Heading level={2} className="tree-date-heading">
                              {group.label}
                            </Heading>
                            <ul className={libraryLayout === 'shelf' ? 'shelf' : 'library-list'}>
                              {group.trees.map(({ tree: t, branches, spine }) => (
                                <li
                                  key={t.id}
                                  className="volume"
                                  data-current={root === t.id}
                                  data-renaming={
                                    renaming?.id === t.id && renaming.place === 'library'
                                  }
                                >
                                  {renaming?.id === t.id && renaming.place === 'library' ? (
                                    <TitleEditor
                                      title={t.title}
                                      save={(title) => rename(t.id, title)}
                                      cancel={finishRename}
                                    />
                                  ) : (
                                    <>
                                      <span className="volume-band">
                                        <Button
                                          className="saved-chat-title"
                                          label={t.title}
                                          variant="ghost"
                                          aria-current={root === t.id ? 'true' : undefined}
                                          aria-describedby={`tree-date-${t.id} branch-count-${t.id}`}
                                          onClick={() => openTree(t.id, undefined, undefined, true)}
                                        >
                                          <Text as="span" type="inherit" maxLines={4}>
                                            {t.title}
                                          </Text>
                                        </Button>
                                        <Text
                                          as="span"
                                          type="supporting"
                                          id={`tree-date-${t.id}`}
                                          className="volume-date"
                                        >
                                          <time dateTime={new Date(t.created).toISOString()}>
                                            Started{' '}
                                            {new Date(t.created).toLocaleDateString(undefined, {
                                              day: 'numeric',
                                              month: 'short',
                                              year:
                                                new Date(t.created).getFullYear() ===
                                                today.getFullYear()
                                                  ? undefined
                                                  : 'numeric',
                                            })}
                                          </time>
                                        </Text>
                                      </span>
                                      <span className="volume-meta">
                                        <span
                                          className="volume-spine"
                                          aria-hidden
                                          title="One tick per conversation, in its branch family's ink"
                                        >
                                          {spine.map((ink, i) => (
                                            <i key={i} style={inkStyle(ink)} />
                                          ))}
                                        </span>
                                        <Text
                                          type="supporting"
                                          color="secondary"
                                          id={`branch-count-${t.id}`}
                                        >
                                          {branches + 1}{' '}
                                          {branches ? 'conversations' : 'conversation'} · {branches}{' '}
                                          {branches === 1 ? 'branch' : 'branches'}
                                        </Text>
                                      </span>
                                      <DropdownMenu
                                        presentation="popover"
                                        alignment="end"
                                        renderTrigger={(props) => (
                                          <IconButton
                                            {...props}
                                            id={`chat-actions-${t.id}`}
                                            className="tree-row-actions"
                                            label={`Actions for ${t.title}`}
                                            icon={<EllipsisHorizontalIcon />}
                                            variant="ghost"
                                            size="sm"
                                          />
                                        )}
                                      >
                                        <DropdownMenuItem
                                          label="Rename chat"
                                          icon={<PencilSquareIcon />}
                                          onClick={() =>
                                            setRenaming({ id: t.id, place: 'library' })
                                          }
                                        />
                                        <DropdownMenuItem
                                          className="delete-menu-item"
                                          label="Delete chat…"
                                          icon={<TrashIcon />}
                                          onClick={() =>
                                            askDelete(
                                              t.id,
                                              document.getElementById(`chat-actions-${t.id}`),
                                            )
                                          }
                                        />
                                      </DropdownMenu>
                                    </>
                                  )}
                                </li>
                              ))}
                            </ul>
                          </section>
                        ))}
                        {!libraryGroups.length && (
                          <Text color="secondary">No learning tree titles match.</Text>
                        )}
                      </nav>
                    </>
                  )}
            </VStack>
          )}
        </main>
        <main hidden={tab !== 'knowledge'} className="knowledge-panel" aria-label="Knowledge">
          {tab === 'knowledge' && (
            <>
              <HStack padding={3} className="knowledge-header">
                <Button
                  id="return-to-learning"
                  label="Return to learning tree"
                  variant="ghost"
                  icon={<ArrowUturnLeftIcon />}
                  onClick={() => {
                    setTab('learning');
                    requestAnimationFrame(() =>
                      document
                        .querySelector<HTMLElement>(
                          overview ? '.map-toolbar button' : '#rename-conversation',
                        )
                        ?.focus(),
                    );
                  }}
                />
              </HStack>
              <KnowledgePage api={api} activity={activeKey} />
            </>
          )}
        </main>
        <main hidden={tab !== 'videos'} className="knowledge-panel" aria-label="Videos">
          {tab === 'videos' && (
            <>
              <HStack padding={3} className="knowledge-header">
                <Button
                  id="return-from-videos"
                  label="Return to learning tree"
                  variant="ghost"
                  icon={<ArrowUturnLeftIcon />}
                  onClick={() => {
                    setTab('learning');
                    requestAnimationFrame(() =>
                      document
                        .querySelector<HTMLElement>(
                          overview ? '.map-toolbar button' : '#rename-conversation',
                        )
                        ?.focus(),
                    );
                  }}
                />
              </HStack>
              <VideoLibrary api={api} activity={activeKey} />
            </>
          )}
        </main>
        <SettingsWindow
          request={tab === 'settings' ? settings : undefined}
          close={closeSettings}
          api={api}
          models={models}
          providers={providers}
          modelError={modelError}
          loadModels={loadModels}
          conceptNameTokens={state?.conceptNameTokens}
          auth={state?.auth}
          signIn={signIn}
          vim={vim}
          setVim={(on) => {
            setVim(on);
            savePreference('vim', on ? 'on' : 'off');
          }}
          appearance={appearance}
          setAppearance={setAppearance}
          theme={theme}
          setTheme={setTheme}
        />
      </HStack>
      <AlertDialog
        className="delete-dialog"
        width="min(420px, calc(100vw - 2rem))"
        data-failed={!!deleteError}
        isOpen={!!deletion}
        onOpenChange={(open) => {
          if (!open) cancelDelete();
        }}
        title={`Delete ${deletion?.parent ? 'branch' : 'chat'} “${deletion?.title ?? ''}”?`}
        description={`${deletion?.count ?? 0} ${(deletion?.count ?? 0) === 1 ? 'conversation' : 'conversations'} and their messages, branches, diagrams and saved layout will be permanently deleted. Ready videos stay in Videos. Active replies and video jobs in these conversations will stop. This cannot be undone.${deleteError ? ` Deletion failed: ${deleteError}` : ''}`}
        actionLabel={deletion?.parent ? 'Delete branch' : 'Delete chat'}
        cancelLabel="Keep conversations"
        isActionLoading={deleting}
        onAction={() => void deleteConversation()}
      />
    </VStack>
  );
}
