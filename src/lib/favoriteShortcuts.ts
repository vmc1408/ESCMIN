import { supabase, isSupabaseConfigured } from './supabase';
import {
  Users, 
  UserPlus, 
  UserSquare2, 
  School, 
  GraduationCap,
  BookOpen, 
  BookOpenCheck,
  FilePenLine,
  FileSpreadsheet, 
  FileCheck2,
  ClipboardCheck, 
  ClipboardList,
  CalendarCheck, 
  Calendar, 
  CalendarDays, 
  CalendarRange,
  SlidersHorizontal,
  Sparkles, 
  Settings, 
  Landmark,
  CircleDollarSign,
  BadgeDollarSign,
  QrCode,
  BarChart3, 
  Receipt,
  Printer, 
  MailCheck,
  IdCard,
  BadgeCheck,
  Tag, 
  Church, 
  ScrollText, 
  Database, 
  DatabaseBackup,
  Archive, 
  Upload,
  Contact,
  UserCircle
} from 'lucide-react';

// Capacidade operacional lógica da Barra de Acesso Rápido:
// ~11–13 atalhos por linha em notebooks (1366–1440px) e ~15–17 em monitores Full HD (1920px),
// permitindo até 20 atalhos distribuídos em até 2 linhas compactas sem poluir o Dashboard.
export const MAX_FAVORITES = 20;

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
    icon: GraduationCap,
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
  '/cadastros-relatorios': {
    path: '/cadastros-relatorios',
    label: 'Rel. Cadastrais',
    subtitle: 'Listagens A4',
    icon: ClipboardList,
    iconBg: 'bg-cyan-50 border border-cyan-200/80',
    iconColor: 'text-cyan-700'
  },
  '/assessments': {
    path: '/assessments',
    label: 'Cadastrar Avaliações',
    subtitle: 'Provas e trabalhos',
    icon: FilePenLine,
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
    icon: BookOpenCheck,
    iconBg: 'bg-blue-50 border border-blue-200/80',
    iconColor: 'text-blue-700'
  },
  '/documents': {
    path: '/documents',
    label: 'Certificados & Diplomas',
    subtitle: 'Emissão e registro',
    icon: BadgeCheck,
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
    icon: Contact,
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
    icon: CalendarRange,
    iconBg: 'bg-sky-50 border border-sky-200/80',
    iconColor: 'text-sky-700'
  },
  '/calendar?view=parameters': {
    path: '/calendar?view=parameters',
    label: 'Parâmetros Letivos',
    subtitle: 'Dias semanais e semestres',
    icon: SlidersHorizontal,
    iconBg: 'bg-slate-50 border border-slate-200/80',
    iconColor: 'text-slate-700'
  },
  '/calendar?view=annual': {
    path: '/calendar?view=annual',
    label: 'Calendário Anual',
    subtitle: 'Planejamento e homologação',
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
    icon: Landmark,
    iconBg: 'bg-emerald-50 border border-emerald-200/80',
    iconColor: 'text-emerald-700'
  },
  '/contributions': {
    path: '/contributions',
    label: 'Contribuições',
    subtitle: 'Mensalidades e taxas',
    icon: CircleDollarSign,
    iconBg: 'bg-violet-50 border border-violet-200/80',
    iconColor: 'text-violet-700'
  },
  '/financial-report': {
    path: '/financial-report',
    label: 'Rel. Financeiro',
    subtitle: 'Previsto vs Realizado',
    icon: BarChart3,
    iconBg: 'bg-emerald-50 border border-emerald-200/80',
    iconColor: 'text-emerald-700'
  },
  '/pix-conference': {
    path: '/pix-conference',
    label: 'Conferência Pix',
    subtitle: 'Comprovantes e lotes',
    icon: QrCode,
    iconBg: 'bg-cyan-50 border border-cyan-200/80',
    iconColor: 'text-cyan-700'
  },
  '/receipts': {
    path: '/receipts',
    label: 'Recibos',
    subtitle: 'Pagamentos avulsos',
    icon: Receipt,
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
    icon: MailCheck,
    iconBg: 'bg-sky-50 border border-sky-200/80',
    iconColor: 'text-sky-700'
  },
  '/impressos?type=ficha': {
    path: '/impressos?type=ficha',
    label: 'Ficha de Inscrição',
    subtitle: 'Impressão de matrículas',
    icon: UserCircle,
    iconBg: 'bg-rose-50 border border-rose-200/80',
    iconColor: 'text-rose-700'
  },
  '/impressos?type=declaracao': {
    path: '/impressos?type=declaracao',
    label: 'Declaração de Matrícula',
    subtitle: 'Comprovante acadêmico',
    icon: FileCheck2,
    iconBg: 'bg-blue-50 border border-blue-200/80',
    iconColor: 'text-blue-700'
  },
  '/impressos?type=carteirinhas': {
    path: '/impressos?type=carteirinhas',
    label: 'Etiqueta Carteirinha',
    subtitle: 'Identificação do aluno',
    icon: IdCard,
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
    label: 'Declaração Financeira',
    subtitle: 'Situação junto à tesouraria',
    icon: BadgeCheck,
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
    icon: ScrollText,
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
  '/settings?tab=financial': {
    path: '/settings?tab=financial',
    label: 'Config. Financeira',
    subtitle: 'Taxas e vencimentos',
    icon: BadgeDollarSign,
    iconBg: 'bg-emerald-50 border border-emerald-200/80',
    iconColor: 'text-emerald-700'
  },
  '/settings?tab=database': {
    path: '/settings?tab=database',
    label: 'Base de Dados & SQL',
    subtitle: 'Auditoria e scripts',
    icon: Database,
    iconBg: 'bg-indigo-50 border border-indigo-200/80',
    iconColor: 'text-indigo-700'
  },
  '/backup': {
    path: '/backup',
    label: 'Backup do Sistema',
    subtitle: 'Segurança de dados',
    icon: DatabaseBackup,
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

const LEGACY_STORAGE_KEY = 'escmin_favorite_shortcuts';
const EVENT_NAME = 'escmin-favorites-updated';

interface FavoriteUserContext {
  profileId: string;
  authUserId?: string;
  email?: string;
  isSwitched?: boolean;
}

let activeUserContext: FavoriteUserContext | null = null;
let activeFavoritesCache: string[] | null = null;
let lastLocalMutationAt = 0;
let lastServerFetchAt = 0;
let lastServerFetchProfileId: string | null = null;

function getUserStorageKey(profileId?: string | null): string {
  return profileId ? `${LEGACY_STORAGE_KEY}_user_${profileId}` : LEGACY_STORAGE_KEY;
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export function sanitizeFavoritePaths(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const seen = new Set<string>();
  const valid: string[] = [];
  for (const item of raw) {
    if (typeof item === 'string' && ALL_SHORTCUT_REGISTRY[item] && !seen.has(item)) {
      seen.add(item);
      valid.push(item);
      if (valid.length >= MAX_FAVORITES) break;
    }
  }
  return valid;
}

function readStoredPaths(key: string): string[] | null {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return null;
    return sanitizeFavoritePaths(JSON.parse(raw));
  } catch {
    return null;
  }
}

function writeLocalUserCache(paths: string[], profileId?: string | null): void {
  activeFavoritesCache = paths;
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    localStorage.setItem(getUserStorageKey(profileId), JSON.stringify(paths));
  } catch {}
}

function emitFavoritesUpdated(paths: string[]): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { favorites: paths } }));
}

async function persistFavoritesToCloud(paths: string[], ctx: FavoriteUserContext | null): Promise<boolean> {
  if (!isSupabaseConfigured || !ctx?.profileId) return false;
  let savedAnywhere = false;

  // 1. Persistência garantida na conta Supabase Auth (independe de alterações no schema SQL)
  if (!ctx.isSwitched) {
    try {
      const { error: authErr } = await supabase.auth.updateUser({
        data: { favorite_shortcuts: paths }
      });
      if (!authErr) {
        savedAnywhere = true;
      } else {
        console.warn('[favoriteShortcuts] Aviso ao salvar favoritos no Auth:', authErr.message);
      }
    } catch (err: any) {
      console.warn('[favoriteShortcuts] Erro ao salvar favoritos no Auth:', err?.message || err);
    }
  }

  // 2. Persistência complementar na tabela relacional public.users (se a coluna existir)
  try {
    const { error: dbErr } = await supabase
      .from('users')
      .update({ favorite_shortcuts: paths })
      .eq('id', ctx.profileId);

    if (!dbErr) {
      savedAnywhere = true;
    } else {
      const msg = (dbErr.message || '').toLowerCase();
      const isMissingCol =
        dbErr.code === '42703' ||
        dbErr.code === 'PGRST204' ||
        msg.includes('column') ||
        msg.includes('schema cache');
      if (!isMissingCol) {
        console.warn('[favoriteShortcuts] Aviso ao salvar favoritos na tabela users:', dbErr.message);
      }
    }
  } catch {}

  return savedAnywhere;
}

async function refreshFavoriteShortcutsFromServer(ctx: FavoriteUserContext): Promise<void> {
  if (!isSupabaseConfigured || ctx.isSwitched) return;
  const now = Date.now();
  if (lastServerFetchProfileId === ctx.profileId && now - lastServerFetchAt < 15000) {
    return;
  }
  lastServerFetchProfileId = ctx.profileId;
  lastServerFetchAt = now;

  try {
    const { data } = await supabase.auth.getUser();
    const serverUser = data?.user;
    if (!serverUser) return;
    if (!activeUserContext || activeUserContext.profileId !== ctx.profileId) return;
    if (Date.now() - lastLocalMutationAt < 4000) return;

    const serverFavorites = sanitizeFavoritePaths(serverUser.user_metadata?.favorite_shortcuts);
    if (serverFavorites !== null) {
      const current = activeFavoritesCache ?? getFavoritePaths();
      if (!arraysEqual(current, serverFavorites)) {
        writeLocalUserCache(serverFavorites, ctx.profileId);
        emitFavoritesUpdated(serverFavorites);
      }
    }
  } catch {}
}

export function syncFavoriteShortcutsForUser(options: {
  profileId: string;
  authUserId?: string;
  email?: string;
  isSwitched?: boolean;
  profileFavorites?: unknown;
  metadataFavorites?: unknown;
}): string[] {
  const ctx: FavoriteUserContext = {
    profileId: options.profileId,
    authUserId: options.authUserId,
    email: options.email,
    isSwitched: options.isSwitched
  };
  activeUserContext = ctx;

  const recentlyMutatedLocally = Date.now() - lastLocalMutationAt < 4000;
  const fromProfile = sanitizeFavoritePaths(options.profileFavorites);
  const fromMeta = !options.isSwitched ? sanitizeFavoritePaths(options.metadataFavorites) : null;
  const cloudFavorites = fromProfile ?? fromMeta;

  const userLocal = readStoredPaths(getUserStorageKey(ctx.profileId));
  const legacyLocal = readStoredPaths(LEGACY_STORAGE_KEY);

  let resolved: string[];
  let shouldUploadToCloud = false;

  if (recentlyMutatedLocally && activeFavoritesCache) {
    resolved = activeFavoritesCache;
  } else if (cloudFavorites !== null) {
    resolved = cloudFavorites;
    if (fromProfile === null && fromMeta !== null) {
      shouldUploadToCloud = true;
    }
  } else if (userLocal !== null) {
    resolved = userLocal;
    shouldUploadToCloud = true;
  } else if (legacyLocal !== null) {
    resolved = legacyLocal;
    shouldUploadToCloud = true;
  } else {
    resolved = DEFAULT_FAVORITE_PATHS;
  }

  const previous = activeFavoritesCache;
  writeLocalUserCache(resolved, ctx.profileId);

  if (!previous || !arraysEqual(previous, resolved)) {
    emitFavoritesUpdated(resolved);
  }

  if (shouldUploadToCloud) {
    void persistFavoritesToCloud(resolved, ctx).then((ok) => {
      if (ok && legacyLocal !== null && cloudFavorites === null) {
        try {
          localStorage.removeItem(LEGACY_STORAGE_KEY);
        } catch {}
      }
    });
  }

  if (!ctx.isSwitched && isSupabaseConfigured && !recentlyMutatedLocally) {
    void refreshFavoriteShortcutsFromServer(ctx);
  }

  return resolved;
}

export function clearFavoriteShortcutsSession(): void {
  activeUserContext = null;
  activeFavoritesCache = null;
  lastServerFetchAt = 0;
  lastServerFetchProfileId = null;
}

export function getFavoritePaths(): string[] {
  if (activeFavoritesCache) return activeFavoritesCache;
  if (activeUserContext?.profileId) {
    const userStored = readStoredPaths(getUserStorageKey(activeUserContext.profileId));
    if (userStored !== null) {
      activeFavoritesCache = userStored;
      return userStored;
    }
  }
  const legacyStored = readStoredPaths(LEGACY_STORAGE_KEY);
  if (legacyStored !== null) {
    return legacyStored;
  }
  return DEFAULT_FAVORITE_PATHS;
}

export function isFavoritePath(path: string): boolean {
  const current = getFavoritePaths();
  return current.includes(path);
}

export function toggleFavoritePath(path: string): {
  success: boolean;
  isFavorite: boolean;
  favorites: string[];
  message?: string;
} {
  const current = getFavoritePaths();
  const exists = current.includes(path);

  if (exists) {
    const next = current.filter(p => p !== path);
    lastLocalMutationAt = Date.now();
    writeLocalUserCache(next, activeUserContext?.profileId || null);
    emitFavoritesUpdated(next);
    void persistFavoritesToCloud(next, activeUserContext);
    return { success: true, isFavorite: false, favorites: next };
  }

  if (current.length >= MAX_FAVORITES) {
    return {
      success: false,
      isFavorite: false,
      favorites: current,
      message: `Limite operacional de ${MAX_FAVORITES} atalhos favoritos atingido. Desmarque um atalho antes de adicionar outro.`
    };
  }

  const next = [...current, path];
  lastLocalMutationAt = Date.now();
  writeLocalUserCache(next, activeUserContext?.profileId || null);
  emitFavoritesUpdated(next);
  void persistFavoritesToCloud(next, activeUserContext);
  return { success: true, isFavorite: true, favorites: next };
}

export function resetToDefaultFavorites(): string[] {
  lastLocalMutationAt = Date.now();
  writeLocalUserCache(DEFAULT_FAVORITE_PATHS, activeUserContext?.profileId || null);
  emitFavoritesUpdated(DEFAULT_FAVORITE_PATHS);
  void persistFavoritesToCloud(DEFAULT_FAVORITE_PATHS, activeUserContext);
  return DEFAULT_FAVORITE_PATHS;
}

export function subscribeToFavorites(callback: (paths: string[]) => void): () => void {
  if (typeof window === 'undefined') return () => {};
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
