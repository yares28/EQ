import { isSpainLocation } from "./company-posted-salary.ts";

const TECHNICAL_ROLE = /(?:\b(software|developer|development|data|machine learning|deep learning|ml|artificial intelligence|ai|cloud|platform|security|devops|site reliability|sre|backend|front[- ]?end|full[- ]?stack|mobile|ios|android|systems?)\b|\bingenier[oa](?:\/a)?\b|\bdesarrollador(?:a|\/a)?\b)/i;

const ADJACENT_OR_LEADERSHIP_ROLE = /(?:\b(manager|director|head|vice president|vp|sales|account manager|customer engineer|field engineer|support engineer|solutions? architect|product manager|program manager|business development|data cent(?:er|re)|mechanical engineer|electrical engineer|hardware engineer|real estate|permitting|construction)\b|\b(?:jefe|responsable)\s+de\b|\bl[ií]der\s+t[eé]cnic[oa]\b)/i;

/**
 * Europe outside Spain. Spain itself is deliberately absent: `isSpainLocation`
 * is the one reader of Spanish place names, and a second copy here is exactly
 * what let "Getafe Area" and "MEQUINENZA PLANT" pass the archive's scope check
 * and then fail this one.
 */
const EUROPEAN_LOCATION = /\b(europe|european union|eu|emea|united kingdom|uk|london|ireland|dublin|germany|berlin|munich|france|paris|netherlands|amsterdam|switzerland|zurich|sweden|stockholm|portugal|lisbon|italy|milan|poland|warsaw|austria|vienna|denmark|copenhagen|finland|helsinki|norway|oslo|czechia|prague|belgium|brussels|luxembourg|romania|estonia|lithuania|latvia|greece)\b/i;

export function isRelevantToSpainSoftware(title: string, locations: string[]): boolean {
  if (!TECHNICAL_ROLE.test(title) || ADJACENT_OR_LEADERSHIP_ROLE.test(title)) return false;
  const location = locations.join(" ");
  const europeanLocation = isSpainLocation(locations) || EUROPEAN_LOCATION.test(location);
  const worldwideRemote = /\b(remote|distributed|anywhere)\b/i.test(location) &&
    /\b(worldwide|global)\b/i.test(location);
  return europeanLocation || worldwideRemote;
}
