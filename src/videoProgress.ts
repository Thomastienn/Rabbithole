// Estimated overall progress for a pending video (docs/video-quality-spec.md, decision 10).
// Step names and counts are real; only the bar position between real signals is estimated.
export type VideoJob = { phase?: 'planning' | 'creating' | 'narrating' | 'rendering' | 'saving'; progress?: number; characters?: number; frames?: number; startedAt?: number; phaseStartedAt?: number };

export const STEPS = ['planning', 'narrating', 'rendering', 'saving'] as const;
// Share of the bar each phase owns, and how fast its estimate creeps (seconds to ~63% of its share).
const SPAN = { planning: [0, 0.55, 60], narrating: [0.55, 0.65, 8], rendering: [0.65, 0.97, 0], saving: [0.97, 1, 2] } as const;
// A typical composition length, for blending the real character count into the planning estimate.
const TYPICAL_CHARACTERS = 20000;

export function videoStep(job: VideoJob) {
  return job.phase === 'creating' || !job.phase ? 'planning' : job.phase;
}

// 0..1, strictly below 1 until the video is ready; callers keep the maximum so it never moves backward.
export function estimateVideoProgress(job: VideoJob, now: number) {
  const step = videoStep(job), [from, to, tau] = SPAN[step];
  const seconds = Math.max(0, now - (job.phaseStartedAt ?? job.startedAt ?? now)) / 1000;
  let share = tau ? 1 - Math.exp(-seconds / tau) : 0;
  if (step === 'rendering') share = job.progress ?? 0;
  if (step === 'planning' && job.characters) share = Math.max(share, Math.min(1, job.characters / TYPICAL_CHARACTERS));
  // Never reach the next phase's share on an estimate alone.
  return from + (to - from) * Math.min(share, step === 'rendering' ? 1 : 0.97);
}

export function videoStepDetail(job: VideoJob) {
  const step = videoStep(job);
  if (step === 'planning' && job.characters) return `${job.characters.toLocaleString('en')} characters written`;
  if (step === 'rendering' && job.frames) return `Frame ${Math.round((job.progress ?? 0) * job.frames).toLocaleString('en')} of ${job.frames.toLocaleString('en')}`;
  return '';
}

export function elapsed(job: VideoJob, now: number) {
  const seconds = Math.max(0, Math.floor((now - (job.startedAt ?? now)) / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
