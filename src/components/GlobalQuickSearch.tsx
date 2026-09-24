import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Search, 
  X, 
  GraduationCap, 
  Users, 
  School, 
  ArrowRight, 
  Loader2, 
  CornerDownLeft,
  Building2,
  Sparkles,
  Command
} from 'lucide-react';
import { fetchAll } from '../lib/database';
import { normalizeSearchString } from '../lib/utils';
import { useUnits } from '../contexts/UnitContext';
import { cn } from '../lib/utils';

export type SearchCategory = 'all' | 'students' | 'teachers' | 'classes';

export interface QuickSearchItem {
  id: string;
  type: 'student' | 'teacher' | 'class';
  title: string;
  subtitle: string;
  codeOrId: string;
  unit_id?: string;
  status?: string;
  photo_url?: string;
  additionalInfo?: string;
}

export function GlobalQuickSearch() {
  const navigate = useNavigate();
  const { activeUnits, selectedUnitId, isRestricted, getUnitName } = useUnits();

  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<SearchCategory>('all');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(false);

  // Cached data
  const [students, setStudents] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsListRef = useRef<HTMLDivElement>(null);

  // Check if Mac for keyboard shortcut indicator
  const isMac = typeof window !== 'undefined' && navigator.platform?.toUpperCase().indexOf('MAC') >= 0;

  // Load datasets when needed
  const loadSearchData = useCallback(async () => {
    if (dataLoaded || loading) return;
    setLoading(true);
    try {
      const [studentsData, teachersData, classesData] = await Promise.all([
        fetchAll('students', 'id,name,registration_number,status,class_id,course,unit_id,photo_url').catch(() => []),
        fetchAll('teachers', 'id,name,code,status,unit_id,photo_url,observations').catch(() => []),
        fetchAll('classes', 'id,name,code,shift,year,unit_id,course').catch(() => [])
      ]);

      setStudents(Array.isArray(studentsData) ? studentsData : []);
      setTeachers(Array.isArray(teachersData) ? teachersData : []);
      setClasses(Array.isArray(classesData) ? classesData : []);
      setDataLoaded(true);
    } catch (err) {
      console.warn('Erro ao carregar dados da busca rápida:', err);
    } finally {
      setLoading(false);
    }
  }, [dataLoaded, loading]);

  // Global hotkey: Ctrl+K or Cmd+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsOpen(true);
        loadSearchData();
        setTimeout(() => inputRef.current?.focus(), 50);
      }
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
        inputRef.current?.blur();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, loadSearchData]);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Focus & load trigger
  const handleInputFocus = () => {
    setIsOpen(true);
    loadSearchData();
  };

  // Convert raw records into normalized search items
  const allItems = useMemo<QuickSearchItem[]>(() => {
    const items: QuickSearchItem[] = [];

    // 1. Students
    for (const s of students) {
      if (!s || !s.id) continue;
      const name = s.name || s.full_name || 'Aluno sem nome';
      const reg = s.registration_number || s.code || '';
      const courseOrClass = s.course || 'Sem turma definida';
      items.push({
        id: s.id,
        type: 'student',
        title: name,
        subtitle: courseOrClass,
        codeOrId: reg ? `Matrícula: ${reg}` : '',
        unit_id: s.unit_id || 'matriz',
        status: s.status || 'Ativo',
        photo_url: s.photo_url,
        additionalInfo: s.status ? `Status: ${s.status}` : undefined
      });
    }

    // 2. Teachers
    for (const t of teachers) {
      if (!t || !t.id) continue;
      const name = t.name || 'Professor sem nome';
      const code = t.code || '';
      items.push({
        id: t.id,
        type: 'teacher',
        title: name,
        subtitle: 'Corpo Docente',
        codeOrId: code ? `Cód: ${code}` : '',
        unit_id: t.unit_id || 'matriz',
        status: t.status || 'Ativo',
        photo_url: t.photo_url,
        additionalInfo: t.status ? `Status: ${t.status}` : undefined
      });
    }

    // 3. Classes
    for (const c of classes) {
      if (!c || !c.id) continue;
      const name = c.name || 'Turma sem nome';
      const code = c.code || '';
      const details = [c.shift, c.year].filter(Boolean).join(' • ') || 'Geral';
      items.push({
        id: c.id,
        type: 'class',
        title: name,
        subtitle: c.course || details,
        codeOrId: code ? `Turma: ${code}` : '',
        unit_id: c.unit_id || 'matriz',
        additionalInfo: details
      });
    }

    return items;
  }, [students, teachers, classes]);

  // Filter items according to search query, selected category and unit
  const filteredItems = useMemo(() => {
    const normQuery = normalizeSearchString(query);

    return allItems.filter(item => {
      // Unit filter: if user is restricted to a unit, strictly enforce it
      if (isRestricted && item.unit_id && item.unit_id !== selectedUnitId) {
        return false;
      }

      // Category filter
      if (selectedCategory === 'students' && item.type !== 'student') return false;
      if (selectedCategory === 'teachers' && item.type !== 'teacher') return false;
      if (selectedCategory === 'classes' && item.type !== 'class') return false;

      // Query filter
      if (!normQuery) {
        return true; // show latest/suggested items if query is empty
      }

      const normTitle = normalizeSearchString(item.title);
      const normSubtitle = normalizeSearchString(item.subtitle);
      const normCode = normalizeSearchString(item.codeOrId);
      const normId = normalizeSearchString(item.id);

      // Match in title, subtitle, code or ID
      if (
        normTitle.includes(normQuery) || 
        normSubtitle.includes(normQuery) || 
        normCode.includes(normQuery) ||
        normId.includes(normQuery)
      ) {
        return true;
      }

      // Multi-word search token matching
      const tokens = normQuery.split(/\s+/).filter(Boolean);
      if (tokens.length > 1) {
        const fullContent = `${normTitle} ${normSubtitle} ${normCode}`;
        return tokens.every(token => fullContent.includes(token));
      }

      return false;
    }).slice(0, 30); // Max 30 results for crisp rendering
  }, [allItems, query, selectedCategory, isRestricted, selectedUnitId]);

  // Counts for each category
  const categoryCounts = useMemo(() => {
    const normQuery = normalizeSearchString(query);
    const filterFn = (item: QuickSearchItem) => {
      if (isRestricted && item.unit_id && item.unit_id !== selectedUnitId) return false;
      if (!normQuery) return true;
      const normTitle = normalizeSearchString(item.title);
      const normSubtitle = normalizeSearchString(item.subtitle);
      const normCode = normalizeSearchString(item.codeOrId);
      const normId = normalizeSearchString(item.id);
      return normTitle.includes(normQuery) || normSubtitle.includes(normQuery) || normCode.includes(normQuery) || normId.includes(normQuery);
    };

    const matched = allItems.filter(filterFn);
    return {
      all: matched.length,
      students: matched.filter(i => i.type === 'student').length,
      teachers: matched.filter(i => i.type === 'teacher').length,
      classes: matched.filter(i => i.type === 'class').length
    };
  }, [allItems, query, isRestricted, selectedUnitId]);

  // Reset selected index when query or category changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query, selectedCategory]);

  // Handle select / navigation
  const handleSelectItem = (item: QuickSearchItem) => {
    setIsOpen(false);
    setQuery('');

    if (item.type === 'student') {
      navigate('/alunos', { state: { studentId: item.id } });
    } else if (item.type === 'teacher') {
      navigate('/professores', { state: { teacherId: item.id } });
    } else if (item.type === 'class') {
      navigate('/turmas', { state: { classId: item.id } });
    }
  };

  // Keyboard navigation within the dropdown list
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        setIsOpen(true);
        loadSearchData();
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev + 1 < filteredItems.length ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev - 1 >= 0 ? prev - 1 : filteredItems.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredItems[selectedIndex]) {
        handleSelectItem(filteredItems[selectedIndex]);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
      inputRef.current?.blur();
    }
  };

  // Keep active item in view
  useEffect(() => {
    if (resultsListRef.current && filteredItems.length > 0) {
      const activeEl = resultsListRef.current.children[selectedIndex] as HTMLElement;
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex, filteredItems]);

  const getItemIcon = (type: QuickSearchItem['type']) => {
    switch (type) {
      case 'student':
        return <GraduationCap size={16} className="text-blue-600" />;
      case 'teacher':
        return <Users size={16} className="text-emerald-600" />;
      case 'class':
        return <School size={16} className="text-indigo-600" />;
    }
  };

  const getItemTypeBadge = (type: QuickSearchItem['type']) => {
    switch (type) {
      case 'student':
        return <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">Aluno</span>;
      case 'teacher':
        return <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">Professor</span>;
      case 'class':
        return <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200">Turma</span>;
    }
  };

  return (
    <div className="relative w-full max-w-md" ref={containerRef}>
      {/* Search Input Bar */}
      <div 
        className={cn(
          "flex items-center gap-2 px-3 py-1.5 rounded-xl border transition-all text-xs duration-150 select-none",
          isOpen 
            ? "bg-white border-blue-500 shadow-md ring-2 ring-blue-500/15" 
            : "bg-slate-100/80 hover:bg-slate-100 border-slate-200/90 text-slate-700"
        )}
      >
        <Search 
          size={15} 
          className={cn(
            "shrink-0 transition-colors", 
            isOpen ? "text-blue-600" : "text-slate-400"
          )} 
        />
        
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={handleInputFocus}
          onKeyDown={handleKeyDown}
          placeholder="Buscar alunos, professores, turmas..."
          className="w-full bg-transparent border-none outline-hidden text-xs text-slate-900 placeholder:text-slate-400 font-medium"
        />

        {loading ? (
          <Loader2 size={14} className="text-blue-600 animate-spin shrink-0" />
        ) : query ? (
          <button
            type="button"
            onClick={() => { setQuery(''); inputRef.current?.focus(); }}
            className="p-0.5 text-slate-400 hover:text-slate-600 rounded transition-colors"
            title="Limpar busca"
          >
            <X size={14} />
          </button>
        ) : (
          <div className="hidden sm:flex items-center gap-1 shrink-0 text-slate-400 select-none pointer-events-none">
            <kbd className="text-[9px] font-mono font-bold bg-white border border-slate-200/90 rounded px-1.5 py-0.5 text-slate-500 shadow-2xs">
              {isMac ? '⌘K' : 'Ctrl K'}
            </kbd>
          </div>
        )}
      </div>

      {/* Floating Results Dropdown */}
      {isOpen && (
        <div 
          className="absolute left-0 sm:left-auto sm:right-0 md:left-0 top-full mt-2 w-full sm:w-[480px] max-w-[94vw] bg-white rounded-2xl shadow-2xl border border-slate-200/90 overflow-hidden z-[110] animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[82vh]"
        >
          {/* Header with Quick Category Pills */}
          <div className="p-2.5 border-b border-slate-150 bg-slate-50/70 shrink-0">
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
              <button
                type="button"
                onClick={() => setSelectedCategory('all')}
                className={cn(
                  "px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all whitespace-nowrap cursor-pointer flex items-center gap-1 border",
                  selectedCategory === 'all'
                    ? "bg-slate-900 text-white border-slate-900 shadow-2xs"
                    : "bg-white text-slate-600 hover:bg-slate-100 border-slate-200/80"
                )}
              >
                <span>Todos</span>
                <span className={cn(
                  "text-[9px] px-1.5 py-0.2 rounded-full",
                  selectedCategory === 'all' ? "bg-slate-800 text-slate-200" : "bg-slate-100 text-slate-500"
                )}>
                  {categoryCounts.all}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedCategory('students')}
                className={cn(
                  "px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all whitespace-nowrap cursor-pointer flex items-center gap-1.5 border",
                  selectedCategory === 'students'
                    ? "bg-blue-600 text-white border-blue-600 shadow-2xs"
                    : "bg-white text-slate-600 hover:bg-blue-50/60 border-slate-200/80"
                )}
              >
                <GraduationCap size={13} />
                <span>Alunos</span>
                <span className={cn(
                  "text-[9px] px-1.5 py-0.2 rounded-full",
                  selectedCategory === 'students' ? "bg-blue-700 text-blue-100" : "bg-slate-100 text-slate-500"
                )}>
                  {categoryCounts.students}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedCategory('teachers')}
                className={cn(
                  "px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all whitespace-nowrap cursor-pointer flex items-center gap-1.5 border",
                  selectedCategory === 'teachers'
                    ? "bg-emerald-600 text-white border-emerald-600 shadow-2xs"
                    : "bg-white text-slate-600 hover:bg-emerald-50/60 border-slate-200/80"
                )}
              >
                <Users size={13} />
                <span>Professores</span>
                <span className={cn(
                  "text-[9px] px-1.5 py-0.2 rounded-full",
                  selectedCategory === 'teachers' ? "bg-emerald-700 text-emerald-100" : "bg-slate-100 text-slate-500"
                )}>
                  {categoryCounts.teachers}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedCategory('classes')}
                className={cn(
                  "px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all whitespace-nowrap cursor-pointer flex items-center gap-1.5 border",
                  selectedCategory === 'classes'
                    ? "bg-indigo-600 text-white border-indigo-600 shadow-2xs"
                    : "bg-white text-slate-600 hover:bg-indigo-50/60 border-slate-200/80"
                )}
              >
                <School size={13} />
                <span>Turmas</span>
                <span className={cn(
                  "text-[9px] px-1.5 py-0.2 rounded-full",
                  selectedCategory === 'classes' ? "bg-indigo-700 text-indigo-100" : "bg-slate-100 text-slate-500"
                )}>
                  {categoryCounts.classes}
                </span>
              </button>
            </div>
          </div>

          {/* Results List */}
          <div 
            ref={resultsListRef}
            className="flex-1 overflow-y-auto divide-y divide-slate-100 p-1.5 focus:outline-hidden"
          >
            {loading && !dataLoaded ? (
              <div className="py-8 flex flex-col items-center justify-center gap-2 text-slate-400">
                <Loader2 size={24} className="animate-spin text-blue-600" />
                <span className="text-xs font-medium">Buscando na base de dados...</span>
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="py-8 px-4 text-center">
                <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-2.5">
                  <Search size={18} />
                </div>
                <p className="text-sm font-bold text-slate-800">
                  {query ? `Nenhum resultado para "${query}"` : 'Nenhum registro encontrado'}
                </p>
                <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
                  {query 
                    ? 'Verifique a grafia ou tente buscar por partes do nome, matrícula ou código.'
                    : 'Digite o nome ou ID de um aluno, professor ou turma para iniciar a pesquisa.'}
                </p>
              </div>
            ) : (
              filteredItems.map((item, index) => {
                const isSelected = index === selectedIndex;
                const unitName = getUnitName(item.unit_id || 'matriz');

                return (
                  <button
                    key={`${item.type}-${item.id}`}
                    type="button"
                    onClick={() => handleSelectItem(item)}
                    onMouseEnter={() => setSelectedIndex(index)}
                    className={cn(
                      "w-full px-3 py-2.5 rounded-xl text-left transition-all flex items-center justify-between gap-3 cursor-pointer group border",
                      isSelected 
                        ? "bg-blue-50/80 border-blue-200 text-blue-950 shadow-2xs" 
                        : "hover:bg-slate-50 border-transparent text-slate-800"
                    )}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {/* Avatar / Icon Container */}
                      <div className="relative shrink-0">
                        {item.photo_url ? (
                          <img 
                            src={item.photo_url} 
                            alt={item.title} 
                            className="w-9 h-9 rounded-full object-cover border border-slate-200 shadow-2xs"
                            onError={(e) => {
                              // Fallback on broken image link
                              (e.target as HTMLElement).style.display = 'none';
                            }}
                          />
                        ) : (
                          <div className={cn(
                            "w-9 h-9 rounded-xl flex items-center justify-center border shadow-2xs",
                            item.type === 'student' ? "bg-blue-50 border-blue-100" :
                            item.type === 'teacher' ? "bg-emerald-50 border-emerald-100" :
                            "bg-indigo-50 border-indigo-100"
                          )}>
                            {getItemIcon(item.type)}
                          </div>
                        )}
                      </div>

                      {/* Info details */}
                      <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs truncate text-slate-900 group-hover:text-blue-600 transition-colors">
                            {item.title}
                          </span>
                          {getItemTypeBadge(item.type)}
                          {item.status && item.status === 'Inativo' && (
                            <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-slate-100 text-slate-500 border border-slate-200">
                              Inativo
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5 flex-wrap">
                          {item.subtitle && (
                            <span className="truncate max-w-[200px]">
                              {item.subtitle}
                            </span>
                          )}
                          {item.codeOrId && (
                            <>
                              <span className="text-slate-300">•</span>
                              <span className="font-mono text-slate-600 font-semibold text-[10px]">
                                {item.codeOrId}
                              </span>
                            </>
                          )}
                          {unitName && (
                            <>
                              <span className="text-slate-300">•</span>
                              <span className="text-[10px] text-slate-400 flex items-center gap-0.5">
                                <Building2 size={10} />
                                {unitName}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Arrow action */}
                    <div className="shrink-0 flex items-center gap-1.5">
                      {isSelected ? (
                        <div className="flex items-center gap-1 text-[10px] font-bold text-blue-600 bg-white px-2 py-0.5 rounded-lg border border-blue-200 shadow-2xs animate-in fade-in duration-100">
                          <span>Acessar</span>
                          <CornerDownLeft size={11} />
                        </div>
                      ) : (
                        <ArrowRight size={14} className="text-slate-300 group-hover:text-slate-600 group-hover:translate-x-0.5 transition-all" />
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Footer Shortcuts Info */}
          <div className="px-3 py-2 border-t border-slate-150 bg-slate-50 text-[10px] text-slate-500 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <kbd className="font-mono px-1 py-0.5 bg-white border border-slate-200 rounded text-[9px]">↑</kbd>
                <kbd className="font-mono px-1 py-0.5 bg-white border border-slate-200 rounded text-[9px]">↓</kbd>
                navegar
              </span>
              <span className="flex items-center gap-1">
                <kbd className="font-mono px-1.5 py-0.5 bg-white border border-slate-200 rounded text-[9px]">↵</kbd>
                selecionar
              </span>
              <span className="flex items-center gap-1">
                <kbd className="font-mono px-1 py-0.5 bg-white border border-slate-200 rounded text-[9px]">ESC</kbd>
                fechar
              </span>
            </div>

            <span className="font-medium text-slate-400">
              {filteredItems.length} resultado(s)
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
