// Grades every question type. All functions are pure: no storage, no display.
//
// Adding a new question type? Add one entry to `grading` here, and one entry
// to `renderers` in question-types.js.
//
// Scoring follows the NCLEX Next Gen idea of partial credit:
//   - select-type items are "+/-": +1 per right pick, -1 per wrong pick, floor 0
//   - everything else earns 1 point per correct slot, row, or blank

function plusMinus(answer, picked = []) {
  const right = picked.filter((i) => answer.includes(i)).length;
  const wrong = picked.length - right;
  return { earned: Math.max(0, right - wrong), possible: answer.length };
}

function countMatches(a, b = []) {
  return a.filter((value, i) => value === b[i]).length;
}

const grading = {
  single: {
    grade: (q, r) => ({ earned: r === q.answer ? 1 : 0, possible: 1 }),
    isComplete: (q, r) => Number.isInteger(r),
  },
  sata: {
    grade: (q, r) => plusMinus(q.answer, r),
    isComplete: (q, r) => Array.isArray(r) && r.length > 0,
  },
  matrix: {
    grade: (q, r) => ({ earned: countMatches(q.answer, r), possible: q.rows.length }),
    isComplete: (q, r) =>
      Array.isArray(r) && q.rows.every((_, i) => Number.isInteger(r[i])),
  },
  cloze: {
    grade: (q, r) => ({
      earned: countMatches(q.blanks.map((b) => b.answer), r),
      possible: q.blanks.length,
    }),
    isComplete: (q, r) =>
      Array.isArray(r) && q.blanks.every((_, i) => Number.isInteger(r[i])),
  },
  bowtie: {
    grade: (q, r = {}) => {
      const hits = (group, picked = []) =>
        picked.filter((i) => group.answer.includes(i)).length;
      return {
        earned:
          (r.condition === q.condition.answer ? 1 : 0) +
          hits(q.actions, r.actions) +
          hits(q.parameters, r.parameters),
        possible: 1 + q.actions.answer.length + q.parameters.answer.length,
      };
    },
    isComplete: (q, r) =>
      !!r &&
      Number.isInteger(r.condition) &&
      r.actions?.length === q.actions.answer.length &&
      r.parameters?.length === q.parameters.answer.length,
  },
  highlight: {
    grade: (q, r) => plusMinus(q.answer, r),
    isComplete: (q, r) => Array.isArray(r) && r.length > 0,
  },
  // A case study is several smaller questions on one scenario.
  // Its response is an array with one response per part.
  case: {
    grade: (q, r = []) =>
      q.parts.reduce(
        (total, part, i) => {
          const { earned, possible } = grade(part, r[i]);
          return { earned: total.earned + earned, possible: total.possible + possible };
        },
        { earned: 0, possible: 0 },
      ),
    isComplete: (q, r) =>
      Array.isArray(r) && q.parts.every((part, i) => isComplete(part, r[i])),
  },
};

export function grade(question, response) {
  return grading[question.type].grade(question, response);
}

export function isComplete(question, response) {
  return grading[question.type].isComplete(question, response);
}

// Credit is the share of a question earned, from 0 to 1.
// Every question counts equally toward scores, however many points it has.
export function credit({ earned, possible }) {
  return possible > 0 ? earned / possible : 0;
}
