// Actions and the Extras → Mindmap submenu. All draw.io menu wiring lives here.
import { SPACING_PRESETS } from './layout.js';
import { log } from './log.js';
import { checkWebSocket } from './spike/ws-check.js';

/* global mxResources, mxClient */

export const ACTION_NEW = 'mindmapNew';
export const ACTION_ABOUT = 'mindmapAbout';
export const ACTION_WS_CHECK = 'mindmapWsCheck';
export const MENU_NAME = 'mindmap';
export const LAYOUT_MENU = 'mindmapLayout';

const NEW_SHORTCUT_LABEL = mxClient.IS_MAC ? '⌥⇧M' : 'Alt+Shift+M';

const MODE_ACTIONS = {
  mindmapLayoutBalanced: { mode: 'balanced', label: 'Both Sides' },
  mindmapLayoutRight: { mode: 'right', label: 'Right Only' },
  mindmapLayoutLeft: { mode: 'left', label: 'Left Only' },
};
const SPACING_ACTIONS = {
  mindmapSpacingCompact: { preset: 'compact', label: 'Compact Spacing' },
  mindmapSpacingNormal: { preset: 'normal', label: 'Normal Spacing' },
  mindmapSpacingWide: { preset: 'wide', label: 'Wide Spacing' },
};

const sameSpacing = (a, b) => a.rootGap === b.rootGap && a.hGap === b.hGap && a.vGap === b.vGap;

/**
 * @param {object} ui
 * @param {{version: string, debug: object, newMindmap: () => void, commands: object}} opts
 */
export function registerActions(ui, { version, debug, newMindmap, commands }) {
  mxResources.parse(
    [
      `${MENU_NAME}=Mindmap`,
      `${LAYOUT_MENU}=Layout`,
      `${ACTION_NEW}=New Mindmap`,
      `${ACTION_ABOUT}=About Mindmap...`,
      `${ACTION_WS_CHECK}=Test WebSocket connection...`,
      ...Object.entries({ ...MODE_ACTIONS, ...SPACING_ACTIONS }).map(
        ([name, { label }]) => `${name}=${label}`,
      ),
    ].join('\n'),
  );

  ui.actions.addAction(ACTION_NEW, newMindmap, null, null, NEW_SHORTCUT_LABEL);

  ui.actions.addAction(ACTION_ABOUT, () => {
    ui.alert(`draw.io Mindmap plugin ${version}`);
  });

  ui.actions.addAction(ACTION_WS_CHECK, async () => {
    const result = await checkWebSocket();
    debug.lastWsCheck = result;
    (result.ok ? log.info : log.warn)('WebSocket check', result);
    ui.alert(`WebSocket ${result.ok ? 'OK' : 'FAILED'}: ${result.url}\n${result.detail}`);
  });

  // Layout actions apply to the map of the selected topic, or the only map on the page.
  const targetTopic = () => {
    const selected = commands.getSelectedTopics();
    if (selected.length > 0) return selected[0];
    const maps = commands.listMindmaps();
    return maps.length === 1 ? maps[0].id : null;
  };
  const withTarget = (fn) => () => {
    const topic = targetTopic();
    if (topic == null) {
      ui.alert('Select a topic of the mindmap first.');
      return;
    }
    try {
      fn(topic);
    } catch (e) {
      ui.handleError(e);
    }
  };
  const currentOptions = () => {
    const topic = targetTopic();
    return topic != null ? commands.getLayoutOptions(topic) : null;
  };

  for (const [name, { mode }] of Object.entries(MODE_ACTIONS)) {
    const action = ui.actions.addAction(
      name,
      withTarget((t) => commands.setLayoutOptions(t, { mode })),
    );
    action.setToggleAction(true);
    action.setSelectedCallback(() => currentOptions()?.mode === mode);
  }
  for (const [name, { preset }] of Object.entries(SPACING_ACTIONS)) {
    const spacing = SPACING_PRESETS[preset];
    const action = ui.actions.addAction(
      name,
      withTarget((t) => commands.setLayoutOptions(t, { spacing })),
    );
    action.setToggleAction(true);
    action.setSelectedCallback(() => {
      const options = currentOptions();
      return options != null && sameSpacing(options.spacing, spacing);
    });
  }
}

export function registerMenus(ui) {
  ui.menus.put(
    LAYOUT_MENU,
    new window.Menu((menu, parent) => {
      ui.menus.addMenuItems(
        menu,
        [...Object.keys(MODE_ACTIONS), '-', ...Object.keys(SPACING_ACTIONS)],
        parent,
      );
    }),
  );
  ui.menus.put(
    MENU_NAME,
    new window.Menu((menu, parent) => {
      ui.menus.addMenuItems(menu, [ACTION_NEW, '-'], parent);
      ui.menus.addSubmenu(LAYOUT_MENU, menu, parent);
      ui.menus.addMenuItems(menu, ['-', ACTION_ABOUT, ACTION_WS_CHECK], parent);
    }),
  );

  const extras = ui.menus.get('extras');
  if (extras == null) {
    log.warn('Extras menu not found; Mindmap menu not added');
    return;
  }
  const original = extras.funct;
  extras.funct = function (menu, parent) {
    original.apply(this, arguments);
    menu.addSeparator(parent);
    ui.menus.addSubmenu(MENU_NAME, menu, parent);
  };
}
