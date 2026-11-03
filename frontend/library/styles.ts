// Window-aware adaptation of SteamGridDB/decky-steamgriddb src/utils/styleInjector.ts.
const styles = new Map<string, string>();
const owners = new Set<Window>();

export function attachLibraryStyles(owner: Window): void {
  for (const previous of owners) if (previous.closed) owners.delete(previous);
  owners.add(owner);
  for (const [id, css] of styles) writeStyle(owner, id, css);
}

function writeStyle(owner: Window, id: string, css: string): void {
  if (owner.closed || !owner.document.head) return;
  let style = owner.document.getElementById(id);
  if (!style) {
    style = owner.document.createElement('style');
    style.id = id;
    owner.document.head.appendChild(style);
  }
  if (style.textContent !== css) style.textContent = css;
}

export function setLibraryStyle(id: string, css: string, replace = true): void {
  if (!replace && styles.has(id)) return;
  styles.set(id, css);
  for (const owner of owners) {
    if (owner.closed) owners.delete(owner);
    else writeStyle(owner, id, css);
  }
}

export function removeLibraryStyle(id: string): void {
  styles.delete(id);
  for (const owner of owners) {
    if (owner.closed) owners.delete(owner);
    else owner.document.getElementById(id)?.remove();
  }
}

export function clearLibraryStyles(): void {
  for (const id of styles.keys()) removeLibraryStyle(id);
  owners.clear();
}
