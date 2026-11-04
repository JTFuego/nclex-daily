// Checks the question files and the app's logic, right in the browser.
// Nothing here reads or writes your saved progress.

import { grade, isComplete, credit } from '../js/scoring.js';
import { addDays, daysBetween } from '../js/dates.js';
import { currentStreak, longestStreak, dayScore, topicAccuracy } from '../js/progress.js';
import { pickSet } from '../js/selector.js';
import { mergeData } from '../js/storage.js';

const failures = [];
let passed = 0;

function check(name, condition) {
  if (condition) passed += 1;
  else failures.push(name);
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/* ---------- Question files ---------- */

const isIndex = (value, length) => Number.isInteger(value) && value >= 0 && value < length;
const validPicks = (picks, length) =>
  Array.isArray(picks) &&
  picks.length > 0 &&
  picks.every((p) => isIndex(p, length)) &&
  new Set(picks).size === picks.length;

function bodyProblems(q) {
  const problems = [];
  if (!q.stem?.trim()) problems.push('missing stem');
  if (!q.rationale?.trim()) problems.push('missing rationale');
  switch (q.type) {
    case 'single':
      if (!(q.options?.length >= 3)) problems.push('needs 3+ options');
      if (!isIndex(q.answer, q.options?.length)) problems.push('answer out of range');
      break;
    case 'sata':
      if (!(q.options?.length >= 4)) problems.push('needs 4+ options');
      if (!validPicks(q.answer, q.options?.length)) problems.push('bad answer list');
      break;
    case 'matrix':
      if (q.answer?.length !== q.rows?.length) problems.push('needs one answer per row');
      else if (!q.answer.every((a) => isIndex(a, q.columns?.length))) problems.push('answer out of range');
      break;
    case 'cloze': {
      const found = [...(q.template ?? '').matchAll(/\{(\d+)\}/g)].map((m) => Number(m[1])).sort();
      if (!q.blanks?.length || !same(found, q.blanks.map((_, i) => i))) problems.push('template and blanks differ');
      else if (!q.blanks.every((b) => isIndex(b.answer, b.options?.length))) problems.push('blank answer out of range');
      break;
    }
    case 'bowtie':
      if (!isIndex(q.condition?.answer, q.condition?.options?.length)) problems.push('condition out of range');
      for (const key of ['actions', 'parameters']) {
        if (!validPicks(q[key]?.answer, q[key]?.options?.length)) problems.push(`bad ${key} list`);
        else if (q[key].options.length <= q[key].answer.length) problems.push(`${key} needs distractors`);
      }
      break;
    case 'highlight':
      if (!validPicks(q.answer, q.segments?.length)) problems.push('bad answer list');
      else if (q.answer.length === q.segments.length) problems.push('every phrase is correct');
      break;
    default:
      problems.push(`unknown type ${q.type}`);
  }
  return problems;
}

// A correct answer built from the key should always score full marks.
function perfectResponse(q) {
  if (q.type === 'cloze') return q.blanks.map((b) => b.answer);
  if (q.type === 'bowtie') {
    return { condition: q.condition.answer, actions: q.actions.answer, parameters: q.parameters.answer };
  }
  if (q.type === 'case') return q.parts.map(perfectResponse);
  return q.answer;
}

function checkQuestionFiles(topics, questions) {
  const ids = new Set();
  const stems = new Set();
  for (const q of questions) {
    if (ids.has(q.id)) failures.push(`${q.id}: duplicate id`);
    ids.add(q.id);
    if (stems.has(q.stem)) failures.push(`${q.id}: repeated stem`);
    stems.add(q.stem);
    if (!topics.some((t) => t.id === q.topic)) failures.push(`${q.id}: unknown topic`);
    if (!q.subtopic) failures.push(`${q.id}: missing subtopic`);

    let problems;
    if (q.type === 'case') {
      problems = [];
      if (!q.stem?.trim() || !q.rationale?.trim()) problems.push('needs stem and rationale');
      if (!q.tabs?.length || !q.tabs.every((t) => t.label && t.text)) problems.push('bad tabs');
      if (!(q.parts?.length >= 2)) problems.push('needs 2+ parts');
      q.parts?.forEach((part, i) => {
        if (part.type === 'case') problems.push('case inside a case');
        else bodyProblems(part).forEach((p) => problems.push(`part ${i + 1}: ${p}`));
      });
    } else {
      problems = bodyProblems(q);
    }
    problems.forEach((p) => failures.push(`${q.id}: ${p}`));

    if (!problems.length) {
      const response = perfectResponse(q);
      const result = grade(q, response);
      check(`${q.id}: answer key is complete`, isComplete(q, response));
      check(`${q.id}: answer key earns full credit`, result.possible > 0 && result.earned === result.possible);
    }
  }
}

/* ---------- Scoring ---------- */

function checkScoring() {
  const sata = { type: 'sata', options: ['a', 'b', 'c', 'd'], answer: [0, 1] };
  check('sata: all right', same(grade(sata, [0, 1]), { earned: 2, possible: 2 }));
  check('sata: wrong pick cancels a right one', same(grade(sata, [0, 2]), { earned: 0, possible: 2 }));
  check('sata: score never goes below 0', same(grade(sata, [2, 3]), { earned: 0, possible: 2 }));
  check('sata: nothing selected is incomplete', !isComplete(sata, []));

  const single = { type: 'single', options: ['a', 'b', 'c'], answer: 0 };
  check('single: position 0 counts as an answer', isComplete(single, 0));
  check('single: right', grade(single, 0).earned === 1);
  check('single: wrong', grade(single, 1).earned === 0);

  const matrix = { type: 'matrix', rows: ['a', 'b'], columns: ['x', 'y'], answer: [0, 1] };
  check('matrix: partial credit', same(grade(matrix, [0, 0]), { earned: 1, possible: 2 }));
  check('matrix: a blank row is incomplete', !isComplete(matrix, [0]));

  const bowtie = {
    type: 'bowtie',
    condition: { options: ['a', 'b'], answer: 0 },
    actions: { options: ['a', 'b', 'c'], answer: [0, 1] },
    parameters: { options: ['a', 'b', 'c'], answer: [1, 2] },
  };
  check(
    'bowtie: scores 5 slots',
    same(grade(bowtie, { condition: 0, actions: [0, 2], parameters: [1, 2] }), { earned: 4, possible: 5 }),
  );
  check('bowtie: needs every slot', !isComplete(bowtie, { condition: 0, actions: [0], parameters: [1, 2] }));

  const caseStudy = { type: 'case', parts: [single, matrix] };
  check('case: adds its parts', same(grade(caseStudy, [0, [0, 0]]), { earned: 2, possible: 3 }));
  check('case: unfinished parts are incomplete', !isComplete(caseStudy, [0]));
  check('credit: is a share of the question', credit({ earned: 1, possible: 4 }) === 0.25);
}

/* ---------- Dates and streaks ---------- */

function checkProgress() {
  check('dates: crosses a month', addDays('2026-10-31', 1) === '2026-11-01');
  check('dates: crosses a year', addDays('2027-01-01', -1) === '2026-12-31');
  check('dates: daylight saving day still counts as one', daysBetween('2026-11-01', '2026-11-02') === 1);

  const done = { completedAt: 1 };
  const unfinished = { completedAt: null };
  const today = '2026-11-10';
  check('streak: counts through today', currentStreak({ '2026-11-10': done, '2026-11-09': done }, today) === 2);
  check(
    'streak: an unfinished today does not break it',
    currentStreak({ '2026-11-10': unfinished, '2026-11-09': done, '2026-11-08': done }, today) === 2,
  );
  check('streak: a missed day resets it', currentStreak({ '2026-11-10': done, '2026-11-08': done }, today) === 1);
  check('streak: two days away resets it', currentStreak({ '2026-11-08': done }, today) === 0);
  check(
    'longest streak',
    longestStreak({ '2026-11-01': done, '2026-11-02': done, '2026-11-03': done, '2026-11-05': done }) === 3,
  );

  const date = '2026-11-10';
  const day = { ids: ['a', 'b'] };
  const attempts = [
    { id: 'a', topic: 't', date, mode: 'daily', earned: 1, possible: 1 },
    { id: 'b', topic: 't', date, mode: 'daily', earned: 1, possible: 2 },
    { id: 'c', topic: 't', date, mode: 'extra', earned: 0, possible: 1 },
  ];
  check(
    'day score: extra practice does not count',
    same(dayScore(day, attempts, date), { percent: 75, fullyCorrect: 1, answered: 2 }),
  );
  const accuracy = topicAccuracy(
    [{ id: 't', name: 'T' }, { id: 'n', name: 'N' }],
    attempts,
  );
  check('topic accuracy: includes extra practice', accuracy[0].percent === 50);
  check('topic accuracy: unpracticed topics go last', accuracy[1].percent === null);
}

/* ---------- Choosing questions ---------- */

function checkSelector(topics, questions) {
  const today = '2026-11-10';
  const base = { questions, topics, today };

  for (let i = 0; i < 25; i += 1) {
    const ids = pickSet({ ...base, attempts: [], count: 20 });
    const picked = ids.map((id) => questions.find((q) => q.id === id));
    check('daily set: has 20 questions', ids.length === 20);
    check('daily set: no repeats', new Set(ids).size === 20);
    check('daily set: includes every topic', topics.every((t) => picked.some((q) => q.topic === t.id)));
    check('daily set: at most 2 case studies', picked.filter((q) => q.type === 'case').length <= 2);
  }

  // Build a history where one topic is weak and everything else is strong.
  const weakTopic = 'cardiac';
  const history = questions.map((q, i) => ({
    id: q.id,
    topic: q.topic,
    date: addDays(today, -30),
    at: i,
    earned: q.topic === weakTopic ? 0 : 1,
    possible: 1,
    mode: 'daily',
  }));
  let weakCount = 0;
  const runs = 100;
  for (let i = 0; i < runs; i += 1) {
    const ids = pickSet({ ...base, attempts: history, count: 20 });
    weakCount += ids.filter((id) => questions.find((q) => q.id === id).topic === weakTopic).length;
  }
  const average = weakCount / runs;
  check(`weak topic appears far more often (average ${average.toFixed(1)} of 20)`, average >= 6);

  // Questions missed days ago return before questions answered correctly.
  const cardiac = questions.filter((q) => q.topic === weakTopic);
  const missed = cardiac[0];
  const mixed = cardiac.map((q, i) => ({
    id: q.id,
    topic: q.topic,
    date: addDays(today, -5),
    at: i,
    earned: q === missed ? 0 : 1,
    possible: 1,
    mode: 'daily',
  }));
  const onlyCardiac = { questions: cardiac, topics: [{ id: weakTopic, name: 'Cardiac' }], today };
  check(
    'missed question comes back first',
    Array.from({ length: 20 }).every(() =>
      pickSet({ ...onlyCardiac, attempts: mixed, count: 1 }).includes(missed.id),
    ),
  );

  // A question missed today should wait at least two days.
  const justMissed = cardiac.map((q, i) => ({
    id: q.id,
    topic: q.topic,
    date: q === missed ? today : addDays(today, -40),
    at: i,
    earned: q === missed ? 0 : 1,
    possible: 1,
    mode: 'daily',
  }));
  check(
    'question missed today waits',
    Array.from({ length: 20 }).every(
      () => !pickSet({ ...onlyCardiac, attempts: justMissed, count: 1 }).includes(missed.id),
    ),
  );

  const excluded = questions.slice(0, 100).map((q) => q.id);
  const extra = pickSet({ ...base, attempts: [], count: 10, exclude: excluded, maxCases: 1 });
  check('extra practice: skips excluded questions', extra.every((id) => !excluded.includes(id)));
  check('extra practice: has 10 questions', extra.length === 10);
}

/* ---------- Backup merge ---------- */

function checkMerge() {
  const attempt = (id, at) => ({ id, topic: 't', date: '2026-11-01', at, earned: 1, possible: 1, mode: 'daily' });
  const current = {
    version: 1,
    days: { '2026-11-01': { ids: ['a'], responses: {}, completedAt: null } },
    attempts: [attempt('a', 1)],
  };
  const incoming = {
    version: 1,
    days: {
      '2026-11-01': { ids: ['b'], responses: { b: 0 }, completedAt: 9 },
      '2026-11-02': { ids: ['c'], responses: {}, completedAt: null },
    },
    attempts: [attempt('a', 1), attempt('b', 2)],
  };
  const added = mergeData(current, incoming);
  check('merge: duplicate answers are skipped', added === 1 && current.attempts.length === 2);
  check('merge: finished day replaces unfinished', current.days['2026-11-01'].completedAt === 9);
  check('merge: new days are added', !!current.days['2026-11-02']);
  check('merge: merging again adds nothing', mergeData(current, incoming) === 0);
  const finished = { version: 1, days: { '2026-11-01': { ids: ['x'], responses: {}, completedAt: null } }, attempts: [] };
  mergeData(current, finished);
  check('merge: unfinished day never replaces finished', current.days['2026-11-01'].completedAt === 9);
}

/* ---------- Run ---------- */

async function run() {
  const results = document.getElementById('results');
  try {
    const getJson = async (path) => (await fetch(path)).json();
    const topics = await getJson('../data/topics.json');
    const files = await Promise.all(topics.map((t) => getJson(`../data/questions/${t.id}.json`)));
    const questions = files.flat();

    checkQuestionFiles(topics, questions);
    checkScoring();
    checkProgress();
    checkSelector(topics, questions);
    checkMerge();

    const counts = (key) =>
      Object.entries(
        questions.reduce((all, q) => ({ ...all, [q[key]]: (all[q[key]] ?? 0) + 1 }), {}),
      )
        .map(([name, count]) => `${name}: ${count}`)
        .join(', ');

    const singles = questions.filter((q) => q.type === 'single');
    const longest = singles.filter(
      (q) => q.options[q.answer].length === Math.max(...q.options.map((o) => o.length)),
    ).length;

    const summary = document.createElement('div');
    const add = (text, className) => {
      const p = document.createElement('p');
      p.textContent = text;
      if (className) p.className = className;
      summary.append(p);
    };
    add(`${passed} checks passed, ${failures.length} failed.`, failures.length ? 'fail' : '');
    add(`Questions: ${questions.length}`);
    add(`By topic: ${counts('topic')}`);
    add(`By type: ${counts('type')}`);
    add(`Single-answer items where the correct option is the longest: ${Math.round((longest / singles.length) * 100)}%`);
    if (failures.length) {
      const list = document.createElement('ul');
      failures.forEach((f) => {
        const li = document.createElement('li');
        li.textContent = f;
        li.className = 'fail';
        list.append(li);
      });
      summary.append(list);
    }
    results.replaceChildren(summary);
  } catch (error) {
    results.textContent = `The checks could not run: ${error.message}`;
    results.className = 'fail';
  }
}

run();
