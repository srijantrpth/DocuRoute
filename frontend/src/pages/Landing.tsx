import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { Logo } from "../components/layout/AppShell";
import { Badge, Button, Icon } from "../components/ui";
import { cx } from "../lib/format";

const FEATURES = [
  {
    icon: "account_tree",
    title: "Visual workflow builder",
    body: "Drop signature, initial, date and text fields straight onto the page, assign each to a step, and choose sequential or parallel routing.",
    link: { to: "/sign-up", label: "Explore builder" },
  },
  {
    icon: "lock",
    title: "Bank-grade security",
    body: "Signers authenticate with short-lived signed tokens — no account, no shared password. Every link can be rotated or revoked instantly.",
    link: { to: "/sign-up", label: "View security specs" },
  },
  {
    icon: "query_stats",
    title: "Tamper-evident trail",
    body: "Each event is SHA-256 hashed and chained to the one before it, with timestamped IP capture. Alter one row and verification fails loudly.",
    link: { to: "/sign-up", label: "See the audit chain" },
  },
];

const STEPS = [
  {
    icon: "upload_file",
    title: "Upload",
    body: "The PDF goes browser-to-storage over a presigned URL. The API records its SHA-256 as revision zero.",
  },
  {
    icon: "route",
    title: "Route",
    body: "Order your approvers and signers, place their fields, and publish. Step one is invited immediately.",
  },
  {
    icon: "draw",
    title: "Sign",
    body: "Each signer opens a time-limited magic link, reviews in the browser, and signs. Completion advances the chain.",
  },
  {
    icon: "workspace_premium",
    title: "Execute",
    body: "A watermarked PDF with a certificate of completion is generated and emailed to every stakeholder.",
  },
];

function Nav() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cx(
        "sticky top-0 z-40 transition-all duration-300",
        scrolled
          ? "border-b border-outline-variant bg-surface-container-lowest/85 backdrop-blur-lg"
          : "border-b border-transparent",
      )}
    >
      <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between px-5">
        <Link to="/">
          <Logo className="text-[17px] text-on-surface" />
        </Link>
        <nav className="hidden items-center gap-7 text-[13px] font-semibold text-on-surface-variant md:flex">
          <a href="#features" className="transition-colors hover:text-primary">
            Solutions
          </a>
          <a href="#security" className="transition-colors hover:text-primary">
            Security
          </a>
          <a href="#how" className="transition-colors hover:text-primary">
            How it works
          </a>
        </nav>
        <div className="flex items-center gap-2">
          <Link to="/sign-in">
            <Button variant="ghost" size="sm">
              Sign in
            </Button>
          </Link>
          <Link to="/sign-up">
            <Button size="sm" trailingIcon="arrow_forward">
              Get started
            </Button>
          </Link>
        </div>
      </div>
    </header>
  );
}

function HeroPreview() {
  return (
    <div className="relative mx-auto w-full max-w-[560px] animate-rise [animation-delay:180ms]">
      <div className="overflow-hidden rounded-2xl border border-outline-variant bg-surface-container-lowest shadow-[var(--shadow-float)]">
        <div className="flex items-center gap-2 border-b border-outline-variant bg-surface-container-low px-4 py-3">
          <span className="size-2.5 rounded-full bg-error/40" />
          <span className="size-2.5 rounded-full bg-warning/40" />
          <span className="size-2.5 rounded-full bg-tertiary/40" />
          <span className="ml-2 truncate text-[11px] font-semibold text-on-surface-variant">
            Master Services Agreement v2.4
          </span>
          <Badge tone="primary" icon="sync" className="ml-auto">
            Routing
          </Badge>
        </div>

        <div className="space-y-3 p-5">
          {[
            { name: "Michael Ross", role: "Legal review", state: "done" },
            { name: "Sarah Jenkins", role: "Client signature", state: "active" },
            { name: "Dana Reed", role: "Counter-signature", state: "waiting" },
          ].map((step, index) => (
            <div key={step.name} className="flex items-center gap-3">
              <div className="relative flex flex-col items-center">
                <span
                  className={cx(
                    "grid size-8 place-items-center rounded-full text-[15px]",
                    step.state === "done" && "bg-tertiary-fixed text-on-tertiary-fixed",
                    step.state === "active" && "animate-pulse-ring bg-primary text-on-primary",
                    step.state === "waiting" && "bg-surface-container-high text-outline",
                  )}
                >
                  <Icon
                    name={
                      step.state === "done"
                        ? "check"
                        : step.state === "active"
                          ? "draw"
                          : "schedule"
                    }
                  />
                </span>
                {index < 2 && <span className="absolute top-8 h-3 w-px bg-outline-variant" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-bold text-on-surface">{step.name}</div>
                <div className="text-[11px] text-on-surface-variant">{step.role}</div>
              </div>
              <span className="text-[11px] font-semibold text-on-surface-variant">
                Step {index + 1}
              </span>
            </div>
          ))}
        </div>

        <div className="border-t border-outline-variant bg-surface-container-low px-5 py-3">
          <div className="mb-1.5 flex items-center justify-between text-[11px] font-semibold">
            <span className="text-on-surface-variant">Chain integrity</span>
            <span className="flex items-center gap-1 text-tertiary">
              <Icon name="verified_user" className="text-[13px]" />
              Verified
            </span>
          </div>
          <p className="truncate font-mono text-[10px] text-outline">
            8f434346648f6b96df89dda901c5176b10a6d83961dd3c1ac88b59b2dc327aa4
          </p>
        </div>
      </div>

      <div className="absolute -bottom-5 -left-6 hidden animate-rise items-center gap-2.5 rounded-xl border border-outline-variant bg-surface-container-lowest px-3.5 py-2.5 shadow-[var(--shadow-float)] [animation-delay:420ms] sm:flex">
        <span className="grid size-8 place-items-center rounded-full bg-tertiary-fixed text-on-tertiary-fixed">
          <Icon name="task_alt" className="text-[18px]" />
        </span>
        <div>
          <div className="text-[12px] font-bold text-on-surface">Contract approved</div>
          <div className="text-[10px] text-on-surface-variant">2 mins ago via Legal</div>
        </div>
      </div>
    </div>
  );
}

export function Landing() {
  useEffect(() => {
    document.title = "DocuRoute — Automate document workflows";
  }, []);

  return (
    <div className="min-h-screen bg-background text-on-background">
      <Nav />

      {/* Hero */}
      <section className="relative overflow-hidden bg-aurora">
        <div className="absolute inset-0 bg-grid [mask-image:radial-gradient(70%_60%_at_50%_0%,#000,transparent)]" />
        <div className="relative mx-auto grid max-w-[1200px] items-center gap-14 px-5 pb-24 pt-16 lg:grid-cols-[1.05fr_1fr] lg:pt-24">
          <div className="animate-rise">
            <Badge tone="primary" icon="bolt" className="mb-5 px-3 py-1.5 text-[12px]">
              Enterprise routing 2.0
            </Badge>
            <h1 className="text-4xl font-extrabold leading-[1.08] tracking-[-0.025em] text-on-surface sm:text-5xl lg:text-[56px]">
              Automate document workflows with{" "}
              <span className="bg-gradient-to-br from-primary to-primary-container bg-clip-text text-transparent">
                institutional precision
              </span>
              .
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-on-surface-variant">
              DocuRoute orchestrates complex approval chains, ensuring compliance and speed.
              Built for high-stakes environments where every signature has to be provable —
              not just collected.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link to="/sign-up">
                <Button size="lg" trailingIcon="arrow_forward">
                  Start free trial
                </Button>
              </Link>
              <a href="#how">
                <Button size="lg" variant="secondary" icon="play_circle">
                  See how it works
                </Button>
              </a>
            </div>

            <div className="mt-10">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-outline">
                Built for regulated teams
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-6 text-outline">
                {["account_balance", "gavel", "domain", "shield_person"].map((icon) => (
                  <Icon key={icon} name={icon} className="text-[26px] opacity-55" />
                ))}
              </div>
            </div>
          </div>

          <HeroPreview />
        </div>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto max-w-[1200px] px-5 py-24">
        <div className="max-w-2xl">
          <h2 className="text-3xl font-extrabold tracking-tight text-on-surface sm:text-[38px]">
            Engineered for complexity
          </h2>
          <p className="mt-3 text-[15px] leading-relaxed text-on-surface-variant">
            The platform translates labyrinthine corporate processes into linear, transparent,
            auditable pathways.
          </p>
        </div>

        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {FEATURES.map((feature) => (
            <article
              key={feature.title}
              className="group rounded-2xl border border-outline-variant bg-surface-container-lowest p-6 shadow-[var(--shadow-card)] transition-all duration-300 hover:-translate-y-1 hover:border-primary-fixed-dim hover:shadow-[var(--shadow-float)]"
            >
              <span className="grid size-11 place-items-center rounded-xl bg-primary-fixed text-primary transition-colors group-hover:bg-primary group-hover:text-on-primary">
                <Icon name={feature.icon} className="text-[22px]" />
              </span>
              <h3 className="mt-5 text-lg font-bold text-on-surface">{feature.title}</h3>
              <p className="mt-2 text-[13px] leading-relaxed text-on-surface-variant">
                {feature.body}
              </p>
              <Link
                to={feature.link.to}
                className="mt-4 inline-flex items-center gap-1 text-[13px] font-bold text-primary transition-all hover:gap-2"
              >
                {feature.link.label}
                <Icon name="arrow_forward" className="text-[16px]" />
              </Link>
            </article>
          ))}
        </div>

        {/* Wide feature */}
        <div
          id="security"
          className="mt-5 grid gap-8 overflow-hidden rounded-2xl border border-outline-variant bg-gradient-to-br from-on-primary-fixed to-primary p-8 text-on-primary shadow-[var(--shadow-float)] md:grid-cols-2 md:p-10"
        >
          <div>
            <Badge className="bg-white/15 text-white">Cryptographic core</Badge>
            <h3 className="mt-4 text-2xl font-extrabold tracking-tight sm:text-3xl">
              Every revision hashed. Every link chained.
            </h3>
            <p className="mt-3 text-[14px] leading-relaxed text-on-primary/85">
              DocuRoute stores a SHA-256 digest of each stored revision and folds each audit
              event into the hash of the one before it. Tampering with any historical row
              invalidates every hash that follows, and the verification endpoint names the exact
              event where the chain breaks.
            </p>
            <ul className="mt-5 space-y-2.5">
              {[
                "Stateless HS256 magic tokens, revocable by rotation",
                "Timestamped IP and user-agent capture per event",
                "Watermarked execution copy with certificate of completion",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2 text-[13px] text-on-primary/90">
                  <Icon name="check_circle" className="mt-px text-[17px] text-tertiary-fixed" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-xl border border-white/15 bg-black/20 p-5 font-mono text-[11px] leading-relaxed text-white/85 backdrop-blur-sm">
            <div className="mb-3 flex items-center gap-2 font-sans text-[11px] font-bold uppercase tracking-wider text-white/50">
              <Icon name="terminal" className="text-[14px]" />
              GET /api/documents/:id/audit/verify/
            </div>
            <pre className="overflow-x-auto whitespace-pre">{`{
  "valid": true,
  "checked": 9,
  "total": 9,
  "broken_at": null,
  "head_hash": "e3b0c44298fc1c14…7852b855",
  "reason": "Every event hashes
             to its predecessor."
}`}</pre>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="border-y border-outline-variant bg-surface-container-low">
        <div className="mx-auto max-w-[1200px] px-5 py-24">
          <h2 className="text-3xl font-extrabold tracking-tight text-on-surface sm:text-[38px]">
            Four steps, fully auditable
          </h2>
          <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step, index) => (
              <div
                key={step.title}
                className="relative rounded-2xl border border-outline-variant bg-surface-container-lowest p-6 shadow-[var(--shadow-card)]"
              >
                <span className="absolute right-5 top-5 text-4xl font-extrabold text-outline-variant/50">
                  {index + 1}
                </span>
                <span className="grid size-11 place-items-center rounded-xl bg-secondary-container text-primary">
                  <Icon name={step.icon} className="text-[22px]" />
                </span>
                <h3 className="mt-4 text-base font-bold text-on-surface">{step.title}</h3>
                <p className="mt-1.5 text-[13px] leading-relaxed text-on-surface-variant">
                  {step.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-[1200px] px-5 py-24 text-center">
        <h2 className="text-3xl font-extrabold tracking-tight text-on-surface sm:text-[40px]">
          Route your first contract today
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-[15px] text-on-surface-variant">
          Upload a PDF, add your approvers, and watch the audit chain build itself.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link to="/sign-up">
            <Button size="lg" trailingIcon="arrow_forward">
              Create your workspace
            </Button>
          </Link>
          <Link to="/sign-in">
            <Button size="lg" variant="secondary">
              Sign in
            </Button>
          </Link>
        </div>
      </section>

      <footer className="border-t border-outline-variant bg-surface-container-lowest">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-4 px-5 py-8">
          <Logo className="text-[15px] text-on-surface" />
          <p className="text-[12px] text-on-surface-variant">
            © {new Date().getFullYear()} DocuRoute. All rights reserved.
          </p>
          <div className="flex gap-5 text-[12px] font-semibold text-on-surface-variant">
            <a href="#security" className="transition-colors hover:text-primary">
              Privacy
            </a>
            <a href="#security" className="transition-colors hover:text-primary">
              Terms
            </a>
            <a href="#features" className="transition-colors hover:text-primary">
              Contact
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
