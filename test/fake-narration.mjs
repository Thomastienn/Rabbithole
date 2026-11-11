import { readFileSync } from 'node:fs';

// Controlled 1.92-second sine tone, not native speech evidence.
const audio = readFileSync(new URL('./fixtures/narration.mp3', import.meta.url));
export const fakeNarration = async () => ({ audio,
  sentenceBoundaries: [{ offset: 0, duration: 18000000, text: 'Winners advance.' }],
  wordBoundaries: [{ offset: 0, duration: 8000000, text: 'Winners' }, { offset: 9000000, duration: 9000000, text: 'advance.' }],
});
