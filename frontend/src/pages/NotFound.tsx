import { Link } from "react-router-dom";

import { Logo } from "../components/layout/AppShell";
import { Button, Icon } from "../components/ui";

export function NotFound() {
  return (
    <div className="grid min-h-screen place-items-center bg-background bg-aurora px-5">
      <div className="w-full max-w-md rounded-2xl border border-outline-variant bg-surface-container-lowest p-8 text-center shadow-[var(--shadow-float)]">
        <Logo className="justify-center text-[17px] text-on-surface" />
        <span className="mx-auto mt-6 grid size-14 place-items-center rounded-full bg-surface-container-high text-outline">
          <Icon name="explore_off" className="text-[28px]" />
        </span>
        <h1 className="mt-5 text-xl font-extrabold text-on-surface">Page not found</h1>
        <p className="mt-2 text-[13px] text-on-surface-variant">
          The page you were looking for does not exist or has moved.
        </p>
        <Link to="/" className="mt-6 block">
          <Button full size="lg" icon="home">
            Back to home
          </Button>
        </Link>
      </div>
    </div>
  );
}
