import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
import { savedTheme, themeChoices } from '../../src/shell/appearance.ts';
import { visualMarkup } from '../../src/media/visualMarkup.ts';
import {
  VISUAL_SKILL,
  HOUSE_STYLE_SKILL,
  ANALOGY_SKILL,
  THREEJS_SKILL,
  MOTION_DESIGN_SKILL,
} from './skills.mjs';
import { readCall } from './reply-requests.mjs';

// Loadable skills; `uses` spots output that needs the skill, so the server can enforce loading it.
const SKILLS = {
  threejs: {
    description:
      'three.js craft: scene setup, animation loop, resize, cleanup and common mistakes.',
    when: 'any 3D scene with THREE',
    text: THREEJS_SKILL,
    uses: /\bTHREE\s*\./,
  },
  'motion-design': {
    description: 'motion pacing: a motion checklist and duration and easing tables.',
    when: 'any animation (d3 transitions, CSS transitions or keyframes)',
    text: MOTION_DESIGN_SKILL,
    uses: /\.transition\s*\(|\btransition(?:-[a-z-]+)?\s*:|@keyframes\b/i,
  },
};
export const LOAD_SKILL = {
  name: 'load_skill',
  description: 'Load one skill by name; returns its guidance to follow while writing the visual.',
  parameters: {
    type: 'object',
    properties: { name: { type: 'string', enum: Object.keys(SKILLS) } },
    required: ['name'],
  },
};
const SKILL_RULES =
  '\n\nLoadable skills: you must call load_skill with the matching skill before writing whenever its work applies; a fragment that does that work without its skill is rejected.\n' +
  Object.entries(SKILLS)
    .map(([name, skill]) => `- ${name}: ${skill.description} Load it for ${skill.when}.`)
    .join('\n');
// Without native tool calling the call is written as text; no result comes back.
const TEXT_TOOL =
  '\nYou cannot call tools natively. To load a skill, write <tool_call>{"name": "load_skill", "arguments": {"name": "skill name"}}</tool_call> before the fragment; no result comes back, and the server asks again with that skill in these instructions.';
const CALLS = /<tool_call>([\s\S]*?)(?:<\/tool_call>|$)/g;

const INSTRUCTIONS =
  readFileSync(new URL('./prompts/visual.md', import.meta.url), 'utf8') +
  '\n' +
  VISUAL_SKILL +
  '\n\n' +
  HOUSE_STYLE_SKILL +
  '\n\n' +
  ANALOGY_SKILL +
  SKILL_RULES;
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
async function validate(source) {
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
  // Stock catalogs are retired (ADR 0005); every object is drawn in the house style.
  if (/\bstockPiece\b|fluent-emoji:/.test(source))
    invalid('stock pieces are retired; draw every object yourself in the house style');
  const javascript = (code) => {
    if (
      /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|importScripts|Worker|SharedWorker|RTCPeerConnection|serviceWorker)\s*[.(\[]|\b(?:import|require)\s*\(|\bgsap\s*\.|\bnew\s+Chart\b|\bLeaflet\s*\.|\w*Loader\b/.test(
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
  // Loaded on first use: jsdom costs about 0.3 s to import.
  const { JSDOM } = await import('jsdom');
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
  return visualMarkup(source.trim(), fragment.ownerDocument, true);
}

export async function generateVisual(
  provider,
  selection,
  input,
  parentSignal,
  timeout = 300000,
  onPartial = () => {},
  { capable = false, mcp } = {},
) {
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
    const { JSDOM } = await import('jsdom');
    const document = JSDOM.fragment('').ownerDocument;
    let validationError;
    // Skills put into the prompt after a rejection; loaded marks what this attempt received.
    const given = new Set();
    for (let attempt = 0; attempt < 2; attempt++) {
      if (controller.signal.aborted) throw controller.signal.reason;
      const items = new Map(),
        loaded = new Set(given);
      const fragment = () => [...items.values()].join('\n\n').replace(CALLS, '');
      onPartial('');
      let status, overflow;
      try {
        await provider.generate(
          {
            ...selection,
            thread: null,
            ...(capable && {
              tools: [LOAD_SKILL],
              mcp,
              runTool: (_name, input) => {
                const skill = SKILLS[input?.name];
                if (!skill) throw new Error(`Choose a skill: ${Object.keys(SKILLS).join(' or ')}.`);
                loaded.add(input.name);
                return skill.text;
              },
            }),
            instructions:
              INSTRUCTIONS +
              (capable ? '' : TEXT_TOOL) +
              [...given].map((name) => '\n\n' + SKILLS[name].text).join('') +
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
              onPartial(visualMarkup(fragment(), document));
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
      let result, error;
      try {
        if (overflow) throw new Error(overflow);
        result = await validate(fragment());
      } catch (caught) {
        error = caught;
      }
      if (attempt) {
        if (error) throw error;
        return result;
      }
      // Text-mode load_skill calls asked for skills that never reached the model.
      const asked = [...[...items.values()].join('\n\n').matchAll(CALLS)]
        .map(([, json]) => readCall({ json }))
        .filter((call) => call.name === LOAD_SKILL.name)
        .map((call) => call.input.name);
      const missing = Object.keys(SKILLS).filter(
        (name) => !loaded.has(name) && (asked.includes(name) || SKILLS[name].uses.test(fragment())),
      );
      if (!error && !missing.length) return result;
      for (const name of missing) given.add(name);
      validationError =
        error?.message ??
        `Visual output is invalid: it needs the ${missing.join(' and ')} skill, now included in your instructions; follow it and return a complete replacement fragment.`;
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
