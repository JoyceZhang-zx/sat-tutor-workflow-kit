---
name: student-practice-site
description: Build and maintain a per-student SAT practice website with assignments, timing, a connected tutor dashboard, vocabulary, and question conversations using the bundled Python builder.
---

# Student practice site

Use the engine files next to this skill. Keep student folders separate from shared code. From the repository root:

```sh
python3 skills/student-practice-site/build.py students/alex --init --student Alex
python3 skills/student-practice-site/build.py students/alex
```

Read SETUP.template.md for backend setup and hosting. Do not substitute a newly generated app for this engine. Fix shared sources and rebuild rather than editing generated HTML. Preserve an existing student's service URL, tutor key, deployment, tokens, set IDs, and vocabulary entry IDs.

Question-set schema is documented in build.py's docstring; examples/alex/sets contains original sample data. Each set has id, title, questions; question numbers run 1..N, choices are A-D, and correctAnswer is a letter. Use <u> tags for underlined text, including contextual vocabulary targets. Verify source PDFs visually for exact punctuation, graphics, titles, and keys. Use only content the tutor is entitled to use. Label original questions as original.

New sites include empty error logs, question conversations, and vocabulary studio. Do not invent student mistakes or seed a real student with sample vocabulary. Error-log embedding requires a compatible authored HTML page, not merely a list of wrong answers; see errorlog-bridge.js for its interface. Automatic diagnosis/twin generation is not implemented.

Class notes: config.classNotes names a JSON file with version:1 and lessons. Each lesson has id, date, title, summary, sections; sections have id, title, html. IDs must be lowercase letters/digits/hyphens. Authored HTML is trusted content, never raw student input.

Review each answer with textual or grammatical evidence and explain every distractor when authoring teaching material. Twin questions must preserve or exceed syntactic complexity, vocabulary, conceptual density, and distractor demands; length alone is insufficient. Check for one defensible best answer. Do not predict SAT scaled scores from raw results.

Use an isolated mock backend for automated tests; do not create test records in a real student's Sheet. Verify local builds and the served artifact after upload before claiming a change is live. Read the sibling sat-vocabulary-studio skill for quiz authoring.
