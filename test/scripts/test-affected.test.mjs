import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { ALL, selectTests } from '../../scripts/test-affected.mjs';

test('affected-tests selector follows imports from each test to the changed paths', () => {
    const root = mkdtempSync(join(tmpdir(), 'test-affected-'));
    const files = {
        'src/deep.ts': 'export const deep = 1;\n',
        'src/mid.tsx': "import { deep } from './deep';\nexport const mid = deep;\n",
        'src/fresh.ts': 'export const fresh = 1;\n',
        'src/other.ts': "import x from 'react';\nexport const other = x;\n",
        'test/support/mid-kit.mjs': "export const kit = () => import('../../src/mid');\n",
        'test/a/direct.test.mjs': "import { deep } from '../../src/deep.ts';\n",
        'test/a/through.slow.mjs': "import { mid } from '../../src/mid';\n",
        'test/b/kit.test.mjs': "import { kit } from '../support/mid-kit.mjs';\n",
        'test/b/fresh.test.mjs': "import '../../src/fresh';\n",
        'test/b/unrelated.test.mjs': "import { other } from '../../src/other';\n",
    };
    for (const [path, source] of Object.entries(files)) {
        mkdirSync(join(root, dirname(path)), { recursive: true });
        writeFileSync(join(root, path), source);
    }
    const tests = Object.keys(files).filter((path) => /\.(test|slow)\.mjs$/.test(path));
    const read = (path) => {
        try {
            return readFileSync(join(root, path), 'utf8');
        } catch {
            return null;
        }
    };
    const select = (...changed) => selectTests(changed, tests, read);

    assert.deepEqual(select('src/deep.ts'), [
        'test/a/direct.test.mjs',
        'test/a/through.slow.mjs',
        'test/b/kit.test.mjs',
    ]);
    assert.deepEqual(select('test/b/unrelated.test.mjs'), ['test/b/unrelated.test.mjs']);
    // An untracked test and its untracked module are both changed paths.
    assert.deepEqual(select('test/b/fresh.test.mjs', 'src/fresh.ts'), ['test/b/fresh.test.mjs']);
    assert.equal(select('test/support/mid-kit.mjs'), ALL);
    assert.equal(select('package.json'), ALL);
    assert.deepEqual(select('README.md'), []);
});
