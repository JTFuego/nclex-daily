// Calculates statistics from saved data. Pure functions: pass data in, get numbers out.

import { credit } from './scoring.js';
import { addDays } from './dates.js';

const RECENT_ATTEMPTS = 30; // topic accuracy for weighting reflects recent work
const PRIOR_ACCURACY = 0.7; // assumed accuracy before there is much evidence
const PRIOR_STRENGTH = 3; // how many "pretend attempts" that assumption is worth

export function dayScore(day, attempts, date) {
  // Keyed by question, in case a merged backup holds the same question twice.
  const byQuestion = new Map();
  for (const a of attempts) {
    if (a.date === date && a.mode === 'daily' && day.ids.includes(a.id)) byQuestion.set(a.id, a);
  }
  const results = [...byQuestion.values()];
  if (!results.length) return null;
  const total = results.reduce((sum, a) => sum + credit(a), 0);
  return {
    percent: Math.round((total / results.length) * 100),
    fullyCorrect: results.filter((a) => a.earned === a.possible).length,
    answered: results.length,
  };
}

// Consecutive finished days, ending today or yesterday. An unfinished today
// doesn't break the streak until the day is over.
export function currentStreak(days, today) {
  const done = (date) => !!days[date]?.completedAt;
  let date = done(today) ? today : addDays(today, -1);
  let streak = 0;
  while (done(date)) {
    streak += 1;
    date = addDays(date, -1);
  }
  return streak;
}

export function longestStreak(days) {
  const finished = Object.keys(days)
    .filter((date) => days[date].completedAt)
    .sort();
  let longest = 0;
  let run = 0;
  finished.forEach((date, i) => {
    run = i > 0 && addDays(finished[i - 1], 1) === date ? run + 1 : 1;
    longest = Math.max(longest, run);
  });
  return longest;
}

// Lifetime accuracy for the dashboard, weakest first. Topics with no attempts go last.
export function topicAccuracy(topics, attempts) {
  return topics
    .map((topic) => {
      const mine = attempts.filter((a) => a.topic === topic.id);
      const total = mine.reduce((sum, a) => sum + credit(a), 0);
      return {
        ...topic,
        attempts: mine.length,
        percent: mine.length ? Math.round((total / mine.length) * 100) : null,
      };
    })
    .sort((a, b) => (a.percent ?? 101) - (b.percent ?? 101));
}

// Recent accuracy for choosing questions, pulled toward PRIOR_ACCURACY so that
// one unlucky answer doesn't flood the next set with that topic.
export function weaknessScores(topics, attempts) {
  const scores = {};
  for (const topic of topics) {
    const recent = attempts.filter((a) => a.topic === topic.id).slice(-RECENT_ATTEMPTS);
    const total = recent.reduce((sum, a) => sum + credit(a), 0);
    const accuracy =
      (total + PRIOR_ACCURACY * PRIOR_STRENGTH) / (recent.length + PRIOR_STRENGTH);
    scores[topic.id] = 1 - accuracy;
  }
  return scores;
}
