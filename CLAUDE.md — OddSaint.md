# CLAUDE.md — OddSaint

## 1. PROJECT IDENTITY

OddSaint is an AI-driven football prediction-ticket platform.

The current repository is the authoritative source of truth for the project's implementation.

Do not assume that historical descriptions of OddSaint, 16BITENGINE, or previous versions of the project still match the current codebase.

Always inspect the current repository before making architectural assumptions.

---

# 2. PRIMARY TECHNOLOGY STACK

The current project uses:

- Next.js 14.2.35
- Next.js App Router
- React 18.3.1
- TypeScript 5.5.4
- Supabase JS 2.45.4
- Supabase for authentication and database functionality
- GitHub for source control and CI/CD
- Vercel for deployment
- Node.js 24.x

Do not replace these technologies unless there is a strong technical reason and the change is explicitly justified.

---

# 3. CURRENT REPOSITORY STRUCTURE

The current repository is organized approximately as follows:

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
│   ├── generate-tickets.mjs
│   ├── grade-tickets.mjs
│   ├── register-pesapal-ipn.mjs
│   └── resolve-leagues.mjs
│
├── src/
│   ├── app/
│   │   ├── api/
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
├── next.config.js
├── package.json
└── tsconfig.json
```

This structure may evolve.

If the actual repository differs from this documentation, the repository itself takes precedence.

Do not invent files or folders that do not exist.

---

# 4. SOURCE-OF-TRUTH RULE

The GitHub repository is the primary technical source of truth.

Use this priority:

1. Current source code
2. Current database schema/migrations
3. Current GitHub Actions workflows
4. Current configuration
5. Current README/documentation
6. Current project instructions
7. Historical conversation context

If historical instructions conflict with the current repository, do not blindly follow the historical instructions.

Identify the conflict and use the current implementation as the starting point.

---

# 5. INSPECT BEFORE MODIFYING

Before changing code:

1. Locate the relevant file.
2. Read the existing implementation.
3. Identify dependencies.
4. Identify callers.
5. Identify database dependencies.
6. Identify API dependencies.
7. Identify GitHub workflow dependencies where relevant.
8. Determine whether the requested functionality already exists.

Never create a second implementation when an existing implementation can be extended.

---

# 6. NEXT.JS APP ROUTER

The project uses the Next.js App Router.

Follow the existing App Router architecture.

API endpoints belong under:

```text
src/app/api/
```

API route implementations should use:

```text
route.ts
```

Use the correct server/client boundary.

Do not expose server-only credentials or privileged operations to client-side code.

---

# 7. SUPABASE

Supabase is a core backend component.

The current database definition is represented in:

```text
supabase/schema.sql
```

Before changing database-related functionality:

- Inspect the current schema.
- Understand table relationships.
- Inspect constraints.
- Inspect indexes.
- Inspect RLS policies where applicable.
- Determine which application code depends on the affected schema.

Never casually delete or rename database structures.

Database changes must consider existing production data and application compatibility.

---

# 8. SUPABASE CLIENT

The repository currently contains:

```text
src/lib/supabaseClient.ts
```

Use the existing Supabase abstraction where appropriate.

Do not create another Supabase client implementation without a clear architectural reason.

Never expose service-role credentials to the browser.

---

# 9. DATA FETCHING

The repository currently contains:

```text
src/lib/dataFetcher.ts
```

Treat this as an important part of the application's data layer.

Before changing ticket/match data behavior:

- Inspect the current implementation.
- Determine whether data is mocked or coming from Supabase.
- Preserve the expected data shape unless intentionally changing the application contract.
- Update dependent components and APIs if the contract changes.

Do not silently replace mock data with a different source without checking the current architecture.

---

# 10. PAYMENT ARCHITECTURE

The repository currently contains payment-related modules:

```text
src/lib/pawapay.ts
src/lib/pesapal.ts
```

Payment functionality is security-sensitive.

Treat payment status as server-authoritative.

Never trust a client-side statement that a payment succeeded.

Payment processing must account for:

- Transaction identity
- User identity
- Amount
- Currency
- Provider response
- Payment state
- Duplicate requests
- Retry behavior
- Callback/IPN/webhook processing

Payment operations should be idempotent.

A repeated callback must not create duplicate access, credits, subscriptions, or transactions.

Never expose payment credentials to client-side code.

---

# 11. PESA PAL

The repository contains an automated workflow for PesaPal IPN registration:

```text
.github/workflows/register-pesapal-ipn.yml
scripts/register-pesapal-ipn.mjs
src/lib/pesapal.ts
```

Treat these components as related.

Before modifying PesaPal functionality, inspect all three areas.

Do not change the integration in only one location if the change affects the overall payment flow.

Keep sandbox and production configuration separate.

---

# 12. PAWAPAY

The repository contains:

```text
src/lib/pawapay.ts
```

Treat Pawapay as an external payment integration.

Use server-side credentials.

Validate provider responses.

Handle:

- Network failures
- Provider errors
- Timeouts
- Duplicate callbacks
- Invalid transaction states
- Failed transactions
- Pending transactions

Do not mark a payment as successful solely because a request to the provider was successfully sent.

---

# 13. ACCESS CONTROL

The repository contains:

```text
src/lib/grantAccess.ts
```

Treat access granting as business-critical functionality.

Access should only be granted after the authoritative payment/business condition has been satisfied.

Avoid duplicating access-granting logic in multiple UI components or API routes.

Where possible, maintain one authoritative business-logic path.

---

# 14. PLANS AND SUBSCRIPTIONS

The repository contains:

```text
src/lib/plans.ts
```

Treat plan definitions as centralized business logic.

Do not hard-code plan prices, access levels, or subscription rules in unrelated UI components if they already belong in the plans module.

When changing a plan:

- Check payment logic.
- Check access logic.
- Check UI.
- Check database implications.
- Check existing subscriptions.
- Check advertising or entitlement implications.

---

# 15. TICKET SYSTEM

OddSaint includes automated ticket-related processing.

Current scripts include:

```text
scripts/generate-tickets.mjs
scripts/grade-tickets.mjs
scripts/resolve-leagues.mjs
```

There are corresponding GitHub Actions workflows.

Treat ticket generation, grading, and league resolution as related pipeline components.

Do not change one stage without checking how the other stages consume its output.

Ticket lifecycle should remain deterministic and recoverable.

---

# 16. GITHUB ACTIONS

The repository currently contains automated workflows for:

- AI/self-evolution maintenance
- Ticket generation
- Ticket grading
- PesaPal IPN registration
- League resolution

Before modifying a script used by GitHub Actions:

1. Inspect the corresponding workflow.
2. Inspect the script.
3. Inspect supporting libraries.
4. Check environment variables.
5. Check expected inputs and outputs.
6. Check scheduling/manual triggers.
7. Check failure behavior.

Do not assume a script is only used locally.

---

# 17. AI SELF-EVOLUTION

The repository contains:

```text
.github/workflows/ai-self-evolution.yml
```

The current README describes this workflow as a weekly maintenance process that inventories the repository, checks dependencies, performs safe minor/patch updates, verifies lint/build, and opens a pull request rather than automatically merging changes.

Do not weaken this safety model.

Automated evolution must remain reviewable.

Never design an autonomous workflow that can silently introduce uncontrolled production changes.

---

# 18. AUTOMATION PRINCIPLES

Automation should be:

- Deterministic
- Idempotent where possible
- Recoverable
- Observable
- Retry-safe
- Failure-aware

Every automated process should have clearly defined:

- Inputs
- Outputs
- State
- Success condition
- Failure condition
- Retry behavior

Avoid duplicate processing.

---

# 19. ADVERTISING

The current project contains an advertising placeholder system.

The README identifies `AdSlot` functionality in the main application and indicates that the current implementation uses placeholder containers with `data-ad-slot` attributes.

When implementing advertising:

- Preserve the existing component architecture.
- Avoid hard-coding one advertising provider unnecessarily.
- Keep advertising configuration separate from core business logic.
- Protect user experience.
- Avoid misleading advertisements.
- Ensure future provider integration can be performed without rewriting the application.

Advertising must not interfere with authentication, payments, or core ticket functionality.

---

# 20. SECURITY

Always consider:

- Authentication
- Authorization
- Supabase RLS
- Input validation
- Output validation
- API abuse
- Rate limiting
- Credential exposure
- Payment fraud
- Webhook/IPN authenticity
- Privilege escalation
- Sensitive data exposure

Never place secrets in:

- Source code
- Client bundles
- GitHub
- Documentation
- Logs
- Error messages

Use environment variables.

---

# 21. ENVIRONMENT VARIABLES

Never request the user to paste real secrets into a conversation.

Use variable names only.

Examples:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
PAWAPAY_API_KEY
PESAPAL_CONSUMER_KEY
PESAPAL_CONSUMER_SECRET
```

Never output actual secret values.

If an environment variable is missing, explain exactly where it must be configured.

---

# 22. VERCEL

Vercel is the deployment platform.

Implementation must remain compatible with Vercel.

Consider:

- Serverless execution
- Function limits
- Runtime behavior
- Environment variables
- Build process
- Production versus preview environments
- Long-running operations

Do not assume local execution behavior is identical to Vercel production.

Long-running automation should generally remain in appropriate GitHub Actions or external infrastructure rather than being forced into a Vercel request lifecycle.

---

# 23. GITHUB

GitHub is the authoritative source-control system.

Prefer small, coherent changes.

Do not introduce unnecessary files.

Do not commit:

- Secrets
- `.env` files
- Build output
- `node_modules`
- Temporary files
- Debug artifacts

Do not recommend destructive Git commands without explaining their consequences.

---

# 24. DEPENDENCY MANAGEMENT

The current project has a deliberately lightweight dependency footprint.

Do not add dependencies unnecessarily.

Before adding a package:

1. Check whether existing dependencies already provide the required functionality.
2. Consider whether native platform functionality is sufficient.
3. Consider security.
4. Consider maintenance.
5. Consider bundle size.
6. Consider Vercel compatibility.
7. Explain why the package is necessary.

---

# 25. CODE MODIFICATION RULES

Prefer the smallest safe change.

Do not rewrite entire files when only a small section needs modification.

Preserve existing behavior unless the requested change intentionally changes it.

Before modifying shared functionality, determine what depends on it.

Avoid:

- Duplicate functions
- Duplicate API routes
- Duplicate database clients
- Duplicate business rules
- Dead code
- Unnecessary abstractions
- Temporary hacks becoming permanent architecture

---

# 26. DEBUGGING

When something fails:

Do not guess.

Use this sequence:

1. Read the exact error.
2. Identify the originating file.
3. Trace the execution path.
4. Inspect relevant configuration.
5. Inspect dependent modules.
6. Check database behavior.
7. Check external API behavior.
8. Identify the root cause.
9. Apply the smallest appropriate fix.
10. Verify the fix.

Clearly distinguish:

- Root cause
- Symptom
- Workaround
- Permanent solution

---

# 27. TESTING

After significant changes, verify appropriate layers.

At minimum consider:

- TypeScript correctness
- Lint
- Build
- API behavior
- Authentication behavior
- Authorization
- Database behavior
- Payment behavior
- GitHub workflow behavior

Do not claim that something passed if it was not actually tested.

---

# 28. DATABASE CHANGES

When changing the database:

- Update the authoritative schema/migration.
- Check application queries.
- Check dependent APIs.
- Check RLS.
- Check existing data.
- Check backwards compatibility.

Never make an undocumented database change.

---

# 29. API DESIGN

API routes should:

- Validate inputs
- Validate authorization
- Return appropriate HTTP status codes
- Handle errors
- Avoid leaking internal information
- Avoid exposing secrets
- Use consistent response structures
- Prevent duplicate operations where relevant

Business logic should not be unnecessarily duplicated between API routes and UI components.

---

# 30. UI/UX

Preserve the existing visual and interaction architecture unless the task explicitly requires redesign.

For asynchronous operations, provide appropriate:

- Loading states
- Success states
- Error states
- Empty states
- Recovery paths

Maintain responsive behavior and accessibility.

---

# 31. PRODUCTION READINESS

Never describe a feature as production-ready merely because it works in one test.

Before considering a feature production-ready, evaluate:

- Security
- Error handling
- Database integrity
- Authentication
- Authorization
- External integrations
- Environment configuration
- Performance
- Failure recovery
- Deployment compatibility
- User experience

---

# 32. HANDLING FUTURE DEVELOPMENT

OddSaint is expected to evolve substantially.

When implementing new functionality:

1. Understand the current architecture.
2. Determine where the functionality belongs.
3. Prefer extension over duplication.
4. Keep modules loosely coupled.
5. Preserve future scalability.
6. Avoid premature complexity.
7. Document important architectural decisions.

Do not build future features based solely on historical conversations.

Use the current repository as the foundation.

---

# 33. WHEN THE USER REQUESTS A CHANGE

Follow this sequence:

### ANALYZE

Inspect the current implementation.

### PLAN

Explain what needs to change and why.

### IMPLEMENT

Make the smallest coherent change.

### VERIFY

Check affected functionality.

### REPORT

State:

- Files changed
- What changed
- Why it changed
- What was verified
- Any remaining limitations

If the task is sufficiently clear and safe, do not repeatedly ask for confirmation for trivial implementation details.

---

# 34. DO NOT INVENT IMPLEMENTATION STATUS

If something is:

- Stubbed — say it is stubbed.
- Mocked — say it is mocked.
- Placeholder — say it is a placeholder.
- Partially implemented — say it is partial.
- Production-ready — only say so after verification.

Do not present planned functionality as existing functionality.

---

# 35. ARCHITECTURAL CONFLICTS

If a requested change conflicts with the current architecture:

1. Identify the conflict.
2. Explain the consequences.
3. Recommend the safest approach.
4. Do not silently introduce a second architecture.

If a major refactor is necessary, separate it from ordinary feature work.

---

# 36. PROJECT EVOLUTION

The project should progressively become:

- More reliable
- More secure
- More automated
- More observable
- More scalable
- More maintainable
- More data-driven
- More commercially viable

However, do not add complexity merely because it sounds sophisticated.

Every architectural addition must have a concrete purpose.

---

# 37. DOCUMENTATION RULE

When an important architectural decision is made, update the appropriate project documentation.

Do not rely on chat history as the permanent source of truth.

Important knowledge should eventually exist in the repository.

---

# 38. FINAL OPERATING PRINCIPLE

Treat OddSaint as a production system.

Always:

**Inspect → Understand → Plan → Implement → Test → Document**

Never:

**Guess → Rewrite → Hope**

The current GitHub repository is the authoritative implementation.

The goal is not merely to make individual features work.

The goal is to continuously improve the entire OddSaint system without creating architectural drift, security weaknesses, unnecessary complexity, or technical debt.