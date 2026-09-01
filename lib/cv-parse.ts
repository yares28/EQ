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

/**
 * Bumped whenever parsing changes shape or fixes a bug.
 *
 * Stored alongside the result and compared on import: without it, re-importing
 * an unchanged file short-circuits and leaves structure produced by the old,
 * wrong parser on file forever. That is exactly what happened when bullet
 * continuation was fixed — the text was identical, so nothing re-parsed.
 */
export const CV_PARSER_VERSION = "cv-parse-v3-columns";

export interface ParsedCv {
  parserVersion: string;
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
  // Greedy, so the split happens at the LAST run of spaces: the right-hand
  // column is the trailing one. A project line reads
  // "Trakzi   |   Next.js, React, ...   www.trakzi.com", and splitting at the
  // first run left the title as bare "Trakzi" and swept the whole stack into
  // the date column.
  const match = line.match(/^(.*)\s{2,}(.*)$/);
  const collapse = (value: string) => value.replace(/\s{2,}/g, " ").trim();
  if (match === null) return { left: collapse(line) };
  return { left: collapse(match[1]), right: collapse(match[2]) };
}

/**
 * LaTeX PDFs emit accented letters as a combining mark, a space, then the
 * letter — the CV's "Politécnica" extracts as "Polit´ ecnica". Repairing it
 * here keeps the artifact out of every downstream display and comparison.
 */
const ACCENTS: Record<string, Record<string, string>> = {
  "´": { a: "á", e: "é", i: "í", o: "ó", u: "ú", n: "ń", A: "Á", E: "É", I: "Í", O: "Ó", U: "Ú" },
  "`": { a: "à", e: "è", i: "ì", o: "ò", u: "ù", A: "À", E: "È", I: "Ì", O: "Ò", U: "Ù" },
  "¨": { a: "ä", e: "ë", i: "ï", o: "ö", u: "ü", A: "Ä", E: "Ë", I: "Ï", O: "Ö", U: "Ü" },
  "^": { a: "â", e: "ê", i: "î", o: "ô", u: "û", A: "Â", E: "Ê", I: "Î", O: "Ô", U: "Û" },
  "~": { a: "ã", n: "ñ", o: "õ", A: "Ã", N: "Ñ", O: "Õ" },
};

export function repairAccents(value: string): string {
  return value.replace(/([´`¨^~])\s?([A-Za-z])/g, (whole, mark: string, letter: string) => {
    return ACCENTS[mark]?.[letter] ?? whole;
  });
}

/** A wrapped bullet is cut mid-sentence, so an unterminated previous line is
 *  the signal that the next one continues it rather than starting something new. */
const TERMINAL_PUNCTUATION = /[.!?:;]["')\]]?$/;

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

export function parseCvText(rawInput: string): ParsedCv {
  const raw = repairAccents(rawInput);
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
  /**
   * Where the most recent bullet went, so a wrapped continuation line can be
   * appended to it. A real PDF wraps a long bullet across three or four lines;
   * without this every continuation became its own entry, which turned four
   * Amazon bullets into eight bogus job titles.
   */
  let sink: { kind: "entry"; list: CvBullet[] } | { kind: "loose"; list: string[] } | null = null;

  const lastBulletText = (): string | null => {
    if (sink === null) return null;
    if (sink.kind === "entry") return sink.list.at(-1)?.text ?? null;
    return sink.list.at(-1) ?? null;
  };
  const appendToLastBullet = (text: string) => {
    if (sink === null) return;
    if (sink.kind === "entry") {
      const last = sink.list.at(-1);
      if (last) last.text = `${last.text} ${text}`.trim();
      return;
    }
    const index = sink.list.length - 1;
    if (index >= 0) sink.list[index] = `${sink.list[index]} ${text}`.trim();
  };

  const closeEntry = () => {
    if (current !== null && entry !== null) current.entries.push(entry);
    entry = null;
    sink = null;
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
      if (entry === null) {
        current.looseLines.push(bullet);
        sink = { kind: "loose", list: current.looseLines };
      } else {
        entry.bullets.push({ text: bullet });
        sink = { kind: "entry", list: entry.bullets };
      }
      continue;
    }

    // A "Technologies: ..." style line is section content, not a new entry —
    // and it wraps too, so it becomes the continuation target as well.
    if (SKILLS_LINE.test(line) || LANGUAGE_LINE.test(line)) {
      current.looseLines.push(line);
      sink = { kind: "loose", list: current.looseLines };
      continue;
    }

    // A line continuing the bullet above it: the previous one was cut
    // mid-sentence, and this is not a two-column row starting a new entry.
    const previous = lastBulletText();
    if (
      previous !== null &&
      !TERMINAL_PUNCTUATION.test(previous) &&
      !/\s{2,}/.test(line)
    ) {
      appendToLastBullet(line);
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
    sink = null;
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
    parserVersion: CV_PARSER_VERSION,
    name,
    contactLine,
    sections,
    skills: extractSkillTokens(text),
    languages: languageLines.flatMap((match) => parseLanguages(match[1])),
    education,
    text,
  };
}
