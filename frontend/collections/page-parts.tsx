// The parts every Collections page shares, matching the plugin's artwork tabs.
import { CSSProperties, ReactNode, useEffect, useRef, useState } from 'react';
import { Focusable, SliderField, joinClassNames } from '@decky/ui';
import AdaptiveNavGlyph from '../../src/components/AdaptiveNavGlyph';
import AppGridFilterBar from '../../src/components/AppGridFilterBar';
import { defaultSliderSizes, sliderProps } from '../../src/components/qam-contents/Toolbar';
import { readSetting, writeSetting } from '../settings/store';
import { keepColumn } from './nav';

const B_BUTTON = 1;

/**
 * Whether a page should give focus to its main tile. True once, when the page was opened from another
 * Collections page and its tiles are there. Entering the tab never asks: Steam's tabs handle that.
 */
export function useInitialFocus(opened: boolean, ready: boolean): boolean {
  const pending = useRef(opened);
  useEffect(() => {
    if (ready) pending.current = false;
  }, [ready]);
  return pending.current && ready;
}

/** The same size setting as the artwork tab of this type, so a grid looks alike in both places. */
export function useGridSize(type: SGDBAssetType): [number, (value: number) => void, CSSProperties] {
  const range = sliderProps[type];
  const read = () => {
    const saved = readSetting(`zoomlevel_${type}`, defaultSliderSizes[type]);
    return typeof saved === 'number' && saved >= range.min && saved <= range.max ? saved : defaultSliderSizes[type];
  };
  const [size, setSize] = useState(read);
  useEffect(() => setSize(read()), [type]);
  const percent = 100 / (range.max - size + range.min);
  return [
    size,
    value => {
      setSize(value);
      void writeSetting(`zoomlevel_${type}`, value);
    },
    { gridTemplateColumns: `repeat(auto-fill, minmax(calc(${percent}% - .65em), 1fr))` },
  ];
}

/** The size slider only comes with a grid. */
export function PageToolbar({ type, size, onSize, children }: {
  type?: SGDBAssetType;
  size?: number;
  onSize?(value: number): void;
  children: ReactNode;
}) {
  return (
    <Focusable className="sgdb-asset-toolbar" flow-children="row" {...keepColumn}>
      <Focusable className="filter-buttons" {...keepColumn}>{children}</Focusable>
      {type && size !== undefined && (
        <SliderField
          className="size-slider"
          value={size}
          layout="below"
          bottomSeparator="none"
          onChange={onSize}
          {...sliderProps[type]}
        />
      )}
    </Focusable>
  );
}

/** The line above a grid, as on the artwork tabs. Here it says where you are and takes you back. */
export function PageBar({ children, onBack }: { children: ReactNode; onBack?(): void }) {
  return (
    <AppGridFilterBar className="sgdb-collection-bar" data-back={onBack ? true : undefined} onClick={onBack}>
      {children}
      {onBack && <AdaptiveNavGlyph button={B_BUTTON} bAllowKeyboard />}
    </AppGridFilterBar>
  );
}

export function PageSpinner({ loading }: { loading: boolean }) {
  return (
    <div className={joinClassNames('spinnyboi', !loading ? 'loaded' : '')}>
      <img alt="Loading..." src="/images/steam_spinner.png" />
    </div>
  );
}
