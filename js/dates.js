// Dates are stored as "YYYY-MM-DD" in your local time zone, so a new day starts
// at your midnight rather than at midnight UTC.

export function toDateKey(date = new Date()) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function fromDateKey(key) {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function addDays(key, amount) {
  const date = fromDateKey(key);
  date.setDate(date.getDate() + amount);
  return toDateKey(date);
}

export function daysBetween(earlierKey, laterKey) {
  // Rounding absorbs the 23- and 25-hour days around daylight saving changes.
  return Math.round((fromDateKey(laterKey) - fromDateKey(earlierKey)) / 86400000);
}

export function formatDate(key, options = { month: 'short', day: 'numeric' }) {
  return fromDateKey(key).toLocaleDateString(undefined, options);
}
