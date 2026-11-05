import { DialogButton, findModuleByExport, Focusable, GamepadButton } from 'millennium';
import type { ComponentType, ReactNode } from 'react';

export type NativeTab = {
  id: string;
  title: ReactNode;
  /** Steam otherwise treats the title as a localization token. */
  bTitleAlreadyLocalized?: boolean;
  content: ReactNode;
  footer?: Record<string, unknown>;
};

export type NativeTabsProps = {
  activeTab: string;
  onShowTab: (tabId: string) => void;
  tabs: NativeTab[];
  autoFocusContents?: boolean;
  onCancelFromTabHeader?: () => void;
  wrapAround?: boolean;
};

const REACT_MEMO = Symbol.for('react.memo');

const sourceOf = (value: any): string => {
  const fn = value?.type?.render ?? value?.type ?? value;
  try {
    return typeof fn === 'function' ? Function.prototype.toString.call(fn) : '';
  } catch {
    return '';
  }
};

/**
 * Steam's gamepad Tabs (the library page's tab bar) live in the same webpack
 * module as the component with a static `Unbleed`. millennium's Tabs
 * looks for `((function(){` in its source, which current Steam builds no
 * longer emit, and then waits for Decky's router, which stock Millennium
 * never provides. Find it here instead: it is the module's only memo export
 * (a MobX observer) and takes `tabs`/`activeTab`/`onShowTab`.
 */
const findSteamTabs = (): ComponentType<NativeTabsProps> | null => {
  let module: Record<string, unknown> | undefined;
  try {
    module = findModuleByExport((exported: any) => typeof exported?.Unbleed === 'function');
  } catch (err) {
    console.error('[SteamGridDB] Tabs module lookup failed', err);
  }

  const exports = Object.values(module ?? {});
  const memoExports = exports.filter((value: any) => value?.$$typeof === REACT_MEMO);
  const found = (memoExports.length === 1 ? memoExports[0] : undefined)
    ?? exports.find((value) => {
      const source = sourceOf(value);
      return source.includes('autoFocusContents') || (source.includes('tabs:') && source.includes('BIsFeatureBlocked'));
    });

  if (found) return found as ComponentType<NativeTabsProps>;
  console.warn('[SteamGridDB] Steam\'s native Tabs were not found; using the fallback tab bar', {
    moduleFound: Boolean(module),
    exportCount: exports.length,
    memoExportCount: memoExports.length,
  });
  return null;
};

let steamTabs: ComponentType<NativeTabsProps> | null | undefined;

// Looked up on first use rather than at plugin load, when Steam's modules
// may still be loading.
const getSteamTabs = () => {
  if (steamTabs === undefined) {
    steamTabs = findSteamTabs();
  }
  return steamTabs;
};

const FallbackTabs = ({ activeTab, onShowTab, tabs }: NativeTabsProps) => {
  const index = Math.max(0, tabs.findIndex((tab) => tab.id === activeTab));
  const handleBumper = (event: CustomEvent<{ button: number }>) => {
    const step = event.detail.button === GamepadButton.BUMPER_LEFT ? -1
      : event.detail.button === GamepadButton.BUMPER_RIGHT ? 1
        : 0;
    if (step && tabs.length > 1) {
      onShowTab(tabs[(index + step + tabs.length) % tabs.length].id);
    }
  };

  return (
    <Focusable className="sgdbFallbackTabs" onButtonDown={handleBumper}>
      <Focusable className="sgdbFallbackTabRow" flow-children="row">
        {tabs.map((tab) => (
          <DialogButton
            key={tab.id}
            className={tab.id === activeTab ? 'selected' : undefined}
            onClick={() => onShowTab(tab.id)}
          >
            {tab.title}
          </DialogButton>
        ))}
      </Focusable>
      {tabs[index]?.content}
    </Focusable>
  );
};

export const NativeTabs = (props: NativeTabsProps) => {
  const SteamTabs = getSteamTabs();
  return SteamTabs ? <SteamTabs {...props} /> : <FallbackTabs {...props} />;
};
