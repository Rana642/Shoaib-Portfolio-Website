# Work log

Newest first. Short notes so work can continue on any machine. The full
context (decisions, gotchas, rules) is in the second-brain vault:
`Obsidian-my-2nd-Brain/03-Projects/Shoaib-Nabi-Noor/memory/MEMORY.md`.

## 2026-10-09 — WhatsApp Overview dashboard + collapsible section menu
- **Overview:** `/dashboard/whatsapp/overview` (first item in the WhatsApp menu). Filters: 7/30/90 days and per number.
  - **Right now:** waiting for a person (Requesting), unread, chats inside the free 24h window.
  - **Period:** conversations / new contacts, received, sent (team · auto · template), median reply time, % answered within 24h, won/booked + Rs.
  - Messages-per-day stacked chart (cobalt received / forest sent; palette validated; hover tooltip + table view), sources bars, broadcast delivered/read %.
  - All from one SQL fn `wa_overview_stats(account_ids, since)` (run).
- **Collapsible menu:** a "Collapse" button at the bottom shrinks the WhatsApp menu to icons, remembered in localStorage (`whatsapp-nav-collapsed`).

## 2026-10-09 — WhatsApp section menu + code in one place (Socially Snap-ready)
- **Menu:** `/dashboard/whatsapp/*` has its own section menu (`components/whatsapp/WhatsAppNav.tsx`, `whatsapp/layout.tsx`): Inbox · Broadcasts · Templates · Automation · Numbers · Pricing.
  - The main sidebar drops to its icon rail there (`DashboardShell` `RAIL_ROUTES`); its toggle opens it for that visit only.
  - Phones get a row of tabs instead.
- **Numbers:** now a page (`/dashboard/whatsapp/numbers`) with Connect, link/unlink/delete and the webhook details. The inbox toolbar buttons are gone.
- **Code:** all WhatsApp logic moved into `lib/whatsapp/` (`index.ts` = the old `lib/whatsapp.ts`, plus automation / broadcasts / conversions / onboarding / rates / template-shared / templates / words).
  - Imports updated. `@/lib/whatsapp` still resolves.
  - **To move WhatsApp to Socially Snap, take:** `lib/whatsapp/`, `components/whatsapp/`, `app/dashboard/(authed)/whatsapp/`, `app/api/whatsapp/`, the `wa_*` tables, and the actions in `lib/dashboard/actions/whatsapp.ts` + `lib/portal/whatsapp.ts`.

## 2026-10-09 — Holidays + weather in the Planner, email domain check
- **Holidays:** Pakistan public holidays from caldays.com (`lib/holidays.ts`; current year only; moon-sighted days marked `*`). They show as a citrus chip in the Planner week and month views.
- **Weather:** Open-Meteo (`lib/weather.ts`, geocodes the city). Planner days show `emoji max°/min°` and rain ≥40%, for the next 16 days.
  - Each project has a new `client_projects.city` (SQL run), editable on the client page.
  - The three Multan projects (Silver Sand, Elegant, Toni and Guy) are pre-filled with Multan.
- **Email domain check:** Settings → "Email domain check" (`lib/domain-email-check.ts`, Node DNS). The AGPC API from the fork didn't respond.
  - Checks MX / SPF / DKIM (common selectors incl. resend) / DMARC with a score and a fix for each.
  - adsbyshoaib.com = 75/100: only DMARC is p=none.
- **MCP:** `pk_holidays`, `weather_forecast`, `domain_email_check` (`lib/mcp-utility-tools.ts`, registered next to the content tools — local + remote).

## 2026-10-09 — Free APIs from the public-apis fork: live USD→PKR + email check
- **Live rate:** `lib/fx-rate.ts` fetches USD→PKR from fawazahmed0 currency-api (jsDelivr, with a pages.dev mirror; cached 6h; Rs 280 fallback).
  - Used by the WhatsApp pricing calculator (prefilled with a "today's rate" note and reset) and the broadcast cost estimate.
- **Email check:** `lib/email-check.ts` uses Disify (no key). It rejects temporary inboxes and domains with no mail server, and suggests typo fixes (gmial → gmail).
  - Fail-open on timeout (2.5s).
  - Wired into `/api/contact` (contact + setup order forms), `/api/newsletter` and portal-login creation.
  - The forms show the message under the email field (422 + `field: "email"`).

## 2026-10-09 — Quran Cloud + Iconify MCP tools; glass effect dropped for good
- **New MCP tools** (`lib/mcp-content-tools.ts`), registered with the KB tools, so they are on both the local and remote servers. Both APIs are free and need no key; Shoaib picked them from his public-apis fork.
  - `quran_get_ayah`: the exact Tanzil quran-simple Arabic, numbered words, and translations (en.sahih and ur.jalandhry by default; the translations are for meaning only).
  - `quran_search`: finds ayat by keyword.
  - `kb_add_verified_ayah`: saves an ayah, or a word-range excerpt, into the global rule `occasion-posts` → `verified_texts`. The Arabic is copied from the API and never typed. It has a preview/confirm gate and can list the text under an occasion.
  - `icon_search` / `icon_get_svg`: Iconify, 200+ open icon sets, with the licence per set. Brand glyphs such as WhatsApp are in simple-icons.
- **Glass effect banned** (Shoaib: "Glass effect 1 dafa k liye bilkul khatam ker do", 57d9236):
  - KB global rules `design-glass-light` and `text-readability` were rewritten.
  - An override note was appended to the REEFCO, Tad and Meezab design locks and DESIGN.md.
  - Readability now comes from scenes that are generated with real empty, light space, plus the size floor and contrast gate.

## 2026-10-09 — WhatsApp Numbers popover
- **Popover:** shows "Linked to <client — project>" or "Not linked — free". It has **Unlink** and **Delete number**.
  - Delete removes the number's chats, messages and broadcasts.
  - Our app is unsubscribed from the client's WABA when no other number uses it. It never touches the Socially Snap test WABA.
- **Behaviour:** closes on outside click / Esc / after saving. The dropdown re-mounts so it shows the saved link. Full-width on phones.
- The test number +1 555-202-0163 was unlinked from Silver Sand.

## 2026-10-09 — WhatsApp broadcasts
- **Page:** `/dashboard/whatsapp/broadcasts` ("Broadcast" in the toolbar). Pick an approved template; variables can use `{name}` (first name, with a fallback).
  - Audience filters: status, tag, source, last-message window. STOP contacts are always excluded.
  - Shows a live count and an estimated cost (Meta rate by country code, plus ~4.5% bank fee and advance tax).
  - Marketing templates require an opt-in tick. Send now or schedule (PKT). Stop button.
  - Past broadcasts show sent / delivered / read / replied / failed (SQL fn `wa_broadcast_stats`).
- **Sending:** tables `wa_broadcasts` + `wa_broadcast_recipients` (SQL run). The every-minute `whatsapp-auto` cron sends 60 per run.
  - Rows are claimed (queued → sent) before sending, so overlapping runs can't double-send.
  - Webhook receipts update recipients by wamid and never move a status backwards.
  - Broadcast messages land in each chat as via `broadcast`. They don't mark the chat Intervened and don't trigger follow-up nudges.
- **Limit:** 5,000 contacts per broadcast.

## 2026-10-09 — WhatsApp message templates
- **Templates page:** `/dashboard/whatsapp/templates` ("Templates" in the toolbar). It lists templates live from Meta per number (approved / pending / rejected, with the rejection reason).
  - Builder: name, Utility/Marketing, language, header, body with `{{n}}` and example values, footer, up to 3 quick replies and 1 link button, with a live preview. Submits to Meta for review.
  - Delete: Meta blocks reusing a deleted name for 30 days.
- **Inbox:** "Send a template" when the 24h window is closed, and a "Template" button while it is open. Pick a template, fill its variables, preview, send.
  - The message is stored as type `template` with the rendered text and counts as a staff reply (Intervened).
  - Works in the client portal too.
- **Not sendable from the inbox:** media/carousel templates and links with variables (hidden from the picker). Authentication templates are also hidden. Opted-out (STOP) customers can't be sent templates.
- **Code:** `lib/whatsapp-templates.ts` (Graph calls), `lib/whatsapp-template-shared.ts` (types, validation, preview), `components/whatsapp/Templates.tsx`.

## 2026-10-09 — WhatsApp pricing calculator + general-business wording
- **Calculator:** `/dashboard/whatsapp/pricing` ("Pricing" in the WhatsApp toolbar) uses **Meta's official USD rate card, effective 1 Oct 2026** (`lib/whatsapp-rates.ts`, 47 markets — not AiSensy's resale list).
  - Inputs: number count, PKR rate and margin %.
  - Pakistan: marketing $0.0473; utility, authentication and service $0.015 each.
- **After-tax pricing (Pakistan):** the calculator adds the bank's foreign transaction fee (default 4%, HBL standard) and s.236Y advance tax: 0.5% filer, 1% non-filer (Finance Act 2026, from 1 Jul 2026). The advance tax is adjustable against the yearly income tax. There is also an optional "other tax %".
  - Pakistan after tax for a filer: utility/service ≈ Rs 4.39 and marketing ≈ Rs 13.84 per message at Rs 280/$.
- **Meta billing from 1 Oct 2026:** service messages are charged again, with 1,000 free per number per month.
  - A WABA with **no payment method stops delivering service messages** once the free 1,000 are used.
  - Messages sent from the WhatsApp Business app (coexistence) stay free.
- **General business, not hotel-only:** a number whose project has a hotel booking source gets hotel words (Room / Check-in / Nights / Booked). Every other business gets Sale / Product / Date / Quantity / Won / Lost (`lib/whatsapp-words.ts`). "Guest" became "customer" and the panel is now "Contact Profile".

## 2026-10-09 — WhatsApp live chat, AiSensy-style
- **Layout:** three panes (chat list / chat / Guest Profile), with search and a source filter on top. One component (`components/whatsapp/Inbox.tsx`) serves both the dashboard and the portal.
- **Tabs:**
  - **Active** — automation handles it.
  - **Requesting** — guest unanswered 15+ min, or a Ref-code booking request.
  - **Intervened** — staff replied or pressed Intervene. Auto-replies pause until **Resolve**.
- **Guest Profile:** came-from, status, booking, tags, notes, reply-window timer.
- **STOP / START** opt-out is respected by the automation.
- **DB:** new wa_contacts columns `intervened_at, resolved_at, tags, notes, opted_out_at`. The SQL has been run.
- **Next:** template messages for chats past the 24h window.

## 2026-10-09 — Planner Instagram fix
- **Cause:** hotel FB/IG page tokens died after the 6 Oct "revoke all", and reconnecting did not refresh them. Facebook (re)connect now refreshes every project's page tokens (187dad7).
- **Friday-4:** today's post went out on Instagram for both hotels at ~13:15 PKT.
- **Rule:** Friday posts always go at **10:00 AM PKT**. Best-time is advice only and is never applied to Friday posts.
- **Still open:** the missed IG posts 27/28/29 (6–8 Oct) are waiting on Shoaib's call.

## 2026-10-08 (night) — Bookings like the hotel admins, Portal Passwords, WhatsApp automation
- **Bookings (portal + dashboard):** a hotel-admin-style list (status tabs, search) and a detail page.
  - Status and notes are written to each hotel's own DB, with its side effects.
  - Elegant "Completed" fires its Meta/GA4 signal through a signed hook (Elegant repo 118d145).
- **Portal Passwords (Owners only):** zero-knowledge sharing of a client's vault entries.
  - The Owner's PIN keypair is made in their browser; Shoaib's unlocked vault seals the copies.
  - Switch: client page → "Share passwords with the portal Owner".
- **WhatsApp phase 4:** automation (instant / after-hours / follow-up, all off until written) and quick replies. Runs every minute on pg_cron `whatsapp-auto`.

## 2026-10-08 (evening) — Dashboard/portal speed
- **Root cause:** functions ran in US East while the DB is in Sydney (~200 ms per query). Now `vercel.json` regions = `syd1`.
- **Auth:** checked locally via `getClaims` (no Supabase Auth call per page), and once per request.
- **Smaller fixes:**
  - Analytics load on the public site only.
  - Removed 3 unused home sections.
  - All dependencies are in use.
- **Portal:** a direct login can now be created with a password (Portal access → Password field). Muhammad Ajmal's portal now has WhatsApp + Bookings on.

## 2026-10-08 — WhatsApp inbox (Socially Snap app)
- **Meta app:** new Meta app "Socially Snap" (WhatsApp, verified Socially Snap business). Test number +1 555-202-0163. The permanent system-user token is in the API Vault (`whatsapp`).
- **Phase 2 built (717ce3a):**
  - `/api/whatsapp/webhook` (signed, deduped; guest messages, phone-app echoes, delivery receipts).
  - The Ref code is saved per chat.
  - `/dashboard/whatsapp` inbox with replies inside the 24h window and a chat status.
- **Webhook:** registered with Meta via the API (messages + smb_message_echoes).
- **Also today:**
  - Meta ads check for the hotels: Silver Sand got 2 web bookings in 2.5 days; Elegant gets WhatsApp/call leads.
  - Ref-code guide PDF for the hotel staff (`client-briefs/`).
- **Live test passed:** a real phone message arrived (Ref captured), and the dashboard reply was delivered.
- **One portal for clients (32259db):**
  - Portal **WhatsApp** + **Bookings** tabs (features `whatsapp` / `bookings`).
  - Bookings = each hotel website's own bookings, read live and read-only, + WhatsApp "Mark as booked".
  - Dashboard has **Bookings** and **WhatsApp → Numbers & businesses** pages.
  - Hotel DB keys are pasted by Shoaib at /dashboard/bookings and stored encrypted.
- Both hotels' booking sources are connected. Silver Sand bookings now save their ad source (its migration-phase17 was run).
- **WhatsApp phase 3:**
  - Source picker for code-less bookings.
  - A WhatsApp booking links to its hotel booking ref, so it's counted once.
  - The monthly report gets Bookings + Bookings by source.
- **Next:** phase 4 automation (auto-reply), then App Review, then hotel numbers via coexistence.

## 2026-10-06 (night) — Retainer billing phase 1: Retainers
- **New:**
  - `retainers` + `retainer_items` tables (+ `invoices.retainer_id/period`, unique per month).
  - `/dashboard/retainers` list and detail/edit page.
  - Sidebar link.
- **Automatic:**
  - Proposal accepted → retainer is created from its monthly lines.
  - Agreement signed → first draft invoice (one-time + first month).
- **Optional tools:** every line has a tick, and tools start unticked. Unticked lines stay on the retainer but are never billed.
- **Backfill:** PRO-2026-006 (Ahmed Jahanzaib Shah) gets Rs 20,000/month; Claude Pro is unticked. The **October draft is created** (due 13 Oct). Shoaib reviews it and sends.
- **Phase 2 done:** `/api/billing/cron` runs every day at 06:00 PKT via Supabase pg_cron `billing-cron` (token `billing`).
  - On the 1st it creates the month's drafts.
  - Shoaib gets a "ready for review" email.
  - It catches up on missed months and is safe to re-run.
- **Phase 3 done: monthly client reports.**
  - **Pages:** `/dashboard/reports` (build any client + month) and `/dashboard/reports/[id]` (summary, refresh numbers, data sources per project, Print/PDF). Public `/report/[token]` shows drafts only to a logged-in admin.
  - **Contents:** the KB work log + Google Ads, Meta, GA4 (real actions only), GBP and social numbers.
  - The 1st-of-month cron also builds last month's draft report.
  - Hotels' sources are set; the Muhammad Ajmal October draft is built.
- **Phase 4 done: send.**
  - The invoice page has "Send invoice + report", which also sends the previous month's report. An optional email goes to the client + portal users.
  - The report page has a standalone "Send report".
  - New public `/invoice/[token]` page (balance due, Download PDF). Drafts are hidden from clients.
- **Next:** phase 5, the portal "Invoices & Reports" tab. Plan: `docs/RETAINER-BILLING-PLAN.md`.

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

## 2026-10-06 — Hotels: ads LIVE (Silver Sand + Elegant)
- **Budget (daily, per hotel):** Google Rs 2,000 + Meta Rs 2,000, Rs 8,000/day in total. Client brief PDF approved (`client-briefs/`, untracked).
- **Google** (both accounts): Brand Rs 300 + "Hotel in Multan" Non-brand Rs 1,700.
  - Ads corrected (new prices, review counts, 25% deals); all 9 approved.
  - Elegant got 40 negatives.
  - No call or WhatsApp assets (website-first rule).
  - Old campaigns paused.
- **Meta:**
  - Access fixed: the system user got MANAGE on the ad account, the ABS Marketing app was published (icon, privacy/terms URLs), and the token was rotated.
  - Live: "Website → Contact" (Rs 1,500, optimises the pixel Contact event) + Retargeting (Rs 500) per hotel.
  - Paused: the old Search-optimised and click-to-WhatsApp campaigns.
- **Rule (Shoaib):** ads go to the website first; never open WhatsApp or a call directly.
- **robots.txt:** only Meta's crawlers can read /privacy and /terms (a584b91). Search engines stay blocked.
- **GA4 cleaned** on both properties (key events plus active internal-traffic filters). The GA4 token now has analytics.edit.
- **Client work log (all clients):**
  - KB global rule `client-work-log`.
  - `client-report-log-2026-10` created in all 16 KB projects and backfilled with the real October work, for month-end client reports.
- **Rule:** memory, vault, work log and the client KB log are updated automatically after every task. Shoaib no longer needs to ask.
- **Retainer billing plan approved:** `docs/RETAINER-BILLING-PLAN.md`.
  - Auto monthly invoices on the 1st (draft → Shoaib sends) plus monthly client reports.
  - Ad spend is not invoiced.
  - On Send, the invoice + report also publish to the client portal for Owner and Member roles; drafts stay hidden.
  - Build not started.
- **Next:**
  - Confirm the Meta website ads get approved and Google impressions start (0 so far on 5–6 Oct).
  - Monday: first report by Ref code.
  - Open security task: strip the access token from meta_ads_get paging URLs.

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
