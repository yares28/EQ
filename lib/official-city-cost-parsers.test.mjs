import assert from "node:assert/strict";
import test from "node:test";

import {
  parseAeatDeclaredRentRow,
  validateEmtValencia2026Fare,
} from "./official-city-cost-parsers.ts";

function rentRow(city, homes, rented, rent, perSquareMeter, surface) {
  return `<tr><th><div>${city}</div></th><td>${homes}</td><td>${rented}</td><td>${rent}</td><td>${perSquareMeter}</td><td>${surface}</td><td>347</td><td>141.404</td><td>6,0</td></tr>`;
}

test("parses exact AEAT municipality rows and Spanish-formatted numbers", () => {
  const html = `${rentRow("Madrid-28079", "1.087.776", "310.601", "1.012", "15,1", "71")}${rentRow("Valencia-46250", "263.601", "66.254", "753", "8,9", "88")}`;
  assert.deepEqual(parseAeatDeclaredRentRow(html, "Madrid-28079"), {
    municipalityCode: "Madrid-28079",
    rentedHomeCount: 310_601,
    averageMonthlyRentEur: 1_012,
    averageMonthlyRentPerSquareMeterEur: 15.1,
    averageSurfaceSquareMeters: 71,
  });
  assert.equal(
    parseAeatDeclaredRentRow(html, "Valencia-46250").averageMonthlyRentEur,
    753,
  );
});

test("fails closed when AEAT rows are missing, duplicated, or structurally shifted", () => {
  const valid = rentRow("Madrid-28079", "1.087.776", "310.601", "1.012", "15,1", "71");
  assert.throws(() => parseAeatDeclaredRentRow(valid, "Valencia-46250"), /omitted/);
  assert.throws(() => parseAeatDeclaredRentRow(valid + valid, "Madrid-28079"), /duplicate/);
  assert.throws(
    () => parseAeatDeclaredRentRow(valid.replace("<td>6,0</td>", ""), "Madrid-28079"),
    /column structure/,
  );
});

test("validates the scoped EMT Valencia 2026 monthly cap evidence", () => {
  assert.doesNotThrow(() =>
    validateEmtValencia2026Fare(`
      <h3>Tarjeta MovimEMT</h3>
      <p>Precio bonificado (hasta 31/12/26)</p>
      <p>0,51€ por validación (21€/mes)</p>
      <p>Válido: Sólo EMT</p>
    `),
  );
  assert.throws(
    () => validateEmtValencia2026Fare("<p>Tarjeta MovimEMT</p>"),
    /changed or disappeared/,
  );
});
