import { PageHeader } from "@/components/dashboard/ui";
import ClientForm from "@/components/dashboard/ClientForm";

export const metadata = { title: "New client" };

export default function NewClientPage() {
  return (
    <>
      <PageHeader title="New client" />
      <ClientForm />
    </>
  );
}
