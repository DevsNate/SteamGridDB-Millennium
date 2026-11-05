import {
  FC,
  useLayoutEffect,
  useState,
  useRef,
  useCallback,
  ReactNode,
} from 'react';
import { joinClassNames, findSP } from '@decky/ui';
import debounce from 'just-debounce';

const Chips: FC<{ children: ReactNode }> = ({ children }) => {
  const chipsRef = useRef<HTMLUListElement>(null);
  const [leftAlign, setLeftAlign] = useState(false);

  const isCutOff = useCallback(() => {
    const el = chipsRef.current;
    if (!el) return false;
    const sizeEl = el.parentElement; // element we can check size aginst
    if (sizeEl) {
      return sizeEl.getBoundingClientRect().right + el.clientWidth + 10 > findSP().innerWidth;
    }
    return false;
  }, []);

  // Check if should switch to left aligned every time size is changed
  useLayoutEffect(() => {
    const el = chipsRef.current;
    if (!el) return;
    const observer = new MutationObserver(debounce((mutations) => {
      if (mutations[0].attributeName === 'style') {
        if (el.parentElement) {
          setLeftAlign(isCutOff());
        }
      }
    }, 500));

    const assetContainer = el.closest('#images-container');
    if (assetContainer) {
      observer.observe(assetContainer, { attributes: true });
    }
    // Inital
    setLeftAlign(isCutOff());
    // Millennium: A tile can mount before it's in its final place, which picks the wrong side for good. Chips only
    // slide out for the tile in focus or under the mouse, so check again then.
    const measure = () => setLeftAlign(isCutOff());
    const tile = el.parentElement;
    tile?.addEventListener('focusin', measure);
    tile?.addEventListener('mouseenter', measure);
    return () => {
      observer.disconnect();
      tile?.removeEventListener('focusin', measure);
      tile?.removeEventListener('mouseenter', measure);
    };
  }, [isCutOff]);

  return <ul ref={chipsRef} className={joinClassNames('chips', leftAlign ? 'chips-left' : '')}>{children}</ul>;
};

export default Chips;