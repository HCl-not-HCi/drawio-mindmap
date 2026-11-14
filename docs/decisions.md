# Decisions and findings

Decisions made during implementation that refine or change [PLAN.md](PLAN.md). Newest last.

## D1 – Pinned versions (M0, 2026-11-13)

- **Node.js 26 LTS** (26.13.1 at the start of M0), recorded in `.nvmrc` and the dev container image `javascript-node:26-bookworm`.
- **draw.io 32.6.10** (`jgraph/drawio:32.6.10`, released 2026-11-04), recorded in `docker-compose.yml`. draw.io Desktop 32.6.10 is the matching release, but see D5.
- Tool versions are pinned exactly in `package.json`. npm 11 requires install scripts to be approved; `esbuild` is approved via `allowScripts`.

## D2 – Load the plugin with `?p=mindmap` via a registry entry (M0)

Findings for `jgraph/drawio:32.6.10`:

- Custom (non built-in) plugins only load when `window.ALLOW_CUSTOM_PLUGINS` is true, and the entrypoint has no environment variable for it.
- Even with it set, adding a custom plugin through **Extras → Plugins → Custom…** is broken: the URL dialog closes itself and its callback then calls `hideDialog()` a second time, which closes the Plugins dialog before **Apply**, so nothing is saved. (Upstream bug; worth reporting to jgraph/drawio.)

**Decision:** mount our own `js/PostConfig.js` (`docker/drawio/PostConfig.js`): the image's original file plus one line that registers the plugin as `App.pluginRegistry.mindmap = 'plugins/custom/mindmap.js'`. The plugin then loads with **`http://localhost:8080/?p=mindmap`**, with no per-browser setup and without `ALLOW_CUSTOM_PLUGINS`. This replaces the one-time "Extras → Plugins → Add" step from PLAN §4.

`PostConfig.js` is draw.io's documented customization hook, runs after the app code is loaded and before `App.main`, and is not rewritten by the entrypoint (unlike `PreConfig.js`). So this counts as configuration, not a patch of the image (PLAN §9.7).

**On image bumps:** compare the image's `PostConfig.js` with ours and copy over any changes; the e2e suite fails if the registry hook stops working.

## D3 – Don't use `?offline=1` (M0)

draw.io skips plugin loading entirely when `offline=1` is set, so the URL in PLAN §4 (`http://localhost:8080/?offline=1`) never loads the plugin. Use `http://localhost:8080/?p=mindmap` instead (D2). The image already disables the cloud storage integrations (Google Drive, OneDrive, Dropbox, GitHub, Trello) and real-time sync in `PreConfig.js`.

## D4 – WebSocket spike, Docker: works, needs CSP config (M0)

- The image injects a Content-Security-Policy whose `connect-src` does **not** allow `ws://127.0.0.1`. A WebSocket from the plugin to localhost is blocked by default.
- The CSP is configurable with `DRAWIO_CSP_HEADER`. `docker-compose.yml` sets the image's default policy plus `ws://127.0.0.1:47100 ws://localhost:47100` in `connect-src`.
- **Bridge port: 47100** (spike now, MCP bridge in M6). Other ports stay blocked.
- Verified by `test/e2e/websocket-spike.spec.js`: echo on port 47100 succeeds; port 47101 is refused with a CSP violation.
- **Consequence for M6:** anyone self-hosting draw.io for live LLM control must add the bridge URL to `DRAWIO_CSP_HEADER`. Document this in the README in M6.

## D5 – Drop draw.io Desktop as a target (M0, decided 2026-11-13)

Findings from the Desktop source (`app.asar` of 32.4.1, confirmed by the changelog):

- draw.io Desktop **removed external plugin support in 31.1.4 (2026-07-29)**. `--enable-plugins` is now ignored, and the `isPluginsEnabled` IPC call is hard-coded to `false`. Only built-in plugins remain.
- Desktop also sends its own CSP header with `connect-src 'self'`, so a localhost WebSocket would be blocked even if plugins loaded.

So the plan's secondary target ("Desktop started with `--enable-plugins`") is not possible with any current Desktop release. Only Desktop ≤ 31.1.3 could load the plugin, which would mean staying on an outdated, unpatched Electron app.

**Decision:** Desktop is dropped as a target. The self-hosted web app (Docker) is the only target; it can be installed as a browser app/PWA for a desktop-like window. The manual release checklist, M0 and M6 are checked on Docker only.

## D6 – Dev container shares draw.io's network (M0)

The VS Code dev container (`.devcontainer/`) runs Node 26 next to the `drawio` service from `docker-compose.yml`, with `network_mode: service:drawio`. Inside the container, draw.io is on `localhost:8080`, and the Playwright browser, the WebSocket echo server and later the MCP server share one `127.0.0.1`. This matches a normal host setup, so tests use the same URLs everywhere (dev container, CI, host).

## D7 – Keyboard behavior details (M1)

Refines the MVP keyboard list in PLAN §2:

- **New mindmap: Alt+Shift+M** (⌥⇧M on macOS). Ctrl+M and Ctrl+Shift+M are taken by draw.io (Edit Data, Edit Geometry); Alt+Shift+M is free.
- **Enter while editing a topic label finishes editing**; Shift+Enter inserts a line break. A second Enter then adds a sibling. Esc also finishes editing and keeps the topic selected (draw.io's default: Esc applies the text).
- **Tab while editing a topic label** finishes editing and adds a child right away, so a branch can be typed without leaving the keyboard.
- New topics get a default label (`Central Topic`, `Topic`). Editing starts with the text selected, so typing replaces it.
- **Delete/Backspace** with several topics selected deletes all their subtrees in one undo step. Afterwards the parent of the first deleted topic is selected.
- The shortcuts apply only when every selected cell is a topic and no label is being edited (except Tab and Enter above). Mixed selections and normal shapes keep draw.io's behavior; e2e tests cover this.
- **Hook points:** draw.io handles Tab in `EditorUi.onKeyDown` and consumes it before the key handler sees it, so the plugin wraps both `ui.onKeyDown` and `ui.keyHandler.getFunction`. Enter-to-finish wraps `graph.cellEditor.isStopEditingEvent`. All three hooks are in `src/keys.js`.

## D8 – Public API and labels (M1)

- `window.mindmap`: `createMindmap({label, x, y})`, `addChild(parentId, label)`, `addSibling(topicId, label)`, `deleteTopic(id)`, `deleteTopics(ids)`, `renameTopic(id, label)`, `getMindmap(topicId?)` (outline `{id, label, children}`), `listMindmaps()`, `getSelectedTopics()`, `selectTopic(id)`, `version`.
- Beyond the plan: `deleteTopics` (multi-selection delete), and `getSelectedTopics` / `selectTopic` (needed by M6's `get_selection` and by tests). Selection changes are not undo steps.
- Unknown ids throw `Error("Unknown topic: <id>")` before anything changes.
- Labels are draw.io HTML labels (`html=1`). The API takes and returns **plain text**; `src/text.js` escapes text and turns newlines into `<br>`, and reads labels back through an inert `DOMParser`.
- `?mindmapDebug=1` (or a dev build) exposes `window.mindmapDebug` (`ui`, `graph`, `commands`). The e2e tests use it on the production build.

## D9 – Placement until the layout exists (M1)

Without M2's layout, a new child goes to the right of its parent, below the lowest topic of the last sibling subtree. A new sibling goes below the subtree of the topic it follows. Siblings inserted in the middle can overlap topics further down; M2 replaces this placement.

**Superseded by M2 (D11):** the layout now runs in the same transaction, so this placement is only the starting point before the layout pass.

## D10 – Own layout instead of mxCompactTreeLayout (M2)

The plan left this open for M2. **Decision:** own layout in `src/layout.js`. It is a pure function (unit-tested without a browser, including a property test that random trees never overlap), balances the two sides itself, and keeps full control over spacing. `mxCompactTreeLayout` would need to run once per side with the sides split and mirrored by hand anyway.

The algorithm is a block layout (as in XMind): each subtree is a vertical block, children stack with `vGap` between their blocks, the parent is centred on its children, and children sit `hGap` beyond the parent's outer edge. Unlike Reingold–Tilford it doesn't pack a deep branch under a shallow neighbour, which keeps the shape stable while typing. Spacing defaults: `rootGap` 70, `hGap` 50, `vGap` 12 (per-diagram settings in v1.0).

## D11 – Automatic re-layout in the same undo step (M2)

- The layout runs on the model's `BEFORE_UNDO` event, at the end of the outermost transaction but before the edit reaches the undo manager. Its changes join that edit, so any change (command, typed label, manual drag) and the layout it causes are **one undo step**. draw.io's `mxLayoutManager` uses the same mechanism.
- It runs when the edit touches a topic or tree edge (added, removed, moved, resized, relabelled or restyled). Edits that replace the model root (opening a file, switching pages) never trigger it, so **viewing a diagram doesn't modify it**; a hand-placed map is laid out on its first edit.
- **Layout wins:** a dragged or resized topic snaps back. The **root is the anchor**: moving it moves the whole map.
- The layout also persists `mmSide` on first-level topics that lack it, sets the curved connector style on tree edges and removes waypoints from them.

## D12 – Topic sizes and sides (M2)

- Topics are sized to their label: root 120–280 px wide, topics 60–220 px; longer labels wrap and the topic grows in height. Sizes are measured with `graph.getPreferredSizeForCell` and cached by style + label (measuring dominated layout time).
- A new first-level topic gets a fixed `mmSide` when it's created: the side of the sibling it was added after (Enter), otherwise the currently shorter side (Tab on the root). Branches never jump sides as the map grows; moving a branch is the v1.0 side control.
- Connectors: `edgeStyle=entityRelationEdgeStyle;curved=1;segment=10`. This style leaves and enters topics on their left/right side facing each other, so one style works on both sides of the map. The default stub length (~30 px) made curves loop within the gap, hence `segment=10`.

## D13 – Performance baseline (M2)

On a ~310-topic map in the dev container (headless Chromium): adding a topic takes about 45 ms median end to end, of which the layout pass is about 25 ms. Every change re-lays out all maps on the page. If this becomes a problem, re-layout only the affected map or side (PLAN §8).
