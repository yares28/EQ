/**
 * The single vocabulary both sides of a CV match are expressed in.
 *
 * A CV says "TypeScript" and a posting says "TS"; a CV says "AWS" and a posting
 * spells out "Amazon Web Services". Comparing raw words would score those as
 * misses, which is exactly the failure mode that makes naive keyword matching
 * useless. Every string on both sides is therefore reduced to a canonical id
 * first, and only ids are ever compared.
 *
 * Grounded in real data rather than invented: the skill list covers what the
 * CV in this repo actually claims and what the Spain tech postings already
 * captured in `jobPostings.descriptionText` actually ask for.
 */

export type SkillGroup =
  | "language"
  | "backend"
  | "frontend"
  | "data"
  | "cloud"
  | "tooling"
  | "practice";

export interface SkillDefinition {
  id: string;
  label: string;
  group: SkillGroup;
  /**
   * Every spelling that means this skill, canonical label included. Matched
   * whole-token and case-insensitively, so "java" never matches "javascript".
   */
  aliases: string[];
}

export const SKILLS: SkillDefinition[] = [
  // Languages
  { id: "java", label: "Java", group: "language", aliases: ["java"] },
  { id: "python", label: "Python", group: "language", aliases: ["python"] },
  { id: "javascript", label: "JavaScript", group: "language", aliases: ["javascript", "js", "ecmascript"] },
  { id: "typescript", label: "TypeScript", group: "language", aliases: ["typescript", "ts"] },
  { id: "c", label: "C", group: "language", aliases: ["c"] },
  { id: "cpp", label: "C++", group: "language", aliases: ["c++", "cpp"] },
  { id: "csharp", label: "C#", group: "language", aliases: ["c#", "csharp", ".net", "dotnet"] },
  { id: "go", label: "Go", group: "language", aliases: ["go", "golang"] },
  { id: "rust", label: "Rust", group: "language", aliases: ["rust"] },
  { id: "swift", label: "Swift", group: "language", aliases: ["swift"] },
  { id: "kotlin", label: "Kotlin", group: "language", aliases: ["kotlin"] },
  { id: "scala", label: "Scala", group: "language", aliases: ["scala"] },
  { id: "ruby", label: "Ruby", group: "language", aliases: ["ruby", "rails"] },
  { id: "php", label: "PHP", group: "language", aliases: ["php"] },
  { id: "objectivec", label: "Objective-C", group: "language", aliases: ["objective-c", "objectivec"] },
  { id: "bash", label: "Shell", group: "language", aliases: ["bash", "shell", "zsh"] },

  // Backend / frameworks
  { id: "spring", label: "Spring Boot", group: "backend", aliases: ["spring boot", "spring", "springboot"] },
  { id: "node", label: "Node.js", group: "backend", aliases: ["node.js", "nodejs", "node"] },
  { id: "rest", label: "REST APIs", group: "backend", aliases: ["rest", "rest api", "rest apis", "restful", "api rest"] },
  { id: "graphql", label: "GraphQL", group: "backend", aliases: ["graphql"] },
  { id: "grpc", label: "gRPC", group: "backend", aliases: ["grpc"] },
  { id: "microservices", label: "Microservices", group: "backend", aliases: ["microservices", "microservicios"] },
  { id: "django", label: "Django", group: "backend", aliases: ["django"] },
  { id: "flask", label: "Flask", group: "backend", aliases: ["flask"] },
  { id: "fastapi", label: "FastAPI", group: "backend", aliases: ["fastapi"] },
  { id: "express", label: "Express", group: "backend", aliases: ["express", "express.js"] },

  // Frontend
  { id: "react", label: "React", group: "frontend", aliases: ["react", "react.js", "reactjs"] },
  { id: "nextjs", label: "Next.js", group: "frontend", aliases: ["next.js", "nextjs"] },
  { id: "vue", label: "Vue", group: "frontend", aliases: ["vue", "vue.js", "vuejs"] },
  { id: "angular", label: "Angular", group: "frontend", aliases: ["angular", "angularjs"] },
  { id: "html", label: "HTML", group: "frontend", aliases: ["html", "html5"] },
  { id: "css", label: "CSS", group: "frontend", aliases: ["css", "css3"] },
  { id: "tailwind", label: "TailwindCSS", group: "frontend", aliases: ["tailwind", "tailwindcss"] },

  // Data
  { id: "sql", label: "SQL", group: "data", aliases: ["sql"] },
  { id: "postgres", label: "PostgreSQL", group: "data", aliases: ["postgresql", "postgres", "psql"] },
  { id: "mysql", label: "MySQL", group: "data", aliases: ["mysql", "mariadb"] },
  { id: "sqlserver", label: "SQL Server", group: "data", aliases: ["sql server", "mssql", "t-sql"] },
  { id: "mongodb", label: "MongoDB", group: "data", aliases: ["mongodb", "mongo"] },
  { id: "redis", label: "Redis", group: "data", aliases: ["redis"] },
  { id: "supabase", label: "Supabase", group: "data", aliases: ["supabase"] },
  { id: "neon", label: "Neon", group: "data", aliases: ["neon"] },
  { id: "dynamodb", label: "DynamoDB", group: "data", aliases: ["dynamodb"] },
  { id: "spark", label: "Spark", group: "data", aliases: ["spark", "apache spark", "pyspark"] },
  { id: "hadoop", label: "Hadoop", group: "data", aliases: ["hadoop", "mapreduce"] },
  { id: "kafka", label: "Kafka", group: "data", aliases: ["kafka"] },
  { id: "airflow", label: "Airflow", group: "data", aliases: ["airflow"] },
  { id: "beam", label: "Apache Beam", group: "data", aliases: ["apache beam", "dataflow"] },
  { id: "etl", label: "Data pipelines", group: "data", aliases: ["etl", "elt", "data pipeline", "data pipelines", "pipelines de datos"] },
  { id: "datawarehouse", label: "Data warehousing", group: "data", aliases: ["data warehouse", "data warehousing", "bigquery", "snowflake", "redshift"] },

  // ML / AI
  { id: "ml", label: "Machine learning", group: "data", aliases: ["machine learning", "ml", "aprendizaje automático", "aprendizaje automatico"] },
  { id: "deeplearning", label: "Deep learning", group: "data", aliases: ["deep learning", "neural networks", "redes neuronales"] },
  { id: "nlp", label: "NLP", group: "data", aliases: ["nlp", "natural language processing", "procesamiento del lenguaje natural"] },
  { id: "llm", label: "LLMs", group: "data", aliases: ["llm", "llms", "large language model", "large language models", "foundation models", "genai", "generative ai"] },
  { id: "pytorch", label: "PyTorch", group: "data", aliases: ["pytorch", "torch"] },
  { id: "tensorflow", label: "TensorFlow", group: "data", aliases: ["tensorflow"] },
  { id: "jax", label: "JAX", group: "data", aliases: ["jax"] },
  { id: "sklearn", label: "scikit-learn", group: "data", aliases: ["scikit-learn", "sklearn"] },
  { id: "pandas", label: "pandas", group: "data", aliases: ["pandas", "numpy"] },
  { id: "cv", label: "Computer vision", group: "data", aliases: ["computer vision", "visión artificial", "vision artificial"] },

  // Cloud / platform
  { id: "aws", label: "AWS", group: "cloud", aliases: ["aws", "amazon web services"] },
  { id: "ec2", label: "EC2", group: "cloud", aliases: ["ec2"] },
  { id: "lambda", label: "AWS Lambda", group: "cloud", aliases: ["lambda", "aws lambda"] },
  { id: "amplify", label: "AWS Amplify", group: "cloud", aliases: ["amplify", "aws amplify"] },
  { id: "s3", label: "S3", group: "cloud", aliases: ["s3"] },
  { id: "gcp", label: "Google Cloud", group: "cloud", aliases: ["gcp", "google cloud", "google cloud platform"] },
  { id: "azure", label: "Azure", group: "cloud", aliases: ["azure", "microsoft azure"] },
  { id: "docker", label: "Docker", group: "cloud", aliases: ["docker", "containers", "contenedores"] },
  { id: "kubernetes", label: "Kubernetes", group: "cloud", aliases: ["kubernetes", "k8s"] },
  { id: "terraform", label: "Terraform", group: "cloud", aliases: ["terraform", "infrastructure as code", "iac"] },
  { id: "serverless", label: "Serverless", group: "cloud", aliases: ["serverless"] },

  // Tooling
  { id: "git", label: "Git", group: "tooling", aliases: ["git", "github", "gitlab", "version control", "control de versiones"] },
  { id: "postman", label: "Postman", group: "tooling", aliases: ["postman"] },
  { id: "linux", label: "Linux", group: "tooling", aliases: ["linux", "unix"] },
  { id: "jira", label: "Jira", group: "tooling", aliases: ["jira"] },

  // Practices
  { id: "cicd", label: "CI/CD", group: "practice", aliases: ["ci/cd", "cicd", "continuous integration", "continuous delivery", "integración continua"] },
  { id: "testing", label: "Testing", group: "practice", aliases: ["testing", "unit tests", "unit testing", "qa", "test automation", "pruebas"] },
  { id: "agile", label: "Agile", group: "practice", aliases: ["agile", "scrum", "kanban", "ágil"] },
  { id: "devops", label: "DevOps", group: "practice", aliases: ["devops", "sre", "site reliability"] },
  { id: "security", label: "Security", group: "practice", aliases: ["security", "seguridad", "cybersecurity", "ciberseguridad"] },
  { id: "distributed", label: "Distributed systems", group: "practice", aliases: ["distributed systems", "distributed computing", "sistemas distribuidos", "large-scale systems"] },
  { id: "algorithms", label: "Algorithms", group: "practice", aliases: ["algorithms", "data structures", "algoritmos", "estructuras de datos"] },
  { id: "oop", label: "Object-oriented design", group: "practice", aliases: ["object-oriented", "object oriented", "oop", "programación orientada a objetos"] },
];

export const SKILL_BY_ID = new Map(SKILLS.map((skill) => [skill.id, skill]));

export function skillLabel(id: string): string {
  return SKILL_BY_ID.get(id)?.label ?? id;
}

export function skillGroup(id: string): SkillGroup | null {
  return SKILL_BY_ID.get(id)?.group ?? null;
}

/**
 * Token boundaries, hand-rolled because `\b` cannot express this.
 *
 * `\b` treats `+`, `#` and `.` as boundaries, so `\bc\b` matches the "C" in
 * "C++" and `\bts\b` matches the "ts" in "artifacts". But a dot is only part of
 * a token when a word follows it: "Node.js" is one token, while the "Java." at
 * the end of Google's "C/C++, Python, Go, Java." is not — an earlier version
 * treated every dot as internal and silently missed that Java, which is exactly
 * the kind of miss this vocabulary exists to prevent.
 *
 * So a dot counts as inside the token only when glued to an alphanumeric.
 */
const WORD_CHAR = "A-Za-z0-9+#_\\-";
/** Rejects a preceding word char, or a preceding "<word>." as in "node.js". */
const LEADING = `(?<![${WORD_CHAR}])(?<![A-Za-z0-9]\\.)`;
/** Rejects a following word char, or a following ".<word>" as in "next.js". */
const TRAILING = `(?![${WORD_CHAR}])(?!\\.[A-Za-z0-9])`;

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function aliasPattern(alias: string): RegExp {
  // Whitespace in an alias ("amazon web services") may appear as any run of
  // whitespace in real text, including a line break inside a wrapped bullet.
  const body = escapeRegex(alias).replace(/\\?\s+/g, "\\s+");
  return new RegExp(`${LEADING}${body}${TRAILING}`, "i");
}

/** Alias → canonical id, longest alias first so "sql server" wins over "sql". */
const ALIAS_PATTERNS: { id: string; pattern: RegExp; alias: string }[] = SKILLS
  .flatMap((skill) => skill.aliases.map((alias) => ({ id: skill.id, alias, pattern: aliasPattern(alias) })))
  .sort((left, right) => right.alias.length - left.alias.length);

/**
 * Every canonical skill mentioned anywhere in `text`.
 *
 * Used for both the CV and the posting, which is the point: the two sides can
 * only be compared when they speak the same vocabulary.
 */
export function extractSkillTokens(text: string): string[] {
  if (!text) return [];
  const found = new Set<string>();
  for (const { id, pattern } of ALIAS_PATTERNS) {
    if (found.has(id)) continue;
    if (pattern.test(text)) found.add(id);
  }
  return [...found].sort();
}

/**
 * Acronym/expansion pairs a real ATS checks for. A CV that writes only "AWS"
 * fails a filter keyed on "Amazon Web Services" and vice versa, so writing both
 * once is free insurance — this is what `atsHygiene` in the scorer reports on.
 */
export const ACRONYM_PAIRS: { id: string; short: string; long: string }[] = [
  { id: "aws", short: "AWS", long: "Amazon Web Services" },
  { id: "kubernetes", short: "K8s", long: "Kubernetes" },
  { id: "ml", short: "ML", long: "machine learning" },
  { id: "nlp", short: "NLP", long: "natural language processing" },
  { id: "llm", short: "LLM", long: "large language model" },
  { id: "gcp", short: "GCP", long: "Google Cloud Platform" },
  { id: "cicd", short: "CI/CD", long: "continuous integration" },
  { id: "oop", short: "OOP", long: "object-oriented" },
];
