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
      const cachedProfileRaw = localStorage.getItem('current_user_profile');
      if (cachedProfileRaw) {
        try {
          const cachedProfile = JSON.parse(cachedProfileRaw);
          const cachedRestricted = getUserRestrictedUnit(cachedProfile);
          if (cachedRestricted) {
            localStorage.setItem('selected_global_unit_id', cachedRestricted);
            return cachedRestricted;
          }
          if (isTeacherProfileRole(cachedProfile)) {
            return 'all';
          }
          if (canUserSwitchUnit(cachedProfile)) {
            if (sessionStorage.getItem('just_logged_in') === 'true') {
              sessionStorage.removeItem('just_logged_in');
              localStorage.setItem('selected_global_unit_id', 'matriz');
              return 'matriz';
            }
            const sessionKey = `unit_session_init_${cachedProfile.id || cachedProfile.email || 'privileged_user'}`;
            if (sessionStorage.getItem(sessionKey) !== 'true') {
              sessionStorage.setItem(sessionKey, 'true');
              localStorage.setItem('selected_global_unit_id', 'matriz');
              return 'matriz';
            }
          }
        } catch {}
      }

      if (sessionStorage.getItem('just_logged_in') === 'true') {
        sessionStorage.removeItem('just_logged_in');
        try {
          localStorage.setItem('selected_global_unit_id', 'matriz');
        } catch {}
        return 'matriz';
      }

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

  // 2. Determina se o usuário possui restrição de unidade pelo seu cadastro:
  // - Se tiver uma unidade específica definida no cadastro -> estritamente restrito a essa unidade.
  // - Se estiver com acesso global ('all') -> sem restrição (null).
  const restrictedUnitId = useMemo(() => {
    return getUserRestrictedUnit(profile);
  }, [profile]);

  const isRestricted = Boolean(restrictedUnitId);

  // Sincroniza a unidade ativa a partir do cadastro do usuário ao autenticar
  useEffect(() => {
    if (!profile) return;

    if (restrictedUnitId) {
      // Usuário restrito a uma unidade específica: trava rigidamente na unidade do cadastro
      setSelectedUnitIdState(restrictedUnitId);
      try {
        localStorage.setItem('selected_global_unit_id', restrictedUnitId);
        sessionStorage.removeItem('just_logged_in');
      } catch {}
    } else if (canSwitchUnit) {
      // Usuário com acesso a todos os polos: inicia sessão na Matriz permitindo alternância livre
      const sessionKey = `unit_session_init_${profile.id || profile.email || 'privileged_user'}`;
      const isSessionInitialized = sessionStorage.getItem(sessionKey) === 'true';
      const justLoggedIn = sessionStorage.getItem('just_logged_in') === 'true';

      if (!isSessionInitialized || justLoggedIn) {
        setSelectedUnitIdState('matriz');
        try {
          localStorage.setItem('selected_global_unit_id', 'matriz');
          sessionStorage.setItem(sessionKey, 'true');
          sessionStorage.removeItem('just_logged_in');
        } catch {}
      }
    } else if (isTeacherUser) {
      // Docente com acesso global ('all'): mantém visão multi-polo das próprias turmas
      setSelectedUnitIdState('all');
      try {
        localStorage.setItem('selected_global_unit_id', 'all');
        sessionStorage.removeItem('just_logged_in');
      } catch {}
    }
  }, [profile, canSwitchUnit, restrictedUnitId, isTeacherUser]);

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
    // Somente usuários com acesso global ('all') podem alternar entre unidades
    if (restrictedUnitId || !canSwitchUnit) {
      console.warn('[UnitContext] Usuário restrito a uma unidade específica não pode alternar de polo.');
      return;
    }
    setSelectedUnitIdState(id);
    try {
      localStorage.setItem('selected_global_unit_id', id);
    } catch {}
  }, [canSwitchUnit, restrictedUnitId]);

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

    const rawResolved = getUnitNameHelper(units, effectiveSelectedUnitId);
    const resolvedName = (norm === 'matriz' && (!rawResolved || rawResolved === 'Sede / Matriz' || rawResolved === 'Sede - Matriz'))
      ? 'Matriz - Itapegica'
      : (rawResolved || (norm === 'matriz' ? 'Matriz - Itapegica' : effectiveSelectedUnitId));

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

