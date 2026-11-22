import { useState } from 'react';
import { Button } from '@astryxdesign/core/Button';
import type { Source } from '../map/TreeOverview';
import type { Branch } from './branch';

// shortcut: length/line heuristic instead of measuring overflow; measure with scrollHeight if it misfires.
const isLong = (text: string) => text.length > 160 || text.split('\n').length > 2;

export function originSource(branch: Branch): Source {
    return branch.line !== undefined
        ? {
              messageId: branch.messageId,
              text: branch.text,
              artifactId: branch.artifactId!,
              line: branch.line,
              start: branch.start ?? -1,
              end: branch.end ?? -1,
          }
        : branch.artifactId
          ? {
                messageId: branch.messageId,
                text: branch.text,
                artifactId: branch.artifactId,
                label: branch.label ?? '',
                explanation: branch.explanation ?? '',
                ...(branch.trail && { trail: branch.trail, step: branch.step }),
            }
          : {
                messageId: branch.messageId,
                start: branch.start ?? -1,
                end: branch.end ?? -1,
                text: branch.text,
            };
}

// The origin line under a child's title: "From <parent> at “passage”", or "Asked on the side of <parent>" for a free branch; the parent link jumps to the source.
export default function OriginStrip({
    branch,
    question,
    parentAddress,
    parentTitle,
    openParent,
}: {
    branch: Branch;
    question?: string;
    parentAddress: string;
    parentTitle: string;
    openParent: (source?: Source) => void;
}) {
    const [all, setAll] = useState(false);
    // Visual branches store a composed passage; its first line carries the visual's title.
    const text = branch.artifactId
        ? (/^Visual: (.*)/.exec(branch.text)?.[1] ?? branch.text)
        : branch.text.trim();
    const long = isLong(text);
    // An empty passage marks a free branch, asked after the parent's latest reply.
    const free = branch.text === '';
    return (
        <section className="origin-strip" aria-label="Conversation origin">
            <p className="origin-line">
                <span className="origin-ring" aria-hidden />
                <span>
                    {free ? 'Asked on the side of' : 'From'}{' '}
                    <Button
                        className="origin-chip"
                        label={`Open ${parentAddress} ${parentTitle} at the source`.replace(
                            /\s+/g,
                            ' ',
                        )}
                        variant="ghost"
                        size="sm"
                        onClick={() => openParent(free ? undefined : originSource(branch))}
                    >
                        {[parentAddress, parentTitle].filter(Boolean).join(' · ')}
                    </Button>
                    {free ? (
                        ', after its latest reply'
                    ) : text ? (
                        <>
                            {' '}
                            at{' '}
                            <q
                                id="origin-source"
                                className="origin-source"
                                data-clamped={long && !all ? '' : undefined}
                            >
                                {text}
                            </q>
                            {long && (
                                <Button
                                    label={all ? 'Show less' : 'Show all'}
                                    aria-expanded={all}
                                    aria-controls="origin-source"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setAll((a) => !a)}
                                />
                            )}
                        </>
                    ) : (
                        <>
                            {' '}
                            · <span className="origin-source">Source passage unavailable</span>
                        </>
                    )}
                </span>
            </p>
            {question && <p className="origin-question">{question}</p>}
        </section>
    );
}
