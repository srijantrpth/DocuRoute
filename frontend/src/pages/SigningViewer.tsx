import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";

import { Logo } from "../components/layout/AppShell";
import { PdfViewer } from "../components/signing/PdfViewer";
import { SignaturePad } from "../components/signing/SignaturePad";
import {
  Avatar,
  Badge,
  Button,
  Icon,
  Modal,
  PageLoader,
  TextArea,
  useToast,
} from "../components/ui";
import { ApiError, api } from "../lib/api";
import { track } from "../lib/analytics";
import { cx, formatDateTime } from "../lib/format";
import type { FieldKind, SigningSession } from "../lib/types";

const FIELD_ICON: Record<FieldKind, string> = {
  signature: "draw",
  initials: "abc",
  date: "event",
  text: "text_fields",
  checkbox: "check_box",
};

const isImage = (value: string) => value.startsWith("data:image");
const today = () =>
  new Date().toLocaleDateString(undefined, { year: "numeric", month: "2-digit", day: "2-digit" });

export function SigningViewer() {
  const { token = "" } = useParams<{ token: string }>();
  const toast = useToast();

  const [session, setSession] = useState<SigningSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [declineOpen, setDeclineOpen] = useState(false);
  const [declineReason, setDeclineReason] = useState("");
  const [padFor, setPadFor] = useState<{ id: string; kind: "signature" | "initials" } | null>(null);
  const [done, setDone] = useState(false);

  const fieldRefs = useRef<Map<string, HTMLElement>>(new Map());

  useEffect(() => {
    document.title = session ? `Sign — ${session.document.title}` : "Secure signing — DocuRoute";
  }, [session]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.signingSession(token);
      setSession(data);
      setValues(
        Object.fromEntries(data.fields.map((field) => [field.id, field.value || ""])),
      );
      setDone(data.recipient.status === "completed" || data.recipient.status === "declined");
      track("signing_session_opened", { role: data.recipient.role });
    } catch (cause) {
      setError(
        cause instanceof ApiError ? cause.summary : "This signing link could not be opened.",
      );
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const required = useMemo(
    () => (session?.fields || []).filter((field) => field.required),
    [session],
  );
  const completedCount = required.filter((field) => (values[field.id] || "").trim()).length;
  const allDone = required.length > 0 && completedCount === required.length;

  const nextIncomplete = useMemo(
    () => (session?.fields || []).find((field) => field.required && !(values[field.id] || "").trim()),
    [session, values],
  );

  const scrollToField = (id: string) => {
    fieldRefs.current.get(id)?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const activate = (fieldId: string, kind: FieldKind) => {
    if (!session?.can_sign) return;
    if (kind === "signature" || kind === "initials") {
      setPadFor({ id: fieldId, kind });
      return;
    }
    if (kind === "date") {
      setValues((current) => ({ ...current, [fieldId]: current[fieldId] || today() }));
      return;
    }
    if (kind === "checkbox") {
      setValues((current) => ({
        ...current,
        [fieldId]: current[fieldId] === "true" ? "" : "true",
      }));
      return;
    }
    fieldRefs.current.get(fieldId)?.querySelector("input")?.focus();
  };

  const submit = async () => {
    setSubmitting(true);
    try {
      const result = await api.submitSigning(token, values);
      setSession(result.session);
      setDone(true);
      track("document_signed", { outcome: result.status });
      toast.push(
        "success",
        result.status === "executed"
          ? "Signed. All parties are complete — the executed PDF is on its way."
          : "Signed. The next party has been notified.",
      );
    } catch (cause) {
      toast.push("error", cause instanceof ApiError ? cause.summary : "Could not submit.");
    } finally {
      setSubmitting(false);
    }
  };

  const decline = async () => {
    setDeclining(true);
    try {
      const result = await api.declineSigning(token, declineReason);
      setSession(result.session);
      setDone(true);
      setDeclineOpen(false);
      track("document_declined");
      toast.push("info", "You declined. The sender has been notified and routing has stopped.");
    } catch (cause) {
      toast.push("error", cause instanceof ApiError ? cause.summary : "Could not decline.");
    } finally {
      setDeclining(false);
    }
  };

  if (loading) return <PageLoader label="Verifying your secure link" />;

  if (error || !session) {
    return (
      <div className="grid min-h-screen place-items-center bg-background bg-aurora px-5">
        <div className="w-full max-w-md rounded-2xl border border-outline-variant bg-surface-container-lowest p-8 text-center shadow-[var(--shadow-float)]">
          <span className="mx-auto grid size-14 place-items-center rounded-full bg-error-container text-on-error-container">
            <Icon name="link_off" className="text-[28px]" />
          </span>
          <h1 className="mt-5 text-xl font-extrabold text-on-surface">Link unavailable</h1>
          <p className="mt-2 text-[13px] leading-relaxed text-on-surface-variant">{error}</p>
          <p className="mt-4 text-[12px] text-outline">
            Signing links expire and are replaced whenever a new one is issued. Ask the sender to
            resend yours.
          </p>
        </div>
      </div>
    );
  }

  const { document: doc, recipient } = session;
  const readOnly = !session.can_sign;

  return (
    <div className="flex h-screen flex-col bg-surface-container-low">
      {/* Minimal signing header */}
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-outline-variant bg-surface-container-lowest px-5 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <Logo className="text-[15px] text-on-surface" />
          <span className="hidden h-6 w-px bg-outline-variant sm:block" />
          <div className="min-w-0">
            <div className="truncate text-[14px] font-bold text-on-surface">{doc.title}</div>
            <div className="truncate text-[11.5px] text-on-surface-variant">
              {doc.organization} · sent by {doc.sender}
            </div>
          </div>
        </div>
        <Badge tone="success" icon="lock">
          Secure session
        </Badge>
      </header>

      {doc.message && (
        <div className="shrink-0 border-b border-outline-variant bg-primary-fixed/50 px-5 py-2.5 text-[12.5px] leading-relaxed text-on-primary-fixed">
          <Icon name="chat_bubble" className="mr-1.5 align-[-3px] text-[15px]" />
          {doc.message}
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {/* Document */}
        <main className="relative min-w-0 flex-1 overflow-auto p-5 md:p-8">
          {/* Sticky progress */}
          <div className="sticky top-0 z-20 mx-auto mb-5 flex w-fit items-center gap-3 rounded-full border border-outline-variant bg-surface-container-lowest/92 px-4 py-2 shadow-[var(--shadow-raised)] backdrop-blur-md">
            <span className="text-[12px] font-extrabold text-on-surface">
              {completedCount}/{required.length}
            </span>
            <span className="text-[12px] font-medium text-on-surface-variant">
              required fields completed
            </span>
            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-surface-container-high">
              <div
                className="h-full rounded-full bg-primary transition-all duration-500"
                style={{
                  width: `${required.length ? (completedCount / required.length) * 100 : 0}%`,
                }}
              />
            </div>
          </div>

          <PdfViewer
            url={doc.file_url}
            overlay={(page) => (
              <>
                {session.fields
                  .filter((field) => field.page === page.pageNumber - 1)
                  .map((field) => {
                    const value = values[field.id] || "";
                    const filled = Boolean(value.trim());
                    return (
                      <div
                        key={field.id}
                        ref={(element) => {
                          if (element) fieldRefs.current.set(field.id, element);
                          else fieldRefs.current.delete(field.id);
                        }}
                        onClick={() => activate(field.id, field.kind)}
                        style={{
                          left: `${field.x * 100}%`,
                          top: `${field.y * 100}%`,
                          width: `${field.width * 100}%`,
                          height: `${field.height * 100}%`,
                        }}
                        className={cx(
                          "absolute flex items-center justify-center overflow-hidden rounded transition-all",
                          readOnly
                            ? "border border-outline-variant bg-white/60"
                            : filled
                              ? "border-2 border-tertiary bg-tertiary/8 cursor-pointer"
                              : "cursor-pointer border-2 border-dashed border-primary bg-primary/8 hover:bg-primary/15",
                          !filled && !readOnly && nextIncomplete?.id === field.id && "animate-pulse-ring",
                        )}
                      >
                        {filled ? (
                          isImage(value) ? (
                            <img src={value} alt="" className="max-h-full max-w-full object-contain" />
                          ) : field.kind === "checkbox" ? (
                            <Icon name="check" className="text-[16px] text-tertiary" />
                          ) : field.kind === "text" && !readOnly ? (
                            <input
                              value={value}
                              onChange={(event) =>
                                setValues((current) => ({
                                  ...current,
                                  [field.id]: event.target.value,
                                }))
                              }
                              className="size-full bg-transparent px-1 text-[11px] text-on-surface outline-none"
                            />
                          ) : (
                            <span
                              className="truncate px-1 text-on-surface"
                              style={{
                                fontFamily:
                                  field.kind === "signature" || field.kind === "initials"
                                    ? '"Segoe Script", "Snell Roundhand", cursive'
                                    : undefined,
                                fontSize: field.kind === "signature" ? 18 : 11,
                              }}
                            >
                              {value}
                            </span>
                          )
                        ) : field.kind === "text" && !readOnly ? (
                          <input
                            placeholder={field.label || "Type here"}
                            value={value}
                            onChange={(event) =>
                              setValues((current) => ({ ...current, [field.id]: event.target.value }))
                            }
                            className="size-full bg-transparent px-1 text-[11px] outline-none placeholder:text-primary/60"
                          />
                        ) : (
                          <span className="flex items-center gap-1 truncate px-1 text-[10px] font-bold text-primary">
                            <Icon name={FIELD_ICON[field.kind]} className="text-[12px]" />
                            {field.width > 0.1 && (field.label || "Click to complete")}
                          </span>
                        )}
                      </div>
                    );
                  })}
              </>
            )}
          />
        </main>

        {/* Side panel */}
        <aside className="hidden w-[300px] shrink-0 flex-col overflow-y-auto border-l border-outline-variant bg-surface-container-lowest p-5 lg:flex">
          <div className="mb-5 flex items-center gap-3 rounded-xl bg-surface-container-low p-3.5">
            <Avatar initials={recipient.name.slice(0, 2).toUpperCase()} size={38} />
            <div className="min-w-0">
              <div className="truncate text-[13px] font-bold text-on-surface">{recipient.name}</div>
              <div className="truncate text-[11.5px] text-on-surface-variant">
                {recipient.role_display} · step {recipient.order + 1}
              </div>
            </div>
          </div>

          <h2 className="mb-2.5 text-[12px] font-extrabold uppercase tracking-wider text-on-surface-variant">
            Your fields
          </h2>
          <ul className="mb-6 space-y-1.5">
            {session.fields.map((field) => {
              const filled = Boolean((values[field.id] || "").trim());
              return (
                <li key={field.id}>
                  <button
                    onClick={() => {
                      scrollToField(field.id);
                      if (!filled) activate(field.id, field.kind);
                    }}
                    className={cx(
                      "flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition-all",
                      filled
                        ? "border-tertiary/30 bg-tertiary-fixed/40"
                        : "border-outline-variant hover:border-primary hover:bg-primary-fixed/40",
                    )}
                  >
                    <Icon
                      name={filled ? "check_circle" : FIELD_ICON[field.kind]}
                      className={cx("text-[17px]", filled ? "text-tertiary" : "text-primary")}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px] font-semibold text-on-surface">
                        {field.label || FIELD_ICON[field.kind]}
                      </span>
                      <span className="block text-[10.5px] text-on-surface-variant">
                        Page {field.page + 1}
                        {field.required ? " · required" : " · optional"}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          <h2 className="mb-2.5 text-[12px] font-extrabold uppercase tracking-wider text-on-surface-variant">
            Routing
          </h2>
          <ol className="space-y-2.5">
            {session.participants.map((person, index) => (
              <li key={`${person.name}-${index}`} className="flex items-center gap-2.5">
                <span
                  className={cx(
                    "grid size-7 shrink-0 place-items-center rounded-full text-[11px] font-bold",
                    person.status === "completed"
                      ? "bg-tertiary text-on-tertiary"
                      : person.status === "declined"
                        ? "bg-error text-on-error"
                        : person.is_you
                          ? "bg-primary text-on-primary"
                          : "bg-surface-container-high text-on-surface-variant",
                  )}
                >
                  {person.status === "completed" ? (
                    <Icon name="check" className="text-[14px]" />
                  ) : (
                    person.initials
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12px] font-semibold text-on-surface">
                    {person.name}
                    {person.is_you && (
                      <span className="ml-1 text-[10px] font-bold text-primary">(you)</span>
                    )}
                  </div>
                  <div className="text-[10.5px] capitalize text-on-surface-variant">
                    {person.status}
                  </div>
                </div>
              </li>
            ))}
          </ol>

          {session.expires_at && (
            <p className="mt-6 flex items-start gap-1.5 rounded-lg bg-surface-container-low p-3 text-[11.5px] leading-relaxed text-on-surface-variant">
              <Icon name="schedule" className="mt-px text-[14px]" />
              This request expires {formatDateTime(session.expires_at)}.
            </p>
          )}
        </aside>
      </div>

      {/* Action bar */}
      <footer className="shrink-0 border-t border-outline-variant bg-surface-container-lowest px-5 py-3.5">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
          {done ? (
            <div className="flex items-center gap-2.5 text-[13px] font-semibold text-tertiary">
              <Icon name={recipient.status === "declined" ? "cancel" : "task_alt"} className="text-[20px]" />
              <span className={recipient.status === "declined" ? "text-error" : undefined}>
                {recipient.status === "declined"
                  ? "You declined this document. The sender has been notified."
                  : `Completed ${formatDateTime(recipient.completed_at)}. Nothing further is needed from you.`}
              </span>
            </div>
          ) : session.blocked_by ? (
            <div className="flex items-center gap-2 text-[13px] font-semibold text-on-surface-variant">
              <Icon name="hourglass_top" className="text-[19px]" />
              Waiting on {session.blocked_by.name} to complete step {session.blocked_by.step}.
            </div>
          ) : readOnly ? (
            <div className="flex items-center gap-2 text-[13px] font-semibold text-on-surface-variant">
              <Icon name="info" className="text-[19px]" />
              This document is {doc.status_display.toLowerCase()} and is no longer accepting input.
            </div>
          ) : (
            <div className="flex items-center gap-2.5">
              <span
                className={cx(
                  "grid size-8 place-items-center rounded-full",
                  allDone ? "bg-tertiary-fixed text-tertiary" : "bg-primary-fixed text-primary",
                )}
              >
                <Icon name={allDone ? "task_alt" : "edit_document"} className="text-[18px]" />
              </span>
              <div>
                <div className="text-[13px] font-bold text-on-surface">
                  {allDone ? "Ready to submit" : "Action required"}
                </div>
                <div className="text-[11.5px] text-on-surface-variant">
                  {allDone
                    ? "Review your entries, then finish signing."
                    : `${required.length - completedCount} required field${required.length - completedCount === 1 ? "" : "s"} remaining.`}
                </div>
              </div>
            </div>
          )}

          {!done && !readOnly && (
            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={() => setDeclineOpen(true)}>
                Decline
              </Button>
              {!allDone && nextIncomplete && (
                <Button
                  variant="secondary"
                  trailingIcon="arrow_downward"
                  onClick={() => {
                    scrollToField(nextIncomplete.id);
                    activate(nextIncomplete.id, nextIncomplete.kind);
                  }}
                >
                  Start signing
                </Button>
              )}
              <Button
                icon="check"
                size="lg"
                disabled={!allDone}
                loading={submitting}
                onClick={() => void submit()}
              >
                Finish signing
              </Button>
            </div>
          )}
        </div>
      </footer>

      <SignaturePad
        open={Boolean(padFor)}
        onClose={() => setPadFor(null)}
        kind={padFor?.kind || "signature"}
        defaultName={recipient.name}
        onApply={(value) => {
          if (padFor) setValues((current) => ({ ...current, [padFor.id]: value }));
          setPadFor(null);
        }}
      />

      <Modal
        open={declineOpen}
        onClose={() => setDeclineOpen(false)}
        title="Decline to sign?"
        description="The routing stops immediately and everyone involved is notified. This is recorded permanently in the audit trail."
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeclineOpen(false)}>
              Keep reviewing
            </Button>
            <Button variant="danger" icon="cancel" loading={declining} onClick={() => void decline()}>
              Decline
            </Button>
          </>
        }
      >
        <TextArea
          label="Reason (shared with the sender)"
          rows={3}
          placeholder="Section 4 needs revision before I can sign."
          value={declineReason}
          onChange={(event) => setDeclineReason(event.target.value)}
        />
      </Modal>
    </div>
  );
}
