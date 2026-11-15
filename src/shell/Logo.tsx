// The brand mark from public/logo.svg without its tile, painted in the band ink and the active theme's accent.
// The band is dark in every appearance, so the accent is lifted toward the band ink to stay visible.
const accentInk = 'color-mix(in srgb, var(--color-accent) 65%, var(--treetutor-band-ink))';

export function Logo() {
  const accent = { stroke: accentInk, fill: 'none' };
  return (
    <svg viewBox="0 0 64 64" width={28} height={28} aria-hidden="true" style={{ flex: 'none' }}>
      <path
        d="M23 32C29 32 28 13 34 13M23 32H34M23 32C29 32 28 51 34 51"
        strokeWidth="3"
        strokeLinecap="round"
        style={accent}
      />
      <rect
        x="5"
        y="24"
        width="19"
        height="16"
        rx="3"
        style={{ fill: 'var(--treetutor-band-ink)' }}
      />
      {[7, 26, 45].map((y) => (
        <rect key={y} x="33" y={y} width="25" height="12" rx="3" style={{ fill: accentInk }} />
      ))}
      <path
        d="M9.5 28.5h6M37.5 11.5h8M37.5 30.5h8M37.5 49.5h8"
        strokeWidth="3"
        strokeLinecap="round"
        strokeOpacity=".55"
        style={{ stroke: 'var(--treetutor-band)' }}
      />
    </svg>
  );
}
