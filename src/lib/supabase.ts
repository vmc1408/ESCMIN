import { createClient } from '@supabase/supabase-js';

const rawUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseUrl = rawUrl.replace(/\/rest\/v1\/?$/, '');
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(
  supabaseUrl && 
  supabaseAnonKey && 
  !supabaseUrl.includes('placeholder') && 
  !supabaseAnonKey.includes('placeholder')
);

// Inicialização segura do cliente Supabase
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder'
);

/**
 * Interface para Sincronização Firebase -> Supabase
 * Esta função ajuda a manter o UID do Firebase sincronizado com a tabela de perfis no Postgres.
 */
export const syncUserWithSupabase = async (firebaseUser: { uid: string; email: string | null; displayName: string | null }) => {
  if (!supabaseUrl || !supabaseAnonKey) return;

  const { data, error } = await supabase
    .from('users')
    .upsert({
      id: firebaseUser.uid,
      email: firebaseUser.email,
      full_name: firebaseUser.displayName,
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
export const fetchRecursive = async (tableName: string, options: { select?: string, orderCol?: string, ascending?: boolean } = {}) => {
  const { select = '*', orderCol = 'created_at', ascending = false } = options;
  let allData: any[] = [];
  let from = 0;
  const step = 1000;
  let hasMore = true;

  while (hasMore) {
    let query = supabase
      .from(tableName)
      .select(select);
    
    // Only order if orderCol is provided and likely exists
    if (orderCol) {
      query = query.order(orderCol, { ascending });
    }

    const { data, error } = await query
      .range(from, from + step - 1);

    if (error) {
      if (error.code === '42P01' || error.message.includes('Could not find the table')) {
        return []; // Retorna vazio silenciosamente para permitir fallback
      }
      
      // Schema cache issue: retry once after a short delay
      if (error.message?.includes('schema cache')) {
        console.warn(`[Supabase] Schema cache issue detected for ${tableName}, retrying in 500ms...`);
        await new Promise(resolve => setTimeout(resolve, 500));
        const retry = await supabase.from(tableName).select(select).range(from, from + step - 1);
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
        const retry = await supabase
          .from(tableName)
          .select(select)
          .range(from, from + step - 1);
        
        if (!retry.error && retry.data) {
          allData = [...allData, ...retry.data];
          from += step;
          if (retry.data.length < step) hasMore = false;
          continue;
        }
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
