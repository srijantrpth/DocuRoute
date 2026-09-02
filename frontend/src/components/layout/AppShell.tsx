import { useEffect, useState, type ReactNode } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";

import { useAuth } from "../../context/AuthContext";
import { cx } from "../../lib/format";
import { Avatar, Button, Icon } from "../ui";

const NAV = [
  { to: "/dashboard", icon: "dashboard", label: "Dashboard" },
  { to: "/documents", icon: "description", label: "Documents" },
  { to: "/approvals", icon: "verified", label: "Approvals" },
  { to: "/templates", icon: "layers", label: "Templates" },
  { to: "/analytics", icon: "monitoring", label: "Analytics" },
  { to: "/settings", icon: "settings", label: "Settings" },
];

export function Logo({ className, mark = true }: { className?: string; mark?: boolean }) {
  return (
    <span className={cx("flex items-center gap-2 font-extrabold tracking-tight", className)}>
      {mark && (
        <span className="grid size-8 place-items-center rounded-lg bg-primary text-on-primary shadow-[var(--shadow-card)]">
          <Icon name="route" className="text-[19px]" filled />
        </span>
      )}
      DocuRoute
    </span>
  );
}

function NavItems({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <>
      {NAV.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          onClick={onNavigate}
          className={({ isActive }) =>
            cx(
              "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-semibold transition-all duration-150",
              isActive
                ? "bg-secondary-container text-on-primary-fixed shadow-[var(--shadow-card)]"
                : "text-on-secondary-fixed-variant hover:bg-surface-container-high hover:text-on-surface",
            )
          }
        >
          {({ isActive }) => (
            <>
              <Icon
                name={item.icon}
                filled={isActive}
                className={cx("text-[20px] transition-colors", isActive && "text-primary")}
              />
              {item.label}
            </>
          )}
        </NavLink>
      ))}
    </>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => setMobileOpen(false), [location.pathname]);

  const sidebar = (
    <>
      <div className="px-2 pb-6 pt-1">
        <Logo className="text-[17px] text-on-surface" />
      </div>

      <Button
        icon="add"
        full
        onClick={() => navigate("/documents/new")}
        className="mb-5"
      >
        New route
      </Button>

      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto">
        <NavItems />
      </nav>

      <div className="mt-4 border-t border-outline-variant pt-3">
        <div className="flex items-center gap-2.5 rounded-lg px-2 py-2">
          <Avatar
            initials={profile?.initials || "?"}
            src={profile?.avatar_url || undefined}
            size={34}
          />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-bold text-on-surface">
              {profile?.display_name || "Signed in"}
            </div>
            <div className="truncate text-[11px] text-on-surface-variant">
              {profile?.organization?.name || profile?.email}
            </div>
          </div>
        </div>
        <button
          onClick={() => void signOut().then(() => navigate("/"))}
          className="mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-semibold text-on-secondary-fixed-variant transition-colors hover:bg-surface-container-high hover:text-on-surface"
        >
          <Icon name="logout" className="text-[20px]" />
          Sign out
        </button>
      </div>
    </>
  );

  return (
    <div className="flex h-full min-h-screen bg-background">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-outline-variant bg-surface-container-lowest px-3 py-4 md:flex">
        {sidebar}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-inverse-surface/45 backdrop-blur-[2px] animate-fade"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative flex h-full w-72 animate-fade flex-col border-r border-outline-variant bg-surface-container-lowest px-3 py-4 shadow-[var(--shadow-float)]">
            {sidebar}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-outline-variant bg-surface-container-lowest/85 px-4 backdrop-blur-md md:hidden">
          <button
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
            className="rounded-lg p-2 text-on-surface hover:bg-surface-container-high"
          >
            <Icon name="menu" className="text-[22px]" />
          </button>
          <Logo className="text-[15px] text-on-surface" />
        </header>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
  back,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  back?: { to: string; label: string };
}) {
  const navigate = useNavigate();
  return (
    <header className="mb-7 flex flex-wrap items-end justify-between gap-4 border-b border-outline-variant pb-5">
      <div className="min-w-0">
        {back && (
          <button
            onClick={() => navigate(back.to)}
            className="mb-2 inline-flex items-center gap-1 text-[12px] font-semibold text-on-surface-variant transition-colors hover:text-primary"
          >
            <Icon name="arrow_back" className="text-[16px]" />
            {back.label}
          </button>
        )}
        <h1 className="truncate text-2xl font-extrabold tracking-tight text-on-surface">{title}</h1>
        {subtitle && <p className="mt-1 text-[13px] text-on-surface-variant">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
