export const observeDesktopHeader = (page: HTMLElement): (() => void) => {
  const owner = page.ownerDocument.defaultView;
  if (!owner) return () => undefined;

  let header: HTMLElement | null = null;

  const measure = () => {
    const height = header?.getBoundingClientRect().height;
    if (height) page.style.setProperty('--sgdb-header-height', `${height}px`);
  };

  const resize = new owner.ResizeObserver(measure);
  // Page mutations are frequent (the asset grid); only re-observe when the
  // header was replaced. Size changes go through ResizeObserver.
  const observe = () => {
    const nextHeader = page.querySelector<HTMLElement>('.TabHeaderRowWrapper');
    if (nextHeader === header) return;
    header = nextHeader;
    resize.disconnect();
    if (header) resize.observe(header);
    measure();
  };
  const mutations = new owner.MutationObserver(observe);
  mutations.observe(page, { childList: true, subtree: true });
  owner.addEventListener('resize', measure);
  observe();

  return () => {
    mutations.disconnect();
    resize.disconnect();
    owner.removeEventListener('resize', measure);
    page.style.removeProperty('--sgdb-header-height');
  };
};
