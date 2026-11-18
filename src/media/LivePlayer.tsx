import { useEffect, useRef, useState } from 'react';

type LiveCuts = {
  paletteRoles: Record<string, string>;
  pieces: string | null;
  exhibits?: { id: string; media: boolean }[];
  cuts: {
    engine: string;
    playable: boolean;
    code: string | null;
    timing: unknown;
    emphasis: unknown[];
  }[];
};

// Plays a pending video's ready cuts inside the opaque-origin player frame. The app fetches cut code, narration
// and clips from its own API and hands them over as data; the frame itself has no network.
export default function LivePlayer({ cuts, title }: { cuts: string; title: string }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (!loaded) return;
    let stopped = false,
      last = '';
    const base = cuts,
      blobs = new Map<string, Blob>();
    const blob = async (key: string) => {
      if (blobs.has(key)) return;
      const response = await fetch(`${base}/${key}`);
      if (response.ok) blobs.set(key, await response.blob());
    };
    (async () => {
      while (!stopped) {
        try {
          const response = await fetch(base);
          if (response.ok) {
            const data: LiveCuts = await response.json();
            await Promise.all([
              ...data.cuts.flatMap((cut, i) =>
                !cut.playable
                  ? []
                  : [
                      blob(`${i}/narration`),
                      ...(cut.engine === 'manim' ? [blob(`${i}/clip`)] : []),
                    ],
              ),
              ...(data.exhibits ?? []).flatMap((e, i) => (e.media ? [blob(`${i}/exhibit`)] : [])),
            ]);
            const key = JSON.stringify(data) + [...blobs.keys()].join();
            if (!stopped && key !== last) {
              last = key;
              frame.current?.contentWindow?.postMessage(
                {
                  type: 'cuts',
                  paletteRoles: data.paletteRoles,
                  pieces: data.pieces,
                  exhibits: (data.exhibits ?? []).map((e, i) => ({
                    ...e,
                    blob: blobs.get(`${i}/exhibit`),
                  })),
                  cuts: data.cuts.map((cut, i) => ({
                    ...cut,
                    audio: blobs.get(`${i}/narration`),
                    clip: blobs.get(`${i}/clip`),
                  })),
                },
                '*',
              );
            }
          }
        } catch {}
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    })();
    return () => {
      stopped = true;
    };
  }, [loaded, cuts]);
  return (
    <iframe
      ref={frame}
      className="video-frame video-live"
      src="/player.html"
      sandbox="allow-scripts"
      allowFullScreen
      title={`Live video: ${title}`}
      onLoad={() => setLoaded(true)}
    />
  );
}
