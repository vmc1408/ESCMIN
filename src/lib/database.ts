import { supabase, fetchRecursive, isSupabaseConfigured } from './supabase';

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
    
    const sbData = await fetchRecursive(collectionName, { select, orderCol, ascending });
    return sbData || [];
  } catch (err: any) {
    console.error(`[Supabase] Erro ao buscar lista em ${collectionName}:`, err.message);
    throw err;
  }
};

/**
 * Utility to fetch a single document from Supabase
 */
export const fetchById = async (collectionName: string, id: string) => {
  if (!id) return null;

  try {
    if (!isSupabaseConfigured) throw new Error('Supabase not configured');
    
    const { data, error } = await supabase
      .from(collectionName)
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    return data;
  } catch (err: any) {
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
    
    const { data, error } = await queryBuilder;
    if (error) throw error;
    return data;
  } catch (err: any) {
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
    const { count, error } = await q;
    if (error) throw error;
    return count || 0;
  } catch (err: any) {
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
    
    const { error } = await supabase.from(collectionName).upsert(payload);
    if (error) {
      console.error(`[Supabase Critical] ${collectionName}:`, error.message);
      throw error;
    }

    return finalId;
  } catch (err: any) {
    console.error(`[saveData] Erro fatal em "${collectionName}":`, err.message);
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

