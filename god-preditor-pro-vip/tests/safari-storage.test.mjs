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
test('current matching model restores only the newest 100 object rare entries without restoring auto state',async()=>{
 const entries=Array.from({length:105},(_,i)=>({model:'rare-alert-v1',key:'rare-'+i,status:'pending'}));
 const value={model,rareJournal:[null,false,[],42,'bad',...entries],journal:[{model,status:'hit'}],armed:true,autoMode:'live',autoBet:{armed:true}};
 const original=structuredClone(value),gm=memory({new:value});
 const saved=await loadPanelState(gm,model,options);
 assert.deepEqual(gm.calls,['new']);assert.deepEqual(value,original);
 assert.deepEqual(saved.rareJournal,entries.slice(-100));assert.deepEqual(saved.journal,value.journal);
 assert.equal(saved.armed,undefined);assert.equal(saved.autoMode,undefined);assert.equal(saved.autoBet,undefined);
});
test('rare entries from legacy keys or another primary model never migrate into the current rare journal',async()=>{
 const rareJournal=[{model:'rare-alert-v1',status:'hit'}];
 for(const values of [
  {old:{model,rareJournal,journal:[{model,status:'pending'}]}},
  {old:{model:'old',rareJournal,journal:[{model:'old',status:'hit'}]}},
  {new:{model:'old',rareJournal,journal:[{model:'old',status:'hit'}]},old:{model,rareJournal}},
 ]){
  const gm=memory(values),saved=await loadPanelState(gm,model,options);
  assert.deepEqual(saved.rareJournal,[]);
  assert.deepEqual(gm.calls,values.new?['new']:['new','old']);
 }
});
test('missing or malformed current rare journal loads as an empty independent journal',async()=>{
 for(const rareJournal of [undefined,null,{},'bad',false,42,[null,[],false,'bad']]){
  const saved=await loadPanelState(memory({new:{model,rareJournal}}),model,options);
  assert.deepEqual(saved.rareJournal,[]);
 }
 const candidate={unexpected:'deferred to rare alert schema validation'};
 const saved=await loadPanelState(memory({new:{model,rareJournal:[candidate]}}),model,options);
 assert.deepEqual(saved.rareJournal,[candidate]);
});
