import WhatsAppNav from "@/components/whatsapp/WhatsAppNav";

/**
 * Every WhatsApp page: the section menu on the left (next to the main
 * sidebar's icon rail), the page on the right. The negative margins cancel
 * the shell's page padding so the menu sits flush against the rail.
 */
export default function WhatsAppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="lg:flex lg:-ml-8 lg:-my-10">
      <WhatsAppNav />
      <div className="flex-1 min-w-0 lg:pl-6 lg:py-8">{children}</div>
    </div>
  );
}
