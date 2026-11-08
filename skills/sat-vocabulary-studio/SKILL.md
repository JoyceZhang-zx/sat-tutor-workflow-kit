---
name: sat-vocabulary-studio
description: Prepare contextual vocabulary definitions, original recognition and usage quizzes, and spaced review for the bundled student practice-site engine.
---

# SAT vocabulary studio

Requires the sibling student-practice-site folder from this kit; read its SKILL.md and SETUP.template.md. The shared implementation is vocabulary.js, vocabulary-learning.js, vocabulary-errorlog.js, build.py, and apps-script.gs in that folder. Do not copy another student's bank.

New sites start enabled with an empty vocabulary-learning.json. Read saved words from the student's configured vocabulary endpoint or exported JSON. Preserve IDs and original contexts. Define the sense actually used; provide an original grammatical example. Review and publish via the authenticated vocabulary dashboard/import. Never enable runtime AI generation or introduce API credentials without a separate request.

For each reviewed quiz-eligible entry, author meaning and usage items with original academic contexts, four distinct plausible options, one defensible answer, and explanations for all four options. Pending definitions cannot enter quizzes.

Bank: {version:1,batchSize:8,initialEntries:[entry IDs],questions:[{id,entryId,expression,type,passage,prompt,choices:[A,B,C,D],correctAnswer:"A",explanations:[four strings]}]}. Types: meaning or usage. Read vocabulary-learning.js for the full operational contract. Retain existing question IDs and content tied to saved rounds; append versions when revising.

Rebuild with the sibling build.py and upload HTML for quiz-bank changes. Definition/list-data changes do not require rebuilding. Daily batches default to eight; review intervals default to 1/3/7/14/30 days, configurable choices rather than a universal optimum. Both item types must succeed for advancement, at most once a day. Misses return tomorrow. Preserve autosave, exact resume, choice shuffling, explicit restart confirmation, and separate first-attempt scores from retries. Student schedules/unfinished rounds are browser-local; export/import transfers them. Completed quiz reports use the authenticated tutor service.
