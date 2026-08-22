# CLAUDE.md

# OddSaint — Project Instructions

## 1. PROJECT IDENTITY

OddSaint is a football analytics and prediction-ticket web application.

The application presents football prediction tickets built from real football fixtures and bookmaker odds, tracks fixture outcomes, grades completed selections, provides historical performance information, and provides paid access to premium products.

OddSaint is not a betting operator.

The application presents AI-assisted/statistical football analysis and must not represent predictions as guarantees.

The current GitHub repository is the authoritative source of truth for the implementation.

Do not assume that historical descriptions of OddSaint, 16BITENGINE, or previous versions of the project still match the current code.

---

# 2. SOURCE OF TRUTH

Use the following priority when determining how the system works:

1. Current repository source code
2. Current Supabase schema
3. Current GitHub Actions workflows
4. Current package/configuration files
5. Current README/documentation
6. Current CLAUDE.md instructions
7. Historical conversation context

If historical information conflicts with the repository, the repository wins.

Never invent functionality that is not present in the repository.

Never describe planned functionality as implemented functionality.

If something is mocked, stubbed, incomplete, or security-sensitive, explicitly identify it as such.

---

# 3. CURRENT TECHNOLOGY STACK

The current repository uses:

* Next.js 14.2.35
* Next.js App Router
* React 18.3.1
* TypeScript 5.5.4
* Supabase JS 2.45.4
* Supabase
* GitHub
* GitHub Actions
* Vercel
* Node.js 24.x

Do not replace these technologies unnecessarily.

Do not introduce a new framework or backend platform without a strong architectural reason.

---

# 4. REPOSITORY STRUCTURE

The important current structure is:

```text
OddSaint/
│
├── .github/
│   └── workflows/
│       ├── ai-self-evolution.yml
│       ├── generate-tickets.yml
│       ├── grade-tickets.yml
│       ├── register-pesapal-ipn.yml
│       └── resolve-leagues.yml
│
├── scripts/
│   ├── lib/
│   │   ├── apiFootball.mjs
│   │   ├── markets.mjs
│   │   ├── supabaseAdmin.mjs
│   │   └── leagues.json
│   │
│   ├── generate-tickets.mjs
│   ├── grade-tickets.mjs
│   ├── register-pesapal-ipn.mjs
│   └── resolve-leagues.mjs
│
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── checkout/
│   │   │   │   ├── route.ts
│   │   │   │   └── status/
│   │   │   │       └── route.ts
│   │   │   │
│   │   │   └── webhooks/
│   │   │       ├── pawapay/
│   │   │       │   └── route.ts
│   │   │       └── pesapal/
│   │   │           └── route.ts
│   │   │
│   │   ├── layout.tsx
│   │   └── page.tsx
│   │
│   └── lib/
│       ├── dataFetcher.ts
│       ├── grantAccess.ts
│       ├── pawapay.ts
│       ├── pesapal.ts
│       ├── plans.ts
│       └── supabaseClient.ts
│
├── supabase/
│   └── schema.sql
│
├── README.md
├── package.json
├── next.config.js
└── tsconfig.json
```

The structure may evolve.

When it does, update the documentation rather than forcing new code into an obsolete structure.

---

# 5. FRONTEND

The main application UI currently lives primarily in:

```text
src/app/page.tsx
```

This is currently a client component.

It contains substantial UI and application behavior, including:

* Odd Saint branding
* Ticket display
* Match display
* Match status
* Performance history
* Team search
* Team history
* Trial/access behavior
* Subscription-related UI
* Ad slots
* Watch-ad/unlock behavior
* Checkout interaction
* User-facing disclaimers

Do not casually convert the page into a different architecture.

Before extracting components or splitting the page, understand its existing state and data dependencies.

Avoid unnecessary rewrites of `page.tsx`.

---

# 6. DATA LAYER

The primary data layer is:

```text
src/lib/dataFetcher.ts
```

It reads real ticket data from Supabase.

It also contains a deterministic fallback/mock generator used when real data is unavailable.

This distinction is critical.

Real data:

* Comes from Supabase
* Is populated by the GitHub Actions ticket pipeline
* Uses real fixtures
* Uses bookmaker-odds-derived confidence
* Can be graded against real results

Fallback/mock data:

* Is deterministic
* Is generated locally
* Exists to prevent the UI from breaking when real data is unavailable
* Is placeholder/demo data
* Must never be represented as a real historical track record

Never confuse fallback/mock results with actual production performance.

---

# 7. TICKET TIERS

The current data layer recognizes:

* mega
* bronze
* silver
* gold
* platinum
* diamond
* weekly_lite
* weekly_titan
* saints_lock

The real ticket-generation script and frontend data layer should remain consistent.

If tier definitions are changed, inspect both:

```text
src/lib/dataFetcher.ts
scripts/generate-tickets.mjs
```

and any database/UI logic that depends on the tier.

Do not modify one representation while leaving contradictory definitions elsewhere.

---

# 8. IMPORTANT TICKET-ENGINE DISTINCTION

The current "AI Confidence Index" is NOT a trained machine-learning prediction model.

The current real generation pipeline derives confidence from bookmaker consensus/implied probability and uses transparent selection heuristics.

Do not describe the current system as a trained AI model unless the repository is later changed to contain an actual trained/model-based prediction system.

If improving the prediction engine, preserve this distinction.

Any future ML/AI model must be separately identified and evaluated.

---

# 9. REAL TICKET GENERATION

The main generation script is:

```text
scripts/generate-tickets.mjs
```

It:

1. Retrieves real fixtures through API-Football.
2. Filters leagues.
3. Excludes selected difficult/high-profile clashes.
4. Retrieves bookmaker odds.
5. Selects viable markets.
6. Applies confidence/odds rules.
7. Builds ticket tiers.
8. Writes fixtures/tickets to Supabase.

The generation job is scheduled by:

```text
.github/workflows/generate-tickets.yml
```

The workflow runs daily and can also be manually dispatched.

Do not change the generation script without considering API-Football request limits and GitHub Actions execution.

---

# 10. API-FOOTBALL

The external football data integration is under:

```text
scripts/lib/apiFootball.mjs
```

Treat API-Football as an external dependency.

Consider:

* API request limits
* API plan limitations
* rate limits
* unavailable dates
* missing odds
* missing fixtures
* postponed fixtures
* malformed/incomplete responses

Do not assume every fixture has usable odds.

Do not silently fabricate real football data.

---

# 11. MARKET CATALOG

The shared market catalog is:

```text
scripts/lib/markets.mjs
```

This is intentionally shared by ticket generation and ticket grading.

The design principle is:

> A market should not be selectable by the generation engine unless the grading engine can also settle it.

When adding a new market:

1. Add its selectable outcome definition.
2. Define its odds range appropriately.
3. Define its settlement function.
4. Ensure the grading engine can resolve it.
5. Test both generation and grading.

Do not duplicate market settlement logic in separate scripts.

---

# 12. TICKET GRADING

The grading script is:

```text
scripts/grade-tickets.mjs
```

It:

1. Finds pending fixtures old enough to have finished.
2. Retrieves results from API-Football.
3. Confirms the fixture has a finished status.
4. Reads the stored market.
5. Uses the shared market settlement logic.
6. Stores final scores.
7. Changes the fixture status to `green` or `red`.

The grading workflow runs every three hours.

Do not mark a fixture as settled merely because its kickoff time has passed.

---

# 13. LEAGUE RESOLUTION

League resolution is handled by:

```text
scripts/resolve-leagues.mjs
```

It uses API-Football's league endpoint to obtain current league IDs rather than relying entirely on guessed/hardcoded IDs.

It writes:

```text
scripts/lib/leagues.json
```

The corresponding GitHub Action is:

```text
.github/workflows/resolve-leagues.yml
```

This workflow is intentionally manual.

Do not make league resolution a daily operation unless there is a compelling reason.

---

# 14. DATABASE

The authoritative database definition is:

```text
supabase/schema.sql
```

Current important tables include:

* `fixtures`
* `tickets`
* `ticket_matches`
* `admins`
* `app_settings`
* `subscribers`
* `app_stats`
* `saints_lock_access`
* `pending_transactions`

There is also a `team_match_history` view.

Before changing database behavior:

1. Read the schema.
2. Identify affected tables.
3. Identify RLS policies.
4. Identify application dependencies.
5. Identify GitHub Actions dependencies.
6. Consider existing production data.

Never casually drop or rename tables/columns.

---

# 15. DATABASE SECURITY

The database deliberately separates public reads from privileged writes.

Ticket/fixture data is publicly readable through controlled Supabase access.

The automation pipeline uses the Supabase service-role key.

The service-role key must NEVER be exposed to the browser.

The `pending_transactions` table is intended for server-side payment processing and must not be exposed through public client access.

Preserve these security boundaries.

---

# 16. AUTHENTICATION AND USER ACCESS

Supabase Auth is part of the application architecture.

User-specific access includes subscription and Saint's Lock access.

The database uses `auth.users` relationships and RLS to restrict users to their own sensitive access records.

Never weaken these RLS boundaries simply to make frontend queries easier.

---

# 17. PLANS

Subscription definitions live in:

```text
src/lib/plans.ts
```

Current standard plans:

* Weekly — $2.49 — 7 days
* Monthly — $7.99 — 30 days
* Yearly — $67 — 365 days

Saint's Lock is intentionally separate:

* Daily — $1.50 — 1 day
* Weekly — $7 — 7 days
* Monthly — $27 — 30 days

Do not hard-code prices independently in checkout/UI code.

The server must derive the amount from the validated plan ID.

Never trust a client-submitted price.

---

# 18. ACCESS GRANTING

Access granting is centralized in:

```text
src/lib/grantAccess.ts
```

The central principle is:

> Verified successful payment → centralized access grant → database upsert.

Do not duplicate entitlement-granting logic in multiple payment handlers.

The current implementation supports:

* standard subscription access
* Saint's Lock access

When changing access logic, inspect:

```text
grantAccess.ts
plans.ts
supabase/schema.sql
checkout route
payment webhooks
```

---

# 19. PAYMENT ARCHITECTURE

The unified checkout endpoint is:

```text
src/app/api/checkout/route.ts
```

The backend chooses the payment provider.

Current flow:

```text
User
 ↓
/api/checkout
 ↓
Is country/network supported by PawaPay?
 ├── YES → PawaPay direct mobile-money deposit
 │          ↓
 │       pending_transactions
 │          ↓
 │       webhook and/or status polling
 │
 └── NO → PesaPal hosted checkout
            ↓
         pending_transactions
            ↓
         PesaPal IPN
```

This routing decision occurs server-side.

Do not move payment-provider selection entirely to the client.

---

# 20. PAWAPAY

PawaPay implementation:

```text
src/lib/pawapay.ts
src/app/api/webhooks/pawapay/route.ts
src/app/api/checkout/status/route.ts
```

The application currently uses PawaPay for supported mobile-money networks.

The code supports country/network correspondent mappings.

The PawaPay environment is selected using:

```text
PAWAPAY_ENV
```

The API token is:

```text
PAWAPAY_API_TOKEN
```

Never expose this token to the client.

### CRITICAL SECURITY ISSUE

The current PawaPay webhook does NOT cryptographically authenticate the incoming callback.

The source code explicitly documents this gap.

Therefore:

**Do not describe the PawaPay webhook as production-secure until callback authentication is implemented and verified against current PawaPay documentation/dashboard capabilities.**

The checkout-status polling path currently provides an additional verification mechanism, but it does not eliminate the need to secure the webhook.

---

# 21. PESAPAL

PesaPal implementation:

```text
src/lib/pesapal.ts
src/app/api/webhooks/pesapal/route.ts
scripts/register-pesapal-ipn.mjs
.github/workflows/register-pesapal-ipn.yml
```

PesaPal uses a hosted redirect checkout.

The IPN URL must be registered before transactions are submitted.

The resulting IPN ID is stored as:

```text
PESAPAL_IPN_ID
```

The registration workflow is manual.

Do not re-register the IPN on every checkout.

PesaPal authentication credentials must remain server-side.

---

# 22. PENDING TRANSACTIONS

The table:

```text
pending_transactions
```

connects provider transaction IDs with:

* user
* email
* product
* plan
* provider
* status

This exists because payment providers do not necessarily return arbitrary application metadata in a form suitable for this application's needs.

Payment processing must use this mapping rather than trusting arbitrary client-provided state.

---

# 23. PAYMENT IDEMPOTENCY

Payment completion must be idempotent.

Both webhook processing and PawaPay status polling can potentially observe the same successful payment.

The system is designed so that access granting uses database upserts and pending-transaction status checks.

Do not remove these protections.

When modifying payment processing, explicitly test duplicate webhook/callback scenarios.

---

# 24. ADVERTISING

The frontend currently contains an ad-slot abstraction:

```text
AdSlot
```

with:

```text
data-ad-slot="infeed"
data-ad-slot="anchor"
```

There is also a simulated video-ad unlock mechanism.

These are currently application-level placeholders/abstractions, not proof of a live advertising network integration.

When integrating a real advertising provider:

* Preserve the existing separation.
* Avoid embedding provider-specific logic throughout the application.
* Keep the ad system replaceable.
* Protect UX.
* Do not allow ads to interfere with payment/authentication.
* Do not falsely represent simulated ads as real advertisements.

---

# 25. LEGAL/PRODUCT POSITIONING

The UI explicitly presents Odd Saint as AI-assisted/statistical football analysis and not a guarantee.

Do not remove or weaken this positioning casually.

Do not introduce language claiming:

* guaranteed wins
* guaranteed profits
* certain outcomes
* risk-free betting
* guaranteed predictions

unless the product/legal requirements are deliberately changed and reviewed.

---

# 26. GITHUB ACTIONS

Current workflows:

```text
ai-self-evolution.yml
generate-tickets.yml
grade-tickets.yml
register-pesapal-ipn.yml
resolve-leagues.yml
```

Treat workflows and the scripts they execute as coupled systems.

Before changing a script, inspect its workflow.

Before changing a workflow, inspect the script.

Consider:

* secrets
* permissions
* schedules
* Node version
* package installation
* generated files
* Git commits
* failure behavior

---

# 27. SELF-EVOLUTION WORKFLOW

The repository contains an automated weekly maintenance workflow.

It has write permissions and performs repository maintenance.

Do not expand autonomous write capability casually.

Automated evolution must remain:

* reviewable
* bounded
* reversible
* testable

Never create an autonomous mechanism that silently deploys arbitrary unreviewed code changes to production.

---

# 28. ENVIRONMENT VARIABLES AND SECRETS

Never expose real secrets.

Never request users to paste secrets into chat.

Use variable names only.

Known categories include:

```text
Supabase
API_FOOTBALL_KEY
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY

PawaPay
PAWAPAY_API_TOKEN
PAWAPAY_ENV

PesaPal
PESAPAL_CONSUMER_KEY
PESAPAL_CONSUMER_SECRET
PESAPAL_ENV
PESAPAL_IPN_ID
NEXT_PUBLIC_SITE_URL
```

Never hard-code credentials.

Never commit `.env` files containing real values.

---

# 29. VERCEL

Vercel is the deployment platform.

Keep Next.js implementation compatible with Vercel.

Consider:

* serverless execution
* request timeouts
* environment variables
* server/client boundaries
* build behavior
* production/preview configuration

Do not move long-running scheduled work into a normal Vercel request if GitHub Actions is the existing appropriate execution environment.

---

# 30. KNOWN REPOSITORY INCONSISTENCIES

The current repository contains areas that require verification before being treated as fully production-ready.

### Supabase admin helper

`grantAccess.ts` imports:

```text
@/lib/supabaseAdmin
```

but the current `src/lib` directory listing does not show a corresponding `supabaseAdmin.ts`.

Do not assume this is harmless.

Before changing payment/access code:

* verify whether the file exists in another branch/location,
* verify whether the current build resolves the alias,
* run the build/type-check,
* identify the actual resolution path.

Do not silently fabricate a replacement.

### Stale comments

Some comments in the payment/access code refer to older providers such as Stripe/Flutterwave even though the current architecture uses PawaPay/PesaPal.

Treat comments as potentially stale when they conflict with actual implementation.

Code and current architecture take precedence.

When touching affected code, update misleading comments.

---

# 31. MOCK DATA

The frontend data layer contains deterministic mock/fallback ticket generation.

Mock data is acceptable as a UI fallback but must never be presented as actual historical performance.

When debugging a discrepancy between the UI and Supabase:

First determine whether the UI is showing:

1. Real Supabase data, or
2. Deterministic fallback data.

Do not incorrectly diagnose fallback data as a database failure.

---

# 32. DEVELOPMENT WORKFLOW

For every significant request:

### 1. INSPECT

Read the relevant implementation.

### 2. TRACE

Determine dependencies and execution flow.

### 3. PLAN

Identify the smallest safe change.

### 4. IMPLEMENT

Modify only what is necessary.

### 5. VERIFY

Run appropriate tests/build/lint checks.

### 6. REPORT

Explain:

* files changed
* behavior changed
* tests performed
* known limitations
* remaining risks

---

# 33. NEVER GUESS

If information is available in the repository, inspect it.

Do not guess:

* database columns
* API behavior
* environment variables
* provider behavior
* route names
* component names
* workflow schedules
* payment status semantics
* deployment configuration

If external API behavior matters, verify current official provider documentation before implementing.

---

# 34. SECURITY-FIRST DEVELOPMENT

For every change, consider:

* authentication
* authorization
* RLS
* input validation
* API abuse
* secret exposure
* payment manipulation
* webhook authenticity
* privilege escalation
* data leakage
* duplicate transactions

Security-sensitive changes require more scrutiny than ordinary UI changes.

---

# 35. NO UNNECESSARY REWRITES

Prefer targeted changes.

Do not rewrite a large file merely to add a small feature.

Do not replace functioning architecture with a new framework because it appears cleaner.

Do not introduce duplicate systems.

If a major refactor is genuinely necessary:

1. Explain the problem.
2. Explain the risk.
3. Explain the proposed architecture.
4. Identify affected files.
5. Separate the refactor from unrelated feature work.

---

# 36. TESTING

For significant changes, verify the appropriate layers.

At minimum consider:

* TypeScript
* lint
* production build
* API routes
* database queries
* authentication
* authorization
* payment flows
* webhook behavior
* GitHub Actions
* external API failures

For payment changes specifically test:

* valid payment
* rejected payment
* failed payment
* duplicate callback
* repeated polling
* missing transaction
* invalid plan
* invalid product
* invalid country/network

---

# 37. DOCUMENTATION

Important architectural decisions should be documented in the repository.

Do not rely on a long Claude conversation as the permanent source of truth.

When an important design decision becomes permanent, update:

* README
* relevant technical documentation
* CLAUDE.md when it affects how Claude should work

---

# 38. FUTURE AI/PREDICTION ENGINE

If the prediction system evolves beyond bookmaker-odds heuristics into a genuine AI/ML model:

* Clearly separate the model from the current heuristic system.
* Document the data source.
* Document training methodology.
* Document evaluation methodology.
* Track model versioning.
* Avoid data leakage.
* Avoid claiming predictive accuracy without evidence.
* Preserve reproducibility where possible.

Do not call a heuristic an AI model merely for marketing purposes.

---

# 39. PRODUCT EVOLUTION

Future development should aim toward:

* reliable football data
* stronger prediction methodology
* transparent performance measurement
* scalable ticket generation
* robust payment processing
* secure user access
* meaningful analytics
* advertiser readiness
* strong user experience
* maintainable architecture

However, do not add complexity without a concrete product or technical justification.

---

# 40. FINAL RULE

OddSaint must be treated as one interconnected production system.

Always think in terms of:

```text
Frontend
   ↓
Data layer
   ↓
API
   ↓
Business logic
   ↓
Supabase
   ↓
External providers

and

GitHub Actions
   ↓
External football data
   ↓
Ticket generation
   ↓
Supabase
   ↓
Frontend
   ↓
Grading
   ↓
Performance history
```

Before making a change, determine where it sits in these flows and what depends on it.

## GOLDEN RULE

**Inspect → Understand → Plan → Implement → Test → Document**

Never:

**Guess → Rewrite → Assume → Deploy**
