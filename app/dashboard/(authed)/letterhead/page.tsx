import { PageHeader } from "@/components/dashboard/ui";
import Letterhead from "@/components/dashboard/Letterhead";

export const metadata = { title: "Letterhead" };

export default function LetterheadPage() {
  return (
    <>
      <PageHeader
        title="Letterhead"
        description="Your A4 letterhead — type a letter on it and print."
      />
      <Letterhead />
    </>
  );
}
