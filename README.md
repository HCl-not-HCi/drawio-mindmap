# draw.io Mindmap

A draw.io plugin for fast, keyboard-driven mind mapping. Mindmaps stay normal draw.io diagrams that open and render without the plugin.

Status: **M1 (core editing)**. Mind maps can be created and edited with the keyboard. There is no automatic layout yet (M2). See [docs/PLAN.md](docs/PLAN.md) for the plan and [docs/decisions.md](docs/decisions.md) for decisions made along the way.

## Pinned versions

| Tool    | Version                   | Where                          |
| ------- | ------------------------- | ------------------------------ |
| draw.io | 32.6.10 (`jgraph/drawio`) | `docker-compose.yml`           |
| Node.js | 26 LTS (26.13.1)          | `.nvmrc`, `.devcontainer/`     |
| Desktop | dropped as a target, D5   | [decisions](docs/decisions.md) |

## Using the plugin

| Key                       | Action                                                        |
| ------------------------- | ------------------------------------------------------------- |
| Alt+Shift+M (⌥⇧M)         | New mindmap at the centre of the view (also Extras → Mindmap) |
| Tab                       | Add a child topic                                             |
| Enter                     | Add a sibling below (on the central topic: add a child)       |
| Delete / Backspace        | Delete the topic and its subtree                              |
| F2 or start typing        | Edit the label                                                |
| Enter / Esc while editing | Finish editing (Shift+Enter: line break)                      |
| Tab while editing         | Finish editing and add a child                                |

The keys only change behavior when mindmap topics are selected; everywhere else draw.io works as usual. Every action is one undo step. Details: [D7](docs/decisions.md).

From the browser console, `window.mindmap` offers the same commands by topic id (see [D8](docs/decisions.md)), e.g. `mindmap.addChild(mindmap.listMindmaps()[0].id, 'Idea')`.

`samples/basic.drawio` is a small map for manual testing (File → Open from → Device).

## Development in the dev container (recommended)

Requirements: Docker and VS Code with the _Dev Containers_ extension.

1. Open the folder in VS Code → **Reopen in Container**. This starts two services from `docker-compose.yml` + `.devcontainer/docker-compose.yml`:
   - `drawio`: the pinned draw.io image, published on <http://localhost:8080>.
   - `dev`: Node 26, sharing draw.io's network, so `localhost:8080` works inside it too.

   The first start runs `npm ci` and installs Playwright's Chromium.

2. In the container terminal: `npm run watch` (rebuilds `packages/plugin/dist/mindmap.js` on every save, with source maps).
3. In your browser on the host, open <http://localhost:8080/?p=mindmap> (bookmark it). `p=mindmap` loads the plugin; no Plugins-dialog setup is needed (D2). Don't add `?offline=1`: draw.io skips plugins in offline mode (D3).
4. After each rebuild, reload the tab. Keep DevTools open with **Network → Disable cache** checked.

The console shows `[mindmap] loaded v0.0.1 (dev build)`. In dev builds, `window.mindmapDebug` exposes the EditorUi and graph.

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
| `npm run spike:ws`  | WebSocket echo server on `127.0.0.1:47100` (M0 spike)                |
| `npm run drawio:up` | Start draw.io (`drawio:down` stops it). Not needed in the container. |

## How the Docker setup loads the plugin

- `packages/plugin/dist` is mounted at `plugins/custom/` in the draw.io web app.
- `docker/drawio/PostConfig.js` registers the plugin under the id `mindmap`, so `?p=mindmap` loads it (D2). Restart the container after editing that file.
- `DRAWIO_CSP_HEADER` adds `ws://127.0.0.1:47100` to the CSP so the plugin can reach the local bridge (D4).

To try the WebSocket spike manually: `npm run spike:ws`, then **Extras → Mindmap → Test WebSocket connection…**.

## Project layout

```text
packages/plugin/        draw.io plugin (src/, test/unit/, dist/)
packages/mcp-server/    MCP server for live LLM control (from M6)
test/e2e/               Playwright tests against the draw.io container
docker/drawio/          draw.io configuration files mounted into the container
scripts/                Dev tools (WebSocket echo server)
samples/                .drawio files for manual testing
```

## License

[Apache 2.0](LICENSE)
