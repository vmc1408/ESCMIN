import { Unit, InstitutionSettings } from '../types';
import { fetchAll, saveData, deleteData, fetchById, deleteLocalItem } from './database';
import { supabase, isSupabaseConfigured, fetchWithTimeout } from './supabase';

/**
 * Constrói o objeto da unidade Matriz a partir das configurações da Instituição.
 * Garante que a Sede / Matriz sempre herde endereço, telefone, CNPJ, CEP e cidade da Instituição.
 */
export const getMatrizUnitFromInstitution = (institution?: Partial<InstitutionSettings> | any): Unit => {
  let city = '';
  let state = '';
  if (institution?.city_uf) {
    const parts = institution.city_uf.split(/[-/]/);
    if (parts.length >= 2) {
      city = parts[0].trim();
      state = parts[1].trim().substring(0, 2).toUpperCase();
    } else {
      city = institution.city_uf.trim();
    }
  } else {
    city = institution?.city || '';
    state = institution?.state || '';
  }

  const name = institution?.name?.trim() || 'Sede / Matriz';

  return {
    id: 'matriz',
    code: 'MAT',
    name,
    is_main: true,
    active: true,
    address: institution?.address?.trim() || '',
    city: city || '',
    state: state || '',
    cep: institution?.cep?.trim() || '',
    cnpj: institution?.cnpj?.trim() || '',
    phone: institution?.phone?.trim() || institution?.whatsapp?.trim() || '',
    email: institution?.email?.trim() || '',
    created_at: '2026-01-01T00:00:00.000Z'
  };
};

export const DEFAULT_MAIN_UNIT: Unit = getMatrizUnitFromInstitution();

export const LOCAL_STORAGE_UNITS_KEY = 'db_fallback_units';
export const LOCAL_STORAGE_DELETED_UNITS_KEY = 'db_fallback_deleted_unit_ids';
export const CLOUD_UNITS_REGISTRY_ID = 'system_units_registry';
export const CLOUD_UNITS_EMAIL = 'system_units@escmin.internal';

/**
 * Tombstone / Blacklist de unidades excluídas:
 * Impede que unidades removidas sejam ressuscitadas por fontes concorrentes
 * (cache de outros navegadores, tabela nativa sem purge ou email_registry defasado).
 */
export const getDeletedUnitIds = (): Set<string> => {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_DELETED_UNITS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return new Set(parsed.map(s => String(s).toLowerCase().trim()));
      }
    }
  } catch {}
  return new Set<string>();
};

export const markUnitAsDeleted = (unitId: string, code?: string): Set<string> => {
  const set = getDeletedUnitIds();
  if (unitId) set.add(unitId.toLowerCase().trim());
  if (code) set.add(code.toLowerCase().trim());
  try {
    localStorage.setItem(LOCAL_STORAGE_DELETED_UNITS_KEY, JSON.stringify(Array.from(set)));
  } catch {}
  return set;
};

export const unmarkUnitAsDeleted = (unitId?: string, code?: string) => {
  const set = getDeletedUnitIds();
  if (unitId) set.delete(unitId.toLowerCase().trim());
  if (code) set.delete(code.toLowerCase().trim());
  try {
    localStorage.setItem(LOCAL_STORAGE_DELETED_UNITS_KEY, JSON.stringify(Array.from(set)));
  } catch {}
};

// Script SQL completo e seguro para execução no Supabase SQL Editor
export const SUPABASE_UNITS_MIGRATION_SQL = `-- SCRIPT DE MIGRAÇÃO: UNIDADES E POLOS EDUCACIONAIS (ESCMIN)
-- Execute este script no SQL Editor do seu projeto Supabase para habilitar a tabela nativa de polos

-- 1. Criar tabela de Unidades / Filiais (Polos)
CREATE TABLE IF NOT EXISTS public.units (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    is_main BOOLEAN DEFAULT false,
    address TEXT,
    city TEXT,
    state TEXT,
    cep TEXT,
    cnpj TEXT,
    phone TEXT,
    email TEXT,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Garantir novas colunas se a tabela já existia
ALTER TABLE public.units ADD COLUMN IF NOT EXISTS cep TEXT;
ALTER TABLE public.units ADD COLUMN IF NOT EXISTS cnpj TEXT;

-- 2. Inserir a Matriz como polo padrão da instituição
INSERT INTO public.units (id, code, name, is_main, active)
VALUES ('matriz', 'MAT', 'Sede / Matriz', true, true)
ON CONFLICT (id) DO NOTHING;

-- 3. Adicionar coluna unit_id nas tabelas operacionais da escola
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS unit_id TEXT DEFAULT 'all';
ALTER TABLE public.email_registry ADD COLUMN IF NOT EXISTS unit_id TEXT DEFAULT 'all';
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS unit_id TEXT DEFAULT 'matriz';
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS unit_id TEXT DEFAULT 'matriz';
ALTER TABLE public.teachers ADD COLUMN IF NOT EXISTS unit_id TEXT DEFAULT 'matriz';
ALTER TABLE public.subjects ADD COLUMN IF NOT EXISTS unit_id TEXT DEFAULT 'matriz';

-- 4. Habilitar RLS e Permissão Pública para leitura, inserção, atualização e exclusão
ALTER TABLE public.units ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public Access units" ON public.units;
CREATE POLICY "Public Access units" ON public.units FOR ALL USING (true) WITH CHECK (true);

-- 5. Concessão explícita de permissões totais para anon, authenticated e service_role
GRANT ALL ON TABLE public.units TO anon, authenticated, service_role;
`;

/**
 * Envia a lista consolidada de unidades para o registro em nuvem no Supabase.
 * Isso garante replicação instantânea entre Dev, Vercel e Produção.
 */
export const pushUnitsToCloudRegistry = async (unitsList: Unit[]): Promise<void> => {
  if (!isSupabaseConfigured || !Array.isArray(unitsList) || unitsList.length === 0) return;

  try {
    const deletedSet = getDeletedUnitIds();
    const deletedIdsList = Array.from(deletedSet);

    // 1. Registro redundante em email_registry (tabela garantida em qualquer banco Supabase)
    await saveData('email_registry', CLOUD_UNITS_REGISTRY_ID, {
      id: CLOUD_UNITS_REGISTRY_ID,
      email: CLOUD_UNITS_EMAIL,
      role: 'system_units',
      status: 'active',
      metadata: {
        units: unitsList,
        deleted_ids: deletedIdsList,
        updated_at: new Date().toISOString()
      }
    }, 10000).catch(err => {
      console.warn('[unitService] Aviso ao sincronizar registro central em email_registry:', err?.message || err);
    });

    // 2. Salva em paralelo na tabela nativa 'units' caso já tenha sido criada no Supabase
    for (const u of unitsList) {
      if (u.id && !deletedSet.has(u.id.toLowerCase())) {
        await saveData('units', u.id, u, 5000).catch(() => {});
      }
    }
  } catch (err: any) {
    console.warn('[unitService] Falha secundária na sincronização em nuvem:', err?.message || err);
  }
};

/**
 * Sincroniza a unidade Matriz com os dados cadastrados na Instituição.
 * Salva no cache local, na tabela units e no registro central em nuvem.
 */
export const syncMatrizWithInstitution = async (institutionData: any): Promise<Unit> => {
  const matriz = getMatrizUnitFromInstitution(institutionData);

  let currentList: Unit[] = [];
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_UNITS_KEY);
    if (raw) currentList = JSON.parse(raw);
  } catch {}

  const index = currentList.findIndex(u => u.id === 'matriz' || u.is_main);
  if (index >= 0) {
    currentList[index] = { ...currentList[index], ...matriz, id: 'matriz', is_main: true, active: true };
  } else {
    currentList.unshift(matriz);
  }

  try {
    localStorage.setItem(LOCAL_STORAGE_UNITS_KEY, JSON.stringify(currentList));
  } catch {}

  // Sincroniza em nuvem
  await pushUnitsToCloudRegistry(currentList).catch(() => {});

  window.dispatchEvent(new CustomEvent('units-updated'));
  return matriz;
};

/**
 * Carrega a lista de unidades reconciliando todas as fontes:
 * - Dados da Instituição para a Matriz
 * - Cache local
 * - Tabela nativa 'units' (Supabase)
 * - Registro central em nuvem 'email_registry' (Supabase)
 * Respeita estritamente o tombstone de unidades excluídas para evitar qualquer ressurreição.
 */
export const getUnits = async (): Promise<Unit[]> => {
  // 1. Obtém dados mais recentes da instituição para compor a Matriz
  let cachedInst: any = null;
  try {
    const rawInst = localStorage.getItem('cached_institution_settings');
    if (rawInst) cachedInst = JSON.parse(rawInst);
  } catch {}

  const dynamicMatriz = getMatrizUnitFromInstitution(cachedInst);

  // 2. Carrega conjunto de IDs e códigos excluídos (tombstone)
  const deletedIds = getDeletedUnitIds();

  const isDiscarded = (u: any): boolean => {
    if (!u || !u.id) return true;
    if (u.id === 'matriz' || u.is_main) return false;
    const idLower = String(u.id).toLowerCase().trim();
    const codeLower = u.code ? String(u.code).toLowerCase().trim() : '';
    return deletedIds.has(idLower) || (Boolean(codeLower) && deletedIds.has(codeLower));
  };

  // 3. Carrega do cache local
  let localUnits: Unit[] = [];
  try {
    const rawLocal = localStorage.getItem(LOCAL_STORAGE_UNITS_KEY);
    if (rawLocal) {
      const parsed = JSON.parse(rawLocal);
      if (Array.isArray(parsed) && parsed.length > 0) {
        localUnits = parsed.filter(u => !isDiscarded(u));
      }
    }
  } catch {}

  const mergedMap = new Map<string, Unit>();

  // Semeia com a Matriz dinâmica (alimentada pela Instituição)
  mergedMap.set(dynamicMatriz.id, dynamicMatriz);

  // Insere unidades locais conhecidas não excluídas
  localUnits.forEach(u => {
    if (u && u.id) {
      if (u.id === 'matriz' || u.is_main) {
        // Matriz sempre preserva as informações mais recentes da Instituição
        mergedMap.set('matriz', {
          ...u,
          ...dynamicMatriz,
          id: 'matriz',
          code: 'MAT',
          is_main: true,
          active: true
        });
      } else if (!isDiscarded(u)) {
        mergedMap.set(u.id, { ...u, is_main: false });
      }
    }
  });

  // 4. Tenta carregar da tabela nativa 'units' no Supabase
  try {
    const tableData = await fetchAll('units', '*', 'name', true).catch(() => []);
    if (Array.isArray(tableData) && tableData.length > 0) {
      tableData.forEach((u: any) => {
        if (u && u.id) {
          if (u.id === 'matriz' || u.is_main) {
            mergedMap.set('matriz', {
              ...u,
              ...dynamicMatriz,
              id: 'matriz',
              code: 'MAT',
              is_main: true,
              active: true
            });
          } else if (isDiscarded(u)) {
            // Se veio do Supabase mas está na blacklist de excluídos, dispara remoção definitiva em background
            if (isSupabaseConfigured) {
              Promise.resolve(supabase.from('units').delete().eq('id', u.id)).catch(() => {});
            }
          } else {
            mergedMap.set(u.id, { ...u, is_main: false });
          }
        }
      });
    }
  } catch (e) {
    // Tabela nativa pode não existir ainda
  }

  // 5. Tenta carregar do registro redundante em nuvem (email_registry)
  try {
    const regData: any = await fetchById('email_registry', CLOUD_UNITS_REGISTRY_ID, 6000).catch(() => null);
    
    // Incorpora novos IDs excluídos sincronizados da nuvem
    if (Array.isArray(regData?.metadata?.deleted_ids)) {
      let changed = false;
      regData.metadata.deleted_ids.forEach((delId: string) => {
        if (delId) {
          const norm = String(delId).toLowerCase().trim();
          if (!deletedIds.has(norm)) {
            deletedIds.add(norm);
            changed = true;
          }
        }
      });
      if (changed) {
        try {
          localStorage.setItem(LOCAL_STORAGE_DELETED_UNITS_KEY, JSON.stringify(Array.from(deletedIds)));
        } catch {}
      }
    }

    const cloudUnits = regData?.metadata?.units;
    if (Array.isArray(cloudUnits) && cloudUnits.length > 0) {
      cloudUnits.forEach((u: any) => {
        if (u && u.id) {
          if (u.id === 'matriz' || u.is_main) {
            mergedMap.set('matriz', {
              ...u,
              ...dynamicMatriz,
              id: 'matriz',
              code: 'MAT',
              is_main: true,
              active: true
            });
          } else if (!isDiscarded(u)) {
            mergedMap.set(u.id, { ...u, is_main: false });
          }
        }
      });
    }
  } catch (e) {
    // Ignora erro no registro central
  }

  // Garante ordenação (Matriz primeiro, depois ordem alfabética)
  const consolidatedList = Array.from(mergedMap.values())
    .filter(u => !isDiscarded(u))
    .sort((a, b) => {
      if (a.is_main || a.id === 'matriz') return -1;
      if (b.is_main || b.id === 'matriz') return 1;
      return (a.name || '').localeCompare(b.name || '');
    });

  // Atualiza o cache local limpo
  try {
    localStorage.setItem(LOCAL_STORAGE_UNITS_KEY, JSON.stringify(consolidatedList));
  } catch {}

  return consolidatedList;
};

/**
 * Salva uma unidade garantindo replicação instantânea local e remota.
 * Se for a Matriz, sincroniza bidirecionalmente com a Instituição.
 */
export const saveUnit = async (unit: Partial<Unit>): Promise<Unit> => {
  const isMatriz = unit.id === 'matriz' || unit.is_main;
  const id = isMatriz ? 'matriz' : (unit.id || `unit_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`);

  const completeUnit: Unit = {
    id,
    code: isMatriz ? 'MAT' : (unit.code?.trim().toUpperCase() || 'FIL'),
    name: unit.name?.trim() || (isMatriz ? 'Sede / Matriz' : 'Nova Filial'),
    is_main: Boolean(isMatriz),
    address: unit.address?.trim() || '',
    city: unit.city?.trim() || '',
    state: unit.state?.trim() || '',
    cep: unit.cep?.trim() || '',
    cnpj: unit.cnpj?.trim() || '',
    phone: unit.phone?.trim() || '',
    email: unit.email?.trim() || '',
    active: isMatriz ? true : (unit.active !== undefined ? unit.active : true),
    created_at: unit.created_at || new Date().toISOString()
  };

  // Se a unidade estava na lista de excluídos e está sendo recriada/salva, remove do tombstone
  unmarkUnitAsDeleted(completeUnit.id, completeUnit.code);

  // Se for a Matriz, atualiza também a Instituição para manter sincronia perfeita
  if (isMatriz) {
    try {
      let cachedInst: any = {};
      const raw = localStorage.getItem('cached_institution_settings');
      if (raw) cachedInst = JSON.parse(raw);

      const cityUf = completeUnit.city 
        ? `${completeUnit.city}${completeUnit.state ? ` - ${completeUnit.state}` : ''}`
        : (cachedInst.city_uf || '');

      const updatedInst = {
        ...cachedInst,
        name: completeUnit.name,
        address: completeUnit.address,
        cep: completeUnit.cep,
        cnpj: completeUnit.cnpj,
        phone: completeUnit.phone,
        email: completeUnit.email,
        city_uf: cityUf,
        updated_at: new Date().toISOString()
      };

      localStorage.setItem('cached_institution_settings', JSON.stringify(updatedInst));
      saveData('institution_settings', cachedInst.id || '1', updatedInst).catch(() => {});
      window.dispatchEvent(new Event('institution-updated'));
    } catch (e) {
      console.warn('[unitService] Falha ao sincronizar Matriz com Instituição:', e);
    }
  }

  // 1. Atualiza lista local
  let currentList: Unit[] = [];
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_UNITS_KEY);
    if (raw) currentList = JSON.parse(raw);
  } catch {}

  const index = currentList.findIndex(u => u.id === completeUnit.id);
  if (index >= 0) {
    currentList[index] = completeUnit;
  } else {
    currentList.push(completeUnit);
  }

  try {
    localStorage.setItem(LOCAL_STORAGE_UNITS_KEY, JSON.stringify(currentList));
  } catch {}

  // 2. Salva na nuvem (redundante e na tabela units)
  await pushUnitsToCloudRegistry(currentList);

  window.dispatchEvent(new CustomEvent('units-updated'));
  return completeUnit;
};

export interface UnitLinkedRecordsInfo {
  canDelete: boolean;
  totalCount: number;
  studentsCount: number;
  classesCount: number;
  teachersCount: number;
  usersCount: number;
  contributionsCount: number;
  summary: string;
  reasons: string[];
}

/**
 * Analisa e contabiliza todos os registros acadêmicos e operacionais vinculados para uma lista de unidades.
 * Executa as buscas de estudantes, turmas, professores, usuários e contribuições de forma consolidada e única,
 * evitando requisições duplicadas e colunas inexistentes como unit_id em contributions.
 */
export const checkAllUnitsLinkedRecords = async (unitsList: Unit[]): Promise<Record<string, UnitLinkedRecordsInfo>> => {
  const map: Record<string, UnitLinkedRecordsInfo> = {};
  if (!Array.isArray(unitsList) || unitsList.length === 0) return map;

  // Carrega todas as coleções relevantes usando colunas estritamente existentes no schema SQL
  const [students, classes, teachers, users, contributions] = await Promise.all([
    fetchAll('students', 'id,name,registration_number,unit_id,status').catch(() => []),
    fetchAll('classes', 'id,name,code,unit_id,status').catch(() => []),
    fetchAll('teachers', 'id,name,unit_id').catch(() => []),
    fetchAll('users', 'id,email,full_name,unit_id').catch(() => []),
    fetchAll('contributions', 'id,student_id').catch(() => [])
  ]);

  for (const unit of unitsList) {
    if (unit.id === 'matriz' || unit.is_main) {
      map[unit.id] = {
        canDelete: false,
        totalCount: 1,
        studentsCount: 0,
        classesCount: 0,
        teachersCount: 0,
        usersCount: 0,
        contributionsCount: 0,
        summary: 'A unidade Sede / Matriz é o polo principal da instituição e não pode ser excluída.',
        reasons: ['Unidade Sede / Matriz da Instituição']
      };
      continue;
    }

    const norm = unit.id.trim().toLowerCase();
    const codeNorm = unit.code?.trim().toLowerCase();
    const nameNorm = unit.name?.trim().toLowerCase();

    const isMatching = (itemUnitId?: string) => {
      if (!itemUnitId) return false;
      const itemNorm = itemUnitId.trim().toLowerCase();
      return (
        itemNorm === norm || 
        (Boolean(codeNorm) && itemNorm === codeNorm) || 
        (Boolean(nameNorm) && itemNorm === nameNorm)
      );
    };

    const matchedStudents = (students || []).filter((s: any) => isMatching(getItemUnitId(s)));
    const matchedStudentIds = new Set(matchedStudents.map((s: any) => String(s.id)));
    const matchedClasses = (classes || []).filter((c: any) => isMatching(getItemUnitId(c)));
    const matchedTeachers = (teachers || []).filter((t: any) => isMatching(getItemUnitId(t)));
    const matchedUsers = (users || []).filter((u: any) => isMatching(u.unit_id));
    
    // Contribuições vinculadas aos alunos matriculados neste polo ou com tag direta unit_id
    const matchedContributions = (contributions || []).filter((cb: any) => 
      (cb.student_id && matchedStudentIds.has(String(cb.student_id))) || 
      isMatching(cb.unit_id)
    );

    const studentsCount = matchedStudents.length;
    const classesCount = matchedClasses.length;
    const teachersCount = matchedTeachers.length;
    const usersCount = matchedUsers.length;
    const contributionsCount = matchedContributions.length;

    const totalCount = studentsCount + classesCount + teachersCount + usersCount + contributionsCount;

    const reasons: string[] = [];
    if (studentsCount > 0) reasons.push(`${studentsCount} aluno(s)`);
    if (classesCount > 0) reasons.push(`${classesCount} turma(s)`);
    if (teachersCount > 0) reasons.push(`${teachersCount} professor(es)`);
    if (usersCount > 0) reasons.push(`${usersCount} usuário(s) do sistema`);
    if (contributionsCount > 0) reasons.push(`${contributionsCount} registro(s) financeiro(s)`);

    const canDelete = totalCount === 0;
    const summary = canDelete 
      ? 'Nenhum registro vinculado. A unidade pode ser excluída com segurança.'
      : reasons.join(', ');

    map[unit.id] = {
      canDelete,
      totalCount,
      studentsCount,
      classesCount,
      teachersCount,
      usersCount,
      contributionsCount,
      summary,
      reasons
    };
  }

  return map;
};

/**
 * Analisa e contabiliza todos os registros acadêmicos e operacionais vinculados a uma unidade.
 * Se houver qualquer registro vinculado, impede a exclusão física e orienta a desativação.
 */
export const checkUnitLinkedRecords = async (unitId: string): Promise<UnitLinkedRecordsInfo> => {
  if (!unitId || unitId === 'matriz') {
    return {
      canDelete: false,
      totalCount: 1,
      studentsCount: 0,
      classesCount: 0,
      teachersCount: 0,
      usersCount: 0,
      contributionsCount: 0,
      summary: 'A unidade Sede / Matriz é o polo principal da instituição e não pode ser excluída.',
      reasons: ['Unidade Sede / Matriz da Instituição']
    };
  }

  let units: Unit[] = [];
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_UNITS_KEY);
    if (raw) units = JSON.parse(raw);
  } catch {}

  const target = units.find(u => u.id === unitId) || { id: unitId, code: '', name: '', is_main: false, active: true };
  const allMap = await checkAllUnitsLinkedRecords([target]);
  return allMap[unitId] || {
    canDelete: true,
    totalCount: 0,
    studentsCount: 0,
    classesCount: 0,
    teachersCount: 0,
    usersCount: 0,
    contributionsCount: 0,
    summary: 'Nenhum registro vinculado.',
    reasons: []
  };
};

/**
 * Exclui uma unidade APENAS SE ela não contiver dados vinculados.
 * Se contiver registros vinculados (alunos, turmas, etc.), lança exceção exigindo desativação.
 * Realiza exclusão atômica e definitiva:
 * 1. Registra no Tombstone permanente (impede ressurreição local e na nuvem)
 * 2. Remove do cache local e fallbacks
 * 3. Deleta fisicamente da tabela 'units' no Supabase (por ID e por código)
 * 4. Atualiza o registro em nuvem no 'email_registry' com a nova lista e a lista de excluídos
 */
export const deleteUnit = async (unitId: string): Promise<boolean> => {
  if (unitId === 'matriz') {
    throw new Error('A unidade Sede / Matriz não pode ser excluída.');
  }

  // Verificação estrita de registros vinculados
  const check = await checkUnitLinkedRecords(unitId);
  if (!check.canDelete) {
    throw new Error(
      `Esta unidade possui registros vinculados (${check.summary}) e não pode ser excluída para preservar o histórico acadêmico. Você pode apenas desativá-la.`
    );
  }

  // 1. Identifica a unidade e seus identificadores (ID e Código)
  let currentList: Unit[] = [];
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_UNITS_KEY);
    if (raw) currentList = JSON.parse(raw);
  } catch {}

  const normId = unitId.toLowerCase().trim();
  const targetUnit = currentList.find(u => 
    u.id.toLowerCase().trim() === normId || 
    (u.code && u.code.toLowerCase().trim() === normId)
  );
  const targetId = targetUnit?.id || unitId;
  const targetCode = targetUnit?.code;

  // 2. Registra no Tombstone (Blacklist permanente de excluídos)
  markUnitAsDeleted(targetId, targetCode);
  if (unitId !== targetId) {
    markUnitAsDeleted(unitId);
  }

  // 3. Atualiza lista local removendo imediatamente
  const updatedList = currentList.filter(u => {
    const uIdNorm = u.id.toLowerCase().trim();
    if (uIdNorm === normId || uIdNorm === targetId.toLowerCase().trim()) return false;
    if (targetCode && u.code && u.code.toLowerCase().trim() === targetCode.toLowerCase().trim()) return false;
    return true;
  });

  try {
    localStorage.setItem(LOCAL_STORAGE_UNITS_KEY, JSON.stringify(updatedList));
  } catch {}

  // 4. Remove dos caches locais de fallback do database.ts
  deleteLocalItem('units', targetId);
  if (unitId !== targetId) {
    deleteLocalItem('units', unitId);
  }

  // 5. Exclusão robusta no Supabase
  if (isSupabaseConfigured) {
    const promises: Promise<any>[] = [];

    // A) Deleção direta na tabela 'units' por ID
    promises.push(
      fetchWithTimeout(() => supabase.from('units').delete().eq('id', targetId), 10000)
        .then((res: any) => {
          if (res?.error) {
            console.warn('[unitService] Aviso ao deletar unidade por ID em units no Supabase:', res.error);
          }
        })
        .catch(e => console.warn('[unitService] Exceção ao deletar unidade por ID:', e))
    );

    // B) Se houver código (ex: FIL-01), deleta também por code para cobrir registros criados com chave alternativa
    if (targetCode) {
      promises.push(
        fetchWithTimeout(() => supabase.from('units').delete().eq('code', targetCode), 10000)
          .then((res: any) => {
            if (res?.error) {
              console.warn('[unitService] Aviso ao deletar unidade por code em units no Supabase:', res.error);
            }
          })
          .catch(e => console.warn('[unitService] Exceção ao deletar unidade por code:', e))
      );
    }

    // C) Tenta também via deleteData para sincronizar fallbacks
    promises.push(
      deleteData('units', targetId).catch(err => {
        console.warn('[unitService] deleteData units falhou (não impeditivo devido a tombstone):', err);
      })
    );

    // D) Sincroniza 'email_registry' com a nova lista limpa e a lista de IDs excluídos
    promises.push(
      (async () => {
        const deletedIdsList = Array.from(getDeletedUnitIds());
        return saveData('email_registry', CLOUD_UNITS_REGISTRY_ID, {
          id: CLOUD_UNITS_REGISTRY_ID,
          email: CLOUD_UNITS_EMAIL,
          role: 'system_units',
          status: 'active',
          metadata: {
            units: updatedList,
            deleted_ids: deletedIdsList,
            updated_at: new Date().toISOString()
          }
        }, 10000).catch(err => {
          console.warn('[unitService] Erro ao sincronizar email_registry após exclusão:', err);
        });
      })()
    );

    // Aguarda todas as operações concluírem
    await Promise.allSettled(promises);
  }

  // Notifica o restante do sistema
  window.dispatchEvent(new CustomEvent('units-updated'));
  return true;
};

/**
 * Alterna o status de ativação de uma unidade (Ativa <-> Desativada).
 * A unidade Sede / Matriz é protegida e nunca pode ser desativada.
 */
export const toggleUnitActive = async (unitId: string, activeState?: boolean): Promise<Unit> => {
  if (unitId === 'matriz') {
    throw new Error('A unidade Sede / Matriz não pode ser desativada.');
  }

  const units = await getUnits();
  const existing = units.find(u => u.id === unitId);
  if (!existing) {
    throw new Error('Unidade não encontrada.');
  }

  const nextActive = activeState !== undefined ? activeState : !existing.active;
  return await saveUnit({
    ...existing,
    active: nextActive
  });
};

/**
 * Força uma sincronização bidirecional imediata com o Supabase
 */
export const forceSyncUnits = async (): Promise<Unit[]> => {
  const units = await getUnits();
  if (isSupabaseConfigured && units.length > 0) {
    await pushUnitsToCloudRegistry(units);
  }
  window.dispatchEvent(new CustomEvent('units-updated'));
  return units;
};

/**
 * Verifica o status da tabela units no Supabase e da sincronização em nuvem
 */
export const checkSupabaseUnitsTableStatus = async (): Promise<{
  nativeTableExists: boolean;
  cloudSyncActive: boolean;
  message: string;
}> => {
  if (!isSupabaseConfigured) {
    return {
      nativeTableExists: false,
      cloudSyncActive: false,
      message: 'Supabase não configurado neste ambiente.'
    };
  }

  // Testa tabela nativa
  let nativeTableExists = false;
  try {
    const check = await fetchWithTimeout(supabase.from('units').select('id').limit(1), 5000);
    if (check && !check.error) {
      nativeTableExists = true;
    }
  } catch {}

  if (nativeTableExists) {
    return {
      nativeTableExists: true,
      cloudSyncActive: true,
      message: 'Tabela nativa "units" ativa e conectada ao Supabase.'
    };
  }

  // Se a tabela nativa não existir, testa se o registro central está acessível
  let cloudSyncActive = false;
  try {
    const regCheck = await fetchWithTimeout(supabase.from('email_registry').select('id').limit(1), 5000);
    if (regCheck && !regCheck.error) {
      cloudSyncActive = true;
    }
  } catch {}

  return {
    nativeTableExists: false,
    cloudSyncActive,
    message: cloudSyncActive
      ? 'Sincronização em nuvem ativa via Registro Central (email_registry). Para suporte nativo a banco de dados relacional, execute o script SQL de polos no Supabase.'
      : 'Sem conexão com a nuvem no momento. Verifique sua conexão com a internet.'
  };
};

export const getUnitName = (units: Unit[], unitId?: string): string => {
  if (!unitId || unitId === 'matriz' || unitId === 'MAT') {
    const main = units.find(u => u.is_main || u.id === 'matriz');
    return main?.name || 'Sede / Matriz';
  }
  const norm = unitId.trim().toLowerCase();
  const found = units.find(u => 
    u.id.toLowerCase() === norm || 
    u.name?.toLowerCase() === norm ||
    u.code?.toLowerCase() === norm
  );
  if (found) return found.name;
  
  if (unitId.includes(' ') || !unitId.startsWith('unit_')) {
    return unitId;
  }
  return 'Unidade Vinculada';
};

export const getUnitCode = (units: Unit[], unitId?: string): string => {
  if (!unitId || unitId === 'matriz' || unitId === 'MAT') {
    const main = units.find(u => u.is_main || u.id === 'matriz');
    return main?.code || 'MAT';
  }
  const norm = unitId.trim().toLowerCase();
  const found = units.find(u => 
    u.id.toLowerCase() === norm || 
    u.name?.toLowerCase() === norm ||
    u.code?.toLowerCase() === norm
  );
  return found?.code || 'POLO';
};

export const getItemUnitId = (item: any): string | undefined => {
  if (!item) return undefined;
  return item.unit_id || item.unitId || item.unit || item.polo || item.polo_id || undefined;
};

export const isItemInUnit = (
  itemUnitId: string | undefined, 
  selectedUnitId: string, 
  units: Unit[] = []
): boolean => {
  if (!selectedUnitId || selectedUnitId === 'all' || selectedUnitId.toLowerCase() === 'todas') {
    return true;
  }

  const selNorm = selectedUnitId.trim().toLowerCase();
  const isMatrizSelected = selNorm === 'matriz' || selNorm === 'mat' || selNorm === 'sede' || selNorm === 'sede / matriz';

  if (!itemUnitId || itemUnitId.trim() === '') {
    return isMatrizSelected;
  }

  const itemNorm = itemUnitId.trim().toLowerCase();

  if (isMatrizSelected) {
    return (
      itemNorm === 'matriz' || 
      itemNorm === 'mat' || 
      itemNorm === 'sede' || 
      itemNorm.includes('matriz') ||
      itemNorm.includes('sede')
    );
  }

  if (itemNorm === selNorm) return true;

  const activeUnit = units.find(u => 
    u.id.toLowerCase() === selNorm || 
    u.name?.toLowerCase() === selNorm || 
    u.code?.toLowerCase() === selNorm
  );

  if (activeUnit) {
    if (itemNorm === activeUnit.id.toLowerCase()) return true;
    if (activeUnit.name && itemNorm === activeUnit.name.toLowerCase()) return true;
    if (activeUnit.code && itemNorm === activeUnit.code.toLowerCase()) return true;
  }

  const itemUnit = units.find(u => 
    u.id.toLowerCase() === itemNorm || 
    u.name?.toLowerCase() === itemNorm || 
    u.code?.toLowerCase() === itemNorm
  );

  if (itemUnit) {
    if (itemUnit.id.toLowerCase() === selNorm) return true;
    if (itemUnit.name && itemUnit.name.toLowerCase() === selNorm) return true;
    if (itemUnit.code && itemUnit.code.toLowerCase() === selNorm) return true;
  }

  return false;
};

export const filterListByUnit = <T>(
  items: T[], 
  selectedUnitId: string, 
  getUnitId: (item: T) => string | undefined,
  units: Unit[] = []
): T[] => {
  if (!selectedUnitId || selectedUnitId === 'all') return items;
  return items.filter(item => isItemInUnit(getUnitId(item), selectedUnitId, units));
};

export const getUserRestrictedUnit = (profile: any): string | null => {
  if (!profile) return null;
  const unitId = profile.unit_id || (profile as any).unitId || (profile as any).unit || (profile as any).polo;
  if (!unitId || typeof unitId !== 'string') return null;
  const norm = unitId.trim().toLowerCase();
  if (norm === '' || norm === 'all' || norm === 'todas' || norm === 'global') {
    return null;
  }
  return unitId.trim();
};

export const isTeacherAssignedToUnit = (
  teacher: any,
  selectedUnitId: string,
  units: Unit[] = [],
  classes: any[] = []
): boolean => {
  if (!selectedUnitId || selectedUnitId === 'all') return true;
  const teacherDirectUnit = getItemUnitId(teacher);
  if (teacherDirectUnit && isItemInUnit(teacherDirectUnit, selectedUnitId, units)) {
    return true;
  }
  // Check if teacher has any class in selected unit
  if (classes && classes.length > 0) {
    const teacherHasClassInUnit = classes.some(c => {
      const isTeacherClass = c.teacher_id === teacher.id || 
        (Array.isArray(c.teacher_ids) && c.teacher_ids.includes(teacher.id)) ||
        (Array.isArray(teacher.class_ids) && teacher.class_ids.includes(c.id));
      if (!isTeacherClass) return false;
      const classUnit = getItemUnitId(c);
      return isItemInUnit(classUnit, selectedUnitId, units);
    });
    if (teacherHasClassInUnit) return true;
  }
  return isItemInUnit(teacherDirectUnit || 'matriz', selectedUnitId, units);
};
