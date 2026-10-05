import Image from "next/image";
import { formatMoney } from "@/lib/dashboard/format";
import type { Metric, ReportSection } from "@/lib/dashboard/reports";

/**
 * The client-facing monthly report — rendered on screen and printed to PDF
 * through the browser (same approach as ProposalPreview). Used by the
 * dashboard's report page and the public /report/[token] page.
 */
export default function ReportView({
  clientName,
  periodLabel,
  summary,
  sections,
}: {
  clientName: string;
  periodLabel: string;
  summary: string | null;
  sections: ReportSection[];
}) {
  return (
    <article className="bg-white border border-ink/10 rounded-xl p-8 md:p-12 print:border-0 print:rounded-none print:p-0">
      <header className="flex flex-wrap items-end justify-between gap-6 pb-8 border-b-2 border-citrus">
        <Image src="/brand/logo-horizontal.svg" alt="Ads by Shoaib" width={168} height={55} className="h-10 w-auto" />
        <div className="sm:text-right">
          <p className="font-mono uppercase text-tag tracking-widest text-ink-subtle">Monthly report</p>
          <p className="font-serif italic text-h3 mt-1 leading-tight">{periodLabel}</p>
          <p className="text-small text-ink-muted mt-2">Prepared for {clientName}</p>
        </div>
      </header>

      {summary && (
        <section className="py-8 border-b border-ink/10">
          <p className="font-mono uppercase text-tag tracking-widest text-ink-subtle mb-3">Summary</p>
          <p className="text-body whitespace-pre-line">{summary}</p>
        </section>
      )}

      {sections.length === 0 && (
        <p className="py-10 text-body text-ink-muted">Nothing has been recorded for this month yet.</p>
      )}

      {sections.map((section) => (
        <section key={section.project_id} className="py-8 border-b border-ink/10 last:border-0">
          {sections.length > 1 && <h2 className="font-serif italic text-h3 mb-6">{section.project_name}</h2>}

          {section.groups.length > 0 && (
            <div className="space-y-6 mb-8">
              {section.groups.map((group) => (
                <div key={group.title} className="print:break-inside-avoid">
                  <p className="font-mono uppercase text-tag tracking-widest text-ink-subtle mb-3">{group.title}</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {group.metrics.map((m) => (
                      <div key={m.label} className="rounded-lg border border-ink/10 px-3 sm:px-4 py-3">
                        <p className="text-body-lg sm:text-h3 font-semibold leading-none tabular-nums whitespace-nowrap">{formatMetric(m)}</p>
                        <p className="text-tag text-ink-muted mt-2">{m.label}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {section.work_log && (
            <div>
              <p className="font-mono uppercase text-tag tracking-widest text-ink-subtle mb-3">Work done this month</p>
              <MiniMarkdown text={section.work_log} />
            </div>
          )}
        </section>
      ))}

      <footer className="pt-8 text-tag text-ink-subtle">
        Ad spend is paid directly to Google and Meta and is shown here for reference only. Figures come from each
        platform&apos;s own reporting for the dates of this month.
      </footer>
    </article>
  );
}

function formatMetric(m: Metric) {
  if (m.kind === "money") {
    if ((m.currency ?? "PKR") === "PKR") return `Rs ${new Intl.NumberFormat("en-PK").format(Math.round(m.value))}`;
    return formatMoney(m.value, m.currency!).replace(/\.00$/, "");
  }
  if (m.kind === "percent") return `${m.value}%`;
  return new Intl.NumberFormat("en-PK").format(m.value);
}

/**
 * The small Markdown subset the KB work logs use — paragraphs, "- " bullets
 * (one level of nesting) and **bold** — rendered as React elements, never
 * as raw HTML, so log text can't inject markup into a client page.
 */
function MiniMarkdown({ text }: { text: string }) {
  const blocks: React.ReactNode[] = [];
  let list: { text: string; children: string[] }[] = [];

  const flush = () => {
    if (!list.length) return;
    blocks.push(
      <ul key={blocks.length} className="list-disc pl-5 space-y-1 mb-4 text-body">
        {list.map((item, i) => (
          <li key={i}>
            <Inline text={item.text} />
            {item.children.length > 0 && (
              <ul className="list-[circle] pl-5 mt-1 space-y-1">
                {item.children.map((c, j) => (
                  <li key={j}>
                    <Inline text={c} />
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    );
    list = [];
  };

  for (const raw of text.split(/\r?\n/)) {
    const nested = raw.match(/^\s{2,}[-*]\s+(.*)$/);
    const bullet = raw.match(/^[-*]\s+(.*)$/);
    const heading = raw.match(/^#{1,6}\s+(.*)$/);
    if (nested && list.length) {
      list[list.length - 1].children.push(nested[1]);
    } else if (bullet) {
      list.push({ text: bullet[1], children: [] });
    } else {
      flush();
      if (heading) {
        blocks.push(
          <p key={blocks.length} className="font-semibold text-body mt-4 mb-2">
            {heading[1]}
          </p>
        );
      } else if (raw.trim()) {
        blocks.push(
          <p key={blocks.length} className="text-body mb-2">
            <Inline text={raw.trim()} />
          </p>
        );
      }
    }
  }
  flush();
  return <div>{blocks}</div>;
}

function Inline({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith("**") && part.endsWith("**") ? (
          <strong key={i} className="font-semibold">
            {part.slice(2, -2)}
          </strong>
        ) : (
          part
        )
      )}
    </>
  );
}
