import { 
  Users, 
  UserPlus, 
  UserSquare2, 
  School, 
  BookOpen, 
  FileText, 
  FileSpreadsheet, 
  FileCheck, 
  ClipboardCheck, 
  CalendarCheck, 
  Calendar, 
  CalendarDays, 
  Sparkles, 
  Settings, 
  Wallet, 
  CreditCard, 
  BarChart3, 
  DollarSign, 
  Printer, 
  User, 
  Tag, 
  Church, 
  Scroll, 
  Database, 
  Archive, 
  Upload,
  UserCircle
} from 'lucide-react';

export const MAX_FAVORITES = 10;

export interface ShortcutItem {
  path: string;
  label: string;
  subtitle: string;
  icon: any;
  iconBg: string;
  iconColor: string;
  state?: any;
}

export const ALL_SHORTCUT_REGISTRY: Record<string, ShortcutItem> = {
  '/students': {
    path: '/students',
    label: 'Matricular Aluno',
    subtitle: 'Novo aluno',
    icon: UserPlus,
    iconBg: 'bg-blue-50 border border-blue-200/80',
    iconColor: 'text-blue-700',
    state: { action: 'new' }
  },
  '/teachers': {
    path: '/teachers',
    label: 'Professores',
    subtitle: 'Corpo docente',
    icon: UserSquare2,
    iconBg: 'bg-indigo-50 border border-indigo-200/80',
    iconColor: 'text-indigo-700'
  },
  '/courses': {
    path: '/courses',
    label: 'Cursos',
    subtitle: 'Programas de ensino',
    icon: School,
    iconBg: 'bg-violet-50 border border-violet-200/80',
    iconColor: 'text-violet-700'
  },
  '/classes': {
    path: '/classes',
    label: 'Turmas / Classes',
    subtitle: 'Gestão escolar',
    icon: School,
    iconBg: 'bg-emerald-50 border border-emerald-200/80',
    iconColor: 'text-emerald-700'
  },
  '/subjects': {
    path: '/subjects',
    label: 'Disciplinas',
    subtitle: 'Grade curricular',
    icon: BookOpen,
    iconBg: 'bg-teal-50 border border-teal-200/80',
    iconColor: 'text-teal-700'
  },
  '/assessments': {
    path: '/assessments',
    label: 'Cadastrar Avaliações',
    subtitle: 'Provas e trabalhos',
    icon: FileText,
    iconBg: 'bg-amber-50 border border-amber-200/80',
    iconColor: 'text-amber-700'
  },
  '/grades': {
    path: '/grades',
    label: 'Apontamento de Notas',
    subtitle: 'Médias e notas',
    icon: FileSpreadsheet,
    iconBg: 'bg-indigo-50 border border-indigo-200/80',
    iconColor: 'text-indigo-700'
  },
  '/bulletin': {
    path: '/bulletin',
    label: 'Boletim de Notas',
    subtitle: 'Desempenho acadêmico',
    icon: FileText,
    iconBg: 'bg-blue-50 border border-blue-200/80',
    iconColor: 'text-blue-700'
  },
  '/documents': {
    path: '/documents',
    label: 'Certificados & Diplomas',
    subtitle: 'Emissão e registro',
    icon: FileCheck,
    iconBg: 'bg-purple-50 border border-purple-200/80',
    iconColor: 'text-purple-700'
  },
  '/attendance': {
    path: '/attendance',
    label: 'Lançar Chamada',
    subtitle: 'Frequência diária',
    icon: ClipboardCheck,
    iconBg: 'bg-emerald-50 border border-emerald-200/80',
    iconColor: 'text-emerald-700'
  },
  '/monthly-attendance': {
    path: '/monthly-attendance',
    label: 'Lista de Chamada',
    subtitle: 'Controle mensal',
    icon: CalendarCheck,
    iconBg: 'bg-blue-50 border border-blue-200/80',
    iconColor: 'text-blue-700'
  },
  '/student-ficha': {
    path: '/student-ficha',
    label: 'Controle e Histórico',
    subtitle: 'Ficha acadêmica',
    icon: UserCircle,
    iconBg: 'bg-rose-50 border border-rose-200/80',
    iconColor: 'text-rose-700'
  },
  '/calendar?view=month': {
    path: '/calendar?view=month',
    label: 'Calendário Letivo',
    subtitle: 'Cronograma',
    icon: Calendar,
    iconBg: 'bg-amber-50 border border-amber-200/80',
    iconColor: 'text-amber-700'
  },
  '/calendar?view=management': {
    path: '/calendar?view=management',
    label: 'Grade Acadêmica',
    subtitle: 'Horários e turmas',
    icon: FileText,
    iconBg: 'bg-sky-50 border border-sky-200/80',
    iconColor: 'text-sky-700'
  },
  '/calendar?view=parameters': {
    path: '/calendar?view=parameters',
    label: 'Parâmetros Letivos',
    subtitle: 'Semestres e datas',
    icon: Settings,
    iconBg: 'bg-slate-50 border border-slate-200/80',
    iconColor: 'text-slate-700'
  },
  '/calendar?view=annual': {
    path: '/calendar?view=annual',
    label: 'Calendário Anual',
    subtitle: 'Visão do ano',
    icon: CalendarDays,
    iconBg: 'bg-orange-50 border border-orange-200/80',
    iconColor: 'text-orange-700'
  },
  '/calendar?view=habilitation': {
    path: '/calendar?view=habilitation',
    label: 'Habilitações',
    subtitle: 'Liberações de turmas',
    icon: Sparkles,
    iconBg: 'bg-yellow-50 border border-yellow-200/80',
    iconColor: 'text-yellow-700'
  },
  '/financial': {
    path: '/financial',
    label: 'Dashboard Financeiro',
    subtitle: 'Visão gerencial',
    icon: Wallet,
    iconBg: 'bg-emerald-50 border border-emerald-200/80',
    iconColor: 'text-emerald-700'
  },
  '/contributions': {
    path: '/contributions',
    label: 'Contribuições',
    subtitle: 'Mensalidades e taxas',
    icon: Wallet,
    iconBg: 'bg-violet-50 border border-violet-200/80',
    iconColor: 'text-violet-700'
  },
  '/financial-report': {
    path: '/financial-report',
    label: 'Rel. Financeiro',
    subtitle: 'Previsto vs Realizado',
    icon: DollarSign,
    iconBg: 'bg-emerald-50 border border-emerald-200/80',
    iconColor: 'text-emerald-700'
  },
  '/pix-conference': {
    path: '/pix-conference',
    label: 'Conferência Pix',
    subtitle: 'Comprovantes e lotes',
    icon: CreditCard,
    iconBg: 'bg-cyan-50 border border-cyan-200/80',
    iconColor: 'text-cyan-700'
  },
  '/receipts': {
    path: '/receipts',
    label: 'Recibos',
    subtitle: 'Pagamentos avulsos',
    icon: FileText,
    iconBg: 'bg-slate-50 border border-slate-200/80',
    iconColor: 'text-slate-700'
  },
  '/impressos': {
    path: '/impressos',
    label: 'Gerar Impressos',
    subtitle: 'Relatórios e listas',
    icon: Printer,
    iconBg: 'bg-sky-50 border border-sky-200/80',
    iconColor: 'text-sky-700'
  },
  '/impressos?type=carta': {
    path: '/impressos?type=carta',
    label: 'Carta Apresentação',
    subtitle: 'Documentos eclesiásticos',
    icon: FileText,
    iconBg: 'bg-sky-50 border border-sky-200/80',
    iconColor: 'text-sky-700'
  },
  '/impressos?type=ficha': {
    path: '/impressos?type=ficha',
    label: 'Ficha de Inscrição',
    subtitle: 'Impressão de matrículas',
    icon: User,
    iconBg: 'bg-rose-50 border border-rose-200/80',
    iconColor: 'text-rose-700'
  },
  '/impressos?type=declaracao': {
    path: '/impressos?type=declaracao',
    label: 'Declaração de Matrícula',
    subtitle: 'Comprovante acadêmico',
    icon: FileText,
    iconBg: 'bg-blue-50 border border-blue-200/80',
    iconColor: 'text-blue-700'
  },
  '/impressos?type=carteirinhas': {
    path: '/impressos?type=carteirinhas',
    label: 'Etiqueta Carteirinha',
    subtitle: 'Identificação do aluno',
    icon: CreditCard,
    iconBg: 'bg-teal-50 border border-teal-200/80',
    iconColor: 'text-teal-700'
  },
  '/impressos?type=etiquetas': {
    path: '/impressos?type=etiquetas',
    label: 'Etiquetas de Endereço',
    subtitle: 'Correspondência',
    icon: Tag,
    iconBg: 'bg-amber-50 border border-amber-200/80',
    iconColor: 'text-amber-700'
  },
  '/impressos?type=quitacao': {
    path: '/impressos?type=quitacao',
    label: 'Certidão de Quitação',
    subtitle: 'Declaração financeira',
    icon: FileCheck,
    iconBg: 'bg-emerald-50 border border-emerald-200/80',
    iconColor: 'text-emerald-700'
  },
  '/parishes?view=management': {
    path: '/parishes?view=management',
    label: 'Gestão da Diocese',
    subtitle: 'Paróquias e padres',
    icon: Church,
    iconBg: 'bg-amber-50 border border-amber-200/80',
    iconColor: 'text-amber-700'
  },
  '/parishes?view=reports': {
    path: '/parishes?view=reports',
    label: 'Relatórios da Diocese',
    subtitle: 'Guias e impressos',
    icon: Scroll,
    iconBg: 'bg-amber-50 border border-amber-200/80',
    iconColor: 'text-amber-700'
  },
  '/users': {
    path: '/users',
    label: 'Usuários',
    subtitle: 'Acesso e perfis',
    icon: Users,
    iconBg: 'bg-slate-50 border border-slate-200/80',
    iconColor: 'text-slate-700'
  },
  '/settings': {
    path: '/settings',
    label: 'Configurações',
    subtitle: 'Parâmetros do sistema',
    icon: Settings,
    iconBg: 'bg-slate-50 border border-slate-200/80',
    iconColor: 'text-slate-700'
  },
  '/backup': {
    path: '/backup',
    label: 'Backup do Sistema',
    subtitle: 'Segurança de dados',
    icon: Database,
    iconBg: 'bg-blue-50 border border-blue-200/80',
    iconColor: 'text-blue-700'
  },
  '/import': {
    path: '/import',
    label: 'Importação',
    subtitle: 'Carga de planilhas',
    icon: Upload,
    iconBg: 'bg-purple-50 border border-purple-200/80',
    iconColor: 'text-purple-700'
  },
  '/archive': {
    path: '/archive',
    label: 'Arquivo Morto',
    subtitle: 'Registros inativos',
    icon: Archive,
    iconBg: 'bg-slate-50 border border-slate-200/80',
    iconColor: 'text-slate-700'
  }
};

export const DEFAULT_FAVORITE_PATHS = [
  '/students',
  '/student-ficha',
  '/impressos',
  '/classes',
  '/attendance',
  '/calendar?view=month',
  '/contributions',
  '/financial-report'
];

const STORAGE_KEY = 'escmin_favorite_shortcuts';
const EVENT_NAME = 'escmin-favorites-updated';

export function getFavoritePaths(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_FAVORITE_PATHS;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed.slice(0, MAX_FAVORITES);
    }
    return DEFAULT_FAVORITE_PATHS;
  } catch {
    return DEFAULT_FAVORITE_PATHS;
  }
}

export function isFavoritePath(path: string): boolean {
  const current = getFavoritePaths();
  return current.includes(path);
}

export function toggleFavoritePath(path: string): { 
  success: boolean; 
  isFavorite: boolean; 
  favorites: string[];
  message?: string 
} {
  const current = getFavoritePaths();
  const exists = current.includes(path);

  if (exists) {
    const next = current.filter(p => p !== path);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {}
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { favorites: next } }));
    return { success: true, isFavorite: false, favorites: next };
  }

  if (current.length >= MAX_FAVORITES) {
    return { 
      success: false, 
      isFavorite: false, 
      favorites: current,
      message: `Limite de ${MAX_FAVORITES} atalhos favoritos atingido. Desmarque um atalho antes de adicionar outro.` 
    };
  }

  const next = [...current, path];
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {}
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { favorites: next } }));
  return { success: true, isFavorite: true, favorites: next };
}

export function resetToDefaultFavorites(): string[] {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_FAVORITE_PATHS));
  } catch {}
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { favorites: DEFAULT_FAVORITE_PATHS } }));
  return DEFAULT_FAVORITE_PATHS;
}

export function subscribeToFavorites(callback: (paths: string[]) => void): () => void {
  const handler = (e: any) => {
    if (e.detail?.favorites) {
      callback(e.detail.favorites);
    } else {
      callback(getFavoritePaths());
    }
  };
  window.addEventListener(EVENT_NAME, handler);
  return () => window.removeEventListener(EVENT_NAME, handler);
}
