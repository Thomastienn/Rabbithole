# Cuts are audited before they play, against the plan and shared set pieces

ADR 0001 made a cut playable as soon as its code and narration existed, so playback started almost at once. Cuts written in parallel by separate calls drew recurring objects differently and nothing checked their layout. We decided that the smart model first writes the video's set pieces as shared components that every Remotion cut must use. Each cut then gets one cut audit, from its code and still frames, before it becomes playable. All audits run at the same time, and each aligns its cut to the plan rather than to its neighbour, so audits that run together still meet at the same positions. A failed cut's repair also serves as its audit, and an audit that breaks a cut is discarded. We accepted a later start for cut 1, one extra call for set pieces, one image call per cut and a snapshot render per cut, in exchange for videos that look like one consistent story.

## Considered Options

- One whole-video audit after every cut is written. This gave the best cross-cut view, but playback would wait for every cut and the audit.
- Play cuts unaudited and audit only the saved MP4. Live playback stayed instant, but what the learner watched would differ from what the library keeps.
- Audit cuts in order against the previous cut's audited result. Continuity was most faithful, but audits take longer than a cut plays, so playback would stall between cuts.
- Describe set pieces in words only. This was cheaper, but separate writers still drift.
