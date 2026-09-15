import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { PageHeader } from "../components/layout/AppShell";
import {
  Avatar,
  Button,
  Card,
  EmptyState,
  Icon,
  Skeleton,
  StatusChip,
  useToast,
} from "../components/ui";
import { ApiError, api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { cx, documentTone, relativeTime } from "../lib/format";
import type { DashboardStats, DocumentSummary, ServerConfig } from "../lib/types";

function KpiCard({
  label,
  value,
  icon,
  accent,
  footnote,
  highlight,
}: {
  label: string;
  value: string | number;
  icon: string;
  accent: string;
  footnote?: string;
  highlight?: boolean;
}) {
  return (
    <Card className="relative overflow-hidden p-5" interactive>
      <div className="mb-4 flex items-start justify-between">
        <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-on-surface-variant">
          {label}
        </span>
        <span className={cx("grid size-8 place-items-center rounded-full", accent)}>
          <Icon name={icon} className="text-[17px]" />
        </span>
      </div>
      <div className="text-[40px] font-extrabold leading-none tracking-tight text-on-surface">
        {value}
      </div>
      {footnote && (
        <p className="mt-2 text-[12px] font-medium text-on-surface-variant">{footnote}</p>
      )}
      {highlight && <span className="absolute inset-x-0 bottom-0 h-1 bg-primary" />}
    </Card>
  );
}

function ProgressBar({ percent }: { percent: number }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-container-high">
      <div
        className="h-full rounded-full bg-primary transition-all duration-500"
        style={{ width: `${Math.max(percent, 3)}%` }}
      />
    </div>
  );
}

function DocumentRow({ document: doc }: { document: DocumentSummary }) {
  const tone = documentTone[doc.status];
  const navigate = useNavigate();
  const target = doc.status === "draft" ? `/documents/${doc.id}/build` : `/documents/${doc.id}/audit`;

  return (
    <tr
      onClick={() => navigate(target)}
      className="cursor-pointer border-b border-outline-variant last:border-0 transition-colors hover:bg-surface-container-low"
    >
      <td className="py-3.5 pl-5 pr-3">
        <div className="flex items-center gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-surface-container-high text-on-surface-variant">
            <Icon name="description" className="text-[19px]" />
          </span>
          <div className="min-w-0">
            <div className="truncate text-[13px] font-bold text-on-surface">{doc.title}</div>
            <div className="truncate text-[11px] text-on-surface-variant">
              {doc.filename || "No file attached"} · {doc.page_count || "—"} pages
            </div>
          </div>
        </div>
      </td>
      <td className="px-3 py-3.5">
        <StatusChip label={tone.label} chip={tone.chip} icon={tone.icon} />
      </td>
      <td className="hidden px-3 py-3.5 md:table-cell">
        {doc.progress.total > 0 ? (
          <div className="w-32">
            <div className="mb-1 text-[11px] font-semibold text-on-surface-variant">
              {doc.progress.completed}/{doc.progress.total} signed
            </div>
            <ProgressBar percent={doc.progress.percent} />
          </div>
        ) : (
          <span className="text-[12px] text-outline">No recipients</span>
        )}
      </td>
      <td className="hidden px-3 py-3.5 lg:table-cell">
        {doc.current_step ? (
          <div className="flex items-center gap-2">
            <Avatar initials={doc.current_step.name.slice(0, 2).toUpperCase()} size={26} tone="neutral" />
            <span className="truncate text-[12px] font-medium text-on-surface-variant">
              {doc.current_step.name}
            </span>
          </div>
        ) : (
          <span className="text-[12px] text-outline">—</span>
        )}
      </td>
      <td className="px-3 py-3.5 text-right text-[12px] text-on-surface-variant">
        {relativeTime(doc.updated_at)}
      </td>
      <td className="py-3.5 pl-3 pr-5 text-right">
        <Icon name="chevron_right" className="text-[18px] text-outline" />
      </td>
    </tr>
  );
}

export function Dashboard() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [config, setConfig] = useState<ServerConfig | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    document.title = "Dashboard — DocuRoute";
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [statsData, configData] = await Promise.all([api.stats(), api.config()]);
      setStats(statsData);
      setConfig(configData);
    } catch (error) {
      toast.push("error", error instanceof ApiError ? error.summary : "Could not load the dashboard.");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const firstName = profile?.display_name?.split(" ")[0] || "there";

  return (
    <div className="mx-auto w-full max-w-[1400px] p-5 md:p-8">
      <PageHeader
        title={`Good to see you, ${firstName}`}
        subtitle="Overview of current document workflows across your workspace."
        actions={
          <>
            <Button variant="secondary" icon="refresh" onClick={() => void load()}>
              Refresh
            </Button>
            <Button icon="add" onClick={() => navigate("/documents/new")}>
              New route
            </Button>
          </>
        }
      />

      {config && !config.storage_configured && (
        <div className="mb-6 flex items-start gap-2.5 rounded-xl border border-warning/25 bg-warning-container p-4 text-[13px] leading-relaxed text-on-warning-container">
          <Icon name="cloud_off" className="mt-px text-[19px]" />
          <div>
            <strong className="font-bold">Storage is not configured.</strong> Uploads will fail
            until <code>SUPABASE_URL</code>, <code>SUPABASE_SERVICE_ROLE_KEY</code> and{" "}
            <code>SUPABASE_STORAGE_BUCKET</code> are set in the API environment.
          </div>
        </div>
      )}

      {loading ? (
        <div className="grid gap-4 md:grid-cols-3">
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-40" />
          ))}
        </div>
      ) : stats ? (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <KpiCard
              label="Active workflows"
              value={stats.active}
              icon="sync"
              accent="bg-primary-fixed text-primary"
              footnote={`${stats.drafts} draft${stats.drafts === 1 ? "" : "s"} not yet sent`}
              highlight
            />
            <KpiCard
              label="Pending approvals"
              value={stats.pending_approvals}
              icon="hourglass_empty"
              accent="bg-warning-container text-warning"
              footnote={
                stats.avg_completion_hours !== null
                  ? `Average turnaround ${stats.avg_completion_hours} hrs`
                  : "No completed routes yet"
              }
            />
            <KpiCard
              label="Executed"
              value={stats.completed}
              icon="task_alt"
              accent="bg-tertiary-fixed text-tertiary"
              footnote={`${stats.completion_rate}% completion rate across ${stats.total} document${stats.total === 1 ? "" : "s"}`}
            />
          </div>

          <section className="mt-8">
            <div className="mb-4 flex items-end justify-between">
              <div>
                <h2 className="text-lg font-extrabold tracking-tight text-on-surface">
                  Recent activity
                </h2>
                <p className="text-[12.5px] text-on-surface-variant">
                  The eight documents that changed most recently.
                </p>
              </div>
              <Link
                to="/documents"
                className="inline-flex items-center gap-1 text-[13px] font-bold text-primary transition-all hover:gap-2"
              >
                All documents
                <Icon name="arrow_forward" className="text-[16px]" />
              </Link>
            </div>

            {stats.recent.length === 0 ? (
              <EmptyState
                icon="description"
                title="No documents yet"
                description="Upload a contract, add your approvers in order, and DocuRoute handles the rest — invitations, reminders, and the audit chain."
                action={
                  <Button icon="add" onClick={() => navigate("/documents/new")}>
                    Route your first document
                  </Button>
                }
              />
            ) : (
              <Card className="overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-left">
                    <thead>
                      <tr className="border-b border-outline-variant bg-surface-container-low text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
                        <th className="py-2.5 pl-5 pr-3">Document</th>
                        <th className="px-3 py-2.5">Status</th>
                        <th className="hidden px-3 py-2.5 md:table-cell">Progress</th>
                        <th className="hidden px-3 py-2.5 lg:table-cell">Waiting on</th>
                        <th className="px-3 py-2.5 text-right">Updated</th>
                        <th className="py-2.5 pl-3 pr-5" />
                      </tr>
                    </thead>
                    <tbody>
                      {stats.recent.map((doc) => (
                        <DocumentRow key={doc.id} document={doc} />
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
