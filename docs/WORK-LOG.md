# Work log

Newest first. Short notes so work can continue on any machine. The full
context (decisions, gotchas, rules) is in the second-brain vault:
`Obsidian-my-2nd-Brain/03-Projects/Shoaib-Nabi-Noor/memory/MEMORY.md`.

## 2026-10-03 (evening) — Social design system, content-is-ours, Jummah library, Meezab

- **Design system (Tad, then Meezab — same client):**
  - KB `design_system/main` = each project's DESIGN.md: tokens, logo A (top-left, info posts) / B (top-centre, greetings and brand), brand device (Tad chevron, Meezab teal square), glass tints, icons.
  - The locks carry a `design_system` key, the crop rule and the Arabic-on-Jummah exception.
  - Code prototype in graphics-studio `scripts/social-design` (9429052).
- **Global rules:**
  - `layout-alignment` grew: think-first, rule of thirds, minimal, one light source, AI decides layout and scene, professional shapes and icons, 9:16 safe zones.
  - `presentation-ideas`: 9 patterns.
  - `content-ours`: every word approved in the KB before design.
- **Occasion copy:**
  - `kb_get_occasion_post` uses only approved words from the `occasion-copy` doc (ac29e54). A variant written for the date wins (157a972).
  - New tools: `kb_list_occasion_copy`, `kb_save_occasion_copy`, `kb_approve_occasion_copy` (fe2a034). `kb_get_brief` shows the DESIGN.md.
- **Jummah library:**
  - 17 new verified texts (9 ayat, 3 duas, 5 Sahih hadith). The Arabic is taken from the source (Tanzil, hadith-api), and references were checked on sunnah.com.
  - 16 Islamic style families.
  - Tad and Meezab each have 16 approved dated Fridays (9 Oct 2026 – 22 Jan 2027), offset 8 weeks so the two pages never post the same verse on the same day.
  - The Tad and Meezab World Animal / Egg / Food Day copy is approved.
- **Open:**
  - OpenAI credits (samples).
  - Tad: official white logo and real farm photos.
  - Meezab: confirm the 18 Oct anniversary post.
- **ChatGPT:** refresh the connector to see the 3 new tools.

## 2026-10-03 (later) — KB MCP design rules for ChatGPT testing

- **Why:** the OpenAI API balance ran out (the $5 on the Socially Snap org). Shoaib now tests post design through ChatGPT on the remote KB MCP, so the image is made on his ChatGPT plan.
- **New global rules:**
  - `layout-alignment`: one shared left edge or one centre line, equal cards, no empty cards, headline at most 2 lines, logo ~30% width for a wordmark, and a self-check (score 0–100, pass 70+, one retry with "fix only").
  - `presentation-ideas`: 8 presentation patterns plus a shapes library, distilled from Shoaib's inspiration posts.
- **Every calendar and product post prompt now carries** `layout_rule_every_project`, `layout_plan` (counted from the post's text) and `presentation_idea_this_time`. Ideas rotate with no back-to-back repeats.
  - Occasion prompts carry the layout rule too.
  - Commits: 77dd740, 83099dc, 8cebbd2, a32a1f2.
- **Tad `social-post-design-lock`:** the stale "solid dark panel" lines were removed and an ALIGNMENT line was added.
- **Tad 11-type redo** (scratchpad `generate4.ts`) is paused at Product Spotlight draft4 until the API credits are added.
  - The pipeline now has an alignment grid, a judge layout check, a logo placed on the measured text edge, and saves every attempt.

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
