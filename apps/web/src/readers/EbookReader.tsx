import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Slider } from 'primereact/slider';
import type { Book, EpubBookInfo } from '../api/types';
import { api, tokenStore } from '../api/client';
import { useProgressSaver } from './progress';
import { EPUB_THEMES, generateEpubCss } from './epubStyles';
import {
  createFoliateView,
  loadFoliate,
  type FoliateRelocateDetail,
  type FoliateTocItem,
  type FoliateView
} from './foliate';
import { ReaderHeader, ReaderIconButton } from './ReaderChrome';
import { useReaderSettings, type EpubFlow, type EpubTheme } from './settings';
import { formatPercent } from './readerUtils';

interface PositionState {
  cfi?: string;
  percentage: number;
  chapter?: string;
}

export default function EbookReader({ book }: { book: Book }) {
  const navigate = useNavigate();
  const surfaceRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<FoliateView | null>(null);
  const saver = useProgressSaver(book.id);
  const [settings, updateSettings] = useReaderSettings('epub');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tocOpen, setTocOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toc, setToc] = useState<FoliateTocItem[]>([]);
  const [position, setPosition] = useState<PositionState>({ percentage: 0 });
  const [scrub, setScrub] = useState<number | null>(null);

  /** Push theme/size/flow into the foliate renderer. */
  const applyStyles = useCallback(() => {
    const renderer = viewRef.current?.renderer;
    if (!renderer) return;
    if (typeof renderer.setStyles === 'function') {
      renderer.setStyles(generateEpubCss(settings));
    }
    renderer.setAttribute('flow', settings.flow);
    if (settings.flow === 'paginated') renderer.setAttribute('margin', '40px');
    else renderer.removeAttribute('margin');
  }, [settings]);

  // Keep the latest applyStyles in a ref (the load effect attaches a
  // 'load' listener once) and re-apply whenever settings change.
  const applyStylesRef = useRef(applyStyles);
  useEffect(() => {
    applyStylesRef.current = applyStyles;
    applyStyles();
  }, [applyStyles]);

  useEffect(() => {
    const container = surfaceRef.current;
    if (!container) return;
    let cancelled = false;

    const handleRelocate = (detail: FoliateRelocateDetail) => {
      const fraction = detail.fraction;
      const cfi = detail.cfi;
      const percentage =
        typeof fraction === 'number'
          ? Math.min(100, Math.max(0, Math.round(fraction * 1000) / 10))
          : undefined;

      setPosition({
        cfi,
        percentage: percentage ?? 0,
        chapter: detail.tocItem?.label ?? undefined
      });

      if (cfi && percentage !== undefined) {
        saver.save({ epubProgress: { cfi, percentage } });
      }
    };

    (async () => {
      try {
        await loadFoliate();
        const info = await api.get<EpubBookInfo>(`/api/v1/epub/${book.id}/info`);
        if (cancelled) return;

        const view = createFoliateView(container);
        viewRef.current = view;

        const onRelocate = (event: Event) =>
          handleRelocate((event as CustomEvent<FoliateRelocateDetail>).detail ?? {});
        const onLoad = () => applyStylesRef.current();
        view.addEventListener('relocate', onRelocate);
        view.addEventListener('load', onLoad);

        const makeStreamingBook = window.makeStreamingBook;
        if (!makeStreamingBook) throw new Error('EPUB engine failed to initialise');

        const epub = await makeStreamingBook(book.id, '/api/v1/epub', info, tokenStore.access);
        if (cancelled) {
          view.removeEventListener('relocate', onRelocate);
          view.removeEventListener('load', onLoad);
          view.close();
          view.remove();
          viewRef.current = null;
          return;
        }

        await view.open(epub);

        // Resume where the last session stopped.
        const progress = book.epubProgress;
        try {
          if (progress?.cfi) await view.goTo(progress.cfi);
          else if (progress?.percentage && progress.percentage > 0) {
            await view.goToFraction(progress.percentage / 100);
          } else {
            await view.goTo(0);
          }
        } catch {
          // A saved position may no longer resolve (file edited); start over.
        }
        if (cancelled) return;

        setToc(view.book?.toc ?? []);
        applyStylesRef.current();
        setLoading(false);
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : 'Failed to open the book');
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      const view = viewRef.current;
      viewRef.current = null;
      if (view) {
        view.close();
        view.remove();
      }
    };
    // Deliberately keyed on book.id only: the load effect must run once;
    // saver.save and applyStylesRef already track the latest closures.
  }, [book.id]);

  // Keyboard navigation.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const view = viewRef.current;
      if (!view) return;
      if (event.target instanceof HTMLInputElement) return;
      if (event.key === 'ArrowRight' || event.key === 'PageDown' || event.key === ' ') {
        event.preventDefault();
        view.next();
      } else if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
        event.preventDefault();
        view.prev();
      } else if (event.key === 'Escape') {
        setTocOpen(false);
        setSettingsOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const goToTocItem = (href: string) => {
    setTocOpen(false);
    void viewRef.current?.goTo(href).catch(() => undefined);
  };

  const renderTocItems = (items: FoliateTocItem[]) =>
    items.map(item => (
      <div key={`${item.href}-${item.label}`}>
        <button type="button" className="toc-item" onClick={() => goToTocItem(item.href)}>
          {item.label}
        </button>
        {item.subitems && item.subitems.length > 0 ? (
          <div className="toc-children">{renderTocItems(item.subitems)}</div>
        ) : null}
      </div>
    ));

  const displayedPercent = scrub ?? Math.round(position.percentage);

  return (
    <div className="reader-root">
      <ReaderHeader
        title={book.metadata.title ?? book.fileName}
        subtitle={position.chapter}
        onBack={() => navigate(`/book/${book.id}`)}
        actions={
          <>
            <ReaderIconButton
              icon="pi-list"
              title="Table of contents"
              active={tocOpen}
              onClick={() => setTocOpen(open => !open)}
              disabled={loading || toc.length === 0}
            />
            <ReaderIconButton
              icon="pi-cog"
              title="Reader settings"
              active={settingsOpen}
              onClick={() => setSettingsOpen(open => !open)}
              disabled={loading}
            />
          </>
        }
      />

      <div className="reader-body" onClick={() => setSettingsOpen(false)}>
        <div
          ref={surfaceRef}
          className="epub-surface"
          style={{ background: EPUB_THEMES[settings.theme].bg }}
        />

        {tocOpen ? (
          <>
            <div className="reader-toc-backdrop" onClick={() => setTocOpen(false)} />
            <nav className="reader-toc" onClick={event => event.stopPropagation()}>
              <h3>Contents</h3>
              {renderTocItems(toc)}
            </nav>
          </>
        ) : null}

        {settingsOpen ? (
          <div className="reader-settings" onClick={event => event.stopPropagation()}>
            <div className="reader-settings-row">
              <label>Theme</label>
              <div className="reader-seg">
                {(['light', 'sepia', 'dark', 'night'] as EpubTheme[]).map(theme => (
                  <button
                    key={theme}
                    type="button"
                    className={`seg-option${settings.theme === theme ? ' active' : ''}`}
                    onClick={() => updateSettings({ theme })}
                  >
                    {theme}
                  </button>
                ))}
              </div>
            </div>
            <div className="reader-settings-row">
              <label>Font size</label>
              <div className="reader-seg">
                <button
                  type="button"
                  className="seg-option"
                  onClick={() => updateSettings({ fontSize: Math.max(10, settings.fontSize - 1) })}
                >
                  A−
                </button>
                <span className="seg-option" aria-hidden="true">
                  {settings.fontSize}px
                </span>
                <button
                  type="button"
                  className="seg-option"
                  onClick={() => updateSettings({ fontSize: Math.min(32, settings.fontSize + 1) })}
                >
                  A+
                </button>
              </div>
            </div>
            <div className="reader-settings-row">
              <label>Layout</label>
              <div className="reader-seg">
                {(['paginated', 'scrolled'] as EpubFlow[]).map(flow => (
                  <button
                    key={flow}
                    type="button"
                    className={`seg-option${settings.flow === flow ? ' active' : ''}`}
                    onClick={() => updateSettings({ flow })}
                  >
                    {flow}
                  </button>
                ))}
              </div>
            </div>
            <div className="reader-settings-row">
              <label>Alignment</label>
              <div className="reader-seg">
                <button
                  type="button"
                  className={`seg-option${!settings.justify ? ' active' : ''}`}
                  onClick={() => updateSettings({ justify: false })}
                >
                  Left
                </button>
                <button
                  type="button"
                  className={`seg-option${settings.justify ? ' active' : ''}`}
                  onClick={() => updateSettings({ justify: true })}
                >
                  Justify
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {loading ? (
          <div className="reader-loading">
            <i className="pi pi-spinner pi-spin" />
            <span>Opening book…</span>
          </div>
        ) : null}

        {error ? (
          <div className="reader-message">
            <h2>Could not open this book</h2>
            <p>{error}</p>
          </div>
        ) : null}
      </div>

      <footer className="reader-footer">
        <ReaderIconButton
          icon="pi-chevron-left"
          title="Previous page"
          disabled={loading}
          onClick={() => viewRef.current?.prev()}
        />
        <div className="reader-slider">
          <Slider
            value={displayedPercent}
            min={0}
            max={100}
            disabled={loading}
            onChange={event => setScrub(event.value as number)}
            onSlideEnd={event => {
              const target = event.value as number;
              setScrub(null);
              void viewRef.current?.goToFraction(target / 100).catch(() => undefined);
            }}
          />
        </div>
        <ReaderIconButton
          icon="pi-chevron-right"
          title="Next page"
          disabled={loading}
          onClick={() => viewRef.current?.next()}
        />
        <span className="reader-footer-label">
          <strong>{formatPercent(position.percentage)}</strong>
        </span>
      </footer>
    </div>
  );
}
