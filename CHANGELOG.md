# Changelog

All notable changes to this project. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

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
