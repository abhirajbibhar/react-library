import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Slider } from 'primereact/slider';
import * as pdfjs from 'pdfjs-dist';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import { fileUrl, type Book } from '../api/types';
import { tokenStore } from '../api/client';
import { useProgressSaver } from './progress';
import { ReaderHeader, ReaderIconButton } from './ReaderChrome';
import { useReaderSettings, type PdfFitMode } from './settings';
import { clampPage, formatPercent, pagePercentage } from './readerUtils';

// Same worker wiring the upload extractor uses (public/worker chunk).
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 4;

export default function PdfReader({ book }: { book: Book }) {
  const navigate = useNavigate();
  const saver = useProgressSaver(book.id);
  const [settings, updateSettings] = useReaderSettings('pdf');

  const surfaceRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const documentRef = useRef<PDFDocumentProxy | null>(null);
  const renderTaskRef = useRef<{ cancel: () => void } | null>(null);

  const [numPages, setNumPages] = useState(0);
  const [page, setPage] = useState(() => book.pdfProgress?.page ?? 1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Bumped by the ResizeObserver so fit modes re-render on resize.
  const [resizeNonce, setResizeNonce] = useState(0);

  // Load the document once, fetching with the auth header (pdf.js keeps
  // requesting ranges from our range-capable file endpoint).
  useEffect(() => {
    let cancelled = false;
    const token = tokenStore.access;
    const loadingTask = pdfjs.getDocument({
      url: fileUrl(book.id),
      httpHeaders: token ? { Authorization: `Bearer ${token}` } : {},
      // Fetch large PDFs in chunks instead of one big response.
      rangeChunkSize: 512 * 1024,
      disableAutoFetch: false
    });
    loadingTask.promise
      .then(loaded => {
        if (cancelled) {
          void loadingTask.destroy();
          return;
        }
        documentRef.current = loaded;
        setNumPages(loaded.numPages);
        setLoading(false);
      })
      .catch(cause => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : 'Failed to open the PDF');
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
      // pdfjs v6 tears down through the loading task (kills worker + fetches).
      documentRef.current = null;
      void loadingTask.destroy();
    };
  }, [book.id]);

  // Render the current page whenever page/zoom/fit/document changes.
  useEffect(() => {
    const documentProxy = documentRef.current;
    const canvas = canvasRef.current;
    const container = surfaceRef.current;
    if (!documentProxy || !canvas || !container || numPages === 0) return;

    let cancelled = false;
    let pageProxy: PDFPageProxy | null = null;

    (async () => {
      try {
        const target = clampPage(page, numPages);
        const loadedPage = await documentProxy.getPage(target);
        if (cancelled) {
          void loadedPage.cleanup();
          return;
        }
        pageProxy = loadedPage;

        const base = loadedPage.getViewport({ scale: 1 });
        // 8px surface padding on both sides.
        const availableWidth = Math.max(64, container.clientWidth - 16);
        const availableHeight = Math.max(64, container.clientHeight - 16);
        const fitScale =
          settings.fit === 'width'
            ? availableWidth / base.width
            : Math.min(availableWidth / base.width, availableHeight / base.height);
        const scale = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, fitScale * settings.zoom));

        const viewport = loadedPage.getViewport({ scale });
        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;

        const context = canvas.getContext('2d');
        if (!context) return;
        context.setTransform(1, 0, 0, 1, 0, 0);
        context.clearRect(0, 0, canvas.width, canvas.height);

        const task = loadedPage.render({
          canvas,
          viewport,
          transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined
        });
        renderTaskRef.current = task;
        await task.promise;
      } catch (cause) {
        // Rendering was cancelled (page switched) — not an error.
        if (!cancelled && !(cause instanceof Error && cause.name === 'RenderingCancelledException')) {
          setError(cause instanceof Error ? cause.message : 'Failed to render the page');
        }
      } finally {
        renderTaskRef.current = null;
        if (pageProxy && cancelled) void pageProxy.cleanup();
      }
    })();

    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel();
    };
  }, [page, numPages, settings, loading, resizeNonce]);

  // Re-render on container resize (fit modes depend on the container size).
  useEffect(() => {
    const container = surfaceRef.current;
    if (!container) return;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setResizeNonce(value => value + 1));
    });
    observer.observe(container);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  const goTo = useCallback(
    (nextPage: number) => {
      if (numPages === 0) return;
      const target = clampPage(nextPage, numPages);
      setPage(target);
      saver.save({
        pdfProgress: { page: target, percentage: pagePercentage(target, numPages) }
      });
    },
    [numPages, saver]
  );

  const zoomBy = (delta: number) => {
    updateSettings({
      zoom: Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round((settings.zoom + delta) * 100) / 100))
    });
  };

  // Keyboard navigation.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement) return;
      if (numPages === 0) return;
      switch (event.key) {
        case 'ArrowRight':
        case 'ArrowDown':
        case 'PageDown':
        case ' ':
          event.preventDefault();
          goTo(page + 1);
          break;
        case 'ArrowLeft':
        case 'ArrowUp':
        case 'PageUp':
          event.preventDefault();
          goTo(page - 1);
          break;
        case 'Home':
          event.preventDefault();
          goTo(1);
          break;
        case 'End':
          event.preventDefault();
          goTo(numPages);
          break;
        case 'Escape':
          setSettingsOpen(false);
          break;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [page, numPages, goTo]);

  const percentage = numPages > 0 ? pagePercentage(page, numPages) : 0;

  return (
    <div className="reader-root">
      <ReaderHeader
        title={book.metadata.title ?? book.fileName}
        onBack={() => navigate(`/book/${book.id}`)}
        actions={
          <ReaderIconButton
            icon="pi-cog"
            title="Reader settings"
            active={settingsOpen}
            onClick={() => setSettingsOpen(open => !open)}
          />
        }
      />

      <div className="reader-body" onClick={() => setSettingsOpen(false)}>
        <div ref={surfaceRef} className="pdf-surface">
          <canvas ref={canvasRef} hidden={loading || !!error} />
        </div>

        {settingsOpen ? (
          <div className="reader-settings" onClick={event => event.stopPropagation()}>
            <div className="reader-settings-row">
              <label>Fit</label>
              <div className="reader-seg">
                <button
                  type="button"
                  className={`seg-option${settings.fit === 'page' ? ' active' : ''}`}
                  onClick={() => updateSettings({ fit: 'page' as PdfFitMode, zoom: 1 })}
                >
                  Page
                </button>
                <button
                  type="button"
                  className={`seg-option${settings.fit === 'width' ? ' active' : ''}`}
                  onClick={() => updateSettings({ fit: 'width' as PdfFitMode, zoom: 1 })}
                >
                  Width
                </button>
              </div>
            </div>
            <div className="reader-settings-row">
              <label>Zoom</label>
              <div className="reader-seg">
                <button type="button" className="seg-option" onClick={() => zoomBy(-0.1)}>
                  −
                </button>
                <span className="seg-option" aria-hidden="true">
                  {Math.round(settings.zoom * 100)}%
                </span>
                <button type="button" className="seg-option" onClick={() => zoomBy(0.1)}>
                  +
                </button>
                <button
                  type="button"
                  className="seg-option"
                  onClick={() => updateSettings({ zoom: 1 })}
                >
                  Reset
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {loading ? (
          <div className="reader-loading">
            <i className="pi pi-spinner pi-spin" />
            <span>Opening PDF…</span>
          </div>
        ) : null}

        {error ? (
          <div className="reader-message">
            <h2>Could not open this PDF</h2>
            <p>{error}</p>
          </div>
        ) : null}
      </div>

      <footer className="reader-footer">
        <ReaderIconButton
          icon="pi-chevron-left"
          title="Previous page"
          disabled={!numPages || page <= 1}
          onClick={() => goTo(page - 1)}
        />
        <input
          type="number"
          className="reader-page-input"
          min={1}
          max={Math.max(1, numPages)}
          value={page}
          disabled={!numPages}
          onChange={event => {
            const value = Number(event.target.value);
            if (Number.isInteger(value) && value >= 1 && value <= numPages) setPage(value);
          }}
          onBlur={() => goTo(page)}
          aria-label="Page number"
        />
        <div className="reader-slider">
          <Slider
            value={page}
            min={1}
            max={Math.max(1, numPages)}
            disabled={!numPages}
            onChange={event => setPage(event.value as number)}
            onSlideEnd={event => goTo(event.value as number)}
          />
        </div>
        <ReaderIconButton
          icon="pi-chevron-right"
          title="Next page"
          disabled={!numPages || page >= numPages}
          onClick={() => goTo(page + 1)}
        />
        <span className="reader-footer-label">
          {numPages > 0 ? (
            <>
              <strong>{page}</strong> / {numPages}
            </>
          ) : (
            '—'
          )}
        </span>
        <span className="reader-footer-label">
          <strong>{formatPercent(percentage)}</strong>
        </span>
      </footer>
    </div>
  );
}
