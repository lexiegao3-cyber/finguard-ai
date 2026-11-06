import type { Analysis, ListItem, Params, Version } from "./types";

const TOKEN_KEY = "finguard.token";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export const tokenStore = {
  get: (): string | null => {
    try {
      return sessionStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set: (token: string | null) => {
    try {
      if (token) sessionStorage.setItem(TOKEN_KEY, token);
      else sessionStorage.removeItem(TOKEN_KEY);
    } catch {
      /* storage unavailable: token lives only in memory for this tab */
    }
  },
};

function describe(detail: unknown): string {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    // FastAPI validation errors: [{loc: [...], msg: "..."}]
    return detail
      .map((d: { loc?: unknown[]; msg?: string }) => `${(d.loc ?? []).slice(1).join(".")}: ${d.msg}`)
      .join("; ");
  }
  return "Request failed";
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = tokenStore.get();
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) tokenStore.set(null);
    throw new ApiError(res.status, describe(body.detail));
  }
  return body as T;
}

export const api = {
  async login(mode: "login" | "register", email: string, password: string) {
    const { access_token } = await request<{ access_token: string }>(`/api/auth/${mode}`, {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    tokenStore.set(access_token);
  },
  me: () => request<{ email: string }>("/api/auth/me"),
  list: (kind?: string, q?: string) => {
    const qs = new URLSearchParams({ limit: "50" });
    if (kind) qs.set("kind", kind);
    if (q) qs.set("q", q);
    return request<{ items: ListItem[]; total: number }>(`/api/analyses?${qs}`);
  },
  get: (id: number) => request<Analysis>(`/api/analyses/${id}`),
  version: (id: number, v: number) => request<Version>(`/api/analyses/${id}/versions/${v}`),
  create: (title: string, params: Params) =>
    request<Analysis>("/api/analyses", { method: "POST", body: JSON.stringify({ title, params }) }),
  rerun: (id: number, params: Params) =>
    request<Version>(`/api/analyses/${id}/versions`, { method: "POST", body: JSON.stringify({ params }) }),
  remove: (id: number) => request<void>(`/api/analyses/${id}`, { method: "DELETE" }),
  export: () => request<unknown>("/api/analyses/export"),
};
