import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sourceReady} from '../safari/src/freshness.mjs';
const now=Date.UTC(2026,10,2),stats={ready:true,lastAt:now-1000};
test('source readiness requires fresh successful polling and nonfuture completed provider time',()=>{
 assert.equal(sourceReady('connected',stats,now-12000,now),true);
 for(const success of [now-12001,now+1,NaN,null])assert.equal(sourceReady('connected',stats,success,now),false);
 for(const lastAt of [now+1,now-180001,NaN,null])assert.equal(sourceReady('connected',{...stats,lastAt},now,now),false);
 assert.equal(sourceReady('connecting',stats,now,now),false);
 assert.equal(sourceReady('connected',{...stats,ready:false},now,now),false);
});
