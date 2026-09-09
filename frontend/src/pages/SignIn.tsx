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
            Or continue with
            <span className="h-px flex-1 bg-outline-variant" />
          </div>

          <Button
            full
            variant="secondary"
            disabled={!configured}
            onClick={() =>
              void signInWithProvider("google").catch((cause: Error) => setError(cause.message))
            }
          >
            <svg className="mr-2 size-4 shrink-0" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            Sign in with Google
          </Button>
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
