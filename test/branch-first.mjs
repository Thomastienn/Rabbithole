// Branch-first: POST /branches returns before background compaction; poll state until this child's compaction settles.
export async function compacted(origin, id) {
  while ((await (await fetch(`${origin}/api/state`)).json()).compacting.includes(id)) await new Promise(resolve => setTimeout(resolve, 5));
  return (await fetch(`${origin}/api/trees/${id}`)).json();
}
