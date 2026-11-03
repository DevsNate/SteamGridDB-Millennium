import { EUIMode, Navigation } from 'millennium';

export const openWebLink = async (url: string): Promise<void> => {
  const target = new URL(url);
  if (target.protocol !== 'https:') throw new Error('Links must use HTTPS.');
  const mode = await SteamClient.UI.GetUIMode();
  if (mode === EUIMode.GamePad) Navigation.NavigateToExternalWeb(target.href);
  else SteamClient.System.OpenInSystemBrowser(target.href);
};
