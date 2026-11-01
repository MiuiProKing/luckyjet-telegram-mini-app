// Regression for the preserved v1 next-round model; the live app uses window-model.mjs.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {analyze,advanceJournal,summary} from '../small-model.mjs';
const now=1793560000000;
const history=()=>Array.from({length:400},(_,i)=>({id:'r'+i,coefficient:i%2?2.5:1.6,timestamp:now-(399-i)*20000}));
test('targets are 1.50 and 2; the next-round chance is not inflated into any-hit window',()=>{
 const s=analyze(history(),now);assert.equal(s.ready,true);assert.deepEqual(s.targets.map(x=>x.target),[1.5,2]);assert.equal(s.targets[0].probability,1);assert.equal(s.targets[1].probability,.5);assert.equal(s.cadenceMs,20000);
});
test('only a future round after acceptance can resolve a frozen snapshot',()=>{
 const rows=history(),stats=analyze(rows,now),first=advanceJournal([],rows,stats,now).journal;
 assert.equal(first.length,2);assert.ok(first.every(x=>x.status==='pending'));
 assert.ok(advanceJournal(first,rows,stats,now+1000).journal.every(x=>x.status==='pending'));
 const future={id:'future',timestamp:now+20000,coefficient:1.7};const result=advanceJournal(first,[...rows,future],analyze([...rows,future],now+20000),now+20000).journal;
 assert.equal(result[0].status,'hit');assert.equal(result[1].status,'miss');assert.equal(result[1].probability,.5);assert.equal(summary(result).known,2);
});
test('stale data and expired or gapped results are not reported as successes',()=>{
 const rows=history(),stats=analyze(rows,now),j=advanceJournal([],rows,stats,now).journal;
 assert.equal(analyze(rows,now+180001).ready,false);
 assert.ok(advanceJournal(j,rows,{ready:false},now+180001).journal.every(x=>x.status==='unknown'));
 const gap={id:'gap',timestamp:now+100000,coefficient:10};assert.ok(advanceJournal(j,[...rows,gap],{ready:false},now+100000).journal.every(x=>x.status==='unknown'));
});
test('future input is excluded from analysis',()=>{
 assert.deepEqual(analyze([...history(),{id:'future',timestamp:now+10000,coefficient:100}],now),analyze(history(),now));
});
