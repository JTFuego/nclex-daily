// Holds the signed-in person's progress in memory and keeps it in sync with the
// cloud. The rest of the app uses load() and save() and never touches the cloud.
//
// In memory, everything is one object:
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
//     { id, topic, date, at, earned, possible, mode,   mode: "daily" | "extra"
//       timeMs, confidence }                           optional; older answers lack them
//   ]                                                  confidence: "guess" | "unsure" | "sure"
// }
//
// In the cloud, each date is one document (see dayToDoc). Your streak, daily
// scores, and topic accuracy are calculated from these, so they can't disagree.

const LEGACY_KEY = 'nursing-study-app'; // where progress lived before accounts
const IMPORTED_BY_KEY = 'nursing-study-imported-by';
const DECLINED_PREFIX = 'nursing-study-import-declined-';
const VERSION = 1;
const FIRST_SYNC_WAIT_MS = 4000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function emptyData() {
  return { version: VERSION, days: {}, attempts: [] };
}

function isValidData(value) {
  return (
    !!value &&
    typeof value === 'object' &&
    value.version === VERSION &&
    !!value.days &&
    typeof value.days === 'object' &&
    !Array.isArray(value.days) &&
    Array.isArray(value.attempts)
  );
}

let data = emptyData();
let cloud = null;
let userId = null;
let stopListening = null;
let known = {}; // what the cloud has for each date, to send only what changed
let lastSaveFailed = false;

const attemptKey = (attempt) => `${attempt.id}_${attempt.at}`;

// JSON with sorted keys, so two equal documents always compare as equal.
function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/* ---------- Converting between memory and cloud documents ---------- */

// Attempts become a map, so merging two devices' writes keeps both devices' answers.
// Responses are stored as text because Firestore doesn't allow lists inside lists,
// which case studies use. completedAt is left out until set, so a device that
// hasn't heard about a finished day can't erase it.
export function dayToDoc(source, date) {
  const result = {};
  const day = source.days[date];
  if (day) {
    result.ids = day.ids;
    const responses = {};
    for (const [id, response] of Object.entries(day.responses ?? {})) {
      const text = JSON.stringify(response);
      if (text !== undefined) responses[id] = text;
    }
    if (Object.keys(responses).length) result.responses = responses;
    if (day.completedAt) result.completedAt = day.completedAt;
  }
  const attempts = {};
  for (const attempt of source.attempts) {
    if (attempt.date !== date) continue;
    const { id, topic, at, earned, possible, mode, timeMs, confidence } = attempt;
    const saved = { id, topic, at, earned, possible, mode };
    // Left out when unknown, because Firestore rejects undefined values.
    if (timeMs !== undefined) saved.timeMs = timeMs;
    if (confidence !== undefined) saved.confidence = confidence;
    attempts[attemptKey(attempt)] = saved;
  }
  if (Object.keys(attempts).length) result.attempts = attempts;
  return result;
}

// Updates objects in place, because an open quiz may be holding on to them.
export function applyDoc(target, date, cloudDoc) {
  if (cloudDoc.ids) {
    const day = (target.days[date] ??= { ids: [], responses: {}, completedAt: null });
    day.ids = cloudDoc.ids;
    for (const [id, text] of Object.entries(cloudDoc.responses ?? {})) {
      try {
        day.responses[id] = JSON.parse(text);
      } catch {
        console.warn(`Skipped an unreadable saved answer for ${id}`);
      }
    }
    if (cloudDoc.completedAt) day.completedAt = cloudDoc.completedAt;
  }
  const have = new Set(target.attempts.filter((a) => a.date === date).map(attemptKey));
  let added = false;
  for (const attempt of Object.values(cloudDoc.attempts ?? {})) {
    if (have.has(attemptKey(attempt))) continue;
    target.attempts.push({ ...attempt, date });
    added = true;
  }
  if (added) target.attempts.sort((a, b) => a.at - b.at);
}

export function removeDay(target, date) {
  delete target.days[date];
  target.attempts = target.attempts.filter((attempt) => attempt.date !== date);
}

/* ---------- Connecting and saving ---------- */

export function load() {
  return data;
}

// Starts syncing. Resolves once the latest progress has arrived, or after a
// short wait if offline, so a new day's set isn't chosen from stale data.
export function connect(cloudApi, uid, onRemoteChange) {
  disconnect();
  cloud = cloudApi;
  userId = uid;
  return new Promise((resolve) => {
    let ready = false;
    const finish = () => {
      if (!ready) {
        ready = true;
        resolve();
      }
    };
    stopListening = cloud.listenDays(
      uid,
      ({ changes, fromCache }) => {
        let changed = false;
        for (const change of changes) {
          if (change.type === 'removed') {
            removeDay(data, change.date);
            delete known[change.date];
            changed = true;
            continue;
          }
          const text = stable(change.doc);
          if (text === known[change.date]) continue; // our own write coming back
          applyDoc(data, change.date, change.doc);
          known[change.date] = text;
          changed = true;
        }
        const alreadyDrawn = ready; // the first update is shown by whoever awaits connect()
        if (!fromCache || !navigator.onLine) finish();
        if (alreadyDrawn && changed) onRemoteChange();
      },
      (error) => {
        console.error('Could not sync progress', error);
        lastSaveFailed = true;
        finish();
      },
    );
    setTimeout(finish, FIRST_SYNC_WAIT_MS);
  });
}

export function disconnect() {
  stopListening?.();
  stopListening = null;
  cloud = null;
  userId = null;
  known = {};
  data = emptyData();
}

// Sends each date that changed. Offline writes wait in the cache until reconnected.
export function save() {
  if (!cloud) return false;
  const dates = new Set([...Object.keys(data.days), ...data.attempts.map((a) => a.date)]);
  for (const date of dates) {
    const cloudDoc = dayToDoc(data, date);
    const text = stable(cloudDoc);
    if (text === known[date]) continue;
    known[date] = text;
    cloud
      .writeDay(userId, date, cloudDoc)
      .then(() => {
        lastSaveFailed = false;
      })
      .catch((error) => {
        console.error('Could not save progress', error);
        delete known[date]; // try this date again on the next save
        lastSaveFailed = true;
      });
  }
  return true;
}

export function saveFailed() {
  return lastSaveFailed;
}

/* ---------- Backup files ---------- */

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

// Merges a backup into current data rather than replacing it.
export function mergeData(current, incoming) {
  const seen = new Set(current.attempts.map(attemptKey));
  const added = incoming.attempts.filter(
    (a) =>
      a &&
      typeof a.id === 'string' &&
      Number.isFinite(a.at) &&
      DATE_PATTERN.test(a.date) &&
      !seen.has(attemptKey(a)),
  );
  current.attempts.push(...added);
  current.attempts.sort((a, b) => a.at - b.at);

  // If both copies worked on the same day, keep whichever got further.
  // Both copies' attempts still count toward topic accuracy.
  for (const [date, day] of Object.entries(incoming.days)) {
    if (!DATE_PATTERN.test(date) || !day || !Array.isArray(day.ids) || !day.responses) continue;
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

/* ---------- Progress saved in this browser before accounts ---------- */

function readLocal(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLocal(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (error) {
    console.warn('Could not save a browser setting', error);
  }
}

// The older progress, unless an account has already imported it.
function legacyData() {
  if (readLocal(IMPORTED_BY_KEY)) return null;
  try {
    const parsed = JSON.parse(readLocal(LEGACY_KEY));
    return isValidData(parsed) && parsed.attempts.length ? parsed : null;
  } catch {
    return null;
  }
}

export function legacySummary() {
  const legacy = legacyData();
  if (!legacy) return null;
  return { answers: legacy.attempts.length, days: Object.keys(legacy.days).length };
}

export function shouldOfferImport(uid) {
  return !!legacyData() && !readLocal(DECLINED_PREFIX + uid);
}

export function declineImport(uid) {
  writeLocal(DECLINED_PREFIX + uid, '1');
}

export function importLegacy(uid) {
  const legacy = legacyData();
  if (!legacy) return 0;
  const added = mergeData(load(), legacy);
  save();
  writeLocal(IMPORTED_BY_KEY, uid); // so a second account here isn't offered this data
  return added;
}

// Used by "Delete my data": removes the browser copy only if this account imported it.
export function forgetLegacy(uid) {
  try {
    if (readLocal(IMPORTED_BY_KEY) === uid) {
      localStorage.removeItem(LEGACY_KEY);
      localStorage.removeItem(IMPORTED_BY_KEY);
    }
    localStorage.removeItem(DECLINED_PREFIX + uid);
  } catch (error) {
    console.warn('Could not clear browser data', error);
  }
}
