import React, { useState, useEffect, useRef } from 'react';
import { supabase, isSupabaseConfigured, fetchWithTimeout, testConnection } from '../lib/supabase';
import { saveData, deleteData, fetchCount, getInstitutionSettings } from '../lib/database';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { 
  Shield, 
  Mail, 
  Lock, 
  Loader2, 
  AlertCircle,
  AlertTriangle,
  RefreshCw,
  CheckCircle2,
  Database,
  X,
  ChevronLeft,
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
  const [institution, setInstitution] = useState<any>(null);
  const [stats, setStats] = useState({ classes: 0, students: 0, subjects: 0 });
  const [rememberMe, setRememberMe] = useState(false);
  
  // Estados para redefinição de senha e OTP bypass
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState('');
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [pastedUrl, setPastedUrl] = useState('');
  const [recoverySession, setRecoverySession] = useState<{ access_token: string; refresh_token: string } | null>(null);

  const navigate = useNavigate();
  const location = useLocation();
  const { user, profile, loading: authLoading, refreshProfile, logout, isLocked, isConnected, connError } = useAuth();
  const from = location.state?.from?.pathname || "/";
  const stateError = location.state?.error;

  const [isRetrying, setIsRetrying] = useState(false);
  const prevIsConnectedRef = useRef(isConnected);

  // Alerta sonoro / Bip de falha de conexão
  useEffect(() => {
    if (!isConnected && prevIsConnectedRef.current) {
      try {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioContextClass) {
          const ctx = new AudioContextClass();
          
          const playTone = (freq: number, startTime: number, duration: number, type: 'sine' | 'sawtooth' | 'triangle' = 'triangle') => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            
            osc.type = type;
            osc.frequency.setValueAtTime(freq, startTime);
            gain.gain.setValueAtTime(0, startTime);
            gain.gain.linearRampToValueAtTime(0.12, startTime + 0.03);
            gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
            
            osc.start(startTime);
            osc.stop(startTime + duration);
          };

          const now = ctx.currentTime;
          playTone(440, now, 0.12, 'sawtooth');
          playTone(554, now + 0.15, 0.12, 'sawtooth');
          playTone(659, now + 0.30, 0.25, 'triangle');
        }
      } catch (err) {
        console.warn('Erro ao emitir alerta sonoro de conexão:', err);
      }
    }
    prevIsConnectedRef.current = isConnected;
  }, [isConnected]);

  const handleManualReconnect = async () => {
    setIsRetrying(true);
    try {
      await testConnection();
    } catch (e) {
      console.error(e);
    } finally {
      setTimeout(() => {
        setIsRetrying(false);
      }, 1000);
    }
  };

  // Redirect if already logged in and NOT locked and has profile
  useEffect(() => {
    const isRecovery = localStorage.getItem('supabase_recovery_mode') === 'true' || 
                       isResettingPassword ||
                       window.location.hash.includes('type=recovery') || 
                       window.location.hash.includes('access_token=') || 
                       window.location.search.includes('type=recovery');

    if (user && profile && !isLocked && !authLoading && !isRecovery) {
      navigate(from, { replace: true });
    }
  }, [user, profile, isLocked, authLoading, navigate, from, isResettingPassword]);

  // Set error from navigation state if present
  useEffect(() => {
    if (stateError) {
      setError(stateError);
      // Limpa o estado para não reexibir o erro ao recarregar a página
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [stateError, navigate, location.pathname]);

  // Detecta se estamos voltando de um fluxo de recuperação de senha (via link/hash do Supabase)
  useEffect(() => {
    const checkRecovery = () => {
      const isRecovery = localStorage.getItem('supabase_recovery_mode') === 'true';
      if (isRecovery) {
        setIsResettingPassword(true);
        setIsForgotPassword(false);
        setIsRegistering(false);
        setIsVerifyingOtp(false);
      }
    };

    checkRecovery();
    window.addEventListener('supabase_recovery', checkRecovery);
    
    // Processa fragmentos/hashes e search params diretamente (ex: redir direto do Supabase)
    const hash = window.location.hash || '';
    const search = window.location.search || '';
    
    // Supabase costuma redirecionar no formato /#access_token=...&type=recovery
    if (hash.includes('type=recovery') || hash.includes('access_token=') || search.includes('type=recovery')) {
      localStorage.setItem('supabase_recovery_mode', 'true');
      setIsResettingPassword(true);
      setIsForgotPassword(false);
      setIsRegistering(false);
      setIsVerifyingOtp(false);
      
      // Limpa os fragmentos da URL para uma navegação limpa sem sair da página de login
      navigate('/login', { replace: true });
    }

    return () => {
      window.removeEventListener('supabase_recovery', checkRecovery);
    };
  }, []);

  // Check for first time setup and load info
  useEffect(() => {
    const checkInitialization = async () => {
      try {
        if (!isSupabaseConfigured) return;
        
        const [settings, cCount, sCount, subCount] = await Promise.all([
          getInstitutionSettings(),
          fetchCount('classes'),
          fetchCount('students'),
          fetchCount('subjects')
        ]);

        if (settings) {
          setInstitution(settings);
          setNeedsBootstrap(false);
        } else {
          setNeedsBootstrap(true);
        }

        setStats({ 
          classes: cCount || 0, 
          students: sCount || 0,
          subjects: subCount || 0
        });
      } catch (err: any) {
        const isOfflineError = 
          (typeof window !== 'undefined' && !window.navigator.onLine) || 
          err?.message?.toLowerCase().includes('offline') || 
          err?.message?.toLowerCase().includes('failed to fetch') || 
          err?.message?.toLowerCase().includes('network error');

        if (isOfflineError) {
          console.warn("Dispositivo offline ou erro de rede no checkup de inicialização:", err?.message || err);
        } else {
          console.error("Init check error:", err);
        }
      }
    };
    checkInitialization();
  }, []);

  // Load remembered email
  useEffect(() => {
    const savedEmail = localStorage.getItem('remembered_email');
    if (savedEmail) {
      setEmail(savedEmail);
      setRememberMe(true);
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setLoading(true);
    setError(null);

    try {
      const emailNormalized = email.toLowerCase().trim();
      
      if (rememberMe) {
        localStorage.setItem('remembered_email', emailNormalized);
      } else {
        localStorage.removeItem('remembered_email');
      }

      const result = await fetchWithTimeout(supabase.auth.signInWithPassword({
        email: emailNormalized,
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

    if (!email.includes('@') || !email.includes('.')) {
      setError("Por favor, informe um e-mail válido.");
      return;
    }

    if (password !== confirmPassword) {
      setError("As senhas não coincidem.");
      return;
    }

    if (password.length < 6) {
      setError("A senha deve ter pelo menos 6 caracteres.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const emailLower = email.toLowerCase().trim();
      
      // Verifica se o e-mail está pré-autorizado ou se já existe no banco de perfil
      const [preRegRes, existingUserRes, countRes] = await Promise.all([
        supabase.from('email_registry').select('*').ilike('email', emailLower).maybeSingle(),
        supabase.from('users').select('*').ilike('email', emailLower).maybeSingle(),
        supabase.from('email_registry').select('id', { count: 'exact', head: true })
      ]);
      
      const isSystemEmpty = (countRes.count === 0);
      
      // Se o perfil já existir no banco de dados 'users', verificamos se é um pré-cadastro
      if (existingUserRes.data) {
        // Um usuário é considerado ativo se is_pre_registered for explicitamente false
        // OU se o ID for um UUID (o que indica que já passou pelo Auth do Supabase)
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(existingUserRes.data.id);
        const isActuallyActive = existingUserRes.data.is_pre_registered === false || (isUuid && existingUserRes.data.is_pre_registered !== true);
        
        if (isActuallyActive) {
          throw new Error("Este e-mail já possui uma conta ativa. Por favor, use a tela de login.");
        }
        // Se is_pre_registered === true ou ID for e-mail, permitimos continuar para que o usuário crie sua senha
      }

      // Se o sistema NÃO estiver vazio e o e-mail não estiver pré-autorizado
      if (!isSystemEmpty && !preRegRes.data) {
        throw new Error("Este e-mail não está autorizado para primeiro acesso. Entre em contato com a secretaria acadêmica.");
      }

      // Dados para o perfil - preferir o perfil rico pré-cadastrado na tabela 'users' se existir
      const userData = {
        name: existingUserRes.data?.full_name || existingUserRes.data?.name || preRegRes.data?.name || preRegRes.data?.metadata?.name || emailLower.split('@')[0],
        role: existingUserRes.data?.role || preRegRes.data?.role || (isSystemEmpty ? 'admin' : 'secretario')
      };

      // Tenta registrar no Supabase Auth
      const { data: authData, error: sbErr } = await supabase.auth.signUp({
        email: emailLower,
        password,
        options: { 
          data: { 
            full_name: userData.name
          } 
        }
      });

      let finalUserId: string | null = null;

      if (sbErr) {
        // Se já estiver registrado no Auth mas verificamos antes que NÃO tem perfil no banco de dados 'users'
        if (sbErr.message.includes('already registered')) {
          // Tentamos fazer login para obter o ID do usuário e criar o perfil faltante
          const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
            email: emailLower,
            password
          });
          
          if (signInErr) {
             throw new Error("Este e-mail já está registrado em nosso sistema de autenticação, mas sua senha parece incorreta. Tente recuperá-la.");
          }
          finalUserId = signInData.user?.id || null;
        } else {
          throw sbErr;
        }
      } else {
        finalUserId = authData.user?.id || null;
      }
      
      if (finalUserId) {
        // Se existia um perfil pré-criado com o ID sendo o e-mail, removemos para evitar duplicidade
        if (existingUserRes.data && existingUserRes.data.id === emailLower) {
          try {
            await deleteData('users', emailLower);
          } catch (delErr) {
            console.warn("Aviso: Falha ao limpar registro temporário, mas prosseguindo:", delErr);
          }
        }

        // Criação do perfil do usuário na tabela 'users'
        await saveData('users', finalUserId, {
          id: finalUserId,
          email: emailLower,
          name: userData.name,
          full_name: userData.name,
          role: userData.role,
          status: 'active',
          is_pre_registered: false, // Agora é um usuário real
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }, 120000); // 2 minutes timeout for this critical operation
        
        // Se for o primeiro usuário, garante o registro na pré-autorização também
        if (isSystemEmpty) {
          await saveData('email_registry', emailLower, {
            id: emailLower,
            email: emailLower,
            role: 'admin',
            status: 'active',
            registered_at: new Date().toISOString()
          }, 60000);
        }
        
        // Se não houver sessão ativa (e-mail de confirmação pendente), informa o usuário
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          setError("Conta ativada! Verifique seu e-mail para confirmar o cadastro antes de entrar.");
          setIsRegistering(false);
        } else {
          // Força refresh do contexto se já logou
          await refreshProfile(finalUserId);
        }
      }
      
    } catch (err: any) {
      setError(err.message || "Ocorreu um erro ao tentar registrar. Tente novamente.");
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
          full_name: 'Administrador Root',
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
        refreshProfile(userId);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      setError("A nova senha deve ter pelo menos 6 caracteres.");
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setError("As senhas não coincidem.");
      return;
    }
    setLoading(true);
    setError(null);

    try {
      // Garante que a sessão de recuperação esteja ativa e definida no cliente Supabase
      let activeTokens = recoverySession;
      if (!activeTokens) {
        const stored = localStorage.getItem('supabase_recovery_tokens');
        if (stored) {
          try {
            activeTokens = JSON.parse(stored);
          } catch (e) {
            console.error("Erro ao analisar supabase_recovery_tokens:", e);
          }
        }
      }

      if (activeTokens) {
        console.log("[Login] Restaurando sessão de recuperação antes de atualizar a senha...");
        const { error: setSessionErr } = await supabase.auth.setSession(activeTokens);
        if (setSessionErr) {
          console.warn("[Login] Alerta ao restaurar sessão de recuperação:", setSessionErr.message);
        }
      }

      const { error: sbErr } = await supabase.auth.updateUser({
        password: newPassword
      });
      if (sbErr) throw sbErr;

      localStorage.removeItem('supabase_recovery_mode');
      localStorage.removeItem('supabase_recovery_tokens');
      setRecoverySession(null);
      setIsResettingPassword(false);
      setNewPassword('');
      setConfirmNewPassword('');
      setSuccessMessage("Senha redefinida com sucesso! Você já está autenticado no sistema.");
      
      // Atualiza o perfil caso o usuário já esteja logado
      await refreshProfile();
      
      setTimeout(() => {
        setSuccessMessage(null);
        navigate('/');
      }, 3000);
    } catch (err: any) {
      setError(err.message || "Ocorreu um erro ao atualizar sua senha.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setError("Por favor, digite seu e-mail.");
      return;
    }
    if (!otpCode) {
      setError("Por favor, digite o código de 6 dígitos.");
      return;
    }
    setLoading(true);
    setError(null);

    try {
      const emailLower = email.toLowerCase().trim();
      const { data, error: otpErr } = await supabase.auth.verifyOtp({
        email: emailLower,
        token: otpCode.trim(),
        type: 'recovery'
      });
      if (otpErr) throw otpErr;

      // Se passou, o usuário já está logado na sessão de recovery.
      // Agora, podemos redefinir a senha usando a mesma tela.
      localStorage.setItem('supabase_recovery_mode', 'true');
      setIsResettingPassword(true);
      setIsForgotPassword(false);
      setIsVerifyingOtp(false);
      setOtpCode('');
      setError(null);
    } catch (err: any) {
      setError(err.message || "Código inválido ou expirado.");
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setError("Por favor, digite seu e-mail.");
      return;
    }
    setLoading(true);
    setError(null);
    setResetSent(false);

    try {
      const { error: sbErr } = await supabase.auth.resetPasswordForEmail(email.toLowerCase().trim(), {
        redirectTo: `${window.location.origin}/#/login?type=recovery`,
      });
      if (sbErr) throw sbErr;
      setResetSent(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleProcessPastedUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pastedUrl) {
      setError("Por favor, cole o link recebido no e-mail.");
      return;
    }
    setLoading(true);
    setError(null);

    try {
      // 1. Tenta extrair hash (Implicit grant flow com access_token e refresh_token)
      let hash = '';
      if (pastedUrl.includes('#')) {
        hash = pastedUrl.substring(pastedUrl.indexOf('#'));
      } else if (pastedUrl.includes('access_token=')) {
        hash = '?' + pastedUrl;
      }

      if (hash) {
        const params = new URLSearchParams(hash.replace('#', '?'));
        const accessToken = params.get('access_token');
        const refreshToken = params.get('refresh_token');

        if (accessToken && refreshToken) {
          const { data, error: sessionErr } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken
          });
          if (sessionErr) throw sessionErr;

          const tokens = { access_token: accessToken, refresh_token: refreshToken };
          setRecoverySession(tokens);
          localStorage.setItem('supabase_recovery_tokens', JSON.stringify(tokens));

          localStorage.setItem('supabase_recovery_mode', 'true');
          setIsResettingPassword(true);
          setIsForgotPassword(false);
          setIsVerifyingOtp(false);
          setResetSent(false);
          setPastedUrl('');
          setError(null);
          return;
        }
      }

      // 2. Tenta extrair código de PKCE flow (Authorization code flow com ?code=...)
      let search = '';
      if (pastedUrl.includes('?')) {
        search = pastedUrl.substring(pastedUrl.indexOf('?'));
      } else if (pastedUrl.includes('code=')) {
        search = '?' + pastedUrl;
      }

      if (search) {
        const params = new URLSearchParams(search);
        const code = params.get('code');
        if (code) {
          const { data, error: exchangeErr } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeErr) throw exchangeErr;

          if (data?.session) {
            const tokens = { 
              access_token: data.session.access_token, 
              refresh_token: data.session.refresh_token 
            };
            setRecoverySession(tokens);
            localStorage.setItem('supabase_recovery_tokens', JSON.stringify(tokens));
          }

          localStorage.setItem('supabase_recovery_mode', 'true');
          setIsResettingPassword(true);
          setIsForgotPassword(false);
          setIsVerifyingOtp(false);
          setResetSent(false);
          setPastedUrl('');
          setError(null);
          return;
        }
      }

      throw new Error("Não foi possível encontrar as credenciais de recuperação (access_token ou code) no link informado. Verifique se copiou o link completo.");
    } catch (err: any) {
      setError(err.message || "Erro ao processar o link de recuperação.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col lg:flex-row overflow-hidden font-sans">
      {/* Left side: Information (Decorative/Branding) */}
      <div className="lg:w-[45%] bg-[#00174b] p-8 lg:p-16 flex flex-col justify-between relative overflow-hidden">
        {/* Background Patterns */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-600/10 rounded-full -mr-32 -mt-32 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-blue-400/5 rounded-full -ml-32 -mb-32 blur-3xl pointer-events-none" />
        
        <div className="relative z-10">
          <div className="flex items-center gap-4 mb-16">
            <div className="w-12 h-12 bg-white rounded-lg flex items-center justify-center shadow-xl overflow-hidden border border-white/10">
              {institution?.logo_url ? (
                <img 
                  src={institution.logo_url} 
                  alt="Logo" 
                  className="w-full h-full object-contain p-1"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <Shield className="text-indigo-900" size={28} />
              )}
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-amber-500">{institution?.city || 'Diocese de Guarulhos'}</p>
              <h1 className="text-2xl font-bold text-white tracking-tight leading-none">{institution?.name || 'EDM Portal'}</h1>
            </div>
          </div>

          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className="space-y-12"
          >
            {/* Connection Error Full-Screen Modal Overlay */}
            {!isConnected && (
              <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 z-[9999]">
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  className="relative overflow-hidden bg-slate-900 border-2 border-red-500 rounded-2xl shadow-2xl max-w-md w-full p-8 text-white flex flex-col items-center text-center"
                >
                  {/* Fundo listrado de advertência sutil */}
                  <div className="absolute inset-0 bg-[linear-gradient(45deg,#ff000005_25%,transparent_25%,transparent_50%,#ff000005_50%,#ff000005_75%,transparent_75%,transparent)] bg-[size:30px_30px] opacity-40 pointer-events-none" />
                  
                  <div className="relative mb-6">
                    {/* Anéis de pulso de perigo */}
                    <span className="absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-20 animate-ping" />
                    <div className="relative p-5 bg-red-600 text-white rounded-full border border-red-400 shadow-lg shadow-red-600/30 flex items-center justify-center">
                      <AlertTriangle size={36} className="animate-bounce" />
                    </div>
                  </div>
                  
                  <span className="px-3 py-1 bg-red-600/20 border border-red-500/30 text-red-400 text-[10px] font-black uppercase tracking-widest rounded-full mb-3">
                    Alerta de Conectividade
                  </span>
                  
                  <h5 className="text-lg font-black uppercase tracking-wider text-white leading-tight">
                    Falha de Conexão com o Servidor
                  </h5>
                  
                  <p className="text-xs font-medium text-slate-300 mt-3 leading-relaxed">
                    Não foi possível conectar ao banco de dados principal. Por favor, verifique a sua conexão com a internet.
                  </p>
                  
                  <div className="my-4 px-4 py-3 bg-red-950/50 border border-red-900/50 rounded-lg w-full text-left">
                    <span className="text-[8px] font-bold text-red-400 uppercase tracking-widest block mb-0.5">Detalhes da conexão:</span>
                    <p className="text-[11px] font-mono text-red-200 break-words">{connError || 'Dispositivo offline ou rede instável.'}</p>
                  </div>
                  
                  <p className="text-xs text-slate-400 font-medium mb-2">
                    Como este sistema opera de modo 100% online, é necessário estabelecer contato estável com o servidor principal para assegurar a integridade das operações.
                  </p>

                  <p className="text-xs text-red-400 font-semibold mb-6">
                    Se o problema persistir, sugerimos atualizar a página (F5) ou fechar o sistema e tentar novamente mais tarde.
                  </p>

                  <div className="flex flex-col gap-2 w-full">
                    <button
                      onClick={handleManualReconnect}
                      disabled={isRetrying}
                      className="w-full py-3 bg-red-600 hover:bg-red-500 disabled:bg-red-800 active:scale-[0.98] text-white font-black text-xs rounded-xl transition-all shadow-lg shadow-red-600/40 uppercase tracking-widest border border-red-500 cursor-pointer flex items-center justify-center gap-2"
                    >
                      {isRetrying ? (
                        <>
                          <RefreshCw size={12} className="animate-spin" />
                          Tentando reconectar...
                        </>
                      ) : (
                        'Tentar Reconectar Agora'
                      )}
                    </button>
                  </div>
                </motion.div>
              </div>
            )}

          <div className="space-y-4">
              <h2 className="text-4xl lg:text-5xl font-bold text-white leading-[1.1]">
                Formação para o <span className="text-amber-500">Serviço</span> e Missão
              </h2>
              <p className="text-white/60 font-medium text-lg max-w-md">
                Espaço de crescimento teológico e pastoral para leigos e leigas. {institution?.city ? `Atuando em ${institution.city}.` : ''}
              </p>
            </div>

            <div className="pb-8">
              <SchoolPillarsCarousel stats={stats} />
            </div>
          </motion.div>
        </div>

        <div className="relative z-10 pt-12 border-t border-white/5 flex flex-col gap-1">
           <div className="flex items-center gap-2">
              <CheckCircle className="text-amber-500" size={14} />
              <span className="text-[10px] font-bold uppercase tracking-widest text-white/30">Sistema de Gestão Acadêmica v2.0</span>
           </div>
           <p className="text-[8.5px] font-bold uppercase tracking-wider text-white/20 ml-5">
             Copyright © Escola Diocesana de Ministério
           </p>
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
          ) : isResettingPassword ? (
             <div className="space-y-6">
               <div className="text-center mb-8">
                 <h2 className="text-2xl font-bold text-slate-900 mb-2 uppercase tracking-tight">
                   Definir Nova Senha
                 </h2>
                 <p className="text-slate-400 font-semibold text-[10px] uppercase tracking-[0.2em]">
                   Digite a nova senha para sua conta
                 </p>
               </div>

               <AnimatePresence mode="wait">
                 {error && (
                   <motion.div 
                     initial={{ opacity: 0, height: 0 }}
                     animate={{ opacity: 1, height: 'auto' }}
                     className="p-4 bg-red-50 border border-red-100 rounded-2xl flex items-start gap-3"
                   >
                     <AlertCircle className="text-red-500 shrink-0 mt-0.5" size={16} />
                     <p className="text-xs font-bold text-red-700 leading-tight">{error}</p>
                   </motion.div>
                 )}
                 {successMessage && (
                   <motion.div 
                     initial={{ opacity: 0 }}
                     animate={{ opacity: 1 }}
                     className="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl flex items-start gap-3"
                   >
                     <CheckCircle2 className="text-emerald-500 shrink-0 mt-0.5" size={16} />
                     <p className="text-xs font-bold text-emerald-700 leading-tight">{successMessage}</p>
                   </motion.div>
                 )}
               </AnimatePresence>

               <form onSubmit={handleUpdatePassword} className="space-y-4">
                 <div className="space-y-1.5">
                   <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Nova Senha</label>
                   <div className="relative group">
                     <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-indigo-600 transition-colors" size={18} />
                     <input 
                       type="password"
                       required
                       value={newPassword}
                       onChange={e => setNewPassword(e.target.value)}
                       className="w-full pl-12 pr-6 py-4 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-900 text-sm focus:bg-white focus:border-indigo-600/30 focus:ring-4 focus:ring-indigo-600/5 transition-all outline-none"
                       placeholder="Mínimo de 6 caracteres"
                     />
                   </div>
                 </div>

                 <div className="space-y-1.5">
                   <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Confirmar Nova Senha</label>
                   <div className="relative group">
                     <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-indigo-600 transition-colors" size={18} />
                     <input 
                       type="password"
                       required
                       value={confirmNewPassword}
                       onChange={e => setConfirmNewPassword(e.target.value)}
                       className="w-full pl-12 pr-6 py-4 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-900 text-sm focus:bg-white focus:border-indigo-600/30 focus:ring-4 focus:ring-indigo-600/5 transition-all outline-none"
                       placeholder="Repita sua nova senha"
                     />
                   </div>
                 </div>

                 <div className="pt-4">
                   <button 
                     type="submit"
                     disabled={loading}
                     className="w-full py-4 bg-indigo-600 text-white rounded-xl font-bold text-[11px] uppercase tracking-[0.2em] shadow-lg shadow-indigo-900/20 hover:bg-indigo-700 hover:scale-[1.01] active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-70"
                   >
                     {loading ? <Loader2 className="animate-spin" size={20} /> : <CheckCircle2 size={20} />}
                     {loading ? 'Salvando...' : 'Salvar Nova Senha'}
                   </button>

                   <button 
                     type="button"
                     onClick={() => {
                       localStorage.removeItem('supabase_recovery_mode');
                       setIsResettingPassword(false);
                       setError(null);
                     }}
                     className="w-full mt-4 text-center text-[10px] font-bold text-slate-400 hover:text-slate-600 uppercase tracking-widest"
                   >
                     Cancelar e Voltar ao Login
                   </button>
                 </div>
               </form>
             </div>
          ) : isVerifyingOtp ? (
             <div className="space-y-6">
               <div className="text-center mb-8">
                 <h2 className="text-2xl font-bold text-slate-900 mb-2 uppercase tracking-tight">
                   Verificar Código
                 </h2>
                 <p className="text-slate-400 font-semibold text-[10px] uppercase tracking-[0.2em]">
                   Digite o código de 6 dígitos enviado ao seu e-mail
                 </p>
               </div>

               <AnimatePresence mode="wait">
                 {error && (
                   <motion.div 
                     initial={{ opacity: 0, height: 0 }}
                     animate={{ opacity: 1, height: 'auto' }}
                     className="p-4 bg-red-50 border border-red-100 rounded-2xl flex items-start gap-3"
                   >
                     <AlertCircle className="text-red-500 shrink-0 mt-0.5" size={16} />
                     <p className="text-xs font-bold text-red-700 leading-tight">{error}</p>
                   </motion.div>
                 )}
               </AnimatePresence>

               <form onSubmit={handleVerifyOtp} className="space-y-4">
                 <div className="space-y-1.5">
                   <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Seu E-mail</label>
                   <div className="relative group">
                     <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-indigo-600 transition-colors" size={18} />
                     <input 
                       type="email"
                       required
                       value={email}
                       onChange={e => setEmail(e.target.value)}
                       className="w-full pl-12 pr-6 py-4 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-900 text-sm focus:bg-white focus:border-indigo-600/30 focus:ring-4 focus:ring-indigo-600/5 transition-all outline-none"
                       placeholder="seuemail@exemplo.com"
                     />
                   </div>
                 </div>

                 <div className="space-y-1.5">
                   <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Código de 6 dígitos</label>
                   <div className="relative group">
                     <Shield className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-indigo-600 transition-colors" size={18} />
                     <input 
                       type="text"
                       required
                       maxLength={6}
                       value={otpCode}
                       onChange={e => setOtpCode(e.target.value.replace(/\D/g, ''))}
                       className="w-full pl-12 pr-6 py-4 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-900 text-sm text-center tracking-[0.5em] focus:bg-white focus:border-indigo-600/30 focus:ring-4 focus:ring-indigo-600/5 transition-all outline-none"
                       placeholder="123456"
                     />
                   </div>
                 </div>

                 <div className="pt-4">
                   <button 
                     type="submit"
                     disabled={loading}
                     className="w-full py-4 bg-indigo-600 text-white rounded-xl font-bold text-[11px] uppercase tracking-[0.2em] shadow-lg shadow-indigo-900/20 hover:bg-indigo-700 hover:scale-[1.01] active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-70"
                   >
                     {loading ? <Loader2 className="animate-spin" size={20} /> : <ArrowRight size={20} />}
                     {loading ? 'Verificando...' : 'Verificar Código'}
                   </button>

                   <button 
                     type="button"
                     onClick={() => {
                       setIsVerifyingOtp(false);
                       setError(null);
                     }}
                     className="w-full mt-4 text-center text-[10px] font-bold text-slate-400 hover:text-slate-600 uppercase tracking-widest"
                   >
                     Voltar ao Login
                   </button>
                 </div>
               </form>
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
                    className="mb-6 p-4 bg-emerald-50 border border-emerald-100 rounded-2xl flex flex-col gap-2"
                  >
                    <div className="flex items-start gap-3">
                      <CheckCircle2 className="text-emerald-500 shrink-0 mt-0.5" size={16} />
                      <p className="text-xs font-bold text-emerald-700 leading-tight">Link enviado! Verifique seu e-mail.</p>
                    </div>
                    <div className="text-[10px] text-slate-500 mt-2 bg-white/55 p-3 rounded-xl border border-slate-200 leading-relaxed font-medium text-left">
                      💡 <strong>Dica de Redirecionamento:</strong> Se ao clicar no link você for enviado para <strong>localhost:3000</strong> e der erro, copie o código de 6 dígitos contido no e-mail e clique em <strong>"Entrar com Código / Já tenho um código"</strong> abaixo para redefinir sua senha diretamente aqui!
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {isForgotPassword && resetSent ? (
                <div className="space-y-6">
                  <div className="p-5 bg-indigo-50/50 border border-indigo-100 rounded-2xl space-y-4">
                    <div className="flex items-start gap-3">
                      <RefreshCw className="text-indigo-600 shrink-0 mt-0.5 animate-spin-slow" size={18} />
                      <div>
                        <h3 className="text-xs font-bold text-indigo-900 uppercase tracking-wider">
                          O Link do E-mail deu erro?
                        </h3>
                        <p className="text-[11px] text-slate-600 leading-relaxed font-medium mt-1">
                          Por estarmos em ambiente de testes, o link recebido por e-mail pode redirecionar incorretamente para <strong>localhost:3000</strong> e dar erro.
                        </p>
                      </div>
                    </div>

                    <div className="bg-white/80 p-4 rounded-xl border border-indigo-100/55 space-y-3">
                      <p className="text-[11px] text-slate-700 leading-relaxed font-semibold">
                        Para resolver isso de forma simples, copie o link completo recebido em seu e-mail e cole-o aqui abaixo:
                      </p>

                      <form onSubmit={handleProcessPastedUrl} className="space-y-3">
                        <input 
                          type="text"
                          required
                          value={pastedUrl}
                          onChange={e => setPastedUrl(e.target.value)}
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 placeholder:text-slate-400 outline-none focus:bg-white focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/5 transition-all"
                          placeholder="Cole o link do e-mail (ex: http://localhost:3000/#access_token=...)"
                        />
                        <button 
                          type="submit"
                          disabled={loading}
                          className="w-full py-3.5 bg-indigo-600 text-white rounded-xl font-bold text-[10px] uppercase tracking-widest shadow-md shadow-indigo-900/10 hover:bg-indigo-700 hover:scale-[1.01] active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-70"
                        >
                          {loading ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle2 size={16} />}
                          Processar Link e Redefinir Senha
                        </button>
                      </form>
                    </div>
                  </div>

                  <div className="pt-2 flex flex-col gap-3">
                    <button 
                      type="button"
                      onClick={() => { setIsVerifyingOtp(true); setIsForgotPassword(false); setError(null); }}
                      className="w-full text-center text-[10px] font-black text-indigo-600 hover:text-indigo-800 uppercase tracking-widest"
                    >
                      Entrar com Código / Já tenho um código
                    </button>

                    <button 
                      type="button"
                      onClick={() => { setIsForgotPassword(false); setResetSent(false); setError(null); }}
                      className="w-full text-center text-[10px] font-bold text-slate-400 hover:text-slate-600 uppercase tracking-widest"
                    >
                      Voltar para o Login
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={isForgotPassword ? handleForgotPassword : (isRegistering ? handleRegister : handleLogin)} className="space-y-4">
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
                     <div className="flex items-center justify-between px-1">
                        <label className="flex items-center gap-2 cursor-pointer group">
                          <div className={cn(
                            "w-4 h-4 rounded border flex items-center justify-center transition-all",
                            rememberMe ? "bg-indigo-600 border-indigo-600" : "bg-slate-50 border-slate-300 group-hover:border-slate-400"
                          )}>
                            <input 
                              type="checkbox"
                              className="hidden"
                              checked={rememberMe}
                              onChange={e => setRememberMe(e.target.checked)}
                            />
                            {rememberMe && <CheckCircle size={10} className="text-white" />}
                          </div>
                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Lembrar-me</span>
                        </label>

                        <button 
                          type="button" 
                          onClick={() => setIsForgotPassword(true)}
                          className="text-[10px] font-black text-indigo-600 hover:text-indigo-800 transition-colors uppercase tracking-widest"
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

                    {isForgotPassword && (
                      <button 
                        type="button"
                        onClick={() => { setIsVerifyingOtp(true); setIsForgotPassword(false); setError(null); }}
                        className="w-full text-center text-[10px] font-black text-indigo-600 hover:text-indigo-800 uppercase tracking-widest mt-2"
                      >
                        Entrar com Código / Já tenho um código
                      </button>
                    )}

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
              )}
            </>
          )}

          {/* Emergency session reset if stuck */}
          {user && !profile && !authLoading && (
            <div className="mt-12 pt-8 border-t border-slate-100 flex flex-col items-center gap-3">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Sessão Ativa: {user.email}</p>
              <div className="p-4 bg-amber-50 border border-amber-100 rounded-xl mb-2">
                <p className="text-[10px] font-bold text-amber-700 uppercase mb-1">Perfil em Sincronização</p>
                <p className="text-[11px] text-amber-600 leading-tight"> Detectamos seu login, mas seu perfil ainda não foi carregado. Isso pode ocorrer no primeiro acesso ou devido a instabilidades na rede.</p>
              </div>
              <div className="flex gap-2 w-full">
                <button 
                  onClick={() => refreshProfile(user?.uid)}
                  disabled={loading}
                  className="flex-1 px-4 py-3 bg-indigo-600 text-white rounded-xl font-bold text-[10px] uppercase tracking-widest hover:bg-indigo-700 transition-all flex items-center justify-center gap-2"
                >
                  {loading ? <Loader2 className="animate-spin" size={14} /> : <CheckCircle size={14} />}
                  Tentar Sincronizar
                </button>
                <button 
                  onClick={() => logout()}
                  className="px-4 py-3 bg-red-50 text-red-600 rounded-xl font-bold text-[10px] uppercase tracking-widest hover:bg-red-600 hover:text-white transition-all border border-red-100"
                >
                  Sair
                </button>
              </div>
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

function SchoolPillarsCarousel({ stats }: { stats: { classes: number; students: number; subjects: number } }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [progress, setProgress] = useState(0);

  const slides = [
    {
      id: 'disciplinas',
      icon: <GraduationCap size={20} />,
      title: "Matriz Curricular Teológica",
      text: "Grade de disciplinas estruturadas para o aprofundamento das escrituras, da história e do ministério pastoral na Diocese.",
      badge: `${stats.subjects > 0 ? stats.subjects : '26'} Disciplinas`,
      image: "https://images.unsplash.com/photo-1524995997946-a1c2e315a42f?q=80&w=600&auto=format&fit=crop"
    },
    {
      id: 'alunos',
      icon: <Users size={20} />,
      title: "Comunidade Vocacionada",
      text: "Mais de cem leigos e leigas reunidos em ambiente acadêmico para o fortalecimento da fé e do testemunho cristão.",
      badge: `Mais de ${stats.students || '111'} Alunos`,
      image: "https://images.unsplash.com/photo-1517486808906-6ca8b3f04846?q=80&w=600&auto=format&fit=crop"
    },
    {
      id: 'sede',
      icon: <Shield size={20} />,
      title: "Sede Própria & Formativa",
      text: "Estrutura diocesana completa dedicada ao acolhimento das turmas, biblioteca teológica e momentos comunitários.",
      badge: "Sede Própria",
      image: "https://images.unsplash.com/photo-1548625361-155deee223d0?q=80&w=600&auto=format&fit=crop"
    },
    {
      id: 'ensino',
      icon: <BookOpen size={20} />,
      title: "Formação para o Laicato",
      text: "Estudos teológicos e pastorais sólidos que capacitam para a ação pastoral e o serviço missionário nas paróquias.",
      badge: "Formação Integral",
      image: "https://images.unsplash.com/photo-1504052434569-70ad58565b90?q=80&w=600&auto=format&fit=crop"
    }
  ];

  useEffect(() => {
    if (!isPlaying) return;
    
    const intervalTime = 5000; // 5 seconds per slide
    const step = 50;
    const increment = (step / intervalTime) * 100;

    const timer = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          setCurrentIndex((prevIdx) => (prevIdx + 1) % slides.length);
          return 0;
        }
        return prev + increment;
      });
    }, step);

    return () => clearInterval(timer);
  }, [isPlaying, slides.length, currentIndex]);

  const handleNext = () => {
    setCurrentIndex((prev) => (prev + 1) % slides.length);
    setProgress(0);
  };

  const handlePrev = () => {
    setCurrentIndex((prev) => (prev - 1 + slides.length) % slides.length);
    setProgress(0);
  };

  const handleSelect = (idx: number) => {
    setCurrentIndex(idx);
    setProgress(0);
  };

  const currentSlide = slides[currentIndex];

  return (
    <div 
      className="relative w-full min-h-[220px] rounded-[2rem] border border-white/10 overflow-hidden bg-gradient-to-br from-white/5 to-white/0 shadow-2xl group/carousel select-none cursor-pointer"
      onMouseEnter={() => setIsPlaying(false)}
      onMouseLeave={() => setIsPlaying(true)}
    >
      {/* Dynamic Background Image with subtle zoom & fade transition */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentIndex}
          initial={{ opacity: 0, scale: 1.05 }}
          animate={{ opacity: 0.15, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.8, ease: "easeInOut" }}
          className="absolute inset-0 w-full h-full"
        >
          <img 
            src={currentSlide.image} 
            alt={currentSlide.title}
            className="w-full h-full object-cover filter saturate-50"
            referrerPolicy="no-referrer"
          />
        </motion.div>
      </AnimatePresence>

      {/* Decorative dark overlays to keep text readable */}
      <div className="absolute inset-0 bg-gradient-to-t from-[#00174b] via-[#00174b]/75 to-transparent pointer-events-none" />

      {/* Slide Content Layout */}
      <div className="relative z-10 p-6 flex flex-col justify-between min-h-[220px] h-full">
        {/* Top bar: Icon and Badge */}
        <div className="flex items-center justify-between gap-4">
          <div className="w-10 h-10 bg-white/10 backdrop-blur-md rounded-xl flex items-center justify-center text-amber-500 shadow-inner">
            {currentSlide.icon}
          </div>
          <span className="px-3 py-1 bg-amber-500/10 border border-amber-500/20 text-amber-400 font-black text-[9px] uppercase tracking-wider rounded-full">
            {currentSlide.badge}
          </span>
        </div>

        {/* Middle part: Title and Description */}
        <div className="my-3 space-y-1.5">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentIndex}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.4 }}
              className="space-y-1"
            >
              <h3 className="text-white font-black text-sm tracking-wide uppercase">
                {currentSlide.title}
              </h3>
              <p className="text-white/70 text-[11px] font-semibold leading-relaxed max-w-md">
                {currentSlide.text}
              </p>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Bottom bar: Indicator Dots + Arrow controls */}
        <div className="flex items-center justify-between pt-2 border-t border-white/5">
          {/* Custom Indicator dots with progress fills */}
          <div className="flex items-center gap-2">
            {slides.map((slide, idx) => (
              <button
                key={slide.id}
                onClick={() => handleSelect(idx)}
                className="group relative h-1.5 rounded-full transition-all duration-300 overflow-hidden bg-white/20"
                style={{ width: currentIndex === idx ? '32px' : '8px' }}
              >
                {currentIndex === idx && (
                  <motion.div 
                    className="absolute top-0 left-0 h-full bg-amber-500 rounded-full"
                    style={{ width: `${progress}%` }}
                    layoutId="progress-bar"
                  />
                )}
                {currentIndex !== idx && (
                  <div className="absolute inset-0 bg-transparent group-hover:bg-white/40 rounded-full" />
                )}
              </button>
            ))}
          </div>

          {/* Quick Nav Controls */}
          <div className="flex items-center gap-1.5">
            <button 
              onClick={handlePrev}
              className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 active:scale-95 border border-white/10 text-white/60 hover:text-white transition-all"
            >
              <ChevronLeft size={14} />
            </button>
            <button 
              onClick={handleNext}
              className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 active:scale-95 border border-white/10 text-white/60 hover:text-white transition-all"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
