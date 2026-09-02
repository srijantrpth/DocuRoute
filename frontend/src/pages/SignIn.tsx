import { useEffect, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { Logo } from "../components/layout/AppShell";
import { Button, Icon, TextField, useToast } from "../components/ui";
import { useAuth } from "../context/AuthContext";

export function SignIn() {
  const { signIn, signInWithProvider, resetPassword, configured } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    document.title = "Sign in — DocuRoute";
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      await signIn(email, password);
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from || "/dashboard", { replace: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not sign in.");
    } finally {
      setBusy(false);
    }
  };

  const forgot = async () => {
    if (!email.trim()) {
      setError("Enter your email address first, then choose “Forgot password”.");
      return;
    }
    try {
      await resetPassword(email);
      toast.push("success", `Password reset link sent to ${email}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not send the reset link.");
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background bg-aurora px-5 py-12">
      <div className="absolute inset-0 bg-grid [mask-image:radial-gradient(60%_60%_at_50%_40%,#000,transparent)]" />

      <div className="relative w-full max-w-[420px] animate-rise">
        <div className="mb-7 text-center">
          <Link to="/" className="inline-block">
            <Logo className="justify-center text-[19px] text-on-surface" />
          </Link>
          <p className="mt-2 text-[13px] text-on-surface-variant">
            Secure workflow authentication
          </p>
        </div>

        <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-7 shadow-[var(--shadow-float)]">
          <h1 className="text-xl font-extrabold tracking-tight text-on-surface">Sign in</h1>
          <p className="mt-1 text-[13px] text-on-surface-variant">
            Welcome back. Pick up where your routes left off.
          </p>

          {!configured && (
            <div className="mt-5 flex items-start gap-2 rounded-lg bg-warning-container p-3 text-[12px] leading-relaxed text-on-warning-container">
              <Icon name="warning" className="mt-px text-[16px]" />
              <span>
                Supabase keys are missing. Add <code>VITE_SUPABASE_URL</code> and{" "}
                <code>VITE_SUPABASE_ANON_KEY</code> to <code>frontend/.env</code>, then restart
                the dev server.
              </span>
            </div>
          )}

          {error && (
            <div className="mt-5 flex items-start gap-2 rounded-lg bg-error-container p-3 text-[12px] leading-relaxed text-on-error-container">
              <Icon name="error" className="mt-px text-[16px]" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={submit} className="mt-5 space-y-4">
            <TextField
              label="Email address"
              type="email"
              icon="mail"
              autoComplete="email"
              required
              placeholder="you@company.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-[13px] font-semibold text-on-surface">Password</span>
                <button
                  type="button"
                  onClick={() => void forgot()}
                  className="text-[12px] font-semibold text-primary transition-colors hover:text-primary-hover"
                >
                  Forgot password?
                </button>
              </div>
              <TextField
                type={showPassword ? "text" : "password"}
                icon="lock"
                autoComplete="current-password"
                required
                placeholder="••••••••••••"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                trailing={
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="rounded-md p-1.5 text-outline transition-colors hover:bg-surface-container-high hover:text-on-surface"
                  >
                    <Icon
                      name={showPassword ? "visibility_off" : "visibility"}
                      className="text-[18px]"
                    />
                  </button>
                }
              />
            </div>

            <label className="flex cursor-pointer items-center gap-2 text-[13px] text-on-surface-variant">
              <input
                type="checkbox"
                checked={remember}
                onChange={(event) => setRemember(event.target.checked)}
                className="size-4 rounded border-outline-variant text-primary accent-[var(--color-primary)]"
              />
              Remember me on this device
            </label>

            <Button type="submit" full size="lg" loading={busy} disabled={!configured}>
              Sign in
            </Button>
          </form>

          <div className="my-6 flex items-center gap-3 text-[11px] font-semibold uppercase tracking-wider text-outline">
            <span className="h-px flex-1 bg-outline-variant" />
            Or continue with SSO
            <span className="h-px flex-1 bg-outline-variant" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Button
              variant="secondary"
              icon="business"
              disabled={!configured}
              onClick={() =>
                void signInWithProvider("azure").catch((cause: Error) => setError(cause.message))
              }
            >
              Azure AD
            </Button>
            <Button
              variant="secondary"
              icon="vpn_key"
              disabled={!configured}
              onClick={() =>
                void signInWithProvider("google").catch((cause: Error) => setError(cause.message))
              }
            >
              Google
            </Button>
          </div>
        </div>

        <p className="mt-6 text-center text-[13px] text-on-surface-variant">
          Need access?{" "}
          <Link to="/sign-up" className="font-bold text-primary hover:underline">
            Create a workspace
          </Link>
        </p>
      </div>
    </div>
  );
}
