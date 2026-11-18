import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import React, { Component, ReactNode, ErrorInfo } from 'react';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { ResetPassword } from './pages/ResetPassword';
import { Dashboard } from './pages/Dashboard';
import { Students } from './pages/Students';
import { Teachers } from './pages/Teachers';
import { Courses } from './pages/Courses';
import { Classes } from './pages/Classes';
import { Subjects } from './pages/Subjects';
import { CadastrosRelatorios } from './pages/CadastrosRelatorios';
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
import { FinancialDashboard } from './pages/FinancialDashboard';
import { Contributions } from './pages/Contributions';
import { FinancialReport } from './pages/FinancialReport';
import { PixConference } from './pages/PixConference';
import { Receipts } from './pages/Receipts';
import { Settings } from './pages/Settings';
import { BackupPage } from './pages/Backup';
import { ArchivePage } from './pages/Archive';
import { Users } from './pages/Users';
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
    msg.includes('loading chunk') ||
    msg.includes("cannot read properties of undefined (reading '")
  );
}

function forceCacheBustedReload(clearCooldown = false): void {
  if (typeof window === 'undefined') return;
  try {
    if (clearCooldown) {
      sessionStorage.removeItem(CHUNK_RELOAD_KEY);
    }
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
                onClick={() => forceCacheBustedReload(true)}
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
                  forceCacheBustedReload(true);
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

  // IMPORTANTE: Não chamar event.preventDefault() em vite:preloadError!
  // No Vite, event.preventDefault() faz __vitePreload() resolver com `undefined` em vez de rejeitar,
  // o que quebra `.then(m => ...)` antes mesmo do lazyWithRetry capturar a falha.
  window.addEventListener('vite:preloadError', () => {
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
          <GlobalImportOverlay />
        </Router>
      </ImportProvider>
    </div>
  );
}
