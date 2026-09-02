import { useEffect, useState } from "react";

import { PageHeader } from "../components/layout/AppShell";
import { Avatar, Button, Card, Icon, TextField, useToast } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { ApiError, api } from "../lib/api";
import { cx, formatBytes, formatDateTime } from "../lib/format";
import { firebaseConfigured } from "../lib/env";
import type { ServerConfig } from "../lib/types";

function StatusLine({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
  return (
    <li className="flex items-start gap-3 py-2.5">
      <Icon
        name={ok ? "check_circle" : "error"}
        className={cx("mt-px text-[18px]", ok ? "text-tertiary" : "text-warning")}
      />
      <div className="min-w-0">
        <div className="text-[13px] font-semibold text-on-surface">{label}</div>
        <p className="text-[12px] leading-relaxed text-on-surface-variant">{detail}</p>
      </div>
    </li>
  );
}

export function Settings() {
  const { profile, refreshProfile, signOut } = useAuth();
  const toast = useToast();

  const [fullName, setFullName] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [orgName, setOrgName] = useState("");
  const [config, setConfig] = useState<ServerConfig | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingOrg, setSavingOrg] = useState(false);

  useEffect(() => {
    document.title = "Settings — DocuRoute";
  }, []);

  useEffect(() => {
    if (!profile) return;
    setFullName(profile.full_name);
    setJobTitle(profile.job_title);
    setOrgName(profile.organization?.name || "");
  }, [profile]);

  useEffect(() => {
    void api.config().then(setConfig).catch(() => setConfig(null));
  }, []);

  const saveProfile = async () => {
    setSavingProfile(true);
    try {
      await api.updateMe({ full_name: fullName, job_title: jobTitle });
      await refreshProfile();
      toast.push("success", "Profile updated.");
    } catch (error) {
      toast.push("error", error instanceof ApiError ? error.summary : "Could not save.");
    } finally {
      setSavingProfile(false);
    }
  };

  const saveOrg = async () => {
    setSavingOrg(true);
    try {
      await api.updateOrganization(orgName);
      await refreshProfile();
      toast.push("success", "Workspace renamed.");
    } catch (error) {
      toast.push("error", error instanceof ApiError ? error.summary : "Could not save.");
    } finally {
      setSavingOrg(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[900px] p-5 md:p-8">
      <PageHeader title="Settings" subtitle="Your profile, workspace and platform configuration." />

      <div className="space-y-6">
        <Card className="p-6">
          <div className="mb-5 flex items-center gap-4">
            <Avatar
              initials={profile?.initials || "?"}
              src={profile?.avatar_url || undefined}
              size={56}
            />
            <div className="min-w-0">
              <h2 className="text-base font-extrabold text-on-surface">
                {profile?.display_name}
              </h2>
              <p className="truncate text-[12.5px] text-on-surface-variant">{profile?.email}</p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Full name"
              icon="person"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
            />
            <TextField
              label="Job title"
              icon="badge"
              placeholder="Head of Legal Operations"
              value={jobTitle}
              onChange={(event) => setJobTitle(event.target.value)}
            />
          </div>
          <p className="mt-3 text-[12px] text-on-surface-variant">
            Your email and password are managed by Supabase Auth. Last seen{" "}
            {formatDateTime(profile?.last_seen_at)}.
          </p>
          <div className="mt-5 flex justify-end">
            <Button icon="save" loading={savingProfile} onClick={() => void saveProfile()}>
              Save profile
            </Button>
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="text-base font-extrabold text-on-surface">Workspace</h2>
          <p className="mb-4 mt-1 text-[12.5px] text-on-surface-variant">
            Documents, routing plans and audit trails are scoped to this workspace.
          </p>
          <TextField
            label="Workspace name"
            icon="corporate_fare"
            value={orgName}
            onChange={(event) => setOrgName(event.target.value)}
            hint={profile?.organization ? `Slug: ${profile.organization.slug}` : undefined}
          />
          <div className="mt-5 flex justify-end">
            <Button icon="save" loading={savingOrg} onClick={() => void saveOrg()}>
              Save workspace
            </Button>
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="text-base font-extrabold text-on-surface">Platform configuration</h2>
          <p className="mb-2 mt-1 text-[12.5px] text-on-surface-variant">
            What the API reports about its own environment. Nothing secret is exposed here.
          </p>
          {config ? (
            <ul className="divide-y divide-outline-variant">
              <StatusLine
                ok={config.supabase_configured}
                label="Supabase"
                detail={
                  config.supabase_configured
                    ? "Auth tokens are verified against your Supabase project."
                    : "Set SUPABASE_URL and either SUPABASE_JWT_SECRET or asymmetric signing keys."
                }
              />
              <StatusLine
                ok={config.storage_configured}
                label="Document storage"
                detail={
                  config.storage_configured
                    ? `Presigned uploads active. Maximum file size ${formatBytes(config.max_upload_bytes)}.`
                    : "Set SUPABASE_SERVICE_ROLE_KEY and SUPABASE_STORAGE_BUCKET — uploads fail without them."
                }
              />
              <StatusLine
                ok={config.email_configured}
                label="Email delivery"
                detail={
                  config.email_configured
                    ? "Invitations and completion notices are sent over SMTP."
                    : "Using the console backend — invitation emails print to the API log instead of sending."
                }
              />
              <StatusLine
                ok
                label="Signing links"
                detail={`Magic links expire after ${config.signing_token_ttl_hours} hours, or sooner if a workflow sets its own expiry.`}
              />
              <StatusLine
                ok={firebaseConfigured}
                label="Firebase Analytics"
                detail={
                  firebaseConfigured
                    ? "Page views and workflow events are being reported."
                    : "No Firebase keys in frontend/.env — analytics is disabled entirely."
                }
              />
            </ul>
          ) : (
            <p className="text-[13px] text-on-surface-variant">
              Could not reach the API to read its configuration.
            </p>
          )}
        </Card>

        <Card className="border-error/25 p-6">
          <h2 className="text-base font-extrabold text-on-surface">Session</h2>
          <p className="mb-4 mt-1 text-[12.5px] text-on-surface-variant">
            Signing out clears your Supabase session on this device only.
          </p>
          <Button variant="secondary" icon="logout" onClick={() => void signOut()}>
            Sign out
          </Button>
        </Card>
      </div>
    </div>
  );
}
