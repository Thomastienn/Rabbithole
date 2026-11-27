import { useLayoutEffect, useRef } from 'react';
import { IconButton } from '@astryxdesign/core/IconButton';
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import Passage from '../chat/Passage';
import BranchForm from '../chat/BranchForm';
import { passageBranches, type ThreadProps } from '../chat/ChatThread';
import type { Message } from '../chat/turn';
import { rawRange } from '../markdown/markdown';

// The transcript rail (mockup Rabbithole-brd.15): what was said beside the board, the sentence being spoken in porcelain.
// A reply passage branches as in chat, with the chat's own Passage and BranchForm.
export default function TranscriptRail({
    conversation,
    messages,
    now,
    paused,
    open,
    toggle,
    thread,
    submit,
    askHere,
}: {
    conversation: string;
    messages: Message[];
    // The reply being spoken and its current sentence, as offsets into its text.
    now?: { id: string; start: number; end: number };
    paused: boolean;
    open: boolean;
    toggle: () => void;
    thread: ThreadProps;
    submit: (e: React.FormEvent) => void;
    askHere?: () => void;
}) {
    const list = useRef<HTMLDivElement>(null);
    const { branch, addresses, trees, selectingMessage, setSelectingMessage } = thread;
    const formOpen = branch?.parent === conversation;
    const last = messages.at(-1);
    // The newest line stays in view, unless the learner holds a selection or the passage box there.
    useLayoutEffect(() => {
        const box = list.current;
        if (!box || formOpen || selectingMessage) return;
        const selection = window.getSelection();
        if (selection && !selection.isCollapsed && box.contains(selection.anchorNode)) return;
        box.scrollTop = box.scrollHeight;
    }, [messages.length, last?.text, formOpen, open]);
    // The spoken sentence is painted with the CSS Custom Highlight API, so selection and offsets stay the chat's.
    useLayoutEffect(() => {
        const root = now && list.current?.querySelector(`[data-rail-reply="${now.id}"] section`);
        const range =
            root && typeof Highlight !== 'undefined' && rawRange(root, now.start, now.end);
        if (!range) return;
        const mine = new Highlight(range);
        CSS.highlights.set('board-now', mine);
        return () => {
            if (CSS.highlights.get('board-now') === mine) CSS.highlights.delete('board-now');
        };
    }, [now?.id, now?.start, now?.end, open]);
    if (!open)
        return (
            <aside className="board-rail shut" aria-label="Transcript">
                <IconButton
                    label="Show transcript"
                    aria-expanded={false}
                    icon={<ChevronLeftIcon />}
                    variant="ghost"
                    onClick={toggle}
                />
            </aside>
        );
    const replies = messages.filter((m) => m.role === 'assistant');
    return (
        <aside className="board-rail" aria-label="Transcript">
            <div className="board-rail-head">
                <span className="board-rail-title">Transcript</span>
                {paused && <span role="status">Paused</span>}
                <IconButton
                    label="Collapse transcript"
                    aria-expanded
                    icon={<ChevronRightIcon />}
                    variant="ghost"
                    onClick={toggle}
                />
            </div>
            <div ref={list} className="board-rail-list" role="log" aria-label="What was said">
                {messages.map((m) =>
                    m.role === 'user' ? (
                        <div key={m.id} className="board-rail-question">
                            {m.text}
                        </div>
                    ) : (
                        <div key={m.id} className="board-rail-reply" data-rail-reply={m.id}>
                            <Passage
                                message={m}
                                addresses={addresses}
                                index={replies.indexOf(m) + 1}
                                branched={passageBranches(trees, conversation, m.id)}
                                onBranch={(anchor, origin) =>
                                    thread.startBranch(conversation, anchor, origin)
                                }
                                onOpenChild={(id) => void thread.openConversation(id)}
                                selecting={selectingMessage === m.id}
                                openSelection={() => setSelectingMessage(m.id)}
                                closeSelection={() => setSelectingMessage(undefined)}
                                // The box opens inline at the rail's width, wherever Ask was clicked.
                                form={
                                    formOpen && branch.anchor.messageId === m.id
                                        ? {
                                              start: branch.anchor.start,
                                              end: branch.anchor.end,
                                              node: (
                                                  <BranchForm
                                                      branch={branch}
                                                      branching={thread.branching}
                                                      active={false}
                                                      submit={submit}
                                                      askHere={askHere}
                                                      close={thread.closeBranch}
                                                      setQuestion={thread.setQuestion}
                                                      explain={(anchor) =>
                                                          thread.explainBrief(conversation, anchor)
                                                      }
                                                  />
                                              ),
                                          }
                                        : undefined
                                }
                            />
                        </div>
                    ),
                )}
            </div>
        </aside>
    );
}
