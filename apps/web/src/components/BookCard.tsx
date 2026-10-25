import { useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { Avatar } from 'primereact/avatar';
import { Card } from 'primereact/card';
import { Checkbox } from 'primereact/checkbox';
import { ProgressBar } from 'primereact/progressbar';
import { Skeleton } from 'primereact/skeleton';
import { Tag } from 'primereact/tag';
import { bookProgressPercent, coverUrl } from '../api/types';
import type { Book } from '../api/types';
import { READ_STATUS_ICONS, READ_STATUS_LABELS } from '../utils/format';

const COVER_RATIO: CSSProperties = { aspectRatio: '2 / 3' };
const TWO_LINES: CSSProperties = {
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden'
};

export function CoverPlaceholder({ label, icon = 'pi-book' }: { label?: string; icon?: string }) {
  return (
    <div className="flex flex-column align-items-center justify-content-center gap-2 w-full h-full p-3 text-center text-sm surface-200 text-color-secondary">
      <i className={`pi ${icon} text-4xl`} />
      {label && <span>{label.slice(0, 60)}</span>}
    </div>
  );
}

export default function BookCard({
  book,
  selected,
  selectionEnabled = true,
  badge,
  onToggleSelect
}: {
  book: Book;
  selected: boolean;
  selectionEnabled?: boolean;
  /** Small label pinned to the top-left of the cover (e.g. a series number). */
  badge?: string;
  onToggleSelect?: (book: Book, checked: boolean) => void;
}) {
  const navigate = useNavigate();
  const [coverFailed, setCoverFailed] = useState(false);
  const title = book.metadata.title ?? book.fileName;
  const author = book.metadata.authors?.[0];
  const progress = bookProgressPercent(book);
  const cover = coverUrl(book);
  const open = () => navigate(`/book/${book.id}`);

  const header = (
    <div
      className="relative overflow-hidden cursor-pointer"
      style={COVER_RATIO}
      onClick={open}
      role="button"
      tabIndex={0}
      aria-label={`Open ${title}`}
      onKeyDown={event => {
        if (event.key === 'Enter') open();
      }}
    >
      {cover && !coverFailed ? (
        <img
          src={cover}
          alt={title}
          loading="lazy"
          className="block w-full h-full"
          style={{ objectFit: 'cover' }}
          onError={() => setCoverFailed(true)}
        />
      ) : (
        <CoverPlaceholder label={title} />
      )}

      {selectionEnabled && (
        <div
          className="absolute top-0 left-0 m-2 p-1 flex surface-card border-round shadow-2"
          onClick={event => event.stopPropagation()}
        >
          <Checkbox
            checked={selected}
            onChange={event => onToggleSelect?.(book, Boolean(event.checked))}
            aria-label={`Select ${title}`}
          />
        </div>
      )}
      {badge && <Tag value={badge} severity="contrast" className="absolute top-0 left-0 m-2 text-xs" />}

      <Avatar
        icon={READ_STATUS_ICONS[book.readStatus] ?? 'pi pi-circle'}
        shape="circle"
        size="normal"
        title={READ_STATUS_LABELS[book.readStatus] ?? book.readStatus}
        className="absolute top-0 right-0 m-2 shadow-2"
      />
      {book.primaryFile?.bookType && (
        <Tag
          value={book.primaryFile.bookType}
          severity="contrast"
          className="absolute left-0 m-2 text-xs"
          style={{ bottom: progress > 0 ? '0.25rem' : 0 }}
        />
      )}
      {progress > 0 && (
        <ProgressBar
          value={progress}
          showValue={false}
          className="absolute bottom-0 left-0 w-full border-noround"
          style={{ height: '0.3rem' }}
        />
      )}
    </div>
  );

  return (
    <Card
      header={header}
      className={`overflow-hidden border-2 hover:shadow-4 ${selected ? 'border-primary' : 'border-transparent'}`}
      pt={{ body: { className: 'p-2' }, content: { className: 'p-0' } }}
    >
      <div className="font-semibold text-sm line-height-2" style={TWO_LINES} title={title}>
        {title}
      </div>
      {author && (
        <div
          className="text-color-secondary text-xs mt-1 white-space-nowrap overflow-hidden text-overflow-ellipsis"
          title={author}
        >
          {author}
        </div>
      )}
    </Card>
  );
}

export function BookCardSkeleton() {
  return (
    <Card header={<Skeleton width="100%" height="14rem" borderRadius="0" />} pt={{ body: { className: 'p-2' }, content: { className: 'p-0' } }}>
      <Skeleton width="80%" height="0.9rem" />
      <Skeleton width="55%" height="0.8rem" className="mt-2" />
    </Card>
  );
}
