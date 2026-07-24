# CRM Build vs Buy TCO Model — Specification

**Version 1.0** · Last updated July 2026

This document specifies the model implemented in `src/App.tsx`. It is written for two audiences: someone deciding whether to trust the tool's output, and someone modifying or forking it.

---

## 1. Purpose and scope

### 1.1 What the tool does

Compares two paths over 3, 5, and 7 year horizons:

- **Buy** — continue on a commercial CRM with normal license growth, renewal uplift, and the admin and integrator overhead that sits on top of license cost.
- **Build** — replace it with an internally owned, AI-assisted build covering core CRM, support, forecasting, and CPQ.

Output is a decision artifact for executives and boards. It doubles as renewal negotiation leverage, but that is a side effect rather than the design goal.

### 1.2 Functional scope of the modeled system

Feature parity is explicitly not the target. The build is scoped to:

| Domain | In scope | Out of scope |
|---|---|---|
| Core CRM | Accounts, contacts, leads, opportunities, activities, territories, pipeline stages, custom fields and objects | Marketing automation |
| Support | Case management, queues and routing, SLA timers, knowledge base, customer portal | Field service, telephony beyond integration |
| Forecasting | Hierarchy rollups, multi-category (commit / best case / pipeline), quota management, historical snapshots and accuracy | Advanced predictive scoring |
| CPQ | Product catalog, price books, discount approval workflows, quote generation, contract and renewal records | Revenue recognition (belongs in the financial system) |
| Cross-cutting | Reporting and dashboards, audit trail, role and field-level security, mobile (iOS and Android), sandbox environments | — |

**Integration surface:** financial system (bidirectional), SSO and identity provider, email and calendar, data warehouse, marketing automation, support telephony, e-signature.

**Compliance obligations:** SOC 2 Type II, ISO 27001, GDPR with EU data residency.

**Availability:** multi-region, 24x7 global.

### 1.3 Deliberate exclusions

No hybrid path is modeled. The tool compares full replacement against full retention. A hybrid ("keep the incumbent as system of record, build differentiated layers on top") is frequently the answer that actually wins in practice, but modeling it well requires organization-specific assumptions about which layers move, and a poorly-modeled hybrid is worse than no hybrid.

---

## 2. Model architecture

### 2.1 Seat model

Ten configurable segments, each with a Y1 count and a shared compound growth rate.

| Segment | Default | License mapping |
|---|---|---|
| Sales AE + leadership | 200 | Full + CPQ |
| SDR / BDR | 80 | Full |
| Sales engineering | 50 | Full + CPQ |
| Sales ops / deal desk | 40 | Full + CPQ |
| Customer success | 150 | Full |
| Professional services | 75 | Light |
| Support | 110 | Service |
| Product marketing | 18 | Light |
| Marketing | 100 | Light |
| Finance / exec read-only | 60 | Read-only (unpriced) |
| **Total** | **883** | |

Growth applies uniformly: `seats(y) = seats(0) × (1 + g)^y`. Default growth is 8%.

Note that CPQ seats overlap with full seats rather than being additive — AEs, sales ops, and SEs are counted in both the full-license and CPQ-license buckets, which matches how these products are actually licensed.

### 2.2 Buy path cost model

For each year `y`:

```
uplift    = (1 + upliftRate)^y
disc      = 1 − discountRate

licenses  = [ full × salesCloudPrice × 12 × disc
            + service × serviceCloudPrice × 12 × disc
            + cpq × cpqPrice × 12 × disc
            + light × platformPrice × 12 × disc ] × uplift

addons    = addonSpend × uplift
admin     = adminFTE × loaded(180000) × 1.04^y
si        = siSpend × 1.04^y
isv       = isvSpend × uplift

total     = licenses + addons + admin + si + isv
```

License prices, discount, and uplift are all inputs. Admin and SI inflate at 4% annually (labor inflation) rather than at the vendor uplift rate.

**Defaults:** Sales Cloud $165/user/mo, Service Cloud $165, CPQ $75, platform $25, discount 30%, uplift 7%, add-ons $450K, ISV $350K, admin 8 FTE, SI $600K.

These come from published vendor list pricing and typical staffing ratios. They are not measurements of any specific company and the UI says so.

### 2.3 Build path cost model

**Effective duration.** The AI velocity multiplier compresses nominal build duration:

```
effectiveMonths = nominalMonths / velocityMultiplier
```

Default: 18 nominal months ÷ 2.2 = 8.2 effective months.

**One-time costs.**

```
buildLabor    = Σ(buildFTE × loadedCost) × (effectiveMonths / 12)
oneTime       = buildLabor
              + migration
              + integrationCount × integrationCost
              + pentest + soc2 + iso27001 + gdprArchitecture
              + changeMgmtPerSeat × seatsY0
              + buildFTE × aiSeatCost × (effectiveMonths / 12)
```

One-time cost is distributed across build years proportional to the fraction of the build occurring in each year.

**Recurring costs**, beginning when the system goes live:

```
sustain  = Σ(runFTE × loadedCost) / sustainLift × 1.04^y
cloud    = cloudAnnual × seatScale × 1.06^y     (45% during build)
obs      = observability × seatScale            (50% during build)
comp     = complianceAnnual                     (50% in year 1)
aiRun    = inference × seatScale + runFTE × aiSeatCost
debt     = (sustain + cloud) × techDebtReserve
```

**Legacy overlap.** Three separate charges keep the build path honest:

- **Pre-cutover** — full incumbent cost for every year before cutover
- **Parallel run** — incumbent cost × (parallelMonths / 12) in the cutover year
- **Contract lock** — incumbent cost for any locked years remaining after cutover

The last is important and frequently omitted elsewhere. If you have two years left on a commit, you owe that money regardless of what you build.

### 2.4 Loaded cost

```
loadedCost = baseSalary × loadMultiplier × geoBlend
```

Default multiplier 1.32 (benefits, taxes, equity, facilities). Geo blend defaults to 1.0 for a US hub; 0.55 approximates heavy offshore staffing.

**Default team:**

| Role | Build FTE | Run FTE | Base |
|---|---|---|---|
| Eng lead / architect | 2 | 1 | $260K |
| Backend engineers | 9 | 5 | $205K |
| Frontend engineers | 4 | 2.5 | $195K |
| Mobile engineers | 3 | 1.5 | $200K |
| Data / integration eng | 3 | 2 | $210K |
| SRE / platform | 3 | 4 | $215K |
| Security engineer | 1 | 1.5 | $225K |
| QA / test automation | 3 | 2 | $165K |
| Product manager | 2 | 1 | $230K |
| Designer | 2 | 0.5 | $190K |
| Compliance / GRC | 0.5 | 1 | $175K |
| Internal support / admin | 1 | 3 | $130K |
| **Total** | **33.5** | **25** | |

SRE run headcount exceeds build headcount because 24x7 global coverage requires it. Internal support scales up post-launch because 880 users need somewhere to file tickets.

### 2.5 Cloud sizing

Derived from record counts and seat concurrency rather than a flat estimate.

```
records   = accounts + contacts + opportunities + activities
gbHot     = records × 2200 bytes × (1 + retentionYears × 0.12) / 1e9
gbBackup  = gbHot × 2.5
vcpu      = max(24, ceil((seats × 0.35) / 40) × 8)

haMult      = 1.9 (active-active) | 1.35 (active-passive)
regionMult  = 1 + (regions − 1) × 0.55

compute   = vcpu × vcpuRate × haMult × regionMult
database  = gbHot × dbRate × 12 × haMult × regionMult
storage   = (gbHot + gbBackup) × storageRate × 12 × regionMult
egress    = (seats × 900 + records × 0.004) × egressRate × 12
fixed     = (loadBalancer + search + kms) × regionMult

prod      = compute + database + storage + egress + fixed
nonProd   = prod × 0.40 × environmentCount
annual    = (prod + nonProd) × (1 − committedUseDiscount)
```

Assumptions embedded here: 2.2KB average per record including indexes, 35% peak seat concurrency, one vCPU per 40 concurrent users, each non-production environment at 40% of production.

**Provider rates** (annual per unit, approximating published on-demand pricing):

| | vCPU | DB /GB/mo | Storage /GB/mo | Egress /GB | LB | Search | KMS |
|---|---|---|---|---|---|---|---|
| GCP | $620 | $2.90 | $0.26 | $0.11 | $26K | $78K | $14K |
| AWS | $665 | $3.10 | $0.28 | $0.09 | $31K | $92K | $16K |
| Azure | $640 | $3.00 | $0.25 | $0.10 | $28K | $85K | $15K |

The tool states in the UI that these spreads are noise relative to negotiated commit rates.

**Default volumes:** 100K accounts, 500K contacts, 200K opportunities, 10M activities, 7-year retention.

Activities dominate. At default settings they represent roughly 93% of record volume and therefore most of the storage cost.

### 2.6 Risk model

Eight risks, all applied to the build path only:

| Risk | Formula | Default |
|---|---|---|
| Schedule overrun | `buildLabor × (factor − 1)` | 1.6× |
| Cost overrun | `(oneTime − buildLabor) × (factor − 1)` | 1.4× |
| Late feature gaps | `oneTime × reserve` | 20% |
| Key-person attrition | `sustainAnnual × rate × 0.5 × years` | 15%/yr |
| Cutover productivity dip | `revenue × dip × 0.5` | 5% |
| Compliance delay | `(soc2 + iso) × probability × 0.6` | 30% |
| Partial failure | `p × (oneTime × 0.6 + buyTotal × 0.15)` | 25% |
| Full failure | `p × (oneTime + buyTotal × 0.25)` | 10% |

Total risk load is added to the unadjusted build total to produce the expected build cost. For break-even calculation it is spread evenly across years.

**The asymmetry is deliberate and disclosed.** The incumbent path carries no risk load in this model, on the reasoning that it is a known quantity at a known price. This is defensible but not neutral, and the UI says so in the risk view. Users facing an unstable vendor relationship or a forced edition upgrade should add that exposure themselves.

### 2.7 NPV

```
NPV = Σ (yearTotal / (1 + discountRate)^yearIndex)
```

Applied to both paths at a configurable rate, default 10%. Risk load on the build path is discounted at the horizon midpoint rather than year zero, since risks materialize over time rather than all at once.

NPV systematically disadvantages the build path relative to raw totals, because build spend is front-loaded. When raw totals favor building but NPV does not, the build case depends on ignoring the time value of the cash it consumes up front.

### 2.8 Break-even

Cumulative expected build cost is compared against cumulative buy cost year by year. Break-even is the first year where cumulative build falls at or below cumulative buy. Returns null if no crossover occurs within the horizon.

### 2.9 Sensitivity analysis

The tornado chart re-runs the full model at the low and high end of eight variables, holding everything else constant, and measures how far the buy-versus-build delta moves.

| Variable | Low | High |
|---|---|---|
| AI build velocity | 1.3× | 3.5× |
| Incumbent discount | 10% | 60% |
| Build duration | 10 mo | 30 mo |
| Loaded cost multiplier | 1.15× | 1.55× |
| Seat growth | 0% | 25% |
| Geographic blend | 0.50× | 1.15× |
| Renewal uplift | 2% | 15% |
| Sustain productivity lift | 1.05× | 2.4× |

Sorted by swing magnitude. At default settings AI velocity and incumbent discount consistently rank first and second, which is the tool's central finding: the decision turns on one input with no empirical grounding and one input the user can read off an invoice.

---

## 3. Interface specification

### 3.1 Structure

Two primary tabs.

**Output** — five views:

1. *Summary* — horizon comparison table (3/5/7 side by side), cumulative cost line chart with break-even marker, sensitivity tornado
2. *Cash flow* — annual outlay bar chart, build cost composition table, incumbent cost composition table
3. *Risk* — horizontal risk waterfall, three-case summary, explanatory note on reading optimistic vs expected vs pessimistic
4. *Cloud* — three-provider comparison, sizing derivation table, note on negotiated rates
5. *Ledger* — derived figures, unpriced considerations on both sides, JSON export and import

**Configuration and definitions** — seven grouped sections, every input with a tooltip.

### 3.2 Persistent elements

Above both tabs:

- **Horizon selector** — 3 / 5 / 7 years
- **Presets** — conservative, base, aggressive (adjust AI multipliers, risk factors, build duration, tech debt reserve together)
- **Theme toggle** — dark and light

Below the headline on the Output tab:

- **Calibration panel** — modeled Y1 incumbent spend, all-in per seat, licenses-only per seat, compared against a reported real-world reference point (~1,500 employees, ~$400M revenue, ~$2M/yr Salesforce spend, roughly $2,300 per CRM seat all-in)

### 3.3 Variable documentation

Every input carries a tooltip with three fields:

- **Definition** — what the variable means in plain terms
- **Default source** — where the number came from and its confidence level
- **Replace it with** — what to substitute from your own organization, and where to find it

Roughly 55 variables are documented this way. This is the tool's primary defense against misuse: a reader can see that the AI velocity default is a judgment call while the seat counts are staffing ratios and the license prices are published list.

### 3.4 Design system

Dark and light palettes sharing structural logic. Brass consistently marks the incumbent path, oxide marks the build path, in both modes. Monospace for all numeric and label content, sans-serif for prose. No border radius above 3px. Charts inherit theme colors.

The signature element is the tornado rendered as a split-center bar rather than a conventional horizontal chart, so direction of influence reads instantly.

### 3.5 Persistence and state

All state is client-side React. No backend, no browser storage, no environment variables. Assumptions round-trip through JSON export and import.

**Known gap:** no scenario save-and-compare and no URL-encoded state. Both are candidates for v2 given the tool is meant for distribution.

---

## 4. Known limitations

1. **The AI velocity multiplier has no empirical foundation.** It is the highest-leverage input in the model and rests on judgment. The tool exposes it as a slider with a calibration guide rather than hiding it, but exposure is not validation.

2. **Risk applies only to the build path.** Disclosed in the UI, but a hostile reviewer will and should raise it.

3. **No opportunity cost of diverted engineering.** The model assumes net-new hires. If build FTEs come from existing product teams, the real cost includes lost roadmap, which is unmodeled.

4. **No hybrid path.** Full replacement or full retention only.

5. **Cloud sizing is approximate.** Reasonable for order-of-magnitude comparison, not a substitute for a real capacity plan. No data tiering is assumed, which likely overstates storage cost for organizations that archive.

6. **Seat growth applies uniformly.** Real organizations grow support and sales at different rates.

7. **Defaults are benchmarks, not measurements.** Stated repeatedly in the UI, but worth restating: nobody should present this output without first replacing the incumbent cost inputs with figures from their actual order form.

---

## 5. Technical implementation

**Stack:** React 18+, Recharts. Single self-contained component file, roughly 1,400 lines.

**Deployment:** Vite or Next.js scaffold, drop in the component, render as root. No configuration beyond framework preset. Deploys to Vercel without environment variables.

**Adapting to another vendor:** the cost taxonomy (per-seat licenses by type, add-ons, ISV ecosystem, internal admin, SI spend) applies to any enterprise SaaS platform. Change the license labels in the configuration section and the corresponding keys in the defaults object.

**Extension points:** the `DICT` object holds all variable documentation and is the first place to edit when adding inputs. `runModel()` is pure and takes the full assumption set plus a horizon, which makes it straightforward to add scenario comparison or Monte Carlo simulation on top.

---

## 6. What the model does not price

Roadmap control. Elimination of vendor lock-in. The ability to embed proprietary go-to-market logic directly in the system of record. Recruiting and morale effects, in both directions.

On the incumbent side: a mature ecosystem of pre-built integrations. A labor market of people who already know the product. The fact that its failure modes are somebody else's problem at 3am.

These belong in the discussion beside the numbers, not smuggled into a discount rate.
