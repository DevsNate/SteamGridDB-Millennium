import {
  FC,
  useEffect,
  useState,
  useRef,
  ImgHTMLAttributes,
  useCallback,
} from 'react';
import { IconsModule } from '@decky/ui';

interface LazyImage extends ImgHTMLAttributes<HTMLImageElement | HTMLVideoElement> {
  isVideo?: boolean,
  unloadWhenOutside?: boolean,
  marginOffset?: IntersectionObserverInit['rootMargin'];
  scrollContainer?: IntersectionObserverInit['root'];
  src: string,
  wrapperProps?: any,
  blurBackground?: boolean,
}

const MEDIA_RETRIES = 2; // Millennium: Tries again after 1s, then 2s.

// Millennium: In a traced 1.1s freeze, all four renderer worker threads were busy with starting videos' first seeks, so
// tiles couldn't draw until Chromium added workers about a second later. Starting at most two videos at a time leaves
// workers free for drawing; in testing it made those freezes rarer, though not gone.
const MAX_STARTING_VIDEOS = 2;
const VIDEO_START_TIMEOUT = 3000;
let startingVideos = 0;
const waitingVideos: (() => void)[] = [];

const startNextVideos = () => {
  while (startingVideos < MAX_STARTING_VIDEOS && waitingVideos.length) {
    startingVideos += 1;
    waitingVideos.shift()?.();
  }
};

// Calls onGranted when this video may start. The returned release is safe to call repeatedly.
const reserveVideoStart = (onGranted: () => void) => {
  let state: 'waiting' | 'started' | 'released' = 'waiting';
  const grant = () => {
    state = 'started';
    onGranted();
  };
  waitingVideos.push(grant);
  startNextVideos();
  return () => {
    if (state === 'waiting') waitingVideos.splice(waitingVideos.indexOf(grant), 1);
    else if (state === 'started') startingVideos -= 1;
    state = 'released';
    startNextVideos();
  };
};

export const LazyImage: FC<LazyImage> = ({
  isVideo = false,
  unloadWhenOutside = false,
  marginOffset,
  scrollContainer,
  src,
  wrapperProps,
  blurBackground = false,
  ...props
}) => {
  const [inViewport, setInViewport] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const intersectRef = useRef<HTMLDivElement>(null);
  // Millennium: Explicitly release listeners when a media node is replaced.
  const releaseMediaListeners = useRef<(() => void) | undefined>(undefined);
  // Millennium: A remount with a new key fetches a failed thumbnail again.
  const [attempt, setAttempt] = useState(0);
  const attempts = useRef(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [videoGranted, setVideoGranted] = useState(false);
  const releaseVideoStart = useRef<(() => void) | undefined>(undefined);

  const imgRefCb = useCallback((img: HTMLImageElement | HTMLVideoElement | null) => {
    // Millennium: Explicit cleanup also works on Steam React versions without ref cleanup returns.
    releaseMediaListeners.current?.();
    releaseMediaListeners.current = undefined;
    if (!img) return;

    const onLoad = () => {
      if (isVideo) {
        void (img as HTMLVideoElement).play().catch(() => undefined); // Millennium: Autoplay rejection is not an image error.
      }
      setLoading(false);
    };
    const onCanPlay = () => releaseVideoStart.current?.(); // Millennium: Its first seek has finished.
    const onError = () => {
      releaseVideoStart.current?.();
      // Millennium: Thumbnails can fail on a passing server error, so retry before showing the warning icon.
      if (attempts.current >= MEDIA_RETRIES) {
        setError(true);
        return;
      }
      attempts.current += 1;
      const next = attempts.current;
      retryTimer.current = setTimeout(() => setAttempt(next), next * 1000);
    };

    if (isVideo) {
      img.addEventListener('canplay', onCanPlay);
      img.addEventListener('canplaythrough', onLoad);
    } else {
      img.addEventListener('load', onLoad);
    }
    img.addEventListener('error', onError);
    releaseMediaListeners.current = () => { // Millennium: Release when the node is replaced/unmounted.
      if (isVideo) {
        img.removeEventListener('canplay', onCanPlay);
        img.removeEventListener('canplaythrough', onLoad);
      } else {
        img.removeEventListener('load', onLoad);
      }
      img.removeEventListener('error', onError);
    };
    // Millennium: Cached images can finish before ref listeners are installed.
    if (!isVideo && (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0) onLoad();
  }, [isVideo]);

  // reset some state when src changes
  useEffect(() => {
    setInViewport(false);
    setError(false);
    setLoading(true);
    clearTimeout(retryTimer.current);
    attempts.current = 0;
    setAttempt(0);
    return () => clearTimeout(retryTimer.current);
  }, [src]);

  // Millennium: Hold a video back until a start slot frees up, and never let a stuck one keep its slot.
  useEffect(() => {
    if (!isVideo || !inViewport) return;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const release = reserveVideoStart(() => {
      setVideoGranted(true);
      timeout = setTimeout(() => release(), VIDEO_START_TIMEOUT);
    });
    releaseVideoStart.current = release;
    return () => {
      clearTimeout(timeout);
      release();
      releaseVideoStart.current = undefined;
      setVideoGranted(false);
    };
  }, [isVideo, inViewport, src]);

  useEffect(() => {
    // Millennium: The node belongs to BPM/the popout, not SharedJSContext.
    const node = intersectRef.current;
    const owner = node?.ownerDocument.defaultView as (Window & typeof globalThis) | null;
    if (!node || !owner) return;
    if (!owner.IntersectionObserver) {
      setInViewport(true); // Millennium: Missing observer must not leave permanently blank artwork.
      return;
    }
    const unloadVideo = isVideo && unloadWhenOutside; // Millennium: Static artwork stays mounted after its first load.
    let observer: IntersectionObserver;
    const observe = () => {
      observer?.disconnect();
      // Millennium: Preload images four owned scroll viewports above/below at first intersection, since uncached art can take half a second or more to arrive. Video keeps upstream's rule: starting off-screen videos as a page opens risks the freeze described above.
      const rootHeight = scrollContainer && 'clientHeight' in scrollContainer ? scrollContainer.clientHeight : owner.innerHeight;
      const margin = Math.max(1, isVideo ? 0 : (rootHeight || owner.innerHeight) * 4, parseFloat(marginOffset ?? '') || 0);

      observer = new owner.IntersectionObserver((entries, observer) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting && (!isVideo || entry.intersectionRatio >= .5)) { // Millennium: Images do not wait until half a tile is visible.
          setInViewport(true);
          if (!unloadVideo) { // Millennium: Keep static images and their loaded/fade state.
            observer.unobserve(entry.target);
          }
        } else if (unloadVideo && !entry.isIntersecting) { // Millennium: Unload only video outside the preload region, including pending downloads.
          setInViewport(false);
          setLoading(true);
        }
      });
      }, { threshold: isVideo ? [.5, 0] : 0, rootMargin: `${margin}px 0px`, root: scrollContainer }); // Millennium: Owner-sized lookahead for images.

      observer.observe(node);
    };
    observe();
    owner.addEventListener('resize', observe); // Millennium: Recompute lookahead when the floating window changes size.
    return () => {
      observer.disconnect();
      owner.removeEventListener('resize', observe); // Millennium: Owner-window cleanup.
    };
  }, [isVideo, marginOffset, unloadWhenOutside, scrollContainer, src]); // Millennium: Loading state must not reset static observation.

  return (
    <div
      ref={intersectRef}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      data-media-loading={loading && !error ? 'true' : undefined} // Millennium: Drives the tile's loading placeholder.
      {...wrapperProps}
    >
      {error && <IconsModule.WiredNetworkWarning style={{ height: '2em' }} />}

      {(inViewport && !isVideo && error !== true) && (
        <>
          {blurBackground && (
            <img
              key={`blur-${attempt}`}
              className="blur-bg"
              data-loaded={loading ? 'false' : 'true'}
              src={src}
              {...props}
            />
          )}
          <img
            key={attempt}
            ref={imgRefCb}
            data-loaded={loading ? 'false' : 'true'}
            src={src}
            {...props}
          />
        </>
      )}

      {(inViewport && isVideo && videoGranted && error !== true) && (
        <video
          key={attempt}
          ref={imgRefCb}
          data-loaded={loading ? 'false' : 'true'}
          src={src}
          autoPlay={false}
          muted
          loop
          playsInline
          {...props}
        />
      )}
    </div>
  );
};

export default LazyImage;
