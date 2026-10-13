import { redirect } from "next/navigation";

// Finance opens on Invoices until the Finance overview (income, expenses,
// profit) is built.
export default function FinancePage() {
  redirect("/dashboard/invoices");
}
