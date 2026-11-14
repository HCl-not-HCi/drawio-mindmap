// Topic commands. Each takes ids and text (never the current selection) and runs in a
// single model transaction, so it is exactly one undo step. Keyboard shortcuts, the
// public window.mindmap API and (from M6) the LLM bridge all go through these.
import { snapshot } from './graph-adapter.js';
import { planConversion } from './convert.js';
import { chooseSide, DEFAULT_SPACING, MODES } from './layout.js';
import { DIRECTIONS, navigate } from './navigation.js';
import {
  buildIndex,
  getBranchTopic,
  getChildren,
  getLayoutOptions,
  getParent,
  getSide,
  isRootStyle,
  KEY_BRANCH,
  KEY_EDGE,
  KEY_MINDMAP,
  KEY_ROLE,
  ROLE_ROOT,
  ROLE_TOPIC,
  KEY_H_GAP,
  KEY_LAYOUT,
  KEY_ORDER,
  KEY_ROOT_GAP,
  KEY_SIDE,
  KEY_V_GAP,
  getRootOf,
  getSubtree,
  isTopicStyle,
  planAddChild,
  planAddSibling,
  requireTopic,
  toLayoutTree,
  toOutline,
} from './model.js';
import { setStyleValues } from './style.js';
import { DEFAULT_LABELS, SIZES, edgeStyle, rootStyle, topicStyle } from './styles.js';
import { textToHtml } from './text.js';

/* global mxRectangle */

export function createCommands(graph) {
  const model = graph.getModel();
  const index = () => buildIndex(snapshot(graph));
  const cellOf = (id) => model.getCell(id);

  function transaction(fn) {
    model.beginUpdate();
    try {
      return fn();
    } finally {
      model.endUpdate();
    }
  }

  // First-level topics get a fixed side when created, so branches never jump sides as
  // the map grows: a sibling's side if there is one, else the shorter side.
  function sideFor(idx, parentId, siblingId) {
    if (!isRootStyle(idx.topics.get(parentId).style)) return null;
    const siblingSide = siblingId != null ? getSide(idx.topics.get(siblingId).style) : null;
    return siblingSide ?? chooseSide(toLayoutTree(idx, parentId));
  }

  function insertTopic(plan, label, side) {
    const parentCell = cellOf(plan.parentId);
    const layer = model.getParent(parentCell);
    const { width, height } = SIZES.topic;
    return transaction(() => {
      // Adding to a collapsed topic expands it first, so the new topic is visible.
      if (model.isCollapsed(parentCell)) graph.foldCells(false, false, [parentCell]);
      for (const { id, order } of plan.reorder ?? []) {
        const cell = cellOf(id);
        model.setStyle(cell, setStyleValues(model.getStyle(cell), { [KEY_ORDER]: order }));
      }
      const vertex = graph.insertVertex(
        layer,
        null,
        textToHtml(label ?? DEFAULT_LABELS.topic),
        plan.position.x,
        plan.position.y,
        width,
        height,
        topicStyle(plan.order, side),
      );
      graph.insertEdge(layer, null, '', parentCell, vertex, edgeStyle());
      return vertex.id;
    });
  }

  const commands = {
    /** Creates a new map with a root topic. Defaults to the centre of the visible area. */
    createMindmap({ label = DEFAULT_LABELS.root, x, y } = {}) {
      const { width, height } = SIZES.root;
      const pt =
        x == null || y == null
          ? graph.getCenterInsertPoint(new mxRectangle(0, 0, width, height))
          : { x, y };
      return transaction(
        () =>
          graph.insertVertex(
            graph.getDefaultParent(),
            null,
            textToHtml(label),
            pt.x,
            pt.y,
            width,
            height,
            rootStyle(),
          ).id,
      );
    },

    /** Adds a topic as the last child of `parentId`. Returns the new topic id. */
    addChild(parentId, label) {
      const idx = index();
      const plan = planAddChild(idx, parentId, SIZES.topic);
      return insertTopic(plan, label, sideFor(idx, parentId, null));
    },

    /** Adds a topic directly after `topicId` (on a root: a child). Returns the new id. */
    addSibling(topicId, label) {
      const idx = index();
      const plan = planAddSibling(idx, topicId, SIZES.topic);
      const sibling = plan.parentId === topicId ? null : topicId;
      return insertTopic(plan, label, sideFor(idx, plan.parentId, sibling));
    },

    /**
     * Moves a topic (with its subtree) under `parentId`, before sibling `beforeId` or at
     * the end. Also reorders within the same parent. On the root level, `side` picks the
     * side (default: the topic's current side, or the shorter one). One undo step.
     * @param {{beforeId?: string|null, side?: 'left'|'right'|null}} [options]
     */
    moveTopic(topicId, parentId, { beforeId = null, side = null } = {}) {
      const idx = index();
      requireTopic(idx, topicId);
      requireTopic(idx, parentId);
      const oldParent = getParent(idx, topicId);
      if (oldParent == null && isRootStyle(idx.topics.get(topicId).style)) {
        throw new Error(`Cannot move a central topic: ${topicId}`);
      }
      if (getSubtree(idx, topicId).topicIds.includes(parentId)) {
        throw new Error(`Cannot move a topic into its own subtree: ${topicId}`);
      }
      const siblings = getChildren(idx, parentId).filter((id) => id !== topicId);
      if (beforeId != null && !siblings.includes(beforeId)) {
        throw new Error(`Not a child of ${parentId}: ${beforeId}`);
      }
      if (side != null && side !== 'left' && side !== 'right') {
        throw new Error(`Unknown side: ${side}`);
      }
      const order = [...siblings];
      order.splice(beforeId == null ? order.length : order.indexOf(beforeId), 0, topicId);

      const toRoot = isRootStyle(idx.topics.get(parentId).style);
      const cell = cellOf(topicId);
      const parentCell = cellOf(parentId);
      transaction(() => {
        if (model.isCollapsed(parentCell)) graph.foldCells(false, false, [parentCell]);
        if (oldParent == null) {
          // A detached topic (e.g. a pasted branch without its map) gets attached.
          graph.insertEdge(model.getParent(parentCell), null, '', parentCell, cell, edgeStyle());
        } else if (oldParent !== parentId) {
          model.setTerminal(cellOf(idx.parentOf.get(topicId).edgeId), parentCell, true);
        }
        order.forEach((id, i) => {
          const c = cellOf(id);
          const style = model.getStyle(c);
          const next = setStyleValues(style, { [KEY_ORDER]: i });
          if (next !== style) model.setStyle(c, next);
        });
        // Side and branch color only exist on the first level.
        const values = toRoot
          ? {
              [KEY_SIDE]:
                side ??
                (oldParent === parentId ? getSide(model.getStyle(cell)) : null) ??
                chooseSide(toLayoutTree(idx, parentId)),
              ...(oldParent === parentId ? {} : { [KEY_BRANCH]: null }),
            }
          : { [KEY_SIDE]: null, [KEY_BRANCH]: null };
        model.setStyle(cell, setStyleValues(model.getStyle(cell), values));
      });
    },

    /**
     * Turns selected shapes and connectors into a mindmap (see convert.js for the rules).
     * Shapes keep their look; the mindmap styles, colors and layout are applied on top.
     * Returns the root id.
     * @param {string[]} cellIds shapes to convert (connectors between them are included)
     */
    convertToMindmap(cellIds) {
      const cells = snapshot(graph);
      const already = cells.filter(
        (c) => cellIds.includes(c.id) && c.vertex && isTopicStyle(c.style),
      );
      if (already.length > 0) throw new Error('The selection is already part of a mindmap.');
      const plan = planConversion(cells, cellIds);
      const restyle = (id, values) => {
        const cell = cellOf(id);
        model.setStyle(cell, setStyleValues(model.getStyle(cell), values));
      };
      transaction(() => {
        restyle(plan.rootId, {
          [KEY_MINDMAP]: 1,
          [KEY_ROLE]: ROLE_ROOT,
          [KEY_ORDER]: null,
          [KEY_SIDE]: null,
          whiteSpace: 'wrap',
        });
        for (const t of plan.topics) {
          restyle(t.id, {
            [KEY_MINDMAP]: 1,
            [KEY_ROLE]: ROLE_TOPIC,
            [KEY_ORDER]: t.order,
            [KEY_SIDE]: t.side,
            whiteSpace: 'wrap',
          });
        }
        for (const e of plan.edges) {
          const edge = cellOf(e.id);
          if (e.flip) {
            const source = model.getTerminal(edge, true);
            const target = model.getTerminal(edge, false);
            model.setTerminal(edge, target, true);
            model.setTerminal(edge, source, false);
          }
          restyle(e.id, { [KEY_EDGE]: 1 });
        }
      });
      return plan.rootId;
    },

    /** Deletes the topic and its subtree. Deleting a root deletes the whole map. */
    deleteTopic(topicId) {
      return commands.deleteTopics([topicId]);
    },

    /**
     * Deletes several topics with their subtrees in one step (overlaps are fine).
     * Returns the deleted ids and the nearest surviving parent of the first topic.
     */
    deleteTopics(topicIds) {
      const idx = index();
      const topics = new Set();
      const edges = new Set();
      for (const id of topicIds) {
        const sub = getSubtree(idx, id);
        sub.topicIds.forEach((t) => topics.add(t));
        sub.edgeIds.forEach((e) => edges.add(e));
      }
      let parentId = topicIds.length > 0 ? getParent(idx, topicIds[0]) : null;
      while (parentId != null && topics.has(parentId)) parentId = getParent(idx, parentId);
      transaction(() => {
        graph.removeCells([...edges, ...topics].map(cellOf), true);
      });
      return { deleted: [...topics], parentId };
    },

    renameTopic(topicId, label) {
      requireTopic(index(), topicId);
      transaction(() => graph.labelChanged(cellOf(topicId), textToHtml(label)));
    },

    /** Outline of the map that contains `topicId` (default: the only map on the page). */
    getMindmap(topicId) {
      const idx = index();
      let rootId;
      if (topicId != null) rootId = getRootOf(idx, topicId);
      else if (idx.roots.length === 1) rootId = idx.roots[0];
      else throw new Error(`Page has ${idx.roots.length} mindmaps; pass a topic id`);
      return toOutline(idx, rootId);
    },

    listMindmaps() {
      const idx = index();
      return idx.roots.map((id) => ({ id, label: idx.topics.get(id).label }));
    },

    /**
     * Collapses or expands topics (draw.io tree folding: descendants are hidden, the
     * diagram stays a normal draw.io file). Topics without children are ignored.
     */
    setCollapsed(topicIds, collapsed) {
      const idx = index();
      const cells = topicIds
        .filter((id) => requireTopic(idx, id) && getChildren(idx, id).length > 0)
        .map(cellOf)
        .filter((cell) => model.isCollapsed(cell) !== collapsed);
      if (cells.length > 0) transaction(() => graph.foldCells(collapsed, false, cells));
    },

    /** Collapses the topics if any of them is expanded, otherwise expands them. */
    toggleCollapsed(topicIds) {
      const idx = index();
      const foldable = topicIds.filter(
        (id) => requireTopic(idx, id) && getChildren(idx, id).length > 0,
      );
      const anyExpanded = foldable.some((id) => !model.isCollapsed(cellOf(id)));
      commands.setCollapsed(foldable, anyExpanded);
    },

    /**
     * Moves the first-level branches containing the given topic(s) to a side of the map,
     * in one step. Returns the branch topic ids (roots are skipped).
     * @param {string | string[]} topicIds
     */
    setSide(topicIds, side) {
      if (side !== 'left' && side !== 'right') throw new Error(`Unknown side: ${side}`);
      const idx = index();
      const ids = Array.isArray(topicIds) ? topicIds : [topicIds];
      const branches = [...new Set(ids.map((id) => getBranchTopic(idx, id)))].filter(Boolean);
      transaction(() => {
        for (const branch of branches) {
          const cell = cellOf(branch);
          model.setStyle(cell, setStyleValues(model.getStyle(cell), { [KEY_SIDE]: side }));
        }
      });
      return branches;
    },

    /** Layout options of the map containing `topicId`: {mode, spacing}. */
    getLayoutOptions(topicId) {
      const idx = index();
      const rootId = getRootOf(idx, topicId);
      return getLayoutOptions(idx.topics.get(rootId).style, {
        mode: 'balanced',
        spacing: DEFAULT_SPACING,
      });
    },

    /**
     * Sets layout options of the map containing `topicId` (stored on its root topic).
     * @param {{mode?: 'balanced'|'right'|'left', spacing?: {rootGap?, hGap?, vGap?}}} options
     */
    setLayoutOptions(topicId, { mode, spacing = {} } = {}) {
      if (mode != null && !MODES.includes(mode)) throw new Error(`Unknown layout mode: ${mode}`);
      for (const [k, v] of Object.entries(spacing)) {
        if (!(k in DEFAULT_SPACING) || !Number.isFinite(v) || v < 0) {
          throw new Error(`Invalid spacing: ${k}=${v}`);
        }
      }
      const rootCell = cellOf(getRootOf(index(), topicId));
      const values = {};
      if (mode != null) values[KEY_LAYOUT] = mode === 'balanced' ? null : mode;
      if (spacing.rootGap != null) values[KEY_ROOT_GAP] = spacing.rootGap;
      if (spacing.hGap != null) values[KEY_H_GAP] = spacing.hGap;
      if (spacing.vGap != null) values[KEY_V_GAP] = spacing.vGap;
      transaction(() => model.setStyle(rootCell, setStyleValues(model.getStyle(rootCell), values)));
    },

    /** Neighbouring topic in a direction ('left' | 'right' | 'up' | 'down'), or null. */
    getAdjacentTopic(topicId, direction) {
      if (!DIRECTIONS.includes(direction)) throw new Error(`Unknown direction: ${direction}`);
      return navigate(index(), topicId, direction);
    },

    /** Ids of the selected topics (non-topic cells in the selection are ignored). */
    getSelectedTopics() {
      return graph
        .getSelectionCells()
        .filter((c) => commands.isTopic(c))
        .map((c) => c.id);
    },

    /** Selects one topic (not an undoable change). */
    selectTopic(topicId) {
      requireTopic(index(), topicId);
      const cell = cellOf(topicId);
      graph.setSelectionCell(cell);
      graph.scrollCellToVisible(cell);
    },

    isTopic(cell) {
      return cell != null && model.isVertex(cell) && isTopicStyle(model.getStyle(cell));
    },
  };
  return commands;
}
