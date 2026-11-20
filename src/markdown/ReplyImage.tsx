import { useState } from 'react';
import type { ToolCall } from '../chat/turn';
import './images.css';

export function imageUrl(value: string): string | undefined {
    try {
        const url = new URL(value);
        if (['http:', 'https:'].includes(url.protocol) && !url.username && !url.password)
            return url.href;
    } catch {
        /* Untrusted Markdown URL. */
    }
}

export type ImageSource = { source: string; resource?: number };

// A citation chip or image credit scrolls to its Resources entry in the contents panel.
export function jumpToResource(event: { preventDefault(): void }, n: number | string) {
    event.preventDefault();
    const entry = document.getElementById(`resource-${n}`);
    entry?.scrollIntoView({ block: 'nearest' });
    entry?.querySelector('a')?.focus({ preventScroll: true });
}

// Source pages and resource numbers come from saved tool results, including while the reply is still streaming.
export function imageSources(tools: ToolCall[]): Record<string, ImageSource> {
    const sources: Record<string, ImageSource> = {};
    for (const tool of tools) {
        if (tool.name !== 'find_images' || tool.status !== 'done' || !tool.output) continue;
        try {
            const data = JSON.parse(tool.output);
            if (!Array.isArray(data?.results)) continue;
            for (const row of data.results) {
                const image = imageUrl(row?.imageUrl),
                    source = imageUrl(row?.sourceUrl);
                if (image && source)
                    sources[image] = Number.isSafeInteger(row.resource)
                        ? { source, resource: row.resource }
                        : { source };
            }
        } catch {
            /* Older or failed tool outputs may not be JSON. */
        }
    }
    return sources;
}

export default function ReplyImage({
    src,
    alt,
    source,
    resource,
    linked = false,
}: {
    src: string;
    alt: string;
    source: string;
    resource?: number;
    linked?: boolean;
}) {
    const [failed, setFailed] = useState(false);
    const image = failed ? (
        <span className="image-unavailable" role="status">
            Image is no longer available.{alt && ` ${alt}`}
        </span>
    ) : (
        <img
            src={src}
            alt={alt}
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setFailed(true)}
        />
    );
    return (
        <span className="reply-image">
            {linked ? (
                image
            ) : (
                <a
                    href={source}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={alt ? undefined : 'Open image source'}
                >
                    {image}
                </a>
            )}
            {linked ? (
                <span className="image-source">Source</span>
            ) : resource !== undefined ? (
                <a
                    className="image-source"
                    href={`#resource-${resource}`}
                    aria-label={`Source: resource ${resource}`}
                    onClick={(event) => jumpToResource(event, resource)}
                >
                    Source {resource}
                </a>
            ) : (
                <a className="image-source" href={source} target="_blank" rel="noopener noreferrer">
                    Source
                </a>
            )}
        </span>
    );
}
