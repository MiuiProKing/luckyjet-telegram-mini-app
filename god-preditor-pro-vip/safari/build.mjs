import {build} from 'esbuild';
import {readFile, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const directory = path.dirname(fileURLToPath(import.meta.url));
// Compile the supplied algorithm without editing its arithmetic.
const prediction = await build({absWorkingDir: directory, entryPoints: [path.join(directory, '../modules/supplied/prediction.ts')], bundle: true, format: 'esm', platform: 'browser', target: ['safari15'], write: false, charset: 'utf8', legalComments: 'none'});
const predictionPath = path.join(directory, '../modules/supplied-prediction.mjs');
if (process.argv.includes('--check')) {
  if (await readFile(predictionPath, 'utf8') !== prediction.outputFiles[0].text) throw Error('Supplied prediction module differs from source');
} else await writeFile(predictionPath, prediction.outputFiles[0].text);
const header = `// ==UserScript==
// @name         GOD PREDITOR PRO VIP — LuckyJet Safari
// @namespace    https://miuiproking.github.io/luckyjet-telegram-mini-app/god-preditor-pro-vip/
// @version      1.7.0
// @description  Полный архив Supabase и отдельные экспериментальные статистические модели с проверкой по дням. Преимущество требует подтверждения; авто выключено до явного включения.
// @match        https://one-vv3016.com/*
// @match        https://miuiproking.github.io/luckyjet-telegram-mini-app/god-preditor-pro-vip/safari/preview.html
// @match        https://1play.gamedev-tech.cc/*
// @run-at       document-idle
// @inject-into  content
// @grant        GM.xmlHttpRequest
// @grant        GM.getValue
// @grant        GM.setValue
// @connect      stzrirukuxcyalrsstxx.supabase.co
// ==/UserScript==

// Generated from the Safari-only hardened v2 model and the existing feed/scene.
// Build: npm ci && npm run build (inside god-preditor-pro-vip/safari).
// No remote JavaScript or credential reads. Live mode may click ONLY the two
// user-selected bet buttons; default is OFF, test mode never clicks them.
`;
// Bundle the local statistical worker into the installable file as a Blob source;
// no remote code, importScripts, service worker or eval is required at runtime.
const worker = await build({absWorkingDir: directory, entryPoints: [path.join(directory, 'src/statistics/worker.mjs')],
  bundle: true, format: 'iife', platform: 'browser', target: ['safari15'],
  write: false, charset: 'utf8', legalComments: 'none', minify: false});
const result = await build({
  absWorkingDir: directory,
  entryPoints: [path.join(directory, 'src/entry.mjs')],
  bundle: true, format: 'iife', platform: 'browser', target: ['safari15'],
  write: false, charset: 'utf8', legalComments: 'none', minify: false,
  define: {__STATISTICS_WORKER_SOURCE__: JSON.stringify(worker.outputFiles[0].text)},
});
const contents = header + result.outputFiles[0].text;
const outputs = ['god-preditor.user.js', 'god-preditor-1.7.user.js'].map(name => path.join(directory, name));
if (process.argv.includes('--check')) {
  for (const output of outputs) if (await readFile(output, 'utf8') !== contents) throw Error('Userscript bundle differs from source; run npm run build');
  console.log('Userscript bundle matches source');
} else {
  for (const output of outputs) await writeFile(output, contents);
  console.log(`Built god-preditor.user.js (${Buffer.byteLength(contents)} bytes)`);
}
