"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText, LoaderCircle, Plus, Send, Trash2, X } from "lucide-react";
import { buttonStyles, inputClasses } from "@/components/dashboard/ui";
import {
  TEMPLATE_LANGUAGES,
  countVars,
  fillVars,
  validateTemplate,
  type TemplateInput,
  type WaTemplate,
} from "@/lib/whatsapp-template-shared";

type Result = { error?: string; ok?: boolean } | undefined;
export type TemplateActions = {
  load: () => Promise<{ templates?: WaTemplate[]; error?: string }>;
  send: (name: string, language: string, params: string[]) => Promise<Result>;
};

/** WhatsApp-style bubble showing how a template will look. */
export function TemplatePreview({
  header,
  body,
  footer,
  buttons,
}: {
  header?: string | null;
  body: string;
  footer?: string | null;
  buttons?: { text: string }[];
}) {
  return (
    <div className="rounded-xl bg-[#e7f6dc] border border-forest/20 p-3 text-small max-w-sm shadow-sm">
      {header && <p className="font-semibold mb-1">{header}</p>}
      <p className="whitespace-pre-wrap break-words">{body || <span className="text-ink-subtle">Your message…</span>}</p>
      {footer && <p className="text-tag text-ink-subtle mt-1">{footer}</p>}
      {buttons && buttons.length > 0 && (
        <div className="mt-2 border-t border-ink/10 pt-1 grid gap-1">
          {buttons.map((b, i) => (
            <span key={i} className="text-center text-cobalt text-small py-1">
              {b.text}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** Inbox: pick an approved template, fill its variables, send. */
export function TemplatePicker({ actions, label = "Send a template" }: { actions: TemplateActions; label?: string }) {
  const [open, setOpen] = useState(false);
  const [templates, setTemplates] = useState<WaTemplate[] | null>(null);
  const [chosen, setChosen] = useState<WaTemplate | null>(null);
  const [params, setParams] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, startLoad] = useTransition();
  const [sending, startSend] = useTransition();
  const router = useRouter();

  const openPicker = () => {
    setOpen(true);
    setError(null);
    startLoad(async () => {
      const r = await actions.load();
      if (r.error) setError(r.error);
      setTemplates(r.templates ?? []);
    });
  };
  const close = () => {
    setOpen(false);
    setChosen(null);
    setParams([]);
  };

  if (!open) {
    return (
      <button type="button" onClick={openPicker} className={`${buttonStyles.secondary} !py-1.5 text-small`}>
        <FileText className="size-4" aria-hidden /> {label}
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-ink/15 bg-white p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="font-medium text-small">{chosen ? chosen.name : "Approved templates"}</p>
        <button type="button" onClick={close} aria-label="Close" className="text-ink-subtle hover:text-ink">
          <X className="size-4" aria-hidden />
        </button>
      </div>

      {loading && <LoaderCircle className="size-4 animate-spin text-ink-subtle" aria-hidden />}
      {!loading && !chosen && (
        <ul className="grid gap-2 max-h-60 overflow-y-auto">
          {templates?.length === 0 && !error && (
            <li className="text-small text-ink-muted">No approved templates yet — create one under WhatsApp → Templates.</li>
          )}
          {templates?.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => {
                  setChosen(t);
                  setParams(Array.from({ length: t.vars }, () => ""));
                }}
                className="w-full text-left rounded-lg border border-ink/10 px-3 py-2 hover:bg-ink/[0.03]"
              >
                <span className="flex items-center gap-2">
                  <span className="font-medium text-small">{t.name}</span>
                  <span className="font-mono uppercase text-[10px] tracking-wide text-ink-subtle">
                    {t.category.toLowerCase()} · {t.language}
                  </span>
                </span>
                <span className="block text-tag text-ink-muted truncate">{t.body}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {chosen && (
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr] items-start">
          <div className="grid gap-2">
            {params.map((p, i) => (
              <label key={i} className="text-tag">
                {`{{${i + 1}}}`}
                <input
                  value={p}
                  onChange={(e) => setParams((ps) => ps.map((x, j) => (j === i ? e.target.value : x)))}
                  className={`${inputClasses} !py-1.5 text-small`}
                />
              </label>
            ))}
            {chosen.category === "MARKETING" && (
              <p className="text-tag text-ink-subtle">Marketing template — charged at the marketing rate.</p>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                disabled={sending || params.some((p) => !p.trim())}
                onClick={() => {
                  setError(null);
                  startSend(async () => {
                    const r = await actions.send(chosen.name, chosen.language, params);
                    if (r?.error) setError(r.error);
                    else {
                      close();
                      router.refresh();
                    }
                  });
                }}
                className={`${buttonStyles.primary} !py-1.5`}
              >
                {sending ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Send className="size-4" aria-hidden />} Send
              </button>
              <button type="button" onClick={() => setChosen(null)} className={`${buttonStyles.secondary} !py-1.5`}>
                Back
              </button>
            </div>
          </div>
          <TemplatePreview header={chosen.header} body={fillVars(chosen.body, params)} footer={chosen.footer} buttons={chosen.buttons} />
        </div>
      )}
      {error && <p className="text-small text-red-700 mt-2">{error}</p>}
    </div>
  );
}

const EMPTY: TemplateInput = {
  name: "",
  category: "UTILITY",
  language: "en",
  header: "",
  body: "",
  examples: [],
  footer: "",
  quickReplies: ["", "", ""],
  urlButton: null,
};

/** Templates page: build a template with a live preview and send it to Meta for review. */
export function TemplateBuilder({ onCreate }: { onCreate: (input: TemplateInput) => Promise<Result & { status?: string }> }) {
  const [t, setT] = useState<TemplateInput>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const set = (patch: Partial<TemplateInput>) => {
    setDone(null);
    setT((x) => ({ ...x, ...patch }));
  };
  const n = countVars(t.body);
  const examples = Array.from({ length: n }, (_, i) => t.examples[i] ?? "");

  const submit = () => {
    const input = { ...t, examples, quickReplies: t.quickReplies.filter((q) => q.trim()) };
    const problem = validateTemplate(input);
    if (problem) return setError(problem);
    setError(null);
    start(async () => {
      const r = await onCreate(input);
      if (r?.error) setError(r.error);
      else {
        setDone(`Sent to Meta for review (${(r?.status ?? "PENDING").toLowerCase()}). Approval usually takes minutes, up to 24 hours.`);
        setT(EMPTY);
        router.refresh();
      }
    });
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px] items-start">
      <div className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="text-small">
            <span className="block text-ink-muted mb-1">Name</span>
            <input
              value={t.name}
              onChange={(e) => set({ name: e.target.value.toLowerCase().replace(/[^a-z0-9_]+/g, "_") })}
              placeholder="e.g. order_followup"
              className={inputClasses}
            />
          </label>
          <label className="text-small">
            <span className="block text-ink-muted mb-1">Category</span>
            <select value={t.category} onChange={(e) => set({ category: e.target.value as TemplateInput["category"] })} className={inputClasses}>
              <option value="UTILITY">Utility — updates about an order/booking</option>
              <option value="MARKETING">Marketing — offers, promotions</option>
            </select>
          </label>
          <label className="text-small">
            <span className="block text-ink-muted mb-1">Language</span>
            <select value={t.language} onChange={(e) => set({ language: e.target.value })} className={inputClasses}>
              {TEMPLATE_LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="text-small">
          <span className="block text-ink-muted mb-1">Header (optional)</span>
          <input value={t.header} maxLength={60} onChange={(e) => set({ header: e.target.value })} className={inputClasses} />
        </label>
        <label className="text-small">
          <span className="block text-ink-muted mb-1">
            Message — use {"{{1}}"}, {"{{2}}"}… for the parts that change (name, date, amount)
          </span>
          <textarea
            rows={5}
            maxLength={1024}
            value={t.body}
            onChange={(e) => set({ body: e.target.value })}
            placeholder="Hi {{1}}, your order {{2}} is confirmed. Reply here if you have any questions."
            className={`${inputClasses} resize-y`}
          />
        </label>
        {n > 0 && (
          <div className="grid gap-3 sm:grid-cols-3">
            {examples.map((ex, i) => (
              <label key={i} className="text-small">
                <span className="block text-ink-muted mb-1">Example for {`{{${i + 1}}}`}</span>
                <input
                  value={ex}
                  onChange={(e) => set({ examples: examples.map((x, j) => (j === i ? e.target.value : x)) })}
                  className={inputClasses}
                />
              </label>
            ))}
          </div>
        )}
        <label className="text-small">
          <span className="block text-ink-muted mb-1">Footer (optional)</span>
          <input
            value={t.footer}
            maxLength={60}
            onChange={(e) => set({ footer: e.target.value })}
            placeholder="Reply STOP to stop messages"
            className={inputClasses}
          />
        </label>

        <div className="grid gap-3 sm:grid-cols-3">
          {t.quickReplies.map((q, i) => (
            <label key={i} className="text-small">
              <span className="block text-ink-muted mb-1">Quick-reply button {i + 1}</span>
              <input
                value={q}
                maxLength={25}
                onChange={(e) => set({ quickReplies: t.quickReplies.map((x, j) => (j === i ? e.target.value : x)) })}
                className={inputClasses}
              />
            </label>
          ))}
        </div>
        {t.urlButton ? (
          <div className="grid gap-3 sm:grid-cols-[1fr_2fr_auto] items-end">
            <label className="text-small">
              <span className="block text-ink-muted mb-1">Link button text</span>
              <input
                value={t.urlButton.text}
                maxLength={25}
                onChange={(e) => set({ urlButton: { ...t.urlButton!, text: e.target.value } })}
                className={inputClasses}
              />
            </label>
            <label className="text-small">
              <span className="block text-ink-muted mb-1">Link</span>
              <input
                value={t.urlButton.url}
                onChange={(e) => set({ urlButton: { ...t.urlButton!, url: e.target.value } })}
                placeholder="https://"
                className={inputClasses}
              />
            </label>
            <button type="button" onClick={() => set({ urlButton: null })} className={buttonStyles.secondary} aria-label="Remove link button">
              <X className="size-4" aria-hidden />
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => set({ urlButton: { text: "", url: "" } })} className={`${buttonStyles.secondary} justify-self-start`}>
            <Plus className="size-4" aria-hidden /> Add a link button
          </button>
        )}

        <div className="flex items-center gap-3">
          <button type="button" onClick={submit} disabled={pending} className={buttonStyles.primary}>
            {pending && <LoaderCircle className="size-4 animate-spin" aria-hidden />} Submit for review
          </button>
          {done && <p className="text-small text-forest">{done}</p>}
        </div>
        {error && <p className="text-small text-red-700">{error}</p>}
      </div>

      <div className="lg:sticky lg:top-6">
        <p className="font-mono uppercase text-tag tracking-widest text-ink-subtle mb-2">Preview</p>
        <TemplatePreview
          header={t.header}
          body={fillVars(t.body, examples)}
          footer={t.footer}
          buttons={[...t.quickReplies.filter((q) => q.trim()).map((text) => ({ text })), ...(t.urlButton?.text ? [{ text: t.urlButton.text }] : [])]}
        />
      </div>
    </div>
  );
}

export function DeleteTemplateButton({ name, onDelete }: { name: string; onDelete: (name: string) => Promise<Result> }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!confirm(`Delete the template "${name}"? Meta won't let you reuse this name for 30 days.`)) return;
          start(async () => {
            const r = await onDelete(name);
            if (r?.error) setError(r.error);
            else router.refresh();
          });
        }}
        className="text-ink-subtle hover:text-red-700"
        aria-label={`Delete ${name}`}
      >
        {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Trash2 className="size-4" aria-hidden />}
      </button>
      {error && <span className="text-tag text-red-700">{error}</span>}
    </span>
  );
}
