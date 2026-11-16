import { randomUUID } from 'node:crypto';

export const discussions = {
  discussion(conversation, id) {
    const artifact = this.artifact(conversation, id);
    return artifact?.kind === 'discussion' && artifact.status === 'ready' && artifact.source
      ? JSON.parse(artifact.source)
      : null;
  },
  saveDiscussion(conversation, id, discussion, error = null) {
    this.db
      .prepare(
        "UPDATE artifacts SET source=?,error=? WHERE conversation=? AND id=? AND kind='discussion' AND status='ready'",
      )
      .run(JSON.stringify(discussion), error, conversation, id);
    return this.artifact(conversation, id);
  },
  replyDiscussion(conversation, id, text) {
    const data = this.discussion(conversation, id);
    if (!data || data.closed || data.turn?.status === 'streaming') return null;
    const line = { id: randomUUID(), speaker: 'Learner', text, at: Date.now() };
    data.lines.push(line);
    data.turn = { id: line.id, start: data.lines.length, status: 'streaming' };
    return this.saveDiscussion(conversation, id, data);
  },
  updateDiscussion(conversation, id, turn, lines, status = 'streaming', error = null) {
    const data = this.discussion(conversation, id);
    if (!data || data.closed || data.turn?.id !== turn || data.turn.status !== 'streaming')
      return null;
    data.lines = [...data.lines.slice(0, data.turn.start), ...lines];
    data.turn.status = status;
    return this.saveDiscussion(conversation, id, data, error);
  },
  closeDiscussions(conversation) {
    const closed = [];
    for (const artifact of this.tree(conversation)?.artifacts ?? []) {
      const data = artifact.kind === 'discussion' && this.discussion(conversation, artifact.id);
      if (!data || data.closed) continue;
      data.closed = true;
      closed.push(this.saveDiscussion(conversation, artifact.id, data, artifact.error));
    }
    if (closed.length) this.forgetThread(conversation);
    return closed;
  },
  summarizeDiscussion(conversation, id, summary) {
    const data = this.discussion(conversation, id);
    if (!data?.closed || data.summary) return null;
    data.summary = summary;
    this.forgetThread(conversation);
    return this.saveDiscussion(conversation, id, data, this.artifact(conversation, id).error);
  },
};
