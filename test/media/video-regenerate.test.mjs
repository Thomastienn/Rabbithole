import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mediaRoutes } from '../../server/http/routes/media.mjs';
import { backgroundJobs } from '../../server/http/jobs/background.mjs';

test('a published video can start a new version while its old job cleans up; pending jobs still refuse', async () => {
    const artifact = { id: 'old', kind: 'video', status: 'ready', input: '{}' };
    const next = { ...artifact, id: 'new', status: 'pending' };
    const started = [],
        responses = [];
    const ctx = {
        store: {
            tree: () => ({}),
            artifact: () => artifact,
            regenerateArtifact: () => next,
        },
        jobs: backgroundJobs(),
        json: (_res, status, body) => responses.push({ status, body }),
        startVideo: (job) => started.push(job),
        live: (a) => a,
    };
    ctx.jobs.start('video', 'old', 'tree', () => new Promise(() => {}));
    const url = new URL('http://localhost/api/trees/tree/artifacts/old/regenerate');
    await mediaRoutes({ method: 'POST' }, {}, url, ctx, {});
    assert.deepEqual(responses, [{ status: 200, body: next }]);
    assert.deepEqual(started, [next]);
    assert.ok(ctx.jobs.get('video', 'old'), 'the original cleanup job keeps its own identity');
    artifact.status = 'pending';
    await mediaRoutes({ method: 'POST' }, {}, url, ctx, {});
    assert.equal(responses.at(-1).status, 409);
    assert.equal(started.length, 1);
});
