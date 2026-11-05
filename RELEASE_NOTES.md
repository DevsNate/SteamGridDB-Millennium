## New: Collections

Restyle your library with a whole SteamGridDB collection at once. Open the **Collections** tab to start.

- Browse your own SteamGridDB collections, and add any public one by link or ID.
- Collections open as a grid of their games, and show which ones are in your library.
- **Apply to My Library** opens a review page that lists every change before anything is written. Apply the whole collection or only the games you select, and leave single games out with **Exclude**.
- Your existing custom artwork is kept unless you turn on **Replace My Custom Artwork**. Choose which artwork types to apply.
- Games with several artworks of one type wait for your pick on a **Choose** page, or **Use First for the Rest** takes the first one for every game left. **Choose Again** asks again for games that already show the collection's artwork.
- Games that aren't recognized can be matched to an owned Steam game or a local non-Steam shortcut. Your matches are remembered.
- Applying shows progress, keeps going if you leave the page, and can be cancelled. **Apply** again retries only what failed or didn't start.
- Collection contents come from SteamGridDB's undocumented website API, which may change. The tab is in English only for now. Applied changes have no undo; reset single artwork from the Manage tab.

## Improvements

- The API Key can be pasted and saved on the setup screen itself, so Big Picture no longer needs another plugin to get started. Plugins Hub is now optional.
- Artwork downloads are limited to SteamGridDB's and Steam's servers.
- Turning the plugin off now also removes the hook it adds to Steam's library data for instant shortcut icons.

## Fixes

- Artwork tabs no longer keep loading forever when SteamGridDB returns an error page.
- Fixed flickering tab names on the desktop with some themes.

## Install

1. Download `steamgriddb.star` below.
2. Put it in `Steam\millennium\plugins\`.
3. Restart Steam and enable SteamGridDB in Millennium's plugin settings.

Updating from 1.0: replace the old `steamgriddb.star` and restart Steam. Your API Key and settings are kept.

## Requirements

- A Starlight-capable Millennium (verified with v3.6.2).
- Your own free [SteamGridDB API Key](https://www.steamgriddb.com/profile/preferences/api).
- On the desktop, the settings are in Millennium's plugin settings. In Big Picture, the optional [Plugins Hub](https://github.com/DevsNate/PluginsHub-Millennium) plugin shows them in Quick Access.
