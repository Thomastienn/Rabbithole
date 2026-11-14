import { inkStyle } from './treeList';
import type { familyLegend } from './mapState';

export function InkLegend({
  legend,
  root,
}: {
  legend: ReturnType<typeof familyLegend>;
  root: string;
}) {
  return (
    <aside className="ink-legend" aria-label="Branch family inks" tabIndex={0}>
      <ul>
        {legend.map((t) => (
          <li key={t.id} style={inkStyle(t.ink)}>
            <span className="contents-dot" aria-hidden />
            <span>
              {t.address} {t.title}
              {t.id === root && ' · trunk'}
            </span>
          </li>
        ))}
      </ul>
    </aside>
  );
}
