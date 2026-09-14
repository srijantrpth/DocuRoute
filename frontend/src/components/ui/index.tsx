import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from "react";

import { cx } from "../../lib/format";

/* -------------------------------------------------------------------------- */
/* Icon                                                                       */
/* -------------------------------------------------------------------------- */
export function Icon({
  name,
  className,
  filled,
}: {
  name: string;
  className?: string;
  filled?: boolean;
}) {
  return (
    <span aria-hidden className={cx("icon", filled && "icon-filled", className)}>
      {name}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Button                                                                     */
/* -------------------------------------------------------------------------- */
type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "tonal";
  size?: "sm" | "md" | "lg";
  icon?: string;
  trailingIcon?: string;
  loading?: boolean;
  full?: boolean;
};

const buttonVariants: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary:
    "bg-primary text-on-primary shadow-[var(--shadow-card)] hover:bg-primary-hover hover:shadow-[var(--shadow-raised)] active:translate-y-px",
  secondary:
    "border border-outline-variant bg-surface-container-lowest text-on-surface hover:bg-surface-container-low hover:border-outline",
  tonal:
    "bg-secondary-container text-on-primary-fixed hover:bg-primary-fixed active:translate-y-px",
  ghost: "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface",
  danger: "bg-error text-on-error hover:brightness-110 active:translate-y-px",
};

const buttonSizes: Record<NonNullable<ButtonProps["size"]>, string> = {
  sm: "h-9 px-3 text-[13px] gap-1.5 rounded-lg",
  md: "h-11 px-4 text-sm gap-2 rounded-lg",
  lg: "h-13 px-6 text-[15px] gap-2 rounded-xl",
};

export function Button({
  variant = "primary",
  size = "md",
  icon,
  trailingIcon,
  loading,
  full,
  className,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cx(
        "inline-flex items-center justify-center font-semibold transition-all duration-200 whitespace-nowrap",
        "disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none disabled:translate-y-0",
        buttonVariants[variant],
        buttonSizes[size],
        full && "w-full",
        className,
      )}
    >
      {loading ? (
        <Spinner className={size === "sm" ? "size-4" : "size-[18px]"} />
      ) : (
        icon && <Icon name={icon} className={size === "sm" ? "text-[16px]" : "text-[18px]"} />
      )}
      {children}
      {trailingIcon && !loading && (
        <Icon name={trailingIcon} className={size === "sm" ? "text-[16px]" : "text-[18px]"} />
      )}
    </button>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cx("animate-spin size-5", className)} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity="0.25" />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/* Surfaces                                                                   */
/* -------------------------------------------------------------------------- */
export function Card({
  className,
  children,
  interactive,
}: {
  className?: string;
  children: ReactNode;
  interactive?: boolean;
}) {
  return (
    <div
      className={cx(
        "rounded-xl border border-outline-variant bg-surface-container-lowest shadow-[var(--shadow-card)]",
        interactive &&
          "transition-all duration-200 hover:-translate-y-0.5 hover:border-primary-fixed-dim hover:shadow-[var(--shadow-raised)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Badge({
  children,
  tone = "neutral",
  icon,
  className,
}: {
  children: ReactNode;
  tone?: "neutral" | "primary" | "success" | "warning" | "danger";
  icon?: string;
  className?: string;
}) {
  const tones = {
    neutral: "bg-surface-container-high text-on-surface-variant",
    primary: "bg-primary-fixed text-on-primary-fixed",
    success: "bg-tertiary-fixed text-on-tertiary-fixed",
    warning: "bg-warning-container text-on-warning-container",
    danger: "bg-error-container text-on-error-container",
  };
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-wide",
        tones[tone],
        className,
      )}
    >
      {icon && <Icon name={icon} className="text-[14px]" />}
      {children}
    </span>
  );
}

export function StatusChip({
  label,
  chip,
  icon,
}: {
  label: string;
  chip: string;
  icon: string;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold",
        chip,
      )}
    >
      <Icon name={icon} className="text-[14px]" />
      {label}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Inputs                                                                     */
/* -------------------------------------------------------------------------- */
type FieldProps = {
  label?: string;
  hint?: string;
  error?: string;
  icon?: string;
  trailing?: ReactNode;
};

export function TextField({
  label,
  hint,
  error,
  icon,
  trailing,
  className,
  id,
  ...rest
}: FieldProps & InputHTMLAttributes<HTMLInputElement>) {
  const generated = useId();
  const fieldId = id || generated;
  return (
    <div className="w-full">
      {label && (
        <label htmlFor={fieldId} className="mb-1.5 block text-[13px] font-semibold text-on-surface">
          {label}
        </label>
      )}
      <div className="relative">
        {icon && (
          <Icon
            name={icon}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-outline"
          />
        )}
        <input
          id={fieldId}
          {...rest}
          aria-invalid={Boolean(error)}
          className={cx(
            "h-11 w-full rounded-lg border bg-surface-container-lowest text-sm text-on-surface transition-all duration-150",
            "placeholder:text-outline focus:outline-none focus:ring-4 focus:ring-primary/12",
            icon ? "pl-10" : "pl-3.5",
            trailing ? "pr-11" : "pr-3.5",
            error
              ? "border-error focus:border-error focus:ring-error/12"
              : "border-outline-variant focus:border-primary",
            "disabled:bg-surface-container-low disabled:text-on-surface-variant",
            className,
          )}
        />
        {trailing && (
          <div className="absolute right-2 top-1/2 -translate-y-1/2">{trailing}</div>
        )}
      </div>
      {(error || hint) && (
        <p
          className={cx(
            "mt-1.5 flex items-start gap-1 text-[12px]",
            error ? "text-error" : "text-on-surface-variant",
          )}
        >
          <Icon name={error ? "error" : "info"} className="mt-px text-[14px]" />
          {error || hint}
        </p>
      )}
    </div>
  );
}

export function TextArea({
  label,
  hint,
  error,
  className,
  id,
  ...rest
}: FieldProps & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const generated = useId();
  const fieldId = id || generated;
  return (
    <div className="w-full">
      {label && (
        <label htmlFor={fieldId} className="mb-1.5 block text-[13px] font-semibold text-on-surface">
          {label}
        </label>
      )}
      <textarea
        id={fieldId}
        {...rest}
        className={cx(
          "w-full rounded-lg border bg-surface-container-lowest p-3.5 text-sm text-on-surface transition-all",
          "placeholder:text-outline focus:outline-none focus:ring-4 focus:ring-primary/12",
          error ? "border-error focus:border-error" : "border-outline-variant focus:border-primary",
          className,
        )}
      />
      {(error || hint) && (
        <p className={cx("mt-1.5 text-[12px]", error ? "text-error" : "text-on-surface-variant")}>
          {error || hint}
        </p>
      )}
    </div>
  );
}

export function Select({
  label,
  className,
  children,
  id,
  ...rest
}: FieldProps & InputHTMLAttributes<HTMLSelectElement> & { children: ReactNode }) {
  const generated = useId();
  const fieldId = id || generated;
  return (
    <div className="w-full">
      {label && (
        <label htmlFor={fieldId} className="mb-1.5 block text-[13px] font-semibold text-on-surface">
          {label}
        </label>
      )}
      <div className="relative">
        <select
          id={fieldId}
          {...(rest as object)}
          className={cx(
            "h-11 w-full appearance-none rounded-lg border border-outline-variant bg-surface-container-lowest",
            "pl-3.5 pr-10 text-sm text-on-surface transition-all",
            "focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/12",
            className,
          )}
        >
          {children}
        </select>
        <Icon
          name="expand_more"
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[18px] text-outline"
        />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Avatar                                                                     */
/* -------------------------------------------------------------------------- */
export function Avatar({
  initials,
  src,
  size = 36,
  tone = "primary",
  className,
}: {
  initials: string;
  src?: string;
  size?: number;
  tone?: "primary" | "neutral";
  className?: string;
}) {
  const tones = {
    primary: "bg-primary-fixed text-on-primary-fixed",
    neutral: "bg-surface-container-high text-on-surface-variant",
  };
  return (
    <span
      style={{ width: size, height: size, fontSize: Math.max(11, size * 0.36) }}
      className={cx(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-bold",
        tones[tone],
        className,
      )}
    >
      {src ? (
        <img src={src} alt="" className="size-full object-cover" />
      ) : (
        initials
      )}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Modal                                                                      */
/* -------------------------------------------------------------------------- */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  width = "max-w-lg",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  width?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-inverse-surface/45 backdrop-blur-[2px] animate-fade"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cx(
          "relative w-full animate-pop rounded-2xl border border-outline-variant bg-surface-container-lowest",
          "shadow-[var(--shadow-float)]",
          width,
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-outline-variant p-5">
          <div>
            <h2 className="text-lg font-bold text-on-surface">{title}</h2>
            {description && (
              <p className="mt-1 text-[13px] text-on-surface-variant">{description}</p>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-outline transition-colors hover:bg-surface-container-high hover:text-on-surface"
          >
            <Icon name="close" className="text-[20px]" />
          </button>
        </div>
        {children && <div className="p-5">{children}</div>}
        {footer && (
          <div className="flex justify-end gap-2 border-t border-outline-variant bg-surface-container-low p-4 rounded-b-2xl">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Toasts                                                                     */
/* -------------------------------------------------------------------------- */
type Toast = { id: number; tone: "success" | "error" | "info"; message: string };

const ToastContext = createContext<{
  push: (tone: Toast["tone"], message: string) => void;
} | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counter = useRef(0);

  const push = useCallback((tone: Toast["tone"], message: string) => {
    const id = ++counter.current;
    setToasts((current) => [...current, { id, tone, message }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 5200);
  }, []);

  const value = useMemo(() => ({ push }), [push]);

  const tones = {
    success: { chip: "bg-tertiary text-on-tertiary", icon: "task_alt" },
    error: { chip: "bg-error text-on-error", icon: "error" },
    info: { chip: "bg-inverse-surface text-inverse-on-surface", icon: "info" },
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-5 right-5 z-[60] flex w-[min(24rem,calc(100vw-2.5rem))] flex-col gap-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="status"
            className={cx(
              "pointer-events-auto flex animate-rise items-start gap-2.5 rounded-xl px-4 py-3",
              "text-[13px] font-medium shadow-[var(--shadow-float)]",
              tones[toast.tone].chip,
            )}
          >
            <Icon name={tones[toast.tone].icon} className="mt-px text-[18px]" />
            <span className="flex-1">{toast.message}</span>
            <button
              onClick={() => setToasts((c) => c.filter((t) => t.id !== toast.id))}
              aria-label="Dismiss"
              className="opacity-70 transition-opacity hover:opacity-100"
            >
              <Icon name="close" className="text-[16px]" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside <ToastProvider>.");
  return context;
}

/* -------------------------------------------------------------------------- */
/* States                                                                     */
/* -------------------------------------------------------------------------- */
export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-outline-variant bg-surface-container-low/60 px-6 py-16 text-center">
      <span className="mb-4 grid size-14 place-items-center rounded-full bg-surface-container-high text-outline">
        <Icon name={icon} className="text-[26px]" />
      </span>
      <h3 className="text-base font-bold text-on-surface">{title}</h3>
      <p className="mt-1.5 max-w-sm text-[13px] text-on-surface-variant">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cx(
        "animate-pulse rounded-lg bg-surface-container-high",
        className,
      )}
    />
  );
}

export function PageLoader({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-on-surface-variant">
      <Spinner className="size-7 text-primary" />
      <p className="text-[13px] font-medium">{label}…</p>
    </div>
  );
}

export function Hash({ value, className }: { value: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  if (!value) return <span className="text-on-surface-variant">—</span>;
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(value);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1600);
      }}
      title="Copy full hash"
      className={cx(
        "group inline-flex max-w-full items-center gap-1.5 rounded-md bg-surface-container-high px-2 py-1",
        "font-mono text-[11px] leading-tight text-on-surface-variant transition-colors hover:bg-primary-fixed hover:text-on-primary-fixed",
        className,
      )}
    >
      <span className="truncate">{value}</span>
      <Icon
        name={copied ? "check" : "content_copy"}
        className="shrink-0 text-[13px] opacity-60 group-hover:opacity-100"
      />
    </button>
  );
}
