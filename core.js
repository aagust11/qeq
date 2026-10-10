export const BLOCK_SIZE = 7;
export const PEOPLE = ['Èric', 'Aleix'];
export function shuffled(cards, random = Math.random) {
  const result = [...cards];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
export function tally(attempt, from = 0, to = attempt.answers.length) {
  const lookup = new Map(attempt.cards.map(c => [c.id, c.person]));
  const answers = attempt.answers.slice(from, to);
  const correct = answers.filter(a => lookup.get(a.id) === a.choice).length;
  return {correct, wrong: answers.length - correct, count: answers.length};
}
export function completedCount(attempt) {
  return attempt.answers.length === attempt.cards.length ? attempt.answers.length : Math.floor(attempt.answers.length / BLOCK_SIZE) * BLOCK_SIZE;
}
export function blocks(attempt) {
  const result = [];
  for (let start = 0; start < completedCount(attempt); start += BLOCK_SIZE) {
    result.push({...tally(attempt, start, Math.min(start + BLOCK_SIZE, attempt.answers.length)), number: result.length + 1});
  }
  return result;
}
export function validAttempt(a) {
  if (!a || a.schema !== 2 || typeof a.id !== 'string' || !/^[a-f0-9-]{36}$/.test(a.id) || typeof a.secret !== 'string' || !/^[a-f0-9-]{36}$/.test(a.secret)) return false;
  if (typeof a.firstName !== 'string' || typeof a.lastName !== 'string' || !a.firstName.trim() || !a.lastName.trim() || a.firstName.length > 80 || a.lastName.length > 120) return false;
  if (!Array.isArray(a.cards) || !a.cards.length || a.cards.length > 2000 || !Array.isArray(a.answers) || a.answers.length > a.cards.length) return false;
  const seen = new Set();
  for (const c of a.cards) {
    if (!c || typeof c.id !== 'string' || seen.has(c.id) || !PEOPLE.includes(c.person) || !/^photos\/[a-f0-9]{24}\.(jpg|jpeg|png|webp)$/.test(c.src)) return false;
    seen.add(c.id);
  }
  return a.answers.every((v,i) => v?.id === a.cards[i].id && PEOPLE.includes(v.choice));
}
