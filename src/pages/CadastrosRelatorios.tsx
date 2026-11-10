import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { 
  FileText, 
  Printer, 
  Download, 
  Search, 
  Users, 
  GraduationCap, 
  BookOpen, 
  Layers, 
  ArrowDownAZ,
  ArrowDown01,
  LayoutList,
  School
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { fetchAll } from '../lib/database';
import { DEFAULT_LOGO } from '../lib/default-logo';
import { drawStandardReportHeader, drawStandardReportFooter } from '../lib/pdfReportHelper';
import { cn, detectSubjectSemester } from '../lib/utils';
import { Student, Teacher, Course, Class, Subject, Enrollment } from '../types';

type ReportTab = 'alunos' | 'professores' | 'cursos' | 'turmas' | 'disciplinas';
type StudentSortBy = 'alphabetical' | 'numeric';
type StudentGroupMode = 'continuous' | 'group_by_class' | 'page_per_class';

interface StudentSheet {
  sheetIndex: number;
  totalSheets: number;
  isFirstSheetOfReport: boolean;
  isFirstSheetOfGroup: boolean;
  classTitle?: string;
  classSubtitle?: string;
  classTotal?: number;
  students: Student[];
}

function formatDisplayPhone(phone?: string) {
  if (!phone) return '---';
  const clean = phone.replace(/\D/g, '');
  if (clean.length === 11) {
    return `(${clean.slice(0, 2)}) ${clean.slice(2, 7)}-${clean.slice(7)}`;
  }
  if (clean.length === 10) {
    return `(${clean.slice(0, 2)}) ${clean.slice(2, 6)}-${clean.slice(6)}`;
  }
  if (clean.length === 12 && clean.startsWith('0')) {
    const d = clean.slice(1);
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  }
  return phone;
}

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

  // Alunos specific configurations: Ordenação e Separação por Turma
  const [studentSortBy, setStudentSortBy] = useState<StudentSortBy>('alphabetical');
  const [studentGroupMode, setStudentGroupMode] = useState<StudentGroupMode>('continuous');

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

  // Sorted Alunos (Ordem Alfabética ou Numérica por Matrícula)
  const sortedStudents = useMemo(() => {
    const list = [...filteredStudents];
    if (studentSortBy === 'numeric') {
      return list.sort((a, b) => {
        const regA = (a.registration_number || '').trim();
        const regB = (b.registration_number || '').trim();
        return regA.localeCompare(regB, undefined, { numeric: true, sensitivity: 'base' });
      });
    } else {
      return list.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pt-BR'));
    }
  }, [filteredStudents, studentSortBy]);

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
  }, [classes, statusFilter, selectedYear, selectedCourseId, searchTerm, courses]);

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

  // Paged sheets calculation for Alunos
  const studentSheets = useMemo<StudentSheet[]>(() => {
    if (sortedStudents.length === 0) {
      return [{
        sheetIndex: 1,
        totalSheets: 1,
        isFirstSheetOfReport: true,
        isFirstSheetOfGroup: true,
        students: []
      }];
    }

    // Modo 1: 1 Turma por Página (Quebra de Página A4 por Turma)
    if (studentGroupMode === 'page_per_class' && selectedClassId === 'all') {
      const groups: { classId: string; className: string; year?: string; students: Student[] }[] = [];
      
      // Classes with students
      classes.forEach(cls => {
        const clsStudents = sortedStudents.filter(s => s.class_id === cls.id);
        if (clsStudents.length > 0) {
          groups.push({
            classId: cls.id,
            className: cls.name,
            year: cls.year,
            students: clsStudents
          });
        }
      });

      // Unallocated students
      const unallocated = sortedStudents.filter(s => !s.class_id || !classes.some(c => c.id === s.class_id));
      if (unallocated.length > 0) {
        groups.push({
          classId: 'none',
          className: 'ALUNOS NÃO ALOCADOS EM TURMA',
          students: unallocated
        });
      }

      // Chunk each group into sheets (30 on first sheet of class, 34 on continuation)
      const rawSheets: Omit<StudentSheet, 'sheetIndex' | 'totalSheets'>[] = [];
      groups.forEach((g, gIdx) => {
        const totalInGroup = g.students.length;
        if (totalInGroup <= 30) {
          rawSheets.push({
            isFirstSheetOfReport: gIdx === 0,
            isFirstSheetOfGroup: true,
            classTitle: g.className,
            classSubtitle: g.year ? `Ano Letivo: ${g.year}` : undefined,
            classTotal: totalInGroup,
            students: g.students
          });
        } else {
          // Sheet 1 of group: 30 items
          rawSheets.push({
            isFirstSheetOfReport: gIdx === 0,
            isFirstSheetOfGroup: true,
            classTitle: g.className,
            classSubtitle: g.year ? `Ano Letivo: ${g.year}` : undefined,
            classTotal: totalInGroup,
            students: g.students.slice(0, 30)
          });
          // Subsequent sheets of group: 34 items
          let offset = 30;
          while (offset < totalInGroup) {
            rawSheets.push({
              isFirstSheetOfReport: false,
              isFirstSheetOfGroup: false,
              classTitle: `${g.className} (Continuação)`,
              classSubtitle: g.year ? `Ano Letivo: ${g.year}` : undefined,
              classTotal: totalInGroup,
              students: g.students.slice(offset, offset + 34)
            });
            offset += 34;
          }
        }
      });

      const totalSheets = Math.max(1, rawSheets.length);
      return rawSheets.map((s, idx) => ({
        ...s,
        sheetIndex: idx + 1,
        totalSheets
      }));
    }

    // Modo 2: Agrupado por Turma (Contínuo) ou Lista Geral Contínua
    // Na folha 1 cabem 32 alunos (devido ao cabeçalho institucional completo).
    // Nas folhas seguintes cabem 36 alunos (devido ao cabeçalho compacto de continuação).
    const rawSheets: Omit<StudentSheet, 'sheetIndex' | 'totalSheets'>[] = [];
    if (sortedStudents.length <= 32) {
      rawSheets.push({
        isFirstSheetOfReport: true,
        isFirstSheetOfGroup: true,
        students: sortedStudents
      });
    } else {
      rawSheets.push({
        isFirstSheetOfReport: true,
        isFirstSheetOfGroup: true,
        students: sortedStudents.slice(0, 32)
      });
      let offset = 32;
      while (offset < sortedStudents.length) {
        rawSheets.push({
          isFirstSheetOfReport: false,
          isFirstSheetOfGroup: false,
          students: sortedStudents.slice(offset, offset + 36)
        });
        offset += 36;
      }
    }

    const totalSheets = Math.max(1, rawSheets.length);
    return rawSheets.map((s, idx) => ({
      ...s,
      sheetIndex: idx + 1,
      totalSheets
    }));
  }, [sortedStudents, studentGroupMode, selectedClassId, classes]);

  // Report Title and Metadata
  const reportConfig = useMemo(() => {
    switch (activeTab) {
      case 'alunos': {
        const orderLabel = studentSortBy === 'numeric' ? 'NUMÉRICA (MATRÍCULA)' : 'ALFABÉTICA (A-Z)';
        let sepLabel = 'LISTAGEM GERAL';
        if (studentGroupMode === 'page_per_class') sepLabel = '1 TURMA POR FOLHA';
        else if (studentGroupMode === 'group_by_class') sepLabel = 'AGRUPADO POR TURMA';

        return {
          title: 'RELAÇÃO GERAL DE ALUNOS',
          totalLabel: 'Total de Alunos',
          count: filteredStudents.length,
          filterText: `STATUS: ${statusFilter.toUpperCase()}  •  TURMA: ${selectedClassId === 'all' ? 'TODAS' : (classes.find(c => c.id === selectedClassId)?.name?.toUpperCase() || 'ESPECÍFICA')}  •  ORDEM: ${orderLabel}  •  ${sepLabel}`
        };
      }
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
  }, [activeTab, statusFilter, selectedClassId, selectedSubjectId, selectedYear, selectedSemester, studentSortBy, studentGroupMode, filteredStudents.length, filteredTeachers.length, filteredCourses.length, filteredClasses.length, filteredSubjects.length, classes, subjects]);

  // Action: Print native HTML (window.print())
  const handlePrintHTML = () => {
    window.print();
  };

  // Action: Export PDF via jsPDF with AutoTable and Aspect-Ratio Corrected Header
  const handleExportPDF = () => {
    try {
      const doc = new jsPDF();
      const margin = 15;

      if (activeTab === 'alunos') {
        const orderLabel = studentSortBy === 'numeric' ? 'NUMÉRICA' : 'ALFABÉTICA';

        if (studentGroupMode === 'page_per_class' && selectedClassId === 'all') {
          // Multiple classes: each class on its own page
          const groups: { classId: string; className: string; year?: string; students: Student[] }[] = [];
          classes.forEach(cls => {
            const clsStudents = sortedStudents.filter(s => s.class_id === cls.id);
            if (clsStudents.length > 0) {
              groups.push({ classId: cls.id, className: cls.name, year: cls.year, students: clsStudents });
            }
          });
          const unallocated = sortedStudents.filter(s => !s.class_id || !classes.some(c => c.id === s.class_id));
          if (unallocated.length > 0) {
            groups.push({ classId: 'none', className: 'ALUNOS NÃO ALOCADOS', students: unallocated });
          }

          groups.forEach((g, gIdx) => {
            if (gIdx > 0) doc.addPage();
            const filterLine = `TURMA: ${g.className.toUpperCase()}  •  ORDEM: ${orderLabel}  •  TOTAL: ${g.students.length} ALUNOS`;
            const startY = drawStandardReportHeader(doc, inst, 'RELAÇÃO DE ALUNOS', filterLine, margin);

            const body = g.students.map(s => [
              s.registration_number || '---',
              s.name.toUpperCase(),
              g.className.toUpperCase(),
              formatDisplayPhone(s.phone_mobile || s.phone_residential),
              s.status || 'Ativo'
            ]);

            autoTable(doc, {
              startY,
              head: [['MATRÍCULA', 'NOME DO ALUNO', 'TURMA', 'CONTATO', 'STATUS']],
              body,
              headStyles: { fillColor: [15, 23, 42], textColor: 255, fontSize: 8, fontStyle: 'bold' },
              styles: { fontSize: 7, cellPadding: 2.5, font: 'helvetica' },
              columnStyles: {
                0: { cellWidth: 26 },
                1: { cellWidth: 68 },
                2: { cellWidth: 46 },
                3: { cellWidth: 25 },
                4: { cellWidth: 15 }
              },
              alternateRowStyles: { fillColor: [248, 250, 252] },
              margin: { left: margin, right: margin, bottom: 25 }
            });
          });
        } else if (studentGroupMode === 'group_by_class' && selectedClassId === 'all') {
          // Grouped with section banners in a continuous table
          const startY = drawStandardReportHeader(doc, inst, reportConfig.title, reportConfig.filterText, margin);
          const body: any[] = [];

          classes.forEach(cls => {
            const clsStudents = sortedStudents.filter(s => s.class_id === cls.id);
            if (clsStudents.length > 0) {
              body.push([{
                content: `TURMA: ${cls.name.toUpperCase()} (${clsStudents.length} ALUNOS)`,
                colSpan: 5,
                styles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: 'bold', fontSize: 7.5 }
              }]);
              clsStudents.forEach(s => {
                body.push([
                  s.registration_number || '---',
                  s.name.toUpperCase(),
                  cls.name.toUpperCase(),
                  formatDisplayPhone(s.phone_mobile || s.phone_residential),
                  s.status || 'Ativo'
                ]);
              });
            }
          });

          const unallocated = sortedStudents.filter(s => !s.class_id || !classes.some(c => c.id === s.class_id));
          if (unallocated.length > 0) {
            body.push([{
              content: `ALUNOS NÃO ALOCADOS (${unallocated.length} ALUNOS)`,
              colSpan: 5,
              styles: { fillColor: [100, 116, 139], textColor: 255, fontStyle: 'bold', fontSize: 7.5 }
            }]);
            unallocated.forEach(s => {
              body.push([
                s.registration_number || '---',
                s.name.toUpperCase(),
                'NÃO ALOCADO',
                formatDisplayPhone(s.phone_mobile || s.phone_residential),
                s.status || 'Ativo'
              ]);
            });
          }

          autoTable(doc, {
            startY,
            head: [['MATRÍCULA', 'NOME DO ALUNO', 'TURMA', 'CONTATO', 'STATUS']],
            body,
            headStyles: { fillColor: [15, 23, 42], textColor: 255, fontSize: 8, fontStyle: 'bold' },
            styles: { fontSize: 7, cellPadding: 2.5, font: 'helvetica' },
            columnStyles: {
              0: { cellWidth: 26 },
              1: { cellWidth: 68 },
              2: { cellWidth: 46 },
              3: { cellWidth: 25 },
              4: { cellWidth: 15 }
            },
            alternateRowStyles: { fillColor: [248, 250, 252] },
            margin: { left: margin, right: margin, bottom: 25 }
          });
        } else {
          // Continuous single list
          const startY = drawStandardReportHeader(doc, inst, reportConfig.title, reportConfig.filterText, margin);
          const body = sortedStudents.map(s => {
            const cls = classes.find(c => c.id === s.class_id);
            return [
              s.registration_number || '---',
              s.name.toUpperCase(),
              cls?.name?.toUpperCase() || 'NÃO ALOCADO',
              formatDisplayPhone(s.phone_mobile || s.phone_residential),
              s.status || 'Ativo'
            ];
          });

          autoTable(doc, {
            startY,
            head: [['MATRÍCULA', 'NOME DO ALUNO', 'TURMA', 'CONTATO', 'STATUS']],
            body,
            headStyles: { fillColor: [15, 23, 42], textColor: 255, fontSize: 8, fontStyle: 'bold' },
            styles: { fontSize: 7, cellPadding: 2.5, font: 'helvetica' },
            columnStyles: {
              0: { cellWidth: 26 },
              1: { cellWidth: 68 },
              2: { cellWidth: 46 },
              3: { cellWidth: 25 },
              4: { cellWidth: 15 }
            },
            alternateRowStyles: { fillColor: [248, 250, 252] },
            margin: { left: margin, right: margin, bottom: 25 }
          });
        }
      } else {
        // Other tabs
        const startY = drawStandardReportHeader(doc, inst, reportConfig.title, reportConfig.filterText, margin);
        let head: string[][] = [];
        let body: any[][] = [];
        let columnStyles: any = {};

        if (activeTab === 'professores') {
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
      }

      drawStandardReportFooter(doc, inst, margin);
      doc.save(`${reportConfig.title.replace(/\s+/g, '_')}_${new Date().getFullYear()}.pdf`);
    } catch (err) {
      console.error('Erro ao gerar PDF:', err);
      alert('Erro ao exportar arquivo PDF. Tente a opção Imprimir Listagem.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Actions Bar (Hidden in Print) */}
      <div className="print:hidden flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-slate-900 text-white rounded-xl shadow-xs">
            <FileText size={22} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">
              Relatórios e Listagens de Cadastros
            </h1>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Impressão padronizada em papel A4 e exportação em alta resolução de todo o corpo acadêmico
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={handlePrintHTML}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold text-xs uppercase tracking-wider transition-all flex items-center gap-2 shadow-xs cursor-pointer active:scale-98"
          >
            <Printer size={15} />
            <span>Imprimir Listagem</span>
          </button>
          <button
            onClick={handleExportPDF}
            className="px-4 py-2 bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 rounded-xl font-bold text-xs uppercase tracking-wider transition-all flex items-center gap-2 shadow-xs cursor-pointer active:scale-98"
          >
            <Download size={15} />
            <span>Baixar PDF</span>
          </button>
        </div>
      </div>

      {/* Tabs Navigation (Hidden in Print) */}
      <div className="print:hidden flex items-center gap-1.5 p-1.5 bg-slate-200/70 rounded-xl overflow-x-auto">
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
          <span className="px-1.5 py-0.2 bg-slate-100 text-slate-700 text-[10px] rounded-md font-mono">
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
          <span className="px-1.5 py-0.2 bg-slate-100 text-slate-700 text-[10px] rounded-md font-mono">
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
          <span className="px-1.5 py-0.2 bg-slate-100 text-slate-700 text-[10px] rounded-md font-mono">
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
          <School size={15} />
          <span>Turmas</span>
          <span className="px-1.5 py-0.2 bg-slate-100 text-slate-700 text-[10px] rounded-md font-mono">
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
          <span className="px-1.5 py-0.2 bg-slate-100 text-slate-700 text-[10px] rounded-md font-mono">
            {subjects.length}
          </span>
        </button>
      </div>

      {/* Filter Controls Bar (Hidden in Print) */}
      <div className="print:hidden bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3.5">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-3 flex-wrap">
          {/* Status Buttons */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg shrink-0">
            <span className="text-[10px] font-bold text-slate-400 uppercase px-2">Status:</span>
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

          {/* Alunos Specific Controls: Ordenação & Separação por Turmas */}
          {activeTab === 'alunos' && (
            <>
              {/* Turma filter dropdown */}
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-[10px] font-bold text-slate-400 uppercase">Turma:</span>
                <select
                  value={selectedClassId}
                  onChange={e => setSelectedClassId(e.target.value)}
                  className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 outline-none focus:ring-1 focus:ring-slate-400"
                >
                  <option value="all">Todas as Turmas</option>
                  {classes.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              {/* Ordenação (Alfabética ou Numérica) */}
              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg shrink-0">
                <span className="text-[10px] font-bold text-slate-400 uppercase px-2">Ordem:</span>
                <button
                  type="button"
                  onClick={() => setStudentSortBy('alphabetical')}
                  className={cn(
                    "px-2.5 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-1.5 cursor-pointer",
                    studentSortBy === 'alphabetical'
                      ? "bg-white text-slate-900 shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  )}
                  title="Ordenar por Nome em Ordem Alfabética (A-Z)"
                >
                  <ArrowDownAZ size={13} />
                  <span>Alfabética</span>
                </button>
                <button
                  type="button"
                  onClick={() => setStudentSortBy('numeric')}
                  className={cn(
                    "px-2.5 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-1.5 cursor-pointer",
                    studentSortBy === 'numeric'
                      ? "bg-white text-slate-900 shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  )}
                  title="Ordenar por Número de Matrícula / Registro Crescente"
                >
                  <ArrowDown01 size={13} />
                  <span>Numérica</span>
                </button>
              </div>

              {/* Separação por Turmas */}
              {selectedClassId === 'all' && (
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Divisão:</span>
                  <select
                    value={studentGroupMode}
                    onChange={e => setStudentGroupMode(e.target.value as StudentGroupMode)}
                    className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-800 outline-none focus:ring-1 focus:ring-slate-400"
                  >
                    <option value="continuous">Lista Corrida (Geral)</option>
                    <option value="group_by_class">Agrupar por Turma</option>
                    <option value="page_per_class">1 Turma por Folha (Quebra de Página)</option>
                  </select>
                </div>
              )}
            </>
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

        {/* Counter & Active Configurations Badge */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-[11px] text-slate-500 pt-2 border-t border-slate-100">
          <span className="font-medium">{reportConfig.filterText}</span>
          <span className="font-semibold text-slate-700">
            {reportConfig.totalLabel}: <strong className="text-slate-950 font-black">{reportConfig.count}</strong> registros encontrados
            {activeTab === 'alunos' && ` • ${studentSheets.length} folha(s) A4 calculada(s)`}
          </span>
        </div>
      </div>

      {/* A4 PRINTABLE DOCUMENT CONTAINER */}
      <div id="printable-cadastral-report" className="flex flex-col items-center gap-6 print:gap-0 print:block">
        {activeTab === 'alunos' ? (
          // Multi-sheet renderer for Alunos
          studentSheets.map((sheet) => (
            <div key={`student-sheet-${sheet.sheetIndex}`} className="w-full flex flex-col items-center">
              {/* Screen page indicator badge (Hidden in print) */}
              <div className="print:hidden w-full max-w-[210mm] flex justify-between items-center text-[10px] text-slate-400 font-bold uppercase tracking-widest px-2 mb-1.5">
                <span>Folha {sheet.sheetIndex} de {sheet.totalSheets}</span>
                <span>{sheet.classTitle ? sheet.classTitle : `Alunos ${sheet.students.length} itens`}</span>
              </div>

              {/* Physical A4 Sheet */}
              <div className="w-full max-w-[210mm] min-h-[297mm] bg-white p-[12mm_15mm_10mm_15mm] border border-slate-200 shadow-md flex flex-col justify-between text-slate-950 font-sans leading-tight relative box-border printable-report-sheet print:shadow-none print:border-none print:m-0">
                {/* HEADER SECTION */}
                <div>
                  {sheet.isFirstSheetOfReport || sheet.isFirstSheetOfGroup ? (
                    // Full Institutional Header
                    <div>
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
                      <div className="text-center mt-3 mb-2">
                        <h2 className="text-[12pt] font-black uppercase tracking-[0.25em] text-slate-900 border-b-2 border-slate-900 pb-1 px-8 inline-block">
                          {sheet.classTitle ? `RELAÇÃO DE ALUNOS` : reportConfig.title}
                        </h2>
                      </div>

                      {/* Class Banner if separated by class */}
                      {sheet.classTitle && (
                        <div className="bg-slate-900 text-white px-3 py-1.5 rounded-xs flex justify-between items-center my-2 uppercase font-bold text-[8pt]">
                          <span>TURMA: {sheet.classTitle}</span>
                          <span className="text-[7pt] text-slate-300">
                            {sheet.classSubtitle || `Total: ${sheet.classTotal || sheet.students.length} alunos`}
                          </span>
                        </div>
                      )}

                      {/* Context Metadata Line */}
                      <div className="flex justify-between items-center text-[7pt] font-bold text-slate-600 mb-2 uppercase">
                        <span>
                          ORDEM: {studentSortBy === 'numeric' ? 'NUMÉRICA (MATRÍCULA)' : 'ALFABÉTICA (A-Z)'}  •  STATUS: {statusFilter.toUpperCase()}
                        </span>
                        <span>EMISSÃO: {new Date().toLocaleString('pt-BR')}</span>
                      </div>
                    </div>
                  ) : (
                    // Compact Repeating Header for Continuation Sheets
                    <div>
                      <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800 text-[8pt]">
                        <div className="flex items-center gap-2">
                          <img
                            src={inst?.logo_url || DEFAULT_LOGO}
                            className="w-8 h-8 object-contain"
                            referrerPolicy="no-referrer"
                            alt="Logo"
                          />
                          <div>
                            <p className="font-extrabold uppercase text-[7.5pt] text-slate-950 leading-none">
                              {inst?.name || 'ESCOLA DIOCESANA DE MINISTÉRIO'}
                            </p>
                            <p className="text-[6.5pt] text-slate-500 font-bold uppercase mt-0.5">
                              {sheet.classTitle ? `RELAÇÃO DE ALUNOS • ${sheet.classTitle}` : `${reportConfig.title} (CONTINUAÇÃO)`}
                            </p>
                          </div>
                        </div>
                        <div className="text-right text-[6.5pt] font-bold text-slate-500 uppercase">
                          <span>ORDEM: {studentSortBy === 'numeric' ? 'NUMÉRICA' : 'ALFABÉTICA'}</span>
                          <span className="mx-1">•</span>
                          <span>FOLHA {sheet.sheetIndex} DE {sheet.totalSheets}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* DATA TABLE */}
                  <div className="overflow-hidden border border-slate-300 rounded-xs">
                    <table className="w-full text-left border-collapse text-[7.5pt]">
                      <thead>
                        <tr className="bg-slate-900 text-white font-bold uppercase text-[7pt]">
                          <th className="py-1.5 px-2 w-[16%]">Matrícula</th>
                          <th className="py-1.5 px-2 w-[38%]">Nome do Aluno</th>
                          <th className="py-1.5 px-2 w-[24%]">Turma</th>
                          <th className="py-1.5 px-2 w-[14%]">Contato</th>
                          <th className="py-1.5 px-2 w-[8%] text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {sheet.students.length > 0 ? (
                          sheet.students.map((s, idx) => {
                            const cls = classes.find(c => c.id === s.class_id);
                            return (
                              <tr key={s.id || idx} className={idx % 2 === 1 ? "bg-slate-50/70" : "bg-white"}>
                                <td className="py-1.5 px-2 font-mono font-bold text-slate-950">
                                  {s.registration_number || '---'}
                                </td>
                                <td className="py-1.5 px-2 font-bold uppercase text-slate-950">
                                  {s.name}
                                </td>
                                <td className="py-1.5 px-2 uppercase text-slate-800 text-[7pt]">
                                  {cls?.name || 'NÃO ALOCADO'}
                                </td>
                                <td className="py-1.5 px-2 text-slate-700 text-[7pt]">
                                  {formatDisplayPhone(s.phone_mobile || s.phone_residential)}
                                </td>
                                <td className="py-1.5 px-2 text-center font-bold text-slate-900">
                                  {s.status || 'Ativo'}
                                </td>
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
                  </div>

                  {/* Subtotal of class if page per class */}
                  {sheet.classTotal && (
                    <div className="mt-1.5 text-right text-[7pt] font-bold text-slate-600 uppercase">
                      Total nesta turma: <strong className="text-slate-950 font-black">{sheet.classTotal}</strong> alunos
                    </div>
                  )}
                </div>

                {/* INSTITUTIONAL FOOTER */}
                <div className="mt-auto pt-3 shrink-0">
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
                        email: {(inst?.email || 'email@email.com.br').toLowerCase()}  •  Página {sheet.sheetIndex} de {sheet.totalSheets}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))
        ) : (
          // Single-page/multi-sheet render for other cadastral entities (Professores, Cursos, Turmas, Disciplinas)
          <div className="w-full flex flex-col items-center">
            <div className="w-full max-w-[210mm] min-h-[297mm] bg-white p-[12mm_15mm_10mm_15mm] border border-slate-200 shadow-md flex flex-col justify-between text-slate-950 font-sans leading-tight relative box-border printable-report-sheet print:shadow-none print:border-none print:m-0">
              <div>
                {/* Institutional Header */}
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
        )}
      </div>
    </div>
  );
}
