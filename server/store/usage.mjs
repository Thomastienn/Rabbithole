export const usage = {
  // Only reported usage is saved; NULL means the provider did not report it.
  usage(id, usage) {
    this.db
      .prepare('UPDATE messages SET usage=? WHERE id=?')
      .run(usage && JSON.stringify({ ...usage, at: Date.now() }), id);
  },
  // One row per call: streamed measurements replace its counts; an unreported finish cannot erase them.
  record(id, task, selection, usage, at = Date.now(), message = null) {
    if (
      usage &&
      !['input', 'output', 'cacheRead'].every(
        (k) => Number.isSafeInteger(usage[k]) && usage[k] >= 0,
      )
    )
      usage = null;
    this.db
      .prepare(
        `INSERT INTO usage_events(id,at,provider,model,task,input,output,cacheRead,message)
         VALUES(?,?,?,?,?,?,?,?,(SELECT id FROM messages WHERE id=?))
         ON CONFLICT(id) DO UPDATE SET provider=excluded.provider,model=excluded.model,
           input=coalesce(excluded.input,usage_events.input),
           output=coalesce(excluded.output,usage_events.output),
           cacheRead=coalesce(excluded.cacheRead,usage_events.cacheRead)`,
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
        message,
      );
  },
  replyMediaUsage(message) {
    return this.db
      .prepare(
        `SELECT task,input,output,cacheRead FROM usage_events WHERE message=?
      UNION ALL SELECT CASE kind WHEN 'video' THEN 'video' ELSE 'diagram' END,NULL,NULL,NULL
      FROM artifacts a WHERE message=? AND NOT EXISTS (SELECT 1 FROM usage_events u
        WHERE u.message=a.message AND (
          (a.kind='video' AND u.id LIKE 'video:'||a.attempt||':%') OR
          (a.kind!='video' AND (u.id='diagram:'||a.id OR u.id LIKE 'diagram:'||a.id||':%'))))`,
      )
      .all(message, message);
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
