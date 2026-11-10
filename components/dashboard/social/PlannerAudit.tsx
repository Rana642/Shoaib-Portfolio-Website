"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, X } from "lucide-react";
import { applyPlannerAuditAction, auditPlannerProject, fixSafePlannerAudit } from "@/lib/dashboard/actions/social";
import type { AuditAction, AuditItem, AuditResult } from "@/lib/planner-audit";
import { buttonStyles } from "@/components/dashboard/ui";
import { cn } from "@/lib/utils";

const SEVERITY: Record<AuditItem["severity"], { label: string; chip: string }> = {
  fix: { label: "Fix", chip: "bg-red-500/10 text-red-700 border-red-600/20" },
  check: { label: "Check", chip: "bg-amber-400/15 text-amber-800 border-amber-500/30" },
  info: { label: "Note", chip: "bg-ink/5 text-ink-muted border-ink/10" },
};

function actionLabel(a: AuditAction): string {
  switch (a.type) {
    case "remove":
      return "Remove";
    case "move":
      return `Move to ${a.date}`;
    case "fix-platforms":
      return "Fix";
    case "strip-emoji":
      return "Remove emoji";
    case "open":
      return "Open";
  }
}

/**
 * The Planner audit window (Shoaib, 2026-11-09): checks the posts on the
 * project's planner against our rules (lib/planner-audit.ts). A Drive folder
 * is checked right after its import, in the Bulk upload window. "Fix safe
 * ones" only drops platforms that can't take a post and takes emoji out of
 * captions; removing and moving are a click each, and Remove asks twice.
 */
export default function PlannerAudit({ projectId, onClose, onOpenPost }: { projectId: string; onClose: () => void; onOpenPost: (id: string) => void }) {
  const router = useRouter();
  const [result, setResult] = useState<AuditResult | null>(null);
  const [busy, setBusy] = useState<string | null>("audit");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmKey, setConfirmKey] = useState<string | null>(null);

  const run = async (note?: string) => {
    setBusy("audit");
    setError(null);
    try {
      const res = await auditPlannerProject(projectId);
      if ("error" in res) throw new Error(res.error);
      setResult(res);
      if (note) setMessage(note);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The audit didn't run.");
    } finally {
      setBusy(null);
    }
  };

  // The first audit runs when the window opens; "Check again" runs it after that.
  useEffect(() => {
    let live = true;
    auditPlannerProject(projectId)
      .then((res) => {
        if (!live) return;
        if ("error" in res) setError(res.error);
        else setResult(res);
      })
      .catch(() => live && setError("The audit didn't run."))
      .finally(() => live && setBusy(null));
    return () => {
      live = false;
    };
  }, [projectId]);

  const act = async (item: AuditItem) => {
    if (!item.action) return;
    if (item.action.type === "open") {
      onOpenPost(item.action.postId);
      return;
    }
    if (item.action.type === "remove" && confirmKey !== item.key) {
      setConfirmKey(item.key);
      return;
    }
    setConfirmKey(null);
    setBusy(item.key);
    setError(null);
    setMessage(null);
    try {
      const res = await applyPlannerAuditAction(projectId, item.action);
      if ("error" in res) throw new Error(res.error);
      router.refresh();
      await run(`${item.title}: ${res.message}`);
    } catch (e) {
      setError(`${item.title}: ${e instanceof Error ? e.message : "didn't work."}`);
      setBusy(null);
    }
  };

  const fixSafe = async () => {
    setBusy("safe");
    setError(null);
    setMessage(null);
    try {
      const res = await fixSafePlannerAudit(projectId);
      if ("error" in res) throw new Error(res.error);
      router.refresh();
      await run(`Fixed ${res.done.length}.${res.failed.length ? ` Not fixed: ${res.failed.join("; ")}` : ""}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The fixes didn't run.");
      setBusy(null);
    }
  };

  const counts = result ? { fix: result.items.filter((i) => i.severity === "fix").length, check: result.items.filter((i) => i.severity === "check").length, info: result.items.filter((i) => i.severity === "info").length } : null;
  const safeCount = result?.items.filter((i) => i.safe).length ?? 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4" onClick={onClose}>
      <div className="w-full max-w-2xl max-h-[88vh] flex flex-col bg-white border border-ink/10 rounded-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-4 border-b border-ink/10">
          <div>
            <p className="font-medium">Planner audit</p>
            <p className="text-small text-ink-muted mt-1">
              Checks the posts on this project&apos;s planner against the rules: the same content twice, platforms, Fridays, days and captions.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button type="button" onClick={() => run()} disabled={Boolean(busy)} className={buttonStyles.secondary}>
              {busy === "audit" && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
              Check again
            </button>
            <button type="button" onClick={onClose} className="p-1 rounded hover:bg-ink/5" aria-label="Close">
              <X className="size-5" aria-hidden />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {counts && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-small">
                <span className="font-medium">{counts.fix}</span> to fix, <span className="font-medium">{counts.check}</span> to check, {counts.info} note(s)
                <span className="text-ink-muted"> · {result!.checked} posts checked</span>
              </p>
              {safeCount > 0 && (
                <button type="button" onClick={fixSafe} disabled={Boolean(busy)} className={buttonStyles.primary}>
                  {busy === "safe" && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
                  Fix safe ones ({safeCount})
                </button>
              )}
            </div>
          )}
          {message && <p className="text-small text-ink bg-ink/[0.04] rounded-lg px-3 py-2">{message}</p>}
          {error && <p className="text-small text-red-700 bg-red-500/10 border border-red-600/20 rounded-lg px-3 py-2">{error}</p>}
          {result && result.items.length === 0 && <p className="text-body py-6 text-center">All clear: nothing breaks the rules.</p>}
          {!result && busy === "audit" && <p className="text-small text-ink-muted py-6 text-center">Checking…</p>}

          <ul className="space-y-2">
            {result?.items.map((item) => (
              <li key={item.key} className="flex items-start gap-3 rounded-lg border border-ink/10 px-3 py-2.5">
                <span className={cn("shrink-0 mt-0.5 rounded border px-1.5 py-0.5 text-tag font-medium", SEVERITY[item.severity].chip)}>{SEVERITY[item.severity].label}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-small font-medium break-words">{item.title}</p>
                  {item.detail && <p className="text-tag text-ink-muted mt-0.5 break-words">{item.detail}</p>}
                </div>
                {item.action && (
                  <button
                    type="button"
                    onClick={() => act(item)}
                    disabled={Boolean(busy)}
                    className={cn(item.action.type === "remove" ? buttonStyles.danger : buttonStyles.secondary, "shrink-0 px-3 py-1.5")}
                  >
                    {busy === item.key && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
                    {item.action.type === "remove" && confirmKey === item.key ? "Yes, remove" : actionLabel(item.action)}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
