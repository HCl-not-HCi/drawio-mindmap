// Pure helpers for draw.io style strings ("key=value;key2=value2;shapeName;").
// No draw.io dependency, so model code built on these can be unit-tested.

/**
 * @param {string | null | undefined} style
 * @returns {Map<string, string | null>} ordered entries; bare tokens (e.g. "ellipse") map to null
 */
export function parseStyle(style) {
  const entries = new Map();
  for (const part of (style ?? '').split(';')) {
    if (part === '') continue;
    const eq = part.indexOf('=');
    if (eq < 0) entries.set(part, null);
    else entries.set(part.slice(0, eq), part.slice(eq + 1));
  }
  return entries;
}

/** @param {Map<string, string | null>} entries */
export function formatStyle(entries) {
  let out = '';
  for (const [key, value] of entries) out += value === null ? `${key};` : `${key}=${value};`;
  return out;
}

/** Value of `key`, or undefined if absent. Bare tokens return null. */
export function getStyleValue(style, key) {
  const entries = parseStyle(style);
  return entries.has(key) ? entries.get(key) : undefined;
}

/**
 * Returns `style` with `values` applied. A value of null or undefined removes the key;
 * other values are converted to strings. Existing keys keep their position.
 * @param {string | null | undefined} style
 * @param {Record<string, string | number | null | undefined>} values
 */
export function setStyleValues(style, values) {
  const entries = parseStyle(style);
  for (const [key, value] of Object.entries(values)) {
    if (value == null) entries.delete(key);
    else entries.set(key, String(value));
  }
  return formatStyle(entries);
}
