import React, { useState, useEffect } from 'react';
import { supabase, isSupabaseConfigured, fetchWithTimeout } from '../lib/supabase';
import { saveData, fetchById } from '../lib/database';
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
  X
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
  const [isInitializing, setIsInitializing] = useState(false);
  const [needsBootstrap, setNeedsBootstrap] = useState(false);
  
  const [initialLoading, setInitialLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  
  const navigate = useNavigate();
  const location = useLocation();
  const { user, profile, loading: authLoading, refreshProfile } = useAuth();
  const from = location.state?.from?.pathname || "/";

  // Helper to strip JSON from error messages
  const formatError = (error: any): string => {
    if (!error) return "";
    const msg = typeof error === 'string' ? error : (error.message || String(error));
    
    if (msg.includes('Invalid login credentials')) {
      return "E-mail ou senha incorretos. Verifique suas credenciais.";
    }
    if (msg.includes('Email not confirmed')) {
      return "E-mail ainda não confirmado. Verifique sua caixa de entrada.";
    }
    if (msg.includes('User already registered')) {
      return "Este e-mail já possui uma conta ativa no sistema.";
    }
    
    return msg;
  };

  useEffect(() => {
    // If we are logged in and system is OK, go to home
    if (user && profile && !needsBootstrap && !loading) {
      navigate(from, { replace: true });
    }
  }, [user, profile, needsBootstrap, loading, navigate, from]);

  useEffect(() => {
    const shouldIgnoreError = authLoading || loading || isRegistering || isProcessing || initialLoading;
    
    if (user && !profile && !shouldIgnoreError && !needsBootstrap) {
      const timer = setTimeout(() => {
        if (user && !profile && !shouldIgnoreError && !needsBootstrap && !error) {
          setError("Olá! 🎉 Parece que você ainda não tem um perfil cadastrado. Se este é seu primeiro acesso, use a aba 'Primeiro Acesso'.");
        }
      }, 4000);
      return () => clearTimeout(timer);
    } else if (profile || !user) {
      if (error?.includes("perfil não foi encontrado")) {
        setError(null);
      }
    }
  }, [user, profile, authLoading, needsBootstrap, loading, isRegistering, isProcessing, initialLoading, error]);

  useEffect(() => {
    const checkInitialization = async () => {
      try {
        if (!isSupabaseConfigured) {
          setInitialLoading(false);
          return;
        }
        
        const result = await fetchWithTimeout(
          supabase
            .from('institution_settings')
            .select('id')
            .limit(1)
            .maybeSingle()
        );
        
        const data = result?.data;
        const sbErr = result?.error;
        
        setNeedsBootstrap(!data && !sbErr);
      } catch (err: any) {
        console.error("[Login] Erro ao verificar inicialização:", err.message);
        setNeedsBootstrap(false);
      } finally {
        setInitialLoading(false);
      }
    };
    checkInitialization();
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;

    setLoading(true);
    setIsProcessing(true);
    setError(null);

    try {
      const { error: sbErr } = await supabase.auth.signInWithPassword({
        email: email.toLowerCase().trim(),
        password
      });
      if (sbErr) throw sbErr;
      setError(null);
    } catch (err: any) {
      console.error("Login failed:", err);
      setIsProcessing(false);
      setError(formatError(err));
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

    if (password.length < 6) {
      setError("A senha deve ter pelo menos 6 caracteres.");
      return;
    }

    setLoading(true);
    setIsProcessing(true);
    setError(null);

    try {
      // 1. Check if user is authorized (either in registry or already in users table)
      const emailLower = email.toLowerCase().trim();
      
      const [preRegRes, existingUserRes] = await Promise.all([
        supabase.from('email_registry').select('*').ilike('email', emailLower).maybeSingle(),
        supabase.from('users').select('*').ilike('email', emailLower).maybeSingle()
      ]);
      
      const preRegData = preRegRes.data;
      const existingUserData = existingUserRes.data;
      
      if (!preRegData && !existingUserData) {
        setError("Este e-mail não está autorizado para primeiro acesso. Por favor, solicite seu pré-cadastro.");
        setLoading(false);
        setIsProcessing(false);
        return;
      }

      const displayName = preRegData?.name || existingUserData?.name || emailLower.split('@')[0];

      // 2. Create Supabase Auth user
      const { error: sbErr } = await supabase.auth.signUp({
        email: emailLower,
        password,
        options: {
          data: {
            full_name: displayName
          }
        }
      });
      if (sbErr) throw sbErr;
      
    } catch (err: any) {
      console.error("Registration failed:", err);
      setIsProcessing(false);
      setError(formatError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleBootstrap = async () => {
    setLoading(true);
    setError(null);
    setIsInitializing(true);

    const adminEmail = 'admin@diocese.com';
    const adminPassword = 'admin123456';

    try {
      // 1. Create Admin Auth user
      const { data: authData, error: authErr } = await supabase.auth.signUp({
        email: adminEmail,
        password: adminPassword,
        options: {
          data: { full_name: 'Administrador do Sistema' }
        }
      });
      
      if (authErr && !authErr.message.includes('already registered')) throw authErr;
      
      let userId = authData.user?.id;
      if (!userId) {
        const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
          email: adminEmail,
          password: adminPassword
        });
        if (signInErr) throw signInErr;
        userId = signInData.user?.id;
      }

      if (!userId) throw new Error("Could not determine admin ID");

      // 2. Create profile in 'users' table
      await saveData('users', userId, {
        id: userId,
        email: adminEmail,
        name: 'Administrador do Sistema',
        role: 'admin',
        status: 'active',
        created_at: new Date().toISOString()
      });

      // 3. Create institution settings
      await saveData('institution_settings', crypto.randomUUID(), {
        name: 'Diocese de Guarulhos',
        updated_at: new Date().toISOString()
      });

      await refreshProfile();
      setNeedsBootstrap(false);
      navigate('/', { replace: true });
    } catch (err: any) {
      console.error("Bootstrap failed:", err);
      setError("Falha na inicialização: " + formatError(err));
    } finally {
      setLoading(false);
      setIsInitializing(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setLoading(true);
    setError(null);

    try {
      const { error: sbErr } = await supabase.auth.resetPasswordForEmail(email.toLowerCase().trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (sbErr) throw sbErr;
      setResetSent(true);
    } catch (err: any) {
      console.error("Reset failed:", err);
      setError(formatError(err));
    } finally {
      setLoading(false);
    }
  };


  return (
    <div className="min-h-screen bg-[#00174b] flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background Decor */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-blue-600/10 rounded-full -mr-48 -mt-48 blur-3xl" />
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-blue-900/20 rounded-full -ml-48 -mb-48 blur-3xl" />

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-white rounded-[2.5rem] shadow-2xl p-10 relative z-10"
      >
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-blue-50 rounded-3xl mb-6">
            <Shield className="w-10 h-10 text-blue-600" />
          </div>
          <h1 className="text-3xl font-black text-[#131b2e] leading-tight">
            Sistema Acadêmico
          </h1>
          <p className="text-slate-500 mt-2 font-medium">Diocese de Guarulhos</p>
        </div>

        {needsBootstrap ? (
          <div className="space-y-6">
            <div className="p-6 bg-amber-50 rounded-2xl border border-amber-100 flex items-start gap-4">
              <Database className="text-amber-600 shrink-0 mt-1" size={24} />
              <div>
                <h4 className="font-bold text-amber-900">Sistema Não Inicializado</h4>
                <p className="text-sm text-amber-700 mt-1">
                  Detectamos que este é o primeiro acesso ao sistema. O Administrador Root precisa ser criado.
                </p>
              </div>
            </div>

            <div className="p-4 bg-slate-50 rounded-xl space-y-2">
              <p className="text-xs font-black text-slate-400 uppercase tracking-widest text-center">Acesso Padrão</p>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Usuário:</span>
                <span className="font-mono font-bold text-slate-800">admin@diocese.com</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Senha:</span>
                <span className="font-mono font-bold text-slate-800">admin123456</span>
              </div>
            </div>

            <button
              onClick={handleBootstrap}
              disabled={loading}
              className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold shadow-xl shadow-blue-500/20 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="animate-spin" /> : <CheckCircle2 size={20} />}
              {loading ? 'Inicializando...' : 'Criar Administrador Root'}
            </button>
          </div>
        ) : isForgotPassword ? (
          <form onSubmit={handleResetPassword} className="space-y-6">
            <div className="text-center mb-4">
              <h4 className="font-bold text-[#131b2e]">Recuperar Senha</h4>
              <p className="text-xs text-slate-500 mt-1">Enviaremos um link para o seu e-mail cadastrado.</p>
            </div>

            <AnimatePresence mode="wait">
              {error && (
                <motion.div 
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="p-5 bg-red-50 rounded-3xl border-2 border-red-100 flex items-start gap-4 text-red-700 relative group animate-in fade-in slide-in-from-top-2 duration-300"
                >
                  <div className="p-2 bg-red-100 rounded-xl text-red-600">
                    <AlertCircle size={22} />
                  </div>
                  <div className="flex-1 pr-6">
                    <h5 className="font-black text-[10px] uppercase tracking-widest text-red-400 mb-1">Aviso do Sistema</h5>
                    <p className="text-sm font-bold leading-tight">{formatError(error)}</p>
                  </div>
                  <button 
                    onClick={() => setError(null)}
                    className="absolute top-4 right-4 p-1 rounded-lg hover:bg-red-100 text-red-400 transition-colors"
                  >
                    <X size={16} />
                  </button>
                </motion.div>
              )}
              {resetSent && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100 flex items-center gap-3 text-emerald-600 text-sm font-medium"
                >
                  <CheckCircle2 size={18} />
                  E-mail enviado! Verifique sua caixa de entrada.
                </motion.div>
              )}
            </AnimatePresence>

            <div className="space-y-2">
              <label className="text-xs font-black text-slate-400 uppercase tracking-widest pl-1">E-mail</label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                <input 
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-12 pr-6 py-4 bg-slate-50 border-none rounded-2xl text-lg font-medium focus:ring-2 focus:ring-blue-500/20"
                  placeholder="seu@email.com"
                />
              </div>
            </div>

            <div className="space-y-4">
              <button
                type="submit"
                disabled={loading || resetSent}
                className="w-full py-4 bg-[#00174b] text-white rounded-2xl font-bold shadow-xl shadow-blue-900/10 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-3"
              >
                {loading ? <Loader2 className="animate-spin" /> : <Mail size={20} />}
                {loading ? 'Enviando...' : 'Enviar Link de Recuperação'}
              </button>

              <button
                type="button"
                onClick={() => { setIsForgotPassword(false); setResetSent(false); setError(null); }}
                className="w-full text-center text-sm font-bold text-blue-600 hover:text-blue-700"
              >
                Voltar para o Login
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={isRegistering ? handleRegister : handleLogin} className="space-y-6">
            <div className="flex bg-slate-100 p-1 rounded-2xl mb-2">
              <button
                type="button"
                onClick={() => { setIsRegistering(false); setError(null); }}
                className={cn(
                  "flex-1 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all",
                  !isRegistering ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
                )}
              >
                Entrar
              </button>
              <button
                type="button"
                onClick={() => { setIsRegistering(true); setError(null); }}
                className={cn(
                  "flex-1 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all",
                  isRegistering ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
                )}
              >
                Primeiro Acesso
              </button>
            </div>

            <AnimatePresence mode="wait">
              {error && (
                <motion.div 
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="p-5 bg-red-50 rounded-3xl border-2 border-red-100 flex items-start gap-4 text-red-700 relative group animate-in fade-in slide-in-from-top-2 duration-300"
                >
                  <div className="p-2 bg-red-100 rounded-xl text-red-600">
                    <AlertCircle size={22} />
                  </div>
                  <div className="flex-1 pr-6">
                    <h5 className="font-black text-[10px] uppercase tracking-widest text-red-400 mb-1">Aviso do Sistema</h5>
                    <p className="text-sm font-bold leading-tight">{formatError(error)}</p>
                  </div>
                  <button 
                    onClick={() => setError(null)}
                    className="absolute top-4 right-4 p-1 rounded-lg hover:bg-red-100 text-red-400 transition-colors"
                  >
                    <X size={16} />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest pl-1">E-mail</label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                  <input 
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-12 pr-6 py-4 bg-slate-50 border-none rounded-2xl text-lg font-medium focus:ring-2 focus:ring-blue-500/20"
                    placeholder="ex@diocese.com"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest pl-1">Senha</label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                  <input 
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-12 pr-6 py-4 bg-slate-50 border-none rounded-2xl text-lg font-medium focus:ring-2 focus:ring-blue-500/20"
                    placeholder="••••••••"
                  />
                </div>
              </div>

              {isRegistering && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="space-y-2"
                >
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest pl-1">Confirmar Senha</label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                    <input 
                      type="password"
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full pl-12 pr-6 py-4 bg-slate-50 border-none rounded-2xl text-lg font-medium focus:ring-2 focus:ring-blue-500/20"
                      placeholder="••••••••"
                    />
                  </div>
                </motion.div>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 bg-[#00174b] text-white rounded-2xl font-bold shadow-xl shadow-blue-900/10 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-3 mt-4"
            >
              {loading ? <Loader2 className="animate-spin" /> : <Shield size={20} />}
              {loading ? (isRegistering ? 'Criando Conta...' : 'Acessando...') : (isRegistering ? 'Criar Minha Conta' : 'Entrar no Sistema')}
            </button>
          </form>
        )}

        <div className="mt-8 text-center">
            <button 
              onClick={() => { setIsForgotPassword(true); setIsRegistering(false); setError(null); }}
              className="text-sm text-slate-400 font-bold hover:text-blue-600 transition-colors"
            >
              Esqueceu sua senha? Clique aqui
            </button>
        </div>
      </motion.div>
    </div>
  );
}
