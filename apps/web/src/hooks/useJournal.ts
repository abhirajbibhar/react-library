import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import type { ActivityDays, Note, NoteInput, NotebookEntry, NotebookMonth } from '../api/journal';

export const journalKeys = {
  notes: ['notes'] as const,
  activity: ['activity'] as const,
  notebook: (month: string) => ['notebook', month] as const
};

/* --------------------------------- notes --------------------------------- */

export function useNotes() {
  return useQuery({
    queryKey: journalKeys.notes,
    queryFn: () => api.get<Note[]>('/api/v1/notes')
  });
}

export function useCreateNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: NoteInput) => api.post<Note>('/api/v1/notes', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: journalKeys.notes })
  });
}

export function useUpdateNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...patch }: Partial<Pick<Note, 'quote' | 'text' | 'color'>> & { id: number }) =>
      api.put<Note>(`/api/v1/notes/${id}`, patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: journalKeys.notes })
  });
}

export function useDeleteNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete<void>(`/api/v1/notes/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: journalKeys.notes })
  });
}

/* -------------------------------- activity -------------------------------- */

export function useActivity() {
  return useQuery({
    queryKey: journalKeys.activity,
    queryFn: async () => (await api.get<{ days: ActivityDays }>('/api/v1/activity')).days,
    staleTime: 30_000
  });
}

/* -------------------------------- notebook -------------------------------- */

export function useNotebookMonth(month: string) {
  return useQuery({
    queryKey: journalKeys.notebook(month),
    queryFn: () => api.get<NotebookMonth>(`/api/v1/notebook?month=${month}`),
    staleTime: 60_000
  });
}

export const emptyEntry = (date: string): NotebookEntry => ({
  date,
  todos: [],
  mood: null,
  reflection: '',
  thoughts: '',
  updatedAt: ''
});

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';
type EntryPatch = Partial<Omit<NotebookEntry, 'date' | 'updatedAt'>>;

/**
 * One notebook day with optimistic local edits and a debounced save, so typing
 * never waits on the network. Pending edits are flushed when the day changes
 * or the page unmounts.
 */
export function useNotebookDay(date: string) {
  const month = date.slice(0, 7);
  const queryClient = useQueryClient();
  const query = useNotebookMonth(month);
  const [status, setStatus] = useState<SaveStatus>('idle');
  const timer = useRef<number | undefined>(undefined);
  const pending = useRef<NotebookEntry | null>(null);

  const entry = query.data?.days[date] ?? emptyEntry(date);

  const flush = useCallback(async () => {
    window.clearTimeout(timer.current);
    const toSave = pending.current;
    if (!toSave) return;
    pending.current = null;
    setStatus('saving');
    try {
      await api.put(`/api/v1/notebook/${toSave.date}`, toSave);
      setStatus('saved');
    } catch {
      setStatus('error');
    }
  }, []);

  const update = useCallback(
    (patch: EntryPatch) => {
      const key = journalKeys.notebook(month);
      const current = queryClient.getQueryData<NotebookMonth>(key)?.days[date] ?? emptyEntry(date);
      const next: NotebookEntry = { ...current, ...patch, updatedAt: new Date().toISOString() };
      queryClient.setQueryData<NotebookMonth>(key, old => ({
        month,
        days: { ...(old?.days ?? {}), [date]: next }
      }));
      pending.current = next;
      setStatus('saving');
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => void flush(), 700);
    },
    [date, month, queryClient, flush]
  );

  useEffect(() => {
    setStatus('idle');
    return () => {
      void flush();
    };
  }, [date, flush]);

  return { entry, update, status, isLoading: query.isLoading };
}
