import { supabase, fetchRecursive, isSupabaseConfigured, fetchWithTimeout } from './supabase';

// LocalStorage fallback helpers
export const isTableUsingFallback = (tableName: string): boolean => {
  try {
    return localStorage.getItem(`db_fallback_active_${tableName}`) === 'true';
  } catch (e) {
    return false;
  }
};

export const setTableUsingFallback = (tableName: string, active: boolean) => {
  try {
    if (active) {
      localStorage.setItem(`db_fallback_active_${tableName}`, 'true');
    } else {
      localStorage.removeItem(`db_fallback_active_${tableName}`);
    }
  } catch (e) {}
};

export const getLocalCollection = (collectionName: string): any[] => {
  try {
    const data = localStorage.getItem(`db_fallback_${collectionName}`);
    return data ? JSON.parse(data) : [];
  } catch (err) {
    console.error(`Error reading local fallback for ${collectionName}:`, err);
    return [];
  }
};

export const saveLocalCollection = (collectionName: string, data: any[]) => {
  try {
    localStorage.setItem(`db_fallback_${collectionName}`, JSON.stringify(data));
  } catch (err) {
    console.error(`Error writing local fallback for ${collectionName}:`, err);
  }
};

export const saveLocalItem = (collectionName: string, id: string, item: any) => {
  const list = getLocalCollection(collectionName);
  const index = list.findIndex((x: any) => x.id === id);
  const updatedItem = { ...item, id };
  if (index >= 0) {
    list[index] = updatedItem;
  } else {
    list.push(updatedItem);
  }
  saveLocalCollection(collectionName, list);
  return id;
};

export const deleteLocalItem = (collectionName: string, id: string) => {
  const list = getLocalCollection(collectionName);
  const filtered = list.filter((x: any) => x.id !== id);
  saveLocalCollection(collectionName, filtered);
};

export const isDatabaseMissingOrCacheError = (err: any): boolean => {
  if (!err) return false;
  const msg = (typeof err === 'string' ? err : err.message || err.details || String(err)).toLowerCase();
  const code = String(err.code || '').toLowerCase();
  
  return (
    msg.includes('relation') ||
    msg.includes('does not exist') ||
    msg.includes('could not find the table') ||
    msg.includes('schema cache') ||
    msg.includes('not found') ||
    code === '42p01' ||
    code === 'pgrst204' ||
    code === 'pgrst116'
  );
};

const testedRecoveries = new Set<string>();

export const tryRecoveryFromFallback = async (collectionName: string) => {
  if (!isSupabaseConfigured) return false;
  if (testedRecoveries.has(collectionName)) return false;
  
  try {
    testedRecoveries.add(collectionName);
    const result = await fetchWithTimeout(supabase.from(collectionName).select('id').limit(1), 3000);
    if (result && !result.error) {
      console.log(`[Supabase Recovery] Tabela "${collectionName}" foi criada e está disponível no Supabase! Desativando fallback local.`);
      setTableUsingFallback(collectionName, false);
      return true;
    }
  } catch (e) {
    // Silently ignore recovery failures
  }
  return false;
};

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
    if (isTableUsingFallback(collectionName)) {
      await tryRecoveryFromFallback(collectionName);
    }

    if (isTableUsingFallback(collectionName)) {
      const localData = getLocalCollection(collectionName);
      if (orderCol) {
        localData.sort((a, b) => {
          const valA = a[orderCol];
          const valB = b[orderCol];
          if (valA === undefined) return 1;
          if (valB === undefined) return -1;
          if (valA < valB) return ascending ? -1 : 1;
          if (valA > valB) return ascending ? 1 : -1;
          return 0;
        });
      }
      return localData;
    }

    if (!isSupabaseConfigured) throw new Error('Supabase not configured');
    
    const sbData = await fetchRecursive(collectionName, { select, orderCol, ascending, timeoutMs: 90000 });
    return sbData || [];
  } catch (err: any) {
    if (isDatabaseMissingOrCacheError(err)) {
      console.warn(`[Supabase Fetch Fallback] Tabela "${collectionName}" não encontrada. Usando fallback local.`);
      setTableUsingFallback(collectionName, true);
      return getLocalCollection(collectionName);
    }

    if (err.isTimeout || err.message?.includes('TIMEOUT') || err.message?.includes('Failed to fetch')) {
      console.warn(`[Supabase] Timeout/Rede ao listar ${collectionName}.`);
      return getLocalCollection(collectionName);
    }
    console.error(`[Supabase] Erro ao buscar lista em ${collectionName}:`, err.message);
    return getLocalCollection(collectionName);
  }
};

/**
 * Utility to fetch a single document from Supabase
 */
export const fetchById = async (collectionName: string, id: string, timeoutMs = 20000) => {
  if (!id) return null;

  try {
    if (isTableUsingFallback(collectionName)) {
      await tryRecoveryFromFallback(collectionName);
    }

    if (isTableUsingFallback(collectionName)) {
      const list = getLocalCollection(collectionName);
      return list.find((x: any) => x.id === id) || null;
    }

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
       if (isDatabaseMissingOrCacheError(error)) {
         console.warn(`[Supabase] Tabela "${collectionName}" não encontrada ou em cache desatualizado. Ativando fallback local.`);
         setTableUsingFallback(collectionName, true);
         const list = getLocalCollection(collectionName);
         return list.find((x: any) => x.id === id) || null;
       }
       throw error;
    }
    return data;
  } catch (err: any) {
    if (isDatabaseMissingOrCacheError(err)) {
      setTableUsingFallback(collectionName, true);
      const list = getLocalCollection(collectionName);
      return list.find((x: any) => x.id === id) || null;
    }

    if (err.isTimeout || err.message?.includes('TIMEOUT') || err.message?.includes('Failed to fetch')) {
      console.warn(`[Supabase] Timeout/Rede ao buscar ${collectionName} ID ${id}.`);
      const list = getLocalCollection(collectionName);
      return list.find((x: any) => x.id === id) || null;
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
    if (isTableUsingFallback(collectionName)) {
      await tryRecoveryFromFallback(collectionName);
    }

    if (isTableUsingFallback(collectionName)) {
      const list = getLocalCollection(collectionName);
      return list.filter(item => {
        if (Array.isArray(fieldOrFilters)) {
          return fieldOrFilters.every(filter => {
            const itemVal = item[filter.field];
            const op = filter.operator === '==' ? 'eq' : filter.operator;
            if (op === 'eq') return itemVal === filter.value;
            if (op === 'neq' || op === '!=') return itemVal !== filter.value;
            if (op === 'gte' || op === '>=') return itemVal >= filter.value;
            if (op === '<=') return itemVal <= filter.value;
            if (op === 'in') return Array.isArray(filter.value) && filter.value.includes(itemVal);
            return true;
          });
        } else if (typeof fieldOrFilters === 'string' && operator) {
          const itemVal = item[fieldOrFilters];
          const op = operator === '==' ? 'eq' : operator;
          if (op === 'eq') return itemVal === value;
          if (op === 'gte' || op === '>=') return itemVal >= value;
          if (op === '<=') return itemVal <= value;
          if (op === 'in') return Array.isArray(value) && value.includes(itemVal);
        }
        return true;
      });
    }

    if (!isSupabaseConfigured) throw new Error('Supabase not configured');
    
    let queryBuilder = supabase.from(collectionName).select('*');
    
    if (Array.isArray(fieldOrFilters)) {
      fieldOrFilters.forEach(filter => {
        const op = filter.operator === '==' ? 'eq' : filter.operator;
        if (op === 'eq') queryBuilder = queryBuilder.eq(filter.field, filter.value);
        else if (op === 'is') queryBuilder = queryBuilder.is(filter.field, filter.value);
        else if (op === '>=') queryBuilder = queryBuilder.gte(filter.field, filter.value);
        else if (op === '<=') queryBuilder = queryBuilder.lte(filter.field, filter.value);
        else if (op === 'in') queryBuilder = queryBuilder.in(filter.field, filter.value);
        else if (op === '!=') queryBuilder = queryBuilder.neq(filter.field, filter.value);
        else if (op === 'array-contains') queryBuilder = queryBuilder.contains(filter.field, [filter.value]);
        else if (op === 'like') queryBuilder = queryBuilder.like(filter.field, filter.value);
        else if (op === 'ilike') queryBuilder = queryBuilder.ilike(filter.field, filter.value);
      });
    } else if (typeof fieldOrFilters === 'string' && operator) {
      const op = operator === '==' ? 'eq' : operator;
      if (op === 'eq') queryBuilder = queryBuilder.eq(fieldOrFilters, value);
      else if (op === '>=') queryBuilder = queryBuilder.gte(fieldOrFilters, value);
      else if (op === '<=') queryBuilder = queryBuilder.lte(fieldOrFilters, value);
      else if (op === 'in') queryBuilder = queryBuilder.in(fieldOrFilters, value);
      else if (op === 'like') queryBuilder = queryBuilder.like(fieldOrFilters, value);
      else if (op === 'ilike') queryBuilder = queryBuilder.ilike(fieldOrFilters, value);
    }
    
    const result = await fetchWithTimeout(queryBuilder);
    if (result?.error) throw result.error;
    return result?.data || [];
  } catch (err: any) {
    if (isDatabaseMissingOrCacheError(err)) {
      setTableUsingFallback(collectionName, true);
      const list = getLocalCollection(collectionName);
      return list.filter(item => {
        if (Array.isArray(fieldOrFilters)) {
          return fieldOrFilters.every(filter => {
            const itemVal = item[filter.field];
            const op = filter.operator === '==' ? 'eq' : filter.operator;
            if (op === 'eq') return itemVal === filter.value;
            if (op === 'neq' || op === '!=') return itemVal !== filter.value;
            if (op === 'gte' || op === '>=') return itemVal >= filter.value;
            if (op === '<=') return itemVal <= filter.value;
            if (op === 'in') return Array.isArray(filter.value) && filter.value.includes(itemVal);
            return true;
          });
        }
        return true;
      });
    }

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
    if (isTableUsingFallback(collectionName)) {
      await tryRecoveryFromFallback(collectionName);
    }

    if (isTableUsingFallback(collectionName)) {
      const list = getLocalCollection(collectionName);
      if (status === 'Ativo') {
        return list.filter(x => x.status === 'Ativo' || !x.status).length;
      } else if (status) {
        return list.filter(x => x.status === status).length;
      }
      return list.length;
    }

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
    if (isDatabaseMissingOrCacheError(err)) {
      setTableUsingFallback(collectionName, true);
      const list = getLocalCollection(collectionName);
      if (status === 'Ativo') {
        return list.filter(x => x.status === 'Ativo' || !x.status).length;
      } else if (status) {
        return list.filter(x => x.status === status).length;
      }
      return list.length;
    }

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
    if (isTableUsingFallback(collectionName)) {
      await tryRecoveryFromFallback(collectionName);
    }

    if (isTableUsingFallback(collectionName)) {
      return saveLocalItem(collectionName, finalId, payload);
    }

    if (!isSupabaseConfigured) {
      return saveLocalItem(collectionName, finalId, payload);
    }
    
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

          const errorMsgLower = errorMsg.toLowerCase();
          if (isDatabaseMissingOrCacheError(errorVal)) {
            console.warn(`[Supabase Fallback] Tabela "${collectionName}" não encontrada ao salvar. Ativando fallback local.`);
            setTableUsingFallback(collectionName, true);
            return saveLocalItem(collectionName, finalId, payload);
          }

          if (errorVal.isTimeout || errorMsg.includes('TIMEOUT') || errorMsg.includes('Failed to fetch') || errorMsg.includes('Network Error')) {
            console.warn(`[Supabase Retry] Erro de rede ou timeout ao salvar em ${collectionName}. Tentando novamente (${attempts + 1}/${maxAttempts})...`);
            attempts++;
            await wait(1000 * attempts);
            continue;
          }

          // Missing column fallback
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
    if (isDatabaseMissingOrCacheError(err)) {
      console.warn(`[Supabase Fallback] Erro fatal em "${collectionName}" devido a tabela inexistente. Ativando fallback local.`);
      setTableUsingFallback(collectionName, true);
      return saveLocalItem(collectionName, finalId, payload);
    }

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
    if (isTableUsingFallback(collectionName)) {
      deleteLocalItem(collectionName, id);
      return;
    }

    if (!isSupabaseConfigured) {
      deleteLocalItem(collectionName, id);
      return;
    }
    
    const { error } = await supabase.from(collectionName).delete().eq('id', id);
    if (error) {
      if (isDatabaseMissingOrCacheError(error)) {
        setTableUsingFallback(collectionName, true);
        deleteLocalItem(collectionName, id);
        return;
      }
      throw error;
    }
  } catch (err: any) {
    if (isDatabaseMissingOrCacheError(err)) {
      setTableUsingFallback(collectionName, true);
      deleteLocalItem(collectionName, id);
      return;
    }
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



