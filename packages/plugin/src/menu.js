// Actions and the Extras → Mindmap submenu. All draw.io menu wiring lives here.
import { checkWebSocket } from './spike/ws-check.js';
import { log } from './log.js';

/* global mxResources, mxClient */

export const ACTION_NEW = 'mindmapNew';
export const ACTION_ABOUT = 'mindmapAbout';
export const ACTION_WS_CHECK = 'mindmapWsCheck';
export const MENU_NAME = 'mindmap';

const NEW_SHORTCUT_LABEL = mxClient.IS_MAC ? '⌥⇧M' : 'Alt+Shift+M';

/**
 * @param {object} ui
 * @param {{version: string, debug: object, newMindmap: () => void}} opts
 */
export function registerActions(ui, { version, debug, newMindmap }) {
  mxResources.parse(
    [
      `${MENU_NAME}=Mindmap`,
      `${ACTION_NEW}=New Mindmap`,
      `${ACTION_ABOUT}=About Mindmap...`,
      `${ACTION_WS_CHECK}=Test WebSocket connection...`,
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
}

export function registerMenus(ui) {
  ui.menus.put(
    MENU_NAME,
    new window.Menu((menu, parent) => {
      ui.menus.addMenuItems(menu, [ACTION_NEW, '-', ACTION_ABOUT, ACTION_WS_CHECK], parent);
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
