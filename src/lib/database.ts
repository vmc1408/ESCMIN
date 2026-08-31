import { supabase, fetchRecursive, isSupabaseConfigured, fetchWithTimeout, isDbConnected, connectionError, isJwtOrTokenError, clearCorruptedAuthTokens } from './supabase';
import { detectCourseFromClass } from './utils';

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
    if (data) {
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed)) {
        const seen = new Set<string>();
        const uniqueList: any[] = [];
        for (const item of parsed) {
          if (item && item.id) {
            const idStr = String(item.id);
            if (!seen.has(idStr)) {
              seen.add(idStr);
              uniqueList.push(item);
            }
          } else if (item) {
            uniqueList.push(item);
          }
        }
        return uniqueList;
      }
      return [];
    }

    // Initial default seed for courses if local fallback is clean
    if (collectionName === 'courses') {
      const defaultCourses = [
        {
          id: 'course-teo',
          code: 'TEO',
          name: 'Teologia',
          description: 'Curso de Formação Teológica e Pastoral',
          duration_years: 3,
          duration_semesters: 6,
          duration_total: '3 anos',
          meetings_per_week: 2,
          meeting_days: ['Terça', 'Quinta'],
          status: 'Ativo',
          created_at: new Date().toISOString()
        },
        {
          id: 'course-lat',
          code: 'LAT',
          name: 'Latim',
          description: 'Curso de Língua Latina e Textos Litúrgicos',
          duration_years: 1,
          duration_semesters: 2,
          duration_total: '1 ano',
          meetings_per_week: 1,
          meeting_days: ['Sábado'],
          status: 'Ativo',
          created_at: new Date().toISOString()
        },
        {
          id: 'course-dsi',
          code: 'DSI',
          name: 'Doutrina Social da Igreja',
          description: 'Curso Fundamental da Doutrina Social da Igreja',
          duration_years: 1,
          duration_semesters: 2,
          duration_total: '1 ano',
          meetings_per_week: 1,
          meeting_days: ['Sábado'],
          status: 'Ativo',
          created_at: new Date().toISOString()
        },
        {
          id: 'course-hsn',
          code: 'HSN',
          name: 'História dos Santos Negros',
          description: 'História, Vida e Espiritualidade dos Santos Negros',
          duration_years: 1,
          duration_semesters: 2,
          duration_total: '1 ano',
          meetings_per_week: 1,
          meeting_days: ['Sábado'],
          status: 'Ativo',
          created_at: new Date().toISOString()
        }
      ];
      try {
        localStorage.setItem(`db_fallback_courses`, JSON.stringify(defaultCourses));
      } catch (e) {}
      return defaultCourses;
    }

    return [];
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
  
  // If error mentions column or property, it is NOT a missing table error
  if (msg.includes('column') || msg.includes('property')) {
    return false;
  }
  
  return (
    (msg.includes('relation') && msg.includes('does not exist')) ||
    msg.includes('could not find the table') ||
    (msg.includes('table') && msg.includes('not found')) ||
    (msg.includes('table') && msg.includes('does not exist')) ||
    (msg.includes('table') && msg.includes('schema cache')) ||
    code === '42p01' ||
    code === 'pgrst205'
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
  // Algumas tabelas não possuem a coluna created_at por padrão
  let effectiveOrderCol = orderCol;
  if (orderCol === 'created_at') {
    const tablesWithoutCreatedAt = ['academic_parameters', 'academic_settings', 'institution_settings'];
    if (tablesWithoutCreatedAt.includes(collectionName)) {
      effectiveOrderCol = '';
    }
  }

  const isOffline = typeof window !== 'undefined' && !window.navigator.onLine;

  const returnLocalData = () => {
    const localData = getLocalCollection(collectionName);
    if (effectiveOrderCol) {
      localData.sort((a, b) => {
        const valA = a[effectiveOrderCol];
        const valB = b[effectiveOrderCol];
        if (valA === undefined) return 1;
        if (valB === undefined) return -1;
        if (valA < valB) return ascending ? -1 : 1;
        if (valA > valB) return ascending ? 1 : -1;
        return 0;
      });
    }
    return localData;
  };

  if (isOffline) {
    console.warn(`[Supabase Offline Fastpath] Buscando localmente de ${collectionName} devido a dispositivo offline.`);
    return returnLocalData();
  }

  try {
    if (isTableUsingFallback(collectionName)) {
      await tryRecoveryFromFallback(collectionName);
    }

    if (isTableUsingFallback(collectionName)) {
      return returnLocalData();
    }

    if (!isSupabaseConfigured) throw new Error('Supabase not configured');
    
    const sbData = await fetchRecursive(collectionName, { select, orderCol: effectiveOrderCol, ascending, timeoutMs: 90000 });
    if (Array.isArray(sbData)) {
      const localList = getLocalCollection(collectionName);
      const localMap = new Map(localList.map((x: any) => [String(x.id), x]));
      const seen = new Set<string>();
      const uniqueList: any[] = [];
      for (const item of sbData) {
        if (item && item.id) {
          const idStr = String(item.id);
          if (!seen.has(idStr)) {
            seen.add(idStr);
            const localObj = localMap.get(idStr);
            // Preserva propriedades locais enriquecidas e atualizações mais recentes do usuário
            let merged = item;
            if (localObj) {
              const localUpdated = localObj.updated_at ? new Date(localObj.updated_at).getTime() : 0;
              const itemUpdated = item.updated_at ? new Date(item.updated_at).getTime() : 0;
              const useLocal = localUpdated >= itemUpdated;

              merged = {
                ...item,
                ...localObj,
                status: useLocal ? (localObj.status || item.status || 'Ativo') : (item.status || localObj.status || 'Ativo'),
                meeting_days: useLocal 
                  ? (localObj.meeting_days ?? item.meeting_days ?? [])
                  : ((item.meeting_days && Array.isArray(item.meeting_days) && item.meeting_days.length > 0) ? item.meeting_days : (localObj.meeting_days || [])),
                meetings_per_week: useLocal 
                  ? (localObj.meetings_per_week ?? item.meetings_per_week ?? 0)
                  : (item.meetings_per_week !== undefined && item.meetings_per_week !== null ? item.meetings_per_week : (localObj.meetings_per_week ?? 0)),
                duration_total: useLocal
                  ? (localObj.duration_total !== undefined ? localObj.duration_total : (item.duration_total || ''))
                  : (item.duration_total !== undefined && item.duration_total !== null ? item.duration_total : (localObj.duration_total || '')),
                duration_years: useLocal
                  ? localObj.duration_years
                  : (item.duration_years !== undefined ? item.duration_years : localObj.duration_years)
              };
            }
            uniqueList.push(merged);
          }
        } else if (item) {
          uniqueList.push(item);
        }
      }
      // Preserva itens salvos localmente que ainda não foram sincronizados
      for (const [locId, locItem] of localMap.entries()) {
        if (!seen.has(locId)) {
          seen.add(locId);
          uniqueList.push(locItem);
        }
      }
      // Atualiza cache local silenciosamente para manter backup offline sempre atualizado
      if (uniqueList.length > 0) {
        try { saveLocalCollection(collectionName, uniqueList); } catch (e) {}
      }
      return uniqueList;
    }
    return sbData || [];
  } catch (err: any) {
    if (isJwtOrTokenError(err)) {
      console.warn(`[Supabase Fetch] Token/JWT dessincronizado em ${collectionName}. Limpando credenciais locais e usando dados disponíveis.`);
      clearCorruptedAuthTokens();
      supabase.auth.signOut({ scope: 'local' }).catch(() => {});
      return returnLocalData();
    }

    if (isDatabaseMissingOrCacheError(err)) {
      console.warn(`[Supabase Fetch Fallback] Tabela "${collectionName}" não encontrada. Usando fallback local.`);
      setTableUsingFallback(collectionName, true);
      return returnLocalData();
    }

    const isOfflineOrNetwork = 
      err.isOffline || 
      err.isTimeout || 
      err.message?.includes('Offline') || 
      err.message?.includes('offline') || 
      err.message?.includes('TIMEOUT') || 
      err.message?.includes('Failed to fetch') ||
      err.message?.includes('Network Error');

    if (isOfflineOrNetwork) {
      // Fallback silencioso para manter o console limpo
    } else {
      console.error(`[Supabase] Erro ao buscar lista em ${collectionName}:`, err.message);
    }
    return returnLocalData();
  }
};

/**
 * Utility to fetch a single document from Supabase
 */
export const fetchById = async (collectionName: string, id: string, timeoutMs = 20000) => {
  if (!id) return null;

  const isOffline = typeof window !== 'undefined' && !window.navigator.onLine;
  if (isOffline) {
    console.warn(`[Supabase Offline Fastpath] Buscando ID ${id} localmente de ${collectionName} devido a dispositivo offline.`);
    const list = getLocalCollection(collectionName);
    return list.find((x: any) => x.id === id) || null;
  }

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
      () => supabase
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
    if (data) {
      try { saveLocalItem(collectionName, id, data); } catch (e) {}
    }
    return data;
  } catch (err: any) {
    if (isJwtOrTokenError(err)) {
      console.warn(`[Supabase Fetch] Token/JWT dessincronizado ao buscar ID ${id} em ${collectionName}. Limpando credenciais locais.`);
      clearCorruptedAuthTokens();
      supabase.auth.signOut({ scope: 'local' }).catch(() => {});
      const list = getLocalCollection(collectionName);
      return list.find((x: any) => x.id === id) || null;
    }

    if (isDatabaseMissingOrCacheError(err)) {
      setTableUsingFallback(collectionName, true);
      const list = getLocalCollection(collectionName);
      return list.find((x: any) => x.id === id) || null;
    }

    const isOfflineOrNetwork = 
      err.isOffline || 
      err.isTimeout || 
      err.message?.includes('Offline') || 
      err.message?.includes('offline') || 
      err.message?.includes('TIMEOUT') || 
      err.message?.includes('Failed to fetch') ||
      err.message?.includes('Network Error');

    if (isOfflineOrNetwork) {
      console.warn(`[Supabase Offline Fallback] Erro de rede ou offline ao buscar ${collectionName} ID ${id}. Usando cópia local.`);
    } else {
      console.error(`[Supabase] Erro ao buscar ID em ${collectionName}:`, err.message);
    }
    const list = getLocalCollection(collectionName);
    return list.find((x: any) => x.id === id) || null;
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
  const isOffline = typeof window !== 'undefined' && !window.navigator.onLine;

  const queryLocalData = () => {
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
  };

  if (isOffline) {
    console.warn(`[Supabase Offline Fastpath] Executando query localmente em ${collectionName} devido a dispositivo offline.`);
    return queryLocalData();
  }

  try {
    if (isTableUsingFallback(collectionName)) {
      await tryRecoveryFromFallback(collectionName);
    }

    if (isTableUsingFallback(collectionName)) {
      return queryLocalData();
    }

    if (!isSupabaseConfigured) throw new Error('Supabase not configured');
    
    const buildQuery = () => {
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
      return queryBuilder;
    };
    
    const result = await fetchWithTimeout(buildQuery);
    if (result?.error) throw result.error;
    return result?.data || [];
  } catch (err: any) {
    if (isJwtOrTokenError(err)) {
      console.warn(`[Supabase Fetch] Token/JWT dessincronizado ao executar query em ${collectionName}. Limpando credenciais locais.`);
      clearCorruptedAuthTokens();
      supabase.auth.signOut({ scope: 'local' }).catch(() => {});
      return queryLocalData();
    }

    if (isDatabaseMissingOrCacheError(err)) {
      setTableUsingFallback(collectionName, true);
      return queryLocalData();
    }

    const isOfflineOrNetwork = 
      err.isOffline || 
      err.isTimeout || 
      err.message?.includes('Offline') || 
      err.message?.includes('offline') || 
      err.message?.includes('TIMEOUT') || 
      err.message?.includes('Failed to fetch') ||
      err.message?.includes('Network Error');

    if (isOfflineOrNetwork) {
      // Silencioso para não poluir console
    } else {
      console.error(`[Supabase] Erro ao executar query em ${collectionName}:`, err.message);
    }
    return queryLocalData();
  }
};

/**
 * Count utility using Supabase
 */
export const fetchCount = async (collectionName: string, status?: string) => {
  const isOffline = typeof window !== 'undefined' && !window.navigator.onLine;

  const countLocalData = () => {
    const list = getLocalCollection(collectionName);
    if (status === 'Ativo') {
      return list.filter(x => x.status === 'Ativo' || !x.status).length;
    } else if (status) {
      return list.filter(x => x.status === status).length;
    }
    return list.length;
  };

  if (isOffline) {
    return countLocalData();
  }

  try {
    if (isTableUsingFallback(collectionName)) {
      await tryRecoveryFromFallback(collectionName);
    }

    if (isTableUsingFallback(collectionName)) {
      return countLocalData();
    }

    if (!isSupabaseConfigured) throw new Error('Supabase not configured');
    
    const buildCountQuery = () => {
      let q = supabase.from(collectionName).select('*', { count: 'exact', head: true });
      if (status === 'Ativo') {
        q = q.or('status.eq.Ativo,status.is.null');
      } else if (status) {
        q = q.eq('status', status);
      }
      return q;
    };
    
    const result = await fetchWithTimeout(buildCountQuery);
    if (result?.error) throw result.error;
    
    return result?.count || 0;
  } catch (err: any) {
    if (isDatabaseMissingOrCacheError(err)) {
      setTableUsingFallback(collectionName, true);
    }

    const isOfflineOrNetwork = 
      err.isOffline || 
      err.isTimeout || 
      err.message?.includes('Offline') || 
      err.message?.includes('offline') || 
      err.message?.includes('TIMEOUT') || 
      err.message?.includes('Failed to fetch') ||
      err.message?.includes('Network Error');

    if (isOfflineOrNetwork) {
      // Silencioso para não poluir console
    } else {
      console.error(`[Supabase] Erro ao contar em ${collectionName}:`, err.message);
    }

    // Fallback to local collection count on any error
    const list = getLocalCollection(collectionName);
    if (status === 'Ativo') {
      return list.filter(x => x.status === 'Ativo' || !x.status).length;
    } else if (status) {
      return list.filter(x => x.status === status).length;
    }
    return list.length;
  }
};

/**
 * Delete multiple records using a query
 */
export const deleteQuery = async (collectionName: string, filters: { field: string; operator: string; value: any }[]) => {
  try {
    // 1. Always purge matching items from local cache instantly
    try {
      const localList = getLocalCollection(collectionName);
      if (Array.isArray(localList) && localList.length > 0) {
        const remainingLocal = localList.filter((item: any) => {
          const matchesAllFilters = filters.every(filter => {
            const op = filter.operator === '==' ? 'eq' : filter.operator;
            const itemVal = item[filter.field];
            if (op === 'eq') return String(itemVal) === String(filter.value);
            if (op === '>=') return itemVal >= filter.value;
            if (op === '<=') return itemVal <= filter.value;
            if (op === 'in') return Array.isArray(filter.value) && filter.value.map(String).includes(String(itemVal));
            if (op === 'like' || op === 'ilike') {
              const cleanVal = String(filter.value || '').replace(/^%|%$/g, '').toLowerCase();
              return String(itemVal || '').toLowerCase().includes(cleanVal);
            }
            if (op === 'is') return itemVal === filter.value;
            return false;
          });
          // If matches all filters, it should be deleted (so exclude it)
          return !matchesAllFilters;
        });
        saveLocalCollection(collectionName, remainingLocal);
      }
    } catch (locErr) {
      console.warn(`[deleteQuery] Error updating local cache for "${collectionName}":`, locErr);
    }

    if (!isSupabaseConfigured) return;
    
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
 * Save data using Supabase Upsert with Retry and Local Cache Sync
 */
export const saveData = async (collectionName: string, id: string | undefined, data: any, timeoutMs = 30000) => {
  const finalId = id || data.id || crypto.randomUUID();
  let payload = { ...data, id: finalId };

  // Always keep local cache instantly updated
  saveLocalItem(collectionName, finalId, payload);

  if (collectionName === 'institution_settings') {
    try {
      if (data.admission_norms !== undefined) {
        localStorage.setItem('inst_admission_norms', data.admission_norms);
      }
      if (data.presentation_info !== undefined) {
        localStorage.setItem('inst_presentation_info', data.presentation_info);
      }
    } catch (e) {
      console.warn('Failed to save settings locally:', e);
    }
  }

  const isOffline = typeof window !== 'undefined' && !window.navigator.onLine;
  if (isOffline) {
    console.warn(`[Supabase Offline Fastpath] Gravado localmente em ${collectionName} devido a dispositivo offline.`);
    return finalId;
  }

  try {
    if (isTableUsingFallback(collectionName)) {
      await tryRecoveryFromFallback(collectionName);
    }

    if (isTableUsingFallback(collectionName) || !isSupabaseConfigured) {
      return finalId;
    }
    
    let attempts = 0;
    const maxAttempts = 3;
    
    while (attempts < maxAttempts) {
      try {
        const result = await fetchWithTimeout(() => supabase.from(collectionName).upsert(payload), timeoutMs);
        
        if (result?.error) {
          const errorVal = result.error;
          const errorMsg = (typeof errorVal === 'object' && errorVal !== null) 
            ? (errorVal.message || String(errorVal)) 
            : String(errorVal);

          const errorMsgLower = errorMsg.toLowerCase();
          if (isDatabaseMissingOrCacheError(errorVal)) {
            console.warn(`[Supabase Fallback] Tabela "${collectionName}" não encontrada ao salvar. Ativando fallback local.`);
            setTableUsingFallback(collectionName, true);
            return finalId;
          }

          const isErrorOffline = 
            errorVal.isOffline || 
            errorVal.isTimeout || 
            errorMsgLower.includes('offline') || 
            errorMsgLower.includes('timeout') || 
            errorMsgLower.includes('failed to fetch') ||
            errorMsgLower.includes('network error');

          if (isErrorOffline) {
            console.warn(`[Supabase Offline Fallback] Erro de rede ou offline ao salvar em ${collectionName}. Usando cópia local.`);
            return finalId;
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
              console.warn(`[Supabase Fallback] Forçando remoção de "updated_at" de "${collectionName}" devido a erro de schema cache.`);
              delete (payload as any).updated_at;
              continue;
            }
          }
          
          throw errorVal;
        }
        
        return finalId;
      } catch (innerErr: any) {
        const innerMsgLower = (innerErr.message || '').toLowerCase();
        const isInnerOffline = 
          innerErr.isOffline || 
          innerErr.isTimeout || 
          innerMsgLower.includes('offline') || 
          innerMsgLower.includes('timeout') || 
          innerMsgLower.includes('failed to fetch') ||
          innerMsgLower.includes('network error');

        if (isInnerOffline) {
          console.warn(`[Supabase Offline Fallback] Erro de rede ou offline no loop de gravação em ${collectionName}. Usando cópia local.`);
          return finalId;
        }

        attempts++;
        await wait(500 * attempts);
        continue;
      }
    }

    return finalId;
  } catch (err: any) {
    if (isDatabaseMissingOrCacheError(err)) {
      console.warn(`[Supabase Fallback] Erro fatal em "${collectionName}" devido a tabela inexistente. Ativando fallback local.`);
      setTableUsingFallback(collectionName, true);
      return finalId;
    }

    const isOfflineOrNetwork = 
      err.isOffline || 
      err.isTimeout || 
      err.message?.includes('Offline') || 
      err.message?.includes('offline') || 
      err.message?.includes('TIMEOUT') || 
      err.message?.includes('Failed to fetch') ||
      err.message?.includes('Network Error');

    if (isOfflineOrNetwork) {
      console.warn(`[Supabase Fallback] Erro fatal de rede ou offline em "${collectionName}". Gravando localmente.`);
    } else {
      console.error(`[saveData] Erro fatal em "${collectionName}":`, err.message);
    }
    return finalId;
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

  const saveBatchLocally = () => {
    payloads.forEach(p => {
      saveLocalItem(collectionName, p.id, p);
    });
    return payloads.map(p => p.id);
  };

  // Sync to local cache first
  saveBatchLocally();

  const isOffline = typeof window !== 'undefined' && !window.navigator.onLine;
  if (isOffline) {
    console.warn(`[Supabase Offline Fastpath] Salvando lote localmente em ${collectionName} devido a dispositivo offline.`);
    return payloads.map(p => p.id);
  }

  try {
    if (!isSupabaseConfigured) return payloads.map(p => p.id);
    
    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
      try {
        const result = await fetchWithTimeout(() => supabase.from(collectionName).upsert(payloads), timeoutMs);
        
        if (result?.error) {
          const errorVal = result.error;
          const errorMsg = (typeof errorVal === 'object' && errorVal !== null) 
            ? (errorVal.message || String(errorVal)) 
            : String(errorVal);

          const errorMsgLower = errorMsg.toLowerCase();

          const isErrorOffline = 
            errorVal.isOffline || 
            errorVal.isTimeout || 
            errorMsgLower.includes('offline') || 
            errorMsgLower.includes('timeout') || 
            errorMsgLower.includes('failed to fetch') ||
            errorMsgLower.includes('network error');

          if (isErrorOffline) {
            console.warn(`[Supabase Batch Fallback] Erro de rede ou offline ao salvar lote em ${collectionName}. Usando cópia local.`);
            return payloads.map(p => p.id);
          }

          // Retry logic for timeouts or network errors
          if (errorVal.isTimeout || errorMsg.includes('TIMEOUT') || errorMsg.includes('Failed to fetch') || errorMsg.includes('Network Error')) {
            console.warn(`[Supabase Batch Retry] Erro de rede ou timeout ao salvar em ${collectionName}. Tentando novamente (${attempts + 1}/${maxAttempts})...`);
            attempts++;
            await wait(500 * attempts);
            continue;
          }

          // Missing column fallback
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
        const innerMsgLower = (innerErr.message || '').toLowerCase();
        const isInnerOffline = 
          innerErr.isOffline || 
          innerErr.isTimeout || 
          innerMsgLower.includes('offline') || 
          innerMsgLower.includes('timeout') || 
          innerMsgLower.includes('failed to fetch') ||
          innerMsgLower.includes('network error');

        if (isInnerOffline) {
          console.warn(`[Supabase Offline Fallback] Erro de rede ou offline no lote em ${collectionName}. Usando cópia local.`);
          return payloads.map(p => p.id);
        }

        attempts++;
        await wait(500 * attempts);
        continue;
      }
    }

    return payloads.map(p => p.id);
  } catch (err: any) {
    const isOfflineOrNetwork = 
      err.isOffline || 
      err.isTimeout || 
      err.message?.includes('Offline') || 
      err.message?.includes('offline') || 
      err.message?.includes('TIMEOUT') || 
      err.message?.includes('Failed to fetch') ||
      err.message?.includes('Network Error');

    if (isOfflineOrNetwork) {
      console.warn(`[Supabase Batch Fallback] Erro fatal de rede ou offline ao salvar lote em ${collectionName}. Usando cópia local.`);
    } else {
      console.error(`[saveBatch] Erro fatal em "${collectionName}":`, err.message);
    }
    return payloads.map(p => p.id);
  }
};

/**
 * Delete from Supabase
 */
export const deleteData = async (collectionName: string, id: string) => {
  if (!id) return;
  
  try {
    // 1. Tratamento de Chaves Estrangeiras antes da exclusão local e remota
    if (collectionName === 'classes') {
      // 1. Obter informações da turma que está sendo excluída
      const localClasses = getLocalCollection('classes');
      const classToDelete = localClasses.find((c: any) => c.id === id);
      
      let importedFromId: string | null = null;
      if (classToDelete?.observations) {
        const match = classToDelete.observations.match(/\[METADATA:(\{[\s\S]*?\})\]/);
        if (match && match[1]) {
          try {
            const meta = JSON.parse(match[1]);
            if (meta.imported_from) importedFromId = meta.imported_from;
          } catch (e) {}
        }
      }

      // Se a turma de origem foi marcada como Encerrada devido à importação, reativa para Ativo para não sumir
      if (importedFromId) {
        const updatedClasses = localClasses.map((c: any) => {
          if (c.id === importedFromId && (c.status === 'Encerrada' || c.status === 'Inativo')) {
            return { ...c, status: 'Ativo' };
          }
          return c;
        });
        saveLocalCollection('classes', updatedClasses);
        if (isSupabaseConfigured && !isTableUsingFallback('classes')) {
          try {
            await supabase.from('classes').update({ status: 'Ativo' }).eq('id', importedFromId);
          } catch (e) {}
        }
      }

      // 2. Desassocia ou revincula alunos localmente de forma segura
      const localStudents = getLocalCollection('students');
      const localEnrollments = getLocalCollection('enrollments');
      let changedStudents = false;

      const updatedStudents = localStudents.map((st: any) => {
        if (st.class_id === id) {
          changedStudents = true;
          // Tenta encontrar outra turma válida para o aluno (ex: a turma de origem ou outra matrícula ativa)
          let fallbackClassId: string | null = importedFromId;
          if (!fallbackClassId) {
            const otherEnr = localEnrollments.find((e: any) => e.student_id === st.id && e.class_id !== id && (e.status === 'Ativo' || !e.status));
            if (otherEnr) fallbackClassId = otherEnr.class_id;
          }
          return { ...st, class_id: fallbackClassId };
        }
        return st;
      });
      if (changedStudents) {
        saveLocalCollection('students', updatedStudents);
      }

      // Limpa registros dependentes da turma excluída em cache local
      const localEnrollmentsFiltered = getLocalCollection('enrollments').filter((e: any) => e.class_id !== id);
      saveLocalCollection('enrollments', localEnrollmentsFiltered);
      const localAttendances = getLocalCollection('attendances').filter((a: any) => a.class_id !== id);
      saveLocalCollection('attendances', localAttendances);
      const localGrades = getLocalCollection('grades').filter((g: any) => g.class_id !== id);
      saveLocalCollection('grades', localGrades);
      const localAssessments = getLocalCollection('assessments').filter((a: any) => a.class_id !== id);
      saveLocalCollection('assessments', localAssessments);
      const localEvents = getLocalCollection('calendar_events').filter((ev: any) => ev.class_id !== id);
      saveLocalCollection('calendar_events', localEvents);

      // Limpa chaves estrangeiras no Supabase para evitar erro 23503 (violates foreign key constraint)
      if (isSupabaseConfigured && !isTableUsingFallback('classes')) {
        try {
          if (importedFromId) {
            await supabase.from('students').update({ class_id: importedFromId }).eq('class_id', id);
          } else {
            await supabase.from('students').update({ class_id: null }).eq('class_id', id);
          }
        } catch (e: any) {
          console.warn('[deleteData] Aviso ao atualizar students.class_id:', e?.message || e);
        }
        try {
          await supabase.from('enrollments').delete().eq('class_id', id);
        } catch (e: any) {
          console.warn('[deleteData] Aviso ao excluir enrollments da turma:', e?.message || e);
        }
        try {
          await supabase.from('attendances').delete().eq('class_id', id);
        } catch (e: any) {
          console.warn('[deleteData] Aviso ao excluir attendances da turma:', e?.message || e);
        }
        try {
          await supabase.from('grades').delete().eq('class_id', id);
        } catch (e: any) {
          console.warn('[deleteData] Aviso ao excluir grades da turma:', e?.message || e);
        }
        try {
          await supabase.from('assessments').delete().eq('class_id', id);
        } catch (e: any) {
          console.warn('[deleteData] Aviso ao excluir assessments da turma:', e?.message || e);
        }
        try {
          await supabase.from('calendar_events').delete().eq('class_id', id);
        } catch (e: any) {
          console.warn('[deleteData] Aviso ao excluir calendar_events da turma:', e?.message || e);
        }
      }
    } else if (collectionName === 'students') {
      if (isSupabaseConfigured && !isTableUsingFallback('students')) {
        try {
          await supabase.from('enrollments').delete().eq('student_id', id);
        } catch (e) {}
        try {
          await supabase.from('attendances').delete().eq('student_id', id);
        } catch (e) {}
        try {
          await supabase.from('grades').delete().eq('student_id', id);
        } catch (e) {}
        try {
          await supabase.from('contributions').delete().eq('student_id', id);
        } catch (e) {}
        try {
          await supabase.from('certificates').delete().eq('student_id', id);
        } catch (e) {}
      }
    } else if (collectionName === 'teachers') {
      if (isSupabaseConfigured && !isTableUsingFallback('teachers')) {
        try {
          await supabase.from('subjects').update({ teacher_id: null }).eq('teacher_id', id);
        } catch (e) {}
      }
    }

    // Sempre remove localmente também para manter consistência total
    deleteLocalItem(collectionName, id);

    if (isTableUsingFallback(collectionName) || !isSupabaseConfigured) {
      return;
    }
    
    const { error } = await supabase.from(collectionName).delete().eq('id', id);
    if (error) {
      if (isDatabaseMissingOrCacheError(error)) {
        setTableUsingFallback(collectionName, true);
        return;
      }
      throw error;
    }
  } catch (err: any) {
    if (isDatabaseMissingOrCacheError(err)) {
      setTableUsingFallback(collectionName, true);
      return;
    }
    console.error(`[deleteData] Erro em "${collectionName}":`, err.message);
    throw err;
  }
};

/**
 * Delete multiple records from Supabase and local cache
 */
export const deleteBatch = async (collectionName: string, ids: string[]) => {
  if (!ids || ids.length === 0) return;
  
  // Limpeza de dependências em lote
  if (collectionName === 'classes' && isSupabaseConfigured && !isTableUsingFallback('classes')) {
    try {
      await supabase.from('students').update({ class_id: null }).in('class_id', ids);
    } catch (e) {}
    try {
      await supabase.from('enrollments').delete().in('class_id', ids);
    } catch (e) {}
    try {
      await supabase.from('attendances').delete().in('class_id', ids);
    } catch (e) {}
    try {
      await supabase.from('grades').delete().in('class_id', ids);
    } catch (e) {}
    try {
      await supabase.from('assessments').delete().in('class_id', ids);
    } catch (e) {}
    try {
      await supabase.from('calendar_events').delete().in('class_id', ids);
    } catch (e) {}
  } else if (collectionName === 'students' && isSupabaseConfigured && !isTableUsingFallback('students')) {
    try {
      await supabase.from('enrollments').delete().in('student_id', ids);
    } catch (e) {}
    try {
      await supabase.from('attendances').delete().in('student_id', ids);
    } catch (e) {}
    try {
      await supabase.from('grades').delete().in('student_id', ids);
    } catch (e) {}
  }

  // Sempre remove localmente primeiro
  ids.forEach(id => deleteLocalItem(collectionName, id));

  if (isTableUsingFallback(collectionName) || !isSupabaseConfigured) {
    return;
  }

  try {
    const { error } = await supabase.from(collectionName).delete().in('id', ids);
    if (error) {
      if (isDatabaseMissingOrCacheError(error)) {
        setTableUsingFallback(collectionName, true);
        return;
      }
      throw error;
    }
  } catch (err: any) {
    console.warn(`[deleteBatch] Fallback individual para "${collectionName}":`, err.message);
    for (const id of ids) {
      try {
        await supabase.from(collectionName).delete().eq('id', id);
      } catch (e) {}
    }
  }
};

/**
 * Verifies relational integrity between classes, students and enrollments.
 * Automatically purges orphan enrollments that reference non-existent classes or students,
 * and clears invalid class_id from students referencing deleted classes.
 */
export const cleanOrphanEnrollments = async (): Promise<{ deletedEnrollments: number; fixedStudents: number }> => {
  try {
    const [allStudents, allClasses, allEnrollments] = await Promise.all([
      fetchAll('students').catch(() => []),
      fetchAll('classes').catch(() => []),
      fetchAll('enrollments').catch(() => [])
    ]);

    const validClassIds = new Set((allClasses || []).map((c: any) => c.id));
    const validStudentIds = new Set((allStudents || []).map((s: any) => s.id));

    let deletedEnrollments = 0;
    let fixedStudents = 0;

    // 1. Find and purge orphan enrollments referencing deleted/non-existent classes or students
    const orphanEnrollmentIds = (allEnrollments || [])
      .filter((e: any) => !e.class_id || !validClassIds.has(e.class_id) || !e.student_id || !validStudentIds.has(e.student_id))
      .map((e: any) => e.id);

    if (orphanEnrollmentIds.length > 0) {
      await deleteBatch('enrollments', orphanEnrollmentIds);
      deletedEnrollments = orphanEnrollmentIds.length;
      console.info(`[Integrity] Limpas ${deletedEnrollments} matrículas órfãs vinculadas a turmas inexistentes.`);
    }

    // 2. Find and fix students with invalid class_id
    for (const student of allStudents || []) {
      if (student.class_id && !validClassIds.has(student.class_id)) {
        // Find if student has another valid active enrollment
        const validEnr = (allEnrollments || []).find((e: any) => 
          e.student_id === student.id && 
          (e.status || 'Ativo') === 'Ativo' && 
          e.class_id && 
          validClassIds.has(e.class_id)
        );
        const newClassId = validEnr ? validEnr.class_id : null;
        await saveData('students', student.id, { class_id: newClassId });
        fixedStudents++;
      }
    }

    return { deletedEnrollments, fixedStudents };
  } catch (err: any) {
    console.warn('[cleanOrphanEnrollments] Erro durante verificação de integridade:', err);
    return { deletedEnrollments: 0, fixedStudents: 0 };
  }
};

/**
 * Automatically identifies and updates the 'course' field for all students in the database
 * based on their class, active enrollments, and available courses matrix.
 */
export const autoIdentifyAllStudentsCourses = async (): Promise<{ totalStudents: number; updatedStudents: number }> => {
  try {
    const [allStudents, allClasses, allEnrollments, allCourses] = await Promise.all([
      fetchAll('students').catch(() => []),
      fetchAll('classes').catch(() => []),
      fetchAll('enrollments').catch(() => []),
      fetchAll('courses').catch(() => [])
    ]);

    const validClassIds = new Set((allClasses || []).map((c: any) => c.id));
    const classesMap = new Map<string, any>((allClasses || []).map((c: any) => [c.id, c]));

    let updatedCount = 0;
    const updatesToSave: Array<{ id: string; course: string; class_id?: string; start_date?: string }> = [];

    for (const student of allStudents || []) {
      const currentCourse = (student.course || '').trim();
      
      // Determine effective class
      let effectiveClassId = (student.class_id && validClassIds.has(student.class_id)) ? student.class_id : '';
      if (!effectiveClassId) {
        const activeEnr = (allEnrollments || []).find((e: any) => 
          e.student_id === student.id && 
          (e.status || 'Ativo') === 'Ativo' && 
          e.class_id && 
          validClassIds.has(e.class_id)
        );
        if (activeEnr) {
          effectiveClassId = activeEnr.class_id;
        }
      }

      const targetClass = effectiveClassId ? classesMap.get(effectiveClassId) : null;
      let detectedCourse = targetClass ? detectCourseFromClass(targetClass, allCourses) : '';

      // Fallback heuristics if course not resolved directly
      if (!detectedCourse && targetClass?.name) {
        const nameLower = (targetClass.name || '').toLowerCase();
        if (nameLower.includes('doutrina') || nameLower.includes('dsi')) detectedCourse = 'Doutrina Social da Igreja';
        else if (nameLower.includes('santos') || nameLower.includes('negros') || nameLower.includes('hsn')) detectedCourse = 'História dos Santos Negros';
        else if (nameLower.includes('latim') || nameLower.includes('lat')) detectedCourse = 'Latim';
        else if (nameLower.includes('teologia') || nameLower.includes('teo')) detectedCourse = 'Teologia';
      }

      // Check if student has no course or placeholder or course doesn't match detected class course
      const isMissingCourse = !currentCourse || 
                              currentCourse === 'Identificar Curso...' || 
                              currentCourse === 'null' || 
                              currentCourse === 'undefined' || 
                              currentCourse === 'Sem Curso Informado';
      
      if (detectedCourse && (isMissingCourse || (currentCourse !== detectedCourse && targetClass))) {
        const payload: any = {
          id: student.id,
          course: detectedCourse
        };
        if (effectiveClassId && (!student.class_id || !validClassIds.has(student.class_id))) {
          payload.class_id = effectiveClassId;
        }
        if (targetClass?.start_date && !student.start_date) {
          payload.start_date = targetClass.start_date;
        }
        updatesToSave.push(payload);
      }
    }

    if (updatesToSave.length > 0) {
      await saveBatch('students', updatesToSave);
      updatedCount = updatesToSave.length;
      console.info(`[autoIdentifyAllStudentsCourses] Auto-identificados e persistidos cursos de ${updatedCount} alunos.`);
    }

    return { totalStudents: (allStudents || []).length, updatedStudents: updatedCount };
  } catch (err: any) {
    console.warn('[autoIdentifyAllStudentsCourses] Erro ao auto-identificar cursos:', err);
    return { totalStudents: 0, updatedStudents: 0 };
  }
};

/**
 * Utility to fetch institution settings
 */
export const getInstitutionSettings = async () => {
  try {
    if (!isSupabaseConfigured) {
      const cached = localStorage.getItem('cached_institution_settings');
      if (cached) {
        try { return JSON.parse(cached); } catch (e) {}
      }
      return {
        id: '1',
        admission_norms: localStorage.getItem('inst_admission_norms') || '',
        presentation_info: localStorage.getItem('inst_presentation_info') || ''
      };
    }
    const result = await fetchWithTimeout(
      supabase
        .from('institution_settings')
        .select('*')
        .limit(1)
        .maybeSingle(),
      8000 // Fast timeout for settings
    );
    
    if (result?.error) {
      const cached = localStorage.getItem('cached_institution_settings');
      if (cached) {
        try { return JSON.parse(cached); } catch (e) {}
      }
      if (result.error.message?.includes('Failed to fetch')) {
        return {
          id: '1',
          admission_norms: localStorage.getItem('inst_admission_norms') || '',
          presentation_info: localStorage.getItem('inst_presentation_info') || ''
        };
      }
      throw result.error;
    }
    const data = result?.data;
    if (data) {
      if (!data.admission_norms) {
        data.admission_norms = localStorage.getItem('inst_admission_norms') || '';
      }
      if (!data.presentation_info) {
        data.presentation_info = localStorage.getItem('inst_presentation_info') || '';
      }
      // Cache successful settings
      try {
        localStorage.setItem('cached_institution_settings', JSON.stringify(data));
      } catch (e) {
        console.warn('Erro ao salvar configurações no localStorage:', e);
      }
    } else {
      const cached = localStorage.getItem('cached_institution_settings');
      if (cached) {
        try { return JSON.parse(cached); } catch (e) {}
      }
      return {
        id: '1',
        admission_norms: localStorage.getItem('inst_admission_norms') || '',
        presentation_info: localStorage.getItem('inst_presentation_info') || ''
      };
    }
    return data;
  } catch (err: any) {
    console.warn('[Supabase] Aviso ao buscar configurações da instituição:', err.message);
    const cached = localStorage.getItem('cached_institution_settings');
    if (cached) {
      try { return JSON.parse(cached); } catch (e) {}
    }
    return {
      id: '1',
      admission_norms: localStorage.getItem('inst_admission_norms') || '',
      presentation_info: localStorage.getItem('inst_presentation_info') || ''
    };
  }
};

export const fetchAcademicSettings = async (): Promise<any> => {
  try {
    const list = await fetchAll('academic_settings');
    if (list && list.length > 0) {
      return list[0];
    }
    const cached = localStorage.getItem('academic_settings');
    if (cached) {
      try { return JSON.parse(cached); } catch (e) {}
    }
    return null;
  } catch (err: any) {
    console.warn('[Supabase] Aviso ao buscar academic_settings:', err.message);
    const cached = localStorage.getItem('academic_settings');
    if (cached) {
      try { return JSON.parse(cached); } catch (e) {}
    }
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





