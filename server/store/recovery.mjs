// Startup recovery, run by open() after migrations.
export const recovery = {
    // Starting or stopping never resumes paid inference; saved partial text stays available.
    interrupt() {
        // Streaming saves skip citations; a reply cut off by a crash gets them here.
        const cut = this.db.prepare("SELECT id,text FROM messages WHERE status='streaming'").all();
        this.db
            .exec(`UPDATE messages SET status='interrupted',stopped='shutdown' WHERE status='streaming';
      UPDATE tool_calls SET status='failed',output='Tool call was interrupted when Rabbithole stopped.',elapsed=NULL WHERE status='running';
      UPDATE suggestions SET status='failed' WHERE status='pending';
      UPDATE artifacts SET status='interrupted',error='Video generation was interrupted when Rabbithole stopped.' WHERE status='pending' AND kind='video';
      UPDATE artifacts SET status='failed',source=NULL,error=(CASE kind WHEN 'discussion' THEN 'Discussion' WHEN 'visual' THEN 'Visual' ELSE 'Diagram' END)||' generation was interrupted when Rabbithole stopped.' WHERE status='pending';`);
        this.db.exec(
            `UPDATE artifacts SET source=json_set(source,'$.turn.status','failed'),error='The discussion was interrupted when Rabbithole stopped.' WHERE kind='discussion' AND status='ready' AND json_extract(source,'$.turn.status')='streaming';`,
        );
        for (const m of cut) this.cite(m.id, m.text);
    },
};
