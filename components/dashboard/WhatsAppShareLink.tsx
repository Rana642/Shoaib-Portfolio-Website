import { MessageCircle } from "lucide-react";
import { buttonStyles } from "@/components/dashboard/ui";

/** Opens WhatsApp (app or web) with the link pre-filled, for clients who
 *  don't engage well over email — an alternative delivery channel, not a
 *  replacement for the token link itself, which works the same either way. */
export default function WhatsAppShareLink({ url, message }: { url: string; message: string }) {
  const text = encodeURIComponent(`${message} ${url}`);
  return (
    <a
      href={`https://wa.me/?text=${text}`}
      target="_blank"
      rel="noopener noreferrer"
      className={buttonStyles.secondary}
    >
      <MessageCircle className="size-4" aria-hidden />
      Share via WhatsApp
    </a>
  );
}
