// Built-app keyboard and responsive checks over a seeded local graph and in-process provider fixture; no live model calls.
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
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
const knowledge = '.view-tabs button[aria-current=page]';
const openKnowledge = async () => { await reach('.view-tabs button:nth-child(3)'); await key('Enter'); await wait(`!document.querySelector('main[aria-label=Knowledge]').hidden`); };
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
  await b('wait', '.view-tabs');
  await openKnowledge();
  await wait(`document.querySelector('${knowledge}')?.textContent === 'Knowledge'`);
  await b('wait', '--text', 'No concepts yet');
  assert.equal(await ev(`getComputedStyle(document.querySelector('[aria-label="Learning workspace"]')).display`), 'none');
  steps.push('Keyboard reaches the band Knowledge tab with Tab/Enter; empty state explains how concepts appear; learning workspace is hidden');

  store.addGraph({ concepts: [{ name: 'Mutex', topics: ['Concurrency'] }, { name: 'Mutual exclusion', topics: ['Concurrency', 'Operating systems'] }], links: [{ from: 'Mutex', to: 'Mutual exclusion', kind: 'related' }] }, message);
  store.addGraph({ concepts: [{ name: 'Mutex', topics: ['Concurrency'] }], links: [] }, second);
  // Focus stays on the band's Knowledge tab; Tab on through the band into the page.
  for (let i = 0; i < 12 && await ev(`document.activeElement?.textContent`) !== 'Refresh Knowledge'; i++) await key('Tab');
  await wait(`document.activeElement?.textContent === 'Refresh Knowledge'`);
  await key('Enter');
  await wait(`document.querySelectorAll('[data-concept]').length === 3`);
  assert.equal(await ev(`[...document.querySelectorAll('.knowledge-evidence dt')].find(d => d.textContent === 'Met in replies')?.nextElementSibling.textContent`), '2');
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
  steps.push('Keyboard band navigation and Return to learning tree preserve the open conversation, composer draft and map transform');

  await openKnowledge();
  await b('wait', '[data-concept="Mutual exclusion"]');
  await b('set', 'viewport', '1440', '1000');
  await b('screenshot', join(shots, 'knowledge-desktop.png'));
  await b('set', 'viewport', '390', '844');
  await b('screenshot', join(shots, 'knowledge-mobile.png'));
  const widths = await ev(`({ viewport: innerWidth, document: document.documentElement.scrollWidth, panel: document.querySelector('.knowledge-panel').scrollWidth, outside: [...document.querySelectorAll('body *')].map(e => ({tag: e.tagName, cls: e.className, left: e.getBoundingClientRect().left, right: e.getBoundingClientRect().right})).filter(r => r.left < -1 || r.right > innerWidth + 1).slice(0, 12) })`);
  assert.ok(widths.document <= widths.viewport && widths.panel <= widths.viewport, 'no horizontal overflow at phone width: ' + JSON.stringify(widths));
  // Narrow views move into the Contents drawer (verify-narrow); reload checks persistence at desktop width.
  await b('set', 'viewport', '1440', '1000');
  await b('reload');
  await b('wait', '.view-tabs');
  await openKnowledge();
  await b('wait', '--text', 'You marked this as not understood');
  steps.push('Desktop/phone layouts fit; merged evidence and correction survive page reload');

  // Visual identity (mockup Knowledge): deep field, raised cards with familiarity rings, related lines and builds-on arrows, paper selection and focus, serif detail text.
  store.addGraph({ concepts: [{ name: 'Race condition', topics: ['Concurrency'] }, { name: 'Critical section', topics: ['Concurrency', 'Operating systems'] }, { name: 'Scheduler', topics: ['Operating systems'] }], links: [{ from: 'Critical section', to: 'Mutual exclusion', kind: 'builds on' }, { from: 'Race condition', to: 'Mutual exclusion', kind: 'related' }, { from: 'Scheduler', to: 'Critical section', kind: 'related' }] }, message);
  const look = {};
  for (const mode of ['dark', 'light']) {
    await b('set', 'viewport', '1440', '900');
    await ev(`localStorage.setItem('treetutor.appearance', '${mode}'); true`);
    await b('reload');
    await b('wait', '.view-tabs');
    await openKnowledge();
    await wait(`document.querySelectorAll('.knowledge-links line').length === 3`);
    // Select a concept that is not linked to everything, so plain and builds-on relations both show unselected.
    await ev(`document.querySelector('[data-concept="Scheduler"]').click(); true`);
    await wait(`document.querySelector('.knowledge-links line[data-selected=false][data-kind="builds on"]')`);
    look[mode] = await ev(`(() => { const s = getComputedStyle, card = document.querySelector('[data-concept][aria-pressed=true]'), detail = document.querySelector('.knowledge-detail'), line = document.querySelector('.knowledge-links line[data-selected=true]'), plain = document.querySelector('.knowledge-links line[data-selected=false][data-kind=related]'), builds = document.querySelector('.knowledge-links line[data-selected=false][data-kind="builds on"]');
      const rgb = c => c.match(/[\\d.]+/g).slice(0, 3).map(Number), lum = c => { const [r, g, b] = rgb(c).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
      const ratio = (f, b) => { const [x, y] = [lum(f), lum(b)].sort((p, q) => q - p); return +((x + 0.05) / (y + 0.05)).toFixed(2); };
      const field = s(document.querySelector('.knowledge-field')).backgroundColor, surface = s(detail).backgroundColor;
      const contrast = { topic: ratio(s(document.querySelector('.knowledge-topic h2')).color, field), key: ratio(s(document.querySelector('.knowledge-key')).color, s(document.querySelector('.knowledge-panel')).backgroundColor === 'rgba(0, 0, 0, 0)' ? s(document.body).backgroundColor : s(document.querySelector('.knowledge-panel')).backgroundColor), level: ratio(s(card.querySelector('.concept-level')).color, s(card).backgroundColor), name: ratio(s(card).color, s(card).backgroundColor), evidence: ratio(s(detail.querySelector('dt')).color, surface), reading: ratio(s(detail.querySelector('.knowledge-reading')).color, surface) };
      return { cardOutline: s(card).outlineColor, cardOutlineWidth: s(card).outlineWidth, cardRadius: s(card).borderRadius, cardSurface: s(card).backgroundColor, field, body: s(document.body).backgroundColor, detailRadius: s(detail).borderRadius, detailShadow: s(detail).boxShadow, lineWidth: s(line).strokeWidth, lineStroke: s(line).stroke, plainStroke: s(plain).stroke, plainWidth: s(plain).strokeWidth, buildsMarker: builds.getAttribute('marker-end'), plainMarker: plain.getAttribute('marker-end'), reading: s(detail.querySelector('.knowledge-reading')).fontFamily, ui: s(card).fontFamily,
        rings: [...document.querySelectorAll('[data-concept] .fam')].map(f => f.dataset.fill), key: document.querySelector('.knowledge-key').textContent, contrast }; })()`);
    const l = look[mode], probe = await ev(`(() => { const e = document.createElement('i'); e.style.color = 'var(--treetutor-paper)'; document.body.append(e); const c = getComputedStyle(e).color; e.remove(); return c; })()`);
    assert.equal(l.cardOutline, probe, `${mode} selected concept outlined in paper`);
    assert.equal(l.cardOutlineWidth, '2px');
    assert.equal(l.lineStroke, probe, `${mode} selected concept's relations in paper`);
    assert.equal(l.lineWidth, '2px');
    assert.notEqual(l.plainStroke, probe, `${mode} other relations quiet`);
    assert.equal(l.plainWidth, '1.5px', `${mode} 1.5px relation lines`);
    assert.equal(l.buildsMarker, 'url(#knowledge-arrow)', `${mode} builds on draws an arrow`); assert.equal(l.plainMarker, null, `${mode} related is a plain line`);
    assert.ok(l.rings.length >= 5 && l.rings.every(f => ['none', 'some', 'full'].includes(f)), `${mode} every concept shows a familiarity ring`);
    assert.equal(l.key, 'UnfamiliarSome familiarityFamiliarLine: relatedArrow: builds on', `${mode} key text names familiarity and relation forms`);
    for (const [name, value] of Object.entries(l.contrast)) assert.ok(value >= 4.5, `${mode} ${name} text contrast ${value} below AA`);
    assert.equal(l.cardRadius, '3px'); assert.equal(l.detailRadius, '4px');
    assert.notEqual(l.field, l.body, `${mode} deep concept field`);
    assert.notEqual(l.cardSurface, l.body, `${mode} raised concept cards`);
    assert.ok(!l.detailShadow.split(/,(?![^(]*\))/).some(x => x !== 'none' && !x.trim().endsWith('inset')), `${mode} no drop shadow`);
    assert.match(l.reading, /^"?Literata/, `${mode} serif detail text`);
    assert.match(l.ui, /^"?Archivo/, `${mode} Archivo cards`);
    await b('screenshot', resolve(`docs/verification/knowledge-${mode}.png`));
    await reach(`${group('Scheduler')} button:nth-of-type(1)`);
    l.focusRing = await ev(`getComputedStyle(document.activeElement).outlineColor`);
    assert.equal(l.focusRing, probe, `${mode} paper focus ring on detail controls`);
    await reach(`${group('Scheduler')} button:nth-of-type(3)`);
    await key('Enter');
    await b('wait', 'dialog[open]');
    await b('screenshot', resolve(`docs/verification/knowledge-merge-${mode}.png`));
    await key('Escape');
    await wait(`!document.querySelector('dialog[open]')`);
  }
  writeFileSync(resolve('docs/verification/knowledge-results.json'), JSON.stringify({ checkedAt: new Date().toISOString(), evidence: 'Production build in Chromium via agent-browser over a seeded local graph; no model calls', look }, null, 2) + '\n');
  await b('set', 'viewport', '390', '844');
  await b('screenshot', resolve('docs/verification/knowledge-mobile-light.png'));
  steps.push('Dark and light: concept cards raised on the deep field with familiarity rings and key text, related lines and builds-on arrows, selected concept and its relations in paper, paper focus ring, AA text contrast, serif detail text, Archivo cards, no drop shadow, merge dialog');
  console.log(JSON.stringify({ pass: true, steps, screenshots: [...['knowledge-desktop.png', 'knowledge-mobile.png', 'knowledge-merge.png'].map(p => join(shots, p)), ...['dark', 'light', 'merge-dark', 'merge-light', 'mobile-light'].map(m => `docs/verification/knowledge-${m}.png`)] }, null, 2));
} catch (error) { console.error({ steps, snapshot: await b('snapshot', '-i').catch(() => '') }); throw error; }
finally { await b('close').catch(() => {}); await app.stop(); store.close(); }
