// Estimated overall progress for a pending video (docs/focus-and-live-media-spec.md, progress phases).
// Step names and counts are real; only the bar position between real signals is estimated.
export type VideoJob = {
  phase?: 'planning' | 'creating' | 'writing' | 'narrating' | 'playable' | 'saving';
  progress?: number;
  characters?: number;
  frames?: number;
  cut?: number;
  cuts?: number;
  startedAt?: number;
  phaseStartedAt?: number;
};

export const STEPS = ['planning', 'writing', 'narrating', 'playable', 'saving'] as const;
// Share of the bar each phase owns, and how fast its estimate creeps (seconds to ~63% of its share; 0 = counted).
const SPAN = {
  planning: [0, 0.3, 30],
  writing: [0.3, 0.55, 0],
  narrating: [0.55, 0.6, 8],
  playable: [0.6, 0.7, 0],
  saving: [0.7, 1, 0],
} as const;
// A typical plan length, for blending the real character count into the planning estimate.
const TYPICAL_CHARACTERS = 4000;

export function videoStep(job: VideoJob) {
  return job.phase === 'creating' || !job.phase || !(job.phase in SPAN) ? 'planning' : job.phase;
}

// 0..1, strictly below 1 until the video is ready; callers keep the maximum so it never moves backward.
export function estimateVideoProgress(job: VideoJob, now: number) {
  const step = videoStep(job),
    [from, to, tau] = SPAN[step];
  const seconds = Math.max(0, now - (job.phaseStartedAt ?? job.startedAt ?? now)) / 1000;
  let share = tau ? 1 - Math.exp(-seconds / tau) : 0;
  if ((step === 'writing' || step === 'playable') && job.cuts) share = (job.cut ?? 0) / job.cuts;
  if (step === 'saving') share = job.progress ?? 0;
  if (step === 'planning' && job.characters)
    share = Math.max(share, Math.min(1, job.characters / TYPICAL_CHARACTERS));
  // Never reach the next phase's share on an estimate alone, nor 1 before the file is saved.
  return from + (to - from) * Math.min(share, tau ? 0.97 : step === 'saving' ? 0.99 : 1);
}

export function videoStepDetail(job: VideoJob) {
  const step = videoStep(job);
  if (step === 'planning' && job.characters)
    return `${job.characters.toLocaleString('en')} characters written`;
  if (step === 'writing' && job.cuts) return `${job.cut ?? 0} of ${job.cuts} cuts written`;
  if (step === 'playable' && job.cuts) return `${job.cut ?? 0} of ${job.cuts} cuts ready`;
  if (step === 'saving' && job.frames)
    return `Frame ${Math.round((job.progress ?? 0) * job.frames).toLocaleString('en')} of ${job.frames.toLocaleString('en')}`;
  return '';
}

export function elapsed(job: VideoJob, now: number) {
  const seconds = Math.max(0, Math.floor((now - (job.startedAt ?? now)) / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
