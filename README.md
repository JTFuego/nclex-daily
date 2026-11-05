# NCLEX Daily

An NCLEX-RN study app: 20 practice questions a day, with rationales, progress tracking, and more practice on weak topics. People sign in with Google, and each person's progress syncs across their devices using Firebase's free plan. **To connect it to Firebase, follow [SETUP.md](SETUP.md).**

The questions are original practice items and have not been reviewed by a nursing educator. If something conflicts with your course materials, trust your course and fix the question.

## Run it on your Mac

Open Terminal in this folder and run:

```bash
ruby -run -e httpd . -p 8000
```

Then go to <http://localhost:8000>. Signing in here requires `localhost` on your Firebase authorized domains list. Press Control-C in Terminal to stop it. Double-clicking `index.html` won't work, because browsers block this kind of app from loading local files directly.

## Project layout

```
index.html              the single page the app runs in
css/styles.css          design, including phone and laptop layouts
js/
  app.js                starts the app; draws home and results screens
  quiz.js               runs a set, one question at a time
  question-types.js     how each question type is displayed
  scoring.js            how each question type is graded
  selector.js           picks questions and favors weak topics
  progress.js           score per day, streak, accuracy by topic
  storage.js            holds your progress and keeps it in sync
  cloud.js              the only file that talks to Firebase
  firebase-config.js    your Firebase project's public settings
  theme.js              the light/dark toggle
  dates.js, ui.js       small helpers
data/
  topics.json           master topic list
  questions/            one file per topic
tests/                  open /tests/ in the browser to check everything
firestore.rules         who can read and write data; paste into the Firebase console
SETUP.md                step-by-step Firebase setup and second-account testing
```

## Add or fix a question

Open the topic's file in `data/questions/`, then copy a question of the same type and give it a new `id`. Every question screen shows its ID at the bottom, so you can search for it to fix a mistake. Answers are positions counted from 0, so the first option is `0`.

After any edit, open <http://localhost:8000/tests/>. It reports typos in the format, invalid answers, and repeated IDs. It never changes your saved progress.

| Type | Answer format |
| --- | --- |
| `single` | `"options": [...]`, `"answer": 1` |
| `sata` (select all) | `"options": [...]`, `"answer": [0, 2]` |
| `matrix` | `"columns": [...]`, `"rows": [...]`, `"answer"` has one column position per row |
| `cloze` (drop-down) | `"template": "Text {0} and {1}"`, `"blanks": [{ "options": [...], "answer": 0 }]` |
| `bowtie` | `"condition"`, `"actions"`, and `"parameters"`, each with `options` and `answer` |
| `highlight` | `"segments": [...]`, `"answer": [0, 2]` |
| `case` | `"tabs": [{ "label", "text" }]`, `"parts"` holds questions of the types above |

Every question also needs `id`, `topic`, `subtopic`, `testPlan`, `type`, `stem`, and `rationale`, and can have a `judgment` step. The allowed tag values are in `js/tags.js`, and [TAGS.md](TAGS.md) explains how they were assigned.

To add a new topic, add it to `data/topics.json` and create `data/questions/<topic-id>.json`. To add a new question type, add one entry to `grading` in `js/scoring.js` and one to `renderers` in `js/question-types.js`.

## How scoring works

- **Partial credit:** select-all and highlight items earn +1 per right pick and -1 per wrong pick, with a floor of 0. Matrix, drop-down, and bowtie items earn 1 point per correct row, blank, or slot. A case study adds up its parts.
- **Equal weight:** each question counts equally toward your scores, however many points it has.
- **Streak:** a day counts only when all 20 are finished. Extra practice counts toward topic accuracy, not your daily score or streak.

## Your data

Each person's progress is stored in Firestore at `users/{their user ID}/days/{date}`, and `firestore.rules` limits it to that person. Your streak, daily scores, and topic accuracy are calculated from your saved answers, so they can't disagree. Name and email stay in Firebase Authentication and aren't copied into the database.

Answers given during a brief connection drop wait on the device and sync when it returns. **Save a backup** and **Merge a backup** on the Progress tab are optional. **Delete my data** removes a person's progress and sign-in record.

If you change `firestore.rules`, paste the new version into the Firebase console, since uploading the file to GitHub doesn't apply it. Never add a service account key to this project.

## Ideas for later versions

The structure leaves room for these, none of which is built yet:

- **Study modules:** add `data/modules/`, using the same topic IDs, so a missed question can link to its lesson.
- **Diagrams:** add an `assets/` folder and an optional `image` field on questions and modules.
- **AI tutor:** add `js/tutor.js`, which can read your progress through `storage.js`. It would need a server component to keep an API key private, so it can't run on GitHub Pages alone.
