// The JSON task a background model call carries after its instructions, or null for a learner's text.
// Fakes that see only the wire (no role) tell calls apart by its fields.
export const taskOf = (text) => {
    try {
        return JSON.parse(text.slice(text.indexOf('{')));
    } catch {
        return null;
    }
};
