import test from 'node:test';import assert from 'node:assert/strict';import {photoPreloader} from '../preload.js';
test('background loading shares downloads with the first-photo request and limits workers',async()=>{
 let active=0,max=0,calls=0;const remembered=[];
 const loader=photoPreloader({concurrency:3,fetchPhoto:async c=>{calls++;active++;max=Math.max(max,active);await new Promise(r=>setTimeout(r,3));active--;return c.id;},remember:c=>remembered.push(c.id)});
 const cards=Array.from({length:12},(_,i)=>({id:String(i)}));const warming=loader.warm(cards);
 const first=await loader.ensure(cards[0]);assert.equal(first,'0');await warming;
 assert.equal(calls,12);assert.equal(remembered.length,12);assert(max<=3);await loader.ensure(cards[0]);assert.equal(calls,12);
});
test('failed preload can retry without blocking other photos',async()=>{let calls=0;const loader=photoPreloader({fetchPhoto:async()=>{if(++calls===1)throw Error('offline');return 'url';},remember:()=>{}});await loader.warm([{id:'a'}]);assert.equal(await loader.ensure({id:'a'}),'url');});
