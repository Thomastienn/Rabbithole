import { useEffect, useRef } from 'react';

// The brand mark from public/logo.svg, painted in the active theme's body, text and accent colours.
const markSvg = (bg: string, ink: string, accent: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="${bg}"/>
  <path d="M23 32C29 32 28 13 34 13M23 32H34M23 32C29 32 28 51 34 51" fill="none" stroke="${accent}" stroke-width="3" stroke-linecap="round"/>
  <rect x="5" y="24" width="19" height="16" rx="3" fill="${ink}"/>
  <path d="M33 10a3 3 0 0 1 3-3h19a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3h-19a3 3 0 0 1-3-3ZM33 29a3 3 0 0 1 3-3h19a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3h-19a3 3 0 0 1-3-3ZM33 48a3 3 0 0 1 3-3h19a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3h-19a3 3 0 0 1-3-3Z" fill="${accent}"/>
  <path d="M9.5 28.5h6M37.5 11.5h8M37.5 30.5h8M37.5 49.5h8" stroke="${bg}" stroke-opacity=".55" stroke-width="3" stroke-linecap="round"/>
</svg>`;

// Renders a hidden probe inside <Theme>, so light-dark() theme colours resolve to plain rgb() values.
export function ThemedFavicon({ theme, appearance }: { theme: string; appearance: string }) {
  const probe = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const paint = () => {
      const style = getComputedStyle(probe.current!);
      const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
      if (!link) return;
      link.href =
        'data:image/svg+xml,' +
        encodeURIComponent(markSvg(style.backgroundColor, style.color, style.borderTopColor));
    };
    paint();
    // System appearance follows the OS, which can flip without a React state change.
    const scheme = matchMedia('(prefers-color-scheme: dark)');
    scheme.addEventListener('change', paint);
    return () => scheme.removeEventListener('change', paint);
  }, [theme, appearance]);
  return (
    <span
      ref={probe}
      hidden
      style={{
        background: 'var(--color-background-body)',
        color: 'var(--color-text-primary)',
        border: '0 solid var(--color-accent)',
      }}
    />
  );
}
