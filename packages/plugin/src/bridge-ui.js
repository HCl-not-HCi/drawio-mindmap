// UI for live LLM control: menu entries and a status indicator in the menubar.
/* global mxResources */

export const ACTION_LLM_TOGGLE = 'mindmapLlmControl';
export const ACTION_LLM_TOKEN = 'mindmapLlmToken';

const DOT_COLORS = {
  off: '#9ca3af',
  connecting: '#d97706',
  error: '#dc2626',
  connected: '#16a34a',
};

export function registerBridgeActions(ui, bridge) {
  mxResources.parse(
    [`${ACTION_LLM_TOGGLE}=Live LLM Control`, `${ACTION_LLM_TOKEN}=Set LLM Bridge Token...`].join(
      '\n',
    ),
  );

  const toggle = ui.actions.addAction(ACTION_LLM_TOGGLE, () => {
    if (!bridge.enabled && !bridge.hasToken()) {
      ui.actions.get(ACTION_LLM_TOKEN).funct();
      return;
    }
    bridge.toggle();
  });
  toggle.setToggleAction(true);
  toggle.setSelectedCallback(() => bridge.enabled);

  ui.actions.addAction(ACTION_LLM_TOKEN, () => {
    ui.prompt(
      'Bridge token (run: npx drawio-mindmap-mcp token)',
      '',
      (value) => {
        if (value == null || value.trim() === '') return;
        bridge.setToken(value);
        if (!bridge.enabled) bridge.enable();
      },
      true,
    );
  });
}

/** Small "LLM ●" indicator at the right of the menubar; click toggles the connection. */
export function createStatusIndicator(ui, bridge) {
  const el = document.createElement('a');
  el.className = 'geItem mindmapLlmStatus';
  el.setAttribute('role', 'button');
  el.setAttribute('tabindex', '0');
  el.style.cssText = 'display:inline-flex;align-items:center;gap:4px;cursor:pointer;';
  const dot = document.createElement('span');
  dot.style.cssText = 'display:inline-block;width:8px;height:8px;border-radius:50%;';
  el.append('LLM', dot);
  el.addEventListener('click', () => ui.actions.get(ACTION_LLM_TOGGLE).funct());

  const update = (status) => {
    dot.style.background = DOT_COLORS[status.state] ?? DOT_COLORS.off;
    el.title = status.detail;
    el.setAttribute('aria-label', `Live LLM Control: ${status.state}. ${status.detail}`);
    el.dataset.state = status.state;
  };
  update(bridge.status);

  const container = ui.menubar?.container ?? ui.menubarContainer;
  container?.appendChild(el);
  return { update, element: el };
}
