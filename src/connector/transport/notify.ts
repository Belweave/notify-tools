// SPDX-License-Identifier: Apache-2.0

export async function notifyRequest<T>(
  apiUrl: string,
  token: string,
  path: string,
  init: RequestInit,
  fetchImpl: typeof fetch,
): Promise<{ status: number; body: T }> {
  const response = await fetchImpl(new URL(path, apiUrl).href, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/json",
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const body = (await response.json().catch(() => ({}))) as T & {
    error?: string;
  };
  if (!response.ok) {
    throw new Error(body.error ?? `Notify request failed (${response.status})`);
  }
  return { status: response.status, body };
}
