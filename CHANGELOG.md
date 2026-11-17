# Changelog

All notable changes to this project. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

## 1.1.0 – 2026-11-17

### Added

- **Import** Markdown (headings and nested lists, or indented text), OPML and FreeMind/Freeplane `.mm` files as new maps: Extras → Mindmap → Import from File.
- **Export** a map as Markdown, OPML or FreeMind: Extras → Mindmap → Export as. FreeMind keeps sides and collapsed branches.
- **Paste outline:** pasting indented text or a Markdown list while a topic is selected adds the lines as child topics.
- API: `importOutline`, `importText`, `exportMindmap`; outlines from `getMindmap` include `side` on first-level topics.
- **Live LLM control:** an MCP server (`packages/mcp-server`) lets an LLM in Claude Code, Claude Desktop or another MCP client read and edit the mindmap open in draw.io, live. Tools: `list_windows`, `get_mindmap`, `get_selection`, `add_topics`, `rename_topic`, `move_topic`, `delete_topic`, `insert_outline`. Every change is one undo step. Off by default; turn it on with Extras → Mindmap → Live LLM Control. Local-only, origin-checked and token-protected. Several MCP server processes (e.g. Claude Desktop's chat and Cowork pools, plus Claude Code) share the bridge: the first owns the port, the others relay through it and take over if it exits.

### Removed

- The M0 WebSocket test (Extras → Mindmap → Test WebSocket connection) and `window.mindmap.spike`, replaced by live LLM control.

## 1.0.0 – 2026-11-14

### Added

- **Branch colors and level styles:** each first-level branch gets its own color (topics and connectors), with distinct styles for the central topic, the first level and deeper levels. Colors adapt to draw.io's light and dark theme. Manual color changes are kept until a topic changes branch or level.
- **Collapse / expand** with draw.io's +/- toggle or Ctrl+. (⌘.). Uses draw.io's own tree folding, so it also works without the plugin.
- **Drag and drop:** drop a topic onto another to make it a child, among its siblings to reorder, or across the central topic to switch sides. Pasted branches can be attached by dropping them onto a topic.
- **Side control:** Ctrl+←/→ (⌘←/→) moves a branch to the left or right side.
- **Layout options** per map: both sides, right only, left only; compact, normal or wide spacing (Extras → Mindmap → Layout).
- **Convert Selection to Mindmap:** adopts a hand-drawn tree of shapes and connectors.
- API: `moveTopic`, `setSide`, `setCollapsed`, `toggleCollapsed`, `getLayoutOptions`, `setLayoutOptions`, `convertToMindmap`.

### Changed

- Arrow keys skip the children of collapsed topics.
- Moving a topic slightly is now a reorder when it lands among its siblings (it used to snap back).

### Fixed

- Copying a branch without its central topic left unattached topics; they can now be dropped onto a topic.

### Known limitations

- Manual position and size changes to topics are reverted by the layout (by design). Several maps on one page are laid out independently and can overlap.
- draw.io's Alt+Shift+Arrow ("clone and connect") on a topic creates a copy that isn't part of the tree.
- draw.io Desktop is not supported.

## 0.1.0 – 2026-11-14

First MVP release, for self-hosted draw.io (Docker image `jgraph/drawio:32.6.10`).

### Added

- **New mindmap** via Extras → Mindmap → New Mindmap or Alt+Shift+M (⌥⇧M): a central topic at the centre of the view, ready for typing.
- **Keyboard editing:** Tab adds a child, Enter adds a sibling (on the central topic: a child), Delete/Backspace removes a topic with its subtree, F2 or typing edits a label. Enter or Esc finish editing, Shift+Enter adds a line break, and Tab while editing finishes and adds a child.
- **Arrow-key navigation:** Left/Right move between parents and children following the side of the map, Up/Down between siblings.
- **Automatic layout:** balanced two-sided layout around the central topic, re-run after every change. Topics fit their labels and long labels wrap. First-level branches keep their side.
- **Curved connectors** that attach on the side facing the parent.
- **Single undo step** per action, including the layout it causes.
- **`window.mindmap` API** with the same commands by topic id (`createMindmap`, `addChild`, `addSibling`, `deleteTopic(s)`, `renameTopic`, `getMindmap`, `listMindmaps`, `getAdjacentTopic`, `getSelectedTopics`, `selectTopic`).
- Mindmaps are plain draw.io diagrams: all metadata lives in cell styles (`mindmap=1`, `mmRole`, `mmOrder`, `mmSide`, `mmEdge`), so files open and render without the plugin.

### Known limitations

- Copying part of a map (without its central topic) pastes topics that aren't attached to a map; they are not laid out. Copying a whole map works. Pasting into a topic comes with drag-to-reparent in v1.0.
- Manual position and size changes to topics are reverted by the layout (by design, see D11). Several maps on one page are laid out independently and can overlap.
- draw.io's Alt+Shift+Arrow ("clone and connect") on a topic creates a copy that isn't part of the tree.
- draw.io Desktop is not supported (it no longer loads external plugins, see D5).
