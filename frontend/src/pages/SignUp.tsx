import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";

import { Logo } from "../components/layout/AppShell";
import { Button, Icon, TextField } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { cx } from "../lib/format";

const MIN_LENGTH = 12;

const TRUST_POINTS = [
  {
    icon: "verified_user",
    title: "Bank-grade security",
    body: "Signed, short-lived tokens for external signers. No shared passwords, no standing accounts.",
  },
  {
    icon: "fingerprint",
    title: "Provable history",
    body: "SHA-256 hashed revisions chained event by event, with timestamped IP capture throughout.",
  },
  {
    icon: "bolt",
    title: "Lightning fast",
    body: "Sequential or parallel routing with automatic advancement the moment a step completes.",
  },
];

function strengthOf(password: string) {
  let score = 0;
  if (password.length >= MIN_LENGTH) score += 1;
  if (password.length >= 16) score += 1;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;
  return Math.min(score, 4);
}

export function SignUp() {
  const { signUp, signInWithProvider, configured } = useAuth();
  const navigate = useNavigate();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmation, setConfirmation] = useState(false);

  useEffect(() => {
    document.title = "Create an account — DocuRoute";
  }, []);

  const strength = useMemo(() => strengthOf(password), [password]);
  const tooShort = password.length > 0 && password.length < MIN_LENGTH;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (password.length < MIN_LENGTH) {
      setError(`Passwords must be at least ${MIN_LENGTH} characters.`);
      return;
    }
    setBusy(true);
    try {
      const { needsConfirmation } = await signUp(email, password, fullName);
      if (needsConfirmation) setConfirmation(true);
      else navigate("/dashboard", { replace: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create the account.");
    } finally {
      setBusy(false);
    }
  };

  if (confirmation) {
    return (
      <div className="grid min-h-screen place-items-center bg-background bg-aurora px-5">
        <div className="w-full max-w-md animate-rise rounded-2xl border border-outline-variant bg-surface-container-lowest p-8 text-center shadow-[var(--shadow-float)]">
          <span className="mx-auto grid size-14 place-items-center rounded-full bg-tertiary-fixed text-on-tertiary-fixed">
            <Icon name="mark_email_read" className="text-[28px]" />
          </span>
          <h1 className="mt-5 text-xl font-extrabold text-on-surface">Confirm your email</h1>
          <p className="mt-2 text-[13px] leading-relaxed text-on-surface-variant">
            We sent a confirmation link to <strong className="text-on-surface">{email}</strong>.
            Open it to activate your workspace, then sign in.
          </p>
          <Link to="/sign-in" className="mt-6 block">
            <Button full size="lg">
              Go to sign in
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background">
      {/* Brand column */}
      <aside className="relative hidden w-[46%] max-w-[560px] flex-col justify-between overflow-hidden bg-gradient-to-br from-on-primary-fixed via-primary to-primary-container p-12 text-on-primary lg:flex">
        <div className="absolute inset-0 bg-grid opacity-[0.12]" />
        <div
          aria-hidden
          className="absolute -right-24 -top-24 size-96 rounded-full bg-white/10 blur-3xl"
        />
        <div
          aria-hidden
          className="absolute -bottom-32 -left-20 size-96 rounded-full bg-tertiary-fixed/15 blur-3xl"
        />

        <Link to="/" className="relative">
          <Logo className="text-[19px] text-white" />
        </Link>

        <div className="relative">
          <h2 className="text-[34px] font-extrabold leading-[1.15] tracking-tight">
            Enterprise routing, engineered for trust.
          </h2>
          <p className="mt-4 max-w-md text-[14px] leading-relaxed text-on-primary/80">
            Securely manage, track and approve complex document workflows with an audit
            trail you can actually prove.
          </p>

          <div className="mt-9 space-y-5">
            {TRUST_POINTS.map((point) => (
              <div key={point.title} className="flex gap-3.5">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/12 backdrop-blur-sm">
                  <Icon name={point.icon} className="text-[20px]" />
                </span>
                <div>
                  <div className="text-[14px] font-bold">{point.title}</div>
                  <p className="mt-0.5 text-[12.5px] leading-relaxed text-on-primary/75">
                    {point.body}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="relative text-[11px] font-semibold uppercase tracking-[0.16em] text-on-primary/50">
          Trusted by forward-thinking enterprises
        </p>
      </aside>

      {/* Form column */}
      <main className="flex flex-1 items-center justify-center px-5 py-12">
        <div className="w-full max-w-[400px] animate-rise">
          <Link to="/" className="mb-8 inline-block lg:hidden">
            <Logo className="text-[18px] text-on-surface" />
          </Link>

          <h1 className="text-2xl font-extrabold tracking-tight text-on-surface">
            Create an account
          </h1>
          <p className="mt-1.5 text-[13px] text-on-surface-variant">
            Join teams routing documents with provable integrity.
          </p>

          {!configured && (
            <div className="mt-5 flex items-start gap-2 rounded-lg bg-warning-container p-3 text-[12px] leading-relaxed text-on-warning-container">
              <Icon name="warning" className="mt-px text-[16px]" />
              <span>
                Supabase keys are missing. Add them to <code>frontend/.env</code> and restart the
                dev server.
              </span>
            </div>
          )}

          {error && (
            <div className="mt-5 flex items-start gap-2 rounded-lg bg-error-container p-3 text-[12px] leading-relaxed text-on-error-container">
              <Icon name="error" className="mt-px text-[16px]" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={submit} className="mt-6 space-y-4">
            <TextField
              label="Full name"
              icon="person"
              autoComplete="name"
              required
              placeholder="Sarah Jenkins"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
            />
            <TextField
              label="Work email"
              type="email"
              icon="mail"
              autoComplete="email"
              required
              placeholder="you@company.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            <TextField
              label="Password"
              type={showPassword ? "text" : "password"}
              icon="lock"
              autoComplete="new-password"
              required
              placeholder="At least 12 characters"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              error={tooShort ? `Must be at least ${MIN_LENGTH} characters.` : undefined}
              hint={!password ? `Must be at least ${MIN_LENGTH} characters.` : undefined}
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

            {password && (
              <div className="flex gap-1.5" aria-hidden>
                {[0, 1, 2, 3].map((index) => (
                  <span
                    key={index}
                    className={cx(
                      "h-1 flex-1 rounded-full transition-colors duration-300",
                      index < strength
                        ? strength <= 1
                          ? "bg-error"
                          : strength === 2
                            ? "bg-warning"
                            : "bg-tertiary"
                        : "bg-surface-container-high",
                    )}
                  />
                ))}
              </div>
            )}

            <Button type="submit" full size="lg" loading={busy} disabled={!configured}>
              Create account
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
            Sign up with Google
          </Button>

          <p className="mt-6 text-center text-[13px] text-on-surface-variant">
            Already have an account?{" "}
            <Link to="/sign-in" className="font-bold text-primary hover:underline">
              Sign in here
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
