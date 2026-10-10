import {tally} from './core.js';
export function leaderboard(attempts){
 return attempts.filter(a=>a.cards.length>0&&a.answers.length===a.cards.length).map(a=>({...a,score:tally(a)})).sort((a,b)=>b.score.correct-a.score.correct||a.score.wrong-b.score.wrong||a.startedAt.localeCompare(b.startedAt));
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
