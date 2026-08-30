export const SPAIN_PAYROLL_2026_MODEL_KEY = "spain-payroll-standard-2026";
export const SPAIN_PAYROLL_2026_ALGORITHM_VERSION =
  "aeat-retenciones-2026.0+pjc-297-2026-v1";

export const SPAIN_PAYROLL_2026_PARAMETERS = {
  taxYear: 2026,
  effectiveFrom: "2026-01-01",
  assumptions: {
    employment: "general_indefinite_full_year",
    contributionGroup: 1,
    familySituation: 3,
    birthYear: 1995,
    descendants: 0,
    disability: false,
    geographicMobilityReduction: false,
    irregularIncomeReduction: false,
    ceutaMelilla: false,
    qualifyingMortgageReduction: false,
    payPeriods: 12,
  },
  socialSecurity: {
    minimumMonthlyBaseEur: 1_989.3,
    maximumMonthlyBaseEur: 5_101.2,
    employeeRates: {
      commonContingencies: 0.047,
      unemploymentIndefinite: 0.0155,
      vocationalTraining: 0.001,
      intergenerationalEquity: 0.0015,
    },
    solidarityBands: [
      { lowerMonthlyEur: 5_101.2, upperMonthlyEur: 5_611.32, employeeRate: 0.0019 },
      { lowerMonthlyEur: 5_611.32, upperMonthlyEur: 7_651.8, employeeRate: 0.0021 },
      { lowerMonthlyEur: 7_651.8, upperMonthlyEur: null, employeeRate: 0.0024 },
    ],
  },
  aeatWithholding: {
    generalOtherExpensesEur: 2_000,
    personalMinimumEur: 5_550,
    noWithholdingThresholdEur: 15_876,
    quotaLimitGrossThresholdEur: 35_200,
    quotaLimitRate: 0.43,
    workIncomeReduction: {
      firstUpperEur: 14_852,
      firstAmountEur: 7_302,
      secondUpperEur: 17_673.52,
      secondMultiplier: 1.75,
      thirdUpperEur: 19_747.5,
      thirdStartAmountEur: 2_364.34,
      thirdMultiplier: 1.14,
    },
    scale: [
      { lowerEur: 0, upperEur: 12_450, baseQuotaEur: 0, rate: 0.19 },
      { lowerEur: 12_450, upperEur: 20_200, baseQuotaEur: 2_365.5, rate: 0.24 },
      { lowerEur: 20_200, upperEur: 35_200, baseQuotaEur: 4_225.5, rate: 0.3 },
      { lowerEur: 35_200, upperEur: 60_000, baseQuotaEur: 8_725.5, rate: 0.37 },
      { lowerEur: 60_000, upperEur: 300_000, baseQuotaEur: 17_901.5, rate: 0.45 },
      { lowerEur: 300_000, upperEur: null, baseQuotaEur: 125_901.5, rate: 0.47 },
    ],
  },
} as const;

export const SPAIN_PAYROLL_2026_SOURCE_URLS = {
  aeat:
    "https://sede.agenciatributaria.gob.es/static_files/Sede/Programas_ayuda/Retenciones/2026/ALGORITMO_2026.pdf",
  aeatService:
    "https://www2.agenciatributaria.gob.es/wlpl/PRET-R200/mc",
  socialSecurity:
    "https://www.seg-social.es/wps/portal/wss/internet/Trabajadores/10777/36537",
  socialSecurityOrder:
    "https://www.boe.es/eli/es/o/2026/03/30/pjc297",
} as const;

export interface SpainPayrollEstimate2026 {
  modelKey: typeof SPAIN_PAYROLL_2026_MODEL_KEY;
  algorithmVersion: typeof SPAIN_PAYROLL_2026_ALGORITHM_VERSION;
  annualGrossCashEur: number;
  annualContributionBaseEur: number;
  annualEmployeeSocialSecurityEur: number;
  annualStandardSocialSecurityEur: number;
  annualSolidarityContributionEur: number;
  annualIrpfWithholdingEur: number;
  irpfWithholdingRatePercent: number;
  annualNetCashEur: number;
  monthlyNetCashEur: number;
  effectiveDeductionRatePercent: number;
  taxableBaseForWithholdingEur: number;
}

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function truncatePercent(value: number): number {
  return Math.floor((value + Number.EPSILON) * 100) / 100;
}

function workIncomeReduction(netWorkIncomeEur: number): number {
  const reduction = SPAIN_PAYROLL_2026_PARAMETERS.aeatWithholding.workIncomeReduction;
  if (netWorkIncomeEur <= reduction.firstUpperEur) return reduction.firstAmountEur;
  if (netWorkIncomeEur <= reduction.secondUpperEur) {
    return roundCurrency(
      reduction.firstAmountEur -
        reduction.secondMultiplier * (netWorkIncomeEur - reduction.firstUpperEur),
    );
  }
  if (netWorkIncomeEur < reduction.thirdUpperEur) {
    return roundCurrency(
      reduction.thirdStartAmountEur -
        reduction.thirdMultiplier * (netWorkIncomeEur - reduction.secondUpperEur),
    );
  }
  return 0;
}

function withholdingScale(baseEur: number): number {
  if (baseEur <= 0) return 0;
  const band = SPAIN_PAYROLL_2026_PARAMETERS.aeatWithholding.scale.find(
    (candidate) => candidate.upperEur === null || baseEur <= candidate.upperEur,
  );
  if (band === undefined) throw new Error("The AEAT withholding scale is incomplete.");
  return band.baseQuotaEur + (baseEur - band.lowerEur) * band.rate;
}

export function employeeSocialSecurity2026(annualGrossCashEur: number): {
  annualContributionBaseEur: number;
  annualStandardSocialSecurityEur: number;
  annualSolidarityContributionEur: number;
  annualEmployeeSocialSecurityEur: number;
} {
  if (!Number.isFinite(annualGrossCashEur) || annualGrossCashEur <= 0) {
    throw new RangeError("Annual gross cash must be a positive finite amount.");
  }
  const socialSecurity = SPAIN_PAYROLL_2026_PARAMETERS.socialSecurity;
  const annualMinimumBase = socialSecurity.minimumMonthlyBaseEur * 12;
  const annualMaximumBase = socialSecurity.maximumMonthlyBaseEur * 12;
  const annualContributionBaseEur = Math.min(
    Math.max(annualGrossCashEur, annualMinimumBase),
    annualMaximumBase,
  );
  const standardRate = Object.values(socialSecurity.employeeRates).reduce(
    (sum, rate) => sum + rate,
    0,
  );
  const annualStandardSocialSecurityEur = roundCurrency(
    annualContributionBaseEur * standardRate,
  );
  const annualSolidarityContributionEur = roundCurrency(
    socialSecurity.solidarityBands.reduce((total, band) => {
      const lowerAnnual = band.lowerMonthlyEur * 12;
      const upperAnnual = band.upperMonthlyEur === null
        ? annualGrossCashEur
        : band.upperMonthlyEur * 12;
      const amountInBand = Math.max(
        0,
        Math.min(annualGrossCashEur, upperAnnual) - lowerAnnual,
      );
      return total + amountInBand * band.employeeRate;
    }, 0),
  );
  return {
    annualContributionBaseEur: roundCurrency(annualContributionBaseEur),
    annualStandardSocialSecurityEur,
    annualSolidarityContributionEur,
    annualEmployeeSocialSecurityEur: roundCurrency(
      annualStandardSocialSecurityEur + annualSolidarityContributionEur,
    ),
  };
}

export function estimateSpainPayroll2026(
  annualGrossCashEur: number,
): SpainPayrollEstimate2026 {
  const socialSecurity = employeeSocialSecurity2026(annualGrossCashEur);
  const withholding = SPAIN_PAYROLL_2026_PARAMETERS.aeatWithholding;
  const netWorkIncomeEur = Math.max(
    0,
    annualGrossCashEur - socialSecurity.annualEmployeeSocialSecurityEur,
  );
  const otherExpensesEur = Math.min(withholding.generalOtherExpensesEur, netWorkIncomeEur);
  const reducedNetWorkIncomeEur = Math.max(
    0,
    netWorkIncomeEur - otherExpensesEur - workIncomeReduction(netWorkIncomeEur),
  );

  let annualIrpfWithholdingEur = 0;
  let irpfWithholdingRatePercent = 0;
  if (annualGrossCashEur > withholding.noWithholdingThresholdEur) {
    const grossQuota = withholdingScale(reducedNetWorkIncomeEur);
    const personalMinimumQuota = withholdingScale(withholding.personalMinimumEur);
    let quotaEur = Math.max(0, grossQuota - personalMinimumQuota);
    if (annualGrossCashEur <= withholding.quotaLimitGrossThresholdEur) {
      quotaEur = Math.min(
        quotaEur,
        Math.max(
          0,
          (annualGrossCashEur - withholding.noWithholdingThresholdEur) *
            withholding.quotaLimitRate,
        ),
      );
    }
    irpfWithholdingRatePercent = truncatePercent(
      (quotaEur / annualGrossCashEur) * 100,
    );
    annualIrpfWithholdingEur = roundCurrency(
      annualGrossCashEur * (irpfWithholdingRatePercent / 100),
    );
  }

  const annualNetCashEur = roundCurrency(
    annualGrossCashEur -
      socialSecurity.annualEmployeeSocialSecurityEur -
      annualIrpfWithholdingEur,
  );
  return {
    modelKey: SPAIN_PAYROLL_2026_MODEL_KEY,
    algorithmVersion: SPAIN_PAYROLL_2026_ALGORITHM_VERSION,
    annualGrossCashEur: roundCurrency(annualGrossCashEur),
    ...socialSecurity,
    annualIrpfWithholdingEur,
    irpfWithholdingRatePercent,
    annualNetCashEur,
    monthlyNetCashEur: roundCurrency(annualNetCashEur / 12),
    effectiveDeductionRatePercent: roundCurrency(
      ((socialSecurity.annualEmployeeSocialSecurityEur + annualIrpfWithholdingEur) /
        annualGrossCashEur) *
        100,
    ),
    taxableBaseForWithholdingEur: roundCurrency(reducedNetWorkIncomeEur),
  };
}

