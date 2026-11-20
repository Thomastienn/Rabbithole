import { SUBMIT_CUT } from './video-cut.mjs';
import { CUT_CHECKS } from './video-plan.mjs';
import { patched } from './patches.mjs';

// A tool-calling writer submits through submit_cut until one submission validates; each error goes back to it.
// validate(code) checks a submission and returns the accepted cut code; failed is this attempt's failed code.
export function cutSubmission(validate, failed, mcp) {
    const submission = { accepted: null, rejected: null, fatal: null };
    let checks = 0;
    submission.tool = {
        tools: [SUBMIT_CUT],
        mcp,
        runTool: async (_name, input) => {
            if (submission.fatal) throw submission.fatal;
            if (submission.accepted !== null) return 'The cut is already accepted; end your turn.';
            if (checks >= CUT_CHECKS) throw new Error('No checks left; end your turn.');
            const diff = typeof input?.patch === 'string',
                base = submission.rejected?.code ?? failed,
                code = diff ? base && patched(base, input.patch) : input?.code;
            if (typeof code !== 'string' || !code.trim())
                throw new Error(
                    diff
                        ? 'patch does not apply; submit the whole source as code.'
                        : 'Submit code, the whole cut source, or patch, a diff of it.',
                );
            checks++;
            try {
                submission.accepted = await validate(code);
            } catch (e) {
                if (e.manimUnavailable) submission.fatal = e;
                submission.rejected = { error: e, code };
                throw e;
            }
            return 'Cut accepted. End your turn.';
        },
    };
    return submission;
}
