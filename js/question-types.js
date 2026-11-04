// One display function per question type. Each receives:
//   question  the question object from the JSON file
//   context   { response, locked, onChange, seed }
//     response  the current answer (undefined if none yet)
//     locked    true once submitted: show right and wrong instead of inputs
//     onChange  call with the new answer whenever it changes
//     seed      text that keeps shuffled options in a stable order for this set
//
// Adding a new question type? Add one entry to `renderers` here, and one entry
// to `grading` in scoring.js. Case studies are displayed by quiz.js, because
// they step through parts that each use one of these renderers.

import { h } from './ui.js';

let groupCounter = 0;
const nextGroupName = () => `group-${(groupCounter += 1)}`;

// Repeatable shuffle: the same seed always gives the same order, so options
// don't jump around when you resume or review. The stored answer always uses
// the original positions from the JSON file.
function seededOrder(length, seed) {
  let state = 0;
  for (const char of seed) state = (Math.imul(state, 31) + char.charCodeAt(0)) | 0;
  const random = () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const order = Array.from({ length }, (_, i) => i);
  for (let i = length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

function resultMark(state) {
  if (state === 'correct') return h('span', { class: 'mark mark-correct' }, '✓ Correct answer');
  if (state === 'wrong') return h('span', { class: 'mark mark-wrong' }, '✗ Your choice, incorrect');
  if (state === 'missed') return h('span', { class: 'mark mark-missed' }, '✓ You missed this one');
  return null;
}

// Radio or checkbox list, shared by single answer, select-all, and bowtie.
//   selected  array of original option positions
//   correct   array of correct positions
//   multi     checkboxes instead of radio buttons
//   max       most choices allowed; extra boxes disable until one is unchecked
function choiceList({ options, notes, selected, correct, multi, max, locked, seed, onSelect }) {
  const name = nextGroupName();
  const picks = new Set(selected);
  const rows = [];

  const refresh = () => {
    for (const { input, label } of rows) {
      label.classList.toggle('is-selected', input.checked);
      if (!locked && multi && max) input.disabled = !input.checked && picks.size >= max;
    }
  };

  const items = seededOrder(options.length, seed).map((index) => {
    const isCorrect = correct.includes(index);
    const isPicked = picks.has(index);
    let state = null;
    if (locked && isCorrect) state = isPicked ? 'correct' : 'missed';
    else if (locked && isPicked) state = 'wrong';

    const input = h('input', {
      type: multi ? 'checkbox' : 'radio',
      name,
      disabled: locked,
      onchange: () => {
        if (!multi) picks.clear();
        if (input.checked) picks.add(index);
        else picks.delete(index);
        refresh();
        onSelect([...picks]);
      },
    });
    input.checked = isPicked;

    const label = h(
      'label',
      { class: `choice ${state ? `choice-${state}` : ''}` },
      input,
      h(
        'span',
        { class: 'choice-text' },
        options[index],
        locked ? resultMark(state) : null,
        locked && notes?.[index] ? h('span', { class: 'choice-note' }, notes[index]) : null,
      ),
    );
    rows.push({ input, label });
    return label;
  });

  refresh();
  return h('div', { class: 'choices', role: multi ? 'group' : 'radiogroup' }, items);
}

function renderSingle(q, { response, locked, onChange, seed }) {
  return choiceList({
    options: q.options,
    notes: q.optionNotes,
    selected: Number.isInteger(response) ? [response] : [],
    correct: [q.answer],
    locked,
    seed,
    onSelect: ([pick]) => onChange(pick),
  });
}

function renderSata(q, { response, locked, onChange, seed }) {
  return choiceList({
    options: q.options,
    notes: q.optionNotes,
    selected: response ?? [],
    correct: q.answer,
    multi: true,
    locked,
    seed,
    onSelect: onChange,
  });
}

function renderMatrix(q, { response, locked, onChange }) {
  const answers = [...(response ?? [])];
  return h(
    'div',
    { class: 'matrix' },
    q.rows.map((row, rowIndex) => {
      const name = nextGroupName();
      const isRight = answers[rowIndex] === q.answer[rowIndex];
      return h(
        'div',
        { class: 'matrix-row', role: 'radiogroup', 'aria-label': row },
        h('p', { class: 'matrix-label' }, row),
        h(
          'div',
          { class: 'matrix-options' },
          q.columns.map((column, columnIndex) => {
            const input = h('input', {
              type: 'radio',
              name,
              disabled: locked,
              onchange: () => {
                answers[rowIndex] = columnIndex;
                onChange([...answers]);
              },
            });
            input.checked = answers[rowIndex] === columnIndex;
            let state = '';
            if (locked && columnIndex === q.answer[rowIndex]) {
              state = isRight ? 'segment-correct' : 'segment-missed';
            } else if (locked && input.checked) state = 'segment-wrong';
            return h('label', { class: `segment ${state}` }, input, h('span', {}, column));
          }),
        ),
        locked
          ? h(
              'p',
              { class: `matrix-result ${isRight ? 'text-good' : 'text-bad'}` },
              isRight ? '✓ Correct' : `✗ Correct answer: ${q.columns[q.answer[rowIndex]]}`,
            )
          : null,
      );
    }),
  );
}

function renderCloze(q, { response, locked, onChange, seed }) {
  const answers = [...(response ?? [])];
  const pieces = q.template.split(/\{(\d+)\}/);
  return h(
    'p',
    { class: 'cloze' },
    pieces.map((piece, i) => {
      if (i % 2 === 0) return piece; // plain text between the blanks
      const blankIndex = Number(piece);
      const blank = q.blanks[blankIndex];
      const select = h(
        'select',
        {
          disabled: locked,
          'aria-label': `Blank ${blankIndex + 1}`,
          onchange: () => {
            answers[blankIndex] = select.value === '' ? undefined : Number(select.value);
            onChange([...answers]);
          },
        },
        h('option', { value: '' }, 'Select…'),
        seededOrder(blank.options.length, `${seed}${blankIndex}`).map((index) =>
          h('option', { value: String(index) }, blank.options[index]),
        ),
      );
      select.value = Number.isInteger(answers[blankIndex]) ? String(answers[blankIndex]) : '';
      if (!locked) return select;
      const isRight = answers[blankIndex] === blank.answer;
      select.classList.add(isRight ? 'select-correct' : 'select-wrong');
      return h(
        'span',
        { class: 'cloze-result' },
        select,
        h(
          'span',
          { class: isRight ? 'text-good' : 'text-bad' },
          isRight ? ' ✓' : ` ✗ Correct answer: ${blank.options[blank.answer]}`,
        ),
      );
    }),
  );
}

function renderBowtie(q, { response, locked, onChange, seed }) {
  const answer = {
    condition: response?.condition,
    actions: [...(response?.actions ?? [])],
    parameters: [...(response?.parameters ?? [])],
  };
  const update = (key, value) => {
    answer[key] = value;
    onChange({ ...answer, actions: [...answer.actions], parameters: [...answer.parameters] });
  };
  const column = (key, title, group, multi) =>
    h(
      'section',
      { class: `bowtie-column bowtie-${key}` },
      h('h3', {}, title),
      choiceList({
        options: group.options,
        selected: multi ? answer[key] : Number.isInteger(answer[key]) ? [answer[key]] : [],
        correct: multi ? group.answer : [group.answer],
        multi,
        max: multi ? group.answer.length : undefined,
        locked,
        seed: `${seed}${key}`,
        onSelect: (picks) => update(key, multi ? picks : picks[0]),
      }),
    );
  return h(
    'div',
    { class: 'bowtie' },
    column('condition', 'Condition most likely (choose 1)', q.condition, false),
    column('actions', `Actions to take (choose ${q.actions.answer.length})`, q.actions, true),
    column(
      'parameters',
      `Parameters to monitor (choose ${q.parameters.answer.length})`,
      q.parameters,
      true,
    ),
  );
}

function renderHighlight(q, { response, locked, onChange }) {
  const picks = new Set(response ?? []);
  return h(
    'p',
    { class: 'highlight' },
    q.segments.map((segment, index) => {
      const isAnswer = q.answer.includes(index);
      const isPicked = picks.has(index);
      let state = '';
      if (locked && isAnswer) state = isPicked ? 'phrase-correct' : 'phrase-missed';
      else if (locked && isPicked) state = 'phrase-wrong';
      const button = h(
        'button',
        {
          type: 'button',
          class: `phrase ${isPicked ? 'is-selected' : ''} ${state}`,
          'aria-pressed': String(isPicked),
          disabled: locked,
          onclick: () => {
            if (picks.has(index)) picks.delete(index);
            else picks.add(index);
            button.classList.toggle('is-selected', picks.has(index));
            button.setAttribute('aria-pressed', String(picks.has(index)));
            onChange([...picks]);
          },
        },
        segment,
      );
      return [button, ' '];
    }),
  );
}

const renderers = {
  single: renderSingle,
  sata: renderSata,
  matrix: renderMatrix,
  cloze: renderCloze,
  bowtie: renderBowtie,
  highlight: renderHighlight,
};

export function renderQuestionBody(question, context) {
  return renderers[question.type](question, context);
}

// Instructions shown above each question type.
export const typeHints = {
  single: 'Choose one answer.',
  sata: 'Select all that apply.',
  matrix: 'Choose one option for each row.',
  cloze: 'Choose an option for each blank.',
  bowtie: 'Complete all three columns.',
  highlight: 'Tap each phrase that applies.',
};

export const typeNames = {
  single: 'Multiple choice',
  sata: 'Select all',
  matrix: 'Matrix',
  cloze: 'Drop-down',
  bowtie: 'Bowtie',
  highlight: 'Highlight',
  case: 'Case study',
};
