import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { PageHeader } from "../components/layout/AppShell";
import {
  Avatar,
  Button,
  Card,
  EmptyState,
  Icon,
  Modal,
  Skeleton,
  StatusChip,
  TextField,
  useToast,
} from "../components/ui";
import { ApiError, api } from "../lib/api";
import { cx, documentTone, formatBytes, relativeTime } from "../lib/format";
import type { DocumentStatus, DocumentSummary } from "../lib/types";

const FILTERS: Array<{ value: string; label: string }> = [
  { value: "", label: "All" },
  { value: "draft", label: "Drafts" },
  { value: "routing", label: "Out for signature" },
  { value: "completed", label: "Executed" },
  { value: "declined", label: "Declined" },
];

export function Documents({
  filterStatus,
  heading = "Documents",
}: {
  filterStatus?: DocumentStatus;
  heading?: string;
}) {
  const navigate = useNavigate();
  const toast = useToast();

  const [items, setItems] = useState<DocumentSummary[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string>(filterStatus || "");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [voidTarget, setVoidTarget] = useState<DocumentSummary | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    document.title = `${heading} — DocuRoute`;
  }, [heading]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(search), 320);
    return () => window.clearTimeout(timer);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const page = await api.listDocuments({
        status: filterStatus || status || undefined,
        search: debounced || undefined,
      });
      setItems(page.results);
      setCount(page.count);
    } catch (error) {
      toast.push("error", error instanceof ApiError ? error.summary : "Could not load documents.");
    } finally {
      setLoading(false);
    }
  }, [status, debounced, filterStatus, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const remove = async (doc: DocumentSummary) => {
    if (!window.confirm(`Delete “${doc.title}”? This also removes its stored files.`)) return;
    try {
      await api.deleteDocument(doc.id);
      toast.push("success", `“${doc.title}” deleted.`);
      void load();
    } catch (error) {
      toast.push("error", error instanceof ApiError ? error.summary : "Could not delete.");
    }
  };

  const confirmVoid = async () => {
    if (!voidTarget) return;
    setBusy(true);
    try {
      await api.voidDocument(voidTarget.id, voidReason);
      toast.push("success", `“${voidTarget.title}” voided. Every outstanding link is now dead.`);
      setVoidTarget(null);
      setVoidReason("");
      void load();
    } catch (error) {
      toast.push("error", error instanceof ApiError ? error.summary : "Could not void the document.");
    } finally {
      setBusy(false);
    }
  };

  const download = async (doc: DocumentSummary) => {
    try {
      const { url } = await api.downloadUrl(doc.id);
      window.open(url, "_blank", "noopener");
    } catch (error) {
      toast.push("error", error instanceof ApiError ? error.summary : "Could not prepare a download.");
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1400px] p-5 md:p-8">
      <PageHeader
        title={heading}
        subtitle={`${count} document${count === 1 ? "" : "s"} in this workspace.`}
        actions={
          <Button icon="add" onClick={() => navigate("/documents/new")}>
            New route
          </Button>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="w-full max-w-xs">
          <TextField
            icon="search"
            placeholder="Search by title or filename"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        {!filterStatus && (
          <div className="flex flex-wrap gap-1.5">
            {FILTERS.map((filter) => (
              <button
                key={filter.value}
                onClick={() => setStatus(filter.value)}
                className={cx(
                  "rounded-full px-3.5 py-1.5 text-[12px] font-semibold transition-all",
                  status === filter.value
                    ? "bg-primary text-on-primary shadow-[var(--shadow-card)]"
                    : "bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest",
                )}
              >
                {filter.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((index) => (
            <Skeleton key={index} className="h-52" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon="folder_open"
          title={debounced ? "Nothing matches that search" : "No documents here yet"}
          description={
            debounced
              ? "Try a different title or filename."
              : "Create a route, upload the PDF, and place fields for each signer."
          }
          action={
            !debounced && (
              <Button icon="add" onClick={() => navigate("/documents/new")}>
                New route
              </Button>
            )
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((doc) => {
            const tone = documentTone[doc.status];
            return (
              <Card key={doc.id} className="flex flex-col p-5" interactive>
                <div className="mb-3 flex items-start justify-between gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-fixed text-primary">
                    <Icon name="description" className="text-[20px]" />
                  </span>
                  <StatusChip label={tone.label} chip={tone.chip} icon={tone.icon} />
                </div>

                <button
                  onClick={() =>
                    navigate(
                      doc.status === "draft"
                        ? `/documents/${doc.id}/build`
                        : `/documents/${doc.id}/audit`,
                    )
                  }
                  className="text-left"
                >
                  <h3 className="line-clamp-2 text-[15px] font-bold leading-snug text-on-surface transition-colors hover:text-primary">
                    {doc.title}
                  </h3>
                </button>
                <p className="mt-1 truncate text-[11.5px] text-on-surface-variant">
                  {doc.filename || "No file attached"}
                  {doc.size_bytes ? ` · ${formatBytes(doc.size_bytes)}` : ""}
                  {doc.page_count ? ` · ${doc.page_count} pages` : ""}
                </p>

                <div className="my-4 flex-1">
                  {doc.progress.total > 0 ? (
                    <>
                      <div className="mb-1.5 flex items-center justify-between text-[11px] font-semibold text-on-surface-variant">
                        <span>
                          {doc.progress.completed} of {doc.progress.total} completed
                        </span>
                        <span>{doc.progress.percent}%</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-surface-container-high">
                        <div
                          className={cx(
                            "h-full rounded-full transition-all duration-500",
                            doc.status === "completed" ? "bg-tertiary" : "bg-primary",
                          )}
                          style={{ width: `${Math.max(doc.progress.percent, 3)}%` }}
                        />
                      </div>
                      {doc.current_step && (
                        <div className="mt-3 flex items-center gap-2">
                          <Avatar
                            initials={doc.current_step.name.slice(0, 2).toUpperCase()}
                            size={22}
                            tone="neutral"
                          />
                          <span className="truncate text-[11.5px] text-on-surface-variant">
                            Waiting on <strong className="text-on-surface">{doc.current_step.name}</strong>
                          </span>
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="text-[12px] text-outline">No recipients added yet.</p>
                  )}
                </div>

                <div className="flex items-center justify-between border-t border-outline-variant pt-3">
                  <span className="text-[11px] text-on-surface-variant">
                    {relativeTime(doc.updated_at)}
                  </span>
                  <div className="flex items-center gap-0.5">
                    {doc.status === "draft" ? (
                      <IconButton
                        icon="edit"
                        label="Open builder"
                        onClick={() => navigate(`/documents/${doc.id}/build`)}
                      />
                    ) : (
                      <IconButton
                        icon="fingerprint"
                        label="Audit trail"
                        onClick={() => navigate(`/documents/${doc.id}/audit`)}
                      />
                    )}
                    {doc.filename && (
                      <IconButton
                        icon="download"
                        label="Download"
                        onClick={() => void download(doc)}
                      />
                    )}
                    {doc.status === "routing" && (
                      <IconButton
                        icon="block"
                        label="Void"
                        tone="danger"
                        onClick={() => setVoidTarget(doc)}
                      />
                    )}
                    {doc.status !== "routing" && (
                      <IconButton
                        icon="delete"
                        label="Delete"
                        tone="danger"
                        onClick={() => void remove(doc)}
                      />
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Modal
        open={Boolean(voidTarget)}
        onClose={() => setVoidTarget(null)}
        title="Void this document?"
        description="Every outstanding signing link is invalidated immediately and the routing stops. This is recorded in the audit trail and cannot be undone."
        footer={
          <>
            <Button variant="ghost" onClick={() => setVoidTarget(null)}>
              Cancel
            </Button>
            <Button variant="danger" icon="block" loading={busy} onClick={() => void confirmVoid()}>
              Void document
            </Button>
          </>
        }
      >
        <TextField
          label="Reason (recorded in the audit trail)"
          placeholder="Superseded by revision 3"
          value={voidReason}
          onChange={(event) => setVoidReason(event.target.value)}
        />
      </Modal>
    </div>
  );
}

function IconButton({
  icon,
  label,
  onClick,
  tone = "neutral",
}: {
  icon: string;
  label: string;
  onClick: () => void;
  tone?: "neutral" | "danger";
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className={cx(
        "rounded-lg p-2 transition-colors",
        tone === "danger"
          ? "text-outline hover:bg-error-container hover:text-on-error-container"
          : "text-outline hover:bg-surface-container-high hover:text-primary",
      )}
    >
      <Icon name={icon} className="text-[18px]" />
    </button>
  );
}
