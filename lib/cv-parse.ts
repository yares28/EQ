import { extractSkillTokens } from "./skill-taxonomy.ts";

/**
 * Turns extracted CV text into structured content.
 *
 * Structure is the point. The rewrite regenerates LaTeX from this rather than
 * patching a PDF, so the format is re-emitted from a template and only the
 * words change — which is the only way to offer "same format, different text"
 * for a document whose source you no longer have.
 *
 * Deliberately tolerant: a CV is not a data format, and a parser that only
 * works on one layout is a parser that breaks the first time the CV is edited.
 * Anything unrecognised is kept as a bullet under its section rather than
 * dropped, so no line of the original is ever lost.
 */

export interface CvBullet {
  text: string;
}

export interface CvEntry {
  /** "Amazon Operations Intern", "Trakzi", "Universidad Politécnica de Valencia" */
  title: string;
  /** The right-hand column: dates, or a URL for a project. */
  meta?: string;
  /** The second line: employer, or the project's tech stack. */
  subtitle?: string;
  subtitleMeta?: string;
  bullets: CvBullet[];
}

export interface CvSection {
  heading: string;
  entries: CvEntry[];
  /** Lines that belong to the section but not to any entry (e.g. skills lines). */
  looseLines: string[];
}

export interface ParsedCv {
  name: string;
  contactLine: string;
  sections: CvSection[];
  /** Canonical skill ids found anywhere in the CV. */
  skills: string[];
  languages: { language: string; level: string }[];
  education: string[];
  /** Full plain text, kept so the scorer can check phrases, not only skills. */
  text: string;
}

/** Section headings this template uses, plus the obvious variants. */
const KNOWN_HEADINGS = [
  "education",
  "experience",
  "work experience",
  "projects",
  "technical skills",
  "skills",
  "languages",
  "other achievements",
  "achievements",
  "certifications",
  "publications",
  "awards",
];

function isHeading(line: string): boolean {
  const normalized = line.trim().replace(/[:\s]+$/, "").toLowerCase();
  return KNOWN_HEADINGS.includes(normalized);
}

/** A bullet in the extracted text, whatever glyph the renderer used. */
function bulletText(line: string): string | null {
  const match = line.match(/^\s*[•·▪‣*\-–]\s+(.*)$/);
  return match ? match[1].trim() : null;
}

/**
 * An entry's first line carries its right-hand column too, because the PDF
 * extractor flattens the template's two-column rows into one line separated by
 * a run of spaces. Splitting on that run recovers both halves; a line without
 * one is simply a title with no date.
 */
function splitColumns(line: string): { left: string; right?: string } {
  const match = line.match(/^(.*?)\s{2,}(.*)$/);
  if (match === null) return { left: line.trim() };
  return { left: match[1].trim(), right: match[2].trim() };
}

const LANGUAGE_LINE = /^\s*languages?\s*:\s*(.*)$/i;
const SKILLS_LINE = /^\s*(technologies|tools|languages|frameworks|skills)\s*:\s*(.*)$/i;

function parseLanguages(value: string): { language: string; level: string }[] {
  return value
    .split(/[,;]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .flatMap((part) => {
      const match = part.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
      if (match === null) return [{ language: part, level: "" }];
      return [{ language: match[1].trim(), level: match[2].trim() }];
    });
}

export function parseCvText(raw: string): ParsedCv {
  const lines = raw.replace(/\r\n?/g, "\n").split("\n").map((line) => line.trimEnd());
  const nonEmpty = lines.map((line) => line.trim()).filter(Boolean);

  // The name is the first substantial line; the contact line is the one right
  // after it that carries an email, a phone number or a profile URL.
  const name = nonEmpty[0] ?? "";
  const contactLine =
    nonEmpty.slice(1, 4).find((line) => /@|https?:\/\/|linkedin|github|\+\d/i.test(line)) ?? "";

  const sections: CvSection[] = [];
  let current: CvSection | null = null;
  let entry: CvEntry | null = null;

  const closeEntry = () => {
    if (current !== null && entry !== null) current.entries.push(entry);
    entry = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line === "") continue;

    if (isHeading(line)) {
      closeEntry();
      current = {
        heading: line.replace(/[:\s]+$/, ""),
        entries: [],
        looseLines: [],
      };
      sections.push(current);
      continue;
    }
    if (current === null) continue; // header block: name and contacts, already captured

    const bullet = bulletText(line);
    if (bullet !== null) {
      // A bullet with no entry above it belongs to the section itself, which is
      // how "Other Achievements" is laid out in this template.
      if (entry === null) current.looseLines.push(bullet);
      else entry.bullets.push({ text: bullet });
      continue;
    }

    // A "Technologies: ..." style line is section content, not a new entry.
    if (SKILLS_LINE.test(line) || LANGUAGE_LINE.test(line)) {
      current.looseLines.push(line);
      continue;
    }

    const { left, right } = splitColumns(line);
    // A line directly under an entry that has no bullets yet is that entry's
    // second row (employer + location, or a project's stack + link).
    if (entry !== null && entry.bullets.length === 0 && entry.subtitle === undefined) {
      entry.subtitle = left;
      entry.subtitleMeta = right;
      continue;
    }
    closeEntry();
    entry = { title: left, meta: right, bullets: [] };
  }
  closeEntry();

  const text = lines.join("\n");
  const languageLines = sections
    .flatMap((section) => section.looseLines)
    .map((line) => line.match(LANGUAGE_LINE))
    .filter((match): match is RegExpMatchArray => match !== null);

  const education = (sections.find((section) => /education/i.test(section.heading))?.entries ?? [])
    .map((item) => [item.title, item.subtitle].filter(Boolean).join(" — "));

  return {
    name,
    contactLine,
    sections,
    skills: extractSkillTokens(text),
    languages: languageLines.flatMap((match) => parseLanguages(match[1])),
    education,
    text,
  };
}
