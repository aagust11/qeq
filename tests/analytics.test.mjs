import test from 'node:test';import assert from 'node:assert/strict';
import {leaderboard,photoExtremes} from '../analytics.js';
test('returns every tied most-correct and most-wrong photo; ignores unanswered photos',()=>{const photos=[{id:'1',responses:5,correct:3,wrong:2},{id:'2',responses:4,correct:3,wrong:1},{id:'3',responses:2,correct:0,wrong:2},{id:'4',responses:0,correct:0,wrong:0}];const r=photoExtremes(photos);assert.deepEqual(r.mostCorrect.map(p=>p.id),['1','2']);assert.deepEqual(r.mostWrong.map(p=>p.id),['1','3']);assert.deepEqual(photoExtremes([photos[3]]).mostCorrect,[]);});
test('only finished attempts enter leaderboard, ordered by score',()=>{const make=(id,answers)=>({id,startedAt:id,cards:[{id:'p',person:'Èric'}],answers});assert.deepEqual(leaderboard([make('a',[]),make('b',[{id:'p',choice:'Aleix'}]),make('c',[{id:'p',choice:'Èric'}])]).map(a=>a.id),['c','b']);});
import {winners,durationMs} from '../analytics.js';
test('winner uses correct answers then active time; exact ties share victory',()=>{
 const make=(id,ms,choice='Èric')=>({id,startedAt:id,cards:[{id:'p',person:'Èric'}],answers:[{id:'p',choice,elapsedMs:ms}]});
 const rows=[make('slow',5000),make('fast',2000),make('also-fast',2000),make('wrong',1000,'Aleix')];
 assert.deepEqual(winners(rows).players.map(a=>a.id).sort(),['also-fast','fast']);
 assert.equal(winners(rows).missingTime,false);
 assert.deepEqual(winners([make('slow',5000),make('fast',2000)]).players.map(a=>a.id),['fast']);
 assert.equal(winners([make('old',undefined),make('new',2000)]).missingTime,true);
 assert.equal(winners([make('old',undefined),make('new',2000)]).players.length,2);
 assert.equal(durationMs(make('old',undefined)),null);
 assert.deepEqual(winners([]).players,[]);
});
test('closing the game includes every unfinished attempt without inventing answers',()=>{
 const a={id:'a',startedAt:'a',cards:[{id:'p',person:'Èric'},{id:'q',person:'Aleix'}],answers:[{id:'p',choice:'Èric',elapsedMs:1234}]};
 assert.equal(leaderboard([a]).length,0);assert.equal(leaderboard([a],true).length,1);
 assert.equal(winners([a],true).players[0].score.correct,1);assert.equal(winners([a],true).players[0].score.wrong,0);
 assert.equal(a.answers.length,1);
});
test('excluded players keep their data but cannot win, and can be included again',()=>{
 const a={id:'a',startedAt:'a',eligible:false,cards:[{id:'p',person:'Èric'}],answers:[{id:'p',choice:'Èric',elapsedMs:1}]};
 assert.equal(winners([a],true).players.length,0);assert.equal(a.answers.length,1);a.eligible=true;assert.equal(winners([a],true).players.length,1);
});
