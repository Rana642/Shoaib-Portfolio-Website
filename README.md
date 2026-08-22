# adsbyshoaib.com

Personal brand website for Shoaib Nabi Noor. See [`CLAUDE-CODE-INSTRUCTIONS.md`](./CLAUDE-CODE-INSTRUCTIONS.md) for the full build plan, design system, and copy rules.

## Getting Started

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Content management (Sanity Studio)

All site content is managed from the embedded Studio at
[`/studio`](http://localhost:3000/studio): blog posts, case studies,
services, testimonials, FAQs, and the resume (roles, projects, skills,
education, certifications).

**Leads are not in Sanity.** Contact form submissions and newsletter
signups go to Supabase (`contacts` / `subscribers` tables) — view and
manage those in the Supabase dashboard.

### Setup

Project ID `m3je8htk` is already wired in `.env.local`. To make the
Studio usable:

1. **Add CORS origins** in [sanity.io/manage](https://sanity.io/manage) →
   your project → **API** → **CORS origins**. Add `http://localhost:3000`
   and `https://adsbyshoaib.com`, both with credentials allowed.
2. **Add the env var to Vercel**: `NEXT_PUBLIC_SANITY_PROJECT_ID=m3je8htk`
   in Project Settings → Environment Variables, then redeploy.
3. Open `/studio` and sign in with the Sanity account that owns the project.

### How content resolves

Every content type is **Sanity-first with a local fallback**: if the Studio
has no documents of a type (or Sanity is unreachable), the site renders the
existing local data instead — placeholder MDX for case studies, constants in
`lib/` for everything else. That means the site never breaks mid-migration,
but it also means **content only changes once you actually create documents
in the Studio**. Edits appear on the site within ~60 seconds (ISR), no
redeploy needed.

Schemas live in [`sanity/schemaTypes/`](./sanity/schemaTypes); the Studio's
sidebar grouping is configured in [`sanity.config.ts`](./sanity.config.ts).

> **Note:** `next.config.ts` includes `@sanity/sdk-react` in `transpilePackages`
> — that package ships a dist file with untranspiled JSX, which otherwise
> breaks the Next.js build. Don't remove it without re-testing `npm run build`.

## Deploy

The easiest way to deploy is [Vercel](https://vercel.com/new). See the
[Next.js deployment docs](https://nextjs.org/docs/app/building-your-application/deploying).
