import type { DocumentStatus, RecipientStatus } from "./types";

export function formatBytes(bytes: number): string {
  if (!bytes) return "—";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;
  return `${value >= 10 || index === 0 ? Math.round(value) : value.toFixed(1)} ${units[index]}`;
}

export function formatDate(value?: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatDateTime(value?: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatUtc(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  const stamp = date.toISOString().replace("T", " ").slice(0, 19);
  return `${stamp} UTC`;
}

export function relativeTime(value?: string | null): string {
  if (!value) return "—";
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  return formatDate(value);
}

export function shortHash(hash?: string | null, head = 10, tail = 6): string {
  if (!hash) return "—";
  if (hash.length <= head + tail + 1) return hash;
  return `${hash.slice(0, head)}…${hash.slice(-tail)}`;
}

type Tone = {
  label: string;
  icon: string;
  chip: string;
  dot: string;
};

export const documentTone: Record<DocumentStatus, Tone> = {
  draft: {
    label: "Draft",
    icon: "edit_note",
    chip: "bg-surface-container-high text-on-surface-variant",
    dot: "bg-outline",
  },
  routing: {
    label: "Out for signature",
    icon: "sync",
    chip: "bg-primary-fixed text-on-primary-fixed",
    dot: "bg-primary",
  },
  completed: {
    label: "Executed",
    icon: "task_alt",
    chip: "bg-tertiary-fixed text-on-tertiary-fixed",
    dot: "bg-tertiary",
  },
  declined: {
    label: "Declined",
    icon: "cancel",
    chip: "bg-error-container text-on-error-container",
    dot: "bg-error",
  },
  voided: {
    label: "Voided",
    icon: "block",
    chip: "bg-surface-container-high text-on-surface-variant",
    dot: "bg-outline",
  },
  expired: {
    label: "Expired",
    icon: "schedule",
    chip: "bg-warning-container text-on-warning-container",
    dot: "bg-warning",
  },
};

export const recipientTone: Record<RecipientStatus, Tone> = {
  pending: {
    label: "Waiting",
    icon: "hourglass_empty",
    chip: "bg-surface-container-high text-on-surface-variant",
    dot: "bg-outline",
  },
  sent: {
    label: "Sent",
    icon: "outgoing_mail",
    chip: "bg-primary-fixed text-on-primary-fixed",
    dot: "bg-primary",
  },
  viewed: {
    label: "Viewed",
    icon: "visibility",
    chip: "bg-warning-container text-on-warning-container",
    dot: "bg-warning",
  },
  completed: {
    label: "Completed",
    icon: "check_circle",
    chip: "bg-tertiary-fixed text-on-tertiary-fixed",
    dot: "bg-tertiary",
  },
  declined: {
    label: "Declined",
    icon: "cancel",
    chip: "bg-error-container text-on-error-container",
    dot: "bg-error",
  },
};

export const auditIcon: Record<string, string> = {
  "document.created": "note_add",
  "document.uploaded": "upload_file",
  "workflow.saved": "account_tree",
  "workflow.sent": "send",
  "invitation.sent": "mail",
  "document.viewed": "visibility",
  "signature.applied": "draw",
  "recipient.approved": "verified",
  "recipient.declined": "cancel",
  "document.executed": "task_alt",
  "document.voided": "block",
  "document.downloaded": "download",
};

export function initialsOf(value: string): string {
  const parts = value.replace(/[._-]/g, " ").split(" ").filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return (parts[0]?.slice(0, 2) || "?").toUpperCase();
}

export function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}
