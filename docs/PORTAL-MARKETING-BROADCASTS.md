# Portal marketing broadcasts and the opt-in (17 Nov 2026)

Shoaib's decisions: marketing messages from the client portal, for the Owner and for team members the Owner gives it to; opt-in is collected by a YES question in the chat, by staff recording it, and later by a website checkbox; no blast to old contacts.

## Meta policy (checked 7, 9 and 17 Nov; from our KB policy docs and Meta's messaging policy)
- Meta leaves the way of getting opt-in to the business, but it must be a clear yes to later messages. A chat or a form alone is not opt-in. Separate opt-in per kind of message is advised.
- A business-started message outside the 24 h window needs an approved template; marketing templates must be in the MARKETING category.
- STOP is honoured on and off WhatsApp. The platform stops all marketing to that guest.
- Each hotel pays Meta with its own card. No markup.
- Vendor guides (not Meta): don't auto-enrol old lists; invite them to opt in; log when, where and how; separate checkbox for WhatsApp. Unverified: a mandatory "opt-out button" on marketing templates.
- Not decided here: Pakistan's own data-protection rules.

## What is built
- **The question.** Automation has a fourth block, "Offers opt-in question": once per guest, `delayMin` minutes after the team has answered, inside the 24 h window. The text must contain YES and STOP. The message is stored with `raw.kind = optin_prompt`; `wa_contacts.optin_asked_at` makes it once.
- **The answer.** An inbound text that is exactly YES / Y / Haan / Han / Han ji / Yes please, within 24 h of that question, sets `marketing_opt_in_at` (`marketing_opt_in_source = chat_yes`). A STOP clears it. A YES never overrides a STOP.
- **Staff.** Portal Contacts: "Mark agreed" (with a confirm line) or "Take back", on the guest's WhatsApp chats of that business (`marketing_opt_in_source = staff`). Not possible after STOP.
- **Broadcasts in the portal** (`wa_broadcasts` switch, delegable to team members): only to guests with `marketing_opt_in_at`, whatever the browser sends (`requireOptIn` in `lib/portal/wa-tools.ts`); `wa_broadcasts.require_opt_in` makes the sender skip a guest whose consent is gone; at most 250 guests per 24 h per number (`PORTAL_BROADCAST_DAILY_CAP`, Meta's start limit); cost estimate and confirm as in the admin form.
- **Old contacts.** Nothing is sent to them. They enter the list only by saying YES in a new chat, by staff recording an agreement given in person or by phone, or later by a website checkbox.

## Not yet
- A "thanks, you're in" reply after YES.
- The website checkbox (needs the hotel websites to send it).
- Business verification (raises the 250 limit).
- Elegant's and Silver Sand's template wording and the first test broadcast.
