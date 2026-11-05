// Lets the artwork page show the API Key setup view: when SteamGridDB rejects the saved Key, or when
// another part of the page (Details) needs a Key and Plugins Hub isn't there to take the user to settings.
type Listener = (rejected: boolean) => void;
const listeners = new Set<Listener>();

export const onApiKeyRejected = (listener: Listener) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

/** Shows the setup view on every open artwork page. False if none is open. */
export const requestApiKeySetup = (rejected: boolean): boolean => {
  for (const listener of [...listeners]) listener(rejected);
  return listeners.size > 0;
};

export const notifyApiKeyRejected = () => { requestApiKeySetup(true); };
