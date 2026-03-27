import { setBaseUrl, setAuthTokenGetter } from "@workspace/api-client-react";

let authToken: string | null = null;

export function initApi(domain: string) {
  setBaseUrl(`https://${domain}`);
}

export function setToken(token: string | null) {
  authToken = token;
  setAuthTokenGetter(() => authToken);
}

export async function apiRequest(path: string, options: RequestInit = {}) {
  const baseUrl = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> ?? {}),
  };
  if (authToken) {
    headers["Authorization"] = `Bearer ${authToken}`;
  }

  const res = await fetch(`${baseUrl}/api${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(err.error ?? `Request failed: ${res.status}`);
  }
  return res.json();
}
