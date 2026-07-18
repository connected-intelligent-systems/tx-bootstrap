import type {
  Participant,
  ParticipantCreateInput,
  ParticipantInvite,
  ParticipantOrganizationUpdate,
  TechnicalMetadataUpdate,
} from "@/shared/api";

const adminBaseUrl = "/api/admin/participants";

type JsonBody = Record<string, unknown>;

export interface ParticipantFilters {
  search?: string;
  status?: string;
  sort?: "created_at" | "updated_at" | "legal_name";
  order?: "asc" | "desc";
  limit?: number;
  offset?: number;
}

export async function listParticipants(
  filters?: ParticipantFilters,
): Promise<Participant[]> {
  const queryParams = new URLSearchParams();
  if (filters?.search) queryParams.set("search", filters.search);
  if (filters?.status) queryParams.set("status", filters.status);
  if (filters?.sort) queryParams.set("sort", filters.sort);
  if (filters?.order) queryParams.set("order", filters.order);
  if (filters?.limit !== undefined)
    queryParams.set("limit", String(filters.limit));
  if (filters?.offset !== undefined)
    queryParams.set("offset", String(filters.offset));

  const url = queryParams.toString()
    ? `${adminBaseUrl}?${queryParams}`
    : adminBaseUrl;
  return request<Participant[]>(url);
}

export async function getParticipant(id: string): Promise<Participant> {
  return request<Participant>(`${adminBaseUrl}/${encodeURIComponent(id)}`);
}

export async function createParticipant(
  body: ParticipantCreateInput,
): Promise<ParticipantInvite> {
  return request<ParticipantInvite>(adminBaseUrl, { method: "POST", body });
}

export async function updateParticipantOrganization(
  id: string,
  body: ParticipantOrganizationUpdate,
): Promise<Participant> {
  return request<Participant>(
    `${adminBaseUrl}/${encodeURIComponent(id)}/organization`,
    {
      method: "PATCH",
      body,
    },
  );
}

export async function retryTechnicalSetup(id: string): Promise<Participant> {
  return request<Participant>(
    `${adminBaseUrl}/${encodeURIComponent(id)}/retry-technical-setup`,
    { method: "POST" },
  );
}

export async function updateTechnicalMetadata(
  id: string,
  body: TechnicalMetadataUpdate,
): Promise<Participant> {
  return request<Participant>(
    `${adminBaseUrl}/${encodeURIComponent(id)}/technical-metadata`,
    {
      method: "PATCH",
      body,
    },
  );
}

async function request<T>(
  url: string,
  options: { method?: string; body?: JsonBody } = {},
): Promise<T> {
  const hasBody = options.body !== undefined;
  const response = await fetch(url, {
    method: options.method ?? "GET",
    headers: {
      Accept: "application/json",
      ...(hasBody ? { "Content-Type": "application/json" } : {}),
    },
    body: hasBody ? JSON.stringify(options.body) : undefined,
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : undefined;
  if (!response.ok) throw new Error(payload?.error ?? response.statusText);
  return payload as T;
}
