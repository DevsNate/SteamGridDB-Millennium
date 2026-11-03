export const pluginSettingsStyles = `
.sgdbPluginSettings {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
  color: inherit;
}
.sgdbPluginSettings .sgdb-key-actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}
.sgdbPluginSettings .sgdb-key-save { margin-top: 12px; }
.sgdbPluginSettings .sgdb-key-actions > button {
  flex: 1 1 0;
  min-width: 0;
  padding-left: 8px;
  padding-right: 8px;
  white-space: nowrap;
}
/* Steam's own highlight skips the key field and a disabled Save Key. */
.sgdbPluginSettings .sgdb-key-focus input {
  outline: 2px solid #fff;
  outline-offset: -2px;
}
.sgdbPluginSettings .sgdb-key-save.sgdb-key-focus > button.DialogButton {
  box-shadow: inset 0 0 0 2px #fff !important;
}
.sgdbPluginSettings .sgdb-key-save.sgdb-key-focus > button.Disabled {
  background: rgba(255, 255, 255, 0.12) !important;
  color: #dfe3e6 !important;
  opacity: 1 !important;
}
.sgdbPluginSettings [role="alert"] { color: #ffb3b3; padding-top: 8px; }
.sgdbPluginSettings .FieldChildrenInner {
  min-width: 0;
  display: flex !important;
  flex-direction: column !important;
  align-items: stretch !important;
}
`;
