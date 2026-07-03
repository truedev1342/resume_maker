# Resume Maker · Job Search

A local web app to **build ATS-optimized resumes tailored to a job** and **aggregate jobs from boards you add** — with **no database** (everything is stored as files on disk).

- **AI tailoring**: tries **Anthropic** first, then **OpenAI**, then a local keyword-merge fallback (works with no keys).
- **3 fixed accounts**, no signup. `huy` is an admin.
- **File storage only** — uploaded PDFs and generated resumes live under `server/storage/`.

---

## Quick start

```bash
# 1. install
npm install

# 2. (optional) configure AI keys
cp .env.example .env        # then edit .env and add ANTHROPIC_API_KEY or OPENAI_API_KEY

# 3a. development (two processes: API on :4000, Vite UI on :5173)
npm run dev
#   → open http://localhost:5173

# 3b. OR production-style (build the UI, serve everything from :4000)
npm run serve
#   → open http://localhost:4000
```

> On Windows, run these in PowerShell or Git Bash from the project folder.

### Logins

| Username | Password        | Role  |
|----------|-----------------|-------|
| `huy`    | `qwe123QWE!@#`  | admin |
| `tony`   | `qwe123QWE!@#`  | user  |
| `phan`   | `qwe123QWE!@#`  | user  |

---

## Features

### 1. Resume Maker
- Pick one of **3 ATS templates** (each ships with an editable **sample resume**).
- Optionally **upload your own resume PDF** — it's saved to `server/storage/uploads/` and its text is extracted as the base for tailoring.
- Provide the target job by **link** (auto-parsed) or by **pasting the description**.
  - If a link can't be read (login wall, bot-protection, 404, or JS-only page), the app shows a **clear reason** and suggests pasting the description.
- Click **Create tailored resume** → the AI rewrites/reorders your real experience to match the job's keywords, in the chosen template's layout.
- **Open / Print → PDF** (browser print-to-PDF) or **Download** the resume. Generated files are saved to `server/storage/generated/`.

### 2. Job Search
- **Add job sites** and the app aggregates listings into a filterable table: **Title, Company, Country, Location, Salary, Role, Site**.
- **View** opens the original posting in a new tab.
- Click **"What can I add?"** in the app for the live list of supported sources. Currently supported:

  | Source | Type | Example URL |
  |---|---|---|
  | hiring.cafe | Aggregator | `https://hiring.cafe` (search-filter URLs work too) |
  | RemoteOK | Aggregator | `https://remoteok.com` |
  | Remotive | Aggregator | `https://remotive.com` |
  | Arbeitnow | Aggregator | `https://www.arbeitnow.com` |
  | We Work Remotely | RSS feed | `https://weworkremotely.com/remote-jobs.rss` |
  | Greenhouse | Company board | `https://boards.greenhouse.io/{company}` |
  | Lever | Company board | `https://jobs.lever.co/{company}` |
  | Ashby | Company board | `https://jobs.ashbyhq.com/{company}` |
  | SmartRecruiters | Company board | `https://jobs.smartrecruiters.com/{Company}` |
  | Recruitee | Company board | `https://{company}.recruitee.com` |

- It also reads any site exposing an **RSS/Atom feed** or **schema.org JobPosting** data, and falls back to detecting individual job links.
- When a site can't be read (JS-only SPA, a marketing page with no real board, login wall, etc.), the **Source status** panel explains exactly why instead of showing junk rows.

### 3. Admin (huy)
- Overview of counts, AI engine status, and storage paths.
- View/delete **all** users' uploads and generated resumes, manage job sites, and clear the job cache.

---

## How the "no database" storage works

```
server/
  data/                  # JSON "tables": sites.json, uploads.json, resumes.json, jobsCache.json
  storage/
    uploads/             # uploaded sample resume PDFs
    generated/           # generated resumes (<id>.html + <id>.json)
  templates/             # built-in ATS templates + sample content
  lib/                   # auth, storage, ai, fetcher, jobParser, jobScraper, resumeParser
  routes/                # auth, templates, sites, jobs, resumes, admin
```

JSON writes are atomic (temp file + rename) and serialized per file.

---

## Notes & limits
- **Scraping reality**: many job boards are JavaScript single-page apps or actively block bots. Those can't be read from raw HTML — the app reports this clearly rather than failing silently. Greenhouse/Lever boards and sites exposing feeds/APIs work best.
- **PDF output** is produced via the browser's print-to-PDF for perfect fidelity to the on-screen layout (no heavy headless-browser dependency).
- The AI is instructed **not to fabricate** experience — it only rephrases/reorders what's in your base resume or the chosen sample.
- Session secret and the (shared) demo password are intentionally simple for a local tool. Change `SESSION_SECRET` in `.env` for anything shared.
