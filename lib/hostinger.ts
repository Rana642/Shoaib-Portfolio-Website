/**
 * Hostinger Partner program — referral link, coupon, and official badge
 * assets in one place, so the code/link only ever changes here.
 *
 * The badge PNGs are Hostinger's official "Verified Partner" badge, used
 * UNMODIFIED and on their own clean background per Hostinger's brand rules
 * (don't recolour, resize the artwork, or place on a busy background).
 * Referral links are affiliate links, so every one is rendered with
 * rel="sponsored" for search-engine compliance.
 */
export const hostinger = {
  coupon: "NAWAL20",
  discount: "20%",
  referralUrl: "https://www.hostinger.com/pk?REFERRALCODE=NAWAL20",
  badge: {
    /** 320×120 source */
    horizontal: "/png/hp-badge-dark.png",
    /** 240×240 source */
    square: "/png/hp-badge-sq-dark.png",
  },
} as const;
