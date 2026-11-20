import { randomUUID } from 'node:crypto';

export const media = {
    artifact(conversation, id) {
        return this.db
            .prepare('SELECT * FROM artifacts WHERE conversation=? AND id=?')
            .get(conversation, id);
    },
    hasArtifact(id) {
        return !!this.db.prepare('SELECT 1 FROM artifacts WHERE id=?').get(id);
    },
    // Videos keep frozen input and an attempt; source holds their private plan and ordered cuts.
    // position: offset in the stored reply text where the request block was removed; null renders after the reply.
    // side: left or right beside the section after position (visuals); null sits in the flow.
    pendingArtifact(
        conversation,
        message,
        title,
        description,
        kind = 'mermaid',
        input = null,
        position = null,
        side = null,
    ) {
        const id = randomUUID();
        const result = this.db
            .prepare(
                "INSERT INTO artifacts(id,conversation,message,kind,status,title,description,created,input,attempt,position,side) SELECT ?,?,?,?,'pending',?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM messages WHERE id=? AND tree=? AND role='assistant')",
            )
            .run(
                id,
                conversation,
                message,
                kind,
                title,
                description,
                Date.now(),
                input,
                kind === 'video' ? randomUUID() : null,
                position,
                side,
                message,
                conversation,
            );
        if (!result.changes)
            throw new Error('Artifact message does not belong to this conversation.');
        return this.artifact(conversation, id);
    },
    finishArtifact(conversation, id, source, error = null) {
        this.db
            .prepare(
                "UPDATE artifacts SET status=?,source=?,error=? WHERE conversation=? AND id=? AND kind IN ('mermaid','visual','discussion') AND status='pending'",
            )
            .run(error ? 'failed' : 'ready', error ? null : source, error, conversation, id);
        return this.artifact(conversation, id);
    },
    visualInput(conversation, id, input) {
        return (
            this.db
                .prepare(
                    "UPDATE artifacts SET input=? WHERE conversation=? AND id=? AND kind='visual' AND status='pending'",
                )
                .run(input, conversation, id).changes > 0
        );
    },
    cancelVisuals(conversation, message) {
        this.db
            .prepare(
                "UPDATE artifacts SET status='failed',source=NULL,error='Visual generation canceled.' WHERE conversation=? AND message=? AND kind='visual' AND status='pending'",
            )
            .run(conversation, message);
    },
    videoInput(conversation, id, attempt, input) {
        return (
            this.db
                .prepare(
                    "UPDATE artifacts SET input=? WHERE conversation=? AND id=? AND attempt=? AND kind='video' AND status='pending'",
                )
                .run(input, conversation, id, attempt).changes > 0
        );
    },
    videoData(conversation, id, attempt, data) {
        return (
            this.db
                .prepare(
                    "UPDATE artifacts SET source=? WHERE conversation=? AND id=? AND attempt=? AND kind='video' AND status='pending'",
                )
                .run(JSON.stringify(data), conversation, id, attempt).changes > 0
        );
    },
    finishVideo(conversation, id, attempt, { title, description, duration } = {}, error = null) {
        this.db.exec('BEGIN IMMEDIATE');
        try {
            const done = this.db
                .prepare(
                    "UPDATE artifacts SET status=?,title=COALESCE(?,title),description=COALESCE(?,description),duration=?,error=? WHERE conversation=? AND id=? AND attempt=? AND kind='video' AND status='pending'",
                )
                .run(
                    error ? 'failed' : 'ready',
                    error ? null : (title ?? null),
                    error ? null : description,
                    error ? null : duration,
                    error,
                    conversation,
                    id,
                    attempt,
                ).changes;
            if (done && !error)
                this.db
                    .prepare(
                        'INSERT INTO videos(id,title,description,duration,created,source,attempt) SELECT id,title,description,duration,created,source,attempt FROM artifacts WHERE id=? ON CONFLICT(id) DO UPDATE SET title=excluded.title,description=excluded.description,duration=excluded.duration,source=excluded.source,attempt=excluded.attempt',
                    )
                    .run(id);
            this.db.exec('COMMIT');
        } catch (e) {
            this.db.exec('ROLLBACK');
            throw e;
        }
        return this.artifact(conversation, id);
    },
    cancelVideo(conversation, id) {
        this.db
            .prepare(
                "UPDATE artifacts SET status='canceled',error=NULL WHERE conversation=? AND id=? AND kind='video' AND status='pending'",
            )
            .run(conversation, id);
        return this.artifact(conversation, id);
    },
    // A retry is a new attempt on the same row and frozen input, so late events from the old attempt cannot publish.
    retryVideo(conversation, id) {
        const result = this.db
            .prepare(
                "UPDATE artifacts SET status='pending',attempt=?,source=NULL,error=NULL,duration=NULL WHERE conversation=? AND id=? AND kind='video' AND status!='pending'",
            )
            .run(randomUUID(), conversation, id);
        return result.changes ? this.artifact(conversation, id) : null;
    },
    // Retry reruns from the stored task; rows saved before tasks were stored stay failed.
    retryArtifact(conversation, id) {
        const result = this.db
            .prepare(
                "UPDATE artifacts SET status='pending',source=NULL,error=NULL WHERE conversation=? AND id=? AND kind IN ('mermaid','visual') AND status='failed' AND input IS NOT NULL",
            )
            .run(conversation, id);
        return result.changes ? this.artifact(conversation, id) : null;
    },
    regenerateArtifact(conversation, id) {
        const artifact = this.artifact(conversation, id);
        if (
            artifact?.status !== 'ready' ||
            !['visual', 'video'].includes(artifact.kind) ||
            !artifact.input
        )
            return null;
        // A new video id leaves its previous library entry/file intact; updating the row preserves chat order.
        const next = artifact.kind === 'video' ? randomUUID() : id;
        const input = JSON.stringify({ ...JSON.parse(artifact.input), differentVersion: true });
        const result = this.db
            .prepare(
                "UPDATE artifacts SET id=?,status='pending',source=NULL,error=NULL,duration=NULL,input=?,attempt=? WHERE conversation=? AND id=? AND status='ready'",
            )
            .run(next, input, artifact.kind === 'video' ? randomUUID() : null, conversation, id);
        return result.changes ? this.artifact(conversation, next) : null;
    },
    // `origin` is the title of the conversation still holding this video, or null once it is deleted or regenerated.
    library() {
        return this.db
            .prepare(
                "SELECT v.id,v.title,v.description,v.duration,v.created,t.title AS origin FROM videos v LEFT JOIN artifacts a ON a.id=v.id AND a.kind='video' LEFT JOIN trees t ON t.id=a.conversation ORDER BY v.created DESC,v.rowid DESC",
            )
            .all()
            .map((v) => ({ ...v }));
    },
    // Removes only the library entry; artifacts and usage records stay as history.
    removeLibraryVideo(id) {
        this.db.prepare('DELETE FROM videos WHERE id=?').run(id);
    },
    // A library video's own cut source and attempt, so it plays live after its tree is deleted or regenerated.
    libraryCuts(id) {
        return this.db.prepare('SELECT source,attempt FROM videos WHERE id=?').get(id);
    },
    libraryVideo(id) {
        return this.db
            .prepare('SELECT id,title,description,duration,created FROM videos WHERE id=?')
            .get(id);
    },
};
