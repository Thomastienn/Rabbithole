import { SHOW_VISUAL, readShowVisual, visualPosition, visualSide } from '../tools/showVisual.mjs';
import { RECORD_TURN, readRecordTurn } from '../tools/recordTurn.mjs';
import { MAKE_VIDEO, readMakeVideo } from '../tools/makeVideo.mjs';
import { START_DISCUSSION, readStartDiscussion } from '../tools/startDiscussion.mjs';
import { formatLog, errorCause, privateValues } from '../log.mjs';

// App tools the server runs itself for the tutor; never learner-toggled tutor tools or tool activity.
export const APP_TOOLS = [SHOW_VISUAL, MAKE_VIDEO, START_DISCUSSION, RECORD_TURN];
export const isAppTool = (name) => APP_TOOLS.some((t) => t.name === name);

// One reply's app calls, native or written as <tool_call> text.
export function appCalls(
  ctx,
  { reply, showVisual, makeVideo, startDiscussion, hasMedia, questioned },
) {
  let ranCalls = 0,
    // What record_turn calls carried; null until one arrives, so quick thinking stands in.
    recorded = null;
  // Every refused call is logged with its reason, its input values redacted.
  const refused = (name, input, error) =>
    ctx.log(
      formatLog('warn', 'chat', 'app tool call refused', {
        id: reply,
        tool: name,
        cause: errorCause(error, privateValues(JSON.stringify(input ?? {}))),
      }),
    );
  const run = (...args) => {
    try {
      return runCall(...args);
    } catch (error) {
      refused(args[0], args[1], error);
      throw error;
    }
  };
  // responseStart: where the model response holding the call began; null when after is ignored.
  const runCall = (name, input, position, replySoFar, responseStart = 0, textCall = false) => {
    // A show_visual call queues its visual at its after anchor, or that reply position.
    if (name === SHOW_VISUAL.name) {
      const request = readShowVisual(input, replySoFar);
      showVisual(
        request,
        responseStart === null
          ? position
          : visualPosition(input, replySoFar, responseStart, position, !textCall),
        visualSide(input),
      );
      return 'queued';
    }
    if (name === MAKE_VIDEO.name) {
      makeVideo(readMakeVideo(input), position, replySoFar);
      return 'queued';
    }
    if (name === START_DISCUSSION.name) {
      startDiscussion(readStartDiscussion(input), position);
      return 'started; end your reply now.';
    }
    if (name !== RECORD_TURN.name) throw new Error(`${name} is not a text tool.`);
    recorded = readRecordTurn(input, recorded, hasMedia());
    // Skipped entries (such as a refused video offer) are refusals too; the result names only keys.
    if (recorded.result !== 'recorded') refused(name, {}, recorded.result);
    questioned(recorded.notes.questions);
    return recorded.result;
  };
  // <tool_call> text (the text fallback or a leaked native call) runs once each; nothing goes back to the model.
  const runText = (output) => {
    for (const call of output.calls.slice(ranCalls)) {
      ranCalls++;
      if (call.error)
        refused(call.name, call.input, new Error(`Tool call could not be read: ${call.error}.`));
      else
        try {
          run(
            call.name,
            call.input,
            call.position,
            output.text.slice(0, call.position),
            call.position === output.text.length ? 0 : null,
            true,
          );
        } catch {
          // run logged the refusal; nothing goes back to the model.
        }
    }
  };
  // A record_turn call stands for the verdict and notes blocks.
  const record = (output) =>
    recorded ? { ...output, notes: recorded.notes, verdicts: recorded.verdicts } : output;
  return { run, runText, record };
}
