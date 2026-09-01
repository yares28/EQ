---
name: process
description: "Research and score the jobs AND companies the user has queued in EQ. Reads pending ingests + jobs needing research from Convex, does REAL external research (Glassdoor, levels.fyi, Payscale, Indeed, company careers pages, news) — never just the posting — triangulates salary with citations, scores fit/salary/aura/future/flex with per-field provenance, and writes verified, cited results back to Convex."
when_to_use: "TRIGGER when the user runs /process, says 'process the queue', 'research my jobs', 'enrich the pasted jobs', or the EQ app shows N jobs waiting for research. This is the research engine EQ's whole product depends on — the app only stores and displays; THIS skill produces the data."
---

# EQ — /process research engine

The EQ app collects raw pastes (LinkedIn search dumps, single postings) as **pending ingests**, and holds jobs at rung `stub`/`researched` with `researchStatus` `pending`/`failed`. Your job when the user runs `/process`: turn those into fully **researched, scored, cited** jobs — using real web research against sources **outside** the posting — and write them back to Convex so they appear live in the app.

The single most important rule: **the posting is the least of it.** A job posting tells you the title and maybe a salary band. It does NOT tell you the company's Glassdoor rating, the real market rate on levels.fyi, whether they just had layoffs, or whether the team is growing. That external data is the entire value of this app. If you only read the posting, you have failed.

---

## 1. Read the queue from Convex

Use the Convex MCP `run` tool (preferred) or `npx convex run` to call the internal query that returns everything needing work:

```
mcp__convex__run  →  functionName: "research:getForResearch", args: "{}"
# or: CONVEX_AGENT_MODE=anonymous npx convex run research:getForResearch '{}'
```

It returns `{ jobs: [...], ingests: [...] }`:
- `ingests` — raw pastes not yet parsed. Each `{ _id, rawText, ... }`.
- `jobs` — existing jobs at `researchStatus: "pending" | "failed"` that need a (re-)research pass.

If both are empty, tell the user the queue is clear and stop.

## 2. Parse ingest stubs (F1)

For each pending ingest, split `rawText` into individual job stubs. LinkedIn search dumps are messy — anchor on company-logo lines, strip chrome ("Set job alert", "N results", "Apply", "Promoted", "Viewed"), collapse LinkedIn's duplicated title strings ("Beca en IA Beca en IA" → once). From each stub extract: **company, title, location, work mode** (on-site/hybrid/remote), **posted age** (convert "8 hours ago" to an absolute `postedAt = now − 8h` — relative ages rot), and **network banners** ("139 UPV school alumni work here", "1 connection works here" → these become the `network` score signal). One stub can be one `applyResearch` insert. Skip promoted ads and exact duplicates of jobs already in the pipeline (bump `repostCount` instead if you add that later).

## 3. Research each job — EXTERNAL sources, always

For every job (freshly parsed stub OR an existing pending/failed job), run this protocol. **Check the salary cache first** to avoid re-researching the same role:

```
research:lookupSalary  args: { titleFamily, location, level }   # e.g. "data engineer intern", "Madrid", "intern"
```

### Salary → the `salary` score (triangulate, cite, cache)
Do NOT trust the posting's number alone; many becas/postings omit it. `WebSearch` across, in rough priority:
- **levels.fyi** — best for tech comp; often thin for Spanish/insurer/intern roles (that's fine — record the miss).
- **Glassdoor** — `/Salary/` pages, company + role.
- **Payscale**, **Indeed** (`es.indeed.com/cmp/<company>/salaries`), and for Spain: the **company's own careers site** (`jobs.<company>.com`), **InfoJobs**, **Tecnoempleo**, **convenio de prácticas** norms.
Triangulate a range. Record every figure with its source URL in the score's `sources[]`. If ≥2 independent sources agree → `provenance: "verified"`, tight band. If sources conflict >40% or only norms exist → keep it `deduced`, wide band. Convert to €/year internally for scoring but keep the native figure (e.g. "€600–800/mo") for `programFacts.stipend`. Then **cache it**: `research:cacheSalary { titleFamily, location, level, figures:[{amount,currency,period,source}], fetchedAt: Date.now() }`.

### Aura → the `aura` score  (CV signalling power — NOT Glassdoor reviews)
Aura is: **how much does having this company + role on your CV open doors and make people want to talk to you?** It is prestige / brand cachet / recruiter pull, *not* employee satisfaction. A Glassdoor star rating is the wrong instrument here — a beloved-to-work-at local firm can have low aura, and a gruelling elite employer can have very high aura. `WebSearch` for signals of **CV signalling value**: employer-attractiveness/prestige rankings (Universum "Most Attractive Employers", LinkedIn Top Companies), brand tier and global recognition, selectivity of the program, and where alumni go next. Score the *function's* prestige, not just the logo (hotel IT ≠ the hotel brand). Aerospace/big-tech/elite-consulting brands → high; a solid but unglamorous incumbent (a regional insurer, back-office IT) → moderate even with great reviews. Cite the ranking/brand source → `verified`; a reasoned brand-tier estimate with no ranking found → `deduced`.

### Future → the `future` score  (5–10 year wealth, incl. equity — NOT "career runway")
Future is: **if you worked here 5–10 years, how much wealth would you build — and is there equity?** The key questions: does the company grant or offer **stock/RSUs/options/an employee share plan** (even if this specific role doesn't — it matters once you convert to full-time)? What is the **5–10 year total-comp trajectory** (pay growth + equity upside + exit value)? `WebSearch` for the **employee share/stock plan** (ESOP, RSU policy, discounted-share scheme), whether the company is publicly traded, comp-growth curves, and equity outcomes. A discounted-grant ESOP or RSU-heavy big-tech role → high; a self-funded share-purchase plan or a stable dividend-payer with modest pay growth → moderate; no equity and flat pay → low. Note contingencies honestly (e.g. "equity only starts if the beca converts to full-time"). Cite the plan/comp URLs → `verified`.

### Fit → the `fit` score  (how well YOUR CV matches this role)
Fit is: **how well does the user's CV match what this role needs?** Find the **real posting** (company careers page, program site — not the auth-walled LinkedIn URL, which `WebFetch` can't read). Extract required skills → `requirements[]` with `level` (have/partial/missing vs the user's profile from `profile.get`) and `mustHave`, then score how completely the CV covers the must-haves. If the real posting isn't findable, deduce requirements from equivalent postings and mark them `provenance: "deduced"`. Intern-aware: weight coursework/projects, never penalize "no professional experience".

### Flexibility → the `flex` score
Remote/hybrid/on-site, location vs the user's base, hours, program calendar. Usually derivable from the stub + posting.

### Network → the `network` score (rank modifier, ±5)
From the pasted banners. School-alumni counts and "N connections work here" → a warm path. Start the rationale with a clean standalone clause ("139 UPV alumni work here — …") so the app can derive a chip label. No banner → `provenance: "unknown"`, neutral.

### Internship reality check (F6) → `programFacts` + fine print
For becas/trainee programs: real stipend, duration, hours, conversion-to-FTE probability, and the killer detail — **hidden costs** (bundled mandatory master's whose tuition may not be covered → `netCostNote`). Extract selection windows, external recruiters, consent clauses into `finePrint[]`.

## 4. The provenance contract (non-negotiable)

Each score is `{ value, band, provenance, rationale, sources[], fetchedAt }`.
- `provenance: "verified"` REQUIRES ≥1 real source URL in `sources[]`. **Never** mark a score verified without a citation — that's the one rule that makes this app trustworthy.
- `deduced` = reasoned estimate, no hard source → wider `band`, and the UI shows it with `≈`.
- `unknown` = genuinely no signal → excluded from the verdict (never scored 0).
- Never invent a source URL. If you didn't open/see it in a search result, it doesn't go in `sources[]`.

## 5. Write results back to Convex

Per job, call the internal mutation with exactly the researched fields (arg shape defined in `convex/research.ts`):

```
research:applyResearch  args: {
  jobId?: <existing job id, omit to insert a new one>,
  ingestId?: <the ingest this came from, to mark it done>,
  patch: {
    company, title, canonicalTitle?, locations?, workMode?,
    rung: "researched" | "deepdived",      # stub only if you truly couldn't research it
    requirements?, scores?, redFlags?, finePrint?, programFacts?, eligibility?,
    researchStatus: "done"                  # or "failed" + researchFailReason if a source-less dead end
  }
}
```

`scores` is the full `{ fit?, salary?, aura?, future?, flex?, network? }` object; each present dimension is `{ value, band, provenance, rationale, sources: string[], fetchedAt }`. The mutation persists `scores` verbatim — it will NOT fix your provenance, so the citation discipline in §4 is on you.

Rung discipline (the confidence ladder, F-rule 1): a bulk stub you enriched from search = `researched`; a full JD the user pasted and you matched line-by-line = `deepdived`. A card only moves UP the ladder, never down.

## 5b. The company pass — work all three lists

Job research is only half of it. EQ tracks companies as well as jobs, and three
different things go stale on them. Work all three every run, in this order. The
job queue being empty is **not** a reason to skip this.

### List 1 — Review list: companies with no careers page

```
mcp__convex__run  →  functionName: "companySalaryCatalog:needingResearch", args: "{}"
```

Entries with `researchStatus` other than `monitoring` have no readable feed —
nothing in EQ is reading their roles at all. For each one:

1. Find the company's **real careers portal** for Spain (their own site, not a
   job aggregator, not LinkedIn).
2. Read every **tech role in Spain** it lists. Tech means engineering, data, ML
   or AI, cloud, platform, security, devops — not sales, support, or management.

   **`WebFetch` will usually fail here, and that is expected.** The companies on
   this list are on it precisely because their portals are not machine-readable:
   they render listings with JavaScript. Measured on this list — SAP, Meta and
   Uber returned an empty or "Loading jobs…" shell to `WebFetch`, and Deloitte's
   Spain roles are not on the US `apply.deloitte.com` site at all. Use the
   browser tools (`mcp__Claude_Browser__navigate`, then `get_page_text` or
   `javascript_tool`) for these, which render the page first.

   Some portals are closed even then — `jobs.ericsson.com` redirects to a
   Microsoft login. A portal you cannot read is a real finding: report it and
   move on. Do not substitute an aggregator's copy of the listing, and never
   write a role you did not read on the employer's own page.

   An empty result can also be true. Uber's Madrid engineering listing renders
   "No jobs found" — that is zero roles, not a failed read, and calling with
   `roles: []` and `complete: true` correctly records that nothing is open.
3. **For each role, open its own detail page and capture its full text.**
   `descriptionText` is not optional in practice — it is what the app's role
   dialog shows in place of leaving the app, and a role saved without it shows
   only a title and a location forever, because nothing else will ever fill it
   in later. Decode any HTML to plain text the way you would read it (strip
   tags, keep paragraph breaks) — do not summarize or reword it; it has to be
   the posting's own words. If the page states a salary anywhere — a range, a
   "Spain: €X – €Y" line, a "compensation" section — capture that line
   verbatim too as `salaryText`; if it does not state one, leave `salaryText`
   out rather than guessing.

4. Write them in one call:

```
companyRoleResearch:recordResearchedRoles  args: {
  companySlug,
  portalUrl,                 # https, the company's own careers page
  complete: true,            # ONLY if you read the whole Spain listing
  roles: [{ url, title, locations: [...], salaryText?, descriptionText? }]
}
```

### List 1b — roles missing their own text

Companies change hands between runs, and old runs of this pass predate the
description/salary requirement above. Before moving to List 2, backfill what
is missing:

```
mcp__convex__run  →  functionName: "companyRoleResearch:rolesMissingDescription", args: "{}"
```

For each entry, open its `url`, read the posting, and patch it in:

```
companyRoleResearch:fillMissingDescription  args: {
  postingId, descriptionText, salaryText?
}
```

This query already excludes monitored companies — their gaps self-heal on the
next automatic sync, and touching them here would fight that ownership rule
the same way harvesting their roles would. If a role's own URL now 404s, that
is worth noting in your summary rather than silently skipping it; it likely
means the posting closed and the company is due a re-harvest in List 1.

`complete: true` lets a role that has stopped appearing be marked closed. Pass
`complete: false` if you could not read the whole listing — otherwise every role
you did not happen to see is retired.

The mutation enforces scope itself: it rejects roles outside Spain or outside
tech, skips any role the automatic feed already holds, and **refuses a company
whose feed still works**. A `monitoring` company is not yours to touch — its
automatic fetch keeps ownership until it actually breaks. Never work around
that; if the fetch is broken the company will not be `monitoring`.

### List 2 — Pay queue: companies with no salary figure

Same `needingResearch` result: `missingLevels` is the subset of `intern` /
`junior` / `mid` with nothing on file. Research each against the §3 source
ladder — levels.fyi first, then Glassdoor `/Salary/`, Payscale, Indeed
(`es.indeed.com/cmp/<company>/salaries`), InfoJobs, Tecnoempleo, and the
company's own careers site — then write:

```
companySalaryCatalog:upsertPoint  args: {
  companySlug, level,                    # the level the figure was PUBLISHED for
  location, locationLabel,               # e.g. "Madrid" / "Madrid", "Spain-wide" / "Spain-wide"
  companyLevel,                          # the employer's own name for it: "L3", "SDE1", "Beca"
  totalCompEur, baseEur, bonusEur, equityEur, extrasEur,   # number | null each
  confidence: "High" | "Medium" | "Low" | "Unknown",
  confidenceNote, notes,
  sampleSize?, sampleNote?,
  sources: [{ label, url, publisher, checkedAt }],   # never empty
  researchedAt: Date.now()
}
```

### List 3 — Re-check: figures older than 30 days

```
mcp__convex__run  →  functionName: "companySalaryCatalog:staleFigures", args: "{}"
```

Re-read each figure's own source and call `upsertPoint` again with what it says
now. `upsertPoint` compares before writing and returns `unchanged` when the
numbers match, so confirming a figure that has not moved costs nothing. If the
source has changed, the new figure simply replaces the old one.

### The level rule is absolute

A figure is filed under the level it was published for and no other. If
levels.fyi has SDE2 and SDE3 but nothing for interns, you write `mid` and you
leave `intern` missing. Mapping a senior range onto an intern row, or averaging
levels to fill a gap, is the one thing that makes this data worse than having
none — the app is a decision tool and an invented intern figure gets acted on.

Leave a level missing when:
- no source published a figure at that level for that company;
- the only figures are for another country and nothing says they apply to Spain;
- the published ladder is internally inconsistent (a level below the one under
  it), or the employer's level cannot be mapped with confidence;
- sources conflict so widely that no honest band can be stated.

An all-level median or a "highest package reported" figure belongs to no level
and is never written.

`upsertPoint` rejects a row with no `sources[]` and a row with neither
`totalCompEur` nor `baseEur`, so a half-researched figure cannot slip through —
but the citation discipline in §4 is still on you.

## 6. Report to the user

After the pass, summarize in chat, per list: how many companies gained a careers
portal and how many roles were saved (and how many rejected as out of scope);
how many roles had a missing description backfilled;
how many companies gained a salary figure and at which levels, with the levels
you deliberately left empty and why; how many re-checked figures were unchanged
versus moved. Then how many jobs researched, which moved verified vs stayed deduced and why (e.g. "Hilton — real posting not found, requirements deduced from equivalent IT-intern roles"), any red flags surfaced (ghost jobs, unpaid, hidden tuition), and the net stipend surprises. The app updates live via Convex reactivity, so the user watches the cards enrich as you write — but the *why* belongs in your summary.

## Do NOT
- Fabricate scores, ratings, or salary figures. Every verified number has a URL.
- Stop at the posting. External research (Glassdoor, levels.fyi, news) is the point.
- File a salary figure under a level it was not published for, or blend levels to fill a gap. Unknown stays unknown.
- Skip the §5b company pass because the job queue was empty — the lists are independent.
- Harvest roles for a company whose career feed still works. The automatic fetch owns it until it breaks.
- Pass `complete: true` for a listing you only partly read — it retires every role you did not see.
- Save a role with no `descriptionText` because reading its own page felt optional. It leaves that role's dialog empty and nothing will fill it later.
- Invent a `salaryText` a posting does not state. Extractive only — copy what is there, or leave it out.
- Mark something verified you only guessed. Deduced is honest; fake-verified is not.
- `WebFetch` LinkedIn job URLs — they're auth-walled and will fail. Search for the company's own posting instead.
