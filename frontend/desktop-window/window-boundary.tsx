import { useCallback, useRef } from 'react';
import type { ReactNode } from 'react';
import { desktopPageStyles } from './styles/page';
import { artworkToolbarStyles } from './styles/toolbar';
import { BigPicturePresentation, bigPictureRootClasses } from './big-picture-presentation';
import { isolateFromTheme } from './theme-isolation';
import { dropDesktopUIClass } from './ui-class';
import { observeDesktopHeader } from './header';
import { libraryPreviewStyles } from './styles/library-preview';
import { DesktopNavigation } from './navigation';

const pageWindows = new Map<HTMLElement, Window>();
let lastPageWindow: Window | null = null;

const targetWindow = (target?: EventTarget): Window | null => {
  try {
    const candidate = target as { ownerDocument?: Document; document?: Document } | undefined;
    const owner = candidate?.ownerDocument?.defaultView ?? candidate?.document?.defaultView;
    return owner && !owner.closed ? owner : null;
  } catch {
    return null;
  }
};

export const getPageOwnerWindow = (parent?: EventTarget): Window | null => {
  if (parent && parent !== window) {
    const explicitOwner = targetWindow(parent);
    if (explicitOwner) return explicitOwner;
  }

  const owners = [...new Set(pageWindows.values())].filter((owner) => !owner.closed);
  for (const owner of owners) {
    if (owner.event) return owner;
  }
  for (const owner of owners) {
    if (owner.document.hasFocus()) return owner;
  }
  return owners.includes(lastPageWindow as Window) ? lastPageWindow : owners.at(-1) ?? null;
};

export const registerPageWindow = (node: HTMLElement): (() => void) => {
  const owner = node.ownerDocument.defaultView;
  if (!owner) return () => undefined;

  pageWindows.set(node, owner);
  lastPageWindow = owner;
  const activate = () => { lastPageWindow = owner; };
  const events = ['pointerdown', 'focusin', 'keydown', 'contextmenu'];
  for (const event of events) owner.document.addEventListener(event, activate, true);
  owner.addEventListener('focus', activate);

  const unregister = () => {
    pageWindows.delete(node);
    for (const event of events) owner.document.removeEventListener(event, activate, true);
    owner.removeEventListener('focus', activate);
    owner.removeEventListener('pagehide', unregister);
    if (lastPageWindow === owner && ![...pageWindows.values()].includes(owner)) lastPageWindow = null;
  };
  owner.addEventListener('pagehide', unregister);
  return unregister;
};

export const PageWindowBoundary = ({ desktop = false, children }: { desktop?: boolean; children: ReactNode }) => {
  const release = useRef<(() => void) | undefined>(undefined);
  const attach = useCallback((node: HTMLDivElement | null) => {
    release.current?.();
    if (!node) {
      release.current = undefined;
      return;
    }
    const unregister = registerPageWindow(node);
    const stopHeader = desktop ? observeDesktopHeader(node) : undefined;
    const restoreTheme = desktop ? isolateFromTheme(node.ownerDocument) : undefined;
    const restoreDesktopUI = desktop ? dropDesktopUIClass(node.ownerDocument) : undefined;
    release.current = () => { restoreDesktopUI?.(); restoreTheme?.(); stopHeader?.(); unregister(); };
  }, [desktop]);

  return (
    <div ref={attach} className={desktop ? `sgdbDesktopPage ${bigPictureRootClasses}` : undefined} style={desktop ? undefined : { display: 'contents' }}>
      <style>{artworkToolbarStyles}</style>
      <style>{libraryPreviewStyles()}</style>
      {desktop && <style>{desktopPageStyles}</style>}
      {desktop ? <DesktopNavigation><BigPicturePresentation>{children}</BigPicturePresentation></DesktopNavigation> : children}
    </div>
  );
};
