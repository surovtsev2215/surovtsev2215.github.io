import { memo, useEffect, useRef, useState } from "react";
import { photoDisplayUrl } from "../../lib/photoUrls";

type LazyReportPhotoThumbProps = {
  url: string;
  index: number;
  onOpen: () => void;
  className?: string;
};

export const LazyReportPhotoThumb = memo(function LazyReportPhotoThumb({
  url,
  index,
  onOpen,
  className = ""
}: LazyReportPhotoThumbProps) {
  const rootRef = useRef<HTMLButtonElement>(null);
  const [visible, setVisible] = useState(false);
  const [ok, setOk] = useState(true);
  const displaySrc = photoDisplayUrl(url, true);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "120px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  if (!ok) {
    return (
      <div
        className={`flex aspect-square items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 p-2 text-center text-xs text-slate-500 theme-dark:border-slate-600 theme-dark:bg-slate-800 theme-dark:text-slate-400 ${className}`}
      >
        Фото недоступно
      </div>
    );
  }

  return (
    <button
      ref={rootRef}
      type="button"
      className={`group relative aspect-square overflow-hidden rounded-xl border border-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary theme-dark:border-slate-600 ${className}`}
      onClick={onOpen}
    >
      {visible ? (
        <img
          src={displaySrc}
          alt={`Фото ${index + 1}`}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover transition group-hover:scale-105"
          onError={() => setOk(false)}
        />
      ) : (
        <span className="block h-full w-full animate-pulse bg-slate-200 theme-dark:bg-slate-700" />
      )}
    </button>
  );
});
