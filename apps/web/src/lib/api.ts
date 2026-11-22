import type { AuthSession } from '../types';

const API_URL = import.meta.env.VITE_API_URL ?? '/api';
let accessToken: string | null = null;
let refreshRequest: Promise<AuthSession> | null = null;

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export async function refreshSession(): Promise<AuthSession> {
  if (!refreshRequest) {
    refreshRequest = fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    })
      .then(async (response) => {
        if (!response.ok) throw new ApiError('Your session has expired', response.status);
        return (await response.json()) as AuthSession;
      })
      .then((session) => {
        accessToken = session.accessToken;
        return session;
      })
      .finally(() => {
        refreshRequest = null;
      });
  }
  return refreshRequest;
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
  retry = true,
): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
    credentials: 'include',
  });

  if (response.status === 401 && retry && !path.startsWith('/auth/')) {
    try {
      await refreshSession();
      return apiRequest<T>(path, options, false);
    } catch {
      accessToken = null;
    }
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as
      | { message?: string | string[] }
      | null;
    const rawMessage = body?.message;
    const message = Array.isArray(rawMessage)
      ? rawMessage.join(', ')
      : rawMessage ?? `Request failed with status ${response.status}`;
    throw new ApiError(message, response.status, body);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const api = {
  get: <T>(path: string) => apiRequest<T>(path),
  post: <T>(path: string, body?: unknown) =>
    apiRequest<T>(path, {
      method: 'POST',
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  patch: <T>(path: string, body: unknown) =>
    apiRequest<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string) => apiRequest<T>(path, { method: 'DELETE' }),
};
