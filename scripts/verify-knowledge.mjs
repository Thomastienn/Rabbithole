// Built-app keyboard and responsive checks over a seeded local graph and in-process provider fixture; no live model calls.
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { Store } from '../server/store.mjs';
import { createApp } from '../server/app.mjs';
import { nestedFrames } from '../test/one-frame.mjs';

const run = promisify(execFile),
  session = `knowledge-${process.pid}`;
const b = async (...args) => (await run('agent-browser', ['--session', session, ...args])).stdout;
const ev = async (expression) => JSON.parse(await b('eval', expression, '--json')).data.result;
const wait = (expression) => b('wait', '--fn', `!!(${expression})`);
const key = (name) => b('press', name);
const store = new Store(join(mkdtempSync(join(tmpdir(), 'tt-knowledge-')), 'data.sqlite'));
const root = store.create('Concurrency fixture');
const message = store.message(root.id, 'assistant', 'A mutex guards shared state.', 'completed');
const other = store.create('Other learning tree');
const second = store.message(
  other.id,
  'assistant',
  'Mutual exclusion protects shared state.',
  'completed',
);
const app = createApp({
  store,
  auth: { status: () => ({ connected: true }) },
  provider: { models: async () => [{ model: 'fixture', label: 'Fixture model', isDefault: true }] },
});
await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${app.server.address().port}`;
const knowledge = '.view-tabs button[aria-current=page]';
const openKnowledge = async () => {
  await reach('.view-tabs button:nth-child(3)');
  await key('Enter');
  await wait(`!document.querySelector('main[aria-label=Knowledge]').hidden`);
};
const returnToLearning = async () => {
  await reach('#return-to-learning');
  await key('Enter');
  await wait(`!document.querySelector('[aria-label="Learning workspace"]').hidden`);
};
async function reach(selector) {
  for (let i = 0; i < 60; i++) {
    if (await ev(`document.activeElement?.matches(${JSON.stringify(selector)})`)) return;
    await key('Tab');
  }
  throw new Error(`Tab did not reach ${selector}`);
}
const group = (name) => `[role=group][aria-label="Corrections for ${name}"]`;
const know = `${group('Mutex')} button:nth-of-type(1)`;
const unknown = `${group('Mutex')} button:nth-of-type(2)`;
const merge = `${group('Mutex')} button:nth-of-type(3)`;
const steps = [],
  shots = resolve('.impeccable/review');
mkdirSync(shots, { recursive: true });
const visibleTopicLabels = async () =>
  ev(`(() => {
  const points = [...document.querySelectorAll('.concept-point')].map(p => p.getBoundingClientRect());
  return [...document.querySelectorAll('[data-topic-label]')].map(e => {
    const r = e.getBoundingClientRect(), range = document.createRange(); range.selectNodeContents(e);
    const text = range.getBoundingClientRect(), region = [...document.querySelectorAll('[data-topic]')].find(t => t.dataset.topic === e.dataset.topicLabel).getBoundingClientRect();
    const node = e.firstChild, words = [...e.textContent.matchAll(/\\S+/g)].map(m => { const word = document.createRange(); word.setStart(node, m.index); word.setEnd(node, m.index + m[0].length); return word.getClientRects().length === 1; });
    return { name: e.textContent, visible: e.scrollWidth <= e.clientWidth && e.scrollHeight <= e.clientHeight && text.left >= r.left && text.right <= r.right && text.top >= r.top && text.bottom <= r.bottom, wordsIntact: words.every(Boolean), centred: Math.hypot(r.x + r.width / 2 - region.x - region.width / 2, r.y + r.height / 2 - region.y - region.height / 2) < 1, textScale: r.height / e.offsetHeight, clear: points.every(p => p.right <= r.left || p.left >= r.right || p.bottom <= r.top || p.top >= r.bottom) };
  });
})()`);
async function checkTopicLabels() {
  const labels = await visibleTopicLabels();
  for (const l of labels)
    assert.ok(
      l.visible && l.wordsIntact && l.centred && l.clear && Math.abs(l.textScale - 1) < 0.05,
      'full readable topic name centred and clear: ' + JSON.stringify(l),
    );
  return labels;
}
try {
  await b('set', 'viewport', '1440', '1000');
  await b('open', origin);
  await b('set', 'media', 'light', 'reduced-motion');
  await b('wait', '.view-tabs');
  await openKnowledge();
  await wait(`document.querySelector('${knowledge}')?.textContent === 'Knowledge'`);
  await b('wait', '--text', 'No concepts yet');
  assert.equal(
    await ev(
      `getComputedStyle(document.querySelector('[aria-label="Learning workspace"]')).display`,
    ),
    'none',
  );
  steps.push(
    'Keyboard reaches the band Knowledge tab with Tab/Enter; empty state explains how concepts appear; learning workspace is hidden',
  );

  store.addGraph(
    {
      concepts: [
        { name: 'Mutex', topics: ['Concurrency'] },
        { name: 'Mutual exclusion', topics: ['Concurrency', 'Operating systems'] },
      ],
      links: [{ from: 'Mutex', to: 'Mutual exclusion', kind: 'related' }],
    },
    message,
  );
  store.addGraph({ concepts: [{ name: 'Mutex', topics: ['Concurrency'] }], links: [] }, second);
  // Focus stays on the band's Knowledge tab; Tab on through the band into the page.
  for (
    let i = 0;
    i < 12 && (await ev(`document.activeElement?.textContent`)) !== 'Refresh Knowledge';
    i++
  )
    await key('Tab');
  await wait(`document.activeElement?.textContent === 'Refresh Knowledge'`);
  await key('Enter');
  await wait(`document.querySelectorAll('[data-concept]').length === 2`);
  assert.equal(
    await ev(
      `[...document.querySelectorAll('.knowledge-evidence dt')].find(d => d.textContent === 'Met in replies')?.nextElementSibling.textContent`,
    ),
    '2',
  );
  await reach(know);
  assert.equal(
    await ev(
      `document.activeElement.matches(':focus-visible') && getComputedStyle(document.activeElement).outlineStyle !== 'none'`,
    ),
    true,
  );
  await key('Enter');
  await wait(`document.querySelector('${know}')?.getAttribute('aria-pressed') === 'true'`);
  await key('Tab');
  assert.equal(await ev(`document.activeElement.matches(${JSON.stringify(unknown)})`), true);
  await key('Space');
  await wait(`document.querySelector('${unknown}')?.getAttribute('aria-pressed') === 'true'`);
  assert.equal(store.graph().concepts.find((c) => c.name === 'Mutex').familiarity, 0);
  const correctedLayout = await ev(
    `document.querySelector('.knowledge-map').getAttribute('style')`,
  );
  await key('Enter');
  await wait(`!document.querySelector('${unknown}')?.disabled`);
  assert.equal(
    await ev(`document.querySelector('.knowledge-map').getAttribute('style')`),
    correctedLayout,
    'corrections keep topic layout and viewport',
  );
  steps.push(
    'Points show multi-topic concepts and evidence across two learning trees; both corrections activate with Enter/Space and have visible focus',
  );

  await key('Tab');
  await key('Enter');
  await b('wait', 'dialog[open]');
  await key('Escape');
  await wait(
    `!document.querySelector('dialog[open]') && document.activeElement.matches(${JSON.stringify(merge)})`,
  );
  await key('Enter');
  await b('wait', 'dialog[open]');
  await reach('dialog[open] button[aria-expanded]');
  await key('Enter');
  await b('keyboard', 'type', 'Mutual exclusion');
  await key('ArrowDown');
  await key('Enter');
  await wait(
    `document.querySelector('dialog[open] button[aria-expanded]')?.textContent.includes('Mutual exclusion') && document.querySelector('dialog[open] button[aria-expanded]')?.getAttribute('aria-expanded') === 'false'`,
  );
  await b('screenshot', join(shots, 'knowledge-merge.png'));
  await reach('dialog[open] button[type=submit]');
  // A failed storage write leaves the dialog and selected target available for retry.
  store.db.exec(
    "CREATE TRIGGER reject_merge BEFORE DELETE ON concepts BEGIN SELECT RAISE(ABORT, 'fixture failure'); END;",
  );
  await key('Enter');
  await wait(`document.querySelector('dialog[open] [role=alert]')`);
  assert.equal(store.graph().concepts.length, 2);
  store.db.exec('DROP TRIGGER reject_merge');
  await reach('dialog[open] button[type=submit]');
  await key('Enter');
  await wait(
    `!document.querySelector('dialog[open]') && document.activeElement?.dataset.concept === 'Mutual exclusion'`,
  );
  assert.equal(store.graph().concepts.length, 1);
  assert.equal(store.graph().concepts[0].evidence.met, 2);
  steps.push(
    'Merge dialog opens/selects/submits entirely by keyboard; Escape restores trigger focus; a failed write retains the target for retry; successful merge focuses the kept concept',
  );

  // Return to the learning workspace without losing the selected conversation, draft or map transform.
  await returnToLearning();
  await b('find', 'role', 'button', 'click', '--name', 'Open Other learning tree', '--exact');
  await b('wait', '[aria-label="Your question"]');
  await b('find', 'label', 'Your question', 'fill', 'Keep this draft');
  const transform = await ev(
    `document.querySelector('.react-flow__viewport').getAttribute('style')`,
  );
  await openKnowledge();
  await wait(`document.querySelector('[aria-label="Learning workspace"]').hidden`);
  await returnToLearning();
  assert.equal(
    await ev(`document.querySelector('.focused-chat [role=textbox]').textContent`),
    'Keep this draft',
  );
  assert.equal(
    await ev(`document.querySelector('.react-flow__viewport').getAttribute('style')`),
    transform,
  );
  steps.push(
    'Keyboard band navigation and Return to learning tree preserve the open conversation, composer draft and map transform',
  );

  await openKnowledge();
  await b('wait', '[data-concept="Mutual exclusion"]');
  await b('set', 'viewport', '1440', '1000');
  await b('screenshot', join(shots, 'knowledge-desktop.png'));
  await b('set', 'viewport', '390', '844');
  await b('find', 'role', 'button', 'click', '--name', 'Fit map', '--exact');
  await checkTopicLabels();
  await b('screenshot', join(shots, 'knowledge-mobile.png'));
  const widths = await ev(
    `({ viewport: innerWidth, document: document.documentElement.scrollWidth, panel: document.querySelector('.knowledge-panel').scrollWidth, outside: [...document.querySelectorAll('body *')].map(e => ({tag: e.tagName, cls: e.className, left: e.getBoundingClientRect().left, right: e.getBoundingClientRect().right})).filter(r => r.left < -1 || r.right > innerWidth + 1).slice(0, 12) })`,
  );
  assert.ok(
    widths.document <= widths.viewport && widths.panel <= widths.viewport,
    'no horizontal overflow at phone width: ' + JSON.stringify(widths),
  );
  // Narrow views move into the Contents drawer (verify-narrow); reload checks persistence at desktop width.
  await b('set', 'viewport', '1440', '1000');
  await b('reload');
  await b('wait', '.view-tabs');
  await openKnowledge();
  await b('wait', '--text', 'You marked this as not understood');
  steps.push('Desktop/phone layouts fit; merged evidence and correction survive page reload');

  // Visual identity: concept points with familiarity rings on the deep pannable field, related lines and builds-on arrows, paper selection and focus, serif detail text.
  store.addGraph(
    {
      concepts: [
        { name: 'Race condition', topics: ['Concurrency'] },
        { name: 'Critical section', topics: ['Concurrency', 'Operating systems'] },
        { name: 'Scheduler', topics: ['Operating systems'] },
      ],
      links: [
        { from: 'Critical section', to: 'Mutual exclusion', kind: 'builds on' },
        { from: 'Race condition', to: 'Mutual exclusion', kind: 'related' },
        { from: 'Scheduler', to: 'Critical section', kind: 'related' },
      ],
    },
    message,
  );
  const look = {};
  const mapTransform = () => ev(`document.querySelector('.knowledge-map').style.transform`);
  const scale = async () => +(await mapTransform()).match(/scale\(([\d.]+)\)/)[1];
  const conceptNames = async () => {
    const { snapshot, refs } = JSON.parse(
      await b('snapshot', '-i', '-s', '.knowledge-map', '--json'),
    ).data;
    return [...snapshot.matchAll(/ref=(e\d+)\b/g)]
      .map((m) => refs[m[1]])
      .filter((r) => r.role === 'button')
      .map((r) => r.name)
      .sort();
  };
  const visibleConceptLabels = () =>
    ev(
      `[...document.querySelectorAll('[data-concept]')].filter(p => { const e = p.querySelector('.concept-name'), r = e.getBoundingClientRect(); return getComputedStyle(e).clipPath === 'none' && r.width > 1 && r.height > 1; }).map(p => p.dataset.concept).sort()`,
    );
  async function zoomUntil(direction, done) {
    for (let i = 0; i < 16 && !done(await scale()); i++)
      await b('find', 'role', 'button', 'click', '--name', direction, '--exact');
    assert.ok(done(await scale()), `${direction} reaches label zoom threshold`);
  }
  for (const mode of ['dark', 'light']) {
    await b('set', 'viewport', '1440', '900');
    await ev(`localStorage.setItem('treetutor.appearance', '${mode}'); true`);
    await b('reload');
    await b('wait', '.view-tabs');
    await openKnowledge();
    await wait(`document.querySelectorAll('.knowledge-links line').length === 3`);
    // Select a concept that is not linked to everything, so plain and builds-on relations both show unselected.
    await b('click', '[data-concept="Scheduler"]');
    await wait(
      `document.querySelector('.knowledge-links line[data-selected=false][data-kind="builds on"]')`,
    );
    look[mode] =
      await ev(`(() => { const s = getComputedStyle, card = document.querySelector('[data-concept][aria-pressed=true]'), ring = card.querySelector('.fam'), detail = document.querySelector('.knowledge-detail'), line = document.querySelector('.knowledge-links line[data-selected=true]'), plain = document.querySelector('.knowledge-links line[data-selected=false][data-kind=related]'), builds = document.querySelector('.knowledge-links line[data-selected=false][data-kind="builds on"]');
      const rgb = c => c.match(/[\\d.]+/g).slice(0, 3).map(Number), lum = c => { const [r, g, b] = rgb(c).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
      const ratio = (f, b) => { const [x, y] = [lum(f), lum(b)].sort((p, q) => q - p); return +((x + 0.05) / (y + 0.05)).toFixed(2); };
      const field = s(document.querySelector('.knowledge-field')).backgroundColor, page = s(document.querySelector('.knowledge-panel')).backgroundColor, surface = page === 'rgba(0, 0, 0, 0)' ? s(document.body).backgroundColor : page;
      const frame = e => [s(e).borderTopWidth, s(e).borderInlineStartWidth, s(e).boxShadow].join(' ');
      const centres = [...document.querySelectorAll('[data-concept] .fam')].map(f => { const r = f.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, r: r.width / 2 }; });
      const box = document.querySelector('.knowledge-field').getBoundingClientRect(), inside = centres.every(c => c.x > box.left && c.x < box.right && c.y > box.top && c.y < box.bottom);
      const gap = Math.min(...centres.flatMap((a, i) => centres.slice(i + 1).map(b => Math.hypot(a.x - b.x, a.y - b.y) - a.r - b.r)));
      const topics = [...document.querySelectorAll('[data-topic]')].map(region => {
        const name = region.dataset.topic, label = [...document.querySelectorAll('[data-topic-label]')].find(l => l.dataset.topicLabel === name), r = region.getBoundingClientRect(), l = label.getBoundingClientRect();
        return { name, x: region.cx.baseVal.value, y: region.cy.baseVal.value, radius: region.r.baseVal.value, opacity: +s(region).fillOpacity, fill: s(region).fill, label: label.textContent, contrast: ratio(s(label).color, field), chip: [s(label).backgroundColor, s(label).paddingTop],  textScale: l.height / label.offsetHeight, centred: Math.hypot(l.x + l.width / 2 - r.x - r.width / 2, l.y + l.height / 2 - r.y - r.height / 2) < 1, fitted: r.left >= box.left && r.right <= box.right && r.top >= box.top && r.bottom <= box.bottom, clear: [...document.querySelectorAll('.concept-point')].every(p => { const b = p.getBoundingClientRect(); return b.right <= l.left || b.left >= l.right || b.bottom <= l.top || b.top >= l.bottom; }) };
      });
      const contrast = { label: ratio(s(card.querySelector('.concept-name')).color, field), key: ratio(s(document.querySelector('.knowledge-key')).color, surface), evidence: ratio(s(detail.querySelector('dt')).color, surface), reading: ratio(s(detail.querySelector('.knowledge-reading')).color, surface) };
      const points = [...document.querySelectorAll('[data-concept]')].map(p => ({ name: p.dataset.concept, x: parseFloat(p.style.left), y: parseFloat(p.style.top) }));
      return { topics, points, inside, gap, ringOutline: s(ring).outlineColor, ringOutlineWidth: s(ring).outlineWidth, ringRadius: s(ring).borderRadius, field, body: s(document.body).backgroundColor, frames: { field: frame(document.querySelector('.knowledge-field')), detail: frame(detail), detailFill: s(detail).backgroundColor, concepts: [...new Set([...document.querySelectorAll('.concept-point, .concept-name')].map(frame))] }, detailShadow: s(detail).boxShadow, lineWidth: s(line).strokeWidth, lineStroke: s(line).stroke, plainStroke: s(plain).stroke, plainWidth: s(plain).strokeWidth, buildsMarker: builds.getAttribute('marker-end'), plainMarker: plain.getAttribute('marker-end'), reading: s(detail.querySelector('.knowledge-reading')).fontFamily, ui: s(card).fontFamily,
        rings: [...document.querySelectorAll('[data-concept] .fam')].map(f => f.dataset.fill), key: document.querySelector('.knowledge-key').textContent, contrast }; })()`);
    const l = look[mode],
      probe = await ev(
        `(() => { const e = document.createElement('i'); e.style.color = 'var(--treetutor-paper)'; document.body.append(e); const c = getComputedStyle(e).color; e.remove(); return c; })()`,
      );
    l.labels = await checkTopicLabels();
    assert.equal(l.ringOutline, probe, `${mode} selected concept's ring outlined in paper`);
    assert.equal(l.ringOutlineWidth, '2px');
    assert.equal(l.ringRadius, '50%', `${mode} concepts are round points`);
    assert.ok(l.inside, `${mode} fitted map shows every point`);
    assert.ok(l.gap > 0, `${mode} points do not overlap (gap ${l.gap})`);
    assert.deepEqual(
      l.topics.map((t) => t.name),
      ['Concurrency', 'Operating systems'],
    );
    assert.equal(
      new Set(l.topics.map((t) => t.fill)).size,
      2,
      `${mode} topics use different theme inks`,
    );
    for (const t of l.topics) {
      assert.ok(t.opacity > 0 && t.opacity < 1, `${mode} ${t.name} region is translucent`);
      assert.equal(t.label, t.name);
      assert.ok(
        t.centred && t.clear && t.fitted,
        `${mode} ${t.name} centred label clear of points; whole region fitted`,
      );
      assert.ok(t.contrast >= 4.5, `${mode} ${t.name} label contrast ${t.contrast} below AA`);
      assert.ok(
        Math.abs(t.textScale - 1) < 0.05,
        `${mode} topic text stays at its readable size when fitted`,
      );
      for (const c of store.graph().concepts.filter((c) => c.topics.includes(t.name))) {
        const p = l.points.find((p) => p.name === c.name);
        assert.ok(
          Math.hypot(p.x - t.x, p.y - t.y) < t.radius,
          `${mode} ${c.name} inside ${t.name}`,
        );
      }
    }
    assert.equal(l.lineStroke, probe, `${mode} selected concept's relations in paper`);
    assert.equal(l.lineWidth, '2px');
    assert.notEqual(l.plainStroke, probe, `${mode} other relations quiet`);
    assert.equal(l.plainWidth, '1.5px', `${mode} 1.5px relation lines`);
    assert.equal(l.buildsMarker, 'url(#knowledge-arrow)', `${mode} builds on draws an arrow`);
    assert.equal(l.plainMarker, null, `${mode} related is a plain line`);
    assert.ok(
      l.rings.length >= 4 && l.rings.every((f) => ['none', 'some', 'full'].includes(f)),
      `${mode} every concept shows a familiarity ring`,
    );
    assert.equal(
      l.key,
      'UnfamiliarSome familiarityFamiliarLine: relatedArrow: builds on',
      `${mode} key text names familiarity and relation forms`,
    );
    for (const [name, value] of Object.entries(l.contrast))
      assert.ok(value >= 4.5, `${mode} ${name} text contrast ${value} below AA`);
    // One frame per object: the field is tone, the detail panel is spacing, concepts carry no border; selection keeps its ring.
    assert.deepEqual(
      l.frames,
      {
        field: '0px 0px none',
        detail: '0px 0px none',
        detailFill: 'rgba(0, 0, 0, 0)',
        concepts: ['0px 0px none'],
      },
      `${mode} Knowledge surfaces carry no frame`,
    );
    for (const t of l.topics)
      assert.deepEqual(
        t.chip,
        ['rgba(0, 0, 0, 0)', '0px'],
        `${mode} ${t.name} label is plain text`,
      );
    assert.deepEqual(
      await ev(nestedFrames('.knowledge-content')),
      [],
      `${mode} no frame inside a frame on Knowledge`,
    );
    assert.notEqual(l.field, l.body, `${mode} deep concept field`);
    assert.ok(
      !l.detailShadow
        .split(/,(?![^(]*\))/)
        .some((x) => x !== 'none' && !x.trim().endsWith('inset')),
      `${mode} no drop shadow`,
    );
    assert.match(l.reading, /^"?Literata/, `${mode} serif detail text`);
    assert.match(l.ui, /^"?Archivo/, `${mode} Archivo labels`);
    await b('screenshot', resolve(`docs/verification/knowledge-${mode}.png`));
    await zoomUntil('Zoom in', (k) => k >= 0.75);
    const names = await conceptNames(),
      allConcepts = store
        .graph()
        .concepts.map((c) => c.name)
        .sort();
    assert.equal(
      names.length,
      allConcepts.length,
      `${mode} every concept has an accessible button name`,
    );
    for (const c of allConcepts)
      assert.ok(
        names.some((n) => n.startsWith(c) && /Unfamiliar|Marked not understood/.test(n)),
        `${mode} accessible name includes ${c} and familiarity`,
      );
    assert.deepEqual(
      await visibleConceptLabels(),
      allConcepts,
      `${mode} all concept labels show at or above 75%`,
    );
    await zoomUntil('Zoom out', (k) => k < 0.75);
    assert.deepEqual(
      await visibleConceptLabels(),
      ['Scheduler'],
      `${mode} only selected concept label shows below 75%`,
    );
    assert.deepEqual(
      await conceptNames(),
      names,
      `${mode} zooming below threshold keeps accessible names`,
    );
    await zoomUntil('Zoom out', (k) => k <= 0.2);
    await ev(`document.querySelector('[data-concept="Race condition"]').focus(); true`);
    await key('Enter');
    await wait(`document.querySelector('.knowledge-detail h2')?.textContent === 'Race condition'`);
    assert.deepEqual(
      await visibleConceptLabels(),
      ['Race condition'],
      `${mode} selection reveals its label and hides previous selection at minimum zoom`,
    );
    assert.deepEqual(await conceptNames(), names, `${mode} names stay available at minimum zoom`);
    const topicsAtMinimum = await visibleTopicLabels();
    assert.deepEqual(
      topicsAtMinimum.map((l) => l.name),
      ['Concurrency', 'Operating systems'],
    );
    assert.ok(
      topicsAtMinimum.every((l) => l.visible && l.wordsIntact && Math.abs(l.textScale - 1) < 0.05),
      `${mode} topic labels stay readable when zoomed out`,
    );
    await b('screenshot', resolve(`docs/verification/knowledge-labels-${mode}.png`));
    await zoomUntil('Zoom in', (k) => k >= 0.75);
    assert.deepEqual(
      await visibleConceptLabels(),
      allConcepts,
      `${mode} zooming back in restores concept labels`,
    );
    assert.deepEqual(await conceptNames(), names, `${mode} zooming back in keeps accessible names`);
    l.zoomLabels = {
      threshold: 0.75,
      minimum: 0.2,
      accessibleNames: names,
      selectedAtMinimum: 'Race condition',
    };
    await b('click', '[data-concept="Scheduler"]');
    await b('find', 'role', 'button', 'click', '--name', 'Fit map', '--exact');
    if (mode === 'dark') {
      // Pan and zoom: wheel zooms, drag pans, toolbar zooms and refits; clicking a point still selects it.
      const fitted = await mapTransform(),
        k = await scale(),
        field = await ev(
          `(() => { const r = document.querySelector('.knowledge-field').getBoundingClientRect(); return { x: Math.round(r.left + 30), y: Math.round(r.top + 30) }; })()`,
        );
      await b('mouse', 'move', String(field.x), String(field.y));
      await b('mouse', 'wheel', '-300');
      await wait(
        `!document.querySelector('.knowledge-map').style.transform.includes('scale(${k})')`,
      );
      assert.ok((await scale()) > k, 'wheel up zooms in');
      const zoomed = await mapTransform();
      await b('mouse', 'down');
      await b('mouse', 'move', String(field.x + 120), String(field.y + 60), '--steps', '8');
      await b('mouse', 'up');
      assert.notEqual(await mapTransform(), zoomed, 'drag pans the map');
      await b('find', 'role', 'button', 'click', '--name', 'Fit map', '--exact');
      await wait(
        `document.querySelector('.knowledge-map').style.transform === ${JSON.stringify(fitted)}`,
      );
      await b('find', 'role', 'button', 'click', '--name', 'Zoom out', '--exact');
      assert.ok((await scale()) < k, 'Zoom out button zooms out');
      await b('find', 'role', 'button', 'click', '--name', 'Fit map', '--exact');
      await b('click', '[data-concept="Race condition"]');
      await wait(
        `document.querySelector('.knowledge-detail h2')?.textContent === 'Race condition'`,
      );
      // Keyboard: Tab from the selected point reaches every concept, each panned into view, and Enter opens its details.
      await b('find', 'role', 'button', 'click', '--name', 'Zoom in', '--exact');
      await b('find', 'role', 'button', 'click', '--name', 'Zoom in', '--exact');
      await b('find', 'role', 'button', 'click', '--name', 'Zoom in', '--exact');
      await ev(`document.querySelector('[data-concept]').focus(); true`);
      const reached = new Set(),
        total = await ev(`document.querySelectorAll('[data-concept]').length`);
      for (let i = 0; i < total; i++) {
        const name = await ev(`document.activeElement.dataset.concept`);
        assert.ok(name, `Tab stays on concepts (${i})`);
        assert.ok(
          await ev(
            `(() => { const p = document.activeElement.querySelector('.fam').getBoundingClientRect(), f = document.querySelector('.knowledge-field').getBoundingClientRect(); return p.left >= f.left && p.right <= f.right && p.top >= f.top && p.bottom <= f.bottom; })()`,
          ),
          `${name} panned into view on focus`,
        );
        reached.add(name);
        if (i < total - 1) await key('Tab');
      }
      assert.equal(reached.size, total, 'keyboard reaches every concept');
      await key('Enter');
      await wait(
        `document.querySelector('.knowledge-detail h2')?.textContent === ${JSON.stringify([...reached].at(-1))}`,
      );
      await b('click', '[data-concept="Scheduler"]');
      await b('find', 'role', 'button', 'click', '--name', 'Fit map', '--exact');
    }
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
  await b('set', 'viewport', '390', '844');
  await b('find', 'role', 'button', 'click', '--name', 'Fit map', '--exact');
  assert.ok(
    await ev(
      `(() => { const f = document.querySelector('.knowledge-field').getBoundingClientRect(); return [...document.querySelectorAll('[data-topic]')].every(e => { const r = e.getBoundingClientRect(); return r.left >= f.left && r.right <= f.right && r.top >= f.top && r.bottom <= f.bottom; }); })()`,
    ),
    'phone Fit map includes complete topic regions',
  );
  const mobileLabels = await checkTopicLabels();
  assert.ok((await scale()) < 0.75, 'phone fit is below concept label threshold');
  assert.deepEqual(
    await visibleConceptLabels(),
    ['Scheduler'],
    'phone fit keeps only selected concept label',
  );
  assert.deepEqual(
    await conceptNames(),
    look.light.zoomLabels.accessibleNames,
    'phone fit keeps accessible concept names',
  );
  writeFileSync(
    resolve('docs/verification/knowledge-results.json'),
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        evidence:
          'Production build in Chromium via agent-browser over a seeded local graph; no model calls',
        look,
        mobileLabels,
      },
      null,
      2,
    ) + '\n',
  );
  await b('screenshot', resolve('docs/verification/knowledge-mobile-light.png'));
  // Topic-only changes must invalidate the layout even with the same concept names and links.
  const priorLayout = await ev(`document.querySelector('.knowledge-map').style.transform`);
  store.addGraph({ concepts: [{ name: 'Scheduler', topics: ['Scheduling'] }], links: [] }, message);
  await b('find', 'role', 'button', 'click', '--name', 'Refresh Knowledge', '--exact');
  await wait(
    `document.querySelector('[data-topic="Scheduling"]') && document.querySelectorAll('[data-topic]').length === 3`,
  );
  assert.notEqual(
    await ev(`document.querySelector('.knowledge-map').style.transform`),
    priorLayout,
    'new topic membership recalculates layout and fit',
  );
  steps.push(
    'Phone Fit map includes complete regions; refreshing topic membership without changing concept names or links recalculates regions and fit',
  );
  steps.push(
    'Dark and light: one frame per object (borderless tonal field, frameless detail panel, borderless concepts, plain topic labels, selected ring kept); concept labels hide below 75%, return above it, and follow keyboard selection at 20%; topic labels stay readable; Chromium accessible button names and familiarity remain unchanged across zoom levels',
  );
  steps.push(
    'Wheel zoom, drag pan, Zoom out and Fit map work; Tab reaches every concept, pans each into view, Enter opens its details. Dark and light: translucent topic regions contain every member, have centred AA labels clear of points, and fit in view; corrections preserve layout. Round non-overlapping concept points, familiarity rings and key, related lines and builds-on arrows, paper selection and focus, AA text, serif details, Archivo labels, no drop shadow, merge dialog',
  );
  console.log(
    JSON.stringify(
      {
        pass: true,
        steps,
        screenshots: [
          ...['knowledge-desktop.png', 'knowledge-mobile.png', 'knowledge-merge.png'].map((p) =>
            join(shots, p),
          ),
          ...[
            'dark',
            'light',
            'merge-dark',
            'merge-light',
            'mobile-light',
            'labels-dark',
            'labels-light',
          ].map((m) => `docs/verification/knowledge-${m}.png`),
        ],
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error({ steps, snapshot: await b('snapshot', '-i').catch(() => '') });
  throw error;
} finally {
  await b('close').catch(() => {});
  await app.stop();
  store.close();
}
