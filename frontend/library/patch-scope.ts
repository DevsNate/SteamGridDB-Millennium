import { afterPatch, replacePatch } from 'millennium';

// Upstream's nested render patches must be restored as well as their route patch.
function createScope() {
  const patches: Array<{ unpatch(): void }> = [];
  const track = <T extends (...args: any[]) => any>(apply: T): T => ((...args: Parameters<T>) => {
    const patch = apply(...args);
    patches.push(patch);
    return patch;
  }) as T;
  return {
    afterPatch: track(afterPatch) as typeof import('../shims/decky-ui').afterPatch,
    replacePatch: track(replacePatch),
    clear() {
      for (const patch of patches.splice(0).reverse()) patch.unpatch();
    },
  };
}

export const homePatchScope = createScope();
export const squarePatchScope = createScope();
