import {
  afterPatch as clientAfterPatch,
  DialogButton as ClientDialogButton,
  findModule,
  findSP as clientFindSP,
  showModal as clientShowModal,
  showContextMenu as clientShowContextMenu,
} from 'millennium';
import type {
  DialogButtonProps,
  DialogCheckboxProps as ClientDialogCheckboxProps,
  Export,
  GenericPatchHandler,
  Patch,
  PatchOptions,
  TabsProps as ClientTabsProps,
  useParams as ClientUseParams,
} from 'millennium';
import type { ComponentType, ReactElement, RefAttributes } from 'react';
import { BigPictureModal } from '../../desktop-window/big-picture-presentation';
import { useRouteParams } from '../../steam/route-params';
import { NativeTabs } from '../../steam/tabs';
import { getSteamBigPictureWindow } from '../../steam/windows';
import { getPageOwnerWindow } from '../../desktop-window/window-boundary';
import { DesktopNavigation } from '../../desktop-window/navigation';

export {
  ConfirmModal,
  ControlsList,
  DialogBody,
  DialogBodyText,
  DialogButtonPrimary,
  DialogCheckbox,
  DialogControlsSection,
  DialogControlsSectionHeader,
  DialogFooter,
  DialogHeader,
  Dropdown,
  EUIMode,
  Field,
  Focusable,
  IconsModule,
  Marquee,
  Menu,
  MenuItem,
  ModalRoot,
  Navigation,
  PanelSection,
  PanelSectionRow,
  ProgressBar,
  ReorderableList,
  SliderField,
  Spinner,
  TextField,
  ToggleField,
  appDetailsHeaderClasses,
  callOriginal,
  createModuleMapping,
  definePlugin,
  fakeRenderComponent,
  findClassModule,
  findInReactTree,
  findInTree,
  findModule,
  findModuleByExport,
  joinClassNames,
  quickAccessMenuClasses,
  replacePatch,
  wrapReactType,
} from 'millennium';
export type {
  Export,
  FocusableProps,
  FooterLegendProps,
  GamepadEvent,
  Module,
  Patch,
  ReorderableEntry,
  SliderFieldProps,
  TextFieldProps,
} from 'millennium';
// Millennium: Preserve Decky's route hook signature while using the working Steam hook.
export const useParams = useRouteParams as typeof ClientUseParams;
export type TabsProps = ClientTabsProps & { onCancelFromTabHeader?(): void; wrapAround?: boolean };

// Millennium: Decky's checkbox props reserve onSelect for consumer callbacks, not DOM selection events.
export type DialogCheckboxProps = Omit<ClientDialogCheckboxProps, 'onSelect'>;

// Millennium: Steam's button supports the div ref used by Decky's toolbar; the SDK omits that prop.
export const DialogButton = ClientDialogButton as ComponentType<DialogButtonProps & RefAttributes<HTMLDivElement>>;

// Millennium: Use the SDK's generic handler for dynamically discovered upstream patch targets.
export const afterPatch = clientAfterPatch as <
  Object extends Patch['object'],
  Property extends keyof Object,
  Target extends Object[Property],
>(object: Object, property: Property, handler: GenericPatchHandler, options?: PatchOptions) => Patch<Object, Property, Target>;

// Maps Decky's Tabs props to Steam's native tabs without Decky's router dependency.
export function Tabs(props: TabsProps) {
  return <NativeTabs {...props} tabs={props.tabs.map((tab) => ({ ...tab, footer: tab.footer && { ...tab.footer } }))} />;
}

export const showModal: typeof clientShowModal = (modal, parent, props) => {
  const owner = getPageOwnerWindow(parent) ?? parent ?? findSP();
  const ownerWindow = owner as Window;
  const desktop = Boolean(ownerWindow.document?.querySelector('.sgdbDesktopPage'));
  if (!desktop || props?.bForcePopOut) return clientShowModal(modal, owner, props);

  const wrap = (content: typeof modal) => {
    const element = content as ReactElement<{ closeModal?: () => void }>;
    return <BigPictureModal modal={element} closeModal={element.props.closeModal} />;
  };
  const result = clientShowModal(wrap(modal), owner, { ...props, strTitle: undefined, bNeverPopOut: true });
  return { ...result, Close: () => result.Close(), Update: (content) => result.Update(wrap(content)) };
};

export const showContextMenu: typeof clientShowContextMenu = (children, parent, options) => {
  const owner = parent && parent !== window ? parent : getPageOwnerWindow(parent) ?? findSP();
  const candidate = owner as Window & { ownerDocument?: Document };
  const doc = candidate.ownerDocument ?? candidate.document;
  if (!doc?.querySelector('.sgdbDesktopPage')) return clientShowContextMenu(children, owner, options);
  let menu: ReturnType<typeof clientShowContextMenu> | undefined;
  menu = clientShowContextMenu(
    <DesktopNavigation modal onCancel={() => menu?.Hide()}>{children}</DesktopNavigation>, owner, options,
  );
  return menu;
};

// Maps export filters to the SDK's module scan, always supplying the export name.
export function findModuleExport(filter: (exported: Export, name: string) => boolean, minExports?: number): Export | undefined {
  let found: Export | undefined;
  findModule((module: unknown) => {
    if (!module || typeof module !== 'object') return false;
    const exports = module as Record<string, Export>;
    if (minExports && Object.keys(exports).length < minExports) return false;
    for (const name in exports) {
      try {
        if (exports[name] && filter(exports[name], name)) {
          found = exports[name];
          return true;
        }
      } catch {}
    }
    return false;
  });
  return found;
}

// Maps Decky's findSP to the live page owner, retaining the SDK/BPM fallback
// when no page is mounted. The SDK's root_1_ lookup can throw in Big Picture.
export function findSP(): Window {
  const owner = getPageOwnerWindow();
  if (owner) return owner;
  try {
    const sp = clientFindSP();
    if (sp) return sp;
  } catch {}
  return getSteamBigPictureWindow() ?? window;
}
