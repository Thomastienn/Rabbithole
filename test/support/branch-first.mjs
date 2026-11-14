// Compaction already exposes a completion promise inside the in-process app.
export async function compacted(app, origin, id) {
  await app.settled();
  return (await fetch(`${origin}/api/trees/${id}`)).json();
}
