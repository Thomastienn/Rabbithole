export const usage = {
  // Only reported usage is saved; NULL means the provider did not report it.
  usage(id, usage) {
    this.db
      .prepare('UPDATE messages SET usage=? WHERE id=?')
      .run(usage && JSON.stringify({ ...usage, at: Date.now() }), id);
  },
  // One row per logical call id, so repeated finish events cannot double count; usage=null records an unreported measurement.
  record(id, task, selection, usage, at = Date.now()) {
    if (
      usage &&
      !['input', 'output', 'cacheRead'].every(
        (k) => Number.isSafeInteger(usage[k]) && usage[k] >= 0,
      )
    )
      usage = null;
    this.db
      .prepare(
        'INSERT OR IGNORE INTO usage_events(id,at,provider,model,task,input,output,cacheRead) VALUES(?,?,?,?,?,?,?,?)',
      )
      .run(
        id,
        at,
        selection?.provider ?? null,
        selection?.model ?? null,
        task,
        usage?.input ?? null,
        usage?.output ?? null,
        usage?.cacheRead ?? null,
      );
  },
  usageEvents(from = 0, to = Number.MAX_SAFE_INTEGER) {
    return {
      first: this.db.prepare('SELECT MIN(at) AS at FROM usage_events').get().at,
      events: this.db
        .prepare(
          'SELECT at,provider,model,task,input,output,cacheRead FROM usage_events WHERE at>=? AND at<? ORDER BY at,rowid',
        )
        .all(from, to),
    };
  },
  usageSince(since) {
    // Suggestion calls count toward the total but not toward the reply count.
    return this.db
      .prepare(
        "SELECT COALESCE(SUM(input),0) AS input,COALESCE(SUM(output),0) AS output,COALESCE(SUM(cacheRead),0) AS cacheRead,COUNT(CASE WHEN task='chat' THEN input END) AS replies FROM usage_events WHERE at>=?",
      )
      .get(since);
  },
};
