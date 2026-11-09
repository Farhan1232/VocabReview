/** Page routes. Every page shows inside the shared Layout. */
import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { VocabPage } from './pages/vocab/VocabPage';
import { ReviewPage } from './pages/review/ReviewPage';
import { BatchPage } from './pages/batch/BatchPage';
import { StudentsPage } from './pages/students/StudentsPage';
import { StudentDetailPage } from './pages/students/StudentDetailPage';
import { SetsPage } from './pages/sets/SetsPage';
import { ImportPage } from './pages/import/ImportPage';
import { DuplicatesPage } from './pages/duplicates/DuplicatesPage';
import { SettingsPage } from './pages/settings/SettingsPage';

/** Route table of the app. */
export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Navigate to="/vocab" replace />} />
        <Route path="vocab" element={<VocabPage />} />
        <Route path="review" element={<ReviewPage />} />
        <Route path="batch" element={<BatchPage />} />
        <Route path="students" element={<StudentsPage />} />
        <Route path="students/:id" element={<StudentDetailPage />} />
        <Route path="sets" element={<SetsPage />} />
        <Route path="import" element={<ImportPage />} />
        <Route path="duplicates" element={<DuplicatesPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/vocab" replace />} />
      </Route>
    </Routes>
  );
}
