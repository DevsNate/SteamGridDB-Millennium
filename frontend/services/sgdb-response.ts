export type SGDBResponse<T> = {
  success: boolean;
  data: T;
  errors?: string[];
};

export function decodeResponse<T>(body: unknown): SGDBResponse<T> {
  if (!body) {
    throw new Error('SteamGridDB returned an empty response.');
  }

  const parsed: unknown = typeof body === 'string' ? JSON.parse(body) : body;
  if (!parsed || typeof parsed !== 'object' || typeof (parsed as SGDBResponse<T>).success !== 'boolean') {
    throw new Error('SteamGridDB returned an invalid response.');
  }
  return parsed as SGDBResponse<T>;
}

export function parseResponse<T>(body: unknown): T {
  const parsed = decodeResponse<T>(body);
  if (!parsed.success) {
    throw new Error(parsed.errors?.join(', ') || 'SteamGridDB API request failed.');
  }

  return parsed.data;
}
