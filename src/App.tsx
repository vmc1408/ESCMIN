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
import { Documents } from './pages/Documents';
import { Diocese } from './pages/Diocese';
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
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 font-sans">
          <div className="max-w-md w-full bg-white p-8 rounded-3xl shadow-2xl border border-red-100 text-center">
            <div className="w-16 h-16 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <AlertCircle size={32} />
            </div>
            <h1 className="text-xl font-black text-[#00174b] mb-4 uppercase">Erro Crítico</h1>
            <p className="text-slate-500 text-sm mb-8">
              Ocorreu um erro inesperado ao carregar o sistema. Isso pode ser causado por falha na conexão ou erro de renderização.
            </p>
            <div className="bg-slate-50 p-4 rounded-xl mb-8 text-left overflow-auto max-h-40 border border-slate-100">
              <code className="text-[10px] text-red-600 font-mono font-bold block whitespace-pre-wrap">
                {this.state.error?.name}: {this.state.error?.message}
              </code>
            </div>
            <button 
              onClick={() => {
                localStorage.clear();
                sessionStorage.clear();
                window.location.reload();
              }}
              className="w-full py-4 bg-[#00174b] text-white rounded-xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-blue-900 transition-all shadow-lg active:scale-95"
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
      <div className="min-h-screen bg-[#00174b] flex items-center justify-center p-6 text-center font-sans">
        <div className="max-w-md w-full bg-white p-10 rounded-[32px] shadow-2xl">
          <div className="w-20 h-20 bg-amber-50 text-amber-600 rounded-3xl flex items-center justify-center mx-auto mb-8">
            <Unplug size={40} />
          </div>
          <h1 className="text-2xl font-black text-[#00174b] mb-4 uppercase tracking-tight">Configurações Pendentes</h1>
          <p className="text-slate-500 text-sm mb-10 leading-relaxed font-medium">
            O sistema ainda não foi configurado com o banco de dados. Por favor, adicione as chaves <code className="bg-slate-100 px-1.5 py-0.5 rounded text-red-500 font-bold">VITE_SUPABASE_URL</code> e <code className="bg-slate-100 px-1.5 py-0.5 rounded text-red-500 font-bold">VITE_SUPABASE_ANON_KEY</code> no painel de Segredos (Settings) do AI Studio.
          </p>
          <button 
            onClick={() => window.location.reload()}
            className="w-full py-4 bg-[#00174b] text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-blue-900 transition-all shadow-lg"
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
            <Route path="/login" element={<Navigate to="/" replace />} />
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
              <Route path="attendance" element={<ProtectedRoute requiredModule="/attendance"><Attendance /></ProtectedRoute>} />
              <Route path="grades" element={<ProtectedRoute requiredModule="/grades"><Grades /></ProtectedRoute>} />
              <Route path="documents" element={<ProtectedRoute requiredModule="/documents"><Documents /></ProtectedRoute>} />
              <Route path="parishes" element={<ProtectedRoute requiredModule="/parishes"><Diocese /></ProtectedRoute>} />
              <Route path="import" element={<ProtectedRoute requiredModule="/import"><Import /></ProtectedRoute>} />
              <Route path="reports" element={<ProtectedRoute requiredModule="/reports"><Reports /></ProtectedRoute>} />
              <Route path="contributions" element={<ProtectedRoute requiredModule="/contributions"><Contributions /></ProtectedRoute>} />
              <Route path="pix-conference" element={<ProtectedRoute requiredModule="/pix-conference"><PixConference /></ProtectedRoute>} />
              <Route path="settings" element={<ProtectedRoute requiredModule="/settings"><Settings /></ProtectedRoute>} />
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
