import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatLog,
  errorCause,
  loggedProvider,
  stdoutLog,
  requestPath,
} from '../../server/log.mjs';

test('plain formatter writes one dated line with level, area and diagnostic fields only', () => {
  const line = formatLog(
    'warn',
    'media',
    'render\nfailed',
    {
      id: 'abc',
      task: 'video',
      ms: 12,
      cause: 'Timed out\r\nTry again\x1b[31m',
      text: 'PRIVATE_QUESTION',
      source: 'PRIVATE_OUTPUT',
      apiKey: 'PRIVATE_KEY',
    },
    new Date('2026-11-14T00:00:00Z'),
  );
  assert.match(line, /^2026-11-14T00:00:00.000Z WARN media render failed /);
  assert.match(line, /id="abc" task="video" ms=12/);
  assert.match(line, /cause="Timed out Try again/);
  assert.doesNotMatch(line, /PRIVATE_|[\r\n\x1b]/);
});

test('errors retain cause while dropping echoed inputs, outputs and credential patterns', () => {
  const cause = errorCause(
    new Error(
      'Quota exceeded: PRIVATE_QUESTION PRIVATE_OUTPUT Bearer abc123 api_key="xyz456" sk-hidden https://user:pass@host/?token=secret',
    ),
    ['PRIVATE_QUESTION', 'PRIVATE_OUTPUT'],
  );
  assert.match(cause, /^Quota exceeded:/);
  assert.doesNotMatch(cause, /PRIVATE_|abc123|xyz456|sk-hidden|user:pass|token=secret/);
});

test('default sink routes info to stdout and warnings/errors to stderr', (t) => {
  const out = [],
    err = [];
  t.mock.method(process.stdout, 'write', (line) => {
    out.push(line);
    return true;
  });
  t.mock.method(process.stderr, 'write', (line) => {
    err.push(line);
    return true;
  });
  stdoutLog(formatLog('info', 'http', 'request'));
  stdoutLog(formatLog('warn', 'media', 'warning'));
  stdoutLog(formatLog('error', 'model', 'failed'));
  assert.equal(out.length, 1);
  assert.equal(err.length, 2);
  for (const line of [...out, ...err]) assert.equal(line.split('\n').length, 2);
});

test('model logs preserve actual model and unavailable counts, and distinguish cancellation', async () => {
  const logs = [],
    controller = new AbortController();
  const provider = {
    generate: async (_tree, _text, emit, save) => {
      save('private-thread', 'actual-model');
      emit({ type: 'usage', usage: { input: -1, output: 2, cacheRead: 0 } });
      controller.abort();
    },
  };
  await loggedProvider((line) => logs.push(line), provider, 'compaction', 'call-id', {
    provider: 'codex',
    model: 'asked-model',
  }).generate(
    {},
    'PRIVATE_INPUT',
    () => {},
    () => {},
    controller.signal,
  );
  assert.equal(logs.length, 2);
  assert.match(
    logs[1],
    / INFO model stopped .*model="actual-model" input="unreported" output="unreported" cacheRead="unreported" ms=\d+/,
  );
  assert.doesNotMatch(logs.join('\n'), /private-thread|PRIVATE_INPUT/);
});

test('logging preserves the provider receiver for catalog and generation calls', async () => {
  class Provider {
    #model = 'native-model';
    models() {
      return [{ model: this.#model }];
    }
    async generate(_tree, _text, emit) {
      assert.equal(this.#model, 'native-model');
      emit({ type: 'status', status: 'completed' });
    }
  }
  const provider = loggedProvider(() => {}, new Provider(), 'suggestions', 'id', {
    provider: 'codex',
  });
  assert.deepEqual(provider.models(), [{ model: 'native-model' }]);
  await provider.generate(
    {},
    'question',
    () => {},
    () => {},
    new AbortController().signal,
  );
});

test('a timed-out model call logs an actionable failure rather than a learner stop', async () => {
  const logs = [],
    controller = new AbortController();
  const error = new DOMException('The operation timed out.', 'TimeoutError');
  const provider = {
    generate: async () => {
      controller.abort(error);
      throw error;
    },
  };
  await assert.rejects(
    loggedProvider((line) => logs.push(line), provider, 'diagram', 'id', {
      provider: 'codex',
    }).generate(
      {},
      'private',
      () => {},
      () => {},
      controller.signal,
    ),
    /timed out/,
  );
  assert.match(logs.at(-1), / ERROR model failed .*cause="The operation timed out\." next=/);
});

test('request paths retain route actions and UUIDs while masking arbitrary content', () => {
  const id = '00000000-0000-4000-8000-000000000001';
  for (const path of [
    '/api/settings/endpoint/clear',
    '/api/settings/endpoints/edit',
    '/api/settings/endpoints/remove',
    '/api/profiles/active',
    `/api/profiles/${id}/duplicate`,
    '/api/graph/merge',
    `/api/trees/${id}/artifacts/${id}/regenerate`,
    `/api/trees/${id}/artifacts/${id}/cancel`,
  ])
    assert.equal(requestPath(path), path);
  assert.equal(requestPath('/api/PRIVATE_QUESTION'), '/api/:id');
});
