<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Project plan workflow

There is no active plan document. `SPEC.md` is a legacy MVP reference and must not be treated as the active roadmap.

## Platform budget — everything must fit the free plans

This project runs entirely on **Convex free (Starter)** and **Vercel free (Hobby)**. Paid upgrades are not an option. Every change must keep steady-state usage inside these ceilings, with headroom.

Convex free, per month unless noted: **1 GB** database storage · **1 GB** database bandwidth (bytes read + written by function runs) · **1M** function calls · **20 GB-hours** action compute · **1 GB** file storage.
Vercel Hobby: no commercial use · **100 GB** bandwidth/month · limited serverless execution and build minutes · cron jobs capped (roughly daily granularity). Verify current numbers at the provider dashboards before relying on a margin.

### Rules for reads and writes

Every rule below has already cost this project real budget. None of them are hypothetical.

**Never read rows you are about to throw away.** No `.collect()`, and no large or unbounded `.take()`, followed by a `.filter()` in JavaScript — in a **query, mutation, and action alike**. Read through a selective index range instead. This one pattern was the single largest consumer of database I/O here: a mutation read all 2,843 job postings every six hours to keep about 400 of them, and the index it needed already existed. If you are filtering a result set in JS, the filter belongs in the index.

**A reactive `query` re-runs on every write touching a table it read, times every mounted subscriber.** An expensive query is not paid once; it is paid per write per open tab.

**Writing an unchanged value is not free.** It costs write bandwidth and it wakes every subscriber of that table. Compare before you `patch`, and skip the write when nothing differs. A sync that rewrote 25 rows with byte-identical values every 15 minutes cost ~156 MB/month and produced the deployment's OCC conflicts.

**Cost a shared helper at its most frequent caller, not its average one.** A "cheap preamble" called by seven actions costs whatever the 15-minute cron among them costs. Prefer making the helper short-circuit — fingerprint its input and return early when nothing changed — over trusting each caller to call it less often.

**Derive batch sizes from row *size*, not row count.** `limit: 500` looks conservative and is fatal on a table whose rows are 400 KB; Convex aborts a transaction at 16 MB of reads. Check what a row actually weighs before choosing a bound. `rawSnapshots` rows here run 5 KB to 418 KB.

**One maintenance job per table.** A mutation that prunes or migrates several tables shares one transaction, so one table exceeding a limit rolls back the work already done for the others. Split them and schedule them separately.

**There is no count without reading rows.** To show a count, read only the exact rows via a compound index, or maintain a counter.

**Keep cron frequency proportional to how fast the data actually changes.** Minute-level intervals are almost never justified. Something derived from a compiled-in constant only changes on deploy.

### Measure; do not estimate

Convex reports exact per-execution `usageStats` — `databaseReadBytes`, `databaseReadDocuments`, write counts — for every function run. Use them.

- **Never estimate a cost you can measure.** Extrapolating one run's cost across a month has already produced an answer wrong by more than 10×. Run the function, read the actual bytes and documents, quote those.
- **Report before and after with the same arguments, and confirm the output is unchanged.** An optimization that alters results is a bug, not a saving.
- **A dashboard total is cumulative for the billing period, not a current rate.** It bills cost to code that may already be fixed, and keeps showing the old total until the period rolls over. Read the recent logs to learn what a function costs *now*.
- **Look for silently failing scheduled work.** A cron that exceeds a limit fails, does nothing, and reports nothing — while still being charged for every byte it read on the way to failing. One here failed every night for days. The deployment's insights feed lists these; read it whenever the numbers look wrong.
- **Diagnostics are charged too.** A throwaway query that samples a few large documents can cost megabytes — mine cost 138 MB, 5% of the monthly allowance. Never `take()` rows just to look at them: count, size, and aggregate server-side, and return numbers.

For a **new feature**, where there is nothing to measure yet, estimate before building — and then measure once it runs, because the estimate is a hypothesis. Tell me if it could cause problems, with rough magnitude and blast radius:
- DB bandwidth: bytes per query/mutation run × expected runs/month (include reactive re-runs and open tabs).
- Function calls: added calls/month, including crons and client subscriptions.
- Storage growth: rows/month × row size, and whether retention bounds it.
- Action compute and Vercel function time for anything doing fetches or heavy work.

If a feature plausibly pushes any metric past ~50% of its limit, say so up front — "this adds ~X MB/month of DB bandwidth", "this could double function calls", "this grows storage unbounded" — and propose the cheaper design or the mitigation, rather than building it and letting the overage surface later. Flag whether the impact is gradual (storage creep) or a cliff (a reactive query that melts the bandwidth budget the moment traffic rises).

## Git workflow — commit granularly

Commit early and often. Prefer many small commits over one large one: each
self-contained unit of work gets its own commit as soon as it stands on its
own, rather than batching a session's work into a single push at the end.

A good commit boundary is anything that could be reviewed or reverted by
itself — one query rewritten, one bug fixed, one component extracted, one set
of tests added. If a change touches several files but serves one purpose, that
is one commit; if one file gets three unrelated fixes, that is three commits.

Push after each commit rather than accumulating locally, so the remote always
reflects current state.

Every commit must be real work that stands on its own — splitting genuine
changes finely is the goal; empty or no-op commits are not.

## Evidence rules

Pay figures are decision data, not decoration. A number may only be shown as a company's pay for a level when it was posted for **that** level, in a compatible location scope. A range posted at a different level is context and must never rank, sort, feed a net-cash estimate, or count as evidence coverage. Unknown stays unknown.
