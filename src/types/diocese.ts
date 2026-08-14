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

export function getClergyRoleRank(role?: string | null): number {
  if (!role) return 99;
  const r = role.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  if (r.includes('bispo')) return 0;
  if (r === 'paroco' || r.startsWith('paroco')) return 1;
  if (r.includes('administrador')) return 2; // Administrador Paroquial
  if (r.includes('vigario') || r.includes('coadjutor')) return 3; // Vigário Paroquial / Coadjutor
  if (r.includes('diacono')) return 10; // Diácono
  return 4; // Outras funções sacerdotais
}

export function formatClergyRoleLabel(role?: string | null): string {
  if (!role || !role.trim()) return 'Sacerdote';
  const r = role.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  if (r === 'paroco' || r.startsWith('paroco')) return 'Pároco';
  if (r.includes('administrador')) return 'Administrador Paroquial';
  if (r.includes('vigario') || r.includes('coadjutor')) return 'Vigário Paroquial';
  if (r.includes('diacono')) return 'Diácono';
  return role.trim();
}

export function getParishClergy(parish: Parish, clergyList: ClergyLeity[]) {
  const parishClergy = clergyList.filter(c => c.parish_id === parish.id);
  
  const norm = (s?: string | null) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  const isDeacon = (c: ClergyLeity) => norm(c.role).includes('diacono');

  const priests = parishClergy.filter(c => !isDeacon(c));
  const deacons = parishClergy.filter(c => isDeacon(c));
  const others = parishClergy.filter(c => !priests.includes(c) && !deacons.includes(c));
  
  // Ordenação pela Hierarquia Canônica de Governo na Paróquia:
  // 1. Pároco (pastor próprio com estabilidade)
  // 2. Administrador Paroquial (mesmos deveres/direitos, transitório)
  // 3. Vigário Paroquial (padre coadjutor/auxiliar)
  // 4. Demais funções sacerdotais
  // Desempate: ordem alfabética por nome
  priests.sort((a, b) => {
    const rankA = getClergyRoleRank(a.role);
    const rankB = getClergyRoleRank(b.role);
    if (rankA !== rankB) return rankA - rankB;
    return a.name.localeCompare(b.name);
  });

  deacons.sort((a, b) => a.name.localeCompare(b.name));
  
  let priestNames: { name: string; role: string }[] = [];
  if (priests.length > 0) {
    priestNames = priests.map(p => ({
      name: p.name.startsWith('Pe.') || p.name.startsWith('Dom ') || p.name.startsWith('Mons.') ? p.name : `Pe. ${p.name}`,
      role: formatClergyRoleLabel(p.role)
    }));
  } else if (parish.priest_name) {
    priestNames = [{
      name: parish.priest_name.startsWith('Pe.') || parish.priest_name.startsWith('Dom ') || parish.priest_name.startsWith('Mons.') ? parish.priest_name : `Pe. ${parish.priest_name}`,
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
