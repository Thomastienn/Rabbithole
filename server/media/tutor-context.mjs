import { modelMessage } from '../attachments.mjs';
import { discussionText } from './discussion-context.mjs';
import { readSaved } from './video-workspace.mjs';

// A ready video's narration script as plain text; its cut code and plan details stay private.
const narration = (source) =>
    readSaved(source)
        ?.plan?.cuts?.map((c) => c.narration)
        .join('\n\n') ?? '';

export function tutorContext(tree) {
    const { artifacts = [], suggestions, briefs, ...context } = tree; // suggestions and brief explanations never reach the tutor
    return {
        ...context,
        messages: tree.messages.map(modelMessage).map((message) => {
            const discussions = artifacts.filter(
                (a) =>
                    a.message === message.id &&
                    a.conversation === tree.id &&
                    a.kind === 'discussion' &&
                    a.status === 'ready',
            );
            const ready = artifacts
                .filter(
                    (a) =>
                        a.message === message.id &&
                        a.conversation === tree.id &&
                        a.status === 'ready',
                )
                .filter((a) => a.kind !== 'discussion');
            if (discussions.length)
                message = {
                    ...message,
                    text: message.text + discussions.map(discussionText).join(''),
                };
            return ready.length
                ? {
                      ...message,
                      text:
                          message.text +
                          '\nReady ' +
                          (ready.every((a) => a.kind === 'mermaid') ? 'diagrams' : 'artifacts') +
                          ' (artifact metadata): ' +
                          JSON.stringify(
                              ready.map(({ id, kind, title, description, source }) =>
                                  kind === 'video'
                                      ? {
                                            id,
                                            kind,
                                            title,
                                            description,
                                            narration: narration(source),
                                        }
                                      : { id, title, description },
                              ),
                          ),
                  }
                : message;
        }),
    };
}
