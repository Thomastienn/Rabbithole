import { useEffect, useState } from 'react';
import { branchRequest, prepareBranch, type Anchor } from './branch';
import { partTrail, visualPassage } from '../media/artifacts';
import type { PartAction, VisualBranch } from '../media/VisualFrame';
import type { DiscussionBranch } from '../media/DiscussionCard';
import type { Tree } from './types';
import type { ChatState } from './useChatState';
import { request as api } from '../serverAccess';
import type { LearningTrees } from './useLearningTrees';
import type { ChatModel } from './useChatModel';
import type { ReplyStream } from './useReplyStream';

// Branch form: opening it from a passage or a visual's Ask button, inherited context preparation and submit.
export function useBranchForm(
    c: ChatState,
    { refresh, openConversation }: LearningTrees,
    { savingModel }: ChatModel,
    { send }: ReplyStream,
) {
    const { tree, state, branch, setBranch, branchOrigin, selected, setError } = c;
    const { overview, setOverview, overviewOrigin, focusComposer, request, setTree, setLoading } =
        c;
    const { setDrafts } = c;
    const [branching, setBranching] = useState(false);
    // Escape returns focus to the passage or underline that opened the popup; an outside click keeps focus where it lands.
    function closeBranch(refocus: boolean) {
        setBranch(undefined);
        requestAnimationFrame(() => {
            if (refocus || !document.activeElement || document.activeElement === document.body)
                branchOrigin.current?.current?.focus({ preventScroll: !refocus });
        });
    }
    // The status of the reply the open form asks about; a streaming one holds the question until it ends.
    const replyStatus =
        branch?.parent === tree?.id
            ? tree?.messages.find((m) => m.id === branch?.anchor.messageId)?.status
            : undefined;
    // Compaction never sees the question, so it starts when the form opens, or once its reply completes; closing cancels (a no-op after submit took it).
    const prepareKey =
        branch &&
        !branch.pending &&
        replyStatus !== 'streaming' &&
        JSON.stringify([branch.parent, branchRequest(branch.anchor)]);
    useEffect(() => {
        if (!prepareKey) return;
        const [parent, anchor] = JSON.parse(prepareKey);
        return prepareBranch(parent, anchor);
    }, [prepareKey]);
    async function submitBranch(e: React.FormEvent) {
        e.preventDefault();
        if (!branch || !branch.question.trim()) return;
        if (replyStatus === 'streaming') return setBranch({ ...branch, pending: true });
        await createBranch(branch.parent, branchRequest(branch.anchor, branch.question));
    }
    // A completed reply sends the waiting question, so the child inherits the whole reply; a stopped or failed one gives it back.
    useEffect(() => {
        if (!branch?.pending || replyStatus === 'streaming') return;
        if (replyStatus !== 'completed') return setBranch({ ...branch, pending: false });
        // A refused branch keeps the box open with its error; the question can be sent again.
        void createBranch(branch.parent, branchRequest(branch.anchor, branch.question)).then(() =>
            setBranch((b) => b && { ...b, pending: false }),
        );
    }, [branch?.pending, replyStatus]);
    // follow: open the child from whichever conversation is selected (the map's +), unless the learner moves on.
    async function createBranch(
        parent: string,
        body: object,
        created?: () => void,
        follow = false,
    ) {
        if (branching || savingModel === parent) return;
        const opener = follow ? selected.current : parent;
        setBranching(true);
        setError('');
        try {
            const next: Tree = await api(`/api/trees/${parent}/branches`, body);
            const question = next.branch!.question;
            setDrafts((d) => ({ ...d, [next.id]: question }));
            overviewOrigin.current = undefined;
            setBranch(undefined);
            created?.();
            // Branch-first: the saved child opens at once from the response; its reply waits on the server for compaction.
            if (selected.current === opener) {
                focusComposer.current = true;
                setOverview(false);
                selected.current = next.id;
                ++request.current;
                setTree(next);
                setLoading(false);
            }
            const sending = send(question, next);
            await refresh();
            await sending;
        } catch (e) {
            if (selected.current === opener) setError((e as Error).message);
        } finally {
            setBranching(false);
        }
    }
    const visualBranches: Record<string, VisualBranch[]> = {};
    for (const t of state?.trees ?? [])
        if (t.parent === tree?.id && t.artifactId && t.label && t.explanation)
            (visualBranches[t.artifactId] ??= []).push({
                child: t.id,
                ...c.addresses.get(t.id),
                label: t.label,
                explanation: t.explanation,
                ...(t.trail && { trail: t.trail, step: t.step }),
            });
    const discussionBranches: Record<string, DiscussionBranch[]> = {};
    for (const t of state?.trees ?? [])
        if (
            t.parent === tree?.id &&
            t.artifactId &&
            t.line !== undefined &&
            t.start !== null &&
            t.end !== null
        )
            (discussionBranches[t.artifactId] ??= []).push({
                child: t.id,
                ...c.addresses.get(t.id),
                line: t.line,
                start: t.start,
                end: t.end,
            });
    // A groundwork branch has no start or end; its passage is the concept's name.
    const groundworkBranches: Record<
        string,
        { concept: string; child: string; address?: string; ink?: number }[]
    > = {};
    for (const t of state?.trees ?? [])
        if (t.parent === tree?.id && t.messageId && !t.artifactId && t.start === null && t.passage)
            (groundworkBranches[t.messageId] ??= []).push({
                concept: t.passage,
                child: t.id,
                ...c.addresses.get(t.id),
            });
    // Choosing a chip asks "What is <concept>?" at once; a chip already chosen opens its child.
    function chooseGroundwork(messageId: string, concept: string) {
        const child = groundworkBranches[messageId]?.find((b) => b.concept === concept)?.child;
        if (child) return openConversation(child);
        if (tree) return createBranch(tree.id, { messageId, groundwork: concept });
    }
    // Ask on the side: the typed question becomes a free branch hung off the latest completed reply, taking the parent's draft.
    const askOnSide = (question: string) =>
        tree &&
        createBranch(tree.id, { free: true, question }, () =>
            setDrafts((d) => ({ ...d, [tree.id]: '' })),
        );
    // The map's + asks on the side of any conversation and opens the child from wherever the learner is.
    const askFromMap = (parent: string, question: string, created: () => void) =>
        createBranch(parent, { free: true, question }, created, true);
    const openVisualPart: PartAction = (visual, part, origin, box, picker) => {
        if (
            !tree ||
            overview ||
            visual.status !== 'ready' ||
            visual.conversation !== tree.id ||
            !tree.messages.some((m) => m.id === visual.message && m.status === 'completed')
        )
            return;
        branchOrigin.current = origin;
        // A picked part floats the ask box over it, like an underline; the whole visual's Ask keeps the inline box.
        const reply = box
            ? document
                  .querySelector(`[data-chat-message="${CSS.escape(visual.message)}"] .passage`)
                  ?.getBoundingClientRect().top
            : undefined;
        setBranch({
            parent: tree.id,
            anchor: {
                messageId: visual.message,
                artifactId: visual.id,
                ...part,
                text: visualPassage(visual, part),
                ...(box &&
                    reply !== undefined && {
                        at: { x: 0, y: box.y - reply, below: box.y + box.height - reply },
                    }),
            },
            question: '',
            picker,
        });
        setError('');
    };
    // A part picked from the keyboard, or an earlier trail entry, becomes the visual's source.
    function pickPart(trail: string[], step?: number | null) {
        setBranch((b) => {
            const a = b?.anchor,
                visual = tree?.artifacts?.find((v) => v.id === a?.artifactId);
            if (!b || !a || !('label' in a) || !visual || !partTrail(trail)) return b;
            const part = {
                label: trail.at(-1)!,
                explanation: a.explanation,
                trail,
                step: step === undefined ? a.step : step,
            };
            return { ...b, anchor: { ...a, ...part, text: visualPassage(visual, part) } };
        });
    }
    // Choosing an earlier trail entry widens the source to that ancestor part, keeping its first depth names.
    function widenPart(depth: number) {
        const a = branch?.anchor,
            trail = a && 'trail' in a ? a.trail : undefined;
        if (trail && depth >= 1 && depth < trail.length) pickPart(trail.slice(0, depth));
    }
    function startBranch(
        parent: string,
        anchor: Anchor,
        origin: React.RefObject<HTMLElement | null>,
    ) {
        branchOrigin.current = origin;
        setBranch({ parent, anchor, question: '' });
        setError('');
    }
    // A brief explanation of a reply passage, saved by the server and served from storage on reopening.
    // Kept on the open conversation so its popup and reopened textbox show it without reloading.
    // A visual part's explanation is not saved.
    const explainBrief = (parent: string, anchor: Anchor) =>
        api(`/api/trees/${parent}/brief`, branchRequest(anchor)).then(
            ({ explanation }: { explanation: string }) => {
                if (anchor.artifactId !== undefined) return explanation;
                const saved = {
                    message: anchor.messageId,
                    start: anchor.start!,
                    end: anchor.end!,
                    explanation,
                };
                setTree((t) =>
                    t?.id === parent
                        ? {
                              ...t,
                              briefs: [
                                  ...(t.briefs ?? []).filter(
                                      (b) =>
                                          !(
                                              b.message === saved.message &&
                                              b.start === saved.start &&
                                              b.end === saved.end
                                          ),
                                  ),
                                  saved,
                              ],
                          }
                        : t,
                );
                return explanation;
            },
        );
    return {
        explainBrief,
        branching,
        closeBranch,
        submitBranch,
        visualBranches,
        discussionBranches,
        openVisualPart,
        widenPart,
        pickPart,
        startBranch,
        groundworkBranches,
        chooseGroundwork,
        askOnSide,
        askFromMap,
    };
}

export type BranchFormState = ReturnType<typeof useBranchForm>;
