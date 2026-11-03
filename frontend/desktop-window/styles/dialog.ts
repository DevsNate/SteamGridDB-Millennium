// Dialogs in the desktop window use Big Picture's ModalPosition (see
// big-picture-presentation.tsx), styled by Steam's sp.css. Big Picture's
// backdrop and text colour come from its overlay and root, which the desktop
// window doesn't have, so restate those.
export const desktopDialogStyles = `
@layer sgdb-presentation {
body:has(.sgdbDesktopDialog) .ModalOverlayBackground {
  background: rgba(0, 0, 0, .85) !important;
  backdrop-filter: blur(3px) !important;
}

/* The desktop library.css (not loaded in Big Picture) sizes .ModalPosition to
   100% on top of sp.css's insets and padding, pushing the frame past the window. */
.sgdbDesktopDialog > .ModalPosition {
  height: auto !important;
  flex-direction: row !important;
  align-content: normal !important;
}

/* Steam's desktop <dialog> sets black text; Big Picture's dialogs inherit white. */
.sgdbDesktopDialog {
  display: contents !important;
  color: #fff !important;
}

.sgdbDesktopDialog .sgdb-logo-desktop-actions {
  position: fixed !important;
  right: 24px !important;
  bottom: 24px !important;
  z-index: 20 !important;
  display: flex !important;
  justify-content: flex-end !important;
  gap: 8px !important;
}

.sgdbDesktopDialog .sgdb-logo-desktop-actions > .DialogButton {
  width: auto !important;
  min-width: 140px !important;
}
}
`;
