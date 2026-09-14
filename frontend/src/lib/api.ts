import { env } from "./env";
import { getAccessToken } from "./supabase";
import type {
  AuditResponse,
  ChainReport,
  DashboardStats,
  DocumentDetail,
  DocumentSummary,
  Paginated,
  ServerConfig,
  SigningSession,
  UploadTicket,
  UserProfile,
  WorkflowPlan,
  WorkflowPlanInput,
} from "./types";

export class ApiError extends Error {
  status: number;
  errors: Record<string, string[]>;

  constructor(status: number, detail: string, errors: Record<string, string[]> = {}) {
    super(detail);
    this.name = "ApiError";
    this.status = status;
    this.errors = errors;
  }

  /** Flatten field errors into something a toast can show. */
  get summary(): string {
    const first = Object.values(this.errors).flat()[0];
    return first || this.message;
  }
}

type RequestOptions = {
  method?: string;
  body?: unknown;
  auth?: boolean;
  signal?: AbortSignal;
};

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, auth = true, signal } = options;
  const headers: Record<string, string> = { Accept: "application/json" };

  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (auth) {
    const token = await getAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(`${env.apiBaseUrl}${path}`, {
      method,
      headers,
      signal,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "Could not reach the DocuRoute API. Is the server running?");
  }

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  const payload = text ? safeJson(text) : null;

  if (!response.ok) {
    throw new ApiError(
      response.status,
      (payload?.detail as string) || `Request failed (${response.status}).`,
      (payload?.errors as Record<string, string[]>) || {},
    );
  }
  return payload as T;
}

function safeJson(text: string): Record<string, unknown> | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function query(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  const out = search.toString();
  return out ? `?${out}` : "";
}

export const api = {
  config: () => request<ServerConfig>("/config/", { auth: false }),

  // --- account ----------------------------------------------------------
  me: () => request<UserProfile>("/me/"),
  updateMe: (patch: Partial<Pick<UserProfile, "full_name" | "job_title">>) =>
    request<UserProfile>("/me/", { method: "PATCH", body: patch }),
  updateOrganization: (name: string) =>
    request<UserProfile>("/me/organization/", { method: "PATCH", body: { name } }),

  // --- documents --------------------------------------------------------
  stats: () => request<DashboardStats>("/dashboard/stats/"),
  listDocuments: (params: { status?: string; search?: string; page?: number; ordering?: string } = {}) =>
    request<Paginated<DocumentSummary>>(`/documents/${query(params)}`),
  getDocument: (id: string) => request<DocumentDetail>(`/documents/${id}/`),
  createDocument: (title: string) =>
    request<DocumentDetail>("/documents/", { method: "POST", body: { title } }),
  renameDocument: (id: string, title: string) =>
    request<DocumentDetail>(`/documents/${id}/`, { method: "PATCH", body: { title } }),
  deleteDocument: (id: string) => request<void>(`/documents/${id}/`, { method: "DELETE" }),

  uploadTicket: (id: string, file: { filename: string; content_type: string; size_bytes: number }) =>
    request<UploadTicket>(`/documents/${id}/upload-url/`, { method: "POST", body: file }),
  attachUpload: (id: string, storage_path: string, filename: string) =>
    request<DocumentDetail>(`/documents/${id}/attach/`, {
      method: "POST",
      body: { storage_path, filename },
    }),
  downloadUrl: (id: string, variant: "auto" | "original" | "executed" = "auto") =>
    request<{ url: string; expires_in: number; sha256: string; filename: string }>(
      `/documents/${id}/download-url/${query({ variant })}`,
    ),

  sendDocument: (id: string) =>
    request<{ invited: number; delivered: number; document: DocumentDetail }>(
      `/documents/${id}/send/`,
      { method: "POST" },
    ),
  voidDocument: (id: string, reason: string) =>
    request<DocumentDetail>(`/documents/${id}/void/`, { method: "POST", body: { reason } }),

  // --- workflow ---------------------------------------------------------
  getWorkflow: (documentId: string) => request<WorkflowPlan>(`/documents/${documentId}/workflow/`),
  saveWorkflow: (documentId: string, plan: WorkflowPlanInput) =>
    request<WorkflowPlan>(`/documents/${documentId}/workflow/`, { method: "PUT", body: plan }),
  resendInvitation: (documentId: string, recipientId: string) =>
    request<{ delivered: boolean }>(
      `/documents/${documentId}/recipients/${recipientId}/resend/`,
      { method: "POST" },
    ),

  // --- audit ------------------------------------------------------------
  audit: (documentId: string) => request<AuditResponse>(`/documents/${documentId}/audit/`),
  verifyChain: (documentId: string) => request<ChainReport>(`/documents/${documentId}/audit/verify/`),

  // --- public signing (token is the credential; never send a bearer) -----
  signingSession: (token: string) =>
    request<SigningSession>(`/sign/${token}/`, { auth: false }),
  submitSigning: (token: string, values: Record<string, string>) =>
    request<{ status: string; session: SigningSession }>(`/sign/${token}/submit/`, {
      method: "POST",
      auth: false,
      body: { values },
    }),
  declineSigning: (token: string, reason: string) =>
    request<{ status: string; session: SigningSession }>(`/sign/${token}/decline/`, {
      method: "POST",
      auth: false,
      body: { reason },
    }),
};

/** Push the file straight to Supabase Storage using the ticket the API signed. */
export async function uploadToStorage(ticket: UploadTicket, file: File): Promise<void> {
  const response = await fetch(ticket.upload_url, {
    method: "PUT",
    headers: { "Content-Type": file.type || "application/pdf" },
    body: file,
  });
  if (!response.ok) {
    throw new ApiError(response.status, `Upload failed (${response.status}). ${await response.text()}`);
  }
}
