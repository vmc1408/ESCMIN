import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  BarChart3, 
  Printer, 
  FileDown, 
  RefreshCw, 
  Search, 
  TrendingUp, 
  Users, 
  GraduationCap, 
  CreditCard,
  Calendar,
  Filter,
  Download,
  X,
  CheckCircle2,
  AlertCircle,
  FileText,
  PieChart as PieChartIcon,
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  ChevronRight,
  Layers,
  Target,
  Clock,
  Briefcase,
  BookOpen,
  DollarSign,
  UserCheck,
  Building2,
  Award,
  BarChart,
  LayoutDashboard,
  CalendarDays,
  ShieldCheck,
  UserMinus,
  Sparkles
} from 'lucide-react';
import { 
  BarChart as ReBarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Cell,
  PieChart,
  Pie,
  LineChart,
  Line,
  AreaChart,
  Area,
  Legend,
  TooltipProps
} from 'recharts';
import { formatCurrency, cn } from '../lib/utils';
import { fetchAll, fetchQuery, fetchById, saveData } from '../lib/database';
import { financialService } from '../services/financialService';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format, subMonths, startOfMonth, endOfMonth, isWithinInterval, parseISO, isSameMonth, startOfYear } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Student, Class, PixTransaction, Teacher, Subject, AcademicParameters } from '../types';

type ReportCategory = 'dashboard' | 'financial' | 'academic' | 'operational' | 'attendance';

export function Reports() {
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<ReportCategory>('dashboard');
  const [institution, setInstitution] = useState<any>(null);
  const [academicParams, setAcademicParams] = useState<AcademicParameters>({
    approval_grade: 7.0,
    recovery_grade: 5.0,
    failure_grade: 4.9,
    absence_limit_percentage: 25,
    updated_at: ''
  });
  const [notification, setNotification] = useState<{ type: 'success' | 'error', message: string } | null>(null);

  // Data States
  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [pixTransactions, setPixTransactions] = useState<PixTransaction[]>([]);
  const [revenueData, setRevenueData] = useState<any[]>([]);
  const [attendanceData, setAttendanceData] = useState<any[]>([]);
  const [totalClassDays, setTotalClassDays] = useState(0);

  // Filter States
  const [teacherStatusFilter, setTeacherStatusFilter] = useState<'Ativo' | 'Inativo' | 'Todos'>('Ativo');
  const [teacherSubjectFilter, setTeacherSubjectFilter] = useState<string>('all');
  const [teacherSortBy, setTeacherSortBy] = useState<'name' | 'code' | 'subject'>('name');
  const [classStatusFilter, setClassStatusFilter] = useState<'Ativo' | 'Inativo' | 'Todos'>('Ativo');
  const [subjectStatusFilter, setSubjectStatusFilter] = useState<'Ativo' | 'Inativo' | 'Todos'>('Ativo');
  const [subjectSemesterFilter, setSubjectSemesterFilter] = useState<string>('Todos');
  
  const [academicYearFilter, setAcademicYearFilter] = useState<string>('Todos');
  
  const [stats, setStats] = useState({
    totalStudents: 0,
    activeStudents: 0,
    inactiveStudents: 0,
    concludedStudents: 0,
    totalTeachers: 0,
    activeTeachers: 0,
    totalClasses: 0,
    totalPixAmount: 0,
    matchedPix: 0,
    revenueGrowth: 0,
    efficiency: 0,
    studentGrowth: 0,
    occupancyRate: 0,
    pixCount: 0
  });

  useEffect(() => {
    fetchInitialData();
    fetchInstitution();
    fetchAcademicParams();
  }, []);

  const fetchAcademicParams = async () => {
    try {
      const data = await fetchAll('academic_parameters', '*', '');
      if (data && data.length > 0) {
        setAcademicParams(data[0] as AcademicParameters);
      }
    } catch (e) {
      console.error('Error fetching academic params:', e);
    }
  };

  const fetchInstitution = async () => {
    try {
      const data = await financialService.getInstitutionSettings();
      if (data) {
        setInstitution(data);
      }
    } catch (e) {
      console.error('Error institution sync:', e);
    }
  };

  const fetchInitialData = async () => {
    setLoading(true);
    try {
      // 1. Fetch all data from Supabase via database utilities
      const [studentsData, teachersData, classesData, subjectsData, pixData, attendancesData, calendarData] = await Promise.all([
        fetchAll('students'),
        fetchAll('teachers'),
        fetchAll('classes'),
        fetchAll('subjects'),
        financialService.getPixReconciliation(),
        fetchAll('attendances'),
        fetchQuery('calendar_events', [
          { field: 'type', operator: '==', value: 'class_day' }
        ])
      ]);

      const normalizedSubjects = (subjectsData || []).map((s: Subject) => {
        let normalized = { ...s };
        if ((!normalized.semester || !normalized.teacher_id || !normalized.year) && normalized.program_content) {
          const match = normalized.program_content.match(/\[METADATA:(.+?)\]/);
          if (match && match[1]) {
            try {
              const meta = JSON.parse(match[1]);
              if (!normalized.semester) normalized.semester = meta.semester;
              if (!normalized.teacher_id) normalized.teacher_id = meta.teacher_id;
              if (!normalized.year) normalized.year = meta.year;
            } catch (e) {
              // ignore
            }
          }
        }
        return normalized;
      });

      const normalizedTeachers = (teachersData || []).map((t: Teacher) => {
        let normalized = { ...t };
        let sIds = normalized.subject_ids || [];
        
        if (typeof sIds === 'string' && (sIds as string).startsWith('{')) {
          sIds = (sIds as string).replace(/[{}]/g, '').split(',').filter(Boolean);
        }
        
        if ((!sIds || sIds.length === 0) && normalized.observations) {
          const match = normalized.observations.match(/\[SUBJECTS:(.+?)\]/);
          if (match && match[1]) {
            try { sIds = JSON.parse(match[1]); } catch (e) {}
          }
        }
        normalized.subject_ids = Array.isArray(sIds) ? sIds : [];
        return normalized;
      });

      setStudents(studentsData || []);
      setTeachers(normalizedTeachers);
      setClasses(classesData || []);
      setSubjects(normalizedSubjects);
      setPixTransactions(pixData || []);
      setAttendanceData(attendancesData || []);
      setTotalClassDays(calendarData?.length || 0);

      // 3. Process Stats
      const sData = studentsData || [];
      const pData = pixData || [];
      const cData = classesData || [];
      const tData = normalizedTeachers;
      const subData = normalizedSubjects;

      const activeTotal = sData.filter(s => s.status === 'Ativo' || !s.status).length;
      const totalAmount = pData.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
      const matchedCount = pData.filter(p => p.status === 'matched').length;

      // 3. Revenue Trend (Last 6 Months)
      const months = Array.from({ length: 6 }).map((_, i) => {
        const d = subMonths(new Date(), 5 - i);
        return {
          month: format(d, 'MMM', { locale: ptBR }),
          fullName: format(d, 'MMMM yyyy', { locale: ptBR }),
          amount: 0,
          date: d
        };
      });

      pData.forEach(p => {
        const pDate = parseISO(p.created_at || (p as any).date);
        months.forEach(m => {
          if (isWithinInterval(pDate, { start: startOfMonth(m.date), end: endOfMonth(m.date) })) {
            m.amount += Number(p.amount);
          }
        });
      });
      setRevenueData(months);

      // Growth Calculation
      const now = new Date();
      const lastMonth = subMonths(now, 1);
      const curMonthRev = months.find(m => isSameMonth(m.date, now))?.amount || 0;
      const prevMonthRev = months.find(m => isSameMonth(m.date, lastMonth))?.amount || 0;
      const growth = prevMonthRev > 0 ? ((curMonthRev - prevMonthRev) / prevMonthRev) * 100 : 0;

      // Real Student Growth
      const studentsNow = sData.filter(s => {
        const d = parseISO(s.created_at);
        return isSameMonth(d, now);
      }).length;
      const studentsPrev = sData.filter(s => {
        const d = parseISO(s.created_at);
        return isSameMonth(d, lastMonth);
      }).length;
      const studentGrowthRate = studentsPrev > 0 ? ((studentsNow - studentsPrev) / studentsPrev) * 100 : 0;

      const activeClasses = cData.filter(c => c.status === 'Ativo');
      const studentsInActiveClasses = sData.filter(s => 
        (s.status === 'Ativo' || !s.status) && 
        s.class_id && 
        activeClasses.some(ac => ac.id === s.class_id)
      ).length;

      const occupancyRate = activeClasses.length > 0 ? Math.round((studentsInActiveClasses / (activeClasses.length * 30)) * 100) : 0;

      setStats({
        totalStudents: sData.length,
        activeStudents: activeTotal,
        inactiveStudents: sData.filter(s => s.status === 'Inativo').length,
        concludedStudents: sData.filter(s => s.status === 'Concluído').length,
        totalTeachers: tData.length,
        activeTeachers: tData.filter(t => t.status !== 'Inativo').length,
        totalClasses: activeClasses.length,
        totalPixAmount: totalAmount,
        matchedPix: matchedCount,
        revenueGrowth: Number(growth.toFixed(1)),
        studentGrowth: Number(studentGrowthRate.toFixed(1)),
        occupancyRate: Math.min(occupancyRate, 100),
        pixCount: pData.length,
        efficiency: pData.length > 0 ? Math.round((matchedCount / pData.length) * 100) : 0
      });

    } catch (error) {
      console.error('Error fetching data:', error);
      setNotification({ type: 'error', message: 'Falha ao carregar dados dos relatórios.' });
    } finally {
      setLoading(false);
    }
  };

  const generateReport = (type: ReportCategory, printOnly: boolean = false) => {
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.width;
      const margin = 15;
      const centerX = pageWidth / 2;
      let y = 15;

      // Professional Header using Institution Data
      let textStartX = margin;
      let logoWidth = 0;

      if (institution?.logo_url) {
        try { 
          doc.addImage(institution.logo_url, 'auto', margin, y, 22, 22); 
          logoWidth = 26;
        } catch (e) {}
      }
      
      textStartX = margin + logoWidth;

      doc.setTextColor(0, 0, 0);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text('DIOCESE DE GUARULHOS', textStartX, y + 5);

      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.text(institution?.name?.toUpperCase() || 'ESCMIN - GESTÃO ESCOLAR', textStartX, y + 13);
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(80);
      doc.text(institution?.subtitle?.toUpperCase() || '', textStartX, y + 18);

      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.8);
      doc.line(margin, y + 25, pageWidth - margin, y + 25);

      y += 40;

      const title = 
        type === 'financial' ? 'RELATÓRIO DE CONTRIBUIÇÕES E CONCILIAÇÃO PIX' :
        type === 'academic' ? 'RELATÓRIO DE MATRÍCULAS E ALOCAÇÃO DE TURMAS' :
        type === 'operational' ? 'RELATÓRIO DOCENTE E GRADE DISCIPLINAR' :
        'SUMÁRIO EXECUTIVO INSTITUCIONAL';

      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text(title, centerX, y, { align: 'center' });
      
      y += 10;

      if (type === 'dashboard') {
        doc.setFontSize(12);
        doc.text('1. INDICADORES DE DESEMPENHO', margin, y);
        autoTable(doc, {
          startY: y + 5,
          head: [['Sessão', 'Métrica', 'Valor']],
          body: [
            ['Acadêmico', 'Total de Alunos', stats.totalStudents.toString()],
            ['Acadêmico', 'Alunos Ativos', stats.activeStudents.toString()],
            ['Financeiro', 'Arrecadação Total', formatCurrency(stats.totalPixAmount)],
            ['Financeiro', 'Crescimento Mensal', `${stats.revenueGrowth}%`],
            ['Operacional', 'Total de Professores', stats.totalTeachers.toString()],
            ['Operacional', 'Turmas Ativas', stats.totalClasses.toString()]
          ],
          headStyles: { fillColor: [0, 23, 75] },
          theme: 'grid'
        });
      }

      if (type === 'financial') {
        doc.setFontSize(12);
        doc.text('1. HISTÓRICO RECENTE DE CONTRIBUIÇÕES (PIX)', margin, y);
        autoTable(doc, {
          startY: y + 5,
          head: [['Data', 'Doador/Pagador', 'Vínculo Aluno', 'Valor', 'Status']],
          body: pixTransactions.slice(0, 30).map(p => [
            format(parseISO(p.created_at || (p as any).date), 'dd/MM/yyyy'),
            p.payer_name.toUpperCase(),
            (p as any).student?.name || 'Não identificado',
            formatCurrency(p.amount),
            p.status === 'matched' ? 'CONCILIADO' : 'PENDENTE'
          ]),
          headStyles: { fillColor: [16, 185, 129] },
          styles: { fontSize: 8 }
        });
      }

      if (type === 'academic') {
        // Group by class
        const rows: any[] = [];
        const filteredClassesReport = filteredClasses;

        filteredClassesReport.forEach(c => {
          const classStudents = students.filter(s => s.class_id === c.id && (s.status === 'Ativo' || !s.status));
          classStudents.forEach((s, idx) => {
            rows.push([
              idx === 0 ? `${c.name} (${c.code})` : '',
              s.registration_number,
              s.name.toUpperCase(),
              s.status || 'Ativo'
            ]);
          });
          if (classStudents.length === 0) {
            rows.push([`${c.name} (${c.code})`, '-', 'Nenhum aluno matriculado', '-']);
          }
        });

        doc.setFontSize(12);
        doc.text('1. MAPA DE MATRÍCULAS POR TURMA', margin, y);
        autoTable(doc, {
          startY: y + 5,
          head: [['Turma', 'Matrícula', 'Nome do Aluno', 'Status']],
          body: rows,
          headStyles: { fillColor: [59, 130, 246] },
          styles: { fontSize: 8 }
        });
      }

      if (type === 'attendance') {
        doc.setFontSize(12);
        doc.text('1. MONITORAMENTO DE FREQUÊNCIA ESCOLAR', margin, y);
        
        const attendanceRows = students.filter(s => s.status === 'Ativo' || !s.status).map(student => {
          const studentAbsences = attendanceData.filter(a => a.student_id === student.id && (a.status === 'F')).length;
          const studentPresence = totalClassDays > 0 ? ((totalClassDays - studentAbsences) / totalClassDays) * 100 : 100;
          const studentClass = classes.find(c => c.id === student.class_id);
          
          return [
            student.name.toUpperCase(),
            studentClass?.name || 'SEM TURMA',
            studentAbsences,
            `${studentPresence.toFixed(1)}%`,
            studentPresence < (100 - (academicParams.absence_limit_percentage || 25)) ? 'RISCO' : 'REGULAR'
          ];
        });

        autoTable(doc, {
          startY: y + 5,
          head: [['Estudante', 'Turma', 'Faltas', 'Freq. %', 'Status']],
          body: attendanceRows,
          headStyles: { fillColor: [245, 158, 11] },
          styles: { fontSize: 8 }
        });
      }

      if (type === 'operational') {
        doc.setFontSize(12);
        doc.text('1. RELATÓRIO DE CORPO DOCENTE', margin, y);

        const filteredTeachersReport = filteredTeachers;

        autoTable(doc, {
          startY: y + 5,
          head: [['Código', 'Nome do Professor', 'E-mail', 'Disciplinas', 'Status']],
          body: filteredTeachersReport.map(t => {
            const teacherSubjects = subjects
              .filter(s => t.subject_ids?.includes(s.id))
              .map(s => s.name)
              .join(', ');

            return [
              t.code, 
              t.name.toUpperCase(), 
              t.email, 
              teacherSubjects || '---',
              (t as any).status || 'Ativo'
            ];
          }),
          headStyles: { fillColor: [124, 58, 237] },
          styles: { fontSize: 8 }
        });

        y = (doc as any).lastAutoTable.finalY + 15;
        doc.text('2. GRADE DE DISCIPLINAS', margin, y);
        
        const filteredSubjectsReport = filteredSubjects;

        autoTable(doc, {
          startY: y + 5,
          head: [['Código', 'Disciplina', 'Status']],
          body: filteredSubjectsReport.map(s => [s.code, s.name.toUpperCase(), s.status || 'Ativo']),
          headStyles: { fillColor: [124, 58, 237] },
          styles: { fontSize: 9 }
        });
      }

      // Observations / Receipt Message
      if (institution?.receipt_message) {
        y = (doc as any).lastAutoTable?.finalY ? (doc as any).lastAutoTable.finalY + 15 : y + 20;
        
        // Check for page overflow
        if (y > doc.internal.pageSize.height - 60) {
          doc.addPage();
          y = 20;
        }

        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0, 23, 75);
        doc.text('OBSERVAÇÕES:', margin, y);
        
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100);
        const splitObs = doc.splitTextToSize(institution.receipt_message, pageWidth - margin * 2);
        doc.text(splitObs, margin, y + 5);
      }

      // Footer with Branding and Signature
      const footerY = doc.internal.pageSize.height - 40;
      doc.setDrawColor(200);
      doc.line(margin + 10, footerY, margin + 70, footerY);
      doc.line(pageWidth - margin - 70, footerY, pageWidth - margin - 10, footerY);
      doc.setFontSize(7);
      doc.text('ASSINATURA DA DIRETORIA', margin + 40, footerY + 5, { align: 'center' });
      doc.text('ASSINATURA DA SECRETARIA', pageWidth - margin - 40, footerY + 5, { align: 'center' });

      const pageCount = (doc as any).internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        
        const footerY = doc.internal.pageSize.height - 25;
        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(0.5);
        doc.line(margin, footerY, pageWidth - margin, footerY);

        doc.setFontSize(7);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0);
        
        const addressLine = [
          institution?.address,
          institution?.cep ? `CEP: ${institution.cep}` : '',
          institution?.city_uf
        ].filter(Boolean).join(' - ');
        
        doc.text(addressLine.toUpperCase(), margin, footerY + 5);

        const contactLine = [
          institution?.phone ? `TEL: ${institution.phone}` : '',
          institution?.email ? `EMAIL: ${institution.email.toLowerCase()}` : ''
        ].filter(Boolean).join('  |  ');
        doc.text(contactLine.toUpperCase(), margin, footerY + 9);

        if (institution?.secretary) {
          doc.setFontSize(7);
          doc.text('ATENDIMENTO SECRETARIA:', pageWidth - margin, footerY + 5, { align: 'right' });
          doc.setFont('helvetica', 'normal');
          doc.text(institution.secretary.toLowerCase(), pageWidth - margin, footerY + 9, { align: 'right' });
        }

        doc.setFontSize(6);
        doc.setTextColor(150);
        doc.text(`Página ${i} de ${pageCount} | Intelligence ESCMIN`, centerX, doc.internal.pageSize.height - 8, { align: 'center' });
      }

      if (printOnly) {
        doc.autoPrint();
        const blob = doc.output('blob');
        const url = URL.createObjectURL(blob);
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        iframe.src = url;
        document.body.appendChild(iframe);
        iframe.onload = () => {
          setTimeout(() => {
            iframe.contentWindow?.print();
            setTimeout(() => {
              URL.revokeObjectURL(url);
              document.body.removeChild(iframe);
            }, 1000);
          }, 500);
        };
      } else {
        doc.save(`Relatorio_${type}_${format(new Date(), 'yyyyMMdd')}.pdf`);
      }
      setNotification({ type: 'success', message: printOnly ? 'Janela de impressão aberta.' : 'Expedição do relatório concluída.' });
    } catch (e) {
      console.error(e);
      setNotification({ type: 'error', message: 'Erro ao processar o relatório PDF.' });
    }
  };

  // Filtered Data Memos for Operational Report
  const filteredTeachers = useMemo(() => {
    return teachers.filter(t => {
      const statusMatch = teacherStatusFilter === 'Todos' || (t as any).status === teacherStatusFilter || (teacherStatusFilter === 'Ativo' && !(t as any).status);
      const subjectMatch = teacherSubjectFilter === 'all' || (t.subject_ids || []).includes(teacherSubjectFilter);
      return statusMatch && subjectMatch;
    }).sort((a, b) => {
      if (teacherSortBy === 'code') return a.code.localeCompare(b.code);
      if (teacherSortBy === 'subject') {
        const subA = subjects.find(s => a.subject_ids?.includes(s.id))?.name || '';
        const subB = subjects.find(s => b.subject_ids?.includes(s.id))?.name || '';
        return subA.localeCompare(subB);
      }
      return a.name.localeCompare(b.name);
    });
  }, [teachers, teacherStatusFilter, teacherSubjectFilter, teacherSortBy, subjects]);

  const filteredSubjects = useMemo(() => {
    return subjects.filter(s => {
      const statusMatch = subjectStatusFilter === 'Todos' || (s.status || 'Ativo') === subjectStatusFilter;
      
      const sem = s.semester?.trim();
      const filterSem = subjectSemesterFilter.trim();

      const semesterMatch = subjectSemesterFilter === 'Todos' || 
        sem === filterSem ||
        (sem === '1º Semestre' && filterSem === '1º Sem.') ||
        (sem === '2º Semestre' && filterSem === '2º Sem.') ||
        (sem === '1º Sem.' && filterSem === '1º Semestre') ||
        (sem === '2º Sem.' && filterSem === '2º Semestre');
        
      return statusMatch && semesterMatch;
    });
  }, [subjects, subjectStatusFilter, subjectSemesterFilter]);

  const filteredClasses = useMemo(() => {
    const result = classes.filter(c => {
      const statusMatch = classStatusFilter === 'Todos' || (c.status || 'Ativo') === classStatusFilter;
      const yearMatch = academicYearFilter === 'Todos' || c.year === academicYearFilter;
      return statusMatch && yearMatch;
    });

    return [...result].sort((a, b) => {
      const extract = (s: string) => {
        const match = s.match(/\d+/);
        const yrStr = match ? match[0] : '0';
        let yr = parseInt(yrStr);
        if (yrStr.length === 2) yr += 2000;
        const name = s.replace(/\d+/, '').trim().toLowerCase();
        return { yr, name };
      };
      const infoA = extract(a.name || '');
      const infoB = extract(b.name || '');
      if (infoA.name !== infoB.name) return infoA.name.localeCompare(infoB.name);
      return infoB.yr - infoA.yr;
    });
  }, [classes, classStatusFilter, academicYearFilter]);

  const statusData = useMemo(() => [
    { name: 'Ativos', value: stats.activeStudents, color: '#10b981' },
    { name: 'Inativos', value: stats.inactiveStudents, color: '#f59e0b' },
    { name: 'Concluídos', value: stats.concludedStudents, color: '#3b82f6' }
  ], [stats]);

  const studentsByClass = useMemo(() => {
    const activeClasses = classes.filter(c => c.status === 'Ativo');
    const activeStudents = students.filter(s => s.status === 'Ativo' || !s.status);
    
    const classStats = activeClasses.map(c => {
      const count = activeStudents.filter(s => s.class_id === c.id).length;
      return {
        id: c.id,
        code: c.code,
        name: c.name,
        period: c.period,
        count,
        percentage: stats.activeStudents > 0 ? Math.round((count / stats.activeStudents) * 100) : 0
      };
    });

    const activeClassIds = new Set(activeClasses.map(c => c.id));
    const unallocatedCount = activeStudents.filter(s => !s.class_id || !activeClassIds.has(s.class_id)).length;

    if (unallocatedCount > 0) {
      classStats.push({
        id: 'unallocated',
        code: 'S/T',
        name: 'Sem Turma / Turma Inativa',
        period: '---' as any,
        count: unallocatedCount,
        percentage: stats.activeStudents > 0 ? Math.round((unallocatedCount / stats.activeStudents) * 100) : 0
      });
    }

    // Sort by Name (A-Z) and Year (Desc)
    return [...classStats].sort((a, b) => {
      // First sort by unallocated status (move to end)
      const isUnallocatedA = a.id === 'unallocated';
      const isUnallocatedB = b.id === 'unallocated';
      if (isUnallocatedA && !isUnallocatedB) return 1;
      if (!isUnallocatedA && isUnallocatedB) return -1;

      const extract = (s: string) => {
        const match = s.match(/\d+/);
        const yrStr = match ? match[0] : '0';
        let yr = parseInt(yrStr);
        if (yrStr.length === 2) yr += 2000;
        const name = s.replace(/\d+/, '').trim().toLowerCase();
        return { yr, name };
      };
      const infoA = extract(a.name || '');
      const infoB = extract(b.name || '');
      if (infoA.name !== infoB.name) return infoA.name.localeCompare(infoB.name);
      return infoB.yr - infoA.yr;
    });
  }, [classes, students, stats.activeStudents]);

  const recentPix = useMemo(() => {
    return pixTransactions.map(p => ({
      ...p,
      student: students.find(s => s.id === p.matched_student_id)
    })).slice(0, 10);
  }, [pixTransactions, students]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Activity size={48} className="animate-spin text-[#00174b]" />
        <p className="font-black text-slate-400 uppercase tracking-widest text-[10px]">Processando Inteligência de Dados...</p>
      </div>
    );
  }

  const handlePrint = () => {
    generateReport(activeCategory, true);
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] pb-20">
      {/* Notification */}
      {notification && (
        <div className={cn(
          "fixed top-6 right-6 z-[200] px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-4 print:hidden",
          notification.type === 'success' ? "bg-emerald-600 text-white" : "bg-rose-600 text-white"
        )}>
          {notification.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
          <p className="font-bold text-sm tracking-tight">{notification.message}</p>
          <button onClick={() => setNotification(null)} className="ml-2 opacity-70 hover:opacity-100">
            <X size={16} />
          </button>
        </div>
      )}

      {/* Modern Sticky Header */}
      <div className="bg-white border-b border-slate-200 px-8 py-6 mb-8 sticky top-0 z-40 shadow-sm print:hidden">
        <div className="max-w-[1920px] mx-auto flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-[#00174b] rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-900/20">
              <BarChart3 size={32} />
            </div>
            <div>
              <h1 className="text-3xl font-black text-[#00174b] tracking-tighter">ESCMIN Intelligence</h1>
              <div className="flex items-center gap-2 text-slate-400 font-bold text-[10px] uppercase tracking-[0.2em]">
                <Activity size={12} className="text-emerald-500" />
                Monitoramento em Tempo Real
              </div>
            </div>
          </div>
          
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
              {(['dashboard', 'financial', 'academic', 'attendance', 'operational'] as ReportCategory[]).map((cat) => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={cn(
                    "px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                    activeCategory === cat 
                      ? "bg-white text-[#00174b] shadow-md" 
                      : "text-slate-500 hover:text-slate-700"
                  )}
                >
                  {cat === 'dashboard' ? 'Estratégico' : cat === 'financial' ? 'Financeiro' : cat === 'academic' ? 'Matrículas' : cat === 'attendance' ? 'Frequência' : 'Professores'}
                </button>
              ))}
            </div>
            <div className="h-10 w-[1px] bg-slate-200 mx-2 hidden lg:block"></div>
            <button 
              onClick={handlePrint}
              className="p-3.5 bg-white border border-slate-200 text-slate-600 rounded-2xl hover:bg-slate-50 transition-all shadow-sm active:scale-95"
              title="Imprimir Relatório"
            >
              <Printer size={20} />
            </button>
            <button 
              onClick={() => generateReport(activeCategory)}
              className="px-8 py-3.5 bg-[#00174b] text-white text-[11px] font-black uppercase tracking-[0.15em] rounded-2xl flex items-center gap-3 hover:opacity-95 transition-all shadow-2xl shadow-blue-900/30 active:scale-95"
            >
              <FileDown size={20} />
              Exportar Relatório
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-[1920px] mx-auto px-8 space-y-4 print:hidden">
        {activeCategory === 'dashboard' && (
          <>
        {/* KPI Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm relative group hover:shadow-xl transition-all duration-500">
            <div className="flex items-center justify-between mb-6">
              <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                <Users size={28} />
              </div>
              <div className={cn(
                "flex items-center gap-1 font-black text-[10px] px-2.5 py-1.5 rounded-xl bg-emerald-50 text-emerald-600"
              )}>
                {stats.activeStudents} Ativos
              </div>
            </div>
            <p className="text-4xl font-black text-[#00174b] tracking-tighter mb-1">{stats.activeStudents}</p>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Gestão de Alunos Ativos</p>
          </div>

          <div className="bg-white p-8 rounded-2xl border border-slate-100 shadow-sm relative group hover:shadow-xl transition-all duration-500">
            <div className="flex items-center justify-between mb-6">
              <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                <CreditCard size={28} />
              </div>
              <div className={cn(
                "flex items-center gap-1 font-black text-[10px] px-2.5 py-1.5 rounded-xl",
                stats.revenueGrowth >= 0 ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
              )}>
                {stats.revenueGrowth >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                {Math.abs(stats.revenueGrowth)}%
              </div>
            </div>
            <p className="text-4xl font-black text-[#00174b] tracking-tighter mb-1">{formatCurrency(stats.totalPixAmount)}</p>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Receita Acumulada</p>
            <p className="mt-4 text-[10px] text-slate-500 font-bold flex items-center gap-2">
              <Target size={12} className="text-emerald-500" />
              Projeção de Arrecadação: {formatCurrency(stats.activeStudents * 100)}
            </p>
          </div>

          <div className="bg-white p-8 rounded-2xl border border-slate-100 shadow-sm relative group hover:shadow-xl transition-all duration-500">
            <div className="flex items-center justify-between mb-6">
              <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                <Layers size={28} />
              </div>
              <div className="bg-emerald-50 text-emerald-600 font-black text-[10px] px-2.5 py-1.5 rounded-xl uppercase">Ativas</div>
            </div>
            <p className="text-4xl font-black text-[#00174b] tracking-tighter mb-1">{stats.totalClasses}</p>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Turmas e Professores Ativos</p>
            <div className="mt-6 flex items-center gap-2">
              <div className="flex -space-x-2">
                {[1,2,3].map(i => <div key={i} className="w-6 h-6 rounded-full bg-slate-200 border-2 border-white"></div>)}
              </div>
              <span className="text-[10px] font-bold text-slate-400">Operação Acadêmica</span>
            </div>
          </div>

          <div className="bg-white p-8 rounded-2xl border border-slate-100 shadow-sm relative group hover:shadow-xl transition-all duration-500">
            <div className="flex items-center justify-between mb-6">
              <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                <Target size={28} />
              </div>
              <div className="bg-amber-50 text-amber-600 font-black text-[10px] px-2.5 py-1.5 rounded-xl uppercase">Eficiência</div>
            </div>
            <p className="text-4xl font-black text-[#00174b] tracking-tighter mb-1">{stats.occupancyRate}%</p>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Taxa de Ocupação</p>
            <p className="mt-4 text-[10px] text-slate-500 font-bold flex items-center gap-2">
              <Clock size={12} className="text-amber-500" />
              Última atualização: Agora
            </p>
          </div>
        </div>

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
            <div className="flex flex-col md:flex-row md:items-center justify-between mb-10 gap-4">
              <div>
                <h3 className="text-xl font-black text-[#00174b] tracking-tight">Análise de Fluxo Financeiro</h3>
                <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em]">Evolução Mensal de Arrecadação Pix</p>
              </div>
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-blue-500 shadow-lg shadow-blue-500/50"></div>
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Receita Bruta</span>
                </div>
              </div>
            </div>
            <div className="h-[350px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={revenueData}>
                  <defs>
                    <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15}/>
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis 
                    dataKey="month" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fontSize: 10, fontWeight: 800, fill: '#64748b' }}
                    dy={15}
                  />
                  <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fontSize: 10, fontWeight: 800, fill: '#64748b' }}
                    tickFormatter={(value) => value >= 1000 ? `R$ ${(value/1000).toFixed(1)}k` : `R$ ${value}`}
                  />
                  <Tooltip 
                    contentStyle={{ borderRadius: '24px', border: 'none', boxShadow: '0 25px 50px -12px rgb(0 0 0 / 0.15)', padding: '15px' }}
                    itemStyle={{ fontSize: '12px', fontWeight: '900', color: '#00174b' }}
                    formatter={(value: any) => [formatCurrency(value), 'Arrecadação']}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="amount" 
                    stroke="#3b82f6" 
                    strokeWidth={5}
                    fillOpacity={1} 
                    fill="url(#colorRev)" 
                    animationDuration={2000}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col order-last md:order-none lg:order-last">
            <h3 className="text-xl font-black text-[#00174b] tracking-tight mb-2">Composição da Base</h3>
            <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em] mb-10">Distribuição por Status</p>
            
            <div className="flex-1 flex flex-col justify-center">
              <div className="h-[250px] w-full relative mb-10">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={statusData}
                      cx="50%"
                      cy="50%"
                      innerRadius={75}
                      outerRadius={100}
                      paddingAngle={10}
                      dataKey="value"
                      stroke="none"
                    >
                      {statusData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-4xl font-black text-[#00174b] tracking-tighter">{stats.totalStudents}</span>
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Alunos</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {statusData.map((item, i) => (
                  <div key={i} className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-2.5 h-2.5 rounded-full shadow-sm" style={{ backgroundColor: item.color }}></div>
                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">{item.name}</span>
                    </div>
                    <span className="text-lg font-black text-[#00174b]">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* AI Insights Section */}
        <div className="bg-gradient-to-br from-[#00174b] to-[#002b8a] rounded-3xl p-6 text-white shadow-2xl shadow-blue-900/40 relative overflow-hidden group">
          <div className="relative z-10">
            <div className="flex items-center gap-4 mb-8">
              <div className="w-12 h-12 bg-white/10 backdrop-blur-md rounded-2xl flex items-center justify-center border border-white/10">
                <Target className="text-blue-400" size={24} />
              </div>
              <div>
                <h3 className="text-xl font-black tracking-tight">Insights Estratégicos</h3>
                <p className="text-blue-200/60 text-[10px] font-black uppercase tracking-[0.2em]">Análise Automatizada de Dados</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-4 p-6 bg-white/5 rounded-[2rem] border border-white/5 hover:bg-white/10 transition-all">
                <div className="flex items-center gap-3 text-emerald-400">
                  <TrendingUp size={20} />
                  <span className="text-xs font-black uppercase tracking-widest">Desempenho Financeiro</span>
                </div>
                <p className="text-sm text-blue-100/80 leading-relaxed">
                  A receita via Pix apresentou um crescimento de <span className="text-white font-black">{stats.revenueGrowth}%</span> este mês. 
                  A eficiência de conciliação está em <span className="text-white font-black">{stats.pixCount > 0 ? Math.round((stats.matchedPix / stats.pixCount) * 100) : 0}%</span>, 
                  reduzindo significativamente o trabalho manual da secretaria.
                </p>
              </div>

              <div className="space-y-4 p-6 bg-white/5 rounded-[2rem] border border-white/5 hover:bg-white/10 transition-all">
                <div className="flex items-center gap-3 text-blue-400">
                  <Users size={20} />
                  <span className="text-xs font-black uppercase tracking-widest">Retenção Acadêmica</span>
                </div>
                <p className="text-sm text-blue-100/80 leading-relaxed">
                  Com <span className="text-white font-black">{stats.activeStudents}</span> alunos ativos, a taxa de ocupação é de <span className="text-white font-black">{stats.occupancyRate}%</span>. 
                  O crescimento da base de alunos foi de <span className="text-white font-black">{stats.studentGrowth}%</span>, 
                  indicando uma tendência positiva de novas matrículas.
                </p>
              </div>

              <div className="space-y-4 p-6 bg-white/5 rounded-[2rem] border border-white/5 hover:bg-white/10 transition-all">
                <div className="flex items-center gap-3 text-purple-400">
                  <Activity size={20} />
                  <span className="text-xs font-black uppercase tracking-widest">Capacidade Operacional</span>
                </div>
                <p className="text-sm text-blue-100/80 leading-relaxed">
                  A média de <span className="text-white font-black">{stats.totalClasses > 0 ? Math.round(stats.totalStudents / stats.totalClasses) : 0}</span> alunos por turma 
                  está dentro do limite ideal de ensino. A proporção aluno/professor é de <span className="text-white font-black">{stats.totalTeachers > 0 ? (stats.totalStudents / stats.totalTeachers).toFixed(1) : '0'}</span>, 
                  garantindo atenção individualizada.
                </p>
              </div>
            </div>
          </div>
          
          {/* Decorative background elements */}
          <div className="absolute -right-20 -top-20 w-80 h-80 bg-blue-500/20 rounded-full blur-[100px] group-hover:bg-blue-500/30 transition-all duration-1000"></div>
          <div className="absolute -left-20 -bottom-20 w-80 h-80 bg-blue-500/20 rounded-full blur-[100px] group-hover:bg-blue-500/30 transition-all duration-1000"></div>
        </div>

        {/* Financial Audit */}
        <div className="bg-white rounded-[3rem] border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-10 py-8 border-b border-slate-50 flex items-center justify-between bg-slate-50/30">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-white shadow-md flex items-center justify-center text-emerald-600">
                  <CreditCard size={24} />
                </div>
                <div>
                  <h3 className="text-sm font-black uppercase tracking-[0.2em] text-[#00174b]">Auditoria Pix</h3>
                  <p className="text-[10px] font-bold text-slate-400">Conciliação de Recebíveis</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Live Feed</span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50/50">
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Data</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Pagador</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] text-right">Valor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {recentPix.slice(0, 7).map((p, i) => (
                    <tr key={i} className="hover:bg-slate-50/50 transition-colors group">
                      <td className="px-6 py-4 text-xs font-bold text-slate-500">{p.date}</td>
                      <td className="px-6 py-4">
                        <p className="text-sm font-black text-[#00174b] uppercase truncate max-w-[200px]">{p.payer_name}</p>
                        <p className="text-[10px] font-bold text-slate-400 flex items-center gap-1">
                          <Users size={10} />
                          {p.student?.name || 'Não Identificado'}
                        </p>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className={cn(
                          "px-3 py-1.5 rounded-xl text-xs font-black",
                          p.status === 'matched' ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"
                        )}>
                          {formatCurrency(p.amount)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          </>
        )}

        {activeCategory === 'academic' && (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-700">
             <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex items-center justify-between">
                <div>
                   <h3 className="text-xl font-black text-[#00174b] tracking-tight">Mapa Mestre de Matrículas</h3>
                   <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Listagem consolidada por unidade e turma</p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2 bg-slate-50 p-1 rounded-2xl border border-slate-100">
                    <select
                      value={academicYearFilter}
                      onChange={(e) => setAcademicYearFilter(e.target.value)}
                      className="px-4 py-2 text-[10px] font-black uppercase tracking-widest bg-transparent border-none focus:ring-0 text-slate-500"
                    >
                      <option value="Todos">Todos os Anos</option>
                      <option value="1º Ano">1º Ano</option>
                      <option value="2º Ano">2º Ano</option>
                      <option value="3º Ano">3º Ano</option>
                      <option value="4º Ano">4º Ano</option>
                      <option value="Curso Extra">Curso Extra</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-3 bg-slate-50 p-1 rounded-2xl border border-slate-100">
                    {(['Ativo', 'Inativo', 'Todos'] as const).map((status) => (
                      <button
                        key={status}
                        onClick={() => setClassStatusFilter(status)}
                        className={cn(
                          "px-4 py-2 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all",
                          classStatusFilter === status 
                            ? "bg-white text-blue-600 shadow-sm border border-slate-100" 
                            : "text-slate-400 hover:text-slate-600"
                        )}
                      >
                        {status}
                      </button>
                    ))}
                  </div>
                  <div className="px-4 py-3 bg-blue-50 text-blue-700 text-[10px] font-black rounded-2xl border border-blue-100 whitespace-nowrap">
                    {filteredClasses.length} TURMAS
                  </div>
                </div>
             </div>

             <div className="bg-white rounded-[3rem] border border-slate-100 shadow-sm overflow-hidden p-6 space-y-8">
               {filteredClasses.map(c => (
                 <div key={c.id} className="space-y-6">
                   <div className="flex items-center gap-4 border-l-4 border-blue-600 pl-6">
                      <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center font-black text-sm">{c.code}</div>
                      <div>
                        <h4 className="font-black text-[#00174b] uppercase tracking-tight">{c.name}</h4>
                        <p className="text-[10px] font-bold text-slate-400 uppercase">{c.period} • {students.filter(s => s.class_id === c.id).length} ALUNOS</p>
                      </div>
                   </div>
                   <div className="flex flex-wrap gap-2">
                      {students.filter(s => s.class_id === c.id).map(s => (
                        <div key={s.id} className="px-4 py-2 bg-slate-50 rounded-xl border border-slate-100 text-[10px] font-black text-slate-500 uppercase">
                           {s.name}
                        </div>
                      ))}
                   </div>
                 </div>
               ))}
             </div>
          </div>
        )}

        {activeCategory === 'attendance' && (
          <div className="bg-white rounded-[3rem] border border-slate-100 shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-700">
             <div className="px-6 py-6 border-b border-slate-50 flex items-center justify-between">
                <div>
                   <h3 className="text-xl font-black text-[#00174b] tracking-tight">Monitoramento de Frequência Escolar</h3>
                   <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Baseado em {totalClassDays} dias letivos cadastrados no calendário</p>
                </div>
                <div className="text-right">
                   <div className="px-2 py-1 bg-amber-50 border border-amber-100 rounded-xl">
                      <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest">Limite Permitido</p>
                      <p className="text-sm font-black text-amber-700">{academicParams.absence_limit_percentage}% de faltas</p>
                   </div>
                </div>
             </div>
             <div className="overflow-x-auto">
               <table className="w-full text-left">
                  <thead className="bg-slate-50/80">
                    <tr>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Estudante</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Turma</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Faltas</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Freq. %</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {students.filter(s => s.status === 'Ativo' || !s.status).map((student, i) => {
                      const studentAbsences = attendanceData.filter(a => a.student_id === student.id && (a.status === 'F')).length;
                      const studentPresence = totalClassDays > 0 ? ((totalClassDays - studentAbsences) / totalClassDays) * 100 : 100;
                      const absencePercentage = totalClassDays > 0 ? (studentAbsences / totalClassDays) * 100 : 0;
                      const isOverLimit = absencePercentage > (academicParams.absence_limit_percentage || 25);
                      const studentClass = classes.find(c => c.id === student.class_id);

                      return (
                        <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-6 py-4">
                            <p className="text-sm font-black text-[#00174b] uppercase">{student.name}</p>
                            <p className="text-[10px] font-bold text-slate-400">RA: {student.registration_number}</p>
                          </td>
                          <td className="px-6 py-4 text-sm font-bold text-slate-500">
                             {studentClass?.name || 'Sem turma'}
                          </td>
                          <td className="px-6 py-4 text-center text-sm font-black text-[#00174b]">
                            {studentAbsences} / {totalClassDays}
                          </td>
                          <td className="px-6 py-4 text-center">
                             <div className="flex flex-col items-center gap-1">
                                <span className={cn(
                                  "text-sm font-black",
                                  isOverLimit ? "text-red-600" : "text-emerald-600"
                                )}>
                                  {studentPresence.toFixed(1)}%
                                </span>
                                <div className="w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                  <div 
                                    className={cn(
                                      "h-full rounded-full",
                                      isOverLimit ? "bg-red-500" : "bg-emerald-500"
                                    )} 
                                    style={{ width: `${studentPresence}%` }}
                                  />
                                </div>
                             </div>
                          </td>
                          <td className="px-10 py-6 text-right">
                             <span className={cn(
                               "px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest",
                               isOverLimit ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"
                             )}>
                               {isOverLimit ? 'Risco Reprovação' : 'Regular'}
                             </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
               </table>
             </div>
          </div>
        )}

        {activeCategory === 'financial' && (
          <div className="bg-white rounded-[3rem] border border-slate-100 shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-700">
             <div className="px-10 py-10 border-b border-slate-50 flex items-center justify-between">
               <div>
                  <h3 className="text-xl font-black text-[#00174b] tracking-tight">Relatório de Arrecadação Pix</h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Conciliação financeira detalhada</p>
               </div>
               <div className="text-right">
                  <p className="text-2xl font-black text-emerald-600 tracking-tighter">{formatCurrency(stats.totalPixAmount)}</p>
                  <p className="text-[10px] font-black text-slate-400 uppercase">Total Auditado</p>
               </div>
             </div>
             <div className="overflow-x-auto">
               <table className="w-full text-left">
                  <thead className="bg-slate-50/80">
                    <tr>
                      <th className="px-10 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Data</th>
                      <th className="px-10 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Pagador</th>
                      <th className="px-10 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                      <th className="px-10 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Valor</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pixTransactions.map((p, i) => (
                      <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-10 py-6 text-sm font-bold text-slate-500">{p.date}</td>
                        <td className="px-10 py-6">
                           <p className="text-sm font-black text-[#00174b] uppercase">{p.payer_name}</p>
                           <p className="text-[10px] font-bold text-slate-400">CPF: {p.payer_document || '***.***.***-**'}</p>
                        </td>
                        <td className="px-10 py-6">
                           <span className={cn(
                             "px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest",
                             p.status === 'matched' ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                           )}>
                             {p.status === 'matched' ? 'Conciliado' : 'Pendente'}
                           </span>
                        </td>
                        <td className="px-10 py-6 text-right text-sm font-black text-[#00174b]">
                           {formatCurrency(p.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
               </table>
             </div>
          </div>
        )}

        {activeCategory === 'operational' && (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-700">
             {/* Dynamic Filter Section for Teachers */}
             <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex flex-col md:flex-row items-center gap-4">
                <div className="flex items-center gap-3 bg-slate-50 p-1 rounded-2xl border border-slate-100 w-full md:w-auto">
                  {(['Ativo', 'Inativo', 'Todos'] as const).map((status) => (
                    <button
                      key={status}
                      onClick={() => setTeacherStatusFilter(status)}
                      className={cn(
                        "flex-1 md:flex-none px-4 py-2 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all",
                        teacherStatusFilter === status 
                          ? "bg-white text-indigo-600 shadow-sm border border-slate-100" 
                          : "text-slate-400 hover:text-slate-600"
                      )}
                    >
                      {status}
                    </button>
                  ))}
                </div>

                <div className="flex-1 w-full relative">
                  <BookOpen size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                  <select
                    value={teacherSubjectFilter}
                    onChange={(e) => setTeacherSubjectFilter(e.target.value)}
                    className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-[1.25rem] text-[11px] font-black uppercase tracking-widest text-slate-600 focus:ring-2 focus:ring-indigo-500/20 appearance-none"
                  >
                    <option value="all">Filtrar Disciplina</option>
                    {subjects.map(s => (
                      <option key={s.id} value={s.id}>{s.name.toUpperCase()}</option>
                    ))}
                  </select>
                </div>
                
                <div className="hidden md:block h-8 w-[1px] bg-slate-100"></div>

                <div className="flex-1 w-full relative">
                  <Filter size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                  <select
                    value={teacherSortBy}
                    onChange={(e) => setTeacherSortBy(e.target.value as any)}
                    className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-[1.25rem] text-[11px] font-black uppercase tracking-widest text-slate-600 focus:ring-2 focus:ring-indigo-500/20 appearance-none"
                  >
                    <option value="name">Ordenar por Nome</option>
                    <option value="code">Ordenar por Código</option>
                    <option value="subject">Ordenar por Disciplina</option>
                  </select>
                </div>
                
                <div className="flex items-center gap-2">
                  <div className="px-4 py-3 bg-blue-50 text-blue-700 text-[10px] font-black rounded-2xl border border-blue-100 whitespace-nowrap">
                    {filteredTeachers.length} PROFESSORES
                  </div>
                  <div className="px-4 py-3 bg-amber-50 text-amber-700 text-[10px] font-black rounded-2xl border border-amber-100 whitespace-nowrap">
                    {filteredSubjects.length} DISCIPLINAS
                  </div>
                </div>
             </div>

             <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="bg-white rounded-[3rem] border border-slate-100 shadow-sm overflow-hidden">
                    <div className="p-6 border-b border-slate-50 flex items-center gap-4">
                       <Briefcase className="text-indigo-600" size={24} />
                       <h3 className="text-sm font-black uppercase tracking-widest text-[#00174b]">Quadro de Professores</h3>
                    </div>
                    <div className="p-6 space-y-3">
                       {filteredTeachers.map(t => {
                         const teacherSubjects = subjects
                           .filter(s => t.subject_ids?.includes(s.id))
                           .map(s => s.name)
                           .join(', ');

                         return (
                           <div key={t.id} className="p-5 bg-slate-50 border border-slate-100 rounded-3xl flex flex-col gap-4">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                   <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center font-black text-indigo-600 text-xs">{t.code}</div>
                                   <div>
                                     <p className="text-sm font-black text-[#00174b] uppercase">{t.name}</p>
                                     <p className="text-[10px] font-bold text-slate-400">{t.email}</p>
                                   </div>
                                </div>
                                <span className={cn(
                                  "px-3 py-1 text-[9px] font-black rounded-lg uppercase tracking-widest",
                                  ((t as any).status === 'Inativo') ? "bg-slate-200 text-slate-500" : "bg-emerald-50 text-emerald-600"
                                )}>
                                  {(t as any).status || 'Ativo'}
                                </span>
                              </div>
                              <div className="flex flex-wrap gap-1.5 pt-3 border-t border-slate-200/50">
                                 {subjects.filter(s => t.subject_ids?.includes(s.id)).map(s => (
                                   <span key={s.id} className="px-2 py-0.5 bg-white border border-slate-200 text-[8px] font-black text-indigo-500 uppercase rounded-md tracking-tighter">
                                     {s.name}
                                   </span>
                                 ))}
                                 {!t.subject_ids?.length && <span className="text-[9px] font-bold text-slate-300 uppercase">Sem disciplina vinculada</span>}
                              </div>
                           </div>
                         );
                       })}
                    </div>
                </div>

                <div className="bg-white rounded-[3rem] border border-slate-100 shadow-sm overflow-hidden">
                    <div className="p-6 border-b border-slate-50 flex items-center justify-between">
                       <div className="flex items-center gap-4">
                        <BookOpen className="text-amber-600" size={24} />
                        <h3 className="text-sm font-black uppercase tracking-widest text-[#00174b]">Matriz Curricular</h3>
                       </div>
                       <div className="flex items-center gap-3">
                          <div className="flex items-center gap-2 bg-slate-50 p-1 rounded-xl border border-slate-100">
                            <select
                              value={subjectSemesterFilter}
                              onChange={(e) => setSubjectSemesterFilter(e.target.value)}
                              className="px-3 py-1.5 text-[9px] font-black uppercase tracking-widest bg-transparent border-none focus:ring-0 text-slate-500"
                            >
                              <option value="Todos">Todos Semestres</option>
                              <option value="1º Sem.">1º Semestre</option>
                              <option value="2º Sem.">2º Semestre</option>
                            </select>
                          </div>
                          <div className="flex items-center gap-2 bg-slate-50 p-1 rounded-xl border border-slate-100">
                             {(['Ativo', 'Inativo', 'Todos'] as const).map((status) => (
                               <button
                              key={status}
                              onClick={() => setSubjectStatusFilter(status)}
                              className={cn(
                                "px-3 py-1.5 text-[9px] font-black uppercase tracking-widest rounded-lg transition-all",
                                subjectStatusFilter === status 
                                  ? "bg-white text-amber-600 shadow-sm border border-slate-100" 
                                  : "text-slate-400 hover:text-slate-600"
                              )}
                            >
                              {status}
                            </button>
                          ))}
                       </div>
                    </div>
                    </div>
                    <div className="p-6 space-y-3">
                       {filteredSubjects.map(s => (
                         <div key={s.id} className="p-5 bg-slate-50 border border-slate-100 rounded-3xl flex items-center justify-between">
                            <div className="flex items-center gap-4">
                               <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center font-black text-amber-600 text-xs">{s.code}</div>
                               <div>
                                 <p className="text-sm font-black text-[#00174b] uppercase">{s.name}</p>
                               </div>
                            </div>
                            <span className={cn(
                               "px-3 py-1 text-[9px] font-black rounded-lg uppercase tracking-widest",
                               s.status === 'Inativo' ? "bg-rose-50 text-rose-600" : "bg-emerald-50 text-emerald-600"
                            )}>
                               {s.status || 'Ativo'}
                            </span>
                         </div>
                       ))}
                    </div>
                </div>
             </div>
          </div>
        )}
      </div>

      {/* Professional Print Layout (Figma Style) */}
      <div id="printable-report" className="hidden print:block p-12 bg-white text-black font-sans">
        <div className="flex flex-col items-center text-center relative mb-10">
          {institution?.logo_url && (
            <div className="absolute left-0 top-0">
              <img src={institution.logo_url} className="w-24 h-24 rounded-lg object-contain" referrerPolicy="no-referrer" />
            </div>
          )}
          
          <div className="space-y-1 mt-2">
            <h1 className="text-3xl font-black text-[#00174b] uppercase tracking-tight leading-tight">{institution?.name || 'ESCMIN - GESTÃO ESCOLAR'}</h1>
            <p className="text-xs text-slate-500 font-bold max-w-[600px] leading-relaxed mx-auto">{institution?.address}</p>
            <div className="flex items-center justify-center gap-6 text-[11px] text-slate-400 font-black uppercase tracking-widest pt-1">
              {institution?.cnpj && <span>CNPJ: {institution.cnpj}</span>}
              {institution?.phone && <span>TEL: {institution.phone}</span>}
              {institution?.email && <span>E-MAIL: {institution.email}</span>}
            </div>
            {institution?.website && (
              <p className="text-[10px] text-blue-600 font-black uppercase tracking-[0.2em] pt-1">{institution.website}</p>
            )}
          </div>
        </div>

        <div className="w-full h-[2px] bg-slate-900 mb-10"></div>

        <div className="text-center mb-12">
          <h2 className="text-2xl font-black uppercase tracking-[0.25em] text-[#00174b]">Relatório Estratégico de Gestão</h2>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-2">Emissão Oficial: {new Date().toLocaleString('pt-BR')}</p>
        </div>

        <div className="grid grid-cols-3 gap-10 mb-16">
          <div className="bg-slate-50 p-8 rounded-[2rem] border-2 border-slate-100">
            <h3 className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-6">Métricas Acadêmicas</h3>
            <div className="space-y-4 font-sans">
              <div className="flex justify-between items-center"><span className="text-sm font-medium text-slate-600">Total Matriculados:</span> <span className="text-lg font-black">{stats.totalStudents}</span></div>
              <div className="flex justify-between items-center"><span className="text-sm font-medium text-slate-600">Matrículas Ativas:</span> <span className="text-lg font-black text-emerald-600">{stats.activeStudents}</span></div>
              <div className="flex justify-between items-center"><span className="text-sm font-medium text-slate-600">Taxa de Ocupação:</span> <span className="text-lg font-black text-blue-600">{stats.occupancyRate}%</span></div>
            </div>
          </div>
          <div className="bg-slate-50 p-8 rounded-[2rem] border-2 border-slate-100">
            <h3 className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-6">Métricas Financeiras</h3>
            <div className="space-y-4 font-sans">
              <div className="flex justify-between items-center"><span className="text-sm font-medium text-slate-600">Arrecadação Pix:</span> <span className="text-lg font-black">{formatCurrency(stats.totalPixAmount)}</span></div>
              <div className="flex justify-between items-center"><span className="text-sm font-medium text-slate-600">Crescimento:</span> <span className="text-lg font-black text-emerald-600">+{stats.revenueGrowth}%</span></div>
              <div className="flex justify-between items-center"><span className="text-sm font-medium text-slate-600">Ticket Médio:</span> <span className="text-lg font-black">{formatCurrency(stats.pixCount > 0 ? stats.totalPixAmount / stats.pixCount : 0)}</span></div>
            </div>
          </div>
          <div className="bg-slate-50 p-8 rounded-[2rem] border-2 border-slate-100">
            <h3 className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-6">Métricas Operacionais</h3>
            <div className="space-y-4 font-sans">
              <div className="flex justify-between items-center"><span className="text-sm font-medium text-slate-600">Eficiência Match:</span> <span className="text-lg font-black">{stats.pixCount > 0 ? Math.round((stats.matchedPix / stats.pixCount) * 100) : 0}%</span></div>
              <div className="flex justify-between items-center"><span className="text-sm font-medium text-slate-600">Total Turmas:</span> <span className="text-lg font-black">{stats.totalClasses}</span></div>
              <div className="flex justify-between items-center"><span className="text-sm font-medium text-slate-600">Corpo Docente:</span> <span className="text-lg font-black">{stats.totalTeachers}</span></div>
            </div>
          </div>
        </div>

        <h2 className="text-2xl font-black text-[#00174b] mb-8 border-l-[8px] border-[#00174b] pl-6 uppercase tracking-tight">Detalhamento de Unidades e Turmas</h2>
        <table className="w-full border-collapse mb-20 font-sans">
          <thead>
            <tr className="bg-[#00174b] text-white">
              <th className="p-5 text-left text-[10px] font-black uppercase tracking-widest">Código</th>
              <th className="p-5 text-left text-[10px] font-black uppercase tracking-widest">Turma / Unidade de Ensino</th>
              <th className="p-5 text-left text-[10px] font-black uppercase tracking-widest">Período</th>
              <th className="p-5 text-right text-[10px] font-black uppercase tracking-widest">Alunos</th>
              <th className="p-5 text-right text-[10px] font-black uppercase tracking-widest">Representatividade</th>
            </tr>
          </thead>
          <tbody className="divide-y-2 divide-slate-100">
            {studentsByClass.map((c, i) => (
              <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-slate-50/50"}>
                <td className="p-5 text-sm font-bold text-slate-500">{c.code}</td>
                <td className="p-5 text-sm font-black text-[#00174b]">{c.name}</td>
                <td className="p-5 text-sm font-bold uppercase text-slate-600">{c.period}</td>
                <td className="p-5 text-right text-sm font-black">{c.count}</td>
                <td className="p-5 text-right text-sm font-black text-blue-600">{c.percentage}%</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-40 flex justify-between px-24 font-sans">
          <div className="text-center border-t-4 border-[#00174b] pt-6 w-80">
            <p className="font-black uppercase text-sm text-[#00174b]">Diretoria Executiva</p>
            <p className="text-[10px] text-slate-400 font-bold mt-2 tracking-widest uppercase">Assinatura e Carimbo</p>
          </div>
          <div className="text-center border-t-4 border-[#00174b] pt-6 w-80">
            <p className="font-black uppercase text-sm text-[#00174b]">Controladoria Geral</p>
            <p className="text-[10px] text-slate-400 font-bold mt-2 tracking-widest uppercase">Validação de Dados</p>
          </div>
        </div>

        <div className="mt-24 text-center text-[10px] text-slate-400 font-bold italic tracking-widest uppercase border-t border-slate-100 pt-10">
          {institution?.footer_text || ''}
        </div>
      </div>
    </div>
  );
}
