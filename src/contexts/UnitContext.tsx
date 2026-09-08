import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { Unit } from '../types';
import { 
  getUnits, 
  getUnitName as getUnitNameHelper, 
  getUnitCode as getUnitCodeHelper,
  isItemInUnit,
  getUserRestrictedUnit
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
  refreshUnits: () => Promise<void>;
  getUnitName: (unitId?: string) => string;
  getUnitCode: (unitId?: string) => string;
  isItemInActiveUnit: (itemUnitId?: string) => boolean;
  filterByActiveUnit: <T>(items: T[], getUnitId: (item: T) => string | undefined) => T[];
}

const UnitContext = createContext<UnitContextType | undefined>(undefined);

export function UnitProvider({ children }: { children: React.ReactNode }) {
  const { profile } = useAuth();
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);

  // Determina se o usuário logado possui restrição estrita a uma única unidade/polo
  const restrictedUnitId = useMemo(() => {
    return getUserRestrictedUnit(profile);
  }, [profile]);

  const isRestricted = Boolean(restrictedUnitId);

  const [selectedUnitIdState, setSelectedUnitIdState] = useState<string>(() => {
    try {
      return localStorage.getItem('selected_global_unit_id') || 'all';
    } catch {
      return 'all';
    }
  });

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
    // Se o usuário for restrito a um polo, ignora tentativas de troca externa
    if (isRestricted) {
      console.warn('[UnitContext] Usuário possui permissão restrita à unidade:', restrictedUnitId);
      return;
    }
    setSelectedUnitIdState(id);
    try {
      localStorage.setItem('selected_global_unit_id', id);
    } catch {}
  }, [isRestricted, restrictedUnitId]);

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

    // Fallback gracioso: constrói um objeto de Unidade para que o nome e código nunca apareçam nulos
    const fallbackName = effectiveSelectedUnitId.includes(' ') 
      ? effectiveSelectedUnitId 
      : (effectiveSelectedUnitId.startsWith('unit_') ? 'Polo Educacional' : effectiveSelectedUnitId);

    return {
      id: effectiveSelectedUnitId,
      code: 'POLO',
      name: fallbackName,
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

