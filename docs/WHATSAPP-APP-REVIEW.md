# WhatsApp App Review — Socially Snap (app 1891824261787767)

**Goal:** get **Advanced Access** for `whatsapp_business_messaging` and `whatsapp_business_management`. After approval the "Connect a WhatsApp number" button (Embedded Signup + coexistence QR) starts working for clients. Before that it shows "can't onboard customers right now" — that is expected, and the recordings below do NOT need it.

**Where to submit:** Meta App Dashboard → Socially Snap → App Review → Permissions and Features → request Advanced Access for each permission. Each one needs a **description** and a **screencast**.

---

## Tayyari (recording se pehle)

1. **Production dashboard use karein:** `https://adsbyshoaib.com/dashboard/whatsapp`, login pehle se kar lein. Recording mein password type nahi hona chahiye.
2. **Phone ka WhatsApp screen par:** `web.whatsapp.com` kholein, apne number +92 301 7461642 se. Dono windows saath saath rakhein: baen taraf dashboard, daen taraf WhatsApp Web. Reviewer ko ek hi recording mein message bhejna AUR aana dono dikhna chahiye.
3. **Zaban:** browser English mein. Recording bina awaaz ke, sirf screen. 1–3 minute kaafi hain.
4. **Recorder:** Windows ka Xbox Game Bar (Win + Alt + R), ya OBS. MP4 save karein.
5. **24 ghante ki window:** recording shuru karne se 1–2 minute pehle WhatsApp Web se test number (+1 555-202-0163) ko "Hi" bhej dein, taake normal reply ja sake. Recording 1 mein ye step dobara dikhana hai.

---

## Recording 1 — `whatsapp_business_messaging`

**Dikhana hai:** customer ka message app mein aata hai, staff app se reply karta hai, aur reply customer ke WhatsApp mein pohanchta hai.

1. Dashboard → **WhatsApp → Inbox** khula ho. Daen taraf WhatsApp Web.
2. WhatsApp Web se test number ko likhein: `Hi, is a room available this weekend?`
3. Dashboard mein ye chat aa jayegi (page har 8 second refresh hota hai). Chat par click karein, aur customer ka message dikhayein.
4. Neeche reply box mein likhein: `Yes, we have rooms available. Shall I share the rates?` → **Send**.
5. Daen taraf WhatsApp Web par reply aata dikhayein (2–3 second ruk jayein).
6. *(Optional, achha lagta hai)* chat mein upar **Send a template** / **Template** → `hello_world` → **Send**, aur WhatsApp Web par template aata dikhayein.
7. Recording band.

## Recording 2 — `whatsapp_business_management`

**Dikhana hai:** app ke andar message template banana (WhatsApp Business Account ko manage karna).

1. Dashboard → **WhatsApp → Templates**. Pehle se mojood templates ki list (status ke saath) dikhayein.
2. **New template** form mein:
   - Name: `booking_confirmation_demo`
   - Category: **Utility**
   - Language: **English**
   - Message: `Hi {{1}}, your booking {{2}} is confirmed. Reply here if you have any questions.`
   - Example for {{1}}: `Ali`, Example for {{2}}: `#1042`
   - Footer: `Reply STOP to stop messages`
3. Daen taraf preview dikhayein → **Submit for review**.
4. Green message "Sent to Meta for review" aur page refresh par list mein naya template **pending** dikhayein.
5. *(Optional)* **WhatsApp → Numbers** kholein: connected number aur uska business link dikhayein.
6. Recording band. Baad mein ye demo template delete kar sakte hain.

---

## Form mein likhne wali descriptions (copy-paste, English)

### whatsapp_business_messaging

> Socially Snap is a shared WhatsApp inbox for small businesses such as hotels, clinics and shops. A business connects its own WhatsApp Business number through Embedded Signup (including WhatsApp Business app coexistence).
>
> We use whatsapp_business_messaging to:
> - receive the business's incoming customer messages and delivery/read statuses through webhooks, and show them in a team inbox;
> - send replies typed by the business's staff inside the 24-hour customer service window;
> - send the business's approved template messages (for example booking or order confirmations) and opt-in broadcasts.
>
> Messages are only sent by the business's own staff or by simple automations the business switches on itself (for example an after-hours reply). Customers who reply STOP are excluded automatically, and marketing broadcasts require the business to confirm opt-in.
>
> The screencast shows a customer message arriving in our inbox, a staff reply being sent from our app, and the reply being received in WhatsApp.

### whatsapp_business_management

> We use whatsapp_business_management so a business can manage its own WhatsApp Business Account from Socially Snap after connecting it through Embedded Signup:
> - read its phone numbers and display name;
> - create, list and delete its message templates (submitted to Meta for review);
> - subscribe our app to its WABA webhooks during onboarding;
> - for WhatsApp Business app users (coexistence), request the one-time contacts and chat-history sync at onboarding.
>
> We only access WhatsApp Business Accounts whose owner explicitly connected them to our app through Embedded Signup. Access is removed when the business disconnects the number.
>
> The screencast shows a message template being created and submitted from our app.

### Note for the reviewer (agar form mein "notes" / "instructions" ka khana ho)

> Socially Snap is operated by Ads by Shoaib (adsbyshoaib.com). The screencasts show our operator dashboard at adsbyshoaib.com/dashboard, which is the same Socially Snap WhatsApp inbox the businesses use in their client portal. The recordings use our own test WhatsApp Business number (+1 555-202-0163). Embedded Signup cannot be shown yet because onboarding is only enabled after these permissions are approved.
> Privacy policy: https://sociallysnap.adsbyshoaib.com/privacy#whatsapp — data deletion: https://sociallysnap.adsbyshoaib.com/data-deletion

---

## Submit ke baad

- Review aam taur par kuch din leta hai. Reject ho to Meta ki wajah yahan paste karein, us hisaab se recording ya description theek karenge.
- Approval ke baad: Numbers → **Connect a WhatsApp number** → hotel ka reception number (coexistence QR) → Numbers par usko Silver Sand / Elegant se link karein.
- **Business Verification aur Access Verification** bhi complete honi chahiye. Tab tak Meta har 7 din mein sirf 10 naye business onboard karne deta hai; sab complete hone par ye limit 200 ho jati hai.
