// Picks which questions appear in a set.
//
// Which topics: every topic gets one question, then the remaining slots go to
// topics at random, with weak topics far more likely to win each slot.
//
// Which questions within a topic, highest priority first:
//   1. Ones you missed (at least 2 days ago)
//   2. Ones you've never seen
//   3. Ones you got right, gradually returning over 2 weeks

import { credit } from './scoring.js';
import { daysBetween } from './dates.js';
import { weaknessScores } from './progress.js';

const MISSED_WAIT_DAYS = 2;
const CORRECT_RETURN_DAYS = 14;
const WEIGHT_FLOOR = 0.02; // keeps strong topics possible for the open slots

function lastAttempts(attempts) {
  const last = new Map();
  for (const attempt of attempts) last.set(attempt.id, attempt); // attempts are in time order
  return last;
}

function priority(question, last, today, random) {
  const attempt = last.get(question.id);
  const jitter = random() * 0.5;
  if (!attempt) return 3 + jitter;
  const age = daysBetween(attempt.date, today);
  if (credit(attempt) < 1) return age >= MISSED_WAIT_DAYS ? 4 + jitter : jitter - 1;
  return Math.min(age / CORRECT_RETURN_DAYS, 1) + jitter - 0.5;
}

function weightedPick(items, weightOf, random) {
  const total = items.reduce((sum, item) => sum + weightOf(item), 0);
  let roll = random() * total;
  for (const item of items) {
    roll -= weightOf(item);
    if (roll <= 0) return item;
  }
  return items[items.length - 1];
}

export function shuffled(items, random = Math.random) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// Returns question ids. `exclude` is a list of ids to leave out.
// `maxCases` limits case studies because they take much longer than other items.
export function pickSet({
  questions,
  topics,
  attempts,
  today,
  count,
  exclude = [],
  maxCases = 2,
  random = Math.random,
}) {
  const last = lastAttempts(attempts);
  const excluded = new Set(exclude);
  const queues = new Map();
  for (const topic of topics) {
    const queue = questions
      .filter((q) => q.topic === topic.id && !excluded.has(q.id))
      .map((q) => ({ q, score: priority(q, last, today, random) }))
      .sort((a, b) => b.score - a.score)
      .map(({ q }) => q);
    if (queue.length) queues.set(topic.id, queue);
  }

  const picked = [];
  let cases = 0;
  const takeFrom = (topicId) => {
    const queue = queues.get(topicId);
    const index = queue.findIndex((q) => q.type !== 'case' || cases < maxCases);
    if (index === -1) {
      queues.delete(topicId);
      return;
    }
    const [question] = queue.splice(index, 1);
    if (question.type === 'case') cases += 1;
    picked.push(question.id);
    if (!queue.length) queues.delete(topicId);
  };

  // Smaller sets (like extra practice) skip the one-per-topic step so that
  // weak topics still get most of the slots.
  if (count >= topics.length * 2) {
    for (const topicId of shuffled([...queues.keys()], random)) takeFrom(topicId);
  }

  const weakness = weaknessScores(topics, attempts);
  const weightOf = (topicId) => WEIGHT_FLOOR + weakness[topicId] ** 2;
  while (picked.length < count && queues.size) {
    takeFrom(weightedPick([...queues.keys()], weightOf, random));
  }

  return shuffled(picked, random);
}
