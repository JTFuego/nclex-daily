// The only file that touches browser storage. Everything is one JSON object:
//
// {
//   version: 1,
//   days: {
//     "2026-11-04": {
//       ids: ["pharm-014", ...],            the day's question set, in order
//       responses: { "pharm-014": [0, 2] }, what you answered
//       completedAt: 1762300000000          set once all questions are answered
//     }
//   },
//   attempts: [
//     { id, topic, date, at, earned, possible, mode }   mode: "daily" | "extra"
//   ]
// }
//
// Every statistic in the app is calculated from `attempts`, so nothing can
// fall out of sync.

const KEY = 'nursing-study-app';
const VERSION = 1;

function emptyData() {
  return { version: VERSION, days: {}, attempts: [] };
}

function isValidData(data) {
  return (
    !!data &&
    typeof data === 'object' &&
    data.version === VERSION &&
    !!data.days &&
    typeof data.days === 'object' &&
    !Array.isArray(data.days) &&
    Array.isArray(data.attempts)
  );
}

let data = null;
let lastSaveFailed = false;

export function load() {
  if (data) return data;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (isValidData(parsed)) {
        data = parsed;
        return data;
      }
      // Never silently overwrite data we can't read.
      localStorage.setItem(`${KEY}-unreadable-${Date.now()}`, raw);
    }
  } catch (error) {
    console.error('Could not read saved progress', error);
  }
  data = emptyData();
  return data;
}

export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
    lastSaveFailed = false;
  } catch (error) {
    console.error('Could not save progress', error);
    lastSaveFailed = true;
  }
  return !lastSaveFailed;
}

export function saveFailed() {
  return lastSaveFailed;
}

export function exportBackup() {
  return JSON.stringify(load(), null, 1);
}

// Throws if the file isn't a valid backup. Returns the count of new attempts.
export function importBackup(text) {
  let incoming;
  try {
    incoming = JSON.parse(text);
  } catch {
    throw new Error('That file is not a valid backup.');
  }
  if (!isValidData(incoming)) throw new Error('That file is not a valid backup.');

  const added = mergeData(load(), incoming);
  save();
  return added;
}

// Merges a backup into current data rather than replacing it, so progress
// from your phone and your laptop can be combined in either direction.
export function mergeData(current, incoming) {
  const attemptKey = (a) => `${a.id}|${a.at}`;
  const known = new Set(current.attempts.map(attemptKey));
  const added = incoming.attempts.filter(
    (a) => a && typeof a.id === 'string' && Number.isFinite(a.at) && !known.has(attemptKey(a)),
  );
  current.attempts.push(...added);
  current.attempts.sort((a, b) => a.at - b.at);

  // If both devices worked on the same day, keep whichever got further.
  // Both devices' attempts still count toward topic accuracy.
  for (const [date, day] of Object.entries(incoming.days)) {
    if (!day || !Array.isArray(day.ids) || !day.responses) continue;
    const mine = current.days[date];
    const further =
      !mine ||
      (day.completedAt && !mine.completedAt) ||
      (!mine.completedAt &&
        Object.keys(day.responses).length > Object.keys(mine.responses).length);
    if (further) current.days[date] = day;
  }

  return added.length;
}
