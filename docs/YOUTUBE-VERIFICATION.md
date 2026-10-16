# YouTube — Google OAuth verification pack

Google Cloud project **socially-snap** · OAuth app **Socially Snap** · prepared 2026-10-16.

## Before recording

- [ ] **Branding** (Google Auth Platform → Branding):
  - Privacy policy: `https://sociallysnap.adsbyshoaib.com/privacy`
  - Terms: `https://sociallysnap.adsbyshoaib.com/terms`
  - Homepage: `https://sociallysnap.adsbyshoaib.com`
  - Authorized domain: `adsbyshoaib.com`
- [ ] The privacy policy has the **YouTube API Services** section (live since 2026-10-16, sociallysnap commit 126510c).
- [ ] **Data Access** lists these scopes:
  - `youtube.upload`
  - `youtube.readonly`
  - `youtube.force-ssl`
  - `yt-analytics.readonly`
  - `yt-analytics-monetary.readonly`
  - Also remove `…/auth/youtube`: the app never requests it (force-ssl covers editing), and Google asks for the narrowest scopes.
- [ ] The "How will the scopes be used?" box has the justification text below.
- [ ] Have a test channel with at least 1 video and 1 comment from another account, so every feature shows real data.
- [ ] Record at 1080p in **English** (browser and Google account language set to English). Upload to YouTube as **Unlisted** and paste the link.

## Demo video script (≈ 4–5 minutes)

Google wants to see: the app name and the OAuth **client ID in the address bar** on the consent screen, the scopes being granted, and **each scope being used** in the app. Say each step out loud, or put the English lines as on-screen captions.

| # | On screen | Say / caption |
|---|---|---|
| 1 | `sociallysnap.adsbyshoaib.com` home page, then scroll to the footer and open **Privacy policy → YouTube API Services** | "This is Socially Snap, a social media management tool. Our privacy policy explains how we use YouTube API Services." |
| 2 | Log in to the dashboard → **Marketing → Connections**, pick a project | "A user connects their YouTube channel from the Connections page." |
| 3 | Click **Connect YouTube**. On Google's sign-in, **click the address bar** so the full URL with `client_id=…` shows, then pause 3 seconds | "This is Google's consent screen for the Socially Snap OAuth client." |
| 4 | Choose the account. On "Google hasn't verified this app", choose **Advanced → Go to Socially Snap**. Show the list of permissions, then tick all and press **Continue** | "The user grants: upload videos, view the YouTube account, manage videos and comments, and view YouTube Analytics including revenue reports." |
| 5 | Back on Connections: the YouTube tile shows **Connected**, the channel name and subscribers | "The channel is connected. Its name and subscriber count come from youtube.readonly." |
| 6 | **Marketing → YouTube → Overview** | "yt-analytics.readonly: views, watch time, subscribers, traffic sources and top videos for the last 28 days." Point at **Revenue**: "yt-analytics-monetary.readonly: estimated revenue for monetized channels." |
| 7 | **Audit** tab | "youtube.readonly: we read the channel's settings and latest uploads to build a channel audit with fixes." |
| 8 | **Videos & SEO** tab: change a video's tags, click **Save to YouTube**, then open the video on YouTube and show the new tags or title | "youtube.force-ssl: the owner edits a video's title, description and tags, and saves them to YouTube." |
| 9 | **Comments** tab: write a reply, click **Reply**, then open the video on YouTube and show the reply | "youtube.force-ssl: the owner reads comments and posts replies as the channel." |
| 10 | **Marketing → Planner → Reels & Shorts → + Add**: pick a vertical video, keep YouTube ticked, type a title, **Schedule** for a few minutes ahead. Wait for the post to turn **Posted**, then open YouTube Studio → Content and show the uploaded Short | "youtube.upload: scheduled Shorts and videos are uploaded to the owner's channel." |
| 11 | Optional: **Videos** tab of the Planner, a landscape video with title, privacy and thumbnail | "Long videos can be scheduled the same way, with a title, privacy setting and thumbnail." |
| 12 | Connections → YouTube tile → remove the channel; then `myaccount.google.com/permissions` → Socially Snap | "Users can disconnect at any time here or from their Google account settings. Stored tokens are deleted." |

Keep it one take if you can. Short cuts between steps are fine; don't skip the consent screen with the client ID.

## Scope justification (paste into "How will the scopes be used?")

```
Socially Snap is a social media management tool used by a marketing agency to manage its clients' YouTube channels, with each channel owner's consent.

- youtube.upload: upload the Shorts and videos the channel owner schedules in our content planner.
- youtube.readonly: read the connected channel's details, videos and playlists to show them in the dashboard and to build a channel audit.
- youtube.force-ssl: update video titles, descriptions and tags when the owner saves SEO changes, read comments on the owner's videos and post the replies the owner writes.
- yt-analytics.readonly: show views, watch time, subscribers, traffic sources and top videos so the owner can track channel growth.
- yt-analytics-monetary.readonly: show estimated revenue for monetized channels in the owner's report.

Channel details, comments and analytics are fetched live and not stored. We store only the channel name/ID, encrypted OAuth tokens, the owner's uploaded video files for scheduling, and the IDs of videos we publish. Data is never sold, never used for advertising or AI training, and users can disconnect at any time.
```

## After Google verifies the app

- [ ] Apply for the **YouTube API Services audit** (YouTube's own compliance review). Until it passes, videos uploaded through the API are locked to private. Use the same video and policy links. If more than 10,000 units/day are needed, ask for a quota increase in the same form.
- [ ] Once the audit passes, check a Planner upload goes up as **public**.
