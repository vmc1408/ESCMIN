import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  DollarSign, 
  Save, 
  Plus, 
  Trash2, 
  Calendar, 
  GraduationCap, 
  School,
  BookOpen,
  Database, 
  Copy, 
  Check, 
  RefreshCw,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Info,
  CheckCircle2,
  ArrowUpRight
} from 'lucide-react';
import { financialConfigService, DEFAULT_FINANCIAL_SETTINGS } from '../services/financialConfigService';
import { FinancialSettings, Course, Class, Subject, FinancialCourseFee, FinancialClassFee, FinancialSubjectFee } from '../types';
import { fetchAll } from '../lib/database';
import { formatCurrency, cn, normalizeClass } from '../lib/utils';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

interface FinancialSettingsTabProps {
  onNotify?: (notification: { type: 'success' | 'error'; message: string }) => void;
  onOpenDatabaseTab?: (scriptKey?: string) => void;
}

export function FinancialSettingsTab({ onNotify, onOpenDatabaseTab }: FinancialSettingsTabProps) {
  const currentSystemYear = new Date().getFullYear();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);
  
  const [courses, setCourses] = useState<Course[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [settings, setSettings] = useState<FinancialSettings>(DEFAULT_FINANCIAL_SETTINGS);

  // Navegador de Ano de Referência
  const [selectedYear, setSelectedYear] = useState<number>(currentSystemYear);

  // Estado para adicionar nova mensalidade específica (Turma, Disciplina ou Curso)
  const [showAddFeeModal, setShowAddFeeModal] = useState(false);
  const [feeTargetType, setFeeTargetType] = useState<'class' | 'subject' | 'course'>('class');
  const [selectedCourseId, setSelectedCourseId] = useState<string>('');
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('');
  const [newFeeAmount, setNewFeeAmount] = useState<number>(100);

  // Carregar dados
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [financialData, coursesData, classesData, subjectsData] = await Promise.all([
        financialConfigService.getSettings(),
        fetchAll('courses').catch(() => []),
        fetchAll('classes').catch(() => []),
        fetchAll('subjects').catch(() => [])
      ]);

      const activeCourses: Course[] = (coursesData || []).filter((c: any) => c.status !== 'Inativo');
      const normalizedClasses: Class[] = (classesData || []).map((cls: any) => normalizeClass(cls));
      const activeSubjects: Subject[] = (subjectsData || []).filter((s: any) => s.status !== 'Inativo');
      setCourses(activeCourses);
      setClasses(normalizedClasses);
      setSubjects(activeSubjects);

      // Mantém apenas os cursos que foram de fato personalizados no sistema
      const existingCourseFees = (financialData.course_fees || []).filter(
        (cf: FinancialCourseFee) => cf && cf.course_name && Number(cf.amount) > 0
      );

      // Mantém apenas as turmas personalizadas
      const existingClassFees = (financialData.class_fees || []).filter(
        (cf: FinancialClassFee) => cf && cf.class_name && Number(cf.amount) > 0
      );

      // Mantém apenas as disciplinas personalizadas
      const existingSubjectFees = (financialData.subject_fees || []).filter(
        (sf: FinancialSubjectFee) => sf && sf.subject_name && Number(sf.amount) > 0
      );

      setSettings({
        ...financialData,
        course_fees: existingCourseFees,
        class_fees: existingClassFees,
        subject_fees: existingSubjectFees
      });

      // Se houver anos configurados, garante que o ano selecionado é válido
      if (financialData.year_fees && financialData.year_fees.length > 0) {
        const hasCurrent = financialData.year_fees.some((y: any) => y.year === currentSystemYear);
        if (!hasCurrent && financialData.year_fees[0]?.year) {
          // pode manter o ano atual do sistema
        }
      }
    } catch (err: any) {
      console.error('Erro ao carregar configurações financeiras:', err);
      if (onNotify) {
        onNotify({ type: 'error', message: 'Erro ao carregar dados financeiros: ' + err.message });
      }
    } finally {
      setLoading(false);
    }
  }, [currentSystemYear, onNotify]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Salvar configurações
  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setSaving(true);
    try {
      await financialConfigService.saveSettings(settings);
      if (onNotify) {
        onNotify({ 
          type: 'success', 
          message: 'Configurações financeiras salvas com sucesso! Valores propagados em todo o sistema.' 
        });
      }
    } catch (err: any) {
      console.error('Erro ao salvar configurações financeiras:', err);
      if (onNotify) {
        onNotify({ type: 'error', message: 'Erro ao salvar configurações financeiras: ' + err.message });
      }
    } finally {
      setSaving(false);
    }
  };

  // ==========================================
  // NAVEGAÇÃO E AJUSTE DO ANO DE REFERÊNCIA
  // ==========================================
  
  // Localiza a taxa do ano atualmente selecionado
  const currentYearConfig = useMemo(() => {
    return settings.year_fees.find(y => Number(y.year) === selectedYear);
  }, [settings.year_fees, selectedYear]);

  // Valor atual efetivo para o ano selecionado (se configurado ou fallback padrão global)
  const currentYearEffectiveAmount = currentYearConfig 
    ? currentYearConfig.amount 
    : (settings.default_monthly_fee || 100);

  const hasSpecificYearFee = !!currentYearConfig;

  // Atualizar valor para o ano selecionado no navegador
  const handleUpdateCurrentYearAmount = (newAmount: number) => {
    const val = Math.max(0, newAmount);
    setSettings(prev => {
      const existingIndex = prev.year_fees.findIndex(y => Number(y.year) === selectedYear);
      let updatedFees = [...prev.year_fees];
      if (existingIndex >= 0) {
        updatedFees[existingIndex] = { year: selectedYear, amount: val };
      } else {
        updatedFees.push({ year: selectedYear, amount: val });
        // Manter ordenado por ano
        updatedFees.sort((a, b) => a.year - b.year);
      }
      return { ...prev, year_fees: updatedFees };
    });
  };

  // Remover a customização do ano selecionado (reverte para usar o padrão global)
  const handleResetCurrentYearAmount = () => {
    setSettings(prev => ({
      ...prev,
      year_fees: prev.year_fees.filter(y => Number(y.year) !== selectedYear)
    }));
  };

  // ==========================================
  // VALORES ESPECÍFICOS POR TURMA OU CURSO
  // ==========================================

  // Cursos disponíveis para adicionar
  const availableCoursesToAdd = useMemo(() => {
    const configuredCourseNames = new Set(
      settings.course_fees.map(cf => cf.course_name.trim().toLowerCase())
    );
    const configuredCourseIds = new Set(
      settings.course_fees.map(cf => cf.course_id).filter(Boolean)
    );

    return courses.filter(course => {
      const matchId = course.id && configuredCourseIds.has(course.id);
      const matchName = course.name && configuredCourseNames.has(course.name.trim().toLowerCase());
      return !matchId && !matchName;
    });
  }, [courses, settings.course_fees]);

  // Turmas disponíveis para adicionar
  const availableClassesToAdd = useMemo(() => {
    const configuredClassIds = new Set(
      (settings.class_fees || []).map(cf => cf.class_id).filter(Boolean)
    );
    const configuredClassNames = new Set(
      (settings.class_fees || []).map(cf => cf.class_name.trim().toLowerCase())
    );

    return classes.filter(cls => {
      const matchId = cls.id && configuredClassIds.has(cls.id);
      const matchName = cls.name && configuredClassNames.has(cls.name.trim().toLowerCase());
      return !matchId && !matchName;
    });
  }, [classes, settings.class_fees]);

  // Disciplinas disponíveis para adicionar
  const availableSubjectsToAdd = useMemo(() => {
    const configuredSubjectIds = new Set(
      (settings.subject_fees || []).map(sf => sf.subject_id).filter(Boolean)
    );
    const configuredSubjectNames = new Set(
      (settings.subject_fees || []).map(sf => sf.subject_name.trim().toLowerCase())
    );

    return subjects.filter(sub => {
      const matchId = sub.id && configuredSubjectIds.has(sub.id);
      const matchName = sub.name && configuredSubjectNames.has(sub.name.trim().toLowerCase());
      return !matchId && !matchName;
    });
  }, [subjects, settings.subject_fees]);

  // Abrir modal de nova mensalidade
  const handleOpenAddFeeModal = () => {
    if (availableClassesToAdd.length > 0) {
      setFeeTargetType('class');
      setSelectedClassId(availableClassesToAdd[0].id);
    } else if (availableSubjectsToAdd.length > 0) {
      setFeeTargetType('subject');
      setSelectedSubjectId(availableSubjectsToAdd[0].id);
    } else if (availableCoursesToAdd.length > 0) {
      setFeeTargetType('course');
      setSelectedCourseId(availableCoursesToAdd[0].id);
    } else {
      setFeeTargetType('class');
      setSelectedClassId('');
      setSelectedSubjectId('');
      setSelectedCourseId('');
    }
    setNewFeeAmount(currentYearEffectiveAmount);
    setShowAddFeeModal(true);
  };

  // Adicionar mensalidade atribuída a Turma, Disciplina ou Curso
  const handleAddFee = () => {
    const amountVal = Number(newFeeAmount) || prevAmountFallback();

    if (feeTargetType === 'class') {
      const classObj = classes.find(c => c.id === selectedClassId);
      if (!classObj && !selectedClassId) {
        if (onNotify) onNotify({ type: 'error', message: 'Selecione uma turma para atribuir a mensalidade.' });
        return;
      }

      const className = classObj ? classObj.name : 'Turma';
      const classId = classObj ? classObj.id : undefined;

      setSettings(prev => ({
        ...prev,
        class_fees: [
          ...(prev.class_fees || []).filter(c => c.class_id !== classId),
          {
            class_id: classId,
            class_name: className,
            amount: amountVal
          }
        ]
      }));

      setShowAddFeeModal(false);
      if (onNotify) {
        onNotify({ 
          type: 'success', 
          message: `Mensalidade de ${formatCurrency(amountVal)} atribuída à turma "${className}".` 
        });
      }
    } else if (feeTargetType === 'subject') {
      const subObj = subjects.find(s => s.id === selectedSubjectId);
      if (!subObj && !selectedSubjectId) {
        if (onNotify) onNotify({ type: 'error', message: 'Selecione uma disciplina para atribuir a mensalidade.' });
        return;
      }

      const subjectName = subObj ? subObj.name : 'Disciplina';
      const subjectId = subObj ? subObj.id : undefined;

      setSettings(prev => ({
        ...prev,
        subject_fees: [
          ...(prev.subject_fees || []).filter(s => s.subject_id !== subjectId),
          {
            subject_id: subjectId,
            subject_name: subjectName,
            amount: amountVal
          }
        ]
      }));

      setShowAddFeeModal(false);
      if (onNotify) {
        onNotify({ 
          type: 'success', 
          message: `Mensalidade de ${formatCurrency(amountVal)} atribuída à disciplina "${subjectName}".` 
        });
      }
    } else {
      const courseObj = courses.find(c => c.id === selectedCourseId);
      if (!courseObj && !selectedCourseId) {
        if (onNotify) onNotify({ type: 'error', message: 'Selecione um curso para atribuir a mensalidade.' });
        return;
      }

      const courseName = courseObj ? courseObj.name : 'Curso';
      const courseId = courseObj ? courseObj.id : undefined;

      setSettings(prev => ({
        ...prev,
        course_fees: [
          ...prev.course_fees.filter(c => c.course_id !== courseId),
          {
            course_id: courseId,
            course_name: courseName,
            amount: amountVal
          }
        ]
      }));

      setShowAddFeeModal(false);
      if (onNotify) {
        onNotify({ 
          type: 'success', 
          message: `Mensalidade de ${formatCurrency(amountVal)} atribuída ao curso "${courseName}".` 
        });
      }
    }
  };

  const prevAmountFallback = () => settings.default_monthly_fee || 100;

  // Atualizar valor de uma turma
  const handleUpdateClassFee = (index: number, newAmount: number) => {
    setSettings(prev => {
      const copy = [...(prev.class_fees || [])];
      copy[index] = { ...copy[index], amount: Math.max(0, newAmount) };
      return { ...prev, class_fees: copy };
    });
  };

  // Excluir atribuição de mensalidade de uma turma
  const handleRemoveClassFee = (index: number) => {
    const removedClassName = (settings.class_fees || [])[index]?.class_name;
    setSettings(prev => ({
      ...prev,
      class_fees: (prev.class_fees || []).filter((_, i) => i !== index)
    }));
    if (onNotify && removedClassName) {
      onNotify({ 
        type: 'success', 
        message: `Turma "${removedClassName}" redefinida. Passará a aplicar o valor padrão definido.` 
      });
    }
  };

  // Atualizar valor de uma disciplina
  const handleUpdateSubjectFee = (index: number, newAmount: number) => {
    setSettings(prev => {
      const copy = [...(prev.subject_fees || [])];
      copy[index] = { ...copy[index], amount: Math.max(0, newAmount) };
      return { ...prev, subject_fees: copy };
    });
  };

  // Excluir atribuição de mensalidade de uma disciplina
  const handleRemoveSubjectFee = (index: number) => {
    const removedSubjectName = (settings.subject_fees || [])[index]?.subject_name;
    setSettings(prev => ({
      ...prev,
      subject_fees: (prev.subject_fees || []).filter((_, i) => i !== index)
    }));
    if (onNotify && removedSubjectName) {
      onNotify({ 
        type: 'success', 
        message: `Disciplina "${removedSubjectName}" redefinida. Passará a aplicar o valor padrão definido.` 
      });
    }
  };

  // Atualizar valor de um curso já cadastrado
  const handleUpdateCourseFee = (index: number, newAmount: number) => {
    setSettings(prev => {
      const copy = [...prev.course_fees];
      copy[index] = { ...copy[index], amount: Math.max(0, newAmount) };
      return { ...prev, course_fees: copy };
    });
  };

  // Excluir atribuição de mensalidade de um curso
  const handleRemoveCourseFee = (index: number) => {
    const removedCourseName = settings.course_fees[index]?.course_name;
    setSettings(prev => ({
      ...prev,
      course_fees: prev.course_fees.filter((_, i) => i !== index)
    }));
    if (onNotify && removedCourseName) {
      onNotify({ 
        type: 'success', 
        message: `Curso "${removedCourseName}" redefinido. Passará a aplicar o valor padrão definido.` 
      });
    }
  };

  // ==========================================
  // ATUALIZAÇÃO DA BASE DE DADOS
  // ==========================================
  const handleCopySql = () => {
    const sql = financialConfigService.getMigrationSql();
    navigator.clipboard.writeText(sql);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2500);
    if (onNotify) {
      onNotify({ type: 'success', message: 'Script SQL de migração copiado para a área de transferência!' });
    }
  };

  const handleApplyMigration = async () => {
    setMigrating(true);
    try {
      await financialConfigService.saveSettings(settings);

      if (isSupabaseConfigured) {
        const { error } = await supabase.from('financial_settings').select('id').limit(1);
        if (error) {
          if (onNotify) {
            onNotify({ 
              type: 'error', 
              message: 'A tabela no banco remoto precisa ser criada via SQL Editor do Supabase. Copie o script SQL abaixo e execute no console do Supabase.' 
            });
          }
        } else {
          if (onNotify) {
            onNotify({ 
              type: 'success', 
              message: 'Tabela financial_settings confirmada e sincronizada com sucesso na base de dados!' 
            });
          }
        }
      } else {
        if (onNotify) {
          onNotify({ 
            type: 'success', 
            message: 'Configurações sincronizadas no ambiente local com sucesso.' 
          });
        }
      }
    } catch (err: any) {
      if (onNotify) {
        onNotify({ type: 'error', message: 'Erro ao verificar migração: ' + err.message });
      }
    } finally {
      setMigrating(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-xs">
        <RefreshCw className="animate-spin text-emerald-600 mx-auto mb-3" size={28} />
        <p className="text-sm font-bold text-slate-700">Carregando parâmetros financeiros do sistema...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Cabeçalho do Módulo Financeiro */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center border border-emerald-100 shrink-0">
            <DollarSign size={24} />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-lg font-black text-slate-900 tracking-tight">
                Valores Padrão de Contribuição e Mensalidades
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                Padrão do Sistema
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1 max-w-2xl leading-relaxed">
              Defina os valores padrão das mensalidades através de <strong>Ano de Referência</strong> e atribua <strong>Valores Específicos por Curso</strong> quando necessário. As definições gravadas aqui são propagadas automaticamente para o Relatório Financeiro, Controle de Inadimplência, Fichas de Alunos e Recibos.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => handleSave()}
          disabled={saving}
          className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl font-black flex items-center gap-2 transition-all shadow-xs active:scale-95 text-xs uppercase tracking-wider shrink-0 cursor-pointer self-start sm:self-center"
        >
          {saving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
          <span>{saving ? 'Gravando...' : 'Salvar Alterações'}</span>
        </button>
      </div>

      {/* Banner Informativo de Propagação */}
      <div className="bg-emerald-50/70 border border-emerald-200/90 rounded-2xl p-4 text-xs text-emerald-950 flex items-start gap-3">
        <ShieldCheck size={18} className="text-emerald-700 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-bold text-emerald-900">
            Propagação Inteligente e Hierarquia Simplificada
          </p>
          <p className="text-emerald-800/90 leading-relaxed">
            Se um curso possuir uma mensalidade atribuída, ela terá prioridade exclusiva. Caso contrário, o sistema utilizará automaticamente o <strong>valor de referência do ano letivo</strong> selecionado e, como base institucional, a mensalidade padrão global.
          </p>
        </div>
      </div>

      {/* Seção 1: Valor Base Global */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <DollarSign size={18} className="text-emerald-600" />
            <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
              1. Mensalidade Padrão Global (Base Institucional)
            </h4>
          </div>
          <span className="text-[11px] text-slate-400 font-medium">Fallback Institucional</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Valor Mensal Base (R$)
            </label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-xs font-bold text-slate-400">R$</span>
              <input
                type="number"
                min="0"
                step="5"
                value={settings.default_monthly_fee}
                onChange={(e) => setSettings(prev => ({ ...prev, default_monthly_fee: Number(e.target.value) || 0 }))}
                className="w-full h-10 pl-9 pr-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-black text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
              />
            </div>
            <p className="text-[10px] text-slate-400 mt-1">Aplicado quando não houver valor específico por ano ou curso.</p>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Dia de Vencimento Padrão
            </label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-xs font-bold text-slate-400">Dia</span>
              <input
                type="number"
                min="1"
                max="31"
                value={settings.due_day || 10}
                onChange={(e) => setSettings(prev => ({ ...prev, due_day: Number(e.target.value) || 10 }))}
                className="w-full h-10 pl-11 pr-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-black text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
              />
            </div>
            <p className="text-[10px] text-slate-400 mt-1">Dia do mês para cálculo de parcelas a vencer.</p>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Multa / Juros Decorrentes (%)
            </label>
            <div className="relative">
              <span className="absolute right-3 top-2.5 text-xs font-bold text-slate-400">%</span>
              <input
                type="number"
                min="0"
                step="0.5"
                value={settings.late_fee_percentage || 0}
                onChange={(e) => setSettings(prev => ({ ...prev, late_fee_percentage: Number(e.target.value) || 0 }))}
                className="w-full h-10 px-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
              />
            </div>
            <p className="text-[10px] text-slate-400 mt-1">Informativo para emissão de carnês e recibos.</p>
          </div>
        </div>
      </div>

      {/* Seção 2: Valor de Referência por Ano (com Navegador Compacto) */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-5">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Calendar size={18} className="text-amber-600" />
            <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
              2. Ano e Valor de Referência
            </h4>
          </div>
          <span className="text-[11px] text-slate-400 font-medium">
            Navegue pelos anos com os botões
          </span>
        </div>

        <p className="text-xs text-slate-500">
          Utilize os botões de navegação para alternar entre os anos letivos e definir ou reajustar o valor da mensalidade de referência para cada exercício.
        </p>

        {/* Card Central com Navegador de Ano */}
        <div className="bg-gradient-to-br from-amber-50/60 via-slate-50 to-white rounded-2xl border border-amber-200/80 p-5 sm:p-6 shadow-xs">
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-6">
            
            {/* Bloco de Navegação do Ano */}
            <div className="flex flex-col items-center sm:items-start gap-2">
              <span className="text-[10px] font-black text-amber-800 uppercase tracking-wider">
                Ano de Referência
              </span>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedYear(prev => prev - 1)}
                  className="w-10 h-10 rounded-xl bg-white hover:bg-amber-100/70 text-slate-700 hover:text-amber-900 border border-slate-200 hover:border-amber-300 flex items-center justify-center transition-all shadow-xs active:scale-95 cursor-pointer"
                  title="Ano Anterior"
                >
                  <ChevronLeft size={20} />
                </button>

                <div className="relative">
                  <input
                    type="number"
                    min="2000"
                    max="2099"
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(Number(e.target.value) || currentSystemYear)}
                    className="w-28 h-10 text-center font-black text-xl text-slate-900 bg-white border border-amber-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 shadow-xs"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedYear(prev => prev + 1)}
                  className="w-10 h-10 rounded-xl bg-white hover:bg-amber-100/70 text-slate-700 hover:text-amber-900 border border-slate-200 hover:border-amber-300 flex items-center justify-center transition-all shadow-xs active:scale-95 cursor-pointer"
                  title="Próximo Ano"
                >
                  <ChevronRight size={20} />
                </button>

                {selectedYear !== currentSystemYear && (
                  <button
                    type="button"
                    onClick={() => setSelectedYear(currentSystemYear)}
                    className="px-2.5 py-2 text-[11px] font-bold text-amber-800 bg-amber-100 hover:bg-amber-200 rounded-xl transition-all cursor-pointer shadow-2xs"
                    title="Ir para o ano atual"
                  >
                    Ano Atual ({currentSystemYear})
                  </button>
                )}
              </div>

              <div className="text-[11px] text-slate-500 mt-0.5">
                {hasSpecificYearFee ? (
                  <span className="inline-flex items-center gap-1 text-emerald-700 font-bold">
                    <CheckCircle2 size={13} /> Valor específico definido para {selectedYear}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-slate-500 font-medium">
                    <Info size={13} className="text-slate-400" /> Herdando padrão institucional (R$ {settings.default_monthly_fee.toFixed(2)})
                  </span>
                )}
              </div>
            </div>

            {/* Bloco de Valor Mensal para o Ano Selecionado */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex-1 max-w-xl">
              <div className="flex-1 min-w-0">
                <label className="block text-[11px] font-black text-slate-700 uppercase tracking-wider mb-1">
                  Valor da Mensalidade em {selectedYear}
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-xs font-bold text-amber-600">R$</span>
                  <input
                    type="number"
                    min="0"
                    step="5"
                    value={currentYearEffectiveAmount}
                    onChange={(e) => handleUpdateCurrentYearAmount(Number(e.target.value) || 0)}
                    className="w-full h-10 pl-9 pr-3 bg-slate-50 border border-slate-200 rounded-xl text-base font-black text-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 shadow-2xs"
                  />
                </div>
                <span className="text-[10px] text-slate-400 mt-1 block">
                  Valor padrão cobrado para turmas e matrículas do ano letivo {selectedYear}.
                </span>
              </div>

              {hasSpecificYearFee && (
                <button
                  type="button"
                  onClick={handleResetCurrentYearAmount}
                  className="px-3 py-2 text-[11px] font-bold text-slate-500 hover:text-red-700 hover:bg-red-50 rounded-xl border border-slate-200 transition-colors flex items-center gap-1.5 self-end sm:self-center cursor-pointer shrink-0"
                  title="Remover ajuste específico deste ano"
                >
                  <RotateCcw size={13} />
                  <span>Redefinir</span>
                </button>
              )}
            </div>

          </div>

          {/* Atalhos rápidos para anos configurados */}
          {settings.year_fees.length > 0 && (
            <div className="mt-4 pt-3 border-t border-amber-200/50 flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Anos com reajuste gravado:
              </span>
              <div className="flex items-center gap-1.5 flex-wrap">
                {settings.year_fees.map(yf => {
                  const isCurrent = yf.year === selectedYear;
                  return (
                    <button
                      key={yf.year}
                      type="button"
                      onClick={() => setSelectedYear(yf.year)}
                      className={cn(
                        "px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-2xs",
                        isCurrent 
                          ? "bg-amber-600 text-white shadow-xs" 
                          : "bg-white text-slate-700 hover:bg-amber-100/70 border border-slate-200"
                      )}
                    >
                      <span>{yf.year}:</span>
                      <span className={cn(isCurrent ? "text-amber-100" : "text-amber-700")}>
                        {formatCurrency(yf.amount)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Seção 3: Valores Específicos por Turma, Disciplina ou Curso */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <GraduationCap size={18} className="text-blue-600" />
            <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
              3. Mensalidades por Turma, Disciplina ou Curso
            </h4>
          </div>

          <button
            type="button"
            onClick={handleOpenAddFeeModal}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-xs active:scale-95"
          >
            <Plus size={14} />
            <span>Adicionar Novo Valor (Turma, Disciplina ou Curso)</span>
          </button>
        </div>

        <p className="text-xs text-slate-500">
          Atribua valores específicos de contribuição diretamente para uma <strong>Turma</strong>, para uma <strong>Disciplina</strong> ou para um <strong>Curso</strong>. Alunos vinculados a essas turmas ou disciplinas pagarão o valor específico determinado aqui.
        </p>

        {/* Banner informativo da regra de valor padrão */}
        <div className="bg-blue-50/70 border border-blue-200/90 rounded-xl p-3.5 flex items-start gap-2.5">
          <Info size={16} className="text-blue-600 shrink-0 mt-0.5" />
          <p className="text-xs text-blue-900 leading-relaxed">
            <strong>Regra Fundamental do Sistema:</strong> Caso não haja uma definição específica de valor de contribuição para uma turma ou disciplina, o sistema aplicará automaticamente o <strong>valor padrão definido</strong> (Ano Letivo {selectedYear}: <strong>{formatCurrency(currentYearEffectiveAmount)}</strong> / Base Institucional: <strong>{formatCurrency(settings.default_monthly_fee)}</strong>).
          </p>
        </div>

        {(!settings.class_fees || settings.class_fees.length === 0) && 
         (!settings.subject_fees || settings.subject_fees.length === 0) && 
         (!settings.course_fees || settings.course_fees.length === 0) ? (
          <div className="p-8 bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-center space-y-2">
            <GraduationCap size={28} className="mx-auto text-slate-300" />
            <p className="text-xs font-bold text-slate-600">
              Nenhuma turma, disciplina ou curso com valor de contribuição diferenciado
            </p>
            <p className="text-[11px] text-slate-400 max-w-md mx-auto">
              Todas as turmas e disciplinas estão utilizando o valor padrão definido ({selectedYear}: {formatCurrency(currentYearEffectiveAmount)}). Se desejar cobrar um valor específico para uma turma, disciplina ou curso, clique em &quot;Adicionar Novo Valor&quot;.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {/* Mensalidades específicas de Turmas */}
            {(settings.class_fees || []).map((cf, index) => (
              <div 
                key={`class-${cf.class_id || index}`}
                className="p-4 bg-emerald-50/50 hover:bg-emerald-50 rounded-xl border border-emerald-200/80 flex items-center justify-between gap-3 transition-all shadow-xs group"
              >
                <div className="min-w-0 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-800 font-black text-xs flex items-center justify-center shrink-0">
                    <School size={18} />
                  </div>
                  <div className="min-w-0">
                    <span className="font-bold text-slate-900 block truncate text-xs sm:text-sm" title={cf.class_name}>
                      {cf.class_name}
                    </span>
                    <span className="text-[10px] font-black text-emerald-700 block uppercase tracking-wide">
                      Turma Específica
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <div className="relative w-28 shrink-0">
                    <span className="absolute left-2.5 top-1.5 text-xs text-slate-400 font-bold">R$</span>
                    <input
                      type="number"
                      min="0"
                      step="5"
                      value={cf.amount}
                      onChange={(e) => handleUpdateClassFee(index, Number(e.target.value) || 0)}
                      className="w-full pl-8 pr-2 py-1 text-right font-black text-emerald-800 bg-white border border-emerald-300 rounded-lg text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition-all shadow-2xs"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => handleRemoveClassFee(index)}
                    className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                    title="Excluir valor desta turma (voltará a aplicar o valor padrão definido)"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}

            {/* Mensalidades específicas de Disciplinas */}
            {(settings.subject_fees || []).map((sf, index) => (
              <div 
                key={`subject-${sf.subject_id || index}`}
                className="p-4 bg-purple-50/50 hover:bg-purple-50 rounded-xl border border-purple-200/80 flex items-center justify-between gap-3 transition-all shadow-xs group"
              >
                <div className="min-w-0 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-800 font-black text-xs flex items-center justify-center shrink-0">
                    <BookOpen size={18} />
                  </div>
                  <div className="min-w-0">
                    <span className="font-bold text-slate-900 block truncate text-xs sm:text-sm" title={sf.subject_name}>
                      {sf.subject_name}
                    </span>
                    <span className="text-[10px] font-black text-purple-700 block uppercase tracking-wide">
                      Disciplina Específica
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <div className="relative w-28 shrink-0">
                    <span className="absolute left-2.5 top-1.5 text-xs text-slate-400 font-bold">R$</span>
                    <input
                      type="number"
                      min="0"
                      step="5"
                      value={sf.amount}
                      onChange={(e) => handleUpdateSubjectFee(index, Number(e.target.value) || 0)}
                      className="w-full pl-8 pr-2 py-1 text-right font-black text-purple-800 bg-white border border-purple-300 rounded-lg text-sm focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-none transition-all shadow-2xs"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => handleRemoveSubjectFee(index)}
                    className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                    title="Excluir valor desta disciplina (voltará a aplicar o valor padrão definido)"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}

            {/* Mensalidades específicas de Cursos */}
            {(settings.course_fees || []).map((cf, index) => (
              <div 
                key={`course-${cf.course_id || index}`}
                className="p-4 bg-slate-50 hover:bg-slate-100/60 rounded-xl border border-slate-200 flex items-center justify-between gap-3 transition-all shadow-xs group"
              >
                <div className="min-w-0 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-800 font-black text-xs flex items-center justify-center shrink-0">
                    <GraduationCap size={18} />
                  </div>
                  <div className="min-w-0">
                    <span className="font-bold text-slate-900 block truncate text-xs sm:text-sm" title={cf.course_name}>
                      {cf.course_name}
                    </span>
                    <span className="text-[10px] font-semibold text-blue-600 block uppercase tracking-wide">
                      Curso Completo
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <div className="relative w-28 shrink-0">
                    <span className="absolute left-2.5 top-1.5 text-xs text-slate-400 font-bold">R$</span>
                    <input
                      type="number"
                      min="0"
                      step="5"
                      value={cf.amount}
                      onChange={(e) => handleUpdateCourseFee(index, Number(e.target.value) || 0)}
                      className="w-full pl-8 pr-2 py-1 text-right font-black text-blue-700 bg-white border border-slate-200 rounded-lg text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all shadow-2xs"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => handleRemoveCourseFee(index)}
                    className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                    title="Excluir valor deste curso (voltará a aplicar o valor padrão definido)"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal / Diálogo: Adicionar Novo Valor de Mensalidade por Turma, Disciplina ou Curso */}
      {showAddFeeModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-xl p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center">
                  <DollarSign size={16} />
                </div>
                <h4 className="text-sm font-black text-slate-900">
                  Nova Mensalidade Específica
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setShowAddFeeModal(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-500">
              Escolha se deseja atribuir o valor de contribuição a uma <strong>Turma</strong>, a uma <strong>Disciplina</strong> ou a um <strong>Curso</strong>.
            </p>

            {/* Alternador de Tipo: Turma, Disciplina ou Curso */}
            <div className="flex items-center p-1 bg-slate-100 rounded-xl gap-1">
              <button
                type="button"
                onClick={() => setFeeTargetType('class')}
                className={cn(
                  "flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer",
                  feeTargetType === 'class'
                    ? "bg-white text-emerald-900 shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                )}
              >
                <School size={14} className={feeTargetType === 'class' ? "text-emerald-600" : ""} />
                <span>Por Turma</span>
              </button>

              <button
                type="button"
                onClick={() => setFeeTargetType('subject')}
                className={cn(
                  "flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer",
                  feeTargetType === 'subject'
                    ? "bg-white text-purple-900 shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                )}
              >
                <BookOpen size={14} className={feeTargetType === 'subject' ? "text-purple-600" : ""} />
                <span>Por Disciplina</span>
              </button>

              <button
                type="button"
                onClick={() => setFeeTargetType('course')}
                className={cn(
                  "flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer",
                  feeTargetType === 'course'
                    ? "bg-white text-blue-900 shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                )}
              >
                <GraduationCap size={14} className={feeTargetType === 'course' ? "text-blue-600" : ""} />
                <span>Por Curso</span>
              </button>
            </div>

            <div className="space-y-3.5">
              {feeTargetType === 'class' ? (
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Turma Selecionada
                  </label>
                  {classes.length === 0 ? (
                    <p className="text-xs text-amber-600 font-medium">
                      Nenhuma turma cadastrada no sistema. Cadastre turmas na aba &quot;Turmas&quot; primeiro.
                    </p>
                  ) : (
                    <select
                      value={selectedClassId}
                      onChange={(e) => setSelectedClassId(e.target.value)}
                      className="w-full h-10 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                    >
                      <option value="">Selecione uma turma...</option>
                      {classes.map(cls => (
                        <option key={cls.id} value={cls.id}>
                          {cls.name} {cls.course ? `(${cls.course})` : ''} {cls.year ? `- ${cls.year}` : ''}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              ) : feeTargetType === 'subject' ? (
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Disciplina Selecionada
                  </label>
                  {subjects.length === 0 ? (
                    <p className="text-xs text-amber-600 font-medium">
                      Nenhuma disciplina cadastrada no sistema. Cadastre disciplinas na aba &quot;Disciplinas&quot; primeiro.
                    </p>
                  ) : (
                    <select
                      value={selectedSubjectId}
                      onChange={(e) => setSelectedSubjectId(e.target.value)}
                      className="w-full h-10 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
                    >
                      <option value="">Selecione uma disciplina...</option>
                      {subjects.map(sub => (
                        <option key={sub.id} value={sub.id}>
                          {sub.name} {sub.code ? `(${sub.code})` : ''} {sub.year ? `- ${sub.year}` : ''}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Curso Acadêmico
                  </label>
                  {courses.length === 0 ? (
                    <p className="text-xs text-amber-600 font-medium">
                      Nenhum curso cadastrado no sistema acadêmico. Cadastre os cursos na aba &quot;Cursos&quot; primeiro.
                    </p>
                  ) : (
                    <select
                      value={selectedCourseId}
                      onChange={(e) => setSelectedCourseId(e.target.value)}
                      className="w-full h-10 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    >
                      <option value="">Selecione um curso...</option>
                      {courses.map(course => (
                        <option key={course.id} value={course.id}>
                          {course.name} {course.code ? `(${course.code})` : ''}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Valor da Mensalidade (R$)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-xs font-bold text-slate-400">R$</span>
                  <input
                    type="number"
                    min="0"
                    step="5"
                    value={newFeeAmount}
                    onChange={(e) => setNewFeeAmount(Number(e.target.value) || 0)}
                    placeholder="100.00"
                    className="w-full h-10 pl-9 pr-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-black text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowAddFeeModal(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleAddFee}
                disabled={feeTargetType === 'class' ? !selectedClassId : feeTargetType === 'subject' ? !selectedSubjectId : !selectedCourseId}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
              >
                Atribuir Mensalidade
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Informação sobre Scripts Centralizados */}
      <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-slate-600">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center shrink-0 border border-indigo-100">
            <Database size={18} />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-800">
              Scripts SQL & DDL Centralizados
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Os scripts de banco de dados, migração da tabela <code className="text-indigo-600 font-mono font-semibold">financial_settings</code> e auditoria foram unificados na aba <strong>Base de Dados</strong>.
            </p>
          </div>
        </div>

        {onOpenDatabaseTab && (
          <button
            type="button"
            onClick={() => onOpenDatabaseTab('financial')}
            className="px-4 py-2 bg-white hover:bg-slate-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-bold transition-all shadow-2xs shrink-0 flex items-center gap-1.5 cursor-pointer self-start sm:self-auto"
          >
            <span>Ver Script na Base de Dados</span>
            <ArrowUpRight size={14} />
          </button>
        )}
      </div>

      {/* Botão de Salvar Rodapé */}
      <div className="flex items-center justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={() => handleSave()}
          disabled={saving}
          className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl font-black flex items-center gap-2 transition-all shadow-md active:scale-95 text-xs uppercase tracking-wider cursor-pointer"
        >
          {saving ? <RefreshCw size={15} className="animate-spin" /> : <Save size={15} />}
          <span>{saving ? 'Gravando Configurações...' : 'Salvar Configurações Financeiras'}</span>
        </button>
      </div>
    </div>
  );
}
