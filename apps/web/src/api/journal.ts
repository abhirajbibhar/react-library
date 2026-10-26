export type NoteType = 'highlight' | 'note';
export const NOTE_COLORS = ['yellow', 'green', 'blue', 'pink', 'purple'] as const;
export type NoteColor = (typeof NOTE_COLORS)[number];

export interface Note {
  id: number;
  bookId: number;
  type: NoteType;
  quote: string;
  text: string;
  color: NoteColor;
  location?: string;
  chapter?: string;
  percentage?: number;
  createdAt: string;
  updatedAt: string;
}

export interface NoteInput {
  bookId: number;
  type: NoteType;
  quote: string;
  text: string;
  color: NoteColor;
  location?: string;
  chapter?: string;
  percentage?: number;
}

export type Mood = 'great' | 'good' | 'okay' | 'low';

export interface TodoItem {
  id: string;
  text: string;
  done: boolean;
}

export interface NotebookEntry {
  date: string;
  todos: TodoItem[];
  mood: Mood | null;
  reflection: string;
  thoughts: string;
  updatedAt: string;
}

export interface NotebookMonth {
  month: string;
  days: Record<string, NotebookEntry>;
}

export interface BookDayActivity {
  seconds: number;
  startPct: number;
  endPct: number;
}

export interface ActivityDay {
  seconds: number;
  books: Record<string, BookDayActivity>;
}

export type ActivityDays = Record<string, ActivityDay>;
