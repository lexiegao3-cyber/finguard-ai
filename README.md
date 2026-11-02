# FinGuard AI

A financial disclosure research web application associated with the Wharton Forensic Analytics Lab project.

**Status:** deployed portfolio MVP. The feature list below describes the current implementation; planned capabilities are listed separately.

## Features

- Calculate Benford first-digit distributions and mean absolute deviation (MAD).
- Compare observed digit frequencies with the theoretical Benford distribution.
- Validate sample size and exclude zero values from digit analysis.
- Compare MD&A excerpts using exact paragraph matching and Added / Deleted / Matched labels.
- Save authenticated, user-specific analysis history with a method-version identifier.
- Reopen saved results and export analysis history as JSON.

## Technology stack

| Layer | Technology |
| --- | --- |
| User interface | React 19, TypeScript, CSS |
| Application framework | Vinext with Next.js-compatible app routes |
| Server runtime | Cloudflare Workers |
| Persistence | Cloudflare D1 / SQLite; Drizzle schema migrations |
| Identity | Sites-provided Sign in with ChatGPT |
| Development | Node.js 22.13 or later, npm, TypeScript |

Node.js is used for development and testing. The deployed server runs in Cloudflare Workers, not an Express server.

## Architecture

```text
React interface -> /api/data -> authenticated server handlers -> Cloudflare D1
```

The server derives user identity from trusted platform-provided authentication headers rather than a client-supplied user ID. Records use parameterized SQL. User-owned writes are scoped to the signed-in user.

## Run locally

Prerequisites: Node.js 22.13+ and npm.

```sh
git clone https://github.com/lexiegao3-cyber/finguard-ai.git
cd finguard-ai
npm ci
npm run build
npm run db:migrate:local
npm run dev
```

Open the local URL printed by the development server, then use **Sign in with ChatGPT**. The portable development profile simulates a local test identity; it is not a production authentication system. The generated build configuration is required by the database migration command.

Local data is stored under the ignored `.wrangler/` directory. Do not commit databases, credentials, or local environment files.

## Verification

```sh
npm run typecheck
npm test
npm run build
```

Type checking and builds passed for the original MVP. Browser checks covered authenticated database-backed interactions. This is not a security audit or load-test certification.

## API

- `GET /api/data`: load application records for the current interface and identity.
- `POST /api/data`: submit a validated application action.

Handlers live in `app/api/data/route.ts`. Business logic, where separated, lives in `app/rank.mjs` or `app/analysis.mjs`. API error responses use an `error` field.

## Repository structure

```text
app/                 React pages, application logic, and API handlers
db/schema.ts         Database schema
drizzle/             Versioned SQL migrations
scripts/             Framework and local runtime helpers
worker/              Production Worker entry point
.openai/hosting.json Hosting binding declarations, without an existing Site ID
```

## Deployment

The existing MVP is hosted privately through Sites; its URL requires owner access and is not an anonymous public demo. A GitHub upload does not deploy this application or grant access to that private Site.

To deploy a new instance, register a new Site, retain the declared D1 binding, build the application, and publish using the Sites workflow. `.openai/hosting.json` intentionally omits the original project's Site ID. Deploying outside Sites requires replacing its authentication integration and configuring the hosting bindings.

## Limitations

This is an early research MVP, not the complete research platform. It accepts user-provided numbers and text; it does not fetch or verify SEC filings. The prefilled numbers are synthetic. Benford deviation is a descriptive statistic, not a fraud probability or finding. Exact paragraph comparison does not perform semantic matching. No trained fraud model, SHAP explanation, or historical backtest is active.

## Research roadmap

The planned platform covers four methodological layers:

1. **Statistical and financial baselines:** Benford statistics, Beneish ratios, and logistic regression. Only Benford MAD is implemented in this MVP.
2. **Tree ensembles:** XGBoost / LightGBM and SHAP explanations. Planned.
3. **Unsupervised screening:** Isolation Forest. Planned.
4. **Financial NLP:** Transformer paragraph embeddings, ParaEmb / FraudW2V-inspired change features, and fusion with structured features. Planned.

Further engineering work includes SEC EDGAR ingestion, AAER label provenance, PostgreSQL and Python/FastAPI services, MLflow tracking, filing citations, as-of rolling backtests, PR-AUC and Precision@K evaluation, and grouped confidence intervals. These are targets rather than completed functionality.

The current repository does not reproduce the referenced research baselines or incorporate their source code. Research references: [Benford baseline](https://github.com/bachnguyennn/Benford-Law-Fraud-Detection) and [ParaEmb / FraudW2V reference](https://github.com/LittelStudent/Financial-Statement-Fraud-Detection-ParaEmb-FraudW2V).

## Attribution

The application uses the Sites Vinext starter and third-party dependencies. Vendored components retain their bundled license notices, including the notices under `vendor/` and `scripts/vite/`. No competition awards, adoption statistics, or performance claims are borrowed from another applicant's projects.
