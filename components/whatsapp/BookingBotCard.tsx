"use client";

import { useState, useTransition } from "react";
import { LoaderCircle, Plus, Trash2 } from "lucide-react";
import { Card, buttonStyles, inputClasses } from "@/components/dashboard/ui";

export type BookingBotSettings = {
  enabled: boolean;
  hotelName: string;
  advanceMode: "percent" | "first_night" | "none";
  advanceValue: number;
  holdMinutes: number;
  paymentText: string;
  refundNote: string;
  info: { title: string; body: string }[];
};

type Result = { error?: string; ok?: boolean } | undefined;

const MAX_TOPICS = 9;

/** The WhatsApp booking bot for one number: guests book (and pay an advance, if this hotel takes one) in the chat. Off until saved with On. */
export function BookingBotCard({ initial, onSave }: { initial: BookingBotSettings; onSave: (s: BookingBotSettings) => Promise<Result> }) {
  const [s, setS] = useState(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const set = (patch: Partial<BookingBotSettings>) => setS((x) => ({ ...x, ...patch }));
  const noAdvance = s.advanceMode === "none";
  const setTopic = (i: number, patch: Partial<BookingBotSettings["info"][number]>) => set({ info: s.info.map((t, k) => (k === i ? { ...t, ...patch } : t)) });

  return (
    <Card className="p-5 space-y-3 mt-6">
      <label className="flex items-center gap-2 font-medium cursor-pointer">
        <input type="checkbox" checked={s.enabled} onChange={(e) => set({ enabled: e.target.checked })} />
        Booking bot
        <span className={`text-tag rounded-full px-2 py-0.5 ${s.enabled ? "bg-forest/15 text-ink" : "bg-ink/5 text-ink-subtle"}`}>{s.enabled ? "On" : "Off"}</span>
      </label>
      <p className="text-small text-ink-muted">
        Guests can book a room right in this chat: dates, guests, a room with its live price, name, and (if this hotel takes an advance) the payment details. A guest
        who already booked on the website is shown that booking instead and is not booked twice. Staff confirm from the hotel admin or the portal.
        &ldquo;Talk to staff&rdquo; always works. Each hotel has its own settings and its own answers: nothing is shared between hotels. If your Instant reply is on,
        switch it off so guests don&apos;t get two greetings.
      </p>

      <label className="block text-small font-medium">
        Hotel name (in the greeting)
        <input value={s.hotelName} onChange={(e) => set({ hotelName: e.target.value })} className={`${inputClasses} mt-1`} placeholder="Hotel Elegant Executive Suites" maxLength={80} />
      </label>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-small font-medium">
          Advance
          <select value={s.advanceMode} onChange={(e) => set({ advanceMode: e.target.value as BookingBotSettings["advanceMode"] })} className={`${inputClasses} mt-1`}>
            <option value="percent">Percent of the total</option>
            <option value="first_night">First night</option>
            <option value="none">None: pay at the hotel</option>
          </select>
        </label>
        <label className="block text-small font-medium">
          Percent
          <input type="number" min={1} max={100} disabled={s.advanceMode !== "percent"} value={s.advanceValue} onChange={(e) => set({ advanceValue: Number(e.target.value) })} className={`${inputClasses} mt-1`} />
        </label>
        <label className="block text-small font-medium">
          Hold the room (minutes)
          <input type="number" min={15} max={1440} disabled={noAdvance} value={s.holdMinutes} onChange={(e) => set({ holdMinutes: Number(e.target.value) })} className={`${inputClasses} mt-1`} />
        </label>
      </div>
      <p className="text-tag text-ink-subtle">
        A room the hotel marks as needing advance payment (a special offer) is always paid in full in advance, whatever is chosen here.
      </p>

      <label className="block text-small font-medium">
        How guests pay in advance (sent after they confirm){noAdvance ? " — optional when there is no advance" : ""}
        <textarea rows={4} value={s.paymentText} onChange={(e) => set({ paymentText: e.target.value })} className={`${inputClasses} mt-1`} maxLength={600} placeholder="Easypaisa / Raast: 0300 0000000 (Account title: …). Bank: …" />
      </label>

      <label className="block text-small font-medium">
        Refund note (shown with the payment details and in the booking summary)
        <input value={s.refundNote} onChange={(e) => set({ refundNote: e.target.value })} className={`${inputClasses} mt-1`} maxLength={200} placeholder="Free cancellation: 100% refund at any time." />
      </label>

      <div className="space-y-2 pt-2">
        <p className="text-small font-medium">Hotel information (under &ldquo;Rates &amp; info&rdquo;)</p>
        <p className="text-tag text-ink-subtle">
          Write each answer from <b>this hotel&apos;s own</b> knowledge base: location, check-in and check-out, facilities, policies, payment and cancellation. Keep it to facts
          that rarely change (not dated offers: guests see live prices and offers in the room list). The title is a list row (24 characters). Up to {MAX_TOPICS} topics.
        </p>
        {s.info.map((t, i) => (
          <div key={i} className="rounded-lg border border-ink/10 p-3 space-y-2">
            <div className="flex gap-2">
              <input value={t.title} onChange={(e) => setTopic(i, { title: e.target.value })} className={inputClasses} placeholder="Title, e.g. Location & contact" maxLength={24} />
              <button type="button" aria-label="Remove topic" className={buttonStyles.secondary} onClick={() => set({ info: s.info.filter((_, k) => k !== i) })}>
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <textarea rows={3} value={t.body} onChange={(e) => setTopic(i, { body: e.target.value })} className={inputClasses} maxLength={900} placeholder="The answer the guest receives" />
          </div>
        ))}
        {s.info.length < MAX_TOPICS && (
          <button type="button" className={buttonStyles.secondary} onClick={() => set({ info: [...s.info, { title: "", body: "" }] })}>
            <Plus className="h-4 w-4" /> Add a topic
          </button>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={pending}
          className={buttonStyles.primary}
          onClick={() =>
            start(async () => {
              const r = await onSave(s);
              setMsg(r?.error ? { ok: false, text: r.error } : { ok: true, text: s.enabled ? "Saved. The bot is on for this number." : "Saved. The bot is off." });
            })
          }
        >
          {pending && <LoaderCircle className="h-4 w-4 animate-spin" />} Save
        </button>
        {msg && <span className={`text-small ${msg.ok ? "text-ink" : "text-red-700"}`}>{msg.text}</span>}
      </div>
    </Card>
  );
}
