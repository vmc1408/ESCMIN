import { createClient } from '@supabase/supabase-js';

export let isDbConnected = false;
export let lastLatency: number | null = null;

const setDbConnected = (val: boolean, latency: number | null = null) => {
  const changed = isDbConnected !== val || lastLatency !== latency;
  isDbConnected = val;
  lastLatency = latency;
  
  if (changed) {
    window.dispatchEvent(new CustomEvent('supabase-status-change', { 
      detail: { connected: val, latency } 
    }));
  }
};

/**
 * Utility to fetch with timeout
 */
export const fetchWithTimeout = async (promise: any, timeoutMs = 60000): Promise<any> => {
  if (typeof window !== 'undefined' && !window.navigator.onLine) {
    return { data: null, error: { message: 'Dispositivo Offline', isOffline: true } };
  }

  const startTime = Date.now();
  const timeout = new Promise<never>((_, reject) => 
    setTimeout(() => reject(new Error('TIMEOUT')), timeoutMs)
  );

  try {
    const result = await Promise.race([promise, timeout]);
    const latency = Date.now() - startTime;
    
    // Qualquer status de resposta confirma alcance do servidor
    if (result && (result.status || !result.error)) {
      setDbConnected(true, latency);
    }
    
    return result;
  } catch (err: any) {
    const latency = Date.now() - startTime;
    if (err.message === 'TIMEOUT') {
      console.warn(`[Supabase] Timeout (${timeoutMs}ms) em operação.`);
      // Não marca como desconectado imediatamente se for apenas um timeout de query pesada
      if (timeoutMs < 10000) setDbConnected(false, latency);
      return { data: null, error: { message: 'Operação lenta ou sem resposta (TIMEOUT)', isTimeout: true } };
    }
    setDbConnected(false, latency);
    throw err;
  }
};

const rawUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim();
const supabaseUrl = rawUrl.split('/rest/v1')[0].split('/auth/v1')[0].replace(/\/$/, '');
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
  supabaseAnonKey || 'placeholder'
);

// Teste de conexão com heartbeat ultraleve e timeout agressivo
export const testConnection = async () => {
  if (!isSupabaseConfigured) return;

  try {
    const startTime = Date.now();
    // Timeout de 8s para o pulso de status (mais rápido)
    // Usando head: true para não baixar dados, apenas verificar se o servidor responde
    const response = await fetchWithTimeout(
      supabase.from('institution_settings').select('id', { count: 'exact', head: true }).limit(1),
      8000
    );
    const latency = Date.now() - startTime;
    
    // Se o servidor respondeu com qualquer status (mesmo erro 403/404), ele está alcançável
    if (response && response.status !== undefined) {
      setDbConnected(true, latency);
    } else {
      setDbConnected(false, latency);
    }
  } catch (err) {
    setDbConnected(false);
  }
};

// Monitoramento ativo e passivo
if (isSupabaseConfigured) {
  testConnection();
  
  window.addEventListener('online', () => testConnection());
  window.addEventListener('offline', () => setDbConnected(false));

  setInterval(() => {
    // Só faz heartbeat se estiver em foco ou se estiver offline para tentar reconectar
    if (document.visibilityState === 'visible' || !isDbConnected) {
      testConnection();
    }
  }, isDbConnected ? 120000 : 30000); // 2 minutos se ok, 30 segundos se erro
}

/**
 * Interface para Sincronização de Usuários
 * Esta função ajuda a manter os dados do usuário sincronizados com a tabela de perfis no Postgres.
 */
export const syncUserWithSupabase = async (userData: { uid: string; email: string | null; displayName: string | null }) => {
  if (!supabaseUrl || !supabaseAnonKey) return;

  const { data, error } = await supabase
    .from('users')
    .upsert({
      id: userData.uid,
      email: userData.email,
      full_name: userData.displayName,
    });

  if (error) {
    console.error('Erro ao sincronizar com Supabase:', error.message);
    throw error;
  }

  return data;
};

/**
 * Função utilitária para buscar todos os registros de uma tabela, contornando o limite de 1000 do Supabase/PostgREST.
 * Carrega os dados em lotes até que todos os registros sejam recuperados.
 */
export const fetchRecursive = async (tableName: string, options: { select?: string, orderCol?: string, ascending?: boolean, timeoutMs?: number } = {}) => {
  const { select = '*', orderCol = 'created_at', ascending = false } = options;
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
      if (error.code === '42P01' || error.message.includes('Could not find the table')) {
        return []; // Retorna vazio silenciosamente para permitir fallback
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
