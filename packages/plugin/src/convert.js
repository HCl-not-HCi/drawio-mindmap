// Converting a selection of shapes and connectors into a mindmap. Pure, on snapshot cells.
//
// Root: the shape at the graph's centre (smallest maximum distance to all others), since
// a hand-drawn map has its central topic in the middle. Ties go to shapes without an
// incoming connector, then to the most connected one. The tree is a
// breadth-first search over connectors in either direction; connectors pointing towards
// the root are flipped. Connectors that would close a cycle stay normal connectors.
// Sibling order follows vertical position; first-level sides follow the drawing.

/**
 * @param {object[]} cells snapshot cells (see graph-adapter.js)
 * @param {string[]} selectedIds selected cell ids (shapes; connectors between them are
 *   included automatically)
 * @returns {{rootId: string, topics: {id, parentId, order, side}[],
 *            edges: {id, flip: boolean}[]}}
 */
export function planConversion(cells, selectedIds) {
  const selected = new Set(selectedIds);
  const vertices = cells.filter((c) => c.vertex && selected.has(c.id) && c.geometry != null);
  if (vertices.length === 0) throw new Error('Select the shapes to convert first.');
  const vertexIds = new Set(vertices.map((v) => v.id));
  const edges = cells.filter(
    (c) => c.edge && vertexIds.has(c.source) && vertexIds.has(c.target) && c.source !== c.target,
  );

  const incoming = new Map(vertices.map((v) => [v.id, 0]));
  const degree = new Map(vertices.map((v) => [v.id, 0]));
  const adjacent = new Map(vertices.map((v) => [v.id, []]));
  for (const e of edges) {
    incoming.set(e.target, incoming.get(e.target) + 1);
    degree.set(e.source, degree.get(e.source) + 1);
    degree.set(e.target, degree.get(e.target) + 1);
    adjacent.get(e.source).push({ edge: e, other: e.target });
    adjacent.get(e.target).push({ edge: e, other: e.source });
  }

  // Eccentricity: longest shortest path (in hops, ignoring direction) from a shape.
  const eccentricity = (start) => {
    const dist = new Map([[start, 0]]);
    const queue = [start];
    let max = 0;
    while (queue.length > 0) {
      const current = queue.shift();
      for (const { other } of adjacent.get(current)) {
        if (dist.has(other)) continue;
        dist.set(other, dist.get(current) + 1);
        max = Math.max(max, dist.get(other));
        queue.push(other);
      }
    }
    return dist.size === vertices.length ? max : Infinity;
  };
  const rank = (v) => [eccentricity(v.id), incoming.get(v.id) === 0 ? 0 : 1, -degree.get(v.id)];
  const better = (a, b) => {
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i];
    return false;
  };
  let root = vertices[0];
  let best = rank(root);
  for (const v of vertices.slice(1)) {
    const r = rank(v);
    if (better(r, best)) {
      root = v;
      best = r;
    }
  }
  const rootId = root.id;

  const parentOf = new Map([[rootId, null]]);
  const treeEdges = [];
  const queue = [rootId];
  while (queue.length > 0) {
    const current = queue.shift();
    for (const { edge, other } of adjacent.get(current)) {
      if (parentOf.has(other)) continue;
      parentOf.set(other, current);
      treeEdges.push({ id: edge.id, flip: edge.source !== current });
      queue.push(other);
    }
  }
  if (parentOf.size !== vertices.length) {
    throw new Error('The selection must be one connected tree of shapes and connectors.');
  }

  const byId = new Map(vertices.map((v) => [v.id, v]));
  const centerX = (id) => byId.get(id).geometry.x + byId.get(id).geometry.width / 2;
  const centerY = (id) => byId.get(id).geometry.y + byId.get(id).geometry.height / 2;
  const children = new Map();
  for (const [id, parent] of parentOf) {
    if (parent == null) continue;
    if (!children.has(parent)) children.set(parent, []);
    children.get(parent).push(id);
  }
  const topics = [];
  for (const [parent, list] of children) {
    list.sort((a, b) => centerY(a) - centerY(b));
    list.forEach((id, order) =>
      topics.push({
        id,
        parentId: parent,
        order,
        side: parent === rootId ? (centerX(id) < centerX(rootId) ? 'left' : 'right') : null,
      }),
    );
  }
  return { rootId, topics, edges: treeEdges };
}
