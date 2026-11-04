// Starts the app, loads the questions, and draws the home and results screens.

import { h, show } from './ui.js';
import { load, save, saveFailed, exportBackup, importBackup } from './storage.js';
import { toDateKey, addDays, formatDate } from './dates.js';
import { pickSet } from './selector.js';
import { runQuiz } from './quiz.js';
import { credit, isComplete } from './scoring.js';
import { currentStreak, longestStreak, dayScore, topicAccuracy } from './progress.js';

const DAILY_COUNT = 20;
const EXTRA_COUNT = 10;
const CHART_DAYS = 14;

const root = document.getElementById('app');
let topics = [];
let questionsById = new Map();
let onHome = false;

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

function recordAnswer(question, result, date, mode) {
  const data = load();
  data.attempts.push({
    id: question.id,
    topic: question.topic,
    date,
    at: Date.now(),
    earned: result.earned,
    possible: result.possible,
    mode,
  });
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
  onHome = false;
  runQuiz({
    root,
    questions: questionsFor(day.ids),
    responses: day.responses,
    topicName,
    seed: today,
    startIndex,
    onAnswered: (question, result) => {
      recordAnswer(question, result, today, 'daily');
      const finished = questionsFor(day.ids).every((q) => isComplete(q, day.responses[q.id]));
      if (finished && !day.completedAt) {
        day.completedAt = Date.now();
        save();
      }
    },
    onSaveProgress: save,
    onExit: drawHome,
    onDone: () => drawResults(today),
  });
}

/* ---------- Extra practice ---------- */

function startExtra() {
  const data = load();
  const today = toDateKey();
  const ids = pickSet({
    questions: [...questionsById.values()],
    topics,
    attempts: data.attempts,
    today,
    count: EXTRA_COUNT,
    exclude: data.days[today]?.ids ?? [],
    maxCases: 1,
  });
  const questions = questionsFor(ids);
  const results = new Map();
  onHome = false;
  runQuiz({
    root,
    questions,
    responses: {}, // extra sets aren't resumable, but every answer still counts
    topicName,
    seed: `${today}extra${Date.now()}`,
    onAnswered: (question, result) => {
      results.set(question.id, result);
      recordAnswer(question, result, today, 'extra');
    },
    onExit: drawHome,
    onDone: () => drawExtraResults(questions, results),
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
  onHome = false;
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

function drawExtraResults(questions, results) {
  const answered = questions.filter((q) => results.has(q.id));
  const total = answered.reduce((sum, q) => sum + credit(results.get(q.id)), 0);
  const percent = answered.length ? Math.round((total / answered.length) * 100) : 0;
  onHome = false;
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
      h('button', { type: 'button', class: 'button-secondary', onclick: startExtra }, 'More practice'),
      h('button', { type: 'button', class: 'button-primary', onclick: drawHome }, 'Done'),
    ),
  );
}

/* ---------- Home ---------- */

function todayCard(data, today) {
  const day = data.days[today];
  if (!day) {
    return h(
      'section',
      { class: 'card today' },
      h('h2', {}, "Today's set"),
      h('p', { class: 'muted' }, `${DAILY_COUNT} questions, weighted toward your weak topics.`),
      h('button', { type: 'button', class: 'button-primary button-wide', onclick: () => startDaily() }, 'Start today’s set'),
    );
  }
  const questions = questionsFor(day.ids);
  const answered = questions.filter((q) => isComplete(q, day.responses[q.id])).length;
  if (!day.completedAt) {
    return h(
      'section',
      { class: 'card today' },
      h('h2', {}, "Today's set"),
      h('p', { class: 'muted' }, `${answered} of ${questions.length} answered. Finish all ${questions.length} to keep your streak.`),
      h(
        'div',
        { class: 'quiz-progress' },
        h('div', { class: 'quiz-progress-fill', style: `width:${(answered / questions.length) * 100}%` }),
      ),
      h('button', { type: 'button', class: 'button-primary button-wide', onclick: () => startDaily() }, answered ? 'Continue' : 'Start today’s set'),
    );
  }
  const score = dayScore(day, data.attempts, today);
  return h(
    'section',
    { class: 'card today' },
    h('h2', {}, "Today's set is done ✓"),
    h('p', { class: 'muted' }, `You scored ${score.percent}%, with ${score.fullyCorrect} of ${score.answered} fully correct.`),
    h(
      'div',
      { class: 'button-row' },
      h('button', { type: 'button', class: 'button-secondary', onclick: () => startDaily(0) }, 'Review answers'),
      h('button', { type: 'button', class: 'button-primary', onclick: startExtra }, `Practice ${EXTRA_COUNT} more`),
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

function topicChart(data) {
  const rows = topicAccuracy(topics, data.attempts);
  return h(
    'section',
    { class: 'card' },
    h('h2', {}, 'Accuracy by topic'),
    h('p', { class: 'muted chart-subtitle' }, 'Weakest first. Weak topics appear more often in your sets.'),
    h(
      'ul',
      { class: 'bars' },
      rows.map((row) =>
        h(
          'li',
          { class: 'bar-row' },
          h('span', { class: 'bar-label' }, row.name),
          h(
            'div',
            {
              class: 'bar-track',
              'aria-hidden': 'true',
            },
            row.percent !== null ? h('div', { class: 'bar-fill', style: `width:${row.percent}%` }) : null,
          ),
          h(
            'span',
            { class: 'bar-value' },
            row.percent !== null ? `${row.percent}%` : 'No data',
            row.percent !== null ? h('span', { class: 'bar-count' }, ` (${row.attempts})`) : null,
          ),
        ),
      ),
    ),
  );
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
    message.textContent = 'Backup saved. Open it on your other device with Merge a backup.';
  };
  return h(
    'section',
    { class: 'card' },
    h('h2', {}, 'Backup and sync'),
    h(
      'p',
      { class: 'muted' },
      'Progress is saved only in this browser, and browsers can clear it. Save a backup weekly, or use one to move progress between your phone and laptop. Merging keeps the answers from both devices.',
    ),
    h(
      'div',
      { class: 'button-row' },
      h('button', { type: 'button', class: 'button-secondary', onclick: download }, 'Save a backup'),
      h('button', { type: 'button', class: 'button-secondary', onclick: () => fileInput.click() }, 'Merge a backup'),
    ),
    fileInput,
    message,
  );
}

function drawHome() {
  onHome = true;
  const data = load();
  const today = toDateKey();
  show(
    root,
    h(
      'header',
      { class: 'app-header' },
      h('h1', {}, 'NCLEX Daily'),
      h('p', { class: 'muted' }, formatDate(today, { weekday: 'long', month: 'long', day: 'numeric' })),
    ),
    saveFailed()
      ? h('p', { class: 'banner banner-bad' }, 'Your browser blocked saving, so recent answers may be lost. Check for Private Browsing or full storage.')
      : null,
    todayCard(data, today),
    statTiles(data, today),
    scoreChart(data, today),
    topicChart(data),
    backupCard(),
    h(
      'p',
      { class: 'disclaimer' },
      'Personal study aid. Questions are original practice items not reviewed by a nursing educator. Check anything doubtful against your course materials and follow your program and facility policies.',
    ),
  );
}

// If the app was left open overnight, show the new day when you come back.
let shownDate = toDateKey();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  const today = toDateKey();
  if (today !== shownDate && onHome) drawHome();
  shownDate = today;
});

async function start() {
  try {
    await loadQuestions();
    drawHome();
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
