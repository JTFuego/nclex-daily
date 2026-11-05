// Starts the app, loads the questions, and draws the home and results screens.

import { h, svg, show } from './ui.js';
import { setupThemeToggle } from './theme.js';
import { isConfigured } from './firebase-config.js';
import {
  load,
  save,
  saveFailed,
  connect,
  disconnect,
  exportBackup,
  importBackup,
  legacySummary,
  shouldOfferImport,
  declineImport,
  importLegacy,
  forgetLegacy,
} from './storage.js';
import { toDateKey, addDays, formatDate } from './dates.js';
import { pickSet } from './selector.js';
import { runQuiz } from './quiz.js';
import { credit, isComplete } from './scoring.js';
import { currentStreak, longestStreak, dayScore, topicAccuracy, tagAccuracy, weakestRow } from './progress.js';
import { TEST_PLAN, JUDGMENT_STEPS } from './tags.js';

const DAILY_COUNT = 20;
const EXTRA_COUNT = 10;
const CHART_DAYS = 14;
const MIN_ANSWERS_FOR_WEAKEST = 5;

// Topic status flags: under WEAK_BELOW is red, under STRONG_FROM is yellow, the rest green.
const WEAK_BELOW = 65;
const STRONG_FROM = 80;

const root = document.getElementById('app');
const tabsNav = document.getElementById('tabs');
let topics = [];
let questionsById = new Map();
let onHome = false;
let activeTab = 'today';
let cloud = null; // loaded in start(), so a blocked connection can show a clear message
let currentUser = null;
const FLASH_KEY = 'nursing-study-flash';

/* ---------- Chart header and tabs ---------- */

function updateHeader() {
  const today = toDateKey();
  const streak = currentStreak(load().days, today);
  const label = `${streak} ${streak === 1 ? 'day' : 'days'}`;
  document.getElementById('chart-date').textContent = formatDate(today, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  document.getElementById('chart-streak-count').textContent = label;
  const box = document.getElementById('chart-streak');
  box.hidden = !currentUser;
  box.classList.toggle('is-active', streak > 0);
  box.setAttribute('aria-label', `Current streak: ${label}`);
}

// Tabs stay hidden during a quiz and on results, so a set can't be left by accident.
function leaveHome() {
  onHome = false;
  tabsNav.hidden = true;
  updateHeader();
}

tabsNav.addEventListener('click', (event) => {
  const tab = event.target.closest('[data-tab]');
  if (!tab) return;
  activeTab = tab.dataset.tab;
  drawHome();
});

const topicName = (id) => topics.find((t) => t.id === id)?.name ?? id;

// Skips ids no longer in the question files, so saved sets survive question edits.
const questionsFor = (ids) => ids.map((id) => questionsById.get(id)).filter(Boolean);

async function loadQuestions() {
  const fetchJson = async (path) => {
    const response = await fetch(path);
    if (!response.ok) throw new Error(`${path}: ${response.status}`);
    return response.json();
  };
  topics = await fetchJson('data/topics.json');
  const files = await Promise.all(topics.map((t) => fetchJson(`data/questions/${t.id}.json`)));
  questionsById = new Map(files.flat().map((q) => [q.id, q]));
}

function recordAnswer(question, result, date, mode, { timeMs, confidence }) {
  const data = load();
  const attempt = {
    id: question.id,
    topic: question.topic,
    date,
    at: Date.now(),
    earned: result.earned,
    possible: result.possible,
    mode,
  };
  // Older answers don't have these, so everything treats them as optional.
  if (timeMs !== undefined) attempt.timeMs = timeMs;
  if (confidence) attempt.confidence = confidence;
  data.attempts.push(attempt);
  save();
}

/* ---------- Daily set ---------- */

function startDaily(startIndex) {
  const data = load();
  const today = toDateKey();
  const allQuestions = [...questionsById.values()];
  if (!data.days[today]) {
    data.days[today] = {
      ids: pickSet({
        questions: allQuestions,
        topics,
        attempts: data.attempts,
        today,
        count: DAILY_COUNT,
      }),
      responses: {},
      completedAt: null,
    };
    save();
  }
  const day = data.days[today];
  leaveHome();
  runQuiz({
    root,
    questions: questionsFor(day.ids),
    responses: day.responses,
    topicName,
    seed: today,
    startIndex,
    onAnswered: (question, result, details) => {
      recordAnswer(question, result, today, 'daily', details);
      const finished = questionsFor(day.ids).every((q) => isComplete(q, day.responses[q.id]));
      if (finished && !day.completedAt) {
        day.completedAt = Date.now();
        save();
        updateHeader();
      }
    },
    onSaveProgress: save,
    onExit: drawHome,
    onDone: () => drawResults(today),
  });
}

/* ---------- Extra practice ---------- */

// `match`, when given, limits the set to questions it accepts, such as one category.
function startExtra(match = null) {
  const data = load();
  const today = toDateKey();
  const ids = pickSet({
    questions: [...questionsById.values()].filter((q) => !match || match(q)),
    topics,
    attempts: data.attempts,
    today,
    count: EXTRA_COUNT,
    exclude: data.days[today]?.ids ?? [],
    maxCases: 1,
  });
  const questions = questionsFor(ids);
  const results = new Map();
  if (!questions.length) {
    leaveHome();
    show(
      root,
      h(
        'section',
        { class: 'card' },
        h('h2', {}, 'No questions available'),
        h('p', { class: 'muted' }, 'All the questions here are in today’s set. Finish it first, then try again tomorrow.'),
        h('button', { type: 'button', class: 'button-primary', onclick: drawHome }, 'Back'),
      ),
    );
    return;
  }
  leaveHome();
  runQuiz({
    root,
    questions,
    responses: {}, // extra sets aren't resumable, but every answer still counts
    topicName,
    seed: `${today}extra${Date.now()}`,
    onAnswered: (question, result, details) => {
      results.set(question.id, result);
      recordAnswer(question, result, today, 'extra', details);
    },
    onExit: drawHome,
    onDone: () => drawExtraResults(questions, results, match),
  });
}

/* ---------- Results ---------- */

function topicBreakdown(rows) {
  return h(
    'ul',
    { class: 'breakdown' },
    rows.map(({ name, correct, total }) =>
      h(
        'li',
        {},
        h('span', {}, name),
        h('span', { class: 'breakdown-value' }, `${correct} of ${total} fully correct`),
      ),
    ),
  );
}

function breakdownRows(questions, isFullyCorrect) {
  const byTopic = new Map();
  for (const q of questions) {
    const row = byTopic.get(q.topic) ?? { name: topicName(q.topic), correct: 0, total: 0 };
    row.total += 1;
    if (isFullyCorrect(q)) row.correct += 1;
    byTopic.set(q.topic, row);
  }
  return [...byTopic.values()].sort((a, b) => a.correct / a.total - b.correct / b.total);
}

function drawResults(date) {
  const data = load();
  const day = data.days[date];
  const score = dayScore(day, data.attempts, date);
  const questions = questionsFor(day.ids);
  const latest = new Map();
  for (const a of data.attempts) {
    if (a.date === date && a.mode === 'daily') latest.set(a.id, a);
  }
  const streak = currentStreak(data.days, toDateKey());
  leaveHome();
  show(
    root,
    h(
      'section',
      { class: 'card results' },
      h('p', { class: 'eyebrow' }, "Today's set complete"),
      h('p', { class: 'hero-number' }, `${score.percent}%`),
      h('p', { class: 'muted' }, `${score.fullyCorrect} of ${score.answered} fully correct · ${streak}-day streak`),
    ),
    h(
      'section',
      { class: 'card' },
      h('h2', {}, 'By topic'),
      topicBreakdown(
        breakdownRows(questions, (q) => {
          const a = latest.get(q.id);
          return a && a.earned === a.possible;
        }),
      ),
    ),
    h(
      'div',
      { class: 'button-row' },
      h('button', { type: 'button', class: 'button-secondary', onclick: () => startDaily(0) }, 'Review answers'),
      h('button', { type: 'button', class: 'button-primary', onclick: drawHome }, 'Done'),
    ),
  );
}

function drawExtraResults(questions, results, match) {
  const answered = questions.filter((q) => results.has(q.id));
  const total = answered.reduce((sum, q) => sum + credit(results.get(q.id)), 0);
  const percent = answered.length ? Math.round((total / answered.length) * 100) : 0;
  leaveHome();
  show(
    root,
    h(
      'section',
      { class: 'card results' },
      h('p', { class: 'eyebrow' }, 'Extra practice complete'),
      h('p', { class: 'hero-number' }, `${percent}%`),
      h('p', { class: 'muted' }, 'These answers count toward topic accuracy, not your daily score.'),
    ),
    h(
      'div',
      { class: 'button-row' },
      h('button', { type: 'button', class: 'button-secondary', onclick: () => startExtra(match) }, 'More practice'),
      h('button', { type: 'button', class: 'button-primary', onclick: drawHome }, 'Done'),
    ),
  );
}

/* ---------- Home ---------- */

function progressRing(answered, total) {
  const percent = total ? (answered / total) * 100 : 0;
  const circle = { cx: 60, cy: 60, r: 52, fill: 'none', 'stroke-width': 12 };
  return h(
    'div',
    { class: 'ring', role: 'img', 'aria-label': `${answered} of ${total} questions answered` },
    svg(
      'svg',
      { viewBox: '0 0 120 120', 'aria-hidden': 'true' },
      svg('circle', { ...circle, class: 'ring-track' }),
      answered > 0
        ? svg('circle', {
            ...circle,
            class: 'ring-fill',
            pathLength: 100,
            'stroke-dasharray': `${percent} 100`,
            'stroke-linecap': 'round',
            transform: 'rotate(-90 60 60)',
          })
        : '',
    ),
    h(
      'div',
      { class: 'ring-label', 'aria-hidden': 'true' },
      h('span', { class: 'ring-count' }, `${answered}/${total}`),
      h('span', { class: 'ring-caption' }, answered === total ? 'done' : 'answered'),
    ),
  );
}

function todayCard(data, today) {
  const day = data.days[today];
  const questions = day ? questionsFor(day.ids) : [];
  const answered = questions.filter((q) => isComplete(q, day.responses[q.id])).length;
  const total = day ? questions.length : DAILY_COUNT;

  const panel = (title, ...details) =>
    h(
      'section',
      { class: 'card today' },
      h('h2', {}, title),
      h(
        'div',
        { class: 'today-body' },
        progressRing(answered, total),
        h('div', { class: 'today-details' }, details),
      ),
    );

  if (!day) {
    return panel(
      "Today's set",
      h('p', { class: 'muted' }, `${DAILY_COUNT} questions, weighted toward your weak topics.`),
      h('button', { type: 'button', class: 'button-primary button-wide', onclick: () => startDaily() }, 'Start today’s set'),
    );
  }
  if (!day.completedAt) {
    return panel(
      "Today's set",
      h('p', { class: 'muted' }, `${answered} of ${total} answered. Finish all ${total} to keep your streak.`),
      h('button', { type: 'button', class: 'button-primary button-wide', onclick: () => startDaily() }, answered ? 'Continue' : 'Start today’s set'),
    );
  }
  const score = dayScore(day, data.attempts, today);
  return panel(
    "Today's set is done ✓",
    h('p', { class: 'muted' }, `You scored ${score.percent}%, with ${score.fullyCorrect} of ${score.answered} fully correct.`),
    h(
      'div',
      { class: 'button-row' },
      h('button', { type: 'button', class: 'button-secondary', onclick: () => startDaily(0) }, 'Review answers'),
      h('button', { type: 'button', class: 'button-primary', onclick: () => startExtra() }, `Practice ${EXTRA_COUNT} more`),
    ),
  );
}

function statTile(label, value, note) {
  return h(
    'div',
    { class: 'stat' },
    h('p', { class: 'stat-label' }, label),
    h('p', { class: 'stat-value' }, value),
    note ? h('p', { class: 'stat-note' }, note) : null,
  );
}

function statTiles(data, today) {
  const streak = currentStreak(data.days, today);
  const answered = data.attempts.length;
  const total = data.attempts.reduce((sum, a) => sum + credit(a), 0);
  return h(
    'section',
    { class: 'stats' },
    statTile('Current streak', `${streak} ${streak === 1 ? 'day' : 'days'}`, `Longest: ${longestStreak(data.days)}`),
    statTile('Overall accuracy', answered ? `${Math.round((total / answered) * 100)}%` : '–', 'All practice'),
    statTile('Questions answered', answered.toLocaleString(), `${questionsById.size} in the bank`),
  );
}

function scoreChart(data, today) {
  const dates = Array.from({ length: CHART_DAYS }, (_, i) => addDays(today, i - CHART_DAYS + 1));
  const rows = dates.map((date) => {
    const day = data.days[date];
    return { date, score: day ? dayScore(day, data.attempts, date) : null };
  });
  const hasData = rows.some((r) => r.score);
  return h(
    'section',
    { class: 'card' },
    h('h2', {}, 'Daily score'),
    h('p', { class: 'muted chart-subtitle' }, `Percent of credit earned, last ${CHART_DAYS} days`),
    hasData
      ? [
          h(
            'div',
            { class: 'columns' },
            h(
              'div',
              { class: 'columns-axis', 'aria-hidden': 'true' },
              h('span', {}, '100'),
              h('span', {}, '50'),
              h('span', {}, '0'),
            ),
            h(
              'div',
              { class: 'columns-plot' },
              rows.map(({ date, score }, i) => {
                const label = formatDate(date);
                const tip = score
                  ? `${label}: ${score.percent}%, ${score.fullyCorrect} of ${score.answered} fully correct`
                  : `${label}: no set`;
                const showDate = i === 0 || i === rows.length - 1;
                return h(
                  'div',
                  { class: 'column', tabindex: '0', 'aria-label': tip, 'data-tip': tip },
                  h('div', { class: 'column-track' }, score ? h('div', { class: 'column-bar', style: `height:${score.percent}%` }) : null),
                  h('span', { class: 'column-date' }, showDate ? label : ''),
                );
              }),
            ),
          ),
          h(
            'details',
            { class: 'table-view' },
            h('summary', {}, 'Show as table'),
            h(
              'table',
              {},
              h('thead', {}, h('tr', {}, h('th', {}, 'Date'), h('th', {}, 'Score'), h('th', {}, 'Fully correct'))),
              h(
                'tbody',
                {},
                rows
                  .filter((r) => r.score)
                  .reverse()
                  .map(({ date, score }) =>
                    h(
                      'tr',
                      {},
                      h('td', {}, formatDate(date)),
                      h('td', {}, `${score.percent}%`),
                      h('td', {}, `${score.fullyCorrect} of ${score.answered}`),
                    ),
                  ),
              ),
            ),
          ),
        ]
      : h('p', { class: 'empty' }, 'Your scores will appear here after your first set.'),
  );
}

function topicFlag(percent) {
  if (percent === null) return { level: 'none', label: 'No data' };
  if (percent < WEAK_BELOW) return { level: 'weak', label: 'Weak' };
  if (percent < STRONG_FROM) return { level: 'fair', label: 'Fair' };
  return { level: 'strong', label: 'Strong' };
}

function topicTable(data) {
  const rows = topicAccuracy(topics, data.attempts);
  return h(
    'section',
    { class: 'card' },
    h('h2', {}, 'Accuracy by topic'),
    h(
      'p',
      { class: 'muted chart-subtitle' },
      `Weakest first. Weak topics appear more often in your sets. Weak is under ${WEAK_BELOW}%, Fair is ${WEAK_BELOW}–${STRONG_FROM - 1}%, and Strong is ${STRONG_FROM}% or higher.`,
    ),
    h(
      'table',
      { class: 'topic-table' },
      h(
        'thead',
        {},
        h(
          'tr',
          {},
          h('th', { scope: 'col' }, 'Topic'),
          h('th', { scope: 'col', class: 'cell-number' }, 'Accuracy'),
          h('th', { scope: 'col' }, 'Status'),
        ),
      ),
      h(
        'tbody',
        {},
        rows.map((row) => {
          const flag = topicFlag(row.percent);
          return h(
            'tr',
            {},
            h(
              'td',
              {},
              h('span', { class: 'topic-name' }, row.name),
              h('span', { class: 'topic-count' }, `${row.attempts} answered`),
            ),
            h('td', { class: 'cell-number' }, row.percent !== null ? `${row.percent}%` : '–'),
            h(
              'td',
              {},
              h(
                'span',
                { class: `flag flag-${flag.level}` },
                h('span', { class: 'flag-dot', 'aria-hidden': 'true' }),
                flag.label,
              ),
            ),
          );
        }),
      ),
    ),
  );
}

function tagRow(row, match) {
  return h(
    'li',
    { class: `tag-row ${row.attempts ? '' : 'is-empty'}` },
    h(
      'div',
      { class: 'tag-row-text' },
      h('span', { class: 'topic-name' }, row.name),
      h(
        'span',
        { class: 'topic-count' },
        row.attempts ? `${row.attempts} answered, ${row.missed} missed` : 'No answers yet',
      ),
    ),
    h('span', { class: 'tag-row-percent' }, row.percent !== null ? `${row.percent}%` : '–'),
    h(
      'button',
      {
        type: 'button',
        class: 'button-small',
        'aria-label': `Practice ${row.name}`,
        onclick: () => startExtra(match),
      },
      'Practice',
    ),
  );
}

const questionOf = (attempt) => questionsById.get(attempt.id);

function coverageCard(data) {
  const rows = tagAccuracy(TEST_PLAN, data.attempts, (a) => questionOf(a)?.testPlan);
  // Subcategories sit under their parent category; two categories have none.
  const groups = [];
  for (const row of rows) {
    const last = groups[groups.length - 1];
    if (row.group && last?.name === row.group) last.rows.push(row);
    else groups.push({ name: row.group, rows: [row] });
  }
  return h(
    'section',
    { class: 'card' },
    h('h2', {}, 'Test plan coverage'),
    h(
      'p',
      { class: 'muted chart-subtitle' },
      'How much you’ve answered in each area, to help you spot gaps. Practice sets count toward accuracy, not your daily score.',
    ),
    groups.map((group) => [
      group.name ? h('h3', { class: 'tag-group' }, group.name) : null,
      h('ul', { class: 'tag-rows' }, group.rows.map((row) => tagRow(row, (q) => q.testPlan === row.id))),
    ]),
  );
}

function judgmentCard(data) {
  const rows = tagAccuracy(JUDGMENT_STEPS, data.attempts, (a) => questionOf(a)?.judgment);
  const weakest = weakestRow(rows, MIN_ANSWERS_FOR_WEAKEST);
  return h(
    'section',
    { class: 'card' },
    h('h2', {}, 'Clinical judgment'),
    h(
      'p',
      { class: 'chart-subtitle' },
      weakest
        ? h('strong', {}, `You miss ${weakest.name} most, at ${weakest.percent}% accuracy.`)
        : h('span', { class: 'muted' }, `Answer at least ${MIN_ANSWERS_FOR_WEAKEST} questions in a step to see which one you miss most.`),
    ),
    h('ul', { class: 'tag-rows' }, rows.map((row) => tagRow(row, (q) => q.judgment === row.id))),
    h('p', { class: 'muted chart-subtitle' }, 'Questions that mainly test recall aren’t counted here.'),
  );
}

function accountCard() {
  const message = h('p', { class: 'banner banner-bad', role: 'alert', hidden: true });
  const showError = (text) => {
    message.textContent = text;
    message.hidden = false;
  };
  return h(
    'section',
    { class: 'card' },
    h('h2', {}, 'Account'),
    h(
      'p',
      {},
      h('span', { class: 'account-name' }, currentUser.name ?? 'Signed in'),
      h('span', { class: 'muted account-email' }, currentUser.email ?? ''),
    ),
    h('p', { class: 'muted' }, 'Your progress syncs automatically on every device where you sign in.'),
    h(
      'div',
      { class: 'button-row' },
      h('button', { type: 'button', class: 'button-secondary', onclick: () => handleSignOut(showError) }, 'Sign out'),
      h('button', { type: 'button', class: 'button-danger', onclick: () => handleDelete(showError) }, 'Delete my data'),
    ),
    message,
  );
}

async function finishAndReload() {
  await cloud.signOutAndClear();
  location.reload();
}

async function handleSignOut(showError) {
  const synced = await cloud.allSynced(4000);
  if (
    !synced &&
    !window.confirm('Some recent answers have not reached the cloud yet, and signing out now would lose them. Sign out anyway?')
  ) {
    return;
  }
  try {
    disconnect();
    await finishAndReload();
  } catch (error) {
    console.error(error);
    showError('Could not sign out. Reload the page and try again.');
  }
}

async function handleDelete(showError) {
  if (!navigator.onLine) {
    showError('You need to be online to delete your data.');
    return;
  }
  if (
    !window.confirm('Permanently delete all your progress and your sign-in record? This cannot be undone. Google will ask you to confirm your account next.')
  ) {
    return;
  }
  const { uid } = currentUser;
  try {
    await cloud.confirmIdentity();
  } catch (error) {
    console.error(error);
    showError('Your data was not deleted, because Google could not confirm your account. Try again.');
    return;
  }
  try {
    await cloud.allSynced(4000); // so a waiting answer can't reappear after the delete
    disconnect();
    await cloud.deleteAllDays(uid);
  } catch (error) {
    console.error(error);
    showError('Deleting did not finish, so some progress may remain. Reload the page and try again.');
    return;
  }
  forgetLegacy(uid);
  let notice = 'Your progress and sign-in record were deleted.';
  try {
    await cloud.deleteSignInRecord();
  } catch (error) {
    console.error(error);
    notice = 'Your progress was deleted, but your sign-in record could not be removed. Sign in, delete your data again, or contact the person who runs this app.';
  }
  try {
    sessionStorage.setItem(FLASH_KEY, notice);
  } catch (error) {
    console.warn(error);
  }
  await finishAndReload();
}

function backupCard() {
  const message = h('p', { class: 'muted backup-message', role: 'status' });
  const fileInput = h('input', {
    type: 'file',
    accept: '.json,application/json',
    class: 'visually-hidden',
    'aria-label': 'Choose a backup file',
    onchange: async () => {
      const file = fileInput.files[0];
      if (!file) return;
      try {
        const added = importBackup(await file.text());
        drawHome();
        document.querySelector('.backup-message').textContent =
          `Backup merged: ${added} new ${added === 1 ? 'answer' : 'answers'} added.`;
      } catch (error) {
        message.textContent = error.message;
      }
    },
  });
  const download = () => {
    const blob = new Blob([exportBackup()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = h('a', { href: url, download: `nursing-study-backup-${toDateKey()}.json` });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    message.textContent = 'Backup saved to your downloads.';
  };
  return h(
    'section',
    { class: 'card' },
    h('h2', {}, 'Backup (optional)'),
    h(
      'p',
      { class: 'muted' },
      'You no longer need backups to move between devices. You can still save a personal copy of your progress, or merge a backup file you saved earlier into this account.',
    ),
    h(
      'div',
      { class: 'button-row' },
      h('button', { type: 'button', class: 'button-secondary', onclick: download }, 'Save a backup'),
      h('button', { type: 'button', class: 'button-secondary', onclick: () => fileInput.click() }, 'Merge a backup'),
      legacySummary()
        ? h(
            'button',
            {
              type: 'button',
              class: 'button-secondary',
              onclick: () => {
                importLegacy(currentUser.uid);
                drawHome();
              },
            },
            'Import from this browser',
          )
        : null,
    ),
    fileInput,
    message,
  );
}

const tabPanels = {
  today: (data, today) => [todayCard(data, today)],
  progress: (data, today) => [
    statTiles(data, today),
    scoreChart(data, today),
    coverageCard(data),
    judgmentCard(data),
    accountCard(),
    backupCard(),
  ],
  topics: (data) => [topicTable(data)],
};

function drawHome() {
  onHome = true;
  const data = load();
  const today = toDateKey();
  updateHeader();
  tabsNav.hidden = false;
  for (const tab of tabsNav.querySelectorAll('[data-tab]')) {
    if (tab.dataset.tab === activeTab) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  }
  show(
    root,
    saveFailed()
      ? h('p', { class: 'banner banner-bad' }, 'Your progress could not reach the cloud, so recent answers may not be saved. Reload the page, and sign in again if asked.')
      : null,
    tabPanels[activeTab](data, today),
  );
}

/* ---------- Welcome and first sign-in ---------- */

function signInMessage(error) {
  switch (error.code) {
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return null;
    case 'auth/popup-blocked':
      return 'Your browser blocked the sign-in window. Allow pop-ups for this site and try again. On an iPhone Home Screen icon, open the site in Safari instead.';
    case 'auth/unauthorized-domain':
      return 'This web address is not on the app’s approved list yet. SETUP.md explains how to add it.';
    case 'auth/network-request-failed':
      return 'Could not reach Google. Check your connection and try again.';
    default:
      return 'Sign-in did not work. Please try again.';
  }
}

function takeFlash() {
  try {
    const text = sessionStorage.getItem(FLASH_KEY);
    sessionStorage.removeItem(FLASH_KEY);
    return text;
  } catch {
    return null;
  }
}

function drawWelcome() {
  leaveHome();
  const flash = takeFlash();
  const message = h('p', { class: 'banner banner-bad', role: 'alert', hidden: true });
  const button = h(
    'button',
    {
      type: 'button',
      class: 'button-primary button-wide',
      onclick: async () => {
        message.hidden = true;
        button.disabled = true;
        try {
          await cloud.signIn();
        } catch (error) {
          console.error(error);
          const text = signInMessage(error);
          if (text) {
            message.textContent = text;
            message.hidden = false;
          }
          button.disabled = false;
        }
      },
    },
    'Sign in with Google',
  );
  show(
    root,
    flash ? h('p', { class: 'banner banner-good', role: 'status' }, flash) : null,
    h(
      'section',
      { class: 'card welcome' },
      h('h1', {}, 'Welcome to NCLEX Daily'),
      h('p', { class: 'muted' }, '20 NCLEX-style practice questions a day, with rationales and more practice on your weak topics. Your progress follows you to every device.'),
      button,
      message,
    ),
  );
}

function drawImportOffer() {
  leaveHome();
  const { answers, days } = legacySummary();
  const finish = () => {
    activeTab = 'today';
    drawHome();
  };
  show(
    root,
    h(
      'section',
      { class: 'card' },
      h('h2', {}, 'Bring your progress with you?'),
      h(
        'p',
        {},
        `This browser has ${answers} ${answers === 1 ? 'answer' : 'answers'} from ${days} ${days === 1 ? 'day' : 'days'}, saved before you had an account. Import it only if it's yours, and it will sync to this account.`,
      ),
      h(
        'div',
        { class: 'button-row' },
        h(
          'button',
          {
            type: 'button',
            class: 'button-secondary',
            onclick: () => {
              declineImport(currentUser.uid);
              finish();
            },
          },
          'Not now',
        ),
        h(
          'button',
          {
            type: 'button',
            class: 'button-primary',
            onclick: () => {
              importLegacy(currentUser.uid);
              finish();
            },
          },
          'Import my progress',
        ),
      ),
      h('p', { class: 'muted' }, 'If you choose Not now, you can import later from the Progress tab.'),
    ),
  );
}

async function handleUserChange(user) {
  currentUser = user;
  if (!user) {
    disconnect();
    drawWelcome();
    return;
  }
  leaveHome();
  show(root, h('p', { class: 'muted' }, 'Loading your progress…'));
  await connect(cloud, user.uid, () => {
    if (onHome) drawHome();
  });
  if (currentUser?.uid !== user.uid) return; // signed out while loading
  if (shouldOfferImport(user.uid)) {
    drawImportOffer();
    return;
  }
  activeTab = 'today';
  drawHome();
}

// If the app was left open overnight, show the new day when you come back.
let shownDate = toDateKey();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  const today = toDateKey();
  if (today !== shownDate) {
    if (onHome) drawHome();
    else updateHeader();
  }
  shownDate = today;
});

const syncStatus = document.getElementById('sync-status');
const updateConnection = () => {
  syncStatus.hidden = navigator.onLine;
};
window.addEventListener('online', updateConnection);
window.addEventListener('offline', updateConnection);
updateConnection();

async function start() {
  setupThemeToggle(document.getElementById('theme-toggle'));
  updateHeader();
  if (!isConfigured) {
    show(
      root,
      h(
        'section',
        { class: 'card' },
        h('h2', {}, 'One setup step left'),
        h('p', { class: 'muted' }, 'This app isn’t connected to Firebase yet. Follow SETUP.md, then paste your settings into js/firebase-config.js.'),
      ),
    );
    return;
  }
  try {
    await loadQuestions();
    cloud = await import('./cloud.js');
    cloud.onUserChange(handleUserChange);
  } catch (error) {
    console.error(error);
    show(
      root,
      h(
        'section',
        { class: 'card' },
        h('h2', {}, 'Questions could not load'),
        h(
          'p',
          { class: 'muted' },
          'Check your connection and reload. If you opened index.html directly from your computer, run it through a local server instead. The README explains how.',
        ),
      ),
    );
  }
}

start();
