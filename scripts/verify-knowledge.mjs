// Built-app keyboard and responsive checks over a seeded local graph and in-process provider fixture; no live model calls.
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { Store } from '../server/store.mjs';
import { createApp } from '../server/app.mjs';

const run = promisify(execFile), session = `knowledge-${process.pid}`;
const b = async (...args) => (await run('agent-browser', ['--session', session, ...args])).stdout;
const ev = async expression => JSON.parse(await b('eval', expression, '--json')).data.result;
const wait = expression => b('wait', '--fn', `!!(${expression})`);
const key = name => b('press', name);
const store = new Store(join(mkdtempSync(join(tmpdir(), 'tt-knowledge-')), 'data.sqlite'));
const root = store.create('Concurrency fixture');
const message = store.message(root.id, 'assistant', 'A mutex guards shared state.', 'completed');
const other = store.create('Other learning tree');
const second = store.message(other.id, 'assistant', 'Mutual exclusion protects shared state.', 'completed');
const app = createApp({ store, auth: { status: () => ({ connected: true }) }, provider: { models: async () => [{ model: 'fixture', label: 'Fixture model', isDefault: true }] } });
await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${app.server.address().port}`;
const knowledge = '.tree-navigation-footer button[aria-current=page]';
const openKnowledge = async () => { await reach('.tree-navigation-footer button:first-child'); await key('Enter'); await wait(`document.activeElement?.id === 'return-to-learning'`); };
const returnToLearning = async () => { await reach('#return-to-learning'); await key('Enter'); await wait(`!document.querySelector('[aria-label="Learning workspace"]').hidden`); };
async function reach(selector) {
  for (let i = 0; i < 60; i++) {
    if (await ev(`document.activeElement?.matches(${JSON.stringify(selector)})`)) return;
    await key('Tab');
  }
  throw new Error(`Tab did not reach ${selector}`);
}
const group = name => `[role=group][aria-label="Corrections for ${name}"]`;
const know = `${group('Mutex')} button:nth-of-type(1)`;
const unknown = `${group('Mutex')} button:nth-of-type(2)`;
const merge = `${group('Mutex')} button:nth-of-type(3)`;
const steps = [], shots = resolve('.impeccable/review');
mkdirSync(shots, { recursive: true });
try {
  await b('set', 'viewport', '1440', '1000');
  await b('open', origin);
  await b('set', 'media', 'light', 'reduced-motion');
  await b('wait', '.tree-navigation-footer');
  await openKnowledge();
  await wait(`document.querySelector('${knowledge}')?.textContent === 'Knowledge'`);
  await b('wait', '--text', 'No concepts yet');
  assert.equal(await ev(`getComputedStyle(document.querySelector('[aria-label="Learning workspace"]')).display`), 'none');
  steps.push('Keyboard reaches the rail Knowledge action with Tab/Enter; empty state explains how concepts appear; learning workspace is hidden');

  store.addGraph({ concepts: [{ name: 'Mutex', topics: ['Concurrency'] }, { name: 'Mutual exclusion', topics: ['Concurrency', 'Operating systems'] }], links: [{ from: 'Mutex', to: 'Mutual exclusion', kind: 'related' }] }, message);
  store.addGraph({ concepts: [{ name: 'Mutex', topics: ['Concurrency'] }], links: [] }, second);
  await key('Tab');
  await wait(`document.activeElement?.textContent === 'Refresh Knowledge'`);
  await key('Enter');
  await wait(`document.querySelectorAll('[data-concept]').length === 3`);
  assert.equal(await ev(`document.querySelector('.knowledge-panel').innerText.includes('met in 2 replies')`), true);
  await reach(know);
  assert.equal(await ev(`document.activeElement.matches(':focus-visible') && getComputedStyle(document.activeElement).outlineStyle !== 'none'`), true);
  await key('Enter');
  await wait(`document.querySelector('${know}')?.getAttribute('aria-pressed') === 'true'`);
  await key('Tab');
  assert.equal(await ev(`document.activeElement.matches(${JSON.stringify(unknown)})`), true);
  await key('Space');
  await wait(`document.querySelector('${unknown}')?.getAttribute('aria-pressed') === 'true'`);
  assert.equal(store.graph().concepts.find(c => c.name === 'Mutex').familiarity, 0);
  steps.push('Rows show multi-topic concepts and evidence across two learning trees; both corrections activate with Enter/Space and have visible focus');

  await key('Tab');
  await key('Enter');
  await b('wait', 'dialog[open]');
  await key('Escape');
  await wait(`!document.querySelector('dialog[open]') && document.activeElement.matches(${JSON.stringify(merge)})`);
  await key('Enter');
  await b('wait', 'dialog[open]');
  await reach('dialog[open] button[aria-expanded]');
  await key('Enter');
  await b('keyboard', 'type', 'Mutual exclusion');
  await key('ArrowDown');
  await key('Enter');
  await wait(`document.querySelector('dialog[open] button[aria-expanded]')?.textContent.includes('Mutual exclusion') && document.querySelector('dialog[open] button[aria-expanded]')?.getAttribute('aria-expanded') === 'false'`);
  await b('screenshot', join(shots, 'knowledge-merge.png'));
  await reach('dialog[open] button[type=submit]');
  // A failed storage write leaves the dialog and selected target available for retry.
  store.db.exec('CREATE TRIGGER reject_merge BEFORE DELETE ON concepts BEGIN SELECT RAISE(ABORT, \'fixture failure\'); END;');
  await key('Enter');
  await wait(`document.querySelector('dialog[open] [role=alert]')`);
  assert.equal(store.graph().concepts.length, 2);
  store.db.exec('DROP TRIGGER reject_merge');
  await reach('dialog[open] button[type=submit]');
  await key('Enter');
  await wait(`!document.querySelector('dialog[open]') && document.activeElement?.dataset.concept === 'Mutual exclusion'`);
  assert.equal(store.graph().concepts.length, 1);
  assert.equal(store.graph().concepts[0].evidence.met, 2);
  steps.push('Merge dialog opens/selects/submits entirely by keyboard; Escape restores trigger focus; a failed write retains the target for retry; successful merge focuses the kept concept');

  // Return to the learning workspace without losing the selected conversation, draft or map transform.
  await returnToLearning();
  await b('find', 'role', 'button', 'click', '--name', 'Open Other learning tree', '--exact');
  await b('wait', '[aria-label="Your question"]');
  await b('find', 'label', 'Your question', 'fill', 'Keep this draft');
  const transform = await ev(`document.querySelector('.react-flow__viewport').getAttribute('style')`);
  await openKnowledge();
  await wait(`document.querySelector('[aria-label="Learning workspace"]').hidden`);
  await returnToLearning();
  assert.equal(await ev(`document.querySelector('.focused-chat [role=textbox]').textContent`), 'Keep this draft');
  assert.equal(await ev(`document.querySelector('.react-flow__viewport').getAttribute('style')`), transform);
  steps.push('Keyboard rail navigation and Return to learning tree preserve the open conversation, composer draft and map transform');

  await openKnowledge();
  await b('wait', '[data-concept="Mutual exclusion"]');
  await b('set', 'viewport', '1440', '1000');
  await b('screenshot', join(shots, 'knowledge-desktop.png'));
  await b('set', 'viewport', '390', '844');
  await b('screenshot', join(shots, 'knowledge-mobile.png'));
  const widths = await ev(`({ viewport: innerWidth, document: document.documentElement.scrollWidth, panel: document.querySelector('.knowledge-panel').scrollWidth, outside: [...document.querySelectorAll('body *')].map(e => ({tag: e.tagName, cls: e.className, left: e.getBoundingClientRect().left, right: e.getBoundingClientRect().right})).filter(r => r.left < -1 || r.right > innerWidth + 1).slice(0, 12) })`);
  assert.ok(widths.document <= widths.viewport && widths.panel <= widths.viewport, 'no horizontal overflow at phone width: ' + JSON.stringify(widths));
  await b('reload');
  await b('wait', '#expand-learning-trees');
  await reach('#expand-learning-trees'); await key('Enter');
  await openKnowledge();
  await b('wait', '--text', 'You marked this as not understood');
  steps.push('Desktop/phone layouts fit; merged evidence and correction survive page reload');

  // Visual identity (spec, Knowledge page): slate field, raised cards, 1.5px chalk relations, selected concept in yellow, serif detail text.
  store.addGraph({ concepts: [{ name: 'Race condition', topics: ['Concurrency'] }, { name: 'Critical section', topics: ['Concurrency', 'Operating systems'] }, { name: 'Scheduler', topics: ['Operating systems'] }], links: [{ from: 'Critical section', to: 'Mutual exclusion', kind: 'builds on' }, { from: 'Race condition', to: 'Mutual exclusion', kind: 'related' }, { from: 'Scheduler', to: 'Critical section', kind: 'related' }] }, message);
  const look = {};
  for (const mode of ['dark', 'light']) {
    await b('set', 'viewport', '1440', '900');
    await ev(`localStorage.setItem('treetutor.appearance', '${mode}'); true`);
    await b('reload');
    await b('wait', '.tree-navigation-footer');
    await openKnowledge();
    await wait(`document.querySelectorAll('.knowledge-links line').length === 3`);
    look[mode] = await ev(`(() => { const s = getComputedStyle, root = s(document.documentElement), card = document.querySelector('[data-concept][aria-pressed=true]'), detail = document.querySelector('.knowledge-detail'), line = document.querySelector('.knowledge-links line[data-selected=true]'), plain = document.querySelector('.knowledge-links line[data-selected=false]');
      return { accent: root.getPropertyValue('--color-accent').trim(), cardOutline: s(card).outlineColor, cardRadius: s(card).borderRadius, cardSurface: s(card).backgroundColor, field: s(document.querySelector('.knowledge-panel')).backgroundColor, body: s(document.body).backgroundColor, detailRadius: s(detail).borderRadius, detailShadow: s(detail).boxShadow, lineWidth: s(line).strokeWidth, lineStroke: s(line).stroke, plainStroke: s(plain).stroke, reading: s(detail.querySelector('.knowledge-reading')).fontFamily, ui: s(card).fontFamily }; })()`);
    const l = look[mode], probe = await ev(`(() => { const e = document.createElement('i'); e.style.color = 'var(--color-accent)'; document.body.append(e); const c = getComputedStyle(e).color; e.remove(); return c; })()`);
    assert.equal(l.cardOutline, probe, `${mode} selected concept outlined in yellow`);
    assert.equal(l.lineStroke, probe, `${mode} selected concept's relations in yellow`);
    assert.notEqual(l.plainStroke, probe, `${mode} other relations in chalk`);
    assert.equal(l.lineWidth, '1.5px', `${mode} 1.5px relation lines`);
    assert.equal(l.cardRadius, '4px'); assert.equal(l.detailRadius, '6px');
    assert.ok([l.body, 'rgba(0, 0, 0, 0)'].includes(l.field), `${mode} bare slate field`);
    assert.notEqual(l.cardSurface, l.body, `${mode} raised concept cards`);
    assert.ok(!l.detailShadow.split(/,(?![^(]*\))/).some(x => x !== 'none' && !x.trim().endsWith('inset')), `${mode} no drop shadow`);
    assert.match(l.reading, /^"?Source Serif 4/, `${mode} serif detail text`);
    assert.match(l.ui, /^"?Public Sans/, `${mode} Public Sans cards`);
    await b('screenshot', resolve(`docs/verification/knowledge-${mode}.png`));
  }
  await b('set', 'viewport', '390', '844');
  await b('screenshot', resolve('docs/verification/knowledge-mobile-light.png'));
  steps.push('Dark and light: concept cards raised on the slate field, 1.5px chalk relations, selected concept and its relations in yellow, serif detail text, Public Sans cards, no drop shadow');
  console.log(JSON.stringify({ pass: true, steps, screenshots: [...['knowledge-desktop.png', 'knowledge-mobile.png', 'knowledge-merge.png'].map(p => join(shots, p)), ...['dark', 'light', 'mobile-light'].map(m => `docs/verification/knowledge-${m}.png`)] }, null, 2));
} catch (error) { console.error({ steps, snapshot: await b('snapshot', '-i').catch(() => '') }); throw error; }
finally { await b('close').catch(() => {}); await app.stop(); store.close(); }
