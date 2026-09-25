import { todayInKarachi } from "@/lib/dashboard/letters";
import LetterEditor from "@/components/dashboard/LetterEditor";

export const dynamic = "force-dynamic";
export const metadata = { title: "New letter" };

export default function NewLetterPage() {
  return <LetterEditor letter={null} today={todayInKarachi()} />;
}
