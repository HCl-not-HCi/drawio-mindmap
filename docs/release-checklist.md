# Release checklist

The manual checklist from [PLAN.md §6](PLAN.md), run before every release. draw.io Desktop is no longer a target (D5), so every item is checked on Docker only. Items marked _(e2e)_ are covered by the Playwright suite; the rest are checked by hand.

## v0.1.0 – 2026-11-14, `jgraph/drawio:32.6.10`

| Item                                                                    | Result    | How                                                                                                                                                               |
| ----------------------------------------------------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Plugin loads without console errors and prints its version              | ✅        | _(e2e)_ `plugin-loads.spec.js`                                                                                                                                    |
| All MVP shortcuts work                                                  | ✅        | _(e2e)_ `editing.spec.js`, `navigation.spec.js`                                                                                                                   |
| Shortcuts don't interfere with normal draw.io editing outside a mindmap | ✅        | _(e2e)_ normal shapes and mixed selections keep Tab/Enter/Delete behavior                                                                                         |
| Undo/redo restores structure and layout in one step per action          | ✅        | _(e2e)_ `layout.spec.js`, `editing.spec.js`                                                                                                                       |
| A mindmap saved with the plugin opens correctly without it              | ✅        | _(e2e)_ `navigation.spec.js` opens `samples/basic.drawio` without the plugin; screenshot checked                                                                  |
| Large sample (about 300 topics) stays responsive when adding topics     | ✅        | _(e2e)_ ~45 ms median per added topic (D13)                                                                                                                       |
| Copy/paste of a subtree between diagrams keeps it a valid mindmap       | ⚠️ partly | Whole map: ✅ _(e2e)_. A branch without its central topic pastes as unattached topics that aren't laid out; known limitation, fixed with paste-into-topic in v1.0 |
| Mindmaps are readable in both light and dark theme                      | ✅        | Screenshots with `?dark=1` checked by hand; default colors follow the theme                                                                                       |
| Used for real notes                                                     | ⏳        | Done when the release is in daily use (milestone M3 "done when")                                                                                                  |

## Release steps

1. Update `version` in `packages/plugin/package.json` and add a `CHANGELOG.md` entry.
2. Run `npm run lint`, `npm test`, `npm run build` and `npm run test:e2e`; fill in the table above.
3. Commit, then tag: `git tag -a vX.Y.Z -m "vX.Y.Z"`.
4. Push the tag. `.github/workflows/release.yml` builds `mindmap.js` and attaches it to a GitHub release with the changelog entry.
