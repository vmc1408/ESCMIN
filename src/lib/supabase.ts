import { createClient } from '@supabase/supabase-js';

const rawUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseUrl = rawUrl.replace(/\/rest\/v1\/?$/, '');
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

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
    .from('profiles')
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
    const { data, error } = await supabase
      .from(tableName)
      .select(select)
      .order(orderCol, { ascending })
      .range(from, from + step - 1);

    if (error) {
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
