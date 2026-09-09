import { supabase, fetchRecursive, isSupabaseConfigured, fetchWithTimeout, isDbConnected, connectionError, isJwtOrTokenError, clearCorruptedAuthTokens } from './supabase';
import { detectCourseFromClass, normalizeSearchString } from './utils';

// Auto-purga de caches locais residuais para garantir operação 100% direta no banco de dados real
export const clearAllDatabaseFallbacks = () => {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (
        key && 
        (
          key.startsWith('db_fallback_') || 
          key.startsWith('cached_institution_settings') || 
          key.startsWith('app_local_units_') || 
          key.startsWith('academic_settings_') ||
          key === 'inst_admission_norms' || 
          key === 'inst_presentation_info'
        )
      ) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));
  } catch (e) {}
};

// Executa na inicialização do módulo
clearAllDatabaseFallbacks();

// Funções mantidas para compatibilidade de tipagem/importações, operando sem cache local
export const isTableUsingFallback = (_tableName?: string): boolean => false;

export const setTableUsingFallback = (tableName: string, _active?: boolean) => {
  try {
    localStorage.removeItem(`db_fallback_active_${tableName}`);
    localStorage.removeItem(`db_fallback_${tableName}`);
  } catch (e) {}
};

export const getLocalCollection = (_collectionName: string): any[] => [];

export const saveLocalCollection = (_collectionName: string, _data: any[]) => {};

export const saveLocalItem = (_collectionName: string, id: string, _item: any) => id;

export const deleteLocalItem = (_collectionName: string, _id: string) => {};

export const isDatabaseMissingOrCacheError = (err: any): boolean => {
  if (!err) return false;
  const msg = (typeof err === 'string' ? err : err.message || err.details || String(err)).toLowerCase();
  const code = String(err.code || '').toLowerCase();
  
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

export const tryRecoveryFromFallback = async (_collectionName: string) => false;

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
      userId: null,
      email: null,
    }
  };
  
  throw new Error(JSON.stringify(info));
}

/**
 * Busca direta e sem cache de todos os registros de uma coleção no Supabase.
 * Tanto o ambiente de desenvolvimento quanto o publicado leem e escrevem
 * diretamente na mesma base de dados real.
 */
export const fetchAll = async (collectionName: string, select = '*', orderCol = 'created_at', ascending = false) => {
  let effectiveOrderCol = orderCol;
  if (orderCol === 'created_at') {
    const tablesWithoutCreatedAt = ['academic_parameters', 'academic_settings', 'institution_settings'];
    if (tablesWithoutCreatedAt.includes(collectionName)) {
      effectiveOrderCol = '';
    }
  }

  if (!isSupabaseConfigured) {
    console.warn(`[Supabase] Supabase não configurado ao buscar lista em ${collectionName}.`);
    return [];
  }

  try {
    const sbData = await fetchRecursive(collectionName, { 
      select, 
      orderCol: effectiveOrderCol, 
      ascending, 
      timeoutMs: 30000 
    });

    if (Array.isArray(sbData)) {
      return sbData;
    }
    return [];
  } catch (err: any) {
    if (isJwtOrTokenError(err)) {
      console.warn(`[Supabase Fetch] Token/JWT dessincronizado em ${collectionName}. Limpando credenciais locais.`);
      clearCorruptedAuthTokens();
      supabase.auth.signOut({ scope: 'local' }).catch(() => {});
      return [];
    }

    // Se o erro for de coluna inexistente ao ordenar por created_at ou orderCol, tenta sem ordenação
    if (effectiveOrderCol && err?.message && (err.message.includes('column') || err.message.includes('order'))) {
      try {
        const retryData = await fetchRecursive(collectionName, { select, orderCol: '', ascending, timeoutMs: 30000 });
        if (Array.isArray(retryData)) return retryData;
      } catch (retryErr) {}
    }

    console.error(`[Supabase] Erro ao buscar lista em ${collectionName}:`, err?.message || err);
    return [];
  }
};

/**
 * Busca direta de um único documento no Supabase por ID.
 */
export const fetchById = async (collectionName: string, id: string, timeoutMs = 20000) => {
  if (!id) return null;
  if (!isSupabaseConfigured) return null;

  try {
    const result = await fetchWithTimeout(
      () => supabase
        .from(collectionName)
        .select('*')
        .eq('id', id)
        .maybeSingle(),
      timeoutMs
    );

    if (result?.error) {
      if (result.error.code === 'PGRST116') return null;
      throw result.error;
    }
    return result?.data || null;
  } catch (err: any) {
    if (isJwtOrTokenError(err)) {
      console.warn(`[Supabase Fetch] Token/JWT dessincronizado ao buscar ID ${id} em ${collectionName}. Limpando credenciais locais.`);
      clearCorruptedAuthTokens();
      supabase.auth.signOut({ scope: 'local' }).catch(() => {});
      return null;
    }

    console.error(`[Supabase] Erro ao buscar ID em ${collectionName}:`, err?.message || err);
    return null;
  }
};

/**
 * Busca direta com filtros no Supabase.
 */
export const fetchQuery = async (
  collectionName: string, 
  fieldOrFilters: string | { field: string; operator: string; value: any }[], 
  operator?: string, 
  value?: any
) => {
  if (!isSupabaseConfigured) return [];

  try {
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
      return [];
    }

    console.error(`[Supabase] Erro ao executar query em ${collectionName}:`, err?.message || err);
    return [];
  }
};

/**
 * Contagem direta de registros no Supabase.
 */
export const fetchCount = async (collectionName: string, status?: string) => {
  if (!isSupabaseConfigured) return 0;

  try {
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
    console.error(`[Supabase] Erro ao contar em ${collectionName}:`, err?.message || err);
    return 0;
  }
};

/**
 * Exclusão de múltiplos registros via query diretamente no Supabase.
 */
export const deleteQuery = async (collectionName: string, filters: { field: string; operator: string; value: any }[]) => {
  if (!isSupabaseConfigured) return;

  try {
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
 * Salva dados diretamente no Supabase via Upsert real.
 * Não salva em cache local ou no navegador para garantir paridade total entre Dev e Produção.
 */
export const saveData = async (collectionName: string, id: string | undefined, data: any, timeoutMs = 30000) => {
  const finalId = id || data.id || crypto.randomUUID();
  let payload = { ...data, id: finalId };

  if (!isSupabaseConfigured) {
    throw new Error(`[Supabase] Supabase não configurado. Impossível salvar em ${collectionName}.`);
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

        // Tratamento de coluna ainda não criada no banco para permitir salvamento do restante dos dados
        const isMissingCol = 
          errorMsgLower.includes('column') && 
          (errorMsgLower.includes('not found') || 
           errorMsgLower.includes('schema cache') || 
           errorMsgLower.includes('does not exist') ||
           errorMsgLower.includes('missing') ||
           errorMsgLower.includes('pgrst204'));

        if (isMissingCol) {
          const match = errorMsg.match(/['"](.+?)['"] column/) || 
                        errorMsg.match(/column ['"](.+?)['"]/) ||
                        errorMsg.match(/column (.+?) of/) ||
                        errorMsg.match(/column (.+?) not found/) ||
                        errorMsg.match(/property ['"](.+?)['"] not found/) ||
                        errorMsg.match(/column (.+?) in the schema cache/);
          
          if (match && match[1]) {
            const missingCol = match[1].replace(/['"]/g, '').trim();
            console.warn(`[Supabase] Removendo coluna inexistente "${missingCol}" de "${collectionName}" para persistir no banco real.`);
            delete (payload as any)[missingCol];
            attempts++;
            continue; 
          } else if (errorMsgLower.includes('updated_at')) {
            console.warn(`[Supabase] Forçando remoção de "updated_at" de "${collectionName}".`);
            delete (payload as any).updated_at;
            attempts++;
            continue;
          }
        }
        
        throw errorVal;
      }
      
      return finalId;
    } catch (innerErr: any) {
      attempts++;
      if (attempts >= maxAttempts) {
        console.error(`[saveData] Erro ao salvar diretamente no Supabase em "${collectionName}":`, innerErr?.message || innerErr);
        throw innerErr;
      }
      await wait(500 * attempts);
    }
  }

  return finalId;
};

/**
 * Salva lote diretamente no Supabase via Upsert real sem armazenamento local.
 */
export const saveBatch = async (collectionName: string, items: any[], timeoutMs = 30000) => {
  if (!items || items.length === 0) return [];
  if (!isSupabaseConfigured) {
    throw new Error(`[Supabase] Supabase não configurado. Impossível salvar lote em ${collectionName}.`);
  }

  let payloads = items.map(item => ({
    ...item,
    id: item.id || crypto.randomUUID()
  }));

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
            console.warn(`[Supabase] Removendo coluna inexistente "${missingCol}" de lote em "${collectionName}".`);
            payloads = payloads.map((p: any) => {
              const newP = { ...p };
              delete newP[missingCol];
              return newP;
            });
            attempts++;
            continue; 
          } else if (errorMsgLower.includes('updated_at')) {
            console.warn(`[Supabase] Removendo "updated_at" de lote em "${collectionName}".`);
            payloads = payloads.map((p: any) => {
              const newP = { ...p };
              delete newP.updated_at;
              return newP;
            });
            attempts++;
            continue;
          }
        }
        
        throw errorVal;
      }
      
      return payloads.map(p => p.id);
    } catch (innerErr: any) {
      attempts++;
      if (attempts >= maxAttempts) {
        console.error(`[saveBatch] Erro ao salvar lote no Supabase em "${collectionName}":`, innerErr?.message || innerErr);
        throw innerErr;
      }
      await wait(500 * attempts);
    }
  }

  return payloads.map(p => p.id);
};

/**
 * Exclui diretamente do Supabase garantindo integridade relacional.
 */
export const deleteData = async (collectionName: string, id: string) => {
  if (!id) return;
  if (!isSupabaseConfigured) return;
  
  try {
    // 1. Tratamento de Chaves Estrangeiras antes da exclusão física
    if (collectionName === 'classes') {
      try {
        await supabase.from('students').update({ class_id: null }).eq('class_id', id);
      } catch (e: any) {}
      try {
        await supabase.from('enrollments').delete().eq('class_id', id);
      } catch (e: any) {}
      try {
        await supabase.from('attendances').delete().eq('class_id', id);
      } catch (e: any) {}
      try {
        await supabase.from('grades').delete().eq('class_id', id);
      } catch (e: any) {}
      try {
        await supabase.from('assessments').delete().eq('class_id', id);
      } catch (e: any) {}
      try {
        await supabase.from('calendar_events').delete().eq('class_id', id);
      } catch (e: any) {}
    } else if (collectionName === 'students') {
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
    } else if (collectionName === 'teachers') {
      try {
        await supabase.from('subjects').update({ teacher_id: null }).eq('teacher_id', id);
      } catch (e) {}
    }

    const { error } = await supabase.from(collectionName).delete().eq('id', id);
    if (error) {
      throw error;
    }
  } catch (err: any) {
    console.error(`[deleteData] Erro ao excluir do Supabase em "${collectionName}":`, err?.message || err);
    throw err;
  }
};

/**
 * Exclui múltiplos registros em lote diretamente do Supabase.
 */
export const deleteBatch = async (collectionName: string, ids: string[]) => {
  if (!ids || ids.length === 0) return;
  if (!isSupabaseConfigured) return;
  
  // Limpeza de dependências em lote no Supabase
  if (collectionName === 'classes') {
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
  } else if (collectionName === 'students') {
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

  try {
    const { error } = await supabase.from(collectionName).delete().in('id', ids);
    if (error) {
      throw error;
    }
  } catch (err: any) {
    console.warn(`[deleteBatch] Fallback individual para "${collectionName}":`, err?.message || err);
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
 * Busca direta das configurações da instituição no Supabase.
 */
export const getInstitutionSettings = async () => {
  try {
    if (!isSupabaseConfigured) {
      return {
        id: '1',
        admission_norms: '',
        presentation_info: ''
      };
    }
    const result = await fetchWithTimeout(
      supabase
        .from('institution_settings')
        .select('*')
        .limit(1)
        .maybeSingle(),
      8000
    );
    
    if (result?.error) {
      if (result.error.code === 'PGRST116') {
        return { id: '1', admission_norms: '', presentation_info: '' };
      }
      throw result.error;
    }
    return result?.data || { id: '1', admission_norms: '', presentation_info: '' };
  } catch (err: any) {
    console.warn('[Supabase] Aviso ao buscar configurações da instituição:', err?.message || err);
    return {
      id: '1',
      admission_norms: '',
      presentation_info: ''
    };
  }
};

export const fetchAcademicSettings = async (): Promise<any> => {
  try {
    const list = await fetchAll('academic_settings');
    if (list && list.length > 0) {
      return list[0];
    }
    return null;
  } catch (err: any) {
    console.warn('[Supabase] Aviso ao buscar academic_settings:', err?.message || err);
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





