export function discussionText(artifact) {
  const data = JSON.parse(artifact.source);
  const content = data.closed
    ? (data.summary ?? 'Closed discussion; context preparation is pending.')
    : JSON.stringify({
        classmates: data.classmates.map((c) => c.name),
        lines: data.lines.map(({ speaker, text }) => ({ speaker, text })),
      });
  return `\n[Discussion: ${content}]\n`;
}
