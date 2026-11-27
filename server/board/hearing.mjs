import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

// The board's speech models, each from one pinned commit, their files checked against these SHA-256 hashes and sizes.
// Moonshine base at int8 recognizes English, Whisper base at int8 every other Voice language; Silero detects voice (docs/board-spec.md).
export const MODELS = {
    'onnx-community/moonshine-base-ONNX': {
        revision: 'b1e9b6aae3c3c7298f10c3798393fdf38e8fbbad',
        files: {
            'config.json': [
                'fab7241d1e9fc6c2370c4c6dfb5da79bb54d67ed9ab6b507ac51d29d2abe01d1',
                922,
            ],
            'generation_config.json': [
                'f9b3f711b57be7def2e50a8942f64f36ee0a55fad5b84ff93a687b6c5bcc1d44',
                147,
            ],
            'preprocessor_config.json': [
                'fa43a7017ef85cd1d0fba0d9aae77c8adb16990ae6f11115631f41ec5d8aa679',
                128,
            ],
            'tokenizer.json': [
                '7b913404bdd039af4756783218af4440bc07fb7d6d8258d677e34f95b3ec416f',
                3761754,
            ],
            'tokenizer_config.json': [
                'edaee394565d428ea98a663ae7209cdcfeefc5585c42d7a570ff7c986df2cd15',
                135735,
            ],
            'onnx/encoder_model_int8.onnx': [
                '4edb38db96b52ddee5a3b25d2211bb6394f9a9a2d95f67bce0e8c861da018a4d',
                20488801,
            ],
            'onnx/decoder_model_merged_int8.onnx': [
                '45febab0347ffbe1326459e092ae20a2cfda10ca33ab018b3c299247284de61b',
                42427261,
            ],
        },
    },
    'onnx-community/whisper-base': {
        revision: '27a07b4b52b3a4c5886134bb4320e93e1a4bbc7c',
        files: {
            'config.json': [
                'f4d0608f7d918166da7edb3e188de5ef1bfe70d9802e785d271fd88111e9cf4b',
                2243,
            ],
            'generation_config.json': [
                '61070cf8de25b1e9256e8e102ded49d8d24a8369ed36ef84fdf21549e68125a0',
                3832,
            ],
            'preprocessor_config.json': [
                'a6a76d28c93edb273669eb9e0b0636a2bddbb1272c3261e47b7ca6dfdbac1b8d',
                339,
            ],
            'tokenizer.json': [
                '27fc476bfe7f17299480be2273fc0608e4d5a99aba2ab5dec5374b4482d1a566',
                2480466,
            ],
            'tokenizer_config.json': [
                '2e036e4dbacfdeb7242c7d4ec4149f4a16e86026048f94d1637e3a8ee9c6a573',
                282682,
            ],
            'onnx/encoder_model_int8.onnx': [
                'ca6177401f86a2c6b4dc5f7fc02fbca680678906bd0c22f6d89f0b80f124253f',
                23201297,
            ],
            'onnx/decoder_model_merged_int8.onnx': [
                'fa3ef9902734ce5ae6f9ef2bdb2ba9a6c4b5785b09f4f420ce036573dc9d090b',
                53693315,
            ],
        },
    },
    'onnx-community/silero-vad': {
        revision: 'e71cae966052b992a7eca6b17738916ce0eca4ec',
        files: {
            'onnx/model_int8.onnx': [
                '90b026c95f054d59d7bf79387b0ed93c8950f35a4d8b741cd78d4bb23a7d2776',
                639383,
            ],
        },
    },
};

const RATE = 16000;
// Silero reads 512 samples, 32 ms, at a time.
export const FRAME = 512;
// About 300 ms of silence ends a question; under 160 ms of speech is a click, not a question.
const END_FRAMES = Math.ceil((0.3 * RATE) / FRAME);
const MIN_FRAMES = 5;
// Kept from before speech starts, so the first syllable is not clipped.
const LEAD_FRAMES = 3;

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

// Streams one file, reporting each chunk's size.
async function fetchFile(url, chunk) {
    const response = await fetch(url, { redirect: 'follow' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const parts = [];
    for await (const part of response.body) {
        parts.push(part);
        chunk(part.length);
    }
    return Buffer.concat(parts);
}

// Puts every model file under root; a cached file is kept only while its hash matches.
// progress(loaded, total) follows the download in bytes; nothing cached means no download.
export async function speechFiles(root, progress, download = fetchFile, models = MODELS) {
    const all = Object.entries(models).flatMap(([model, { revision, files }]) =>
        Object.entries(files).map(([name, [hash, size]]) => ({
            model,
            revision,
            name,
            hash,
            size,
        })),
    );
    const total = all.reduce((sum, f) => sum + f.size, 0);
    let loaded = 0;
    for (const { model, revision, name, hash, size } of all) {
        const path = join(root, model, name);
        const cached = await readFile(path).catch(() => null);
        if (cached && sha256(cached) === hash) {
            loaded += size;
            continue;
        }
        const bytes = await download(
            `https://huggingface.co/${model}/resolve/${revision}/${name}`,
            (n) => progress((loaded += n), total),
        ).catch((error) => {
            throw new Error(`Speech model download failed (${name}): ${error.message}`);
        });
        if (sha256(bytes) !== hash)
            throw new Error(`Speech model file ${name} does not match its recorded hash.`);
        await mkdir(dirname(path), { recursive: true, mode: 0o700 });
        const part = `${path}.part-${randomUUID()}`;
        await writeFile(part, bytes);
        await rename(part, path).catch((error) =>
            rm(part, { force: true }).then(() => Promise.reject(error)),
        );
    }
    return root;
}

const VAD = 'onnx-community/silero-vad';
// The recognizer for a Voice language.
const recognizer = (lang) =>
    lang === 'en' ? 'onnx-community/moonshine-base-ONNX' : 'onnx-community/whisper-base';
const modelsFor = (asrModel) => ({ [asrModel]: MODELS[asrModel], [VAD]: MODELS[VAD] });

// The local ears: load(progress, lang) resolves to { detector(), recognize(audio) } once the models for that
// Voice language are ready; load.downloaded(lang) says whether they are on this computer, by size, without hashing.
// A detector scores one FRAME of 16 kHz audio for voice, 0 to 1, keeping its own state across frames.
// Loading is shared by every board; a failure is retried on the next load.
export function localHearing(dir, download) {
    const root = join(dir, 'models');
    const loads = new Map();
    const load = async (asrModel, listeners) => {
        await speechFiles(
            root,
            (loaded, total) => listeners.forEach((l) => l(loaded, total)),
            download,
            modelsFor(asrModel),
        );
        const { pipeline, AutoModel, Tensor, env } = await import('@huggingface/transformers');
        env.allowRemoteModels = false;
        env.localModelPath = root;
        env.useFSCache = false;
        const [vad, asr] = await Promise.all([
            AutoModel.from_pretrained(VAD, {
                config: { model_type: 'custom' },
                dtype: 'int8',
            }),
            pipeline('automatic-speech-recognition', asrModel, {
                dtype: { encoder_model: 'int8', decoder_model_merged: 'int8' },
            }),
        ]);
        const sr = new Tensor('int64', [BigInt(RATE)], []);
        return {
            detector() {
                let state = new Tensor('float32', new Float32Array(256), [2, 1, 128]);
                return async (frame) => {
                    const out = await vad({
                        input: new Tensor('float32', frame, [1, FRAME]),
                        sr,
                        state,
                    });
                    state = out.stateN;
                    return out.output.data[0];
                };
            },
            asr,
        };
    };
    const hearing = (progress, lang = 'en') => {
        const asrModel = recognizer(lang);
        if (!loads.has(asrModel)) {
            const listeners = new Set();
            const loading = load(asrModel, listeners).catch((error) => {
                loads.delete(asrModel);
                throw error;
            });
            loads.set(asrModel, { loading, listeners });
        }
        const { loading, listeners } = loads.get(asrModel);
        listeners.add(progress);
        return loading
            .then(({ detector, asr }) => ({
                detector,
                // Whisper is told the language, so it neither guesses nor translates; it hears 30 s at a
                // time, and a push-to-talk question may run to 60 s.
                recognize: async (audio) =>
                    (
                        await asr(
                            audio,
                            lang === 'en'
                                ? {}
                                : { language: lang, task: 'transcribe', chunk_length_s: 30 },
                        )
                    ).text.trim(),
            }))
            .finally(() => listeners.delete(progress));
    };
    hearing.downloaded = async (lang) => {
        for (const [model, { files }] of Object.entries(modelsFor(recognizer(lang))))
            for (const [name, [, size]] of Object.entries(files)) {
                const found = await stat(join(root, model, name)).catch(() => null);
                if (found?.size !== size) return false;
            }
        return true;
    };
    return hearing;
}

// Cuts a stream of scored frames into utterances: push(frame, speech) returns 'start' as speech begins,
// 'speech' once MIN_FRAMES of it are heard, then 'end' for a click or the utterance's audio once END_FRAMES of silence follow it, else nothing.
export function utterances() {
    let frames = [],
        voiced = 0,
        silent = 0;
    return {
        push(frame, speech) {
            if (!voiced) {
                frames = [...frames, frame].slice(-LEAD_FRAMES - 1);
                if (!speech) return;
                voiced = 1;
                silent = 0;
                return 'start';
            }
            frames.push(frame);
            if (speech) {
                silent = 0;
                return ++voiced === MIN_FRAMES ? 'speech' : undefined;
            }
            if (++silent < END_FRAMES) return;
            const heard = voiced >= MIN_FRAMES ? frames : null;
            frames = [];
            voiced = 0;
            if (!heard) return 'end';
            const audio = new Float32Array(heard.length * FRAME);
            heard.forEach((f, i) => audio.set(f, i * FRAME));
            return audio;
        },
    };
}
