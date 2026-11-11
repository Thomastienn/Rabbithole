// Dialogs and menus: production UI/HTTP/SQLite, synthetic saved study and providers only.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { Store } from '../server/store.mjs';
import { createApp } from '../server/app.mjs';

const run = promisify(execFile), session = `dialog-identity-${process.pid}`;
const b = async (...args) => (await run('agent-browser', ['--session', session, ...args], { maxBuffer: 8 << 20 })).stdout;
const ev = async code => JSON.parse(await b('eval', code, '--json')).data.result;
const wait = code => b('wait', '--fn', `!!(${code})`);
const click = name => b('find', 'role', 'button', 'click', '--name', name, '--exact');
const item = name => b('find', 'role', 'menuitem', 'click', '--name', name, '--exact');
const idle = `!document.getAnimations().some(a => a.playState === 'running' && a.effect?.getTiming().iterations !== Infinity)`;
const menuOpen = `[...document.querySelectorAll('[role=menu]')].some(e => e.checkVisibility())`;
const dialog = `document.querySelector('[role=alertdialog][open]')`;
const dir = mkdtempSync(join(tmpdir(), 'tt-dialog-identity-')), store = new Store(join(dir, 'trees.sqlite'));
const root = store.create('Tournament trees', 'claude');
store.message(root.id, 'user', 'Explain tournament trees.', 'completed');
const source = store.message(root.id, 'assistant', 'Peterson locks pair threads at each level of a tournament tree. Each lock resolves two contenders.', 'completed');
store.branch(root, { messageId: source, start: 0, end: 8, text: 'Peterson', question: "Peterson's algorithm" }, 'Synthetic context only.');
store.layout(root.id, { folded: [], selected: root.id, panel: 'beside' });
const ok = { models: async () => [{ model: 'fixture', label: 'Fixture model', isDefault: true }, { model: 'fixture-2', label: 'Second model', isDefault: false }], generate: async (_t, _p, emit) => emit({ type: 'status', status: 'completed' }) };
const signedOut = { models: async () => { throw new Error('Synthetic signed-out provider'); }, generate: async () => {} };
const app = createApp({ store, dir, providers: { claude: ok, codex: signedOut }, auth: { status: () => ({ connected: false }) } });
await new Promise(r => app.server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${app.server.address().port}`, out = resolve('docs/verification');
const results = { issue: 'TreeTutor-nwx.10', checkedAt: new Date().toISOString(), evidence: 'Production build, agent-browser Chromium, isolated SQLite and HTTP; synthetic providers and study. No native provider inference.', appearances: {}, screenshots: [] };
const shot = async name => { await wait(idle); await wait(`document.fonts.status === 'loaded'`); const file = `dialogs-${name}.png`; await b('screenshot', join(out, file)); results.screenshots.push(file); };
// Resolves a theme token to its computed value in the current appearance; fill finds the painted surface behind an element.
const tokenFn = `const token = (name, prop = 'color') => { const el = document.createElement('i'); el.style[prop] = 'var(' + name + ')'; document.body.append(el); const value = getComputedStyle(el)[prop]; el.remove(); return value; };
  const fill = e => { while (e && getComputedStyle(e).backgroundColor === 'rgba(0, 0, 0, 0)') e = e.parentElement; return e && getComputedStyle(e).backgroundColor; };`;
try {
  await b('set', 'viewport', '1440', '900'); await b('set', 'media', 'light', 'reduced-motion');
  await b('open', origin);
  for (const mode of ['dark', 'light']) {
    const seen = results.appearances[mode] = {};
    await ev(`localStorage.setItem('treetutor.appearance', '${mode}'); true`); await b('reload');
    await wait(`document.querySelector('[aria-label="Model for next reply"]:not([disabled])') && ${idle}`);
    assert.equal(await ev(`document.querySelector('.chat-reply u.suggestion')?.textContent`), 'Peterson', 'a manually branched passage stays marked in the rendered reply');

    // Model menu: plain list on raised slate, yellow check on the current model, signed-out providers muted with their sign-in action.
    await click('Model for next reply'); await wait(menuOpen);
    seen.model = await ev(`(() => { ${tokenFn}
      const menu = [...document.querySelectorAll('[role=menu]')].find(e => e.checkVisibility()), checked = menu.querySelector('[role=menuitemradio][aria-checked=true]');
      const mark = checked.querySelector('.astryx-dropdown-menu-radio'), after = getComputedStyle(mark, '::after'), other = menu.querySelector('[role=menuitemradio][aria-checked=false] .astryx-dropdown-menu-radio');
      return { background: fill(menu), popover: token('--color-background-popover', 'backgroundColor'), current: checked.textContent, check: after.borderRightColor, accent: token('--color-accent'),
        checkBox: getComputedStyle(mark).backgroundColor, uncheckedBorder: getComputedStyle(other).borderTopColor, text: menu.textContent, signedOut: [...menu.querySelectorAll('*')].find(e => e.childElementCount === 0 && e.textContent === 'Codex · not connected') ? getComputedStyle([...menu.querySelectorAll('*')].find(e => e.childElementCount === 0 && e.textContent === 'Codex · not connected')).color : null, secondary: token('--color-text-secondary') };
    })()`);
    assert.equal(seen.model.background, seen.model.popover); assert.equal(seen.model.current, 'Fixture model');
    assert.equal(seen.model.check, seen.model.accent); assert.equal(seen.model.checkBox, 'rgba(0, 0, 0, 0)'); assert.equal(seen.model.uncheckedBorder, 'rgba(0, 0, 0, 0)');
    assert.equal(seen.model.signedOut, seen.model.secondary); assert.match(seen.model.text, /Continue with ChatGPT/); assert.match(seen.model.text, /Custom endpoint · not connected/);
    await shot(`model-menu-${mode}`);
    await b('press', 'Escape'); await wait(`document.activeElement?.getAttribute('aria-label') === 'Model for next reply'`);

    // Map menu, then delete confirmation from it.
    await click('Map menu'); await wait(menuOpen);
    assert.equal(await ev(`(() => { ${tokenFn} const menu = [...document.querySelectorAll('[role=menu]')].find(e => e.checkVisibility()); return fill(menu) === token('--color-background-popover', 'backgroundColor'); })()`), true);
    await shot(`map-menu-${mode}`);
    await item('Delete chat…'); await wait(`${dialog} && document.activeElement?.textContent === 'Keep conversations' && ${idle}`);
    seen.delete = await ev(`(() => { ${tokenFn}
      const d = ${dialog}, [keep, del] = [...d.querySelectorAll('footer button, button')].filter(b => ['Keep conversations', 'Delete chat'].includes(b.textContent)), s = getComputedStyle(del);
      return { title: d.querySelector('h2').textContent, text: d.textContent, background: getComputedStyle(d).backgroundColor, surface: token('--color-background-surface', 'backgroundColor'), shadow: getComputedStyle(d).boxShadow,
        action: s.backgroundColor, actionText: s.color, ring: s.boxShadow, alert: token('--color-border-error'), alertText: token('--color-text-error'), space: del.getBoundingClientRect().left - keep.getBoundingClientRect().right, gap: d.querySelector('[id]:not(h2)') && d.querySelector('h2').nextElementSibling.getBoundingClientRect().top - d.querySelector('h2').getBoundingClientRect().bottom };
    })()`);
    assert.equal(seen.delete.title, 'Delete chat “Tournament trees”?');
    assert.match(seen.delete.text, /2 conversations and their messages, branches, diagrams, videos and saved layout will be permanently deleted\..*This cannot be undone\./);
    assert.equal(seen.delete.background, seen.delete.surface); assert.ok(seen.delete.shadow === 'none' || seen.delete.shadow.endsWith('inset'), `hairline seam, no drop shadow: ${seen.delete.shadow}`);
    assert.equal(seen.delete.action, 'rgba(0, 0, 0, 0)'); assert.equal(seen.delete.actionText, seen.delete.alertText); assert.ok(seen.delete.ring.includes(seen.delete.alert), seen.delete.ring);
    assert.ok(seen.delete.space >= 24, `destructive action set apart: ${seen.delete.space}px`); assert.ok(seen.delete.gap > 0, 'title and consequence separated');
    await shot(`delete-${mode}`);
    await b('press', 'Tab'); await wait(`document.activeElement?.textContent === 'Delete chat'`);
    seen.deleteFocused = await ev(`(() => { ${tokenFn} const s = getComputedStyle(document.activeElement); return { action: s.backgroundColor, error: token('--color-error', 'backgroundColor'), text: s.color, onError: token('--color-on-error') }; })()`);
    assert.equal(seen.deleteFocused.action, seen.deleteFocused.error); assert.equal(seen.deleteFocused.text, seen.deleteFocused.onError);
    await shot(`delete-focused-${mode}`);
    await b('press', 'Escape'); await wait(`!${dialog} && document.activeElement?.getAttribute('aria-label') === 'Map menu'`);
    assert.equal((await (await fetch(`${origin}/api/trees/${root.id}`)).json()).title, 'Tournament trees', 'cancel keeps the chat');

    // Rename stays inline in the header; Escape returns focus to the title.
    await click('Rename conversation'); await wait(`document.activeElement?.closest('.chat-header') && document.activeElement.value === 'Tournament trees'`);
    await shot(`rename-${mode}`);
    await b('press', 'Escape'); await wait(`document.activeElement?.id === 'rename-conversation'`);

    // Passage prompt: anchored to the selection, raised slate, yellow ring, flips below when the header is in the way.
    await ev(`(() => { const t = document.querySelector('.chat-reply .reply-md'), w = document.createTreeWalker(t, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode()) && !n.textContent.includes('locks')) {} const start = n.textContent.indexOf('locks'), r = document.createRange(); r.setStart(n, start); r.setEnd(n, start + 5); getSelection().removeAllRanges(); getSelection().addRange(r); t.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })); return true; })()`);
    await wait(`document.querySelector('.branch-form input') === document.activeElement`);
    seen.prompt = await ev(`(() => { ${tokenFn}
      const f = document.querySelector('.branch-form'), s = getComputedStyle(f), box = document.querySelector('.passage-box').getBoundingClientRect(), header = document.querySelector('.chat-header').getBoundingClientRect();
      return { border: s.borderTopColor, accent: token('--color-accent'), background: s.backgroundColor, popover: token('--color-background-popover', 'backgroundColor'), radius: s.borderTopLeftRadius, shadow: getComputedStyle(f.parentElement).boxShadow, clear: box.top >= header.bottom, width: box.width, label: f.textContent };
    })()`);
    assert.equal(seen.prompt.border, seen.prompt.accent); assert.equal(seen.prompt.background, seen.prompt.popover); assert.equal(seen.prompt.radius, '6px');
    assert.equal(seen.prompt.shadow, 'none'); assert.equal(seen.prompt.clear, true); assert.ok(seen.prompt.width <= 448); assert.match(seen.prompt.label, /Question about this passage/);
    await shot(`passage-prompt-${mode}`);
    await b('press', 'Escape'); await wait(`!document.querySelector('.branch-form')`);

    if (process.env.IMPECCABLE_SCAN) {
      await click('Map menu'); await wait(menuOpen); await item('Delete chat…'); await wait(dialog);
      const html = await ev(`document.documentElement.outerHTML.replace(/<script\\b[^>]*>[\\s\\S]*?<\\/script>/gi, '').replace('<head>', '<head><base href="${origin}/">')`);
      await b('press', 'Escape');
      const target = join(dir, `${mode}.html`); writeFileSync(target, html);
      let scan; try { scan = await run(process.env.IMPECCABLE_SCAN, ['detect', `file://${target}`, '--json']); }
      catch (error) { if (error.code !== 2) throw error; scan = error; }
      seen.detector = JSON.parse(scan.stdout);
    }
    console.log(`PASS: ${mode} model menu, map menu, delete confirmation, rename and passage prompt`);
  }
  writeFileSync(join(out, 'dialogs-identity-results.json'), JSON.stringify(results, null, 2) + '\n');
} finally {
  await b('close').catch(() => {});
  app.stop(); store.close();
}
