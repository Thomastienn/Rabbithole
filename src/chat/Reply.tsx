import { memo, useEffect, useMemo, useRef } from 'react';
import { Text } from '@astryxdesign/core/Text';
import { ensureHighlightStyles } from '@astryxdesign/core/CodeBlock';
import type { Source } from '../map/TreeOverview';
import { renderMarkdown } from '../markdown/markdown';
import { imageSources } from '../markdown/ReplyImage';
import type { ToolCall } from './turn';
import type { Artifact } from '../media/artifacts';
import VideoCard from '../media/VideoCard';
import VisualFrame, { type PartAction, type VisualBranch } from '../media/VisualFrame';

// Parsing is memoised so streaming chunks and selection state changes reuse the rendered tree.
const Reply = memo(function Reply({
  text,
  tools = [],
  reveal,
  underlines,
  inlineArtifacts = [],
  onArtifactAction,
  onVisualPart,
  visualBranches,
  onOpenChild,
}: {
  text: string;
  tools?: ToolCall[];
  reveal?: Source;
  underlines: { start: number; end: number; child?: string }[];
  inlineArtifacts?: Artifact[];
  onVisualPart?: PartAction;
  visualBranches?: Record<string, VisualBranch[]>;
  onOpenChild?: (id: string) => void;
  onArtifactAction?: (id: string, action: 'cancel' | 'retry' | 'regenerate') => Promise<void>;
}) {
  useEffect(ensureHighlightStyles, []);
  const action = useRef(onArtifactAction),
    partAction = useRef(onVisualPart),
    openChild = useRef(onOpenChild);
  openChild.current = onOpenChild;
  action.current = onArtifactAction;
  partAction.current = onVisualPart;
  const key = JSON.stringify(underlines),
    toolKey = JSON.stringify(tools),
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
                    onOpenChild={(id) => openChild.current?.(id)}
                    reveal={reveal?.artifactId === v.id ? reveal : undefined}
                    onPart={(...args) => partAction.current?.(...args)}
                    onRetry={onArtifactAction && (() => action.current!(v.id, 'retry'))}
                    onRegenerate={onArtifactAction && (() => action.current!(v.id, 'regenerate'))}
                  />
                ),
            })),
            imageSources(tools),
          ),
        [
          text,
          reveal?.start,
          reveal?.end,
          reveal?.text,
          key,
          toolKey,
          artifactKey,
          visualBranchKey,
          reveal?.artifactId,
          !!onArtifactAction,
        ],
      )}
    </Text>
  );
});

export default Reply;
