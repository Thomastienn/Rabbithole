import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

// The look embedder: one pinned model commit, its files checked against these SHA-256 hashes.
export const MODEL = 'Xenova/all-MiniLM-L6-v2';
export const REVISION = '751bff37182d3f1213fa05d7196b954e230abad9';
export const FILES = {
  'config.json': '7135149f7cffa1a573466c6e4d8423ed73b62fd2332c575bf738a0d033f70df7',
  'tokenizer.json': 'da0e79933b9ed51798a3ae27893d3c5fa4a201126cef75586296df9b4d2c62a0',
  'tokenizer_config.json': '9261e7d79b44c8195c1cada2b453e55b00aeb81e907a6664974b4d7776172ab3',
  'onnx/model_quantized.onnx': 'afdb6f1a0e45b715d0bb9b11772f032c399babd23bfc31fed1c170afc848bdb1',
};

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

async function fetchFile(url) {
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

// Puts every model file under root/MODEL; a cached file is kept only while its hash matches.
// A failed download or a downloaded file with another hash refuses the model.
export async function modelFiles(root, download = fetchFile, files = FILES) {
  for (const [name, hash] of Object.entries(files)) {
    const path = join(root, MODEL, name);
    const cached = await readFile(path).catch(() => null);
    if (cached && sha256(cached) === hash) continue;
    let bytes;
    try {
      bytes = await download(`https://huggingface.co/${MODEL}/resolve/${REVISION}/${name}`);
    } catch (error) {
      throw new Error(`Embedding model download failed (${name}): ${error.message}`);
    }
    if (sha256(bytes) !== hash)
      throw new Error(`Embedding model file ${name} does not match its recorded hash.`);
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    const part = `${path}.part-${randomUUID()}`;
    await writeFile(part, bytes);
    await rename(part, path).catch((error) =>
      rm(part, { force: true }).then(() => Promise.reject(error)),
    );
  }
  return root;
}

// The embedder: texts to unit vectors. The model loads on first use; a failure is retried on the next call.
export function localEmbedder(dir, download) {
  let loading;
  const load = async () => {
    const root = await modelFiles(join(dir, 'models'), download);
    const { pipeline, env } = await import('@huggingface/transformers');
    env.allowRemoteModels = false;
    env.localModelPath = root;
    env.useFSCache = false;
    return pipeline('feature-extraction', MODEL, { dtype: 'q8' });
  };
  return async (texts) => {
    loading ??= load().catch((error) => {
      loading = undefined;
      throw error;
    });
    const output = await (await loading)(texts, { pooling: 'mean', normalize: true });
    return output.tolist();
  };
}
