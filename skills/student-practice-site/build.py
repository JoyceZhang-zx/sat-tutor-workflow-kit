#!/usr/bin/env python3
"""Build a student's practice site: <site>/sets/*.json -> <site>/index.html (one self-contained file).

Usage:
  New student:   python3 build.py "<site dir>" --init --student Fiona
  Connect sheet: python3 build.py "<site dir>" --url "https://script.google.com/macros/s/.../exec"
  Rebuild:       python3 build.py "<site dir>"

The engine (template.html), Apps Script code and setup guide live next to this
script; a student's folder holds only config.json, sets/, SETUP.md and the built
index.html. Student name + Apps Script URL are remembered in <site>/config.json.

Set file format (<site>/sets/<id>.json):
  {"id": "boundaries-day1", "title": "Boundaries — Day 1", "order": 1,
   "timeLimitMin": null, "note": "optional one-liner",
   "questions": [{"num":1, "passage":"...", "prompt":"...",
                  "choices":{"A":"..","B":"..","C":"..","D":".."},
                  "correctAnswer":"B", "unscored": false,
                  "qid": "optional source id", "difficulty": "Easy|Medium|Hard (optional)"}, ...]}
Passage text uses the same conventions as the Bluebook site: \\n\\n paragraphs,
<u>..</u> underlines, pipe-row tables, [[CHART:{...}]] tags.
"""
import argparse, json, os, pathlib, re, sys

SKILL = pathlib.Path(__file__).resolve().parent


def lint(s, path):
    errs = []
    for k in ("id", "title", "questions"):
        if k not in s:
            errs.append(f"missing '{k}'")
    if errs:
        return [f"{path.name}: {e}" for e in errs]
    nums = [q.get("num") for q in s["questions"]]
    if nums != list(range(1, len(nums) + 1)):
        errs.append(f"question numbers are not 1..{len(nums)}: {nums}")
    for q in s["questions"]:
        n = q.get("num")
        if q.get("unscored"):
            continue
        if q.get("correctAnswer") not in ("A", "B", "C", "D"):
            errs.append(f"Q{n}: correctAnswer {q.get('correctAnswer')!r}")
        ch = q.get("choices", {})
        if sorted(ch) != ["A", "B", "C", "D"] or not all(str(v).strip() for v in ch.values()):
            errs.append(f"Q{n}: choices must be non-empty A-D")
        elif len(set(ch.values())) < 4:
            errs.append(f"Q{n}: two choices have identical text")
        if not str(q.get("passage", "")).strip() or not str(q.get("prompt", "")).strip():
            errs.append(f"Q{n}: empty passage or prompt")
        if "underlined" in q.get("prompt", "") and "<u>" not in q.get("passage", ""):
            errs.append(f"Q{n}: prompt says 'underlined' but passage has no <u> tag")
        if "most nearly mean" in q.get("prompt", "") and "<u>" not in q.get("passage", ""):
            errs.append(f"Q{n}: words-in-context prompt but no <u> tag on the target word")
    return [f"{path.name}: {e}" for e in errs]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("site", help="the student's practice-site folder")
    ap.add_argument("--init", action="store_true", help="create the folder, config.json and SETUP.md")
    ap.add_argument("--student", help="student's first name (saved in config.json)")
    ap.add_argument("--url", help="Google Apps Script web-app URL (saved in config.json)")
    ap.add_argument("--error-log", help="path to the student's error-log HTML (saved in config.json, relative to the site folder)")
    ap.add_argument("--out", help="output path (default <site>/index.html); use for test builds")
    a = ap.parse_args()

    site = pathlib.Path(a.site).expanduser().resolve()
    cfg_path = site / "config.json"
    if a.init:
        if not a.student:
            sys.exit("--init needs --student <name>")
        (site / "sets").mkdir(parents=True, exist_ok=True)
        setup = (SKILL / "SETUP.template.md").read_text(encoding="utf-8").replace("__STUDENT__", a.student)
        (site / "SETUP.md").write_text(setup, encoding="utf-8")
    if not cfg_path.exists() and not a.init:
        sys.exit(f"{site} has no config.json. Create it with --init --student <name> first.")

    cfg = json.loads(cfg_path.read_text()) if cfg_path.exists() else {"student": "", "submitUrl": ""}
    if a.init:
        cfg.setdefault("errorLogEnabled", True)
        cfg.setdefault("feedback", True)
        cfg.setdefault("feedbackThreads", True)
        cfg.setdefault("vocabulary", True)
        if cfg.get("vocabulary"):
            cfg.setdefault("vocabularyLearning", "vocabulary-learning.json")
            if cfg.get("vocabularyLearning"):
                bank_path = site / cfg["vocabularyLearning"]
                if not bank_path.exists():
                    bank_path.write_text(json.dumps({"version": 1, "batchSize": 8, "initialEntries": [], "questions": []}, indent=2) + "\n", encoding="utf-8")
    if a.student:
        cfg["student"] = a.student.strip()
    if a.url:
        cfg["submitUrl"] = a.url.strip()
    if a.error_log:
        el = pathlib.Path(a.error_log).expanduser().resolve()
        cfg["errorLog"] = str(pathlib.Path(os.path.relpath(el, site)))
    if not cfg.get("student"):
        sys.exit("No student name. Pass --student <name>.")
    if a.out is None:   # test builds (--out elsewhere, e.g. with a mock --url) never touch the real config
        cfg_path.write_text(json.dumps(cfg, indent=2))

    sets, errs = [], []
    for p in sorted((site / "sets").glob("*.json")):
        s = json.loads(p.read_text(encoding="utf-8"))
        errs += lint(s, p)
        sets.append(s)
    ids = [s.get("id") for s in sets]
    if len(ids) != len(set(ids)):
        errs.append(f"duplicate set ids: {ids}")
    if errs:
        print("Set problems:\n  " + "\n  ".join(errs))
        sys.exit(1)
    sets.sort(key=lambda s: (s.get("order", 999), s["title"]))

    tpl = (SKILL / "template.html").read_text(encoding="utf-8")
    # "</" must not appear raw inside the <script> block
    sets_js = json.dumps(sets, ensure_ascii=False).replace("</", "<\\/")
    # Optional error log: the student's standalone error-log page plus the bridge
    # that saves progress and reports to the Sheet (opened in an iframe by the site)
    elog = "null"
    errorlog_empty = bool(cfg.get("errorLogEnabled") and not cfg.get("errorLog"))
    if errorlog_empty:
        elog = json.dumps((SKILL / "errorlog-empty.html").read_text(encoding="utf-8")).replace("</", "<\\/")
    vocabulary_questions = []
    if cfg.get("errorLog"):
        el_path = (site / cfg["errorLog"]).resolve()
        if not el_path.exists():
            sys.exit(f"errorLog file not found: {el_path}")
        page = el_path.read_text(encoding="utf-8")
        # Recover question snapshots for existing vocabulary entries without rewriting the service data.
        decoder = json.JSONDecoder()
        for match in re.finditer(r'\{\s*"qid"\s*:', page):
            try:
                question, _ = decoder.raw_decode(page[match.start():])
            except ValueError:
                continue
            if isinstance(question.get("choices"), list) and question.get("prompt"):
                vocabulary_questions.append({k: question[k] for k in ("qid", "prompt", "choices", "correct")})
        bridge = (SKILL / "errorlog-bridge.js").read_text(encoding="utf-8")
        if cfg.get("feedback"):
            bridge += "\n" + (SKILL / "feedback-errorlog.js").read_text(encoding="utf-8")
        if cfg.get("vocabulary"):
            bridge += "\n" + (SKILL / "vocabulary-errorlog.js").read_text(encoding="utf-8")
        if "</body>" not in page or "const DATASETS" not in page:
            sys.exit(f"{el_path.name}: not an error-log page (needs </body> and const DATASETS)")
        i = page.rindex("</body>")
        page = page[:i] + "<script>\n" + bridge + "\n</script>\n" + page[i:]
        elog = json.dumps(page, ensure_ascii=False).replace("</", "<\\/")
    html = (tpl.replace("__ERRORLOG_HTML__", elog)
               .replace("__ERRORLOG_EMPTY__", json.dumps(errorlog_empty))
               .replace("__SETS_JSON__", sets_js)
               .replace("__SUBMIT_URL__", cfg.get("submitUrl", ""))
               .replace("__STUDENT__", cfg["student"]))
    if cfg.get("feedback"):
        feedback = "CONFIG.feedbackThreads = " + json.dumps(bool(cfg.get("feedbackThreads"))) + ";\n" + (SKILL / "feedback.js").read_text(encoding="utf-8")
        html = html.replace("</body>", "<script>\n" + feedback + "\n</script>\n</body>")
    if cfg.get("vocabulary"):
        vocabulary = "const VOCABULARY_QUESTIONS = " + json.dumps(vocabulary_questions, ensure_ascii=False).replace("</", "<\\/") + ";\n"
        vocabulary += (SKILL / "vocabulary.js").read_text(encoding="utf-8")
        html = html.replace("</body>", "<script>\n" + vocabulary + "\n</script>\n</body>")
    if cfg.get("vocabularyLearning"):
        if not cfg.get("vocabulary"):
            sys.exit("vocabularyLearning requires vocabulary enabled")
        bank = json.loads((site / cfg["vocabularyLearning"]).read_text(encoding="utf-8"))
        question_ids = set()
        for q in bank.get("questions", []):
            if q.get("id") in question_ids or not q.get("entryId") or q.get("type") not in ("meaning", "usage") or not q.get("passage") or not q.get("prompt"):
                sys.exit("Invalid or duplicate vocabulary quiz question")
            question_ids.add(q["id"])
            if len(q.get("choices", [])) != 4 or len(set(q["choices"])) != 4 or q.get("correctAnswer") not in ("A", "B", "C", "D") or len(q.get("explanations", [])) != 4 or not all(q["explanations"]):
                sys.exit("Vocabulary quiz requires four distinct choices, a correct answer, and four explanations")
        learning = "const VOCABULARY_LEARNING = " + json.dumps(bank, ensure_ascii=False).replace("</", "<\\/") + ";\n"
        learning += (SKILL / "vocabulary-learning.js").read_text(encoding="utf-8")
        html = html.replace("</body>", "<script>\n" + learning + "\n</script>\n</body>")

    if cfg.get("classNotes"):
        notes = json.loads((site / cfg["classNotes"]).read_text(encoding="utf-8"))
        lesson_ids = set()
        if not isinstance(notes.get("lessons"), list) or not notes["lessons"]:
            sys.exit("Class notes require at least one lesson")
        for lesson in notes["lessons"]:
            lid = lesson.get("id", "")
            if not re.fullmatch(r"[a-z0-9-]+", lid) or lid in lesson_ids or not all(lesson.get(k) for k in ("title", "date", "summary", "sections")):
                sys.exit("Invalid or duplicate class-notes lesson")
            lesson_ids.add(lid)
            section_ids = set()
            for section in lesson["sections"]:
                sid = section.get("id", "")
                if not re.fullmatch(r"[a-z0-9-]+", sid) or sid in section_ids or not section.get("title") or not section.get("html"):
                    sys.exit("Invalid or duplicate class-notes section")
                section_ids.add(sid)
        notebook = "const CLASS_NOTES = " + json.dumps(notes, ensure_ascii=False).replace("</", "<\\/") + ";\n"
        notebook += (SKILL / "class-notes.js").read_text(encoding="utf-8")
        html = html.replace("</body>", "<script>\n" + notebook + "\n</script>\n</body>")

    out = pathlib.Path(a.out) if a.out else site / "index.html"
    out.write_text(html, encoding="utf-8")
    print(f"Built {out}: {len(sets)} set(s), {sum(len(s['questions']) for s in sets)} questions, "
          f"student={cfg['student']}, sync={'ON' if cfg.get('submitUrl') else 'OFF (no URL yet)'}, "
          f"error log={'ON (' + cfg['errorLog'] + ')' if cfg.get('errorLog') else 'EMPTY' if errorlog_empty else 'OFF'}")


if __name__ == "__main__":
    main()
