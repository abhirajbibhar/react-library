import JSZip from 'jszip';
import * as pdfjs from 'pdfjs-dist';
import type { Metadata } from '../api/types';

pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();

export interface ExtractedInfo {
  metadata: Metadata;
  cover?: Blob;
}

const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif'];

const COVER_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  avif: 'image/avif'
};

const extOf = (name: string) => (name.split('.').pop() ?? '').toLowerCase();

const stripHtml = (value: string | null | undefined): string | undefined => {
  if (!value) return undefined;
  const decoded = value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .trim();
  return decoded || undefined;
};

const titleFromFileName = (fileName: string): string => fileName.replace(/\.[^.]+$/, '');

function resolveRelative(opfPath: string, relative: string): string {
  const base = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : '';
  const segments: string[] = [];
  for (const part of (base + relative).split('/')) {
    if (part === '..') segments.pop();
    else if (part !== '.' && part !== '') segments.push(part);
  }
  return segments.join('/');
}

/* --------------------------------- EPUB -------------------------------- */

async function extractEpub(file: File): Promise<ExtractedInfo> {
  const zip = await JSZip.loadAsync(file);
  const metadata: Metadata = { title: titleFromFileName(file.name) };

  const containerFile = zip.file('META-INF/container.xml');
  const opfPath = containerFile
    ? new DOMParser()
        .parseFromString(await containerFile.async('text'), 'application/xml')
        .getElementsByTagName('rootfile')[0]
        ?.getAttribute('full-path')
    : undefined;

  let coverBlob: Blob | undefined;

  if (opfPath) {
    const opfFile = zip.file(opfPath);
    if (opfFile) {
      const doc = new DOMParser().parseFromString(await opfFile.async('text'), 'application/xml');
      const textOf = (tag: string) => doc.getElementsByTagNameNS('*', tag)[0]?.textContent?.trim() || undefined;

      const title = textOf('title');
      if (title) metadata.title = title;
      const subtitle = textOf('subtitle');
      if (subtitle) metadata.subtitle = subtitle;

      const authors = [...doc.getElementsByTagNameNS('*', 'creator')]
        .map(creator => creator.textContent?.trim())
        .filter((value): value is string => Boolean(value));
      if (authors.length > 0) metadata.authors = authors;

      const description = stripHtml(textOf('description'));
      if (description) metadata.description = description;
      const publisher = textOf('publisher');
      if (publisher) metadata.publisher = publisher;
      const date = textOf('date');
      if (date) metadata.publishedDate = date.slice(0, 10);
      const language = textOf('language');
      if (language) metadata.language = language;

      const categories = [...doc.getElementsByTagNameNS('*', 'subject')]
        .map(subject => subject.textContent?.trim())
        .filter((value): value is string => Boolean(value));
      if (categories.length > 0) metadata.categories = categories;

      // Calibre-style series tags
      const metas = [...doc.getElementsByTagName('meta')];
      const seriesMeta = metas.find(meta => meta.getAttribute('name') === 'calibre:series');
      const seriesIndexMeta = metas.find(meta => meta.getAttribute('name') === 'calibre:series_index');
      const seriesName = seriesMeta?.getAttribute('content')?.trim();
      if (seriesName) {
        metadata.seriesName = seriesName;
        const index = Number(seriesIndexMeta?.getAttribute('content'));
        metadata.seriesNumber = Number.isFinite(index) ? index : null;
      }

      // Cover: <meta name="cover" content="manifest-id"/> or properties="cover-image"
      let coverHref: string | undefined;
      const coverMeta = metas.find(meta => meta.getAttribute('name') === 'cover');
      const coverId = coverMeta?.getAttribute('content');
      const manifestItems = [...doc.getElementsByTagNameNS('*', 'item')];
      if (coverId) {
        coverHref = manifestItems.find(item => item.getAttribute('id') === coverId)?.getAttribute('href') ?? undefined;
      }
      if (!coverHref) {
        coverHref =
          manifestItems.find(item => (item.getAttribute('properties') ?? '').includes('cover-image'))?.getAttribute('href') ??
          undefined;
      }
      if (!coverHref) {
        // Fall back to the largest image in the archive whose name mentions cover.
        const candidates = Object.keys(zip.files).filter(
          path => IMAGE_EXTENSIONS.includes(extOf(path)) && /cover/i.test(path)
        );
        coverHref = candidates[0];
      }
      if (coverHref) {
        const coverPath = coverHref.startsWith('/') ? coverHref.slice(1) : resolveRelative(opfPath, coverHref);
        const entry = zip.file(coverPath);
        if (entry) {
          const bytes = await entry.async('uint8array');
          coverBlob = new Blob([bytes as unknown as BlobPart], { type: COVER_MIME[extOf(coverPath)] ?? 'image/jpeg' });
        }
      }
    }
  }

  return { metadata, cover: coverBlob };
}

/* ---------------------------------- PDF --------------------------------- */

async function extractPdf(file: File): Promise<ExtractedInfo> {
  const metadata: Metadata = { title: titleFromFileName(file.name) };
  let coverBlob: Blob | undefined;

  const data = await file.arrayBuffer();
  const loadingTask = pdfjs.getDocument({ data });
  try {
    const pdfDoc = await loadingTask.promise;
    const info = (await pdfDoc.getMetadata()).info as {
      Title?: string;
      Author?: string;
      Subject?: string;
      Keywords?: string;
    };
    if (info.Title?.trim()) metadata.title = info.Title.trim();
    if (info.Author?.trim()) metadata.authors = info.Author.split(/[,;&]/).map(a => a.trim()).filter(Boolean);
    if (info.Subject?.trim()) metadata.description = info.Subject.trim();
    if (info.Keywords?.trim()) {
      metadata.categories = info.Keywords.split(/[,;]/).map(k => k.trim()).filter(Boolean);
    }

    try {
      const page = await pdfDoc.getPage(1);
      const baseViewport = page.getViewport({ scale: 1 });
      const scale = Math.min(1, 800 / baseViewport.width);
      const viewport = page.getViewport({ scale });
      const canvas = window.document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext('2d');
      if (context) {
        await page.render({ canvas, canvasContext: context, viewport } as never).promise;
        coverBlob = await new Promise<Blob | undefined>(resolve =>
          canvas.toBlob((blob: Blob | null) => resolve(blob ?? undefined), 'image/jpeg', 0.85)
        );
      }
      page.cleanup();
    } catch {
      // A password-protected or corrupt first page simply has no cover.
    }
  } catch {
    // Unparseable PDF: fall back to filename metadata, upload proceeds.
  }
  void loadingTask;
  return { metadata, cover: coverBlob };
}

/* ---------------------------------- CBX --------------------------------- */

async function extractCbx(file: File): Promise<ExtractedInfo> {
  const metadata: Metadata = { title: titleFromFileName(file.name) };
  try {
    const zip = await JSZip.loadAsync(file);
    const firstImage = Object.keys(zip.files)
      .filter(path => !zip.files[path].dir && IMAGE_EXTENSIONS.includes(extOf(path)))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))[0];
    if (firstImage) {
      const bytes = await zip.files[firstImage].async('uint8array');
      return {
        metadata,
        cover: new Blob([bytes as unknown as BlobPart], { type: COVER_MIME[extOf(firstImage)] ?? 'image/jpeg' })
      };
    }
  } catch {
    // RAR-based CBX cannot be parsed client-side; upload without a cover.
  }
  return { metadata };
}

/* ------------------------------- dispatcher ------------------------------ */

/**
 * Reads embedded metadata and a cover thumbnail from a book file so uploads
 * arrive already described. Unsupported or corrupt files simply upload with a
 * filename-derived title.
 */
export async function extractBookInfo(file: File): Promise<ExtractedInfo> {
  const extension = extOf(file.name);
  try {
    switch (extension) {
      case 'epub':
        return await extractEpub(file);
      case 'pdf':
        return await extractPdf(file);
      case 'cbz':
      case 'zip':
        return await extractCbx(file);
      default:
        return { metadata: { title: titleFromFileName(file.name) } };
    }
  } catch {
    return { metadata: { title: titleFromFileName(file.name) } };
  }
}

export const SUPPORTED_UPLOAD_EXTENSIONS = ['pdf', 'epub', 'cbz', 'cbr', 'zip', 'fb2', 'mobi', 'azw3'];
