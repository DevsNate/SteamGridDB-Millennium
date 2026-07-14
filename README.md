# SteamGridDB for Millennium

SteamGridDB for Millennium is a Steam artwork browser and manager built for the Millennium plugin loader. It lets you search SteamGridDB from inside Steam, browse artwork by type, and apply new library assets without leaving the client.

## Features

- Search SteamGridDB games from inside Steam.
- Browse grids, wide grids, heroes, logos, and icons.
- Apply artwork directly to Steam apps through Steam's frontend artwork APIs.
- Download and apply Steam app icons through the Lua backend.
- Reset custom artwork back to Steam defaults.
- Big Picture/controller-friendly artwork browsing with automatic loading while scrolling.
- Theme-aware interface designed to blend with Fluenty-style dark Steam themes.
- Built-in Fluenty Dark, Steam Blue, OLED Black, Midnight Violet, and Ember theme presets.
- Configurable theme colors for background, selected/hover surfaces, grid hover borders, slider track, and slider thumb.
- Desktop popout view with a compact floating tab bar.

## Installation

Download `SteamGridDB-Millennium.zip` from the latest GitHub release.

Extract the zip so the `SteamGridDB` folder is placed in Steam's Millennium plugins directory:

```text
Steam/millennium/plugins/SteamGridDB
```

Restart Steam or reload Millennium plugins after installing.

## Building

```bash
pnpm install
pnpm run build
```

The production bundle is written to:

```text
.millennium/Dist/index.js
```

## Releases

GitHub Actions builds the plugin on every `v*` tag and attaches `SteamGridDB-Millennium.zip` to the release.

## Credits

Powered by artwork data from SteamGridDB.

This plugin is based on the SteamGridDB artwork workflow and adapted for the Millennium plugin environment.
