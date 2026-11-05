export const artworkToolbarStyles = `
@layer sgdb-presentation {
#sgdb-wrap .sgdb-asset-toolbar {
  --sgdb-toolbar-height: 44px !important;
  align-items: center !important;
}

#sgdb-wrap .sgdb-asset-toolbar .filter-buttons > button {
  box-sizing: border-box !important;
  height: var(--sgdb-toolbar-height) !important;
  min-height: var(--sgdb-toolbar-height) !important;
  margin: 0 !important;
}

#sgdb-wrap .sgdb-asset-toolbar .size-slider {
  box-sizing: border-box !important;
  display: flex !important;
  align-items: center !important;
  height: var(--sgdb-toolbar-height) !important;
  min-height: var(--sgdb-toolbar-height) !important;
  min-width: 0 !important;
  margin: 0 !important;
  position: relative !important;
  padding: 0 16px !important;
  border-radius: 3px !important;
  background: #23262e !important;
}

/* Steam's slider always turns its focus ring off, so this repeats the ring: same outline, same animation.
   It's a separate layer because the ring's blink fades whatever it's on. */
#sgdb-wrap .sgdb-asset-toolbar .size-slider.gpfocus::after,
#sgdb-wrap .sgdb-asset-toolbar .size-slider.gpfocuswithin::after,
#sgdb-wrap .sgdb-collection-replace:has(.gpfocus)::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 3px;
  pointer-events: none;
  outline: 2px solid hsla(0, 0%, 100%, .6);
  outline-offset: 2px;
  animation: sgdb-ring-flash .5s ease, sgdb-ring-grow .4s ease, sgdb-ring-fade .4s ease, sgdb-ring-blink 1.2s ease-in-out .4s 20;
}

@keyframes sgdb-ring-flash { 0% { background-color: hsla(0, 0%, 100%, .08); } 100% { background-color: hsla(0, 0%, 100%, 0); } }
@keyframes sgdb-ring-grow { 0% { outline: 12px solid; } 100% { outline: 2px solid; } }
@keyframes sgdb-ring-fade { 0% { outline-color: hsla(0, 0%, 100%, 0); } 100% { outline-color: hsla(0, 0%, 100%, .6); } }
@keyframes sgdb-ring-blink { 50% { opacity: .4; } }

#sgdb-wrap .size-slider > div,
#sgdb-wrap .size-slider > div > div,
#sgdb-wrap .size-slider > div > div > div {
  width: 100% !important;
  min-width: 0 !important;
  margin: 0 !important;
  padding: 0 !important;
}

#sgdb-wrap .size-slider [role="slider"] {
  position: relative !important;
  display: block !important;
  width: 100% !important;
  height: 24px !important;
  margin: 0 !important;
  padding: 0 !important;
  --slider-extra-notch-padding: 0px !important;
}

#sgdb-wrap .size-slider .SliderControl {
  --slider-handle-width: 20px !important;
  height: 24px !important;
  min-width: 0 !important;
}

#sgdb-wrap .size-slider .SliderTrack {
  width: calc(100% - 20px) !important;
  height: 4px !important;
  /* Steam's 15% white, made solid over the panel so the unfilled dots don't
     stack on the line and show up as fainter blobs. */
  background-color: #44474d !important;
}

#sgdb-wrap .size-slider .SliderHandleContainer {
  z-index: 2 !important;
}

#sgdb-wrap .size-slider .SliderHandle {
  top: 2px !important;
  width: 20px !important;
  height: 20px !important;
}

#sgdb-wrap .size-slider [role="slider"] > .SliderControl + div {
  position: absolute !important;
  inset: 0 !important;
  height: 24px !important;
  align-items: center !important;
  margin: 0 !important;
  padding: 0 !important;
  pointer-events: none !important;
}

#sgdb-wrap .size-slider [role="slider"] > .SliderControl + div > div {
  width: 20px !important;
  min-width: 20px !important;
  height: 10px !important;
  justify-content: center !important;
}

#sgdb-wrap .size-slider [role="slider"] > .SliderControl + div > div > div {
  box-sizing: border-box !important;
  width: 10px !important;
  height: 10px !important;
  margin: 0 !important;
  border: 0 !important;
  border-radius: 50% !important;
}

#sgdb-wrap .size-slider [role="slider"] > .SliderControl + div > div > div:not(.TickActive) {
  background-color: #44474d !important;
}
}
`;
