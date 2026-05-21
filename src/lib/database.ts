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
    
    const sbData = await fetchRecursive(collectionName, { select, orderCol, ascending, timeoutMs: 90000 });
    return sbData || [];
  } catch (err: any) {
    if (err.isTimeout || err.message?.includes('TIMEOUT') || err.message?.includes('Failed to fetch')) {
      console.warn(`[Supabase] Timeout/Rede ao listar ${collectionName}.`);
      return [];
    }
    console.error(`[Supabase] Erro ao buscar lista em ${collectionName}:`, err.message);
    return [];
  }
};

/**
 * Utility to fetch a single document from Supabase
 */
export const fetchById = async (collectionName: string, id: string, timeoutMs = 20000) => {
  if (!id) return null;

  try {
    if (!isSupabaseConfigured) throw new Error('Supabase not configured');
    
    const result = await fetchWithTimeout(
      supabase
        .from(collectionName)
        .select('*')
        .eq('id', id)
        .maybeSingle(),
      timeoutMs
    );

    const data = result?.data;
    const error = result?.error;

    if (error) {
       // If table is missing or schema cache is stale, return null quietly instead of crashing
       const isMissingTable = error.code === '42P01' || 
                             error.message?.includes('Could not find the table') || 
                             error.message?.includes('schema cache');
       
       if (isMissingTable) {
         console.warn(`[Supabase] Tabela "${collectionName}" não encontrada ou em cache desatualizado. Verifique o schema SQL.`);
         return null;
       }
       throw error;
    }
    return data;
  } catch (err: any) {
    if (err.isTimeout || err.message?.includes('TIMEOUT') || err.message?.includes('Failed to fetch')) {
      console.warn(`[Supabase] Timeout/Rede ao buscar ${collectionName} ID ${id}.`);
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
    if (err.isTimeout || err.message?.includes('TIMEOUT') || err.message?.includes('Failed to fetch')) {
      console.warn(`[Supabase] Erro de rede ou timeout na query em ${collectionName}`);
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
    
    if (status === 'Ativo') {
      q = q.or('status.eq.Ativo,status.is.null');
    } else if (status) {
      q = q.eq('status', status);
    }
    
    const result = await fetchWithTimeout(q);
    if (result?.error) throw result.error;
    
    return result?.count || 0;
  } catch (err: any) {
    if (err.isTimeout || err.message?.includes('TIMEOUT') || err.message?.includes('Failed to fetch')) {
      console.warn(`[Supabase] Erro de rede ou timeout ao contar em ${collectionName}`);
      return 0;
    }
    console.error(`[Supabase] Erro ao contar em ${collectionName}:`, err.message);
    return 0;
  }
};

/**
 * Delete multiple records using a query
 */
export const deleteQuery = async (collectionName: string, filters: { field: string; operator: string; value: any }[]) => {
  try {
    if (!isSupabaseConfigured) throw new Error('Supabase not configured');
    
    let queryBuilder = supabase.from(collectionName).delete();
    
    filters.forEach(filter => {
      const op = filter.operator === '==' ? 'eq' : filter.operator;
      if (op === 'eq') queryBuilder = queryBuilder.eq(filter.field, filter.value);
      else if (op === '>=') queryBuilder = queryBuilder.gte(filter.field, filter.value);
      else if (op === '<=') queryBuilder = queryBuilder.lte(filter.field, filter.value);
      else if (op === 'in') queryBuilder = queryBuilder.in(filter.field, filter.value);
      else if (op === 'like') queryBuilder = queryBuilder.like(filter.field, filter.value);
      else if (op === 'ilike') queryBuilder = queryBuilder.ilike(filter.field, filter.value);
      else if (op === 'is') queryBuilder = queryBuilder.is(filter.field, filter.value);
    });
    
    const { error } = await queryBuilder;
    if (error) throw error;
  } catch (err: any) {
    console.error(`[deleteQuery] Erro em "${collectionName}":`, err.message);
    throw err;
  }
};

/**
 * Wait utility
 */
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Save data using Supabase Upsert with Retry
 */
export const saveData = async (collectionName: string, id: string | undefined, data: any, timeoutMs = 30000) => {
  const finalId = id || data.id || crypto.randomUUID();
  let payload = { ...data, id: finalId };

  try {
    if (!isSupabaseConfigured) throw new Error('Supabase not configured');
    
    let attempts = 0;
    const maxAttempts = 5;
    
    while (attempts < maxAttempts) {
      try {
        const result = await fetchWithTimeout(supabase.from(collectionName).upsert(payload), timeoutMs);
        
        if (result?.error) {
          const errorVal = result.error;
          const errorMsg = (typeof errorVal === 'object' && errorVal !== null) 
            ? (errorVal.message || String(errorVal)) 
            : String(errorVal);

          if (errorVal.isTimeout || errorMsg.includes('TIMEOUT') || errorMsg.includes('Failed to fetch') || errorMsg.includes('Network Error')) {
            console.warn(`[Supabase Retry] Erro de rede ou timeout ao salvar em ${collectionName}. Tentando novamente (${attempts + 1}/${maxAttempts})...`);
            attempts++;
            await wait(1000 * attempts);
            continue;
          }

          // Missing column fallback
          const errorMsgLower = errorMsg.toLowerCase();
          const isMissingCol = 
            errorMsgLower.includes('column') && 
            (errorMsgLower.includes('not found') || 
             errorMsgLower.includes('schema cache') || 
             errorMsgLower.includes('does not exist') ||
             errorMsgLower.includes('missing') ||
             errorMsgLower.includes('pgrst204')); // PGRST204 is Supabase schema cache error

          if (isMissingCol) {
            // Comprehensive regex to find column name in various error formats
            const match = errorMsg.match(/['"](.+?)['"] column/) || 
                          errorMsg.match(/column ['"](.+?)['"]/) ||
                          errorMsg.match(/column (.+?) of/) ||
                          errorMsg.match(/column (.+?) not found/) ||
                          errorMsg.match(/property ['"](.+?)['"] not found/) ||
                          errorMsg.match(/column (.+?) in the schema cache/);
            
            if (match && match[1]) {
              const missingCol = match[1].replace(/['"]/g, '').trim();
              console.warn(`[Supabase Fallback] Removendo coluna inexistente "${missingCol}" de "${collectionName}".`);
              delete (payload as any)[missingCol];
              continue; 
            } else if (errorMsgLower.includes('updated_at')) {
              // Forced fallback for common updated_at error if regex fails
              console.warn(`[Supabase Fallback] Forçando remoção de "updated_at" de "${collectionName}" devido a erro de schema cache.`);
              delete (payload as any).updated_at;
              continue;
            }
          }
          
          throw errorVal;
        }
        
        return finalId;
      } catch (innerErr: any) {
        if (innerErr.message?.includes('TIMEOUT')) {
          attempts++;
          await wait(1000 * attempts);
          continue;
        }
        throw innerErr;
      }
    }

    throw new Error(`Falha ao salvar dados em ${collectionName} após várias tentativas.`);
  } catch (err: any) {
    console.error(`[saveData] Erro fatal em "${collectionName}":`, err.message);
    throw err;
  }
};

/**
 * Save multiple records using Supabase Upsert
 */
export const saveBatch = async (collectionName: string, items: any[], timeoutMs = 30000) => {
  if (!items || items.length === 0) return [];

  let payloads = items.map(item => ({
    ...item,
    id: item.id || crypto.randomUUID()
  }));

  try {
    if (!isSupabaseConfigured) throw new Error('Supabase not configured');
    
    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
      try {
        const result = await fetchWithTimeout(supabase.from(collectionName).upsert(payloads), timeoutMs);
        
        if (result?.error) {
          const errorVal = result.error;
          const errorMsg = (typeof errorVal === 'object' && errorVal !== null) 
            ? (errorVal.message || String(errorVal)) 
            : String(errorVal);

          // Retry logic for timeouts or network errors
          if (errorVal.isTimeout || errorMsg.includes('TIMEOUT') || errorMsg.includes('Failed to fetch') || errorMsg.includes('Network Error')) {
            console.warn(`[Supabase Batch Retry] Erro de rede ou timeout ao salvar em ${collectionName}. Tentando novamente (${attempts + 1}/${maxAttempts})...`);
            attempts++;
            await wait(1000 * attempts);
            continue;
          }

          // Missing column fallback
          const errorMsgLower = errorMsg.toLowerCase();
          const isMissingCol = errorMsgLower.includes('column') && 
                              (errorMsg.includes('not found') || 
                               errorMsg.includes('schema cache') || 
                               errorMsg.includes('does not exist') ||
                               errorMsg.includes('missing'));

          if (isMissingCol) {
            const match = errorMsg.match(/['"](.+?)['"] column/) || 
                          errorMsg.match(/column ['"](.+?)['"]/) ||
                          errorMsg.match(/column (.+?) of/) ||
                          errorMsg.match(/column (.+?) not found/) ||
                          errorMsg.match(/property ['"](.+?)['"] not found/);
            
            if (match && match[1]) {
              const missingCol = match[1].replace(/['"]/g, '').trim();
              console.warn(`[Supabase Batch Fallback] Removendo coluna inexistente "${missingCol}" de lote em "${collectionName}".`);
              payloads = payloads.map((p: any) => {
                const newP = { ...p };
                delete newP[missingCol];
                return newP;
              });
              continue; 
            } else if (errorMsgLower.includes('updated_at')) {
              console.warn(`[Supabase Batch Fallback] Forçando remoção de "updated_at" de lote em "${collectionName}" devido a erro de schema cache.`);
              payloads = payloads.map((p: any) => {
                const newP = { ...p };
                delete newP.updated_at;
                return newP;
              });
              continue;
            }
          }
          
          throw errorVal;
        }
        
        return payloads.map(p => p.id);
      } catch (innerErr: any) {
        if (innerErr.message?.includes('TIMEOUT')) {
          attempts++;
          await wait(1000 * attempts);
          continue;
        }
        throw innerErr;
      }
    }

    throw new Error(`Falha ao salvar lote em ${collectionName} após várias tentativas.`);
  } catch (err: any) {
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



