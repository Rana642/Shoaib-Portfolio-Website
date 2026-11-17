# WhatsApp booking bot (Elegant first)

Written 17 Nov 2026. Goal: a guest who messages the hotel's WhatsApp can book and pay the advance in chat, like the website
booking form. Serious guests finish alone; staff only see paid or "talk to staff" chats. Every booking is recorded in the hotel's
own admin, so the existing Meta (CAPI) and GA4 events fire, and the dashboard source (FB / Google / direct) is filled in.

Decisions (Shoaib, 17 Nov): advance is confirmed by **receipt photo + staff one tap**; the booking lives in the **hotel admin
`bookings`**, and staff can confirm it from the hotel admin OR from the ABS portal (both already fire the same Meta/GA4 events).
Silver Sand follows once its number is connected.

## Guest flow
1. First message → greeting (existing instant auto-reply) with buttons: **Book a room · Rates · Location · Talk to staff**.
2. **Book a room**: check-in date → nights/check-out → adults/children → room (list with live rate and availability from the hotel)
   → summary (room, dates, total with tax, advance amount) → "Confirm".
3. Payment: the hotel's Easypaisa/Raast/bank details (already in use) + "send the receipt photo".
4. Receipt photo arrives → booking is created as **pending payment** (room blocked), staff get a notification.
5. Staff tap **Confirm payment** (hotel admin or portal) → booking `confirmed`, guest gets the confirmation with the booking ref.
6. Not paid within the hold time → booking released, guest gets one polite reminder before.
Anything the bot can't answer, or "Talk to staff", hands the chat to staff (existing "intervened" state).

## Where things live
- **Hotel site (Elegant)**: one small server endpoint, `POST /api/bot/booking`. `quote` returns rooms,
  prices and availability using the site's own pricing code; `create` calls the site's `createBooking` (same price, tax, deal, availability
  and room-blocking rules; `source = whatsapp`; attribution from the chat's Ref tag; receipt URL saved as the advance-payment screenshot).
  Signed like the existing portal hooks (HMAC with the site's service key, which ABS already holds encrypted), so no new secret. ABS does not insert into the hotel database itself.
- **ABS**: the conversation state (step, answers) per chat, the message templates and buttons, receipt detection, staff notification,
  and the portal "Confirm payment" action (uses the existing `setHotelBookingStatus`).
- **Meta / GA4**: same as the website, by Shoaib's design: the Purchase is sent when the booking is SUBMITTED, because the guest confirming in the chat
  is the booking intent and staff can't always confirm in time (waiting would delay the ad optimisation). A bot booking goes through the same
  `createBookingCore` -> `fireBookingSubmittedCapi` path; `action_source` is `chat`, or the ad is credited when the booking has ad attribution. Status → completed
  still fires StayCompleted + GA4 (hotel admin and portal), as the quality signal. Staff confirming the advance only changes the status and messages the guest.
- **No double Purchase with "Mark as booked"**: when the bot creates a booking, the chat's booking details get `hotel_ref` = the booking ref, so the existing
  "Booked chat → Purchase" hook (`sendWhatsAppPurchase`) skips it.

## No double booking (website form + WhatsApp)
A guest can fill the website booking form and then open WhatsApp (the website's WhatsApp message even carries `Booking Ref: HE-XXXXXX`). So:
1. When a chat starts, the bot asks the hotel endpoint (`lookup`) for this guest's upcoming pending/confirmed bookings: by the chat's phone number (last 10 digits, any
   format) and by any booking ref quoted in the first messages. If one exists the bot does NOT offer "Book a room": it shows that booking (ref, dates, status),
   and offers "Send payment receipt", "Change dates (staff)" and "Talk to staff". A second booking is only started if the guest explicitly says it is an additional room.
2. The hotel endpoint itself refuses a `create` for a phone that already has an overlapping pending/confirmed/checked-in booking (`error: duplicate`), unless
   `allowAdditional: true` was sent after that explicit choice. Back-to-back stays (check-out day = next check-in) are not a clash.
3. A ref match from another phone number shows only the ref, dates and status (it could be anyone typing a ref).

## Staff-made bookings (chat audit)
A chat where staff book by hand is picked up by the chat audit (confirm form sent, CNIC/receipt, "confirmed", room given). It creates a
"suggested booking" for staff to confirm with one tap; source comes from the chat's Ref tag or first message (FB / GA / GS / direct).
Nothing is sent to Meta until a person confirms it.

## Needs from the hotel / Shoaib
1. Elegant database: add `whatsapp` to the `booking_source` enum (one SQL line, run once).
2. (No shared secret needed: the endpoint uses the same signing key as the portal hooks.)
3. Advance amount rule (fixed % of the total, or one night) and hold time (e.g. 2 hours).
4. WhatsApp interactive messages (buttons/lists) must be allowed on the connected number; to be tested first.

## Build order
1. Hotel endpoint (`quote`, `create`) + tests, no UI. 2. ABS conversation engine (text + buttons) behind a per-number switch, off by default.
3. Receipt detection + staff Confirm payment (portal and hotel admin). 4. Chat audit → suggested bookings. 5. Test with Shoaib's own number, then switch on.

Not in this first version: online payment gateway (later, when a merchant account exists), Silver Sand, WhatsApp Flows forms.
