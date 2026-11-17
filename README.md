# draw.io Mindmap

A draw.io plugin for fast, keyboard-driven mind mapping. Mindmaps stay normal draw.io diagrams that open and render without the plugin.

Status: **v1.1.0**. Create mind maps, edit and navigate them with the keyboard, collapse branches, rearrange them by drag and drop, convert hand-drawn trees, import and export outlines, and let an LLM edit the open map live. Maps are laid out automatically and colored per branch. See [CHANGELOG.md](CHANGELOG.md) for what's in each release and the known limitations. See [docs/PLAN.md](docs/PLAN.md) for the plan and [docs/decisions.md](docs/decisions.md) for decisions made along the way.

## Pinned versions

| Tool    | Version                   | Where                          |
| ------- | ------------------------- | ------------------------------ |
| draw.io | 32.6.10 (`jgraph/drawio`) | `docker-compose.yml`           |
| Node.js | 26 LTS (26.13.1)          | `.nvmrc`, `.devcontainer/`     |
| Desktop | dropped as a target, D5   | [decisions](docs/decisions.md) |

## Using the plugin

| Key / action                    | What it does                                                  |
| ------------------------------- | ------------------------------------------------------------- |
| Alt+Shift+M (⌥⇧M)               | New mindmap at the centre of the view (also Extras → Mindmap) |
| Tab                             | Add a child topic                                             |
| Enter                           | Add a sibling below (on the central topic: add a child)       |
| Delete / Backspace              | Delete the topic and its subtree                              |
| F2 or start typing              | Edit the label                                                |
| Enter / Esc while editing       | Finish editing (Shift+Enter: line break)                      |
| Tab while editing               | Finish editing and add a child                                |
| Arrow keys                      | Select the parent, child or sibling in that direction         |
| Ctrl+. (⌘.) or the +/- toggle   | Collapse / expand the subtree                                 |
| Ctrl+← / Ctrl+→ (⌘← / ⌘→)       | Move the branch to the left / right side                      |
| Drag a topic onto another       | Make it a child of that topic                                 |
| Drag a topic among its siblings | Reorder it (on the first level, also across sides)            |

The keys only change behavior when mindmap topics are selected; everywhere else draw.io works as usual. Every action, including the re-layout it causes, is one undo step. The layout always wins: topics dropped elsewhere snap back, and dragging the central topic moves the whole map.

**Extras → Mindmap** also has:

- **Convert Selection to Mindmap:** turns a tree of shapes and connectors you drew by hand into a mindmap. Shapes keep their look.
- **Layout:** both sides, right only or left only, and compact / normal / wide spacing, per map.
- **Import from File / Export as:** Markdown, OPML and FreeMind (`.mm`). Pasting indented text or a Markdown list while a topic is selected adds the lines as child topics.

Each first-level branch gets its own color, inherited by its topics and connectors, readable in draw.io's light and dark theme. Colors you change by hand are kept until a topic moves to another branch or level. Details: [decisions](docs/decisions.md) D7, D11, D16–D20.

From the browser console, `window.mindmap` offers the same commands by topic id, e.g. `mindmap.addChild(mindmap.listMindmaps()[0].id, 'Idea')`. See [D8](docs/decisions.md) and the [changelog](CHANGELOG.md) for the full list.

`samples/basic.drawio` is a small map for manual testing (File → Open from → Device).

## Live LLM control

An LLM in any MCP client (Claude Code, Claude Desktop, ...) can work on the mindmap open in your draw.io window, live, while you keep editing. It reads the map as an outline and adds, renames, moves and deletes topics; every change is one undo step, laid out and colored like your own edits.

1. Build once: `npm ci && npm run build` (creates `packages/mcp-server/dist/cli.js`).
2. Register the MCP server in your client. It is a stdio server started with `node /path/to/drawio-mindmap/packages/mcp-server/dist/cli.js`:
   - **Claude Code:** `claude mcp add drawio-mindmap -- node /path/to/drawio-mindmap/packages/mcp-server/dist/cli.js`
   - **Claude Desktop** (`claude_desktop_config.json`):
     ```json
     {
       "mcpServers": {
         "drawio-mindmap": {
           "command": "node",
           "args": ["/path/to/drawio-mindmap/packages/mcp-server/dist/cli.js"]
         }
       }
     }
     ```
3. Print the token: `node packages/mcp-server/dist/cli.js token`. It is created once in `~/.config/drawio-mindmap/bridge-token`.
4. In draw.io: **Extras → Mindmap → Set LLM Bridge Token…**, paste it. This also turns on **Live LLM Control**. The **LLM ●** indicator in the menubar turns green when connected; click it to turn the connection off or on.

Tools: `list_windows`, `get_mindmap`, `get_selection`, `add_topics`, `rename_topic`, `move_topic`, `delete_topic`, `insert_outline` (Markdown list). With several draw.io windows connected, the LLM picks one with `window_id`.

**Security:** the server listens on `127.0.0.1:47100` only, accepts only the draw.io origin (`MINDMAP_BRIDGE_ORIGINS`, default `http://localhost:8080`) and requires the token. The toggle is off on every page load, so the LLM only has access while you turn it on. Your draw.io server's CSP must allow `ws://127.0.0.1:47100` (`DRAWIO_CSP_HEADER`, see `docker-compose.yml`). Details: [D22](docs/decisions.md).

In the dev container, the MCP server runs inside the container and port 47100 is forwarded, so the browser on your host still reaches it at `127.0.0.1:47100`.

## Installing on your own draw.io server

The plugin runs on self-hosted draw.io (the `jgraph/drawio` Docker image). app.diagrams.net, Confluence/Jira and draw.io Desktop only allow built-in plugins.

1. Download `mindmap.js` from the release (or run `npm run build` → `packages/plugin/dist/mindmap.js`).
2. Mount it into the container at `/usr/local/tomcat/webapps/draw/plugins/custom/mindmap.js`.
3. Mount [`docker/drawio/PostConfig.js`](docker/drawio/PostConfig.js) at `/usr/local/tomcat/webapps/draw/js/PostConfig.js`. It registers the plugin under the id `mindmap` (D2). It is a copy of the image's own file plus three lines; re-copy it when you change the image version.
4. Open draw.io with `?p=mindmap`, e.g. `https://drawio.example.com/?p=mindmap`, and bookmark that URL. Without the parameter, draw.io runs without the plugin.

[`docker-compose.yml`](docker-compose.yml) is a working example (it also sets the CSP that live LLM control needs, see below).

## Development in the dev container (recommended)

Requirements: Docker and VS Code with the _Dev Containers_ extension.

1. Open the folder in VS Code → **Reopen in Container**. This starts two services from `docker-compose.yml` + `.devcontainer/docker-compose.yml`:
   - `drawio`: the pinned draw.io image, published on <http://localhost:8080>.
   - `dev`: Node 26, sharing draw.io's network, so `localhost:8080` works inside it too.

   The first start runs `npm ci` and installs Playwright's Chromium.

2. In the container terminal: `npm run watch` (rebuilds `packages/plugin/dist/mindmap.js` on every save, with source maps).
3. In your browser on the host, open <http://localhost:8080/?p=mindmap> (bookmark it). `p=mindmap` loads the plugin; no Plugins-dialog setup is needed (D2). Don't add `?offline=1`: draw.io skips plugins in offline mode (D3).
4. After each rebuild, reload the tab. Keep DevTools open with **Network → Disable cache** checked.

The console shows `[mindmap] loaded v1.1.0 (dev build)`. In dev builds, `window.mindmapDebug` exposes the EditorUi and graph.

## Development without the dev container

Requirements: Node 26 (`nvm use`), Docker.

```sh
npm ci
npm run build          # create dist/ before draw.io mounts it
npm run drawio:up      # docker compose up -d drawio
npm run watch
```

Then continue with step 3 above. Rebuild once before `drawio:up` so `dist/` exists.

## Scripts

| Command             | What it does                                                         |
| ------------------- | -------------------------------------------------------------------- |
| `npm run build`     | Production build → `packages/plugin/dist/mindmap.js`                 |
| `npm run watch`     | Dev build with inline source maps, rebuilds on save                  |
| `npm test`          | Unit tests (Vitest)                                                  |
| `npm run test:e2e`  | Playwright tests against draw.io on `localhost:8080`                 |
| `npm run lint`      | ESLint + Prettier check (`npm run format` fixes formatting)          |
| `npm run drawio:up` | Start draw.io (`drawio:down` stops it). Not needed in the container. |

## How the Docker setup loads the plugin

- `packages/plugin/dist` is mounted at `plugins/custom/` in the draw.io web app.
- `docker/drawio/PostConfig.js` registers the plugin under the id `mindmap`, so `?p=mindmap` loads it (D2). Restart the container after editing that file.
- `DRAWIO_CSP_HEADER` adds `ws://127.0.0.1:47100` to the CSP so the plugin can reach the MCP server's bridge (D4, D22).

## Project layout

```text
packages/plugin/        draw.io plugin (src/, test/unit/, dist/)
packages/mcp-server/    MCP server for live LLM control (TypeScript)
test/e2e/               Playwright tests against the draw.io container
docker/drawio/          draw.io configuration files mounted into the container
samples/                .drawio files for manual testing
```

## License

[Apache 2.0](LICENSE)
