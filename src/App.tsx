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
              <Route path="students" element={
                <ProtectedRoute requiredModule="/students">
                  <Students />
                </ProtectedRoute>
              } />
              <Route path="teachers" element={
                <ProtectedRoute requiredModule="/teachers">
                  <Teachers />
                </ProtectedRoute>
              } />
              <Route path="classes" element={
                <ProtectedRoute requiredModule="/classes">
                  <Classes />
                </ProtectedRoute>
              } />
              <Route path="subjects" element={
                <ProtectedRoute requiredModule="/subjects">
                  <Subjects />
                </ProtectedRoute>
              } />
              <Route path="parishes" element={
                <ProtectedRoute requiredModule="/parishes">
                  <Parishes />
                </ProtectedRoute>
              } />
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
              <Route path="contributions" element={
                <ProtectedRoute requiredModule="/contributions">
                  <Contributions />
                </ProtectedRoute>
              } />
              <Route path="pix-conference" element={
                <ProtectedRoute requiredModule="/pix-conference">
                  <PixConference />
                </ProtectedRoute>
              } />
              <Route path="settings" element={
                <ProtectedRoute requiredModule="/settings">
                  <Settings />
                </ProtectedRoute>
              } />
              <Route path="users" element={
                <ProtectedRoute requiredModule="/users">
                  <Users />
                </ProtectedRoute>
              } />
            </Route>
          </Routes>
          <GlobalImportOverlay />
        </Router>
      </ImportProvider>
    </AuthProvider>
  );
}
