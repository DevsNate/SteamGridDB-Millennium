import {
  DialogButton,
  ReorderableList,
  Marquee,
  ReorderableEntry,
  Focusable,
  EUIMode, // Millennium: The desktop gets mouse controls.
} from '@decky/ui';
import {
  useEffect,
  useMemo,
  useState,
  FC,
  useCallback,
  useRef,
} from 'react';
import { HiEyeSlash, HiEye, HiHome, HiChevronUp, HiChevronDown } from 'react-icons/hi2';

import log from '../utils/log';
import { tabStrs, DEFAULT_TABS } from '../constants';
import useSettings from '../hooks/useSettings';
import t from '../utils/i18n';

type TabEntryData = {
  type: SGDBAssetType,
}

const buttonStyle = {
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  padding: '10px',
  maxWidth: '40px',
  minWidth: 'auto',
  marginLeft: '.5em',
};

const Interactables: FC<{
  entry: ReorderableEntry<TabEntryData>,
  defaultTab: SGDBAssetType | null,
  hiddenTabs: (SGDBAssetType | undefined)[] | null,
  onDefaultClick: (entry: ReorderableEntry<TabEntryData>) => void,
  onHideClick: (entry: ReorderableEntry<TabEntryData>) => void,
  onMove?: (entry: ReorderableEntry<TabEntryData>, offset: number) => void, // Millennium: Desktop only.
}> = ({ entry, defaultTab, hiddenTabs, onDefaultClick, onHideClick, onMove }) => {
  const [shakeHidden, setShakeHidden] = useState(false);
  const isHidden = hiddenTabs?.includes(entry.data?.type);

  useEffect(() => {
    if (shakeHidden) {
      const timeout = setTimeout(() => {
        setShakeHidden(false);
      }, 400); // animation plays for 200ms and repeats twice, so 400ms is enough
      return () => clearTimeout(timeout);
    }
    return undefined;
  }, [shakeHidden]);

  if (!entry.data) return null;
  // Millennium: onClick instead of onOKButton, so the mouse works too (Steam turns A into a click). Stopping the click
  // keeps it from reaching the list, where a click toggles reorder mode.
  const click = (action: () => void) => (evt?: { stopPropagation?: () => void }) => {
    evt?.stopPropagation?.();
    action();
  };
  return (
    <>
      {onMove && (
        <>
          <DialogButton onClick={click(() => onMove(entry, -1))} style={buttonStyle} aria-label="Move up">
            <HiChevronUp />
          </DialogButton>
          <DialogButton onClick={click(() => onMove(entry, 1))} style={buttonStyle} aria-label="Move down">
            <HiChevronDown />
          </DialogButton>
        </>
      )}
      {(defaultTab !== entry.data.type) ? (
        <DialogButton
          onClick={click(() => onDefaultClick(entry))}
          style={buttonStyle}
        >
          <HiHome />
        </DialogButton>
      ) : (
        // Millennium: A disabled, see-through button rather than a div, so it sizes like its neighbours (the desktop's
        // button font is smaller than the row's, and buttonStyle is in em). It takes no focus, like the div.
        <DialogButton disabled focusable={false} style={{ ...buttonStyle, background: 'transparent', boxShadow: 'none', opacity: 1, cursor: 'default' }}>
          <HiHome fill="#008ada" />
        </DialogButton>
      )}
      <DialogButton
        onOKActionDescription={isHidden ? 'Show' : t('Button_Hide', 'Hide', true)}
        onClick={click(() => {
          if (!entry.data) return;

          if (
            hiddenTabs &&
            !isHidden &&
            hiddenTabs.length === DEFAULT_TABS.length - 1
          ) {
            setShakeHidden(true);
          } else {
            onHideClick(entry);
          }
        })}
        style={shakeHidden ? {
          ...buttonStyle,
          ...{ animation: '200ms sgdb-button-shake 2' },
        } : buttonStyle}
      >
        {isHidden ? <HiEye /> : <HiEyeSlash />}
      </DialogButton>
    </>
  );
};

const TabSorter = () => {
  const { set, get } = useSettings();
  const [defaultTab, setDefaultTab] = useState<SGDBAssetType | null>(null);
  const [hiddenTabs, setHiddenTabs] = useState<SGDBAssetType[] | null>(null);
  const [tabPositions, setTabPositions] = useState<SGDBAssetType[] | null>(null);
  const fieldRef = useRef<HTMLDivElement>(null);
  const once = useRef(false);
  // Millennium: The list reorders with the D-pad only, and a click toggles reorder mode. On the desktop that leaves
  // the mouse with nothing to do, so clicks don't toggle it there and each row gets move buttons instead.
  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    void SteamClient.UI.GetUIMode().then((mode: EUIMode) => setDesktop(mode !== EUIMode.GamePad));
  }, []);

  const tabEntries: ReorderableEntry<TabEntryData>[] = useMemo(() => {
    if (tabPositions === null || hiddenTabs === null) return [];
    return tabPositions.map((type, i) => ({
      label: (
        <Marquee
          style={{
            maxWidth: '340px',
            opacity: hiddenTabs.includes(type) ? .5 : 1,
          }}
        >
          {tabStrs[type]}
        </Marquee>
      ) as unknown as string,
      data: { type },
      position: i,
    }));
  }, [tabPositions, hiddenTabs]);

  const handleSave = (entries: ReorderableEntry<TabEntryData>[]) => {
    log('tab list', entries);
    const sortedTabs = entries.map((entry: ReorderableEntry<TabEntryData>) => entry.data?.type);
    set('tabs_order', sortedTabs, true);
    setTabPositions(sortedTabs as SGDBAssetType[]);
  };

  // Millennium: The desktop's move buttons.
  const handleMove = useCallback((entry: ReorderableEntry<TabEntryData>, offset: number) => {
    setTabPositions((positions) => {
      const from = positions && entry.data ? positions.indexOf(entry.data.type) : -1;
      const to = from + offset;
      if (!positions || from < 0 || to < 0 || to >= positions.length) return positions;
      const moved = [...positions];
      [moved[from], moved[to]] = [moved[to], moved[from]];
      set('tabs_order', moved, true);
      return moved;
    });
  }, [set]);

  const handleHideClick = useCallback((entry: ReorderableEntry<TabEntryData>) => {
    setHiddenTabs((x) => {
      if (entry.data && x) {
        const v = [...x];
        if (v.includes(entry.data.type)){
          v.splice(v.indexOf(entry.data.type), 1);
        } else {
          v.push(entry.data.type);
        }
        set('tabs_hidden', v, true);
        return v;
      }
      return null;
    });
  }, [set]);

  const handleDefaultClick = useCallback((entry: ReorderableEntry<TabEntryData>) => {
    if (entry.data) {
      set('tab_default', entry.data.type, true);
      setDefaultTab(entry.data.type);
    }
  }, [set]);

  useEffect(() => {
    (async () => {
      const positions: SGDBAssetType[] = await get('tabs_order', DEFAULT_TABS);
      const hidden: SGDBAssetType[] = await get('tabs_hidden', []);
      let tabDefault = await get('tab_default', 'grid_p');
      const filtered = positions.filter((x) => !hidden.includes(x));
      setTabPositions(positions);
      setHiddenTabs(hidden);
      // Set first tab as default if default is hidden
      if (!filtered.includes(tabDefault)) {
        tabDefault = filtered[0];
      }
      setDefaultTab(tabDefault);
    })();
  }, [get]);

  useEffect(() => {
    // hack to auto focus first element after render
    if (tabEntries.length > 0 && defaultTab && !once.current) {
      fieldRef.current?.querySelector('button')?.focus();
      once.current = true;
    }
  }, [tabEntries, defaultTab]);

  return (
    <>
      <style>{`
        @keyframes sgdb-button-shake {
          0% { transform: translateX(0) }
          25% { transform: translateX(3px) }
          50% { transform: translateX(-3px) }
          75% { transform: translateX(3px) }
          100% { transform: translateX(0) }
        }
      `}</style>
      <Focusable ref={fieldRef}>
        {/* Millennium: On the desktop a click outside the row buttons stops here, before the list turns it into reorder mode. */}
        <div onClickCapture={desktop ? (evt) => { if (!(evt.target as Element).closest('button, .DialogButton')) evt.stopPropagation(); } : undefined}>
        <ReorderableList
          animate
          entries={tabEntries}
          onSave={handleSave}
          interactables={(props) => (
            <Interactables
              {...props}
              defaultTab={defaultTab}
              hiddenTabs={hiddenTabs}
              onDefaultClick={handleDefaultClick}
              onHideClick={handleHideClick}
              onMove={desktop ? handleMove : undefined}
            />
          )}
        />
        </div>
      </Focusable>
    </>
  );
};

TabSorter.displayName = 'TabSorter';

export default TabSorter;