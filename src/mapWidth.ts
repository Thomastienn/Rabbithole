// Docked map width in rem, right of the reading column (mockup Read: 440px). Pure so the seam math is testable.
export const DEFAULT_MAP_WIDTH = 27.5, MIN_MAP_WIDTH = 20, STEP = 1;
// The reading column keeps at least 40% of the workspace.
export const maxMapWidth = (workspace: number) => Math.max(MIN_MAP_WIDTH, workspace * 0.6);
export const clampMapWidth = (width: number, workspace: number) => Math.round(Math.min(Math.max(width, MIN_MAP_WIDTH), maxMapWidth(workspace)) * 100) / 100;
export const resetMapWidth = (workspace: number) => clampMapWidth(DEFAULT_MAP_WIDTH, workspace);
// The seam sits left of the map: moving it left widens the map.
export function keyMapWidth(width: number, key: string, workspace: number, big = false) {
  const step = big ? STEP * 4 : STEP;
  const next = key === 'ArrowLeft' ? width + step : key === 'ArrowRight' ? width - step : key === 'Home' ? MIN_MAP_WIDTH : key === 'End' ? maxMapWidth(workspace) : undefined;
  return next === undefined ? undefined : clampMapWidth(next, workspace);
}
export function savedMapWidth(saved: string | null) {
  const width = Number(saved);
  return saved && Number.isFinite(width) && width >= MIN_MAP_WIDTH ? width : DEFAULT_MAP_WIDTH;
}
