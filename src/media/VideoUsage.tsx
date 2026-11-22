import { useId, useState } from 'react';
import { Button } from '@astryxdesign/core/Button';
import { Text } from '@astryxdesign/core/Text';
import { request } from '../serverAccess';

type Row = {
    stage: string | null;
    model: string | null;
    calls: number;
    reported: number;
    input: number;
    output: number;
    cacheRead: number;
    reasoning: number | null;
};
const STAGE: Record<string, string> = {
    plan: 'Plan',
    pieces: 'Set pieces',
    improve: 'Piece improvement',
    cut: 'Cut writing',
    audit: 'Audit',
    fix: 'Fix',
    repair: 'Repair',
};

// Tokens only, no prices (spec "Usage record"); fetched when opened, so a closed card costs nothing.
export default function VideoUsage({ url, title }: { url: string; title: string }) {
    const id = useId();
    const [rows, setRows] = useState<Row[] | null | 'error'>(null);
    const [open, setOpen] = useState(false);
    const toggle = async () => {
        setOpen(!open);
        if (open) return;
        try {
            setRows(await request(url));
        } catch {
            setRows('error');
        }
    };
    return (
        <div className="video-usage">
            <Button
                label="⋯"
                variant="ghost"
                size="sm"
                aria-label={`Token use: ${title}`}
                aria-expanded={open}
                aria-controls={id}
                clickAction={toggle}
            />
            {open && (
                <div id={id}>
                    {rows === 'error' ? (
                        <Text type="supporting">Token use could not be loaded.</Text>
                    ) : rows && !rows.length ? (
                        <Text type="supporting">No token use recorded for this video.</Text>
                    ) : (
                        rows && (
                            <table>
                                <thead>
                                    <tr>
                                        <th>Stage</th>
                                        <th>Model</th>
                                        <th>Calls</th>
                                        <th>Input</th>
                                        <th>Output</th>
                                        <th>Reasoning</th>
                                        <th>Cached</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map((r) => (
                                        <tr key={`${r.stage}:${r.model}`}>
                                            <td>
                                                {r.stage
                                                    ? (STAGE[r.stage] ?? r.stage)
                                                    : 'Not recorded'}
                                            </td>
                                            <td>{r.model ?? 'Unknown model'}</td>
                                            <td>
                                                {r.calls}
                                                {r.reported < r.calls &&
                                                    `, ${r.calls - r.reported} not reported`}
                                            </td>
                                            {r.reported ? (
                                                [r.input, r.output, r.reasoning, r.cacheRead].map(
                                                    (n, i) => (
                                                        <td key={i}>
                                                            {n === null ? '—' : n.toLocaleString()}
                                                        </td>
                                                    ),
                                                )
                                            ) : (
                                                <td colSpan={4}>Not reported</td>
                                            )}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )
                    )}
                </div>
            )}
        </div>
    );
}
