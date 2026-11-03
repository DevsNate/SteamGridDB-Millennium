export const desktopPageStyles = `
@layer sgdb-presentation {
html:has(.sgdbDesktopPage),
body:has(.sgdbDesktopPage) {
  height: 100% !important;
  overflow: hidden !important;
}

body:has(.sgdbDesktopPage) .PopupFullWindow {
  height: 100% !important;
}

/* Steam's title bar stays (it drags the window and holds the window controls)
   but overlays the tab header instead of taking its own strip. Clicks pass
   through to the tabs; the tabs are cut out of the drag region below. */
body:has(.sgdbDesktopPage) .TitleBar {
  position: absolute !important;
  top: 0 !important;
  left: 0 !important;
  right: 0 !important;
  z-index: 10 !important;
  background: transparent !important;
  pointer-events: none !important;
}

body:has(.sgdbDesktopPage) .TitleBar .window-controls {
  pointer-events: auto !important;
}

.sgdbDesktopPage {
  box-sizing: border-box !important;
  width: 100% !important;
  height: 100% !important;
  padding-top: 0 !important;
  overflow: hidden !important;
  background: #0e141b !important;
  --gamepadui-current-footer-height: 0px !important;
}

.sgdbDesktopPage #sgdb-wrap {
  position: relative !important;
  width: 100% !important;
  height: 100% !important;
  min-height: 0 !important;
  margin-top: 0 !important;
  overflow: hidden !important;
}

.sgdbDesktopPage #sgdb-wrap .TabHeaderRowWrapper {
  box-sizing: border-box !important;
  width: 100% !important;
  z-index: 5 !important;
  background: rgba(14, 20, 27, .45) !important;
  backdrop-filter: blur(18px) saturate(1.25) !important;
  -webkit-backdrop-filter: blur(18px) saturate(1.25) !important;
  -webkit-app-region: drag !important;
}

.sgdbDesktopPage #sgdb-wrap .TabHeaderRowWrapper :is([role="tab"], button, a, input) {
  -webkit-app-region: no-drag !important;
}

.sgdbDesktopPage #sgdb-wrap .TabHeaderRowWrapper::before {
  background: transparent !important;
}

.sgdbDesktopPage #sgdb-wrap .TabContentsScroll {
  box-sizing: border-box !important;
  margin-top: 0 !important;
  top: 0 !important;
  height: 100% !important;
  padding-top: calc(var(--sgdb-header-height, 58px) + 12px) !important;
  padding-bottom: 32px !important;
  scroll-padding-top: calc(var(--sgdb-header-height, 58px) + 12px) !important;
}

/* The window is narrower than Big Picture's; keep the button labels whole. */
.sgdbDesktopPage #sgdb-wrap .sgdb-asset-toolbar .filter-buttons > button {
  flex: 0 0 auto !important;
  width: auto !important;
  white-space: nowrap !important;
}

.sgdbDesktopPage #sgdb-wrap [role="tab"] {
  cursor: pointer !important;
}

.sgdbDesktopPage #sgdb-wrap :is(.filter-buttons > button, [role="tab"]) *,
.sgdbDesktopPage #sgdb-wrap .image-wrap * {
  pointer-events: none !important;
}

.sgdbDesktopPage #sgdb-wrap .filter-buttons > button:disabled {
  cursor: default !important;
}

.sgdbDesktopPage #sgdb-wrap .image-wrap {
  cursor: pointer !important;
}

.sgdbDesktopPage #sgdb-wrap .spinnyboi {
  position: absolute !important;
  height: 100% !important;
}

.sgdbDesktopPage #sgdb-wrap .spinnyboi > img {
  margin-top: 0 !important;
}

/* The Notes tag's button glyph means nothing with a mouse (Details opens on
   right-click), so desktop shows only the tag text. */
.sgdbDesktopPage .chips > .chip > *,
.sgdbDesktopDialog .chips > .chip > * {
  display: none !important;
}
}
`;
