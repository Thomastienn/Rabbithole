import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// The first OPENERS play before a reply's first audio; the short connectors after them play when a later sentence's voice is late.
const FILLERS = {
    ...{ hmm: 'Hmm.', okay: 'Okay.', 'good-question': 'Good question.' },
    ...{ so: 'So...', right: 'Right,', now: 'Now,', and: 'And...', mm: 'Mm.' },
};
export const OPENERS = 3;
const loaded = new Map();

// The board's filler clips for one voice, synthesized once with speech() and kept under dir;
// a failed synthesis gives none this time and retries on the next board.
export function boardFillers(dir, voice, speech) {
    const folder = join(dir, 'board-fillers', voice);
    if (!loaded.has(folder))
        loaded.set(
            folder,
            load(folder, speech).catch(() => {
                loaded.delete(folder);
                return [];
            }),
        );
    return loaded.get(folder);
}

async function load(folder, speech) {
    await mkdir(folder, { recursive: true });
    let client;
    try {
        const clips = [];
        for (const [name, text] of Object.entries(FILLERS)) {
            const file = join(folder, `${name}.webm`);
            let clip = await readFile(file).catch(() => null);
            if (!clip) {
                client ??= speech();
                const chunks = [];
                await client.speak(text, (chunk) => chunks.push(chunk));
                clip = Buffer.concat(chunks);
                if (!clip.length) throw new Error(`edge-tts sent no audio for "${text}"`);
                await writeFile(`${file}.part`, clip);
                await rename(`${file}.part`, file);
            }
            clips.push(clip);
        }
        return clips;
    } finally {
        client?.close();
    }
}
