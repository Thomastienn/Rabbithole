import {
    memo,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
    useSyncExternalStore,
} from 'react';
import { Text } from '@astryxdesign/core/Text';
import { ensureHighlightStyles } from '@astryxdesign/core/CodeBlock';
import type { Source } from '../map/TreeOverview';
import { renderMarkdown } from '../markdown/markdown';
import { grammars } from '../markdown/codeTokens';
import { imageSources } from '../markdown/ReplyImage';
import type { ToolCall } from './turn';
import type { Resource } from './types';
import type { Artifact, DiscussionReply } from '../media/artifacts';
import DiscussionCard, { type DiscussionBranch } from '../media/DiscussionCard';
import VideoCard from '../media/VideoCard';
import VisualFrame, { type PartAction, type VisualBranch } from '../media/VisualFrame';

// Below this reply width, reply layouts render as plain flow.
const LAYOUT_MIN_WIDTH = 480;

// Parsing is memoised so streaming chunks and selection state changes reuse the rendered tree.
const Reply = memo(function Reply({
    text,
    streaming,
    tools = [],
    reveal,
    underlines,
    inlineArtifacts = [],
    onArtifactAction,
    onDiscussionReply,
    onExpandSketch,
    onVisualPart,
    visualBranches,
    discussionBranches,
    onOpenChild,
    resources = [],
}: {
    text: string;
    streaming?: boolean;
    tools?: ToolCall[];
    reveal?: Source;
    underlines: { start: number; end: number; child?: string }[];
    inlineArtifacts?: Artifact[];
    onVisualPart?: PartAction;
    visualBranches?: Record<string, VisualBranch[]>;
    discussionBranches?: Record<string, DiscussionBranch[]>;
    onOpenChild?: (id: string) => void;
    resources?: Resource[];
    onArtifactAction?: (
        id: string,
        action: 'cancel' | 'retry' | 'regenerate' | 'install' | 'previous' | 'sketch',
        instruction?: string,
    ) => Promise<void>;
    onDiscussionReply?: DiscussionReply;
    onExpandSketch?: (at: number) => Promise<void>;
}) {
    useEffect(ensureHighlightStyles, []);
    const grammarVersion = useSyncExternalStore(grammars.subscribe, grammars.version);
    const box = useRef<HTMLElement>(null),
        [narrow, setNarrow] = useState(false);
    useLayoutEffect(() => {
        const el = box.current!,
            measure = () => setNarrow(el.clientWidth < LAYOUT_MIN_WIDTH);
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(el);
        return () => observer.disconnect();
    }, []);
    const action = useRef(onArtifactAction),
        discussionReply = useRef(onDiscussionReply),
        partAction = useRef(onVisualPart),
        openChild = useRef(onOpenChild),
        expandSketch = useRef(onExpandSketch);
    expandSketch.current = onExpandSketch;
    openChild.current = onOpenChild;
    action.current = onArtifactAction;
    discussionReply.current = onDiscussionReply;
    partAction.current = onVisualPart;
    const key = JSON.stringify(underlines),
        toolKey = JSON.stringify(tools),
        artifactKey = JSON.stringify(inlineArtifacts),
        visualBranchKey = JSON.stringify(visualBranches),
        discussionBranchKey = JSON.stringify(discussionBranches),
        links = Object.fromEntries(resources.map((r) => [r.number, r.url])),
        linkKey = JSON.stringify(links);
    return (
        <Text ref={box} as="div" type="body" className="reply-md">
            {useMemo(
                () =>
                    renderMarkdown(
                        text,
                        reveal?.artifactId === undefined ? reveal : undefined,
                        underlines,
                        inlineArtifacts.map((v) => ({
                            at: v.position!,
                            kind: v.kind,
                            side: v.side,
                            ...(v.sketch && { sketch: { id: v.id, shown: v.sketch === 'shown' } }),
                            node:
                                v.kind === 'discussion' ? (
                                    <DiscussionCard
                                        key={v.id}
                                        artifact={v}
                                        onReply={
                                            onDiscussionReply &&
                                            ((a, text) => discussionReply.current!(a, text))
                                        }
                                        explored={discussionBranches?.[v.id]}
                                        onOpenChild={(id) => openChild.current?.(id)}
                                    />
                                ) : v.kind === 'video' ? (
                                    <VideoCard
                                        key={v.id}
                                        inline
                                        artifact={v}
                                        onAction={
                                            onArtifactAction &&
                                            ((kind, instruction) =>
                                                action.current!(v.id, kind, instruction))
                                        }
                                    />
                                ) : (
                                    <VisualFrame
                                        key={v.id}
                                        artifact={v}
                                        explored={visualBranches?.[v.id]}
                                        onOpenChild={(id) => openChild.current?.(id)}
                                        reveal={
                                            reveal?.artifactId === v.id && reveal.line === undefined
                                                ? reveal
                                                : undefined
                                        }
                                        onPart={(...args) => partAction.current?.(...args)}
                                        onRetry={
                                            onArtifactAction &&
                                            (() => action.current!(v.id, 'retry'))
                                        }
                                        onRegenerate={
                                            onArtifactAction &&
                                            ((instruction) =>
                                                action.current!(v.id, 'regenerate', instruction))
                                        }
                                        onPrevious={
                                            onArtifactAction &&
                                            (() => action.current!(v.id, 'previous'))
                                        }
                                        onShowSketch={
                                            onArtifactAction &&
                                            v.sketch &&
                                            (() => action.current!(v.id, 'sketch'))
                                        }
                                    />
                                ),
                        })),
                        imageSources(tools),
                        narrow,
                        links,
                        streaming === undefined ? 'off' : streaming ? 'streaming' : 'saved',
                        // Show visual brings back the sketch's visual; Expand into visual asks for one.
                        onExpandSketch && onArtifactAction && streaming === false
                            ? (at) => {
                                  const v = inlineArtifacts.find(
                                      (a) => a.sketch && a.position === at,
                                  );
                                  void (v
                                      ? action.current!(v.id, 'sketch')
                                      : expandSketch.current!(at));
                              }
                            : undefined,
                    ),
                [
                    text,
                    streaming,
                    reveal?.start,
                    reveal?.end,
                    reveal?.text,
                    key,
                    toolKey,
                    artifactKey,
                    visualBranchKey,
                    discussionBranchKey,
                    linkKey,
                    reveal?.artifactId,
                    !!onArtifactAction,
                    !!onDiscussionReply,
                    !!onExpandSketch,
                    narrow,
                    grammarVersion,
                ],
            )}
        </Text>
    );
});

export default Reply;
