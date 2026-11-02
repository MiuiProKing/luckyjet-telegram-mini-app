import {build} from 'esbuild';
import {readFile, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const directory = path.dirname(fileURLToPath(import.meta.url));
const header = `// ==UserScript==
// @name         GOD PREDITOR PRO VIP — LuckyJet Safari
// @namespace    https://miuiproking.github.io/luckyjet-telegram-mini-app/god-preditor-pro-vip/
// @version      1.1.0
// @description  Панель 1,50× / 2×. Автонажатия выключены до явного включения и выбора двух кнопок.
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
// No remote JavaScript or credential reads. Live mode may click ONLY the two
// user-selected bet buttons; default is OFF, test mode never clicks them.
`;
const result = await build({
  absWorkingDir: directory,
  entryPoints: [path.join(directory, 'src/entry.mjs')],
  bundle: true, format: 'iife', platform: 'browser', target: ['safari15'],
  write: false, charset: 'utf8', legalComments: 'none', minify: false,
});
const contents = header + result.outputFiles[0].text;
const outputs = ['god-preditor.user.js', 'god-preditor-1.1.user.js'].map(name => path.join(directory, name));
if (process.argv.includes('--check')) {
  for (const output of outputs) if (await readFile(output, 'utf8') !== contents) throw Error('Userscript bundle differs from source; run npm run build');
  console.log('Userscript bundle matches source');
} else {
  for (const output of outputs) await writeFile(output, contents);
  console.log(`Built god-preditor.user.js (${Buffer.byteLength(contents)} bytes)`);
}
