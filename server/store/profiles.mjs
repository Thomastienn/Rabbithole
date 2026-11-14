import { randomUUID } from 'node:crypto';

export function roles(row) {
  return {
    chat: row.chat_model
      ? { provider: row.chat_provider, model: row.chat_model, effort: row.chat_effort }
      : null,
    smart: {
      model: row.smart_model ? { provider: row.smart_provider, model: row.smart_model } : null,
      followEffort: !!row.smart_follow_effort,
      effort: row.smart_follow_effort ? null : (row.smart_effort ?? null),
    },
    quick: {
      model: row.quick_model ? { provider: row.quick_provider, model: row.quick_model } : null,
      effort: row.quick_model ? (row.quick_effort ?? null) : null,
    },
  };
}

export const profiles = {
  // Role settings read and write the active model profile; only automatic suggestions on/off stays global.
  profileRow() {
    return this.db
      .prepare('SELECT p.* FROM profiles p JOIN active_profile a ON a.profile=p.id')
      .get();
  },
  updateProfile(columns, values) {
    this.db
      .prepare(
        `UPDATE profiles SET ${columns.map((c) => `${c}=?`).join(',')} WHERE id=(SELECT profile FROM active_profile WHERE id=1)`,
      )
      .run(...values);
  },
  profiles() {
    return {
      active: this.profileRow().id,
      profiles: this.db
        .prepare('SELECT * FROM profiles ORDER BY rowid')
        .all()
        .map((row) => ({ id: row.id, name: row.name, ...roles(row) })),
    };
  },
  // A new profile copies `from` (default: the active one); false when the name is taken.
  createProfile(name, from = this.profileRow().id) {
    if (this.db.prepare('SELECT 1 FROM profiles WHERE name=?').get(name)) return false;
    const id = randomUUID();
    this.db
      .prepare(
        `INSERT INTO profiles SELECT ?,?,chat_provider,chat_model,chat_effort,smart_provider,smart_model,smart_follow_effort,smart_effort,quick_provider,quick_model,quick_effort FROM profiles WHERE id=?`,
      )
      .run(id, name, from);
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
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const next = this.db
        .prepare('SELECT id FROM profiles WHERE id<>? ORDER BY rowid LIMIT 1')
        .get(id);
      if (!next) {
        this.db.exec('ROLLBACK');
        return false;
      }
      this.db
        .prepare('UPDATE active_profile SET profile=? WHERE id=1 AND profile=?')
        .run(next.id, id);
      this.db.prepare('DELETE FROM profiles WHERE id=?').run(id);
      this.db.exec('COMMIT');
      return true;
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
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
      [model?.provider ?? null, model?.model ?? null, +followEffort, followEffort ? null : effort],
    );
    return this.smartSettings();
  },
  chatSettings() {
    return roles(this.profileRow()).chat;
  },
  saveChatSettings({ provider, model, effort }) {
    this.updateProfile(['chat_provider', 'chat_model', 'chat_effort'], [provider, model, effort]);
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
};
