import { findModuleExport } from 'millennium';
import { cloneElement, createContext } from 'react';
import type { ComponentType, ReactElement, ReactNode } from 'react';
import { desktopDialogStyles } from './styles/dialog';
import { DesktopNavigation } from './navigation';

// Big Picture's root carries these, and much of sp.css (inputs, fields, scrollbars)
// is scoped under them. Desktop windows don't have that root, so our page and
// dialogs carry the classes themselves.
export const bigPictureRootClasses = 'BasicUI GamepadMode';

// True inside dialogs shown in the desktop window, which has no controller footer.
export const DesktopDialogContext = createContext(false);

let nativeProvider: ComponentType<{ children?: ReactNode }> | undefined;

export const BigPicturePresentation = ({ children }: { children?: ReactNode }) => {
  nativeProvider ??= findModuleExport((exported: unknown) => {
    if (typeof exported !== 'function') return false;
    const source = Function.prototype.toString.call(exported);
    return source.includes('.Provider') && source.includes('strButtonClassName:')
      && source.includes('SliderField:') && source.includes('ToggleField:');
  }) as typeof nativeProvider;

  if (!nativeProvider) {
    return <div role="alert">SteamGridDB could not load Steam’s Big Picture controls. Reopen this window after Steam finishes loading.</div>;
  }

  const Provider = nativeProvider;
  return <Provider>{children}</Provider>;
};

let modalPositionProvider: ComponentType<{ children?: ReactNode }> | null | undefined;

// Big Picture renders dialogs in its own ModalPosition, supplied through a
// context. Steam's desktop ModalPosition refocuses itself on every render, which
// closes dropdown menus as soon as they open, and has none of Big Picture's
// frame styling.
const findModalPositionProvider = () => {
  modalPositionProvider ??= (findModuleExport((exported: unknown) => (
    typeof exported === 'function'
    && Function.prototype.toString.call(exported).includes('Provider,{value:{ModalPosition:')
  )) as typeof modalPositionProvider) ?? null;
  return modalPositionProvider;
};

export const BigPictureModal = ({ modal, closeModal }: {
  modal: ReactElement<{ closeModal?: () => void }>;
  closeModal?: () => void;
}) => {
  const ModalPositionProvider = findModalPositionProvider();
  const content = (
    <div className={`sgdbDesktopDialog ${bigPictureRootClasses}`}>
      {cloneElement(modal, { closeModal })}
    </div>
  );

  return (
    <DesktopNavigation modal><BigPicturePresentation>
      <DesktopDialogContext.Provider value>
        <style>{desktopDialogStyles}</style>
        {ModalPositionProvider ? <ModalPositionProvider>{content}</ModalPositionProvider> : content}
      </DesktopDialogContext.Provider>
    </BigPicturePresentation></DesktopNavigation>
  );
};
