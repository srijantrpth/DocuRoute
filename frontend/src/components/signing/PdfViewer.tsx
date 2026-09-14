import { useEffect, useRef, useState, type ReactNode } from "react";
import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

import { Icon, Spinner } from "../ui";
import { cx } from "../../lib/format";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export type PageBox = { pageNumber: number; width: number; height: number };

type PdfViewerProps = {
  /** Signed URL to the PDF. Empty string renders the placeholder. */
  url: string;
  scale?: number;
  className?: string;
  /** Rendered on top of each page, positioned with normalised coordinates. */
  overlay?: (page: PageBox) => ReactNode;
  onPagesReady?: (count: number) => void;
  onPageClick?: (page: number, x: number, y: number) => void;
};

/**
 * Renders every page to a canvas at a device-pixel-ratio-aware scale, and stacks an
 * absolutely-positioned overlay per page so field boxes can be laid out in
 * normalised (0..1) coordinates that survive any zoom level.
 */
export function PdfViewer({
  url,
  scale = 1.35,
  className,
  overlay,
  onPagesReady,
  onPageClick,
}: PdfViewerProps) {
  const [pages, setPages] = useState<PageBox[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const canvasRefs = useRef<Map<number, HTMLCanvasElement>>(new Map());

  useEffect(() => {
    if (!url) {
      setPages([]);
      return;
    }

    let cancelled = false;
    const task = pdfjs.getDocument({ url, withCredentials: false });
    setLoading(true);
    setError("");

    void (async () => {
      try {
        const doc = await task.promise;
        if (cancelled) return;

        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const boxes: PageBox[] = [];

        for (let number = 1; number <= doc.numPages; number += 1) {
          const page = await doc.getPage(number);
          if (cancelled) return;
          const viewport = page.getViewport({ scale });
          boxes.push({ pageNumber: number, width: viewport.width, height: viewport.height });
        }

        setPages(boxes);
        onPagesReady?.(doc.numPages);
        setLoading(false);

        // Canvases mount on the next paint; render into them once they exist.
        requestAnimationFrame(() => {
          void (async () => {
            for (let number = 1; number <= doc.numPages; number += 1) {
              if (cancelled) return;
              const canvas = canvasRefs.current.get(number);
              if (!canvas) continue;
              const page = await doc.getPage(number);
              const viewport = page.getViewport({ scale });
              canvas.width = Math.floor(viewport.width * dpr);
              canvas.height = Math.floor(viewport.height * dpr);
              const context = canvas.getContext("2d");
              if (!context) continue;
              context.setTransform(dpr, 0, 0, dpr, 0, 0);
              await page.render({ canvas, canvasContext: context, viewport }).promise;
            }
          })();
        });
      } catch (cause) {
        if (cancelled) return;
        setLoading(false);
        setError(
          cause instanceof Error ? cause.message : "The document could not be displayed.",
        );
      }
    })();

    return () => {
      cancelled = true;
      void task.destroy();
    };
  }, [url, scale, onPagesReady]);

  if (!url) {
    return (
      <div className={cx("grid place-items-center rounded-xl border border-dashed border-outline-variant bg-surface-container-low py-24 text-center", className)}>
        <div className="text-on-surface-variant">
          <Icon name="picture_as_pdf" className="text-[40px] opacity-40" />
          <p className="mt-2 text-[13px] font-medium">No document attached yet</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={cx("grid place-items-center rounded-xl border border-error-container bg-error-container/40 py-20 text-center", className)}>
        <div className="max-w-sm px-6 text-on-error-container">
          <Icon name="error" className="text-[32px]" />
          <p className="mt-2 text-[13px] font-semibold">The document could not be displayed</p>
          <p className="mt-1 text-[12px] opacity-80">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cx("flex flex-col items-center gap-6", className)}>
      {loading && (
        <div className="flex items-center gap-2 py-16 text-on-surface-variant">
          <Spinner className="size-5 text-primary" />
          <span className="text-[13px] font-medium">Rendering document…</span>
        </div>
      )}

      {pages.map((page) => (
        <div
          key={page.pageNumber}
          className="relative shadow-[var(--shadow-raised)] ring-1 ring-outline-variant"
          style={{ width: page.width, height: page.height }}
          onClick={
            onPageClick
              ? (event) => {
                  const rect = event.currentTarget.getBoundingClientRect();
                  onPageClick(
                    page.pageNumber - 1,
                    (event.clientX - rect.left) / rect.width,
                    (event.clientY - rect.top) / rect.height,
                  );
                }
              : undefined
          }
        >
          <canvas
            ref={(element) => {
              if (element) canvasRefs.current.set(page.pageNumber, element);
              else canvasRefs.current.delete(page.pageNumber);
            }}
            className="block bg-white"
            style={{ width: page.width, height: page.height }}
          />
          <span className="pointer-events-none absolute -top-3 right-2 rounded-full bg-inverse-surface px-2 py-0.5 text-[10px] font-bold text-inverse-on-surface opacity-70">
            {page.pageNumber}
          </span>
          {overlay?.(page)}
        </div>
      ))}
    </div>
  );
}
