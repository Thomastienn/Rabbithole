import { join } from 'node:path';

// Where a video's working files live in the data folder, and its saved cut source. The layout is what saved videos
// already use on disk: video-work/<video id>/<attempt>/cut-<index>/, so changing it would lose them.
export const workRoot = (dir) => join(dir, 'video-work');
// Every attempt of one video.
export const videoWork = (dir, id) => join(workRoot(dir), id);
export const attemptWork = (dir, id, attempt) => join(videoWork(dir, id), attempt);
// Older workspaces were named only by attempt.
export const legacyWork = (dir, attempt) => join(workRoot(dir), attempt);
export const cutWork = (workspace, index) => join(workspace, `cut-${index}`);
// A cut's files the player and export read, inside its cut folder.
export const cutAudio = (cutDir) => join(cutDir, 'public', 'narration.mp3');
export const cutClip = (cutDir) => join(cutDir, 'public', 'manim.mp4');

// The saved source as { plan, cuts, pieces, exhibits }, or null when it holds no cuts the player can play.
export const readSaved = (source) => {
    try {
        const data = JSON.parse(source);
        return Array.isArray(data?.cuts) ? data : null;
    } catch {
        return null;
    }
};
export const writeSaved = (data) => JSON.stringify(data);
