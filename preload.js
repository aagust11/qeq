// Shared promises avoid downloading the same photo twice while the name form is open.
export function photoPreloader({fetchPhoto,remember,onProgress=()=>{},concurrency=4}){
 const ready=new Map(),pending=new Map();let total=0;
 function ensure(card){
  if(ready.has(card.id))return Promise.resolve(ready.get(card.id));
  if(pending.has(card.id))return pending.get(card.id);
  const task=Promise.resolve().then(()=>fetchPhoto(card)).then(value=>{ready.set(card.id,value);remember(card,value);onProgress(ready.size,total);return value;}).finally(()=>pending.delete(card.id));
  pending.set(card.id,task);return task;
 }
 async function warm(cards){total=Math.max(total,cards.length);let index=0;onProgress(ready.size,total);await Promise.all(Array.from({length:Math.min(concurrency,cards.length)},async()=>{while(index<cards.length){const card=cards[index++];try{await ensure(card);}catch{}}}));}
 return {ensure,warm,ready};
}
