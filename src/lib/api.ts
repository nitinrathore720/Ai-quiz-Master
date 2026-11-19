import { auth } from './firebase';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export const SESSION_STORAGE_KEY = 'aqm_session_token';

export function setClientSessionToken(token: string | null): void {
  try {
    if (token) {
      localStorage.setItem(SESSION_STORAGE_KEY, token);
    } else {
      localStorage.removeItem(SESSION_STORAGE_KEY);
    }
  } catch {
    // ignore storage failures
  }
}

export function getClientSessionToken(): string | null {
  try {
    return localStorage.getItem(SESSION_STORAGE_KEY);
  } catch {
    return null;
  }
}

export async function getAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {};
  const user = auth.currentUser;
  if (user) {
    try {
      const token = await user.getIdToken();
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
        return headers;
      }
    } catch {
      // Fallback to local session token / cookie
    }
  }
  const sessionToken = getClientSessionToken();
  if (sessionToken) {
    headers['Authorization'] = `Bearer ${sessionToken}`;
  }
  return headers;
}

export async function apiFetch<T>(url: string, options: RequestInit = {}): Promise<T> {
  const authHeaders = await getAuthHeaders();
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;

  const res = await fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...authHeaders,
      ...(options.headers || {}),
    },
  });

  const text = await res.text();
  let data: Record<string, unknown> = {};
  try {
    data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    data = { error: text || 'Unexpected server response' };
  }

  if (!res.ok) {
    throw new ApiError(
      typeof data.error === 'string' ? data.error : `Request failed (${res.status})`,
      res.status
    );
  }

  return data as T;
}

export interface QuizStreamEvent {
  type: 'stage' | 'complete' | 'error';
  stage?: string;
  detail?: string;
  error?: string;
  quiz?: unknown;
  questions?: unknown[];
  rejectedCount?: number;
}

export async function generateQuizStream(
  payload: Record<string, unknown>,
  onEvent: (event: QuizStreamEvent) => void
): Promise<void> {
  const authHeaders = await getAuthHeaders();
  const res = await fetch('/api/quizzes/generate', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/x-ndjson',
      ...authHeaders,
    },
    body: JSON.stringify(payload),
  });

  if (!res.body) {
    const fallback = await res.json();
    if (!res.ok) {
      throw new ApiError(fallback.error || 'Quiz generation failed', res.status);
    }
    onEvent({ type: 'complete', ...fallback });
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const parsed = JSON.parse(trimmed) as QuizStreamEvent;
        onEvent(parsed);
      } catch {
        // ignore partial line
      }
    }
  }

  if (buffer.trim()) {
    try {
      const parsed = JSON.parse(buffer.trim()) as QuizStreamEvent;
      onEvent(parsed);
    } catch {
      // ignore
    }
  }
}
