// A usage report counts only when input, output and cache-read are non-negative safe integers.
export const validUsage = (usage) =>
    Boolean(usage) &&
    ['input', 'output', 'cacheRead'].every((k) => Number.isSafeInteger(usage[k]) && usage[k] >= 0);

export const usage = {
    // Only reported usage is saved; NULL means the provider did not report it.
    usage(id, usage) {
        this.db
            .prepare('UPDATE messages SET usage=? WHERE id=?')
            .run(usage && JSON.stringify({ ...usage, at: Date.now() }), id);
    },
    // One row per call: streamed measurements replace its counts; an unreported finish cannot erase them.
    record(id, task, selection, usage, at = Date.now(), message = null, stage = null, cut = null) {
        if (!validUsage(usage)) usage = null;
        const reasoning =
            Number.isSafeInteger(usage?.reasoning) && usage.reasoning >= 0 ? usage.reasoning : null;
        this.db
            .prepare(
                // at stays the call's start; ended moves with each record of the same call.
                `INSERT INTO usage_events(id,at,ended,provider,model,task,input,output,cacheRead,reasoning,message,stage,cut)
         VALUES(?,?,?,?,?,?,?,?,?,?,(SELECT id FROM messages WHERE id=?),?,?)
         ON CONFLICT(id) DO UPDATE SET provider=excluded.provider,model=excluded.model,ended=excluded.ended,
           input=coalesce(excluded.input,usage_events.input),
           output=coalesce(excluded.output,usage_events.output),
           cacheRead=coalesce(excluded.cacheRead,usage_events.cacheRead),
           reasoning=coalesce(excluded.reasoning,usage_events.reasoning)`,
            )
            .run(
                id,
                at,
                at,
                selection?.provider ?? null,
                selection?.model ?? null,
                task,
                usage?.input ?? null,
                usage?.output ?? null,
                usage?.cacheRead ?? null,
                reasoning,
                message,
                stage,
                cut,
            );
    },
    // A video's current attempt by stage and model; stage NULL = recorded before stages were kept.
    // time: ms from the stage's first call start to its last call end; NULL when recorded before ends were kept.
    videoUsage(conversation, id) {
        return this.db
            .prepare(
                `SELECT u.stage,u.model,COUNT(*) AS calls,COUNT(u.input) AS reported,
          COALESCE(SUM(u.input),0) AS input,COALESCE(SUM(u.output),0) AS output,COALESCE(SUM(u.cacheRead),0) AS cacheRead,SUM(u.reasoning) AS reasoning,
          MAX(u.ended)-MIN(u.at) AS time
        FROM artifacts a JOIN usage_events u ON u.id LIKE 'video:'||a.attempt||':%'
        WHERE a.conversation=? AND a.id=? AND a.kind='video'
        GROUP BY u.stage,u.model ORDER BY MIN(u.at),MIN(u.rowid)`,
            )
            .all(conversation, id);
    },
    replyMediaUsage(message) {
        return this.db
            .prepare(
                `SELECT task,input,output,cacheRead FROM usage_events WHERE message=? AND task IN ('diagram','video')
      UNION ALL SELECT CASE kind WHEN 'video' THEN 'video' ELSE 'diagram' END,NULL,NULL,NULL
      FROM artifacts a WHERE message=? AND kind!='discussion' AND NOT EXISTS (SELECT 1 FROM usage_events u
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
                    // The learning tree is looked up live (chat and suggestion ids carry their message), so deleting a tree drops it here.
                    `WITH RECURSIVE up(id,root) AS (SELECT id,id FROM trees WHERE id NOT IN (SELECT child FROM branches)
            UNION ALL SELECT b.child,up.root FROM branches b JOIN up ON b.parent=up.id)
          SELECT u.at,u.provider,u.model,u.task,u.input,u.output,u.cacheRead,u.reasoning,r.id AS tree,r.title AS treeTitle
          FROM usage_events u
          LEFT JOIN messages m ON m.id=coalesce(u.message,CASE WHEN u.task IN ('chat','suggestions') THEN substr(u.id,instr(u.id,':')+1) END)
          LEFT JOIN up ON up.id=m.tree LEFT JOIN trees r ON r.id=up.root
          WHERE u.at>=? AND u.at<? ORDER BY u.at,u.rowid`,
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
