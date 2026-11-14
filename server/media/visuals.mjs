import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
import { JSDOM } from 'jsdom';
import { savedTheme, themeChoices } from '../../src/appearance.ts';

const INSTRUCTIONS = readFileSync(new URL('./prompts/visual.md', import.meta.url), 'utf8');
const MAX_SOURCE = 64 * 1024;

// Read Astryx's built colours so the worker prompt and browser share one palette.
const palettes = Object.fromEntries(
  themeChoices.map(({ id }) => {
    const css = readFileSync(new URL(`../../src/themes/${id}/${id}.css`, import.meta.url), 'utf8');
    const tokens = [
      '--color-background-body',
      '--color-background-surface',
      '--color-text-primary',
      '--color-text-secondary',
      '--color-border',
      '--color-accent',
      '--focus-outline-color',
      '--color-text-yellow',
      '--color-text-green',
      '--color-text-pink',
      '--color-text-blue',
    ];
    return [
      id,
      Object.fromEntries(
        tokens.map((name) => [
          name,
          css
            .match(new RegExp(`${name}: light-dark\\(([^)]+)\\)`))[1]
            .split(',')
            .map((s) => s.trim()),
        ]),
      ),
    ];
  }),
);

export const visualTheme = (theme) => ({
  name: savedTheme(theme?.name),
  mode: theme?.mode === 'light' ? 'light' : 'dark',
});

function paletteFor(theme) {
  const { name, mode } = visualTheme(theme);
  return {
    name,
    mode,
    tokens: Object.fromEntries(
      Object.entries(palettes[name]).map(([token, pair]) => [
        token,
        pair[mode === 'light' ? 0 : 1],
      ]),
    ),
  };
}

// A mistake check, not a security boundary: execution stays in the opaque-origin, network-denied sandbox.
function validate(source) {
  const invalid = (reason) => {
    throw new Error(`Visual output is invalid: ${reason}.`);
  };
  if (!source.trim()) invalid('no fragment was returned');
  if (Buffer.byteLength(source) > MAX_SOURCE) invalid('the fragment exceeds 64 KiB');
  if (/```|<!doctype|<\/?\s*(?:html|head|body)\b/i.test(source))
    invalid('return a fragment without document tags or Markdown fences');
  // SVG namespace declarations identify a format; they never load a remote resource.
  const checked = source.replace(
    /\bxmlns(?::\w+)?\s*=\s*(["'])http:\/\/www\.w3\.org\/(?:2000\/svg|1999\/xlink|1999\/xhtml)\1/g,
    '',
  );
  if (/(?:https?|wss?|ftp|file|data|blob|javascript):|(?:["'`(=]|^)\s*\/\/[\w.-]/i.test(checked))
    invalid('URLs and remote resources are unavailable');
  for (const [, target] of checked.matchAll(/\burl\(\s*([^)]*)\)/gi))
    if (!/^(["']?)#[\w-]+\1$/.test(target.trim()))
      invalid('CSS resources must be local fragment references');
  if (/@import\b/i.test(checked)) invalid('use only inline code and the preloaded libraries');
  const javascript = (code) => {
    if (
      /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|importScripts|Worker|SharedWorker|RTCPeerConnection|serviceWorker)\s*[.(\[]|\b(?:import|require)\s*\(|\bgsap\s*\.|\bnew\s+Chart\b|\bLeaflet\s*\./.test(
        code,
      )
    )
      invalid('use only inline code and the preloaded libraries');
    try {
      new Script(code);
    } catch {
      invalid('a script has invalid JavaScript');
    }
  };
  const fragment = JSDOM.fragment(source);
  if (!fragment.querySelector('*')) invalid('no visual markup was returned');
  for (const element of fragment.querySelectorAll('*')) {
    if (
      /^(?:iframe|frame|frameset|link|meta|base|object|embed|img|image|a|audio|video|source|track)$/i.test(
        element.localName,
      )
    )
      invalid('links, images and embedded resources are unavailable');
    for (const { name, value } of element.attributes) {
      if (
        /^(?:src|srcset|href|xlink:href|action|formaction)$/i.test(name) &&
        !/^#[\w-]+$/.test(value)
      )
        invalid('resource attributes must be local fragment references');
      if (/^on/i.test(name)) javascript(`function handler(event){${value}\n}`);
    }
    if (element.localName === 'script') {
      if (
        element.hasAttribute('src') ||
        (element.hasAttribute('type') &&
          !['text/javascript', 'application/javascript'].includes(element.getAttribute('type')))
      )
        invalid('use inline classic scripts only');
      javascript(element.textContent);
    }
  }
  return source.trim();
}

export async function generateVisual(provider, selection, input, parentSignal, timeout = 300000) {
  const controller = new AbortController();
  const cancel = () => controller.abort(new Error('Visual generation canceled.'));
  parentSignal.addEventListener('abort', cancel, { once: true });
  if (parentSignal.aborted) cancel();
  const timer = setTimeout(
    () => controller.abort(new Error('Visual generation timed out.')),
    timeout,
  );
  let rejectAbort;
  const aborted = new Promise((_, reject) => {
    rejectAbort = () => reject(controller.signal.reason);
    controller.signal.addEventListener('abort', rejectAbort, { once: true });
    if (controller.signal.aborted) rejectAbort();
  });
  const run = async () => {
    let validationError;
    for (let attempt = 0; attempt < 2; attempt++) {
      if (controller.signal.aborted) throw controller.signal.reason;
      const items = new Map();
      let status, overflow;
      try {
        await provider.generate(
          {
            ...selection,
            thread: null,
            instructions:
              INSTRUCTIONS +
              (input.differentVersion
                ? '\nCreate a different version: take a different approach than the previous version while explaining the same request.'
                : '') +
              '\nCurrent theme palette: ' +
              JSON.stringify(paletteFor(input.theme)),
          },
          JSON.stringify({
            request: input.request,
            earlierTitles: input.earlierTitles,
            ...(validationError && { validationError }),
          }),
          (event) => {
            if (controller.signal.aborted) return;
            if ((event.type === 'delta' || event.type === 'item') && !overflow) {
              items.set(
                event.item,
                event.type === 'item' ? event.text : (items.get(event.item) ?? '') + event.text,
              );
              if (
                items.size > 32 ||
                [...items.values()].reduce((n, text) => n + Buffer.byteLength(text), 0) > MAX_SOURCE
              ) {
                overflow = 'Visual output is invalid: the fragment exceeds its size limit.';
                items.clear();
              }
            }
            if (event.type === 'status') status = event.status;
          },
          () => {},
          controller.signal,
        );
      } catch {
        throw new Error(
          'Visual provider could not generate a result. Check Smart in Settings → Models, then Retry.',
        );
      }
      if (controller.signal.aborted) throw controller.signal.reason;
      if (status !== 'completed')
        throw new Error('Visual generation did not complete. Retry to try again.');
      try {
        if (overflow) throw new Error(overflow);
        return validate([...items.values()].join('\n\n'));
      } catch (error) {
        validationError = error.message;
        if (attempt) throw error;
      }
    }
  };
  try {
    return await Promise.race([aborted, run()]);
  } finally {
    clearTimeout(timer);
    parentSignal.removeEventListener('abort', cancel);
    controller.signal.removeEventListener('abort', rejectAbort);
  }
}
