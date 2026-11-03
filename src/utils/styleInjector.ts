// Millennium: Retain styles before BPM exists and install only in its owner document.
import { setLibraryStyle, removeLibraryStyle } from '../../frontend/library/styles';

export const addStyle = (id: string, css: string) => {
  // Millennium: popupCreated (frontend/steam/serve-hooks.tsx) carries this into future BPM windows too.
  setLibraryStyle(id, css, false);
};

export const removeStyle = (id: string) => {
  // Millennium: Remove from every owned BPM document, never the active dialog.
  removeLibraryStyle(id);
};

/**
  Updates the style if it exists, creates the style if not.
 */
export const updateStyle = (id: string, css: string) => {
  // Millennium: Update the saved CSS even while BPM is closed.
  setLibraryStyle(id, css);
};

export const removeStyles = (...ids: string[]) => {
  for (let i = 0; i < ids.length; i++) {
    const elId = ids[i];
    removeStyle(elId);
  }
};
