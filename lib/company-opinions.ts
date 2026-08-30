import type { Confidence } from "@/lib/salary-data";

export type OpinionSignal = "Strong" | "Mixed" | "Weak" | "Unknown";
export type OpinionSourceKind =
  | "First-person"
  | "Mixed thread"
  | "Candidate"
  | "Second-hand";

export interface OpinionSource {
  id: string;
  label: string;
  url: string;
  publishedAt: string;
  geography: string;
  kind: OpinionSourceKind;
  note: string;
}

export interface CompanyOpinion {
  companySlug: string;
  score: number | null;
  confidence: Confidence;
  evidenceScope: string;
  lastResearchedAt: string;
  summary: string;
  signals: {
    workLife: OpinionSignal;
    growth: OpinionSignal;
    culture: OpinionSignal;
  };
  positives: string[];
  concerns: string[];
  sources: OpinionSource[];
}

export const opinionMethodology = {
  label: "Reddit employee sentiment",
  description:
    "Editorial synthesis of recurring Reddit themes across work-life sustainability, learning and career growth, and team culture, with sustainability weighted most heavily. It is not an employee survey or a Glassdoor rating.",
  confidence:
    "Confidence reflects source recency, first-person detail, number of consistent accounts, and geographic relevance. Reddit identities and employment claims are not independently verified; candidate and second-hand reports reduce confidence. Insufficient evidence stays unscored.",
};

export const companyOpinions: CompanyOpinion[] = [
  {
    companySlug: "meta",
    score: 2.8,
    confidence: "Low",
    evidenceScope: "London and Zurich; not Spain-specific",
    lastResearchedAt: "2026-08-26",
    summary:
      "High career upside and compensation are repeatedly offset by intense performance pressure, long hours on some teams, and uneven access to high-impact work.",
    signals: { workLife: "Weak", growth: "Strong", culture: "Mixed" },
    positives: [
      "Strong compensation and resume signal.",
      "High-impact projects can accelerate technical and career growth.",
    ],
    concerns: [
      "Stack ranking and frequent performance cycles create sustained pressure.",
      "London accounts mention late US meetings and long weeks; team placement materially changes the experience.",
    ],
    sources: [
      {
        id: "reddit-meta-zurich-2025",
        label: "Anybody working at Meta Zurich?",
        url: "https://www.reddit.com/r/cscareerquestionsEU/comments/1lmjxrz",
        publishedAt: "2025-06-28",
        geography: "Zurich",
        kind: "Mixed thread",
        note: "Discusses pay, growth, team matching, layoffs, stack ranking, and work-life balance.",
      },
      {
        id: "reddit-faang-eu-wlb-2024",
        label: "Do FAANG companies have poor work-life balance in Europe?",
        url: "https://www.reddit.com/r/cscareerquestionsEU/comments/1doveuv",
        publishedAt: "2024-06-26",
        geography: "Europe, including Meta London",
        kind: "Mixed thread",
        note: "Several detailed Meta London accounts describe late meetings and high workload, while others stress team variance.",
      },
    ],
  },
  {
    companySlug: "apple",
    score: 3.4,
    confidence: "Low",
    evidenceScope: "London and broader Europe; not Spain-specific",
    lastResearchedAt: "2026-08-26",
    summary:
      "The available accounts point to valuable product-scale experience and generally sustainable hours on some teams, with meaningful team and US-time-zone variance.",
    signals: { workLife: "Mixed", growth: "Strong", culture: "Mixed" },
    positives: [
      "Large-scale product work is described as valuable experience.",
      "Some London engineers report conventional working hours outside launches.",
    ],
    concerns: [
      "Late collaboration with US teams can extend the day.",
      "The evidence is older and highly team-dependent, so it does not transfer cleanly to Spain.",
    ],
    sources: [
      {
        id: "reddit-apple-london-wlb-2021",
        label: "Work-life balance at Apple in London",
        url: "https://www.reddit.com/r/cscareerquestionsEU/comments/lckemg",
        publishedAt: "2021-02-04",
        geography: "London",
        kind: "Mixed thread",
        note: "Employee-style accounts cover hours, product scale, and collaboration with US teams.",
      },
      {
        id: "reddit-faang-eu-wlb-2024",
        label: "Do FAANG companies have poor work-life balance in Europe?",
        url: "https://www.reddit.com/r/cscareerquestionsEU/comments/1doveuv",
        publishedAt: "2024-06-26",
        geography: "Europe, including Apple London",
        kind: "Mixed thread",
        note: "Includes a normal-hours Apple London anecdote but also emphasizes large team-level variance.",
      },
    ],
  },
  {
    companySlug: "amazon",
    score: 3.3,
    confidence: "Medium",
    evidenceScope: "Madrid and Spain",
    lastResearchedAt: "2026-08-26",
    summary:
      "Spain-specific accounts describe strong local pay and good growth potential, but stack ranking, on-call load, and US-facing visibility can make the experience demanding.",
    signals: { workLife: "Mixed", growth: "Strong", culture: "Mixed" },
    positives: [
      "Compensation is repeatedly described as strong for Spain.",
      "Large systems, investment, and internal scope can create useful growth opportunities.",
      "Some Spain teams are described as social and more balanced than Amazon's wider reputation.",
    ],
    concerns: [
      "On-call can be disruptive and varies sharply by team.",
      "Stack ranking and visibility with US leadership can add pressure.",
    ],
    sources: [
      {
        id: "reddit-amazon-spain-swe-2024",
        label: "Amazon Spain as a SWE",
        url: "https://www.reddit.com/r/cscareerquestionsEU/comments/1990nhc",
        publishedAt: "2024-01-17",
        geography: "Spain",
        kind: "Mixed thread",
        note: "Detailed discussion of pay, work-life balance, growth, stack ranking, and US leadership exposure.",
      },
      {
        id: "reddit-amazon-madrid-2020",
        label: "How is Amazon Madrid?",
        url: "https://www.reddit.com/r/cscareerquestionsEU/comments/gfgdh8",
        publishedAt: "2020-05-08",
        geography: "Madrid",
        kind: "Mixed thread",
        note: "Older employee-style accounts contrast regular hours with disruptive on-call and occasional late US meetings.",
      },
    ],
  },
  {
    companySlug: "netflix",
    score: 3.1,
    confidence: "Low",
    evidenceScope: "Global and Warsaw; not Spain-specific",
    lastResearchedAt: "2026-08-26",
    summary:
      "Recent accounts consistently pair autonomy and top-tier compensation with a demanding high-performance culture and limited tolerance for underperformance.",
    signals: { workLife: "Weak", growth: "Strong", culture: "Mixed" },
    positives: [
      "High autonomy and responsibility can create rapid learning.",
      "Compensation is described as highly competitive, often with an all-cash structure.",
    ],
    concerns: [
      "High expectations and performance pressure may reduce stability.",
      "Recent Warsaw hiring references office attendance; no Spain employee evidence was found.",
    ],
    sources: [
      {
        id: "reddit-netflix-culture-2026",
        label: "What is it like working at Netflix?",
        url: "https://www.reddit.com/r/cscareerquestions/comments/1qi2tzm",
        publishedAt: "2026-01-20",
        geography: "Global",
        kind: "Mixed thread",
        note: "Employee-style comments discuss autonomy, responsibility, availability, and time off.",
      },
      {
        id: "reddit-netflix-warsaw-2026",
        label: "Netflix Warsaw interview and offer discussion",
        url: "https://www.reddit.com/r/cscareerquestionsEU/comments/1u8mo7u",
        publishedAt: "2026-06-09",
        geography: "Warsaw",
        kind: "Candidate",
        note: "Current European hiring signal covering compensation structure, team-specific process, and office expectations.",
      },
    ],
  },
  {
    companySlug: "google",
    score: 3.4,
    confidence: "Medium",
    evidenceScope: "London and broader Europe; not Spain-specific",
    lastResearchedAt: "2026-08-26",
    summary:
      "European accounts often describe sustainable hours and strong learning, while bureaucracy, slow shipping, and team dependence limit the upside for some engineers.",
    signals: { workLife: "Mixed", growth: "Strong", culture: "Mixed" },
    positives: [
      "Several European anecdotes describe normal working weeks.",
      "Technical scale, peers, and internal mobility can support long-term growth.",
    ],
    concerns: [
      "Large-company process can slow ownership and shipping.",
      "Work-life balance and project quality vary materially by team and manager.",
    ],
    sources: [
      {
        id: "reddit-faang-eu-wlb-2024",
        label: "Do FAANG companies have poor work-life balance in Europe?",
        url: "https://www.reddit.com/r/cscareerquestionsEU/comments/1doveuv",
        publishedAt: "2024-06-26",
        geography: "Europe, including Google London",
        kind: "Mixed thread",
        note: "Includes former Google and London perspectives, with strong warnings about team variance.",
      },
      {
        id: "reddit-ex-google-2025",
        label: "Four-year Google experience retrospective",
        url: "https://www.reddit.com/r/cscareerquestions/comments/1kslf3b",
        publishedAt: "2025-05-21",
        geography: "Unspecified",
        kind: "First-person",
        note: "A personal critique focused on bureaucracy, slow process, and limited shipping ownership.",
      },
    ],
  },
  {
    companySlug: "microsoft",
    score: 3.5,
    confidence: "Medium",
    evidenceScope: "Europe and global; not Spain-specific",
    lastResearchedAt: "2026-08-26",
    summary:
      "The evidence still favors learning, benefits, and a constructive growth culture, but recent accounts suggest higher expectations and weaker work-life balance than Microsoft's historical reputation.",
    signals: { workLife: "Mixed", growth: "Strong", culture: "Strong" },
    positives: [
      "European employees highlight learning opportunities, benefits, and a growth mindset.",
      "Team culture is often described positively relative to other large employers.",
    ],
    concerns: [
      "Recent accounts report rising performance expectations and eroding work-life balance.",
      "The experience remains manager- and organization-dependent.",
    ],
    sources: [
      {
        id: "reddit-microsoft-eu-culture-2023",
        label: "Microsoft culture in Europe",
        url: "https://www.reddit.com/r/cscareerquestionsEU/comments/12ycsty",
        publishedAt: "2023-04-25",
        geography: "Europe",
        kind: "First-person",
        note: "Employee account focused on learning, benefits, growth mindset, culture, and manager dependence.",
      },
      {
        id: "reddit-microsoft-shift-2026",
        label: "Microsoft work-life and culture shift",
        url: "https://www.reddit.com/r/cscareerquestions/comments/1rzfwnn",
        publishedAt: "2026-03-19",
        geography: "Unspecified",
        kind: "Mixed thread",
        note: "Recent employee-style discussion of rising expectations and a perceived decline in work-life balance.",
      },
    ],
  },
  {
    companySlug: "openai",
    score: 2.9,
    confidence: "Low",
    evidenceScope: "US/global; not Spain-specific",
    lastResearchedAt: "2026-08-26",
    summary:
      "Accounts emphasize exceptional colleagues, ambitious work, and compensation, but consistently frame the environment as unusually intense with weak work-life sustainability.",
    signals: { workLife: "Weak", growth: "Strong", culture: "Mixed" },
    positives: [
      "Highly capable colleagues and frontier work offer exceptional learning potential.",
      "Compensation and upside are described as unusually strong.",
    ],
    concerns: [
      "The available accounts repeatedly describe a demanding, high-hours environment.",
      "Evidence is sparse, partly second-hand, and not representative of a Spain-based role.",
    ],
    sources: [
      {
        id: "reddit-openai-offer-2025",
        label: "OpenAI offer and culture discussion",
        url: "https://www.reddit.com/r/csMajors/comments/1i3dgeg",
        publishedAt: "2025-01-18",
        geography: "US/global",
        kind: "Second-hand",
        note: "Discusses exceptional pay and upside alongside a grind-oriented work culture; confidence is reduced because it is not direct Europe evidence.",
      },
      {
        id: "reddit-openai-work-2025",
        label: "What working at OpenAI is like",
        url: "https://www.reddit.com/r/OpenAI/comments/1i5ov1z",
        publishedAt: "2025-01-21",
        geography: "Unspecified",
        kind: "Mixed thread",
        note: "A small number of serious comments describe challenging work, strong colleagues, and greater intensity than conventional Big Tech.",
      },
    ],
  },
  {
    companySlug: "nvidia",
    score: 3.2,
    confidence: "Low",
    evidenceScope: "Amsterdam and EU remote teams; not Spain-specific",
    lastResearchedAt: "2026-08-26",
    summary:
      "Nvidia offers a strong technical brand and potentially compelling work, but the limited European evidence shows that role alignment, roadmap clarity, and local team structure can vary sharply.",
    signals: { workLife: "Mixed", growth: "Strong", culture: "Mixed" },
    positives: [
      "The technical brand and domain exposure are viewed as strong career signals.",
      "Prior internship experience is described positively in a recent European offer comparison.",
    ],
    concerns: [
      "One detailed EU account reports role misalignment, weak roadmap clarity, and limited local structure.",
      "The sample is too small and role-specific to generalize to Spain or early-career SWE teams.",
    ],
    sources: [
      {
        id: "reddit-nvidia-role-2025",
        label: "Nvidia EU role misalignment discussion",
        url: "https://www.reddit.com/r/cscareerquestionsEU/comments/1ohjsk9",
        publishedAt: "2025-10-27",
        geography: "EU remote team",
        kind: "First-person",
        note: "Detailed early-tenure account covering actual work, roadmap clarity, manager support, and research-to-infrastructure fit.",
      },
      {
        id: "reddit-nvidia-new-grad-2025",
        label: "New grad Nvidia versus SIG",
        url: "https://www.reddit.com/r/cscareerquestionsEU/comments/1jkk894",
        publishedAt: "2025-03-26",
        geography: "Amsterdam",
        kind: "Candidate",
        note: "A prior Nvidia intern compares career signal and technical interest in a current European offer decision.",
      },
    ],
  },
  {
    companySlug: "stripe",
    score: 3.1,
    confidence: "Medium",
    evidenceScope: "Dublin; EMEA-adjacent, not Spain-specific",
    lastResearchedAt: "2026-08-26",
    summary:
      "Multiple Dublin accounts converge on strong pay, capable peers, and rapid learning, while also describing long hours, high intensity, and uneven culture fit.",
    signals: { workLife: "Weak", growth: "Strong", culture: "Mixed" },
    positives: [
      "Smart colleagues, strong compensation, and meaningful learning recur across accounts.",
      "The environment can reward people seeking fast growth and broad ownership.",
    ],
    concerns: [
      "Long or intense working hours are a repeated theme.",
      "Culture fit varies, and the available evidence is from Dublin rather than Spain.",
    ],
    sources: [
      {
        id: "reddit-stripe-dublin-2023",
        label: "Working at Stripe in Dublin",
        url: "https://www.reddit.com/r/DevelEire/comments/174sj4d",
        publishedAt: "2023-10-10",
        geography: "Dublin",
        kind: "Mixed thread",
        note: "Several detailed employee and former-employee accounts cover pay, benefits, colleagues, growth, hybrid work, and long hours.",
      },
    ],
  },
  {
    companySlug: "uber",
    score: null,
    confidence: "Unknown",
    evidenceScope: "No reliable Spain or current European SWE sample",
    lastResearchedAt: "2026-08-26",
    summary:
      "The current evidence is too sparse and too far from Spain to assign a reliable employee-opinion score.",
    signals: { workLife: "Unknown", growth: "Unknown", culture: "Unknown" },
    positives: [],
    concerns: [
      "Available threads are isolated, dated, or centered on candidates and contractors rather than a comparable Spain SWE role.",
    ],
    sources: [
      {
        id: "reddit-uber-anecdote-2023",
        label: "Uber team-culture anecdote",
        url: "https://www.reddit.com/r/cscareerquestions/comments/171iwz5",
        publishedAt: "2023-10-06",
        geography: "Unspecified",
        kind: "Mixed thread",
        note: "Contains one former-employee team anecdote, which is insufficient for a company-wide score.",
      },
    ],
  },
  {
    companySlug: "databricks",
    score: 3.6,
    confidence: "Medium",
    evidenceScope: "Amsterdam and broader Europe; not Spain-specific",
    lastResearchedAt: "2026-08-26",
    summary:
      "European accounts are positive on product momentum, pay, peers, and learning, but warn that high expectations, peer pressure, and contract-stage incentives can harm work-life balance.",
    signals: { workLife: "Mixed", growth: "Strong", culture: "Strong" },
    positives: [
      "Strong product trajectory, technical learning, and compensation are recurring themes.",
      "Peers and interviewers are often described as capable and collaborative.",
    ],
    concerns: [
      "High expectations and peer pressure can create long hours.",
      "Some European accounts describe work-life balance improving only after securing a permanent contract.",
    ],
    sources: [
      {
        id: "reddit-databricks-amsterdam-2026",
        label: "Databricks Amsterdam new-grad experience",
        url: "https://www.reddit.com/r/cscareerquestionsEU/comments/1r9py3w",
        publishedAt: "2026-02-18",
        geography: "Amsterdam",
        kind: "Mixed thread",
        note: "Detailed discussion of pay, product growth, leadership, people, peer pressure, work-life balance, and permanent contracts.",
      },
      {
        id: "reddit-databricks-switch-2025",
        label: "Amazon to Databricks comparison",
        url: "https://www.reddit.com/r/cscareerquestionsEU/comments/1k5hxvw",
        publishedAt: "2025-04-23",
        geography: "Europe",
        kind: "Mixed thread",
        note: "Compares technical interest, compensation, office expectations, and career learning.",
      },
      {
        id: "reddit-databricks-wlb-2025",
        label: "Databricks work-life balance discussion",
        url: "https://www.reddit.com/r/databricks/comments/1oqdixc",
        publishedAt: "2025-11-07",
        geography: "Global and Europe",
        kind: "Mixed thread",
        note: "Mixed first-person-style accounts range from normal hours to sustained 10-12 hour days, reinforcing team variance.",
      },
    ],
  },
  {
    companySlug: "airbnb",
    score: null,
    confidence: "Unknown",
    evidenceScope: "No reliable Spain or current European SWE sample",
    lastResearchedAt: "2026-08-26",
    summary:
      "No sufficiently detailed, current, first-person European software-engineering evidence was found, so the opinion score remains unassigned.",
    signals: { workLife: "Unknown", growth: "Unknown", culture: "Unknown" },
    positives: [],
    concerns: [
      "Crowdsourced remote-company lists and city rankings do not establish actual employee experience.",
    ],
    sources: [
      {
        id: "reddit-airbnb-remote-2023",
        label: "Remote-company discussion mentioning Airbnb",
        url: "https://www.reddit.com/r/cscareerquestions/comments/1865vw9",
        publishedAt: "2023-11-28",
        geography: "Global",
        kind: "Second-hand",
        note: "Only a broad remote-work mention; deliberately excluded from scoring.",
      },
    ],
  },
];

const opinionByCompany = new Map(
  companyOpinions.map((opinion) => [opinion.companySlug, opinion])
);

export function opinionForCompany(companySlug: string): CompanyOpinion {
  const opinion = opinionByCompany.get(companySlug);
  return opinion ?? {
    companySlug,
    score: null,
    confidence: "Unknown",
    evidenceScope: "No reviewed employee evidence",
    lastResearchedAt: "—",
    summary: "Employee sentiment has not been researched for this company.",
    signals: { workLife: "Unknown", growth: "Unknown", culture: "Unknown" },
    positives: [],
    concerns: ["No reviewed Reddit evidence is available."],
    sources: [],
  };
}
