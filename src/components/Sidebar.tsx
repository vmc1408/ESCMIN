import React, { useCallback, useEffect, useRef, useState } from 'react';
import { 
  Upload as ImportIcon, 
  Users as StudentsIcon,
  UserSquare2 as TeachersIcon,
  School as ClassesIcon,
  BookOpen as SubjectsIcon,
  BarChart3 as ReportsIcon, 
  Settings as SettingsIcon, 
  CreditCard as PixIcon,
  Activity as StatusIcon,
  CheckCircle2 as OnlineIcon,
  AlertCircle as OfflineIcon,
  LogOut as LogoutIcon,
  User as UserIcon,
  UserSquare2 as UserManagementIcon,
  Calendar as CalendarIcon,
  ClipboardCheck as AttendanceIcon,
  FileSpreadsheet as GradesIcon,
  FileCheck as CertificateIcon,
  CalendarCheck,
  ChevronDown,
  ChevronRight,
  Database,
  GraduationCap,
  Wallet,
  Church,
  XCircle,
  FileText,
  Lock,
  Printer,
  Scroll,
  Tag,
  Archive as ArchiveIcon,
  Sparkles,
  DollarSign,
  CalendarDays,
  Star
} from 'lucide-react';
import { cn } from '../lib/utils';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { getInstitutionSettings } from '../lib/database';
import { motion, AnimatePresence } from 'motion/react';
import { getFavoritePaths, toggleFavoritePath, subscribeToFavorites } from '../lib/favoriteShortcuts';

import { useAuth } from '../contexts/AuthContext';
import { SidebarUnitSwitcher } from './SidebarUnitSwitcher';

const navItems = [
  {
    label: 'Gestão Escolar',
    isSectionTitle: true,
    children: [
      {
        label: 'Cadastros',
        icon: GraduationCap,
        tooltip: 'Cadastros acadêmicos de alunos, docentes, cursos, turmas, disciplinas e listagens',
        children: [
          { icon: StudentsIcon, label: 'Alunos', path: '/students', tooltip: 'Cadastrar, editar e consultar fichas e matrículas de alunos' },
          { icon: TeachersIcon, label: 'Professores', path: '/teachers', tooltip: 'Gerenciar cadastro de professores e atribuições docentes' },
          { icon: GraduationCap, label: 'Cursos', path: '/courses', tooltip: 'Configurar cursos, grades curriculares e cargas horárias' },
          { icon: ClassesIcon, label: 'Turmas', path: '/classes', tooltip: 'Organizar turmas, polos, períodos letivos e vagas' },
          { icon: SubjectsIcon, label: 'Disciplinas', path: '/subjects', tooltip: 'Gerenciar matérias, ementas e vínculos por curso' },
          { icon: FileText, label: 'Relatórios', path: '/cadastros-relatorios', tooltip: 'Gerar listagens e relatórios cadastrais padronizados em A4' },
        ]
      },
      { 
        label: 'Avaliações',
        icon: GradesIcon,
        tooltip: 'Gestão de avaliações, lançamento de notas, boletins e certificações',
        children: [
          { icon: FileText, label: 'Cadastrar Avaliação', path: '/assessments', tooltip: 'Criar e programar provas, trabalhos e atividades avaliativas' },
          { icon: GradesIcon, label: 'Apontamento de Notas', path: '/grades', tooltip: 'Lançar e atualizar notas dos alunos por turma e disciplina' },
          { icon: FileText, label: 'Boletim de Notas', path: '/bulletin', tooltip: 'Consultar e imprimir boletins individuais de desempenho' },
          { icon: CertificateIcon, label: 'Certificados e Diplomas', path: '/documents', tooltip: 'Emitir certificados de conclusão, diplomas e declarações' },
        ]
      },
      {
        label: 'Frequência',
        icon: CalendarCheck,
        tooltip: 'Registro diário de presença, listas mensais e histórico do aluno',
        children: [
          { icon: AttendanceIcon, label: 'Chamada', path: '/attendance', tooltip: 'Registrar presença e faltas dos alunos por aula ou data' },
          { icon: CalendarCheck, label: 'Lista de Chamada', path: '/monthly-attendance', tooltip: 'Visualizar e imprimir pautas mensais de frequência por turma' },
          { icon: UserIcon, label: 'Controle e Histórico', path: '/student-ficha', tooltip: 'Consultar ficha acadêmica completa, frequência e ocorrências do aluno' },
        ]
      },
      {
        label: 'Cronograma',
        icon: CalendarIcon,
        tooltip: 'Planejamento letivo, calendário de aulas, feriados e habilitações',
        children: [
          { icon: CalendarIcon, label: 'Calendário', path: '/calendar?view=month', tooltip: 'Visualizar e gerenciar eventos e aulas no calendário mensal' },
          { icon: FileText, label: 'Grade Acadêmica', path: '/calendar?view=management', tooltip: 'Acompanhar o cronograma de aulas e progresso por turma' },
          { icon: SettingsIcon, label: 'Parâmetros', path: '/calendar?view=parameters', tooltip: 'Definir dias letivos, feriados e regras gerais do calendário' },
          { icon: CalendarDays, label: 'Calendário Anual', path: '/calendar?view=annual', tooltip: 'Visão anual completa de aulas, recessos e datas diocesanas' },
          { icon: Sparkles, label: 'Habilitação', path: '/calendar?view=habilitation', tooltip: 'Habilitar turmas e ciclos para novos períodos letivos' },
        ]
      },
      {
        label: 'Financeiro',
        icon: Wallet,
        path: '/financial',
        tooltip: 'Abrir o painel financeiro e acessar lançamentos, Pix e recibos',
        children: [
          { icon: PixIcon, label: 'Contribuições', path: '/contributions', tooltip: 'Lançar e controlar mensalidades, taxas de matrícula e pagamentos' },
          { icon: ReportsIcon, label: 'Relatório Financeiro', path: '/financial-report', tooltip: 'Analisar previsto versus realizado, inadimplência e extratos' },
          { icon: PixIcon, label: 'Conferência Pix', path: '/pix-conference', tooltip: 'Conciliar extratos bancários e comprovantes Pix com alunos' },
          { icon: CertificateIcon, label: 'Certidão de Quitação', path: '/impressos?type=quitacao', tooltip: 'Emitir certidão negativa de débitos e quitação financeira' },
          { icon: FileText, label: 'Recibos', path: '/receipts', tooltip: 'Consultar, reimprimir e gerenciar recibos financeiros emitidos' },
        ]
      },
      {
        label: 'Impressos',
        icon: Printer,
        tooltip: 'Central de documentos oficiais, declarações, carteirinhas e etiquetas',
        children: [
          { icon: FileText, label: 'Carta de Apresentação', path: '/impressos?type=carta', tooltip: 'Emitir carta oficial de apresentação do aluno ou ministro' },
          { icon: UserIcon, label: 'Ficha de Inscrição', path: '/impressos?type=ficha', tooltip: 'Imprimir ficha cadastral de inscrição para matrícula' },
          { icon: FileText, label: 'Declaração de Matrícula', path: '/impressos?type=declaracao', tooltip: 'Gerar declaração oficial de vínculo e matrícula ativa' },
          { icon: PixIcon, label: 'Etiqueta para Carteirinha', path: '/impressos?type=carteirinhas', tooltip: 'Imprimir carteirinhas estudantis no padrão Pimaco 6183' },
          { icon: Tag, label: 'Etiquetas de Endereço', path: '/impressos?type=etiquetas', tooltip: 'Gerar etiquetas postais e de identificação no padrão Pimaco 6180' },
        ]
      },
    ]
  },
  {
    label: 'Administração & Diocese',
    isSectionTitle: true,
    hideTitle: true,
    children: [
      {
        label: 'Guia Diocesano',
        icon: Church,
        dividerAfter: true,
        tooltip: 'Cadastro e relatórios de paróquias, regiões pastorais e clero',
        children: [
          { icon: Scroll, label: 'Gestão da Diocese', path: '/parishes?view=management', tooltip: 'Gerenciar paróquias, comunidades, padres e regiões diocesanas' },
          { icon: Printer, label: 'Relatórios e Impressão', path: '/parishes?view=reports', tooltip: 'Gerar e imprimir catálogos e listagens da diocese' },
        ]
      },
      { 
        label: 'Configurações', 
        icon: SettingsIcon,
        tooltip: 'Parâmetros institucionais, usuários, backup, importação e arquivo morto',
        children: [
          { icon: UserManagementIcon, label: 'Usuários', path: '/users', tooltip: 'Gerenciar contas de acesso, perfis e permissões por módulo' },
          { icon: Database, label: 'Backup', path: '/backup', tooltip: 'Gerar cópias de segurança e restaurar dados do sistema' },
          { icon: SettingsIcon, label: 'Geral', path: '/settings', tooltip: 'Dados da instituição, logotipo, normas e parâmetros gerais' },
          { icon: DollarSign, label: 'Financeiro', path: '/settings?tab=financial', tooltip: 'Valores de mensalidades, matrícula, vencimentos e chave Pix' },
          { icon: Database, label: 'Base de Dados & SQL', path: '/settings?tab=database', tooltip: 'Conexão com o banco de dados, diagnósticos e manutenção' },
          { icon: ImportIcon, label: 'Importação', path: '/import', tooltip: 'Importar alunos e registros em lote via planilhas' },
          { icon: ArchiveIcon, label: 'Arquivo Morto', path: '/archive', tooltip: 'Consultar registros arquivados e históricos inativos' },
        ]
      },
    ]
  },
];

import { supabase, isSupabaseConfigured, lastLatency, testConnection, isDbConnected } from '../lib/supabase';
import { financialService } from '../services/financialService';

export function Sidebar({ onClose }: { onClose?: () => void }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { profile, logout, canAccess, isAdmin, lock, latency: authLatency, isConnected } = useAuth();

  const [dbStatus, setDbStatus] = useState<'checking' | 'online' | 'offline'>(
    isDbConnected || isConnected ? 'online' : 'checking'
  );
  const [latency, setLatency] = useState<number | null>(() => authLatency ?? lastLatency ?? null);

  useEffect(() => {
    if (authLatency !== null && authLatency !== undefined) {
      setLatency(authLatency);
    }
  }, [authLatency]);

  // Filter items based on access without modifying original objects
  const filterByAccess = (items: any[]): any[] => {
    return items
      .filter(item => {
        if (item.requiredRole && item.requiredRole === 'admin' && !isAdmin) return false;
        if (item.path && !canAccess(item.path.split('?')[0])) return false;
        return true;
      })
      .map(item => {
        if (item.children) {
          return { ...item, children: filterByAccess(item.children) };
        }
        return { ...item };
      })
      .filter(item => {
        // If it was a group (had children), only keep it if children remain
        if (items.find(original => original.label === item.label)?.children && (!item.children || item.children.length === 0)) {
          return false;
        }
        return true;
      });
  };

  const filteredNavItems = filterByAccess(navItems);

  useEffect(() => {
    testConnection();

    const handleStatusChange = (e: any) => {
      if (e?.detail) {
        setDbStatus(e.detail.connected ? 'online' : 'offline');
        if (e.detail.latency !== undefined && e.detail.latency !== null) {
          setLatency(e.detail.latency);
        }
      }
    };

    window.addEventListener('supabase-status-change', handleStatusChange);

    // Regular status check - every 60 seconds
    const interval = setInterval(() => {
      testConnection();
    }, 60000);

    return () => {
      window.removeEventListener('supabase-status-change', handleStatusChange);
      clearInterval(interval);
    };
  }, []);

  // Gerenciamento de Atalhos Favoritos (conectado ao Acesso Rápido do Dashboard)
  const [favorites, setFavorites] = useState<string[]>(() => getFavoritePaths());
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    return subscribeToFavorites((paths) => {
      setFavorites(paths);
    });
  }, []);

  const handleToggleFavorite = (path: string) => {
    const res = toggleFavoritePath(path);
    if (!res.success && res.message) {
      setNotice(res.message);
      setTimeout(() => setNotice(null), 4000);
    }
  };

  const [openGroups, setOpenGroups] = useState<string[]>([]);
  const openGroupsRef = useRef<string[]>(openGroups);
  openGroupsRef.current = openGroups;
  const navRef = useRef<HTMLElement>(null);
  const groupRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const pendingScrollGroupRef = useRef<string | null>(null);
  const scrollFallbackTimerRef = useRef<number | null>(null);

  const setGroupRef = useCallback((label: string) => (el: HTMLDivElement | null) => {
    if (el) {
      groupRefs.current.set(label, el);
    } else {
      groupRefs.current.delete(label);
    }
  }, []);

  const scrollGroupIntoView = useCallback((label: string) => {
    const navEl = navRef.current;
    const groupEl = groupRefs.current.get(label);
    if (!navEl || !groupEl) return;

    const navRect = navEl.getBoundingClientRect();
    const groupRect = groupEl.getBoundingClientRect();
    const topPadding = 8;
    const bottomPadding = 12;

    if (groupRect.height <= navRect.height - (topPadding + bottomPadding)) {
      if (groupRect.bottom > navRect.bottom - bottomPadding) {
        const neededScroll = groupRect.bottom - (navRect.bottom - bottomPadding);
        const maxSafeScroll = Math.max(0, groupRect.top - (navRect.top + topPadding));
        const delta = Math.min(neededScroll, maxSafeScroll);
        if (delta > 2) {
          navEl.scrollTo({
            top: navEl.scrollTop + delta,
            behavior: 'smooth',
          });
        }
      } else if (groupRect.top < navRect.top + topPadding) {
        const delta = groupRect.top - (navRect.top + topPadding);
        navEl.scrollTo({
          top: Math.max(0, navEl.scrollTop + delta),
          behavior: 'smooth',
        });
      }
    } else {
      // Group taller than sidebar viewport: align its header near the top so expanded items are visible
      const delta = groupRect.top - (navRect.top + topPadding);
      if (Math.abs(delta) > 4) {
        navEl.scrollTo({
          top: Math.max(0, navEl.scrollTop + delta),
          behavior: 'smooth',
        });
      }
    }
  }, []);

  const triggerScrollForGroup = useCallback((label: string) => {
    pendingScrollGroupRef.current = label;
    if (scrollFallbackTimerRef.current !== null) {
      window.clearTimeout(scrollFallbackTimerRef.current);
    }
    scrollFallbackTimerRef.current = window.setTimeout(() => {
      if (pendingScrollGroupRef.current === label) {
        pendingScrollGroupRef.current = null;
        scrollFallbackTimerRef.current = null;
        scrollGroupIntoView(label);
      }
    }, 250);
  }, [scrollGroupIntoView]);

  useEffect(() => {
    return () => {
      if (scrollFallbackTimerRef.current !== null) {
        window.clearTimeout(scrollFallbackTimerRef.current);
      }
    };
  }, []);

  const findGroupChain = useCallback((items: any[], targetLabel: string, ancestors: string[] = []): string[] | null => {
    for (const item of items) {
      if (item.isSectionTitle) {
        const found = findGroupChain(item.children || [], targetLabel, ancestors);
        if (found) return found;
      } else if (item.children && item.children.length > 0) {
        const nextChain = [...ancestors, item.label];
        if (item.label === targetLabel) return nextChain;
        const found = findGroupChain(item.children, targetLabel, nextChain);
        if (found) return found;
      }
    }
    return null;
  }, []);

  const toggleGroup = (label: string) => {
    const isCurrentlyOpen = openGroups.includes(label);
    if (!isCurrentlyOpen) {
      triggerScrollForGroup(label);
      const nextChain = findGroupChain(filteredNavItems, label) || [label];
      setOpenGroups(nextChain);
    } else {
      if (pendingScrollGroupRef.current === label) {
        pendingScrollGroupRef.current = null;
        if (scrollFallbackTimerRef.current !== null) {
          window.clearTimeout(scrollFallbackTimerRef.current);
          scrollFallbackTimerRef.current = null;
        }
      }
      setOpenGroups(prev => prev.filter(g => g !== label));
    }
  };

  const isPathActive = (path: string) => {
    if (path.includes('?')) {
      const [pathname, search] = path.split('?');
      if (location.pathname === pathname) {
        const currentSearch = location.search.replace('?', '');
        if (search === 'view=month' && !currentSearch) {
          return true; // monthly calendar is active if no query parameter
        }
        if (search === 'view=management' && (!currentSearch || currentSearch === 'view=management')) {
          return true; // default diocese management is active if no query parameter
        }
        if (search === 'type=declaracao' && !currentSearch) {
          return true; // default impressos page is active if no query parameter
        }
        return currentSearch === search;
      }
      return false;
    }
    
    // For exact match with /settings when there are tab query params
    if (path === '/settings' && location.pathname === '/settings') {
      const params = new URLSearchParams(location.search);
      const tab = params.get('tab');
      return !tab || tab === 'institution';
    }

    if (path === '/parishes' && location.pathname === '/parishes') {
      const params = new URLSearchParams(location.search);
      const view = params.get('view');
      return !view || view === 'management';
    }

    return location.pathname === path;
  };

  // Synchronize and auto-collapse non-active submenus when a route is selected
  useEffect(() => {
    const activeAncestors: string[] = [];

    const findAncestors = (items: any[], currentPathAncestors: string[] = []): boolean => {
      for (const item of items) {
        if (item.path && isPathActive(item.path)) {
          activeAncestors.push(...currentPathAncestors);
          if (item.children && item.children.length > 0) {
            activeAncestors.push(item.label);
          }
          return true;
        }
        if (item.children) {
          const nextAncestors = item.isSectionTitle
            ? currentPathAncestors
            : [...currentPathAncestors, item.label];
          if (findAncestors(item.children, nextAncestors)) {
            return true;
          }
        }
      }
      return false;
    };

    findAncestors(filteredNavItems);
    const prev = openGroupsRef.current;
    const isSame = prev.length === activeAncestors.length && activeAncestors.every((item, i) => prev[i] === item);
    if (!isSame) {
      setOpenGroups(activeAncestors);
      if (activeAncestors.length > 0) {
        triggerScrollForGroup(activeAncestors[activeAncestors.length - 1]);
      }
    }
  }, [location.pathname, location.search, triggerScrollForGroup]);
  
  const isGroupActive = (item: any): boolean => {
    if (item.path && isPathActive(item.path)) return true;
    if (item.children) {
      return item.children.some((child: any) => isGroupActive(child));
    }
    return false;
  };

  const getItemTheme = (item: any, parentLabel?: string) => {
    const label = item.label;
    
    // Primary Top Level Groups
    if (label === 'Gestão Escolar') {
      return {
        iconColor: 'text-teal-300',
        textColor: 'text-slate-100',
        activeIconColor: 'text-white',
        activeTextColor: 'text-white'
      };
    }
    
    if (label === 'Impressos') {
      return {
        iconColor: 'text-cyan-300',
        textColor: 'text-slate-100',
        activeIconColor: 'text-white',
        activeTextColor: 'text-white'
      };
    }

    // Guia Diocesano
    if (
      label === 'Guia Diocesano' || 
      parentLabel === 'Guia Diocesano' || 
      label === 'Guia Diocese' || 
      parentLabel === 'Guia Diocese' || 
      item.path === '/parishes' ||
      item.path?.startsWith('/parishes')
    ) {
      return {
        iconColor: 'text-amber-300',
        textColor: 'text-amber-100',
        activeIconColor: 'text-white',
        activeTextColor: 'text-white'
      };
    }

    // Dashboard
    if (label === 'Dashboard' || item.path === '/') {
      return {
        iconColor: 'text-teal-300',
        textColor: 'text-slate-100',
        activeIconColor: 'text-white',
        activeTextColor: 'text-white'
      };
    }

    // Financeiro Section (Emerald)
    if (
      label === 'Financeiro' || 
      parentLabel === 'Financeiro' || 
      item.path === '/financial' ||
      item.path?.includes('quitacao') || 
      item.path === '/contributions' || 
      item.path === '/financial-report' || 
      item.path === '/pix-conference' || 
      item.path === '/receipts'
    ) {
      return {
        iconColor: 'text-emerald-300',
        textColor: 'text-slate-100',
        activeIconColor: 'text-white',
        activeTextColor: 'text-white'
      };
    }

    // Impressos Children (Cyan)
    if (
      parentLabel === 'Impressos' ||
      item.path?.includes('type=carta') ||
      item.path?.includes('type=ficha') ||
      item.path?.includes('type=declaracao') ||
      item.path?.includes('type=carteirinhas') ||
      item.path?.includes('type=etiquetas')
    ) {
      return {
        iconColor: 'text-cyan-300',
        textColor: 'text-slate-100',
        activeIconColor: 'text-white',
        activeTextColor: 'text-white'
      };
    }

    // Acadêmico Groups and Children (Teal)
    if (
      label === 'Cadastros' || parentLabel === 'Cadastros' ||
      label === 'Avaliações' || parentLabel === 'Avaliações' ||
      label === 'Frequência' || parentLabel === 'Frequência' ||
      label === 'Cronograma' || parentLabel === 'Cronograma' ||
      item.path === '/students' || item.path === '/teachers' || item.path === '/classes' || item.path === '/subjects' ||
      item.path === '/assessments' || item.path === '/grades' || item.path === '/bulletin' || item.path === '/student-ficha' || item.path === '/documents' ||
      item.path === '/attendance' || item.path === '/monthly-attendance' || item.path?.includes('calendar')
    ) {
      return {
        iconColor: 'text-teal-300',
        textColor: 'text-slate-100',
        activeIconColor: 'text-white',
        activeTextColor: 'text-white'
      };
    }

    // Defaults / Config / Users
    return {
      iconColor: 'text-slate-200',
      textColor: 'text-slate-100',
      activeIconColor: 'text-white',
      activeTextColor: 'text-white'
    };
  };

  const renderNavItems = (items: any[], depth = 0, parentLabel?: string) => {
    return items.map((item, index) => {
      const hasChildren = item.children && item.children.length > 0;
      const isOpen = openGroups.includes(item.label);
      const isActive = item.path ? isPathActive(item.path) : isGroupActive(item);

      // Título de Grupo não-clicável (ex: Gestão Escolar) ou separador de seção
      if (item.isSectionTitle) {
        return (
          <div key={item.label} className={cn("space-y-1", index === 0 ? "pt-0.5" : item.hideTitle ? "pt-1" : "pt-2")}>
            {index > 0 && (
              <div className={cn("border-t border-[#1F4A54] mx-2", item.hideTitle ? "my-2" : "mb-3")} />
            )}
            {!item.hideTitle && (
              <div className="px-3 pt-1 pb-1.5 flex items-center gap-2">
                <span className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-teal-300/80 whitespace-nowrap">
                  {item.label}
                </span>
                <div className="h-px flex-1 bg-[#1F4A54]" />
              </div>
            )}
            <div className="space-y-1">
              {renderNavItems(item.children || [], depth, item.label)}
            </div>
          </div>
        );
      }

      if (hasChildren) {
        const theme = getItemTheme(item, parentLabel);
        const isOwnPathActive = Boolean(item.path && isPathActive(item.path));
        const isFav = item.path ? favorites.includes(item.path) : false;

        return (
          <React.Fragment key={item.label}>
            <div ref={setGroupRef(item.label)} className="space-y-0.5">
            <div
              className={cn(
                "w-full flex items-center justify-between gap-1 rounded-md transition-all duration-200 group",
                isOwnPathActive
                  ? "bg-teal-600 text-white shadow-sm ring-1 ring-teal-400/50 font-semibold"
                  : isActive && !isOpen
                    ? "bg-teal-800/50 text-white"
                    : isActive && isOpen
                      ? "bg-teal-900/45 text-white"
                      : "text-slate-200 hover:text-white hover:bg-teal-800/45"
              )}
            >
              <button
                type="button"
                data-tooltip={item.tooltip || item.label}
                onClick={() => {
                  if (item.path) {
                    if (isOwnPathActive) {
                      toggleGroup(item.label);
                    } else {
                      navigate(item.path);
                      if (!isOpen) {
                        toggleGroup(item.label);
                      }
                      onClose?.();
                    }
                  } else {
                    toggleGroup(item.label);
                  }
                }}
                className={cn(
                  "flex-1 flex items-center gap-2.5 px-3 min-w-0 text-left cursor-pointer",
                  depth === 0 ? "py-2" : "py-1.5"
                )}
              >
                {item.icon && (
                  <item.icon 
                    size={depth === 0 ? 16 : 15} 
                    className={cn(
                      "transition-colors duration-200 shrink-0",
                      isOwnPathActive || isActive ? "text-white" : theme.iconColor
                    )} 
                  />
                )}
                <span className={cn(
                  "leading-snug",
                  depth === 0 ? "text-[13px] font-semibold" : "text-[11px] font-bold uppercase tracking-wider",
                  isOwnPathActive || isActive ? "text-white" : "text-slate-100"
                )}>
                  {item.label}
                </span>
              </button>

              {item.path && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleToggleFavorite(item.path);
                  }}
                  className={cn(
                    "p-1 transition-all shrink-0 cursor-pointer rounded hover:bg-teal-700/50",
                    isFav 
                      ? "text-amber-300 opacity-100 hover:scale-125" 
                      : "text-slate-300 opacity-0 group-hover:opacity-80 hover:!opacity-100 hover:text-amber-300 hover:scale-125"
                  )}
                  title={isFav ? "Remover da barra de acesso rápido do Dashboard" : "Fixar na barra de acesso rápido do Dashboard (máx. 10)"}
                >
                  <Star size={12} className={cn(isFav ? "fill-amber-300" : "")} />
                </button>
              )}

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleGroup(item.label);
                }}
                className={cn(
                  "p-1.5 mr-1 shrink-0 cursor-pointer rounded transition-colors",
                  isOwnPathActive ? "text-white/90 hover:text-white" : "text-slate-300 hover:text-white"
                )}
                title={isOpen ? "Recolher menu" : "Expandir menu"}
              >
                {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              </button>
            </div>
            
            <AnimatePresence mode="wait">
              {isOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2, ease: "easeInOut" }}
                  onAnimationComplete={(definition) => {
                    const isEnter = typeof definition === 'object' && definition !== null && 'height' in definition
                      ? (definition as { height?: unknown }).height === 'auto'
                      : true;
                    if (isEnter && pendingScrollGroupRef.current === item.label) {
                      pendingScrollGroupRef.current = null;
                      if (scrollFallbackTimerRef.current !== null) {
                        window.clearTimeout(scrollFallbackTimerRef.current);
                        scrollFallbackTimerRef.current = null;
                      }
                      scrollGroupIntoView(item.label);
                    }
                  }}
                  className="overflow-hidden"
                >
                  <div className={cn(
                    "space-y-0.5 mt-0.5",
                    depth === 0 ? "ml-3 border-l border-teal-500/30 pl-1.5" : "ml-2.5 border-l border-teal-500/30 pl-1.5"
                  )}>
                    {renderNavItems(item.children, depth + 1, item.label)}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            </div>
            {item.dividerAfter && index < items.length - 1 && (
              <div className="border-t border-[#1F4A54] my-2 mx-2" />
            )}
          </React.Fragment>
        );
      }

      const theme = getItemTheme(item, parentLabel);
      const isFav = item.path ? favorites.includes(item.path) : false;

      return (
        <div
          key={item.path}
          className="flex items-center group relative rounded-md"
        >
          <Link
            to={item.path}
            onClick={() => onClose?.()}
            data-tooltip={item.tooltip || item.label}
            className={cn(
              "flex-1 flex items-center gap-2 px-2 py-1.5 rounded-md transition-all duration-200 min-w-0",
              isActive 
                ? "bg-teal-600 text-white shadow-sm ring-1 ring-teal-400/50 font-semibold" 
                : "text-slate-200 hover:text-white hover:bg-teal-800/45"
            )}
          >
            {item.icon && (
              <item.icon 
                size={depth === 0 ? 16 : 14} 
                className={cn(
                  "transition-colors duration-200 shrink-0",
                  isActive ? "text-white" : theme.iconColor
                )} 
              />
            )}
            <span className={cn(
              "leading-snug flex-1",
              depth === 0 ? "text-[13px] font-semibold text-slate-100" : "text-[12px] font-medium"
            )}>{item.label}</span>
          </Link>

          {item.path && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleToggleFavorite(item.path);
              }}
              className={cn(
                "p-1 transition-all shrink-0 cursor-pointer rounded hover:bg-teal-700/50 mr-0.5",
                isFav 
                  ? "text-amber-300 opacity-100 hover:scale-125" 
                  : "text-slate-300 opacity-0 group-hover:opacity-80 hover:!opacity-100 hover:text-amber-300 hover:scale-125"
              )}
              title={isFav ? "Remover da barra de acesso rápido do Dashboard" : "Fixar na barra de acesso rápido do Dashboard (máx. 10)"}
            >
              <Star size={12} className={cn(isFav ? "fill-amber-300" : "")} />
            </button>
          )}
        </div>
      );
    });
  };

  return (
    <aside className="h-full max-h-screen w-[280px] bg-[#0F2A30] text-white flex flex-col border-r border-[#1F4A54] print:hidden overflow-hidden shrink-0 select-none">
      <div className="h-16 px-3 bg-[#0B2025] border-b border-[#1F4A54] flex items-center justify-between shrink-0 overflow-hidden">
        <div className="flex-1 h-full flex items-center justify-start pl-2 gap-[18px] min-w-0 select-none">
          <div className="w-12 h-12 flex items-center justify-center shrink-0">
            <img
              src="/assets/aistudio/vmc_logo_transparent_dark.png"
              alt="Logo Oficial VMC"
              referrerPolicy="no-referrer"
              className="w-full h-full object-contain select-none pointer-events-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)]"
            />
          </div>
          <div className="flex flex-col items-end leading-none select-none shrink-0 pr-1">
            <span className="font-brand text-[26px] font-bold tracking-[-0.015em] text-[#2DD4BF] leading-none flex items-baseline">
              <span>escm</span>
              <span className="inline-block leading-none bg-[linear-gradient(to_bottom,#F8D15B_0%,#F2BE42_36%,#2DD4BF_36%,#2DD4BF_100%)] bg-clip-text text-transparent">
                i
              </span>
              <span>n</span>
            </span>
            <span className="font-signature text-[12px] font-semibold bg-gradient-to-r from-[#FCE38A] via-[#E5B84B] to-[#F5D675] bg-clip-text text-transparent leading-none mt-0.5 px-1 translate-x-2 sm:translate-x-2.5 tracking-wide">
              by VMC
            </span>
          </div>
        </div>
        {onClose && (
          <button 
            onClick={onClose}
            title="Fechar menu lateral"
            className="lg:hidden p-1 text-white/60 hover:text-white transition-colors shrink-0 ml-1"
          >
            <XCircle size={18} />
          </button>
        )}
      </div>

      {/* Switcher de Seleção de Unidade / Polo Operacional */}
      <SidebarUnitSwitcher />

      {/* Aviso de Limite de Atalhos (se tentar ultrapassar 10) */}
      {notice && (
        <div className="mx-3 mt-2 px-2.5 py-1.5 rounded-lg bg-amber-500/20 border border-amber-400/50 text-[10px] text-amber-200 font-semibold text-center shrink-0 animate-fade-in">
          {notice}
        </div>
      )}

      <nav ref={navRef} className="flex-1 min-h-0 px-2 py-3 space-y-1 overflow-y-auto overscroll-contain sidebar-scrollbar">
        {renderNavItems(filteredNavItems)}
      </nav>

      <div className="p-4 bg-[#091C21] border-t border-[#1F4A54] flex flex-col items-center shrink-0 mt-auto select-none">
        {/* Database Connection Indicator */}
        <div
          className="w-full px-3 py-2 bg-[#102E35] border border-[#1F4A54] rounded-md flex items-center justify-between"
          title={dbStatus === 'online' ? 'Banco de dados conectado e operacional' : dbStatus === 'offline' ? 'Sem conexão com o banco de dados' : 'Verificando conexão com o servidor'}
        >
          <div className="flex items-center gap-2">
            {dbStatus === 'online' ? (
              <div className="w-2 h-2 bg-emerald-400 rounded-full shrink-0"></div>
            ) : dbStatus === 'offline' ? (
              <div className="w-2 h-2 bg-red-400 rounded-full shrink-0"></div>
            ) : (
              <div className="w-2 h-2 bg-yellow-400 rounded-full shrink-0 animate-pulse"></div>
            )}
            <span className={cn(
              "text-[9px] font-black uppercase tracking-widest leading-none",
              dbStatus === 'online' ? "text-emerald-400" : dbStatus === 'offline' ? "text-red-400" : "text-yellow-400"
            )}>
              {dbStatus === 'online' ? 'ONLINE' : dbStatus === 'offline' ? 'OFFLINE' : 'CONECTANDO'}
            </span>
          </div>

          <div className="flex items-center gap-1.5" title={latency !== null ? `Latência do banco: ${latency} ms` : 'Verificando latência'}>
            <span className="text-[7.5px] font-bold text-slate-300 uppercase tracking-widest leading-none">LATÊNCIA:</span>
            <span className={cn(
              "text-[8.5px] font-bold font-mono tabular-nums leading-none",
              latency === null ? "text-slate-300" : latency < 600 ? "text-emerald-300" : latency < 1500 ? "text-amber-300" : "text-rose-300"
            )}>
              {latency !== null ? `${latency} ms` : '...'}
            </span>
          </div>
        </div>

        {/* Copyright Text */}
        <div className="text-[8px] text-slate-300 font-bold text-center mt-3 leading-normal w-full uppercase tracking-wider">
          <p>© Escmin Gestão Acadêmica</p>
          <p className="text-[7.5px] text-teal-200/80 mt-0.5">Desenvolvido por Mauricio Santos</p>
        </div>
      </div>
    </aside>
  );
}
