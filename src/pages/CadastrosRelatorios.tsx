import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { 
  FileText, 
  Printer, 
  Download, 
  Search, 
  Filter, 
  Users, 
  GraduationCap, 
  BookOpen, 
  Layers, 
  RotateCcw,
  CheckCircle2,
  Calendar,
  AlertCircle
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { fetchAll } from '../lib/database';
import { DEFAULT_LOGO } from '../lib/default-logo';
import { drawStandardReportHeader, drawStandardReportFooter } from '../lib/pdfReportHelper';
import { cn, detectSubjectSemester } from '../lib/utils';
import { Student, Teacher, Course, Class, Subject, Enrollment } from '../types';

type ReportTab = 'alunos' | 'professores' | 'cursos' | 'turmas' | 'disciplinas';

export function CadastrosRelatorios() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = (searchParams.get('tab') as ReportTab) || 'alunos';
  const [activeTab, setActiveTab] = useState<ReportTab>(initialTab);

  // Data states
  const [students, setStudents] = useState<Student[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [inst, setInst] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Common filters
  const [statusFilter, setStatusFilter] = useState<'Todos' | 'Ativo' | 'Inativo'>('Ativo');
  const [searchTerm, setSearchTerm] = useState('');

  // Specific filters
  const [selectedClassId, setSelectedClassId] = useState<string>('all');
  const [selectedCourseId, setSelectedCourseId] = useState<string>('all');
  const [selectedSemester, setSelectedSemester] = useState<string>('all');
  const [selectedYear, setSelectedYear] = useState<string>('all');
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('all');

  // Load database entities
  useEffect(() => {
    async function loadAllData() {
      setLoading(true);
      try {
        const [
          studentsData,
          teachersData,
          coursesData,
          classesData,
          subjectsData,
          enrollmentsData,
          instData
        ] = await Promise.all([
          fetchAll('students', '*', 'name', true),
          fetchAll('teachers', '*', 'name', true),
          fetchAll('courses', '*', 'name', true),
          fetchAll('classes', '*', 'name', true),
          fetchAll('subjects', '*', 'name', true),
          fetchAll('enrollments').catch(() => []),
          fetchAll('institution_settings').catch(() => [])
        ]);

        setStudents(studentsData || []);
        setTeachers(teachersData || []);
        setCourses(coursesData || []);
        setClasses(classesData || []);
        setSubjects(subjectsData || []);
        setEnrollments(enrollmentsData || []);
        if (instData && instData.length > 0) {
          setInst(instData[0]);
        }
      } catch (err) {
        console.error('Erro ao carregar dados para relatórios cadastrais:', err);
      } finally {
        setLoading(false);
      }
    }
    loadAllData();
  }, []);

  // Sync tab with URL
  const handleTabChange = (tab: ReportTab) => {
    setActiveTab(tab);
    setSearchParams({ tab });
    setSearchTerm('');
  };

  // Filtered Alunos
  const filteredStudents = useMemo(() => {
    return students.filter(s => {
      if (statusFilter !== 'Todos' && s.status !== statusFilter) return false;
      if (selectedClassId !== 'all' && s.class_id !== selectedClassId) return false;
      if (selectedYear !== 'all') {
        const c = classes.find(cls => cls.id === s.class_id);
        if (c?.year !== selectedYear) return false;
      }
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const matchesName = s.name?.toLowerCase().includes(term);
        const matchesRa = s.registration_number?.toLowerCase().includes(term);
        const matchesCpf = s.cpf?.replace(/\D/g, '').includes(term.replace(/\D/g, ''));
        if (!matchesName && !matchesRa && !matchesCpf) return false;
      }
      return true;
    });
  }, [students, statusFilter, selectedClassId, selectedYear, searchTerm, classes]);

  // Filtered Professores
  const filteredTeachers = useMemo(() => {
    return teachers.filter(t => {
      if (statusFilter !== 'Todos' && t.status !== statusFilter) return false;
      if (selectedSubjectId !== 'all' && !t.subject_ids?.includes(selectedSubjectId)) return false;
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const matchesName = t.name?.toLowerCase().includes(term);
        const matchesCode = t.code?.toLowerCase().includes(term);
        const matchesEmail = t.email?.toLowerCase().includes(term);
        if (!matchesName && !matchesCode && !matchesEmail) return false;
      }
      return true;
    });
  }, [teachers, statusFilter, selectedSubjectId, searchTerm]);

  // Filtered Cursos
  const filteredCourses = useMemo(() => {
    return courses.filter(c => {
      if (statusFilter !== 'Todos' && c.status !== statusFilter) return false;
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const matchesName = c.name?.toLowerCase().includes(term);
        const matchesCode = c.code?.toLowerCase().includes(term);
        if (!matchesName && !matchesCode) return false;
      }
      return true;
    });
  }, [courses, statusFilter, searchTerm]);

  // Filtered Turmas
  const filteredClasses = useMemo(() => {
    return classes.filter(cls => {
      if (statusFilter !== 'Todos' && cls.status !== statusFilter) return false;
      if (selectedYear !== 'all' && cls.year !== selectedYear) return false;
      if (selectedCourseId !== 'all') {
        const targetCourse = courses.find(c => c.id === selectedCourseId);
        const matchesCourse = cls.course === targetCourse?.name || (cls as any).course_id === selectedCourseId;
        if (!matchesCourse) return false;
      }
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const matchesName = cls.name?.toLowerCase().includes(term);
        const matchesCode = cls.code?.toLowerCase().includes(term);
        if (!matchesName && !matchesCode) return false;
      }
      return true;
    });
  }, [classes, statusFilter, selectedYear, selectedCourseId, searchTerm]);

  // Filtered Disciplinas
  const filteredSubjects = useMemo(() => {
    return subjects.filter(s => {
      if (statusFilter !== 'Todos' && s.status !== statusFilter) return false;
      if (selectedSemester !== 'all') {
        const sem = detectSubjectSemester(s);
        if (!sem.includes(selectedSemester)) return false;
      }
      if (selectedYear !== 'all' && s.year !== selectedYear) return false;
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const matchesName = s.name?.toLowerCase().includes(term);
        const matchesCode = s.code?.toLowerCase().includes(term);
        if (!matchesName && !matchesCode) return false;
      }
      return true;
    });
  }, [subjects, statusFilter, selectedSemester, selectedYear, searchTerm]);

  // Get active report title and metadata
  const reportConfig = useMemo(() => {
    switch (activeTab) {
      case 'alunos':
        return {
          title: 'RELAÇÃO GERAL DE ALUNOS',
          totalLabel: 'Total de Alunos',
          count: filteredStudents.length,
          filterText: `STATUS: ${statusFilter.toUpperCase()}  •  TURMA: ${selectedClassId === 'all' ? 'TODAS' : (classes.find(c => c.id === selectedClassId)?.name?.toUpperCase() || 'ESPECÍFICA')}`
        };
      case 'professores':
        return {
          title: 'RELAÇÃO DE CORPO DOCENTE',
          totalLabel: 'Total de Professores',
          count: filteredTeachers.length,
          filterText: `STATUS: ${statusFilter.toUpperCase()}  •  DISCIPLINA: ${selectedSubjectId === 'all' ? 'TODAS' : (subjects.find(s => s.id === selectedSubjectId)?.name?.toUpperCase() || 'ESPECÍFICA')}`
        };
      case 'cursos':
        return {
          title: 'RELAÇÃO DE CURSOS',
          totalLabel: 'Total de Cursos',
          count: filteredCourses.length,
          filterText: `STATUS: ${statusFilter.toUpperCase()}`
        };
      case 'turmas':
        return {
          title: 'RELAÇÃO DE TURMAS',
          totalLabel: 'Total de Turmas',
          count: filteredClasses.length,
          filterText: `STATUS: ${statusFilter.toUpperCase()}  •  ANO LETIVO: ${selectedYear === 'all' ? 'TODOS' : selectedYear}`
        };
      case 'disciplinas':
        return {
          title: 'RELAÇÃO DE DISCIPLINAS',
          totalLabel: 'Total de Disciplinas',
          count: filteredSubjects.length,
          filterText: `STATUS: ${statusFilter.toUpperCase()}  •  SEMESTRE: ${selectedSemester === 'all' ? 'TODOS' : selectedSemester}`
        };
    }
  }, [activeTab, statusFilter, selectedClassId, selectedSubjectId, selectedYear, selectedSemester, filteredStudents.length, filteredTeachers.length, filteredCourses.length, filteredClasses.length, filteredSubjects.length, classes, subjects]);

  // Action: Print native HTML
  const handlePrintHTML = () => {
    window.print();
  };

  // Action: Export PDF
  const handleExportPDF = () => {
    try {
      const doc = new jsPDF();
      const margin = 15;

      const startY = drawStandardReportHeader(
        doc,
        inst,
        reportConfig.title,
        reportConfig.filterText,
        margin
      );

      let head: string[][] = [];
      let body: any[][] = [];
      let columnStyles: any = {};

      if (activeTab === 'alunos') {
        head = [['MATRÍCULA', 'NOME DO ALUNO', 'TURMA', 'CONTATO', 'STATUS']];
        body = filteredStudents.map(s => {
          const cls = classes.find(c => c.id === s.class_id);
          return [
            s.registration_number || '---',
            s.name.toUpperCase(),
            cls?.name?.toUpperCase() || 'NÃO ALOCADO',
            s.phone_mobile || s.phone_residential || '---',
            s.status || 'Ativo'
          ];
        });
        columnStyles = {
          0: { cellWidth: 26 },
          1: { cellWidth: 68 },
          2: { cellWidth: 46 },
          3: { cellWidth: 25 },
          4: { cellWidth: 15 }
        };
      } else if (activeTab === 'professores') {
        head = [['CÓD.', 'NOME DO PROFESSOR', 'E-MAIL', 'DISCIPLINAS', 'STATUS']];
        body = filteredTeachers.map(t => {
          const tSubList = subjects.filter(s => t.subject_ids?.includes(s.id));
          const subNames = tSubList.map(s => s.name).join(', ') || '---';
          return [
            t.code,
            t.name.toUpperCase(),
            t.email || '---',
            subNames,
            t.status || 'Ativo'
          ];
        });
        columnStyles = {
          0: { cellWidth: 15 },
          1: { cellWidth: 60 },
          2: { cellWidth: 45 },
          3: { cellWidth: 45 },
          4: { cellWidth: 15 }
        };
      } else if (activeTab === 'cursos') {
        head = [['CÓD.', 'NOME DO CURSO', 'DURAÇÃO', 'STATUS']];
        body = filteredCourses.map(c => [
          c.code,
          c.name.toUpperCase(),
          c.duration_total || '---',
          c.status || 'Ativo'
        ]);
        columnStyles = {
          0: { cellWidth: 20 },
          1: { cellWidth: 100 },
          2: { cellWidth: 40 },
          3: { cellWidth: 20 }
        };
      } else if (activeTab === 'turmas') {
        head = [['CÓD.', 'NOME DA TURMA', 'ANO', 'PERÍODO', 'DIAS', 'STATUS']];
        body = filteredClasses.map(c => [
          c.code,
          c.name.toUpperCase(),
          c.year || '---',
          c.period || '---',
          (c.days_of_week || []).join(', ') || '---',
          c.status || 'Ativo'
        ]);
        columnStyles = {
          0: { cellWidth: 20 },
          1: { cellWidth: 70 },
          2: { cellWidth: 20 },
          3: { cellWidth: 25 },
          4: { cellWidth: 30 },
          5: { cellWidth: 15 }
        };
      } else if (activeTab === 'disciplinas') {
        head = [['CÓD.', 'NOME DA DISCIPLINA', 'ANO', 'SEM.', 'PROFESSOR', 'STATUS']];
        body = filteredSubjects.map(s => {
          const teacher = teachers.find(t => t.subject_ids?.includes(s.id));
          return [
            s.code || '---',
            s.name.toUpperCase(),
            s.year ? `${s.year}º Ano` : '---',
            s.semester || '1º Sem.',
            teacher?.name?.toUpperCase() || 'A DEFINIR',
            s.status || 'Ativo'
          ];
        });
        columnStyles = {
          0: { cellWidth: 18 },
          1: { cellWidth: 65 },
          2: { cellWidth: 20 },
          3: { cellWidth: 20 },
          4: { cellWidth: 42 },
          5: { cellWidth: 15 }
        };
      }

      autoTable(doc, {
        startY,
        head,
        body,
        headStyles: { fillColor: [15, 23, 42], textColor: 255, fontSize: 8, fontStyle: 'bold' },
        styles: { fontSize: 7, cellPadding: 2.5, font: 'helvetica' },
        columnStyles,
        alternateRowStyles: { fillColor: [248, 250, 252] },
        margin: { left: margin, right: margin, bottom: 25 }
      });

      drawStandardReportFooter(doc, inst, margin);

      doc.save(`${reportConfig.title.replace(/\s+/g, '_')}_${new Date().getFullYear()}.pdf`);
    } catch (err) {
      console.error('Erro ao gerar PDF:', err);
      alert('Erro ao exportar arquivo PDF. Tente a opção Imprimir Listagem.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner (Hidden in Print) */}
      <div className="print:hidden flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 bg-blue-50 text-blue-700 rounded-lg">
              <FileText size={20} />
            </span>
            <h1 className="text-xl font-black text-slate-900 uppercase tracking-tight">
              Relatórios e Listagens de Cadastros
            </h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Geração, visualização e impressão padronizada das relações cadastrais da instituição no modelo padrão A4.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={handlePrintHTML}
            className="px-4 py-2 bg-slate-900 text-white rounded-lg text-xs font-bold hover:bg-slate-800 transition-all flex items-center gap-2 shadow-sm cursor-pointer"
            title="Imprimir no diálogo do navegador (Padrão A4 Idêntico às Fichas)"
          >
            <Printer size={15} />
            <span>Imprimir Listagem</span>
          </button>
          <button
            onClick={handleExportPDF}
            className="px-4 py-2 bg-white text-slate-700 border border-slate-300 rounded-lg text-xs font-bold hover:bg-slate-50 transition-all flex items-center gap-2 shadow-xs cursor-pointer"
            title="Baixar em arquivo PDF"
          >
            <Download size={15} />
            <span>Baixar PDF</span>
          </button>
        </div>
      </div>

      {/* Tabs Navigation (Hidden in Print) */}
      <div className="print:hidden flex items-center gap-1.5 p-1.5 bg-slate-100 rounded-xl border border-slate-200 overflow-x-auto">
        <button
          onClick={() => handleTabChange('alunos')}
          className={cn(
            "px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 shrink-0 cursor-pointer",
            activeTab === 'alunos'
              ? "bg-white text-slate-900 shadow-xs border border-slate-200/80"
              : "text-slate-600 hover:text-slate-900 hover:bg-white/60"
          )}
        >
          <Users size={15} />
          <span>Alunos</span>
          <span className="px-1.5 py-0.2 bg-slate-100 text-slate-700 text-[10px] rounded-md">
            {students.length}
          </span>
        </button>

        <button
          onClick={() => handleTabChange('professores')}
          className={cn(
            "px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 shrink-0 cursor-pointer",
            activeTab === 'professores'
              ? "bg-white text-slate-900 shadow-xs border border-slate-200/80"
              : "text-slate-600 hover:text-slate-900 hover:bg-white/60"
          )}
        >
          <GraduationCap size={15} />
          <span>Professores</span>
          <span className="px-1.5 py-0.2 bg-slate-100 text-slate-700 text-[10px] rounded-md">
            {teachers.length}
          </span>
        </button>

        <button
          onClick={() => handleTabChange('cursos')}
          className={cn(
            "px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 shrink-0 cursor-pointer",
            activeTab === 'cursos'
              ? "bg-white text-slate-900 shadow-xs border border-slate-200/80"
              : "text-slate-600 hover:text-slate-900 hover:bg-white/60"
          )}
        >
          <Layers size={15} />
          <span>Cursos</span>
          <span className="px-1.5 py-0.2 bg-slate-100 text-slate-700 text-[10px] rounded-md">
            {courses.length}
          </span>
        </button>

        <button
          onClick={() => handleTabChange('turmas')}
          className={cn(
            "px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 shrink-0 cursor-pointer",
            activeTab === 'turmas'
              ? "bg-white text-slate-900 shadow-xs border border-slate-200/80"
              : "text-slate-600 hover:text-slate-900 hover:bg-white/60"
          )}
        >
          <Calendar size={15} />
          <span>Turmas</span>
          <span className="px-1.5 py-0.2 bg-slate-100 text-slate-700 text-[10px] rounded-md">
            {classes.length}
          </span>
        </button>

        <button
          onClick={() => handleTabChange('disciplinas')}
          className={cn(
            "px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 shrink-0 cursor-pointer",
            activeTab === 'disciplinas'
              ? "bg-white text-slate-900 shadow-xs border border-slate-200/80"
              : "text-slate-600 hover:text-slate-900 hover:bg-white/60"
          )}
        >
          <BookOpen size={15} />
          <span>Disciplinas</span>
          <span className="px-1.5 py-0.2 bg-slate-100 text-slate-700 text-[10px] rounded-md">
            {subjects.length}
          </span>
        </button>
      </div>

      {/* Filter Controls Bar (Hidden in Print) */}
      <div className="print:hidden bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
          {/* Status Buttons */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg shrink-0">
            {(['Todos', 'Ativo', 'Inativo'] as const).map(st => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={cn(
                  "px-3 py-1.5 text-xs font-bold rounded-md transition-all cursor-pointer",
                  statusFilter === st
                    ? "bg-white text-slate-900 shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                )}
              >
                {st}
              </button>
            ))}
          </div>

          {/* Tab Specific Dropdowns */}
          {activeTab === 'alunos' && (
            <div className="flex items-center gap-2 flex-1 flex-wrap">
              <select
                value={selectedClassId}
                onChange={e => setSelectedClassId(e.target.value)}
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 outline-none focus:ring-1 focus:ring-slate-400"
              >
                <option value="all">Todas as Turmas</option>
                {classes.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          )}

          {activeTab === 'professores' && (
            <div className="flex items-center gap-2 flex-1 flex-wrap">
              <select
                value={selectedSubjectId}
                onChange={e => setSelectedSubjectId(e.target.value)}
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 outline-none focus:ring-1 focus:ring-slate-400"
              >
                <option value="all">Todas as Disciplinas</option>
                {subjects.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          )}

          {activeTab === 'turmas' && (
            <div className="flex items-center gap-2 flex-1 flex-wrap">
              <select
                value={selectedYear}
                onChange={e => setSelectedYear(e.target.value)}
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 outline-none focus:ring-1 focus:ring-slate-400"
              >
                <option value="all">Todos os Anos</option>
                {Array.from(new Set(classes.map(c => c.year).filter(Boolean))).map(yr => (
                  <option key={yr} value={yr}>{yr}</option>
                ))}
              </select>
            </div>
          )}

          {activeTab === 'disciplinas' && (
            <div className="flex items-center gap-2 flex-1 flex-wrap">
              <select
                value={selectedSemester}
                onChange={e => setSelectedSemester(e.target.value)}
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 outline-none focus:ring-1 focus:ring-slate-400"
              >
                <option value="all">Todos os Semestres</option>
                <option value="1">1º Semestre</option>
                <option value="2">2º Semestre</option>
              </select>
            </div>
          )}

          {/* Search Input */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input
              type="text"
              placeholder={`Filtrar ${reportConfig.title.toLowerCase()}...`}
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium focus:ring-1 focus:ring-slate-400 outline-none"
            />
          </div>
        </div>

        {/* Counter Badge */}
        <div className="flex items-center justify-between text-[11px] text-slate-500 pt-2 border-t border-slate-100">
          <span>{reportConfig.filterText}</span>
          <span>
            {reportConfig.totalLabel}: <strong className="text-slate-900">{reportConfig.count}</strong> registros encontrados
          </span>
        </div>
      </div>

      {/* A4 PRINTABLE DOCUMENT (Both visible on screen as standard A4 preview and active in @media print) */}
      <div className="flex justify-center">
        <div
          id="printable-cadastral-report"
          className="w-full max-w-[210mm] min-h-[297mm] bg-white p-[12mm_15mm_10mm_15mm] border border-slate-200 shadow-md print:border-none print:shadow-none print:p-0 print:m-0 flex flex-col justify-between text-slate-950 font-sans leading-tight relative box-border printable-single-page"
        >
          {/* HEADER SECTION */}
          <div>
            {/* Institutional Header with prominent logo */}
            <div className="flex items-center gap-4 mb-2 pb-2 border-b-2 border-slate-900">
              <div className="flex-shrink-0 w-20 h-20 max-h-20 max-w-20 flex items-center justify-center">
                <img
                  src={inst?.logo_url || DEFAULT_LOGO}
                  className="w-full h-full object-contain max-h-20 max-w-20"
                  referrerPolicy="no-referrer"
                  alt="Brasão Diocesano"
                />
              </div>
              <div className="flex-1 flex flex-col justify-center">
                <p className="text-[8.5pt] font-extrabold tracking-[0.2em] text-slate-600 uppercase leading-none mb-1">
                  {inst?.city_uf ? `DIOCESE DE ${inst.city_uf.split('/')[0].toUpperCase()}` : (inst?.diocese_name || 'DIOCESE DE GUARULHOS')}
                </p>
                <h1 className="text-[14.5pt] font-black uppercase tracking-tight text-slate-950 leading-tight">
                  {inst?.name || 'ESCOLA DIOCESANA DE MINISTÉRIO'}
                </h1>
                <p className="text-[9pt] font-bold text-slate-600 tracking-wider uppercase mt-1">
                  {inst?.subtitle || 'PE. JOSÉ FERNANDO DE BRITO'}
                </p>
              </div>
            </div>

            {/* Centered Document Title with standard underline */}
            <div className="text-center mt-4 mb-3">
              <h2 className="text-[12pt] font-black uppercase tracking-[0.28em] text-slate-900 border-b-2 border-slate-900 pb-1 px-10 inline-block">
                {reportConfig.title}
              </h2>
            </div>

            {/* Context Metadata Line */}
            <div className="flex justify-between items-center text-[7.5pt] font-bold text-slate-600 mb-3 uppercase">
              <span>{reportConfig.filterText}</span>
              <span>EMISSÃO: {new Date().toLocaleString('pt-BR')}</span>
            </div>

            {/* DATA TABLE */}
            <div className="overflow-hidden border border-slate-300 rounded-xs">
              {activeTab === 'alunos' && (
                <table className="w-full text-left border-collapse text-[7.5pt]">
                  <thead>
                    <tr className="bg-slate-900 text-white font-bold uppercase text-[7pt]">
                      <th className="py-2 px-2 w-[15%]">Matrícula</th>
                      <th className="py-2 px-2 w-[40%]">Nome do Aluno</th>
                      <th className="py-2 px-2 w-[25%]">Turma</th>
                      <th className="py-2 px-2 w-[12%]">Contato</th>
                      <th className="py-2 px-2 w-[8%] text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {filteredStudents.length > 0 ? (
                      filteredStudents.map((s, idx) => {
                        const cls = classes.find(c => c.id === s.class_id);
                        return (
                          <tr key={s.id || idx} className={idx % 2 === 1 ? "bg-slate-50/70" : "bg-white"}>
                            <td className="py-1.5 px-2 font-mono font-bold text-slate-950">{s.registration_number || '---'}</td>
                            <td className="py-1.5 px-2 font-bold uppercase text-slate-950">{s.name}</td>
                            <td className="py-1.5 px-2 uppercase text-slate-800">{cls?.name || 'NÃO ALOCADO'}</td>
                            <td className="py-1.5 px-2 text-slate-700">{s.phone_mobile || s.phone_residential || '---'}</td>
                            <td className="py-1.5 px-2 text-center font-bold text-slate-900">{s.status || 'Ativo'}</td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={5} className="py-6 text-center text-slate-400 italic">
                          Nenhum aluno encontrado com os filtros selecionados.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}

              {activeTab === 'professores' && (
                <table className="w-full text-left border-collapse text-[7.5pt]">
                  <thead>
                    <tr className="bg-slate-900 text-white font-bold uppercase text-[7pt]">
                      <th className="py-2 px-2 w-[10%]">Cód.</th>
                      <th className="py-2 px-2 w-[35%]">Nome do Professor</th>
                      <th className="py-2 px-2 w-[25%]">E-mail</th>
                      <th className="py-2 px-2 w-[22%]">Disciplinas</th>
                      <th className="py-2 px-2 w-[8%] text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {filteredTeachers.length > 0 ? (
                      filteredTeachers.map((t, idx) => {
                        const tSubList = subjects.filter(s => t.subject_ids?.includes(s.id));
                        return (
                          <tr key={t.id || idx} className={idx % 2 === 1 ? "bg-slate-50/70" : "bg-white"}>
                            <td className="py-1.5 px-2 font-mono font-bold text-slate-950">{t.code}</td>
                            <td className="py-1.5 px-2 font-bold uppercase text-slate-950">{t.name}</td>
                            <td className="py-1.5 px-2 lowercase text-slate-700">{t.email || '---'}</td>
                            <td className="py-1.5 px-2 uppercase text-slate-800 text-[7pt]">
                              {tSubList.map(s => s.name).join(', ') || '---'}
                            </td>
                            <td className="py-1.5 px-2 text-center font-bold text-slate-900">{t.status || 'Ativo'}</td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={5} className="py-6 text-center text-slate-400 italic">
                          Nenhum professor encontrado com os filtros selecionados.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}

              {activeTab === 'cursos' && (
                <table className="w-full text-left border-collapse text-[7.5pt]">
                  <thead>
                    <tr className="bg-slate-900 text-white font-bold uppercase text-[7pt]">
                      <th className="py-2 px-2 w-[15%]">Cód.</th>
                      <th className="py-2 px-2 w-[55%]">Nome do Curso</th>
                      <th className="py-2 px-2 w-[20%]">Duração</th>
                      <th className="py-2 px-2 w-[10%] text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {filteredCourses.length > 0 ? (
                      filteredCourses.map((c, idx) => (
                        <tr key={c.id || idx} className={idx % 2 === 1 ? "bg-slate-50/70" : "bg-white"}>
                          <td className="py-1.5 px-2 font-mono font-bold text-slate-950">{c.code}</td>
                          <td className="py-1.5 px-2 font-bold uppercase text-slate-950">{c.name}</td>
                          <td className="py-1.5 px-2 text-slate-700">{c.duration_total || '---'}</td>
                          <td className="py-1.5 px-2 text-center font-bold text-slate-900">{c.status || 'Ativo'}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={4} className="py-6 text-center text-slate-400 italic">
                          Nenhum curso encontrado com os filtros selecionados.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}

              {activeTab === 'turmas' && (
                <table className="w-full text-left border-collapse text-[7.5pt]">
                  <thead>
                    <tr className="bg-slate-900 text-white font-bold uppercase text-[7pt]">
                      <th className="py-2 px-2 w-[12%]">Cód.</th>
                      <th className="py-2 px-2 w-[42%]">Nome da Turma</th>
                      <th className="py-2 px-2 w-[12%]">Ano</th>
                      <th className="py-2 px-2 w-[14%]">Período</th>
                      <th className="py-2 px-2 w-[12%]">Dias</th>
                      <th className="py-2 px-2 w-[8%] text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {filteredClasses.length > 0 ? (
                      filteredClasses.map((c, idx) => (
                        <tr key={c.id || idx} className={idx % 2 === 1 ? "bg-slate-50/70" : "bg-white"}>
                          <td className="py-1.5 px-2 font-mono font-bold text-slate-950">{c.code}</td>
                          <td className="py-1.5 px-2 font-bold uppercase text-slate-950">{c.name}</td>
                          <td className="py-1.5 px-2 text-slate-700">{c.year || '---'}</td>
                          <td className="py-1.5 px-2 text-slate-700">{c.period || '---'}</td>
                          <td className="py-1.5 px-2 text-slate-700 text-[6.5pt]">{(c.days_of_week || []).join(', ') || '---'}</td>
                          <td className="py-1.5 px-2 text-center font-bold text-slate-900">{c.status || 'Ativo'}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6} className="py-6 text-center text-slate-400 italic">
                          Nenhuma turma encontrada com os filtros selecionados.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}

              {activeTab === 'disciplinas' && (
                <table className="w-full text-left border-collapse text-[7.5pt]">
                  <thead>
                    <tr className="bg-slate-900 text-white font-bold uppercase text-[7pt]">
                      <th className="py-2 px-2 w-[10%]">Cód.</th>
                      <th className="py-2 px-2 w-[38%]">Nome da Disciplina</th>
                      <th className="py-2 px-2 w-[12%]">Ano</th>
                      <th className="py-2 px-2 w-[12%]">Semestre</th>
                      <th className="py-2 px-2 w-[20%]">Professor</th>
                      <th className="py-2 px-2 w-[8%] text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {filteredSubjects.length > 0 ? (
                      filteredSubjects.map((s, idx) => {
                        const teacher = teachers.find(t => t.subject_ids?.includes(s.id));
                        return (
                          <tr key={s.id || idx} className={idx % 2 === 1 ? "bg-slate-50/70" : "bg-white"}>
                            <td className="py-1.5 px-2 font-mono font-bold text-slate-950">{s.code || '---'}</td>
                            <td className="py-1.5 px-2 font-bold uppercase text-slate-950">{s.name}</td>
                            <td className="py-1.5 px-2 text-slate-700">{s.year ? `${s.year}º Ano` : '---'}</td>
                            <td className="py-1.5 px-2 text-slate-700">{s.semester || '1º Sem.'}</td>
                            <td className="py-1.5 px-2 uppercase text-slate-800 text-[7pt]">
                              {teacher?.name || 'A DEFINIR'}
                            </td>
                            <td className="py-1.5 px-2 text-center font-bold text-slate-900">{s.status || 'Ativo'}</td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={6} className="py-6 text-center text-slate-400 italic">
                          Nenhuma disciplina encontrada com os filtros selecionados.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* FOOTER SECTION */}
          <div className="mt-auto pt-4 shrink-0">
            <div className="border-t-2 border-slate-900 pt-2 pb-0 flex justify-between items-start text-slate-900 uppercase tracking-tight text-[7pt]">
              <div className="flex-1 space-y-0.5">
                <p className="leading-tight font-bold">
                  {inst?.address || 'AV. VENUS, 195 - ITAPEGICA - GUARULHOS/SP'}
                </p>
                <p className="leading-tight font-bold">
                  {inst?.cep ? `CEP: ${inst.cep}` : 'CEP: 07044-170'} {inst?.city_uf ? ` - ${inst.city_uf}` : ' - GUARULHOS/SP'}
                </p>
                <p className="leading-tight font-bold pt-0.5">
                  <span className="normal-case">Telefone: {inst?.phone || '(11) 2421-2935'}</span>
                </p>
              </div>
              <div className="text-right max-w-[380px] leading-tight text-slate-900 font-bold text-[7pt] space-y-0.5 pr-1">
                <p className="whitespace-pre-line uppercase underline underline-offset-2 mb-0.5">Atendimento Secretaria:</p>
                <p className="whitespace-pre-line lowercase font-bold text-[7pt]">{inst?.secretary || 'quarta a sexta-feira das 14h as 18h'}</p>
                <p className="lowercase font-bold text-[7pt] pt-0.5">
                  email: {(inst?.email || 'email@email.com.br').toLowerCase()}  •  Página 1 de 1
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
