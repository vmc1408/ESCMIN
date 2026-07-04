import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import React, { Component, ReactNode, ErrorInfo } from 'react';
import { Layout } from './components/Layout';
// ... other imports repeated here for context if needed, but I'll replace the block
import { Dashboard } from './pages/Dashboard';
import { Students } from './pages/Students';
import { Teachers } from './pages/Teachers';
import { Classes } from './pages/Classes';
import { Subjects } from './pages/Subjects';
import { AcademicCalendar } from './pages/AcademicCalendar';
import { Attendance } from './pages/Attendance';
import { Grades } from './pages/Grades';
import { Assessments } from './pages/Assessments';
import { Bulletin } from './pages/Bulletin';
import { Documents } from './pages/Documents';
import { Impressos } from './pages/Impressos';
import { StudentFicha } from './pages/StudentFicha';
import { Diocese } from './pages/Diocese';
import { Import } from './pages/Import';
import { Reports } from './pages/Reports';
import { Contributions } from './pages/Contributions';
import { PixConference } from './pages/PixConference';
import { Receipts } from './pages/Receipts';
import { Settings } from './pages/Settings';
import { BackupPage } from './pages/Backup';
import { ArchivePage } from './pages/Archive';
import { Users } from './pages/Users';
import { Login } from './pages/Login';
import { ImportProvider } from './contexts/ImportContext';
import { AuthProvider } from './contexts/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { GlobalImportOverlay } from './components/GlobalImportOverlay';
import { PinLock } from './components/PinLock';
import { AlertCircle, RefreshCw, Unplug } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = {
    hasError: false,
    error: null
  };

  constructor(props: ErrorBoundaryProps) {
    super(props);
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Critical Application Error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6 font-sans">
          <div className="max-w-md w-full bg-white p-8 rounded-2xl shadow-xl border border-slate-200 text-center">
            <div className="w-16 h-16 bg-red-100 text-red-600 rounded-xl flex items-center justify-center mx-auto mb-6 border border-red-200">
              <AlertCircle size={32} />
            </div>
            <h1 className="text-xl font-bold text-slate-900 mb-4 uppercase">Erro Crítico</h1>
            <p className="text-slate-500 text-sm mb-8">
              Ocorreu um erro inesperado ao carregar o sistema. Isso pode ser causado por falha na conexão ou erro de renderização.
            </p>
            <div className="bg-slate-100 p-4 rounded-lg mb-8 text-left overflow-auto max-h-40 border border-slate-200">
              <code className="text-[10px] text-red-600 font-mono font-semibold block whitespace-pre-wrap">
                {this.state.error?.name}: {this.state.error?.message}
              </code>
            </div>
            <button 
              onClick={() => {
                localStorage.clear();
                sessionStorage.clear();
                window.location.reload();
              }}
              className="w-full py-4 bg-slate-900 text-white rounded-lg font-semibold text-xs uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-black transition-all shadow-lg active:scale-95"
            >
              <RefreshCw size={18} />
              Resetar e Recarregar
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

import { useAuth } from './contexts/AuthContext';
import { isSupabaseConfigured } from './lib/supabase';

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </ErrorBoundary>
  );
}

function AppContent() {
  const { isConnected, connError } = useAuth();
  const [showDiagnostic, setShowDiagnostic] = React.useState(false);

  React.useEffect(() => {
    let timer: any;
    if (!isConnected) {
      timer = setTimeout(() => setShowDiagnostic(true), 15000);
    } else {
      setShowDiagnostic(false);
    }
    return () => clearTimeout(timer);
  }, [isConnected]);

  if (!isSupabaseConfigured) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6 text-center font-sans">
        <div className="max-w-md w-full bg-white p-8 rounded-xl shadow-lg border border-slate-200">
          <div className="w-16 h-16 bg-amber-50 text-amber-600 rounded-lg flex items-center justify-center mx-auto mb-6 border border-amber-100">
            <Unplug size={32} />
          </div>
          <h1 className="text-xl font-bold text-slate-800 mb-4 uppercase tracking-snug">Configurações Pendentes</h1>
          <p className="text-slate-500 text-sm mb-8 leading-relaxed font-medium">
            O sistema ainda não foi configurado com o banco de dados. Por favor, adicione as chaves <code className="bg-slate-100 px-1.5 py-0.5 rounded text-red-600 font-bold font-mono">VITE_SUPABASE_URL</code> e <code className="bg-slate-100 px-1.5 py-0.5 rounded text-red-600 font-bold font-mono">VITE_SUPABASE_ANON_KEY</code> no painel de Segredos (Settings) do AI Studio.
          </p>
          <button 
            onClick={() => window.location.reload()}
            className="w-full py-3 bg-blue-600 text-white rounded-lg font-bold text-xs uppercase tracking-wider hover:bg-blue-700 transition-all shadow-sm active:scale-95"
          >
            Tentar Novamente
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <PinLock />
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
              <Route path="students" element={<ProtectedRoute requiredModule="/students"><Students /></ProtectedRoute>} />
              <Route path="teachers" element={<ProtectedRoute requiredModule="/teachers"><Teachers /></ProtectedRoute>} />
              <Route path="classes" element={<ProtectedRoute requiredModule="/classes"><Classes /></ProtectedRoute>} />
              <Route path="subjects" element={<ProtectedRoute requiredModule="/subjects"><Subjects /></ProtectedRoute>} />
              <Route path="calendar" element={<ProtectedRoute requiredModule="/calendar"><AcademicCalendar /></ProtectedRoute>} />
              <Route path="attendance" element={<ProtectedRoute requiredModule="/attendance"><Attendance initialMode="marking" /></ProtectedRoute>} />
              <Route path="monthly-attendance" element={<ProtectedRoute requiredModule="/attendance"><Attendance initialMode="monthly" /></ProtectedRoute>} />
              <Route path="grades" element={<ProtectedRoute requiredModule="/grades"><Grades /></ProtectedRoute>} />
              <Route path="assessments" element={<ProtectedRoute requiredModule="/assessments"><Assessments /></ProtectedRoute>} />
              <Route path="bulletin" element={<ProtectedRoute requiredModule="/grades"><Bulletin /></ProtectedRoute>} />
              <Route path="documents" element={<ProtectedRoute requiredModule="/documents"><Documents /></ProtectedRoute>} />
              <Route path="impressos" element={<ProtectedRoute requiredModule="/documents"><Impressos /></ProtectedRoute>} />
              <Route path="student-ficha" element={<ProtectedRoute requiredModule="/students"><StudentFicha /></ProtectedRoute>} />
              <Route path="parishes" element={<ProtectedRoute requiredModule="/parishes"><Diocese /></ProtectedRoute>} />
              <Route path="import" element={<ProtectedRoute requiredModule="/import"><Import /></ProtectedRoute>} />
              <Route path="reports" element={<ProtectedRoute requiredModule="/reports"><Reports /></ProtectedRoute>} />
              <Route path="contributions" element={<ProtectedRoute requiredModule="/contributions"><Contributions /></ProtectedRoute>} />
              <Route path="pix-conference" element={<ProtectedRoute requiredModule="/pix-conference"><PixConference /></ProtectedRoute>} />
              <Route path="receipts" element={<ProtectedRoute requiredModule="/receipts"><Receipts /></ProtectedRoute>} />
              <Route path="settings" element={<ProtectedRoute requiredModule="/settings"><Settings /></ProtectedRoute>} />
              <Route path="backup" element={<ProtectedRoute requiredModule="/settings"><BackupPage /></ProtectedRoute>} />
              <Route path="archive" element={<ProtectedRoute requiredModule="/settings"><ArchivePage /></ProtectedRoute>} />
              <Route path="users" element={<ProtectedRoute requiredModule="/users"><Users /></ProtectedRoute>} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
          <GlobalImportOverlay />
        </Router>
      </ImportProvider>
    </>
  );
}
