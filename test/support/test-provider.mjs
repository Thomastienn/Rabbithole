// Behaviour shared by the native CLIs runs on one of them; RABBITHOLE_TEST_PROVIDER=codex switches it.
export const TEST_PROVIDER = process.env.RABBITHOLE_TEST_PROVIDER ?? 'claude';
if (!['claude', 'codex'].includes(TEST_PROVIDER))
  throw new Error(`RABBITHOLE_TEST_PROVIDER must be claude or codex, not ${TEST_PROVIDER}.`);
