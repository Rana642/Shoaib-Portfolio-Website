import { letterheadFont } from "@/components/dashboard/letterhead-font";

/*
 * Shoaib's A4 letterhead, rebuilt as vector artwork from his Canva export.
 * The PDF only carries a ~127 DPI raster, which prints soft — so every
 * element here was measured off that export and redrawn: positions, sizes
 * and text widths all match the original. Two deliberate differences, both
 * Shoaib's call: the header uses the designer's official lockup from
 * public/brand (the Canva design carried an older version of the mark),
 * keeping the design's "PERFORMANCE MARKETING" line beneath it; and every
 * colour is the brand palette from app/globals.css rather than the export's
 * slightly-off values.
 *
 * Coordinates are tenths of a millimetre on a 2100 × 2970 A4 page (tenths
 * rather than mm keep SVG font sizes well above one user unit). Text uses
 * textLength so each line spans exactly the width it does in the design —
 * change a line's wording and its textLength needs updating too.
 */

const m = (mm: number) => Math.round(mm * 100) / 10;

// Brand tokens (app/globals.css) — hex literals because SVG presentation
// attributes can't read CSS variables in every print engine.
const COLOR = {
  ink: "#0F0F14",
  separator: "#8C8C8C",
  cobalt: "#2196F3",
  citrus: "#FEC107",
  forest: "#3FA343",
};

/** Body text colour for anything written on the sheet. */
export const LETTER_INK = COLOR.ink;

// Inter's cap height is 0.727 em; sizes are derived from measured cap heights.
const fs = (capMm: number) => m(capMm / 0.727);

// Footer glyphs, each stretched into the box it occupies in the original.
// Phone / mail / pin are Material "call", "mail_outline", "location_on"; the
// globe is drawn to the design's own geometry (in mm): a ring, an equator,
// two latitudes 1.08 mm either side, and two meridian arcs bowing 0.89 mm.
const PHONE_PATH =
  "M20.01 15.38c-1.23 0-2.42-.2-3.53-.56a.977.977 0 0 0-1.01.24l-1.57 1.97c-2.83-1.35-5.48-3.9-6.89-6.83l1.95-1.66c.27-.28.35-.67.24-1.02-.37-1.11-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H4.19C3.65 3 3 3.24 3 3.99 3 13.28 10.73 21 20.01 21c.71 0 .99-.63.99-1.18v-3.45c0-.54-.45-.99-.99-.99z";
const MAIL_PATH =
  "M22 6c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6zm-2 0l-8 5-8-5h16zm0 12H4V8l8 5 8-5v10z";
const PIN_PATH =
  "M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z";
const GLOBE_PATHS = [
  "M0.47 1.42H4.53",
  "M0.2 2.5H4.8",
  "M0.47 3.58H4.53",
  "M2.5 0.2A3.417 3.417 0 0 0 2.5 4.8",
  "M2.5 0.2A3.417 3.417 0 0 1 2.5 4.8",
];

type Box = { x: number; y: number; w: number; h: number };

function Glyph({ box, viewBox, children }: { box: Box; viewBox: string; children: React.ReactNode }) {
  return (
    <svg x={m(box.x)} y={m(box.y)} width={m(box.w)} height={m(box.h)} viewBox={viewBox} preserveAspectRatio="none">
      {children}
    </svg>
  );
}

/** A footer line. `width` pins it to the original design's measured span;
 *  lines added later (the NTN, the full address) set at Inter's own width. */
function FooterText({
  x,
  width,
  baseline = 278.85,
  children,
}: {
  x: number;
  width?: number;
  baseline?: number;
  children: string;
}) {
  return (
    <text
      x={m(x)}
      y={m(baseline)}
      fontSize={fs(2.2)}
      fontWeight={400}
      fill={COLOR.ink}
      {...(width ? { textLength: m(width), lengthAdjust: "spacing" } : {})}
    >
      {children}
    </text>
  );
}

// From Shoaib's FBR registration (Online Verification, 2026-09-25): the
// business address (without "Cantt." — Shoaib, 2026-10-05: the address is not in
// the cantonment), and the NTN (FBR "Reference No" — the 13-digit
// "Registration No" is his CNIC, which he keeps off public documents).
const NTN = "8200652-5";
const ADDRESS = "Bismillah Colony, Near Romi Cotton Factory, Khanewal Road, Street 6, Multan, Pakistan";

// One grid for header, body and footer: the letter body's 20 mm side margins
// (Shoaib, 2026-10-05: "Design change ker sakty ho Aesthically allignment k liye").
const MARGIN_L = 20;
const MARGIN_R = 190;
/** The tagline block ends on the right margin ("GROWTH TOMORROW", 40.21 mm, is its widest line). */
const TAGLINE_X = MARGIN_R - 40.21;
const ICON_GAP = 3.0;
// Footer row: four icon + text groups spread between the margins with equal
// gaps. Text widths measured in Inter at the footer size: 24.86, 24.21,
// 33.10 and 23.16 mm — re-measure if a line's wording changes.
const FOOT_GROUPS = [5.0 + ICON_GAP + 24.86, 4.4 + ICON_GAP + 24.21, 4.74 + ICON_GAP + 33.1, 5.0 + ICON_GAP + 23.16];
const FOOT_GAP = (MARGIN_R - MARGIN_L - FOOT_GROUPS.reduce((a, b) => a + b, 0)) / (FOOT_GROUPS.length - 1);
const FOOT = FOOT_GROUPS.map((_, i) => MARGIN_L + FOOT_GROUPS.slice(0, i).reduce((a, b) => a + b, 0) + FOOT_GAP * i);
const SEPARATORS = FOOT.slice(1).map((x) => x - FOOT_GAP / 2);
/** Address line: pin (3.9 mm) + 2.5 mm gap + text (123.46 mm in Inter), centred on the page. */
const ADDRESS_X = 105 - (3.9 + 2.5 + 123.46) / 2;

/** The fixed letterhead artwork — everything except the writable body. */
function LetterheadArtwork() {
  return (
    <svg className="absolute inset-0 h-full w-full" viewBox="0 0 2100 2970" aria-hidden>
      {/* Watermark: the official mark at 6.35× the header mark's height and
          3% opacity, centred on the page. */}
      <image href="/brand/mark.svg" x={m(105 - 127.2 / 2)} y={m(80.02)} width={m(127.2)} height={m(137.1)} opacity={0.03} />

      {/* ── Header ── the official horizontal lockup (mark 21.59 mm tall) on
          the 20 mm margin the letter body uses, with "PERFORMANCE MARKETING"
          set under the wordmark, spanning its width. The tagline block ends
          on the 190 mm right margin (no rule beside it — Shoaib, 2026-10-05). (Shoaib, 2026-10-05: one grid for
          header, body and footer.) */}
      <image href="/brand/logo-horizontal.svg" x={m(MARGIN_L)} y={m(10.44)} width={m(68.04)} height={m(22.39)} />
      <text x={m(MARGIN_L + 23.04)} y={m(35.09)} fontSize={fs(1.86)} fontWeight={500} fill={COLOR.ink} textLength={m(44.64)} lengthAdjust="spacing">
        PERFORMANCE MARKETING
      </text>

      <text x={m(TAGLINE_X)} y={m(20.12)} fontSize={fs(1.95)} fontWeight={500} fill={COLOR.ink} textLength={m(34.62)} lengthAdjust="spacing">
        STRATEGY TODAY
      </text>
      <text x={m(TAGLINE_X)} y={m(24.21)} fontSize={fs(1.95)} fontWeight={500} fill={COLOR.ink} textLength={m(40.21)} lengthAdjust="spacing">
        GROWTH TOMORROW
      </text>

      {/* ── Footer ── a hairline closes the writing area; below it the
          contact row runs edge to edge between the margins with equal gaps
          (each item's width measured in Inter), and the registered address
          sits centred on its own line. */}
      <rect x={m(MARGIN_L)} y={m(271.3)} width={m(MARGIN_R - MARGIN_L)} height={m(0.18)} fill={COLOR.separator} opacity={0.6} />

      <Glyph box={{ x: FOOT[0], y: 275.26, w: 5.0, h: 5.16 }} viewBox="0 0 5 5">
        <g fill="none" stroke={COLOR.ink} strokeWidth={0.4}>
          <circle cx={2.5} cy={2.5} r={2.3} />
          {GLOBE_PATHS.map((d) => (
            <path key={d} d={d} />
          ))}
        </g>
      </Glyph>
      <FooterText x={FOOT[0] + 5.0 + ICON_GAP}>adsbyshoaib.com</FooterText>

      <Glyph box={{ x: FOOT[1], y: 275.43, w: 4.4, h: 4.82 }} viewBox="3 3 18 18">
        <path d={PHONE_PATH} fill={COLOR.ink} />
      </Glyph>
      <FooterText x={FOOT[1] + 4.4 + ICON_GAP}>+92 301 7461642</FooterText>

      <Glyph box={{ x: FOOT[2], y: 276.02, w: 4.74, h: 3.56 }} viewBox="2 4 20 16">
        <path d={MAIL_PATH} fill={COLOR.ink} />
      </Glyph>
      <FooterText x={FOOT[2] + 4.74 + ICON_GAP}>info@adsbyshoaib.com</FooterText>

      {/* The business NTN, with an ID-card glyph drawn to match the globe. */}
      <Glyph box={{ x: FOOT[3], y: 275.7, w: 5.0, h: 4.3 }} viewBox="0 0 5 4.3">
        <g fill="none" stroke={COLOR.ink} strokeWidth={0.4} strokeLinecap="round">
          <rect x={0.2} y={0.2} width={4.6} height={3.9} rx={0.5} />
          <circle cx={1.55} cy={1.7} r={0.55} />
          <path d="M0.75 3.3c0.15-0.5 0.45-0.75 0.8-0.75s0.65 0.25 0.8 0.75" />
          <path d="M2.9 1.45H4.2M2.9 2.35H4.2" />
        </g>
      </Glyph>
      <FooterText x={FOOT[3] + 5.0 + ICON_GAP}>{`NTN ${NTN}`}</FooterText>

      {SEPARATORS.map((x) => (
        <rect key={x} x={m(x)} y={m(275.6)} width={m(0.25)} height={m(4.65)} fill={COLOR.separator} />
      ))}

      <Glyph box={{ x: ADDRESS_X, y: 281.62, w: 3.9, h: 5.16 }} viewBox="5 2 14 20">
        <path d={PIN_PATH} fill={COLOR.ink} />
      </Glyph>
      <FooterText x={ADDRESS_X + 3.9 + 2.5} baseline={285.3}>
        {ADDRESS}
      </FooterText>

      {/* ── Tri-colour base stripe ── */}
      <rect x={0} y={m(289.73)} width={m(76.62)} height={m(7.27)} fill={COLOR.cobalt} />
      <rect x={m(76.62)} y={m(289.73)} width={m(57.75)} height={m(7.27)} fill={COLOR.citrus} />
      <rect x={m(134.37)} y={m(289.73)} width={m(75.63)} height={m(7.27)} fill={COLOR.forest} />
    </svg>
  );
}


// Print exactly one A4 sheet, edge to edge: zero page margin, and every
// element that isn't the sheet (or one of its ancestors) removed from layout
// so the dashboard chrome can't add a second page. Scoped to the letterhead
// routes — the <style> only exists while a sheet is mounted. The list rules
// undo Tailwind's preflight reset so bullets and numbers show on the page.
const SHEET_CSS = `
@media print {
  @page { size: A4; margin: 0; }
  body :not(:has(.letterhead-sheet)):not(.letterhead-sheet):not(.letterhead-sheet *) { display: none !important; }
  *:has(.letterhead-sheet) { margin: 0 !important; padding: 0 !important; max-width: none !important; min-height: 0 !important; background: #fff !important; }
  .letterhead-scroll { overflow: visible !important; }
  html, body { width: 210mm !important; height: 297mm !important; overflow: hidden !important; }
  .letterhead-sheet { margin: 0 !important; box-shadow: none !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .letterhead-body { outline: none !important; }
  .letterhead-body:empty::before { content: none !important; }
}
.letterhead-body:empty::before { content: attr(data-placeholder); color: #a1a1aa; pointer-events: none; }
.letterhead-body ul { list-style: disc; padding-left: 1.4em; }
.letterhead-body ol { list-style: decimal; padding-left: 1.4em; }
`;

/** The A4 sheet with its artwork; children are laid over it (the writable
 *  body, positioned in mm). Scrolls sideways on screens narrower than A4. */
export function LetterheadSheet({ children }: { children?: React.ReactNode }) {
  return (
    <div className="letterhead-scroll overflow-x-auto pb-4">
      <style>{SHEET_CSS}</style>
      <div
        className={`letterhead-sheet ${letterheadFont.className} relative mx-auto bg-white shadow-[0_2px_24px_-6px_rgba(15,15,20,0.25)]`}
        style={{ width: "210mm", height: "297mm" }}
      >
        <LetterheadArtwork />
        {children}
      </div>
    </div>
  );
}
