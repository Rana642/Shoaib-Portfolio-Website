/**
 * Fixed, blurred color blobs drifting slowly behind all content.
 * Citrus leads (brand accent), cobalt appears sparingly (2% highlight).
 * Pure CSS animation — no JS cost.
 */
export default function AmbientBackground() {
  return (
    <div aria-hidden className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
      <div className="ambient-blob absolute -top-32 -right-32 size-[34rem] rounded-full bg-citrus/12 blur-3xl" />
      <div className="ambient-blob-alt absolute top-1/2 -left-40 size-[28rem] rounded-full bg-cobalt/8 blur-3xl" />
      <div className="ambient-blob-slow absolute -bottom-40 right-1/4 size-[30rem] rounded-full bg-citrus/8 blur-3xl" />
    </div>
  );
}
