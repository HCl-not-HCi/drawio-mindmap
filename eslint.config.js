import js from '@eslint/js';
import globals from 'globals';

export default [
  {
    ignores: [
      '**/dist/',
      '**/coverage/',
      'test-results/',
      'playwright-report/',
      'docker/drawio/PostConfig.js', // vendored from the draw.io image
    ],
  },
  js.configs.recommended,
  {
    // Plugin code runs in the draw.io page.
    files: ['packages/plugin/src/**/*.js'],
    languageOptions: { globals: { ...globals.browser } },
  },
  {
    // Node: build scripts, tooling, tests.
    files: ['**/*.mjs', '*.js', 'packages/*/test/**/*.js', 'test/**/*.js'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    // e2e tests also contain callbacks that run in the page (page.evaluate).
    files: ['test/e2e/**/*.js'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
];
