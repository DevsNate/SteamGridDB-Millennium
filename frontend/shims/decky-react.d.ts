import type * as React from 'react';

declare module 'react' {
  // Millennium: Retain React 18's VFC spelling using the installed React 19 component type.
  export type VFC<Props = {}> = React.FunctionComponent<Props>;

  // Millennium: React 18's no-argument refs start undefined; React 19 requires an explicit overload.
  export function useRef<Value = undefined>(): React.RefObject<Value | undefined>;
}

declare global {
  namespace JSX {
    // Millennium: react-markdown 8 and upstream use the pre-React-19 global JSX namespace.
    interface IntrinsicElements extends React.JSX.IntrinsicElements {}
  }
}
