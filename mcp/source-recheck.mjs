const relationshipReviewFields = new Set([
  "relationshipType",
  "sourceLocator",
  "sourceCertainty",
  "reviewNote",
]);

function jsonEqual(left, right) {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

function assertSameIds(label, currentItems, proposedItems) {
  if (currentItems.length !== proposedItems.length) {
    throw new Error(`A source recheck cannot add or remove ${label}. Use a normal chart proposal instead.`);
  }
  const currentIds = [...currentItems.map((item) => item.id)].sort();
  const proposedIds = [...proposedItems.map((item) => item.id)].sort();
  if (!jsonEqual(currentIds, proposedIds)) {
    throw new Error(`A source recheck cannot replace ${label}. Use a normal chart proposal instead.`);
  }
}

function requireReviewMetadata(entityLabel, value) {
  if (value.sourceCertainty !== "needs_review") {
    throw new Error(`${entityLabel} changed during a source recheck but was not placed in the Source review queue.`);
  }
  if (!String(value.sourceLocator ?? "").trim()) {
    throw new Error(`${entityLabel} needs a precise source locator before it can be staged for source review.`);
  }
  if (!String(value.reviewNote ?? "").trim()) {
    throw new Error(`${entityLabel} needs an actionable review note before it can be staged for source review.`);
  }
}

export function validateSourceRecheckProposal({
  current,
  proposed,
  reviewedSourceChecksums,
}) {
  if (!current || !proposed || current.id !== proposed.id) {
    throw new Error("The source recheck must target the currently read chart.");
  }
  if (current.version !== proposed.version || current.updatedAt !== proposed.updatedAt) {
    throw new Error("The working chart changed after it was read. Prepare a fresh source recheck.");
  }
  for (const field of ["name", "description", "status", "createdAt"]) {
    if (!jsonEqual(current[field], proposed[field])) {
      throw new Error(`A source recheck cannot change chart ${field}. Use a normal chart proposal instead.`);
    }
  }
  if (!jsonEqual(current.lifecycle, proposed.lifecycle) || !jsonEqual(current.sources, proposed.sources)) {
    throw new Error("A source recheck must preserve lifecycle and retained-source records.");
  }

  const expectedChecksums = [...new Set((current.sources ?? []).map((source) => source.checksum).filter(Boolean))].sort();
  const reviewedChecksums = [...new Set((reviewedSourceChecksums ?? []).filter(Boolean))].sort();
  if (!expectedChecksums.length || !jsonEqual(expectedChecksums, reviewedChecksums)) {
    throw new Error("Pass the exact sourceChecksums returned by extract_chart_sources before staging a source recheck.");
  }

  assertSameIds("cards", current.nodes, proposed.nodes);
  assertSameIds("reporting lines", current.edges, proposed.edges);
  const proposedNodes = new Map(proposed.nodes.map((node) => [node.id, node]));
  const proposedEdges = new Map(proposed.edges.map((edge) => [edge.id, edge]));
  const changedNodeIds = [];
  const changedEdgeIds = [];

  for (const previous of current.nodes) {
    const next = proposedNodes.get(previous.id);
    if (
      previous.type !== next.type ||
      !jsonEqual(previous.position, next.position) ||
      Boolean(previous.data?.pinned) !== Boolean(next.data?.pinned)
    ) {
      throw new Error("A source recheck must preserve card layout and pins.");
    }
    const previousOtherData = { ...previous.data, unit: undefined, pinned: undefined };
    const nextOtherData = { ...next.data, unit: undefined, pinned: undefined };
    if (!jsonEqual(previousOtherData, nextOtherData)) {
      throw new Error("A source recheck must preserve non-source card presentation data.");
    }
    if (!jsonEqual(previous.data?.unit, next.data?.unit)) {
      if (previous.data?.unit?.id !== next.data?.unit?.id) {
        throw new Error("A source recheck cannot replace stable unit IDs.");
      }
      requireReviewMetadata(`Card ${next.id}`, next.data.unit);
      changedNodeIds.push(next.id);
    }
  }

  for (const previous of current.edges) {
    const next = proposedEdges.get(previous.id);
    if (
      previous.source !== next.source ||
      previous.target !== next.target ||
      previous.type !== next.type
    ) {
      throw new Error("A source recheck cannot rewire reporting lines. Use a normal chart proposal instead.");
    }
    const previousData = previous.data ?? {};
    const nextData = next.data ?? {};
    const allKeys = new Set([...Object.keys(previousData), ...Object.keys(nextData)]);
    const changedFields = [...allKeys].filter(
      (field) => !jsonEqual(previousData[field], nextData[field]),
    );
    if (changedFields.some((field) => !relationshipReviewFields.has(field))) {
      throw new Error("A source recheck must preserve connector routes and presentation data.");
    }
    if (changedFields.length) {
      requireReviewMetadata(`Reporting line ${next.id}`, nextData);
      changedEdgeIds.push(next.id);
    }
  }

  if (!changedNodeIds.length && !changedEdgeIds.length) {
    throw new Error("The source recheck did not identify any reviewable changes.");
  }
  return { changedNodeIds, changedEdgeIds };
}
