// Lifecycle adaptation of SteamGridDB/decky-steamgriddb src/index.tsx.
import { readSetting } from '../settings/store';
import { addCapsuleGlowPatch } from '../../src/patches/capsuleGlowPatch';
import { addHomePatch, removeHomePatch } from '../../src/patches/homePatch';
import { addSquareLibraryPatch, removeSquareLibraryPatch } from '../../src/patches/squareLibraryPatch';
import { clearLibraryStyles } from './styles';
import { cancelLibraryRefresh } from './refresh';

export function initializeLibraryPatches(): void {
  const squares = readSetting('squares', false) === true;
  const uniform = readSetting('uniform_featured', false) === true;
  const glow = Number(readSetting('capsule_glow_amount', 100));
  if (squares) addSquareLibraryPatch(true);
  if (squares || uniform) addHomePatch(true, squares, uniform);
  addCapsuleGlowPatch(Number.isFinite(glow) ? Math.max(0, Math.min(100, glow)) : 100);
}

export function disposeLibraryPatches(): void {
  cancelLibraryRefresh();
  removeSquareLibraryPatch(true);
  removeHomePatch(true);
  clearLibraryStyles();
}
