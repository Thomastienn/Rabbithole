// The stats panel's figures (from GET /api/graph/stats) and the activity heatmap's day grid.
export type Stats = {
    since: number | null;
    growth: { at: number; met: number; known: number }[];
    topics: { name: string; familiarity: number; concepts: number }[];
    fading: { name: string; until: number }[];
    // place: the message's conversation, for its address chip; null when the message is gone.
    misconceptions: {
        name: string;
        at: number;
        text: string;
        cleared: number | null;
        place: { root: string; address: string; ink: number } | null;
    }[];
    // day is the local date as YYYY-MM-DD.
    activity: { day: string; messages: number }[];
};

export const HEAT_WEEKS = 26;
const pad = (n: number) => String(n).padStart(2, '0');
const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
// Shade steps for 1-2, 3-5, 6-9 and 10 or more messages.
const heat = (n: number) => (n === 0 ? 0 : n <= 2 ? 1 : n <= 5 ? 2 : n <= 9 ? 3 : 4);

// Every day from the Sunday HEAT_WEEKS - 1 weeks before this week's to today, Sunday first.
export function heatDays(activity: Stats['activity'], today: Date) {
    const counts = new Map(activity.map((a) => [a.day, a.messages]));
    const days = [];
    for (
        const d = new Date(
            today.getFullYear(),
            today.getMonth(),
            today.getDate() - today.getDay() - (HEAT_WEEKS - 1) * 7,
        );
        d <= today;
        d.setDate(d.getDate() + 1)
    ) {
        const messages = counts.get(dayKey(d)) ?? 0;
        days.push({ date: new Date(d), messages, level: heat(messages) });
    }
    return days;
}
