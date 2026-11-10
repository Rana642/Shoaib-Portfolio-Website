# Work log

Newest first. Short notes so work can continue on any machine. The full
context (decisions, gotchas, rules) is in the second-brain vault:
`Obsidian-my-2nd-Brain/03-Projects/Shoaib-Nabi-Noor/memory/MEMORY.md`.

## 2026-11-10 — Planner: duplicates by content, Audit button (office PC)
- **Why:** the Hotel Elegant November Drive folder showed only 15 of 30 files. 15 had the same names as September posts (1.png, Friday-1.png…) and were skipped as duplicates, but the content is new. Monthly folders reuse names.
- **Duplicates are now judged by content, never by name** (`lib/media-fingerprint.ts`):
  - Every post stores `media_md5` (exact file) and `media_phash` (how a picture looks). Drive imports also store `media_seconds` and `source_drive_id`. These stay after a posted file is deleted.
  - `createScheduledPost` refuses the same file when it is already on the planner, or was posted in the last 90 days. A failed post may be uploaded again. Stories are compared only with Stories.
  - The PC Bulk upload re-plans its days after a refused repeat, so no day stays empty. The portal skips repeats and tells the client. The Drive Fetch uses Drive's MD5 and file id.
  - Posts from before this get their MD5 from the storage ETag, saved on first use. The pre-flight check is now by content too; a same name with content that can't be compared is a CHECK.
- **Audit button** on the Planner (`lib/planner-audit.ts`, `PlannerAudit.tsx`). It checks:
  - the same file twice, or a picture that looks the same
  - Drive folder files left behind (with Import)
  - platforms that can't take a post, or aren't connected
  - the Friday rule; two posts on a day; empty days
  - caption mistakes, posts waiting for a caption, missed and failed posts
- **What gets fixed how:**
  - "Fix safe ones" only drops a platform that can't take the post, or takes emoji out of a caption (the words stay).
  - Remove, Move and Import are always a click.
  - MCP: `social_audit_planner` and `social_audit_fix`.
- **SQL:** Shoaib must run the 4 columns + 2 indexes at the end of `supabase/dashboard-schema.sql`. Until then nothing is compared, and the posts still save.
- **Hotel Elegant audit (local, read-only):** 20 scheduled posts (10.jpg … 29.png, 10 Nov–2 Dec) have emoji in their captions; "Fix safe ones" clears them. Fridays 13, 20 and 27 Nov have no Jummah post. The September 28.png (scheduled 1 Dec) is still to be deleted by Shoaib from the Planner; my delete was blocked.
- **Later the same day (Shoaib):**
  - The Audit is only for posts on the planner; the Drive field is gone from it.
  - The Drive import now checks the folder against the planner itself when it ends (`verifyDriveImport`, by Drive id or content). It reports any file left behind.
  - Drive answered 403 for the last 6 of 29 downloads (rate limit). `downloadFile` now retries after 4 s and 10 s and says why. The Bulk upload tries the slowed files once more after 30 s.
  - Hotel Elegant: 23 imported (3–29 Dec). 9.png was skipped as the same file as a post already on the planner. 32.png, 33.png and Friday-1…4 are still to import: Fetch, then Import again. The Friday files will fill 13, 20 and 27 Nov and 4 Dec.
- **Create post from a link:** the single Create post window has an "Or paste a link" field with a Fetch button. It takes any public picture or video link, or a Google Drive file link.
  - The server fetches it (`fetchPlannerMediaFromLink`) with the same checks: type, size, the duplicate by content (said before Schedule) and video length. It puts the file in storage and shows a preview.
  - Closing the window or choosing another file removes the unused copy (`discardPlannerMedia`).
  - MCP already had this (`social_add_post` `url`).
- **Hotel Elegant captions (10 Nov):** 28 posts are scheduled with 5 researched hashtags each.
  - The "A Proud Moment" Reels (6 and 9 Dec) use the hotel's own fact: NOC approved for foreign nationals.
  - 5.png was deleted.
  - The new-Director post moved to 10 Nov, 5 PM.
  - 061 6210499 is allowed on designs only (KB nap doc).
- **Client portal can fix its own posts:** two new portal switches, set per client like the others; an Owner can give them to the team.
  - "Edit posts": caption, day and time, delete. "Publish now" is a separate switch.
  - With either switch on, a click on a post in the portal Planner opens the same Post details window, running the portal's own actions (`lib/portal/post-actions.ts`). They cover every not-yet-out post of the client's own projects.
  - The checks are the dashboard's own. Caption, time and delete are shared in `lib/planner-post-ops.ts`, which the admin actions now use too. Publish now goes through `publishNow`.
  - Shoaib hears about every change in the client activity report, which now has new kinds: edit, move, publish. A delete is emailed at once.
- **Change image / Change video** in Post details, on the dashboard and in the portal ("Edit posts"). It swaps the file (`replacePostMedia` in `lib/planner-post-ops.ts`) and keeps the caption, day and time, and platforms.
  - It runs the upload checks: the right kind, a video's length per platform, and not the same file as another post.
  - A Facebook draft at Meta is redone with the new file, and is refused when the post's time is close.
  - A held post goes back to waiting for a caption. The old file is deleted unless a Story still uses it.
  - The portal upload URL now also takes MP4/MOV up to 100 MB, for "Edit posts".
- **Portal Add post with the client's own caption:** with one graphic, there is a Time field and a Caption field. "Schedule" needs Edit posts and "Publish now" needs Publish now. The plain "Upload" still waits for Shoaib's caption.
  - The server side is `portalCreatePost` and `portalConfirmNewPost` in `lib/portal/post-actions.ts`.
  - Pre-flight runs first. A FIX keeps the post on the planner, waiting for a caption. CHECK items need "Publish anyway" before it goes out now, and until then the post waits, so it can't slip out on the cron.
  - Each one shows in the activity report.
- **Gotcha:** a broken `.next/dev/types/routes.d.ts` (dev server) makes `tsc` stop at syntax errors and skip the real typecheck. Delete `.next/dev/types` before trusting a clean run.
- **Hotel Silver Sand (10 Nov):** all 29 folder files reached the planner (the last 4 Fridays via MCP after Drive's 403s).
  - 27 are scheduled, 13 Nov – 12 Dec, with the captions in `client-briefs/Hotel-Silver-Sand-captions-Nov-Dec-2026.md`, as written. Shoaib said not to add facts from the posts to the KB.
  - 29.png deleted: it showed a fake 4.8★ / "4-star hotel". It went back to the designer; the corrected file will come back.
  - 23.png (5 Dec) waits for a caption: its "executive rooms / free meeting room" offer must be confirmed by the hotel first.
  - Audit: 0 to fix. 11 Dec has no Jummah post and 10 Dec no post. The next stock fills them (Shoaib's call).
  - Landline settled by Shoaib: **061 4503355** (as on the designs). 061-451-8061 was wrong. It was replaced in all 26 scheduled captions (the 23 new ones, plus 10.mp4, 28.png and 29.png from before), in the project's caption guide (`posting_instructions`) and in the KB `nap` doc.

## 2026-11-09 — Planner: Publish now, post details window (office PC)
- **Post details:** click a post's picture or caption on the Planner (admin) to open it. You can:
  - see it whole and change its time
  - edit and save the caption; the pre-flight findings show at once
  - **Publish now**, **Download** (only while the file is still here, so not for posted posts), and **Delete** (two clicks)
- **Publish now** (`lib/social-publish-now.ts`):
  - It runs the same checks as scheduling, judged as going out now. A FIX item blocks; CHECK items need "Publish anyway".
  - A Facebook draft whose time is still ahead is cancelled first. One whose time has come is left alone, so a live post is never deleted.
  - It then runs the cron's own publish code. MCP tool: `social_publish_now`.
- **Shared publish code:** the cron's loop body is now `publishOne` in `lib/social-publish.ts`. The cron and Publish now both claim a post first (`scheduled_posts.claimed_until`, SQL run by Shoaib 9 Nov), so a post can't go out twice. The Facebook check skips claimed rows.
- **Caption edits** (the new window and MCP `social_set_caption_and_schedule`) redo the Facebook draft only while the time is ahead and nothing has gone out. `recordNativeScheduleResult` now merges instead of replacing, so live, pending, gbp and held entries survive.
- **Retried today:** 3 posts failed on one platform each since 2 Nov:
  - Avenza Avenue: Instagram, posted on retry
  - Hotel Avalon: Google Business, posted on retry
  - Danish Constructions story: Instagram, still queued at writing
  Only the failed platform was retried, by marking the successful ones done.
- A review found 3 issues before push, all fixed: late posts were refused as "in the past"; a live Facebook post could be deleted; caption edits could duplicate a half-sent post.
- **Bulk upload from Google Drive** (`lib/planner-drive.ts`, Bulk upload window): paste a folder link shared as "Anyone with the link", then Fetch, then Import.
  - Images become posts and MP4/MOV videos become Reels. Each gets a free day the same way as a PC upload. Files already on the planner (same name) are skipped.
  - Limits: images 25 MB, videos 100 MB. Bigger videos go up from the PC.
  - The server checks type, size and length with Drive itself. A Reel goes only to the chosen platforms its length fits: FB 3–90 s, IG 3–900 s, YT up to 180 s, TikTok up to 600 s.
  - One file per request, so one failure doesn't stop the rest.
  - The folder link is remembered per project in the browser. It uses the `google_drive` key in the API Vault, the same one the Stories sync uses.
  - **Not tested locally:** `.env.local` has no `API_VAULT_ENCRYPTION_KEY`.
- **Planner from ChatGPT/Claude (MCP)**, so everything the dashboard does can be done from a chat. Same rules as the dashboard (`lib/planner-intake.ts`); the shared rules are in `lib/planner-rules.ts`: which platform takes what, video length, one free day per file.
  - `social_add_post` puts one picture or video on a project's planner. The file comes from the chat as `file` or from a link as `url` (a Drive file link works).
    - ChatGPT passes chat files through `_meta["openai/fileParams"]`, as `{download_url, file_id}`.
    - Optional settings: post, Reel, Story or video; date and time (PKT); platforms; caption.
    - With a caption it is scheduled, unless pre-flight finds a FIX; then it waits without a caption.
    - `publishNow` publishes it after the checks.
    - Generic chat names ("image.png") get a dated name. The same file name twice is refused.
  - `social_import_drive_folder`: the Bulk upload from Drive. It lists first; `confirm` imports in parts of about 25 s, and calling again continues.
  - `social_update_post` changes the day, time, platforms or kind (post↔story, reel↔story↔video). A Facebook draft is redone only while it can be changed safely.
  - `social_create_upload_link` is the fallback when a chat can't pass the file. It gives a 1-hour page (`/planner-upload/<token>`, API `/api/planner/upload`); files go to `social/<project>/link-…`.
  - `lib/safe-fetch.ts`: the https-only, no-private-address download, now shared with the KB tools. It has a size cap.
  - **Not tested live yet:** whether a picture ChatGPT made itself reaches the tool. The forums say it works, but OpenAI doesn't document it. The mobile app was reported to send only a file id; use the upload link there. `.env.local` also has no `MCP_OAUTH_SIGNING_KEY`, so upload links only work on live. Test Fetch on live first; it only reads. Shoaib's folders: Hotel Elegant `1QP8W4h6mpXcGlPpc0a6wfzRwsFwAgavK`, Silver Sand `1uTKatocglUB2CIvXUWhfHJaCf9YS-2MZ`.

## 2026-11-07 — WhatsApp inbox fixes, Socially Snap sidebar, Planner manual time, guards (home PC)
- **Two-PC sync rule** added to CLAUDE.md ("Done" = WORK-LOG + pull + commit + push).
- **WhatsApp inbox:** failure reasons shown, undo for failed replies, "All" tab, business filter always visible.
- **Sidebar:** "Socially Snap Apps" group (Planner, Marketing, GBP as own section, WhatsApp); held-posts banner only on /dashboard and planner/stories.
- **Google Ads API** moved to v25. **CLIF** no longer gets an automatic Story per post (`NO_AUTO_STORY_PROJECT_IDS` in lib/post-as-story.ts).
- **Planner manual time:** new posts, Stories, Reels, Videos can have a hand-set time (`time_manual`, needs the dashboard-schema SQL); older posts unchanged.
- **Planner pre-flight guard** (86941be): `lib/post-preflight-checks.ts` (pure) + `lib/post-preflight.ts`; tool `social_preflight_post`; `social_set_caption_and_schedule` appends the result (advisory, never blocks). Checks caption (emoji, "dealer", repeated word, punctuation, caps), time (past, Friday), duplicates in 90 days. Test: `npx tsx scripts/test-preflight.mts`.
- **Picture guard** (a344b44): `social_picture_check` returns the image + official NAP + graphic rules + checklist; Claude does the reading, no paid API.
- **Graphic Studio** (separate repo): GPT Image 2.6, complexity, markup edit, Exact text phases 1-3, video checks. Own skill `motion-polish` added.
- **Pending:** Vercel deploy needed for remote MCP to show the new tools; restart local MCP. Not yet built: video guards (loudness, black/frozen frames, caption OCR). Unconfirmed: Socially Snap Overview page, saving Ads by Shoaib contact into Graphic Studio brand. Choppers post 18 waits for designer. Untracked, not committed: client-briefs/, Meezab Knowledge base/, Badge pngs, public/svg|webp, scripts/_dl.mts, docs/META-ADS-APP-REVIEW.md.

## 2026-11-02 — connection check, Danish captions, no-emoji rule (office PC, no code changes)
- **Still next:** the Meta App Review video. It wasn't recorded yet; the plan is in the vault memory `meta-app-review-video`.
- **Connections, all healthy** (fb-audit `?debug=1` plus a read-only DB check):
  - **Facebook logins:** both valid, no missing scopes, data access until end of Jan 2027. Ajaz Hussain reconnected on 2 Nov, so Avalon's insights work again.
  - **Page tokens:** all 16 valid with every scope.
  - **Instagram Login:** AvenzaLand and Danish run on it, valid to 30 Nov; the cron refreshes them from about 10 Nov.
  - **LinkedIn:** valid to 27 Dec.
  - **Held posts:** 0.
- **Posting 30 Oct to 2 Nov:**
  - Every post went out, and every Facebook feed post was confirmed live.
  - Exceptions: 2 Stories from 31 Oct (Danish, TONI) failed on Facebook only, with the (#4) app limit. Shoaib decided not to re-send failed ones: "next se continue".
- **Danish 85–92 (2–10 Nov):**
  - Fatima uploaded them on 31 Oct without captions, so today's post was stuck.
  - Each image was checked, captioned and scheduled at 3:30 PM PKT. The Friday 6 Nov Jummah post goes at 10:30 AM, after Avenza Land at 10:00 and Avalon at 10:15.
  - Four headlines repeat older posts. The older designs were pulled from public Instagram and compared: they are different designs, not duplicates.
- **New rule: no emojis in captions**, all projects (KB global rule `captions-no-emojis`).
  - The 8 Danish captions were rewritten without emojis.
  - The 58 already-scheduled captions in other projects stay as they are.
- **Upcoming gaps:** Eventia after 3 Nov, Choppers after 6 Nov, Avalon after 7 Nov, Meezab only 6 Nov, Tad none.
- **Office PC:** C: was cleaned from 1.6 to 19.5 GB free. VS Code and Codex leftovers were moved to `G:\Backups\C-cleanup-2026-11-02`; delete that folder after about 9 Nov.

## 2026-10-31 (evening) — where to pick up: App Review video on the home PC
- **Next:** record the Meta App Review video. The plan, captions, test Page (Ads by Shoaib + @adsbyshoaib) and open decisions are in the vault memory `meta-app-review-video`. Do NOT submit without Shoaib.
- **Facebook logins now:** 15 of 16 Pages are on Shoaib's login.
  - Eventia (FB + IG) and Danish (FB) were moved there at 17:10 (fb-audit POST `move` → `saveFacebookPageMappings`).
  - Only Hotel Avalon is on Ajaz Hussain's login (slot 2). Ajaz should give Shoaib access, then move it.
- **Meta app hourly limit hit (#4)** around 17:00 from debug_token and /me bursts. Login health, the broken count and token owners are now cached (a362241). Page-token posting was unaffected: 11 posts went out OK in the 90 minutes after.
- **fb_login_name:** only the real profile name is saved (eaf17a8). It had briefly been "Facebook login 1" when /me failed.
- **Still open:**
  - Elegant reels ROOM-201/103 need the video files again.
  - The temporary `/api/social/fb-audit` route (cron-auth; debug, choices, move) is still deployed.

## 2026-10-31 — Facebook logins: see and choose which login each Page uses (a33744e)
- **What broke:** Ajaz Hussain (the second login, the same FB user as "Ijaz Danish") reconnected at 16:21. "Newest login wins" then moved 9 Pages onto his token.
  - His login never granted `pages_read_user_content`. It had been dropped from the login scope on 10-28.
  - Facebook insights for those Pages failed with #10, because the post list reads comment counts.
- **Fix:**
  - The scope is back.
  - After a reconnect, a Page keeps its current login unless that login lacks a needed permission.
  - Saving an import no longer refreshes every token.
  - Import Pages shows "via <login>" per Page, a login choice when two logins reach it, the login an imported Page is on now (with a ⚠ when it lacks something, re-selectable to move it), and a login filter.
  - Integrations shows "via <login>" and a ⚠ per account. A login missing permissions shows "Permission missing".
- **Still to do by hand:**
  - Move Avenza Avenue, Avenza Land, Choppers, Choppers Studio, Elegant and TONI&GUY to "via Shoaib Nabi Noor" in Import Pages.
  - Ajaz reconnects for Danish, Eventia and Avalon.
  - App Review should request `pages_read_user_content` (doc updated, not submitted).

## 2026-10-31 — Socially Snap → Settings → Integrations; Ijaz login lost its tester role (0ecd372, 4f19ca7)
- **Integrations:** Connections left Marketing and is now Socially Snap Apps → **Settings** → Integrations. The URL is unchanged (`/dashboard/social`).
  - Each Facebook login card shows its Page count, and a red "Reconnect needed" while Meta has it blocked.
  - Small cards link to Google Business and WhatsApp numbers.
- **Broken login, 30 Oct ~7 pm:** Ijaz Danish's Facebook login kept a valid token with **zero scopes**, so the Avalon, Eventia and Danish Page tokens failed with error 190.
  - Cause: App roles showed **0 Testers**. The app has been Live since 9 Oct with no Advanced Access, so only people with a role can grant permissions. Meta moved app roles into Business Suite around then.
  - Facebook Login also showed "Feature unavailable … updating additional details". Fix: add Ijaz back as Tester; he reconnects with all Pages. The real fix is App Review (`docs/meta-app-review.md`).
- **Cron fix (4f19ca7):** a blocked login is now tracked per account. Before, one blocked Page held back every other held post in the run, which kept TONI&GUY Stories waiting all night.
- **Audit route:** `/api/social/fb-audit?debug=1` runs `debug_token` on every stored login and Page token (validity and scopes, never the tokens).

## 2026-10-30 — Morning report email (5fe341a)
- Shoaib chose a free code report over an AI agent team.
- `lib/morning-report.ts` runs from the social cron and sends one email per PKT day, from 8 AM.
- **Contents:**
  - yesterday's live posts per project and platform, and stories;
  - failures;
  - Facebook re-sends;
  - posts held by a login problem;
  - what's left for today;
  - empty days in the next 7, only where posts are waiting for a caption;
  - what waits on us or on the client.
- **Once a day:** `check_rate_limit('morning-report:<date>', 1)`. No new SQL.

## 2026-10-30 — Facebook posts stuck in Meta's scheduler; every FB post now checked on Facebook (c3dc725, 2e2aa3d)
- **Found:** Shoaib saw no FB posts since 23 Oct on Avalon, Danish Construction and Eventia.
  - An audit of every Page found 36 posts (Avalon 7, Eventia 7, Danish 7, Silver Sand 6, Elegant 4 + 3 reels, Avenza Land 2). They were handed to Meta's own scheduler before the 24 Oct login checkpoint/reconnect, and sat in `/{page}/scheduled_posts` past their time without publishing.
  - The Planner showed them as posted. IG, LinkedIn and GBP were fine.
- **Fixed the same day:**
  - The stuck drafts were deleted.
  - The 5 Jummah posts were re-sent first; the other 28 went out across the evening, FB only.
  - All 62 upcoming native drafts were re-submitted with the current Page tokens.
  - The temporary cron-auth route `app/api/social/fb-audit` (GET audit, POST delete/resubmit) is still deployed.
- **Re-sent rows lost their image:** "Missing or invalid image file", because the upload is deleted after posting. Fix c544c8c: `restorePublishedMedia` now also takes the image from the row's own IG/FB copy.
- **For good:** `lib/social-verify.ts` runs at the end of every social cron.
  - From 20 min after a post's time (for 3 days) it looks each FB result up on Facebook.
  - Live → `verified_at`. Stuck or missing → cancel the draft, post it live now (2 per run), and email Shoaib.
  - Lookup errors are retried; after 4 tries they're in the email.
  - "Missing" counts only when the token can still read the Page, so a permission problem never double-posts.
  - The cron keeps a posted row's upload until its native FB copy is verified, so a stuck Reel can still be re-sent.
- **Open:** Elegant reels ROOM-201 (28 Oct) and ROOM-103 (29 Oct) never reached FB, and their videos are gone (they're on IG). They need the files again.

## 2026-10-30 — Portal uploads: one report per session, not one email per upload
- Shoaib asked for no alert on every single upload (e.g. Fatima uploading one post at a time). He wants one combined report saying which projects' posts were uploaded.
- **On upload or fix:** a portal upload or fixed re-upload marks its post with `scheduled_posts.client_activity` (who, when, note, what was fixed).
- **Sending the report:** `lib/upload-digest.ts`, run from the social cron every 15 min, sends ONE email per uploader once they've been quiet for 30 min, or after 3 h of non-stop uploading. The report lists, per project, the new posts by day, the fixes, and the notes. It then clears the marks.
- **Needs the one-line SQL** (`client_activity jsonb`). Until it's added, uploads still email right away as before.

## 2026-10-30 — Stories watchdog: email when Drive Stories stop
- Shoaib: TONI&GUY Stories must never stop, and he must be told if they do. Only TONI&GUY has a Drive story folder today.
- **How it works.** `lib/story-watchdog.ts` runs at the end of every social cron (15 min) for each `story_drive_sources` project. It flags:
  - a story failed in the last 6 h
  - a story is 90+ min past its time and still not posted
  - no story is on the calendar for the next 24 h
  - the Drive sync errored, or hasn't run for 6 h
- **Emails:** one email when the Stories stop, a reminder every 12 h while they stay stopped, and one email when they run again.
- **Needs the one-line SQL** (`story_drive_sources.alert jsonb`) in `supabase/dashboard-schema.sql`. Without it the watchdog stays quiet.
- **Same day, data fixes:**
  - **Second-login backlog:** the 12 partly-failed rows were re-queued for their missing platforms only.
  - **TONI&GUY checkpoint failures:**
    - 21 already-shown stories moved to 6–8 Nov, so the hourly sync refills 31 Oct – 2 Nov with the 20 stories that failed in the checkpoint and never ran.
    - 11 videos Shoaib rejected (132, 139, 141, 142, 152, 157, 163, 165, 166, 174, 176) were put on `hold_file_ids`.
    - Their 4 upcoming rows were removed. Deleting a file from Drive does not stop an already-imported story.

## 2026-10-28 — Meta App Review prep (Advanced Access for the posting app)
- A /data-deletion page was added here, then **removed again the same day**. The Meta app (Socially Snap business) already uses the Socially Snap site's privacy, terms and data-deletion pages (sociallysnap.adsbyshoaib.com), which were built for this on 2026-09-13.
- The Facebook Login scope dropped `pages_manage_engagement`, which nothing used. Meta rejects permissions it can't see in use.
- `docs/meta-app-review.md` has the settings checklist, use-case text for all 8 permissions (checked against the code) and the screen-recording steps. Waiting on Shoaib: record the video, a demo login, then submit.

## 2026-10-28 — Held-posts alert names the blocked Facebook profile
- The red dashboard banner and the alert email are now **one alert per blocked login**. Each says whose Facebook profile it is, which project/platform it holds up (e.g. "Hotel Avalon Suites (Instagram)"), and to log in as that person.
- The profile name is stored per account in `client_social_accounts.fb_login_name`, set by `refreshFacebookPageTokens` on every Facebook reconnect and after Import Pages. **Needs the one-line SQL** in `supabase/dashboard-schema.sql`. The code works without it; names then show as "not recorded yet".
- Why: the second Facebook login (wife's profile) is no longer in `social_connections`. Hotel Avalon FB+IG, Danish FB and Eventia IG still run on its dead tokens, and the old banner couldn't say which profile was at fault. Shoaib is connecting Ijaz Danish's profile (Tester invite pending) on 29 Oct.

## 2026-10-28 — LinkedIn Company Pages on the Community Management API (1db24d4)
- LinkedIn passed vetting. The "Ads by Shoaib" app (client 77dikbiti3z1fg) has CM API **Development Tier**. The Standard-tier upgrade form is due in 21 days (about 18 Nov) and needs a screen recording plus test login details.
- **Built:**
  - Connect with LinkedIn: `/api/dashboard/social/linkedin/authorize` → `/api/social/linkedin-callback`, with a state cookie.
    - Scopes: `rw_organization_admin w_organization_social r_organization_social`.
    - Credentials come from the API Vault service **`linkedin_company`** (client_id + client_secret).
  - Coming back opens Import LinkedIn Pages. A reconnect refreshes the token on Pages that are already imported.
  - Pages come from `/rest/organizationAcls` (ADMINISTRATOR, APPROVED) plus the org lookup.
  - Posting uses `/rest/images` initializeUpload → PUT → `/rest/posts`.
    - Commentary is escaped for the "little" text format (`toLittleText`, round-trip tested).
    - Personal profiles keep the v2 ugcPosts flow on their own app.
  - Insights adds a LinkedIn section: followers, organic impressions/clicks/likes/comments/reposts against the previous period, and per-post stats. The CSP now allows media.licdn.com.
  - `LinkedIn-Version: 202610`.
- On prod, unauthenticated: authorize → 307 to login, callback → 401.
- On the local dev server every `/api/dashboard/social/*` route returns 404, including the old personal one. That's a dev quirk; prod is fine.
- **Privacy policy (4e2adcb), approved by Shoaib:** LinkedIn in the connected-accounts list and the processors table, plus a new "LinkedIn API disclosure" section. Last updated is now 28 Oct 2026; live check passed.
- **Reviewer login plan:** a portal Team member on client "Shoaib Nabi Noor", planner + uploads only, project Ads by Shoaib only. Shoaib creates it in Clients → Client portal and sets the password himself.
- **Waiting on Shoaib:**
  - add the redirect URL in the LinkedIn app's Auth tab;
  - add the `linkedin_company` vault entry;
  - connect and import his own Page;
  - approve a test post;
  - approve the privacy-policy LinkedIn draft;
  - choose how reviewers log in;
  - give the legal name and address.

## 2026-10-27 — Meta checkpoint (24–26 Oct) + Story Drive day limit (836381a)
- From 24 Oct 10:00 UTC to 26 Oct 17:32 UTC every live Meta call failed with "You cannot access the app till you log in to www.facebook.com and follow the instructions given." That is a checkpoint on the Facebook account that owns the token.
  - FB feed posts that were natively scheduled still went out.
  - 48 rows failed: 37 Stories (21 of them TONI&GUY) and Instagram for 9 feed posts and 2 Reels (Avalon, Eventia, Elegant, Silver Sand).
  - It works again from 27 Oct 05:00 UTC.
  - Shoaib approved re-posting the 11 on Instagram. They are back to `scheduled` with `target_platforms: ["instagram"]`, 28 Oct – 1 Nov PKT, at times that don't clash with each client's own posts. FB + Google results are kept in `result.live` / `result.gbp`, so those platforms are skipped and a reschedule can't delete the live FB post.
- **Fix (836381a):** Story Drive counted only *scheduled* stories toward `per_day`. TONI&GUY's slot hours were refreshed on 27 Oct (now 16–23 PKT), and the hourly sync filled the new hours: 11 Stories that day instead of 8. Posted and failed stories now count too.
- TONI&GUY `109.mp4` (61 s) is skipped. It needs trimming to 60 s.
- The checkpoint came back at 15:00 PKT the same day. Shoaib has to log in on facebook.com with the profile behind Login 1 and reconnect.
- **Hold + alert (0e30c0f), `lib/social-connection-hold.ts`:**
  - A Meta login error (checkpoint, expired, revoked or invalid token) no longer fails a post. It stays `scheduled` with `result.held`.
  - Parts that already went out are kept: Google, Instagram-login accounts, native FB.
  - Blocked accounts are retried every hour, one probe per cron run.
  - Email to `RESEND_TO_EMAIL` (at most every 6 h), plus a red banner on every dashboard page (`HeldPostsBanner` via the `DashboardShell` `banner` prop).
  - The FB and IG OAuth callbacks call `releaseHeldPosts()`. After that, each project gets one late post per run.
  - Stories give up after 12 h, posts after 48 h, then they are marked failed as before.
  - Classifier and DB filters were checked with a read-only tsx script. The banner itself can't be seen until something is held.
- Next (discussed with Shoaib): a System User token for posting, so no personal profile sits behind the Page tokens. Test on one Page first, because the posting app is unpublished (Standard Access).

## 2026-10-27 — Planner failures: Facebook checkpoint (error 190/459)
- **What happened:** 53 Planner posts failed (13 on 24 Oct, 17 on 25 Oct, 18 on 26 Oct; some earlier). Error on 37 Facebook + 43 Instagram results: "You cannot access the app till you log in to www.facebook.com and follow the instructions given." (Graph code 190, subcode 459 = Facebook security checkpoint on the logged-in profile). 3 Instagram: session invalidated; 2: "Media ID is not available".
- **Token check (read-only, 27 Oct):** Facebook login **slot 1** works (reconnected 26 Oct 19:17 UTC) and the Pages/IG accounts derived from it work (Silver Sand, Elegant, Meezab, Tad Pharma, Toni&Guy, Choppers, Choppers Studio, Avenza Avenue, AvenzaLand FB, Rabbi's Glow, Taking My Soul Home, Ads By Shoaib). **Slot 2** (fb_user_id 1641674850883090, connected 23 Oct) still returns 459, and so do its accounts: Hotel Avalon (FB+IG), Eventia 360 (FB+IG), Danish Construction & Co (FB). @avenzaland and @danishconstructionco (Instagram Login tokens, expire 30 Nov) can't be tested against graph.facebook.com — not a failure.
- **Fix:** the profile behind slot 2 must log in at facebook.com and clear the checkpoint, then reconnect slot 2 in Marketing → Connections. After that, re-schedule the failed posts worth keeping (the old stories are stale).
- **Cause:** Facebook doesn't say. Not caused by the 25–26 Oct Meta work (failures started 24 Oct).
- **Decision (27 Oct, Shoaib):** do nothing with the scheduled posts of Hotel Avalon (12), Eventia 360 (8) and Danish Constructions (6); they will fail at their times and be re-scheduled later. The `needs_changes` hold can't be used on already-scheduled posts (only on posts waiting for a caption). Appeal on the suspended profile was submitted 26 Oct 2026 (result expected in about a day). Danish's Instagram still works; its Facebook part fails.
- **Update (27 Oct, screenshot):** the Facebook profile behind slot 2 (shown as "Malaika") is **suspended since 23 Oct 2026**: "Your account may be associated with another account that has gone against our rules… account integrity", 177 days left to appeal, "Request review" available. Facebook gives no further reason. Slot 1 (Shoaib's working login) can see 47 Pages but NOT Hotel Avalon Suites or Eventia 360 (and not "Danish Construction & Co"; it only sees "Aijaz Danish"), so those Pages are administered only through the suspended profile. Fix: the profile owner requests review, and meanwhile an admin who isn't suspended adds Shoaib's profile / gives the "Ads by Shoaib" business partner access to those Pages.

## 2026-10-26 — Socially Snap: WhatsApp App Review APPROVED (Meta)
- **Socially Snap app** (App ID 1891824261787767, Business ID 140523814181893), checked from Shoaib's screenshots:
  - App Review submitted 25 Oct 2026, 13:43 PKT, **approved**: `whatsapp_business_messaging` and `whatsapp_business_management`.
  - Business verification: Verified. Access verification (Tech Provider): Verified. Data access renewal: complete, nothing more to do.
  - The app went live on 9 Oct 2026.
- **Checked in the API Vault (2026-10-26, IDs only):** the `whatsapp` entry is the Socially Snap app (1891824261787767), so it matches the approval. It has `waba_id`, `phone_number_id` and an Embedded Signup `config_id`, so the Connect button shows. The `meta_marketing` entry is the ABS Marketing app (1055869013734120). The only connected number in `wa_accounts` is Meta's test number (+1 555-202-0163); no real number has been connected yet.
- **Access verification:** the Review → Verification page says Verified, but the business-level Access Verification page still says "In review" (submitted 23 Sep). Mismatch not explained; don't resubmit, see if it clears or ask Meta support (Business ID 140523814181893) before 25 Dec 2026.
- **Embedded Signup test (2026-10-26):** clicking "Connect a WhatsApp number" opens Meta's popup (so app id, `config_id` and domain are fine) but it says **"Socially Snap can't onboard customers right now"** and only offers "share my contact information". Session ID `01a1748a-672a-706a-a150-ffe636ffdaf5`. Likely tied to the business-level Access Verification still showing "In review" (unconfirmed). To do: ask Meta support (app 1891824261787767, business 140523814181893, config 1440689164638581), retry when Access Verification flips to Verified.
- **ABS Marketing App Review prep:** wrote `docs/META-ADS-APP-REVIEW.md` (what the flow does, one screencast script for all permissions, copy-paste descriptions). Not submitted. `pages_read_engagement` looks unnecessary (the code only reads Page name/category/picture) — drop it or accept the rejection risk. Wait for the Access Verification mismatch before submitting.
- **Likely cause of the Embedded Signup block (found 2026-10-26):** the WhatsApp **Tech Provider onboarding** was never started on the Socially Snap app: App dashboard → Use cases → Connect on WhatsApp → Customize → Become a Partner → **Become Tech Provider** → choose *Independent Tech Provider* → Start onboarding (agrees to the Tech Provider Terms; Shoaib must click). Business verification is per business (both apps show it as Verified), so it doesn't replace this step.
- **Tech Provider onboarding DONE (2026-10-26, Shoaib):** chose *Independent Tech Provider*; the dashboard now says "Congratulations! You are now a Tech Provider" (2 of 2 steps). Next: retry "Connect a WhatsApp number" (use "Claim a sandbox account" under Use cases → Connect on WhatsApp → Become Tech Provider for a safe first test: pick Sandbox Business + Sandbox WhatsApp Account in Embedded Signup). Optional later, each needs App Review: Marketing Messages API, Conversions API, Marketing API for WhatsApp.
- **Embedded Signup now opens (2026-10-26, after Tech Provider onboarding):** the popup reaches "Add your WhatsApp phone number". It lists numbers already registered in Shoaib's business portfolio (Serge Abi Agent, CLIF, Nashr.tv, RB Soft…). Do NOT pick those for a test (it would link Socially Snap to those clients' WhatsApp accounts); use "Enter a new phone number" with a spare SIM that isn't in WhatsApp (or one on the WhatsApp Business app for coexistence).
- **Coexistence test with Shoaib's WhatsApp Business number (2026-10-26):** popup got through number detection and the QR step, then failed on "Confirm or edit your WhatsApp Business account" with `(#1690130) 140523814181893 isn't a valid Business ID` (that is Socially Snap's own business). Session `01a174b9-c49a-716e-a8e8-d517937bded6`. No source found for the code. Ideas: the portfolio chosen may be the Tech Provider's own (try a different one), Access Verification still "In review", or the Embedded Signup config (1440689164638581) — check it in the Embedded Signup Builder. Otherwise Meta developer support.
- **Finding on the #1690130 error (2026-10-27, read-only Graph check):** the ID in the error (140523814181893) is Socially Snap, the business that OWNS the app (Tech Provider) and the test WABA 2042611049984566. So the number was probably being onboarded into the Tech Provider's own portfolio; Meta can't share a WABA with itself. Next test: in the Embedded Signup popup choose a DIFFERENT portfolio ("Create a new business portfolio"), not Socially Snap's. If it still fails, suspect the business-level Access Verification ("In review") and ask Meta support. The Embedded Signup config 1440689164638581 can't be read with the app token (not conclusive).
- **Later (Shoaib, 27 Oct):** three more App Reviews on Socially Snap — Marketing Messages API, Conversions API for messaging (`whatsapp_business_manage_events`), Click-to-WhatsApp ads (Marketing API). Not started: none of the code exists yet (ctwa_clid/referral capture, messaging CAPI events, MM API). Order: fix Embedded Signup → ABS Marketing review → build ctwa_clid + events → apply for manage_events → MM API. Details in memory `socially-snap-meta-extra-app-reviews-later`.
- **Next (not done yet):** test "Connect a WhatsApp number" (Embedded Signup + coexistence QR) in production with a real number, then continue `docs/WHATSAPP-INBOX-PLAN.md` (4 decisions still open).
- **ABS Marketing app** (separate Marketing API app): live since 6 Oct 2026, but App Review shows **Not submitted**, with these requests added: `pages_show_list`, `business_management`, `ads_read`, `pages_read_engagement`, `public_profile`, `ads_management` (more below the fold). Not sent for review yet. Decide whether Advanced Access is needed before submitting.

## 2026-10-26 — Invoices: discount under the lines, add-ons, complimentary retainer services (de4dd84)
- The discount is now stored on the invoice, not as a negative line. Lines keep their original prices, and the totals read Subtotal → Discount → GST → Total → You save. The client link and receipt use the same layout.
- **Add-ons** (domain renewal, Claude subscription…):
  - On the invoice they are their own group, and each one opts in to the discount and GST.
  - On the retainer page they are a new section: "every month" or "next invoice only" (a one-off is billed once).
  - A draft invoice has an "Add add-on" button.
- **Finance:** the add-on share of a payment is client money, not income. New pass-through expense category "Client add-ons".
- Retainers now keep the proposal's complimentary services, shown on every invoice and never charged.
- Fixed: editing an invoice dropped the complimentary flag.
- Shoaib ran the SQL block (end of `supabase/dashboard-schema.sql`).
- Data fix: the Meezab + Tad retainer got 6 complimentary lines. INV-2026-002 (draft) now shows 40,000 − 50% = 20,000, plus the complimentary box.
- Later the same day:
  - Qty and Rate columns appear only when some line's quantity isn't 1 (19b91d1).
  - Invoice lines are grouped as Monthly retainer / One-time services (first retainer invoice) / Tools / Add-ons (93e2a37). Other invoices use "Services" and show group labels only when there's more than one group.
  - With more than one group, a discounted group shows Subtotal / Discount / "<group> total" under its own lines. The totals at the bottom list each group's amount after its discount, then GST and a Grand total (e846450, 2c60d6a).
  - INV-2026-002 line spelling fixed in the data (Claude, maintenance, Renewal).
  - Print fix (bf3e34e): a browser-extension icon printed over an amount. Extensions force `display: block !important` inline, so the print CSS now also sets visibility and opacity on non-app nodes.

## 2026-10-21 — Auto-shared Stories no longer side-cropped (c07c10e)
- Instagram and Facebook zoomed 4:5 posts to fill a Story and cut off headlines and footer contacts. The Meezab accounts manager sent a screenshot.
- `lib/story-frame.ts` now redraws every shared photo as 1080×1920 with the whole post centred. The space above and below takes the post's edge colour when that edge is flat, otherwise white.
- Videos are unchanged.
- Tested on 3 real posts (Meezab Diureef, Tad Partner, Tad Biofurose).
- 12 Stories went out cropped earlier today. They can't be deleted by API and expire in 24h.

## 2026-10-21 — Tad Pharma Instagram connected; Import Pages fix (4c5c405, a684e4b)
- An imported Page was locked in the Import Pages dialog, so an Instagram linked to it later (Tad Pharma, via the Business portfolio) couldn't be added. Now such a Page is selectable, pinned to its project, and only the missing Instagram is added.
- The dialog no longer receives Page access tokens. Save sends Page ids, and the server re-discovers the tokens.
- a684e4b fixed the Page-id regex (it lost its `\d`, so every import said "Invalid mapping data").
- Tad Pharma Instagram is connected and verified in the DB, with no duplicate Facebook row. Its 23 scheduled posts (22 Oct to 16 Nov) now go to Instagram too. A sample of the images is 4:5.

## 2026-10-20 — API Vault inside the Password Vault (953f1dd)
- The unlocked Password Vault now has two tabs: **Accounts** and **API Vault**. The API keys list loads only after the master password unlock and is dropped on lock, including the 10-minute idle lock.
- The keys are still encrypted with the server key, not the master password, because crons, MCP tools and integrations read them on the server. So the master password is a screen gate, not extra encryption.
- `/dashboard/api-vault` redirects to `/dashboard/vault?tab=api`. Settings now has only Business profile. Shoaib said "filhal", so this may move again.
- tsc and eslint passed. Not browser-tested: the Browser pane couldn't open localhost, and the local `next build` passed 10 minutes without finishing. Vercel builds it on push.

## 2026-10-19 — Business Management section + Password Vault on its own
- **Sidebar:** "Websites" is now **Business Management**. **Password Vault** is its own item and is no longer a Clients tab. Shoaib calls it his personal tool.
- **Business Management** tabs are grouped by system:
  - A small "HOTEL MANAGEMENT" label (`showTitle` on a section group, drawn by SectionNav), then Bookings · Inquiries · Contacts.
  - Salon Management and any other system will be a new labelled group once it's built. It is not shown until then (Shoaib's choice).
- **Unchanged:** URLs, and the client portal's own "Bookings" section.
- Browser-tested locally (sidebar highlight, tabs, vault page, Clients tabs).

## 2026-10-16 — Stories from a Google Drive folder
- **Where:** the Stories Planner, card "Stories from Google Drive", per project. Fields: folder link (shared "Anyone with the link") and stories per day (default 8). Buttons: Sync now, Disconnect.
- **Code:** `lib/story-drive.ts`.
  - Reads the folder with a plain Google API key from API Vault service `google_drive`, field `api_key`. No OAuth needed.
  - Takes new JPG/PNG/WebP and MP4/MOV files in random order.
  - Places them at the Instagram followers-online peak hours, PKT 9–23 (`instagramOnlineByPktHour`). Without that data it uses 10/12/14/16/18/20/21/22. The slots are refreshed daily, with a few random minutes on each.
  - Copies each file to R2 and creates `scheduled_posts` rows: `post_type` story, status scheduled, `drive_file_id`. A unique index makes sure a file never imports twice.
  - Videos over 60s skip FB (Meta's Page Stories cap). IG is also set to 60s, so longer videos are listed as skipped.
- **Cron:** the social cron syncs each folder at most once an hour, 4 imports per run, only when the run has time left. The R2 copy is deleted after posting, as before.
- **SQL run:** table `story_drive_sources`, plus `scheduled_posts.drive_file_id` with its unique index.
- **To do (Shoaib):** create the Google API key (Drive API enabled), save it in the API Vault, then paste the Toni and Guy folder link.
## 2026-10-16 — Planner is its own section; Posts / Stories side toggle
- **Sidebar:** Planner is now its own item, above Marketing. The "to caption + failed" badge moved from Marketing to Planner (counts key `planner`).
- **Marketing tabs:** Insights · YouTube · Meta Ads · Google Business · Connections.
- **Planner page** (Shoaib's layout):
  - A vertical **Posts / Stories** toggle on the left of the calendar. On a phone it becomes a row above the calendar.
  - Tabs on top: **All · Image · Reels & Shorts · Videos**. "Posts" was renamed "Image", so "Posts" now only names the toggle.
  - URLs are unchanged (`/dashboard/social/planner`, `/dashboard/social/stories`).
- **Client portal:** same layout. Stories is no longer a tab; it's reached from the toggle, and only shown to people with the planner feature.
- **Code:**
  - `SectionItem.hidden` marks a page that is reachable from inside its section but isn't a tab. It's still in Ctrl+K.
  - Sections now match the most specific prefix (`matchStrength`), so Planner's `/social/planner` wins over Marketing's `/social`, in both the tabs and the sidebar highlight.
  - The toggle itself is `PlannerSideToggle` in `PlannerCalendar.tsx`.
- **Tested:** browser-tested locally (desktop and phone, Posts ↔ Stories, Marketing tabs). The portal wasn't tested (no client login).

## 2026-10-16 — YouTube page: growth report, video SEO, comments, audit
- **Page:** `/dashboard/youtube`, with a tab per feature. Listed under Marketing → Social. The Connections tile's "Open YouTube" goes here.
  - **Overview:** the last 28 days vs the 28 before:
    - views, watch time, net subscribers, estimated revenue (null if not monetized)
    - likes, comments and shares
    - daily bars, traffic sources, top 10 videos, countries
  - **Videos & SEO:** the latest 50 uploads.
    - Edit the title, description and tags (`videos.update`, 50 quota units each).
    - Per-video SEO tips: title length, description, chapters, tags, link, hashtags, captions.
  - **Comments:** the newest 100 threads, filtered to those not yet answered by the channel. Replying calls `comments.insert` (50 units).
  - **Audit:** a 12-point channel checklist with a score.
- **Code:** `lib/youtube-manage.ts` (API calls) and `lib/dashboard/actions/youtube.ts` (server actions).
- **Scopes:** the connect now also asks for `youtube.force-ssl` and `yt-analytics-monetary.readonly`.
- **Not done yet:**
  - Not browser-tested (no dashboard login, and no channel connected yet).
  - No MCP tools for these yet.
  - The privacy policy needs a YouTube API Services disclosure before the Google audit / verification.

## 2026-10-15 — Planner split by kind + YouTube + Videos + TikTok video
- **Planner tabs:** All · Posts · Reels & Shorts · Videos, with a "needs caption" count on each tab. "+ Add" opens that kind's composer; on "All" the composer has a post / Reel / video switcher.
- **Stories:** now their own Planner page.
  - Dashboard: `/dashboard/social/stories`.
  - Portal: `/portal/stories`, view-only for clients.
  - Both pages share `PlannerScreen` / `PortalPlannerScreen`.
- **Which platforms take what** (`lib/social-post.ts`, mirrored in `PlannerCalendar` `takes()`):

  | Kind | Goes to |
  |---|---|
  | Post (photo) | Everywhere except YouTube |
  | Reel | FB, IG, YouTube Short, TikTok |
  | Video (new `post_type`) | YouTube, Facebook (`/videos`), TikTok |
  | Story | FB, IG |

- **YouTube** (`lib/social-youtube.ts`):
  - **Connect:** per-project Google OAuth on the "gmb" Socially Snap client. It reuses `/api/gbp/callback` with `state="yt:<project>"`, so no new redirect URI is needed.
  - **Upload:** resumable, streamed from R2. Reels get `#Shorts`. Videos carry a title, privacy and thumbnail.
  - **Connections:** tile with the subscriber count.
- **TikTok video:** sent to the inbox as a draft (FILE_UPLOAD, chunked byte ranges from R2). The creator adds the caption in the app.
- **SQL run:**
  - `client_social_accounts` platform check now allows `youtube`.
  - `scheduled_posts.post_type` now allows `video`.
  - New columns `video_title` and `video_privacy`.
- **MCP:** `social_list_posts` now returns `kind`. The daily 5 PM task captions per kind, and its limit is now 1 per kind per project per day.
- **Still to do (Shoaib):**
  - Enable YouTube Data API v3 + YouTube Analytics API on the socially-snap GCP project.
  - Add the `youtube.upload`, `youtube.readonly` and `yt-analytics.readonly` scopes to the consent screen.
  - Apply for the YouTube API audit (until it passes, uploads stay private).
- **Not yet tested:**
  - Not browser-tested (needs a dashboard login); only tsc and eslint ran.
  - The cron has `maxDuration` 60s, so very large videos may not finish in one run.

## 2026-10-14 — Avenza posts reviewed + Roman Urdu flag rule
- Reviewed 20 new portal posts (Avalon 7, Eventia 6, Avenza Land 7).
  - Flagged 6, with fixes explained in English + Roman Urdu and one email to the uploader:
    - Land 60: DHA **Lahore** gate photo
    - Avalon 87: 5-star claim + white dot
    - Avalon 90: "Jour" script, blue blob, "special offers" with no offer
    - Eventia 85/86/87: "our venue" claim (Eventia is a planner), "BOOKING NOW", "Apt1"
  - Captioned and scheduled the other 14 on their planner dates (Jummah posts on Friday 16 and 23 Oct).
- **New rule:** every `social_request_changes` issue = English + "Roman Urdu:" explanation.
  - KB global rule `post-flag-roman-urdu`.
  - Tool description in `lib/post-review-tools.ts`.
## 2026-10-13 — NEXT (Saturday 2026-10-17): GoHighLevel-inspired backlog, Shoaib to pick
Shoaib postponed this to Saturday (weekly limit), so nothing is chosen yet. Ask first and show the design before coding. Recommended order: 1, 2, 4.
1. **Sales Pipeline board** (Kanban from existing statuses, PKR per column).
2. **Invoices summary cards + filters**, and prefilled payment links `/pay?amount=&for=`.
3. **Notification bell** (recent events, click through).
4. **Planner list view** (table, status tabs, filters).
5. **Media library** (all R2 files).
6. **Settings**: logo upload and an audit log.
7. **Unified Contacts** with tags (big).
8. **Conversations**: FB/IG DMs and inquiries in one inbox. Big, and needs Meta App Review.
9. **Review-request links** (Reputation).

## 2026-10-13 — Pay page simplified (c973c67)
- Bank details are now one card with a Pakistan / International toggle.
- The receipt form asks only for name, amount and the receipt (on an invoice link: amount and receipt).

## 2026-10-13 — Dashboard phase 3: + New, Ctrl+K search, sidebar counts (876b48b)
- **+ New** (under the sidebar logo, `components/dashboard/SidebarTools.tsx`): create shortcuts from `lib/dashboard/quick-actions.ts`. Finance links open their form via `?new=expense|income|bill`.
- **Ctrl+K / Search** (`components/dashboard/CommandPalette.tsx`): every page and action, plus `/api/dashboard/search` (clients, leads, proposals, quotations, invoices, agreements, services).
- **Sidebar counts** (`/api/dashboard/counts`, polled every 2 min and on navigation, at most every 15 s):
  - Sales: leads since the last visit to Leads (stored in localStorage).
  - Clients: vault submissions not yet imported.
  - Finance: pending receipts + late invoices + bills due.
  - Marketing: posts pending a caption + failed posts.
  - WhatsApp: unread chats.
- **Client hub** (one client page with tabs Overview / Documents / Money / Work / Access / Details, and "+ Proposal / Invoice / Expense" for that client): designed and shown, but **Shoaib said wait (on hold)**. Don't build it until he asks.

## 2026-10-13 — Finance, phase 2: income, expenses, monthly bills, reports (all in PKR)
- **Tabs:** Finance → Overview · Invoices · Quotations · Payment receipts · Retainers │ Income · Expenses · Reports │ Setup.
- **Tables** (SQL "Finance: expenses, other income, monthly bills" run 2026-10-13):
  - `finance_entries`: expense or other income. Holds category, payee or payer, client tag, amount + currency + `fx_rate` + `pkr_amount`, a `pass_through` flag for client money, and a receipt in R2 under `finance/`.
  - `finance_bills`: repeating bills. **Mark paid** records the expense with the real amount and moves `next_due` forward by the bill's frequency.
  - `payments.fx_rate` / `pkr_amount`: invoice payments in PKR. Uses that day's rate unless "PKR received" is entered. Correctable in Income.
- **Rates:** `lib/fx-rate.ts` `pkrRates(currencies, date)` uses the free currency-api (historical days supported).
- **Maths:** `lib/dashboard/finance.ts` `summarize`. Client money (ad budget) is pass-through and stays out of profit. If more ad spend was recorded than client budget received, the difference comes off invoice income (budget billed inside an invoice). Checked with both cases.
- **Reports:** P&L, month by month, expenses by category, profit per client, a tax-year (Jul–Jun) summary for the tax adviser with local vs foreign income, and a CSV export (`/api/dashboard/finance/export`).
- **Receipts:** a `/pay` receipt confirmed without an invoice becomes an income entry.
- **Live test passed:** expense with receipt; bill → Mark paid (USD → PKR, next due +1 month); overview, reports and CSV; delete removes the row and the R2 file. All test rows are gone.
- **Dev gotcha again:** after an app restart, `next dev` returned 404 for dashboard pages. `rm -rf .next/dev` and a restart fixed it.

## 2026-10-13 — Dashboard navigation, phase 1 (GoHighLevel style)
- **One sidebar.** A section's pages are now tabs across the top of the page (`components/dashboard/SectionNav.tsx`), with its **Setup** tab pinned to the right. There is no second sidebar any more.
- **Sections:**
  - **Sales:** Leads, Proposals, Agreements, Onboarding, Intakes, plus Single and Bundle services.
  - **Clients:** Clients, Monthly reports, Password Vault, Letterhead, and Setup (My access accounts) at `/dashboard/clients/setup`.
  - **Finance** (new name):
    - Invoices, Quotations, Payment receipts, Retainers.
    - Setup at `/dashboard/finance/setup`: Payment accounts, Tax, Documents (numbering, terms).
    - `/dashboard/finance` redirects to Invoices until the Finance overview exists.
  - **Marketing:** unchanged.
  - **WhatsApp:** unchanged.
  - **Websites** (was Hotels): Bookings, Inquiries, Contacts. Grouped by kind of data so salon bookings or career-page applications can be added as more tabs.
  - **Settings** now sits at the bottom next to Sign out. It holds the Business profile (business details, email domain check) and the API Vault. The old Admin section is gone.
- **Page URLs are unchanged.**
- **Full width:**
  - Pages go up to 96rem (was 72rem).
  - Setup forms use `SettingsCard` (in `ui.tsx`): title on the left, fields on the right.
- **Full-height pages:**
  - `.app-height` in `globals.css` subtracts the tab bar (`--section-nav-h`).
  - Used by the WhatsApp inbox.
- **`updateSettings` saves by part:** `_part` = `business` | `billing`, and each form saves only its own fields.
- **Next, phase 2 (Finance):**
  - Expenses: category, client, receipt photo, PKR/USD rate, monthly bills.
  - Income from confirmed payments.
  - P&L, cash flow, profit per client, FBR tax summary.
  - Client ad budget kept as pass-through.
- **Next, phase 3:** a "+ New" button, Ctrl+K search, counts in the sidebar, a client hub.

## 2026-10-13 — Payments: bank details on invoices + client receipt upload + /pay
- No gateway yet, so payments are by bank transfer and confirmed by hand.
- **Settings → Payment accounts** (`components/dashboard/PaymentAccountsForm.tsx`, `settings.payment_accounts` jsonb):
  - a Pakistan (PKR) account: title / bank / account no. / IBAN / branch;
  - an international account, with "Same as Pakistan account" ticked by default (until a separate international account exists, international payers get the Pakistan IBAN + SWIFT);
  - SWIFT / bank address and a note for payers.
  - Shoaib types the numbers himself; nothing is hard-coded.
- **Which account is shown:** `lib/payment-accounts.ts`. PKR invoices show Pakistan, other currencies show International, and /pay shows both. Falls back to whichever exists.
- **Invoice link `/invoice/[token]`:**
  - while a balance is due: a "How to pay" card with Copy buttons, the receipts sent so far (pending / confirmed / not confirmed + reason), and **Upload payment receipt**;
  - the printed invoice lists the structured accounts (falls back to the old free-text `bank_details`).
- **`/pay`** (noindex, not in the sitemap): bank details and the same upload form. The payer gives name, email (Disify check), optional phone, invoice number, currency + amount.
- **Upload:**
  - `POST /api/pay/upload-url` presigns a PUT to private R2 at `receipts/<invoice token | pay>/<uuid>-name`: images/PDF only, ≤10 MB baked into the signature, rate limit 12/10 min per IP.
  - `POST /api/pay/receipt` validates, checks the object really exists (`headObject`), inserts `payment_receipts` and emails Shoaib. Rate limit 8/h per IP; a paid / draft / cancelled invoice refuses.
- **Dashboard:**
  - **Payment receipts** page (Clients & Billing): pending first, a 1-hour private "View receipt" link.
  - **Confirm** applies it as a payment to an open invoice in the same currency (amount editable; a /pay receipt pre-selects the invoice whose number the payer typed), then emails the payer.
  - **Reject** with a reason emails the payer a retry link.
  - Invoice page: the receipts for that invoice. Overview: a "N payment receipts to confirm" banner.
- **Refactor:** `lib/dashboard/payments.ts` `applyPaymentToInvoice`, shared by Record payment + Confirm (amount_paid and status are re-derived from `payments`).
- **SQL (run once):** the "Payment accounts + client-uploaded payment receipts" block at the end of `supabase/dashboard-schema.sql`. **Run 2026-10-13, verified.**
- **Payment accounts filled in by Shoaib.**
  - UBL "Ads By Shoaib". The IBAN passes its checksum.
  - International is ticked "same as Pakistan".
  - **Still to do:** add the SWIFT code, and fix the bank name to "United Bank Limited (UBL)" (capital L).
- **Live test passed on the /pay path:**
  - upload → the "Payment receipt: PKR 1.00 · TEST - Claude" email to Shoaib → Reject in the dashboard → the rejection email with the retry link reached the payer;
  - the test row and its R2 file were then deleted.
- **Not tested yet:** Confirm and the invoice-link upload. Test both on the first real sent invoice (none exist yet).

## 2026-10-12 — WhatsApp App Review submitted + support cases
- **Meta App Review submitted** (Socially Snap app) for whatsapp_business_messaging + whatsapp_business_management, with the two screencasts and the Data handling answers. Status: in review (~20 days).
- **Meta Access Verification** (business-level, since 23 Sep): still in review. Advised a Business Support case.
- **LinkedIn CM API:** Developer Support case **CAS-12128570-G6N9Q3** opened (the earlier member-support case 261012-002160 got an irrelevant canned reply).

## 2026-10-11 — MCP: social_get_post_image_url + social_list_posts
- **`lib/post-listing-tools.ts`:** registered on both the local (`mcp/tools/social.ts`) and remote (`lib/mcp-remote-tools.ts`) servers. Read-only.
  - `social_get_post_image_url`: any status. Returns the image inline (sharp shrinks >1.5 MB / >1600 px for the preview only), filename, project, status, scheduled_at, caption, needs-changes note, and the uploader as a name ("<Client> (client portal)" / "Shoaib (dashboard)" — never an email), plus 15-minute open/download links.
  - `social_list_posts`: project fuzzy match, status(es), from/to on created_at or scheduled_at, limit ≤200, newest first. Summary per project/status + "added in last 7 days".
- **Links:** `lib/post-image-links.ts` (HMAC with MCP_OAUTH_SIGNING_KEY, post id + expiry only — no storage key). Served by `/api/social/post-image/[name]`, which streams from private R2 (`streamObject`).
- **Descriptions:** `social_get_post_image` / `social_list_pending_posts` now point to the new tools.
- **Test:** `npx tsx --conditions=react-server --env-file=.env.local scripts/test-post-tools.mts` — 16/16 pass (incl. tampered/expired link refused, no emails, no storage path). The local server lists 68 tools including both.

## 2026-10-10 — Stay signed in (login kept asking every time)
- **Cause:** both login forms signed a wrong-role account back out with the default **global** `signOut()`.
  - When the browser autofilled the ADMIN login on /portal/login, that killed the admin's session on every device. That day the admin had 0 sessions in `auth.sessions`.
  - The sidebar "Sign out" was global too.
- **Fix 1:** every `signOut` is now `{ scope: "local" }` (this browser only).
- **Fix 2:** dashboard and portal now use separate session cookies (`lib/auth-cookies.ts`).
  - The dashboard uses `sb-adsbyshoaib-dashboard-auth`; the portal keeps Supabase's default, so client sessions stayed valid.
  - Applied in the proxy, `createAuthClient(area)` / `getSessionUser(area)`, both login forms and the sidebar.
  - `isSingleton: false` on browser clients (@supabase/ssr otherwise reuses the first client and ignores the cookie name).
- **Verified on localhost:** the admin and a portal login stay signed in together in one browser (two `auth.sessions` rows).
- The admin has to log in once after deploy (new cookie name).

## 2026-10-10 — WhatsApp App Review pack
- **`docs/WHATSAPP-APP-REVIEW.md`:** the two screencast scripts (messaging = inbox reply received on WhatsApp Web; management = create a template), the copy-paste English permission descriptions, the reviewer note, and what to do after approval.
- **No QR needed:** Embedded Signup/QR does NOT need to be shown — it only works after approval.
- **Live URLs checked:** the privacy (`#whatsapp`) and data-deletion URLs are up.
- **Waiting on:** Shoaib to record + submit.

## 2026-10-10 — Dashboard sections (Meta Business Suite style) everywhere
- **Main sidebar:** now 7 entries: Overview · Sales · Clients & Billing · Marketing · WhatsApp · Hotels · Admin.
- **Inside a section:** the main sidebar drops to its icon rail, and the section's own menu sits next to it.
  - The menu collapses to icons, remembered per section (`section-nav-collapsed-<key>`).
  - Phones get a row of tabs.
- **One config:** `lib/dashboard/sections.ts` (`SECTIONS`, `sectionFor`, `isItemActive`), rendered by `components/dashboard/SectionNav.tsx` from `DashboardShell`.
  - The WhatsApp-only menu and its layout were folded into it.
  - URLs are unchanged.
- **Verified:** each section's menu + active item on localhost (catalog vs bundles, Connections exact, WhatsApp Inbox vs Overview).
- **Client portal too** (`lib/portal/sections.ts`): Home · WhatsApp · Bookings (Bookings / Inquiries / Contacts) · Planner · Account (Passwords / Intake forms / Team).
  - Built from each person's features: empty sections hide, and a one-page section is just a link with no menu (`sectionFor` needs 2+ items).
  - Verified in the browser with the Muhammad Ajmal Owner login (2026-10-10): Home · WhatsApp · Bookings · Account. The Bookings and Account menus highlight correctly; Passwords is hidden for this login (it redirects).

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
