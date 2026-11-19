// The tool support probe: one tiny non-streamed tool call to a custom endpoint model.
const PING = {
  name: 'ping',
  description: 'Checks that tool calls work.',
  parameters: { type: 'object', properties: { word: { type: 'string' } }, required: ['word'] },
};

// True when a valid call comes back, false when the request with tools is rejected or answered without one.
// Connection, key, missing-model, rate and server failures throw so the next use probes again.
export async function probeTools(post, model) {
  let response;
  try {
    response = await post({
      model,
      stream: false,
      messages: [{ role: 'user', content: 'Call the ping tool with word "ok". Do not reply.' }],
      tools: [{ type: 'function', function: PING }],
    });
  } catch (error) {
    if (error.status >= 400 && error.status < 500 && ![401, 403, 404, 429].includes(error.status))
      return false;
    throw error;
  }
  const call = (await response.json().catch(() => null))?.choices?.[0]?.message?.tool_calls?.[0]
    ?.function;
  try {
    return call.name === 'ping' && typeof JSON.parse(call.arguments)?.word === 'string';
  } catch {
    return false;
  }
}
