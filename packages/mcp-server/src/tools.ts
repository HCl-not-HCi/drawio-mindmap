// MCP tools: topic-level operations on the mindmap open in draw.io. The LLM never deals
// with shapes or coordinates; every change runs through the plugin's normal commands, so
// layout, colors and undo (one step per call) behave exactly as with the keyboard.
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { WindowBridge } from './link.js';

type ToolResult = { content: { type: 'text'; text: string }[]; isError?: boolean };

const ok = (value: unknown): ToolResult => ({
  content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
});
const fail = (error: unknown): ToolResult => ({
  content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }],
  isError: true,
});

const windowId = z
  .string()
  .optional()
  .describe('Target window from list_windows. Only needed when several windows are connected.');
const topicId = (what: string) => z.string().min(1).describe(`Id of ${what} (from get_mindmap).`);
const label = z.string().min(1).max(2000);

export function registerTools(server: McpServer, bridge: WindowBridge): void {
  const call = async (window: string | undefined, method: string, params: unknown) => {
    try {
      return ok(await bridge.request(window, method, params));
    } catch (e) {
      return fail(e);
    }
  };

  server.registerTool(
    'list_windows',
    {
      title: 'List draw.io windows',
      description:
        'Lists the draw.io windows that have Live LLM Control turned on. Use the window_id with ' +
        'the other tools when more than one window is connected.',
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () =>
      ok(
        (await bridge.windows()).map((w) => ({
          window_id: w.windowId,
          title: w.title,
          connected_at: w.connectedAt,
        })),
      ),
  );

  server.registerTool(
    'get_mindmap',
    {
      title: 'Read a mindmap',
      description:
        'Returns a mindmap as an outline: {id, label, children, side?, collapsed?}. Topic ids ' +
        'are needed by all editing tools. Without topic_id, returns the only mindmap on the ' +
        'current page, or lists the mindmaps if there are several.',
      inputSchema: {
        topic_id: z.string().optional().describe('Any topic of the mindmap to read.'),
        window_id: windowId,
      },
      annotations: { readOnlyHint: true },
    },
    async (args) => call(args.window_id, 'getMindmap', { topicId: args.topic_id ?? null }),
  );

  server.registerTool(
    'get_selection',
    {
      title: 'Read the selection',
      description:
        "Returns the topics the user has selected ({id, label}[]), e.g. to act on 'this topic'.",
      inputSchema: { window_id: windowId },
      annotations: { readOnlyHint: true },
    },
    async (args) => call(args.window_id, 'getSelection', {}),
  );

  server.registerTool(
    'add_topics',
    {
      title: 'Add topics',
      description:
        'Adds one or more topics as the last children of a topic, in one undo step. Returns ' +
        'the new topic ids in order.',
      inputSchema: {
        parent_id: topicId('the parent topic'),
        labels: z.array(label).min(1).max(100).describe('Labels of the new topics, in order.'),
        window_id: windowId,
      },
    },
    async (args) =>
      call(args.window_id, 'addTopics', { parentId: args.parent_id, labels: args.labels }),
  );

  server.registerTool(
    'rename_topic',
    {
      title: 'Rename a topic',
      description: 'Changes the label of a topic.',
      inputSchema: { topic_id: topicId('the topic'), label, window_id: windowId },
      annotations: { idempotentHint: true },
    },
    async (args) =>
      call(args.window_id, 'renameTopic', { topicId: args.topic_id, label: args.label }),
  );

  server.registerTool(
    'move_topic',
    {
      title: 'Move a topic',
      description:
        'Moves a topic with its subtree under another topic (last child, or before ' +
        'before_id), or reorders it among its siblings. The central topic cannot be moved.',
      inputSchema: {
        topic_id: topicId('the topic to move'),
        new_parent_id: topicId('the new parent topic'),
        before_id: z
          .string()
          .optional()
          .describe('A child of new_parent_id to insert before. Default: last.'),
        window_id: windowId,
      },
    },
    async (args) =>
      call(args.window_id, 'moveTopic', {
        topicId: args.topic_id,
        parentId: args.new_parent_id,
        beforeId: args.before_id ?? null,
      }),
  );

  server.registerTool(
    'delete_topic',
    {
      title: 'Delete a topic',
      description:
        'Deletes a topic and its whole subtree (deleting the central topic deletes the map). ' +
        'The user can undo it in draw.io.',
      inputSchema: { topic_id: topicId('the topic'), window_id: windowId },
      annotations: { destructiveHint: true },
    },
    async (args) => call(args.window_id, 'deleteTopic', { topicId: args.topic_id }),
  );

  server.registerTool(
    'insert_outline',
    {
      title: 'Insert an outline',
      description:
        'Inserts a whole outline written as a Markdown list (nested by indentation) or ' +
        'headings, in one undo step. With parent_id, every top-level item becomes a child ' +
        'of that topic; without it, a new mindmap is created (one top-level item = central ' +
        'topic). Returns the ids of the inserted top-level topics.',
      inputSchema: {
        markdown: z.string().min(1).max(200_000),
        parent_id: z.string().optional().describe('Topic to insert under (from get_mindmap).'),
        window_id: windowId,
      },
    },
    async (args) =>
      call(args.window_id, 'insertOutline', {
        markdown: args.markdown,
        parentId: args.parent_id ?? null,
      }),
  );
}
