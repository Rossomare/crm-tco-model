# CRM Build vs Buy · Total Cost of Ownership Model

An open, auditable model for evaluating whether to replace a commercial CRM (Salesforce, HubSpot, Dynamics) with an internally owned, AI-assisted build.

Every assumption is editable. Every derived figure traces to an input. Nothing is hidden in a black box.

## Why this exists

Most build-versus-buy analyses are advocacy documents wearing a spreadsheet costume. They either omit the risk load on the build path, or omit the admin staff, add-ons, and SI spend that sit on top of incumbent license cost. This model makes both sides visible and lets the reader disagree with any number.

The tool takes a deliberate position: the AI productivity multiplier is the single most load-bearing and least empirically grounded input in any modern build case, so it is exposed as an explicit slider with a calibration guide rather than buried in an optimistic estimate.

## What it models

**Buy path** — per-seat licenses by type, negotiated discount, annual renewal uplift, add-ons (sandboxes, encryption, data platform, storage), ISV and AppExchange spend, internal admin headcount, and system integrator spend.

**Build path** — build-phase engineering labor compressed by an AI velocity multiplier, data migration, per-integration build cost, security architecture and penetration testing, SOC 2 Type II, ISO 27001, GDPR and EU data residency, change management per seat, then recurring cloud infrastructure, sustain engineering, observability, recurring compliance, in-product inference, and a tech debt reserve.

**Risk adjustment** — schedule overrun, cost overrun, late feature gaps, key-person attrition, cutover productivity dip, compliance delay, and probability-weighted partial and full failure. Applied to the build path only, which is a deliberate asymmetry the tool states plainly.

**Cloud sizing** — derived from record counts and seat concurrency rather than a flat guess. Compares GCP, AWS, and Azure on the same workload profile, with multi-region and availability-model multipliers.

## Structure

Two tabs.

**Output** — headline comparison across 3, 5, and 7 years; a calibration panel that sanity-checks modeled incumbent spend against a real-world reference point; cumulative cost crossover; annual cash flow with full cost composition tables for both paths; a risk waterfall; cloud provider comparison; and a derived-figures ledger with JSON export and import.

**Configuration and definitions** — every input, grouped into seven sections. Each variable carries a tooltip with three things: what it means, where the default number came from, and what to replace it with from your own organization.

## Defaults and their provenance

Defaults are benchmarks assembled from published vendor list pricing and common staffing ratios for a B2B software company of roughly 1,500 employees. **They are not measurements of any specific company.** The tool says so in several places on purpose.

Seat defaults model roughly 880 CRM-eligible users. Record volume defaults to 100K accounts, 500K contacts, 200K opportunities, and 10M activities.

For calibration, the tool surfaces a reported reference point: a company of similar size and revenue paying approximately $2M per year in total Salesforce spend, or roughly $2,300 per CRM seat all-in. If your modeled figure diverges sharply from your own invoice, adjust the discount slider before trusting anything downstream.

## Running locally

```bash
npm install
npm run dev
```

Requires React 18+ and Recharts.

```bash
npm install react react-dom recharts
```

## Deploying to Vercel

The component is a single self-contained file with no backend, no environment variables, and no persistence. All state lives in React.

1. Scaffold a Vite or Next.js app
2. Drop `crm-tco-model.jsx` into your components directory
3. Import and render it as your root page
4. Push to GitHub and import the repo in Vercel

No configuration required beyond the framework preset.

## Adapting it to another vendor

The model is written against Salesforce terminology but the structure is vendor-neutral. To adapt it, change the license-type labels in the configuration section and the corresponding keys in the defaults object. The cost taxonomy (per-seat licenses, add-ons, ISV ecosystem, internal admin, SI spend) applies to any enterprise SaaS platform.

## What it deliberately does not price

Roadmap control, elimination of vendor lock-in, the ability to embed proprietary go-to-market logic in the system of record, and the recruiting effects of owning a hard problem. On the other side: the incumbent's pre-built integration ecosystem, a labor market of people who already know the product, and the fact that its failure modes are somebody else's problem at 3am.

These belong in the discussion, not in the discount rate.

## Contributing

The highest-value contributions are better-grounded defaults. If you have real data on AI-assisted delivery velocity for enterprise systems, compliance certification costs, or migration effort at scale, open an issue. The velocity multiplier in particular deserves better evidence than currently exists anywhere.

## License

MIT
