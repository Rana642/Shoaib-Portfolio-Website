# Hotel numbers through Socially Snap (spec, draft 2026-11-16, waits for Shoaib's yes)

Goal: Silver Sand first, then Elegant. Each hotel's WhatsApp number is connected in the Socially Snap
developer dashboard, linked to its hotel project in the ABS Dashboard, and so shows in the ABS Dashboard
WhatsApp section AND in the client portal (one login, hotel dropdown). **Marketing messages (templates +
broadcasts) come first.**

## Flow
1. **Socially Snap:** the hotel owner connects the number (Numbers page, Embedded Signup, coexistence: the number
   stays on the WhatsApp Business app). The owner logs in to Meta and enters the code himself. Number lands in the
   "Ads By Shoaib" workspace (the one `SOCIALLYSNAP_API_KEY_LIVE` belongs to).
2. **ABS Dashboard, WhatsApp → Numbers:** new button "Link a Socially Snap number": phone number id, WABA id,
   display number, hotel project. Creates a `wa_accounts` row with **no token** (`via_socially_snap = true`).
3. **Portal:** nothing to build. It reads chats by client → project → account, so both hotels show for the client
   with the existing hotel dropdown.

## Policy check (meta-policy, 2026-11-16): allowed
- Coexistence needs Business app 2.24.17+, Embedded Signup by the owner. Fixed throughput 20 messages/s.
- Connecting unlinks every linked device (QR): staff re-link their phone/laptop afterwards. Windows/WearOS companions not supported.
- App broadcast lists turn read-only, so marketing goes through the platform (our plan).
- Group chats don't sync. Chat history (180 days) and contacts sync once, within 24 h of connecting.
- **Meta Business Suite inbox with a coexistence number is NOT covered by Meta's page. Test it on Silver Sand before telling the hotel.**
- Marketing rules: opt-in first; category MARKETING (never promo as UTILITY); STOP honored; each hotel pays Meta with its own card; no markup.
- Each business connects its own number; the hotel is a business Shoaib serves directly (decision 2026-11-07).

## What already works (verified in code)
- Sends (text and template) take `from = phone_number_id`, so any number in the workspace works through the API.
- Broadcasts go through `deliverTemplate`, which already branches on `WHATSAPP_VIA_SOCIALLY_SNAP`.
- Inbound events are stored only for numbers that have a `wa_accounts` row (unknown numbers are ignored). Hence step 2.

## Built 2026-11-16 (Shoaib said "build", waits for reviews, migration and push)
- Link form on the Numbers page: pick the number from Socially Snap's own list (`/v1/phone_numbers`, so ids are never typed) and the hotel. `lib/socially-snap/link.ts`, `linkSociallySnapNumber` in `lib/whatsapp/onboarding.ts`, action `linkSociallySnapNumberAction`.
- Linked numbers never use a Meta token: `tokenForAccount` throws for them, `tokenOrError` makes the send paths answer `{ error }`. Templates (list, create, delete) go through the API with `from`; writes need `live`.
- "Take webhooks back" and "delete number" never touch Meta for a linked number (disconnect in Socially Snap).
- The existing 311 number stays as it is (own token, `via_socially_snap = false`), so its rollback still works.
- 58 tests pass (`npm test`), tsc and eslint clean.
- Reviews done (code + security), all findings fixed: no free text in the URL, a linked number can't be moved to another hotel silently, template lookups answer `{ error }`, automation and broadcasts of a linked number wait (not burnt) while the switch isn't live, and "Take webhooks back" is hidden for linked numbers.
- Not yet built: the media MCP tools (`wa_get_media`, `wa_send_media`) on a linked number answer with an error until the platform has them. `wa_mark_read` only clears the unread badge here, so it works. Mark-read to the guest's phone (blue ticks) needs platform F2.
- Known: the template list shows at most the API's page cap (hotels have few templates).

## What must be built (ABS repo only; the platform is unchanged)
1. Migration: `wa_accounts.via_socially_snap boolean not null default false` (the 311 row set to true).
2. Link action + button (admin only; validates ids are plain digits; refuses a number already linked; sets the flag).
3. **Templates for linked numbers** (`listTemplates`, `createTemplate`, `deleteTemplate`) call the platform client
   with `from`, not Meta. Today they use `tokenForAccount`, which falls back to the 311 vault token: it would fail
   or hit the wrong WABA for a hotel. A linked account never falls back to that token.
4. **Mark-as-read and anything else that calls Meta directly** skips linked numbers (no error) until platform F2
   (mark-read/typing) exists.
5. Unlink: removes the `wa_accounts` row only; disconnecting the number is done in Socially Snap.
6. Tests: link validation, token never used for a linked account, templates routed via client, unlinked number still ignored.
7. Independent code + security review, then migration BEFORE push.

## Marketing messages (first use)
- Template "Marketing" category, hotel's opt-in wording agreed first (booking form checkbox / guest messages first).
- Broadcast to opted-in guests only; STOP list respected (existing opt-out words in `lib/whatsapp/words.ts`).
- Rates page already shows Meta's per-message price; hotel's card pays Meta.

## Order of work
1. Spec yes → build (steps 1–7) and deploy (no live change, no number linked yet).
2. Silver Sand owner connects the number in Socially Snap (his action).
3. Link it in ABS, check a chat arrives in the dashboard and in the portal, send one test template to Shoaib's own phone.
4. Test the Meta inbox question. Then first marketing template + small broadcast.
5. Elegant the same way.

## Open for Shoaib
- Silver Sand's number: **+92 300 8720939** (given by Shoaib, 2026-11-16). Still open: who logs in to Meta for the connect (owner or Shoaib with the owner present).
- Does the hotel agree that staff devices get unlinked once?
- Opt-in wording for guests.
