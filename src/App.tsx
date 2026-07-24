import React, { useState, useEffect, useMemo, useRef, type ReactNode } from "react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, Cell, ComposedChart
} from "recharts";

/* ============================================================
   TYPES
   ============================================================ */
interface Seats {
  salesAe: number; sdr: number; se: number; salesOps: number; cs: number;
  ps: number; support: number; pmm: number; mktg: number; readonly: number;
}

interface TeamMember {
  id: string; label: string; b: number; r: number; base: number;
}

type CloudProvider = "gcp" | "aws" | "azure";
type HaMode = "active-active" | "active-passive";

interface Assumptions {
  seats: Seats;
  seatGrowth: number;
  sfSalesCloud: number; sfServiceCloud: number; sfCpq: number; sfPlatform: number;
  sfDiscount: number; sfAddons: number; sfUplift: number;
  sfAdminFte: number; sfSiSpend: number; sfIsvSpend: number; sfContractLockYears: number;
  team: TeamMember[];
  loadMult: number; geoBlend: number; buildMonths: number; parallelMonths: number;
  aiVelocity: number; aiSeatCost: number; aiInference: number; aiSustainLift: number;
  migration: number; integrations: number; integrationCost: number;
  pentest: number; soc2Setup: number; isoSetup: number; gdprArch: number;
  changeMgmtPerSeat: number;
  cloudProvider: CloudProvider; regions: number; haMode: HaMode;
  cudDiscount: number; nonProdEnvs: number;
  observability: number; complianceAnnual: number; techDebtPct: number;
  vAccounts: number; vContacts: number; vOpps: number; vActivities: number;
  retentionYears: number;
  rSchedule: number; rCost: number; rPartialFail: number; rFullFail: number;
  rAttrition: number; rProductivityDip: number; rRevenue: number;
  rComplianceDelay: number; rFeatureGap: number;
  discountRate: number;
}

type ThemeMode = "dark" | "light";

interface ThemeColors {
  bg: string; surface: string; surface2: string; rule: string;
  text: string; textDim: string; textFaint: string;
  brass: string; oxide: string; slate: string;
  good: string; warn: string; inputBg: string; shadow: string;
}

interface DictEntry { d: string; s: string; g: string; }

interface BuyYearRow { year: number; licenses: number; addons: number; admin: number; si: number; isv: number; total: number; }
interface BuildYearRow { year: number; oneTime: number; cloud: number; sustain: number; obs: number; comp: number; aiRun: number; debt: number; legacy: number; total: number; }
interface CumulativeRow { year: number; buy: number; build: number; }
interface RiskItem { label: string; v: number; }

interface ModelResult {
  buy: BuyYearRow[];
  build: BuildYearRow[];
  cumulative: CumulativeRow[];
  baseBuyTotal: number;
  baseBuildTotal: number;
  buildExpected: number;
  riskItems: RiskItem[];
  riskTotal: number;
  npvBuy: number;
  npvBuild: number;
  beYear: number | null;
  oneTime: number;
  buildLabor: number;
  cloudY1: number;
  effBuildMonths: number;
  buildEngHeads: number;
  runEngHeads: number;
  runTeamAnnual: number;
  seatsY0: number;
  buyPerSeatY1: number;
  licPerSeatY1: number;
}

/* ============================================================
   THEME
   Two palettes, same structural logic.
   Brass = incumbent (buy) path. Oxide = build path. Both modes.
   ============================================================ */
const THEMES: Record<ThemeMode, ThemeColors> = {
  dark: {
    bg: "#12161C", surface: "#1A2028", surface2: "#232B35", rule: "#2E3846",
    text: "#E8E4DA", textDim: "#9AA3B0", textFaint: "#5C6674",
    brass: "#C9A227", oxide: "#B4553A", slate: "#5B8FA8",
    good: "#5F9E6E", warn: "#C97B3A", inputBg: "#12161C",
    shadow: "0 6px 22px rgba(0,0,0,0.45)",
  },
  light: {
    bg: "#F5F3EE", surface: "#FFFFFF", surface2: "#EDEAE2", rule: "#D6D1C4",
    text: "#1C2128", textDim: "#5A6270", textFaint: "#8A8F99",
    brass: "#8A6D12", oxide: "#9A4529", slate: "#3D6B84",
    good: "#3F7A50", warn: "#A85E20", inputBg: "#FFFFFF",
    shadow: "0 6px 22px rgba(0,0,0,0.14)",
  },
};

const fmtM = (n: number): string => {
  const a = Math.abs(n);
  if (a >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
};
const fmtN = (n: number): string => Math.round(n).toLocaleString("en-US");
const pct = (n: number): string => `${(n * 100).toFixed(0)}%`;
const MAX_W = 1120;

/* ============================================================
   VARIABLE DICTIONARY
   d = what it is, s = where the default came from,
   g = how to replace it with your own data
   ============================================================ */
const DICT: Record<string, DictEntry> = {
  salesAe: { d: "Account executives plus first- and second-line sales leadership. Anyone carrying or managing a quota.", s: "Seeded from a typical B2B software org at roughly 1,500 employees.", g: "Pull from your HRIS by job family, not by cost center." },
  sdr: { d: "Sales development and business development reps doing inbound or outbound prospecting.", s: "Typical ratio is one SDR per 1.5 to 2 AEs.", g: "If you use an agency or offshore SDR model, count only seats that touch the CRM." },
  se: { d: "Sales engineers and solutions consultants supporting deals technically.", s: "Common staffing is one SE per 3 to 4 AEs.", g: "SEs almost always need full licenses, not read-only." },
  salesOps: { d: "Sales operations, enablement, and deal desk. The heaviest CRM administrators and report builders.", s: "Typically 3 to 5 percent of the sales org.", g: "This group drives the most custom configuration and the most technical debt." },
  cs: { d: "Customer success managers, renewals, and CS operations.", s: "CSM ratios run from 1:10 in enterprise to 1:100 or more in SMB.", g: "Decide whether renewals sits here or in sales before counting, so you do not double-count." },
  ps: { d: "Professional services and implementation consultants.", s: "Often licensed lighter since they live primarily in a PSA tool.", g: "If PS runs on a separate system, they may only need read access." },
  support: { d: "Tier 1, 2, and 3 support engineers plus support leadership.", s: "Drives Service Cloud seat count specifically.", g: "Count concurrent agents if your vendor prices that way." },
  pmm: { d: "Product marketing. Usually light CRM users pulling competitive and win/loss data.", s: "Roughly one PMM per one or two product lines.", g: "Rarely needs a full license." },
  mktg: { d: "Demand generation, brand, content, events, and marketing operations.", s: "Marketing ops needs full access; most of the rest need light or none.", g: "Split this if your marketing automation platform is the primary system for most of the team." },
  readonly: { d: "Finance, executives, and analysts who consume reports but do not edit records.", s: "Often licensed at zero cost through analytics tools instead.", g: "Check whether your BI layer removes the need for these seats entirely." },
  seatGrowth: { d: "Compound annual growth in CRM seats.", s: "Defaults to 8 percent, a moderate growth assumption.", g: "Use your board-approved hiring plan, not aspirational targets. Negative values model contraction." },

  sfSalesCloud: { d: "Monthly list price per Sales Cloud user before discount.", s: "Published Salesforce list pricing for Enterprise edition. A starting point, not your price.", g: "Read it off your order form. Unlimited and Einstein-inclusive editions run materially higher." },
  sfServiceCloud: { d: "Monthly list price per Service Cloud user before discount.", s: "Published list pricing, Enterprise edition.", g: "Check whether you pay per named agent or per concurrent agent." },
  sfCpq: { d: "Monthly list price per CPQ user before discount.", s: "Published list pricing for CPQ.", g: "Only quoting users need this, often far fewer seats than total sales headcount." },
  sfPlatform: { d: "Monthly list price for platform or light licenses.", s: "Covers users who need records but not full sales functionality.", g: "Vendors often push full licenses where platform would do. Worth auditing." },
  sfDiscount: { d: "Blended negotiated discount off list across all license types.", s: "Defaults to 30 percent. Large multi-year commits commonly reach 40 to 60 percent.", g: "This is the single most-abused input in build-versus-buy models. Compute it from your invoice, not from memory." },
  sfUplift: { d: "Annual price increase at renewal.", s: "Defaults to 7 percent. Historical range is 5 to 10 percent for enterprise agreements.", g: "Check your contract for a capped uplift clause. If you have one, use the cap." },
  sfAddons: { d: "Sandboxes, Shield encryption, Data Cloud, extra storage, premier support.", s: "Frequently 15 to 30 percent of license spend and routinely forgotten in comparisons.", g: "Sum every line on the order form that is not a per-user license." },
  sfIsvSpend: { d: "AppExchange and third-party tools that exist only because of the CRM.", s: "Document generation, e-signature connectors, enrichment, forecasting overlays.", g: "Only count tools you would not need if you owned the system. Be honest; most would still be needed." },
  sfAdminFte: { d: "Internal full-time staff dedicated to CRM administration and development.", s: "Typically 6 to 12 FTE at this scale.", g: "Include declarative admins, platform developers, and integration owners. Exclude general IT." },
  sfSiSpend: { d: "System integrator and consulting spend on the incumbent platform.", s: "Covers releases, integrations, and major configuration projects.", g: "Average the last three years. Project spend is lumpy." },
  sfContractLockYears: { d: "Years remaining on your current incumbent commitment.", s: "Locked years are owed regardless of the decision, so savings cannot begin until the term expires.", g: "Check your order form for the co-termination date and any early-termination clause." },

  aiVelocity: { d: "How much faster the build phase runs with AI-assisted coding versus a conventional team.", s: "No defensible industry benchmark exists. The 2.2x default is a judgment call, not a measurement.", g: "The most load-bearing and least grounded input here. See the calibration panel before setting it." },
  aiSustainLift: { d: "Reduction in steady-state engineering headcount from AI assistance during maintenance.", s: "Lower than build-phase gains. Maintenance is dominated by comprehension and coordination, not typing.", g: "A lift above 2x implies your team never debugs production incidents." },
  aiSeatCost: { d: "Annual per-engineer cost of AI coding tools.", s: "Approximate current enterprise pricing for coding assistants.", g: "Include premium tiers and any per-seat platform fees." },
  aiInference: { d: "Annual inference cost for AI features inside the CRM itself.", s: "Summarization, lead scoring, email drafting, and similar in-product features.", g: "Scales with usage, not seats. Model it from expected calls per user per day." },

  loadMult: { d: "Multiplier applied to base salary for fully loaded cost.", s: "Covers benefits, payroll taxes, equity, facilities, and equipment.", g: "Ask finance for the real number. Common range is 1.25 to 1.4x." },
  geoBlend: { d: "Adjustment for where engineers are hired.", s: "1.00 represents a US tech hub. 0.55 represents heavy offshore staffing.", g: "Offshore savings are real but partly offset by coordination overhead and slower onboarding." },
  buildMonths: { d: "Nominal calendar duration for a conventional team to reach production.", s: "18 months for core CRM plus support, forecasting, and CPQ with enterprise security.", g: "Set this as if AI did not exist. The velocity multiplier is applied separately." },
  parallelMonths: { d: "Period during which both systems run simultaneously during cutover.", s: "Six months is typical for a phased migration.", g: "You pay full incumbent license cost during this window. Big-bang cutovers are shorter and riskier." },

  migration: { d: "Extracting, transforming, validating, and loading historical data.", s: "Scales with record count and the number of custom objects.", g: "Data quality problems surface here, not before. Budget for remediation." },
  integrations: { d: "Number of external systems requiring a bidirectional integration.", s: "Financial system, SSO, data warehouse, email, e-signature, telephony.", g: "Count each system once. Multi-object integrations to one system still count as one." },
  integrationCost: { d: "Average build cost per integration.", s: "Assumes moderate complexity with error handling and reconciliation.", g: "Financial system integrations run well above average because of reconciliation requirements." },
  pentest: { d: "Security architecture review and penetration testing.", s: "Initial architecture engagement plus first full pen test.", g: "Recurring annual testing is captured separately under recurring compliance." },
  soc2Setup: { d: "SOC 2 Type II readiness work plus the first audit.", s: "Type II requires an observation window, typically six to twelve months.", g: "Readiness consulting usually costs more than the audit itself." },
  isoSetup: { d: "ISO 27001 certification including ISMS build-out and Stage 1 and 2 audits.", s: "Substantial overlap with SOC 2 reduces marginal cost.", g: "If your company already holds ISO 27001, marginal cost for a new system is much lower." },
  gdprArch: { d: "EU data residency architecture, DSAR tooling, records of processing, DPA infrastructure.", s: "Assumes a dedicated EU region and data-subject request automation.", g: "Residency requirements vary by customer contract. Check your largest EU agreements." },
  changeMgmtPerSeat: { d: "Training, documentation, communications, and productivity ramp per user.", s: "Covers the full transition, not annual training.", g: "Underfunding this is the most common cause of adoption failure in internal system replacements." },

  cloudProvider: { d: "Hyperscaler hosting the built system.", s: "Rates approximate published on-demand pricing for equivalent services.", g: "Your existing enterprise agreement matters far more than list-price differences." },
  haMode: { d: "Active-active serves traffic from all regions. Active-passive keeps standby capacity warm.", s: "Active-active roughly doubles infrastructure cost but delivers the strongest availability.", g: "Global 24x7 availability does not automatically require active-active. Define your RTO first." },
  regions: { d: "Number of cloud regions the system runs in.", s: "Three covers Americas, EMEA, and APAC. EU residency usually requires a dedicated region.", g: "Each additional region adds roughly 55 percent to base infrastructure cost." },
  cudDiscount: { d: "Committed-use or reserved-instance discount.", s: "One-year and three-year commitments typically yield 30 to 45 percent.", g: "Committing requires confidence in your capacity forecast. Overcommitting is its own cost." },
  nonProdEnvs: { d: "Development, staging, and UAT environments.", s: "Each modeled at 40 percent of production cost.", g: "Ephemeral environments cut this substantially if your team is disciplined about teardown." },
  vAccounts: { d: "Total account records including inactive.", s: "Drives storage and index sizing.", g: "Include records you would migrate, not just active ones." },
  vContacts: { d: "Total contact and lead records.", s: "Usually the second-largest object after activities.", g: "Consider whether you migrate all history or archive older records." },
  vOpps: { d: "Total opportunity records including closed.", s: "Historical opportunities matter for forecast accuracy analysis.", g: "Forecast snapshot history multiplies this considerably." },
  vActivities: { d: "Emails, calls, meetings, and logged tasks. Almost always the dominant object by volume.", s: "Ten million is typical for a 1,500-person company with automated activity capture.", g: "This single number drives most of your storage cost. Verify it before trusting the cloud estimate." },
  retentionYears: { d: "Years of history kept in the primary datastore.", s: "Seven years is a common compliance-driven default.", g: "Tiering old data to cold storage cuts cost significantly. This model does not assume tiering." },
  observability: { d: "APM, log aggregation, SIEM, error tracking, and CI/CD tooling.", s: "Scales with seat count and service count.", g: "Log volume from activity-heavy systems surprises people. Budget generously." },
  complianceAnnual: { d: "Recurring audit fees, evidence collection, GRC tooling, and surveillance audits.", s: "SOC 2 recurs annually. ISO 27001 has surveillance audits in years one and two, recertification in year three.", g: "Add the fully loaded cost of internal time spent gathering evidence." },
  techDebtPct: { d: "Reserve for refactoring, framework upgrades, and paying down shortcuts.", s: "15 percent of sustain engineering plus cloud cost.", g: "AI-generated code accumulates debt differently: higher volume, lower consistency. Consider a higher reserve, not a lower one." },

  rSchedule: { d: "Multiplier on build duration reflecting historical overrun rates.", s: "Enterprise application rebuilds commonly run 1.5 to 2x their original estimate.", g: "Set this to 1.0 only if you have delivered comparable scope on time before." },
  rCost: { d: "Multiplier on non-labor build costs.", s: "Migration and integration work overruns more often than feature work.", g: "Independent of schedule overrun, which is modeled separately." },
  rFeatureGap: { d: "Reserve for functionality discovered necessary only after users are on the system.", s: "20 percent of one-time build cost.", g: "Higher if your incumbent implementation has heavy custom configuration you have not fully catalogued." },
  rPartialFail: { d: "Probability of abandoning the build mid-flight and returning to the incumbent.", s: "25 percent base rate. Costs include sunk investment plus re-onboarding.", g: "Lower if you can ship incrementally by module. Higher for big-bang approaches." },
  rFullFail: { d: "Probability of complete failure requiring emergency repurchase at unfavorable terms.", s: "10 percent base rate. The vendor knows your position in this scenario.", g: "This is the tail risk executives most often refuse to name out loud." },
  rAttrition: { d: "Annual voluntary departure rate among the engineering team.", s: "15 percent with a six-month replacement and ramp cycle.", g: "Internal tooling teams often see higher attrition than product teams. Factor retention risk explicitly." },
  rProductivityDip: { d: "Temporary reduction in sales productivity during and after cutover.", s: "5 percent for roughly two quarters.", g: "Applied against your revenue base. Often the largest single risk line for revenue-heavy organizations." },
  rRevenue: { d: "Annual revenue, used only to size the productivity-dip exposure.", s: "Not used in any other calculation.", g: "Use recognized revenue, not bookings." },
  rComplianceDelay: { d: "Probability of failing the first certification attempt and needing remediation.", s: "30 percent for first-time SOC 2 Type II.", g: "Lower if your company already holds these certifications for other systems." },
  discountRate: { d: "Rate used to discount future cash flows to present value.", s: "10 percent is a common corporate default.", g: "Ask finance for your weighted average cost of capital. Higher rates favor deferring spend, which favors buying." },
};

// Default assumptions live in /public/defaults.json and are fetched at
// runtime, so they can be changed without touching component code.

/* ============================================================
   CLOUD SIZING
   ============================================================ */
function cloudAnnual(s: Assumptions): number {
  const totalSeats = Object.values(s.seats).reduce((a, b) => a + b, 0);
  const records = s.vAccounts + s.vContacts + s.vOpps + s.vActivities;

  const gbHot = (records * 2200 * (1 + s.retentionYears * 0.12)) / 1e9;
  const gbBackup = gbHot * 2.5;
  const vcpu = Math.max(24, Math.ceil((totalSeats * 0.35) / 40) * 8);

  const rates = {
    gcp:   { vcpu: 620, dbGb: 2.9, stGb: 0.26, egress: 0.11, lb: 26000, search: 78000, kms: 14000 },
    aws:   { vcpu: 665, dbGb: 3.1, stGb: 0.28, egress: 0.09, lb: 31000, search: 92000, kms: 16000 },
    azure: { vcpu: 640, dbGb: 3.0, stGb: 0.25, egress: 0.10, lb: 28000, search: 85000, kms: 15000 },
  }[s.cloudProvider];

  const haMult = s.haMode === "active-active" ? 1.9 : 1.35;
  const regionMult = 1 + (s.regions - 1) * 0.55;

  const compute = vcpu * rates.vcpu * haMult * regionMult;
  const database = gbHot * rates.dbGb * 12 * haMult * regionMult;
  const storage = (gbHot + gbBackup) * rates.stGb * 12 * regionMult;
  const egress = (totalSeats * 900 + records * 0.004) * rates.egress * 12;
  const fixed = (rates.lb + rates.search + rates.kms) * regionMult;

  const prod = compute + database + storage + egress + fixed;
  const nonProd = prod * 0.40 * s.nonProdEnvs;
  return (prod + nonProd) * (1 - s.cudDiscount);
}

/* ============================================================
   MODEL
   ============================================================ */
function runModel(s: Assumptions, years: number): ModelResult {
  const seatsY0 = Object.values(s.seats).reduce((a, b) => a + b, 0);
  const loaded = (base: number) => base * s.loadMult * s.geoBlend;

  const seatsAt = (y: number) => {
    const g = Math.pow(1 + s.seatGrowth, y);
    return {
      full: (s.seats.salesAe + s.seats.sdr + s.seats.se + s.seats.salesOps + s.seats.cs) * g,
      service: s.seats.support * g,
      cpq: (s.seats.salesAe + s.seats.salesOps + s.seats.se) * g,
      light: (s.seats.ps + s.seats.pmm + s.seats.mktg) * g,
      total: seatsY0 * g,
    };
  };

  const buy: BuyYearRow[] = [];
  for (let y = 0; y < years; y++) {
    const st = seatsAt(y);
    const uplift = Math.pow(1 + s.sfUplift, y);
    const disc = 1 - s.sfDiscount;
    const licenses = (
      st.full * s.sfSalesCloud * 12 * disc +
      st.service * s.sfServiceCloud * 12 * disc +
      st.cpq * s.sfCpq * 12 * disc +
      st.light * s.sfPlatform * 12 * disc
    ) * uplift;
    const addons = s.sfAddons * uplift;
    const admin = s.sfAdminFte * loaded(180000) * Math.pow(1.04, y);
    const si = s.sfSiSpend * Math.pow(1.04, y);
    const isv = s.sfIsvSpend * uplift;
    buy.push({ year: y + 1, licenses, addons, admin, si, isv, total: licenses + addons + admin + si + isv });
  }

  const buildTeamAnnual = s.team.reduce((a, t) => a + t.b * loaded(t.base), 0);
  const runTeamAnnualRaw = s.team.reduce((a, t) => a + t.r * loaded(t.base), 0);
  const effBuildMonths = s.buildMonths / s.aiVelocity;
  const buildLabor = buildTeamAnnual * (effBuildMonths / 12);
  const runTeamAnnual = runTeamAnnualRaw / s.aiSustainLift;
  const buildEngHeads = s.team.reduce((a, t) => a + t.b, 0);
  const runEngHeads = s.team.reduce((a, t) => a + t.r, 0);

  const oneTime =
    buildLabor + s.migration + s.integrations * s.integrationCost +
    s.pentest + s.soc2Setup + s.isoSetup + s.gdprArch +
    s.changeMgmtPerSeat * seatsY0 +
    buildEngHeads * s.aiSeatCost * (effBuildMonths / 12);

  const cloudY1 = cloudAnnual(s);
  const build: BuildYearRow[] = [];
  const buildYears = Math.max(1, Math.ceil(effBuildMonths / 12));
  const parallelYears = s.parallelMonths / 12;

  for (let y = 0; y < years; y++) {
    const st = seatsAt(y);
    const scale = st.total / seatsY0;
    const inBuild = y < buildYears;
    const buildFraction = inBuild ? Math.min(1, effBuildMonths / 12 - y) : 0;
    const oneTimeThisYear = inBuild ? oneTime * (buildFraction / (effBuildMonths / 12)) : 0;
    const live = y >= buildYears - 1;
    const runFraction = live ? (y === buildYears - 1 ? 1 - buildFraction : 1) : 0;

    const cloud = cloudY1 * scale * Math.pow(1.06, y) * (inBuild ? 0.45 : 1);
    const sustain = runTeamAnnual * runFraction * Math.pow(1.04, y);
    const obs = s.observability * scale * (inBuild ? 0.5 : 1);
    const comp = s.complianceAnnual * (y === 0 ? 0.5 : 1);
    const aiRun = (s.aiInference * scale * (live ? 1 : 0)) + (runEngHeads * s.aiSeatCost * runFraction);
    const debt = (sustain + cloud) * s.techDebtPct;

    const overlapYear = buildYears - 1;
    const parallelCost = y === overlapYear ? buy[Math.min(y, buy.length - 1)].total * parallelYears : 0;
    const preCutover = y < overlapYear ? buy[y].total : 0;
    const lockCost = y >= buildYears && y < s.sfContractLockYears ? buy[y].total : 0;

    build.push({
      year: y + 1, oneTime: oneTimeThisYear, cloud, sustain, obs, comp, aiRun, debt,
      legacy: preCutover + parallelCost + lockCost,
      total: oneTimeThisYear + cloud + sustain + obs + comp + aiRun + debt + preCutover + parallelCost + lockCost,
    });
  }

  const baseBuildTotal = build.reduce((a, r) => a + r.total, 0);
  const baseBuyTotal = buy.reduce((a, r) => a + r.total, 0);

  const riskItems: RiskItem[] = [
    { label: "Schedule overrun", v: buildLabor * (s.rSchedule - 1) },
    { label: "Cost overrun", v: (oneTime - buildLabor) * (s.rCost - 1) },
    { label: "Late feature gaps", v: oneTime * s.rFeatureGap },
    { label: "Key-person attrition", v: runTeamAnnual * s.rAttrition * 0.5 * years },
    { label: "Cutover productivity dip", v: s.rRevenue * s.rProductivityDip * 0.5 },
    { label: "Compliance delay", v: (s.soc2Setup + s.isoSetup) * s.rComplianceDelay * 0.6 },
    { label: "Partial failure (weighted)", v: s.rPartialFail * (oneTime * 0.6 + baseBuyTotal * 0.15) },
    { label: "Full failure (weighted)", v: s.rFullFail * (oneTime + baseBuyTotal * 0.25) },
  ];
  const riskTotal = riskItems.reduce((a, r) => a + r.v, 0);
  const npv = (rows: { total: number }[]) => rows.reduce((a, r, i) => a + r.total / Math.pow(1 + s.discountRate, i), 0);
  const buildExpected = baseBuildTotal + riskTotal;

  const riskPerYear = riskTotal / years;
  let cumBuy = 0, cumBuild = 0, beYear: number | null = null;
  const cumulative: CumulativeRow[] = build.map((b, i) => {
    cumBuy += buy[i].total;
    cumBuild += b.total + riskPerYear;
    if (beYear === null && cumBuild <= cumBuy) beYear = i + 1;
    return { year: i + 1, buy: cumBuy, build: cumBuild };
  });

  return {
    buy, build, cumulative, baseBuyTotal, baseBuildTotal, buildExpected,
    riskItems, riskTotal,
    npvBuy: npv(buy), npvBuild: npv(build) + riskTotal / Math.pow(1 + s.discountRate, years / 2),
    beYear, oneTime, buildLabor, cloudY1, effBuildMonths,
    buildEngHeads, runEngHeads, runTeamAnnual, seatsY0,
    buyPerSeatY1: buy[0].total / seatsY0,
    licPerSeatY1: buy[0].licenses / seatsY0,
  };
}

/* ============================================================
   UI PRIMITIVES
   ============================================================ */
function Info({ k, T }: { k: string; T: ThemeColors }) {
  const [open, setOpen] = useState(false);
  const e = DICT[k];
  if (!e) return null;
  return (
    <span style={{ position: "relative", display: "inline-block", marginLeft: 5 }}>
      <button
        type="button"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={(ev) => { ev.preventDefault(); setOpen(!open); }}
        aria-label="Explain this variable"
        style={{
          width: 13, height: 13, borderRadius: "50%", border: `1px solid ${T.textFaint}`,
          background: "none", color: T.textFaint, fontSize: 9, lineHeight: 1,
          cursor: "help", padding: 0, display: "inline-flex",
          alignItems: "center", justifyContent: "center", fontFamily: "ui-monospace, monospace",
        }}
      >?</button>
      {open && (
        <span style={{
          position: "absolute", left: 18, top: -4, zIndex: 40, width: 272,
          background: T.surface2, border: `1px solid ${T.rule}`, borderRadius: 3,
          padding: "10px 12px", fontSize: 11, lineHeight: 1.55, color: T.text,
          boxShadow: T.shadow, textTransform: "none", letterSpacing: "normal",
          fontWeight: 400, display: "block",
        }}>
          <span style={{ display: "block", marginBottom: 7 }}>{e.d}</span>
          <span style={{ display: "block", color: T.textDim, marginBottom: 6 }}>
            <strong style={{ color: T.brass, fontWeight: 500 }}>Default source. </strong>{e.s}
          </span>
          <span style={{ display: "block", color: T.textDim }}>
            <strong style={{ color: T.slate, fontWeight: 500 }}>Replace it with. </strong>{e.g}
          </span>
        </span>
      )}
    </span>
  );
}

function Field({ label, k, hint, T, children }: { label: string; k?: string; hint?: string; T: ThemeColors; children: ReactNode }) {
  return (
    <label style={{ display: "block", marginBottom: 14 }}>
      <span style={{
        fontSize: 10, letterSpacing: "0.09em", textTransform: "uppercase",
        color: T.textDim, marginBottom: 5, fontFamily: "ui-monospace, monospace", display: "block",
      }}>
        {label}{k && <Info k={k} T={T} />}
      </span>
      {children}
      {hint && <span style={{ fontSize: 11, color: T.textFaint, marginTop: 4, display: "block" }}>{hint}</span>}
    </label>
  );
}

const inputS = (T: ThemeColors): React.CSSProperties => ({
  width: "100%", background: T.inputBg, border: `1px solid ${T.rule}`,
  color: T.text, padding: "7px 9px", fontSize: 13,
  fontFamily: "ui-monospace, monospace", borderRadius: 2, outline: "none",
});

function Num({ value, onChange, step = 1, prefix, suffix, T }: { value: number; onChange: (v: number) => void; step?: number; prefix?: string; suffix?: string; T: ThemeColors }) {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
      {prefix && <span style={{ color: T.textFaint, fontSize: 12, fontFamily: "ui-monospace, monospace" }}>{prefix}</span>}
      <input type="number" value={value} step={step}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)} style={inputS(T)} />
      {suffix && <span style={{ color: T.textFaint, fontSize: 12, fontFamily: "ui-monospace, monospace" }}>{suffix}</span>}
    </span>
  );
}

function Slider({ value, onChange, min, max, step, display, T }: { value: number; onChange: (v: number) => void; min: number; max: number; step: number; display: string; T: ThemeColors }) {
  return (
    <span style={{ display: "block" }}>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ width: "100%", accentColor: T.brass }} />
      <span style={{ fontSize: 12, color: T.text, fontFamily: "ui-monospace, monospace", marginTop: 2, display: "block" }}>
        {display}
      </span>
    </span>
  );
}

function Group({ title, num, note, T, children }: { title: string; num: string; note?: string; T: ThemeColors; children: ReactNode }) {
  return (
    <div style={{ marginBottom: 36 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, borderBottom: `1px solid ${T.rule}`, paddingBottom: 8, marginBottom: 14 }}>
        <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 10, color: T.brass, letterSpacing: "0.1em" }}>{num}</span>
        <span style={{ fontSize: 14, color: T.text, fontWeight: 500 }}>{title}</span>
      </div>
      {note && <div style={{ fontSize: 12, color: T.textDim, lineHeight: 1.6, marginBottom: 16 }}>{note}</div>}
      {children}
    </div>
  );
}

function Stat({ label, value, tone, sub, T }: { label: string; value: string; tone?: string; sub?: string; T: ThemeColors }) {
  return (
    <div style={{ flex: 1, minWidth: 148 }}>
      <div style={{ fontSize: 10, letterSpacing: "0.09em", textTransform: "uppercase", color: T.textDim, marginBottom: 6, fontFamily: "ui-monospace, monospace" }}>{label}</div>
      <div style={{ fontSize: 27, color: tone || T.text, fontWeight: 300, letterSpacing: "-0.02em", lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: T.textFaint, marginTop: 5 }}>{sub}</div>}
    </div>
  );
}

function SecHead({ children, T }: { children: ReactNode; T: ThemeColors }) {
  return (
    <div style={{
      fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: T.textDim,
      marginBottom: 13, paddingBottom: 7, borderBottom: `1px solid ${T.rule}`,
      fontFamily: "ui-monospace, monospace",
    }}>{children}</div>
  );
}

/* ============================================================
   APP
   ============================================================ */
export default function CrmTcoModel() {
  const [defaults, setDefaults] = useState<Assumptions | null>(null);
  useEffect(() => {
    fetch("/defaults.json").then((r) => r.json()).then(setDefaults);
  }, []);

  if (!defaults) {
    const T = THEMES.light;
    return (
      <div style={{ background: T.bg, minHeight: "100vh", color: T.textDim, fontFamily: "'Inter', -apple-system, system-ui, sans-serif", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>
        Loading…
      </div>
    );
  }

  return <CrmTcoModelInner defaults={defaults} />;
}

function CrmTcoModelInner({ defaults }: { defaults: Assumptions }) {
  const [mode, setMode] = useState<ThemeMode>("light");
  const T = THEMES[mode];
  const [s, setS] = useState<Assumptions>(defaults);
  const [years, setYears] = useState(5);
  const [tab, setTab] = useState<"output" | "config">("output");
  const [view, setView] = useState<"summary" | "flow" | "risk" | "cloud" | "ledger">("summary");

  const set = <K extends keyof Assumptions>(k: K, v: Assumptions[K]) => setS((p) => ({ ...p, [k]: v }));
  const setSeat = (k: keyof Seats, v: number) => setS((p) => ({ ...p, seats: { ...p.seats, [k]: v } }));
  const setTeam = (id: string, f: "b" | "r" | "base", v: number) => setS((p) => ({ ...p, team: p.team.map((t) => t.id === id ? { ...t, [f]: v } : t) }));

  const m3 = useMemo(() => runModel(s, 3), [s]);
  const m5 = useMemo(() => runModel(s, 5), [s]);
  const m7 = useMemo(() => runModel(s, 7), [s]);
  const m = years === 3 ? m3 : years === 5 ? m5 : m7;

  const cloudCompare = useMemo(() =>
    (["gcp", "aws", "azure"] as CloudProvider[]).map((p) => ({ provider: p.toUpperCase(), cost: cloudAnnual({ ...s, cloudProvider: p }) })), [s]);

  const chartData = m.build.map((b, i) => ({ year: `Y${i + 1}`, Buy: Math.round(m.buy[i].total), Build: Math.round(b.total + m.riskTotal / years) }));
  const cumData = m.cumulative.map((c) => ({ year: `Y${c.year}`, Buy: Math.round(c.buy), Build: Math.round(c.build) }));
  const riskData = m.riskItems.filter((r) => r.v > 0).sort((a, b) => b.v - a.v).map((r) => ({ name: r.label, value: Math.round(r.v) }));

  const delta = m.buildExpected - m.baseBuyTotal;
  const buildWins = delta < 0;
  const horizons = [{ y: 3, mm: m3 }, { y: 5, mm: m5 }, { y: 7, mm: m7 }];

  const thS: React.CSSProperties = { textAlign: "left", padding: "9px 8px", fontSize: 10, color: T.textFaint, textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 400, fontFamily: "ui-monospace, monospace" };
  const tdS: React.CSSProperties = { padding: "9px 8px", color: T.text };
  const tipS = { background: T.surface, border: `1px solid ${T.rule}`, borderRadius: 2, fontSize: 12, color: T.text };

  const importInputRef = useRef<HTMLInputElement>(null);
  const [importStatus, setImportStatus] = useState<"ok" | "error" | null>(null);

  const exportJson = () => {
    const blob = new Blob([JSON.stringify({
      assumptions: s, horizon: years,
      results: { buy: m.baseBuyTotal, buildBase: m.baseBuildTotal, buildExpected: m.buildExpected, riskLoad: m.riskTotal, breakEvenYear: m.beYear, buyPerSeatY1: m.buyPerSeatY1 },
    }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "crm-tco-assumptions.json"; a.click();
    URL.revokeObjectURL(url);
  };

  const importJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const p = JSON.parse(r.result as string);
        if (!p.assumptions) throw new Error("missing assumptions");
        setS({ ...defaults, ...p.assumptions });
        if (p.horizon) setYears(p.horizon);
        setImportStatus("ok");
      } catch {
        setImportStatus("error");
      }
    };
    r.readAsText(f);
    e.target.value = "";
  };

  return (
    <div style={{ background: T.bg, minHeight: "100vh", color: T.text, fontFamily: "'Inter', -apple-system, system-ui, sans-serif" }}>
      {/* MASTHEAD */}
      <div style={{ borderBottom: `1px solid ${T.rule}`, padding: "20px 28px 0" }}>
        <div style={{ maxWidth: MAX_W, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 16, marginBottom: 16 }}>
          <div>
            <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 10, color: T.brass, letterSpacing: "0.22em", textTransform: "uppercase", marginBottom: 7 }}>
              Build vs Buy · Decision Instrument
            </div>
            <h1 style={{ margin: 0, fontSize: 29, fontWeight: 300, letterSpacing: "-0.025em", lineHeight: 1 }}>
              CRM Total Cost of Ownership
            </h1>
            <div style={{ fontSize: 12, color: T.textFaint, marginTop: 8, maxWidth: 580, lineHeight: 1.55 }}>
              Models replacing a commercial CRM with an internally owned, AI-assisted build. Every default
              is a benchmark, not a measurement. Replace them with your own contract and payroll data
              before this carries weight in a decision.
            </div>
          </div>
          <div style={{ display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap" }}>
            <button onClick={() => setMode(mode === "dark" ? "light" : "dark")} aria-label="Toggle color mode" style={{
              background: "none", border: `1px solid ${T.rule}`, color: T.brass,
              padding: "6px 11px", fontSize: 12, cursor: "pointer", borderRadius: 2, fontFamily: "ui-monospace, monospace",
            }}>{mode === "dark" ? "☾" : "☀"}</button>
          </div>
        </div>

        <div style={{ display: "flex", gap: 26 }}>
          {([["output", "Output"], ["config", "Configuration & definitions"]] as const).map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)} style={{
              background: "none", border: "none", color: tab === k ? T.text : T.textFaint,
              borderBottom: `2px solid ${tab === k ? T.brass : "transparent"}`,
              padding: "9px 2px 11px", fontSize: 13, cursor: "pointer",
            }}>{label}</button>
          ))}
        </div>
        </div>
      </div>

      {/* ============ OUTPUT ============ */}
      {tab === "output" && (
        <div style={{ padding: "22px 28px 70px", maxWidth: MAX_W, margin: "0 auto" }}>
          <div style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "center", marginBottom: 22 }}>
            <div style={{ display: "flex", gap: 5 }}>
              {[3, 5, 7].map((y) => (
                <button key={y} onClick={() => setYears(y)} style={{
                  background: years === y ? T.brass : "none",
                  border: `1px solid ${years === y ? T.brass : T.rule}`,
                  color: years === y ? T.bg : T.textDim,
                  padding: "6px 15px", fontSize: 12, cursor: "pointer", borderRadius: 2,
                  fontFamily: "ui-monospace, monospace", fontWeight: years === y ? 600 : 400,
                }}>{y}-year</button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
              {([["summary", "Summary"], ["flow", "Cash flow"], ["risk", "Risk"], ["cloud", "Cloud"], ["ledger", "Ledger"]] as const).map(([k, label]) => (
                <button key={k} onClick={() => setView(k)} style={{
                  background: "none", border: "none", color: view === k ? T.text : T.textFaint,
                  borderBottom: `2px solid ${view === k ? T.oxide : "transparent"}`,
                  padding: "5px 2px", fontSize: 12, cursor: "pointer",
                }}>{label}</button>
              ))}
            </div>
          </div>

          <div style={{ border: `1px solid ${T.rule}`, borderLeft: `3px solid ${buildWins ? T.good : T.oxide}`, background: T.surface, padding: "20px 22px", marginBottom: 26, borderRadius: 2 }}>
            <div style={{ display: "flex", gap: 26, flexWrap: "wrap", marginBottom: 16 }}>
              <Stat T={T} label={`Buy · ${years}yr`} value={fmtM(m.baseBuyTotal)} tone={T.brass} sub={`NPV ${fmtM(m.npvBuy)}`} />
              <Stat T={T} label={`Build · ${years}yr expected`} value={fmtM(m.buildExpected)} tone={T.oxide} sub={`Unadjusted ${fmtM(m.baseBuildTotal)}`} />
              <Stat T={T} label="Delta" value={`${delta > 0 ? "+" : ""}${fmtM(delta)}`} tone={buildWins ? T.good : T.oxide}
                sub={`${Math.abs(delta / m.baseBuyTotal * 100).toFixed(0)}% ${buildWins ? "cheaper to build" : "more expensive to build"}`} />
              <Stat T={T} label="Break-even" value={m.beYear ? `Year ${m.beYear}` : "None"} sub={m.beYear ? "Cumulative crossover" : `Not within ${years} years`} />
            </div>
            <div style={{ fontSize: 12, color: T.textDim, lineHeight: 1.6, borderTop: `1px solid ${T.rule}`, paddingTop: 13 }}>
              {buildWins
                ? `Under these assumptions the build recovers its investment by year ${m.beYear}. The result rests on the ${s.aiVelocity.toFixed(1)}× velocity multiplier and the ${pct(s.sfDiscount)} incumbent discount. Move either and re-read.`
                : `Under these assumptions buying stays cheaper across ${years} years. The build would need to ship faster, sustain on fewer people, or face a steeper incumbent renewal to close the gap.`}
            </div>
          </div>

          {/* CALIBRATION */}
          <div style={{ border: `1px solid ${T.rule}`, background: T.surface2, padding: "16px 20px", marginBottom: 28, borderRadius: 2 }}>
            <div style={{ fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: T.slate, marginBottom: 12, fontFamily: "ui-monospace, monospace" }}>
              Sanity check against a real contract
            </div>
            <div style={{ display: "flex", gap: 28, flexWrap: "wrap", marginBottom: 14 }}>
              <Stat T={T} label="Modeled incumbent · Y1" value={fmtM(m.buy[0].total)} />
              <Stat T={T} label="All-in per seat · Y1" value={`$${fmtN(m.buyPerSeatY1)}`} sub={`${fmtN(m.seatsY0)} seats`} />
              <Stat T={T} label="Licenses only · Y1" value={fmtM(m.buy[0].licenses)} sub={`$${fmtN(m.licPerSeatY1)} per seat`} />
            </div>
            <div style={{ fontSize: 12, color: T.textDim, lineHeight: 1.65 }}>
              One reported reference point: a roughly 1,500-person, $400M revenue software company paying
              approximately $2M per year in total Salesforce spend, which works out to something near
              $2,300 per CRM seat all-in. If your modeled Y1 figure sits well above that, the discount
              is probably too shallow or the seat mix too rich. Tune the discount slider until the
              licenses-only line matches your actual order form, then let the model show you what the
              add-ons, admin staff, and SI spend cost on top of it.
            </div>
          </div>

          {view === "summary" && (
            <>
              <div style={{ marginBottom: 30 }}>
                <SecHead T={T}>Horizon comparison</SecHead>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 480 }}>
                    <thead><tr style={{ borderBottom: `1px solid ${T.rule}` }}>
                      {["Horizon", "Buy", "Build (expected)", "Delta", "Break-even"].map((h) => <th key={h} style={thS}>{h}</th>)}
                    </tr></thead>
                    <tbody>
                      {horizons.map(({ y, mm }) => {
                        const d = mm.buildExpected - mm.baseBuyTotal;
                        return (
                          <tr key={y} style={{ borderBottom: `1px solid ${T.surface2}`, background: y === years ? T.surface : "transparent" }}>
                            <td style={tdS}>{y} years</td>
                            <td style={{ ...tdS, color: T.brass }}>{fmtM(mm.baseBuyTotal)}</td>
                            <td style={{ ...tdS, color: T.oxide }}>{fmtM(mm.buildExpected)}</td>
                            <td style={{ ...tdS, color: d < 0 ? T.good : T.text }}>{d > 0 ? "+" : ""}{fmtM(d)}</td>
                            <td style={{ ...tdS, color: T.textDim }}>{mm.beYear ? `Y${mm.beYear}` : "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div style={{ marginBottom: 30 }}>
                <SecHead T={T}>Cumulative cost</SecHead>
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={cumData} margin={{ top: 6, right: 10, left: 4, bottom: 0 }}>
                    <CartesianGrid stroke={T.surface2} vertical={false} />
                    <XAxis dataKey="year" stroke={T.textFaint} tick={{ fontSize: 11 }} />
                    <YAxis stroke={T.textFaint} tick={{ fontSize: 11 }} tickFormatter={(v: number) => fmtM(v)} width={58} />
                    <Tooltip contentStyle={tipS} formatter={(v: any) => fmtM(Number(v))} />
                    <Line type="monotone" dataKey="Buy" stroke={T.brass} strokeWidth={2} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="Build" stroke={T.oxide} strokeWidth={2} dot={{ r: 3 }} />
                    {m.beYear && <ReferenceLine x={`Y${m.beYear}`} stroke={T.good} strokeDasharray="3 3" label={{ value: "break-even", fill: T.good, fontSize: 10, position: "top" }} />}
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div>
                <SecHead T={T}>Sensitivity · what actually moves the answer</SecHead>
                <Tornado s={s} years={years} base={delta} T={T} />
              </div>
            </>
          )}

          {view === "flow" && (
            <>
              <SecHead T={T}>Annual outlay</SecHead>
              <ResponsiveContainer width="100%" height={280}>
                <ComposedChart data={chartData} margin={{ top: 6, right: 10, left: 4, bottom: 0 }}>
                  <CartesianGrid stroke={T.surface2} vertical={false} />
                  <XAxis dataKey="year" stroke={T.textFaint} tick={{ fontSize: 11 }} />
                  <YAxis stroke={T.textFaint} tick={{ fontSize: 11 }} tickFormatter={(v: number) => fmtM(v)} width={58} />
                  <Tooltip contentStyle={tipS} formatter={(v: any) => fmtM(Number(v))} />
                  <Bar dataKey="Buy" fill={T.brass} opacity={0.85} />
                  <Bar dataKey="Build" fill={T.oxide} opacity={0.85} />
                </ComposedChart>
              </ResponsiveContainer>

              <div style={{ height: 26 }} />
              <SecHead T={T}>Build cost composition</SecHead>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 660 }}>
                  <thead><tr style={{ borderBottom: `1px solid ${T.rule}` }}>
                    {["Year", "One-time", "Cloud", "Sustain eng", "AI / tooling", "Compliance", "Legacy overlap", "Total"].map((h) => <th key={h} style={thS}>{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {m.build.map((b) => (
                      <tr key={b.year} style={{ borderBottom: `1px solid ${T.surface2}` }}>
                        <td style={tdS}>Y{b.year}</td>
                        <td style={tdS}>{b.oneTime ? fmtM(b.oneTime) : "—"}</td>
                        <td style={tdS}>{fmtM(b.cloud)}</td>
                        <td style={tdS}>{fmtM(b.sustain)}</td>
                        <td style={tdS}>{fmtM(b.aiRun)}</td>
                        <td style={tdS}>{fmtM(b.comp)}</td>
                        <td style={tdS}>{b.legacy ? fmtM(b.legacy) : "—"}</td>
                        <td style={{ ...tdS, color: T.oxide }}>{fmtM(b.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ height: 26 }} />
              <SecHead T={T}>Incumbent cost composition</SecHead>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 580 }}>
                  <thead><tr style={{ borderBottom: `1px solid ${T.rule}` }}>
                    {["Year", "Licenses", "Add-ons", "Admin FTE", "SI", "ISV", "Total"].map((h) => <th key={h} style={thS}>{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {m.buy.map((b) => (
                      <tr key={b.year} style={{ borderBottom: `1px solid ${T.surface2}` }}>
                        <td style={tdS}>Y{b.year}</td>
                        <td style={tdS}>{fmtM(b.licenses)}</td>
                        <td style={tdS}>{fmtM(b.addons)}</td>
                        <td style={tdS}>{fmtM(b.admin)}</td>
                        <td style={tdS}>{fmtM(b.si)}</td>
                        <td style={tdS}>{fmtM(b.isv)}</td>
                        <td style={{ ...tdS, color: T.brass }}>{fmtM(b.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {view === "risk" && (
            <>
              <SecHead T={T}>Risk load on the build path</SecHead>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={riskData} layout="vertical" margin={{ top: 6, right: 20, left: 140, bottom: 0 }}>
                  <CartesianGrid stroke={T.surface2} horizontal={false} />
                  <XAxis type="number" stroke={T.textFaint} tick={{ fontSize: 11 }} tickFormatter={(v: number) => fmtM(v)} />
                  <YAxis type="category" dataKey="name" stroke={T.textFaint} tick={{ fontSize: 11 }} width={136} />
                  <Tooltip contentStyle={tipS} formatter={(v: any) => fmtM(Number(v))} />
                  <Bar dataKey="value" fill={T.oxide} opacity={0.85} />
                </BarChart>
              </ResponsiveContainer>

              <div style={{ display: "flex", gap: 26, flexWrap: "wrap", marginTop: 22, borderTop: `1px solid ${T.rule}`, paddingTop: 20 }}>
                <Stat T={T} label="Unadjusted build" value={fmtM(m.baseBuildTotal)} />
                <Stat T={T} label="Risk load" value={fmtM(m.riskTotal)} tone={T.warn} sub={`${(m.riskTotal / m.baseBuildTotal * 100).toFixed(0)}% of base`} />
                <Stat T={T} label="Expected build" value={fmtM(m.buildExpected)} tone={T.oxide} />
              </div>

              <div style={{ marginTop: 24, background: T.surface, border: `1px solid ${T.rule}`, padding: 16, fontSize: 12, color: T.textDim, lineHeight: 1.65, borderRadius: 2 }}>
                <strong style={{ color: T.text, fontWeight: 500 }}>Reading the three cases. </strong>
                Optimistic is the unadjusted build cost, which assumes nothing slips. Expected applies
                probability weights to each risk. Pessimistic assumes all of them land. The only honest
                comparison against an incumbent renewal is expected-versus-expected. Note the asymmetry
                this model deliberately leaves in place: incumbent risk is treated as near-zero because
                it is a known quantity at a known price. If your vendor relationship is unstable, or you
                face a forced edition upgrade, add that exposure yourself.
              </div>
            </>
          )}

          {view === "cloud" && (
            <>
              <SecHead T={T}>Provider comparison · same workload</SecHead>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={cloudCompare} margin={{ top: 6, right: 10, left: 4, bottom: 0 }}>
                  <CartesianGrid stroke={T.surface2} vertical={false} />
                  <XAxis dataKey="provider" stroke={T.textFaint} tick={{ fontSize: 12 }} />
                  <YAxis stroke={T.textFaint} tick={{ fontSize: 11 }} tickFormatter={(v: number) => fmtM(v)} width={58} />
                  <Tooltip contentStyle={tipS} formatter={(v: any) => fmtM(Number(v))} />
                  <Bar dataKey="cost">
                    {cloudCompare.map((e, i) => (
                      <Cell key={i} fill={e.provider.toLowerCase() === s.cloudProvider ? T.brass : T.slate} opacity={0.85} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>

              <div style={{ height: 24 }} />
              <SecHead T={T}>Sizing derivation</SecHead>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <tbody>
                  {([
                    ["Total records", fmtN(s.vAccounts + s.vContacts + s.vOpps + s.vActivities)],
                    ["Hot storage estimate", `${fmtN((s.vAccounts + s.vContacts + s.vOpps + s.vActivities) * 2200 * (1 + s.retentionYears * 0.12) / 1e9)} GB`],
                    ["Availability model", s.haMode],
                    ["Regions", `${s.regions}`],
                    ["Non-production environments", `${s.nonProdEnvs} at 40% of prod`],
                    ["Committed-use discount", pct(s.cudDiscount)],
                    ["Year-1 annual cloud spend", fmtM(m.cloudY1)],
                  ] as [string, string][]).map(([k, v]) => (
                    <tr key={k} style={{ borderBottom: `1px solid ${T.surface2}` }}>
                      <td style={{ ...tdS, color: T.textDim }}>{k}</td>
                      <td style={{ ...tdS, textAlign: "right", fontFamily: "ui-monospace, monospace" }}>{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div style={{ marginTop: 22, background: T.surface, border: `1px solid ${T.rule}`, padding: 16, fontSize: 12, color: T.textDim, lineHeight: 1.65, borderRadius: 2 }}>
                List-price deltas between the three providers are small enough that they rarely decide
                anything. What decides it is your negotiated commit, existing enterprise agreements, and
                egress patterns. Treat the spread here as noise and the committed-use discount as the
                real variable.
              </div>
            </>
          )}

          {view === "ledger" && (
            <>
              <SecHead T={T}>Derived figures</SecHead>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, marginBottom: 26 }}>
                <tbody>
                  {([
                    ["Seats modeled (Y1)", fmtN(m.seatsY0)],
                    ["Build-phase FTE", m.buildEngHeads.toFixed(1)],
                    ["Run-phase FTE", m.runEngHeads.toFixed(1)],
                    ["Effective build duration", `${m.effBuildMonths.toFixed(1)} months`],
                    ["Build-phase labor", fmtM(m.buildLabor)],
                    ["Total one-time build cost", fmtM(m.oneTime)],
                    ["Annual sustain engineering", fmtM(m.runTeamAnnual)],
                    ["Year-1 cloud", fmtM(m.cloudY1)],
                    ["Risk load applied", fmtM(m.riskTotal)],
                    [`NPV · buy · ${years}yr @ ${pct(s.discountRate)}`, fmtM(m.npvBuy)],
                    [`NPV · build · ${years}yr @ ${pct(s.discountRate)}`, fmtM(m.npvBuild)],
                  ] as [string, string][]).map(([k, v]) => (
                    <tr key={k} style={{ borderBottom: `1px solid ${T.surface2}` }}>
                      <td style={{ ...tdS, color: T.textDim }}>{k}</td>
                      <td style={{ ...tdS, textAlign: "right", fontFamily: "ui-monospace, monospace" }}>{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <SecHead T={T}>What this model does not price</SecHead>
              <div style={{ fontSize: 12, color: T.textDim, lineHeight: 1.7, marginBottom: 24, maxWidth: 680 }}>
                Roadmap control, elimination of vendor lock-in, the ability to embed proprietary
                go-to-market logic directly in the system of record, and the recruiting effects of owning
                a hard problem. These are real and they are not dollars. Weigh them explicitly beside this
                output rather than smuggling them into a discount rate.
                <br /><br />
                Unpriced on the other side: the incumbent's ecosystem of pre-built integrations, a labor
                market of people who already know the product, and the fact that its failure modes are
                somebody else's problem at 3am.
              </div>
            </>
          )}
        </div>
      )}

      {/* ============ CONFIG ============ */}
      {tab === "config" && (
        <div style={{ padding: "24px 28px 80px", maxWidth: MAX_W, margin: "0 auto" }}>
          <div style={{
            background: T.surface, border: `1px solid ${T.rule}`, borderLeft: `3px solid ${T.slate}`,
            padding: "14px 18px", marginBottom: 30, fontSize: 12, color: T.textDim,
            lineHeight: 1.65, borderRadius: 2, maxWidth: 720,
          }}>
            Hover or tap the <span style={{
              display: "inline-flex", width: 13, height: 13, borderRadius: "50%",
              border: `1px solid ${T.textFaint}`, alignItems: "center", justifyContent: "center",
              fontSize: 9, fontFamily: "ui-monospace, monospace", verticalAlign: "middle",
            }}>?</span> beside any variable for three things: what it means, where the default number came
            from, and what to replace it with from your own organization. Defaults are benchmarks
            assembled from published pricing and common staffing ratios. None of them are measurements
            of your company.
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 30 }}>
            <button onClick={exportJson} style={{
              background: "none", border: `1px solid ${T.brass}`, color: T.brass,
              padding: "9px 18px", fontSize: 12, cursor: "pointer", borderRadius: 2,
              fontFamily: "ui-monospace, monospace", letterSpacing: "0.05em",
            }}>Export assumptions</button>
            <button
              type="button"
              onClick={() => { setImportStatus(null); importInputRef.current?.click(); }}
              style={{
                background: "none", border: `1px solid ${T.rule}`, color: T.textDim,
                padding: "9px 18px", fontSize: 12, cursor: "pointer", borderRadius: 2,
                fontFamily: "ui-monospace, monospace", letterSpacing: "0.05em",
              }}
            >Import assumptions</button>
            <input
              ref={importInputRef}
              type="file"
              accept="application/json"
              onChange={importJson}
              style={{ position: "absolute", width: 1, height: 1, opacity: 0, pointerEvents: "none" }}
            />
            {importStatus === "ok" && (
              <span style={{ fontSize: 12, color: T.good, fontFamily: "ui-monospace, monospace" }}>Imported ✓</span>
            )}
            {importStatus === "error" && (
              <span style={{ fontSize: 12, color: T.warn, fontFamily: "ui-monospace, monospace" }}>Couldn't read that file — expects JSON exported from this tool.</span>
            )}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(310px, 1fr))", gap: "0 44px" }}>
            <div>
              <Group num="01" title="Organization & seats" T={T}
                note="Seat counts drive license cost on the buy path and change-management cost on the build path. Count people who will actually log in, not total headcount.">
                {([["salesAe", "Sales AE + leadership"], ["sdr", "SDR / BDR"], ["se", "Sales engineering"],
                  ["salesOps", "Sales ops / deal desk"], ["cs", "Customer success"], ["ps", "Professional services"],
                  ["support", "Support"], ["pmm", "Product marketing"], ["mktg", "Marketing"],
                  ["readonly", "Finance / exec read-only"]] as [keyof Seats, string][]).map(([k, label]) => (
                  <Field key={k} label={label} k={k} T={T}>
                    <Num T={T} value={s.seats[k]} onChange={(v) => setSeat(k, v)} />
                  </Field>
                ))}
                <Field label="Annual seat growth" k="seatGrowth" T={T}>
                  <Slider T={T} value={s.seatGrowth} onChange={(v) => set("seatGrowth", v)} min={-0.1} max={0.4} step={0.01} display={pct(s.seatGrowth)} />
                </Field>
                <div style={{ fontSize: 11, color: T.brass, fontFamily: "ui-monospace, monospace" }}>
                  Total seats Y1: {fmtN(m.seatsY0)}
                </div>
              </Group>

              <Group num="02" title="Incumbent CRM cost" T={T}
                note="Defaults use published Salesforce list pricing with a 30 percent discount applied. These are placeholders. Every figure here should come off your own order form. The discount slider is where most build-versus-buy arguments are quietly won or lost.">
                <Field label="Sales Cloud / user / month" k="sfSalesCloud" T={T}><Num T={T} value={s.sfSalesCloud} onChange={(v) => set("sfSalesCloud", v)} prefix="$" /></Field>
                <Field label="Service Cloud / user / month" k="sfServiceCloud" T={T}><Num T={T} value={s.sfServiceCloud} onChange={(v) => set("sfServiceCloud", v)} prefix="$" /></Field>
                <Field label="CPQ / user / month" k="sfCpq" T={T}><Num T={T} value={s.sfCpq} onChange={(v) => set("sfCpq", v)} prefix="$" /></Field>
                <Field label="Platform / light / user / month" k="sfPlatform" T={T}><Num T={T} value={s.sfPlatform} onChange={(v) => set("sfPlatform", v)} prefix="$" /></Field>
                <Field label="Negotiated discount" k="sfDiscount" T={T}>
                  <Slider T={T} value={s.sfDiscount} onChange={(v) => set("sfDiscount", v)} min={0} max={0.75} step={0.01} display={pct(s.sfDiscount)} />
                </Field>
                <Field label="Annual renewal uplift" k="sfUplift" T={T}>
                  <Slider T={T} value={s.sfUplift} onChange={(v) => set("sfUplift", v)} min={0} max={0.2} step={0.005} display={pct(s.sfUplift)} />
                </Field>
                <Field label="Add-ons" k="sfAddons" hint="Annual: sandboxes, Shield, Data Cloud, storage" T={T}><Num T={T} value={s.sfAddons} onChange={(v) => set("sfAddons", v)} prefix="$" step={10000} /></Field>
                <Field label="ISV / AppExchange spend" k="sfIsvSpend" hint="Annual" T={T}><Num T={T} value={s.sfIsvSpend} onChange={(v) => set("sfIsvSpend", v)} prefix="$" step={10000} /></Field>
                <Field label="Internal admin / dev FTE" k="sfAdminFte" T={T}><Num T={T} value={s.sfAdminFte} onChange={(v) => set("sfAdminFte", v)} step={0.5} /></Field>
                <Field label="SI / consulting spend" k="sfSiSpend" hint="Annual" T={T}><Num T={T} value={s.sfSiSpend} onChange={(v) => set("sfSiSpend", v)} prefix="$" step={25000} /></Field>
                <Field label="Years locked on current contract" k="sfContractLockYears" hint="Owed regardless of the decision" T={T}><Num T={T} value={s.sfContractLockYears} onChange={(v) => set("sfContractLockYears", v)} suffix="yr" /></Field>
              </Group>

              <Group num="03" title="AI-assisted delivery" T={T}
                note="These two multipliers carry more weight than any other input in the model and have the weakest empirical grounding. Read the calibration note before setting them.">
                <Field label="Build velocity multiplier" k="aiVelocity" T={T}>
                  <Slider T={T} value={s.aiVelocity} onChange={(v) => set("aiVelocity", v)} min={1} max={5} step={0.1} display={`${s.aiVelocity.toFixed(1)}×`} />
                </Field>
                <Field label="Sustain productivity lift" k="aiSustainLift" T={T}>
                  <Slider T={T} value={s.aiSustainLift} onChange={(v) => set("aiSustainLift", v)} min={1} max={3} step={0.05} display={`${s.aiSustainLift.toFixed(2)}×`} />
                </Field>
                <Field label="AI tooling / engineer / year" k="aiSeatCost" T={T}><Num T={T} value={s.aiSeatCost} onChange={(v) => set("aiSeatCost", v)} prefix="$" step={100} /></Field>
                <Field label="In-product inference" k="aiInference" hint="Annual" T={T}><Num T={T} value={s.aiInference} onChange={(v) => set("aiInference", v)} prefix="$" step={10000} /></Field>

                <div style={{ background: T.surface, border: `1px solid ${T.rule}`, padding: 14, borderRadius: 2, fontSize: 11.5, lineHeight: 1.6, color: T.textDim }}>
                  <div style={{ color: T.text, fontWeight: 500, marginBottom: 9 }}>Calibrating the velocity multiplier</div>
                  <div style={{ marginBottom: 8 }}>
                    <span style={{ color: T.brass, fontFamily: "ui-monospace, monospace" }}>1.2 to 1.5×</span> — Assistance on well-specified code. Realistic where requirements are ambiguous, integrations are legacy, and review cycles are heavy.
                  </div>
                  <div style={{ marginBottom: 8 }}>
                    <span style={{ color: T.brass, fontFamily: "ui-monospace, monospace" }}>2 to 2.5×</span> — Agentic tooling with a strong test harness and an experienced team. Defensible for greenfield CRUD, UI, and API surface area.
                  </div>
                  <div style={{ marginBottom: 8 }}>
                    <span style={{ color: T.brass, fontFamily: "ui-monospace, monospace" }}>3× and above</span> — Aggressive. Assumes AI compresses not just implementation but requirements discovery, integration debugging, security review, and migration validation. Those phases consume most of the schedule on enterprise systems and are the least automatable.
                  </div>
                  <div style={{ color: T.warn, marginTop: 10 }}>
                    Nominal {s.buildMonths} months becomes {m.effBuildMonths.toFixed(1)} effective months at {s.aiVelocity.toFixed(1)}×.
                    If that looks implausible for CPQ approval logic and forecast rollups, it probably is.
                  </div>
                </div>
              </Group>
            </div>

            <div>
              <Group num="04" title="Build team" T={T}
                note="Build column is peak headcount during construction. Run column is steady state after launch. Base is annual salary before the loaded-cost multiplier.">
                <div style={{ display: "grid", gridTemplateColumns: "1fr 46px 46px 74px", gap: 5, fontSize: 9, color: T.textFaint, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 7, fontFamily: "ui-monospace, monospace" }}>
                  <div>Role</div><div>Build</div><div>Run</div><div>Base</div>
                </div>
                {s.team.map((t) => (
                  <div key={t.id} style={{ display: "grid", gridTemplateColumns: "1fr 46px 46px 74px", gap: 5, marginBottom: 5, alignItems: "center" }}>
                    <div style={{ fontSize: 11, color: T.textDim }}>{t.label}</div>
                    <input type="number" step={0.5} value={t.b} onChange={(e) => setTeam(t.id, "b", parseFloat(e.target.value) || 0)} style={{ ...inputS(T), padding: "4px 5px", fontSize: 11 }} />
                    <input type="number" step={0.5} value={t.r} onChange={(e) => setTeam(t.id, "r", parseFloat(e.target.value) || 0)} style={{ ...inputS(T), padding: "4px 5px", fontSize: 11 }} />
                    <input type="number" step={5000} value={t.base} onChange={(e) => setTeam(t.id, "base", parseFloat(e.target.value) || 0)} style={{ ...inputS(T), padding: "4px 5px", fontSize: 11 }} />
                  </div>
                ))}
                <div style={{ height: 14 }} />
                <Field label="Loaded cost multiplier" k="loadMult" T={T}>
                  <Slider T={T} value={s.loadMult} onChange={(v) => set("loadMult", v)} min={1} max={1.8} step={0.01} display={`${s.loadMult.toFixed(2)}×`} />
                </Field>
                <Field label="Geographic blend" k="geoBlend" T={T}>
                  <Slider T={T} value={s.geoBlend} onChange={(v) => set("geoBlend", v)} min={0.4} max={1.2} step={0.01} display={`${s.geoBlend.toFixed(2)}×`} />
                </Field>
                <Field label="Nominal build duration" k="buildMonths" T={T}><Num T={T} value={s.buildMonths} onChange={(v) => set("buildMonths", v)} suffix="mo" /></Field>
                <Field label="Parallel-run overlap" k="parallelMonths" T={T}><Num T={T} value={s.parallelMonths} onChange={(v) => set("parallelMonths", v)} suffix="mo" /></Field>
              </Group>

              <Group num="05" title="One-time build costs" T={T}
                note="Costs incurred once, during construction and cutover. Compliance certification is the most commonly underestimated line here.">
                <Field label="Data migration" k="migration" T={T}><Num T={T} value={s.migration} onChange={(v) => set("migration", v)} prefix="$" step={25000} /></Field>
                <Field label="Integration count" k="integrations" T={T}><Num T={T} value={s.integrations} onChange={(v) => set("integrations", v)} /></Field>
                <Field label="Cost per integration" k="integrationCost" T={T}><Num T={T} value={s.integrationCost} onChange={(v) => set("integrationCost", v)} prefix="$" step={10000} /></Field>
                <Field label="Security architecture & pen test" k="pentest" T={T}><Num T={T} value={s.pentest} onChange={(v) => set("pentest", v)} prefix="$" step={10000} /></Field>
                <Field label="SOC 2 Type II readiness + audit" k="soc2Setup" T={T}><Num T={T} value={s.soc2Setup} onChange={(v) => set("soc2Setup", v)} prefix="$" step={10000} /></Field>
                <Field label="ISO 27001 certification" k="isoSetup" T={T}><Num T={T} value={s.isoSetup} onChange={(v) => set("isoSetup", v)} prefix="$" step={10000} /></Field>
                <Field label="GDPR / EU residency architecture" k="gdprArch" T={T}><Num T={T} value={s.gdprArch} onChange={(v) => set("gdprArch", v)} prefix="$" step={10000} /></Field>
                <Field label="Change management per seat" k="changeMgmtPerSeat" T={T}><Num T={T} value={s.changeMgmtPerSeat} onChange={(v) => set("changeMgmtPerSeat", v)} prefix="$" step={25} /></Field>
              </Group>

              <Group num="06" title="Cloud & data volume" T={T}
                note="Infrastructure sizing derives from record counts and seat concurrency rather than a flat estimate. Activity volume usually dominates storage.">
                <Field label="Provider" k="cloudProvider" T={T}>
                  <span style={{ display: "flex", gap: 5 }}>
                    {(["gcp", "aws", "azure"] as CloudProvider[]).map((p) => (
                      <button key={p} type="button" onClick={(e) => { e.preventDefault(); set("cloudProvider", p); }} style={{
                        flex: 1, background: s.cloudProvider === p ? T.surface2 : "none",
                        border: `1px solid ${s.cloudProvider === p ? T.brass : T.rule}`,
                        color: s.cloudProvider === p ? T.brass : T.textDim,
                        padding: "6px 0", fontSize: 11, cursor: "pointer", borderRadius: 2,
                        fontFamily: "ui-monospace, monospace", textTransform: "uppercase",
                      }}>{p}</button>
                    ))}
                  </span>
                </Field>
                <Field label="Availability model" k="haMode" T={T}>
                  <span style={{ display: "flex", gap: 5 }}>
                    {(["active-active", "active-passive"] as HaMode[]).map((h) => (
                      <button key={h} type="button" onClick={(e) => { e.preventDefault(); set("haMode", h); }} style={{
                        flex: 1, background: s.haMode === h ? T.surface2 : "none",
                        border: `1px solid ${s.haMode === h ? T.brass : T.rule}`,
                        color: s.haMode === h ? T.brass : T.textDim,
                        padding: "6px 0", fontSize: 10, cursor: "pointer", borderRadius: 2,
                        fontFamily: "ui-monospace, monospace",
                      }}>{h}</button>
                    ))}
                  </span>
                </Field>
                <Field label="Regions" k="regions" T={T}><Num T={T} value={s.regions} onChange={(v) => set("regions", v)} /></Field>
                <Field label="Committed-use discount" k="cudDiscount" T={T}>
                  <Slider T={T} value={s.cudDiscount} onChange={(v) => set("cudDiscount", v)} min={0} max={0.6} step={0.01} display={pct(s.cudDiscount)} />
                </Field>
                <Field label="Non-production environments" k="nonProdEnvs" T={T}><Num T={T} value={s.nonProdEnvs} onChange={(v) => set("nonProdEnvs", v)} /></Field>
                <Field label="Accounts" k="vAccounts" T={T}><Num T={T} value={s.vAccounts} onChange={(v) => set("vAccounts", v)} step={10000} /></Field>
                <Field label="Contacts" k="vContacts" T={T}><Num T={T} value={s.vContacts} onChange={(v) => set("vContacts", v)} step={50000} /></Field>
                <Field label="Opportunities" k="vOpps" T={T}><Num T={T} value={s.vOpps} onChange={(v) => set("vOpps", v)} step={25000} /></Field>
                <Field label="Activities" k="vActivities" T={T}><Num T={T} value={s.vActivities} onChange={(v) => set("vActivities", v)} step={1000000} /></Field>
                <Field label="History retention" k="retentionYears" T={T}><Num T={T} value={s.retentionYears} onChange={(v) => set("retentionYears", v)} suffix="yr" /></Field>
                <Field label="Observability & tooling" k="observability" hint="Annual" T={T}><Num T={T} value={s.observability} onChange={(v) => set("observability", v)} prefix="$" step={10000} /></Field>
                <Field label="Recurring compliance" k="complianceAnnual" hint="Annual" T={T}><Num T={T} value={s.complianceAnnual} onChange={(v) => set("complianceAnnual", v)} prefix="$" step={10000} /></Field>
                <Field label="Tech debt reserve" k="techDebtPct" T={T}>
                  <Slider T={T} value={s.techDebtPct} onChange={(v) => set("techDebtPct", v)} min={0} max={0.4} step={0.01} display={pct(s.techDebtPct)} />
                </Field>
              </Group>

              <Group num="07" title="Risk adjustment" T={T}
                note="Applied to the build path only. The incumbent path is treated as a known quantity at a known price, which is a real asymmetry worth naming out loud when you present this.">
                <Field label="Schedule overrun factor" k="rSchedule" T={T}>
                  <Slider T={T} value={s.rSchedule} onChange={(v) => set("rSchedule", v)} min={1} max={3} step={0.05} display={`${s.rSchedule.toFixed(2)}×`} />
                </Field>
                <Field label="Cost overrun factor" k="rCost" T={T}>
                  <Slider T={T} value={s.rCost} onChange={(v) => set("rCost", v)} min={1} max={2.5} step={0.05} display={`${s.rCost.toFixed(2)}×`} />
                </Field>
                <Field label="Late feature gap reserve" k="rFeatureGap" T={T}>
                  <Slider T={T} value={s.rFeatureGap} onChange={(v) => set("rFeatureGap", v)} min={0} max={0.5} step={0.01} display={pct(s.rFeatureGap)} />
                </Field>
                <Field label="Partial failure probability" k="rPartialFail" T={T}>
                  <Slider T={T} value={s.rPartialFail} onChange={(v) => set("rPartialFail", v)} min={0} max={0.6} step={0.01} display={pct(s.rPartialFail)} />
                </Field>
                <Field label="Full failure probability" k="rFullFail" T={T}>
                  <Slider T={T} value={s.rFullFail} onChange={(v) => set("rFullFail", v)} min={0} max={0.4} step={0.01} display={pct(s.rFullFail)} />
                </Field>
                <Field label="Annual eng attrition" k="rAttrition" T={T}>
                  <Slider T={T} value={s.rAttrition} onChange={(v) => set("rAttrition", v)} min={0} max={0.4} step={0.01} display={pct(s.rAttrition)} />
                </Field>
                <Field label="Cutover productivity dip" k="rProductivityDip" T={T}>
                  <Slider T={T} value={s.rProductivityDip} onChange={(v) => set("rProductivityDip", v)} min={0} max={0.2} step={0.005} display={pct(s.rProductivityDip)} />
                </Field>
                <Field label="Annual revenue" k="rRevenue" T={T}><Num T={T} value={s.rRevenue} onChange={(v) => set("rRevenue", v)} prefix="$" step={10000000} /></Field>
                <Field label="Compliance delay probability" k="rComplianceDelay" T={T}>
                  <Slider T={T} value={s.rComplianceDelay} onChange={(v) => set("rComplianceDelay", v)} min={0} max={0.7} step={0.01} display={pct(s.rComplianceDelay)} />
                </Field>
                <Field label="Discount rate" k="discountRate" hint="For NPV" T={T}>
                  <Slider T={T} value={s.discountRate} onChange={(v) => set("discountRate", v)} min={0} max={0.25} step={0.005} display={pct(s.discountRate)} />
                </Field>
              </Group>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   TORNADO
   ============================================================ */
function Tornado({ s, years, base, T }: { s: Assumptions; years: number; base: number; T: ThemeColors }) {
  const vars: { key: keyof Assumptions; label: string; lo: number; hi: number }[] = [
    { key: "aiVelocity", label: "AI build velocity", lo: 1.3, hi: 3.5 },
    { key: "sfDiscount", label: "Incumbent discount", lo: 0.1, hi: 0.6 },
    { key: "buildMonths", label: "Build duration", lo: 10, hi: 30 },
    { key: "loadMult", label: "Loaded cost multiplier", lo: 1.15, hi: 1.55 },
    { key: "seatGrowth", label: "Seat growth", lo: 0, hi: 0.25 },
    { key: "geoBlend", label: "Geographic blend", lo: 0.5, hi: 1.15 },
    { key: "sfUplift", label: "Renewal uplift", lo: 0.02, hi: 0.15 },
    { key: "aiSustainLift", label: "Sustain productivity lift", lo: 1.05, hi: 2.4 },
  ];

  const rows = vars.map((v) => {
    const lo = runModel({ ...s, [v.key]: v.lo }, years);
    const hi = runModel({ ...s, [v.key]: v.hi }, years);
    const dLo = lo.buildExpected - lo.baseBuyTotal;
    const dHi = hi.buildExpected - hi.baseBuyTotal;
    return { label: v.label, swing: Math.abs(dHi - dLo), lo: dLo - base, hi: dHi - base };
  }).sort((a, b) => b.swing - a.swing);

  const max = Math.max(...rows.map((r) => Math.max(Math.abs(r.lo), Math.abs(r.hi)))) || 1;

  return (
    <div>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        fontSize: 10, fontFamily: "ui-monospace, monospace", letterSpacing: "0.06em",
        textTransform: "uppercase", marginBottom: 12,
      }}>
        <span style={{ color: T.oxide }}>← Favors building</span>
        <span style={{ color: T.textFaint }}>Current scenario</span>
        <span style={{ color: T.brass }}>Favors buying →</span>
      </div>
      {rows.map((r) => {
        const wLo = (Math.abs(r.lo) / max) * 48;
        const wHi = (Math.abs(r.hi) / max) * 48;
        return (
          <div key={r.label} style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: T.textDim, marginBottom: 3 }}>
              <span>{r.label}</span>
              <span style={{ color: T.textFaint, fontFamily: "ui-monospace, monospace" }}>{fmtM(r.swing)} range</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", height: 15 }}>
              <div style={{ width: "50%", display: "flex", justifyContent: "flex-end" }}>
                <div style={{ width: `${r.lo < 0 ? wLo : 0}%`, height: 13, background: T.oxide, opacity: 0.75 }} />
                <div style={{ width: `${r.hi < 0 ? wHi : 0}%`, height: 13, background: T.oxide, opacity: 0.75 }} />
              </div>
              <div style={{ width: 2, height: 19, background: T.textFaint }} />
              <div style={{ width: "50%", display: "flex" }}>
                <div style={{ width: `${r.lo > 0 ? wLo : 0}%`, height: 13, background: T.brass, opacity: 0.75 }} />
                <div style={{ width: `${r.hi > 0 ? wHi : 0}%`, height: 13, background: T.brass, opacity: 0.75 }} />
              </div>
            </div>
          </div>
        );
      })}
      <div style={{ fontSize: 11, color: T.textFaint, marginTop: 12, lineHeight: 1.6, maxWidth: 640 }}>
        Each bar shows how far today's answer would move if that one input, alone, swung to the low or
        high end of its plausible range. Longer bar means more leverage over the decision — the top two
        or three are the only ones worth arguing about.
      </div>
    </div>
  );
}
