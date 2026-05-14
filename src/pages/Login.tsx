import React, { useState, useEffect } from 'react';
import { supabase, isSupabaseConfigured, fetchWithTimeout } from '../lib/supabase';
import { saveData } from '../lib/database';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { 
  Shield, 
  Mail, 
  Lock, 
  Loader2, 
  AlertCircle,
  CheckCircle2,
  Database,
  X,
  ChevronRight,
  BookOpen,
  Users,
  GraduationCap,
  Calendar,
  CheckCircle,
  ArrowRight
} from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsBootstrap, setNeedsBootstrap] = useState(false);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  
  const navigate = useNavigate();
  const location = useLocation();
  const { user, profile, loading: authLoading, refreshProfile, logout, isLocked, isConnected, connError } = useAuth();
  const from = location.state?.from?.pathname || "/";
  const stateError = location.state?.error;

  // Redirect if already logged in and NOT locked and has profile
  useEffect(() => {
    if (user && profile && !isLocked && !authLoading) {
      navigate(from, { replace: true });
    }
  }, [user, profile, isLocked, authLoading, navigate, from]);

  // Set error from navigation state if present
  useEffect(() => {
    if (stateError) {
      setError(stateError);
      // Limpa o estado para não reexibir o erro ao recarregar a página
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [stateError, navigate, location.pathname]);

  // Check for first time setup
  useEffect(() => {
    const checkInitialization = async () => {
      try {
        if (!isSupabaseConfigured) return;
        const { data, error: sbErr } = await supabase.from('institution_settings').select('id').limit(1).maybeSingle();
        setNeedsBootstrap(!data && !sbErr);
      } catch (err) {
        console.error("Init check error:", err);
      }
    };
    checkInitialization();
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setLoading(true);
    setError(null);

    try {
      const result = await fetchWithTimeout(supabase.auth.signInWithPassword({
        email: email.toLowerCase().trim(),
        password
      }), 20000);
      
      if (result?.error) throw result.error;
    } catch (err: any) {
      setError(err.message === 'Invalid login credentials' ? 'E-mail ou senha incorretos.' : err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || !confirmPassword) return;

    if (password !== confirmPassword) {
      setError("As senhas não coincidem.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const emailLower = email.toLowerCase().trim();
      
      // Check authorization
      const [preRegRes, existingUserRes] = await Promise.all([
        supabase.from('email_registry').select('*').ilike('email', emailLower).maybeSingle(),
        supabase.from('users').select('*').ilike('email', emailLower).maybeSingle()
      ]);
      
      if (!preRegRes.data && !existingUserRes.data) {
        throw new Error("Este e-mail não está autorizado para primeiro acesso. Fale com a secretaria.");
      }

      const { error: sbErr } = await supabase.auth.signUp({
        email: emailLower,
        password,
        options: { data: { full_name: preRegRes.data?.name || emailLower.split('@')[0] } }
      });
      if (sbErr) throw sbErr;
      
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleBootstrap = async () => {
    setLoading(true);
    setError(null);
    try {
      const adminEmail = 'admin@diocese.com';
      const adminPassword = 'admin123456';
      
      const { data: authData, error: authErr } = await supabase.auth.signUp({
        email: adminEmail,
        password: adminPassword,
        options: { data: { full_name: 'Administrador Root' } }
      });
      
      if (authErr && !authErr.message.includes('already registered')) throw authErr;
      
      const userId = authData.user?.id;
      if (userId) {
        await saveData('users', userId, {
          id: userId,
          email: adminEmail,
          name: 'Administrador Root',
          role: 'admin',
          status: 'active',
          created_at: new Date().toISOString()
        });
        await saveData('institution_settings', crypto.randomUUID(), {
          name: 'Escola Diocesana de Ministérios',
          city: 'Guarulhos',
          updated_at: new Date().toISOString()
        });
        setNeedsBootstrap(false);
        refreshProfile();
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col lg:flex-row overflow-hidden font-sans">
      {/* Left side: Information (Decorative/Branding) */}
      <div className="lg:w-[45%] bg-[#00174b] p-8 lg:p-16 flex flex-col justify-between relative overflow-hidden">
        {/* Background Patterns */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-600/10 rounded-full -mr-32 -mt-32 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-blue-400/5 rounded-full -ml-32 -mb-32 blur-3xl pointer-events-none" />
        
        <div className="relative z-10">
          <div className="flex items-center gap-4 mb-16">
            <div className="w-12 h-12 bg-white rounded-lg flex items-center justify-center shadow-xl">
              <Shield className="text-indigo-900" size={28} />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-amber-500">Diocese de Guarulhos</p>
              <h1 className="text-2xl font-bold text-white tracking-tight leading-none">EDM Portal</h1>
            </div>
          </div>

          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className="space-y-12"
          >
            {/* Connection Error Message */}
          {!isConnected && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="mb-8 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-4"
            >
              <div className="w-10 h-10 bg-amber-100 text-amber-600 rounded-lg flex items-center justify-center shrink-0">
                <AlertCircle size={24} />
              </div>
              <div className="flex-1">
                <p className="text-amber-900 font-bold text-[10px] uppercase tracking-wider mb-1">Erro de Conexão</p>
                <p className="text-amber-700 text-[11px] leading-relaxed font-medium">
                  Não foi possível conectar ao banco de dados. {connError || 'Verifique sua internet ou se o Supabase está ativo.'}
                </p>
              </div>
            </motion.div>
          )}

          <div className="space-y-4">
              <h2 className="text-4xl lg:text-5xl font-bold text-white leading-[1.1]">
                Formação para o <span className="text-amber-500">Serviço</span> e Missão
              </h2>
              <p className="text-white/60 font-medium text-lg max-w-md">
                Espaço de crescimento teológico e pastoral para leigos e leigas da Diocese de Guarulhos.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-8">
              <InfoFeature icon={<GraduationCap size={18} />} title="Cursos" text="+20 cursos ativos" />
              <InfoFeature icon={<Users size={18} />} title="Alunos" text="+1200 formados" />
              <InfoFeature icon={<BookOpen size={18} />} title="Material" text="100% digital" />
              <InfoFeature icon={<Calendar size={18} />} title="Encontros" text="Aulas presenciais" />
            </div>
          </motion.div>
        </div>

        <div className="relative z-10 pt-12 border-t border-white/5">
           <div className="flex items-center gap-2">
              <CheckCircle className="text-amber-500" size={14} />
              <span className="text-[10px] font-bold uppercase tracking-widest text-white/30">Sistema de Gestão Acadêmica v2.0</span>
           </div>
        </div>
      </div>

      {/* Right side: Login Form */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-12 bg-white relative">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-sm"
        >
          {needsBootstrap ? (
             <div className="space-y-8">
                <div className="text-center">
                  <div className="w-20 h-20 bg-amber-50 rounded-[2rem] flex items-center justify-center mx-auto mb-6">
                    <Database className="text-amber-600" size={32} />
                  </div>
                  <h2 className="text-2xl font-black text-[#00174b] mb-2 uppercase">Configuração Inicial</h2>
                  <p className="text-slate-500 font-medium text-sm">Este é o primeiro acesso. Clique abaixo para inicializar o sistema e criar o administrador.</p>
                </div>

                <div className="bg-slate-50 p-4 rounded-2xl border border-dashed border-slate-200">
                   <p className="text-[10px] font-black uppercase text-slate-400 mb-2 text-center tracking-widest">Acesso de Emergência</p>
                   <div className="space-y-1 text-xs text-[#00174b] font-bold text-center">
                      <p>admin@diocese.com</p>
                      <p>admin123456</p>
                   </div>
                </div>

                <button 
                  onClick={handleBootstrap}
                  disabled={loading}
                  className="w-full py-4 bg-[#00174b] text-white rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-2xl shadow-blue-900/20 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-3"
                >
                  {loading ? <Loader2 className="animate-spin" /> : <ChevronRight size={20} />}
                  {loading ? 'Inicializando...' : 'Criar Administrador'}
                </button>
             </div>
          ) : (
            <>
              <div className="text-center mb-10">
                <h2 className="text-2xl font-bold text-slate-900 mb-2 uppercase tracking-tight">
                  {isRegistering ? 'Primeiro Acesso' : isForgotPassword ? 'Recuperar Acesso' : 'Bem-vindo'}
                </h2>
                <p className="text-slate-400 font-semibold text-[10px] uppercase tracking-[0.2em]">
                  {isRegistering ? 'Crie sua senha de estudante' : isForgotPassword ? 'Redefina sua senha por e-mail' : 'Portal Administrativo e Acadêmico'}
                </p>
              </div>

              {/* Tabs for Login/Register */}
              {!isForgotPassword && (
                <div className="flex bg-slate-100 p-1 rounded-xl mb-8 border border-slate-200">
                  <button 
                    onClick={() => { setIsRegistering(false); setError(null); }}
                    className={cn(
                      "flex-1 py-3 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all",
                      !isRegistering ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                    )}
                  >
                    Entrar
                  </button>
                  <button 
                    onClick={() => { setIsRegistering(true); setError(null); }}
                    className={cn(
                      "flex-1 py-3 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all",
                      isRegistering ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                    )}
                  >
                    Primeiro Acesso
                  </button>
                </div>
              )}

              <AnimatePresence mode="wait">
                {error && (
                  <motion.div 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mb-6 p-4 bg-red-50 border border-red-100 rounded-2xl flex items-start gap-3"
                  >
                    <AlertCircle className="text-red-500 shrink-0 mt-0.5" size={16} />
                    <p className="text-xs font-bold text-red-700 leading-tight">{error}</p>
                  </motion.div>
                )}
                {resetSent && (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="mb-6 p-4 bg-emerald-50 border border-emerald-100 rounded-2xl flex items-start gap-3"
                  >
                    <CheckCircle2 className="text-emerald-500 shrink-0 mt-0.5" size={16} />
                    <p className="text-xs font-bold text-emerald-700 leading-tight">Link enviado! Verifique seu e-mail.</p>
                  </motion.div>
                )}
              </AnimatePresence>

              <form onSubmit={isForgotPassword ? () => {} : isRegistering ? handleRegister : handleLogin} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">E-mail Institucional</label>
                  <div className="relative group">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-indigo-600 transition-colors" size={18} />
                    <input 
                      type="email"
                      required
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      className="w-full pl-12 pr-6 py-4 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-900 text-sm focus:bg-white focus:border-indigo-600/30 focus:ring-4 focus:ring-indigo-600/5 transition-all outline-none"
                      placeholder="aluno@diocese.com"
                    />
                  </div>
                </div>

                {!isForgotPassword && (
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Senha de Acesso</label>
                    <div className="relative group">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-indigo-600 transition-colors" size={18} />
                      <input 
                        type="password"
                        required={!isForgotPassword}
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        className="w-full pl-12 pr-6 py-4 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-900 text-sm focus:bg-white focus:border-indigo-600/30 focus:ring-4 focus:ring-indigo-600/5 transition-all outline-none"
                        placeholder="••••••••"
                      />
                    </div>
                  </div>
                )}

                {isRegistering && (
                  <motion.div 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="space-y-1.5"
                  >
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Confirmar Senha</label>
                    <div className="relative group">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-[#00174b] transition-colors" size={18} />
                      <input 
                        type="password"
                        required
                        value={confirmPassword}
                        onChange={e => setConfirmPassword(e.target.value)}
                        className="w-full pl-12 pr-6 py-4 bg-slate-50 border border-transparent rounded-[1.25rem] font-bold text-[#00174b] text-sm focus:bg-white focus:border-[#00174b]/10 focus:ring-4 focus:ring-[#00174b]/5 transition-all outline-none"
                        placeholder="••••••••"
                      />
                    </div>
                  </motion.div>
                )}

                {!isRegistering && !isForgotPassword && (
                   <div className="flex justify-end pr-1">
                      <button 
                        type="button" 
                        onClick={() => setIsForgotPassword(true)}
                        className="text-[10px] font-black text-blue-600 hover:text-blue-800 transition-colors uppercase tracking-widest"
                      >
                         Esqueceu a senha?
                      </button>
                   </div>
                )}

                <div className="pt-4 space-y-4">
                  <button 
                    type="submit"
                    disabled={loading}
                    className="w-full py-4 bg-indigo-600 text-white rounded-xl font-bold text-[11px] uppercase tracking-[0.2em] shadow-lg shadow-indigo-900/20 hover:bg-indigo-700 hover:scale-[1.01] active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-70"
                  >
                    {loading ? <Loader2 className="animate-spin" size={20} /> : <ArrowRight size={20} />}
                    {isForgotPassword ? 'Enviar Link' : isRegistering ? 'Ativar Minha Conta' : 'Acessar Sistema'}
                  </button>

                  {(isForgotPassword || isRegistering) && (
                    <button 
                      type="button"
                      onClick={() => { setIsForgotPassword(false); setIsRegistering(false); setError(null); }}
                      className="w-full text-center text-[10px] font-bold text-slate-400 hover:text-slate-600 uppercase tracking-widest"
                    >
                      Voltar para o Login
                    </button>
                  )}
                </div>
              </form>
            </>
          )}

          {/* Emergency session reset if stuck */}
          {user && !profile && !authLoading && (
            <div className="mt-12 pt-8 border-t border-slate-100 flex flex-col items-center gap-3">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Sessão Ativa: {user.email}</p>
              <p className="text-[10px] font-medium text-red-500 uppercase text-center">Usuário sem perfil habilitado</p>
              <button 
                onClick={() => logout()}
                className="px-6 py-2.5 bg-red-50 text-red-600 rounded-xl font-black text-[9px] uppercase tracking-widest hover:bg-red-600 hover:text-white transition-all border border-red-100"
              >
                Encerrar Sessão e Tentar outro
              </button>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}

function InfoFeature({ icon, title, text }: { icon: React.ReactNode, title: string, text: string }) {
  return (
    <div className="bg-white/5 border border-white/5 p-4 rounded-2xl hover:bg-white/10 transition-all group">
       <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center text-[#b4941d] mb-3 group-hover:scale-110 transition-transform">
          {icon}
       </div>
       <p className="text-[10px] font-black uppercase text-[#b4941d] tracking-widest mb-1">{title}</p>
       <p className="text-sm font-bold text-white/80">{text}</p>
    </div>
  );
}
