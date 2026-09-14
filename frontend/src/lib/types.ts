export type Paginated<T> = {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
};

export type ServerConfig = {
  storage_configured: boolean;
  supabase_configured: boolean;
  email_configured: boolean;
  max_upload_bytes: number;
  signing_token_ttl_hours: number;
};

export type Organization = {
  id: string;
  name: string;
  slug: string;
  created_at: string;
};

export type UserProfile = {
  id: string;
  email: string;
  full_name: string;
  display_name: string;
  initials: string;
  job_title: string;
  avatar_url: string;
  organization: Organization | null;
  last_seen_at: string | null;
  date_joined: string;
};

export type DocumentStatus =
  | "draft"
  | "routing"
  | "completed"
  | "declined"
  | "voided"
  | "expired";

export type RecipientRole = "signer" | "approver" | "viewer";
export type RecipientStatus = "pending" | "sent" | "viewed" | "completed" | "declined";
export type FieldKind = "signature" | "initials" | "date" | "text" | "checkbox";

export type Recipient = {
  id: string;
  order: number;
  name: string;
  email: string;
  role: RecipientRole;
  role_display: string;
  status: RecipientStatus;
  status_display: string;
  initials: string;
  field_count: number;
  sent_at: string | null;
  first_viewed_at: string | null;
  completed_at: string | null;
  decline_reason: string;
  last_ip: string | null;
};

export type DocumentField = {
  id: string;
  recipient: string | null;
  kind: FieldKind;
  label: string;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  required: boolean;
  value: string;
  filled_at: string | null;
  is_filled: boolean;
};

export type WorkflowPlan = {
  id: string;
  name: string;
  mode: "sequential" | "parallel";
  message: string;
  expires_at: string | null;
  reminder_days: number;
  recipients: Recipient[];
  created_at?: string;
  updated_at?: string;
};

export type WorkflowPlanInput = {
  name?: string;
  mode: "sequential" | "parallel";
  message?: string;
  expires_at?: string | null;
  reminder_days?: number;
  recipients: Array<{
    name: string;
    email: string;
    role: RecipientRole;
    order: number;
  }>;
  fields: Array<{
    recipient_index: number;
    kind: FieldKind;
    label?: string;
    page: number;
    x: number;
    y: number;
    width: number;
    height: number;
    required: boolean;
  }>;
};

export type DocumentSummary = {
  id: string;
  title: string;
  filename: string;
  status: DocumentStatus;
  status_display: string;
  owner: UserProfile;
  page_count: number;
  size_bytes: number;
  created_at: string;
  updated_at: string;
  sent_at: string | null;
  completed_at: string | null;
  progress: { completed: number; total: number; percent: number };
  recipient_count: number;
  has_file: boolean;
  current_step: { name: string; email: string; order: number; status: RecipientStatus } | null;
};

export type DocumentRevision = {
  id: string;
  index: number;
  kind: "original" | "executed";
  sha256: string;
  size_bytes: number;
  page_count: number;
  note: string;
  created_at: string;
};

export type DocumentDetail = DocumentSummary & {
  workflow: WorkflowPlan | null;
  fields: DocumentField[];
  revisions: DocumentRevision[];
  original_sha256: string;
  executed_sha256: string;
  content_type: string;
};

export type UploadTicket = {
  upload_url: string;
  token: string;
  storage_path: string;
  method: string;
  headers: Record<string, string>;
};

export type DashboardStats = {
  total: number;
  active: number;
  drafts: number;
  completed: number;
  declined: number;
  pending_approvals: number;
  avg_completion_hours: number | null;
  completion_rate: number;
  recent: DocumentSummary[];
};

export type AuditEvent = {
  id: string;
  seq: number;
  event_type: string;
  event_display: string;
  actor_label: string;
  actor_initials: string;
  ip_address: string | null;
  user_agent: string;
  metadata: Record<string, unknown>;
  revision_sha256: string;
  payload_hash: string;
  prev_hash: string;
  chain_hash: string;
  created_at: string;
};

export type AuditResponse = {
  document: {
    id: string;
    title: string;
    filename: string;
    status: DocumentStatus;
    status_display: string;
    original_sha256: string;
    executed_sha256: string;
    created_at: string;
    completed_at: string | null;
  };
  events: AuditEvent[];
};

export type ChainReport = {
  valid: boolean;
  checked: number;
  total: number;
  broken_at: number | null;
  head_hash?: string;
  reason: string;
};

export type SigningSession = {
  document: {
    id: string;
    title: string;
    filename: string;
    page_count: number;
    status: DocumentStatus;
    status_display: string;
    sender: string;
    organization: string;
    message: string;
    file_url: string;
  };
  recipient: {
    id: string;
    name: string;
    email: string;
    role: RecipientRole;
    role_display: string;
    status: RecipientStatus;
    order: number;
    completed_at: string | null;
  };
  participants: Array<{
    name: string;
    initials: string;
    role: RecipientRole;
    status: RecipientStatus;
    order: number;
    is_you: boolean;
  }>;
  fields: Array<{
    id: string;
    kind: FieldKind;
    label: string;
    page: number;
    x: number;
    y: number;
    width: number;
    height: number;
    required: boolean;
    value: string;
    is_filled: boolean;
  }>;
  can_sign: boolean;
  blocked_by: { name: string; step: number } | null;
  expires_at: string | null;
};
