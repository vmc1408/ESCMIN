import { supabase, fetchRecursive, isSupabaseConfigured, fetchWithTimeout } from './supabase';

// Helper to handle Errors
export interface DbErrorInfo {
  error: string;
  operationType: 'create' | 'update' | 'delete' | 'list' | 'get' | 'write';
  path: string | null;
  authInfo: {
    userId: string | null;
    email: string | null;
  }
}

export function handleDbError(error: any, operation: any, path: string | null = null): never {
  const info: DbErrorInfo = {
    error: error.message || 'Unknown error',
    operationType: operation,
    path,
    authInfo: {
      userId: null, // We'll get this from supabase.auth if needed
      email: null,
    }
  };
  
  throw new Error(JSON.stringify(info));
}

/**
 * Utility to fetch all data from a collection using Supabase
 */
export const fetchAll = async (collectionName: string, select = '*', orderCol = 'created_at', ascending = false) => {
  try {
    if (!isSupabaseConfigured) throw new Error('Supabase not configured');
    
    // fetchRecursive internally calls supabase, but let's wrap it in a timeout conceptually if possible
    // Since fetchRecursive is complex, we just set a large timeout or rely on its internal parts
    const sbData = await fetchRecursive(collectionName, { select, orderCol, ascending });
    return sbData || [];
  } catch (err: any) {
    if (err.isTimeout || err.message?.includes('TIMEOUT') || err.message?.includes('Failed to fetch')) {
      console.warn(`[Supabase] Erro de rede ou timeout ao listar em ${collectionName}`);
      return [];
    }
    console.error(`[Supabase] Erro ao buscar lista em ${collectionName}:`, err.message);
    return []; // Return empty instead of throwing to prevent app crash
  }
};

/**
 * Utility to fetch a single document from Supabase
 */
export const fetchById = async (collectionName: string, id: string) => {
  if (!id) return null;

  try {
    if (!isSupabaseConfigured) throw new Error('Supabase not configured');
    
    const result = await fetchWithTimeout(
      supabase
        .from(collectionName)
        .select('*')
        .eq('id', id)
        .maybeSingle()
    );

    const data = result?.data;
    const error = result?.error;

    if (error) throw error;
    return data;
  } catch (err: any) {
    if (err.isTimeout || err.message?.includes('TIMEOUT')) {
      console.warn(`[Supabase] Timeout ao buscar em ${collectionName} ID ${id}`);
      return null;
    }
    console.error(`[Supabase] Erro ao buscar ID em ${collectionName}:`, err.message);
    throw err;
  }
};

/**
 * Utility to fetch documents with a query from Supabase
 */
export const fetchQuery = async (
  collectionName: string, 
  fieldOrFilters: string | { field: string; operator: string; value: any }[], 
  operator?: string, 
  value?: any
) => {
  try {
    if (!isSupabaseConfigured) throw new Error('Supabase not configured');
    
    let queryBuilder = supabase.from(collectionName).select('*');
    
    if (Array.isArray(fieldOrFilters)) {
      fieldOrFilters.forEach(filter => {
        const op = filter.operator === '==' ? 'eq' : filter.operator;
        if (op === 'eq') queryBuilder = queryBuilder.eq(filter.field, filter.value);
        else if (op === '>=') queryBuilder = queryBuilder.gte(filter.field, filter.value);
        else if (op === '<=') queryBuilder = queryBuilder.lte(filter.field, filter.value);
        else if (op === 'in') queryBuilder = queryBuilder.in(filter.field, filter.value);
        else if (op === '!=') queryBuilder = queryBuilder.neq(filter.field, filter.value);
        else if (op === 'array-contains') queryBuilder = queryBuilder.contains(filter.field, [filter.value]);
      });
    } else if (typeof fieldOrFilters === 'string' && operator) {
      const op = operator === '==' ? 'eq' : operator;
      if (op === 'eq') queryBuilder = queryBuilder.eq(fieldOrFilters, value);
      else if (op === '>=') queryBuilder = queryBuilder.gte(fieldOrFilters, value);
      else if (op === '<=') queryBuilder = queryBuilder.lte(fieldOrFilters, value);
      else if (op === 'in') queryBuilder = queryBuilder.in(fieldOrFilters, value);
    }
    
    const result = await fetchWithTimeout(queryBuilder);
    if (result?.error) throw result.error;
    return result?.data || [];
  } catch (err: any) {
    if (err.isTimeout || err.message?.includes('TIMEOUT')) {
      console.warn(`[Supabase] Timeout na query em ${collectionName}`);
      return [];
    }
    console.error(`[Supabase] Erro ao executar query em ${collectionName}:`, err.message);
    return [];
  }
};

/**
 * Count utility using Supabase
 */
export const fetchCount = async (collectionName: string, status?: string) => {
  try {
    if (!isSupabaseConfigured) throw new Error('Supabase not configured');
    
    let q = supabase.from(collectionName).select('*', { count: 'exact', head: true });
    if (status) q = q.eq('status', status);
    
    const result = await fetchWithTimeout(q);
    if (result?.error) throw result.error;
    
    return result?.count || 0;
  } catch (err: any) {
    if (err.isTimeout || err.message?.includes('TIMEOUT')) {
      console.warn(`[Supabase] Timeout ao contar em ${collectionName}`);
      return 0;
    }
    console.error(`[Supabase] Erro ao contar em ${collectionName}:`, err.message);
    return 0;
  }
};

/**
 * Save data using Supabase Upsert
 */
export const saveData = async (collectionName: string, id: string | undefined, data: any) => {
  const finalId = id || data.id || crypto.randomUUID();
  const payload = { ...data, id: finalId };

  try {
    if (!isSupabaseConfigured) throw new Error('Supabase not configured');
    
    const result = await fetchWithTimeout(supabase.from(collectionName).upsert(payload));
    if (result?.error) throw result.error;

    return finalId;
  } catch (err: any) {
    if (err.isTimeout || err.message?.includes('TIMEOUT')) {
       throw new Error(`Tempo esgotado ao salvar em ${collectionName}.`);
    }
    console.error(`[saveData] Erro fatal em "${collectionName}":`, err.message);
    throw err;
  }
};

/**
 * Save multiple records using Supabase Upsert
 */
export const saveBatch = async (collectionName: string, items: any[], timeoutMs = 60000) => {
  if (!items || items.length === 0) return [];

  const payloads = items.map(item => ({
    ...item,
    id: item.id || crypto.randomUUID()
  }));

  try {
    if (!isSupabaseConfigured) throw new Error('Supabase not configured');
    
    const result = await fetchWithTimeout(supabase.from(collectionName).upsert(payloads), timeoutMs);
    if (result?.error) throw result.error;

    return payloads.map(p => p.id);
  } catch (err: any) {
    if (err.isTimeout || err.message?.includes('TIMEOUT')) {
       throw new Error(`Tempo esgotado ao salvar lote em ${collectionName}.`);
    }
    console.error(`[saveBatch] Erro fatal em "${collectionName}":`, err.message);
    throw err;
  }
};

/**
 * Delete from Supabase
 */
export const deleteData = async (collectionName: string, id: string) => {
  if (!id) return;
  
  try {
    if (!isSupabaseConfigured) throw new Error('Supabase not configured');
    
    const { error } = await supabase.from(collectionName).delete().eq('id', id);
    if (error) throw error;
  } catch (err: any) {
    console.error(`[deleteData] Erro em "${collectionName}":`, err.message);
    throw err;
  }
};

/**
 * Utility to fetch institution settings
 */
export const getInstitutionSettings = async () => {
  try {
    if (!isSupabaseConfigured) return null;
    const result = await fetchWithTimeout(
      supabase
        .from('institution_settings')
        .select('*')
        .limit(1)
        .maybeSingle(),
      8000 // Fast timeout for settings
    );
    
    if (result?.error) {
      if (result.error.message?.includes('Failed to fetch')) return null;
      throw result.error;
    }
    return result?.data;
  } catch (err: any) {
    if (err.message?.includes('Failed to fetch')) return null;
    console.warn('[Supabase] Aviso ao buscar configurações da instituição:', err.message);
    return null;
  }
};

export const uploadImage = async (file: File, bucketName: string, path: string): Promise<string> => {
  try {
    if (!isSupabaseConfigured) return "";
    
    const fileExt = file.name.split('.').pop();
    const fileName = `${Math.random()}.${fileExt}`;
    const filePath = `${path}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from(bucketName)
      .upload(filePath, file);

    if (uploadError) throw uploadError;

    const { data } = supabase.storage
      .from(bucketName)
      .getPublicUrl(filePath);

    return data.publicUrl;
  } catch (error: any) {
    console.error('Erro ao fazer upload da imagem:', error.message);
    return "";
  }
};

