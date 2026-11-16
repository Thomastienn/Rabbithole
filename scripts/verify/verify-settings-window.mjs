// Settings page (TreeTutor-u7v.3, TreeTutor-y36.9, TreeTutor-2li.2): one page per nav item, deep links, focus handling and narrow layout.
// Built app, isolated database, synthetic providers, agent-browser Chromium. Screenshots go to the verify output folder (lib/output.mjs) and .impeccable/review/.
import { verifyOut } from './lib/output.mjs';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { OpenAI } from '../../server/providers/openai.mjs';
import {
  b,
  ev,
  wait,
  shot,
  dialog,
  active,
  steps,
  step,
  store,
  cleanup,
  upstream,
  reply,
  flags,
  modelChecks,
  authRequests,
  fixture,
  endpoint,
  app,
  origin,
  mapMenu,
  heading,
  pages,
  tab,
  text,
  closed,
} from './lib/settings-window-fixture.mjs';

try {
  await b('set', 'viewport', '1440', '900');
  await b('open', origin);
  await b('eval', 'localStorage.clear(); true');
  await b('reload');
  await wait(`document.querySelector('[aria-label="Open How do fungi trade?"]')`);
  await b('find', 'role', 'button', 'click', '--name', 'Open How do fungi trade?', '--exact');
  await wait(`document.querySelector('[aria-label="Map menu"]')`);

  // 1. Map menu Settings opens on Interface (Appearance first, spec) with the title focused; sidebar no longer holds settings.
  assert.equal(
    await ev(`!!document.querySelector('.shell-band')?.textContent.includes('Connections')`),
    false,
    'band has no Connections',
  );
  await mapMenu('Settings');
  await wait(`${active}?.id === 'settings-heading'`);
  assert.equal(await heading(), 'Interface');
  assert.equal(
    await ev(`${dialog}.querySelector('nav a, nav button')?.textContent`),
    'Interface',
    'Interface is the first section',
  );
  assert.equal(
    await ev(`${dialog}.querySelector('h3')?.textContent`),
    'Appearance',
    'Appearance is the first setting',
  );
  // World (mockup Settings): a page on the body ground (no dialog surface), Archivo, small-caps group labels, paper focus ring, AA text.
  const look = {};
  for (const mode of ['dark', 'light']) {
    await b(
      'find',
      'role',
      'radio',
      'click',
      '--name',
      mode === 'dark' ? 'Dark' : 'Light',
      '--exact',
    );
    await wait(`document.documentElement.getAttribute('data-theme') === '${mode}'`);
    await ev(`document.getElementById('settings-heading').scrollIntoView(); true`);
    look[mode] =
      await ev(`(() => { const d = ${dialog}, s = getComputedStyle, body = s(document.body), h = s(d.querySelector('.settings-panel h3'));
      const rgb = c => c.match(/[\\d.]+/g).slice(0, 3).map(Number), lum = c => { const [r, g, b] = rgb(c).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
      const ratio = (f, b) => { const [x, y] = [lum(f), lum(b)].sort((p, q) => q - p); return +((x + 0.05) / (y + 0.05)).toFixed(2); };
      const ground = s(d).backgroundColor === 'rgba(0, 0, 0, 0)' ? body.backgroundColor : s(d).backgroundColor;
      const solid = (f, b) => { const parts = f.match(/[\\d.]+/g).map(Number), alpha = parts[3] ?? 1; return 'rgb(' + parts.slice(0, 3).map((v, i) => v * alpha + rgb(b)[i] * (1 - alpha)).join(',') + ')'; };
      const controls = [...d.querySelectorAll('.astryx-radio-indicator, .astryx-checkbox-indicator, .astryx-text-input, .astryx-selector')].filter(e => parseFloat(s(e).borderTopWidth) > 0).map(e => {
        const bg = solid(s(e).backgroundColor, ground), border = solid(s(e).borderTopColor, bg);
        return { control: e.classList[0], ratio: ratio(border, ground) };
      });
      const probe = document.createElement('i'); probe.style.color = 'var(--rabbithole-paper)'; document.body.append(probe); const paper = s(probe).color; probe.remove();
      return { dialogs: document.querySelectorAll('dialog[open]').length, font: s(d.querySelector('p, span')).fontFamily, caps: h.fontVariantCaps, paper, controls,
        contrast: { title: ratio(s(d.querySelector('h1')).color, ground), label: ratio(h.color, ground), text: ratio(s(d.querySelector('.settings-group p, .settings-group span')).color, ground), nav: ratio(s(d.querySelector('nav [aria-current]')).color, ground), muted: ratio(s(d.querySelector('nav a:not([aria-current]), nav button:not([aria-current])')).color, ground) } }; })()`);
    assert.equal(look[mode].dialogs, 0, `${mode} settings is a page, not a dialog`);
    assert.match(look[mode].font, /^"?Archivo/, `${mode} Archivo`);
    assert.equal(look[mode].caps, 'all-small-caps', `${mode} small-caps labels`);
    for (const [name, value] of Object.entries(look[mode].contrast))
      assert.ok(value >= 4.5, `${mode} ${name} contrast ${value} below AA`);
    // Three Appearance radios plus the Vim checkbox; theme tiles are native radios marked by ring and check.
    assert.ok(look[mode].controls.length >= 4, 'radio and checkbox indicators measured');
    for (const c of look[mode].controls)
      assert.ok(c.ratio >= 3, `${mode} ${c.control} boundary contrast ${c.ratio} below AA`);
    await b('focus', '#settings-return');
    await b('press', 'Shift+Tab');
    await b('press', 'Tab');
    look[mode].ring = await ev(`getComputedStyle(document.activeElement).outlineColor`);
    assert.equal(
      look[mode].ring === look[mode].paper,
      true,
      `${mode} paper focus ring on Return: ${look[mode].ring} vs ${look[mode].paper}`,
    );
    await ev(`document.getElementById('settings-heading').scrollIntoView(); true`);
    await shot(`interface-${mode}`);
    await b('screenshot', `${process.cwd()}/${verifyOut}/settings-interface-${mode}.png`);
  }
  await b('find', 'role', 'radio', 'click', '--name', 'Dark', '--exact');
  await wait(`document.documentElement.getAttribute('data-theme') === 'dark'`);
  step(
    `Settings page opens on Interface with Appearance first; dark and light: no dialog, Archivo, small-caps labels, AA text contrast, paper focus ring ${JSON.stringify(look)}`,
  );
  await tab('Models');
  assert.ok((await text()).includes('Automatic suggestions'));
  assert.ok((await text()).includes('Concept matching'));
  assert.ok((await text()).includes('concept matching is getting expensive'));
  const box = await ev(
    `(() => { const r = ${dialog}.getBoundingClientRect(); return [r.width, r.height]; })()`,
  );
  assert.ok(box[0] > 1200 && box[1] > 700, `full page on desktop: ${box}`);
  await shot('models');
  await b('screenshot', `${process.cwd()}/${verifyOut}/settings-models-dark.png`);
  step(
    `Map menu Settings opens a ${Math.round(box[0])}x${Math.round(box[1])} page, title focused; Models page alone with suggestions and concept matching; band holds no settings`,
  );

  // 2. Each tab shows its contents; moved controls work.
  await b('find', 'role', 'button', 'click', '--name', 'Manage connections', '--exact');
  await wait(`${active}?.id === 'settings-section-connections'`);
  assert.equal(await heading(), 'Connections');
  assert.deepEqual(await pages(), ['Connections'], 'Manage connections opens only Connections');
  await tab('Interface');
  await b('find', 'role', 'radio', 'click', '--name', 'Light', '--exact');
  await wait(`document.documentElement.getAttribute('data-theme') === 'light'`);
  await tab('Connections');
  const conn = await text();
  for (const s of [
    'Claude: signed in through Claude Code',
    'Codex: not connected',
    'Continue with ChatGPT',
    'Custom endpoints',
    'No custom endpoints yet',
  ])
    assert.ok(conn.includes(s), s);
  await shot('connections');
  await b('screenshot', `${process.cwd()}/${verifyOut}/settings-connections-light.png`);
  await b('find', 'role', 'button', 'click', '--name', 'Add endpoint', '--exact');
  await b('find', 'label', 'Name', 'fill', 'Local llama');
  await b('find', 'label', 'Base URL', 'fill', upstream.baseUrl);
  await b('find', 'label', 'API key', 'fill', 'settings-fixture-secret');
  await b('find', 'role', 'button', 'click', '--name', 'Save', '--exact');
  await wait(`${dialog}.textContent.includes('Local llama added.')`);
  const [added] = await (await fetch(`${origin}/api/settings/endpoints`)).json();
  assert.deepEqual(added, {
    id: added.id,
    name: 'Local llama',
    baseUrl: upstream.baseUrl,
    lastTest: null,
  });
  assert.ok(!(await ev(`${dialog}.innerHTML.includes('settings-fixture-secret')`)));
  await b('find', 'role', 'button', 'click', '--name', 'Remove Local llama', '--exact');
  await wait(`!!document.querySelector('.endpoint-remove-dialog[open]')`);
  await b('find', 'role', 'button', 'click', '--name', 'Remove', '--exact');
  await wait(`${dialog}.textContent.includes('Local llama removed.')`);
  assert.deepEqual(await (await fetch(`${origin}/api/settings/endpoints`)).json(), []);
  step(
    'Endpoint Add and confirmed Remove use real app HTTP/storage with an isolated loopback upstream; saved key stays hidden',
  );
  await b('find', 'role', 'button', 'click', '--name', 'Continue with ChatGPT', '--exact');
  await wait(
    `[...${dialog}.querySelectorAll('[role=alert]')].some(a => a.textContent.includes('Rabbithole could not finish this request.'))`,
  );
  assert.equal(authRequests, 1);
  step('ChatGPT connection failure is announced inside Connections');
  await tab('Interface');
  const ui = await text();
  for (const s of ['Keyboard', 'Vim canvas bindings', 'Pan the map', 'Close Settings'])
    assert.ok(ui.includes(s), s);
  assert.equal(
    await ev(
      `[...${dialog}.querySelectorAll('.settings-panel h3')].find(h => h.textContent === 'Keyboard').parentElement.parentElement.contains(${dialog}.querySelector('input[type=checkbox]'))`,
    ),
    true,
    'Vim toggle sits in Keyboard',
  );
  assert.ok(
    (await ev(`${dialog}.querySelectorAll('[aria-label="Map keys"] kbd').length`)) >= 4,
    'map keys listed',
  );
  await ev(`${dialog}.querySelector('input[type=checkbox]').scrollIntoView({ block: 'center' })`);
  await b('find', 'label', 'Vim canvas bindings', 'check');
  await wait(
    `localStorage.getItem('rabbithole.vim') === 'on' && ${dialog}.querySelector('input[type=checkbox]').checked`,
  );
  await shot('interface');
  await tab('Usage');
  await wait(`${dialog}.querySelector('.usage-total')`);
  assert.ok((await text()).includes('202 tokens'));
  assert.deepEqual(
    await ev(`[...${dialog}.querySelectorAll('.usage-legend b')].map(b => b.textContent)`),
    ['144', '48', '10'],
  );
  for (const s of ['By model', 'By task', 'Values for each'])
    assert.ok((await text()).includes(s), s);
  await shot('usage');
  // Usage chart reads in both appearances (mockup Usage); the day table is its text alternative.
  for (const mode of ['dark', 'light']) {
    await tab('Interface');
    await b(
      'find',
      'role',
      'radio',
      'click',
      '--name',
      mode === 'dark' ? 'Dark' : 'Light',
      '--exact',
    );
    await wait(`document.documentElement.getAttribute('data-theme') === '${mode}'`);
    await tab('Usage');
    await wait(`${dialog}.querySelector('.usage-bar rect[data-series]')`);
    const bars = await ev(
      `(() => { const g = getComputedStyle(document.body).backgroundColor; return [...new Set([...${dialog}.querySelectorAll('.usage-bar rect[data-series]')].map(r => getComputedStyle(r).fill))].filter(f => f !== g).length; })()`,
    );
    assert.ok(bars >= 2, `${mode} usage series draw in distinct fills: ${bars}`);
    await ev(`document.getElementById('settings-heading').scrollIntoView(); true`);
    await shot(`usage-${mode}`);
    await b('screenshot', `${process.cwd()}/${verifyOut}/settings-usage-${mode}.png`);
  }
  await b('set', 'viewport', '390', '844');
  for (const mode of ['dark', 'light']) {
    await tab('Interface');
    await b(
      'find',
      'role',
      'radio',
      'click',
      '--name',
      mode === 'dark' ? 'Dark' : 'Light',
      '--exact',
    );
    await wait(`document.documentElement.getAttribute('data-theme') === '${mode}'`);
    await ev(`document.getElementById('settings-heading').scrollIntoView(); true`);
    await shot(`mobile-interface-${mode}`);
    await b('screenshot', `${process.cwd()}/${verifyOut}/settings-mobile-interface-${mode}.png`);
    await tab('Usage');
    await wait(`${dialog}.querySelector('.usage-bar rect[data-series]')`);
    assert.equal(
      await ev(`${dialog}.scrollWidth > ${dialog}.clientWidth + 1`),
      false,
      `${mode} narrow Usage has no page overflow`,
    );
    await ev(`document.getElementById('settings-heading').scrollIntoView(); true`);
    await shot(`mobile-usage-${mode}`);
    await b('screenshot', `${process.cwd()}/${verifyOut}/settings-mobile-usage-${mode}.png`);
  }
  await b('set', 'viewport', '1440', '900');
  await b('eval', `localStorage.removeItem('rabbithole.appearance'); true`);
  await tab('Models');
  const before = (await (await fetch(`${origin}/api/settings/suggestions`)).json()).enabled;
  await b('find', 'role', 'switch', 'click', '--name', 'Automatic suggestions');
  await wait(
    `(s => s && String(s.checked ?? s.getAttribute('aria-checked')) === '${!before}' && !s.disabled)(${dialog}.querySelector('[role=switch]'))`,
  );
  const saved = await (await fetch(`${origin}/api/settings/suggestions`)).json();
  assert.equal(saved.enabled, !before);
  await b('find', 'label', 'Quick thinking model', 'click');
  await b('find', 'role', 'option', 'click', '--name', 'Fixture model', '--exact');
  await wait(`${dialog}.textContent.includes('Quick thinking settings saved.')`);
  assert.deepEqual((await (await fetch(`${origin}/api/settings/suggestions`)).json()).model, {
    provider: 'claude',
    model: 'fixture',
  });
  flags.connected = false;
  await b('find', 'role', 'button', 'click', '--name', 'Refresh models', '--exact');
  await wait(`${dialog}.textContent.includes('Could not load models.')`);
  await tab('Connections');
  assert.ok((await text()).includes('sign-in status unavailable'));
  const checksBefore = modelChecks;
  await b('find', 'role', 'button', 'click', '--name', 'Check Claude sign-in', '--exact');
  await wait(
    `[...${dialog}.querySelectorAll('[aria-labelledby=settings-section-connections] [role=alert]')].some(a => a.textContent.includes('Could not load models.'))`,
  );
  assert.ok(modelChecks > checksBefore);
  flags.connected = true;
  await b('find', 'role', 'button', 'click', '--name', 'Check Claude sign-in', '--exact');
  await wait(`${dialog}.textContent.includes('Claude: signed in through Claude Code')`);
  step(
    'Suggestion model pin and refresh work; failed provider discovery stays retryable in Connections and Claude check recovers',
  );
  await tab('Models');
  step(
    `Tabs: Connections (Claude, Codex, endpoint), Interface (Keyboard: Vim toggle saved on, map keys), Usage, Models (suggestions switch saved enabled=${saved.enabled})`,
  );

  // 3. Keyboard: every control is reachable in page order; Esc returns to the learning tree and focus returns to Map menu.
  await b('focus', '#settings-return');
  const reached = new Set();
  for (let i = 0; i < 60; i++) {
    await b('press', 'Tab');
    const id = await ev(
      `${dialog}.contains(${active}) ? (${active}.id || ${active}.getAttribute('aria-label') || ${active}.textContent.trim().slice(0, 30)) : null`,
    );
    if (!id) break;
    reached.add(id);
  }
  for (const id of [
    'settings-interface',
    'settings-models',
    'settings-connections',
    'settings-usage',
  ])
    assert.ok(reached.has(id), `Tab reaches ${id}: ${[...reached]}`);
  await b('focus', '#settings-heading');
  await b('press', 'Escape');
  await closed();
  await wait(`${active}?.getAttribute('aria-label') === 'Map menu'`);
  step(
    `Tab walks the page (${reached.size} stops, every section link); Esc returns to the learning tree and focus returns to Map menu`,
  );

  // 4. Help opens Interface; close button closes.
  await mapMenu('Help');
  assert.equal(await heading(), 'Interface');
  assert.deepEqual(await pages(), ['Interface']);
  assert.ok((await text()).includes('Keyboard'));
  await b('find', 'role', 'button', 'click', '--name', 'Return to learning tree', '--exact');
  await closed();
  await wait(`${active}?.getAttribute('aria-label') === 'Map menu'`);
  step(
    'Map menu Help opens only the Interface page with the Keyboard section; Return to learning tree returns focus',
  );

  // 5. Endpoint shortcut from the model menu focuses Add endpoint; Return restores focus.
  await b('find', 'role', 'button', 'click', '--name', 'Reopen chat', '--exact').catch(() => {});
  await wait(
    `document.querySelector('[aria-label="Model for next reply"]')?.getClientRects().length`,
  );
  await b('find', 'role', 'button', 'click', '--name', 'Model for next reply', '--exact');
  await b(
    'find',
    'role',
    'menuitem',
    'click',
    '--name',
    'Custom endpoint settings Add an endpoint or check its URL, API key and connection',
  ).catch(() => b('find', 'text', 'Custom endpoint settings', 'click'));
  await wait(`${active}?.matches('.endpoint-add')`);
  assert.equal(await heading(), 'Connections');
  assert.deepEqual(await pages(), ['Connections']);
  await b('find', 'role', 'button', 'click', '--name', 'Return to learning tree', '--exact');
  await closed();
  await wait(`${active}?.getAttribute('aria-label') === 'Model for next reply'`);
  step(
    'Custom endpoint shortcut opens Connections with Add endpoint focused; Return goes back to the chat; focus returns to model picker',
  );

  // 6. Band gear opens the page and focus returns to it.
  await b('find', 'role', 'button', 'click', '--name', 'Settings', '--exact');
  await wait(`${active}?.id === 'settings-heading'`);
  assert.equal(
    await ev(`document.querySelector('.band-settings').getAttribute('aria-current')`),
    'page',
    'gear shows the current page',
  );
  await b('press', 'Escape');
  await closed();
  await wait(`${active}?.getAttribute('aria-label') === 'Settings'`);
  step('Band settings gear opens the page; Esc returns focus to the gear');

  // 7. Narrow: the page stacks the section nav above one column; no sideways scroll; Help goes straight to Interface.
  await b('set', 'viewport', '390', '844');
  await b('reload');
  await wait(`document.querySelector('.band-contents')?.getClientRects().length`);
  await ev(`document.querySelector('.band-contents').click(); true`);
  await wait(`document.querySelector('dialog[open] .drawer-settings')`);
  await wait('document.getAnimations().every(a => a.playState !== "running")');
  await ev(`document.querySelector('dialog[open] .drawer-settings').click(); true`);
  await wait(
    `!document.querySelector('dialog.astryx-drawer[open]') && ${active}?.id === 'settings-heading'`,
  );
  assert.equal(await heading(), 'Interface');
  assert.ok(
    await ev(
      `${dialog}.querySelector('.settings-nav').getBoundingClientRect().bottom <= ${dialog}.querySelector('.settings-panel').getBoundingClientRect().top`,
    ),
    'narrow nav sits above the page',
  );
  assert.equal(
    await ev(
      `document.documentElement.scrollWidth > innerWidth + 1 || ${dialog}.scrollWidth > ${dialog}.clientWidth + 1`,
    ),
    false,
    'no horizontal overflow',
  );
  await shot('mobile-list');
  await b('focus', '#settings-interface');
  for (let i = 0; i < 8 && (await ev(`${active}?.id`)) !== 'settings-connections'; i++)
    await b('press', 'Tab');
  assert.equal(await ev(`${active}?.id`), 'settings-connections');
  await b('press', 'Enter');
  await wait(`${active}?.id === 'settings-section-connections'`);
  assert.equal(await heading(), 'Connections');
  assert.ok(
    await ev(
      `${dialog}.querySelector('#settings-section-connections').getBoundingClientRect().left >= 12`,
    ),
    'narrow content has an inset',
  );
  assert.equal(
    await ev(`${dialog}.scrollWidth > ${dialog}.clientWidth + 1`),
    false,
    'no horizontal overflow',
  );
  await shot('mobile-connections');
  await b('screenshot', `${process.cwd()}/${verifyOut}/settings-mobile-connections-dark.png`);
  await b('press', 'Escape');
  await closed();
  await wait(`${active}?.matches('.band-contents')`);
  await ev(`document.querySelector('.band-contents').click(); true`);
  await wait(`document.querySelector('dialog[open] .drawer-settings')`);
  step(
    `Narrow 390px page: section nav stacked above the content, keyboard section links open the page and focus its heading, padded content, no sideways scroll; Esc returns to the Contents button`,
  );
  await b('press', 'Escape');
  await b('set', 'viewport', '1440', '900');
  await b('reload');
  await wait(`document.querySelector('[aria-label="Map menu"]')?.getClientRects().length`);
  await mapMenu('Help');
  assert.equal(await heading(), 'Interface');
  await tab('Connections');
  flags.authFailure = false;
  await b('find', 'role', 'button', 'click', '--name', 'Continue with ChatGPT', '--exact');
  await wait(`location.search === '?fixture-auth=ok'`);
  assert.equal(authRequests, 2);
  step('ChatGPT connect follows the app auth URL (local fixture redirect only)');

  writeFileSync(
    `${verifyOut}/settings-window.json`,
    JSON.stringify(
      {
        issue: 'TreeTutor-u7v.3, TreeTutor-nwx.8, TreeTutor-y36.9, TreeTutor-2li.2',
        checkedAt: new Date().toISOString(),
        evidence:
          'Production build and real app HTTP/storage, agent-browser Chromium. Synthetic Claude sign-in/models, Codex auth failure/redirect, reported usage and loopback OpenAI-compatible upstream. No native provider authentication or inference claimed.',
        steps,
        screenshots: [
          `${verifyOut}/settings-interface-dark.png`,
          `${verifyOut}/settings-models-dark.png`,
          `${verifyOut}/settings-usage-dark.png`,
          `${verifyOut}/settings-usage-light.png`,
          `${verifyOut}/settings-interface-light.png`,
          `${verifyOut}/settings-connections-light.png`,
          `${verifyOut}/settings-mobile-connections-dark.png`,
          ...['interface', 'usage'].flatMap((section) =>
            ['dark', 'light'].map((mode) => `${verifyOut}/settings-mobile-${section}-${mode}.png`),
          ),
          ...[
            'models',
            'connections',
            'interface',
            'usage',
            'mobile-list',
            'mobile-connections',
          ].map((n) => `.impeccable/review/settings-window-${n}.png`),
        ],
      },
      null,
      2,
    ) + '\n',
  );
} finally {
  await b('close').catch(() => {});
  await app.stop();
  store.close();
  for (const close of cleanup) await close();
}
