# Work log

Newest first. Short notes so work can continue on any machine. The full
context (decisions, gotchas, rules) is in the second-brain vault:
`Obsidian-my-2nd-Brain/03-Projects/Shoaib-Nabi-Noor/memory/MEMORY.md`.

## 2026-10-05 (evening, later) — Facebook posts missing from the feed: fixed
- **Bug:** native Facebook scheduling used `/{page}/photos` with `published=false` and `scheduled_publish_time`. Those posts published only into the **Photos album**, never the Posts feed. This affected every native FB post since 16 Sep: Hotel Elegant and Silver Sand (20 each) and the Aijaz brands since 2 Oct.
- **Fix a95bbf5:** the photo is uploaded unpublished, then a scheduled `/{page}/feed` post carries it with `attached_media`. The post id is now `{page}_{post}`.
- **33 upcoming posts were resubmitted** with a temporary route, then a `/{page}/scheduled_posts` audit was run:
  - 4 stale drafts whose silent delete had failed were removed.
  - 0 untracked items remain.
  - Both routes were deleted (0879ca4).
- **Also today:**
  - `social_delete_post` MCP tool (47d0b14). It cancels the FB draft strictly before deleting, and appears only in new sessions.
  - Aijaz Friday 9 Oct cleared: the 4 promo posts moved to Sun 11 Oct.
  - Avalon 80.png (10 Oct) deleted.
  - Toni & Guy "Deal 5" scheduled 5 Oct, 18:45 PKT.
- **Open:** past photo-only posts were left as they are; ask Shoaib whether to re-post any. Verify that the 18:00 and 18:13 posts on 5 Oct show in the feed.

## 2026-10-05 (night) — Hotel Silver Sand Multan: KB + parity plan
- Same client as Hotel Elegant. Shoaib wants Silver Sand brought to the same standard first, then an ads plan for both hotels.
- **KB built** (project "Muhammad Ajmal — Hotel Silver Sand Multan"):
  - Docs: NAP locked to GBP (514 Akbar Road, Railway Colony, Multan 60000 · 0300 8720939), brand, ICP, pains, graphic/system rules, offers-and-policies, competitor-and-keyword-research, ads-audit-2026-10, nap-consistency-audit, fix-checklist.
  - 4 room products and 7 assets.
- Repo `Rana642/Hotel-Silver-Sand` (Vercel), local `D:\Rana Shoaib\My Projects Website\Hotel Silver Sand Multan`. Its Supabase is PRODUCTION.
- **Audit highlights:**
  - NAP mismatch: "near Aziz Hotel Chowk, Cantt" in the address; phone shown as 0300-872-0939.
  - Review count 837 (GBP 845).
  - Static "From PKR 3,000" fallback.
  - No /admin tracking guard.
  - Last Minute deal expired 30 Sep. Deal engine picks by priority, not biggest discount.
  - Google Ads: GBP local actions are primary conversions.
  - GA4: page_view, view_item_list and first_visit are key events.
  - Meta ad sets on Search optimisation: Rs 40.6k for 3 purchases.
- **Already fine:** Purchase at submit (Pixel + CAPI), Ads booking conversion, no GTM, one-page /reservations.
- **Waiting on Shoaib / owner:** Booking.com standard + Genius rates, deal percentages, Last Minute renewal, whether deals need advance payment, bank details.
- **Done the same night, live** (Silver Sand repo):
  - Phase 1 (f253b8a):
    - NAP = GBP; review count 845; fallback prices fixed.
    - /admin tracking guard. A browser that opens /admin gets `hss_internal`; clear it with `?hss_internal=0`.
    - WhatsApp "Ref:" code. A global wa.me/tel listener fires the Ads conversions.
    - Expired promos hidden; biggest discount wins.
  - Phase 3 (526b817): room-card dates popup → highlighted room on /reservations; mobile one-line search; mobile total above Book Now.
  - docs/TRACKING.md added (b83750b).
  - Dev launcher `hotel-silver-sand-dev` on port 3030.
- **Phase 2, live** (Silver Sand repo):
  - Shoaib's decisions: offer = Booking.com standard −20%; tax-exclusive, +16% GST at checkout; deals 25/25/30 taken off the standard rate; **no advance payment** (Shoaib said not to add it for now).
  - Rates (standard → offer): King 3,500→2,800 · Double 8,500→6,800 · Triple 7,500→6,000 · Twin 7,000→5,600.
  - Last Minute runs to 31 Dec: check-in today or tomorrow, Thu–Sat, booked 3 pm–midnight.
  - Commits: 5f52bdf (code), then the DB switch, then b359234 (empty-commit rebuild).
  - Gotcha: static pages refresh only on an admin room save or a redeploy.
- **Google Ads:** bidding is already clean. GBP local actions are not biddable, so no change was made.
- **GBP:** 24 review replies queued as DRAFT for Shoaib's approval.
- **Facebook:** the page map pin is in Chennai. Owner must fix it.
- **Still pending:**
  - Phase 2 decisions.
  - GA4 key-event cleanup (UI).
  - Meta: move off Search optimisation; refresh creatives.
  - GBP: remove Pool, set check-in to 24h.
  - Instagram / TikTok / OTA NAP check.

## 2026-10-05 (evening) — Planner "needs changes" (uploader alerts)
- **Rule (Shoaib):** before captioning or scheduling, check every planner post: the right project, the right day, small text in photos, the icons, and the contact details.
- **New status `needs_changes`** with `review_note` and `review_flagged_at`.
  - **SQL:** run the "Planner: needs changes" section of `supabase/dashboard-schema.sql`. Flagging fails until it runs; everything else keeps working.
- **MCP tools** (remote and local, shared in `lib/post-review-tools.ts`):
  - `social_request_changes` holds a batch of posts and emails each uploader ONCE (Resend, bcc + reply-to Shoaib).
  - `social_clear_changes` clears a flag.
- **Scheduling a held post is refused** (`setCaptionAndSchedule` guard). The pending list shows the held count, and `get_post_image` shows the note.
- **Portal Planner:**
  - A banner and a popup appear on arrival (once per set of flags per session). Each post has its issue plus **Replace image** and **Remove**.
  - Replacing keeps the same day and slot and returns the post to `pending_caption`. The old image is deleted, and Shoaib gets an email with what was fixed.
  - Portal home shows "N need a change".
- **Dashboard Planner:** an orange "Needs changes" badge with the note and a **Clear** button.
- **Avenza week (5–10 Oct):** 26 posts were captioned and scheduled. Fatima re-uploaded 39 and 38 already fixed ((7) on 6 Oct, (6) on 12 Oct), and both are now scheduled. No Jummah posts were uploaded for 9 Oct.

## 2026-10-05 (later) — Hotel Elegant CRO pass before ads (live)
- **Ads are NOT launching yet.** Shoaib wants the fixes done first. Still blocked on the ad-account side:
  - Conversion-goal cleanup on both platforms (needs permissions or UI work).
  - Meta campaigns still optimise on SEARCH.
  - Stale live ad copy (432 reviews, 8.3, "no advance payment").
  - End-to-end test with a Meta Events Manager test code, using one real deal booking that is cancelled afterwards.
- **LP `/lp/book` deal copy synced** to the live deals (5f61ec6). `lib/lpConfig.ts` LP_PROMOTIONS is hand-kept, so update it whenever the promotions change.
- **Reservations card:** the payment inclusion follows the deal: "Pay in Advance" on deals, "Pay at Hotel" otherwise (2416fcc).
- **CRO (4f634bb):**
  - Deals: the guest pays after booking. The form no longer requires a screenshot. The thank-you page shows `AdvancePaymentBox` (bank details, upload, Send on WhatsApp); `actions/paymentProof.ts` attaches the screenshot and emails the hotel. Guest email updated.
  - Mobile booking form: fields come first, with a compact Grand Total above the button.
  - Mobile reservations: the search bar collapses to "dates · Modify" when dates are already in the URL.
  - WhatsApp booking message reads "incl. GST & City Tax".
  - Not yet tested end to end, because it needs a real booking.
- **Speed check:** TTFB 0.28s, DOM ready 0.39s, CLS 0. AdsBot-Google and facebookexternalhit get 200.
  - Lighthouse is 403-blocked by Hostinger's bot protection, so it can't be used.
  - The free PSI API quota was exhausted.
- **Tell hotel staff:** deal bookings can now arrive unpaid. Follow up on WhatsApp and confirm only once the transfer is verified.

## 2026-10-05 — Hotel Elegant rate parity (live)
- Website commit 0637d79 makes pricing **tax-exclusive like Booking.com** (lib/pricing.ts). GST + City Tax (26%) is added at checkout.
- DB rates (pre-tax): standard = Booking.com standard, offer = Genius 3 (-20%).

  | Room | Standard | Offer |
  |---|---|---|
  | King | 7,500 | 6,000 |
  | Family | 14,000 | 11,200 |
  | Triple | 12,000 | 9,600 |
  | Presidential | 16,000 | 12,800 |
  | Junior | 13,000 | 10,400 |

- A promotion deal now applies only if it beats the offer.
- Gotcha: the DB prices and the pricing code must switch together. Old code with new prices would have undercharged 26%.
- **Deals:**
  - Early Booking 25% (≥7 days ahead).
  - Long Stay 25% (3+ nights).
  - Last Minute 30%, renewed to 2026-12-31: check-in today or tomorrow, Thu–Sat, booked 3 pm–midnight PKT.
  - The biggest discount wins (commit fee79ce).
- **Payment and cancellation, locked:**
  - Regular rate: pay at the hotel, advance optional.
  - Deals: full payment in advance by bank transfer.
  - Both: free cancellation and a 100% refund at any time.
  - Site wording is unified (d238e5f, 2f3648d). The promotions label is clearer (945c3c7).
- New `docs/PRICING.md` in the hotel repo is the source of truth for prices, deals and payment terms.
- **One-page booking (Zehneria-style), live:**
  - Room cards (home, /rooms, LP) and the room page open a dates popup for that room. It lands on /reservations with the room first and highlighted.
  - Book Now there swaps the list for a selected-room row with Modify, plus the guest form on the same page (`ReservationsFlow.tsx`, `BookingForm embedded`).
  - The compact form has full name, phone + email, and a Terms popup where "I Agree" ticks the box. The button reads "Book Now & Pay at Hotel / in Advance". The "Your Booking Details" sidebar shows Pay Now / Balance and the saving.
  - Commits 0b12714, c231548, 2def6f6. The flow is documented in docs/PRICING.md.
  - Dev gotcha: "Invalid hook call" after hot reload means the dev server needs a restart.

## 2026-10-04 (home PC) — Hotel Elegant Executive Suites Multan

**Knowledge base (KB `kb_*`, data in Supabase)**
- New KB for Hotel Elegant:
  - Docs: nap, brand_position, icp, pain_points, graphic_rules, system_rules, memory.
  - 5 rooms as products.
  - 30 assets: logos and real photos.
- Main goal: real guests and bookings from Google Ads + Meta Ads. No calendar work for now.
- **NAP locked = Google Business Profile.**
  - Name: "Hotel Elegant Executive Suites Multan".
  - Address: "Hotel Elegant Executive Suites, 77A, A Block Gulgasht Colony, Multan, 60750".
  - Phone: 0317 3330998.
  - Mismatches on FB, IG, OTAs and the old site are in KB `nap-consistency-audit`.
- Audits and plans in the KB:
  - `ads-audit-2026-10`: Meta was optimising the SEARCH event; Google web conversions were at 0.
  - `website-audit-2026-10`
  - `competitor-and-global-research`: Meta Ad Library was checked in Shoaib's Chrome.
  - `ads-playbook`: draft.
  - `fix-checklist`: has a progress log.

**Website repo `Rana642/Hotel-Elegant-Multan` (all live, verified in the browser)**
- df979ca — tracking fixes:
  - Google Ads conversions now fire on every WhatsApp/Call link. The root cause of the 0 conversions was TrackedLink, which never sent them.
  - Tracking init is inline in `<head>`.
  - /admin and staff traffic are excluded (`he_internal`).
  - The duplicate noscript PageView is removed.
  - WhatsApp messages carry "(Ref: GA/FB/GS/WEB)" codes.
- e491dea — trust and SEO:
  - Review numbers come from `lib/reviewStats.ts` (4.6★ / 631).
  - Booking.com score and links removed.
  - "Five Star" removed.
  - Schema name = GBP name.
  - /reservations gets an H1 and goes into the sitemap.
  - 301s for old URLs.
- ba14736 — phone display in GBP format.
- e532ebd — site-wide WhatsApp/Call buttons now send GA4 events.
- ef3e97e — **Meta Purchase at booking submit** (thank-you Pixel + CAPI, deduped).
  - A confirm-time Purchase was tried and reverted (Shoaib: too few bookings to ever leave learning).
- cc1f294 — `docs/TRACKING.md` rewritten. It is the source of truth for events.
- Hotel DB writes: homepage `stats_json` and `settings.hotel_phone` updated.

**Local dev for Hotel Elegant:** launch config `hotel-elegant-dev` (port 3020) runs `.claude/hotel-elegant-dev.cjs`.
- It must chdir into that repo, or this repo's Tailwind v4 config breaks it.
- It uses the hotel's production DB: never submit test bookings.

**Blocked / pending**
- **Conversion-goal cleanup (blocked):**
  - Google: set Booking Started / Booking Lead secondary and set values. Our mutate tool fails on customerConversionGoals, and the action-level change was refused.
  - Meta: our token has no Advertise permission on act_239008850511120.
  - Shoaib can do both in the UI, or grant access.
- Live ads still carry stale or wrong claims:
  - Meta "no advance payment" on the 20% offer.
  - "432 reviews".
  - Google "8.3 Booking.com".
- On Shoaib or the client:
  - GA4 internal-traffic filter.
  - Search Console access for sc-domain:elegant-suite.com.
  - Booking.com King Room rate parity (8,820 vs the site's 10,773).
  - Fixing NAP on FB/IG/OTAs.
  - Pausing or rebuilding the Meta Search-Opt campaigns.

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
