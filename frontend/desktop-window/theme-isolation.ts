// Millennium injects the active theme into every Steam window (see Millennium's
// frontend/patcher: DOMModifier.AddStyleSheet / AddStyleSheetFromText). Our
// desktop window should look exactly like Big Picture, so turn those sheets off
// in its document only. Other windows keep the theme.
//
// Sheets are switched off with media="not all" rather than `disabled`: a link's
// `disabled` doesn't stick to a stylesheet that (re)loads afterwards, which left
// Fluenty's !important rules active with its colour variables gone.
const themeStyleIds = new Set(['MillenniumQuickCss', 'SystemAccentColorInject', 'GlobalColors', 'RootColors']);
const offMedia = 'not all';

const isThemeSheet = (node: Node): node is HTMLLinkElement | HTMLStyleElement => {
  if (node instanceof node.ownerDocument!.defaultView!.HTMLLinkElement) {
    return node.id === 'millennium-injected' || node.href.startsWith('https://millennium.host/');
  }
  if (node instanceof node.ownerDocument!.defaultView!.HTMLStyleElement) {
    return themeStyleIds.has(node.id);
  }
  return false;
};

type Isolation = { users: number; stop: () => void };
// One isolation per document, shared by every page mounted in it, so a page
// unmounting after its replacement mounted can't bring the theme back.
const isolations = new WeakMap<Document, Isolation>();

const startIsolation = (doc: Document): (() => void) => {
  const original = new Map<HTMLLinkElement | HTMLStyleElement, string | null>();
  const disable = (node: Node) => {
    if (!node.ownerDocument?.defaultView || !isThemeSheet(node)) return;
    if (!original.has(node)) original.set(node, node.getAttribute('media'));
    if (node.getAttribute('media') !== offMedia) node.setAttribute('media', offMedia);
  };

  doc.head.querySelectorAll('link, style').forEach(disable);
  const observer = new (doc.defaultView ?? window).MutationObserver((records) => {
    for (const record of records) {
      if (record.type === 'attributes') disable(record.target);
      else record.addedNodes.forEach(disable);
    }
  });
  observer.observe(doc.head, { childList: true, subtree: true, attributes: true, attributeFilter: ['media'] });

  return () => {
    observer.disconnect();
    for (const [node, media] of original) {
      if (media === null) node.removeAttribute('media');
      else node.setAttribute('media', media);
    }
  };
};

export const isolateFromTheme = (doc: Document): (() => void) => {
  let isolation = isolations.get(doc);
  if (!isolation) {
    isolation = { users: 0, stop: startIsolation(doc) };
    isolations.set(doc, isolation);
  }
  isolation.users += 1;

  let released = false;
  return () => {
    if (released) return;
    released = true;
    const current = isolations.get(doc);
    if (!current || (current.users -= 1) > 0) return;
    isolations.delete(doc);
    current.stop();
  };
};
