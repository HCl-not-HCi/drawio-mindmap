// Topic commands. Each takes ids and text (never the current selection) and runs in a
// single model transaction, so it is exactly one undo step. Keyboard shortcuts, the
// public window.mindmap API and (from M6) the LLM bridge all go through these.
import { snapshot } from './graph-adapter.js';
import {
  buildIndex,
  getParent,
  getRootOf,
  getSubtree,
  isTopicStyle,
  KEY_ORDER,
  planAddChild,
  planAddSibling,
  requireTopic,
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

  function insertTopic(plan, label) {
    const parentCell = cellOf(plan.parentId);
    const layer = model.getParent(parentCell);
    const { width, height } = SIZES.topic;
    return transaction(() => {
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
        topicStyle(plan.order),
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
      return insertTopic(planAddChild(index(), parentId, SIZES.topic), label);
    },

    /** Adds a topic directly after `topicId` (on a root: a child). Returns the new id. */
    addSibling(topicId, label) {
      return insertTopic(planAddSibling(index(), topicId, SIZES.topic), label);
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
