"use client";

import { useRef, useState } from "react";
import { Printer, TriangleAlert } from "lucide-react";
import { buttonStyles } from "@/components/dashboard/ui";
import { letterheadFont } from "@/components/dashboard/letterhead-font";

/*
 * Shoaib's A4 letterhead, rebuilt as vector artwork from his Canva export.
 * The PDF only carries a ~127 DPI raster, which prints soft — so every
 * element here was measured off that export and redrawn: positions, sizes,
 * colours and text widths all match the original. The one deliberate
 * difference is the logo: the Canva design carried an older version of the
 * mark with its own typeset wordmark, so (Shoaib's call) the header uses
 * the designer's official lockup from public/brand instead, keeping the
 * design's "PERFORMANCE MARKETING" line beneath it.
 *
 * Coordinates are tenths of a millimetre on a 2100 × 2970 A4 page (tenths
 * rather than mm keep SVG font sizes well above one user unit). Text uses
 * textLength so each line spans exactly the width it does in the design —
 * change a line's wording and its textLength needs updating too.
 */

const m = (mm: number) => Math.round(mm * 100) / 10;

const COLOR = {
  wordmark: "#080808",
  text: "#191919",
  tagLine: "#047AFF",
  separator: "#8C8C8C",
  stripeBlue: "#007EFF",
  stripeYellow: "#FEC40A",
  stripeGreen: "#1B9650",
};

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

function FooterText({
  x,
  width,
  baseline = 279.35,
  children,
}: {
  x: number;
  width: number;
  baseline?: number;
  children: string;
}) {
  return (
    <text
      x={m(x)}
      y={m(baseline)}
      fontSize={fs(2.2)}
      fontWeight={400}
      fill={COLOR.text}
      textLength={m(width)}
      lengthAdjust="spacing"
    >
      {children}
    </text>
  );
}

/** The fixed letterhead artwork — everything except the writable body. */
function LetterheadArtwork() {
  return (
    <svg className="absolute inset-0 h-full w-full" viewBox="0 0 2100 2970" aria-hidden>
      {/* Watermark: the official mark at 6.35× the header mark's height and
          3% opacity, centred where the design places it. */}
      <image href="/brand/mark.svg" x={m(43.51)} y={m(80.02)} width={m(127.2)} height={m(137.1)} opacity={0.03} />

      {/* ── Header ── the official horizontal lockup, sized so its mark is
          the design's 21.59 mm tall, with the design's "PERFORMANCE
          MARKETING" line set under the wordmark, spanning its width. */}
      <image href="/brand/logo-horizontal.svg" x={m(13.33)} y={m(10.44)} width={m(68.04)} height={m(22.39)} />
      <text x={m(36.37)} y={m(35.09)} fontSize={fs(1.86)} fontWeight={500} fill={COLOR.wordmark} textLength={m(44.64)} lengthAdjust="spacing">
        PERFORMANCE MARKETING
      </text>

      <rect x={m(136.48)} y={m(21.25)} width={m(13.38)} height={m(0.59)} fill={COLOR.tagLine} />
      <text x={m(156.63)} y={m(20.12)} fontSize={fs(1.95)} fontWeight={500} fill={COLOR.text} textLength={m(34.62)} lengthAdjust="spacing">
        STRATEGY TODAY
      </text>
      <text x={m(156.46)} y={m(24.21)} fontSize={fs(1.95)} fontWeight={500} fill={COLOR.text} textLength={m(40.21)} lengthAdjust="spacing">
        GROWTH TOMORROW
      </text>

      {/* ── Footer contact row ── */}
      <Glyph box={{ x: 11.18, y: 275.76, w: 5.0, h: 5.16 }} viewBox="0 0 5 5">
        <g fill="none" stroke={COLOR.text} strokeWidth={0.4}>
          <circle cx={2.5} cy={2.5} r={2.3} />
          {GLOBE_PATHS.map((d) => (
            <path key={d} d={d} />
          ))}
        </g>
      </Glyph>
      {/* Sits a hair lower than its neighbours in the original — kept as-is. */}
      <FooterText x={19.22} width={26.5} baseline={279.52}>
        adsbyshoaib.com
      </FooterText>

      <Glyph box={{ x: 60.37, y: 275.93, w: 4.4, h: 4.82 }} viewBox="3 3 18 18">
        <path d={PHONE_PATH} fill={COLOR.text} />
      </Glyph>
      <FooterText x={67.82} width={26.67}>+92 301 7461642</FooterText>

      <Glyph box={{ x: 108.8, y: 276.52, w: 4.74, h: 3.56 }} viewBox="2 4 20 16">
        <path d={MAIL_PATH} fill={COLOR.text} />
      </Glyph>
      <FooterText x={117.18} width={35.64}>info@adsbyshoaib.com</FooterText>

      <Glyph box={{ x: 166.65, y: 275.76, w: 3.9, h: 5.16 }} viewBox="5 2 14 20">
        <path d={PIN_PATH} fill={COLOR.text} />
      </Glyph>
      <FooterText x={173.91} width={25.4}>Multan, Pakistan</FooterText>

      {[52.3, 100.98, 159.13].map((x) => (
        <rect key={x} x={m(x)} y={m(276.1)} width={m(0.25)} height={m(4.65)} fill={COLOR.separator} />
      ))}

      {/* ── Tri-colour base stripe ── */}
      <rect x={0} y={m(289.73)} width={m(76.62)} height={m(7.27)} fill={COLOR.stripeBlue} />
      <rect x={m(76.62)} y={m(289.73)} width={m(57.75)} height={m(7.27)} fill={COLOR.stripeYellow} />
      <rect x={m(134.37)} y={m(289.73)} width={m(75.63)} height={m(7.27)} fill={COLOR.stripeGreen} />
    </svg>
  );
}

// Print exactly one A4 sheet, edge to edge: zero page margin, and every
// element that isn't the sheet (or one of its ancestors) removed from layout
// so the dashboard chrome can't add a second page. Scoped to this route —
// the <style> only exists while the letterhead is mounted.
const PRINT_CSS = `
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
`;

export default function Letterhead() {
  const bodyRef = useRef<HTMLDivElement>(null);
  const [overflowing, setOverflowing] = useState(false);

  const checkOverflow = () => {
    const el = bodyRef.current;
    if (el) setOverflowing(el.scrollHeight > el.clientHeight + 1);
  };

  // Paste as plain text so text copied from Word/WhatsApp can't drag its own
  // fonts and colours onto the letterhead.
  const onPaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    document.execCommand("insertText", false, e.clipboardData.getData("text/plain"));
  };

  return (
    <>
      <style>{PRINT_CSS}</style>

      <div className="print:hidden flex flex-wrap items-center gap-3 mb-6">
        <button type="button" onClick={() => window.print()} className={buttonStyles.primary}>
          <Printer className="size-4" aria-hidden />
          Print
        </button>
        <p className="text-small text-ink-muted">
          Click inside the page to type. In the print dialog, keep the paper size on A4.
        </p>
        {overflowing && (
          <p className="flex items-center gap-2 text-small text-amber-800 bg-amber-500/10 border border-amber-600/20 rounded-lg px-3 py-1.5">
            <TriangleAlert className="size-4" aria-hidden />
            Text is longer than one page — the extra lines won&apos;t print.
          </p>
        )}
      </div>

      <div className="letterhead-scroll overflow-x-auto pb-4">
        <div
          className={`letterhead-sheet ${letterheadFont.className} relative mx-auto bg-white shadow-[0_2px_24px_-6px_rgba(15,15,20,0.25)]`}
          style={{ width: "210mm", height: "297mm" }}
        >
          <LetterheadArtwork />
          <div
            ref={bodyRef}
            contentEditable
            suppressContentEditableWarning
            spellCheck
            onInput={checkOverflow}
            onPaste={onPaste}
            data-placeholder="Type or paste your letter here…"
            className="letterhead-body absolute overflow-hidden whitespace-pre-wrap break-words rounded-sm outline-1 outline-dashed outline-transparent hover:outline-ink/15 focus:outline-ink/25"
            style={{
              left: "20mm",
              right: "20mm",
              top: "48mm",
              bottom: "29mm",
              fontSize: "10.5pt",
              lineHeight: 1.6,
              color: COLOR.text,
            }}
          />
        </div>
      </div>
    </>
  );
}
