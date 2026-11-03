// The API key setup view (MissingApiKeyView), shown in place of the artwork
// page when no key is saved. Layout only: Steam's dialog components bring the
// colors and type.
export const setupStyles = `
.sgdbRoot {
  position: relative;
  height: 100%;
  min-height: 0;
  margin-top: var(--basicui-header-height, 40px);
  box-sizing: border-box;
}

.sgdbPopoutContent {
  display: flex;
  flex-direction: column;
  height: 100vh;
  margin-top: 0;
  overflow: hidden;
}

.sgdbBigPicture.sgdbPopoutContent {
  padding-top: var(--sgdb-big-picture-header-height, var(--basicui-header-height, 40px));
}

.sgdbApiKeySetup {
  width: min(900px, 100%);
  margin: auto;
  padding: 24px 36px;
  box-sizing: border-box;
}
`;
