import Image from "next/image";
import { hostinger } from "@/lib/hostinger";

/**
 * Hostinger's official "Verified Partner" badge — shown unmodified on its
 * own clean purple background (per Hostinger's brand rules), linking to the
 * partner referral. Doubles as a trust signal and a referral entry point.
 * The referral is an affiliate link, hence rel="sponsored".
 */
export default function HostingerPartnerBadge({
  width = 168,
  square = false,
  asLink = true,
  className = "",
}: {
  width?: number;
  /** Use the square lockup instead of the horizontal pill. */
  square?: boolean;
  /** When false, renders the badge as a plain credential image with no
   *  referral link — for client-facing documents (proposals, agreements)
   *  where an affiliate link would be out of place. */
  asLink?: boolean;
  className?: string;
}) {
  const src = square ? hostinger.badge.square : hostinger.badge.horizontal;
  // Source aspect ratios: horizontal 320×120, square 240×240.
  const height = square ? width : Math.round((width * 120) / 320);
  const img = <Image src={src} alt="Verified Hostinger Partner" width={width} height={height} />;

  if (!asLink) {
    return (
      <span className={`inline-block shrink-0 ${className}`} title="Verified Hostinger Partner">
        {img}
      </span>
    );
  }

  return (
    <a
      href={hostinger.referralUrl}
      target="_blank"
      rel="sponsored noopener noreferrer"
      aria-label={`Verified Hostinger Partner — save ${hostinger.discount} with code ${hostinger.coupon}`}
      title="Verified Hostinger Partner"
      className={`inline-block shrink-0 transition-transform duration-300 hover:-translate-y-0.5 ${className}`}
    >
      {img}
    </a>
  );
}
