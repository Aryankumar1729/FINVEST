import { useState } from "react";
import { toast } from "sonner";
import { X } from "lucide-react";
import { useAuth } from "../context/AuthContext";

export function EmailVerificationBanner() {
  const { user, resendVerificationEmail } = useAuth();
  const [dismissed, setDismissed] = useState(false);
  const [resending, setResending] = useState(false);

  if (!user || user.emailVerified || dismissed) {
    return null;
  }

  const handleResend = async () => {
    setResending(true);
    try {
      await resendVerificationEmail();
      toast.success("Verification email sent");
    } catch {
      toast.error("Couldn't resend — try again");
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="w-full shrink-0 flex items-center gap-3 px-4 py-2.5 border-b border-red-500/30 bg-red-500/10 text-sm text-red-400">
      <p className="flex-1 min-w-0">
        We sent a verification email to{" "}
        <span className="font-medium text-red-300">{user.email}</span>. Please verify
        your email.
      </p>
      <button
        type="button"
        disabled={resending}
        onClick={() => void handleResend()}
        className="shrink-0 text-sm font-semibold underline underline-offset-2 hover:text-red-300 disabled:opacity-50"
      >
        {resending ? "Sending…" : "Resend"}
      </button>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => setDismissed(true)}
        className="shrink-0 p-0.5 rounded hover:bg-red-500/20"
      >
        <X size={14} />
      </button>
    </div>
  );
}
