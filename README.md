# Odd Saint

AI-driven football prediction tickets, built as an ultra-lightweight Next.js
App Router project. Designed to run entirely on free-tier infrastructure:
**GitHub** (code + CI), **Vercel** (hosting), and **Supabase** (auth + database).

---

## 1. Push the code to GitHub

1. Go to [github.com](https://github.com) → **New repository** → name it e.g.
   `odd-saint` → **Create repository** (leave it empty, no README/license).
2. On the empty repo page, click **"uploading an existing file"** and drag in
   this entire project folder — or, if you have GitHub Desktop, clone the
   empty repo locally, copy these files in, and push.
3. Commit to `main`.

> Note: `.gitignore` already excludes `node_modules/`, `.next/`, and
> `.env.local` so you don't accidentally commit secrets or build output.

---

## 2. Create a free Supabase project

1. Go to [supabase.com](https://supabase.com) → **New project**.
2. Pick an organization, name, database password, and region → **Create new
   project** (takes ~1-2 minutes to provision).
3. In the left sidebar: **Project Settings → API**. Copy:
   - **Project URL** (`NEXT_PUBLIC_SUPABASE_URL`)
   - **anon public** key (`NEXT_PUBLIC_SUPABASE_ANON_KEY`)
4. In the left sidebar: **Authentication → Providers**. Confirm **Email** is
   enabled — this powers the magic-link login used on the login screen.
5. In **Authentication → URL Configuration**, leave this open in a tab —
   you'll come back after step 3 to set the **Site URL** to your live Vercel
   domain (important, see the gotcha at the end).

---

## 3. Deploy to Vercel (free tier)

1. Go to [vercel.com](https://vercel.com) → **Add New → Project**.
2. **Import** your `odd-saint` GitHub repo (you may need to authorize Vercel
   to access your GitHub account first).
3. Vercel auto-detects the Next.js framework — no build command changes
   needed.
4. Before clicking Deploy, expand **Environment Variables** and add:

   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | your Supabase Project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | your Supabase anon public key |

5. Click **Deploy**. In under a minute you'll get a live URL like
   `https://odd-saint.vercel.app`.

---

## 4. Fix the magic-link redirect (important)

By default, Supabase sends magic-link emails that redirect back to
`localhost:3000`, which won't work in production.

1. Copy your live Vercel URL (e.g. `https://odd-saint.vercel.app`).
2. In Supabase: **Authentication → URL Configuration**.
3. Set **Site URL** to your Vercel URL.
4. Under **Redirect URLs**, add the same URL (and `http://localhost:3000` too,
   if you also want local dev to keep working).
5. Save.

Now when a user requests a magic link, it'll correctly redirect them back to
your live app instead of localhost.

---

## 5. The weekly maintenance workflow

`.github/workflows/ai-self-evolution.yml` runs automatically every Monday at
03:00 UTC once the repo exists on GitHub — no extra setup required. It:

- Inventories the repo file layout
- Runs `npm outdated` and `npm audit` (report-only)
- Applies safe **minor/patch** dependency updates
- Verifies `lint` and `build` still pass
- Opens a **pull request** with the changes for you to review — it never
  auto-merges, so nothing ships without your approval

You can also trigger it manually any time from the repo's **Actions** tab via
"Run workflow".

---

## 6. Local development (optional)

If you ever want to run it locally instead of only in the cloud:

```bash
npm install
cp .env.local.example .env.local   # then fill in your Supabase values
npm run dev
```

Visit `http://localhost:3000`.

---

## Next steps / things to wire up

- **Payments**: `handlePayPerTicket` and `handleSubscribe` in
  `src/app/page.tsx` are stubbed — connect them to Stripe, Paystack, or your
  preferred provider's checkout flow.
- **Real ad units**: `AdSlot` in `src/app/page.tsx` renders placeholder
  containers with `data-ad-slot` attributes — swap in your real Google
  AdSense `<ins>` snippet or affiliate banner code once you have publisher
  IDs.
- **Real ticket data**: `fetchTickets()` in `src/lib/dataFetcher.ts` currently
  generates mock matches. Replace it with a Supabase table query once you've
  set up your `tickets`/`matches` schema (a sample query is commented inline).
