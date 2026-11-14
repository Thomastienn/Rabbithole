export type Model = {
  provider: string;
  model: string;
  label: string;
  isDefault?: boolean;
  defaultFallback?: boolean;
  efforts?: string[];
  defaultEffort?: string;
};
export type ChatSelection = { provider: string; model: string | null; effort: string | null };
export const effortLabel = (effort: string | null) =>
  effort === null
    ? 'Provider default'
    : effort === 'xhigh'
      ? 'Extra high'
      : effort[0].toUpperCase() + effort.slice(1);
