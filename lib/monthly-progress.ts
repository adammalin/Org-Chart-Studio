// A response can be lost after a server transaction commits. Reconcile from the
// durable queue so retrying cannot get stuck on already accepted proposal IDs.
export function remainingReviewSelection(selected:Set<string>,pendingIds:Iterable<string>):Set<string>{const pending=new Set(pendingIds);return new Set([...selected].filter(id=>pending.has(id)));}
