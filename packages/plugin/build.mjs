// Bundles src/ into a single IIFE file that draw.io can load as a plugin.
// Usage: node build.mjs [--watch]
import * as esbuild from 'esbuild';
import { readFileSync } from 'node:fs';

const watch = process.argv.includes('--watch');
const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url)));

/** @type {import('esbuild').BuildOptions} */
const options = {
  entryPoints: ['src/index.js'],
  outfile: 'dist/mindmap.js',
  bundle: true,
  format: 'iife',
  target: 'es2020',
  // Watch mode is the dev loop: inline source maps, debug hooks enabled.
  sourcemap: watch ? 'inline' : false,
  define: {
    __VERSION__: JSON.stringify(version),
    __DEV__: JSON.stringify(watch),
  },
  banner: { js: `/* drawio-mindmap ${version} | Apache-2.0 */` },
  logLevel: 'info',
};

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
} else {
  await esbuild.build(options);
}
