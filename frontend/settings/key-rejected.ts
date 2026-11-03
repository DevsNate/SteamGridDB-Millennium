// Lets the artwork page show the API Key setup view when SteamGridDB rejects the saved Key.
const listeners = new Set<() => void>();

export const onApiKeyRejected = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

export const notifyApiKeyRejected = () => {
  for (const listener of [...listeners]) listener();
};
