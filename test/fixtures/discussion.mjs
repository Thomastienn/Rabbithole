export const discussion = {
  classmates: [
    { name: 'Maya', level: 'near', voice: 'Chill, asks short follow-ups, thinks out loud.' },
    { name: 'Theo', level: 'below', voice: 'Blunt, a bit sceptical, reasons from everyday stuff.' },
    { name: 'Jun', level: 'above', voice: 'Dry humour, lowercase, jumps to mechanisms.' },
  ],
  lines: [
    { speaker: 'Theo', text: 'Is the fungus a parasite the plant puts up with?' },
    { speaker: 'Maya', text: 'The plant gets phosphorus back. Jun, is that a fair trade?' },
    { speaker: 'Jun', text: 'Thin hyphae reach soil that roots cannot.' },
    { speaker: 'Tutor', text: 'What do you think makes the trade useful to the plant?' },
  ],
};
export const publicDiscussion = {
  classmates: discussion.classmates.map((c) => c.name),
  lines: discussion.lines,
};
export const discussionBlock = (value = discussion) =>
  '\n```rabbithole-discussion\n' + JSON.stringify(value) + '\n```';
