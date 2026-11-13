import React, { useState, useEffect, useRef } from 'react';
import { supabase, isSupabaseConfigured, fetchWithTimeout, testConnection } from '../lib/supabase';
import { saveData, deleteData, fetchCount, getInstitutionSettings } from '../lib/database';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { DEFAULT_LOGO } from '../lib/default-logo';
import sanctuaryBgImg from '../assets/images/login_bg_sanctuary_1794530752025.jpg';
import seminaryBgImg from '../assets/images/login_bg_seminary_1794530753129.jpg';
import courtyardBgImg from '../assets/images/login_bg_courtyard_1794530753072.jpg';
import { 
  ShieldAlert,
  Mail, 
  Lock, 
  Loader2, 
  AlertCircle,
  AlertTriangle,
  RefreshCw,
  CheckCircle2,
  CheckCircle,
  ArrowRight,
  Eye,
  EyeOff
} from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

const BACKGROUND_IMAGES = [
  {
    src: sanctuaryBgImg,
    alt: 'Nave e santuário paroquial da Diocese'
  },
  {
    src: seminaryBgImg,
    alt: 'Biblioteca e sala de estudos teológicos'
  },
  {
    src: courtyardBgImg,
    alt: 'Pátio e capela do centro de formação pastoral'
  }
];

export function Login() {
  const [email, setEmail] = useState(() => {
    return localStorage.getItem('remembered_email') || '';
  });
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [bgIndex, setBgIndex] = useState(0);
  const [failedBgIndexes, setFailedBgIndexes] = useState<Record<number, boolean>>({});
  const [isRegistering, setIsRegistering] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [institution, setInstitution] = useState<any>(() => {
    try {
      const cached = localStorage.getItem('cached_institution_settings');
      return cached ? JSON.parse(cached) : null;
    } catch (e) {
      return null;
    }
  });
  const [stats, setStats] = useState({ classes: 0, students: 0, subjects: 0 });
  const { user, profile, loading: authLoading, refreshProfile, logout, isLocked, isConnected, connError, setPersistMode } = useAuth();
  const [rememberMe, setRememberMe] = useState(() => {
    return !!localStorage.getItem('remembered_email');
  });
  
  const [logoutNotice, setLogoutNotice] = useState<string | null>(() => {
    const reason = sessionStorage.getItem('logout_reason') || localStorage.getItem('logout_reason');
    if (reason === 'inactivity') {
      sessionStorage.removeItem('logout_reason');
      localStorage.removeItem('logout_reason');
      return 'Sua sessão foi desconectada por inatividade para sua segurança. Por favor, identifique-se novamente.';
    }
    return null;
  });
  
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
  
  // Se houver sinalização de logout total, força a rota de destino a ser o Dashboard ("/")
  const isForcedDashboard = localStorage.getItem('force_dashboard_on_login') === 'true';
  const from = isForcedDashboard ? "/" : (location.state?.from?.pathname || "/");
  
  const stateError = location.state?.error;

  const [isRetrying, setIsRetrying] = useState(false);

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
      localStorage.removeItem('force_dashboard_on_login');
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

  // Rotate background images smoothly (respecting prefers-reduced-motion)
  useEffect(() => {
    const prefersReducedMotion = typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) return;

    const timer = window.setInterval(() => {
      setBgIndex((prev) => (prev + 1) % BACKGROUND_IMAGES.length);
    }, 8000);

    return () => window.clearInterval(timer);
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
      setPersistMode('session');
      localStorage.removeItem('auth_persist_mode');

      // Inicializa timestamp de atividade para garantir contagem limpa
      const nowStr = Date.now().toString();
      localStorage.setItem('app_last_activity', nowStr);
      sessionStorage.setItem('app_last_activity', nowStr);
      sessionStorage.setItem('app_session_active', 'true');

      // Garante que o novo login inicie sempre com a unidade Matriz selecionada e ativa
      localStorage.setItem('selected_global_unit_id', 'matriz');
      sessionStorage.setItem('just_logged_in', 'true');
      try {
        Object.keys(sessionStorage).forEach(k => {
          if (k.startsWith('unit_session_init_')) {
            sessionStorage.removeItem(k);
          }
        });
      } catch {}

      const result = await fetchWithTimeout(supabase.auth.signInWithPassword({
        email: emailNormalized,
        password
      }), 20000);
      
      if (result?.error) throw result.error;

      if (result?.data?.user) {
        sessionStorage.setItem('app_session_active', 'true');
        try {
          await refreshProfile(result.data.user.id);
        } catch (profErr) {
          console.warn("[Login] Erro ao sincronizar perfil imediatamente:", profErr);
        }
        localStorage.removeItem('force_dashboard_on_login');
        navigate(from, { replace: true });
      }
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
          unit_id: (userData as any)?.unit_id || 'all',
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
          // Garante que o novo login inicie sempre com a unidade Matriz selecionada e ativa
          localStorage.setItem('selected_global_unit_id', 'matriz');
          sessionStorage.setItem('just_logged_in', 'true');
          try {
            Object.keys(sessionStorage).forEach(k => {
              if (k.startsWith('unit_session_init_')) {
                sessionStorage.removeItem(k);
              }
            });
          } catch {}
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

      setNewPassword('');
      setConfirmNewPassword('');
      setSuccessMessage("Senha redefinida com sucesso! Você já está autenticado no sistema. Redirecionando...");
      
      // Garante que o novo login inicie sempre com a unidade Matriz selecionada e ativa
      localStorage.setItem('selected_global_unit_id', 'matriz');
      sessionStorage.setItem('just_logged_in', 'true');
      try {
        Object.keys(sessionStorage).forEach(k => {
          if (k.startsWith('unit_session_init_')) {
            sessionStorage.removeItem(k);
          }
        });
      } catch {}

      // Atualiza o perfil caso o usuário já esteja logado
      await refreshProfile();
      
      setTimeout(() => {
        localStorage.removeItem('supabase_recovery_mode');
        localStorage.removeItem('supabase_recovery_tokens');
        setRecoverySession(null);
        setIsResettingPassword(false);
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
        redirectTo: `${window.location.origin}/#/reset-password`,
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

  const dioceseTitle = (() => {
    const cityRaw = (institution?.city || institution?.city_uf || 'GUARULHOS').split('/')[0].trim();
    return cityRaw.toUpperCase().startsWith('DIOCESE DE') ? cityRaw.toUpperCase() : `DIOCESE DE ${cityRaw.toUpperCase()}`;
  })();
  const institutionName = institution?.name || 'Escola Diocesana de Ministério';

  return (
    <div className="min-h-screen w-full bg-[#09292F] relative flex flex-col justify-between items-center px-4 py-6 sm:px-6 sm:py-8 overflow-x-hidden font-sans">
      {/* Full-Screen Rotating Photographic Backdrop with Teal/Petrol Overlay */}
      <div className="fixed inset-0 z-0 pointer-events-none select-none overflow-hidden bg-[#09292F]">
        {BACKGROUND_IMAGES.map((img, idx) => (
          !failedBgIndexes[idx] && (
            <img
              key={img.alt}
              src={img.src}
              alt={img.alt}
              referrerPolicy="no-referrer"
              onError={() => setFailedBgIndexes((prev) => ({ ...prev, [idx]: true }))}
              className={cn(
                "absolute inset-0 w-full h-full object-cover object-center transition-opacity duration-1000 ease-in-out scale-[1.02]",
                bgIndex === idx ? "opacity-100" : "opacity-0"
              )}
            />
          )
        ))}
        {/* Measured Petrol-Teal Scrim for visual harmony and high legibility */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(135deg, rgba(7, 45, 52, 0.86) 0%, rgba(13, 89, 92, 0.78) 50%, rgba(6, 33, 38, 0.90) 100%)',
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(circle at 50% 45%, rgba(20, 184, 166, 0.14) 0%, rgba(4, 24, 28, 0.45) 100%)',
          }}
        />
      </div>

      {/* Connection Error Full-Screen Modal Overlay */}
      {!isConnected && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 z-[9999]">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="relative overflow-hidden bg-slate-900 border-2 border-red-500 rounded-2xl shadow-2xl max-w-md w-full p-8 text-white flex flex-col items-center text-center"
          >
            <div className="absolute inset-0 bg-[linear-gradient(45deg,#ff000005_25%,transparent_25%,transparent_50%,#ff000005_50%,#ff000005_75%,transparent_75%,transparent)] bg-[size:30px_30px] opacity-40 pointer-events-none" />

            <div className="relative mb-6">
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

      {/* Top balance spacer */}
      <div className="relative z-10 h-2 sm:h-4 shrink-0" />

      {/* Centered Split Login Card (Modeled on Reference Layout) */}
      <motion.main
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 w-full max-w-[840px] my-auto rounded-2xl bg-white shadow-[0_28px_70px_-15px_rgba(0,0,0,0.6)] border border-white/20 overflow-hidden grid grid-cols-1 md:grid-cols-12"
      >
        {/* Left Brand Panel: Preserves Top-Left Circled Institution Identity */}
        <div className="md:col-span-5 relative overflow-hidden bg-gradient-to-br from-[#0F766E] via-[#0C5A60] to-[#08343B] text-white px-7 py-8 sm:px-8 sm:py-10 flex flex-col items-center justify-center text-center">
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                'radial-gradient(circle at 50% 38%, rgba(255, 255, 255, 0.14) 0%, transparent 65%)',
            }}
          />

          <div className="relative z-10 flex flex-col items-center">
            <div className="w-20 h-20 sm:w-24 sm:h-24 mb-5 flex items-center justify-center">
              <img
                src={institution?.logo_url || DEFAULT_LOGO}
                alt={`Brasão ${institutionName}`}
                className="w-full h-full object-contain drop-shadow-[0_10px_24px_rgba(0,0,0,0.45)] transition-transform duration-300 hover:scale-105"
                referrerPolicy="no-referrer"
              />
            </div>

            <p className="text-[11px] font-extrabold uppercase tracking-[0.26em] text-amber-400 mb-2">
              {dioceseTitle}
            </p>

            <h1 className="text-xl sm:text-[22px] font-extrabold text-white tracking-tight leading-snug max-w-[260px] text-balance">
              {institutionName}
            </h1>

            <div className="w-12 h-px bg-white/25 my-4" />

            <p className="text-xs font-medium text-teal-50/85 leading-relaxed max-w-[240px]">
              Formação teológica e pastoral para o serviço e missão na Igreja.
            </p>
          </div>
        </div>

        {/* Right Form Panel: Preserves Circled Login Module */}
        <div className="md:col-span-7 bg-white px-6 py-8 sm:px-10 sm:py-10 flex flex-col justify-center">
          <div className="w-full max-w-sm mx-auto">
            {isResettingPassword ? (
              <div className="space-y-6">
                <div className="text-center mb-6">
                  <h2 className="text-2xl font-bold text-slate-900 mb-1.5 uppercase tracking-tight">
                    Definir Nova Senha
                  </h2>
                  <p className="text-slate-500 font-semibold text-[10px] uppercase tracking-[0.2em]">
                    Digite a nova senha para sua conta
                  </p>
                </div>

                <AnimatePresence mode="wait">
                  {error && (
                    <motion.div
                      key="reset-password-error"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3"
                    >
                      <AlertCircle className="text-red-500 shrink-0 mt-0.5" size={16} />
                      <p className="text-xs font-bold text-red-700 leading-tight">{error}</p>
                    </motion.div>
                  )}
                  {successMessage && (
                    <motion.div
                      key="reset-password-success"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-3"
                    >
                      <CheckCircle2 className="text-emerald-600 shrink-0 mt-0.5" size={16} />
                      <p className="text-xs font-bold text-emerald-700 leading-tight">{successMessage}</p>
                    </motion.div>
                  )}
                </AnimatePresence>

                <form onSubmit={handleUpdatePassword} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-600 uppercase tracking-widest ml-1 block">
                      Nova Senha
                    </label>
                    <div className="relative group">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-teal-600 transition-colors pointer-events-none" size={17} />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        value={newPassword}
                        onChange={e => setNewPassword(e.target.value)}
                        className="w-full pl-11 pr-11 py-3.5 rounded-xl font-medium text-sm outline-none"
                        placeholder="Mínimo de 6 caracteres"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(prev => !prev)}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-teal-700 p-1 transition-colors cursor-pointer"
                        title={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                      >
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-600 uppercase tracking-widest ml-1 block">
                      Confirmar Nova Senha
                    </label>
                    <div className="relative group">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-teal-600 transition-colors pointer-events-none" size={17} />
                      <input
                        type={showConfirmPassword ? 'text' : 'password'}
                        required
                        value={confirmNewPassword}
                        onChange={e => setConfirmNewPassword(e.target.value)}
                        className="w-full pl-11 pr-11 py-3.5 rounded-xl font-medium text-sm outline-none"
                        placeholder="Repita sua nova senha"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(prev => !prev)}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-teal-700 p-1 transition-colors cursor-pointer"
                        title={showConfirmPassword ? 'Ocultar senha' : 'Mostrar senha'}
                      >
                        {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>

                  <div className="pt-3">
                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full py-3.5 bg-teal-600 text-white rounded-xl font-bold text-[11px] uppercase tracking-[0.18em] shadow-lg shadow-teal-900/20 hover:bg-teal-700 active:scale-[0.98] transition-all flex items-center justify-center gap-2.5 disabled:opacity-70 cursor-pointer"
                    >
                      {loading ? (
                        <React.Fragment key="save-loading">
                          <Loader2 className="animate-spin" size={18} />
                          <span>Salvando...</span>
                        </React.Fragment>
                      ) : (
                        <React.Fragment key="save-ready">
                          <CheckCircle2 size={18} />
                          <span>Salvar Nova Senha</span>
                        </React.Fragment>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        localStorage.removeItem('supabase_recovery_mode');
                        setIsResettingPassword(false);
                        setError(null);
                      }}
                      className="w-full mt-4 text-center text-[10px] font-bold text-slate-500 hover:text-slate-700 uppercase tracking-widest cursor-pointer"
                    >
                      Cancelar e Voltar ao Login
                    </button>
                  </div>
                </form>
              </div>
            ) : (
              <>
                <div className="text-center mb-6">
                  <h2 className="text-2xl font-bold text-slate-900 mb-1 uppercase tracking-tight">
                    {isRegistering ? 'Primeiro Acesso' : isForgotPassword ? 'Recuperar Acesso' : 'Bem-vindo'}
                  </h2>
                  <p className="text-slate-500 font-semibold text-[10px] uppercase tracking-[0.2em]">
                    {isRegistering ? 'Crie sua senha de estudante' : isForgotPassword ? 'Redefina sua senha por e-mail' : 'Portal Administrativo e Acadêmico'}
                  </p>
                </div>

                {/* Tabs for Login / Primeiro Acesso */}
                {!isForgotPassword && (
                  <div className="flex bg-slate-100 p-1 rounded-xl mb-5 border border-slate-200">
                    <button
                      type="button"
                      onClick={() => { setIsRegistering(false); setError(null); }}
                      className={cn(
                        "flex-1 py-2.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all cursor-pointer",
                        !isRegistering ? "bg-white text-teal-800 shadow-sm" : "text-slate-600 hover:text-slate-900"
                      )}
                    >
                      Entrar
                    </button>
                    <button
                      type="button"
                      onClick={() => { setIsRegistering(true); setError(null); }}
                      className={cn(
                        "flex-1 py-2.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all cursor-pointer",
                        isRegistering ? "bg-white text-teal-800 shadow-sm" : "text-slate-600 hover:text-slate-900"
                      )}
                    >
                      Primeiro Acesso
                    </button>
                  </div>
                )}

                <AnimatePresence mode="wait">
                  {logoutNotice && (
                    <motion.div
                      key="login-logout-notice"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mb-5 p-3.5 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3"
                    >
                      <ShieldAlert className="text-amber-600 shrink-0 mt-0.5" size={17} />
                      <div className="flex-1">
                        <p className="text-xs font-bold text-amber-900 leading-tight">Sessão Finalizada</p>
                        <p className="text-[11px] text-amber-800 leading-relaxed font-medium mt-0.5">{logoutNotice}</p>
                      </div>
                    </motion.div>
                  )}
                  {error && (
                    <motion.div
                      key="login-error-message"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mb-5 p-3.5 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3"
                    >
                      <AlertCircle className="text-red-500 shrink-0 mt-0.5" size={16} />
                      <p className="text-xs font-bold text-red-700 leading-tight">{error}</p>
                    </motion.div>
                  )}
                  {resetSent && (
                    <motion.div
                      key="login-reset-sent-message"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mb-5 p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-3"
                    >
                      <CheckCircle2 className="text-emerald-600 shrink-0 mt-0.5" size={16} />
                      <p className="text-xs font-bold text-emerald-700 leading-tight">Link enviado! Verifique seu e-mail.</p>
                    </motion.div>
                  )}
                </AnimatePresence>

                {isForgotPassword && resetSent ? (
                  <div className="space-y-5">
                    <div className="p-4 bg-teal-50/70 border border-teal-200 rounded-xl space-y-3">
                      <div className="flex items-start gap-3">
                        <RefreshCw className="text-teal-700 shrink-0 mt-0.5" size={17} />
                        <div>
                          <h3 className="text-xs font-bold text-teal-900 uppercase tracking-wider">
                            Dificuldade com o redirecionamento?
                          </h3>
                          <p className="text-[11px] text-slate-600 leading-relaxed font-medium mt-1">
                            Se o redirecionamento automático do e-mail não funcionar no seu navegador, cole o link recebido abaixo para concluir a redefinição de senha com segurança.
                          </p>
                        </div>
                      </div>

                      <div className="bg-white p-3.5 rounded-lg border border-teal-100 space-y-2.5">
                        <p className="text-[11px] text-slate-700 leading-relaxed font-semibold">
                          Copie o link completo recebido em seu e-mail e cole-o aqui:
                        </p>

                        <form onSubmit={handleProcessPastedUrl} className="space-y-2.5">
                          <input
                            type="text"
                            required
                            value={pastedUrl}
                            onChange={e => setPastedUrl(e.target.value)}
                            className="w-full px-3.5 py-2.5 rounded-lg text-xs font-semibold outline-none"
                            placeholder="Cole o link completo do e-mail (ex: https://...)"
                          />
                          <button
                            type="submit"
                            disabled={loading}
                            className="w-full py-3 bg-teal-600 text-white rounded-xl font-bold text-[10px] uppercase tracking-widest shadow-md shadow-teal-900/15 hover:bg-teal-700 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-70 cursor-pointer"
                          >
                            {loading ? (
                              <React.Fragment key="pasted-process-loading">
                                <Loader2 className="animate-spin" size={16} />
                                <span>Processando...</span>
                              </React.Fragment>
                            ) : (
                              <React.Fragment key="pasted-process-ready">
                                <CheckCircle2 size={16} />
                                <span>Processar Link e Redefinir Senha</span>
                              </React.Fragment>
                            )}
                          </button>
                        </form>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => { setIsForgotPassword(false); setResetSent(false); setError(null); }}
                      className="w-full text-center text-[10px] font-bold text-slate-500 hover:text-slate-700 uppercase tracking-widest cursor-pointer"
                    >
                      Voltar para o Login
                    </button>
                  </div>
                ) : (
                  <form onSubmit={isForgotPassword ? handleForgotPassword : (isRegistering ? handleRegister : handleLogin)} className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-600 uppercase tracking-widest ml-1 block">
                        E-mail Institucional
                      </label>
                      <div className="relative group">
                        <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-teal-600 transition-colors pointer-events-none" size={17} />
                        <input
                          type="email"
                          required
                          value={email}
                          onChange={e => setEmail(e.target.value)}
                          className="w-full pl-11 pr-4 py-3.5 rounded-xl font-medium text-sm outline-none"
                          placeholder="aluno@diocese.com"
                        />
                      </div>
                    </div>

                    {!isForgotPassword && (
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-slate-600 uppercase tracking-widest ml-1 block">
                          Senha de Acesso
                        </label>
                        <div className="relative group">
                          <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-teal-600 transition-colors pointer-events-none" size={17} />
                          <input
                            type={showPassword ? 'text' : 'password'}
                            required={!isForgotPassword}
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            className="w-full pl-11 pr-11 py-3.5 rounded-xl font-medium text-sm outline-none"
                            placeholder="••••••••"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(prev => !prev)}
                            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-teal-700 p-1 transition-colors cursor-pointer"
                            title={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                          >
                            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                          </button>
                        </div>
                      </div>
                    )}

                    {isRegistering && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="space-y-1.5"
                      >
                        <label className="text-[10px] font-bold text-slate-600 uppercase tracking-widest ml-1 block">
                          Confirmar Senha
                        </label>
                        <div className="relative group">
                          <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-teal-600 transition-colors pointer-events-none" size={17} />
                          <input
                            type={showConfirmPassword ? 'text' : 'password'}
                            required
                            value={confirmPassword}
                            onChange={e => setConfirmPassword(e.target.value)}
                            className="w-full pl-11 pr-11 py-3.5 rounded-xl font-medium text-sm outline-none"
                            placeholder="••••••••"
                          />
                          <button
                            type="button"
                            onClick={() => setShowConfirmPassword(prev => !prev)}
                            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-teal-700 p-1 transition-colors cursor-pointer"
                            title={showConfirmPassword ? 'Ocultar senha' : 'Mostrar senha'}
                          >
                            {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                          </button>
                        </div>
                      </motion.div>
                    )}

                    {!isRegistering && !isForgotPassword && (
                      <div className="flex flex-wrap items-center justify-between px-0.5 gap-2 pt-0.5">
                        <label
                          className="flex items-center gap-2 cursor-pointer group select-none"
                          title="Se desmarcado, a sessão expira ao fechar o navegador."
                        >
                          <div
                            className={cn(
                              "w-4 h-4 rounded border flex items-center justify-center transition-all shrink-0",
                              rememberMe ? "bg-teal-600 border-teal-600" : "bg-slate-50 border-slate-400 group-hover:border-teal-600"
                            )}
                          >
                            <input
                              type="checkbox"
                              className="hidden"
                              checked={rememberMe}
                              onChange={e => setRememberMe(e.target.checked)}
                            />
                            {rememberMe && <CheckCircle size={10} className="text-white" />}
                          </div>
                          <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider whitespace-nowrap">
                            Lembrar e-mail neste dispositivo
                          </span>
                        </label>

                        <button
                          type="button"
                          onClick={() => setIsForgotPassword(true)}
                          className="text-[10px] font-bold text-teal-700 hover:text-teal-900 transition-colors uppercase tracking-wider whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          Esqueceu a senha?
                        </button>
                      </div>
                    )}

                    <div className="pt-3 space-y-3">
                      <button
                        type="submit"
                        disabled={loading}
                        className="w-full py-3.5 bg-teal-600 text-white rounded-xl font-bold text-[11px] uppercase tracking-[0.18em] shadow-lg shadow-teal-900/25 hover:bg-teal-700 active:scale-[0.98] transition-all flex items-center justify-center gap-2.5 disabled:opacity-70 cursor-pointer"
                      >
                        {loading ? (
                          <React.Fragment key="login-loading">
                            <Loader2 className="animate-spin" size={18} />
                            <span>{isForgotPassword ? 'Enviando...' : isRegistering ? 'Ativando...' : 'Acessando...'}</span>
                          </React.Fragment>
                        ) : (
                          <React.Fragment key="login-ready">
                            <ArrowRight size={18} />
                            <span>{isForgotPassword ? 'Enviar Link' : isRegistering ? 'Ativar Minha Conta' : 'Acessar Sistema'}</span>
                          </React.Fragment>
                        )}
                      </button>

                      {(isForgotPassword || isRegistering) && (
                        <button
                          type="button"
                          onClick={() => { setIsForgotPassword(false); setIsRegistering(false); setError(null); }}
                          className="w-full text-center text-[10px] font-bold text-slate-500 hover:text-slate-700 uppercase tracking-widest cursor-pointer"
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
              <div className="mt-8 pt-6 border-t border-slate-200 flex flex-col items-center gap-3">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Sessão Ativa: {user.email}</p>
                <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl w-full">
                  <p className="text-[10px] font-bold text-amber-800 uppercase mb-1">Perfil em Sincronização</p>
                  <p className="text-[11px] text-amber-700 leading-tight">Detectamos seu login, mas seu perfil ainda não foi carregado. Isso pode ocorrer no primeiro acesso ou devido a instabilidades na rede.</p>
                </div>
                <div className="flex gap-2 w-full">
                  <button
                    onClick={() => refreshProfile(user?.uid)}
                    disabled={loading}
                    className="flex-1 px-4 py-3 bg-teal-600 text-white rounded-xl font-bold text-[10px] uppercase tracking-widest hover:bg-teal-700 transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {loading ? (
                      <React.Fragment key="sync-loading">
                        <Loader2 className="animate-spin" size={14} />
                        <span>Sincronizando...</span>
                      </React.Fragment>
                    ) : (
                      <React.Fragment key="sync-ready">
                        <CheckCircle size={14} />
                        <span>Tentar Sincronizar</span>
                      </React.Fragment>
                    )}
                  </button>
                  <button
                    onClick={() => logout()}
                    className="px-4 py-3 bg-red-50 text-red-600 rounded-xl font-bold text-[10px] uppercase tracking-widest hover:bg-red-600 hover:text-white transition-all border border-red-200 cursor-pointer"
                  >
                    Sair
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </motion.main>

      {/* Bottom Footer Branding: Preserves Bottom-Left Circled System Info */}
      <footer className="relative z-10 pt-5 pb-1 flex flex-col items-center justify-center text-center gap-1 shrink-0">
        <div className="flex items-center justify-center gap-2">
          <CheckCircle className="text-amber-400 shrink-0" size={14} />
          <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/90">
            Sistema de Gestão Acadêmica v2.0
          </span>
        </div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-teal-100/75">
          {institutionName}
        </p>
      </footer>
    </div>
  );
}
