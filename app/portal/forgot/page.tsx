import AuthCard from "@/components/portal/AuthCard";
import ForgotPasswordForm from "@/components/portal/ForgotPasswordForm";

export const metadata = { title: "Reset password" };

export default function PortalForgotPage() {
  return (
    <AuthCard title="Reset your password" intro="Enter the email you use for the portal and I'll send you a link to choose a new password.">
      <ForgotPasswordForm />
    </AuthCard>
  );
}
