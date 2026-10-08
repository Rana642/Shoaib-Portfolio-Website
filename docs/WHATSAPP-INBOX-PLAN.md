# WhatsApp inbox + booking tracking: plan (draft, 2026-10-08)

## Goal
Each hotel's reception WhatsApp number (the NAP/GBP number) is synced into the dashboard through **coexistence**. Staff keep using the WhatsApp Business app as before, while the dashboard does the following:
- saves every chat
- reads the website "Ref:" code automatically
- runs auto-replies
- lets staff mark a chat as a **confirmed booking**

Every booking is then traced back to the ad that brought it, and that result is sent back to Meta and Google so the ads learn from real bookings.

**Rules:**
- **Same number:** no second number, and NAP stays intact.
- **Cost:** guest-started chats and replies within 24h are free. Only business-started templates are paid.

## Phases

### 1. Setup (Shoaib + hotel, ~1–2 days)
- **Meta Business verification** for the business that will own the WhatsApp accounts. Ads by Shoaib is the partner; each hotel gets its own WhatsApp Business Account.
- **Meta app:** add the WhatsApp product to the ABS Marketing app (1055869013734120) and set the webhook to `/api/whatsapp/webhook`.
- **Connect each hotel number:**
  - Use **Embedded Signup → "Connect your existing WhatsApp Business app"** (coexistence), from a dashboard button.
  - The reception phone scans a QR code; Business app version must be ≥ 2.24.17.
  - Chat history (last 6 months) syncs within 24h.
- **Effects on the phone:** WhatsApp for Windows unlinks. Broadcast lists become read-only. Calls and groups stay in the app only.

### 2. Inbox in the dashboard
- **Tables:** `wa_accounts` (hotel number ↔ client project), `wa_contacts`, `wa_messages`. Media goes to R2.
- **Webhook stores:**
  - incoming messages
  - messages staff send from the phone ("echoes" via coexistence)
  - delivery/read status
- **`/dashboard/whatsapp`:** a Meta-inbox-style list per hotel, chat view, reply box (within the 24h window), labels.
- **Client portal:** the hotel owner and reception staff (portal **member** accounts) see their own hotel's inbox.

### 3. Ref code + booking tracking (replaces the paper register)
- Each new chat's first message is parsed for `Ref: FB-SFC1` and similar codes. The chat gets source = Facebook / Google / organic, plus the ad code.
- **Chat status:** New → Rates sent → **Booked** / Not booked.
- **"Mark as booked" button:** room, check-in date, nights, amount. One click from the inbox.
- **Calls:** staff pick the source from a dropdown (FB / Google / Other) when adding a phone booking by hand.
- The monthly client report gets a **"WhatsApp bookings by ad"** table: spend → chats → bookings → cost per booking, per ad code.

### 4. Automation
- **Instant reply** to a new chat, only if staff haven't replied within ~2 minutes, so it never talks over them. It sends a greeting, today's rates and deals, and the website booking link.
- **After-hours reply** (if the front desk is offline), with the same content plus "we'll call you shortly".
- **Quick replies** in the dashboard: rates, location pin, check-in policy, bank details for deal bookings (Elegant only).
- **Follow-up:** a chat with no reply from the guest gets one reminder within the free 24h window. Nothing after that unless a paid template is approved.
- **Booking-confirmation template** (utility, paid per message) sent when "Mark as booked" is pressed. Optional.

### 5. Feed results back to the ads
- **On "Booked":**
  - Send a **Meta Conversions API Purchase** with the hashed phone and the booking value. Meta then optimises on real WhatsApp bookings, not just taps.
  - Send a **Google Ads offline conversion**. This needs the click id: the website will add a short click key to the Ref code, e.g. `FB-SFC1·k7f2`.
- This is the biggest lever for lowering cost per booking.

### 6. MCP tools
Shipped on both the local and remote MCP:
- `whatsapp_inbox`
- `whatsapp_mark_booked`
- `whatsapp_bookings_by_ad`

## Decisions needed from Shoaib
1. **Auto-reply:** on (with the 2-minute "staff didn't answer" rule) or off at first?
2. **Who marks bookings:** reception staff through portal member logins, or Shoaib/hotel manager only?
3. **Booking-confirmation template** to the guest: yes or no (small per-message charge)?
4. **Start with:** both hotels together, or Silver Sand first as the pilot?

## Notes
- Per-number throughput with coexistence is 20 messages/second, far more than a hotel needs.
- Guest phone numbers are personal data: they stay in the hotel's inbox, never in KB logs or reports. Reports show counts only.
- Production hotel booking DBs are not written to. Bookings made from WhatsApp live in the dashboard; syncing into each hotel's own admin can be a later phase.
