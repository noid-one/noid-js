import { NoidAPIError, NoidConnectionError } from '../errors.js';

export interface RequestOptions {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  body?: unknown;
  token?: string;
  timeout?: number;
}

export async function request<T>(baseUrl: string, options: RequestOptions): Promise<T> {
  const url = `${baseUrl}${options.path}`;

  const headers: Record<string, string> = {
    Accept: 'application/json',
  };

  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }

  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: options.method,
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: options.timeout ? AbortSignal.timeout(options.timeout) : undefined,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      throw new NoidConnectionError(`Request timed out after ${options.timeout}ms`, {
        cause: err as Error,
      });
    }
    throw new NoidConnectionError(`Failed to connect to ${baseUrl}`, { cause: err as Error });
  }

  // 204 No Content
  if (response.status === 204) {
    return undefined as T;
  }

  // Parse response body
  const text = await response.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    body = undefined;
  }

  // Error responses
  if (response.status >= 400) {
    const errBody = body as Record<string, unknown> | undefined;
    const errorMessage = errBody?.error ?? errBody?.message ?? (text || `HTTP ${response.status}`);
    throw new NoidAPIError(response.status, String(errorMessage));
  }

  return body as T;
}
