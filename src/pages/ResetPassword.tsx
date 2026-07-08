import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Lock, AlertCircle, CheckCircle2, Loader2, ArrowLeft, RefreshCw } from 'lucide-react';

export function ResetPassword() {
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [pastedUrl, setPastedUrl] = useState('');
  const [showPastedInput, setShowPastedInput] = useState(false);
  const { refreshProfile } = useAuth();
  const navigate = useNavigate();

  // Função para processar os parâmetros de recuperação vindos da URL
  const processRecoveryParams = async (hashStr: string, searchStr: string) => {
    try {
      let accessToken = '';
      let refreshToken = '';
      let code = '';

      // Extrai a query string correta da hash ou do search de forma extremamente robusta
      let queryString = '';
      if (hashStr && hashStr.includes('?')) {
        queryString = hashStr.substring(hashStr.indexOf('?') + 1);
      } else if (hashStr) {
        const hashClean = hashStr.startsWith('#') ? hashStr.substring(1) : hashStr;
        if (!hashClean.startsWith('/') && hashClean.includes('=')) {
          queryString = hashClean;
        }
      }
      
      if (!queryString && searchStr) {
        queryString = searchStr.startsWith('?') ? searchStr.substring(1) : searchStr;
      }

      console.log("[ResetPassword] Extraída query string para validação:", queryString);

      if (queryString) {
        const params = new URLSearchParams(queryString);
        accessToken = params.get('access_token') || '';
        refreshToken = params.get('refresh_token') || '';
        code = params.get('code') || '';
      }

      if (accessToken && refreshToken) {
        console.log("[ResetPassword] Restaurando sessão via access_token e refresh_token...");
        const { error: sessionErr } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken
        });
        if (sessionErr) throw sessionErr;

        const tokens = { access_token: accessToken, refresh_token: refreshToken };
        localStorage.setItem('supabase_recovery_tokens', JSON.stringify(tokens));
        localStorage.setItem('supabase_recovery_mode', 'true');
        return true;
      } else if (code) {
        console.log("[ResetPassword] Trocando authorization code por sessão...");
        const { data, error: exchangeErr } = await supabase.auth.exchangeCodeForSession(code);
        if (exchangeErr) throw exchangeErr;

        if (data?.session) {
          const tokens = { 
            access_token: data.session.access_token, 
            refresh_token: data.session.refresh_token 
          };
          localStorage.setItem('supabase_recovery_tokens', JSON.stringify(tokens));
        }
        localStorage.setItem('supabase_recovery_mode', 'true');
        return true;
      }
    } catch (err: any) {
      console.error("[ResetPassword] Erro ao processar parâmetros:", err);
      setError(`Erro ao validar link de recuperação: ${err.message || err}`);
    }
    return false;
  };

  useEffect(() => {
    const hash = window.location.hash || '';
    const search = window.location.search || '';

    // Verifica se há parâmetros na hash ou busca atual do navegador
    if (hash.includes('access_token=') || hash.includes('type=recovery') || search.includes('type=recovery') || search.includes('code=')) {
      processRecoveryParams(hash, search);
    }
  }, []);

  const handleManualProcess = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pastedUrl) {
      setError("Por favor, cole o link recebido no seu e-mail.");
      return;
    }
    setLoading(true);
    setError(null);

    try {
      let urlObj;
      try {
        urlObj = new URL(pastedUrl);
      } catch {
        // Se não for uma URL válida, trata como string crua
        urlObj = { hash: pastedUrl.includes('#') ? pastedUrl.substring(pastedUrl.indexOf('#')) : '', search: pastedUrl.includes('?') ? pastedUrl.substring(pastedUrl.indexOf('?')) : pastedUrl };
      }

      const success = await processRecoveryParams(urlObj.hash || '', urlObj.search || '');
      if (success) {
        setSuccessMessage("Link processado e validado com sucesso! Agora digite sua nova senha abaixo.");
        setPastedUrl('');
        setShowPastedInput(false);
      } else {
        setError("Não foi possível encontrar tokens válidos no link colado. Verifique se copiou o link completo.");
      }
    } catch (err: any) {
      setError(err.message || "Erro ao processar o link manualmente.");
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
      // Tenta recuperar sessão salva caso o cliente Supabase tenha perdido a referência em memória
      const stored = localStorage.getItem('supabase_recovery_tokens');
      if (stored) {
        try {
          const activeTokens = JSON.parse(stored);
          console.log("[ResetPassword] Restaurando sessão de recuperação do localStorage...");
          const { error: setSessionErr } = await supabase.auth.setSession(activeTokens);
          if (setSessionErr) {
            console.warn("[ResetPassword] Alerta ao restaurar sessão:", setSessionErr.message);
          }
        } catch (e) {
          console.error("Erro ao ler tokens do localStorage:", e);
        }
      }

      const { error: sbErr } = await supabase.auth.updateUser({
        password: newPassword
      });
      if (sbErr) throw sbErr;

      setNewPassword('');
      setConfirmNewPassword('');
      setSuccessMessage("Senha redefinida com sucesso! Você já está autenticado no sistema. Redirecionando...");
      
      // Força a atualização do perfil para que o sistema reconheça a sessão logada
      await refreshProfile().catch(err => console.error("Erro ao atualizar perfil após redefinição:", err));
      
      setTimeout(() => {
        localStorage.removeItem('supabase_recovery_mode');
        localStorage.removeItem('supabase_recovery_tokens');
        setSuccessMessage(null);
        navigate('/', { replace: true });
      }, 3000);
    } catch (err: any) {
      console.error("[ResetPassword] Erro ao atualizar senha:", err);
      setError(err.message || "Ocorreu um erro ao redefinir sua senha. Verifique se o link não expirou.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 font-sans">
      <div 
        className="max-w-md w-full bg-white p-8 rounded-[2rem] shadow-xl border border-slate-100 relative transition-all duration-300 transform translate-y-0 opacity-100"
      >
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Lock size={28} />
          </div>
          <h2 className="text-2xl font-black text-[#00174b] mb-2 uppercase tracking-tight">Redefinir Senha</h2>
          <p className="text-slate-400 font-semibold text-[10px] uppercase tracking-[0.2em]">
            Crie uma nova senha de acesso para sua conta
          </p>
        </div>

        {/* Mensagens de Sucesso ou Erro sem AnimatePresence para evitar travamentos de DOM */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-2xl flex items-start gap-3">
            <AlertCircle className="text-red-500 shrink-0 mt-0.5" size={16} />
            <p className="text-xs font-bold text-red-700 leading-tight">{error}</p>
          </div>
        )}

        {successMessage && (
          <div className="mb-6 p-4 bg-emerald-50 border border-emerald-100 rounded-2xl flex items-start gap-3">
            <CheckCircle2 className="text-emerald-500 shrink-0 mt-0.5" size={16} />
            <p className="text-xs font-bold text-emerald-700 leading-tight">{successMessage}</p>
          </div>
        )}

        {!successMessage && (
          <form onSubmit={handleUpdatePassword} className="space-y-5">
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

            <button 
              type="submit"
              disabled={loading}
              className="w-full py-4 bg-[#00174b] text-white rounded-xl font-bold text-[11px] uppercase tracking-[0.2em] shadow-lg shadow-blue-900/10 hover:bg-slate-900 transition-all flex items-center justify-center gap-3 disabled:opacity-75"
            >
              {loading ? <Loader2 className="animate-spin" size={18} /> : <CheckCircle2 size={18} />}
              {loading ? 'Redefinindo...' : 'Salvar Nova Senha'}
            </button>
          </form>
        )}

        <div className="mt-8 pt-6 border-t border-slate-100 flex flex-col gap-4">
          <button 
            onClick={() => {
              setShowPastedInput(!showPastedInput);
              setError(null);
            }}
            className="text-center text-[10px] font-bold text-slate-400 hover:text-indigo-600 uppercase tracking-widest transition-colors"
          >
            {showPastedInput ? "Ocultar opção de link" : "Problemas com o link? Clique para colar manualmente"}
          </button>

          {showPastedInput && (
            <form onSubmit={handleManualProcess} className="space-y-3">
              <p className="text-[10px] text-slate-400 leading-relaxed">
                Se o redirecionamento automático falhar, copie o link de redefinição enviado no seu e-mail e cole-o abaixo:
              </p>
              <input 
                type="text"
                required
                value={pastedUrl}
                onChange={e => setPastedUrl(e.target.value)}
                placeholder="Cole o link do e-mail aqui..."
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium outline-none focus:bg-white focus:border-indigo-600/30 transition-all"
              />
              <button 
                type="submit"
                disabled={loading}
                className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-bold text-[9px] uppercase tracking-widest transition-all flex items-center justify-center gap-2"
              >
                {loading ? <Loader2 className="animate-spin" size={14} /> : <RefreshCw size={14} />}
                Processar Link
              </button>
            </form>
          )}

          <button 
            onClick={() => {
              localStorage.removeItem('supabase_recovery_mode');
              localStorage.removeItem('supabase_recovery_tokens');
              navigate('/login', { replace: true });
            }}
            className="text-center text-[10px] font-bold text-slate-400 hover:text-slate-600 uppercase tracking-widest flex items-center justify-center gap-2 mt-2"
          >
            <ArrowLeft size={12} />
            Voltar para o Login
          </button>
        </div>
      </div>
    </div>
  );
}
