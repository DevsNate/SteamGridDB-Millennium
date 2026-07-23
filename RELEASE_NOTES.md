# SteamGridDB 2.0.0

SteamGridDB 2.0 focuses on a smoother controller experience, better artwork scaling, and improved Millennium compatibility.

## What's New

- Added a persistent **Steam Library → Hide game logos** setting.
  - Hides logos on Desktop library game pages without modifying or deleting artwork.
  - Disabled by default.

## Controller and Navigation Improvements

- Added smooth, focus-aware scrolling throughout the artwork browser.
- Fixed the repeating navigation issue where every third row failed to pan.
- Fixed two-column Hero layouts not scrolling or exposing additional artwork.
- Focused artwork now remains visible above Steam's footer.
- Improved automatic loading when the initial artwork rows fit inside the viewport.
- Added Left/Right controller navigation to the missing-API-key action buttons.
- Fixed Big Picture mouse-wheel scrolling being pulled back toward controller-focused artwork.
- Mouse-wheel input now cancels focus-driven scrolling and row-loading focus restoration while preserving smooth controller navigation.

## Artwork Browser Improvements

- Artwork status labels—Animated, Adult, Humor, and Epilepsy—now scale proportionally with the selected column count.
- Moved status labels to the left side of artwork cards so they no longer interfere with Add to Collection.
- Updated label padding, spacing, corner radius, and reveal animation to scale with each artwork card.
- Removed the outdated oversized label styling for Wide Grid and Hero artwork.

## Millennium Compatibility

- Added a workaround for the Millennium v3.3.1 Big Picture Logs-page crash caused by a missing main-window reference.
- Uses the Desktop Steam window when available and safely falls back to the Big Picture window.
- Added delayed retries to account for Millennium's asynchronous startup behavior.
- Added complete timer, window-fallback, and plugin-unload cleanup.

## Animated Artwork Reliability

- Fixed animated artwork failing when newer Steam `loginusers.vdf` files omit the legacy `MostRecent` field.
- Active-account detection now falls back to `AutoLogin`, then the newest valid account timestamp with an existing Steam userdata folder.

## Upgrade Notes

- Existing settings and API credentials remain compatible.
- No artwork files are changed by the new Hide game logos option.
- No manual migration is required.
