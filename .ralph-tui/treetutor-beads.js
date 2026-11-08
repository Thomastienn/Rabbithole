import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const ralphModule = join(dirname(realpathSync(Bun.which('ralph-tui'))), 'index.js');
const { createBeadsTracker } = await import(pathToFileURL(ralphModule).href);

export default function createTracker() {
  const tracker = createBeadsTracker();
  tracker.meta = { ...tracker.meta, id: 'treetutor-beads', name: 'TreeTutor Beads (resume unfinished tasks)' };
  const next = tracker.getNextTask.bind(tracker);
  let previousId;
  const bd = (...args) => execFileSync('bd', args, { cwd: tracker.workingDir, encoding: 'utf8' }).trim();
  const actor = process.env.BEADS_ACTOR || execFileSync('git', ['config', 'user.name'], { encoding: 'utf8' }).trim();

  tracker.getNextTask = async filter => {
    if (previousId) {
      const [issue] = JSON.parse(bd('show', previousId, '--json'));
      // bd ready excludes in_progress. Requeue only this run's own unfinished work;
      // ready then rechecks blockers, deferral, and scope before another attempt.
      if (issue.status === 'in_progress' && (!issue.assignee || issue.assignee === actor)) {
        bd('update', previousId, '--status', 'open', '--if-status', 'in_progress', '--if-assignee', issue.assignee || '');
      }
      previousId = undefined;
    }
    const task = await next(filter);
    previousId = task?.id;
    return task;
  };

  // This workspace is local-only. Never use the built-in tracker's bd sync.
  tracker.sync = async () => {
    bd('export', '--output', join(tracker.beadsDir, 'issues.jsonl'));
    return { success: true, message: 'Exported local Beads snapshot', syncedAt: new Date().toISOString() };
  };
  return tracker;
}
