> **Legacy reference:** This document describes the original job-command-center MVP. It is not the active roadmap for the company-research and Spain salary-decision product.

# EQ — Job command center, MVP spec v1

Personal, single-user, no auth. Stack: Next.js + shadcn/ui + Convex. Claude Code is the research engine; the app is the live display/storage layer. Convex reactivity means anything Claude writes appears in the browser instantly.

---

## 1. The three system rules (these kill 80% of edge cases)

### Rule 1 — The confidence ladder
Every job sits on one of three rungs, shown as a badge on the card:

| Rung | How it got there | What scores look like |
|---|---|---|
| `stub` | Parsed from a radar paste (title/company/location only) | Deduced scores, shown with `≈` prefix and dotted underline |
| `researched` | Claude found the real posting / salary / company data online | Mixed: verified fields cite a source URL, the rest stay deduced |
| `deepdived` | User pasted the full JD | Full-confidence scores, line-by-line requirement match |

A card can only move up the ladder, never down. Re-research updates data but keeps the rung.

### Rule 2 — Provenance hierarchy
Every field stores `{value, provenance, sourceUrl?, fetchedAt?, rationale?}` where provenance is one of:

`user` > `verified` > `deduced` > `unknown`

- Re-research NEVER overwrites a `user`-edited field. User corrections are final until the user clears them.
- `verified` requires a real URL. No URL = it stays `deduced`. This is the hallucination guard: Claude is never allowed to present a researched number without a citation.
- `deduced` values render visually distinct everywhere (≈ prefix). Fake precision is the #1 trust killer.

### Rule 3 — Renormalized verdict
Verdict = weighted mean over dimensions **that have data**, weights renormalized to 100% across those dimensions.
- No CV yet → fit is excluded, other weights scale up. Never score a missing dimension as 0.
- Verdict displays with a confidence band derived from its inputs' provenance: `84 ±3` (deep-dived) vs `≈71 ±12` (stub).
- Tier thresholds (S ≥ 90, A ≥ 80, B ≥ 65, C < 65) apply to the midpoint; a card whose band straddles a tier boundary shows the lower tier (pessimistic display, no inflated promises).

---

## 2. Processing pipeline (app ↔ Claude)

States for every Claude-processed item (ingest, research, tailor, deep-dive):

`pending → processing → done | failed(reason, retryCount)`

- The app can always queue work (paste, click buttons) even when Claude isn't running. A persistent queue banner shows "3 items waiting — open Claude Code and run `/process` (or `/loop 2m /process` to keep it watching)".
- `failed` items surface the reason in the UI ("couldn't find posting", "web search failed") with a Retry button. Auto-retry on next `/process` run, max 3 attempts, then the item asks for manual help ("paste the posting yourself").
- Claude writes via Convex mutations; user edits and Claude patches never race destructively because merges are field-level and provenance-gated (Rule 2).
- Every relative timestamp from LinkedIn ("8 hours ago") is converted to an absolute `postedAt ≈ pastedAt − 8h` at parse time. Relative ages are relative to the paste moment, not the viewing moment — storing the string would silently rot.

---

## 3. Pages and global buttons

| Page | Purpose | Primary buttons |
|---|---|---|
| Dashboard | Ranked job list | `+ Add jobs` (paste modal), sort chips, filter chips, weight sliders, queue banner |
| Job detail (drawer) | One job, everything known | `Tailor CV`, `Why this rank`, `Referral path`, `Re-research`, `Paste full posting`, status chip, `Archive`, `Edit fields` |
| Deep-dive | Paste one full JD → full report | `Analyze`, then `Merge with existing card` / `Save as new`, `Tailor CV`, `Add to battle plan` |
| Battle plan | Ordered apply queue + deadlines | `Mark applied`, `Snooze`, `Skip (with reason)` |
| Skill heatmap | Aggregate gaps → learning plan | `Verified only` toggle, tier filter, per-skill `Mark as known` / `Add to learning plan` |
| Profile | CV upload + parsed profile + preferences | `Upload CV`, `Confirm parse`, per-field edit, availability date, languages |
| Settings | Weights, dealbreakers, display | weight sliders, dealbreaker toggles, currency, `Export JSON` |

Empty states — every page has one, with the single action that fixes it: Dashboard → "Paste your first LinkedIn search", Heatmap → "Needs ≥3 jobs", Tailor/Fit → "Upload your CV to unlock", Battle plan → "Nothing to apply to yet".

---

## 4. Feature specs

### F1 — Radar paste (bulk stub parser)

Workflow:
1. `+ Add jobs` → modal with one big textarea. Auto-detect: many short blocks = search-results page; one long text = full posting (offer to route to Deep-dive).
2. Submit saves raw text as an `ingests` row (`pending`). Nothing is parsed client-side — messy LinkedIn text is Claude's job.
3. Claude splits into stubs anchored on company-logo lines, strips chrome ("Set job alert", "37 results", "Apply", "Viewed", promoted ads), collapses LinkedIn's duplicated title strings ("Beca en IA Beca en IA" → once), extracts network banners, converts relative ages to absolute.
4. Batch summary chip appears in app: "Found 5 jobs · 1 duplicate updated · 1 you'd already viewed" with per-job undo.
5. New stubs auto-enter the research queue, freshest-first.

Buttons: `+ Add jobs`, `Parse` (queues), per-batch `Undo`, per-stub `Not a job` (trains nothing, just deletes).

Edge cases:
- **Truncated final entry** (paste cut mid-job, like the Uber row) → capture with whatever fields exist; missing fields = `unknown`, research fills them.
- **Duplicate of an existing card** (re-pasting the same search next week) → don't create a new card; update `lastSeenAt`, increment `repostCount` if posted-age reset. Repost count feeds the ghost-job detector — duplicates become signal, not noise.
- **Duplicate of an ARCHIVED card** → stays archived, summary notes "1 previously archived — not resurrected". Archive is why deletes must be soft.
- **Multi-city posting** ("Madrid y Barcelona") → one card, `locations[]`, flexibility scored on the nearest to the user's base.
- **Mixed languages** → store original title + canonical English title; card shows original, search matches both.
- **Two network-banner types** — "139 UPV *school* alumni work here" vs "254 Amazon *company* alumni work here" are different signals; parse into `schoolAlumni` and `pastEmployerAlumni` separately.
- **Banner mis-attachment** — alumni/connection lines must bind to the job block they appear inside, never leak to the next job.
- **"Viewed" marker** → badge, don't skip; user may still want it.
- **Promoted listings** → `promoted` flag, small aura penalty (paid reach ≠ organic demand).
- **Giant paste** (100+ jobs) → hard cap 50/batch with a warning; research queue is cancellable ("Stop researching remaining 34").
- **Not LinkedIn at all** (Indeed, InfoJobs, email digest, random text) → parser is source-agnostic; if zero job-like stubs found → ingest `failed: "no jobs recognized"` shown in app, raw text preserved.
- **Same paste submitted twice** (double-click, impatience) → ingest content-hash dedupe; second submit attaches to the first's status.

### F2 — Auto-research enrichment

Workflow per stub: ① check `salaryCache` (key: title-family + location + level) → ② find the real posting (company careers page, program sites — not the auth-walled LinkedIn URL) → ③ extract requirements → ④ salary/stipend triangulation (levels.fyi, Glassdoor, Payscale, Indeed, Spanish sources like convenio tables for becas) → ⑤ company signals (rating, layoffs, trajectory) → ⑥ compute scores → ⑦ write with per-field provenance.

Buttons: per card `Re-research` (icon), confidence badge → provenance popover (every field: value, source link, fetched date), `View sources` inside Why-this-rank.

Edge cases:
- **Posting not findable** (generic "IT Intern / Trainee, Hilton") → requirements deduced from equivalent postings; card gets a persistent CTA: "Posting not found — paste it for a deep-dive". Never invent a source.
- **One stub, 70 vacancies** (Airbus Discover program) → link the program page, note "program, 70 openings across disciplines"; fit scored against the user's most likely track.
- **Sources disagree on salary** → store all figures with sources; display median + range; spread > 40% → confidence `low`, salary weight contribution damped.
- **No data exists** (niche intern stipend) → market estimate from Spain intern norms, labeled `≈ estimate`, wide band.
- **Currency & period** — Spanish stipends quoted €/month, US salaries $/year. Store `{amount, currency, period}`, normalize to €/year for scoring, display native ("€1,000/mo").
- **Search failure mid-batch** → job stays at current rung, `failed` with retry; batch summary reports "researched 4/5".
- **Stale research** (>30 days) → `stale` badge, one-click refresh; all claims are date-stamped.
- **Cache poisoning** — cache entries store their sources too; a `Re-research` with "skip cache" option exists for when the market moved.

### F3 — Network leverage score

Workflow: computed at parse time from banners; contributes to verdict as a modifier (not a 6th slider — it boosts within Fit... no: it's a rank *modifier* shown separately, max ±5 verdict points, so it never drowns the core scores).

Buttons: `Referral path` on cards that have a path → panel with: who (connection name from paste, e.g. "Antonio Martínez Peiró"), path type (1st-degree / school alumni / past-employer alumni), a Claude-drafted intro message (editable, `Copy`), and a mini checklist: `Messaged` → `Replied` → `Referral secured` (feeds battle plan ordering).

Edge cases:
- **No banner** → network = `unknown`, neutral modifier 0. Absence of data ≠ absence of network.
- **Alumni count inflation at big companies** → normalize by company size; 139 alumni at Airbus Spain ≠ 139 at a 500-person startup. School-wide alumni ≠ the hiring team — cap the modifier.
- **The app never contacts anyone.** Drafts only, user sends manually. No exception.
- **Connection names are personal data** → stored locally in the user's own Convex project only; shown, never exported in `Export JSON` unless the user ticks "include contacts".

### F4 — Fit-from-title deduction

Workflow: parsed CV profile × requirement set (deduced at stub rung, verified at deep-dive) → fit score + breakdown: `have` / `partial` / `missing` per requirement, each tagged must-have vs nice-to-have.

Buttons: fit chip expands → requirement checklist; per requirement `I know this` override (recomputes fit, flags "add to CV" → feeds Tailor); `Improve fit` → links to Tailor + Heatmap.

Edge cases:
- **No CV uploaded** → fit shows `—` + unlock CTA; verdict renormalizes (Rule 3).
- **Intern-aware scoring** — for internship/trainee roles, weight coursework, projects, and tooling; never penalize "no professional experience". Conversely, detect over-qualification asks (trainee role requiring a finished master's).
- **Eligibility is separate from fit** — hard requirements get their own pre-check per card: `eligible` / `check needed` / `ineligible (reason)`. Checks: graduation-window rules ("recent graduates" for an Oct 2026 start), enrollment/convenio requirements common in Spanish becas, language levels (Airbus: Spanish B1 + fluent English), work permit. Ineligible cards gray out with the reason — never silently deleted, because eligibility deductions can be wrong and the user can override (`I am eligible` button).
- **User's override vs re-research** — overrides are `user` provenance, permanent (Rule 2).
- **CV parse quality** — two-column PDFs, Spanish CVs, graphic templates → after parsing, the Profile page shows the structured result with "Is this right?" confirm step; low-confidence extractions highlighted for manual fix. Fit is only computed after the user confirms the parse once.
- **Skill synonyms** — PySpark≈Spark, AWS≈Amazon Web Services: all skills normalized to a canonical taxonomy at write time (same taxonomy the heatmap uses, so counts line up).

### F5 — Career runway forecaster (Future score)

Workflow: research company trajectory (orders/funding/hiring/layoffs), role trajectory (what this becomes in 3–5 years), and skill AI-resistance for the stack the job builds → future score + a short written thesis with dated sources.

Buttons: future chip expands → thesis + sources; `Challenge this` → free-text box that sends the user's counterargument to Claude for a re-examination (result versioned, both kept).

Edge cases:
- **Score the function, not the logo** — Hilton IT ≠ hospitality frontline; Airbus data team ≠ assembly line. Runway attaches to division/function when determinable.
- **Private company, no news** → industry proxies, confidence `low`, explicitly stated in the thesis.
- **Conflicting signals** (company-wide layoffs but this unit hiring) → role-level signals win; thesis must mention the conflict rather than average it away.
- **News rot** — every claim date-stamped; theses older than 30 days get the `stale` badge.

### F6 — Internship reality check

Workflow: for roles typed `internship/trainee/beca`: stipend research, conversion-to-FTE probability, program prestige, learning ROI (which of the user's missing heatmap skills this job would teach), and fine-print extraction.

Buttons: "Program facts" section in the detail drawer: stipend, duration, hours, conversion estimate + basis, `net cost` line when applicable.

Edge cases:
- **The "paid" program that costs money** — Airbus Discover bundles a mandatory master's (UCJC): research whether tuition is covered; show `net = stipend − tuition` if not. This one line can flip a decision.
- **No public conversion data** → deduce from program design (explicit pipeline program = high; one-off intern = unknown), labeled `≈`.
- **Unpaid internship** → automatic red flag + available as a dealbreaker toggle.
- **Calendar conflicts** — program dates (Oct 2026 start, 11 months, "August disabled") checked against the user's availability date from Profile; conflict → eligibility `check needed`.
- **Learning ROI double-count** — a job scoring high on Future because of its stack shouldn't double-dip in learning ROI; learning ROI only counts skills the user is *missing*.

### F7 — Deep-dive page

Workflow:
1. Paste full JD (or arrive via a card's `Paste full posting` CTA, which pre-links the job).
2. Saved immediately as raw text (`pending`), Claude processes.
3. Report: requirement match table (have/partial/missing × must/nice), all six scores at full confidence, fine print (bundled obligations, selection windows, external recruiter, monitoring consents), red flags, salary vs market.
4. If the JD matches an existing stub (fuzzy company+title) → "Looks like your Airbus card — merge?" Merge upgrades the card to `deepdived`; Save-as-new available.

Buttons: `Analyze`, `Merge with existing card` / `Save as new`, `Tailor CV for this`, `Add to battle plan`, `Copy summary`.

Edge cases:
- **Re-pasting an already deep-dived job** → diff mode: "JD changed since May: salary range removed, Spanish requirement added." A changed repost is a strong signal, surfaced as such.
- **Boilerplate stripping vs fine print** — EEO statements and benefits fluff are ignored for scoring, but legal fine print is still scanned (visa, consent, compliance clauses like Airbus' monitoring notice).
- **URL pasted instead of text** → try fetching; LinkedIn URLs are auth-walled → graceful message: "LinkedIn blocks robots — paste the text of the posting instead."
- **Two jobs in one paste** → detect and offer to split.
- **Huge JD** → chunked processing; raw text always stored whole regardless.
- **Language** — bilingual JDs handled; analysis output in English by default (posting-language toggle exists for Tailor, F8).
- **JD contradicts the stub** (stub said hybrid, JD says on-site) → JD wins (`verified` beats `deduced`), the change is called out in the report.

### F8 — Tailor studio

Workflow: per job → generates (a) CV bullet rewrites as before→after pairs, each mapped to the requirement it targets, (b) ATS keyword list split present/missing, (c) 60-second "why this company" pitch, (d) optional cover letter. All versioned per job.

Buttons: per suggestion `Accept` / `Reject` / `Edit`; `Copy all accepted`; `Generate cover letter`; `Regenerate with my notes`; output-language toggle (EN/ES); `Apply accepted changes to master profile` (updates the CV profile → recomputes fit everywhere).

Edge cases:
- **The truthfulness guard (non-negotiable)** — suggestions may only *reframe* real experience. Every suggestion is typed `reframe` (allowed) or `gap` (not on your CV → routed to the heatmap learning plan, never written into the CV). The studio must never help the user lie.
- **No CV** → studio locked, upload CTA.
- **Stub-rung job** → banner: "Based on ≈deduced requirements — deep-dive for exact keywords", still functional.
- **Posting in Spanish** (Mapfre beca) → default output language = posting language, toggleable.
- **CV updated after tailoring** → old tailorings get a `stale` badge with one-click regenerate; versions kept.
- **Conflicting accepted suggestions across jobs** — accepted changes apply to per-job exports; only `Apply to master profile` mutates the shared CV, and it shows a diff first.

### F9 — Skill gap heatmap

Workflow: aggregate normalized requirements across all non-archived jobs → matrix of skill × frequency, colored by have/partial/missing → learning plan ranked by doors-opened (count of jobs unlocked, weighted by their verdict tier) per estimated learning effort.

Buttons: tier filter (only S/A jobs), `Verified only` toggle (exclude deduced requirements), per skill: `Mark as known` (corrects profile, recomputes all fits), `Add to learning plan`, plan item states know/learning/todo.

Edge cases:
- **Small sample** → renders from 1 job but shows "based on N jobs" caveat below 5; no percentage claims below 3.
- **Deduced pollution** — deduced requirements count at half weight; `Verified only` for purists.
- **Synonym fragmentation** → same canonical taxonomy as F4, so "Spark" isn't three different bars.
- **Archived/rejected jobs** excluded by default (don't learn Kafka for a job you skipped), toggleable.
- **`Mark as known` ripple** — updates profile with `user` provenance → every fit score recomputes → verdicts and battle plan reorder. This ripple is a feature; the UI animates the re-rank so it doesn't feel like a glitch.

### F10 — Application battle plan

Workflow: for every `eligible`, non-archived job: urgency (absolute posted-age, review-speed hints like "typically 1 week", extracted deadlines/selection windows) × verdict × readiness (CV tailored? referral in motion?) → an ordered, dated queue: "Today: Mapfre (posted 8h ago — day-one applicants get outsized reply rates). This week: Airbus (window open till July). Blocked: Alstom — confirm eligibility first."

Buttons: `Mark applied` (captures date + channel + whether via referral), `Snooze until…`, `Skip` with reason picker (too far / salary / not interested / other). Status chips everywhere: saved → applied → interviewing → offer / rejected.

Edge cases:
- **No deadline stated** (most posts) → estimate from posted-age + typical intern cycles, labeled `≈`.
- **Everything is urgent** (37 fresh results) → daily queue caps at top 3 by verdict; the rest scheduled across days. Quality of application beats spray-and-pray, and the cap enforces it.
- **Old postings** (>30 days, like Corex) → "verify still open before applying" warning; can't check LinkedIn robotically, so the user clicks through.
- **Applied, then job reposted** → user status is authoritative; repost noted as info ("reposted after you applied — consider a follow-up"), status untouched.
- **Skip reasons feed the ranker** — 3 skips for "too far" suggests raising the flexibility weight or adding an on-site dealbreaker; the app *proposes* the change, never silently self-tunes.
- **Deadline passed** → auto-moves to `expired` (not rejected — different emotional color), with "similar jobs" pointer if any card matches ≥80%.

---

## 5. Cross-cutting edge cases

1. **Claude offline** — everything queues; banner explains how to resume. No feature hard-depends on Claude being live except enrichment freshness.
2. **Concurrent writes** — Convex mutations are transactions; merges are field-level; provenance gates every overwrite (Rule 2). The user can edit a card while Claude researches it with zero data loss.
3. **Soft delete only** — `Archive` everywhere, no destructive delete in the UI. Re-pastes never resurrect archived jobs. A real delete exists only in Settings, double-confirmed.
4. **Every AI output is editable** — any field, any score rationale, any suggestion. `user` provenance wins forever.
5. **Time integrity** — all relative dates converted to absolute at ingest; all research date-stamped; `stale` badges at 30 days.
6. **Numbers honesty** — no naked deduced numbers: `≈` prefix, confidence bands on verdicts, citations on verified figures.
7. **Export** — `Export JSON` of everything (jobs, scores, provenance, history) from Settings. It's the user's job hunt; no lock-in. Contacts excluded unless opted in.
8. **Currency/locale** — display currency setting; scoring normalizes internally to €/year.
9. **Score churn** — re-research can move scores; card shows a small "changed since yesterday: salary 72→81" note so silent re-ranks never gaslight the user.
10. **Overload protection** — batch caps (50 stubs), daily apply cap (3), research queue cancellable. The app should reduce anxiety, not multiply it.

---

## 6. Data model (Convex)

- `jobs` — identity (company, title, canonicalTitle, locations[], workMode), lifecycle (rung, researchStatus, userStatus, eligibility {state, reason}), timestamps (postedAt≈, pastedAt, lastSeenAt, repostCount), content (rawStub, rawJD?, requirements[] {skill, level, mustHave, provenance}), scores {fit, salary, aura, future, flex, network} each {value, band, provenance, rationale, sources[], fetchedAt}, redFlags[], finePrint[], programFacts?, promoted, viewed.
- `ingests` — rawText, contentHash, status, summary {found, duplicates, failed}.
- `profile` — cv {storageId, parsedAt, confirmed}, skills[] (canonical, {level, provenance}), education, projects, languages, availabilityDate, baseLocation.
- `salaryCache` — key {titleFamily, location, level}, figures[] {amount, currency, period, source}, fetchedAt.
- `tailorings` — jobId, version, suggestions[] {type: reframe|gap, before, after, targetRequirement, state}, coverLetter?, language, stale.
- `settings` — weights, dealbreakers, displayCurrency, dailyApplyCap.
- `requests` — generic Claude work queue (kind, payload, status, retryCount, failReason).

## 7. Build order

1. Scaffold + schema + seed data (app visible day one)
2. Dashboard: cards, sort, filters, sliders, verdict renormalization, empty states
3. F1+F2: radar paste → `/process` skill → live enrichment (the magic moment)
4. F4 + Profile: CV upload, parse-confirm flow, fit + eligibility
5. F7: deep-dive page + merge flow
6. F8: tailor studio with truthfulness guard
7. F3+F5+F6: network, runway, internship reality check
8. F9+F10: heatmap + battle plan
9. Cross-cutting polish: provenance popovers, stale badges, export, score-churn notes
