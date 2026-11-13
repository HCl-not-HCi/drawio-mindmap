# draw.io Mindmap Plugin – Development Plan

Nov 13, 2026 · @Markus

## 1. Goal and scope

Build a draw.io plugin that makes mind mapping fast and keyboard-driven, similar to dedicated tools like XMind or FreeMind, while keeping the result a normal draw.io diagram that opens and renders anywhere draw.io runs.

**Target platforms**

- **Self-hosted draw.io (Docker image `jgraph/drawio`)**: primary development and deployment target.
- **draw.io Desktop** started with `--enable-plugins`: secondary target, used for personal use and pre-release testing.
- **Embedded draw.io** (own app, iframe embed mode): not a target (decided).

**Non-goals**

- Running on app.diagrams.net or in draw.io for Confluence/Jira. Both only allow built-in plugins.
- Replacing draw.io's general tree layouts. The plugin only manages diagrams it created (or that the user explicitly converted).
- Real-time collaboration features beyond what draw.io already provides.

**Guiding principle:** a diagram made with the plugin must still display correctly without the plugin. All mindmap metadata lives in standard cell styles and attributes, so a user without the plugin sees an ordinary diagram they can still edit by hand.

## 2. Features

Features are grouped by release. MVP is the smallest version that's actually pleasant to use day to day.

### MVP (v0.1)

- **New mindmap:** menu entry (Extras → Mindmap → New) and shortcut that creates a central topic at the center of the view and starts editing its label.
- **Keyboard editing:**
  - `Tab` adds a child topic of the selected topic.
  - `Enter` adds a sibling topic below the selected one (on the root: adds a child).
  - `Delete` / `Backspace` removes the topic and its whole subtree.
  - `F2` or typing starts label editing; `Esc` ends it and keeps the topic selected.
  - Arrow keys move the selection between parent, children and siblings.
- **Automatic layout:** a balanced two-sided layout (topics alternate left/right of the root), re-run after every structural change.
- **Connector styling:** curved edges from parent to child, attached to the correct side of each topic.
- **Single undo step:** each user action (add, delete, move) is one entry in the undo history.

### v1.0

- **Branch colors:** each first-level branch gets a color from a palette; descendants inherit it for the edge and node outline.
- **Collapse / expand subtrees** with a toggle on the topic and a shortcut (`Space` or `Ctrl+.`).
- **Drag to reparent:** dropping a topic onto another topic moves the subtree there; dropping it between siblings reorders it.
- **Side control:** move a first-level branch to the other side of the root (`Ctrl+←` / `Ctrl+→`).
- **Level-based styles:** root, level 1 and level 2+ have distinct default styles (size, font, shape), configurable in one place.
- **Convert selection to mindmap:** take an existing tree of shapes and connectors and adopt it as a managed mindmap.
- **Layout options:** right-only, left-only and balanced layouts; spacing settings per diagram.
- **Light and dark theme:** the branch palette and level styles stay readable in draw.io's light and dark themes (use theme-aware colors where draw.io supports them, otherwise a palette checked against both backgrounds).

### Live LLM control (v1.x)

An LLM (via any MCP client, e.g. Claude Desktop or Claude Code) works on the mindmap that's open in your draw.io window, live, while you keep editing. No file-level round trips.

- **Connect to the open window:** the plugin itself connects to a local MCP server, so it works in the Docker setup and in draw.io Desktop without a browser extension.
- **Read the map:** the LLM gets the current mindmap as an outline (topic ids + labels), plus the current selection as context ("add three ideas under this").
- **Topic-level tools:** add topics, rename, move/reparent, delete, and insert a whole outline under a topic. The LLM never deals with shapes or coordinates.
- **Same behavior as manual edits:** every LLM change runs through the plugin's normal commands, so layout, branch colors and undo (one step per change) work exactly as when typing.
- **User in control:** a status indicator (connected / disconnected) and a toggle in the plugin; the LLM only has access while the toggle is on.
- **Multiple windows:** if several diagrams are open, the LLM can list them and pick one.

### Later

- **Import / export:** Markdown outline (headings or nested lists), OPML, and FreeMind `.mm`.
- **Paste outline:** pasting indented text creates a subtree.
- **Notes and links** on topics using draw.io's tooltip and link support.
- **Icons / markers** (priority, progress, checkmarks).
- **Focus mode:** show only the selected branch.
- **Multiple mindmaps per page**, each laid out independently.

## 3. Architecture

### Plugin entry point

draw.io loads a single JavaScript file. The source is split into modules and bundled into one file (`dist/mindmap.js`) whose entry point is:

```js
Draw.loadPlugin(function (ui) {
  const graph = ui.editor.graph;
  registerActions(ui, graph);   // Actions + menu entries
  registerKeys(ui, graph);      // Tab, Enter, arrows, ...
  registerListeners(ui, graph); // re-layout on model changes
});
```

### Source layout

- `src/index.js`: entry point, wires everything together.
- `src/model.js`: reading and writing mindmap metadata (root, parent, side, level, collapsed).
- `src/commands.js`: add child, add sibling, delete subtree, move, reparent. Each command wraps its changes in `model.beginUpdate()` / `model.endUpdate()` so it is a single undo step.
- `src/layout.js`: the two-sided tree layout. Pure functions on plain objects (`{id, width, height, children}`) that return coordinates; no draw.io dependency, so it can be unit-tested.
- `src/apply-layout.js`: converts the graph to plain objects, runs the layout, writes geometries back.
- `src/styles.js`: default styles per level, branch palette.
- `src/navigation.js`: arrow-key selection movement.
- `src/io/`: Markdown, OPML and FreeMind import/export (later).

### Data model

All metadata is stored in the diagram so it survives saving, copying and opening without the plugin:

- **Style keys on vertices:** `mindmap=1`, `mmRole=root|topic`, `mmSide=left|right` (first-level topics only), `mmCollapsed=1`.
- **Style keys on edges:** `mmEdge=1`. The tree structure is derived from these edges (parent = source, child = target), so a user can also reconnect topics by hand.
- **Sibling order:** stored as `mmOrder=<n>` on each topic, since the edge order in the model is not reliable.
- **Per-diagram settings** (layout mode, spacing): stored as attributes on the root topic.

### Layout engine

- Split the root's children into a left and a right group (balanced by subtree height, unless `mmSide` is set).
- Lay out each side with a tidy-tree algorithm (Reingold–Tilford style): children stacked vertically, parent centered on its children, subtrees never overlap.
- Mirror the left side horizontally.
- Skip hidden children of collapsed topics.
- Only move cells that changed, to keep undo history and file diffs small.

Alternative to evaluate in milestone M2: draw.io's built-in `mxCompactTreeLayout`, run once per side. Less code, but less control over balancing and spacing.

### Integration points (draw.io / mxGraph API)

- `ui.actions.addAction(name, fn, enabled, iconCls, shortcut)` for commands.
- `ui.menus.put(...)` / extending `ui.menus.get('extras')` for menu entries.
- `ui.keyHandler.bindAction(keyCode, control, actionName, shift)` for shortcuts. Shortcuts are only active when the selection is a mindmap topic, so normal draw.io behavior is untouched elsewhere.
- `graph.model.addListener(mxEvent.CHANGE, ...)` to detect manual edits (e.g. a deleted edge) and re-run the layout. Guard against recursion while the plugin itself is applying a layout.
- `graph.addListener(mxEvent.CELLS_MOVED, ...)` for drag-to-reparent.

### LLM bridge (live control)

The plugin is the bridge between the open draw.io window and the LLM. A small local MCP server translates MCP tool calls into messages over a WebSocket; the plugin runs them as normal commands.

```text
LLM client ──MCP (stdio)──▶ mindmap-mcp server ◀──WebSocket── plugin in the open draw.io window
                                                              └─ addTopics(), renameTopic(), … live
```

- **Commands callable from code (from M1 on):** every command in `src/commands.js` takes topic ids and text and does not depend on the current selection. They are exposed as `window.mindmap.*`, so keyboard shortcuts, the LLM bridge and tests all use the same code path.
- **MCP server (`packages/mcp-server`, Node + TypeScript):** tools `list_windows`, `get_mindmap`, `get_selection`, `add_topics`, `rename_topic`, `move_topic`, `delete_topic`, `insert_outline`. Input validated with a schema library (e.g. Zod).
- **Plugin side (`src/bridge.js`):** opens the WebSocket connection when the user turns the toggle on, reconnects automatically, and answers each request with the result or an error.
- **Concurrency:** requests are queued and run one at a time per window. An LLM change and the user's typing never run in the same transaction; each LLM change is its own undo step.
- **Security:** the server listens on `127.0.0.1` only and requires a token that the user copies into the plugin once. Without the token (or with the toggle off), nothing can control the diagram.
- **Reuse:** `insert_outline` uses the Markdown import from M5, which is why live control comes after it.
- **Prior art to study:** [lgazo/drawio-mcp-server](https://github.com/lgazo/drawio-mcp-server) uses the same WebSocket pattern with a browser extension and generic shape tools.

## 4. Development environment

### Tooling

- **Node.js (LTS)** with **esbuild** to bundle `src/` into `dist/mindmap.js` (IIFE format, no external dependencies at runtime).
- **Vitest** for unit tests, **Playwright** for browser tests (see section 6).
- **ESLint + Prettier** for consistent code style.
- **Docker** with Docker Compose to run draw.io locally.
- **draw.io Desktop** for pre-release checks.
- **Pinned versions:** use the current draw.io release (same version for the Docker image and draw.io Desktop where possible) and the current Node.js LTS at the start of M0. Record both in the README and in `.nvmrc` / `docker-compose.yml`.

### Repository structure

```text
drawio-mindmap/                 # npm workspaces monorepo
├─ packages/
│  ├─ plugin/
│  │  ├─ src/               # plugin source (ES modules), incl. bridge.js
│  │  ├─ test/unit/         # layout + model tests (no browser)
│  │  ├─ dist/mindmap.js    # build output (git-ignored, attached to releases)
│  │  └─ package.json
│  └─ mcp-server/            # MCP server for live LLM control (from M6)
│     ├─ src/
│     ├─ test/
│     └─ package.json
├─ test/e2e/                  # Playwright tests against the container
├─ samples/                   # .drawio files for manual testing
├─ docker-compose.yml
├─ LICENSE                    # Apache 2.0
├─ README.md                  # setup, pinned versions, how to load the plugin
└─ package.json               # workspace root, shared scripts
```

Paths like `src/commands.js` elsewhere in this plan are relative to `packages/plugin/`. The workspace layout is set up in M0, even though `mcp-server` stays empty until M6.

### draw.io in Docker

```yaml
# docker-compose.yml
services:
  drawio:
    image: jgraph/drawio:<pinned-version>
    ports:
      - "8080:8080"
    volumes:
      - ./packages/plugin/dist:/usr/local/tomcat/webapps/draw/plugins/custom:ro
```

- Start with `docker compose up -d`, open `http://localhost:8080/?offline=1`.
- One-time setup per browser profile: Extras → Plugins → Add → Custom → `plugins/custom/mindmap.js` → Apply, then reload.
- Mount the whole `dist` folder rather than the single file, so rebuilds that replace the file are picked up.
- Pin the image tag. Bump it deliberately (see section 5) so API changes in draw.io show up as a conscious upgrade, not a surprise.

### draw.io Desktop

- Install the desktop release matching the pinned Docker version where possible.
- Start it with `--enable-plugins` (create a shortcut or shell alias for this).
- Add `dist/mindmap.js` via Extras → Plugins → Add. Desktop keeps its own copy of the file, so after a rebuild remove and re-add the plugin, then restart.
- DevTools: `Ctrl+Shift+I` (`Cmd+Opt+I` on macOS).

## 5. Development workflow

### Daily edit/reload loop

1. `docker compose up -d` (once per session).
2. `npm run watch`: esbuild rebuilds `dist/mindmap.js` on every save, with inline source maps.
3. Reload the browser tab. Keep DevTools open with **Network → Disable cache** checked, so the new build is always loaded.
4. Open a sample from `samples/` (or keep one open via File → Open from device) and try the change.
5. Run `npm test` for the layout and model unit tests before committing.

Tip: during development, expose the plugin internals on `window.mindmapDebug` (only in dev builds) so you can call commands and inspect the tree from the console.

### Debugging

- Source maps let you set breakpoints in the original `src/` files in DevTools.
- Log with a prefix (`[mindmap]`) so plugin output is easy to filter from draw.io's own console noise.
- Use Extras → Edit Diagram to inspect the raw XML and check that styles and attributes are written as expected.

### Git and branching

- `main` is always releasable; work happens on short-lived feature branches (`feat/branch-colors`, `fix/layout-overlap`).
- Conventional commit messages (`feat:`, `fix:`, `refactor:`) so the changelog can be generated.
- CI (GitHub Actions) on every push: lint, unit tests, build, and the Playwright suite against the pinned Docker image.

### Releases

- Semantic versioning. The version is printed to the console when the plugin loads.
- A release = git tag + GitHub release with `mindmap.js` attached + changelog entry.
- Before each release: run the manual checklist (section 6) on both Docker and draw.io Desktop.

### Upgrading draw.io

- Roughly once a month (or before a release), bump the pinned Docker image tag on a branch, run the full test suite, and fix any breakage from internal API changes before merging.

## 6. Testing strategy

### Unit tests (Vitest, no browser)

- **Layout:** given a plain tree, assert that no two topics overlap, parents are vertically centered on their children, left/right balancing works, and collapsed subtrees are skipped. Snapshot tests of computed coordinates catch unintended changes.
- **Model helpers:** parsing and writing mindmap style keys, deriving the tree from edges, sibling ordering.
- **Import/export (later):** round-trip tests (Markdown → mindmap → Markdown gives the same outline).

### Browser tests (Playwright against the Docker container)

- Start the pinned draw.io container in CI and load the plugin before the page starts (e.g. by preloading draw.io's stored plugin configuration in the browser profile).
- Scenarios: create a mindmap, add children and siblings with the keyboard, delete a subtree, undo/redo, save and reopen the file, check the XML.
- Keep this suite small and focused on the integration with draw.io; logic belongs in unit tests.

### Live control tests (M6)

- **Contract tests (MCP server):** each tool validates its input, rejects calls without a valid token, and returns the documented result shape. The plugin side is replaced by a fake WebSocket client.
- **End-to-end test:** start the container with the plugin, connect the MCP server, call `add_topics` and `get_mindmap`, and check that the open diagram changed, the layout ran, and one undo step reverts the change.
- **Failure cases:** toggle off, connection lost mid-call, and topic id no longer existing all return clear errors and leave the diagram unchanged.

### Manual checklist (before every release, on Docker and Desktop)

- [ ] Plugin loads without console errors and prints its version.
- [ ] All MVP shortcuts work and don't interfere with normal draw.io editing outside a mindmap.
- [ ] Undo/redo restores structure and layout in one step per action.
- [ ] A mindmap saved with the plugin opens correctly without it.
- [ ] Large sample (about 300 topics) stays responsive when adding topics.
- [ ] Copy/paste of a subtree between diagrams keeps it a valid mindmap.
- [ ] Mindmaps are readable in both light and dark theme.

## 7. Milestones and roadmap

Estimates assume one developer working part-time and are rough; M2 carries the most uncertainty.

| Milestone | Content | Done when | Estimate |
| --- | --- | --- | --- |
| M0 – Setup | Repo, esbuild, Docker Compose, lint, CI skeleton, "hello" plugin that adds a menu entry; spike: plugin opens a WebSocket to localhost on Docker and Desktop (CSP check) | Plugin loads in Docker and Desktop; WebSocket spike answered | 1–2 days |
| M1 – Core editing | Data model, new mindmap, add child/sibling, delete subtree, single undo steps, commands callable from code (window.mindmap.\*) | Topics can be added via keyboard (no layout yet) | 3–5 days |
| M2 – Layout | Two-sided tidy-tree layout, automatic re-layout, curved connectors | Maps of any size stay tidy while typing | 1–2 weeks |
| M3 – MVP release (v0.1) | Arrow-key navigation, manual checklist, docs, first release | v0.1 tagged and used for real notes | 3–5 days |
| M4 – v1.0 | Branch colors, collapse/expand, drag to reparent, side control, level styles, convert selection | v1.0 tagged | 2–3 weeks |
| M5 – Import/export | Markdown, OPML, FreeMind; paste outline | Round-trip tests pass | 1–2 weeks |
| M6 – Live LLM control | MCP server with topic-level tools, WebSocket bridge in the plugin, toggle + status indicator, token auth | Claude adds and edits topics in the open window on Docker and Desktop | 1–2 weeks |

## 8. Risks and open questions

### Risks

- **No stable plugin API.** Plugins use draw.io's internal JavaScript objects, which can change between releases. *Mitigation:* pin the version, keep all draw.io calls in a few adapter modules, run the test suite on every version bump.
- **Desktop plugin support is unofficial.** The `--enable-plugins` path works but isn't documented as supported and could change. *Mitigation:* treat self-hosted Docker as the primary target.
- **Conflicts with manual edits.** Users can move or restyle topics by hand, which the automatic layout will undo. *Mitigation:* decide on a clear rule (e.g. layout always wins for managed maps; a "free position" flag per topic later).
- **Keyboard conflicts.** `Tab` and `Enter` already have meanings in draw.io. *Mitigation:* only override them when a mindmap topic is selected and not in text-edit mode.
- **Performance on large maps.** Re-running the full layout on every change may get slow. *Mitigation:* measure in M2; if needed, only re-layout the affected side or subtree.
- **WebSocket blocked by draw.io's Content Security Policy.** The plugin may not be allowed to connect to `localhost`, especially on Desktop. *Mitigation:* answer this in the M0 spike; on Docker the CSP can be configured. If Desktop blocks it, live control is Docker-only until a workaround is found.
- **Local control channel as an attack surface.** Other programs or websites could try to drive the diagram. *Mitigation:* bind to `127.0.0.1`, require a token, off by default.

### Open questions

- Should the balanced layout be the default, or right-only (common for outlines)?

  **Decided:** the balanced (two-sided) layout is the default. Right-only and left-only stay available as layout options (v1.0).
- Where should configuration live: per diagram (root attributes) or per user (browser local storage)?

  **Proposed:** two levels, split by type of setting. Final decision is due before M4; nothing earlier depends on it, so until then only the per-diagram root attributes are implemented.
  - **Per browser (local storage), user defaults:** default layout mode, spacing and palette for *new* mindmaps, plus personal behavior such as keyboard shortcut toggles.
  - **Per diagram (root attributes), overrides:** layout mode, spacing and palette of an existing map. These must travel with the file, so the map looks the same for everyone and after reopening.
  - **Rule:** a new mindmap copies the browser defaults into its root at creation; from then on the diagram's own values win. Behavior-only settings (shortcuts) are never stored in the diagram.
- Is embedded mode a real target? If yes, it affects how the plugin is loaded and configured.

  **Decided:** no. Embedded mode is not a target; the plugin only needs to work in self-hosted draw.io and draw.io Desktop.
- License and distribution: public GitHub repo (e.g. Apache 2.0, like draw.io itself) or private?

  **Decided:** Apache 2.0, published as an open-source GitHub repo with a `LICENSE` file from M0.

## 9. Working agreement (for Claude Code)

This plan is the source of truth for implementation. Start with M0.

1. **One milestone at a time.** Finish a milestone, show the result (what was built, how to try it, test status), then stop and wait for review before starting the next.
2. **Plan first, then code.** At the start of each milestone, list the concrete tasks and any questions. Ask when the plan is unclear or contradicts itself instead of guessing.
3. **Keep the plan current.** When a decision is made or changes during implementation, note it in this doc (or in `docs/decisions.md` in the repo) so plan and code don't drift apart.
4. **Conventional commits** (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`), small and focused. Work on a feature branch per milestone.
5. **Tests with every change.** Logic gets unit tests; anything touching draw.io gets at least a manual check from the checklist, and a Playwright test where practical. Lint, tests and build must pass before a milestone is called done.
6. **draw.io version bumps** only on their own branch, with the full test suite run before merging.
7. **Don't touch draw.io itself.** Everything lives in the plugin and the MCP server; no patches to draw.io sources or the Docker image beyond configuration.
