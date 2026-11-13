import React, { useCallback, useEffect, useRef, useState } from 'react';
import { 
  LayoutDashboard as DashboardIcon, 
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
  { icon: DashboardIcon, label: 'Dashboard', path: '/' },
  {
    label: 'Gestão Escolar',
    icon: ClassesIcon,
    isPrimary: true,
    children: [
      {
        label: 'Cadastros',
        icon: GraduationCap,
        children: [
          { icon: StudentsIcon, label: 'Alunos', path: '/students' },
          { icon: TeachersIcon, label: 'Professores', path: '/teachers' },
          { icon: GraduationCap, label: 'Cursos', path: '/courses' },
          { icon: ClassesIcon, label: 'Turmas', path: '/classes' },
          { icon: SubjectsIcon, label: 'Disciplinas', path: '/subjects' },
          { icon: FileText, label: 'Relatórios', path: '/cadastros-relatorios' },
        ]
      },
      { 
        label: 'Avaliações',
        icon: GradesIcon,
        children: [
          { icon: FileText, label: 'Cadastrar Avaliação', path: '/assessments' },
          { icon: GradesIcon, label: 'Apontamento de Notas', path: '/grades' },
          { icon: FileText, label: 'Boletim de Notas', path: '/bulletin' },
          { icon: CertificateIcon, label: 'Certificados e Diplomas', path: '/documents' },
        ]
      },
      {
        label: 'Frequência',
        icon: CalendarCheck,
        children: [
          { icon: AttendanceIcon, label: 'Chamada', path: '/attendance' },
          { icon: CalendarCheck, label: 'Lista de Chamada', path: '/monthly-attendance' },
          { icon: UserIcon, label: 'Controle e Histórico', path: '/student-ficha' },
        ]
      },
      {
        label: 'Cronograma',
        icon: CalendarIcon,
        children: [
          { icon: CalendarIcon, label: 'Calendário', path: '/calendar?view=month' },
          { icon: FileText, label: 'Grade Acadêmica', path: '/calendar?view=management' },
          { icon: SettingsIcon, label: 'Parâmetros', path: '/calendar?view=parameters' },
          { icon: CalendarDays, label: 'Calendário Anual', path: '/calendar?view=annual' },
          { icon: Sparkles, label: 'Habilitação', path: '/calendar?view=habilitation' },
        ]
      },
      {
        label: 'Financeiro',
        icon: Wallet,
        path: '/financial',
        children: [
          { icon: DashboardIcon, label: 'Dashboard Financeiro', path: '/financial' },
          { icon: PixIcon, label: 'Contribuições', path: '/contributions' },
          { icon: ReportsIcon, label: 'Relatório Financeiro', path: '/financial-report' },
          { icon: PixIcon, label: 'Conferência Pix', path: '/pix-conference' },
          { icon: CertificateIcon, label: 'Certidão de Quitação', path: '/impressos?type=quitacao' },
          { icon: FileText, label: 'Recibos', path: '/receipts' },
        ]
      },
    ]
  },
  {
    label: 'Impressos',
    icon: Printer,
    isPrimary: true,
    children: [
      { icon: FileText, label: 'Carta de Apresentação', path: '/impressos?type=carta' },
      { icon: UserIcon, label: 'Ficha de Inscrição', path: '/impressos?type=ficha' },
      { icon: FileText, label: 'Declaração de Matrícula', path: '/impressos?type=declaracao' },
      { icon: PixIcon, label: 'Etiqueta para Carteirinha', path: '/impressos?type=carteirinhas' },
      { icon: Tag, label: 'Etiquetas de Endereço', path: '/impressos?type=etiquetas' },
    ]
  },
  {
    label: 'Guia Diocese',
    icon: Church,
    isPrimary: true,
    children: [
      { icon: Scroll, label: 'Gestão da Diocese', path: '/parishes?view=management' },
      { icon: Printer, label: 'Relatórios e Impressão', path: '/parishes?view=reports' },
    ]
  },
  { icon: UserManagementIcon, label: 'Usuários', path: '/users' },
  { 
    label: 'Configurações', 
    icon: SettingsIcon,
    children: [
      { icon: Database, label: 'Backup', path: '/backup' },
      { icon: SettingsIcon, label: 'Geral', path: '/settings' },
      { icon: DollarSign, label: 'Financeiro', path: '/settings?tab=financial' },
      { icon: Database, label: 'Base de Dados & SQL', path: '/settings?tab=database' },
      { icon: ImportIcon, label: 'Importação', path: '/import' },
      { icon: ArchiveIcon, label: 'Arquivo Morto', path: '/archive' },
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

  const [openGroups, setOpenGroups] = useState<string[]>(['Gestão Escolar', 'Cadastros', 'Avaliações', 'Frequência', 'Financeiro', 'Cronograma', 'Impressos', 'Guia Diocese']);
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

  const toggleGroup = (label: string) => {
    const isCurrentlyOpen = openGroups.includes(label);
    if (!isCurrentlyOpen) {
      triggerScrollForGroup(label);
    } else if (pendingScrollGroupRef.current === label) {
      pendingScrollGroupRef.current = null;
      if (scrollFallbackTimerRef.current !== null) {
        window.clearTimeout(scrollFallbackTimerRef.current);
        scrollFallbackTimerRef.current = null;
      }
    }

    setOpenGroups(prev => 
      prev.includes(label) ? prev.filter(g => g !== label) : [...prev, label]
    );
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
          return true;
        }
        if (item.children) {
          if (findAncestors(item.children, [...currentPathAncestors, item.label])) {
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

    // Guia Diocese
    if (
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
    return items.map((item) => {
      const hasChildren = item.children && item.children.length > 0;
      const isOpen = openGroups.includes(item.label);
      const isActive = item.path ? isPathActive(item.path) : isGroupActive(item);

      // Destacar Módulos Principais no topo da Sidebar (Gestão Escolar e Impressos) - Destaque Natural sem Caixas
      if (depth === 0 && (item.label === 'Gestão Escolar' || item.label === 'Impressos')) {
        const isGestao = item.label === 'Gesto Escolar' || item.label === 'Gestão Escolar';
        const theme = getItemTheme(item);
        
        return (
          <div key={item.label} ref={setGroupRef(item.label)} className="space-y-1 my-3">
            {/* Linha Divisória Sutil entre os blocos (apenas se não for o primeiro) */}
            {!isGestao && <div className="border-t border-[#1F4A54] my-4 mx-3" />}

            {/* Pasta Toggle Principal */}
            <button
              onClick={() => toggleGroup(item.label)}
              className={cn(
                "w-full flex items-center justify-between gap-3 px-3.5 py-2 rounded-md transition-all duration-200 cursor-pointer",
                isGestao ? "border-l-4 border-teal-400 bg-teal-900/35" : "border-l-4 border-cyan-400 bg-cyan-900/30",
                isActive 
                  ? "text-white" 
                  : "text-slate-100 hover:text-white hover:bg-teal-800/45"
              )}
            >
              <div className="flex items-center gap-2.5">
                {item.icon && (
                  <item.icon 
                    size={16} 
                    className={cn(
                      "transition-colors duration-200 shrink-0",
                      isActive ? "text-white" : theme.iconColor
                    )} 
                  />
                )}
                <span className="text-[12.5px] font-extrabold uppercase tracking-wide text-slate-50">
                  {item.label}
                </span>
              </div>
              {isOpen ? (
                <ChevronDown size={14} className={isGestao ? "text-teal-300" : "text-cyan-300"} />
              ) : (
                <ChevronRight size={14} className={isGestao ? "text-teal-300" : "text-cyan-300"} />
              )}
            </button>

            {/* Conteúdos da Pasta Principal */}
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
                    "space-y-1 mt-1 pl-3.5 ml-4 border-l-2",
                    isGestao ? "border-teal-500/35" : "border-cyan-500/35"
                  )}>
                    {renderNavItems(item.children, depth + 1, item.label)}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      }

      if (hasChildren) {
        const theme = getItemTheme(item, parentLabel);
        return (
          <div key={item.label} ref={setGroupRef(item.label)} className="space-y-0.5">
            <button
              onClick={() => {
                if (item.path) {
                  navigate(item.path);
                  if (!isOpen) {
                    toggleGroup(item.label);
                  }
                  onClose?.();
                } else {
                  toggleGroup(item.label);
                }
              }}
              className={cn(
                "w-full flex items-center justify-between gap-3 px-3.5 py-1.5 rounded-md transition-all duration-200 cursor-pointer",
                isActive && !isOpen ? "bg-teal-800/50 text-white" : "text-slate-200 hover:text-white hover:bg-teal-800/45"
              )}
            >
              <div className="flex items-center gap-3">
                {item.icon && (
                  <item.icon 
                    size={15} 
                    className={cn(
                      "transition-colors duration-200 shrink-0",
                      isActive ? "text-white" : theme.iconColor
                    )} 
                  />
                )}
                <span className={cn(
                  "text-[10.5px] font-bold uppercase tracking-wider",
                  isActive ? "text-white" : "text-slate-200"
                )}>
                  {item.label}
                </span>
              </div>
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  toggleGroup(item.label);
                }}
                className="p-1 text-slate-300 hover:text-white cursor-pointer"
                title={isOpen ? "Recolher menu" : "Expandir menu"}
              >
                {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              </div>
            </button>
            
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
                    depth === 0 ? "ml-4 border-l border-teal-500/30 pl-2" : "ml-3 border-l border-teal-500/30 pl-2"
                  )}>
                    {renderNavItems(item.children, depth + 1, item.label)}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      }

      const theme = getItemTheme(item, parentLabel);
      const isFav = item.path ? favorites.includes(item.path) : false;

      return (
        <div
          key={item.path}
          className="flex items-center group relative rounded-md overflow-hidden"
        >
          <Link
            to={item.path}
            onClick={() => onClose?.()}
            className={cn(
              "flex-1 flex items-center gap-3 px-3.5 py-2 rounded-md transition-all duration-200 min-w-0",
              isActive 
                ? "bg-teal-600 text-white shadow-sm ring-1 ring-teal-400/50 font-semibold" 
                : "text-slate-200 hover:text-white hover:bg-teal-800/45"
            )}
          >
            {item.icon && (
              <item.icon 
                size={15} 
                className={cn(
                  "transition-colors duration-200 shrink-0",
                  isActive ? "text-white" : theme.iconColor
                )} 
              />
            )}
            <span className="text-[13px] font-medium truncate flex-1">{item.label}</span>
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
                "p-1.5 transition-all shrink-0 cursor-pointer rounded hover:bg-teal-700/50 mr-1.5",
                isFav 
                  ? "text-amber-300 opacity-100 hover:scale-125" 
                  : "text-slate-300 opacity-0 group-hover:opacity-80 hover:!opacity-100 hover:text-amber-300 hover:scale-125"
              )}
              title={isFav ? "Remover da barra de acesso rápido do Dashboard" : "Fixar na barra de acesso rápido do Dashboard (máx. 10)"}
            >
              <Star size={13} className={cn(isFav ? "fill-amber-300" : "")} />
            </button>
          )}
        </div>
      );
    });
  };

  return (
    <aside className="h-full max-h-screen w-60 bg-[#0F2A30] text-white flex flex-col border-r border-[#1F4A54] print:hidden overflow-hidden shrink-0 select-none">
      <div className="h-16 px-5 bg-[#0B2025] border-b border-[#1F4A54] flex items-center justify-between shrink-0">
        <div className="flex flex-col">
          <h2 className="text-[10.5px] font-bold uppercase tracking-[0.05em] text-teal-300">SISTEMA ACADEMICO ESCMIN</h2>
          <span className="text-[9.5px] font-medium text-slate-200 uppercase tracking-wider">Diocese de Guarulhos</span>
        </div>
        {onClose && (
          <button 
            onClick={onClose}
            className="lg:hidden p-1 text-white/60 hover:text-white transition-colors"
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
        <div className="w-full px-3 py-2 bg-[#102E35] border border-[#1F4A54] rounded-md flex items-center justify-between">
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
