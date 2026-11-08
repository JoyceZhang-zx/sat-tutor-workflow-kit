# SAT Tutor Workflow Kit

A reusable student practice site and connected tutor dashboard for independent tutors. Includes two AI-assistant skills and the engine they use. Original demonstration content; not affiliated with or endorsed by College Board.

## Try locally

Requires Python 3. Run from this folder:

```sh
python3 skills/student-practice-site/build.py students/alex --init --student Alex
```

Copy examples/alex/sets/starter.json into students/alex/sets/, then run:

```sh
python3 skills/student-practice-site/build.py students/alex
python3 -m http.server 8000
```

Open http://localhost:8000/students/alex/ in a browser. Complete the three sample questions and inspect the results. Alex is fictional. New error logs and vocabulary banks are intentionally empty. Without a backend, results are not delivered to a tutor dashboard; do not interpret a queued submission as delivery.

## Connect the tutor dashboard

Follow skills/student-practice-site/SETUP.template.md to create your own Google Sheet, deploy the supplied Apps Script, connect its URL, and host only the built HTML. No existing student's credentials or services are included. Choose a fresh tutor key; the source placeholder must be replaced before deployment.

## Use with an AI coding assistant

Keep both skill folders together. Ask your assistant to read skills/student-practice-site/SKILL.md and make a fictional student's practice site. For vocabulary, also read skills/sat-vocabulary-studio/SKILL.md. If your assistant supports automatic skill discovery, use its documented installation location; the two sibling folders must stay together. The generated website needs no AI assistant or AI API to run.

Example request: “Read the bundled skills. Create a practice site for a fictional student, using only the original sample assignment. Explain what I must connect before the tutor dashboard receives submissions.”

## What this starter does and does not do

Includes assignments, timing, saved progress, results, optional Sheet-backed reporting, question conversations, vocabulary saving and authored quizzes, and class notes. There is no automatic mistake diagnosis, automatic twin creation, full student login system, billing, or SAT score prediction. Error-log integration needs a compatible authored page. Some progress is browser-local. Vocabulary lists are public through the word-list endpoint; tutor reports require the tutor key. Static HTML includes answer keys. This is a practice tool, not secure testing software.

The local builder uses Python's standard library. Backend setup requires your own Google account; hosting and AI-assistant availability/cost depend on your choices. Use authorized question material; the kit contains no official test questions or real student records. Review AI-authored educational material before assigning it.

## Publishing your copy

Keep students/ out of GitHub. Upload only the intended public kit files; configured Apps Script files, service URLs, private conversation links, keys, and student records belong outside the public repository. A rebuild is not a hosting update: upload and verify the served HTML after changes.

This first package has been checked with a local example build. Backend and hosting must be verified in your own account. Redistribution licensing has not yet been selected by the author.
