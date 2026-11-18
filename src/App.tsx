import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import React, { Component, ReactNode, ErrorInfo, Suspense, lazy, ComponentType } from 'react';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { ResetPassword } from './pages/ResetPassword';
import { ImportProvider } from './contexts/ImportContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { UnitProvider } from './contexts/UnitContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { GlobalImportOverlay } from './components/GlobalImportOverlay';
import { PinLock } from './components/PinLock';
import { InactivityWarningModal } from './components/InactivityWarningModal';
import { GlobalTooltipProvider } from './components/GlobalTooltipProvider';
import { isSupabaseConfigured, clearCorruptedAuthTokens } from './lib/supabase';
import { AlertCircle, RefreshCw, Unplug } from 'lucide-react';

const CHUNK_RELOAD_KEY = 'escmin_chunk_reload_at';
const CHUNK_RELOAD_COOLDOWN_MS = 15000;

export function isChunkLoadError(error: unknown): boolean {
  const msg = (
    typeof error === 'string'
      ? error
      : (error as any)?.message || String(error || '')
  ).toLowerCase();

  return (
    msg.includes('failed to fetch dynamically imported module') ||
    msg.includes('error loading dynamically imported module') ||
    msg.includes('importing a module script failed') ||
    msg.includes('unable to preload css') ||
    msg.includes('chunkloaderror') ||
    msg.includes('loading chunk')
  );
}

function forceCacheBustedReload(): void {
  if (typeof window === 'undefined') return;
  try {
    const url = new URL(window.location.href);
    url.searchParams.set('_r', String(Date.now()));
    window.location.replace(url.toString());
  } catch {
    window.location.reload();
  }
}

function reloadOnceForChunkError(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const lastReloadRaw = sessionStorage.getItem(CHUNK_RELOAD_KEY);
    const lastReloadAt = lastReloadRaw ? Number(lastReloadRaw) : 0;
    if (lastReloadAt && Date.now() - lastReloadAt < CHUNK_RELOAD_COOLDOWN_MS) {
      return false;
    }
    sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()));
    forceCacheBustedReload();
    return true;
  } catch {
    return false;
  }
}

function lazyWithRetry<T extends ComponentType<any>>(
  importer: () => Promise<{ default: T }>
) {
  return lazy(() =>
    importer().catch((err) => {
      if (isChunkLoadError(err) && reloadOnceForChunkError()) {
        // Mantém a Suspense ativa brevemente enquanto a página recarrega com o novo build
        return new Promise<{ default: T }>(() => {});
      }
      throw err;
    })
  );
}

// Code-splitting por módulo com auto-recuperação pós-deploy (carregamento sob demanda das páginas autenticadas)
const Dashboard = lazyWithRetry(() => import('./pages/Dashboard').then((m) => ({ default: m.Dashboard })));
const Students = lazyWithRetry(() => import('./pages/Students').then((m) => ({ default: m.Students })));
const Teachers = lazyWithRetry(() => import('./pages/Teachers').then((m) => ({ default: m.Teachers })));
const Courses = lazyWithRetry(() => import('./pages/Courses').then((m) => ({ default: m.Courses })));
const Classes = lazyWithRetry(() => import('./pages/Classes').then((m) => ({ default: m.Classes })));
const Subjects = lazyWithRetry(() => import('./pages/Subjects').then((m) => ({ default: m.Subjects })));
const CadastrosRelatorios = lazyWithRetry(() => import('./pages/CadastrosRelatorios').then((m) => ({ default: m.CadastrosRelatorios })));
const AcademicCalendar = lazyWithRetry(() => import('./pages/AcademicCalendar').then((m) => ({ default: m.AcademicCalendar })));
const Attendance = lazyWithRetry(() => import('./pages/Attendance').then((m) => ({ default: m.Attendance })));
const Grades = lazyWithRetry(() => import('./pages/Grades').then((m) => ({ default: m.Grades })));
const Assessments = lazyWithRetry(() => import('./pages/Assessments').then((m) => ({ default: m.Assessments })));
const Bulletin = lazyWithRetry(() => import('./pages/Bulletin').then((m) => ({ default: m.Bulletin })));
const Documents = lazyWithRetry(() => import('./pages/Documents').then((m) => ({ default: m.Documents })));
const Impressos = lazyWithRetry(() => import('./pages/Impressos').then((m) => ({ default: m.Impressos })));
const StudentFicha = lazyWithRetry(() => import('./pages/StudentFicha').then((m) => ({ default: m.StudentFicha })));
const Diocese = lazyWithRetry(() => import('./pages/Diocese').then((m) => ({ default: m.Diocese })));
const Import = lazyWithRetry(() => import('./pages/Import').then((m) => ({ default: m.Import })));
const Reports = lazyWithRetry(() => import('./pages/Reports').then((m) => ({ default: m.Reports })));
const FinancialDashboard = lazyWithRetry(() => import('./pages/FinancialDashboard').then((m) => ({ default: m.FinancialDashboard })));
const Contributions = lazyWithRetry(() => import('./pages/Contributions').then((m) => ({ default: m.Contributions })));
const FinancialReport = lazyWithRetry(() => import('./pages/FinancialReport').then((m) => ({ default: m.FinancialReport })));
const PixConference = lazyWithRetry(() => import('./pages/PixConference').then((m) => ({ default: m.PixConference })));
const Receipts = lazyWithRetry(() => import('./pages/Receipts').then((m) => ({ default: m.Receipts })));
const Settings = lazyWithRetry(() => import('./pages/Settings').then((m) => ({ default: m.Settings })));
const BackupPage = lazyWithRetry(() => import('./pages/Backup').then((m) => ({ default: m.BackupPage })));
const ArchivePage = lazyWithRetry(() => import('./pages/Archive').then((m) => ({ default: m.ArchivePage })));
const Users = lazyWithRetry(() => import('./pages/Users').then((m) => ({ default: m.Users })));

function PageLoader() {
  return (
    <div className="min-h-[55vh] flex flex-col items-center justify-center gap-3 text-slate-500">
      <div className="w-8 h-8 rounded-full border-3 border-teal-200 border-t-teal-600 animate-spin" />
      <span className="text-xs font-semibold tracking-wide uppercase">Carregando módulo...</span>
    </div>
  );
}

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
    if (isChunkLoadError(error)) {
      reloadOnceForChunkError();
    }
  }

  render() {
    if (this.state.hasError) {
      const isChunkErr = isChunkLoadError(this.state.error);
      return (
        <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6 font-sans">
          <div className="max-w-md w-full bg-white p-8 rounded-2xl shadow-xl border border-slate-200 text-center">
            <div className="w-16 h-16 bg-red-100 text-red-600 rounded-xl flex items-center justify-center mx-auto mb-6 border border-red-200">
              <AlertCircle size={32} />
            </div>
            <h1 className="text-xl font-bold text-slate-900 mb-4 uppercase">
              {isChunkErr ? 'Atualização Disponível' : 'Erro Crítico'}
            </h1>
            <p className="text-slate-500 text-sm mb-8">
              {isChunkErr
                ? 'Uma nova versão do sistema foi publicada ou houve oscilação momentânea na conexão. Recarregue a página para baixar os arquivos atualizados.'
                : 'Ocorreu um erro inesperado ao carregar o sistema. Isso pode ser causado por falha na conexão ou erro de renderização.'}
            </p>
            <div className="bg-slate-100 p-4 rounded-lg mb-8 text-left overflow-auto max-h-40 border border-slate-200">
              <code className="text-[10px] text-red-600 font-mono font-semibold block whitespace-pre-wrap">
                {this.state.error?.name}: {this.state.error?.message}
              </code>
            </div>
            <div className="space-y-3">
              <button 
                onClick={() => forceCacheBustedReload()}
                title="Atualizar a página mantendo seus dados locais"
                className="w-full py-4 bg-slate-900 text-white rounded-lg font-semibold text-xs uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-black transition-all shadow-lg active:scale-95 cursor-pointer"
              >
                <RefreshCw size={18} />
                {isChunkErr ? 'Atualizar e Recarregar' : 'Recarregar Sistema'}
              </button>
              <button
                onClick={() => {
                  localStorage.clear();
                  sessionStorage.clear();
                  forceCacheBustedReload();
                }}
                title="Limpar cache local e reiniciar sessão"
                className="w-full py-2.5 text-slate-500 hover:text-red-600 text-[11px] font-semibold uppercase tracking-wider transition-colors cursor-pointer"
              >
                Resetar Cache Local e Reiniciar
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// Neutraliza erros de tokens expirados, limpa parâmetro temporário de cache-bust e trata pré-carregamento pós-deploy
if (typeof window !== 'undefined') {
  try {
    const currentUrl = new URL(window.location.href);
    if (currentUrl.searchParams.has('_r')) {
      currentUrl.searchParams.delete('_r');
      window.history.replaceState(null, '', currentUrl.toString());
    }
  } catch {}

  window.addEventListener('vite:preloadError', (event) => {
    event.preventDefault();
    reloadOnceForChunkError();
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const msg = (typeof reason === 'string' ? reason : reason?.message || String(reason || '')).toLowerCase();
    if (
      msg.includes('invalid refresh token') ||
      msg.includes('refresh token not found') ||
      msg.includes('refresh_token_not_found') ||
      msg.includes('already used')
    ) {
      console.warn('[App] Sessão expirada/token de atualização inválido capturado globalmente. Limpando tokens...');
      event.preventDefault();
      clearCorruptedAuthTokens();
    }
  });
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <UnitProvider>
          <AppContent />
        </UnitProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}

function AppContent() {
  const { isConnected, isLocked, user } = useAuth();
  const [, setShowDiagnostic] = React.useState(false);

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
            title="Recarregar página e verificar conexão"
            className="w-full py-3 bg-blue-600 text-white rounded-lg font-bold text-xs uppercase tracking-wider hover:bg-blue-700 transition-all shadow-sm active:scale-95"
          >
            Tentar Novamente
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <GlobalTooltipProvider />
      {user && isLocked && <PinLock />}
      {user && <InactivityWarningModal />}
      <ImportProvider>
        <Router>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/" element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }>
                <Route index element={<Dashboard />} />
                <Route path="students" element={<ProtectedRoute requiredModule="/students"><Students /></ProtectedRoute>} />
                <Route path="teachers" element={<ProtectedRoute requiredModule="/teachers"><Teachers /></ProtectedRoute>} />
                <Route path="courses" element={<ProtectedRoute requiredModule="/courses"><Courses /></ProtectedRoute>} />
                <Route path="classes" element={<ProtectedRoute requiredModule="/classes"><Classes /></ProtectedRoute>} />
                <Route path="subjects" element={<ProtectedRoute requiredModule="/subjects"><Subjects /></ProtectedRoute>} />
                <Route path="cadastros-relatorios" element={<ProtectedRoute requiredModule="/students"><CadastrosRelatorios /></ProtectedRoute>} />
                <Route path="cadastros/relatorios" element={<ProtectedRoute requiredModule="/students"><CadastrosRelatorios /></ProtectedRoute>} />
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
                <Route path="financial" element={<ProtectedRoute requiredModule="/contributions"><FinancialDashboard /></ProtectedRoute>} />
                <Route path="contributions" element={<ProtectedRoute requiredModule="/contributions"><Contributions /></ProtectedRoute>} />
                <Route path="financial-report" element={<ProtectedRoute requiredModule="/contributions"><FinancialReport /></ProtectedRoute>} />
                <Route path="pix-conference" element={<ProtectedRoute requiredModule="/pix-conference"><PixConference /></ProtectedRoute>} />
                <Route path="receipts" element={<ProtectedRoute requiredModule="/receipts"><Receipts /></ProtectedRoute>} />
                <Route path="settings" element={<ProtectedRoute requiredModule="/settings"><Settings /></ProtectedRoute>} />
                <Route path="backup" element={<ProtectedRoute requiredModule="/settings"><BackupPage /></ProtectedRoute>} />
                <Route path="archive" element={<ProtectedRoute requiredModule="/settings"><ArchivePage /></ProtectedRoute>} />
                <Route path="users" element={<ProtectedRoute requiredModule="/users"><Users /></ProtectedRoute>} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
          </Suspense>
          <GlobalImportOverlay />
        </Router>
      </ImportProvider>
    </div>
  );
}
