import { ReactRouter, useParams } from 'millennium';
import { createContext, useContext } from 'react';

export const RouteParamsContext = createContext<Record<string, string | undefined>>({});

// Maps route parameters to the SDK hook or the matching hook in current Steam's router.
const useSteamRouteParams: <T>() => Partial<T> = useParams
  ?? Object.values(ReactRouter ?? {}).find((value) => /return (\w+)\?\1\.params:\{\}/.test(`${value}`)) as (<T>() => T) | undefined
  ?? (() => ({}));

export const useRouteParams = <T>(): Partial<T> => {
  const params = useSteamRouteParams<T>();
  const overrides = useContext(RouteParamsContext);
  return { ...params, ...overrides };
};
