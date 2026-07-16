export type SGDBResponse<T> = {
  success: boolean;
  data: T;
  errors?: string[];
};

export function parseResponse<T>(body: string | false): T {
  if (!body) {
    throw new Error('SteamGridDB returned an empty response.');
  }

  const parsed = JSON.parse(body) as SGDBResponse<T>;
  if (!parsed.success) {
    throw new Error(parsed.errors?.join(', ') || 'SteamGridDB API request failed.');
  }

  return parsed.data;
}
