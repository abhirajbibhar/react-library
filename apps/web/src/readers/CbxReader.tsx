import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Slider } from 'primereact/slider';
import type { Book } from '../api/types';
import { api, tokenStore } from '../api/client';
import { useProgressSaver } from './progress';
import { ReaderHeader, ReaderIconButton } from './ReaderChrome';
import { useReaderSettings, type CbxBackground } from './settings';
import {
  alignSpreadStart,
  clampPage,
  formatPercent,
  pagePercentage,
  preloadablePages,
  stepPage,
  visiblePages
} from './readerUtils';

const BACKGROUNDS: Record<CbxBackground, string> = {
  black: '#000000',
  gray: '#3f3f46',
  white: '#ffffff'
};

export default function CbxReader({ book }: { book: Book }) {
  const navigate = useNavigate();
  const saver = useProgressSaver(book.id);
  const [settings, updateSettings] = useReaderSettings('cbx');

  const [pages, setPages] = useState<number[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState(() => book.cbxProgress?.page ?? 1);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const total = pages?.length ?? 0;
  const spread = settings.viewMode === 'spread';

  // Fetch the page list once.
  useEffect(() => {
    let cancelled = false;
    api
      .get<number[]>(`/api/v1/cbx/${book.id}/pages`)
      .then(list => {
        if (!cancelled) setPages(list);
      })
      .catch(cause => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : 'Failed to load pages');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [book.id]);

  // Align the restored position to the current spread/direction parity.
  useEffect(() => {
    if (total <= 0) return;
    setCurrent(previous => {
      const clamped = clampPage(previous, total);
      return spread ? alignSpreadStart(clamped, settings.rtl) : clamped;
    });
  }, [total, spread, settings.rtl]);

  const shown = useMemo(
    () => visiblePages(current, total, spread, settings.rtl),
    [current, total, spread, settings.rtl]
  );

  const goTo = useCallback(
    (page: number) => {
      if (total <= 0) return;
      const next = clampPage(page, total);
      setCurrent(next);
      saver.save({
        cbxProgress: { page: next, percentage: pagePercentage(next, total) }
      });
    },
    [total, saver]
  );

  const goNext = useCallback(
    () => goTo(stepPage(current, 1, total, spread, settings.rtl)),
    [current, total, spread, settings.rtl, goTo]
  );

  const goPrev = useCallback(
    () => goTo(stepPage(current, -1, total, spread, settings.rtl)),
    [current, total, spread, settings.rtl, goTo]
  );

  const imageUrl = useCallback(
    (page: number) =>
      `/api/v1/media/book/${book.id}/cbx/pages/${page}?token=${encodeURIComponent(tokenStore.access ?? '')}`,
    [book.id]
  );

  // Warm the HTTP cache for nearby pages.
  useEffect(() => {
    if (total <= 0) return;
    for (const page of preloadablePages(current, total, spread, settings.rtl)) {
      const image = new Image();
      image.src = imageUrl(page);
    }
  }, [current, total, spread, settings.rtl, imageUrl]);

  // Keyboard + swipe navigation.
  const touchStartX = useRef<number | null>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement) return;
      if (total <= 0) return;
      switch (event.key) {
        case 'ArrowRight':
          event.preventDefault();
          if (settings.rtl) goPrev();
          else goNext();
          break;
        case 'ArrowLeft':
          event.preventDefault();
          if (settings.rtl) goNext();
          else goPrev();
          break;
        case 'ArrowDown':
        case 'PageDown':
        case ' ':
          event.preventDefault();
          goNext();
          break;
        case 'ArrowUp':
        case 'PageUp':
          event.preventDefault();
          goPrev();
          break;
        case 'Home':
          event.preventDefault();
          goTo(1);
          break;
        case 'End':
          event.preventDefault();
          goTo(total);
          break;
        case 'Escape':
          setSettingsOpen(false);
          break;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [total, settings.rtl, goNext, goPrev, goTo]);

  const onTouchStart = (event: React.TouchEvent) => {
    touchStartX.current = event.touches[0]?.clientX ?? null;
  };

  const onTouchEnd = (event: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const delta = (event.changedTouches[0]?.clientX ?? 0) - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(delta) < 60) return;
    const swipedForward = delta < 0; // dragged left -> next in LTR
    const forward = settings.rtl ? !swipedForward : swipedForward;
    if (forward) goNext();
    else goPrev();
  };

  return (
    <div className="reader-root">
      <ReaderHeader
        title={book.metadata.title ?? book.fileName}
        subtitle={settings.rtl ? 'Right-to-left' : undefined}
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
        <div
          className={`cbx-surface ${spread ? 'cbx-spread' : 'cbx-single'} ${
            settings.fit === 'width' ? 'cbx-fit-width' : 'cbx-fit-page'
          }`}
          style={{ background: BACKGROUNDS[settings.background] }}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          {pages && shown.map(page => (
            <img
              key={page}
              className="cbx-page"
              src={imageUrl(page)}
              alt={`Page ${page}`}
              draggable={false}
            />
          ))}
        </div>

        {settingsOpen ? (
          <div className="reader-settings" onClick={event => event.stopPropagation()}>
            <div className="reader-settings-row">
              <label>Pages</label>
              <div className="reader-seg">
                <button
                  type="button"
                  className={`seg-option${!spread ? ' active' : ''}`}
                  onClick={() => updateSettings({ viewMode: 'single' })}
                >
                  Single
                </button>
                <button
                  type="button"
                  className={`seg-option${spread ? ' active' : ''}`}
                  onClick={() => updateSettings({ viewMode: 'spread' })}
                >
                  Spread
                </button>
              </div>
            </div>
            <div className="reader-settings-row">
              <label>Fit</label>
              <div className="reader-seg">
                <button
                  type="button"
                  className={`seg-option${settings.fit === 'page' ? ' active' : ''}`}
                  onClick={() => updateSettings({ fit: 'page' })}
                >
                  Page
                </button>
                <button
                  type="button"
                  className={`seg-option${settings.fit === 'width' ? ' active' : ''}`}
                  onClick={() => updateSettings({ fit: 'width' })}
                >
                  Width
                </button>
              </div>
            </div>
            <div className="reader-settings-row">
              <label>Background</label>
              <div className="reader-seg">
                {(['black', 'gray', 'white'] as CbxBackground[]).map(background => (
                  <button
                    key={background}
                    type="button"
                    className={`seg-option${settings.background === background ? ' active' : ''}`}
                    onClick={() => updateSettings({ background })}
                  >
                    {background}
                  </button>
                ))}
              </div>
            </div>
            <div className="reader-settings-row">
              <label>Direction</label>
              <div className="reader-seg">
                <button
                  type="button"
                  className={`seg-option${!settings.rtl ? ' active' : ''}`}
                  onClick={() => updateSettings({ rtl: false })}
                >
                  Left to right
                </button>
                <button
                  type="button"
                  className={`seg-option${settings.rtl ? ' active' : ''}`}
                  onClick={() => updateSettings({ rtl: true })}
                >
                  Right to left
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {!pages && !error ? (
          <div className="reader-loading">
            <i className="pi pi-spinner pi-spin" />
            <span>Loading pages…</span>
          </div>
        ) : null}

        {error ? (
          <div className="reader-message">
            <h2>Could not open this comic</h2>
            <p>{error}</p>
          </div>
        ) : null}
      </div>

      <footer className="reader-footer">
        <ReaderIconButton
          icon={settings.rtl ? 'pi-chevron-right' : 'pi-chevron-left'}
          title="Previous page"
          disabled={!pages || current <= 1}
          onClick={goPrev}
        />
        <div className="reader-slider">
          <Slider
            value={current}
            min={1}
            max={Math.max(1, total)}
            disabled={!pages}
            onChange={event => setCurrent(event.value as number)}
            onSlideEnd={event => goTo(event.value as number)}
          />
        </div>
        <ReaderIconButton
          icon={settings.rtl ? 'pi-chevron-left' : 'pi-chevron-right'}
          title="Next page"
          disabled={!pages || current >= total}
          onClick={goNext}
        />
        <span className="reader-footer-label">
          {total > 0 ? (
            <>
              Page <strong>{current}</strong> / {total}
            </>
          ) : (
            '—'
          )}
        </span>
        <span className="reader-footer-label">
          <strong>{total > 0 ? formatPercent(pagePercentage(current, total)) : '0%'}</strong>
        </span>
      </footer>
    </div>
  );
}
