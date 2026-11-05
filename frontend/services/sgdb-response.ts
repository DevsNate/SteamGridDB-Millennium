export type SGDBResponse<T> = {
  success: boolean;
  data: T;
  errors?: string[];
};

export function decodeResponse<T>(body: unknown): SGDBResponse<T> {
  if (!body) {
    throw new Error('SteamGridDB returned an empty response.');
  }

  let parsed: unknown = body;
  if (typeof body === 'string') {
    try {
      parsed = JSON.parse(body);
    } catch {
      // An error page from SteamGridDB or a proxy, not the API's JSON.
      throw new Error('SteamGridDB returned an unexpected response. Try again later.');
    }
  }
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
