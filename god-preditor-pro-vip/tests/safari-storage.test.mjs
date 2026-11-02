import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loadPanelState} from '../safari/src/storage.mjs';
const model='hardened-dynamic-windows-v4',options={key:'new',legacyKey:'old'};
function memory(values){const calls=[];return {calls,async getValue(key,fallback){calls.push(key);return structuredClone(values[key]??fallback);},async setValue(){throw Error('Migration must not write');}};}
test('first v4 load copies history and UI but archives old-model results without changing old storage',async()=>{
 const old={model:'supplied-dynamic-windows-v3',rows:[{id:'known',timestamp:123}],journal:[{model:'supplied-dynamic-windows-v3',status:'hit'}],ui:{width:280,height:400},selected:'big',armed:true,autoMode:'live'};
 const original=structuredClone(old),gm=memory({old});
 const saved=await loadPanelState(gm,model,options);
 assert.deepEqual(gm.calls,['new','old']);assert.deepEqual(old,original);assert.deepEqual(saved.rows,old.rows);assert.deepEqual(saved.ui,old.ui);
 assert.deepEqual(saved.journal,[]);assert.deepEqual(saved.legacyJournal,old.journal);assert.equal(saved.selected,'big');assert.equal(saved.armed,undefined);assert.equal(saved.autoMode,undefined);
});
test('existing v4 data takes precedence and mixed legacy entries never become active v4 results',async()=>{
 const gm=memory({new:{model,journal:[{model,status:'pending'},{model:'old',status:'hit'}],legacyJournal:[{model:'older'}],selected:'invalid'},old:{rows:[{id:'ignore'}]}});
 const saved=await loadPanelState(gm,model,options);assert.deepEqual(gm.calls,['new']);assert.equal(saved.journal.length,1);assert.equal(saved.legacyJournal.length,2);assert.deepEqual(saved.rows,[]);assert.equal(saved.selected,'primary');
});
test('malformed or missing storage does not restore executable or auto state',async()=>{
 for(const value of [42,'bad',[],null]){
  const gm=memory({new:value});assert.equal(await loadPanelState(gm,model,options),null);
 }
 const saved=await loadPanelState(memory({new:{model,journal:[null,false],rows:'bad',ui:[],legacyJournal:'bad',armed:true}}),model,options);
 assert.deepEqual(saved.rows,[]);assert.deepEqual(saved.journal,[]);assert.deepEqual(saved.legacyJournal,[]);assert.deepEqual(saved.ui,{});assert.equal(saved.armed,undefined);
});
