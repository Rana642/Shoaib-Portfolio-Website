"use client";

import { useState, useTransition } from "react";
import { LoaderCircle, Trash2 } from "lucide-react";
import { Card, buttonStyles, inputClasses } from "@/components/dashboard/ui";

type Result = { error?: string; ok?: boolean } | undefined;
export type AutomationSettings = {
  instant: { on: boolean; delayMin: number; text: string };
  afterHours: { on: boolean; from: string; to: string; text: string };
  followUp: { on: boolean; afterHours: number; text: string };
};

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-2 font-medium cursor-pointer">
      <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} />
      {label}
      <span className={`text-tag rounded-full px-2 py-0.5 ${on ? "bg-forest/15 text-ink" : "bg-ink/5 text-ink-subtle"}`}>{on ? "On" : "Off"}</span>
    </label>
  );
}

/** One WhatsApp number's automation: instant, after-hours, follow-up. */
export function AutomationForm({ initial, onSave }: { initial: AutomationSettings; onSave: (s: AutomationSettings) => Promise<Result> }) {
  const [s, setS] = useState(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const set = <K extends keyof AutomationSettings>(k: K, patch: Partial<AutomationSettings[K]>) => setS((x) => ({ ...x, [k]: { ...x[k], ...patch } }));
  const hint = <p className="text-tag text-ink-subtle mt-1">Use {"{name}"} for the guest&apos;s first name.</p>;

  return (
    <div className="space-y-4">
      <Card className="p-5 space-y-3">
        <Toggle on={s.instant.on} onChange={(on) => set("instant", { on })} label="Instant reply" />
        <p className="text-small text-ink-muted">
          When a guest writes and nobody answers within{" "}
          <input
            type="number"
            min={1}
            max={60}
            value={s.instant.delayMin}
            onChange={(e) => set("instant", { delayMin: Number(e.target.value) })}
            className={`${inputClasses} !w-16 !inline-block !py-1 !px-2`}
          />{" "}
          minutes. Never talks over staff — any reply from the phone or here cancels it. At most once per chat every 12 hours.
        </p>
        <textarea rows={4} value={s.instant.text} onChange={(e) => set("instant", { text: e.target.value })} className={inputClasses} placeholder="e.g. Hi {name}! Thanks for contacting us — today's rates and offers: … Book here: …" />
        {hint}
      </Card>

      <Card className="p-5 space-y-3">
        <Toggle on={s.afterHours.on} onChange={(on) => set("afterHours", { on })} label="After-hours reply" />
        <p className="text-small text-ink-muted flex flex-wrap items-center gap-2">
          Between
          <input type="time" value={s.afterHours.from} onChange={(e) => set("afterHours", { from: e.target.value })} className={`${inputClasses} !w-auto !py-1`} />
          and
          <input type="time" value={s.afterHours.to} onChange={(e) => set("afterHours", { to: e.target.value })} className={`${inputClasses} !w-auto !py-1`} />
          (Pakistan time) this goes after 1 minute instead of the instant reply.
        </p>
        <textarea rows={3} value={s.afterHours.text} onChange={(e) => set("afterHours", { text: e.target.value })} className={inputClasses} placeholder="e.g. Hi {name}, our team will call you first thing in the morning. To book now: …" />
        {hint}
      </Card>

      <Card className="p-5 space-y-3">
        <Toggle on={s.followUp.on} onChange={(on) => set("followUp", { on })} label="Follow-up" />
        <p className="text-small text-ink-muted">
          After we answer, if the guest goes quiet for{" "}
          <input
            type="number"
            min={1}
            max={20}
            value={s.followUp.afterHours}
            onChange={(e) => set("followUp", { afterHours: Number(e.target.value) })}
            className={`${inputClasses} !w-16 !inline-block !py-1 !px-2`}
          />{" "}
          hours — once per guest message, only within the free 24-hour window. Booked and not-booked chats are skipped.
        </p>
        <textarea rows={3} value={s.followUp.text} onChange={(e) => set("followUp", { text: e.target.value })} className={inputClasses} placeholder="e.g. Hi {name}, shall I hold the room for you? The offer is valid today." />
        {hint}
      </Card>

      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await onSave(s);
              setMsg(r?.error ? { ok: false, text: r.error } : { ok: true, text: "Saved." });
            })
          }
          className={buttonStyles.primary}
        >
          {pending && <LoaderCircle className="size-4 animate-spin" aria-hidden />} Save automation
        </button>
        {msg && <span className={`text-small ${msg.ok ? "text-green-700" : "text-red-700"}`}>{msg.text}</span>}
      </div>
    </div>
  );
}

/** Ready-made answers for the reply box. */
export function QuickRepliesManager({
  items,
  onAdd,
  onDelete,
}: {
  items: { id: string; title: string; body: string }[];
  onAdd: (title: string, body: string) => Promise<Result>;
  onDelete: (id: string) => Promise<Result>;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <Card className="p-5 space-y-4">
      <p className="font-medium">Quick replies</p>
      <p className="text-small text-ink-muted">Saved answers staff can drop into a reply with one click — rates, location, check-in policy, payment details.</p>
      {items.length > 0 && (
        <ul className="divide-y divide-ink/5">
          {items.map((q) => (
            <li key={q.id} className="py-2 flex items-start justify-between gap-3">
              <div>
                <p className="text-small font-medium">{q.title}</p>
                <p className="text-tag text-ink-muted whitespace-pre-line line-clamp-3">{q.body}</p>
              </div>
              <button type="button" onClick={() => start(async () => void (await onDelete(q.id)))} aria-label="Delete" className="text-ink-subtle hover:text-red-700">
                <Trash2 className="size-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="grid gap-2">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title, e.g. Rates" className={inputClasses} />
        <textarea rows={3} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Message" className={inputClasses} />
        {error && <p className="text-small text-red-700">{error}</p>}
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setError(null);
              const r = await onAdd(title, body);
              if (r?.error) setError(r.error);
              else {
                setTitle("");
                setBody("");
              }
            })
          }
          className={`${buttonStyles.secondary} justify-self-start`}
        >
          Add quick reply
        </button>
      </div>
    </Card>
  );
}
