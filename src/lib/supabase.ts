import { createClient } from '@supabase/supabase-js';

export let isDbConnected = true;
export let lastLatency: number | null = null;
export let connectionError: string | null = null;

const setDbConnected = (val: boolean, latency: number | null = null, error: string | null = null) => {
  const changed = isDbConnected !== val || lastLatency !== latency || connectionError !== error;
  isDbConnected = val;
  lastLatency = latency;
  connectionError = error;
  
  if (changed) {
    window.dispatchEvent(new CustomEvent('supabase-status-change', { 
      detail: { connected: val, latency, error } 
    }));
  }
};

/**
 * Utility to fetch with timeout
 */
export const fetchWithTimeout = async (promise: any, timeoutMs = 5000, maxRetries = 1): Promise<any> => {
  if (typeof window !== 'undefined' && !window.navigator.onLine) {
    return { data: null, error: { message: 'Dispositivo Offline', isOffline: true } };
  }

  let attempt = 0;
  
  const executeAttempt = async (): Promise<any> => {
    const startTime = Date.now();
    const timeout = new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error('TIMEOUT')), timeoutMs)
    );

    try {
      const result = await Promise.race([promise, timeout]);
      const latency = Date.now() - startTime;
      
      if (result && result.status !== undefined) {
        setDbConnected(true, latency, null);
      }
      
      return result;
    } catch (err: any) {
      const latency = Date.now() - startTime;
      const errorMessage = err.message || String(err);
      
      const isConnectivityError = 
        errorMessage === 'TIMEOUT' ||
        errorMessage.includes('Failed to fetch') ||
        errorMessage.includes('Network Error') ||
        errorMessage.includes('TypeError: Load failed') ||
        errorMessage.includes('TypeError: NetworkError') ||
        errorMessage.includes('Network request failed') ||
        errorMessage.includes('Socket closed') ||
        errorMessage.includes('connection refused') ||
        err.status === 0 || 
        err.code === 'PGRST301' || 
        err.code === '08001' ||    
        err.code === '08004' ||    
        err.code === '08006' ||    
        err.code === '08P01';      

      // Retry logic for transient network failures
      if (attempt < maxRetries && isConnectivityError && errorMessage !== 'TIMEOUT') {
        attempt++;
        const backoff = 1000 * attempt; 
        console.warn(`[Supabase] Erro de rede (Failed to fetch). Tentativa ${attempt}/${maxRetries} em ${backoff}ms...`);
        await new Promise(resolve => setTimeout(resolve, backoff));
        return executeAttempt();
      }

      if (errorMessage === 'TIMEOUT') {
        console.warn(`[Supabase] Timeout (${timeoutMs}ms) em operação.`);
        if (timeoutMs < 10000) setDbConnected(false, latency, 'Tempo de resposta excedido (Timeout)');
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

// Inicialização segura do cliente Supabase
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder',
  {
    auth: {
      persistSession: true,
      storage: typeof window !== 'undefined' ? window.sessionStorage : undefined
    }
  }
);

// Teste de conexão com heartbeat ultraleve e timeout agressivo
export const testConnection = async () => {
  if (!isSupabaseConfigured) return;

  try {
    const startTime = Date.now();
    // Timeout curto para pulso de status (não queremos que o app pare esperando isso)
    const response = await fetchWithTimeout(
      supabase.from('users').select('id', { count: 'exact', head: true }).limit(1),
      3000 
    );
    const latency = Date.now() - startTime;
    
    // Se o servidor respondeu com qualquer status (mesmo erro 400, 401, 403), ele está alcançável.
    if (response && response.status !== undefined) {
      setDbConnected(true, latency, null);
    } else if (response && response.error) {
      const msg = response.error.message || '';
      // Se for erro de auth ou permissão, o servidor está ONLINE
      const isAuthError = msg.includes('JWT') || msg.includes('permission') || response.status === 401 || response.status === 403;
      
      if (isAuthError) {
        setDbConnected(true, latency, null);
      } else {
        // Reduzimos o ruído: só marca offline se não houver resposta nenhuma, for timeout ou offline
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
  }
};

// Monitoramento ativo e passivo
if (isSupabaseConfigured) {
  testConnection();
  
  window.addEventListener('online', () => testConnection());
  window.addEventListener('offline', () => setDbConnected(false));

  setInterval(() => {
    // Heartbeat mais espaçado: 5 minutos se ok, 1 minuto se erro
    if (document.visibilityState === 'visible' || !isDbConnected) {
      testConnection();
    }
  }, isDbConnected ? 300000 : 60000); 
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

/**
 * Função utilitária para buscar todos os registros de uma tabela, contornando o limite de 1000 do Supabase/PostgREST.
 * Carrega os dados em lotes até que todos os registros sejam recuperados.
 */
export const fetchRecursive = async (tableName: string, options: { select?: string, orderCol?: string, ascending?: boolean, timeoutMs?: number } = {}) => {
  let { select = '*', orderCol = 'created_at', ascending = false } = options;

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

      // If ordering failed because column doesn't exist, retry once without order
      if (orderCol && (error.message.includes('column') || error.code === '42703')) {
        console.warn(`[Supabase] Column ${orderCol} does not exist in ${tableName}, retrying without order.`);
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

  return allData;
};
