# Work log

Newest first. Short notes so work can continue on any machine. The full
context (decisions, gotchas, rules) is in the second-brain vault:
`Obsidian-my-2nd-Brain/03-Projects/Shoaib-Nabi-Noor/memory/MEMORY.md`.

## 2026-10-01 → 2026-10-03 (home PC)

**Connections and accounts**
- The Connections project dropdown now opens above the platform tiles (7a92dc0). The glass card's backdrop-filter had trapped it underneath.
- Google Business is linked for 11 projects. One Gmail grant serves all of them, and the location is matched by name:
  - Choppers Salon is the Gulgasht listing; Choppers Studio is the Model Town listing.
  - Danish Constructions has no listing; REEFCO has none either.
- Facebook (+ Instagram where the Page has one) linked from both FB logins (slot 1 Shoaib Nabi Noor, slot 2 Malaika Mehreen) for:
  - Choppers Studio
  - Eventia 360
  - Hotel Avalon
  - Toni and Guy
  - Tad Pharma (FB only)
  - Danish Constructions
- The "Test" client became Shoaib's own client **"Shoaib Nabi Noor"**, with two projects:
  - **Ads by Shoaib**: the Ads By Shoaib FB Page.
  - **Personal Profiles**: his TikTok moved here, plus his personal LinkedIn and Instagram.
- **LinkedIn personal profile** (9644a55):
  - A separate LinkedIn app, "Ads by Shoaib — Personal" (client 77q4sr68at5rhi), with OpenID + Share on LinkedIn. The Community Management API must stay alone on its own app.
  - API Vault service `linkedin_personal`.
  - Callback `/api/social/linkedin-personal-callback`.
  - Tokens last 60 days, then reconnect from the LinkedIn tile. Shoaib connected it.
- Facebook personal profiles can't be posted to by any app. Personal Instagram must be switched to Professional first.

**Graphic Studio → Video Studio** (separate repo `Rana642/Graphic-Studio-By-Shoaib`, commit 0efd416)
- Built on Shoaib's fork `Rana642/video-use`, cloned at `C:\Users\PC\Developer\video-use` and registered as the `video-use` skill.
- The fork carries two fixes, both pushed:
  - A caption-style env var.
  - A Windows subtitles-path fix.
- Brand captions and a logo end-card. MCP `studio_video_*`. `/videos` page and a Videos column on Costs.
- The `video_generations` table was created (SQL run).
- Tooling: ffmpeg 9.0.2 (winget), a valid ElevenLabs key (free tier) in the video-use `.env`, and yt-dlp (run as `python -m yt_dlp`) for links.
- Graphic Studio is **not deployed anywhere yet**. It runs at localhost:3010; the plan is a separate Vercel account. Video Studio stays local-only.

## 2026-09-30 (office PC)

**Social posts for Tad Pharma and Meezab Z (KB data in Supabase; one code change)**
- Shoaib's rule for AI-generated posts:
  - **Locked:** the written content, logo, original product (identical even when AI re-renders it), footer strip + vet line, and brand colours.
  - **Free:** scene, background, layout and styling.
- Both `social-post-design-lock` docs were rewritten as `locked` + `creative_freedom` + a safety `do_not`.
- Both 30-day calendars were rebuilt from Day 1:
  - Every day has a `layout_idea` and a poultry/farm `background_idea`.
  - Text, captions and attachments are unchanged.
  - The reference look is Tad Day 11 (approved).
- New marketing doc `product-brief-posts` for both brands: one social post per product (Tad 17, Meezab 9), important points from the original brochure, English.
  - Categories `english` / `urdu` / `mix` (the last two are empty for now).
  - Separate from the calendar.
- New MCP tool `kb_get_product_post` ("Aminotox ki brief post design karo"). It shares its prompt/caption/images builder with `kb_get_social_post`.
- ChatGPT's connector can't download jsDelivr images, so attach the logo and product photo files yourself.

## 2026-09-28 → 2026-09-30

**Google Business Profile (live)**
- The API was approved 2026-09-29 on the GCP project **"Socially Snap"** (875327223530, 300 QPM), not "Ads by Shoaib CRM".
- OAuth client: API Vault service **`gmb`** (client_id, client_secret).
  - The consent screen is branded Socially Snap and is **In production**.
  - Branding verification is pending. Retry after 24 h via "I have fixed the issues". adsbyshoaib.com is now a Domain property in Search Console.
- `lib/gbp.ts`:
  - OAuth, locations, reviews and replies.
  - Reusing one grant across projects (`linkFromGrant`), and auto-matching the location by project name (`matchLocation`).
  - Planner posts (`publishGbpPhotoPost`, `gbpCaption` drops phone-number lines).
- Routes:
  - `/api/dashboard/gbp/authorize`
  - `/api/gbp/callback`, which must be an Authorized redirect URI (prod + localhost).
- Tables:
  - `gbp_connections`: one per project, encrypted refresh token.
  - `gbp_write_log`: the pacing log.
- UI:
  - `/dashboard/gbp`: connect or reuse, pick the location, reviews with All / Needs reply, reply.
  - A Google Business tile on the Connections hub.
  - A `google_business` platform in the Planner.
- The cron (`app/api/social/cron`) posts to GBP. When the pace gate says wait, only the Google part is retried next run.
- MCP (`lib/mcp-gbp-tools.ts`): `gbp_list_connections`, `gbp_list_reviews`, `gbp_reply_review`, `gbp_request`. Every write needs `confirm=true`.
- **Google-friendly pace (standing rule):**
  - Never bulk. At least 5 minutes between any two GBP writes across all projects, and at most 20 per location per 24 h.
  - Every GBP write MUST go through `paceGbpWrite()`.
  - The same rule is the KB global rule `google-friendly-pace`.

**Dashboard**
- The sidebar is grouped into Sales / Clients & billing / Marketing / Admin, and the nav scrolls on its own. `Sidebar` accepts `nav` items and `{ section }` headings.
- Client portal:
  - It now uses `DashboardShell`, through `components/portal/PortalShell.tsx`.
  - `/portal/planner` is `PlannerCalendar mode="client"`: view, add graphics on a day, and remove only their own pending uploads.
- `/dashboard/ads` is the Meta Ads page for client ad accounts (Meta App Review demo).

**Knowledge base (MCP `kb_*`, data in Supabase)**
- Tad Pharma and Meezab Z. International are complete: products, verified Urdu, presentation pages, 30-day calendars.
- `kb_get_social_post` returns the Day N image prompt plus the original images.
- Meezab rules:
  - Facts come from the PDF and the raw pack photos, and the pack wins on a conflict.
  - Only products that have a PDF count.

**Pending**
- GBP: the first real Planner → GBP post needs watching. Next phases are performance metrics and profile info editing.
- Meta App Review demo and submission. LinkedIn CM API approval.
