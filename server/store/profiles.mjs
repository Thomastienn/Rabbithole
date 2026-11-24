import { randomUUID } from 'node:crypto';

// With no active profile every role is unset; smart follows the chat effort as a new profile does.
export function roles(row) {
    row ??= { smart_follow_effort: 1 };
    return {
        chat: row.chat_model
            ? { provider: row.chat_provider, model: row.chat_model, effort: row.chat_effort }
            : null,
        smart: {
            model: row.smart_model
                ? { provider: row.smart_provider, model: row.smart_model }
                : null,
            followEffort: !!row.smart_follow_effort,
            effort: row.smart_follow_effort ? null : (row.smart_effort ?? null),
        },
        quick: {
            model: row.quick_model
                ? { provider: row.quick_provider, model: row.quick_model }
                : null,
            effort: row.quick_model ? (row.quick_effort ?? null) : null,
        },
    };
}

export const profiles = {
    // Role settings read and write the active model profile; only automatic suggestions on/off stays global.
    profileRow() {
        return (
            this.db
                .prepare('SELECT p.* FROM profiles p JOIN active_profile a ON a.profile=p.id')
                .get() ?? null
        );
    },
    // A role chosen before any profile exists saves into a new "Default", which becomes active.
    updateProfile(columns, values) {
        if (!this.profileRow()) this.createProfile('Default');
        this.db
            .prepare(
                `UPDATE profiles SET ${columns.map((c) => `${c}=?`).join(',')} WHERE id=(SELECT profile FROM active_profile WHERE id=1)`,
            )
            .run(...values);
    },
    profiles() {
        return {
            active: this.profileRow()?.id ?? null,
            profiles: this.db
                .prepare('SELECT * FROM profiles ORDER BY rowid')
                .all()
                .map((row) => ({ id: row.id, name: row.name, ...roles(row) })),
        };
    },
    // A new profile copies `from` (default: the active one, else starts empty); false when the name is taken.
    // The first profile becomes active.
    createProfile(name, from = this.profileRow()?.id) {
        if (this.db.prepare('SELECT 1 FROM profiles WHERE name=?').get(name)) return false;
        const id = randomUUID();
        if (from)
            this.db
                .prepare(
                    `INSERT INTO profiles SELECT ?,?,chat_provider,chat_model,chat_effort,smart_provider,smart_model,smart_follow_effort,smart_effort,quick_provider,quick_model,quick_effort FROM profiles WHERE id=?`,
                )
                .run(id, name, from);
        else
            this.db
                .prepare('INSERT INTO profiles(id,name,smart_follow_effort) VALUES(?,?,1)')
                .run(id, name);
        this.db.prepare('INSERT OR IGNORE INTO active_profile VALUES(1,?)').run(id);
        return id;
    },
    profileName(id) {
        return this.db.prepare('SELECT name FROM profiles WHERE id=?').get(id)?.name;
    },
    // false when the name belongs to another profile; renaming to a new case of the same name is allowed.
    renameProfile(id, name) {
        if (this.db.prepare('SELECT 1 FROM profiles WHERE name=? AND id<>?').get(name, id))
            return false;
        this.db.prepare('UPDATE profiles SET name=? WHERE id=?').run(name, id);
        return true;
    },
    // Refused for the last profile; deleting the active one activates the first remaining profile.
    deleteProfile(id) {
        return this.transaction(() => {
            const next = this.db
                .prepare('SELECT id FROM profiles WHERE id<>? ORDER BY rowid LIMIT 1')
                .get(id);
            if (!next) return false;
            this.db
                .prepare('UPDATE active_profile SET profile=? WHERE id=1 AND profile=?')
                .run(next.id, id);
            this.db.prepare('DELETE FROM profiles WHERE id=?').run(id);
            return true;
        });
    },
    // Never checks model availability: an unavailable role fails visibly when used.
    activateProfile(id) {
        return (
            this.db
                .prepare(
                    'UPDATE active_profile SET profile=? WHERE id=1 AND EXISTS(SELECT 1 FROM profiles WHERE id=?)',
                )
                .run(id, id).changes === 1
        );
    },
    setupFinished() {
        return !!this.db.prepare('SELECT finished FROM first_run WHERE id=1').get().finished;
    },
    finishSetup() {
        this.db.prepare('UPDATE first_run SET finished=1 WHERE id=1').run();
    },
    suggestionSettings() {
        const row = this.db.prepare('SELECT enabled FROM suggestion_settings WHERE id=1').get();
        return { enabled: row ? !!row.enabled : true, ...roles(this.profileRow()).quick };
    },
    smartSettings() {
        return roles(this.profileRow()).smart;
    },
    saveSmartSettings({ model, followEffort, effort }) {
        this.updateProfile(
            ['smart_provider', 'smart_model', 'smart_follow_effort', 'smart_effort'],
            [
                model?.provider ?? null,
                model?.model ?? null,
                +followEffort,
                followEffort ? null : effort,
            ],
        );
        return this.smartSettings();
    },
    chatSettings() {
        return roles(this.profileRow()).chat;
    },
    saveChatSettings({ provider, model, effort }) {
        this.updateProfile(
            ['chat_provider', 'chat_model', 'chat_effort'],
            [provider, model, effort],
        );
        return this.chatSettings();
    },
    saveSuggestionSettings({ enabled, model, effort }) {
        this.db
            .prepare(
                'INSERT INTO suggestion_settings(id,enabled) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET enabled=excluded.enabled',
            )
            .run(+enabled);
        this.updateProfile(
            ['quick_provider', 'quick_model', 'quick_effort'],
            [model?.provider ?? null, model?.model ?? null, model ? (effort ?? null) : null],
        );
        return this.suggestionSettings();
    },
    typedEfforts(endpoint, model) {
        return this.db
            .prepare(
                'SELECT effort FROM endpoint_efforts WHERE endpoint=? AND model=? ORDER BY rowid',
            )
            .all(endpoint, model)
            .map((r) => r.effort);
    },
    rememberEffort(endpoint, model, effort) {
        this.db
            .prepare('INSERT OR IGNORE INTO endpoint_efforts VALUES(?,?,?)')
            .run(endpoint, model, effort);
    },
    forgetEfforts(endpoint) {
        this.db.prepare('DELETE FROM endpoint_efforts WHERE endpoint=?').run(endpoint);
    },
    // true, false, or null when the learner never chose.
    readsImagesOverride(endpoint, model) {
        const row = this.db
            .prepare('SELECT reads_images FROM endpoint_models WHERE endpoint=? AND model=?')
            .get(endpoint, model);
        return row?.reads_images == null ? null : !!row.reads_images;
    },
    setReadsImages(endpoint, model, readsImages) {
        this.db
            .prepare(
                'INSERT INTO endpoint_models(endpoint,model,reads_images) VALUES(?,?,?) ON CONFLICT(endpoint, model) DO UPDATE SET reads_images=excluded.reads_images',
            )
            .run(endpoint, model, +readsImages);
    },
    usesTutorToolsOverride(endpoint, model) {
        const row = this.db
            .prepare('SELECT uses_tutor_tools FROM endpoint_models WHERE endpoint=? AND model=?')
            .get(endpoint, model);
        return row?.uses_tutor_tools == null ? null : !!row.uses_tutor_tools;
    },
    setUsesTutorTools(endpoint, model, on) {
        this.db
            .prepare(
                'INSERT INTO endpoint_models(endpoint,model,uses_tutor_tools) VALUES(?,?,?) ON CONFLICT(endpoint,model) DO UPDATE SET uses_tutor_tools=excluded.uses_tutor_tools',
            )
            .run(endpoint, model, +on);
    },
    tutorTools() {
        return Object.fromEntries(
            this.db
                .prepare('SELECT name,enabled FROM tutor_tools')
                .all()
                .map((r) => [r.name, !!r.enabled]),
        );
    },
    saveTutorTool(name, enabled) {
        this.db
            .prepare(
                'INSERT INTO tutor_tools VALUES(?,?) ON CONFLICT(name) DO UPDATE SET enabled=excluded.enabled',
            )
            .run(name, +enabled);
    },
    forgetModels(endpoint) {
        this.db.prepare('DELETE FROM endpoint_models WHERE endpoint=?').run(endpoint);
    },
    tutorStyle() {
        return this.db.prepare('SELECT text FROM tutor_style WHERE id=1').get()?.text ?? null;
    },
    memoryNote() {
        return this.db.prepare('SELECT text FROM memory_note WHERE id=1').get()?.text ?? '';
    },
    // message: the reply whose tutor tool or post-reply call caused the write; the learner's own saves pass none.
    saveMemoryNote(text, message = null) {
        this.db
            .prepare(
                'INSERT INTO memory_note(id,text) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET text=excluded.text',
            )
            .run(text);
        if (message) this.db.prepare('UPDATE messages SET memory=1 WHERE id=?').run(message);
        return this.memoryNote();
    },
    searxngUrl() {
        return this.db.prepare('SELECT url FROM searxng_settings WHERE id=1').get()?.url ?? null;
    },
    saveSearxngUrl(url) {
        this.db
            .prepare(
                'INSERT INTO searxng_settings(id,url) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET url=excluded.url',
            )
            .run(url);
    },
    videoMode() {
        return this.db.prepare('SELECT mode FROM video_mode WHERE id=1').get()?.mode ?? 'quality';
    },
    saveVideoMode(mode) {
        this.db
            .prepare(
                'INSERT INTO video_mode(id,mode) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET mode=excluded.mode',
            )
            .run(mode);
        return this.videoMode();
    },
    saveTutorStyle(text) {
        this.db
            .prepare(
                'INSERT INTO tutor_style(id,text) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET text=excluded.text',
            )
            .run(text);
        return this.tutorStyle();
    },
};
