import { Parish, ClergyLeity } from './index';

export type DioceseReportType = 'parishes_by_forania' | 'forania_summary' | 'clergy_directory' | 'parishes_cnpj_list';

export function formatCNPJ(value?: string | null): string {
  if (!value || !value.trim()) return 'Não informado';
  const clean = value.replace(/\D/g, '');
  if (clean.length === 14) {
    return clean.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  }
  return value;
}

export function getParishClergy(parish: Parish, clergyList: ClergyLeity[]) {
  const parishClergy = clergyList.filter(c => c.parish_id === parish.id);
  
  const priests = parishClergy.filter(c => c.role === 'pároco' || c.role === 'vigário');
  const deacons = parishClergy.filter(c => c.role === 'diácono');
  const others = parishClergy.filter(c => c.role !== 'pároco' && c.role !== 'vigário' && c.role !== 'diácono');
  
  let priestNames: { name: string; role: string }[] = [];
  if (priests.length > 0) {
    priestNames = priests.map(p => ({
      name: p.name.startsWith('Pe.') ? p.name : `Pe. ${p.name}`,
      role: p.role === 'pároco' ? 'Pároco' : 'Vigário Paroquial'
    }));
  } else if (parish.priest_name) {
    priestNames = [{
      name: parish.priest_name.startsWith('Pe.') ? parish.priest_name : `Pe. ${parish.priest_name}`,
      role: 'Pároco / Responsável'
    }];
  }

  let deaconNames: string[] = [];
  if (deacons.length > 0) {
    deaconNames = deacons.map(d => d.name.startsWith('Diác.') ? d.name : `Diác. ${d.name}`);
  }

  return {
    priests: priestNames,
    deacons: deaconNames,
    others
  };
}
