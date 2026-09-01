# EQ release checklist

Run this before every deploy. Each step names the command and the result that
passes. A step that cannot be verified fails the release; nothing here is
satisfied by reasoning about the code.

## 1. Static verification

| Step | Command | Passes when |
| --- | --- | --- |
| Types | `npm run typecheck` | Exit 0 for both the app and the Convex project. |
| Unit tests | `npm test` | Every test passes; no test is skipped to make the run green. |
| Lint | `npm run lint` | No errors. |
| Build | `npm run build` | Compiles and prerenders every route. |

## 2. Source and schedule contracts

| Step | Command | Passes when |
| --- | --- | --- |
| Cron coverage | `npm run test:source-operations` | `verifyCronContracts()` returns no violations, so every registered source is either scheduled or recorded as deliberately unscheduled. |
| Cadence sanity | same run | No cron runs slower than the cadence its sources declare. |
| Retention policy | same run | Every retention rule keeps at least 90 days and at least one record per parent. |

A new source in `lib/source-registry.ts` fails this section until it is added
to a `CRON_CONTRACTS` entry or to `UNSCHEDULED_SOURCES` with a reason.

## 3. Live evidence health

| Step | How | Passes when |
| --- | --- | --- |
| Fleet health | Open `/data-sources` | The header reads "Sources are release ready". If it does not, the named sources must be refreshed or the release is held. |
| City cost bundles | Open `/salary-intel` for Madrid and for Valencia | Either an after-cost figure is shown, or the lock states which requirement is missing. A lock with a vague reason is a bug. |
| Career feeds | `npm run verify:netflix-careers` | The reconciliation summary reports `dataComplete: true` and no detail failures. |

## 4. Parser releases

When `COMPANY_POSTED_SALARY_PARSER_VERSION` changes, or any parser in `lib/`
changes how a stored figure is derived:

1. Preview the effect first, without writing:
   `npx convex run --no-push companySalaryResearch:previewBackfill '{"limit": 500}'`
   Read `wouldQuarantine` and `quarantineReasons`. An unexplained rise in
   `not_software_engineering_ic` or `level_ambiguous` means the parser regressed,
   not that the market changed.
2. Only then replay:
   `npx convex run companySalaryResearch:backfillCurrent '{"limit": 500}'`
   Repeat until `reviewed` stops growing; the call is capped at 500 postings.
3. Confirm `staleParserVersions` is empty on a second preview.

## 5. Decision-surface spot check

Open `/compare` with at least two companies shortlisted and confirm:

- The headline is a lead or an explicit trade-off, never an invented overall score.
- Each decisive dimension is explained with the size of its gap.
- "Why not the other company?" names what each alternative gains and gives up.
- A company whose next level is not attributable shows no Jump percentage and
  says why, rather than showing a number with a misleading level label.
- Mixing location scopes suppresses the winner instead of comparing across cities.

## 6. Rollback

Convex functions and the Next.js app deploy separately. If a release must be
undone, redeploy the previous commit; stored evidence is append-only and is not
rewritten by a deploy, so no data migration is required to roll back.
