import { Unit } from '../types';
import { fetchAll, saveData, deleteData, fetchById } from './database';
import { supabase, isSupabaseConfigured, fetchWithTimeout } from './supabase';

export const DEFAULT_MAIN_UNIT: Unit = {
  id: 'matriz',
  code: 'MAT',
  name: 'Sede / Matriz',
  is_main: true,
  active: true,
  created_at: '2026-01-01T00:00:00.000Z'
};

export const LOCAL_STORAGE_UNITS_KEY = 'db_fallback_units';
export const CLOUD_UNITS_REGISTRY_ID = 'system_units_registry';
export const CLOUD_UNITS_EMAIL = 'system_units@escmin.internal';

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
    phone TEXT,
    email TEXT,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

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

-- 4. Habilitar RLS e Permissão Pública para leitura e escrita
ALTER TABLE public.units ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public Access units" ON public.units;
CREATE POLICY "Public Access units" ON public.units FOR ALL USING (true) WITH CHECK (true);
`;

/**
 * Envia a lista consolidada de unidades para o registro em nuvem no Supabase.
 * Isso garante replicação instantânea entre Dev, Vercel e Produção.
 */
export const pushUnitsToCloudRegistry = async (unitsList: Unit[]): Promise<void> => {
  if (!isSupabaseConfigured || !Array.isArray(unitsList) || unitsList.length === 0) return;

  try {
    // 1. Registro redundante em email_registry (tabela garantida em qualquer banco Supabase)
    await saveData('email_registry', CLOUD_UNITS_REGISTRY_ID, {
      id: CLOUD_UNITS_REGISTRY_ID,
      email: CLOUD_UNITS_EMAIL,
      role: 'system_units',
      status: 'active',
      metadata: {
        units: unitsList,
        updated_at: new Date().toISOString()
      },
      registered_at: new Date().toISOString()
    }, 10000).catch(err => {
      console.warn('[unitService] Aviso ao sincronizar registro central em email_registry:', err?.message || err);
    });

    // 2. Salva em paralelo na tabela nativa 'units' caso já tenha sido criada no Supabase
    for (const u of unitsList) {
      await saveData('units', u.id, u, 5000).catch(() => {});
    }
  } catch (err: any) {
    console.warn('[unitService] Falha secundária na sincronização em nuvem:', err?.message || err);
  }
};

/**
 * Carrega a lista de unidades reconciliando todas as fontes:
 * - Cache local
 * - Tabela nativa 'units' (Supabase)
 * - Registro central em nuvem 'email_registry' (Supabase)
 */
export const getUnits = async (): Promise<Unit[]> => {
  // 1. Carrega do cache local
  let localUnits: Unit[] = [];
  try {
    const rawLocal = localStorage.getItem(LOCAL_STORAGE_UNITS_KEY);
    if (rawLocal) {
      const parsed = JSON.parse(rawLocal);
      if (Array.isArray(parsed) && parsed.length > 0) {
        localUnits = parsed;
      }
    }
  } catch {}

  const mergedMap = new Map<string, Unit>();

  // Semeia com a Matriz
  mergedMap.set(DEFAULT_MAIN_UNIT.id, DEFAULT_MAIN_UNIT);

  // Insere unidades locais conhecidas
  localUnits.forEach(u => {
    if (u && u.id) {
      mergedMap.set(u.id, { ...u, is_main: u.id === 'matriz' || Boolean(u.is_main) });
    }
  });

  // 2. Tenta carregar da tabela nativa 'units' no Supabase
  try {
    const tableData = await fetchAll('units', '*', 'name', true).catch(() => []);
    if (Array.isArray(tableData) && tableData.length > 0) {
      tableData.forEach((u: any) => {
        if (u && u.id) {
          mergedMap.set(u.id, { ...u, is_main: u.id === 'matriz' || Boolean(u.is_main) });
        }
      });
    }
  } catch (e) {
    // Tabela nativa pode não existir ainda
  }

  // 3. Tenta carregar do registro redundante em nuvem (email_registry)
  try {
    const regData: any = await fetchById('email_registry', CLOUD_UNITS_REGISTRY_ID, 6000).catch(() => null);
    const cloudUnits = regData?.metadata?.units;
    if (Array.isArray(cloudUnits) && cloudUnits.length > 0) {
      cloudUnits.forEach((u: any) => {
        if (u && u.id) {
          mergedMap.set(u.id, { ...u, is_main: u.id === 'matriz' || Boolean(u.is_main) });
        }
      });
    }
  } catch (e) {
    // Ignora erro no registro central
  }

  // Garante ordenação (Matriz primeiro, depois ordem alfabética)
  const consolidatedList = Array.from(mergedMap.values()).sort((a, b) => {
    if (a.is_main || a.id === 'matriz') return -1;
    if (b.is_main || b.id === 'matriz') return 1;
    return (a.name || '').localeCompare(b.name || '');
  });

  // Atualiza o cache local
  try {
    localStorage.setItem(LOCAL_STORAGE_UNITS_KEY, JSON.stringify(consolidatedList));
  } catch {}

  // Se houver unidades extras ou se o banco estiver conectado, sincroniza em background
  if (isSupabaseConfigured && consolidatedList.length > 0) {
    pushUnitsToCloudRegistry(consolidatedList).catch(() => {});
  }

  return consolidatedList;
};

/**
 * Salva uma unidade garantindo replicação instantânea local e remota
 */
export const saveUnit = async (unit: Partial<Unit>): Promise<Unit> => {
  const id = unit.id || `unit_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  const completeUnit: Unit = {
    id,
    code: unit.code?.trim().toUpperCase() || 'FIL',
    name: unit.name?.trim() || 'Nova Filial',
    is_main: unit.is_main || id === 'matriz',
    address: unit.address?.trim() || '',
    city: unit.city?.trim() || '',
    state: unit.state?.trim() || '',
    phone: unit.phone?.trim() || '',
    email: unit.email?.trim() || '',
    active: unit.active !== undefined ? unit.active : true,
    created_at: unit.created_at || new Date().toISOString()
  };

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

/**
 * Exclui uma unidade
 */
export const deleteUnit = async (unitId: string): Promise<boolean> => {
  if (unitId === 'matriz') {
    throw new Error('A unidade Matriz não pode ser excluída.');
  }

  // 1. Atualiza lista local
  let currentList: Unit[] = [];
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_UNITS_KEY);
    if (raw) currentList = JSON.parse(raw);
  } catch {}

  const updatedList = currentList.filter(u => u.id !== unitId);

  try {
    localStorage.setItem(LOCAL_STORAGE_UNITS_KEY, JSON.stringify(updatedList));
  } catch {}

  // 2. Remove da tabela nativa se existir
  await deleteData('units', unitId).catch(() => {});

  // 3. Atualiza o registro redundante em nuvem
  await pushUnitsToCloudRegistry(updatedList);

  window.dispatchEvent(new CustomEvent('units-updated'));
  return true;
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
