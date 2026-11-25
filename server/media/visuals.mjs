import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
import { paletteFor } from './theme-palette.mjs';
import { visualMarkup } from '../../src/media/visualMarkup.ts';
import {
    VISUAL_SKILL,
    HOUSE_STYLE_SKILL,
    ANALOGY_SKILL,
    THREEJS_SKILL,
    MOTION_DESIGN_SKILL,
    GSAP_SKILL,
} from './skills.mjs';
import { readCall } from './reply-parser.mjs';
import { mediaCall, raced } from './media-call.mjs';
import { patched, withSource } from './patches.mjs';
import { DIFF } from './video-cut.mjs';

export { visualTheme } from './theme-palette.mjs';

// Appended to the instructions of a retry of a fragment that failed.
const VISUAL_PATCH_NOTE =
    '\npreviousFragment, the fragment that failed, follows the JSON task as raw lines after a line reading previousFragment:. Fix the validationError under the same rules. Instead of the whole fragment, return only ' +
    DIFF +
    ' of previousFragment, no Markdown fences or commentary.';

// Appended to a new version's first call, whose task carries the version it changes.
const VERSION_NOTE =
    '\ncurrentVersion, the visual the learner has now, follows the JSON task as raw lines after a line reading currentVersion:. Write a whole new fragment from it under the same rules.';

// Loadable skills; `uses` spots output that needs the skill, so the server can enforce loading it.
const SKILLS = {
    threejs: {
        description:
            'three.js craft: scene setup, animation loop, resize, cleanup and common mistakes.',
        when: 'any 3D scene with THREE',
        text: THREEJS_SKILL,
        uses: /\bTHREE\s*\./,
    },
    gsap: {
        description: 'GSAP core craft: tweens, eases, staggers, timelines and playback control.',
        when: 'any animation with gsap',
        text: GSAP_SKILL,
        uses: /\bgsap\s*\./,
    },
    'motion-design': {
        description: 'motion pacing: a motion checklist and duration and easing tables.',
        when: 'any animation (GSAP, d3 transitions, CSS transitions or keyframes)',
        text: MOTION_DESIGN_SKILL,
        uses: /\bgsap\s*\.|\.transition\s*\(|\btransition(?:-[a-z-]+)?\s*:|@keyframes\b/i,
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
const VISUAL_CALL = {
    role: 'visual',
    bytes: MAX_SOURCE,
    overflow: 'Visual output is invalid: the fragment exceeds its size limit.',
    incomplete: 'Visual generation did not complete. Retry to try again.',
    failed: (reason) =>
        `Visual provider could not generate a result: ${reason.replace(/\.$/, '')}. Check the conversation’s chat model, then Retry.`,
};

// A mistake check, not a security boundary: execution stays in the opaque-origin, network-denied sandbox.
async function validate(source) {
    // found names the offending text, so the retry and the log both show what to change.
    const invalid = (reason, found) => {
        throw new Error(
            `Visual output is invalid: ${reason}${found ? ` (found ${JSON.stringify(found.slice(0, 80))})` : ''}.`,
        );
    };
    if (!source.trim()) invalid('no fragment was returned');
    if (Buffer.byteLength(source) > MAX_SOURCE) invalid('the fragment exceeds 64 KiB');
    if (/```|<!doctype|<\/?\s*(?:html|head|body)\b/i.test(source))
        invalid('return a fragment without document tags or Markdown fences');
    // Quoted SVG/XHTML namespaces (xmlns attributes, createElementNS) identify a format; they never load a remote resource.
    const checked = source.replace(
        /(["'`])http:\/\/www\.w3\.org\/(?:2000\/svg|1999\/xlink|1999\/xhtml)\1/g,
        '',
    );
    // A scheme starts a word and has its URL shape, so CSS `grid-template-rows:` and JS keys like `data:` pass.
    const url =
        /(?<![\w-])(?:(?:https?|wss?|ftp|file):\/\/|data:\s*(?:[\w.+-]+\/|[,;])|blob:|javascript:)|(?:["'`(=]|^)\s*\/\/[\w.-]/i.exec(
            checked,
        );
    if (url)
        invalid(
            'URLs and remote resources are unavailable',
            checked.slice(Math.max(0, url.index - 20), url.index + url[0].length + 20),
        );
    for (const [call, target] of checked.matchAll(/\burl\(\s*([^)]*)\)/gi))
        if (!/^(["']?)#[\w-]+\1$/.test(target.trim()))
            invalid('CSS resources must be local fragment references', call);
    if (/@import\b/i.test(checked)) invalid('use only inline code and the preloaded libraries');
    // Stock catalogs are retired (ADR 0005); every object is drawn in the house style.
    if (/\bstockPiece\b|fluent-emoji:/.test(source))
        invalid('stock pieces are retired; draw every object yourself in the house style');
    const javascript = (code) => {
        const banned =
            /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|importScripts|Worker|SharedWorker|RTCPeerConnection|serviceWorker)\s*[.(\[]|\b(?:import|require)\s*\(|\bnew\s+Chart\b|\bLeaflet\s*\.|\w*Loader\b/.exec(
                code,
            );
        if (banned) invalid('use only inline code and the preloaded libraries', banned[0]);
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
            invalid(
                'links, images and embedded resources are unavailable',
                `<${element.localName}>`,
            );
        for (const { name, value } of element.attributes) {
            if (
                /^(?:src|srcset|href|xlink:href|action|formaction)$/i.test(name) &&
                !/^#[\w-]+$/.test(value)
            )
                invalid(
                    'resource attributes must be local fragment references',
                    `${name}="${value}"`,
                );
            if (/^on/i.test(name)) javascript(`function handler(event){${value}\n}`);
        }
        if (element.localName === 'script') {
            if (
                element.hasAttribute('src') ||
                (element.hasAttribute('type') &&
                    !['text/javascript', 'application/javascript'].includes(
                        element.getAttribute('type'),
                    ))
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
    timeout = 7200000,
    onPartial = () => {},
    { capable = false, mcp, onRetry = () => {} } = {},
) {
    const controller = new AbortController();
    const cancel = () => controller.abort(new Error('Visual generation canceled.'));
    parentSignal.addEventListener('abort', cancel, { once: true });
    if (parentSignal.aborted) cancel();
    const run = async () => {
        const { JSDOM } = await import('jsdom');
        const document = JSDOM.fragment('').ownerDocument;
        let validationError;
        // Skills put into the prompt after a rejection; loaded marks what this attempt received.
        const given = new Set();
        let previous = '';
        for (let attempt = 0; attempt < 2; attempt++) {
            if (controller.signal.aborted) throw controller.signal.reason;
            const loaded = new Set(given);
            const task = {
                request: input.request,
                earlierTitles: input.earlierTitles,
                ...(validationError && { validationError }),
            };
            // One writer call; returns its answer with any text tool calls, or overflow when it outgrew the limit.
            const ask = async (note, text, stream) => {
                if (stream) onPartial('');
                try {
                    const answer = await mediaCall(provider, selection, VISUAL_CALL, {
                        instructions:
                            INSTRUCTIONS +
                            [...given].map((name) => '\n\n' + SKILLS[name].text).join('') +
                            (input.instruction
                                ? `\nChange it as the learner asks: ${input.instruction}`
                                : input.differentVersion
                                  ? '\nCreate a different version: take a different approach than the previous version while explaining the same request.'
                                  : '') +
                            '\nCurrent theme palette: ' +
                            JSON.stringify(paletteFor(input.theme)) +
                            note,
                        input: text,
                        signal: controller.signal,
                        onText: stream
                            ? (_bytes, partial) =>
                                  onPartial(visualMarkup(partial.replace(CALLS, ''), document))
                            : undefined,
                        tools: {
                            capable,
                            textTools: TEXT_TOOL,
                            tools: [LOAD_SKILL],
                            mcp,
                            runTool: (_name, input) => {
                                const skill = SKILLS[input?.name];
                                if (!skill)
                                    throw new Error(
                                        `Choose a skill: ${Object.keys(SKILLS).join(' or ')}.`,
                                    );
                                loaded.add(input.name);
                                return skill.text;
                            },
                        },
                    });
                    return { answer };
                } catch (error) {
                    if (!error.invalidOutput) throw error;
                    return { answer: '', overflow: error.message };
                }
            };
            // A retry of a written fragment answers a patch; when it does not apply, one whole fragment, as cut repairs do.
            const fix = previous
                ? patched(
                      previous,
                      (
                          await ask(
                              VISUAL_PATCH_NOTE,
                              withSource(task, 'previousFragment', previous),
                              false,
                          )
                      ).answer,
                  )
                : null;
            const { answer, overflow } =
                fix !== null
                    ? { answer: fix }
                    : input.current
                      ? await ask(
                            VERSION_NOTE,
                            withSource(task, 'currentVersion', input.current),
                            true,
                        )
                      : await ask('', JSON.stringify(task), true);
            const fragment = answer.replace(CALLS, '');
            let result, error;
            try {
                if (overflow) throw new Error(overflow);
                result = await validate(fragment);
            } catch (caught) {
                error = caught;
            }
            if (attempt) {
                if (error) throw error;
                return result;
            }
            // Text-mode load_skill calls asked for skills that never reached the model.
            const asked = [...answer.matchAll(CALLS)]
                .map(([, json]) => readCall({ json }))
                .filter((call) => call.name === LOAD_SKILL.name)
                .map((call) => call.input.name);
            const missing = Object.keys(SKILLS).filter(
                (name) =>
                    !loaded.has(name) && (asked.includes(name) || SKILLS[name].uses.test(fragment)),
            );
            if (!error && !missing.length) return result;
            for (const name of missing) given.add(name);
            previous = overflow ? '' : fragment;
            validationError =
                error?.message ??
                `Visual output is invalid: it needs the ${missing.join(' and ')} skill, now included in your instructions; follow it.`;
            onRetry(validationError);
        }
    };
    try {
        return await raced(controller, run(), timeout, 'Visual generation timed out.');
    } finally {
        parentSignal.removeEventListener('abort', cancel);
    }
}
