import fs from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';
const path='supabase/functions/luckyjet-collector/index.ts';
const javascript=stripTypeScriptTypes(fs.readFileSync(path,'utf8'),{mode:'strip'});
new vm.SourceTextModule(javascript,{identifier:path});
console.log('PASS Cloud TypeScript syntax after native type stripping');
