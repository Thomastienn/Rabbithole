// Built-app browser fixture (in-process fake provider, not a live model) for the focused chat turn layout.
import { verifyOut } from './lib/output.mjs';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { Store } from '../../server/store.mjs';
import { createApp } from '../../server/app.mjs';

const run = promisify(execFile),
  session = `chat-layout-${process.pid}`;
// Headless Chrome reports (hover: none); emulate a mouse to check the code-copy reveal.
const b = async (...args) =>
  (
    await run('agent-browser', ['--session', session, ...args], {
      env: {
        ...process.env,
        AGENT_BROWSER_ARGS:
          process.env.HOVER === 'none'
            ? ''
            : '--blink-settings=primaryHoverType=2,availableHoverTypes=2,primaryPointerType=4,availablePointerTypes=4',
      },
    })
  ).stdout;
const ev = async (expression) => JSON.parse(await b('eval', expression, '--json')).data.result;
const wait = (expression) => b('wait', '--fn', `!!(${expression})`);
const click = (name) => b('find', 'role', 'button', 'click', '--name', name, '--exact');
const store = new Store(join(mkdtempSync(join(tmpdir(), 'chat-layout-')), 'data.sqlite'));
const text = 'Use a mutex to guard shared state. '.repeat(12).trim();
const root = store.create('Layout fixture');
store.message(root.id, 'user', 'What is a mutex?', 'completed');
const reply = store.message(root.id, 'assistant', text, 'completed');
store.usage(reply, { input: 1200, output: 80, cacheRead: 40 });
store.pendingSuggestions(root.id, reply);
store.finishSuggestions(root.id, reply, [{ start: 6, end: 11, text: 'mutex' }], null);
const art = store.pendingArtifact(
  root.id,
  reply,
  'Lock flow',
  'Lock flow: a thread takes the lock.',
);
store.finishArtifact(root.id, art.id, 'flowchart LR\n A[Take lock] --> B[Release]');
store.message(root.id, 'user', 'And a semaphore?', 'completed');
store.message(root.id, 'assistant', 'Partial answer', 'failed');
store.message(root.id, 'user', 'Why did it stop?', 'completed');
store.message(root.id, 'assistant', 'Half a thought', 'interrupted');
let release;
const app = createApp({
  store,
  auth: { status: () => ({ connected: true }) },
  provider: {
    models: async () => [{ model: 'fixture', label: 'Fixture model', isDefault: true }],
    generate: async (_tree, _input, emit) => {
      emit({ type: 'item', item: 'one', text: 'Streaming…' });
      await new Promise((resolve) => {
        release = resolve;
      });
      emit({ type: 'status', status: 'completed' });
    },
  },
});
await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
const steps = [];
try {
  await b('set', 'viewport', '1600', '1000');
  await b('open', `http://127.0.0.1:${app.server.address().port}`);
  await b('set', 'media', 'light', 'reduced-motion');
  await b('wait', '[aria-label="Open Layout fixture"]');
  await click('Open Layout fixture');
  await wait(
    `document.querySelector('.focused-chat .diagram-card svg, .focused-chat .diagram-card img')`,
  );
  const slim = await ev(`document.querySelector('.focused-chat').getBoundingClientRect().width`);
  await click('Expand chat');
  await wait(`document.querySelector('.focused-chat').getBoundingClientRect().width > ${slim}`);

  await b('mouse', 'move', '5', '5');
  await ev(`document.activeElement?.blur(); true`);
  const layout = await ev(`(() => {
    const list = document.querySelector('.focused-chat [role=log]').getBoundingClientRect();
    const [q1, r1, q2, r2] = document.querySelectorAll('.focused-chat article');
    const bubble = q1.querySelector('.question-bubble'), b = bubble.getBoundingClientRect();
    const order = [r1.querySelector('.passage'), r1.querySelector('.diagram-card'), r1.querySelector('.reply-usage')]
      .map(n => n && Array.from(r1.querySelectorAll('*')).indexOf(n));
    return {
      questionText: q1.textContent, rightGap: list.right - b.right, leftGap: b.left - list.left,
      tinted: getComputedStyle(bubble).backgroundColor === getComputedStyle(document.querySelector('.question-bubble')).backgroundColor && getComputedStyle(bubble).backgroundColor !== 'rgba(0, 0, 0, 0)',
      header: r1.querySelector('[id]')?.textContent, labelled: document.getElementById(r1.getAttribute('aria-labelledby'))?.textContent,
      replyWidth: r1.querySelector('.passage').getBoundingClientRect().width, listWidth: list.width,
      chWidth: parseFloat(getComputedStyle(r1.firstElementChild).maxWidth),
      order, underline: !!r1.querySelector('u.suggestion'),
      usageOpacity: getComputedStyle(r1.querySelector('.reply-usage')).opacity,
      innerGap: r1.getBoundingClientRect().top - q1.getBoundingClientRect().bottom,
      turnGap: q2.getBoundingClientRect().top - r1.getBoundingClientRect().bottom,
      failed: [...r2.querySelectorAll('[role=status]')].map(n => n.textContent).join('|'),
    };
  })()`);
  assert.ok(!/\bYou\b/.test(layout.questionText), 'no "You" label');
  assert.ok(layout.rightGap < layout.leftGap, 'question bubble is right-aligned');
  assert.ok(layout.tinted, 'question bubble carries the tint');
  assert.match(layout.header, /^Tutor · /);
  assert.equal(
    layout.labelled,
    layout.header,
    'reply article is labelled by its Tutor · model header',
  );
  assert.ok(
    Math.abs(layout.replyWidth - 640) < 1 && layout.listWidth > layout.replyWidth,
    `reply text capped (${layout.replyWidth} of ${layout.listWidth})`,
  );
  assert.ok(
    layout.order[0] < layout.order[1] && layout.order[1] < layout.order[2],
    'text, then artifacts, then usage footer',
  );
  assert.ok(layout.underline, 'suggestion underline drawn');
  const noHover = await ev(`matchMedia('(hover: none)').matches`);
  assert.equal(layout.usageOpacity, '1', 'mockup reply footer stays visible');
  assert.ok(
    layout.turnGap > layout.innerGap * 2,
    `turn gap ${layout.turnGap} > question-reply gap ${layout.innerGap}`,
  );
  assert.match(layout.failed, /Reply failed/, 'failed state stays on its reply');
  steps.push(
    `learner bubble right-aligned and tinted, no label; "${layout.header}" header labels the reply; text capped ${Math.round(layout.replyWidth)}px of ${Math.round(layout.listWidth)}px; order passage → diagram → usage; turn gap ${Math.round(layout.turnGap)}px vs ${Math.round(layout.innerGap)}px; failed status on its reply`,
  );

  // Transcript world (docs/visual-identity-spec.md, Focused chat): serif replies, sans questions, quiet metadata, distinct statuses.
  const transcript = () =>
    ev(`(() => {
    const [q1, r1, , r2, , r3] = document.querySelectorAll('.focused-chat article');
    const css = n => getComputedStyle(n), probe = document.createElement('span');
    document.querySelector('.focused-chat').append(probe);
    const tone = v => { probe.style.color = 'var(' + v + ')'; return css(probe).color; };
    const reply = css(r1.querySelector('.reply-md p .astryx-text') ?? r1.querySelector('.reply-md')), question = css(q1.querySelector('.question-bubble .astryx-text'));
    const status = n => n.querySelector('.reply-status'), out = {
      replyFont: reply.fontFamily, replySize: reply.fontSize, replyLine: parseFloat(reply.lineHeight) / parseFloat(reply.fontSize),
      questionFont: question.fontFamily, bubble: css(q1.querySelector('.question-bubble')).backgroundColor, replyBg: css(r1.querySelector('.passage')).backgroundColor,
      meta: css(r1.querySelector('[id]')).color, primary: tone('--color-text-primary'), secondary: tone('--color-text-secondary'), error: tone('--color-text-error'),
      failed: [status(r2).textContent, css(status(r2)).color], interrupted: [status(r3).textContent, css(status(r3)).color, status(r3).getBoundingClientRect().height],
      underline: css(r1.querySelector('u.suggestion')).textDecorationStyle, ground: css(document.querySelector('.focused-chat')).backgroundColor,
    };
    probe.remove(); return out;
  })()`);
  const look = async (mode) => {
    const t = await transcript();
    assert.match(t.replyFont, /Literata/, `${mode}: reply in the reading serif`);
    assert.equal(t.replySize, '17px', `${mode}: reply 17px`);
    assert.ok(
      Math.abs(t.replyLine - 1.7) < 0.02,
      `${mode}: reply line height 1.7 (${t.replyLine})`,
    );
    assert.match(t.questionFont, /Archivo/, `${mode}: question in the UI sans`);
    assert.ok(
      t.bubble !== 'rgba(0, 0, 0, 0)' && t.replyBg === 'rgba(0, 0, 0, 0)',
      `${mode}: question filled, reply without bubble`,
    );
    assert.equal(t.meta, t.secondary, `${mode}: reply metadata in muted chalk`);
    assert.match(t.failed[0], /Reply failed/);
    assert.equal(t.failed[1], t.error, `${mode}: failed status in the alert colour`);
    assert.match(t.interrupted[0], /Reply interrupted/);
    assert.ok(
      t.interrupted[2] > 0 && t.interrupted[1] === t.secondary,
      `${mode}: interrupted status visible, muted, not alert`,
    );
    assert.equal(t.underline, 'dotted', `${mode}: suggestion underline dotted`);
    await wait(
      `!document.querySelector('.focused-chat .diagram-card').textContent.includes('Rendering diagram')`,
    );
    const file = join(verifyOut, `focused-chat-transcript-${mode}.png`);
    await b('screenshot', file);
    steps.push(
      `${mode}: serif reply ${t.replySize}/${t.replyLine.toFixed(2)}, sans question bubble, muted metadata, failed in alert colour, interrupted muted; ${file}`,
    );
    return t;
  };
  const reopen = async (set) => {
    await ev(`${set}; location.reload(); true`);
    await b('wait', '[aria-label="Open Layout fixture"]');
    await click('Open Layout fixture');
    await wait(
      `document.querySelector('.focused-chat .diagram-card svg, .focused-chat .diagram-card img')`,
    );
    if (!(await ev(`!!document.querySelector('.tree-workspace[data-expanded=true]')`)))
      await click('Expand chat');
    await b('mouse', 'move', '5', '5');
  };
  const dark = await look('dark');
  await reopen(`localStorage.setItem('treetutor.appearance', 'light')`);
  const light = await look('light');
  assert.notEqual(dark.ground, light.ground, 'light appearance is its own ground');
  await reopen(`localStorage.removeItem('treetutor.appearance')`);

  const shots = mkdtempSync(join(tmpdir(), 'chat-layout-shots-')),
    shot = join(shots, 'focused-chat-layout.png');
  if (noHover) {
    await b('screenshot', shot);
    steps.push('no-hover device: usage footer always visible');
  } else {
    await b('hover', '.focused-chat article:nth-of-type(2) .passage');
    await wait(`getComputedStyle(document.querySelector('.reply-usage')).opacity === '1'`);
    await b('screenshot', shot);
    await b('mouse', 'move', '5', '5');
    await wait(`getComputedStyle(document.querySelector('.reply-usage')).opacity === '1'`);
    await ev(`document.querySelector('.focused-chat u.suggestion[tabindex]').focus(); true`);
    await wait(`getComputedStyle(document.querySelector('.reply-usage')).opacity === '1'`);
    steps.push('reply footer stays visible at rest, on hover and on keyboard focus');
  }

  await b('find', 'role', 'textbox', 'fill', '--name', 'Your question', 'Third question');
  await b('press', 'Enter');
  await wait(
    `[...[...document.querySelectorAll('.focused-chat article')].at(-1).querySelectorAll('[role=status]')].some(n => n.textContent === 'Responding…')`,
  );
  steps.push('streaming status shows on the new reply');
  release?.();
  console.log(JSON.stringify({ pass: true, steps, screenshot: shot }, null, 2));
} catch (e) {
  console.error(steps);
  throw e;
} finally {
  release?.();
  await b('close').catch(() => {});
  app.stop();
  store.close();
}
