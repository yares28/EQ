/**
 * Turning a decoded job-description string into something scannable, without
 * inventing structure that was not in the source.
 *
 * `decodeHtml` (careerResearch.ts) already flattens `<h2>`, `<strong>`,
 * `<li>` etc. into plain lines — a heading like "Minimum Qualifications"
 * survives as its own short line, immediately followed by the next line of
 * real content with no blank line between them. That is a genuine structural
 * signal the HTML->text decode preserved; recovering it is not fabrication.
 */

/** A real job description does not reach this. It exists so one pathological
 *  source page cannot make a posting row large; it is not a normal ceiling. */
export const DESCRIPTION_STORAGE_LIMIT = 12_000;

export function boundedDescription(value: string): string | undefined {
  if (value.length === 0) return undefined;
  return value.length <= DESCRIPTION_STORAGE_LIMIT
    ? value
    : value.slice(0, DESCRIPTION_STORAGE_LIMIT);
}

export interface DescriptionBlock {
  /** null for text before the first recognised heading. */
  heading: string | null;
  lines: string[];
}

const HEADING_MAX_WORDS = 6;
const HEADING_MAX_LENGTH = 60;
/** Short connector words a heading may contain without breaking Title Case,
 *  e.g. "About the Team", "What You'll Do". Never required to be capitalised. */
const HEADING_CONNECTORS = new Set([
  "a", "an", "the", "of", "to", "for", "and", "or", "in", "on", "at",
  "with", "you'll", "you're", "we're",
]);

/**
 * True for a line that reads as a section heading rather than a sentence.
 *
 * Deliberately conservative: real body text in a decoded JD almost always
 * ends in terminal punctuation (". ! ?" or the odd ","), so requiring the
 * absence of that is a strong, low-false-positive signal on its own. The
 * Title-Case-every-significant-word check on top of it is what tells
 * "Minimum Qualifications" apart from a short unpunctuated fragment.
 */
function looksLikeHeading(line: string): boolean {
  if (line.length === 0 || line.length > HEADING_MAX_LENGTH) return false;
  if (/[.!?,;]$/.test(line)) return false;
  const body = line.endsWith(":") ? line.slice(0, -1) : line;
  if (body.length === 0) return false;
  const words = body.split(/\s+/);
  if (words.length > HEADING_MAX_WORDS) return false;
  return words.every((word, index) => {
    if (index > 0 && HEADING_CONNECTORS.has(word.toLowerCase())) return true;
    return /^[A-Z]/.test(word);
  });
}

/**
 * Splits a decoded description into heading-led blocks for display. Never
 * drops or rewords a line — every character of the original still appears,
 * only grouped and labelled.
 */
export function formatJobDescription(text: string): DescriptionBlock[] {
  const blocks: DescriptionBlock[] = [];
  let current: DescriptionBlock = { heading: null, lines: [] };

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (line.length === 0) continue;
    if (looksLikeHeading(line)) {
      if (current.heading !== null || current.lines.length > 0) blocks.push(current);
      current = { heading: line.endsWith(":") ? line.slice(0, -1) : line, lines: [] };
    } else {
      current.lines.push(line);
    }
  }
  if (current.heading !== null || current.lines.length > 0) blocks.push(current);
  return blocks;
}

/**
 * The lines under a posting's requirements heading.
 *
 * Lives here rather than in the career-feed adapters because BOTH paths need
 * it: the automatic sync and the roles /process harvests by hand. When only
 * the adapters had it, every researched role was written with no requirements
 * at all — which silently emptied `mustHaveTokens`, the dominant signal in the
 * CV match, for every role /process added.
 */
export function extractRequirements(description: string): string[] {
  const lines = description.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const heading = /^(requirements?|qualifications?|what you(?:'|’)ll bring|what we(?:'|’)re looking for|requisitos?|perfil|must haves?)\s*:?[\s—-]*$/i;
  const otherHeading = /^[A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ &'’/+-]{2,50}:?$/;
  const start = lines.findIndex((line) => heading.test(line));
  if (start < 0) return [];
  const values: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (values.length > 0 && otherHeading.test(line) && !/^[-•]/.test(line)) break;
    const cleaned = line.replace(/^[-•*·]\s*/, "").trim();
    if (cleaned.length >= 4 && cleaned.length <= 240) values.push(cleaned);
    if (values.length >= 30) break;
  }
  return [...new Set(values)];
}
