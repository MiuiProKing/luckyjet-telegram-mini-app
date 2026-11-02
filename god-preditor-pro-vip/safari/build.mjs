import {build} from 'esbuild';
import {readFile, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const directory = path.dirname(fileURLToPath(import.meta.url));
const header = `// ==UserScript==
// @name         GOD PREDITOR PRO VIP — LuckyJet Safari
// @namespace    https://miuiproking.github.io/luckyjet-telegram-mini-app/god-preditor-pro-vip/
// @version      1.0.0
// @description  Перемещаемая панель 1,50× / 2× с нашим Supabase. Только отображение; ставки вручную в игре.
// @match        https://one-vv3016.com/*
// @match        https://miuiproking.github.io/luckyjet-telegram-mini-app/god-preditor-pro-vip/safari/preview.html
// @noframes
// @run-at       document-idle
// @inject-into  content
// @grant        GM.xmlHttpRequest
// @grant        GM.getValue
// @grant        GM.setValue
// @connect      stzrirukuxcyalrsstxx.supabase.co
// ==/UserScript==

// Generated from the same source model, feed and scene as the main page.
// Build: npm ci && npm run build (inside god-preditor-pro-vip/safari).
// No remote JavaScript, credential reads, game inspection or betting actions.
`;
const result = await build({
  absWorkingDir: directory,
  entryPoints: [path.join(directory, 'src/entry.mjs')],
  bundle: true, format: 'iife', platform: 'browser', target: ['safari15'],
  write: false, charset: 'utf8', legalComments: 'none', minify: false,
});
const contents = header + result.outputFiles[0].text;
const output = path.join(directory, 'god-preditor.user.js');
if (process.argv.includes('--check')) {
  if (await readFile(output, 'utf8') !== contents) throw Error('Userscript bundle differs from source; run npm run build');
  console.log('Userscript bundle matches source');
} else {
  await writeFile(output, contents);
  console.log(`Built god-preditor.user.js (${Buffer.byteLength(contents)} bytes)`);
}
