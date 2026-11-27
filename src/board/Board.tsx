import { useState } from 'react';
import { IconButton } from '@astryxdesign/core/IconButton';
import { ChatComposer, ChatComposerInput } from '@astryxdesign/core/Chat';
import { ArrowUpIcon, ExclamationTriangleIcon, MicrophoneIcon } from '@heroicons/react/24/outline';
import { holdEnter } from '../chat/Attachments';
import type { Message } from '../chat/turn';
import { useBoard } from './useBoard';

const STATES = { thinking: 'Thinking', speaking: 'Speaking' } as const;

// The board column (mockup Rabbithole-brd.1): the board field, the caption line and the board's composer.
// Nothing is drawn or spoken yet; the tutor's sentences show one at a time as the caption.
export default function Board({
    conversation,
    messages,
    reload,
}: {
    conversation: string;
    messages: Message[];
    reload: () => void;
}) {
    const board = useBoard(conversation, messages, reload);
    const [draft, setDraft] = useState('');
    const busy = board.state !== 'idle' || !board.ready;
    const submit = (text: string) => {
        if (busy || !text.trim()) return;
        board.ask(text.trim());
        setDraft('');
    };
    return (
        <section className="board-column" aria-label="Board">
            <div className="board-field">
                <div className="board">
                    <svg viewBox="0 0 1600 900" role="img" aria-label="Board" />
                    {!board.asked && <p className="board-empty">Ask a question to start.</p>}
                    {board.notice && (
                        <p className="board-notice" role="alert">
                            <ExclamationTriangleIcon aria-hidden />
                            {board.notice}
                        </p>
                    )}
                </div>
            </div>
            <div className="board-line">
                <span role="status">
                    {board.state !== 'idle' && (
                        <span className={`board-state ${board.state}`}>{STATES[board.state]}</span>
                    )}
                </span>
                <p
                    className={`board-caption${board.caption?.muted ? ' muted' : ''}`}
                    aria-live="polite"
                >
                    {board.caption?.text}
                </p>
                <span />
            </div>
            <div className="board-foot">
                <ChatComposer
                    className="board-composer"
                    elevation="none"
                    value={draft}
                    onChange={setDraft}
                    onSubmit={submit}
                    sendButton={
                        busy ? (
                            <IconButton
                                label="Send"
                                icon={<ArrowUpIcon />}
                                variant="primary"
                                isDisabled
                            />
                        ) : undefined
                    }
                    footerActions={
                        // Voice arrives in a later ticket; the mic is off when a board opens.
                        <IconButton
                            className="board-mic"
                            label="Turn mic on"
                            aria-pressed={false}
                            icon={<MicrophoneIcon />}
                            variant="ghost"
                            isDisabled
                        />
                    }
                    input={
                        <ChatComposerInput
                            label="Your question"
                            maxRows={4}
                            value={draft}
                            onChange={setDraft}
                            // Typing stays open while the tutor speaks; only Enter waits for it to finish.
                            onKeyDown={(e) => busy && holdEnter(e)}
                            placeholder="Ask a question"
                        />
                    }
                />
            </div>
        </section>
    );
}
