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

Known failure mode (already hit once): a reactive Convex `query` that scans a whole table re-runs — and re-reads everything — on **every write that touches that table × every mounted subscriber**. Rules:
- Never `.collect()` or an unbounded/large `.take()` over a table inside a `query`. Read through a selective index range, or from a maintained aggregate.
- There is no count without reading rows. To show a count, either read only the exact rows via a compound index, or maintain a counter.
- Keep cron frequency proportional to how fast the data actually changes. Minute-level intervals are almost never justified.

For any **new feature**, before building it, estimate its cost against the budgets above and **tell me if it could cause problems**, with rough magnitude and the blast radius:
- DB bandwidth: bytes per query/mutation run × expected runs/month (include reactive re-runs and open tabs).
- Function calls: added calls/month, including crons and client subscriptions.
- Storage growth: rows/month × row size, and whether retention bounds it.
- Action compute and Vercel function time for anything doing fetches or heavy work.

If a feature plausibly pushes any metric past ~50% of its limit, say so up front — "this adds ~X MB/month of DB bandwidth", "this could double function calls", "this grows storage unbounded" — and propose the cheaper design or the mitigation, rather than building it and letting the overage surface later. Flag whether the impact is gradual (storage creep) or a cliff (a reactive query that melts the bandwidth budget the moment traffic rises).

## Evidence rules

Pay figures are decision data, not decoration. A number may only be shown as a company's pay for a level when it was posted for **that** level, in a compatible location scope. A range posted at a different level is context and must never rank, sort, feed a net-cash estimate, or count as evidence coverage. Unknown stays unknown.
