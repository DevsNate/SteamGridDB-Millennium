// Upstream's images, packed into the .star through
// millennium.toml's [assets] and read once by the backend. These are live
// bindings: importers see the data URLs as soon as loadPluginAssets() resolves.
export let spinnerDataUrl = '';
export let dpadDataUrl = '';
export let defaultAppImageDataUrl = '';

const read = async (name: string) => {
  const result = await backend.read_plugin_asset(name);
  if (!result.success || !result.data_url) throw new Error(result.error || `Could not read ${name}.`);
  return result.data_url;
};

let loading: Promise<void> | undefined;

export const loadPluginAssets = (): Promise<void> => {
  loading ??= Promise.all([
    read('spinner.svg'), read('dpad.svg'), read('defaultappimage.png'),
  ]).then(([spinner, dpad, appImage]) => {
    spinnerDataUrl = spinner;
    dpadDataUrl = dpad;
    defaultAppImageDataUrl = appImage;
  }).catch((error) => {
    // A missing image must not block the page; let a later page open retry.
    loading = undefined;
    console.error('[SteamGridDB] Could not load bundled assets', error);
  });
  return loading;
};
