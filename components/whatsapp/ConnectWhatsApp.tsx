"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Plus } from "lucide-react";
import { buttonStyles } from "@/components/dashboard/ui";

type Result = { error?: string; ok?: boolean; display?: string } | undefined;
type FBLoginResponse = { authResponse?: { code?: string } | null };
declare global {
  interface Window {
    FB?: {
      init: (o: Record<string, unknown>) => void;
      login: (cb: (r: FBLoginResponse) => void, o: Record<string, unknown>) => void;
    };
    fbAsyncInit?: () => void;
  }
}

/**
 * "Connect a WhatsApp number" — Meta's Embedded Signup. With coexistence the
 * number keeps working in the WhatsApp Business app (scan a QR on the phone);
 * chats then also arrive here. Needs the app's Login-for-Business
 * configuration id (API Vault → WhatsApp → config_id).
 */
export default function ConnectWhatsApp({
  appId,
  configId,
  onFinish,
}: {
  appId: string;
  configId: string | null;
  onFinish: (i: { code: string; wabaId: string; phoneNumberId: string; event: string }) => Promise<Result>;
}) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const session = useRef<{ wabaId?: string; phoneNumberId?: string; event?: string }>({});

  useEffect(() => {
    if (!configId) return;
    const onMessage = (e: MessageEvent) => {
      if (!e.origin.endsWith("facebook.com")) return;
      try {
        const d = JSON.parse(String(e.data));
        if (d.type !== "WA_EMBEDDED_SIGNUP") return;
        if (String(d.event).startsWith("FINISH")) {
          session.current = { wabaId: d.data?.waba_id, phoneNumberId: d.data?.phone_number_id, event: d.event };
        } else if (d.event === "CANCEL") {
          setMsg({ ok: false, text: d.data?.error_message ? `Meta: ${d.data.error_message}` : `Stopped at: ${d.data?.current_step ?? "sign-up"}` });
        }
      } catch {
        /* not ours */
      }
    };
    window.addEventListener("message", onMessage);
    window.fbAsyncInit = () => {
      window.FB?.init({ appId, autoLogAppEvents: true, xfbml: false, version: "v23.0" });
      setReady(true);
    };
    if (window.FB) window.fbAsyncInit();
    else if (!document.getElementById("facebook-jssdk")) {
      const s = Object.assign(document.createElement("script"), {
        id: "facebook-jssdk",
        src: "https://connect.facebook.net/en_US/sdk.js",
        async: true,
        defer: true,
        crossOrigin: "anonymous",
      });
      document.body.appendChild(s);
    }
    return () => window.removeEventListener("message", onMessage);
  }, [appId, configId]);

  if (!configId) {
    return (
      <p className="text-small text-ink-muted">
        To connect numbers here, add the app&apos;s Embedded Signup <code>config_id</code> to the WhatsApp entry in the API Vault.
      </p>
    );
  }

  const start = () => {
    setMsg(null);
    session.current = {};
    window.FB?.login(
      (resp) => {
        const code = resp.authResponse?.code;
        // The finish message can land just after the callback — give it a moment.
        setTimeout(async () => {
          const s = session.current;
          if (!code || !s.wabaId || !s.phoneNumberId) {
            if (code || s.wabaId) setMsg({ ok: false, text: "Sign-up didn't finish (no number chosen). Try again." });
            return;
          }
          setBusy(true);
          const r = await onFinish({ code, wabaId: s.wabaId, phoneNumberId: s.phoneNumberId, event: s.event ?? "FINISH" });
          setBusy(false);
          if (r?.error) setMsg({ ok: false, text: r.error });
          else {
            setMsg({ ok: true, text: `Connected ${r?.display ?? "the number"}. Old chats and contacts are syncing — they appear over the next minutes.` });
            router.refresh();
          }
        }, 800);
      },
      {
        config_id: configId,
        response_type: "code",
        override_default_response_type: true,
        extras: { setup: {}, featureType: "whatsapp_business_app_onboarding", sessionInfoVersion: "3" },
      }
    );
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" onClick={start} disabled={!ready || busy} className={buttonStyles.primary}>
        {busy || !ready ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Plus className="size-4" aria-hidden />}
        Connect a WhatsApp number
      </button>
      {msg && <span className={`text-small ${msg.ok ? "text-green-700" : "text-red-700"}`}>{msg.text}</span>}
    </div>
  );
}
