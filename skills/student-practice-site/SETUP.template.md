# Connect a student site

1. Create a separate Google Sheet for this student. Open Extensions → Apps Script.
2. Paste the complete apps-script.gs from skills/student-practice-site. Replace TUTOR_KEY with your own long random key. Never upload the configured server file to a public repository.
3. Deploy as a web app, executing as yourself, with access Anyone. Complete Google's authorization yourself. Copy the /exec URL.
4. From the kit root run:
   python3 skills/student-practice-site/build.py students/alex --url "YOUR_EXEC_URL"
5. Upload only the resulting index.html to your chosen static host. The tutor dashboard is the site URL followed by /#tutor. Enter your tutor key there.
6. Complete a fictional practice attempt and verify it arrives in your Sheet before assigning real work.

Updates: edit sets/*.json, rebuild, and upload index.html again. For server updates, use a new version of the existing deployment and preserve its URL, key, and FEEDBACK_STUDENT_TOKEN script property.

Question conversations: tutor inbox provides a private student conversation link. Open it once on each student browser/device. Keep the link private.

Vocabulary: save words from submitted-question review; review definitions/examples in the tutor dashboard. Word-list changes do not need an HTML rebuild. Quiz questions must be authored into vocabulary-learning.json and rebuilt.

Boundaries: no full student account system; vocabulary list endpoint is public. Browser-local progress does not fully synchronize across devices. The static HTML contains answer keys and is practice software, not a secure exam. Use fictional data while learning setup. No AI API is configured.
