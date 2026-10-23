import { useMemo } from 'react';
import {
  PDFViewer,
  type PDFViewerConfig,
  type PluginRegistry,
  type ScrollPlugin
} from '@embedpdf/react-pdf-viewer';
import { fileUrl, type Book } from '../api/types';
import { tokenStore } from '../api/client';
import { useProgressSaver } from './progress';
import { clampPage, pagePercentage } from './readerUtils';
import wasmUrl from './pdfiumWasm';

/**
 * PDF reader built on EmbedPDF. It fills the app layout (below the topbar,
 * beside the sidebar) rather than covering the viewport, so its route lives
 * under <AppLayout /> (see App.tsx).
 */
export default function PdfReader({ book }: { book: Book }) {
  const saver = useProgressSaver(book.id);
  const startPage = book.pdfProgress?.page ?? 1;

  // The config object is read once when the viewer mounts. PdfReader is keyed
  // by book id (see ReaderPage), so a new book always gets a fresh viewer.
  const config = useMemo<PDFViewerConfig>(() => {
    const token = tokenStore.access;
    return {
      wasmUrl,
      theme: { preference: 'light' },
      tabBar: 'never',
      // Hide these toolbar tabs / menu entries (and the features behind them).
      disabledCategories: [
        'document-open',
        'document-close',
        'document-print',
        'document-protect',
        'security',
        'mode-shapes',
        'mode-insert',
        'mode-form',
        'mode-redact',
        'insert',
        'form',
        'redaction'
      ],
      documentManager: {
        initialDocuments: [
          {
            url: fileUrl(book.id),
            name: book.fileName,
            // Our file endpoint is range-capable and needs the bearer token.
            requestOptions: token ? { headers: { Authorization: `Bearer ${token}` } } : undefined
          }
        ]
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book.id]);

  const handleReady = (registry: PluginRegistry) => {
    const scroll = registry.getPlugin<ScrollPlugin>('scroll')?.provides();
    if (!scroll) return;

    // Restore the saved page once the first layout is ready.
    scroll.onLayoutReady(event => {
      if (!event.isInitial) return;
      const target = clampPage(startPage, event.totalPages);
      if (target > 1) scroll.scrollToPage({ pageNumber: target, behavior: 'instant' });
    });

    // Persist progress (debounced inside the saver) as the page changes.
    scroll.onPageChange(event => {
      saver.save({
        pdfProgress: {
          page: event.pageNumber,
          percentage: pagePercentage(event.pageNumber, event.totalPages)
        }
      });
    });
  };

  return (
    <div className="pdf-page">
      <PDFViewer config={config} style={{ width: '100%', height: '100%' }} onReady={handleReady} />
    </div>
  );
}
