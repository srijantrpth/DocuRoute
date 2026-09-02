import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { Logo } from "../components/layout/AppShell";
import { PdfViewer, type PageBox } from "../components/signing/PdfViewer";
import {
  Avatar,
  Button,
  Icon,
  Modal,
  PageLoader,
  Select,
  TextArea,
  TextField,
  useToast,
} from "../components/ui";
import { ApiError, api, uploadToStorage } from "../lib/api";
import { track } from "../lib/analytics";
import { cx, formatBytes } from "../lib/format";
import type { DocumentDetail, FieldKind, RecipientRole } from "../lib/types";

/** Default field footprints as a fraction of the page. */
const FIELD_SIZE: Record<FieldKind, { width: number; height: number }> = {
  signature: { width: 0.26, height: 0.06 },
  initials: { width: 0.09, height: 0.05 },
  date: { width: 0.16, height: 0.04 },
  text: { width: 0.24, height: 0.04 },
  checkbox: { width: 0.035, height: 0.025 },
};

const FIELD_META: Record<FieldKind, { icon: string; label: string }> = {
  signature: { icon: "draw", label: "Signature" },
  initials: { icon: "abc", label: "Initials" },
  date: { icon: "event", label: "Date signed" },
  text: { icon: "text_fields", label: "Text" },
  checkbox: { icon: "check_box", label: "Checkbox" },
};

const ROLES: Array<{ value: RecipientRole; label: string; hint: string }> = [
  { value: "signer", label: "Needs to sign", hint: "Places a mark on the document" },
  { value: "approver", label: "Needs to approve", hint: "Confirms without signing" },
  { value: "viewer", label: "Receives a copy", hint: "Emailed the executed PDF" },
];

/** Distinct per-recipient colours so field ownership reads at a glance. */
const RECIPIENT_COLORS = [
  { ring: "#0040e0", tint: "rgb(0 64 224 / 0.10)", chip: "bg-primary-fixed text-on-primary-fixed" },
  { ring: "#006242", tint: "rgb(0 98 66 / 0.10)", chip: "bg-tertiary-fixed text-on-tertiary-fixed" },
  { ring: "#b45309", tint: "rgb(180 83 9 / 0.10)", chip: "bg-warning-container text-on-warning-container" },
  { ring: "#7c3aed", tint: "rgb(124 58 237 / 0.10)", chip: "bg-[#ede9fe] text-[#4c1d95]" },
  { ring: "#be185d", tint: "rgb(190 24 93 / 0.10)", chip: "bg-[#fce7f3] text-[#831843]" },
];

const colorFor = (index: number) => RECIPIENT_COLORS[index % RECIPIENT_COLORS.length];

type DraftRecipient = {
  key: string;
  name: string;
  email: string;
  role: RecipientRole;
};

type DraftField = {
  key: string;
  recipientIndex: number;
  kind: FieldKind;
  label: string;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  required: boolean;
};

const uid = () => Math.random().toString(36).slice(2, 10);
const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export function WorkflowBuilder() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();

  const [doc, setDoc] = useState<DocumentDetail | null>(null);
  const [loading, setLoading] = useState(Boolean(id));
  const [fileUrl, setFileUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [showPublish, setShowPublish] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [dirty, setDirty] = useState(false);

  const [recipients, setRecipients] = useState<DraftRecipient[]>([
    { key: uid(), name: "", email: "", role: "signer" },
  ]);
  const [fields, setFields] = useState<DraftField[]>([]);
  const [mode, setMode] = useState<"sequential" | "parallel">("sequential");
  const [message, setMessage] = useState("");
  const [expiresAt, setExpiresAt] = useState("");

  const [activeRecipient, setActiveRecipient] = useState(0);
  const [tool, setTool] = useState<FieldKind | null>(null);
  const [selectedField, setSelectedField] = useState<string | null>(null);

  const fileInput = useRef<HTMLInputElement | null>(null);
  const dragState = useRef<{ key: string; dx: number; dy: number } | null>(null);

  useEffect(() => {
    document.title = doc ? `${doc.title} — Builder` : "New route — DocuRoute";
  }, [doc]);

  /* ---------------------------------------------------------------- load */
  const loadPreview = useCallback(
    async (documentId: string) => {
      try {
        const { url } = await api.downloadUrl(documentId, "original");
        setFileUrl(url);
      } catch {
        setFileUrl("");
      }
    },
    [],
  );

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }
    let cancelled = false;

    void (async () => {
      try {
        const detail = await api.getDocument(id);
        if (cancelled) return;
        setDoc(detail);
        setTitleDraft(detail.title);

        const plan = detail.workflow;
        if (plan && plan.recipients.length > 0) {
          const loaded = plan.recipients.map((person) => ({
            key: person.id,
            name: person.name,
            email: person.email,
            role: person.role,
          }));
          setRecipients(loaded);
          setMode(plan.mode);
          setMessage(plan.message || "");
          setExpiresAt(plan.expires_at ? plan.expires_at.slice(0, 10) : "");

          const indexById = new Map(plan.recipients.map((person, index) => [person.id, index]));
          setFields(
            detail.fields.map((field) => ({
              key: field.id,
              recipientIndex: indexById.get(field.recipient || "") ?? 0,
              kind: field.kind,
              label: field.label,
              page: field.page,
              x: field.x,
              y: field.y,
              width: field.width,
              height: field.height,
              required: field.required,
            })),
          );
        }

        if (detail.has_file) await loadPreview(detail.id);
      } catch (error) {
        toast.push("error", error instanceof ApiError ? error.summary : "Could not open the document.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id, loadPreview, toast]);

  /* -------------------------------------------------------------- upload */
  const ensureDocument = useCallback(
    async (fallbackTitle: string): Promise<DocumentDetail> => {
      if (doc) return doc;
      const created = await api.createDocument(fallbackTitle);
      setDoc(created);
      setTitleDraft(created.title);
      navigate(`/documents/${created.id}/build`, { replace: true });
      return created;
    },
    [doc, navigate],
  );

  const handleFile = async (file: File) => {
    if (file.type !== "application/pdf") {
      toast.push("error", "Only PDF files are supported.");
      return;
    }
    setUploading(true);
    try {
      const target = await ensureDocument(file.name.replace(/\.pdf$/i, ""));
      const ticket = await api.uploadTicket(target.id, {
        filename: file.name,
        content_type: "application/pdf",
        size_bytes: file.size,
      });
      await uploadToStorage(ticket, file);
      const updated = await api.attachUpload(target.id, ticket.storage_path, file.name);
      setDoc(updated);
      await loadPreview(updated.id);
      track("document_uploaded", { pages: updated.page_count, size: updated.size_bytes });
      toast.push("success", `${file.name} attached — ${updated.page_count} pages.`);
    } catch (error) {
      toast.push("error", error instanceof ApiError ? error.summary : "Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  /* ------------------------------------------------------------ recipients */
  const updateRecipient = (index: number, patch: Partial<DraftRecipient>) => {
    setRecipients((current) =>
      current.map((person, position) => (position === index ? { ...person, ...patch } : person)),
    );
    setDirty(true);
  };

  const addRecipient = () => {
    setRecipients((current) => [...current, { key: uid(), name: "", email: "", role: "signer" }]);
    setActiveRecipient(recipients.length);
    setDirty(true);
  };

  const removeRecipient = (index: number) => {
    setRecipients((current) => current.filter((_, position) => position !== index));
    setFields((current) =>
      current
        .filter((field) => field.recipientIndex !== index)
        .map((field) => ({
          ...field,
          recipientIndex:
            field.recipientIndex > index ? field.recipientIndex - 1 : field.recipientIndex,
        })),
    );
    setActiveRecipient((current) => clamp(current > index ? current - 1 : current, 0, recipients.length - 2));
    setDirty(true);
  };

  const moveRecipient = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= recipients.length) return;
    setRecipients((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    // Field ownership follows the people, not the positions.
    setFields((current) =>
      current.map((field) => {
        if (field.recipientIndex === index) return { ...field, recipientIndex: target };
        if (field.recipientIndex === target) return { ...field, recipientIndex: index };
        return field;
      }),
    );
    setActiveRecipient(target);
    setDirty(true);
  };

  /* ---------------------------------------------------------------- fields */
  const placeField = (page: number, x: number, y: number) => {
    if (!tool) return;
    if (!recipients[activeRecipient]?.email) {
      toast.push("info", "Give the selected recipient an email address first.");
      return;
    }
    const size = FIELD_SIZE[tool];
    const field: DraftField = {
      key: uid(),
      recipientIndex: activeRecipient,
      kind: tool,
      label: FIELD_META[tool].label,
      page,
      x: clamp(x - size.width / 2, 0, 1 - size.width),
      y: clamp(y - size.height / 2, 0, 1 - size.height),
      width: size.width,
      height: size.height,
      required: true,
    };
    setFields((current) => [...current, field]);
    setSelectedField(field.key);
    setTool(null);
    setDirty(true);
  };

  const moveField = (key: string, x: number, y: number) => {
    setFields((current) =>
      current.map((field) =>
        field.key === key
          ? {
              ...field,
              x: clamp(x, 0, 1 - field.width),
              y: clamp(y, 0, 1 - field.height),
            }
          : field,
      ),
    );
    setDirty(true);
  };

  const removeField = (key: string) => {
    setFields((current) => current.filter((field) => field.key !== key));
    setSelectedField(null);
    setDirty(true);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.key === "Delete" || event.key === "Backspace") && selectedField) {
        const target = event.target as HTMLElement;
        if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
        event.preventDefault();
        removeField(selectedField);
      }
      if (event.key === "Escape") {
        setTool(null);
        setSelectedField(null);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [selectedField]);

  /* ------------------------------------------------------------- persistence */
  const planPayload = useMemo(
    () => ({
      name: titleDraft,
      mode,
      message,
      expires_at: expiresAt ? new Date(`${expiresAt}T23:59:59`).toISOString() : null,
      recipients: recipients.map((person, index) => ({
        name: person.name.trim(),
        email: person.email.trim(),
        role: person.role,
        order: index,
      })),
      fields: fields.map((field) => ({
        recipient_index: field.recipientIndex,
        kind: field.kind,
        label: field.label,
        page: field.page,
        x: field.x,
        y: field.y,
        width: field.width,
        height: field.height,
        required: field.required,
      })),
    }),
    [titleDraft, mode, message, expiresAt, recipients, fields],
  );

  const validation = useMemo(() => {
    const problems: string[] = [];
    if (!doc?.has_file) problems.push("Upload the PDF.");
    const filled = recipients.filter((person) => person.name.trim() && person.email.trim());
    if (filled.length === 0) problems.push("Add at least one recipient with a name and email.");
    if (filled.length !== recipients.length) problems.push("Every recipient needs a name and email.");

    const emails = filled.map((person) => person.email.toLowerCase());
    if (new Set(emails).size !== emails.length) problems.push("Recipient emails must be unique.");

    recipients.forEach((person, index) => {
      if (person.role === "signer" && !fields.some((field) => field.recipientIndex === index)) {
        problems.push(`${person.name || `Recipient ${index + 1}`} has no fields placed.`);
      }
    });
    return problems;
  }, [doc, recipients, fields]);

  const save = async (): Promise<boolean> => {
    if (!doc) {
      toast.push("error", "Upload a document first.");
      return false;
    }
    setSaving(true);
    try {
      await api.saveWorkflow(doc.id, planPayload);
      if (titleDraft.trim() && titleDraft !== doc.title) {
        const renamed = await api.renameDocument(doc.id, titleDraft.trim());
        setDoc((current) => (current ? { ...current, title: renamed.title } : current));
      }
      setDirty(false);
      toast.push("success", "Draft saved.");
      return true;
    } catch (error) {
      toast.push("error", error instanceof ApiError ? error.summary : "Could not save the draft.");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const publish = async () => {
    if (!doc) return;
    setPublishing(true);
    try {
      if (!(await save())) return;
      const result = await api.sendDocument(doc.id);
      track("workflow_sent", { recipients: recipients.length, mode });
      toast.push(
        "success",
        `Sent. ${result.delivered} of ${result.invited} invitation${result.invited === 1 ? "" : "s"} delivered.`,
      );
      navigate(`/documents/${doc.id}/audit`);
    } catch (error) {
      toast.push("error", error instanceof ApiError ? error.summary : "Could not send the document.");
    } finally {
      setPublishing(false);
      setShowPublish(false);
    }
  };

  if (loading) return <PageLoader label="Opening the builder" />;

  const locked = Boolean(doc && doc.status !== "draft");

  /* ------------------------------------------------------------------ view */
  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {/* Workspace header */}
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-outline-variant bg-surface-container-lowest px-5 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <button
            onClick={() => navigate("/documents")}
            title="Back to documents"
            className="rounded-lg p-1.5 text-outline transition-colors hover:bg-surface-container-high hover:text-on-surface"
          >
            <Icon name="arrow_back" className="text-[20px]" />
          </button>
          <div className="min-w-0">
            <input
              value={titleDraft}
              disabled={locked}
              placeholder="Untitled route"
              onChange={(event) => {
                setTitleDraft(event.target.value);
                setDirty(true);
              }}
              className="w-full max-w-md truncate rounded-md bg-transparent text-[17px] font-extrabold tracking-tight text-on-surface outline-none transition-colors hover:bg-surface-container-low focus:bg-surface-container-low disabled:hover:bg-transparent"
            />
            <p className="text-[11.5px] text-on-surface-variant">
              {locked
                ? `${doc?.status_display} — the plan is locked`
                : dirty
                  ? "Unsaved changes"
                  : doc
                    ? "Draft saved"
                    : "New draft"}
              {doc?.filename ? ` · ${doc.filename} (${formatBytes(doc.size_bytes)})` : ""}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Logo className="mr-2 hidden text-[14px] text-on-surface-variant xl:flex" mark={false} />
          <Button variant="ghost" onClick={() => navigate("/documents")}>
            Discard
          </Button>
          <Button variant="secondary" icon="save" loading={saving} disabled={locked} onClick={() => void save()}>
            Save draft
          </Button>
          <Button
            icon="send"
            disabled={locked || validation.length > 0}
            onClick={() => setShowPublish(true)}
          >
            Publish workflow
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Document canvas */}
        <section className="flex min-w-0 flex-1 flex-col border-r border-outline-variant bg-surface-container-low">
          <div className="flex h-11 shrink-0 items-center justify-between border-b border-outline-variant bg-surface-container-lowest px-4">
            <span className="flex items-center gap-1.5 text-[12px] font-semibold text-on-surface-variant">
              <Icon name="visibility" className="text-[16px]" />
              Document preview
              {doc?.page_count ? ` · ${doc.page_count} pages` : ""}
            </span>
            {tool && (
              <span className="flex animate-pop items-center gap-1.5 rounded-full bg-primary px-3 py-1 text-[11px] font-bold text-on-primary">
                <Icon name="ads_click" className="text-[14px]" />
                Click the page to place {FIELD_META[tool].label.toLowerCase()}
              </span>
            )}
          </div>

          <div className="flex-1 overflow-auto p-6">
            {fileUrl ? (
              <PdfViewer
                url={fileUrl}
                onPageClick={locked ? undefined : placeField}
                overlay={(page) => (
                  <FieldLayer
                    page={page}
                    fields={fields.filter((field) => field.page === page.pageNumber - 1)}
                    recipients={recipients}
                    selectedKey={selectedField}
                    locked={locked}
                    onSelect={setSelectedField}
                    onMove={moveField}
                    onRemove={removeField}
                    dragState={dragState}
                  />
                )}
              />
            ) : (
              <UploadDropzone
                uploading={uploading}
                onPick={() => fileInput.current?.click()}
                onFile={(file) => void handleFile(file)}
              />
            )}
            <input
              ref={fileInput}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void handleFile(file);
                event.target.value = "";
              }}
            />
          </div>
        </section>

        {/* Configuration panel */}
        <aside className="flex w-[380px] shrink-0 flex-col overflow-y-auto bg-surface-container-lowest">
          {locked && (
            <div className="flex items-start gap-2 border-b border-outline-variant bg-warning-container p-4 text-[12px] leading-relaxed text-on-warning-container">
              <Icon name="lock" className="mt-px text-[16px]" />
              This document has been sent. Void it from Documents to make changes.
            </div>
          )}

          {/* Recipients */}
          <div className="border-b border-outline-variant p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[13px] font-extrabold uppercase tracking-wider text-on-surface-variant">
                Routing order
              </h2>
              <div className="inline-flex rounded-lg bg-surface-container-high p-0.5">
                {(["sequential", "parallel"] as const).map((option) => (
                  <button
                    key={option}
                    disabled={locked}
                    onClick={() => {
                      setMode(option);
                      setDirty(true);
                    }}
                    className={cx(
                      "rounded-md px-2.5 py-1 text-[11px] font-bold capitalize transition-all",
                      mode === option
                        ? "bg-surface-container-lowest text-primary shadow-[var(--shadow-card)]"
                        : "text-on-surface-variant",
                    )}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2.5">
              {recipients.map((person, index) => {
                const color = colorFor(index);
                const isActive = activeRecipient === index;
                const count = fields.filter((field) => field.recipientIndex === index).length;
                return (
                  <div
                    key={person.key}
                    onClick={() => setActiveRecipient(index)}
                    className={cx(
                      "cursor-pointer rounded-xl border p-3 transition-all",
                      isActive
                        ? "border-transparent bg-surface-container-low shadow-[var(--shadow-raised)]"
                        : "border-outline-variant hover:border-outline",
                    )}
                    style={isActive ? { boxShadow: `0 0 0 2px ${color.ring}` } : undefined}
                  >
                    <div className="mb-2.5 flex items-center gap-2">
                      <span
                        className="grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-extrabold text-white"
                        style={{ background: color.ring }}
                      >
                        {index + 1}
                      </span>
                      <span className="flex-1 truncate text-[12px] font-bold text-on-surface">
                        {person.name.trim() || `Recipient ${index + 1}`}
                      </span>
                      <span className={cx("rounded-full px-2 py-0.5 text-[10px] font-bold", color.chip)}>
                        {count} field{count === 1 ? "" : "s"}
                      </span>
                      <div className="flex">
                        <MiniButton
                          icon="arrow_upward"
                          label="Move up"
                          disabled={locked || index === 0}
                          onClick={() => moveRecipient(index, -1)}
                        />
                        <MiniButton
                          icon="arrow_downward"
                          label="Move down"
                          disabled={locked || index === recipients.length - 1}
                          onClick={() => moveRecipient(index, 1)}
                        />
                        <MiniButton
                          icon="close"
                          label="Remove"
                          disabled={locked || recipients.length === 1}
                          onClick={() => removeRecipient(index)}
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <input
                        value={person.name}
                        disabled={locked}
                        placeholder="Full name"
                        onChange={(event) => updateRecipient(index, { name: event.target.value })}
                        className="h-9 w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-3 text-[12.5px] focus:border-primary focus:outline-none"
                      />
                      <input
                        value={person.email}
                        disabled={locked}
                        type="email"
                        placeholder="name@company.com"
                        onChange={(event) => updateRecipient(index, { email: event.target.value })}
                        className="h-9 w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-3 text-[12.5px] focus:border-primary focus:outline-none"
                      />
                      <select
                        value={person.role}
                        disabled={locked}
                        onChange={(event) =>
                          updateRecipient(index, { role: event.target.value as RecipientRole })
                        }
                        className="h-9 w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-2.5 text-[12.5px] focus:border-primary focus:outline-none"
                      >
                        {ROLES.map((role) => (
                          <option key={role.value} value={role.value}>
                            {role.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                );
              })}
            </div>

            <Button
              variant="secondary"
              icon="person_add"
              full
              disabled={locked}
              className="mt-3"
              onClick={addRecipient}
            >
              Add recipient
            </Button>
          </div>

          {/* Field palette */}
          <div className="border-b border-outline-variant p-5">
            <h2 className="mb-1 text-[13px] font-extrabold uppercase tracking-wider text-on-surface-variant">
              Place fields
            </h2>
            <p className="mb-3 text-[12px] leading-relaxed text-on-surface-variant">
              Pick a field, then click where it belongs on the page. It is assigned to{" "}
              <strong className="text-on-surface">
                {recipients[activeRecipient]?.name.trim() || `recipient ${activeRecipient + 1}`}
              </strong>
              . Drag any placed field to reposition it.
            </p>

            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(FIELD_META) as FieldKind[]).map((kind) => (
                <button
                  key={kind}
                  disabled={locked || !fileUrl}
                  onClick={() => setTool((current) => (current === kind ? null : kind))}
                  className={cx(
                    "flex items-center gap-2 rounded-lg border px-3 py-2.5 text-[12px] font-semibold transition-all",
                    "disabled:cursor-not-allowed disabled:opacity-45",
                    tool === kind
                      ? "border-primary bg-primary text-on-primary shadow-[var(--shadow-card)]"
                      : "border-outline-variant text-on-surface hover:border-primary hover:bg-primary-fixed/40",
                  )}
                >
                  <Icon name={FIELD_META[kind].icon} className="text-[17px]" />
                  {FIELD_META[kind].label}
                </button>
              ))}
            </div>

            {selectedField && (
              <SelectedFieldPanel
                field={fields.find((item) => item.key === selectedField)!}
                recipients={recipients}
                locked={locked}
                onChange={(patch) => {
                  setFields((current) =>
                    current.map((field) =>
                      field.key === selectedField ? { ...field, ...patch } : field,
                    ),
                  );
                  setDirty(true);
                }}
                onRemove={() => removeField(selectedField)}
              />
            )}
          </div>

          {/* Delivery */}
          <div className="p-5">
            <h2 className="mb-3 text-[13px] font-extrabold uppercase tracking-wider text-on-surface-variant">
              Delivery
            </h2>
            <div className="space-y-3">
              <TextArea
                label="Message to recipients"
                rows={3}
                disabled={locked}
                placeholder="Please review section 4 before signing."
                value={message}
                onChange={(event) => {
                  setMessage(event.target.value);
                  setDirty(true);
                }}
              />
              <TextField
                label="Expires on"
                type="date"
                disabled={locked}
                hint="Signing links stop working after this date."
                value={expiresAt}
                onChange={(event) => {
                  setExpiresAt(event.target.value);
                  setDirty(true);
                }}
              />
              {doc?.filename && (
                <Button
                  variant="secondary"
                  icon="autorenew"
                  full
                  disabled={locked || uploading}
                  loading={uploading}
                  onClick={() => fileInput.current?.click()}
                >
                  Replace PDF
                </Button>
              )}
            </div>

            {validation.length > 0 && (
              <div className="mt-4 rounded-xl bg-warning-container p-3.5">
                <div className="mb-1.5 flex items-center gap-1.5 text-[12px] font-bold text-on-warning-container">
                  <Icon name="checklist" className="text-[16px]" />
                  Before you can publish
                </div>
                <ul className="space-y-1 text-[12px] leading-relaxed text-on-warning-container">
                  {validation.map((item) => (
                    <li key={item} className="flex gap-1.5">
                      <span>·</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </aside>
      </div>

      <Modal
        open={showPublish}
        onClose={() => setShowPublish(false)}
        title="Publish this workflow?"
        description={
          mode === "sequential"
            ? "Step 1 is invited immediately. Each following step is invited automatically once the one before it completes."
            : "Every signer is invited at once and can complete in any order."
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowPublish(false)}>
              Cancel
            </Button>
            <Button icon="send" loading={publishing} onClick={() => void publish()}>
              Send for signature
            </Button>
          </>
        }
      >
        <ol className="space-y-2.5">
          {recipients.map((person, index) => {
            const color = colorFor(index);
            return (
              <li key={person.key} className="flex items-center gap-3">
                <Avatar
                  initials={(person.name || person.email || "?").slice(0, 2).toUpperCase()}
                  size={32}
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-bold text-on-surface">
                    {person.name || person.email}
                  </div>
                  <div className="truncate text-[11.5px] text-on-surface-variant">{person.email}</div>
                </div>
                <span className={cx("rounded-full px-2.5 py-1 text-[10.5px] font-bold", color.chip)}>
                  {ROLES.find((role) => role.value === person.role)?.label}
                </span>
              </li>
            );
          })}
        </ol>
        <p className="mt-4 flex items-start gap-1.5 rounded-lg bg-surface-container-low p-3 text-[12px] leading-relaxed text-on-surface-variant">
          <Icon name="link" className="mt-px text-[15px]" />
          Each recipient receives a single-use, time-limited link. Nobody needs a DocuRoute
          account to sign.
        </p>
      </Modal>
    </div>
  );
}

/* ------------------------------------------------------------------ pieces */

function MiniButton({
  icon,
  label,
  onClick,
  disabled,
}: {
  icon: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      disabled={disabled}
      title={label}
      aria-label={label}
      className="rounded p-1 text-outline transition-colors hover:bg-surface-container-high hover:text-on-surface disabled:opacity-30 disabled:hover:bg-transparent"
    >
      <Icon name={icon} className="text-[15px]" />
    </button>
  );
}

function UploadDropzone({
  uploading,
  onPick,
  onFile,
}: {
  uploading: boolean;
  onPick: () => void;
  onFile: (file: File) => void;
}) {
  const [over, setOver] = useState(false);
  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setOver(false);
        const file = event.dataTransfer.files?.[0];
        if (file) onFile(file);
      }}
      className={cx(
        "mx-auto grid max-w-lg place-items-center rounded-2xl border-2 border-dashed p-14 text-center transition-all",
        over
          ? "border-primary bg-primary-fixed/40"
          : "border-outline-variant bg-surface-container-lowest",
      )}
    >
      <span className="grid size-16 place-items-center rounded-2xl bg-primary-fixed text-primary">
        <Icon name={uploading ? "cloud_sync" : "cloud_upload"} className="text-[30px]" />
      </span>
      <h3 className="mt-5 text-lg font-extrabold text-on-surface">
        {uploading ? "Uploading…" : "Drop your PDF here"}
      </h3>
      <p className="mt-1.5 max-w-sm text-[13px] leading-relaxed text-on-surface-variant">
        The file goes straight from your browser to storage over a presigned URL. The API records
        its SHA-256 as revision zero.
      </p>
      <Button className="mt-5" icon="folder_open" loading={uploading} onClick={onPick}>
        Choose a file
      </Button>
    </div>
  );
}

function FieldLayer({
  page,
  fields,
  recipients,
  selectedKey,
  locked,
  onSelect,
  onMove,
  onRemove,
  dragState,
}: {
  page: PageBox;
  fields: DraftField[];
  recipients: DraftRecipient[];
  selectedKey: string | null;
  locked: boolean;
  onSelect: (key: string) => void;
  onMove: (key: string, x: number, y: number) => void;
  onRemove: (key: string) => void;
  dragState: React.MutableRefObject<{ key: string; dx: number; dy: number } | null>;
}) {
  return (
    <>
      {fields.map((field) => {
        const color = colorFor(field.recipientIndex);
        const person = recipients[field.recipientIndex];
        const selected = selectedKey === field.key;

        return (
          <div
            key={field.key}
            onPointerDown={(event) => {
              if (locked) return;
              event.stopPropagation();
              onSelect(field.key);
              const host = event.currentTarget.parentElement;
              if (!host) return;
              const rect = host.getBoundingClientRect();
              dragState.current = {
                key: field.key,
                dx: (event.clientX - rect.left) / rect.width - field.x,
                dy: (event.clientY - rect.top) / rect.height - field.y,
              };
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              const drag = dragState.current;
              if (!drag || drag.key !== field.key) return;
              const host = event.currentTarget.parentElement;
              if (!host) return;
              const rect = host.getBoundingClientRect();
              onMove(
                field.key,
                (event.clientX - rect.left) / rect.width - drag.dx,
                (event.clientY - rect.top) / rect.height - drag.dy,
              );
            }}
            onPointerUp={() => {
              dragState.current = null;
            }}
            onClick={(event) => event.stopPropagation()}
            style={{
              left: `${field.x * 100}%`,
              top: `${field.y * 100}%`,
              width: `${field.width * 100}%`,
              height: `${field.height * 100}%`,
              background: color.tint,
              borderColor: color.ring,
              boxShadow: selected ? `0 0 0 2px ${color.ring}` : undefined,
            }}
            className={cx(
              "group absolute flex items-center justify-center rounded border-2 border-dashed",
              locked ? "cursor-default" : "cursor-move",
            )}
          >
            <span
              className="pointer-events-none flex items-center gap-1 truncate px-1 text-[10px] font-bold"
              style={{ color: color.ring }}
            >
              <Icon name={FIELD_META[field.kind].icon} className="text-[12px]" />
              {field.width > 0.12 && (person?.name.split(" ")[0] || FIELD_META[field.kind].label)}
            </span>

            {selected && !locked && (
              <button
                onClick={(event) => {
                  event.stopPropagation();
                  onRemove(field.key);
                }}
                aria-label="Remove field"
                className="absolute -right-2.5 -top-2.5 grid size-5 place-items-center rounded-full bg-error text-on-error shadow-[var(--shadow-card)]"
              >
                <Icon name="close" className="text-[13px]" />
              </button>
            )}
          </div>
        );
      })}
      {page.pageNumber === 0 && null}
    </>
  );
}

function SelectedFieldPanel({
  field,
  recipients,
  locked,
  onChange,
  onRemove,
}: {
  field: DraftField;
  recipients: DraftRecipient[];
  locked: boolean;
  onChange: (patch: Partial<DraftField>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="mt-4 rounded-xl border border-outline-variant bg-surface-container-low p-3.5">
      <div className="mb-3 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[12px] font-extrabold text-on-surface">
          <Icon name={FIELD_META[field.kind].icon} className="text-[16px] text-primary" />
          {FIELD_META[field.kind].label}
        </span>
        <button
          onClick={onRemove}
          disabled={locked}
          className="text-[11px] font-bold text-error hover:underline disabled:opacity-40"
        >
          Remove
        </button>
      </div>

      <div className="space-y-2.5">
        <Select
          label="Assigned to"
          value={String(field.recipientIndex)}
          disabled={locked}
          onChange={(event) =>
            onChange({ recipientIndex: Number((event.target as HTMLSelectElement).value) })
          }
        >
          {recipients.map((person, index) => (
            <option key={person.key} value={index}>
              {index + 1}. {person.name.trim() || person.email || `Recipient ${index + 1}`}
            </option>
          ))}
        </Select>

        <TextField
          label="Label"
          value={field.label}
          disabled={locked}
          onChange={(event) => onChange({ label: event.target.value })}
        />

        <label className="flex cursor-pointer items-center gap-2 text-[12.5px] text-on-surface-variant">
          <input
            type="checkbox"
            checked={field.required}
            disabled={locked}
            onChange={(event) => onChange({ required: event.target.checked })}
            className="size-4 rounded accent-[var(--color-primary)]"
          />
          Required before this signer can submit
        </label>

        <p className="text-[11px] text-outline">
          Page {field.page + 1} · {(field.x * 100).toFixed(1)}%, {(field.y * 100).toFixed(1)}%
        </p>
      </div>
    </div>
  );
}
