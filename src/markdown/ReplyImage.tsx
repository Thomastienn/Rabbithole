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

// Source pages come from saved tool results, including while the reply is still streaming.
export function imageSources(tools: ToolCall[]): Record<string, string> {
  const sources: Record<string, string> = {};
  for (const tool of tools) {
    if (tool.name !== 'find_images' || tool.status !== 'done' || !tool.output) continue;
    try {
      const data = JSON.parse(tool.output);
      if (!Array.isArray(data?.results)) continue;
      for (const row of data.results) {
        const image = imageUrl(row?.imageUrl),
          source = imageUrl(row?.sourceUrl);
        if (image && source) sources[image] = source;
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
  linked = false,
}: {
  src: string;
  alt: string;
  source: string;
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
      ) : (
        <a className="image-source" href={source} target="_blank" rel="noopener noreferrer">
          Source
        </a>
      )}
    </span>
  );
}
