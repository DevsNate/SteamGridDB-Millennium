import { findModuleExport, getFocusNavController } from 'millennium';
import { useCallback, useEffect, useId, useState } from 'react';
import type { ComponentType, ReactNode } from 'react';

type KeyboardSource = {
  OnKeyDown: EventListener;
  OnKeyUp: EventListener;
  Reset: () => void;
};

type NavigationComponents = {
  Controller: ComponentType<{ controller: unknown; children?: ReactNode }>;
  WindowContext: ComponentType<{ ownerWindow: Window; children?: ReactNode }>;
  Tree: ComponentType<{ navID: string; modal: boolean; 'flow-children': string; style: Record<string, string>; onCancelButton?: () => void; children?: ReactNode }>;
  Keyboard: new (owner: Window) => KeyboardSource;
};

let components: NavigationComponents | undefined;
let warnedMissingNavigation = false;

const getComponents = (): NavigationComponents | undefined => {
  if (components) return components;
  const Controller = findModuleExport((value: unknown) => typeof value === 'function'
    && value.toString().includes('controller:') && value.toString().includes('.Init()')
    && value.toString().includes('.Provider')) as NavigationComponents['Controller'] | undefined;
  const WindowContext = findModuleExport((value: unknown) => typeof value === 'function'
    && value.toString().includes('suppressGamepadInput:')
    && value.toString().includes('.CreateContext(')) as NavigationComponents['WindowContext'] | undefined;
  const Tree = findModuleExport((value: unknown) => {
    const render = (value as { render?: unknown } | null)?.render;
    return typeof render === 'function' && render.toString().includes('parentEmbeddedNavTree:')
      && render.toString().includes('navID:');
  }) as NavigationComponents['Tree'] | undefined;
  const Keyboard = findModuleExport((value: unknown) => typeof value === 'function'
    && typeof value.prototype?.BShouldSwallowEventForTextInputWorkaround === 'function'
    && typeof value.prototype?.TranslateKey === 'function') as NavigationComponents['Keyboard'] | undefined;
  if (Controller && WindowContext && Tree && Keyboard) components = { Controller, WindowContext, Tree, Keyboard };
  return components;
};

const keyboards = new WeakMap<Window, { count: number; release: () => void }>();

export const registerDesktopKeyboard = (owner: Window, Keyboard: NavigationComponents['Keyboard'], controller: {
  RegisterInputSource: (source: KeyboardSource) => () => void;
}): (() => void) => {
  let entry = keyboards.get(owner);
  if (!entry) {
    const source = new Keyboard(owner);
    const unregister = controller.RegisterInputSource(source);
    entry = { count: 0, release: () => {
      source.Reset();
      unregister();
      owner.removeEventListener('keydown', source.OnKeyDown, true);
      owner.removeEventListener('keyup', source.OnKeyUp, true);
      owner.removeEventListener('blur', source.Reset);
    } };
    keyboards.set(owner, entry);
  }
  entry.count++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--entry.count === 0) {
      entry.release();
      keyboards.delete(owner);
    }
  };
};

export const DesktopNavigation = ({ children, modal = false, onCancel }: { children: ReactNode; modal?: boolean; onCancel?: () => void }) => {
  const id = useId();
  const [owner, setOwner] = useState<Window | null>(null);
  const attach = useCallback((node: HTMLDivElement | null) => {
    setOwner(node?.ownerDocument.defaultView ?? null);
  }, []);
  const native = getComponents();
  const controller = getFocusNavController();
  useEffect(() => {
    if (!native || !controller) {
      if (!warnedMissingNavigation) {
        console.warn('[SteamGridDB] Native desktop navigation is unavailable; keeping mouse controls.');
        warnedMissingNavigation = true;
      }
      return;
    }
    if (!owner) return;
    const release = registerDesktopKeyboard(owner, native.Keyboard, controller);
    owner.addEventListener('pagehide', release);
    return () => { owner.removeEventListener('pagehide', release); release(); };
  }, [owner, native, controller]);
  return (
    <div ref={attach} style={{ height: modal ? undefined : '100%', width: '100%' }}>
      {!native || !controller ? children
        : owner && <native.Controller controller={controller}>
          <native.WindowContext ownerWindow={owner}>
            <native.Tree navID={`SteamGridDBDesktop${modal ? 'Dialog' : 'Page'}-${id}`} modal={modal} flow-children="column"
              style={{ height: modal ? 'auto' : '100%', width: '100%' }}
              onCancelButton={onCancel ?? (modal ? undefined : () => owner.close())}>
              {children}
            </native.Tree>
          </native.WindowContext>
        </native.Controller>}
    </div>
  );
};
