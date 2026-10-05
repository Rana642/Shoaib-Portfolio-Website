/*
 * Plain-HTML transactional emails — inline styles only, since most email
 * clients strip <style> blocks. Kept intentionally simple: these are
 * notifications, not marketing sends.
 */

const wrapper = (body: string) => `
  <div style="font-family: -apple-system, Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #0F0F14;">
    <div style="padding: 4px 0 20px; font-style: italic; font-size: 20px;">
      ads by shoaib<span style="font-style: normal; color: #FEC107;">.</span>
    </div>
    ${body}
    <div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #eee; font-size: 12px; color: #888;">
      Ads by Shoaib — Performance Marketing by Shoaib Nabi Noor
    </div>
  </div>
`;

export function contactNotificationEmail(data: {
  name: string;
  email: string;
  business: string;
  budget: string;
  message: string;
}) {
  return wrapper(`
    <h2 style="font-size: 18px; margin: 0 0 16px;">New audit request</h2>
    <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
      <tr><td style="padding: 6px 0; color: #666; width: 110px;">Name</td><td>${escapeHtml(data.name)}</td></tr>
      <tr><td style="padding: 6px 0; color: #666;">Email</td><td>${escapeHtml(data.email)}</td></tr>
      <tr><td style="padding: 6px 0; color: #666;">Business</td><td>${escapeHtml(data.business)}</td></tr>
      <tr><td style="padding: 6px 0; color: #666;">Budget</td><td>${escapeHtml(data.budget)}</td></tr>
    </table>
    <p style="margin-top: 16px; font-size: 14px; line-height: 1.6;">${escapeHtml(data.message)}</p>
  `);
}

export function contactAutoReplyEmail(name: string, setup?: string) {
  const heading = setup ? `Got your order: ${escapeHtml(setup)}.` : "Got it — audit incoming.";
  return wrapper(`
    <h2 style="font-size: 18px; margin: 0 0 16px;">${heading}</h2>
    <p style="font-size: 14px; line-height: 1.6;">
      Hi ${escapeHtml(name)},<br /><br />
      Thanks for reaching out. I read every message myself and reply within
      24 hours on working days. Talk soon.<br /><br />
      — Shoaib
    </p>
  `);
}

export function newsletterWelcomeEmail() {
  return wrapper(`
    <h2 style="font-size: 18px; margin: 0 0 16px;">You're in.</h2>
    <p style="font-size: 14px; line-height: 1.6;">
      Field notes on what actually moves the needle in paid media — no fluff,
      sent when there's something worth saying. Talk soon.<br /><br />
      — Shoaib
    </p>
  `);
}

export function proposalSentEmail(data: { name: string; url: string }) {
  return wrapper(`
    <h2 style="font-size: 18px; margin: 0 0 16px;">A proposal for you</h2>
    <p style="font-size: 14px; line-height: 1.6;">
      Hi ${escapeHtml(data.name)},<br /><br />
      I've put together a proposal based on what we discussed — services,
      scope, and investment, all in one place.
    </p>
    <p style="margin: 24px 0;">
      <a href="${data.url}" style="display: inline-block; background: #FEC107; color: #0F0F14; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">
        View the proposal
      </a>
    </p>
    <p style="font-size: 14px; line-height: 1.6; color: #666;">
      Any questions before you decide, just reply to this email.<br /><br />
      — Shoaib
    </p>
  `);
}

export function agreementReadyEmail(data: { name: string; url: string }) {
  return wrapper(`
    <h2 style="font-size: 18px; margin: 0 0 16px;">One more step — your agreement</h2>
    <p style="font-size: 14px; line-height: 1.6;">
      Hi ${escapeHtml(data.name)},<br /><br />
      Thanks for accepting the proposal. Before we start, here's the
      consultation agreement covering scope, fees, and terms — take a look
      and sign when you're ready.
    </p>
    <p style="margin: 24px 0;">
      <a href="${data.url}" style="display: inline-block; background: #FEC107; color: #0F0F14; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">
        Review & sign
      </a>
    </p>
    <p style="font-size: 14px; line-height: 1.6; color: #666;">
      Questions before signing, just reply to this email.<br /><br />
      — Shoaib
    </p>
  `);
}

export function onboardingInviteEmail(data: { name: string; url: string }) {
  return wrapper(`
    <h2 style="font-size: 18px; margin: 0 0 16px;">Welcome aboard — let's get started</h2>
    <p style="font-size: 14px; line-height: 1.6;">
      Hi ${escapeHtml(data.name)},<br /><br />
      Thanks for confirming — before we dive in, I need a few details about
      your business so the work starts on the right foot.
    </p>
    <p style="margin: 24px 0;">
      <a href="${data.url}" style="display: inline-block; background: #FEC107; color: #0F0F14; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">
        Complete onboarding
      </a>
    </p>
    <p style="font-size: 14px; line-height: 1.6; color: #666;">
      Takes a few minutes — talk soon.<br /><br />
      — Shoaib
    </p>
  `);
}

const button = (url: string, label: string) => `
    <p style="margin: 24px 0;">
      <a href="${url}" style="display: inline-block; background: #FEC107; color: #0F0F14; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">
        ${label}
      </a>
    </p>`;

/** Invites someone at a client into the client portal. */
export function portalInviteEmail(data: { name: string; clientName: string; url: string; invitedBy?: string }) {
  const intro = data.invitedBy
    ? `${escapeHtml(data.invitedBy)} has added you to the ${escapeHtml(data.clientName)} client portal — the private
      space where we work together on their marketing.`
    : `I've set up a private portal for ${escapeHtml(data.clientName)}. It's where you'll send me
      your account logins securely — they're encrypted on your device before they leave it —
      and, soon, see your content planner and reports.`;
  return wrapper(`
    <h2 style="font-size: 18px; margin: 0 0 16px;">Your client portal is ready</h2>
    <p style="font-size: 14px; line-height: 1.6;">
      Hi ${escapeHtml(data.name)},<br /><br />
      ${intro}
    </p>
    ${button(data.url, "Set your password")}
    <p style="font-size: 13px; line-height: 1.6; color: #666;">
      The link works once. If it has expired, reply to this email and I'll send a fresh one.<br /><br />
      — Shoaib
    </p>
  `);
}

/** Password reset for a client-portal user. */
export function portalResetEmail(data: { url: string }) {
  return wrapper(`
    <h2 style="font-size: 18px; margin: 0 0 16px;">Reset your portal password</h2>
    <p style="font-size: 14px; line-height: 1.6;">
      Someone asked to reset the password for your Ads by Shoaib client portal. If that was you,
      choose a new one here:
    </p>
    ${button(data.url, "Choose a new password")}
    <p style="font-size: 13px; line-height: 1.6; color: #666;">
      If you didn't ask for this, you can ignore this email — your password stays the same.
    </p>
  `);
}

/** Tells a client which of their accounts had a password changed for
 *  security. Deliberately never includes a password — only which accounts. */
export function passwordChangeNoticeEmail(data: { name: string; accounts: string[] }) {
  const list = data.accounts.map((a) => `<li style="margin: 0 0 6px;">${escapeHtml(a)}</li>`).join("");
  return wrapper(`
    <h2 style="font-size: 18px; margin: 0 0 16px;">A security update on your accounts</h2>
    <p style="font-size: 14px; line-height: 1.6;">
      Hi ${escapeHtml(data.name)},<br /><br />
      To keep the accounts I manage for you secure, I've changed the password on:
    </p>
    <ul style="font-size: 14px; line-height: 1.6; padding-left: 20px; margin: 12px 0 16px;">${list}</ul>
    <p style="font-size: 14px; line-height: 1.6;">
      The new passwords are kept in my encrypted vault, and for your safety they're never
      sent by email. If you need one, reply here or message me on WhatsApp and I'll share it
      with you directly.
    </p>
    <p style="font-size: 14px; line-height: 1.6; color: #666;">
      — Shoaib
    </p>
  `);
}

/** Tells whoever uploaded planner graphics which ones need a change before
 *  they can be scheduled, and what exactly is wrong with each. */
export function postChangesRequestEmail(data: {
  items: { project: string; filename: string; date: string; issue: string; imageUrl: string | null }[];
  plannerUrl: string;
}) {
  const many = data.items.length > 1;
  const rows = data.items
    .map(
      (item) => `
    <tr>
      <td style="padding: 12px 12px 12px 0; vertical-align: top; width: 96px;">
        ${
          item.imageUrl
            ? `<img src="${item.imageUrl}" alt="" width="96" style="display: block; width: 96px; height: auto; border-radius: 6px; border: 1px solid #eee;" />`
            : ""
        }
      </td>
      <td style="padding: 12px 0; vertical-align: top; font-size: 14px; line-height: 1.6;">
        <div style="color: #666; font-size: 12px;">${escapeHtml(item.project)} · ${escapeHtml(item.filename)} · ${escapeHtml(item.date)}</div>
        <div style="margin-top: 4px;">${escapeHtml(item.issue)}</div>
      </td>
    </tr>`
    )
    .join("");
  return wrapper(`
    <h2 style="font-size: 18px; margin: 0 0 16px;">${many ? `${data.items.length} posts need` : "A post needs"} a change</h2>
    <p style="font-size: 14px; line-height: 1.6;">
      Hi,<br /><br />
      I checked the graphics uploaded to the planner. ${many ? "These need" : "This one needs"} a change
      before I can schedule ${many ? "them" : "it"}:
    </p>
    <table style="width: 100%; border-collapse: collapse; border-top: 1px solid #eee; border-bottom: 1px solid #eee;">${rows}</table>
    <p style="font-size: 14px; line-height: 1.6; margin-top: 16px;">
      Open the planner and use <strong>Replace image</strong> on each one. It keeps the same day.
    </p>
    ${button(data.plannerUrl, "Open the planner")}
    <p style="font-size: 14px; line-height: 1.6; color: #666;">
      Questions? Just reply to this email.<br /><br />
      — Shoaib
    </p>
  `);
}

/** To Shoaib: the 1st-of-month billing run made drafts that need a look. */
export function retainerDraftsReadyEmail(data: {
  url: string;
  created: { retainer: string; month: string; invoice: string }[];
  failed: { retainer: string; month: string; error: string }[];
}) {
  const rows = data.created
    .map(
      (r) =>
        `<tr><td style="padding: 6px 0;">${escapeHtml(r.retainer)}</td><td style="padding: 6px 0; color: #666;">${escapeHtml(r.month)}</td><td style="padding: 6px 0; text-align: right;">${escapeHtml(r.invoice)}</td></tr>`
    )
    .join("");
  const failed = data.failed
    .map((r) => `<li>${escapeHtml(r.retainer)} (${escapeHtml(r.month)}): ${escapeHtml(r.error)}</li>`)
    .join("");
  return wrapper(`
    <h2 style="font-size: 18px; margin: 0 0 12px;">Monthly invoices ready for review</h2>
    <p style="font-size: 14px; line-height: 1.6; margin: 0 0 16px;">
      These retainer invoices — and last monthThese retainer invoices were created as drafts. Nothing has gone to the client — review each one and send it.#39;s report for each client — were created as drafts. Nothing has gone to the client: review each one and send it.
    </p>
    ${rows ? `<table style="width: 100%; border-collapse: collapse; font-size: 14px;">${rows}</table>` : ""}
    ${failed ? `<p style="font-size: 14px; margin: 16px 0 4px; color: #b42318;">Couldn't create:</p><ul style="font-size: 14px; margin: 0; padding-left: 18px;">${failed}</ul>` : ""}
    <p style="margin: 24px 0 0;">
      <a href="${data.url}" style="display: inline-block; background: #0F0F14; color: #FAFAFA; padding: 10px 18px; border-radius: 8px; text-decoration: none; font-size: 14px;">Open invoices</a>
    </p>
  `);
}

/** To the client + their portal users: a sent invoice and/or monthly report. */
export function billingSentEmail(data: {
  clientName: string;
  invoice?: { number: string; amount: string; due: string | null; url: string; month: string | null };
  report?: { month: string; url: string };
  portalUrl: string;
}) {
  const button = (href: string, label: string) =>
    `<a href="${href}" style="display: inline-block; background: #0F0F14; color: #FAFAFA; padding: 10px 18px; border-radius: 8px; text-decoration: none; font-size: 14px; margin: 0 8px 8px 0;">${label}</a>`;
  const intro = data.invoice
    ? `Here is invoice <strong>${escapeHtml(data.invoice.number)}</strong>${data.invoice.month ? ` for ${escapeHtml(data.invoice.month)}` : ""}: <strong>${escapeHtml(data.invoice.amount)}</strong>${data.invoice.due ? `, due ${escapeHtml(data.invoice.due)}` : ""}.`
    : "";
  const report = data.report
    ? `${data.invoice ? " Your" : "Your"} monthly report for <strong>${escapeHtml(data.report.month)}</strong> is ready too — what was done and how the numbers moved.`
    : "";
  return wrapper(`
    <p style="font-size: 14px; line-height: 1.6; margin: 0 0 16px;">Hi ${escapeHtml(data.clientName)},</p>
    <p style="font-size: 14px; line-height: 1.6; margin: 0 0 20px;">${intro}${report}</p>
    <p style="margin: 0 0 12px;">
      ${data.invoice ? button(data.invoice.url, "View invoice") : ""}${data.report ? button(data.report.url, "View report") : ""}
    </p>
    <p style="font-size: 13px; line-height: 1.6; color: #666; margin: 12px 0 0;">
      Both are also in your client portal: <a href="${data.portalUrl}" style="color: #0F0F14;">${data.portalUrl.replace(/^https?:\/\//, "")}</a>.
      Reply to this email with any questions.
    </p>
  `);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
