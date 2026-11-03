import {
  PanelSection,
  PanelSectionRow,
  Navigation,
  Field,
  showModal,
  ModalRoot,
  DialogButton,
  DialogBody,
  DialogHeader,
  DialogBodyText,
  ToggleField,
  SliderField,
} from '@decky/ui';
import { FileSelectionType, openFilePicker } from '@decky/api';
// Millennium: Starlight does not define ROLLUP_ENV; use the production environment shim.
import { process } from '../../../frontend/shims/decky-env';
import { useState, useEffect, VFC, useCallback } from 'react';
// Millennium: The social-links section is excluded at the user's request.
import t, { getCredits } from '../../utils/i18n';
import TabSorter from '../TabSorter';
import useSettings, { SettingsProvider } from '../../hooks/useSettings';
import { addHomePatch, removeHomePatch } from '../../patches/homePatch';
import { addSquareLibraryPatch, removeSquareLibraryPatch } from '../../patches/squareLibraryPatch';
import { addCapsuleGlowPatch } from '../../patches/capsuleGlowPatch';
import { DIMENSIONS } from '../../constants';
import { appgridClasses } from '../../static-classes';

// Millennium: The guide video is removed at the user's request.

const tabSettingsDesc = t('MSG_ASSET_TAB_SETTINGS_DESC', 'Reorder or hide unused tabs, and set the default tab that opens when using "{ACTION_CHANGE_ARTWORK}"').replace('{ACTION_CHANGE_ARTWORK}', t('ACTION_CHANGE_ARTWORK', 'Change Artwork...'));
const squareGridSizes = DIMENSIONS.grid_p.options.filter((x) => {
  const [w,h] = x.value.split('x');
  return w === h;
}).map((x) => x.value);

// Set square/uniform featured game using logic written at 3am
const setPatches = (squares: boolean, uniformFeatured: boolean): void => {
  if (!uniformFeatured && !squares) {
    removeHomePatch();
  } else if (squares || uniformFeatured) {
    // Remove the home patch then patch it again
    removeHomePatch();
    addHomePatch(false, squares, uniformFeatured);
    if (squares) {
      addSquareLibraryPatch();
    }
  }
  if (!squares) {
    removeSquareLibraryPatch();
  }
};

const QuickAccessSettings: VFC = () => {
  const { get, set } = useSettings();
  const [useCount, setUseCount] = useState<number | null>(null);
  const [squares, setSquares] = useState<boolean>(false);
  const [uniformFeatured, setUniformFeatured] = useState<boolean>(false);
  const [capsuleGlowAmount, setCapsuleGlowAmount] = useState(100);
  const [hideAuthors, setHideAuthors] = useState(true); // Millennium: Hide Authors setting, on by default.
  const [debugAppid] = useState('70');

  const handleSquareToggle = useCallback(async (checked: boolean) => {
    set('squares', checked, true);
    setSquares(checked);
    setPatches(checked, uniformFeatured);

    const currentFilters = await get('filters_grid_p', {});
    if (checked) {
      // only enable square
      currentFilters['dimensions'] = squareGridSizes;
    } else {
      // set to default
      currentFilters['dimensions'] = DIMENSIONS.grid_p.default;
    }
    set('filters_grid_p', currentFilters, true);
  }, [get, set, uniformFeatured]);

  const handleUniformFeaturedToggle = useCallback(async (checked: boolean) => {
    set('uniform_featured', checked, true);
    setUniformFeatured(checked);
    setPatches(squares, checked);
  }, [set, squares]);

  const handleCapsuleGlowChange = useCallback(async (val: number) => {
    set('capsule_glow_amount', val, true);
    addCapsuleGlowPatch(val);
    setCapsuleGlowAmount(val);
  }, [set]);

  // Millennium: Hide Authors setting.
  const handleHideAuthorsToggle = useCallback((checked: boolean) => {
    set('hide_authors', checked, true);
    setHideAuthors(checked);
  }, [set]);

  const handleSetUseCount = useCallback(async (val: number) => {
    set('plugin_use_count', val, false);
    setUseCount(val);
  }, [set]);

  useEffect(() => {
    (async () => {
      setUseCount(await get('plugin_use_count', 0));
      setSquares(await get('squares', false));
      setUniformFeatured(await get('uniform_featured', false));
      setCapsuleGlowAmount(await get('capsule_glow_amount', 100));
      setHideAuthors(await get('hide_authors', true)); // Millennium: Hide Authors setting, on by default.
    })();
  }, [get]);

  if (useCount === null) return null;

  return (
    <>
      {process.env.ROLLUP_ENV === 'development' && (
        <PanelSection title="Debug">
          <PanelSectionRow>
            <Field
              padding="none"
              childrenContainerWidth="max"
            >
              <DialogButton onClick={() => {
                Navigation.Navigate('/zoo');
                Navigation.CloseSideMenus();
              }}
              >
              Zoo
              </DialogButton>
              <DialogButton onClick={() => {
                Navigation.Navigate(`/steamgriddb/${debugAppid}/manage`);
                Navigation.CloseSideMenus();
              }}
              >
                {debugAppid}
              </DialogButton>
              <DialogButton onClick={() => {
                // for debugging reasons do not panic
                set('motd_last_fetched', 0, true);
                setTimeout(() => {
                  set('motd_cached', null, true);
                  setTimeout(() => {
                    set('motd_hidden', null, true);
                  }, 300);
                }, 300);
              }}
              >
              Reset MOTD
              </DialogButton>
              <SliderField
                label="plugin_use_count"
                notchCount={2}
                showValue
                notchTicksVisible={false}
                onChange={handleSetUseCount}
                value={useCount}
                editableValue
                min={0}
                max={1337}
                step={1}
                resetValue={0}
              />
              <DialogButton onClick={() => {
                openFilePicker(
                  FileSelectionType.FOLDER,
                  '/',
                  false,
                  true
                );
              }}
              >
              directory picker
              </DialogButton>
            </Field>
          </PanelSectionRow>
        </PanelSection>
      )}
      {/* Millennium: Asset Tab Settings take the place of the guide video. */}
      <PanelSection>
        <PanelSectionRow>
          <Field childrenLayout="below" description={tabSettingsDesc}>
            <DialogButton
              onClick={() => {
                showModal((
                  <ModalRoot>
                    <SettingsProvider>
                      <DialogHeader>
                        {t('LABEL_SETTINGS_ASSET_TABS', 'Asset Tab Settings')}
                      </DialogHeader>
                      <DialogBodyText>{tabSettingsDesc}</DialogBodyText>
                      <DialogBody>
                        <TabSorter />
                      </DialogBody>
                    </SettingsProvider>
                  </ModalRoot>
                ));
              }}
            >
              {t('LABEL_SETTINGS_ASSET_TABS', 'Asset Tab Settings')}
            </DialogButton>
          </Field>
        </PanelSectionRow>
      </PanelSection>
      <PanelSection title={t('Settings', 'Settings', true)}>
        {/* Millennium: Hide Authors setting, first and on by default. */}
        <PanelSectionRow>
          <ToggleField
            label="Hide Authors"
            description="Hide the author under each artwork while browsing. Details still shows who made it."
            checked={hideAuthors}
            onChange={handleHideAuthorsToggle}
          />
        </PanelSectionRow>
        <PanelSectionRow>
          <ToggleField
            label={t('LABEL_SQUARE_CAPSULES', 'Square Capsules')}
            description={t('LABEL_SQUARE_CAPSULES_DESC', 'Use square capsules instead of portrait ones. Square filters will be automatically selected.')}
            checked={squares}
            onChange={handleSquareToggle}
          />
        </PanelSectionRow>
        <PanelSectionRow>
          <ToggleField
            label={t('LABEL_UNIFORM_RECENT', 'Matching Recents Capsule')}
            description={t('LABEL_UNIFORM_RECENT_DESC', 'Make the most recently played game on the home screen match the rest of the capsules.')}
            checked={uniformFeatured}
            onChange={handleUniformFeaturedToggle}
          />
        </PanelSectionRow>
        {appgridClasses?.LibraryImageBackgroundGlow && (
          <PanelSectionRow>
            <SliderField
              label={t('LABEL_CAPSULE_GLOW', 'Capsule Glow')}
              description={t('LABEL_CAPSULE_GLOW_DESC', 'Adjust capsule glow intensity in the library.')}
              notchCount={2}
              notchLabels={[
                {
                  notchIndex: 0,
                  label: t('LABEL_CAPSULE_GLOW_OFF', 'None'),
                },
              ]}
              notchTicksVisible={false}
              onChange={handleCapsuleGlowChange}
              value={capsuleGlowAmount}
              min={0}
              max={100}
              step={1}
              resetValue={100}
            />
          </PanelSectionRow>
        )}
        {/* Millennium: Announcements are excluded from this port. */}
      </PanelSection>
      {/* Uncomment this out should there be a need for experiments again. */}
      {/* <PanelSection title="Experiments">
        <div style={{ fontSize: '12px', padding: '12px 0px' }}>Features with little testing that may be too unstable for regular usage and might be removed later. (Requires restart)</div>

      </PanelSection> */}
      {getCredits() && (
        <PanelSection title={t('LABEL_TRANSLATION_CREDIT_TITLE', 'English Translation')}>
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '.25em',
          }}
          >
            {getCredits().map((person: any) => <span key={person}>{person}</span>)}
          </div>
        </PanelSection>
      )}
      {/* Millennium: More SteamGridDB Stuff removed at the user's request. */}
    </>
  );
};

export default QuickAccessSettings;