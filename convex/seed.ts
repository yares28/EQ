import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { scoreValidator } from "./schema";

type Provenance = "user" | "verified" | "deduced" | "unknown";

function score(
  value: number,
  band: number,
  provenance: Provenance,
  rationale: string,
  sources: string[],
  fetchedAt: number,
) {
  return { value, band, provenance, rationale, sources, fetchedAt };
}

const HOUR = 3_600_000;
const DAY = 86_400_000;

/**
 * Demo data mirroring SPEC.md's running examples. Idempotent: skips the
 * profile/settings if they exist and any job whose company+title already
 * exists (soft-delete rule: never resurrects or duplicates).
 *
 * Run with: npx convex run seed:seedDemo
 */
export const seedDemo = internalMutation({
  args: {},
  returns: v.object({
    jobsInserted: v.number(),
    jobsSkipped: v.number(),
    profileCreated: v.boolean(),
    settingsCreated: v.boolean(),
  }),
  handler: async (ctx) => {
    const now = Date.now();

    // ------------------------------------------------------------------ //
    // Profile (singleton)                                                 //
    // ------------------------------------------------------------------ //
    let profileCreated = false;
    const existingProfile = await ctx.db.query("profile").first();
    if (existingProfile === null) {
      await ctx.db.insert("profile", {
        skills: [
          { name: "Python", level: "have" as const, provenance: "user" as const },
          { name: "SQL", level: "have" as const, provenance: "user" as const },
          { name: "PySpark", level: "have" as const, provenance: "user" as const },
          { name: "Pandas", level: "have" as const, provenance: "user" as const },
          { name: "Git", level: "have" as const, provenance: "user" as const },
          { name: "Azure", level: "partial" as const, provenance: "user" as const },
          { name: "Machine Learning", level: "partial" as const, provenance: "user" as const },
          { name: "Docker", level: "partial" as const, provenance: "user" as const },
        ],
        education: [
          "BSc Computer Engineering — UPV (Universitat Politècnica de València), 2022–2026",
        ],
        projects: [
          "ETL pipeline on Azure Databricks (PySpark) for sports analytics — university capstone",
          "LLM-powered study assistant (Python, FastAPI, vector search)",
          "Dashboard for club finances (SQL, Metabase)",
        ],
        languages: [
          { language: "Arabic", level: "Native" },
          { language: "English", level: "C1" },
          { language: "Spanish", level: "B1 (uncertified)" },
        ],
        availabilityDate: Date.UTC(2026, 9, 1), // 2026-10-01
        baseLocation: "Madrid",
      });
      profileCreated = true;
    }

    // ------------------------------------------------------------------ //
    // Settings (singleton)                                                //
    // ------------------------------------------------------------------ //
    let settingsCreated = false;
    const existingSettings = await ctx.db.query("settings").first();
    if (existingSettings === null) {
      await ctx.db.insert("settings", {
        weights: { fit: 30, salary: 20, aura: 15, future: 20, flex: 15 },
        dealbreakers: [],
        displayCurrency: "EUR",
        dailyApplyCap: 3,
      });
      settingsCreated = true;
    }

    // ------------------------------------------------------------------ //
    // Jobs                                                                //
    // ------------------------------------------------------------------ //
    const jobs = [
      // 1. Airbus — deep-dived, the F6 "paid program that costs money" case
      {
        company: "Airbus",
        title: "Data & cloud trainee — #Discover II",
        canonicalTitle: "Data & Cloud Trainee (graduate program)",
        locations: ["Getafe, Madrid"],
        workMode: "hybrid" as const,
        rung: "deepdived" as const,
        researchStatus: "done" as const,
        researchRetryCount: 0,
        userStatus: "saved" as const,
        eligibility: {
          state: "check" as const,
          reason:
            "Requires Spanish B1 (plus fluent English) — your Spanish is B1 uncertified, needs verification. Selection window Apr–Jul 2026 also gates timing.",
          provenance: "deduced" as const,
        },
        archived: false,
        postedAt: now - 35 * DAY,
        pastedAt: now - 3 * DAY,
        lastSeenAt: now - 3 * DAY,
        repostCount: 0,
        rawStub:
          "Airbus\nData & cloud trainee - #Discover II\nGetafe, Community of Madrid (Hybrid)",
        rawJD:
          "#Discover II is Airbus' talent program for recent graduates: 11 months in the Data & Cloud chapter at Getafe, bundled with a mandatory master's degree at UCJC. Study grant ≈ €1,000/month. Requirements: Python/PySpark, SQL, cloud (Azure preferred), IaC (Terraform) a plus. Spanish B1 and fluent English required. Selection window: April–July 2026, start October 2026. Recruitment managed by Randstad. Applications subject to monitoring consent clause.",
        requirements: [
          { skill: "Python", level: "have" as const, mustHave: true, provenance: "verified" as const },
          { skill: "PySpark", level: "have" as const, mustHave: true, provenance: "verified" as const },
          { skill: "SQL", level: "have" as const, mustHave: true, provenance: "verified" as const },
          { skill: "Azure", level: "partial" as const, mustHave: true, provenance: "verified" as const },
          { skill: "Terraform", level: "missing" as const, mustHave: false, provenance: "verified" as const },
          { skill: "Spanish B1", level: "partial" as const, mustHave: true, provenance: "verified" as const },
        ],
        scores: {
          fit: score(
            82,
            4,
            "verified",
            "Line-by-line JD match: Python/PySpark and SQL solid (capstone ETL on Databricks), Azure partial, Terraform missing but nice-to-have. Intern-aware scoring: coursework and projects counted, no professional-experience penalty.",
            ["https://www.airbus.com/en/careers/early-careers"],
            now - 3 * DAY,
          ),
          salary: score(
            76,
            5,
            "verified",
            "Study grant ≈ €1,000/month confirmed on the program page — above the Madrid beca median (~€800/mo). Caveat: the bundled UCJC master's tuition coverage is unverified, so net = grant − tuition may apply (see fine print).",
            [
              "https://www.airbus.com/en/careers/early-careers",
              "https://www.glassdoor.es/Sueldos/airbus-becario-sueldos-SRCH_KE0,6_KO7,14.htm",
            ],
            now - 3 * DAY,
          ),
          aura: score(
            88,
            4,
            "verified",
            "Airbus brand plus a structured program (#Discover II, ~70 openings across disciplines); Getafe is the Spanish aerospace/defence hub. Small discount: recruiting outsourced to Randstad.",
            ["https://www.airbus.com/en/careers/early-careers"],
            now - 3 * DAY,
          ),
          future: score(
            93,
            3,
            "verified",
            "Record commercial backlog and Spanish defence ramp-up; data & cloud sits on the investment side of the company, not the cost side. The bundled UCJC master's adds a formal credential on top of the stack (PySpark/Azure) — high AI-resistance for the data-platform track.",
            [
              "https://www.airbus.com/en/newsroom",
              "https://www.airbus.com/en/careers/early-careers",
            ],
            now - 3 * DAY,
          ),
          flex: score(
            70,
            5,
            "verified",
            "Hybrid at Getafe (commutable from Madrid base); program calendar fixed Oct 2026 start, 11 months, August disabled. Selection window Apr–Jul 2026 means the clock is running.",
            ["https://www.airbus.com/en/careers/early-careers"],
            now - 3 * DAY,
          ),
          network: score(
            72,
            8,
            "verified",
            "139 UPV alumni work here (from the pasted banner) — a large school-alumni pool at a major employer; capped modifier since it's school-wide, not the hiring team directly.",
            [],
            now - 3 * DAY,
          ),
        },
        redFlags: [],
        finePrint: [
          "Bundled mandatory master's at UCJC — tuition coverage NOT confirmed; if not covered, net = grant − tuition can flip the decision",
          "Recruiting outsourced to Randstad — expect external screening layer",
          "Application terms include a monitoring consent clause",
        ],
        programFacts: {
          stipend: { amount: 1000, currency: "EUR", period: "month" as const },
          durationMonths: 11,
          hoursPerWeek: 40,
          startDate: "October 2026",
          selectionWindow: "April–July 2026",
          openings: 70,
          bundledDegree: "Mandatory master's at UCJC (Universidad Camilo José Cela)",
          tuitionCoverage: "unverified — no public statement found on whether the grant covers tuition",
          conversionEstimate: "≈ high — explicit pipeline program design (deduced, no public conversion data)",
          netCostNote: "net = €1,000/mo grant − UCJC tuition if tuition is not covered (unverified)",
        },
        promoted: false,
        viewed: true,
      },

      // 2. Mapfre — researched, fresh (posted 8h ago), 1 connection
      {
        company: "Mapfre",
        title: "Beca en inteligencia artificial",
        canonicalTitle: "AI Internship (beca)",
        locations: ["Madrid"],
        workMode: "on-site" as const,
        rung: "researched" as const,
        researchStatus: "done" as const,
        researchRetryCount: 0,
        userStatus: "saved" as const,
        eligibility: {
          state: "eligible" as const,
          reason: undefined,
          provenance: "deduced" as const,
        },
        archived: false,
        postedAt: now - 8 * HOUR,
        pastedAt: now,
        lastSeenAt: now,
        repostCount: 0,
        rawStub:
          "MAPFRE\nBeca en inteligencia artificial\nMadrid, Community of Madrid (On-site)\n1 connection works here\n8 hours ago",
        requirements: [
          { skill: "Python", level: "have" as const, mustHave: true, provenance: "deduced" as const },
          { skill: "Machine Learning", level: "partial" as const, mustHave: true, provenance: "deduced" as const },
          { skill: "SQL", level: "have" as const, mustHave: false, provenance: "deduced" as const },
          { skill: "PyTorch/TensorFlow", level: "partial" as const, mustHave: false, provenance: "deduced" as const },
          { skill: "Spanish", level: "partial" as const, mustHave: true, provenance: "deduced" as const },
        ],
        scores: {
          fit: score(
            85,
            8,
            "deduced",
            "≈ Deduced from title + typical Mapfre beca postings: Python/ML-centric, entry level. Your Python/SQL are strong, ML is partial — good but unverified until the real posting is parsed.",
            [],
            now,
          ),
          salary: score(
            68,
            12,
            "deduced",
            "≈ No figure in the posting; Madrid AI-beca norms run €700–900/mo (Spain intern conventions). Wide band until a source confirms.",
            [],
            now,
          ),
          aura: score(
            70,
            10,
            "deduced",
            "≈ Large stable insurer, recognizable brand in Spain; not a tech-brand halo. Structured beca programs exist but this posting's program isn't identified yet.",
            [],
            now,
          ),
          future: score(
            74,
            10,
            "deduced",
            "≈ Insurer investing in AI (pricing, claims, fraud) — real demand, incumbent pace. Role trajectory: junior data/ML analyst tracks. Thesis unverified.",
            [],
            now,
          ),
          flex: score(
            45,
            10,
            "deduced",
            "≈ On-site in Madrid — commutable from your base, but no remote flexibility signaled.",
            [],
            now,
          ),
          network: score(
            65,
            10,
            "deduced",
            "1 first-degree connection works here (from the pasted banner) — a direct referral path exists. Modifier capped at +5 verdict points by design.",
            [],
            now,
          ),
        },
        redFlags: [],
        finePrint: [],
        promoted: false,
        viewed: false,
      },

      // 3. Hilton — stub, posting not findable (F2 edge case)
      {
        company: "Hilton",
        title: "IT intern / trainee",
        canonicalTitle: "IT Intern / Trainee",
        locations: ["Madrid"],
        workMode: "on-site" as const,
        rung: "stub" as const,
        researchStatus: "failed" as const,
        researchFailReason: "posting not found on company careers page or job boards",
        researchRetryCount: 1,
        userStatus: "saved" as const,
        eligibility: {
          state: "unknown" as const,
          reason: undefined,
          provenance: "unknown" as const,
        },
        archived: false,
        postedAt: now - 32 * DAY,
        pastedAt: now - 1 * DAY,
        lastSeenAt: now - 1 * DAY,
        repostCount: 0,
        rawStub: "Hilton\nIT Intern / Trainee\nMadrid, Community of Madrid (On-site)",
        requirements: [
          { skill: "IT support fundamentals", level: "partial" as const, mustHave: true, provenance: "deduced" as const },
          { skill: "SQL", level: "have" as const, mustHave: false, provenance: "deduced" as const },
          { skill: "Networking basics", level: "missing" as const, mustHave: false, provenance: "deduced" as const },
          { skill: "Spanish", level: "partial" as const, mustHave: true, provenance: "deduced" as const },
        ],
        scores: {
          fit: score(
            60,
            14,
            "deduced",
            "≈ Deduced from equivalent 'IT intern' postings at hotel groups: generalist IT support/infra, not data engineering. Low confidence — the real posting was never found.",
            [],
            now - 1 * DAY,
          ),
          salary: score(
            55,
            18,
            "deduced",
            "≈ Market estimate from Spain intern norms for hospitality IT (~€600–800/mo). No data exists for this specific role; widest band.",
            [],
            now - 1 * DAY,
          ),
          aura: score(
            62,
            15,
            "deduced",
            "≈ Global hotel brand, but IT is a support function there — score the function, not the logo.",
            [],
            now - 1 * DAY,
          ),
          future: score(
            58,
            16,
            "deduced",
            "≈ Corporate IT at a hospitality incumbent: stable but not a growth stack; limited data-track runway determinable from title alone.",
            [],
            now - 1 * DAY,
          ),
          flex: score(
            40,
            15,
            "deduced",
            "≈ On-site Madrid assumed from the stub; hotel IT often means on-premise presence.",
            [],
            now - 1 * DAY,
          ),
          network: score(
            50,
            25,
            "unknown",
            "No network banner in the paste — neutral modifier.",
            [],
            now - 1 * DAY,
          ),
        },
        redFlags: [
          "Posting not found — paste it for a deep-dive (requirements below are deduced from equivalent postings)",
          "Posted >30 days ago — verify still open before applying",
        ],
        finePrint: [],
        promoted: false,
        viewed: false,
      },

      // 4. Alstom — researched, multi-city, eligibility check needed
      {
        company: "Alstom",
        title: "Engineering internship — Talent Energy",
        canonicalTitle: "Engineering Internship (Talent Energy program)",
        locations: ["Madrid", "Barcelona"],
        workMode: "on-site" as const,
        rung: "researched" as const,
        researchStatus: "done" as const,
        researchRetryCount: 0,
        userStatus: "saved" as const,
        eligibility: {
          state: "check" as const,
          reason:
            "Program requires active university enrollment for a convenio de prácticas — confirm your university can sign for the program dates.",
          provenance: "deduced" as const,
        },
        archived: false,
        postedAt: now - 5 * DAY,
        pastedAt: now - 1 * DAY,
        lastSeenAt: now - 1 * DAY,
        repostCount: 0,
        rawStub:
          "Alstom\nEngineering Internship - Talent Energy\nMadrid y Barcelona (On-site)",
        requirements: [
          { skill: "Engineering degree in progress", level: "partial" as const, mustHave: true, provenance: "verified" as const },
          { skill: "Excel", level: "have" as const, mustHave: true, provenance: "verified" as const },
          { skill: "English B2", level: "have" as const, mustHave: true, provenance: "verified" as const },
          { skill: "Spanish", level: "partial" as const, mustHave: true, provenance: "verified" as const },
          { skill: "MATLAB", level: "missing" as const, mustHave: false, provenance: "verified" as const },
        ],
        scores: {
          fit: score(
            74,
            8,
            "deduced",
            "≈ Posting targets energy/industrial engineering tracks; your CS/data profile is transferable (analytics, tooling) but not the core discipline.",
            [],
            now - 1 * DAY,
          ),
          salary: score(
            65,
            12,
            "deduced",
            "≈ Convenio-standard stipend, typically €600–800/mo for Spanish engineering prácticas. No figure published for this program.",
            [],
            now - 1 * DAY,
          ),
          aura: score(
            75,
            6,
            "verified",
            "Structured 'Talent Energy' program at a top rail OEM; program page found on Alstom careers. Solid engineering brand in Spain.",
            ["https://www.alstom.com/careers"],
            now - 1 * DAY,
          ),
          future: score(
            80,
            6,
            "verified",
            "Record rail order backlog and Spanish high-speed/commuter contracts; rail electrification is a durable, AI-resistant domain. Pipeline-style program suggests conversion intent.",
            ["https://www.alstom.com/press-releases-news"],
            now - 1 * DAY,
          ),
          flex: score(
            55,
            10,
            "deduced",
            "≈ On-site; posting covers Madrid y Barcelona — one card, scored on Madrid (nearest to your base).",
            [],
            now - 1 * DAY,
          ),
          network: score(
            50,
            25,
            "unknown",
            "No network banner in the paste — neutral modifier.",
            [],
            now - 1 * DAY,
          ),
        },
        redFlags: [],
        finePrint: [],
        promoted: false,
        viewed: false,
      },

      // 5. Uber — stub, awaiting research (truncated final paste entry)
      {
        company: "Uber",
        title: "Operations & logistics intern",
        canonicalTitle: "Operations & Logistics Intern",
        locations: ["Madrid"],
        workMode: "on-site" as const,
        rung: "stub" as const,
        researchStatus: "pending" as const,
        researchRetryCount: 0,
        userStatus: "saved" as const,
        eligibility: {
          state: "unknown" as const,
          reason: undefined,
          provenance: "unknown" as const,
        },
        archived: false,
        postedAt: now - 2 * DAY,
        pastedAt: now - 1 * DAY,
        lastSeenAt: now - 1 * DAY,
        repostCount: 0,
        rawStub: "Uber\nOperations & Logistics Intern\nMadrid (On-site)",
        requirements: [
          { skill: "Excel", level: "have" as const, mustHave: true, provenance: "deduced" as const },
          { skill: "SQL", level: "have" as const, mustHave: false, provenance: "deduced" as const },
          { skill: "Data analysis", level: "have" as const, mustHave: true, provenance: "deduced" as const },
          { skill: "Spanish", level: "partial" as const, mustHave: true, provenance: "deduced" as const },
        ],
        scores: {
          fit: score(
            65,
            12,
            "deduced",
            "≈ Ops/logistics is off your data-engineering track, but the analytical overlap (SQL, Python, dashboards) is real — Uber ops interns live in queries and sheets.",
            [],
            now - 1 * DAY,
          ),
          salary: score(
            60,
            15,
            "deduced",
            "≈ Big-tech Madrid intern stipends usually beat local norms (~€900–1,100/mo) but ops roles pay below eng. No figure yet — research pending.",
            [],
            now - 1 * DAY,
          ),
          aura: score(
            72,
            12,
            "deduced",
            "≈ Recognizable tech brand; ops intern is a well-regarded generalist entry, though not an engineering credential.",
            [],
            now - 1 * DAY,
          ),
          future: score(
            68,
            14,
            "deduced",
            "≈ Marketplace ops increasingly automated — moderate AI-resistance; the analytics skills transfer, the role itself may not.",
            [],
            now - 1 * DAY,
          ),
          flex: score(
            42,
            12,
            "deduced",
            "≈ On-site Madrid assumed from the stub; ops teams tend to be office-first.",
            [],
            now - 1 * DAY,
          ),
          network: score(
            50,
            25,
            "unknown",
            "No network banner in the paste (entry was truncated mid-block) — neutral modifier.",
            [],
            now - 1 * DAY,
          ),
        },
        redFlags: [],
        finePrint: [],
        promoted: false,
        viewed: false,
      },
    ];

    let jobsInserted = 0;
    let jobsSkipped = 0;
    for (const job of jobs) {
      const existing = await ctx.db
        .query("jobs")
        .withIndex("by_company_and_title", (q) =>
          q.eq("company", job.company).eq("title", job.title),
        )
        .first();
      if (existing !== null) {
        jobsSkipped++;
        continue;
      }
      await ctx.db.insert("jobs", job);
      jobsInserted++;
    }

    return { jobsInserted, jobsSkipped, profileCreated, settingsCreated };
  },
});

/**
 * One-off backfill: the Airbus job was originally seeded with an "unknown"
 * network score ("No network banner captured in the paste"), but the source
 * LinkedIn paste this app is modeled on actually showed a school-alumni
 * banner ("139 Universitat Politècnica de València (UPV) school alumni work
 * here"). seedDemo is idempotent by company+title, so it won't touch an
 * already-seeded row — this patches just `scores.network` on the existing
 * Airbus job in place.
 *
 * Run with: npx convex run seed:backfillAirbusNetwork
 */
export const backfillAirbusNetwork = internalMutation({
  args: {},
  returns: v.union(
    v.object({ patched: v.literal(true), network: scoreValidator }),
    v.object({ patched: v.literal(false), reason: v.string() }),
  ),
  handler: async (ctx) => {
    const job = await ctx.db
      .query("jobs")
      .withIndex("by_company_and_title", (q) =>
        q.eq("company", "Airbus").eq("title", "Data & cloud trainee — #Discover II"),
      )
      .first();
    if (job === null) {
      return { patched: false as const, reason: "Airbus job not found — run seedDemo first" };
    }

    const network = score(
      72,
      8,
      "verified",
      "139 UPV alumni work here (from the pasted banner) — a large school-alumni pool at a major employer; capped modifier since it's school-wide, not the hiring team directly.",
      [],
      Date.now(),
    );
    await ctx.db.patch(job._id, { scores: { ...job.scores, network } });
    return { patched: true as const, network };
  },
});
