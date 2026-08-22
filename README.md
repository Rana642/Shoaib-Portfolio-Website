# adsbyshoaib.com

Personal brand website for Shoaib Nabi Noor. See [`CLAUDE-CODE-INSTRUCTIONS.md`](./CLAUDE-CODE-INSTRUCTIONS.md) for the full build plan, design system, and copy rules.

## Getting Started

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Sanity Studio (blog CMS)

The blog (`/blog`) reads from Sanity when configured, and falls back to two
placeholder posts in [`lib/posts.ts`](./lib/posts.ts) so local dev and builds
work before a Sanity project exists.

**To connect a real project:**

1. Create a free account and project at [sanity.io](https://sanity.io).
2. Note your **Project ID** from the Sanity management console.
3. In `.env.local`, set:
   ```
   NEXT_PUBLIC_SANITY_PROJECT_ID=your-project-id
   NEXT_PUBLIC_SANITY_DATASET=production
   ```
4. Restart `npm run dev`. The Studio is embedded at
   [http://localhost:3000/studio](http://localhost:3000/studio) — sign in
   there with your Sanity account to add and edit blog posts.
5. To deploy the Studio's hosted API/CDN config, run `npx sanity deploy`
   (optional — the embedded `/studio` route works without this).

The `post` schema (title, slug, excerpt, cover image, category, published
date, body, SEO fields, FAQs) lives in [`sanity/schemaTypes/post.ts`](./sanity/schemaTypes/post.ts).

> **Note:** `next.config.ts` includes `@sanity/sdk-react` in `transpilePackages`
> — that package ships a dist file with untranspiled JSX, which otherwise
> breaks the Next.js build. Don't remove it without re-testing `npm run build`.

## Deploy

The easiest way to deploy is [Vercel](https://vercel.com/new). See the
[Next.js deployment docs](https://nextjs.org/docs/app/building-your-application/deploying).
