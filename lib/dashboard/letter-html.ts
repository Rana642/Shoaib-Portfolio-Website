/**
 * The letter editor stores its body as HTML, but only a small formatting
 * whitelist survives: bold / italic / underline, bulleted and numbered
 * lists, line and block breaks, and block alignment. Anything else is
 * unwrapped (its text kept) or, for active content, dropped outright — so
 * a saved body can never carry scripts, images, links or foreign styling
 * onto the letterhead. Browser-only (uses DOMParser); run it on every body
 * before it's put into the editor and before it's saved.
 */

const KEEP = new Set(["B", "STRONG", "I", "EM", "U", "BR", "DIV", "P", "UL", "OL", "LI"]);
const DROP = new Set([
  "SCRIPT", "STYLE", "IFRAME", "FRAME", "OBJECT", "EMBED", "TEMPLATE", "NOSCRIPT",
  "SVG", "MATH", "IMG", "PICTURE", "VIDEO", "AUDIO", "SOURCE", "CANVAS", "LINK", "META",
  "BASE", "FORM", "INPUT", "BUTTON", "SELECT", "TEXTAREA",
]);
const BLOCKS = new Set(["DIV", "P", "LI"]);
const ALIGNMENTS = new Set(["left", "center", "right", "justify"]);

function clean(parent: Element) {
  for (const node of Array.from(parent.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) continue;
    if (node.nodeType !== Node.ELEMENT_NODE) {
      node.remove();
      continue;
    }
    const el = node as HTMLElement;
    if (DROP.has(el.tagName)) {
      el.remove();
      continue;
    }
    clean(el);
    if (!KEEP.has(el.tagName)) {
      el.replaceWith(...Array.from(el.childNodes));
      continue;
    }
    // execCommand writes alignment as an inline text-align style (or, in
    // older engines, an align attribute) — keep only that, nothing else.
    const align = (el.style.textAlign || el.getAttribute("align") || "").toLowerCase();
    for (const attr of Array.from(el.attributes)) el.removeAttribute(attr.name);
    if (BLOCKS.has(el.tagName) && ALIGNMENTS.has(align)) el.style.textAlign = align;
  }
}

export function sanitizeLetterHtml(html: string): string {
  if (!html) return "";
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  clean(doc.body);
  // A body that's nothing but empty blocks/breaks is an empty letter.
  const hasContent = Boolean(doc.body.textContent?.trim() || doc.body.querySelector("li"));
  return hasContent ? doc.body.innerHTML : "";
}
