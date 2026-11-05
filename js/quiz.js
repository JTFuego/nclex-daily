// Runs a set of questions, one at a time: answer, submit, read the rationale, move on.
// Used for both the daily set and extra practice.

import { h, show } from './ui.js';
import { grade, isComplete, credit } from './scoring.js';
import { renderQuestionBody, typeHints, typeNames } from './question-types.js';

// Ordered from least to most sure. Saved with each answer as `confidence`.
const CONFIDENCE_LEVELS = [
  { value: 'guess', label: 'Guessing' },
  { value: 'unsure', label: 'Unsure' },
  { value: 'sure', label: 'Sure' },
];

function lowestConfidence(values) {
  const order = CONFIDENCE_LEVELS.map((level) => level.value);
  return order.find((value) => values.includes(value));
}

// Tapping a level submits the answer, so rating it takes one tap and always
// happens before you can see whether you were right.
function confidencePicker(onPick) {
  const buttons = CONFIDENCE_LEVELS.map(({ value, label }) =>
    h(
      'button',
      { type: 'button', class: 'confidence-button', disabled: true, onclick: () => onPick(value) },
      label,
    ),
  );
  return {
    element: h(
      'div',
      { class: 'confidence' },
      h('p', { class: 'confidence-label' }, 'Answer, then tap how sure you are to submit:'),
      h('div', { class: 'confidence-buttons' }, buttons),
    ),
    setEnabled(enabled) {
      buttons.forEach((button) => {
        button.disabled = !enabled;
      });
    },
  };
}

// Time spent on a question. It pauses while the app is in the background, and
// very long times are treated as unknown, since you probably walked away.
const MAX_TIME_MS = 10 * 60 * 1000;
let timerTotal = 0;
let timerStartedAt = null;

function restartTimer() {
  timerTotal = 0;
  timerStartedAt = document.hidden ? null : performance.now();
}

function elapsedMs() {
  return timerTotal + (timerStartedAt === null ? 0 : performance.now() - timerStartedAt);
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    timerTotal = elapsedMs();
    timerStartedAt = null;
  } else if (timerStartedAt === null) {
    timerStartedAt = performance.now();
  }
});

function knownTime(ms) {
  return ms <= MAX_TIME_MS ? Math.round(ms) : undefined;
}

// options:
//   root        element to draw into
//   questions   the question objects for this set, in order
//   responses   saved answers by question id; this object is updated as you go
//   topicName   function from a topic id to its display name
//   seed        text that keeps option order stable (the date)
//   startIndex  optional question to open first
//   onAnswered  called with (question, {earned, possible}, {timeMs, confidence}) when
//               a question is finished; timeMs is undefined when unknown
//   onSaveProgress  called after each saved case-study part
//   onExit      called when you leave with the X button
//   onDone      called after the last question
export function runQuiz(options) {
  const { root, questions, responses, topicName, seed } = options;
  const caseProgress = new Map(); // time and confidence for case parts answered this sitting
  const answeredAll = questions.every((q) => isComplete(q, responses[q.id]));
  let index =
    options.startIndex ??
    (answeredAll ? 0 : questions.findIndex((q) => !isComplete(q, responses[q.id])));

  function resultBanner({ earned, possible }) {
    const value = credit({ earned, possible });
    if (value === 1) return h('p', { class: 'banner banner-good' }, '✓ Correct');
    if (value === 0) return h('p', { class: 'banner banner-bad' }, `✗ Incorrect (0 of ${possible})`);
    return h('p', { class: 'banner banner-partial' }, `◐ Partly correct (${earned} of ${possible})`);
  }

  function feedback(item) {
    const result = grade(item.question, item.response);
    return h(
      'div',
      { class: 'feedback' },
      resultBanner(result),
      h('h3', {}, 'Rationale'),
      h('p', { class: 'rationale' }, item.question.rationale),
    );
  }

  function header(question) {
    const percent = Math.round((index / questions.length) * 100);
    return h(
      'header',
      { class: 'quiz-header' },
      h(
        'div',
        { class: 'quiz-header-row' },
        h('span', { class: 'quiz-count' }, `Question ${index + 1} of ${questions.length}`),
        h(
          'button',
          { type: 'button', class: 'icon-button', 'aria-label': 'Exit to home', onclick: options.onExit },
          '✕',
        ),
      ),
      h('div', { class: 'quiz-progress' }, h('div', { class: 'quiz-progress-fill', style: `width:${percent}%` })),
      h(
        'p',
        { class: 'quiz-tags' },
        h('span', { class: 'tag' }, topicName(question.topic)),
        h('span', { class: 'tag tag-quiet' }, typeNames[question.type]),
      ),
    );
  }

  function navigation(primary) {
    if (!primary && index === 0) return null;
    return h(
      'div',
      { class: 'quiz-nav' },
      index > 0
        ? h(
            'button',
            {
              type: 'button',
              class: 'button-secondary',
              onclick: () => {
                index -= 1;
                draw();
              },
            },
            'Previous',
          )
        : h('span'),
      primary,
    );
  }

  function nextButton() {
    const isLast = index === questions.length - 1;
    return h(
      'button',
      {
        type: 'button',
        class: 'button-primary',
        onclick: () => {
          if (isLast) options.onDone();
          else {
            index += 1;
            draw();
          }
        },
      },
      isLast ? 'See results' : 'Next question',
    );
  }

  function questionFooter(question) {
    return h('p', { class: 'question-id' }, `Question ID: ${question.id}`);
  }

  function drawStandard(question) {
    const answered = isComplete(question, responses[question.id]);
    let draft = responses[question.id];

    const picker = confidencePicker((confidence) => {
      responses[question.id] = draft;
      options.onAnswered(question, grade(question, draft), { timeMs: knownTime(elapsedMs()), confidence });
      draw();
    });

    show(
      root,
      header(question),
      h(
        'article',
        { class: 'card question' },
        h('p', { class: 'stem' }, question.stem),
        answered ? null : h('p', { class: 'hint' }, typeHints[question.type]),
        renderQuestionBody(question, {
          response: draft,
          locked: answered,
          seed: seed + question.id,
          onChange: (value) => {
            draft = value;
            picker.setEnabled(isComplete(question, draft));
          },
        }),
        answered ? null : picker.element,
      ),
      answered ? h('div', { class: 'card' }, feedback({ question, response: draft })) : null,
      navigation(answered ? nextButton() : null),
      questionFooter(question),
    );
    if (!answered) restartTimer();
  }

  function caseTabs(question) {
    let active = 0;
    const panel = h('p', { class: 'case-panel' }, question.tabs[0].text);
    const buttons = question.tabs.map((tab, i) => {
      const button = h(
        'button',
        {
          type: 'button',
          class: 'case-tab',
          role: 'tab',
          'aria-selected': String(i === 0),
          onclick: () => {
            active = i;
            panel.textContent = question.tabs[active].text;
            buttons.forEach((b, j) => b.setAttribute('aria-selected', String(j === active)));
          },
        },
        tab.label,
      );
      return button;
    });
    return h(
      'section',
      { class: 'case-chart' },
      h('div', { class: 'case-tabs', role: 'tablist' }, buttons),
      panel,
    );
  }

  // A case study shows each part in turn. Answered parts stay visible with
  // their rationales, so you can follow the case as it develops.
  function drawCase(question) {
    const saved = Array.isArray(responses[question.id]) ? responses[question.id] : [];
    const answeredCount = question.parts.findIndex((part, i) => !isComplete(part, saved[i]));
    const finished = answeredCount === -1;
    const activeIndex = finished ? null : answeredCount;
    let draft;

    const partSeed = (i) => `${seed}${question.id}${i}`;
    const partTitle = (i) => `Part ${i + 1} of ${question.parts.length}`;

    const answeredParts = question.parts.slice(0, finished ? question.parts.length : activeIndex).map((part, i) =>
      h(
        'article',
        { class: 'card question' },
        h('p', { class: 'part-title' }, partTitle(i)),
        h('p', { class: 'stem' }, part.stem),
        renderQuestionBody(part, { response: saved[i], locked: true, seed: partSeed(i), onChange: () => {} }),
        feedback({ question: part, response: saved[i] }),
      ),
    );

    let activePart = null;
    let primary;
    if (finished) {
      primary = nextButton();
    } else {
      const part = question.parts[activeIndex];
      const picker = confidencePicker((confidence) => {
        const progress = caseProgress.get(question.id) ?? { totalMs: 0, confidences: [], parts: 0 };
        progress.totalMs += elapsedMs();
        progress.confidences.push(confidence);
        progress.parts += 1;
        caseProgress.set(question.id, progress);

        const updated = [...saved];
        updated[activeIndex] = draft;
        responses[question.id] = updated;
        if (isComplete(question, updated)) {
          // A case counts as one answer, rated by its least sure part. Its time is
          // known only if every part was answered in this sitting.
          options.onAnswered(question, grade(question, updated), {
            timeMs: progress.parts === question.parts.length ? knownTime(progress.totalMs) : undefined,
            confidence: lowestConfidence(progress.confidences),
          });
        } else {
          options.onSaveProgress?.();
        }
        draw();
        document.querySelector('.part-latest')?.scrollIntoView({ block: 'start' });
      });
      primary = null;
      activePart = h(
        'article',
        { class: 'card question part-latest' },
        h('p', { class: 'part-title' }, partTitle(activeIndex)),
        h('p', { class: 'stem' }, part.stem),
        h('p', { class: 'hint' }, typeHints[part.type]),
        renderQuestionBody(part, {
          response: undefined,
          locked: false,
          seed: partSeed(activeIndex),
          onChange: (value) => {
            draft = value;
            picker.setEnabled(isComplete(part, draft));
          },
        }),
        picker.element,
      );
    }

    show(
      root,
      header(question),
      h('section', { class: 'card' }, h('p', { class: 'stem' }, question.stem), caseTabs(question)),
      answeredParts,
      activePart,
      finished
        ? h(
            'div',
            { class: 'card' },
            feedback({ question, response: saved }),
          )
        : null,
      navigation(primary),
      questionFooter(question),
    );
    if (!finished) restartTimer();
  }

  function draw() {
    const question = questions[index];
    if (question.type === 'case') drawCase(question);
    else drawStandard(question);
  }

  draw();
}
