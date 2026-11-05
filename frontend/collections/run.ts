// Runs rows game by game, two games at a time. Cancelling finishes the games in progress and starts no more.
import type { Row } from './draft';

const GAME_WORKERS = 2;

export async function runRows(
  rows: Row[],
  signal: AbortSignal,
  write: (row: Row) => Promise<void>,
  onResult: (row: Row, error?: string) => void,
): Promise<void> {
  const games = new Map<number, Row[]>();
  for (const row of rows) games.set(row.game.id, [...(games.get(row.game.id) ?? []), row]);
  const queue = [...games.values()];
  let next = 0;
  const worker = async () => {
    while (!signal.aborted && next < queue.length) {
      for (const row of queue[next++]) {
        try {
          await write(row);
          onResult(row);
        } catch (error) {
          onResult(row, error instanceof Error ? error.message : String(error));
        }
      }
    }
  };
  await Promise.all(Array.from({ length: GAME_WORKERS }, worker));
}
