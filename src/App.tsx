import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { Students } from './pages/Students';
import { Teachers } from './pages/Teachers';
import { Classes } from './pages/Classes';
import { Subjects } from './pages/Subjects';
import { Parishes } from './pages/Parishes';
import { Import } from './pages/Import';
import { Reports } from './pages/Reports';
import { Contributions } from './pages/Contributions';
import { PixConference } from './pages/PixConference';
import { Settings } from './pages/Settings';
import { Users } from './pages/Users';
import { Login } from './pages/Login';
import { ImportProvider } from './contexts/ImportContext';
import { AuthProvider } from './contexts/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { GlobalImportOverlay } from './components/GlobalImportOverlay';

export default function App() {
  return (
    <AuthProvider>
      <ImportProvider>
        <Router>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }>
              <Route index element={<Dashboard />} />
              <Route path="students" element={<Students />} />
              <Route path="teachers" element={<Teachers />} />
              <Route path="classes" element={<Classes />} />
              <Route path="subjects" element={<Subjects />} />
              <Route path="parishes" element={<Parishes />} />
              <Route path="import" element={
                <ProtectedRoute requiredModule="/import">
                  <Import />
                </ProtectedRoute>
              } />
              <Route path="reports" element={
                <ProtectedRoute requiredModule="/reports">
                  <Reports />
                </ProtectedRoute>
              } />
              <Route path="contributions" element={<Contributions />} />
              <Route path="pix-conference" element={<PixConference />} />
              <Route path="settings" element={<Settings />} />
              <Route path="users" element={<Users />} />
            </Route>
          </Routes>
          <GlobalImportOverlay />
        </Router>
      </ImportProvider>
    </AuthProvider>
  );
}
