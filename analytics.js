import {tally} from './core.js';
export function leaderboard(attempts,closed=false){
 return attempts.filter(a=>a.cards.length>0&&(closed||a.answers.length===a.cards.length)).map(a=>({...a,score:tally(a)})).sort((a,b)=>b.score.correct-a.score.correct||(durationMs(a)??Infinity)-(durationMs(b)??Infinity)||a.startedAt.localeCompare(b.startedAt));
}
export function photoExtremes(photos){
 const answered=photos.filter(p=>p.responses>0);
 const maxCorrect=Math.max(0,...answered.map(p=>p.correct)),maxWrong=Math.max(0,...answered.map(p=>p.wrong));
 return {mostCorrect:maxCorrect?answered.filter(p=>p.correct===maxCorrect):[],mostWrong:maxWrong?answered.filter(p=>p.wrong===maxWrong):[],maxCorrect,maxWrong};
}
export function localPhotoStats(attempts){
 const map=new Map();for(const a of attempts){for(const c of a.cards)if(!map.has(c.id))map.set(c.id,{...c,responses:0,correct:0,wrong:0,accuracy:null});for(const answer of a.answers){const p=map.get(answer.id);if(!p)continue;p.responses++;if(p.person===answer.choice)p.correct++;else p.wrong++;}}
 return [...map.values()].map(p=>({...p,accuracy:p.responses?100*p.correct/p.responses:null}));
}

export function durationMs(a){
 if(!a.answers.length||a.answers.some(v=>!Number.isSafeInteger(v.elapsedMs)||v.elapsedMs<0))return null;
 return a.answers.at(-1).elapsedMs;
}
export function winners(attempts,closed=false){
 const ranking=leaderboard(attempts,closed);if(!ranking.length)return {players:[],missingTime:false};
 const top=ranking.filter(a=>a.score.correct===ranking[0].score.correct);
 const missingTime=top.length>1&&top.some(a=>durationMs(a)===null);
 const fastest=Math.min(...top.map(a=>durationMs(a)??Infinity));
 return {players:missingTime?top:top.filter(a=>(durationMs(a)??Infinity)===fastest),missingTime};
}
export function formatTime(ms){if(ms===null)return 'Temps no registrat';const seconds=Math.floor(ms/1000);return `${Math.floor(seconds/60)} min ${String(seconds%60).padStart(2,'0')},${String(ms%1000).padStart(3,'0')} s`;}
