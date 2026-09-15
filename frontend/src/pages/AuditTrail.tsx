import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { PageHeader } from "../components/layout/AppShell";
import {
  Avatar,
  Button,
  Card,
  Hash,
  Icon,
  PageLoader,
  StatusChip,
  useToast,
} from "../components/ui";
import { ApiError, api } from "../lib/api";
import {
  auditIcon,
  cx,
  documentTone,
  formatUtc,
  recipientTone,
  relativeTime,
} from "../lib/format";
import type { AuditEvent, AuditResponse, ChainReport, DocumentDetail } from "../lib/types";

function MetadataRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-wider text-outline">{label}</div>
      <div className="mt-0.5 text-[12px] font-medium text-on-surface">{value}</div>
    </div>
  );
}

function EventCard({ event, isHead }: { event: AuditEvent; isHead: boolean }) {
  const [open, setOpen] = useState(false);
  const icon = auditIcon[event.event_type] || "radio_button_checked";
  const isTerminal = event.event_type === "document.executed";
  const isBad = event.event_type === "recipient.declined" || event.event_type === "document.voided";

  const metadata = event.metadata || {};
  const extras = Object.entries(metadata).filter(
    ([, value]) => value !== null && value !== "" && typeof value !== "object",
  );

  return (
    <li className="relative pl-12">
      {/* Rail */}
      <span className="absolute left-[18px] top-10 bottom-[-18px] w-px bg-outline-variant last:hidden" />
      <span
        className={cx(
          "absolute left-0 top-2 grid size-9 place-items-center rounded-full ring-4 ring-background",
          isTerminal
            ? "bg-tertiary text-on-tertiary"
            : isBad
              ? "bg-error text-on-error"
              : isHead
                ? "bg-primary text-on-primary"
                : "bg-surface-container-high text-on-surface-variant",
        )}
      >
        <Icon name={icon} className="text-[18px]" />
      </span>

      <Card className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-[14px] font-extrabold text-on-surface">{event.event_display}</h3>
              <span className="rounded bg-surface-container-high px-1.5 py-0.5 font-mono text-[10px] font-bold text-on-surface-variant">
                #{event.seq}
              </span>
            </div>
            <p className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-on-surface-variant">
              <Icon name="schedule" className="text-[13px]" />
              {formatUtc(event.created_at)}
              <span className="text-outline">· {relativeTime(event.created_at)}</span>
            </p>
          </div>
          <button
            onClick={() => setOpen((value) => !value)}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-primary"
          >
            {open ? "Hide" : "Details"}
            <Icon name={open ? "expand_less" : "expand_more"} className="text-[15px]" />
          </button>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-outline">Actor</div>
            <div className="mt-1 flex items-center gap-2">
              <Avatar initials={event.actor_initials} size={24} tone="neutral" />
              <span className="truncate text-[12.5px] font-semibold text-on-surface">
                {event.actor_label}
              </span>
            </div>
          </div>
          {event.ip_address && (
            <MetadataRow label="Source IP" value={event.ip_address} />
          )}
        </div>

        {event.revision_sha256 && (
          <div className="mt-3">
            <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-outline">
              Revision SHA-256
            </div>
            <Hash value={event.revision_sha256} className="w-full" />
          </div>
        )}

        {open && (
          <div className="mt-4 animate-fade space-y-3 border-t border-outline-variant pt-3">
            {extras.length > 0 && (
              <div className="grid gap-3 sm:grid-cols-2">
                {extras.map(([key, value]) => (
                  <MetadataRow
                    key={key}
                    label={key.replace(/_/g, " ")}
                    value={String(value)}
                  />
                ))}
              </div>
            )}
            {event.user_agent && (
              <MetadataRow label="User agent" value={event.user_agent} />
            )}
            <div className="space-y-2">
              <div>
                <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-outline">
                  Previous chain hash
                </div>
                <Hash value={event.prev_hash} className="w-full" />
              </div>
              <div>
                <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-outline">
                  Payload hash
                </div>
                <Hash value={event.payload_hash} className="w-full" />
              </div>
              <div>
                <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-outline">
                  Chain hash
                </div>
                <Hash value={event.chain_hash} className="w-full" />
              </div>
            </div>
          </div>
        )}
      </Card>
    </li>
  );
}

export function AuditTrail() {
  const { id = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();

  const [data, setData] = useState<AuditResponse | null>(null);
  const [detail, setDetail] = useState<DocumentDetail | null>(null);
  const [report, setReport] = useState<ChainReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [audit, document] = await Promise.all([api.audit(id), api.getDocument(id)]);
      setData(audit);
      setDetail(document);
    } catch (error) {
      toast.push("error", error instanceof ApiError ? error.summary : "Could not load the trail.");
    } finally {
      setLoading(false);
    }
  }, [id, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    document.title = data ? `Audit — ${data.document.title}` : "Audit trail — DocuRoute";
  }, [data]);

  const verify = async () => {
    setVerifying(true);
    try {
      const result = await api.verifyChain(id);
      setReport(result);
      toast.push(
        result.valid ? "success" : "error",
        result.valid
          ? `Chain intact across ${result.checked} events.`
          : `Chain broken at event #${result.broken_at}.`,
      );
    } catch (error) {
      toast.push("error", error instanceof ApiError ? error.summary : "Verification failed.");
    } finally {
      setVerifying(false);
    }
  };

  const download = async (variant: "original" | "executed") => {
    try {
      const { url } = await api.downloadUrl(id, variant);
      window.open(url, "_blank", "noopener");
    } catch (error) {
      toast.push("error", error instanceof ApiError ? error.summary : "Could not prepare download.");
    }
  };

  const resend = async (recipientId: string, name: string) => {
    try {
      const result = await api.resendInvitation(id, recipientId);
      toast.push(
        result.delivered ? "success" : "info",
        result.delivered
          ? `A fresh link was emailed to ${name}. The previous one is now dead.`
          : `Link rotated for ${name}, but the email could not be delivered — check SMTP settings.`,
      );
      void load();
    } catch (error) {
      toast.push("error", error instanceof ApiError ? error.summary : "Could not resend.");
    }
  };

  if (loading) return <PageLoader label="Reconstructing the audit trail" />;
  if (!data || !detail) return null;

  const tone = documentTone[data.document.status];
  const headSeq = data.events[0]?.seq ?? -1;

  return (
    <div className="mx-auto w-full max-w-[1200px] p-5 md:p-8">
      <PageHeader
        back={{ to: "/documents", label: "All documents" }}
        title={data.document.title}
        subtitle={`Cryptographic history for ${data.document.filename || "this document"}`}
        actions={
          <>
            <Button
              variant="secondary"
              icon="verified_user"
              loading={verifying}
              onClick={() => void verify()}
            >
              Verify chain
            </Button>
            {data.document.executed_sha256 && (
              <Button icon="download" onClick={() => void download("executed")}>
                Executed PDF
              </Button>
            )}
            {!data.document.executed_sha256 && detail.filename && (
              <Button variant="secondary" icon="download" onClick={() => void download("original")}>
                Original
              </Button>
            )}
          </>
        }
      />

      {report && (
        <div
          className={cx(
            "mb-6 flex animate-rise items-start gap-3 rounded-xl border p-4",
            report.valid
              ? "border-tertiary/25 bg-tertiary-fixed/45"
              : "border-error/30 bg-error-container",
          )}
        >
          <Icon
            name={report.valid ? "verified_user" : "gpp_bad"}
            className={cx("text-[24px]", report.valid ? "text-tertiary" : "text-error")}
          />
          <div className="min-w-0 flex-1">
            <div
              className={cx(
                "text-[13.5px] font-extrabold",
                report.valid ? "text-on-tertiary-fixed" : "text-on-error-container",
              )}
            >
              {report.valid
                ? `Verified — ${report.checked} of ${report.total} events hash correctly`
                : `Tampering detected at event #${report.broken_at}`}
            </div>
            <p
              className={cx(
                "mt-0.5 text-[12px]",
                report.valid ? "text-on-tertiary-fixed/80" : "text-on-error-container/85",
              )}
            >
              {report.reason}
            </p>
            {report.head_hash && (
              <div className="mt-2">
                <Hash value={report.head_hash} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Document summary */}
      <Card className="mb-6 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3.5">
            <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-primary-fixed text-primary">
              <Icon name="description" className="text-[24px]" />
            </span>
            <div className="min-w-0">
              <div className="truncate text-[15px] font-extrabold text-on-surface">
                {data.document.filename || data.document.title}
              </div>
              <div className="mt-0.5 font-mono text-[11px] text-on-surface-variant">
                ID: {data.document.id}
              </div>
            </div>
          </div>
          <StatusChip label={tone.label} chip={tone.chip} icon={tone.icon} />
        </div>

        <div className="mt-5 grid gap-4 border-t border-outline-variant pt-4 sm:grid-cols-2">
          <div>
            <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-outline">
              Original SHA-256
            </div>
            <Hash value={data.document.original_sha256} className="w-full" />
          </div>
          <div>
            <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-outline">
              Executed SHA-256
            </div>
            {data.document.executed_sha256 ? (
              <Hash value={data.document.executed_sha256} className="w-full" />
            ) : (
              <p className="text-[12px] text-outline">Generated once every party completes.</p>
            )}
          </div>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* Timeline */}
        <section>
          <h2 className="mb-4 text-[13px] font-extrabold uppercase tracking-wider text-on-surface-variant">
            Event chain · newest first
          </h2>
          {data.events.length === 0 ? (
            <p className="text-[13px] text-on-surface-variant">No events recorded yet.</p>
          ) : (
            <ol className="space-y-4">
              {data.events.map((event) => (
                <EventCard key={event.id} event={event} isHead={event.seq === headSeq} />
              ))}
            </ol>
          )}
        </section>

        {/* Recipients */}
        <aside className="space-y-4">
          <h2 className="text-[13px] font-extrabold uppercase tracking-wider text-on-surface-variant">
            Parties
          </h2>
          {detail.workflow?.recipients.map((person) => {
            const personTone = recipientTone[person.status];
            const canResend =
              detail.status === "routing" &&
              person.status !== "completed" &&
              person.status !== "declined";
            return (
              <Card key={person.id} className="p-4">
                <div className="flex items-start gap-3">
                  <Avatar initials={person.initials} size={34} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-bold text-on-surface">
                      {person.name}
                    </div>
                    <div className="truncate text-[11.5px] text-on-surface-variant">
                      {person.email}
                    </div>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <StatusChip
                    label={personTone.label}
                    chip={personTone.chip}
                    icon={personTone.icon}
                  />
                  <span className="text-[11px] font-semibold text-on-surface-variant">
                    Step {person.order + 1} · {person.role_display}
                  </span>
                </div>

                <dl className="mt-3 space-y-1.5 border-t border-outline-variant pt-3 text-[11.5px]">
                  {[
                    ["Invited", person.sent_at],
                    ["First viewed", person.first_viewed_at],
                    ["Completed", person.completed_at],
                  ].map(([label, value]) => (
                    <div key={label as string} className="flex justify-between gap-2">
                      <dt className="text-on-surface-variant">{label}</dt>
                      <dd className="truncate font-medium text-on-surface">
                        {value ? relativeTime(value as string) : "—"}
                      </dd>
                    </div>
                  ))}
                  {person.last_ip && (
                    <div className="flex justify-between gap-2">
                      <dt className="text-on-surface-variant">Last IP</dt>
                      <dd className="font-mono text-[11px] text-on-surface">{person.last_ip}</dd>
                    </div>
                  )}
                </dl>

                {person.decline_reason && (
                  <p className="mt-3 rounded-lg bg-error-container p-2.5 text-[11.5px] leading-relaxed text-on-error-container">
                    “{person.decline_reason}”
                  </p>
                )}

                {canResend && (
                  <Button
                    variant="secondary"
                    size="sm"
                    icon="forward_to_inbox"
                    full
                    className="mt-3"
                    onClick={() => void resend(person.id, person.name)}
                  >
                    Resend link
                  </Button>
                )}
              </Card>
            );
          })}

          {detail.status === "routing" && (
            <Button
              variant="secondary"
              icon="block"
              full
              onClick={() => navigate("/documents")}
            >
              Manage in Documents
            </Button>
          )}
        </aside>
      </div>
    </div>
  );
}
