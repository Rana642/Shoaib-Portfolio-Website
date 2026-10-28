# Meta App Review — "Socially Snap Planner" (Facebook Login for Business)

Prepared 2026-10-28. Goal: **Advanced Access** for the posting permissions, so any Page admin can connect
with Facebook Login without first being added as a Tester. Until it is approved, every new profile must be
added under App roles → Testers and must accept the invite at developers.facebook.com/requests.

The use-case texts below match what the code actually calls (checked 2026-10-28). Paste them as they are.
If the app changes, update this file first.

---

## 1. Before submitting (App settings → Basic)

Already set, checked 2026-10-28. The app belongs to the verified **Socially Snap** business, so its legal pages are on
the Socially Snap site (repo `sociallysnap`, built 2026-09-13 for exactly this). Don't point them at adsbyshoaib.com.

| Field | Value |
|---|---|
| App domains | adsbyshoaib.com, sociallysnap.adsbyshoaib.com |
| Privacy Policy URL | https://sociallysnap.adsbyshoaib.com/privacy |
| Terms of Service URL | https://sociallysnap.adsbyshoaib.com/terms |
| User data deletion | Data deletion instructions URL → https://sociallysnap.adsbyshoaib.com/data-deletion |
| App icon | Socially Snap mark |
| Category | Business and pages |

Small optional fix in the `sociallysnap` repo: its /data-deletion page says "Facebook settings → Apps and Websites → remove Socially Snap". For a Facebook Login for Business app, the path is **Settings → Business integrations → Socially Snap Planner**.

Also:
- **Alert Inbox** and **Required actions** must be empty. Open both and finish anything Meta lists.
- Business verification is already done (Tech Provider verified).
- The Facebook Login for Business **Valid OAuth Redirect URI** must stay `https://adsbyshoaib.com/api/social/facebook-oauth-callback`.

## 2. Permissions to request (App Review → Permissions and features → Request advanced access)

The login asks for 8 permissions. `pages_manage_engagement` was **removed** on 2026-10-28 because the app
doesn't reply to or moderate comments, and Meta rejects permissions it can't see in use. **Don't request it.**

### pages_show_list
> After a Page admin connects with Facebook Login for Business, the app calls `/me/accounts` to list the Facebook Pages (and their linked Instagram professional accounts) that this admin manages. The admin then picks which Page belongs to which client project in our dashboard. The list is only shown to that admin, inside the dashboard.

### business_management
> Most of our clients' Pages and Instagram accounts are owned by the client's own Business portfolio and shared with us as a partner. Without business_management, `/me/accounts` doesn't return those business-owned Pages, so the admin could not connect them. We use it only to list and access the Pages the admin was given access to; we don't create, edit or read anything else in the Business portfolio.

### pages_manage_posts
> The dashboard is a content planner for the Pages we manage. When a client-approved post is due, the app publishes it to the Page: photo posts (`/{page}/photos` and `/{page}/feed` with `attached_media`), scheduled posts (`published=false` + `scheduled_publish_time`), Page Stories (`/{page}/photo_stories`), and Reels/videos (`/{page}/video_reels`, `/{page}/videos`). When the admin moves or cancels a scheduled post in the planner, the app updates or deletes that scheduled post on the Page.

### pages_read_engagement
> The Insights page in the dashboard shows each Page's recent posts with their reactions, comments and shares counts (`/{page}/published_posts`), so the client sees how their posts performed. The app also reads a published post's image and permalink (`full_picture`, `permalink_url`) to show it in the planner and to confirm a scheduled post went out. Nothing is stored. The data is read when the page is opened.

### read_insights
> Reads Page insights (`/{page}/insights`: views, reach and followers online by hour) for the dashboard's Insights page, and to suggest the best times to post for that Page. The data is only shown to the Page's admin inside the dashboard and is not stored.

### instagram_basic
> Reads the Instagram professional account linked to a connected Page (id, username, followers count, and its recent media) so the admin can map it to the right client project and see its recent posts on the Insights page.

### instagram_content_publish
> Publishes client-approved content to the linked Instagram professional account when it is due: feed photos, Stories (`media_type=STORIES`) and Reels (`media_type=REELS`), via `/{ig-user-id}/media` followed by `/{ig-user-id}/media_publish`. The app checks `content_publishing_limit` first, so it never goes over Instagram's daily publishing limit.

### instagram_manage_insights
> Reads account and media insights for the linked Instagram account (reach, views, likes, comments, shares, saves, and followers online by hour) for the dashboard's Insights page and best-time-to-post suggestions. The data is only shown to the account's admin in the dashboard and is not stored.

### Instagram API with Instagram Login (same app): for IG accounts with no Facebook Page

`lib/social-instagram-login.ts` asks for exactly these 3 (Danish Construction and Avenza Land use it).

#### instagram_business_basic
> Some clients' Instagram professional accounts aren't linked to a Facebook Page. Their admin connects the account with Instagram Login ("Log in with Instagram" in the dashboard's Connections). The app reads the account's id, username and recent media to map it to the right client project and show its recent posts.

#### instagram_business_content_publish
> Publishes client-approved content to that Instagram account when it is due: feed photos, Stories and Reels, via `graph.instagram.com/{ig-user-id}/media` followed by `/media_publish`, after checking the account's publishing limit.

#### instagram_business_manage_insights
> Reads that account's insights (reach, views, likes, comments, shares, saves, and followers online by hour) for the dashboard's Insights page and best-time-to-post suggestions. Shown only to the account's admin and not stored.

### Remove from the submission (trash icon). The app doesn't use these.
Meta pre-fills a long list from the use cases. Remove these 13 from the submission:
- Instagram Public Content Access
- instagram_business_manage_messages
- pages_read_user_content
- instagram_branded_content_ads_brand
- pages_manage_metadata
- facebook_branded_content_ads_brand
- pages_manage_engagement
- instagram_manage_comments
- instagram_branded_content_brand
- catalog_management
- instagram_manage_contents
- instagram_manage_messages
- instagram_shopping_tag_products

That leaves **12**: the 8 above, the 3 Instagram Login ones, and `public_profile`. `public_profile` is the default; write "Used to identify the admin who connects (name and ID) so the dashboard shows which profile each Page came from."

## 3. Screen recording (one video covers all of them)

Record the screen in **English** at 1080p, about 3–4 minutes, **no voice needed**. Add short on-screen text
(captions) at each step if possible. Use a real client Page that you manage. Avalon or Elegant is fine.

1. Open https://adsbyshoaib.com/dashboard/login and sign in. (Caption: "Agency dashboard — content planner for client Pages".)
2. Go to **Social → Connections** and click **Connect with Facebook**.
3. The Meta dialog opens: **slowly show the list of permissions**, choose the Page(s) and the Instagram account, and continue. *(This shows pages_show_list + business_management + all the others being granted.)*
4. Back in Connections: click **Import Facebook Pages**, show the Page list, and map one Page + its Instagram to a project. *(pages_show_list, instagram_basic)*
5. Go to **Planner**: upload an image, write a caption, tick **Facebook + Instagram**, and schedule it about 15 minutes ahead. Show it in the calendar. Pause the recording and resume once it has posted. *(pages_manage_posts, instagram_content_publish)*
6. Open the **Facebook Page** in another tab and show the post there. Then open the **Instagram account** and show it there.
7. Back in the dashboard, open **Social → Insights** for that project: show the Page numbers, the post list with reactions/comments, and the Instagram numbers. *(pages_read_engagement, read_insights, instagram_manage_insights)*
8. On the same Insights page, scroll to **Best posting times**. *(read_insights, instagram_manage_insights)*
9. Optional: open a scheduled post in the planner, move it to another time, then delete it. *(pages_manage_posts, scheduled post update/delete)*
10. **Instagram Login part:** in Connections, pick a project with no Facebook Page (e.g. Avenza Land) and click **Log in with Instagram for …**. Show the Instagram permission screen and allow it, then show the account in Connections. Schedule one post to it from the Planner, show it on Instagram, and open its Insights. *(instagram_business_basic, instagram_business_content_publish, instagram_business_manage_insights)*

Upload the same video for each permission. Meta allows one video for several permissions.

## 4. "How can reviewers test?" box

> Socially Snap is the social media planner of Shoaib Nabi Noor's marketing practice. Until the standalone app is ready, it runs inside the practice's dashboard at adsbyshoaib.com (both domains are listed under App domains). It is an internal agency tool, not a public app: only our team and our clients' Page admins sign in. The screen recording shows the complete flow for every permission (Facebook Login → Page selection → mapping → publishing to the Page and Instagram → insights). Reviewer test login for the dashboard: [demo account email] / [password], shared here only for review.

Use a **demo account, never the admin login**: the same rule as the LinkedIn review. Fill in the email and
password yourself, directly in Meta's form.

## 5. After approval

- New profiles can connect directly (no Tester role needed).
- Then a **System User token** becomes possible: it doesn't expire and doesn't depend on any personal profile, so a checkpoint on one profile no longer stops posting. This is the permanent fix for the 24–28 Oct breaks.
