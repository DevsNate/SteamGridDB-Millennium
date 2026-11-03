// Settings live in Millennium's plugin config (config.json, plugins.steamgriddb.config).
// They're loaded once at startup into a cache, so the library patches and
// upstream's get_setting can read them synchronously afterwards. The API Key is
// not a setting: it stays in the backend, because config reaches the frontend.
import { pluginConfig, subscribePluginConfig } from 'millennium';

type SettingListener = (key: string, value: unknown) => void;

const values = new Map<string, unknown>();
const listeners = new Set<SettingListener>();
let loading: Promise<void> | undefined;

const notify = (key: string, value: unknown) => listeners.forEach((listener) => listener(key, value));

export function loadSettings(): Promise<void> {
  loading ??= pluginConfig.getAll().then((stored) => {
    for (const [key, value] of Object.entries(stored ?? {})) values.set(key, value);
    // Millennium echoes changes from the backend or another context, never our own writes.
    subscribePluginConfig((key, value) => {
      if (value === null) values.delete(key);
      else values.set(key, value);
      notify(key, value);
    });
  }).catch((error) => {
    console.error('[SteamGridDB] Settings could not be loaded; using defaults.', error);
    loading = undefined;
  });
  return loading;
}

export function readSetting(key: string, fallback: unknown): unknown {
  return values.has(key) ? values.get(key) : fallback;
}

export async function writeSetting(key: string, value: unknown): Promise<void> {
  if (value === undefined) throw new Error('A setting needs a JSON value.');
  // The SDK types the value as a string, but config takes any JSON value.
  await (pluginConfig.set as (key: string, value: unknown) => Promise<void>)(key, value);
  values.set(key, value);
  notify(key, value);
}

// Lets an open artwork page follow a setting changed in the settings panel.
export function onSettingChanged(listener: SettingListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
