import { AppDetails } from '@decky/ui/dist/globals/steam-client/App';

/**
 * Tries to retrieve the app details from Steam.
 *
 * @param appId id to get details for.
 * @returns AppDetails if succeeded or null otherwise.
 */
export default async function getAppDetails(appId: number): Promise<AppDetails | null> {
  return await new Promise((resolve) => {
    // Millennium: This frontend uses browser timers, not NodeJS.Timeout.
    let timeoutId: ReturnType<typeof setTimeout> | undefined = undefined;
    try {
      const { unregister } = SteamClient.Apps.RegisterForAppDetails(appId, (details: any) => {
        clearTimeout(timeoutId);
        unregister();
        resolve(details);
      });

      timeoutId = setTimeout(() => {
        unregister();
        resolve(null);
      }, 300);
    } catch (error) {
      clearTimeout(timeoutId);
      resolve(null);
    }
  });
}