import { expect, it } from 'vitest';
import { textToHtml } from '../../src/text.js';

// htmlToText needs a DOMParser and is covered by the e2e tests (round trips in the browser).

it('escapes markup characters and turns newlines into <br>', () => {
  expect(textToHtml(`a < b & "c" 'd'\r\nnext\nlast`)).toBe(
    'a &lt; b &amp; &quot;c&quot; &#39;d&#39;<br>next<br>last',
  );
});

it('treats null and undefined as empty', () => {
  expect(textToHtml(null)).toBe('');
  expect(textToHtml(undefined)).toBe('');
  expect(textToHtml(42)).toBe('42');
});
