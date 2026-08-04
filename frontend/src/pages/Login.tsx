import { useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router";
import { FirebaseError } from "firebase/app";
import { useAuth } from "../context/AuthContext";
import { PrimaryButton, GhostButton, Input, Card } from "../components/ui";
import { Wallet } from "lucide-react";

export function Login() {
  const { user, loading, signIn, signUp, signInWithGoogle } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!loading && user) {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (mode === "signin") {
        await signIn(email.trim(), password);
      } else {
        await signUp(email.trim(), password);
      }
      navigate("/");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Authentication failed";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogle = async () => {
    setError(null);
    setSubmitting(true);
    try {
      await signInWithGoogle();
      navigate("/");
    } catch (err: unknown) {
      if (err instanceof FirebaseError && err.code === "auth/popup-closed-by-user") {
        // User dismissed the popup — soft / silent
        return;
      }
      const msg = err instanceof Error ? err.message : "Google sign-in failed";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "var(--background)" }}>
      <div className="w-full max-w-md">
        <div className="flex items-center gap-2.5 mb-8 justify-center">
          <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center shadow-[0_0_14px_rgba(0,201,122,0.4)]">
            <Wallet size={16} className="text-primary-foreground" />
          </div>
          <div>
            <span className="text-sm font-bold text-foreground">Finvest OS</span>
            <span className="block text-[9px] text-muted-foreground tracking-[0.12em] uppercase">Alpha</span>
          </div>
        </div>

        <Card className="p-6 border border-white/[0.06] bg-white/[0.02]">
          <h1 className="text-2xl font-semibold text-foreground mb-1">
            {mode === "signin" ? "Sign in" : "Create account"}
          </h1>
          <p className="text-sm text-muted-foreground mb-6">
            {mode === "signin"
              ? "Welcome back. Sign in with your email and password."
              : "Sign up with email and password to get started."}
          </p>

          {error && (
            <div className="mb-4 p-3 rounded-lg border border-red-500/30 bg-red-500/10 text-sm text-red-400">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
                Email
              </label>
              <Input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
                Password
              </label>
              <Input
                type="password"
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>
            <PrimaryButton disabled={submitting || loading} className="w-full py-3 mt-2">
              {submitting ? "Please wait…" : mode === "signin" ? "Sign in" : "Sign up"}
            </PrimaryButton>
          </form>

          <div className="flex items-center gap-3 my-5">
            <div className="h-px flex-1 bg-white/[0.08]" />
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">or</span>
            <div className="h-px flex-1 bg-white/[0.08]" />
          </div>

          <GhostButton
            className="w-full py-3 text-sm font-semibold text-foreground"
            onClick={() => {
              if (!submitting && !loading) void handleGoogle();
            }}
          >
            Continue with Google
          </GhostButton>

          <div className="mt-6 text-center">
            <GhostButton
              className="text-sm"
              onClick={() => {
                setMode((m) => (m === "signin" ? "signup" : "signin"));
                setError(null);
              }}
            >
              {mode === "signin" ? "Need an account? Sign up" : "Already have an account? Sign in"}
            </GhostButton>
          </div>
        </Card>
      </div>
    </div>
  );
}
