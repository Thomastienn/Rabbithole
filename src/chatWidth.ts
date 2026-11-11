// Focused chat width in rem, beside the map. Pure so the divider math is testable.
export const DEFAULT_CHAT_WIDTH = 35, MIN_CHAT_WIDTH = 22, STEP = 1;
export const maxChatWidth = (workspace: number) => Math.max(MIN_CHAT_WIDTH, workspace * 0.7);
export const clampChatWidth = (width: number, workspace: number) => Math.round(Math.min(Math.max(width, MIN_CHAT_WIDTH), maxChatWidth(workspace)) * 100) / 100;
export const resetChatWidth = (workspace: number) => clampChatWidth(DEFAULT_CHAT_WIDTH, workspace);
// The divider sits left of the chat: moving it left widens the chat.
export function keyChatWidth(width: number, key: string, workspace: number, big = false) {
  const step = big ? STEP * 4 : STEP;
  const next = key === 'ArrowLeft' ? width + step : key === 'ArrowRight' ? width - step : key === 'Home' ? MIN_CHAT_WIDTH : key === 'End' ? maxChatWidth(workspace) : undefined;
  return next === undefined ? undefined : clampChatWidth(next, workspace);
}
export function savedChatWidth(saved: string | null) {
  const width = Number(saved);
  return saved && Number.isFinite(width) && width >= MIN_CHAT_WIDTH ? width : DEFAULT_CHAT_WIDTH;
}
