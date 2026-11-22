import { modelMessage } from '../attachments.mjs';
import { discussionText } from './discussion-context.mjs';

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
                              ready.map(({ id, kind, title, description }) =>
                                  kind === 'video'
                                      ? { id, kind, title, description }
                                      : { id, title, description },
                              ),
                          ),
                  }
                : message;
        }),
    };
}
