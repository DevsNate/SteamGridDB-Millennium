// Steam marks desktop windows with `body.DesktopUI`, and Big Picture's own
// components (fields, inputs, dialog headers) switch to their desktop variants
// under it. Our desktop window should look exactly like Big Picture, so drop the
// class from its body. Steam's title bar (drag area, window controls) is styled
// through the same class; restate only those rules under a class of our own.
const chromeClass = 'sgdbDesktopChrome';
const chromeSelector = /title-area|title-bar|TitleBar/;

const titleBarRules = (doc: Document) => {
  const rules: string[] = [];
  const walk = (list: CSSRuleList) => {
    for (const rule of Array.from(list)) {
      if ('cssRules' in rule && !('selectorText' in rule)) walk((rule as CSSGroupingRule).cssRules);
      if (!('selectorText' in rule)) continue;
      const style = rule as CSSStyleRule;
      const selectors = style.selectorText.split(',')
        .filter((selector) => selector.includes('.DesktopUI') && chromeSelector.test(selector))
        .map((selector) => selector.replace(/\.DesktopUI\b/g, `.${chromeClass}`));
      if (selectors.length) rules.push(`${selectors.join(',')}{${style.style.cssText}}`);
    }
  };
  for (const sheet of Array.from(doc.styleSheets)) {
    if (!sheet.href?.startsWith('https://steamloopback.host/')) continue;
    try {
      walk(sheet.cssRules);
    } catch {
      // Unreadable sheet; nothing of Steam's chrome in it.
    }
  }
  return rules.join('\n');
};

export const dropDesktopUIClass = (doc: Document): (() => void) => {
  const body = doc.body;
  if (!body.classList.contains('DesktopUI')) return () => undefined;

  const style = doc.createElement('style');
  style.textContent = titleBarRules(doc);
  doc.head.append(style);

  const strip = () => {
    if (!body.classList.contains('DesktopUI')) return;
    body.classList.remove('DesktopUI');
    body.classList.add(chromeClass);
  };
  strip();
  // Steam may rewrite the body's classes (e.g. on focus changes).
  const observer = new (doc.defaultView ?? window).MutationObserver(strip);
  observer.observe(body, { attributes: true, attributeFilter: ['class'] });

  return () => {
    observer.disconnect();
    style.remove();
    body.classList.remove(chromeClass);
    body.classList.add('DesktopUI');
  };
};
