export const styles = `
/* Application shell, popouts, and window chrome ------------------------ */
.sgdbRoot {
  position: relative;
  height: 100%;
  min-height: 0;
  margin-top: var(--basicui-header-height, 40px);
  padding: 0;
  --sgdb-bg: #121212;
  --sgdb-bg-paint: var(--sgdb-bg);
  --sgdb-bg-deep: rgb(var(--dark-14, 5, 8, 11));
  --sgdb-bg-mid: rgb(var(--dark-19, 7, 13, 18));
  --sgdb-surface: rgb(var(--dark-20, 16, 24, 32));
  --sgdb-panel: rgba(var(--fluenty-gray-1e, 30, 30, 30), 0.94);
  --sgdb-panel-solid: rgb(var(--fluenty-gray-1e, 30, 30, 30));
  --sgdb-control: rgba(var(--fluenty-gray-2b, 43, 43, 43), 0.52);
  --sgdb-surface-hover: #1e1e1e;
  --sgdb-overlay: rgba(var(--fluenty-black, 0, 0, 0), 0.42);
  --sgdb-text: rgb(var(--fluenty-gray-f3, 243, 245, 247));
  --sgdb-text-strong: rgb(var(--fluenty-gray-f7, 247, 249, 251));
  --sgdb-text-muted: #9a9a9a;
  --sgdb-text-control: #b8b8b8;
  --sgdb-border: #333333;
  --sgdb-border-soft: #2c2c2c;
  --sgdb-grid-hover-border: #ffffff;
  --sgdb-grid-hover-border-visible: color-mix(in srgb, var(--sgdb-grid-hover-border) 58%, transparent);
  --sgdb-accent: var(--accent-col, #1a9fff);
  --sgdb-accent-soft: var(--accent-secondary, #8fcfff);
  --sgdb-accent-text: #07111d;
  --sgdb-noise: url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAACXBIWXMAAAABAAAAAQBPJcTWAAAAIGNIUk0AAHomAACAhAAA+gAAAIDoAAB1MAAA6mAAADqYAAAXcJy6UTwAAAU6SURBVHicTZeJUsIwEIaTEhC8EfX9X8NHEm+sCIKN8639Os1Mp5Ds8e+ZbX54eCjT6TSxaq1psVikx8fHdHJykm5ubupms8mz2Szt9/uUcw4aVtd18f/8/Dz9/Pyk4/GYrq6u0m63S03TpO/v76DljczD4RD0p6enIauUkiaTSSowIuDs7CwYf39/02q1Csa2bTNMCJ3P5wmgCFosFnW73WYEf3x8pIuLi5CBYGUBEODws1CIDPgxjjfyCij4gWIYUcwej8JkxCJo9/t95hxaQLNQBg1ytJA9eL++vgbj4Mdo+AFZQI+FKNNN2+02XAUzRCh2HwH8R4CC4BMQSqETCGGBHhpAQcMZstFZIAId7uQAhbpaL/BwhkKE8KAEwQpHoDnC+eXlZfBhvVazz9uQlVJqERkWbzabEECMPj8/QyggEAwN4YCeB+DX19cBGHCG0pjjVX5zZsIBGg+5V0rJhQ1QmdUmCYD6hAtgegZGhJP9JhdnyGCNKwrPcs5Cth7Sa23bpmKGq4Cnd08Q4kIAiRo6wPHWE8vlMspVT6CIfZ77+/uwHEOIv9URCVjKfw4QL+ucAxiIky7FAxCb3QDGA+v1OsBMJpPMHha/v78HCM7hDyv72GOQucJZgMA6vKDFMENk6bFADzF70PAbHoSgFI8BGqXL5TK8Ba+h4T90lrLlHB6AyXp+enoKbyAE18PMf6vDOFsdeoXkxBOAwiCFmzvIIKl5y89CB42oTqfT6HgIsgT1iI2JPRMWpYbHRkRJ0R0Rihy8xgIYyqG1WxJe5EWSrtfrDJFlhgIOrAiYTCysMXlcdriu6yIPKE2bGt5FHm/vCGRZogHAy8QyESmHVoUxHFk7XEgkGedYrNsxxJoHlMo1Eh68G0mNAvOADWMEo8K9oLz1ZrNZpYm8vr4OzQkas3zcCVFuKRMKHs7RG7Qo87Jgw0QbZznMWIR3+gSMmsdClGKA4eHBC4YNEHrNHBrnV0GwFwvxe3t7Gy4lrfFeMObQco7bbTqAVY7XsHmEHJuUb++eAkKSkGW22tdRhicG4v4isqbt8bZdlI/B8sZ7litNiv/QPz8/RzUUFDJUoAQwxlG3OTjwGCostOdbKezZ1lEGYPKAcNhtb29vI5TmRCQhihGKFwSAMNsnhCwbj93QxmKiYUg/lNT5fB79wOoiUZETMS9lCF9UhvVoHEEOSi8oCG2fAHLY0FKE4konHJoaiu2gKDYkKoeedyRk27a11ppJwPHoRAmaWDBaZgAilvy/u7sLekCNyxfhdlCver3Zl2ylkgKUTLrY3o11Dh+4G/eCHOX8tnfwBozJ6/Cix3C/Uxerb0JD9y1mMcJA6AiuMM4gRrFXrvMfwl9eXgYvqUTXe5t6s5IrzAfIdw4tXhqr1aoej8esAgX5G+tBb8vFK+aKVnvdAs7Zj7B6kVnG3hVxazL7990sg5r2CmNfGRErEPORwoVjZjsV2WwcwzhHjrG3n3iJmbj9IJMKtYk11q7tsm8o2WQEqAmKAPg48x7gjVAe9m1g9BiAES55LfWYlkwwr2HnP2d+u6BDia6jk9lBDRU8TlN+qPjdIXhv2WHM77rOkqlN08Rg4uBoPthyVWLMrW2HmPHU5Og2Hlo01FzCKzGWN01TD4dD1KW17vTiBGuZ4jFGNpsSFmqAk5VlqPekdYqCf5DZ/A+V2bjDyOeUngGAHxN+AVs5gDG+u90ukhkemppXOrT0CpLbr2T1RCs2KZxuIbJ0sE7Fjmb8tquZI+O+YVXg5v688jHrWMaCnjwhh/4Alxekc0HT9AYAAAAASUVORK5CYII=');
  background: var(--sgdb-bg-paint);
  overflow-x: hidden;
  box-sizing: border-box;
  overscroll-behavior: contain;
  box-shadow: 0 calc(-1 * var(--basicui-header-height, 40px)) 0 var(--sgdb-bg);
  --asset-columns: 4;
}

.sgdbRoot::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 0;
  background: var(--sgdb-noise);
  opacity: 0.24;
  pointer-events: none;
}

.sgdbRoot > * {
  position: relative;
  z-index: 1;
}

.sgdbRoot div[class*="gamepadtabbedpage_TabHeaderRowWrapper"][class*="gamepadtabbedpage_Floating"],
.sgdbRoot div[class*="gamepadtabbedpage_TabHeaderRowWrapper"] {
  background: transparent;
}

body:has(#sgdb-wrap:not(.sgdbSettingsRoot)),
body:has(#sgdb-wrap:not(.sgdbSettingsRoot)) [class*="FullModal"],
body:has(#sgdb-wrap:not(.sgdbSettingsRoot)) [class*="DialogContent"],
body:has(#sgdb-wrap:not(.sgdbSettingsRoot)) [class*="GamepadDialogContent"],
body:has(#sgdb-wrap:not(.sgdbSettingsRoot)) [class*="ModalPosition"] {
  background: var(--sgdb-bg) !important;
}

.sgdbRoot.sgdbSettingsRoot {
  margin-top: 0;
  background: transparent !important;
  box-shadow: none;
}

.sgdbRoot.sgdbSettingsRoot::before {
  display: none;
}

body:has(#sgdb-wrap.sgdbSettingsRoot),
body:has(#sgdb-wrap.sgdbSettingsRoot) * {
  scrollbar-width: none;
}

body:has(#sgdb-wrap.sgdbSettingsRoot)::-webkit-scrollbar,
body:has(#sgdb-wrap.sgdbSettingsRoot) *::-webkit-scrollbar {
  display: none !important;
  width: 0 !important;
  height: 0 !important;
}

body:has(#sgdb-wrap.sgdbDesktopToolbar.sgdbPopoutContent) [class*="FullModal"],
body:has(#sgdb-wrap.sgdbDesktopToolbar.sgdbPopoutContent) [class*="DialogContent"],
body:has(#sgdb-wrap.sgdbDesktopToolbar.sgdbPopoutContent) [class*="ModalPosition"] {
  background: transparent !important;
}

.sgdbDesktop {
  margin-top: 0;
  background: var(--sgdb-bg-paint);
}

.sgdbDesktopToolbar {
  position: relative;
  box-shadow: 0 calc(-1 * var(--basicui-header-height, 40px)) 0 var(--sgdb-bg);
  background: var(--sgdb-bg-paint);
}

.sgdbPopoutContent {
  display: flex;
  flex-direction: column;
  height: 100vh;
  margin-top: 0;
  padding: 0;
  overflow: hidden;
  box-shadow: inset 0 0 0 1px var(--sgdb-border);
  background: var(--sgdb-bg-paint);
}

.sgdbBigPicture.sgdbPopoutContent {
  padding-top: var(--sgdb-big-picture-header-height, var(--basicui-header-height, 40px));
}

.sgdbRoot.sgdbBigPicture.sgdbPopoutContent .sgdbGamepadTabs {
  top: var(--sgdb-big-picture-header-height, var(--basicui-header-height, 40px));
}

.sgdbDesktopToolbar.sgdbPopoutContent {
  background: transparent;
}

.sgdbDesktopToolbar.sgdbPopoutContent .tabcontents-wrap {
  background: var(--sgdb-bg-paint);
}

.sgdbPopoutContent .tabcontents-wrap {
  flex: 1 1 auto;
  min-height: 0;
  padding: 0 8px 12px;
  overflow-y: auto;
  scrollbar-gutter: stable;
  box-sizing: border-box;
  background: var(--sgdb-bg);
}

.sgdbDesktopToolbar.sgdbPopoutContent .tabcontents-wrap {
  padding-top: 0;
}

.sgdbPopoutContent .tabcontents-wrap::-webkit-scrollbar {
  width: 10px;
}

.sgdbPopoutContent .tabcontents-wrap::-webkit-scrollbar-button {
  display: none;
  width: 0;
  height: 0;
}

.sgdbDesktopToolbar.sgdbPopoutContent .tabcontents-wrap::-webkit-scrollbar-button:vertical:start:decrement {
  display: block;
  width: 10px;
  height: 64px;
  background: transparent;
}

.sgdbPopoutContent .tabcontents-wrap::-webkit-scrollbar-track {
  margin-top: 8px;
  margin-bottom: 8px;
  background: transparent;
}

.sgdbDesktopToolbar.sgdbPopoutContent .tabcontents-wrap::-webkit-scrollbar-track {
  margin-top: 8px;
}

.sgdbPopoutContent .tabcontents-wrap::-webkit-scrollbar-thumb {
  min-height: 48px;
  border: 2px solid transparent;
  border-radius: 999px;
  background: color-mix(in srgb, var(--sgdb-text-muted) 28%, transparent);
  background-clip: padding-box;
}

.sgdbPopoutContent .tabcontents-wrap:hover::-webkit-scrollbar-thumb {
  background: color-mix(in srgb, var(--sgdb-text-muted) 62%, transparent);
  background-clip: padding-box;
}

.sgdbPopoutContent .tabcontents-wrap::-webkit-scrollbar-thumb:hover {
  background: color-mix(in srgb, var(--sgdb-text) 78%, transparent);
  background-clip: padding-box;
}

body:has(#sgdb-wrap) button[aria-label="Close"],
body:has(#sgdb-wrap) button[title="Close"],
body:has(#sgdb-wrap) [class*="CloseButton"],
body:has(#sgdb-wrap) [class*="closeButton"] {
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  min-width: 46px !important;
  min-height: 36px !important;
  position: relative !important;
  z-index: 20 !important;
  color: var(--sgdb-text-control) !important;
  background: transparent !important;
  box-shadow: none !important;
}

body:has(#sgdb-wrap) .title-bar-actions.window-controls {
  position: relative !important;
  z-index: 20 !important;
}

body:has(#sgdb-wrap) [class*="closeButton"] .title-area-icon-inner,
body:has(#sgdb-wrap) [class*="CloseButton"] .title-area-icon-inner {
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  width: 100% !important;
  height: 100% !important;
}

body:has(#sgdb-wrap) [class*="closeButton"] svg,
body:has(#sgdb-wrap) [class*="CloseButton"] svg {
  width: 16px !important;
  height: 16px !important;
}

body:has(#sgdb-wrap) button[aria-label="Close"]:hover,
body:has(#sgdb-wrap) button[title="Close"]:hover,
body:has(#sgdb-wrap) [class*="CloseButton"]:hover,
body:has(#sgdb-wrap) [class*="closeButton"]:hover {
  color: var(--sgdb-text) !important;
  background: rgba(255, 255, 255, 0.06) !important;
}

/* Artwork-type navigation ---------------------------------------------- */
.sgdbManualTabs {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 30px;
  background: var(--sgdb-surface);
  box-sizing: border-box;
}

.sgdbManualTabs button {
  width: auto;
  min-width: auto;
  padding: 12px 16px;
  border: 1px solid transparent;
  font-weight: 700;
}

.sgdbManualTabs button.selected {
  color: var(--sgdb-text);
  border-color: var(--sgdb-border-soft);
  background: var(--sgdb-surface-hover);
}

.sgdbPopoutContent .sgdbManualTabs {
  position: relative;
  z-index: 3;
  width: calc(100% - 52px);
  min-height: 64px;
  padding-top: 16px;
  padding-bottom: 16px;
  -webkit-app-region: drag;
}

.sgdbPopoutContent .sgdbManualTabs button {
  position: relative;
  z-index: 4;
  -webkit-app-region: no-drag;
}

.sgdbTextPill {
  display: flex;
  position: relative;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border: 1px solid transparent;
  border-radius: 999px;
  clip-path: inset(0 round 999px);
  color: var(--sgdb-text-control);
  background: transparent;
  outline: 0;
  box-shadow: none;
  font-weight: 900;
  line-height: 1;
  text-align: center;
  cursor: pointer;
  box-sizing: border-box;
}

.sgdbTextPill.selected {
  color: var(--sgdb-text-strong);
  border: 1px solid var(--sgdb-border-soft);
  background: var(--sgdb-surface-hover);
  box-shadow: none;
}

.sgdbTextPill::before,
.sgdbTextPill::after,
.sgdbTextPill.selected::before,
.sgdbTextPill.selected::after,
.sgdbTextPill [class*="Focus"],
.sgdbTextPill [class*="focus"],
.sgdbTextPill [class*="Highlight"],
.sgdbTextPill [class*="highlight"] {
  border: 0 !important;
  background: transparent !important;
  box-shadow: none !important;
  outline: 0 !important;
}

.sgdbTextPill.gpfocus,
.sgdbTextPill:focus-visible {
  outline: 0 !important;
  box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.58);
  border-radius: 999px !important;
  clip-path: inset(0 round 999px) !important;
}

.sgdbTextPill.selected.gpfocus,
.sgdbTextPill.selected:focus-visible {
  box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.58);
}

.sgdbTextPill.gpfocus::before,
.sgdbTextPill.gpfocus::after,
.sgdbTextPill:focus-visible::before,
.sgdbTextPill:focus-visible::after,
.sgdbTextPill.gpfocus > *,
.sgdbTextPill:focus-visible > * {
  border-radius: inherit !important;
  outline: 0 !important;
}

.sgdbTextPill.gpfocus:not(.selected),
.sgdbTextPill:focus-visible:not(.selected) {
  background: transparent;
}

.sgdbTextPill.disabled,
.sgdbTextPill:disabled {
  opacity: 0.45;
  cursor: default;
}

.sgdbGamepad .sgdbGamepadTabs {
  --sgdb-tab-vertical-gap: 18px;
  justify-content: center;
  gap: clamp(8px, 1.6vw, 32px);
  min-height: calc(32px + var(--sgdb-tab-vertical-gap));
  padding: var(--sgdb-tab-vertical-gap) clamp(12px, 2.75vw, 56px) 0;
  background: transparent;
  border-bottom: 0;
  scroll-margin-top: 14px;
}

.sgdbGamepad .sgdbGamepadTab {
  width: auto;
  min-width: 0;
  height: 32px;
  margin-top: 0;
  padding: 0 clamp(8px, 0.8vw, 16px);
  border: 1px solid transparent;
  --gpFocusBorderRadius: 999px;
  --focus-ring-border-radius: 999px;
  color: var(--sgdb-text-control);
  background: transparent;
  font-size: 12.75px;
  font-weight: 700;
  letter-spacing: 0.42px;
  text-transform: uppercase;
  -webkit-font-smoothing: antialiased;
  text-rendering: geometricPrecision;
  transition: background 90ms ease, color 90ms ease;
}

.sgdbGamepad .sgdbGamepadTab:nth-child(2) {
  width: auto;
  min-width: 0;
}

.sgdbGamepad .sgdbGamepadTab.selected {
  color: var(--sgdb-text);
  border: 1px solid var(--sgdb-border-soft);
  background: var(--sgdb-surface-hover);
  box-shadow: none;
}

.sgdbGamepad .sgdbGamepadTab.selected.contentFocus {
  color: var(--sgdb-text);
  border: 1px solid var(--sgdb-border-soft);
  background: var(--sgdb-surface-hover);
}

.sgdbGamepad .sgdbGamepadTab:not(.selected):hover,
.sgdbGamepad .sgdbGamepadTab:not(.selected):focus-visible,
.sgdbGamepad .sgdbGamepadTab:not(.selected).gpfocus {
  color: #e0e0e0;
  background: transparent !important;
  box-shadow: none !important;
}

.sgdbGamepad .sgdbGamepadTab.gpfocus,
.sgdbGamepad .sgdbGamepadTab:focus-visible,
.sgdbGamepad .sgdbGamepadTab.gpfocus.selected,
.sgdbGamepad .sgdbGamepadTab:focus-visible.selected {
  outline: 0 !important;
  border-radius: 999px !important;
  box-shadow: none !important;
}

.sgdbGamepad .sgdbGamepadTab *,
.sgdbGamepad .sgdbGamepadTab *::before,
.sgdbGamepad .sgdbGamepadTab *::after {
  border-radius: 999px !important;
}

.sgdbGamepad .sgdbGamepadTab.gpfocus::before,
.sgdbGamepad .sgdbGamepadTab.gpfocus::after,
.sgdbGamepad .sgdbGamepadTab:focus-visible::before,
.sgdbGamepad .sgdbGamepadTab:focus-visible::after,
.sgdbGamepad .sgdbGamepadTab:not(.selected).gpfocus::before,
.sgdbGamepad .sgdbGamepadTab:not(.selected).gpfocus::after,
.sgdbGamepad .sgdbGamepadTab.gpfocus > *,
.sgdbGamepad .sgdbGamepadTab:focus-visible > * {
  border: 0 !important;
  border-radius: 999px !important;
  outline: 0 !important;
  box-shadow: none !important;
}

.sgdbGamepad .sgdbGamepadTab [class*="Focus"],
.sgdbGamepad .sgdbGamepadTab [class*="focus"],
.sgdbGamepad .sgdbGamepadTab [class*="Highlight"],
.sgdbGamepad .sgdbGamepadTab [class*="highlight"],
.sgdbGamepad .sgdbGamepadTab div {
  border-radius: 999px !important;
  clip-path: inset(0 round 999px) !important;
  background: transparent !important;
  box-shadow: none !important;
}

.sgdbGamepad .sgdbGamepadTab.selected.tabFocus:hover,
.sgdbGamepad .sgdbGamepadTab.selected.tabFocus.gpfocus,
.sgdbGamepad .sgdbGamepadTab.selected.tabFocus:focus-visible {
  color: var(--sgdb-text);
  background: var(--sgdb-surface-hover);
  box-shadow: none;
}

.sgdbGamepad .sgdbGamepadTab.selected.contentFocus:hover,
.sgdbGamepad .sgdbGamepadTab.selected.contentFocus.gpfocus,
.sgdbGamepad .sgdbGamepadTab.selected.contentFocus:focus-visible {
  color: var(--sgdb-text);
  background: var(--sgdb-surface-hover);
  box-shadow: none;
}

/* API-key onboarding and plugin settings ------------------------------- */
.sgdbApiKeyFallback {
  flex: 1 1 auto;
  display: grid;
  place-items: center;
  min-height: 0;
  padding: 36px;
  box-sizing: border-box;
}

.sgdbApiKeyFallbackCard {
  width: min(680px, 100%);
  padding: 30px 32px;
  border: 1px solid var(--sgdb-border-soft);
  border-radius: 12px;
  color: var(--sgdb-text);
  background: color-mix(in srgb, var(--sgdb-surface-hover) 78%, var(--sgdb-bg));
  box-shadow: 0 22px 54px rgba(0, 0, 0, 0.34);
  box-sizing: border-box;
}

.sgdbApiKeyFallbackEyebrow {
  margin-bottom: 10px;
  color: var(--sgdb-accent);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 1.25px;
  text-transform: uppercase;
}

.sgdbApiKeyFallbackCard h1 {
  margin: 0 0 10px;
  color: var(--sgdb-text-strong);
  font-size: clamp(24px, 3vw, 32px);
  line-height: 1.15;
}

.sgdbApiKeyFallbackCard p,
.sgdbApiKeyFallbackCard li {
  color: var(--sgdb-text-muted);
  font-size: 15px;
  line-height: 1.55;
}

.sgdbApiKeyFallbackCard p {
  margin: 0;
}

.sgdbApiKeyFallbackCard ol {
  display: grid;
  gap: 8px;
  margin: 20px 0 24px;
  padding-left: 24px;
}

.sgdbApiKeyFallbackCard strong {
  color: var(--sgdb-text);
}

.sgdbApiKeyFallbackActions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.sgdbApiKeyFallbackActions button {
  width: auto;
  min-width: 120px;
}

.sgdbSettingsPage {
  width: min(760px, calc(100% - 10px));
  margin: 12px auto 32px;
  padding-bottom: 6px;
  color: var(--sgdb-text);
  box-sizing: border-box;
}

.sgdbSettingsIntro {
  margin-bottom: 12px;
  padding: 0 2px;
}

.sgdbSettingsIntro h1 {
  margin: 5px 0 6px;
  color: var(--sgdb-text-strong);
  font-size: 26px;
  font-weight: 800;
  letter-spacing: -0.35px;
  line-height: 1.15;
}

.sgdbSettingsIntro p,
.sgdbSettingsCardHeader p {
  margin: 0;
  color: var(--sgdb-text-muted);
  font-size: 13px;
  font-weight: 500;
  line-height: 1.45;
}

.sgdbSettingsEyebrow {
  color: var(--accent-col, #1a9fff);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 1.35px;
  line-height: 1;
  text-transform: uppercase;
}

.sgdbSettingsLayout {
  display: grid;
  gap: 10px;
  margin-top: 10px;
}

.sgdbSettingsCard {
  padding: 13px;
  border: 1px solid rgba(255, 255, 255, 0.075);
  border-radius: 10px;
  background: rgba(var(--dark-20, 16, 24, 32), 0.72);
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.16);
  box-sizing: border-box;
}

.sgdbSettingsCardHeader {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
}

.sgdbSettingsCardHeader > div {
  min-width: 0;
}

.sgdbSettingsCardHeader h2 {
  margin: 5px 0 5px;
  color: var(--sgdb-text-strong);
  font-size: 19px;
  font-weight: 800;
  letter-spacing: -0.15px;
  line-height: 1.2;
}

.sgdbSettingsOption {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  min-height: 54px;
  padding: 7px 0;
  border-top: 1px solid rgba(255, 255, 255, 0.065);
  box-sizing: border-box;
  cursor: pointer;
}

.sgdbSettingsCardHeader + .sgdbSettingsOption {
  margin-top: 9px;
}

.sgdbSettingsOptionCopy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
}

.sgdbSettingsOptionCopy strong {
  color: var(--sgdb-text-strong);
  font-size: 14px;
  font-weight: 700;
  line-height: 1.25;
}

.sgdbSettingsOptionCopy small {
  color: var(--sgdb-text-muted);
  font-size: 11.5px;
  font-weight: 500;
  line-height: 1.35;
}

.sgdbSettingsSwitch {
  position: relative;
  display: inline-flex;
  width: 42px;
  height: 24px;
  flex: 0 0 auto;
}

.sgdbSettingsSwitch input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}

.sgdbSettingsSwitch > span {
  position: absolute;
  inset: 0;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.1);
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.25);
  transition: border-color 140ms ease, background 140ms ease;
}

.sgdbSettingsSwitch > span::after {
  content: '';
  position: absolute;
  top: 3px;
  left: 3px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #d8dee5;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.45);
  transition: transform 140ms ease, background 140ms ease;
}

.sgdbSettingsSwitch input:checked + span {
  border-color: color-mix(in srgb, var(--accent-col, #1a9fff) 75%, white 10%);
  background: var(--accent-col, #1a9fff);
}

.sgdbSettingsSwitch input:checked + span::after {
  background: white;
  transform: translateX(18px);
}

.sgdbSettingsSwitch input:focus-visible + span {
  outline: 2px solid color-mix(in srgb, var(--accent-col, #1a9fff) 72%, white 18%);
  outline-offset: 2px;
}

.sgdbSettingsNumberInput {
  width: 64px;
  height: 36px;
  padding: 0 9px;
  border: 1px solid rgba(255, 255, 255, 0.11);
  border-radius: 6px;
  color: var(--sgdb-text-strong);
  background: rgba(255, 255, 255, 0.08);
  font-size: 14px;
  font-weight: 700;
  box-sizing: border-box;
}

.sgdbSettingsNumberInput:focus,
.sgdbThemePresetSelect:focus,
.sgdbApiKeyInput:focus {
  border-color: var(--accent-col, #1a9fff);
  outline: 1px solid var(--accent-col, #1a9fff);
}

.sgdbSettingsPrimaryButton,
.sgdbSettingsResetButton {
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  color: var(--sgdb-text-strong);
  font-weight: 700;
  cursor: pointer;
}

.sgdbSettingsPrimaryButton {
  min-width: 88px;
  height: 40px;
  padding: 0 18px;
  background: var(--accent-col, #1a9fff);
}

.sgdbSettingsResetButton {
  flex: 0 0 auto;
  height: 30px;
  margin-top: 12px;
  padding: 0 11px;
  background: rgba(255, 255, 255, 0.055);
  font-size: 11px;
}

.sgdbSettingsPrimaryButton:hover,
.sgdbSettingsResetButton:hover {
  filter: brightness(1.12);
}

.sgdbSettingsColorGrid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 6px;
  margin-top: 9px;
}

.sgdbSettingsColorItem {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-height: 44px;
  padding: 7px 9px;
  border: 1px solid rgba(255, 255, 255, 0.065);
  border-radius: 7px;
  color: var(--sgdb-text-strong);
  background: rgba(0, 0, 0, 0.13);
  font-size: 12px;
  font-weight: 650;
  box-sizing: border-box;
  cursor: pointer;
}

.sgdbSettingsResetButton {
  width: auto;
  min-width: 72px;
  height: 30px;
  padding: 0 14px;
  font-size: 12px;
  letter-spacing: 0.5px;
}

.sgdbApiKeyForm {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 6px;
  margin-top: 12px;
}

.sgdbApiKeyActions {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
}

.sgdbApiKeyInput {
  width: 100%;
  min-width: 0;
  height: 40px;
  padding: 0 13px;
  border: 1px solid rgba(255, 255, 255, 0.11);
  border-radius: 6px;
  color: var(--sgdb-text-strong);
  background: rgba(255, 255, 255, 0.08);
  font-family: monospace;
  font-size: 14px;
}

.sgdbApiKeyInput:focus {
  border-color: var(--accent-col, #1a9fff);
  outline: 1px solid var(--accent-col, #1a9fff);
}

.sgdbApiKeyForm button:disabled {
  cursor: default;
  opacity: 0.5;
}

.sgdbApiKeyStatus {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 40px;
  margin: 0;
  color: var(--sgdb-text-muted);
  font-size: 12px;
  font-weight: 700;
  text-align: center;
}

.sgdbApiKeyStatus.configured {
  color: #66c0f4;
}

.sgdbThemePresetSelect {
  min-width: 172px;
  height: 38px;
  padding: 0 34px 0 12px;
  border: 1px solid rgba(255, 255, 255, 0.11);
  border-radius: 6px;
  color: var(--sgdb-text-strong);
  background: rgba(255, 255, 255, 0.08);
  font-size: 14px;
  font-weight: 700;
}

.sgdbThemePresetSelect option {
  color: var(--sgdb-text-strong);
  background: rgb(var(--dark-20, 16, 24, 32));
}

.sgdbSettingsPresetRow {
  grid-template-columns: 1fr;
  gap: 7px;
}

.sgdbThemePresetSelect {
  width: 100%;
}

.sgdbColorControl {
  display: inline-flex;
  align-items: center;
  gap: 7px;
}

.sgdbColorValue {
  min-width: 58px;
  color: var(--sgdb-text-muted);
  font-family: monospace;
  font-size: 11px;
  font-weight: 700;
  text-align: right;
  text-transform: uppercase;
}

.sgdbColorControl input[type="color"] {
  width: 36px;
  height: 30px;
  padding: 0;
  border: 1px solid var(--sgdb-border);
  border-radius: 5px;
  background: var(--sgdb-surface-hover);
  cursor: pointer;
}

.sgdbColorControl input[type="color"]::-webkit-color-swatch-wrapper {
  padding: 3px;
}

.sgdbColorControl input[type="color"]::-webkit-color-swatch {
  border: 0;
  border-radius: 3px;
}

@media (max-width: 560px) {
  .sgdbSettingsPage {
    width: min(100% - 8px, 760px);
    margin-top: 10px;
  }

  .sgdbSettingsIntro h1 {
    font-size: 23px;
  }

  .sgdbSettingsCard {
    padding: 12px;
  }

  .sgdbSettingsPrimaryButton {
    width: auto;
  }

}

@media (max-width: 410px) {
  .sgdbSettingsColorGrid {
    grid-template-columns: 1fr;
  }

  .sgdbSettingsCardHeader {
    gap: 12px;
  }

  .sgdbSettingsOption {
    gap: 12px;
  }
}

/* Native Steam settings components ------------------------------------- */
.sgdbSettingsPage {
  width: auto;
  margin: 8px 0 28px;
  padding: 0;
  color: inherit;
}

.sgdbSettingsPage > * {
  width: auto !important;
  margin-right: 0 !important;
  margin-left: 0 !important;
  padding-right: 0 !important;
  padding-left: 0 !important;
  box-sizing: border-box;
}

.sgdbNativeApiForm {
  display: flex;
  width: 100%;
  min-width: 0;
  flex-direction: column;
  gap: 8px;
  box-sizing: border-box;
}

.sgdbNativeApiForm input {
  max-width: 100%;
  box-sizing: border-box;
}

.sgdbNativeApiActions {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
}

.sgdbNativeApiActions .sgdbApiKeyStatus {
  min-height: 0;
  margin: 0;
  justify-content: flex-start;
  text-align: left;
}

.sgdbNativeApiActions button {
  width: auto !important;
  min-width: 88px;
  height: 36px;
  padding: 0 14px;
}

.sgdbNativeColorRow {
  display: flex;
  width: 100%;
  min-width: 0;
  min-height: 42px;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  color: inherit;
  box-sizing: border-box;
  cursor: pointer;
}

.sgdbNativeColorRow .sgdbColorValue {
  color: rgba(255, 255, 255, 0.56);
}

.sgdbNativeColorRow input[type="color"] {
  background: transparent;
}

.tabcontents-wrap {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  min-height: 100%;
  background: transparent;
}

/* Browser content shell and loading state ------------------------------ */
.sgdbBigPicture .sgdbGamepadTabs + .tabcontents-wrap {
  margin-top: 0;
}

.sgdbPopoutContent .sgdbGamepadTabs + .tabcontents-wrap {
  margin-top: 0;
}

.sgdbDesktopToolbar.sgdbPopoutContent .sgdbGamepadTabs + .tabcontents-wrap {
  margin-top: 0;
}

.sgdbDesktopToolbar.sgdbPopoutContent .sgdbGamepadTabs {
  position: absolute;
  top: 0;
  left: 50%;
  z-index: 5;
  width: max-content;
  max-width: calc(100% - 96px);
  min-height: 56px;
  padding: 0 clamp(10px, 2vw, 28px);
  background: transparent;
  transform: translateX(-50%);
  isolation: isolate;
  pointer-events: none;
}

.sgdbDesktopToolbar.sgdbPopoutContent .sgdbGamepadTabs::before {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  z-index: 0;
  height: 48px;
  border: 0;
  border-radius: 999px;
  background: var(--sgdb-bg);
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.24);
  transform: translateY(-50%);
  pointer-events: none;
}

.sgdbDesktopToolbar.sgdbPopoutContent .sgdbGamepadTab {
  position: relative;
  z-index: 1;
  pointer-events: auto;
}

.sgdbDesktopToolbar.sgdbPopoutContent .sgdb-asset-toolbar {
  margin-top: 0;
  margin-bottom: 0;
}

.spinnyboi {
  display: flex;
  align-items: center;
  justify-content: center;
  position: fixed;
  inset: 0;
  z-index: 10008;
  background: var(--sgdb-bg);
  opacity: 1;
  transition: opacity 250ms ease-out, z-index 0s;
}

.spinnyboi img {
  transform: scale(0.75);
  transition: transform 300ms ease-out;
}

.spinnyboi.loaded {
  z-index: -1;
  opacity: 0;
  pointer-events: none;
  transition-delay: 0ms, 300ms;
}

.spinnyboi.loaded img {
  transform: scale(0.6);
}

/* Filters, density controls, and result status ------------------------- */
.sgdb-asset-toolbar {
  display: flex;
  width: 100%;
  gap: var(--gpSpace-Gap, 0.6em);
  padding: 0 30px;
  box-sizing: border-box;
}

.sgdb-asset-toolbar .filter-buttons {
  display: flex;
  align-items: center;
  gap: 0.5em;
}

.sgdb-asset-toolbar .filter-buttons button {
  min-width: auto;
  white-space: nowrap;
}

.sgdbGamepad .sgdb-asset-toolbar {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: clamp(16px, 2vw, 32px);
  min-height: 50px;
  padding: 0 clamp(18px, 3vw, 46px);
  background: transparent;
  border: 0;
}

.sgdbGamepad .sgdb-asset-toolbar .filter-buttons {
  width: auto;
}

.sgdbGamepad .sgdbFilterMainButton,
.sgdbGamepad .sgdbResetButton {
  width: auto;
  height: 32px;
  min-width: 0;
  padding: 0 16px;
  border: 1px solid transparent;
  border-radius: 999px;
  color: var(--sgdb-text-control);
  background: transparent;
  font-size: 12.75px;
  font-weight: 700;
  letter-spacing: 0.42px;
  text-transform: none;
  -webkit-font-smoothing: antialiased;
  text-rendering: geometricPrecision;
  box-shadow: none;
}

.sgdbGamepad .sgdbFilterMainButton.selected,
.sgdbGamepad .sgdbFilterMainButton:hover,
.sgdbGamepad .sgdbFilterMainButton.gpfocus,
.sgdbGamepad .sgdbFilterMainButton:focus-visible,
.sgdbGamepad .sgdbResetButton:hover,
.sgdbGamepad .sgdbResetButton.gpfocus,
.sgdbGamepad .sgdbResetButton:focus-visible {
  color: var(--sgdb-text);
  border: 1px solid var(--sgdb-border-soft);
  background: var(--sgdb-surface-hover) !important;
  box-shadow: none !important;
}

.sgdbGamepad .sgdbFilterMainButton::before,
.sgdbGamepad .sgdbFilterMainButton::after,
.sgdbGamepad .sgdbResetButton::before,
.sgdbGamepad .sgdbResetButton::after,
.sgdbGamepad .sgdbFilterToggle::before,
.sgdbGamepad .sgdbFilterToggle::after,
.sgdbGamepad .sgdbMoreButton::before,
.sgdbGamepad .sgdbMoreButton::after,
.sgdbDesktopToolbar .sgdbFilterMainButton::before,
.sgdbDesktopToolbar .sgdbFilterMainButton::after,
.sgdbDesktopToolbar .sgdbResetButton::before,
.sgdbDesktopToolbar .sgdbResetButton::after,
.sgdbDesktopToolbar .sgdbFilterToggle::before,
.sgdbDesktopToolbar .sgdbFilterToggle::after {
  border: 0 !important;
  background: transparent !important;
  box-shadow: none !important;
  outline: 0 !important;
}

.sgdbColumnsControl {
  display: flex;
  align-items: center;
  justify-content: center;
  justify-self: center;
  gap: 10px;
  width: max-content;
  min-width: 0;
}

.sgdbColumnsDropdown {
  width: 142px;
  min-width: 142px;
}

.sgdbColumnsDropdown > * {
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
}

.sgdbResetButton {
  display: grid;
  place-items: center;
  height: 32px;
  min-width: 0;
  padding: 0 16px;
  border: 1px solid transparent;
  border-radius: 999px;
  color: var(--sgdb-text-control);
  background: transparent;
  font-size: 12.75px;
  font-weight: 700;
  letter-spacing: 0.42px;
  text-transform: uppercase;
  -webkit-font-smoothing: antialiased;
  text-rendering: geometricPrecision;
  cursor: pointer;
}

.sgdbFilterTray {
  display: flex;
  gap: 8px;
  padding: 10px 30px 0;
  background: transparent;
  box-sizing: border-box;
}

.sgdbGamepad .sgdbGamepadFilterNotice {
  display: flex;
  flex-direction: column;
  gap: 0;
  min-height: 30px;
  padding: 0 42px;
  background: transparent;
  border: 0;
  box-sizing: border-box;
}

.sgdbGamepad .sgdbFilterNoticeHeader {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 12px;
  width: 100%;
}

.sgdbGamepad .sgdbFilterNoticeLine {
  height: 1px;
  background: var(--sgdb-border);
}

.sgdbGamepad .sgdbFilterNoticeText {
  display: flex;
  align-items: center;
  gap: 12px;
  color: rgba(255, 255, 255, 0.78);
  font-size: 16px;
  font-weight: 900;
  letter-spacing: 1.5px;
}

.sgdbGamepad .sgdbFilterNoticeText button {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  min-width: 24px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 50%;
  color: var(--sgdb-accent-text);
  background: var(--sgdb-text);
  font-size: 18px;
  font-weight: 900;
  line-height: 1;
}

.sgdbGamepad .sgdbGamepadFilterToggles {
  display: flex;
  gap: 30px;
  width: 100%;
  justify-content: center;
}

.sgdbGamepad .sgdbFilterToggle {
  flex: 0 0 auto;
  height: 32px;
  min-width: 0;
  padding: 0 16px;
  border: 1px solid transparent;
  color: var(--sgdb-text-control);
  background: transparent;
  font-size: 12.75px;
  font-weight: 700;
  letter-spacing: 0.42px;
  -webkit-font-smoothing: antialiased;
  text-rendering: geometricPrecision;
  box-shadow: none;
}

.sgdbGamepad .sgdbFilterToggle.selected,
.sgdbGamepad .sgdbFilterToggle:hover,
.sgdbGamepad .sgdbFilterToggle.gpfocus,
.sgdbGamepad .sgdbFilterToggle:focus-visible {
  color: var(--sgdb-text);
  border: 1px solid var(--sgdb-border-soft);
  background: var(--sgdb-surface-hover) !important;
  box-shadow: none !important;
}

.sgdbGamepad .sgdbMoreButton {
  width: auto;
  min-width: 92px;
  height: 32px !important;
  min-height: 32px !important;
  flex: 0 0 32px;
  padding: 0 16px;
  border: 1px solid transparent;
  margin: 24px auto 24px;
  color: var(--sgdb-text-control);
  background: transparent;
  font-size: 12.75px;
  font-weight: 700;
  letter-spacing: 0.42px;
  text-transform: uppercase;
  scroll-margin-bottom: 14px;
  -webkit-font-smoothing: antialiased;
  text-rendering: geometricPrecision;
  box-shadow: none;
}

.sgdbGamepad .sgdbMoreButton:hover,
.sgdbGamepad .sgdbMoreButton.gpfocus,
.sgdbGamepad .sgdbMoreButton:focus-visible {
  color: var(--sgdb-text);
  border: 1px solid var(--sgdb-border-soft);
  background: var(--sgdb-surface-hover) !important;
  box-shadow: none !important;
}

.sgdbGamepad .sgdbMoreRevealSpacer {
  flex: 0 0 max(16px, calc(var(--gamepadui-current-footer-height, 24px) / 2));
  width: 100%;
  pointer-events: none;
}

.sgdbResultsState {
  align-self: flex-start;
  margin: 6px 30px 8px;
  padding: 0;
  border: 0;
  color: var(--sgdb-text-muted);
  background: transparent;
  font-size: 16px;
  text-align: left;
  pointer-events: none;
  user-select: none;
}

.sgdbBigPicture .sgdbResultsState {
  position: absolute;
  top: 18px;
  left: 52px;
  z-index: 20;
  display: flex;
  align-items: center;
  height: 32px;
  margin: 0;
}

.sgdbDesktopToolbar .sgdbResultsState {
  position: absolute;
  top: var(--sgdb-tab-vertical-gap, 18px);
  left: 32px;
  z-index: 2;
  display: flex;
  align-items: center;
  height: 32px;
  margin: 0;
}

.sgdbGrid.filtersOpen {
  margin-top: 12px;
}

.sgdbGrid {
  display: grid;
  grid-template-columns: repeat(var(--asset-columns, 4), minmax(0, 1fr));
  padding: var(--sgdb-grid-padding-top, 10px) clamp(12px, 2vw, 32px) max(42px, var(--gamepadui-current-footer-height, 34px));
  row-gap: var(--sgdb-grid-row-gap, clamp(14px, 1.7vw, 28px));
  column-gap: clamp(12px, 1.6vw, 28px);
  width: 100%;
  justify-content: stretch;
  grid-auto-flow: dense;
  box-sizing: border-box;
}

.sgdbGrid.hasMore {
  padding-bottom: 0;
}

.sgdbDesktopToolbar .sgdbGrid {
  justify-content: stretch;
  padding: var(--sgdb-grid-padding-top, 14px) clamp(14px, 2vw, 32px) var(--gamepadui-current-footer-height, 34px);
  row-gap: var(--sgdb-grid-row-gap, clamp(16px, 1.8vw, 30px));
  column-gap: clamp(14px, 1.6vw, 28px);
}

.sgdbPopoutContent .sgdbGrid {
  padding-right: clamp(14px, 2vw, 32px);
  padding-bottom: 18px;
  padding-left: clamp(14px, 2vw, 32px);
}

.sgdbPopoutContent .sgdbMoreButton {
  margin-bottom: 12px;
}

.asset-box-wrap {
  display: flex;
  align-content: flex-start;
  align-items: flex-start;
  flex-wrap: wrap;
  position: relative;
  width: 100%;
  min-width: 0;
  perspective: 900px;
}

/* Artwork cards and actions -------------------------------------------- */
.image-wrap.sgdbAsset {
  --sgdb-action-min: 24px;
  --sgdb-action-fluid: min(13cqw, 9cqh);
  --sgdb-action-max: 38px;
  --sgdb-action-size: clamp(var(--sgdb-action-min), var(--sgdb-action-fluid), var(--sgdb-action-max));
  --sgdb-action-glyph-size: 62%;
  --sgdb-action-corner: 4px;
  position: relative;
  width: 100%;
  margin-top: auto;
  overflow: hidden;
  container-type: size;
  background: url('/images/defaultappimage.png') center center / cover, var(--sgdb-bg-deep);
  cursor: pointer;
  outline: 2px solid transparent;
  border-radius: 3px;
  box-shadow: 0 7px 18px rgba(0, 0, 0, 0.22);
  transition: outline-color ease-in-out 160ms, transform ease-out 160ms, box-shadow ease-out 160ms;
}

.image-wrap.sgdbAsset.type-grid_p {
  --sgdb-action-fluid: min(13cqw, 9cqh);
  padding-bottom: 0 !important;
  aspect-ratio: 2 / 3;
}

.image-wrap.sgdbAsset.type-grid_l {
  --sgdb-action-fluid: min(9cqw, 22cqh);
  --sgdb-action-max: 36px;
  padding-bottom: 0 !important;
  aspect-ratio: 92 / 43;
}

.image-wrap.sgdbAsset.type-hero {
  --sgdb-action-fluid: min(6.5cqw, 22cqh);
  --sgdb-action-max: 36px;
  padding-bottom: 0 !important;
  aspect-ratio: 96 / 31;
}

.image-wrap.sgdbAsset.type-logo,
.image-wrap.sgdbAsset.type-icon {
  box-sizing: border-box;
  background: var(--sgdb-surface-hover);
  border: 1px solid var(--sgdb-border-soft);
}

.image-wrap.sgdbAsset.type-logo {
  --sgdb-action-fluid: min(9cqw, 22cqh);
  --sgdb-action-max: 36px;
  padding-bottom: 0 !important;
  aspect-ratio: 650 / 248;
}

.image-wrap.sgdbAsset.type-icon {
  --sgdb-action-fluid: min(14cqw, 14cqh);
  padding-bottom: 0 !important;
  aspect-ratio: 1 / 1;
}

.sgdbBigPicture .image-wrap.sgdbAsset {
  --sgdb-action-min: 28px;
  --sgdb-action-max: 42px;
}

.image-wrap.sgdbAsset:hover,
.image-wrap.sgdbAsset.gpfocus,
.image-wrap.sgdbAsset:focus-visible {
  z-index: 4;
  outline-color: var(--sgdb-grid-hover-border-visible);
  transform: translate3d(0, -3px, 18px) scale(1.018);
  box-shadow: 0 18px 34px rgba(0, 0, 0, 0.44), 0 0 0 1px rgba(255, 255, 255, 0.16);
}

.sgdbExternalLinkButton,
.sgdbCollectionAddButton {
  width: var(--sgdb-action-size);
  height: var(--sgdb-action-size);
}

.sgdbExternalLinkButton {
  position: absolute;
  left: 0;
  bottom: 0;
  z-index: 4;
  display: grid;
  place-items: center;
  padding: 0;
  border: 1px solid var(--sgdb-border-soft);
  border-left-width: 0;
  border-bottom-width: 0;
  border-radius: 0 var(--sgdb-action-corner) 0 0;
  color: var(--sgdb-text-control);
  background: color-mix(in srgb, var(--sgdb-surface-hover) 88%, transparent);
  box-shadow: none;
  cursor: pointer;
  opacity: 0;
  transform: translateY(6px);
  transition: opacity 120ms ease, transform 120ms ease, background 120ms ease, color 120ms ease;
}

.sgdbCollectionAddButton {
  position: absolute;
  top: 0;
  right: 0;
  z-index: 4;
  display: grid;
  place-items: center;
  padding: 0;
  border: 1px solid var(--sgdb-border-soft);
  border-top-width: 0;
  border-right-width: 0;
  border-radius: 0 0 0 var(--sgdb-action-corner);
  color: var(--sgdb-text-control);
  background: color-mix(in srgb, var(--sgdb-surface-hover) 88%, transparent);
  box-shadow: none;
  cursor: pointer;
  opacity: 0;
  transform: translateY(-6px);
  transition: opacity 120ms ease, transform 120ms ease, background 120ms ease, color 120ms ease;
}

.image-wrap.sgdbAsset:hover .sgdbCollectionAddButton,
.image-wrap.sgdbAsset.gpfocus .sgdbCollectionAddButton,
.image-wrap.sgdbAsset:focus-within .sgdbCollectionAddButton {
  opacity: 1;
  transform: translateY(0);
}

.sgdbCollectionAddButton:hover,
.sgdbCollectionAddButton:focus-visible {
  color: var(--sgdb-text);
  background: var(--sgdb-surface-hover);
  outline: 0;
}

.sgdbCollectionAddIcon,
.sgdbExternalIcon {
  width: var(--sgdb-action-glyph-size);
  height: var(--sgdb-action-glyph-size);
  display: block;
}

.sgdbCollectionAddIcon {
  fill: none;
  stroke: currentColor;
  stroke-width: 2.35;
  stroke-linecap: round;
}

.image-wrap.sgdbAsset:hover .sgdbExternalLinkButton,
.image-wrap.sgdbAsset.gpfocus .sgdbExternalLinkButton,
.image-wrap.sgdbAsset:focus-within .sgdbExternalLinkButton {
  opacity: 1;
  transform: translateY(0);
}

.sgdbExternalLinkButton:hover,
.sgdbExternalLinkButton:focus-visible {
  color: var(--sgdb-text);
  background: var(--sgdb-surface-hover);
  outline: 0;
}

.sgdbExternalIcon {
  overflow: visible;
  fill: none;
  stroke: currentColor;
  stroke-width: 2.35;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.sgdbMedia {
  position: absolute;
  inset: 0;
  width: 100%;
  max-width: 100%;
  max-height: 100%;
  height: 100%;
  object-fit: contain;
  object-position: center center;
  display: block;
  z-index: 1;
  margin: 0 auto;
}

.sgdbMediaBlur {
  z-index: 0;
  object-fit: cover;
  filter: saturate(1.8) blur(18px);
  transform: scale(1.18);
  opacity: 0.32;
}

.sgdbMedia.logo,
.sgdbMedia.icon {
  object-fit: contain;
  height: 100%;
  padding: 16px;
  box-sizing: border-box;
}

.sgdbMediaBlur.logo,
.sgdbMediaBlur.icon {
  display: none;
}

.sgdbAssetMissing,
.sgdbEmpty {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  width: 100%;
  min-height: 96px;
  color: var(--sgdb-text-muted);
}

.sgdbGrid > .sgdbEmpty {
  grid-column: 1 / -1;
}

.author {
  display: flex;
  align-items: center;
  gap: 0.5em;
  width: 100%;
  padding-top: 0.15em;
  color: var(--sgdb-text);
  font-size: 0.65em;
  overflow: hidden;
  text-shadow: 0 1px 1px #000;
}

.author span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sgdbChips {
  position: absolute;
  right: calc(-1 * clamp(5px, min(3.25cqw, 6.25cqh), 10px));
  top: clamp(5px, min(3.25cqw, 6.25cqh), 10px);
  display: flex;
  flex-direction: column;
  gap: clamp(3px, min(1.75cqw, 3.75cqh), 5px);
  z-index: 3;
  pointer-events: none;
}

.sgdbChips span {
  padding: clamp(3px, min(1.75cqw, 3.75cqh), 6px) clamp(6px, min(5cqw, 10cqh), 15px);
  min-height: clamp(14px, min(8.75cqw, 16.25cqh), 28px);
  border-radius: clamp(4px, min(2.75cqw, 6.25cqh), 8px) 0 0 clamp(4px, min(2.75cqw, 6.25cqh), 8px);
  color: white;
  font-size: clamp(8px, min(4.75cqw, 9.25cqh), 15px);
  font-weight: 700;
  text-transform: uppercase;
  transform: translateX(calc(100% - clamp(8px, min(5cqw, 10cqh), 15px)));
  transition: transform 220ms cubic-bezier(0.33, 1, 0.68, 1);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.35);
}

.image-wrap.sgdbAsset:hover .sgdbChips span,
.image-wrap.sgdbAsset.gpfocus .sgdbChips span,
.image-wrap.sgdbAsset:focus-visible .sgdbChips span {
  transform: translateX(0);
}

.sgdbChips .animated {
  background: #e2a256;
}

.sgdbChips .nsfw {
  background: #e5344c;
}

.sgdbChips .humor {
  background: #eec314;
  color: #343434;
}

.sgdbChips .epilepsy {
  background: #735f9f;
}

.dload-overlay {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  opacity: 0;
  z-index: -3;
  background: var(--sgdb-overlay);
  transition: opacity 100ms ease, z-index 0s 100ms;
}

.dload-overlay.downloading {
  opacity: 1;
  z-index: 5;
}

.sgdbApplyStatus {
  display: grid;
  place-items: center;
  width: clamp(34px, min(18cqw, 28cqh), 52px);
  height: clamp(34px, min(18cqw, 28cqh), 52px);
  border-radius: 999px;
  background: rgba(var(--dark-14, 6, 10, 16), 0.82);
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.35);
}

.sgdbApplyStatus svg,
.sgdbApplyStatus img,
.sgdbApplyStatus div {
  max-width: 26px;
  max-height: 26px;
}

/* Desktop and desktop-popout overrides --------------------------------- */
.sgdbDesktop .sgdbManualTabs {
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 52px;
  padding: 8px 24px;
  background: var(--sgdb-bg);
  border-bottom: 1px solid var(--sgdb-border-soft);
  box-sizing: border-box;
}

.sgdbDesktop .sgdbDesktopTab {
  width: 104px;
  height: 36px;
  min-width: 104px;
  border: 1px solid transparent;
  appearance: none;
  -webkit-appearance: none;
  background-clip: padding-box;
  box-sizing: border-box;
  padding: 0 8px;
  font-size: 13px;
  letter-spacing: 1px;
  line-height: 1;
  pointer-events: auto;
  cursor: pointer;
  user-select: none;
}

.sgdbDesktop .sgdbDesktopTab.selected {
  color: var(--sgdb-text);
  border-color: var(--sgdb-border-soft);
  background: var(--sgdb-surface-hover);
}

.sgdbDesktop .sgdbDesktopTab:nth-child(2) {
  width: 148px;
  min-width: 148px;
}

.sgdbDesktop .sgdb-asset-toolbar {
  display: grid;
  grid-template-columns: max-content minmax(420px, 900px) max-content;
  align-items: center;
  gap: 16px;
  justify-content: center;
  min-height: 44px;
  padding: 4px 24px 4px;
  background: var(--sgdb-bg);
}

.sgdbDesktop .sgdb-asset-toolbar .filter-buttons {
  width: auto;
  flex: 0 0 auto;
}

.sgdbDesktop .sgdbFilterMainButton,
.sgdbDesktop .sgdbResetButton {
  width: auto;
  height: 29px;
  min-width: 0;
  padding: 0 19px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 1px;
  text-transform: none;
}

.sgdbDesktop .sgdbFilterTray {
  justify-content: center;
  gap: 10px;
  padding: 8px 24px 0;
}

.sgdbDesktop .sgdbFilterToggle {
  width: auto;
  height: 29px;
  min-width: 0;
  padding: 0 19px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 1px;
  text-transform: none;
}

.sgdbDesktop .sgdbMoreButton {
  width: auto;
  height: 34px !important;
  min-height: 34px !important;
  flex: 0 0 34px;
  min-width: 0;
  margin: 14px auto 18px;
  padding: 0 28px;
  font-size: 13px;
  font-weight: 900;
  letter-spacing: 1.2px;
  text-transform: uppercase;
}

.sgdbDesktopToolbar .sgdb-asset-toolbar {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: clamp(16px, 2vw, 32px);
  justify-content: stretch;
  min-height: 50px;
  padding: 0 clamp(18px, 3vw, 46px);
  background: transparent;
  border: 0;
}

.sgdbDesktopToolbar .sgdb-asset-toolbar .filter-buttons {
  display: flex;
  align-items: center;
  justify-content: center;
  width: auto;
  flex: 0 0 auto;
}

.sgdbDesktopToolbar .sgdbFilterMainButton,
.sgdbDesktopToolbar .sgdbResetButton {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: auto;
  height: 32px;
  min-width: 0;
  padding: 0 16px;
  border: 1px solid transparent;
  border-radius: 999px;
  color: var(--sgdb-text-control);
  background: transparent;
  font-size: 12.75px;
  font-weight: 700;
  letter-spacing: 0.42px;
  line-height: 1;
  text-transform: none;
  box-shadow: none;
}

.sgdbDesktopToolbar .sgdbFilterMainButton.selected,
.sgdbDesktopToolbar .sgdbFilterMainButton:hover,
.sgdbDesktopToolbar .sgdbFilterMainButton:focus-visible,
.sgdbDesktopToolbar .sgdbResetButton:hover,
.sgdbDesktopToolbar .sgdbResetButton:focus-visible {
  color: var(--sgdb-text);
  border: 1px solid var(--sgdb-border-soft);
  background: var(--sgdb-surface-hover) !important;
  box-shadow: none !important;
}

.sgdbDesktopToolbar .sgdbGamepadFilterNotice {
  min-height: 30px;
  padding: 0 42px;
  background: transparent;
}

.sgdbDesktopToolbar .sgdbGamepadFilterToggles {
  justify-content: center;
  gap: 30px;
}

.sgdbDesktopToolbar .sgdbFilterToggle {
  flex: 0 0 auto;
  width: auto;
  height: 32px;
  min-width: 0;
  padding: 0 16px;
  border: 1px solid transparent;
  color: var(--sgdb-text-control);
  background: transparent;
  font-size: 12.75px;
  font-weight: 700;
  letter-spacing: 0.42px;
  box-shadow: none;
}

.sgdbDesktopToolbar .sgdbFilterToggle.selected,
.sgdbDesktopToolbar .sgdbFilterToggle:hover,
.sgdbDesktopToolbar .sgdbFilterToggle:focus-visible {
  color: var(--sgdb-text);
  border: 1px solid var(--sgdb-border-soft);
  background: var(--sgdb-surface-hover) !important;
  box-shadow: none !important;
}

.sgdbDesktopToolbar .image-wrap.sgdbAsset.type-grid_l .sgdbChips,
.sgdbDesktopToolbar .image-wrap.sgdbAsset.type-hero .sgdbChips {
  right: calc(-1 * clamp(7.5px, min(4.875cqw, 9.375cqh), 15px));
  top: clamp(7.5px, min(4.875cqw, 9.375cqh), 15px);
  gap: clamp(4.5px, min(2.625cqw, 5.625cqh), 7.5px);
}

.sgdbDesktopToolbar .image-wrap.sgdbAsset.type-grid_l .sgdbChips span,
.sgdbDesktopToolbar .image-wrap.sgdbAsset.type-hero .sgdbChips span {
  padding: clamp(4.5px, min(2.625cqw, 5.625cqh), 9px) clamp(9px, min(7.5cqw, 15cqh), 22.5px);
  min-height: clamp(21px, min(13.125cqw, 24.375cqh), 42px);
  border-radius: clamp(6px, min(4.125cqw, 9.375cqh), 12px) 0 0 clamp(6px, min(4.125cqw, 9.375cqh), 12px);
  font-size: clamp(12px, min(7.125cqw, 13.875cqh), 22.5px);
  transform: translateX(calc(100% - clamp(12px, min(7.5cqw, 15cqh), 22.5px)));
}

.sgdbDesktopToolbar .image-wrap.sgdbAsset.type-grid_l:hover .sgdbChips span,
.sgdbDesktopToolbar .image-wrap.sgdbAsset.type-grid_l.gpfocus .sgdbChips span,
.sgdbDesktopToolbar .image-wrap.sgdbAsset.type-grid_l:focus-visible .sgdbChips span,
.sgdbDesktopToolbar .image-wrap.sgdbAsset.type-hero:hover .sgdbChips span,
.sgdbDesktopToolbar .image-wrap.sgdbAsset.type-hero.gpfocus .sgdbChips span,
.sgdbDesktopToolbar .image-wrap.sgdbAsset.type-hero:focus-visible .sgdbChips span {
  transform: translateX(0);
}

/* Shared top toolbar and App ID lookup --------------------------------- */
.sgdbGamepad .sgdbTopToolbar,
.sgdbDesktopToolbar .sgdbTopToolbar {
  display: grid;
  position: relative;
  z-index: 3;
  grid-template-columns: minmax(0, 1fr) var(--sgdb-tab-island-width, clamp(450px, 42vw, 840px)) minmax(0, 1fr);
  align-items: center;
  gap: 0;
  min-height: 56px;
  padding: 0 32px;
  background: transparent;
  border: 0;
  box-sizing: border-box;
  pointer-events: none;
}

.sgdbToolbarLeft,
.sgdbToolbarRight {
  display: flex;
  align-items: center;
  justify-content: space-evenly;
  min-width: 0;
  gap: 0;
  pointer-events: auto;
  -webkit-app-region: no-drag;
}

.sgdbToolbarRight {
  padding-right: var(--sgdb-close-safe-padding, 0px);
  box-sizing: border-box;
}

.sgdbToolbarCenterGap {
  align-self: stretch;
  min-width: 0;
  pointer-events: none;
}

.sgdbTopToolbar .sgdbResultsState {
  position: static;
  display: flex;
  flex: 0 0 132px;
  align-items: center;
  justify-content: center;
  width: 132px;
  min-width: 132px;
  max-width: 132px;
  height: 32px;
  margin: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  color: var(--sgdb-text-control);
  font-size: 12.75px;
  font-weight: 700;
  letter-spacing: 0.42px;
  line-height: 1;
  -webkit-font-smoothing: antialiased;
  text-rendering: geometricPrecision;
}

.sgdbTopToolbar .filter-buttons,
.sgdbTopToolbar .sgdbColumnsControl,
.sgdbTopToolbar .sgdbAppIdControls,
.sgdbTopToolbar .sgdbResetButton {
  flex: 0 0 auto;
}

.sgdbTopToolbar .sgdbColumnsControl {
  width: 132px;
  min-width: 132px;
}

.sgdbTopToolbar .sgdbResetButton {
  white-space: nowrap;
}

.sgdbColumnsDropdown {
  width: 132px;
  min-width: 132px;
}

.sgdbColumnsDropdown .DialogDropDown {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 13px;
  align-items: center;
  width: 100%;
  height: 32px;
  min-height: 32px;
  gap: 0;
  padding: 0 12px 0 27px;
  border: 1px solid transparent !important;
  border-radius: 999px !important;
  color: var(--sgdb-text-control) !important;
  background: transparent !important;
  box-shadow: none !important;
  box-sizing: border-box;
  font-size: 12.75px;
  font-weight: 700;
  letter-spacing: 0.42px;
}

.sgdbColumnsDropdown .DialogDropDown:hover,
.sgdbColumnsDropdown .DialogDropDown:focus-visible,
.sgdbColumnsDropdown .DialogDropDown.gpfocus,
.sgdbColumnsDropdown .DialogDropDown[aria-expanded="true"] {
  color: var(--sgdb-text) !important;
  border-color: var(--sgdb-border-soft) !important;
  background: var(--sgdb-surface-hover) !important;
}

.sgdbColumnsDropdown .DialogDropDown_CurrentDisplay {
  grid-column: 1;
  justify-self: start;
  min-width: max-content;
  overflow: visible;
  white-space: nowrap;
  text-overflow: clip;
  text-align: left;
  line-height: 1;
}

.sgdbColumnsDropdown .DialogDropDown_Arrow {
  grid-column: 2;
  justify-self: center;
  margin-left: 0;
  color: var(--sgdb-text-control);
}

.sgdbDesktopToolbar.sgdbPopoutContent > .tabcontents-wrap {
  z-index: auto;
}

.sgdbColumnsDropdown .DialogDropDown_Arrow svg {
  width: 12px;
  height: 12px;
  fill: currentColor;
}

.sgdbBigPicture .sgdbColumnsDropdown > button[role="combobox"] {
  display: block !important;
  width: 100% !important;
  height: 32px !important;
  min-height: 32px !important;
  padding: 0 12px 0 27px !important;
  border: 1px solid transparent !important;
  border-radius: 999px !important;
  color: var(--sgdb-text-control) !important;
  background: transparent !important;
  box-shadow: none !important;
  box-sizing: border-box;
  font-size: 12.75px !important;
  font-weight: 700 !important;
  letter-spacing: 0.42px !important;
}

.sgdbBigPicture .sgdbColumnsDropdown > button[role="combobox"] > div {
  display: grid !important;
  grid-template-columns: minmax(0, 1fr) 13px;
  align-items: center;
  width: 100%;
  height: 100%;
  gap: 0;
}

.sgdbBigPicture .sgdbColumnsDropdown > button[role="combobox"]:hover,
.sgdbBigPicture .sgdbColumnsDropdown > button[role="combobox"]:focus-visible,
.sgdbBigPicture .sgdbColumnsDropdown > button[role="combobox"].gpfocus,
.sgdbBigPicture .sgdbColumnsDropdown > button[role="combobox"][aria-expanded="true"] {
  color: var(--sgdb-text) !important;
  border-color: var(--sgdb-border-soft) !important;
  background: var(--sgdb-surface-hover) !important;
}

.sgdbBigPicture .sgdbColumnsDropdown > button[role="combobox"] .DialogDropDown_CurrentDisplay {
  grid-column: 1;
  justify-self: start;
  min-width: max-content;
  overflow: visible;
  white-space: nowrap;
  text-overflow: clip;
  line-height: 1;
}

.sgdbBigPicture .sgdbColumnsDropdown > button[role="combobox"] svg {
  grid-column: 2;
  justify-self: center;
  width: 12px;
  height: 12px;
  color: var(--sgdb-text-control);
  fill: currentColor;
}

.sgdbAppIdControls {
  display: flex;
  align-items: center;
  gap: 8px;
}

.sgdbAppIdInput {
  width: 138px;
  height: 32px;
  min-width: 92px;
  padding: 0 13px;
  border: 1px solid transparent;
  border-radius: 999px;
  outline: 0;
  color: var(--sgdb-text-control);
  background: color-mix(in srgb, var(--sgdb-surface-hover) 72%, transparent);
  box-shadow: none;
  box-sizing: border-box;
  font-size: 12.75px;
  font-weight: 700;
  letter-spacing: 0.42px;
  line-height: 1;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.sgdbAppIdInput:hover,
.sgdbAppIdInput:focus {
  color: var(--sgdb-text);
  border-color: transparent;
  background: var(--sgdb-surface-hover);
}

.sgdbAppIdAction {
  width: 34px;
  height: 32px;
  min-width: 34px;
  padding: 0;
  color: var(--sgdb-text-control);
}

.sgdbAppIdAction:hover,
.sgdbAppIdAction:focus-visible,
.sgdbAppIdAction.gpfocus {
  color: var(--sgdb-text);
  border-color: var(--sgdb-border-soft);
  background: var(--sgdb-surface-hover);
}

.sgdbAppIdAction:disabled {
  opacity: 0.36;
  cursor: default;
}

.sgdbToolbarIcon {
  width: 17px;
  height: 17px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

/* Responsive layout ----------------------------------------------------- */
@media (max-width: 1500px) {
  .sgdbGamepad .sgdbTopToolbar,
  .sgdbDesktopToolbar .sgdbTopToolbar {
    grid-template-columns: minmax(0, 1fr) var(--sgdb-tab-island-width, clamp(360px, 38vw, 570px)) minmax(0, 1fr);
    padding-right: 18px;
    padding-left: 18px;
  }

  .sgdbToolbarLeft,
  .sgdbToolbarRight {
    gap: 0;
  }

  .sgdbAppIdInput {
    width: 112px;
  }
}

@media (max-width: 1100px) {
  .sgdbAppIdControls {
    gap: 4px;
  }

  .sgdbToolbarRight {
    gap: 0;
  }

  .sgdbAppIdInput {
    width: 78px;
    min-width: 78px;
    padding-right: 8px;
    padding-left: 8px;
    font-size: 11.5px;
  }

  .sgdbAppIdAction {
    width: 28px;
    min-width: 28px;
  }

  .sgdbTopToolbar .sgdbResetButton {
    padding-right: 8px;
    padding-left: 8px;
    font-size: 11px;
  }
}

@media (max-width: 950px) {
  .sgdbDesktopToolbar.sgdbPopoutContent .sgdbGamepadTabs {
    gap: 6px;
    padding-right: 8px;
    padding-left: 8px;
  }

  .sgdbDesktopToolbar.sgdbPopoutContent .sgdbGamepadTab {
    padding-right: 4px;
    padding-left: 4px;
    font-size: 11px;
    letter-spacing: 0.2px;
  }

  .sgdbGamepad .sgdbTopToolbar,
  .sgdbDesktopToolbar .sgdbTopToolbar {
    padding-right: 12px;
    padding-left: 12px;
  }

  .sgdbToolbarLeft,
  .sgdbToolbarRight {
    gap: 0;
  }

  .sgdbAppIdInput {
    width: 72px;
    min-width: 72px;
  }
}

`;
