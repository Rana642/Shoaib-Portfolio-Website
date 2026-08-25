/*
 * Plain-HTML transactional emails — inline styles only, since most email
 * clients strip <style> blocks. Kept intentionally simple: these are
 * notifications, not marketing sends.
 */

const wrapper = (body: string) => `
  <div style="font-family: -apple-system, Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #0F0F14;">
    <div style="padding: 4px 0 20px; font-style: italic; font-size: 20px;">
      ads by shoaib<span style="font-style: normal; color: #EAB308;">.</span>
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

export function contactAutoReplyEmail(name: string) {
  return wrapper(`
    <h2 style="font-size: 18px; margin: 0 0 16px;">Got it — audit incoming.</h2>
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
      <a href="${data.url}" style="display: inline-block; background: #EAB308; color: #0F0F14; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">
        View the proposal
      </a>
    </p>
    <p style="font-size: 14px; line-height: 1.6; color: #666;">
      Any questions before you decide, just reply to this email.<br /><br />
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
      <a href="${data.url}" style="display: inline-block; background: #EAB308; color: #0F0F14; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">
        Complete onboarding
      </a>
    </p>
    <p style="font-size: 14px; line-height: 1.6; color: #666;">
      Takes a few minutes — talk soon.<br /><br />
      — Shoaib
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
