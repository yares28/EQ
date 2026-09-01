export interface AeatDeclaredRentRow {
  municipalityCode: string;
  rentedHomeCount: number;
  averageMonthlyRentEur: number;
  averageMonthlyRentPerSquareMeterEur: number;
  averageSurfaceSquareMeters: number;
}

function decodeHtmlText(value: string): string {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;|&amp;/gi, (entity) =>
      entity.toLowerCase() === "&amp;" ? "&" : " ",
    )
    .replace(/\s+/g, " ")
    .trim();
}

function parseSpanishNumber(value: string): number {
  const normalized = value.replace(/\./g, "").replace(",", ".").trim();
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) throw new Error(`Invalid Spanish number: ${value}`);
  return parsed;
}

/**
 * Parses one exact municipality row from AEAT's declared-rent HTML table.
 * Column order is validated because silently shifting a value would make the
 * resulting cost comparison look plausible while being wrong.
 */
export function parseAeatDeclaredRentRow(
  html: string,
  municipalityCode: string,
): AeatDeclaredRentRow {
  const marker = `${municipalityCode}<`;
  const markerIndex = html.indexOf(marker);
  if (markerIndex < 0) throw new Error(`AEAT omitted ${municipalityCode}.`);
  if (html.indexOf(marker, markerIndex + marker.length) >= 0) {
    throw new Error(`AEAT returned duplicate rows for ${municipalityCode}.`);
  }

  const rowStart = html.lastIndexOf("<tr", markerIndex);
  const rowEnd = html.indexOf("</tr>", markerIndex);
  if (rowStart < 0 || rowEnd < 0) {
    throw new Error(`AEAT row markup changed for ${municipalityCode}.`);
  }
  const rowHtml = html.slice(rowStart, rowEnd + 5);
  const cells = [...rowHtml.matchAll(/<(?:th|td)\b[^>]*>([\s\S]*?)<\/(?:th|td)>/gi)]
    .map((match) => decodeHtmlText(match[1]));
  if (cells.length !== 9 || cells[0] !== municipalityCode) {
    throw new Error(`AEAT column structure changed for ${municipalityCode}.`);
  }

  const rentedHomeCount = parseSpanishNumber(cells[2]);
  const averageMonthlyRentEur = parseSpanishNumber(cells[3]);
  const averageMonthlyRentPerSquareMeterEur = parseSpanishNumber(cells[4]);
  const averageSurfaceSquareMeters = parseSpanishNumber(cells[5]);
  if (
    !Number.isInteger(rentedHomeCount) ||
    rentedHomeCount < 1_000 ||
    averageMonthlyRentEur < 300 ||
    averageMonthlyRentEur > 2_500 ||
    averageMonthlyRentPerSquareMeterEur < 3 ||
    averageMonthlyRentPerSquareMeterEur > 40 ||
    averageSurfaceSquareMeters < 25 ||
    averageSurfaceSquareMeters > 200
  ) {
    throw new Error(`AEAT returned an implausible rent row for ${municipalityCode}.`);
  }

  return {
    municipalityCode,
    rentedHomeCount,
    averageMonthlyRentEur,
    averageMonthlyRentPerSquareMeterEur,
    averageSurfaceSquareMeters,
  };
}

export function normalizedOfficialText(html: string): string {
  return decodeHtmlText(html);
}

export function validateEmtValencia2026Fare(html: string): void {
  const text = normalizedOfficialText(html);
  const requiredFragments = [
    "Tarjeta MovimEMT",
    "Precio bonificado (hasta 31/12/26)",
    "0,51€ por validación (21€/mes)",
    "Válido: Sólo EMT",
  ];
  const missing = requiredFragments.filter((fragment) => !text.includes(fragment));
  if (missing.length > 0) {
    throw new Error(`EMT 2026 fare evidence changed or disappeared: ${missing.join(", ")}.`);
  }
}
