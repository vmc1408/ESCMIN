import { createClient } from '@supabase/supabase-js';

export let isDbConnected = true;
export let lastLatency: number | null = null;
export let connectionError: string | null = null;

let consecutiveFailures = 0;

const setDbConnected = (val: boolean, latency: number | null = null, error: string | null = null) => {
  if (!val) {
    consecutiveFailures++;
    // Requer pelo menos 2 falhas consecutivas antes de notificar desconexão geral para evitar falsos positivos
    if (consecutiveFailures < 2 && isDbConnected) {
      return;
    }
  } else {
    consecutiveFailures = 0;
  }

  const changed = isDbConnected !== val || lastLatency !== latency || connectionError !== error;
  isDbConnected = val;
  lastLatency = latency;
  connectionError = error;
  
  if (changed && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('supabase-status-change', { 
      detail: { connected: val, latency, error } 
    }));
  }
};

let lastWarnTimestamp = 0;

const logNetworkWarnThrottled = (msg: string) => {
  const now = Date.now();
  if (now - lastWarnTimestamp > 15000) { // Emite no máximo 1 log a cada 15 segundos
    lastWarnTimestamp = now;
    console.warn(msg);
  }
};

/**
 * Utility to fetch with timeout and proper timer cleanup
 */
export const fetchWithTimeout = async (promiseOrFactory: any, timeoutMs = 15000, maxRetries = 1): Promise<any> => {
  if (typeof window !== 'undefined' && !window.navigator.onLine) {
    return { data: null, error: { message: 'Dispositivo Offline', isOffline: true } };
  }

  let attempt = 0;
  
  const executeAttempt = async (): Promise<any> => {
    const startTime = Date.now();
    let timerId: any = null;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timerId = setTimeout(() => {
        reject(new Error('TIMEOUT'));
      }, timeoutMs);
    });

    try {
      const activePromise = typeof promiseOrFactory === 'function' 
        ? promiseOrFactory() 
        : promiseOrFactory;

      const result = await Promise.race([activePromise, timeoutPromise]);
      if (timerId) clearTimeout(timerId);

      const latency = Date.now() - startTime;
      
      if (result && (result.status !== undefined || result.data !== undefined || !result.error)) {
        setDbConnected(true, latency, null);
      }
      
      return result;
    } catch (err: any) {
      if (timerId) clearTimeout(timerId);

      const latency = Date.now() - startTime;
      const errorMessage = err?.message || String(err || '');
      
      const isConnectivityError = 
        errorMessage === 'TIMEOUT' ||
        errorMessage.includes('Failed to fetch') ||
        errorMessage.includes('Network Error') ||
        errorMessage.includes('TypeError: Load failed') ||
        errorMessage.includes('TypeError: NetworkError') ||
        errorMessage.includes('Network request failed') ||
        errorMessage.includes('Socket closed') ||
        errorMessage.includes('connection refused') ||
        err?.status === 0 || 
        err?.code === 'PGRST301' || 
        err?.code === '08001' ||    
        err?.code === '08004' ||    
        err?.code === '08006' ||    
        err?.code === '08P01';      

      // Retry logic for transient network failures if factory is provided
      if (attempt < maxRetries && isConnectivityError && typeof promiseOrFactory === 'function') {
        attempt++;
        const backoff = 1000 * attempt; 
        logNetworkWarnThrottled(`[Supabase] Erro temporário de rede. Tentativa ${attempt}/${maxRetries} em ${backoff}ms...`);
        await new Promise(resolve => setTimeout(resolve, backoff));
        return executeAttempt();
      }

      if (errorMessage === 'TIMEOUT') {
        logNetworkWarnThrottled(`[Supabase] Timeout (${timeoutMs}ms) em operação.`);
        return { data: null, error: { message: 'Operação lenta ou sem resposta (TIMEOUT)', isTimeout: true } };
      }

      if (isConnectivityError) {
        setDbConnected(false, latency, errorMessage);
      } else {
        setDbConnected(true, latency, null);
      }
      
      return { data: null, error: err };
    }
  };

  return executeAttempt();
};

const rawUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim();
// Garante que a URL não tenha sufíxos de API e seja um host limpo
let supabaseUrl = rawUrl;
if (rawUrl) {
  try {
    const urlObj = new URL(rawUrl);
    supabaseUrl = `${urlObj.protocol}//${urlObj.host}`;
  } catch (e) {
    // Fallback para o split se a URL não for válida para o construtor URL
    supabaseUrl = rawUrl.split('/rest/v1')[0].split('/auth/v1')[0].replace(/\/$/, '');
  }
}
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

export const isSupabaseConfigured = Boolean(
  supabaseUrl && 
  supabaseAnonKey && 
  !supabaseUrl.includes('placeholder') && 
  !supabaseAnonKey.includes('placeholder')
);

if (isSupabaseConfigured) {
  console.log('[Supabase] Verificando configuração...');
  console.log(`[Supabase] Host: ${supabaseUrl}`);
} else {
  console.warn('[Supabase] Configuração ausente ou incompleta. Verifique as chaves VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.');
}

export const clearCorruptedAuthTokens = () => {
  if (typeof window === 'undefined') return;
  try {
    const removeMatching = (storage: Storage) => {
      const keysToRemove: string[] = [];
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (key && (key.startsWith('sb-') || key.includes('supabase') || key.includes('auth-token') || key.includes('supabase_recovery_tokens'))) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(k => storage.removeItem(k));
    };

    if (window.localStorage) removeMatching(window.localStorage);
    if (window.sessionStorage) removeMatching(window.sessionStorage);
  } catch (err) {
    console.warn('[Supabase] Erro ao limpar tokens corrompidos:', err);
  }
};

// Inicialização segura do cliente Supabase
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storage: typeof window !== 'undefined' ? window.localStorage : undefined
    }
  }
);

let isCheckingConnection = false;

// Teste de conexão com heartbeat ultraleve e timeout balanceado (sem retries ruidosos)
export const testConnection = async () => {
  if (!isSupabaseConfigured || isCheckingConnection) return;
  isCheckingConnection = true;

  try {
    const startTime = Date.now();
    const response = await fetchWithTimeout(
      supabase.from('users').select('id', { count: 'exact', head: true }).limit(1),
      6000,
      0 // 0 retries no teste de conexão para não poluir o console
    );
    const latency = Date.now() - startTime;
    
    // Se o servidor respondeu com qualquer status (mesmo erro 400, 401, 403), ele está alcançável.
    if (response && (response.status !== undefined || response.data !== undefined || !response.error)) {
      setDbConnected(true, latency, null);
    } else if (response && response.error) {
      const msg = response.error.message || '';
      // Se for erro de auth, permissão ou tabela, o servidor está ONLINE
      const isAuthOrServerResponse = 
        msg.includes('JWT') || 
        msg.includes('permission') || 
        msg.includes('relation') ||
        response.status === 401 || 
        response.status === 403;
      
      if (isAuthOrServerResponse) {
        setDbConnected(true, latency, null);
      } else {
        const isOfflineError = 
          response.error.isTimeout || 
          response.error.isOffline || 
          msg.includes('Failed to fetch') || 
          msg.toLowerCase().includes('offline');

        if (isOfflineError) {
          setDbConnected(false, latency, msg || 'Tempo de resposta excedido');
        }
      }
    }
  } catch (err: any) {
    // Falha silenciosa no teste de conexão automática
  } finally {
    isCheckingConnection = false;
  }
};

// Monitoramento passivo e heartbeat controlado
if (isSupabaseConfigured && typeof window !== 'undefined') {
  // Teste inicial apenas após o carregamento inicial da página para não concorrer com os componentes
  setTimeout(() => {
    testConnection();
  }, 2000);
  
  window.addEventListener('online', () => testConnection());
  window.addEventListener('offline', () => setDbConnected(false));

  // Heartbeat a cada 3 minutos quando a aba está ativa
  setInterval(() => {
    if (document.visibilityState === 'visible') {
      testConnection();
    }
  }, 180000); 
}

/**
 * Interface para Sincronização de Usuários
 * Esta função ajuda a manter os dados do usuário sincronizados com a tabela de perfis no Postgres.
 */
export const syncUserWithSupabase = async (userData: { uid: string; email: string | null; displayName: string | null }) => {
  if (!isSupabaseConfigured) return;

  try {
    const result = await fetchWithTimeout(
      supabase
        .from('users')
        .upsert({
          id: userData.uid,
          email: userData.email,
          full_name: userData.displayName,
        })
    );

    if (result?.error) {
      if (result.error.message?.includes('Failed to fetch')) {
        console.warn('[Supabase] Erro de rede ao sincronizar usuário (Ignorado)');
        return null;
      }
      throw result.error;
    }

    return result?.data;
  } catch (error: any) {
    if (error.message?.includes('Failed to fetch')) {
      console.warn('[Supabase] Erro de rede ao sincronizar usuário (Ignorado)');
      return null;
    }
    console.error('Erro ao sincronizar com Supabase:', error.message);
    throw error;
  }
};

const tablesWithoutColumn = new Map<string, Set<string>>();

/**
 * Função utilitária para buscar todos os registros de uma tabela, contornando o limite de 1000 do Supabase/PostgREST.
 * Carrega os dados em lotes até que todos os registros sejam recuperados.
 */
export const fetchRecursive = async (tableName: string, options: { select?: string, orderCol?: string, ascending?: boolean, timeoutMs?: number } = {}) => {
  let { select = '*', orderCol = 'created_at', ascending = false } = options;

  // Se já sabemos que a coluna não existe nesta tabela, não tenta ordenar por ela
  if (orderCol && tablesWithoutColumn.get(tableName)?.has(orderCol)) {
    orderCol = '';
  }

  let allData: any[] = [];
  let from = 0;
  const step = 1000;
  let hasMore = true;
  const timeoutMs = options.timeoutMs || 45000; // Default to 45s for recursive pages

  while (hasMore) {
    let query = supabase
      .from(tableName)
      .select(select);
    
    // Only order if orderCol is provided and likely exists
    if (orderCol) {
      query = query.order(orderCol, { ascending });
    }

    const { data, error } = await fetchWithTimeout(
      query.range(from, from + step - 1),
      timeoutMs
    );

    if (error) {
      // Common transient errors: return empty array instead of throwing to prevent component crashes
      const isTransient = 
        error.code === '42P01' || 
        error.message.includes('Could not find the table') ||
        error.message.includes('Failed to fetch') ||
        error.message.includes('NetworkError') ||
        error.isOffline;

      if (isTransient) {
        if (!error.message.includes('Failed to fetch')) {
          console.warn(`[Supabase] Erro transiente em ${tableName}:`, error.message);
        }
        return allData; // Return whatever we found so far (likely empty)
      }
      
      // Schema cache issue: retry once after a short delay
      if (error.message?.includes('schema cache')) {
        console.warn(`[Supabase] Schema cache issue detected for ${tableName}, retrying in 500ms...`);
        await new Promise(resolve => setTimeout(resolve, 500));
        const retry = await fetchWithTimeout(
          supabase.from(tableName).select(select).range(from, from + step - 1)
        );
        if (!retry.error) {
          if (retry.data && retry.data.length > 0) {
            allData = [...allData, ...retry.data];
            from += step;
            if (retry.data.length < step) hasMore = false;
            continue;
          } else { hasMore = false; continue; }
        }
      }

      // If ordering failed because column doesn't exist, register and retry once without order
      if (orderCol && (error.message.includes('column') || error.code === '42703')) {
        if (!tablesWithoutColumn.has(tableName)) {
          tablesWithoutColumn.set(tableName, new Set());
        }
        tablesWithoutColumn.get(tableName)!.add(orderCol);
        orderCol = '';

        const retry = await fetchWithTimeout(
          supabase
            .from(tableName)
            .select(select)
            .range(from, from + step - 1)
        );
        
        if (!retry.error && retry.data) {
          allData = [...allData, ...retry.data];
          from += step;
          if (retry.data.length < step) hasMore = false;
          continue;
        }
      }

      if (error.isTimeout) {
        console.warn(`[Supabase] Timeout atingido na busca recursiva de ${tableName}. Retornando dados parciais (${allData.length} registros).`);
        return allData;
      }

      console.error(`Erro na busca recursiva de ${tableName}:`, error.message);
      throw error;
    }

    if (data && data.length > 0) {
      allData = [...allData, ...data];
      from += step;
      if (data.length < step) {
        hasMore = false;
      }
    } else {
      hasMore = false;
    }
  }

  // Deduplica registros por ID para evitar problemas de chaves duplicadas
  const seen = new Set<string>();
  const uniqueData: any[] = [];
  for (const item of allData) {
    if (item && item.id !== undefined && item.id !== null) {
      const idStr = String(item.id);
      if (!seen.has(idStr)) {
        seen.add(idStr);
        uniqueData.push(item);
      }
    } else if (item) {
      uniqueData.push(item);
    }
  }

  return uniqueData;
};
