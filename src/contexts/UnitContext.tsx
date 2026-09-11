import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { Unit } from '../types';
import { 
  getUnits, 
  getInitialUnitsFromCache,
  getUnitName as getUnitNameHelper, 
  getUnitCode as getUnitCodeHelper,
  isItemInUnit,
  getUserRestrictedUnit,
  canUserSwitchUnit,
  isTeacherProfileRole
} from '../lib/unitService';
import { useAuth } from './AuthContext';

interface UnitContextType {
  units: Unit[];
  activeUnits: Unit[];
  loading: boolean;
  selectedUnitId: string;
  setSelectedUnitId: (id: string) => void;
  selectedUnit: Unit | null;
  hasMultipleUnits: boolean;
  isRestricted: boolean;
  restrictedUnitId: string | null;
  canSwitchUnit: boolean;
  isTeacherUser: boolean;
  refreshUnits: () => Promise<void>;
  getUnitName: (unitId?: string) => string;
  getUnitCode: (unitId?: string) => string;
  isItemInActiveUnit: (itemUnitId?: string) => boolean;
  filterByActiveUnit: <T>(items: T[], getUnitId: (item: T) => string | undefined) => T[];
}

const UnitContext = createContext<UnitContextType | undefined>(undefined);

export function UnitProvider({ children }: { children: React.ReactNode }) {
  const { profile } = useAuth();
  const [units, setUnits] = useState<Unit[]>(() => getInitialUnitsFromCache());
  const [loading, setLoading] = useState(true);

  // 1. Permissão de Alternância:
  // Apenas usuários com níveis de administrador, diretor e secretário acadêmico podem alternar de unidade
  const canSwitchUnit = useMemo(() => {
    return canUserSwitchUnit(profile);
  }, [profile]);

  const isTeacherUser = useMemo(() => {
    return isTeacherProfileRole(profile);
  }, [profile]);

  const [selectedUnitIdState, setSelectedUnitIdState] = useState<string>(() => {
    try {
      return localStorage.getItem('selected_global_unit_id') || 'matriz';
    } catch {
      return 'matriz';
    }
  });

  // Sincroniza a unidade selecionada no armazenamento local
  useEffect(() => {
    const handleSyncUnit = () => {
      try {
        const stored = localStorage.getItem('selected_global_unit_id');
        if (stored && stored !== selectedUnitIdState) {
          setSelectedUnitIdState(stored);
        }
      } catch {}
    };

    window.addEventListener('units-updated', handleSyncUnit);
    window.addEventListener('storage', handleSyncUnit);
    return () => {
      window.removeEventListener('units-updated', handleSyncUnit);
      window.removeEventListener('storage', handleSyncUnit);
    };
  }, [selectedUnitIdState]);

  // 2. Determina se o usuário possui restrição de unidade pelo seu cadastro
  // Se canSwitchUnit for verdadeiro (admin, diretor, secretário acadêmico), o usuário pode alternar entre unidades.
  // Se canSwitchUnit for falso, o usuário fica estritamente restrito à unidade definida no seu cadastro (ou Matriz por padrão).
  const restrictedUnitId = useMemo(() => {
    if (canSwitchUnit) {
      return null;
    }
    const userUnit = getUserRestrictedUnit(profile);
    return userUnit || 'matriz';
  }, [canSwitchUnit, profile]);

  const isRestricted = Boolean(restrictedUnitId);

  // Sincroniza a unidade ativa a partir do cadastro do usuário ao autenticar
  useEffect(() => {
    if (!profile) return;
    const userUnit = profile.unit_id || (profile as any).unitId || (profile as any).unit || (profile as any).polo;
    const norm = (userUnit || '').trim().toLowerCase();
    const hasSpecificUnit = norm !== '' && norm !== 'all' && norm !== 'todas' && norm !== 'global';

    if (hasSpecificUnit) {
      // O usuário possui uma unidade específica definida em seu cadastro
      setSelectedUnitIdState(userUnit.trim());
      try {
        localStorage.setItem('selected_global_unit_id', userUnit.trim());
      } catch {}
    } else if (!canSwitchUnit) {
      // Usuário sem permissão de troca e sem unidade específica: cai na Matriz
      setSelectedUnitIdState('matriz');
      try {
        localStorage.setItem('selected_global_unit_id', 'matriz');
      } catch {}
    }
  }, [profile, canSwitchUnit]);

  // Se o usuário possuir restrição de unidade, a unidade ativa é rigidamente travada na unidade dele
  const effectiveSelectedUnitId = useMemo(() => {
    if (restrictedUnitId) {
      return restrictedUnitId;
    }
    return selectedUnitIdState;
  }, [restrictedUnitId, selectedUnitIdState]);

  const refreshUnits = useCallback(async () => {
    try {
      const data = await getUnits();
      setUnits(data);
    } catch (error) {
      console.error('[UnitContext] Erro ao carregar unidades:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUnits();

    const handleUpdate = () => {
      refreshUnits();
    };

    window.addEventListener('units-updated', handleUpdate);
    window.addEventListener('institution-updated', handleUpdate);
    return () => {
      window.removeEventListener('units-updated', handleUpdate);
      window.removeEventListener('institution-updated', handleUpdate);
    };
  }, [refreshUnits]);

  const setSelectedUnitId = useCallback((id: string) => {
    // Somente administradores, diretores e secretários acadêmicos podem alternar entre unidades
    if (!canSwitchUnit) {
      console.warn('[UnitContext] A alternância de unidades é restrita a administradores, diretores e secretários acadêmicos.');
      return;
    }
    setSelectedUnitIdState(id);
    try {
      localStorage.setItem('selected_global_unit_id', id);
    } catch {}
  }, [canSwitchUnit]);

  const activeUnits = useMemo(() => {
    return units.filter(u => u.active !== false);
  }, [units]);

  const hasMultipleUnits = useMemo(() => {
    return activeUnits.length > 1;
  }, [activeUnits]);

  const selectedUnit = useMemo(() => {
    if (!effectiveSelectedUnitId || effectiveSelectedUnitId === 'all') return null;
    const norm = effectiveSelectedUnitId.trim().toLowerCase();
    const found = units.find(u => 
      u.id.toLowerCase() === norm || 
      u.name?.toLowerCase() === norm || 
      u.code?.toLowerCase() === norm
    );
    if (found) return found;

    try {
      const cached = localStorage.getItem('db_fallback_units');
      if (cached) {
        const parsed: Unit[] = JSON.parse(cached);
        const cachedFound = parsed.find(u => 
          u.id.toLowerCase() === norm || 
          u.name?.toLowerCase() === norm || 
          u.code?.toLowerCase() === norm
        );
        if (cachedFound) return cachedFound;
      }
    } catch {}

    const resolvedName = getUnitNameHelper(units, effectiveSelectedUnitId);

    return {
      id: effectiveSelectedUnitId,
      code: getUnitCodeHelper(units, effectiveSelectedUnitId),
      name: resolvedName,
      is_main: norm === 'matriz',
      active: true,
      created_at: new Date().toISOString()
    } as Unit;
  }, [units, effectiveSelectedUnitId]);

  const getUnitName = useCallback((unitId?: string) => {
    return getUnitNameHelper(units, unitId);
  }, [units]);

  const getUnitCode = useCallback((unitId?: string) => {
    return getUnitCodeHelper(units, unitId);
  }, [units]);

  const isItemInActiveUnit = useCallback((itemUnitId?: string) => {
    return isItemInUnit(itemUnitId, effectiveSelectedUnitId, units);
  }, [effectiveSelectedUnitId, units]);

  const filterByActiveUnit = useCallback(<T,>(items: T[], getUnitId: (item: T) => string | undefined): T[] => {
    if (!effectiveSelectedUnitId || effectiveSelectedUnitId === 'all') return items;
    return items.filter(item => isItemInUnit(getUnitId(item), effectiveSelectedUnitId, units));
  }, [effectiveSelectedUnitId, units]);

  return (
    <UnitContext.Provider
      value={{
        units,
        activeUnits,
        loading,
        selectedUnitId: effectiveSelectedUnitId,
        setSelectedUnitId,
        selectedUnit,
        hasMultipleUnits,
        isRestricted,
        restrictedUnitId,
        canSwitchUnit,
        isTeacherUser,
        refreshUnits,
        getUnitName,
        getUnitCode,
        isItemInActiveUnit,
        filterByActiveUnit
      }}
    >
      {children}
    </UnitContext.Provider>
  );
}

export function useUnits() {
  const context = useContext(UnitContext);
  if (!context) {
    throw new Error('useUnits must be used within a UnitProvider');
  }
  return context;
}

