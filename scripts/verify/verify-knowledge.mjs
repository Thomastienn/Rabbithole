// Built-app keyboard and responsive checks over a seeded local graph and in-process provider fixture; no live model calls.
import assert from 'node:assert/strict';

import { join } from 'node:path';

import {
  b,
  ev,
  wait,
  key,
  store,
  message,
  second,
  app,
  origin,
  knowledge,
  openKnowledge,
  returnToLearning,
  reach,
  know,
  unknown,
  merge,
  steps,
  shots,
  checkTopicLabels,
} from './lib/knowledge-fixture.mjs';

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

  console.log(
    JSON.stringify(
      {
        pass: true,
        steps,
        screenshots: ['knowledge-desktop.png', 'knowledge-mobile.png', 'knowledge-merge.png'].map(
          (p) => join(shots, p),
        ),
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
