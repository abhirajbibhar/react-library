import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from 'primereact/button';
import { bookProgressPercent } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import BookCard from '../components/BookCard';
import BookRow from '../components/BookRow';
import QuoteCard from '../components/QuoteCard';
import SectionCard from '../components/SectionCard';
import StreakCard, { Stat } from '../components/StreakCard';
import { EmptyState, LoadingState } from '../components/States';
import TodayPlanCard from '../components/TodayPlanCard';
import { useBooks } from '../hooks/useApi';
import { useActivity } from '../hooks/useJournal';
import { formatDuration, formatLongDate, greeting, todayKey } from '../utils/dates';
import { computeStreaks } from '../utils/streak';

const READABLE = new Set(['EPUB', 'PDF', 'CBX']);

export default function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data: books, isLoading } = useBooks();
  const { data: activity } = useActivity();
  const today = todayKey();

  const stats = useMemo(() => computeStreaks(activity ?? {}, today), [activity, today]);
  const todaySeconds = activity?.[today]?.seconds ?? 0;
  const todayBooks = Object.keys(activity?.[today]?.books ?? {}).length;

  const continueReading = useMemo(
    () =>
      (books ?? [])
        .filter(b => b.lastReadTime && b.readStatus !== 'READ' && bookProgressPercent(b) > 0 && bookProgressPercent(b) < 100)
        .sort((a, b) => (b.lastReadTime ?? '').localeCompare(a.lastReadTime ?? ''))
        .slice(0, 10),
    [books]
  );
  const recentlyAdded = useMemo(
    () => [...(books ?? [])].sort((a, b) => b.addedOn.localeCompare(a.addedOn)).slice(0, 12),
    [books]
  );
  const readingNow = (books ?? []).filter(b => b.readStatus === 'READING' || b.readStatus === 'RE_READING').length;

  const name = (user?.name || user?.username || '').split(' ')[0];

  return (
    <div className="grid">
      <div className="col-12 lg:col-8">
        <SectionCard className="h-full" title={formatLongDate(today)} icon="pi-calendar">
          <h1 className="m-0 mb-1 text-3xl font-semibold">
            {greeting(new Date().getHours())}
            {name ? `, ${name}` : ''}
          </h1>
          <p className="m-0 mb-4 text-color-secondary">
            {stats.readToday
              ? 'Nice work, you have read today. Keep it going.'
              : stats.current > 0
                ? `You are on a ${stats.current}-day streak. A few pages today keeps it alive.`
                : 'A few pages today is a great place to begin.'}
          </p>
          <div className="grid">
            <div className="col-6 md:col-3">
              <Stat label="Read today" value={formatDuration(todaySeconds)} icon="pi-clock" />
            </div>
            <div className="col-6 md:col-3">
              <Stat label="Books today" value={todayBooks} icon="pi-book" />
            </div>
            <div className="col-6 md:col-3">
              <Stat label="Streak" value={`${stats.current}d`} icon="pi-bolt" />
            </div>
            <div className="col-6 md:col-3">
              <Stat label="Reading now" value={readingNow} icon="pi-bookmark" />
            </div>
          </div>
        </SectionCard>
      </div>
      <div className="col-12 lg:col-4">
        <QuoteCard />
      </div>

      <div className="col-12 lg:col-8">
        <SectionCard className="h-full" title="Continue reading" icon="pi-play">
          {isLoading ? (
            <LoadingState />
          ) : continueReading.length === 0 ? (
            <EmptyState icon="pi-book" message="Books you start reading will show up here." />
          ) : (
            <BookRow>
              {continueReading.map(book => (
                <div key={book.id} className="flex flex-column gap-2">
                  <BookCard book={book} selected={false} selectionEnabled={false} />
                  {READABLE.has(book.primaryFile?.bookType ?? '') && (
                    <Button
                      label="Continue"
                      icon="pi pi-book"
                      size="small"
                      outlined
                      onClick={() => navigate(`/read/${book.id}`)}
                    />
                  )}
                </div>
              ))}
            </BookRow>
          )}
        </SectionCard>
      </div>
      <div className="col-12 lg:col-4">
        <TodayPlanCard />
      </div>

      <div className="col-12 lg:col-8">
        <SectionCard
          className="h-full"
          title="Recently added"
          icon="pi-plus-circle"
          action={<Button label="All books" link size="small" onClick={() => navigate('/all-books')} />}
        >
          {isLoading ? (
            <LoadingState />
          ) : recentlyAdded.length === 0 ? (
            <EmptyState icon="pi-upload" message="Upload your first book to see it here." />
          ) : (
            <BookRow>
              {recentlyAdded.map(book => (
                <BookCard key={book.id} book={book} selected={false} selectionEnabled={false} />
              ))}
            </BookRow>
          )}
        </SectionCard>
      </div>
      <div className="col-12 lg:col-4">
        <StreakCard className="h-full" />
      </div>
    </div>
  );
}
