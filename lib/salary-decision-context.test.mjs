import assert from "node:assert/strict";
import test from "node:test";

import {
  cityCostKeyForLocation,
  DEFAULT_SALARY_DECISION_CONTEXT,
  normalizeDecisionLocation,
  parseSalaryDecisionContext,
  serializeSalaryDecisionContext,
} from "./salary-decision-context.ts";

test("uses Madrid as the default location scope", () => {
  assert.deepEqual(parseSalaryDecisionContext(null), DEFAULT_SALARY_DECISION_CONTEXT);
  assert.equal(DEFAULT_SALARY_DECISION_CONTEXT.location, "Madrid");
});

test("preserves every selectable target level and location", () => {
  const levels = ["intern", "junior", "mid"];
  const locations = ["Madrid", "Valencia", "Málaga", "Bilbao", "Remote"];

  for (const targetLevel of levels) {
    for (const location of locations) {
      assert.deepEqual(
        parseSalaryDecisionContext(JSON.stringify({ targetLevel, location })),
        {
          targetLevel,
          location,
          payBasis: DEFAULT_SALARY_DECISION_CONTEXT.payBasis,
          costMode: DEFAULT_SALARY_DECISION_CONTEXT.costMode,
        },
      );
    }
  }
});

test("migrates legacy location filters to a Spain city scope", () => {
  assert.equal(normalizeDecisionLocation("all"), "Madrid");
  assert.equal(normalizeDecisionLocation("Spain-wide"), "Madrid");
  assert.equal(normalizeDecisionLocation("Remote Spain/EU"), "Remote");
  assert.equal(normalizeDecisionLocation("EU benchmark"), "Madrid");
  assert.equal(normalizeDecisionLocation("Other Spain"), "Madrid");
  assert.deepEqual(
    parseSalaryDecisionContext(JSON.stringify({ targetLevel: "mid", location: "Spain-wide" })),
    {
      targetLevel: "mid",
      location: "Madrid",
      payBasis: DEFAULT_SALARY_DECISION_CONTEXT.payBasis,
      costMode: DEFAULT_SALARY_DECISION_CONTEXT.costMode,
    },
  );
});

test("falls back safely for malformed or non-object storage", () => {
  assert.deepEqual(parseSalaryDecisionContext("{"), DEFAULT_SALARY_DECISION_CONTEXT);
  assert.deepEqual(parseSalaryDecisionContext("[]"), DEFAULT_SALARY_DECISION_CONTEXT);
  assert.deepEqual(parseSalaryDecisionContext("null"), DEFAULT_SALARY_DECISION_CONTEXT);
});

test("repairs invalid fields independently", () => {
  const withDefaults = (patch) => ({ ...DEFAULT_SALARY_DECISION_CONTEXT, ...patch });
  assert.deepEqual(
    parseSalaryDecisionContext(JSON.stringify({ targetLevel: "staff", location: "Madrid" })),
    withDefaults({ targetLevel: "junior", location: "Madrid" }),
  );
  assert.deepEqual(
    parseSalaryDecisionContext(JSON.stringify({ targetLevel: "mid", location: "London" })),
    withDefaults({ targetLevel: "mid", location: "Madrid" }),
  );
  // A bad pay basis must not discard a good location, and vice versa.
  assert.deepEqual(
    parseSalaryDecisionContext(
      JSON.stringify({ targetLevel: "mid", location: "Málaga", payBasis: "equity", costMode: "guess" }),
    ),
    withDefaults({ targetLevel: "mid", location: "Málaga" }),
  );
  assert.equal(
    parseSalaryDecisionContext(JSON.stringify({ payBasis: "total", costMode: "personal" })).payBasis,
    "total",
  );
  assert.equal(
    parseSalaryDecisionContext(JSON.stringify({ payBasis: "total", costMode: "personal" })).costMode,
    "personal",
  );
  // The earlier boolean form must keep meaning what the user chose.
  assert.equal(
    parseSalaryDecisionContext(JSON.stringify({ showLivingCosts: false })).costMode,
    "off",
  );
  assert.equal(
    parseSalaryDecisionContext(JSON.stringify({ showLivingCosts: true })).costMode,
    "reference",
  );
});

test("serializes only canonical decision fields", () => {
  const serialized = serializeSalaryDecisionContext({
    targetLevel: "mid",
    location: "Madrid",
    ignored: true,
  });

  assert.deepEqual(JSON.parse(serialized), { targetLevel: "mid", location: "Madrid" });
});

test("only cities with a validated cost bundle expose one", () => {
  assert.equal(cityCostKeyForLocation("Madrid"), "madrid-city");
  assert.equal(cityCostKeyForLocation("Valencia"), "valencia-city");
  // Every other city ranks on pay alone; after-cost figures must stay locked
  // rather than borrowing Madrid's costs.
  for (const city of ["Málaga", "Barcelona", "Bilbao", "Seville", "Zaragoza", "Alicante"]) {
    assert.equal(cityCostKeyForLocation(city), null, `${city} has no cost bundle`);
  }
  assert.equal(cityCostKeyForLocation("Remote"), null);
});

test("newly supported cities survive a round trip through storage", () => {
  const stored = serializeSalaryDecisionContext({ targetLevel: "mid", location: "Málaga" });
  assert.equal(parseSalaryDecisionContext(stored).location, "Málaga");
  // An unknown or removed location still falls back rather than throwing.
  assert.equal(normalizeDecisionLocation("Atlantis"), "Madrid");
  assert.equal(normalizeDecisionLocation("Spain-wide"), "Madrid");
});
