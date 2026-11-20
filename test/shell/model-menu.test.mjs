import test from 'node:test';
import assert from 'node:assert/strict';
import { menuGroups } from '../../src/settings/models.ts';

test('model menu groups each provider’s models under its name; disconnected providers offer their repair action', () => {
    const providers = {
        claude: { label: 'Claude', connected: true },
        codex: { label: 'Codex', connected: false },
        openai: { label: 'Custom endpoint', connected: true },
        'openai:gw': { label: 'Work gateway', connected: false },
    };
    const models = [
        { provider: 'claude', model: 'sonnet', label: 'Sonnet', isDefault: true },
        { provider: 'claude', model: 'haiku', label: 'Haiku' },
        { provider: 'codex', model: 'gpt', label: 'GPT' },
        { provider: 'openai', model: 'second-model', label: 'second-model' },
    ];
    const groups = menuGroups(providers, models, { provider: 'claude', model: null, effort: null });
    assert.deepEqual(
        groups.map((g) => [g.title, g.action, g.items?.map((i) => i.label) ?? null]),
        [
            ['Claude', 'check', ['Sonnet', 'Haiku']],
            ['Codex · not connected', 'codex', null],
            ['Custom endpoint', 'endpoint', ['second-model']],
            ['Work gateway · not connected', 'endpoint', null],
        ],
    );
    assert.equal(groups[0].value, 'sonnet', 'provider default is checked when no model is saved');
    assert.equal(groups[2].value, undefined);

    // A saved model the provider no longer lists stays visible, disabled, ahead of the listed ones.
    const [claude] = menuGroups(providers, models, {
        provider: 'claude',
        model: 'fixture-missing',
        effort: null,
    });
    assert.equal(claude.value, 'fixture-missing');
    assert.deepEqual(claude.items[0], {
        value: 'fixture-missing',
        label: 'fixture-missing (saved)',
        disabled: true,
        readsImages: false,
    });

    // Models that read images (Claude and Codex always; endpoint models per model) carry the image icon flag.
    const reading = menuGroups(
        providers,
        [
            { provider: 'claude', model: 'sonnet', label: 'Sonnet', readsImages: true },
            { provider: 'openai', model: 'text-only', label: 'text-only', readsImages: false },
        ],
        { provider: 'claude', model: null, effort: null },
    );
    assert.deepEqual(
        reading.flatMap((g) => g.items ?? []).map((i) => [i.value, i.readsImages]),
        [
            ['sonnet', true],
            ['text-only', false],
        ],
    );

    // A failed catalogue lists no models, so every provider shows only its action.
    assert.ok(
        menuGroups(providers, undefined, {
            provider: 'claude',
            model: 'sonnet',
            effort: null,
        }).every((g) => g.items === null),
    );
});
