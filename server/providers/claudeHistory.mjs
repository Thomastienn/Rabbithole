// Fresh Claude sessions replay the saved discussion, including captions already shown on a board.
export const claudeHistory = (tree) =>
    (tree.messages ?? [])
        .filter((m) => m.status === 'completed' || (m.board && m.text && m.status !== 'streaming'))
        .map((m) => ({ role: m.role, text: m.text }));
