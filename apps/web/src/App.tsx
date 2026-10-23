import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import RequireAuth from './auth/RequireAuth';
import AppLayout from './layout/AppLayout';
import AuthorBrowserPage from './pages/AuthorBrowserPage';
import AuthorDetailPage from './pages/AuthorDetailPage';
import BookBrowserPage from './pages/BookBrowserPage';
import BookDetailPage from './pages/BookDetailPage';
import LoginPage from './pages/LoginPage';
import ReaderPage from './readers/ReaderPage';
import SeriesBrowserPage from './pages/SeriesBrowserPage';
import SeriesPage from './pages/SeriesPage';
import SettingsPage from './pages/SettingsPage';
import SetupPage from './pages/SetupPage';

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/setup" element={<SetupPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route element={<RequireAuth />}>
          <Route element={<AppLayout />}>
            <Route path="/" element={<Navigate to="/all-books" replace />} />
            <Route path="/all-books" element={<BookBrowserPage />} />
            <Route path="/library/:libraryId/books" element={<BookBrowserPage />} />
            <Route path="/shelf/:shelfId/books" element={<BookBrowserPage />} />
            <Route path="/unshelved-books" element={<BookBrowserPage />} />
            <Route path="/series" element={<SeriesBrowserPage />} />
            <Route path="/series/:seriesName" element={<SeriesPage />} />
            <Route path="/authors" element={<AuthorBrowserPage />} />
            <Route path="/author/:authorId" element={<AuthorDetailPage />} />          <Route path="/book/:bookId" element={<BookDetailPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          </Route>
          {/* Readers render fullscreen, outside the app layout. */}
          <Route path="/read/:bookId" element={<ReaderPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
