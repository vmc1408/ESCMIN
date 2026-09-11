import React from 'react';
import { AlertTriangle, ShieldAlert, Building2, Plus, ArrowRight } from 'lucide-react';
import { useUnits } from '../contexts/UnitContext';

export interface UnitConflictBannerProps {
  moduleName: string;
  entityNameSingular?: string;
  entityNamePlural?: string;
  totalRecordsAllUnits: number;
  recordsInActiveUnit: number;
  selectedItemUnit?: string;
  selectedItemName?: string;
  className?: string;
  onAddNewInActiveUnit?: () => void;
}

export const UnitConflictBanner: React.FC<UnitConflictBannerProps> = () => {
  return null;
};
