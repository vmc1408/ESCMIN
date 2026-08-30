import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  GraduationCap, 
  Plus, 
  Search, 
  Edit2, 
  Trash2, 
  Save, 
  X, 
  CheckCircle2, 
  AlertCircle, 
  Users, 
  Clock, 
  Calendar,
  Layers,
  RotateCcw,
  LayoutGrid,
  List as ListIcon,
  CheckCircle,
  Archive,
  PowerOff,
  Power,
  ExternalLink,
  BookOpen,
  Printer,
  ArrowUpDown,
  SortAsc,
  Download,
  Filter
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader';
import { Course, Class, Student, Enrollment } from '../types';
import { fetchAll, saveData, deleteData } from '../lib/database';
import { useAuth } from '../contexts/AuthContext';
import { cn, detectCourseFromClass } from '../lib/utils';

const WEEK_DAYS = [
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado',
  'Domingo'
];

export function Courses() {
  const navigate = useNavigate();
  const { isAdmin, isSecretary, isDirector } = useAuth();
  const canEdit = isAdmin || isDirector || isSecretary;

  const [courses, setCourses] = useState<Course[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'Todos' | 'Ativo' | 'Inativo'>('Todos');
  const [viewingStudentsCourse, setViewingStudentsCourse] = useState<Course | null>(null);
  const [studentSearchTerm, setStudentSearchTerm] = useState('');
  const [studentSortMode, setStudentSortMode] = useState<'class' | 'name' | 'registration'>('class');
  const [studentClassFilter, setStudentClassFilter] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>(() => {
    try {
      const saved = localStorage.getItem('courses_view_mode');
      if (saved === 'grid' || saved === 'table') return saved;
    } catch (e) {}
    return 'table'; // Padrão: listagem
  });

  const handleSetViewMode = (mode: 'grid' | 'table') => {
    setViewMode(mode);
    try {
      localStorage.setItem('courses_view_mode', mode);
    } catch (e) {}
  };

  // Form State
  const [showModal, setShowModal] = useState(false);
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);
  const [formData, setFormData] = useState<Partial<Course>>({
    code: '',
    name: '',
    description: '',
    duration_total: '',
    meetings_per_week: 0,
    meeting_days: [],
    status: 'Ativo'
  });

  const [isSaving, setIsSaving] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const showNotification = useCallback((type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 4000);
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [coursesData, classesData, studentsData, enrollmentsData] = await Promise.all([
        fetchAll('courses'),
        fetchAll('classes'),
        fetchAll('students'),
        fetchAll('enrollments').catch(() => [])
      ]);

      setCourses(coursesData || []);
      setClasses(classesData || []);
      setStudents(studentsData || []);
      setEnrollments(enrollmentsData || []);
    } catch (err: any) {
      console.error('Erro ao carregar cursos:', err);
      showNotification('error', 'Erro ao carregar catálogo de cursos.');
    } finally {
      setLoading(false);
    }
  }, [showNotification]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Statistics calculation
  const { courseStats, courseStudentsMap, totalActiveInCourses, unassignedActiveStudents } = useMemo(() => {
    const map = new Map<string, { classesCount: number; activeStudentsCount: number; totalStudentsCount: number }>();
    const studentsMap = new Map<string, Array<{
      student: Student;
      linkType: 'primary' | 'parallel' | 'direct';
      className: string;
      allClassNames: string[];
    }>>();

    courses.forEach(c => {
      map.set(c.id, { classesCount: 0, activeStudentsCount: 0, totalStudentsCount: 0 });
      studentsMap.set(c.id, []);
    });

    const validClassIds = new Set(classes.map(c => c.id));
    const classesMap = new Map<string, Class>(classes.map(c => [c.id, c]));

    // Match classes with courses
    const classToCourseMap = new Map<string, string>(); // classId -> courseId

    classes.forEach(cls => {
      const detectedName = detectCourseFromClass(cls, courses);
      const matchedCourse = courses.find(c => 
        c.name.trim().toLowerCase() === detectedName.trim().toLowerCase() ||
        (c.code && c.code.trim().toLowerCase() === (cls.code || '').trim().toLowerCase()) ||
        c.name.toLowerCase().includes(detectedName.toLowerCase()) ||
        detectedName.toLowerCase().includes(c.name.toLowerCase())
      );

      if (matchedCourse) {
        classToCourseMap.set(cls.id, matchedCourse.id);
        const stats = map.get(matchedCourse.id);
        if (stats) {
          stats.classesCount += 1;
        }
      }
    });

    let assignedActiveCount = 0;
    let unassignedActiveCount = 0;

    // Match students with courses (via direct class, enrolled classes, or fallback to student.course if unallocated)
    students.forEach(st => {
      const studentClassNames: string[] = [];
      const studentActiveClassObjects: Class[] = [];
      const seenClassIds = new Set<string>();

      // 1. Check primary class
      if (st.class_id && validClassIds.has(st.class_id)) {
        const cls = classesMap.get(st.class_id);
        if (cls) {
          studentActiveClassObjects.push(cls);
          seenClassIds.add(cls.id);
          studentClassNames.push(cls.name);
        }
      }

      // 2. Check enrolled classes
      const studentEnrs = enrollments.filter(e => e.student_id === st.id && (e.status || 'Ativo') === 'Ativo');
      studentEnrs.forEach(enr => {
        if (enr.class_id && validClassIds.has(enr.class_id) && !seenClassIds.has(enr.class_id)) {
          const enrClass = classesMap.get(enr.class_id);
          if (enrClass) {
            studentActiveClassObjects.push(enrClass);
            seenClassIds.add(enrClass.id);
            if (!studentClassNames.includes(enrClass.name)) {
              studentClassNames.push(enrClass.name);
            }
          }
        }
      });

      // Map active classes of this student to courses
      const classCoursePairs: Array<{ classObj: Class; courseId: string; isPrimaryClass: boolean }> = [];
      const distinctCourseIdsForStudent = new Set<string>();

      studentActiveClassObjects.forEach(cls => {
        let cid = classToCourseMap.get(cls.id);
        if (!cid) {
          const detected = detectCourseFromClass(cls, courses);
          const match = courses.find(c => 
            c.name.trim().toLowerCase() === detected.trim().toLowerCase() ||
            (c.code && c.code.trim().toLowerCase() === (cls.code || '').trim().toLowerCase())
          );
          if (match) cid = match.id;
        }
        if (cid) {
          classCoursePairs.push({
            classObj: cls,
            courseId: cid,
            isPrimaryClass: st.class_id ? cls.id === st.class_id : false
          });
          distinctCourseIdsForStudent.add(cid);
        }
      });

      const matchedCourseEntries = new Map<string, { linkType: 'primary' | 'parallel' | 'direct'; className: string }>();

      if (classCoursePairs.length > 0) {
        distinctCourseIdsForStudent.forEach(courseId => {
          const pairsForThisCourse = classCoursePairs.filter(p => p.courseId === courseId);
          const primaryPair = pairsForThisCourse.find(p => p.isPrimaryClass) || pairsForThisCourse[0];
          
          let linkType: 'primary' | 'parallel' | 'direct' = 'primary';
          if (distinctCourseIdsForStudent.size > 1) {
            // Student is enrolled in multiple DIFFERENT courses simultaneously
            if (pairsForThisCourse.some(p => p.isPrimaryClass)) {
              linkType = 'primary';
            } else {
              linkType = 'parallel';
            }
          } else {
            // Student is taking only 1 course formativo -> always primary/regular class
            linkType = 'primary';
          }

          matchedCourseEntries.set(courseId, {
            linkType,
            className: primaryPair.classObj.name
          });
        });
      } else if (st.course) {
        // Fallback to student.course text if student is unallocated
        const cleanCourse = st.course.trim().toLowerCase();
        const directMatch = courses.find(c => 
          c.name.trim().toLowerCase() === cleanCourse ||
          (c.code && c.code.trim().toLowerCase() === cleanCourse)
        );
        if (directMatch) {
          matchedCourseEntries.set(directMatch.id, { 
            linkType: 'direct', 
            className: st.course || 'Sem Turma (Vínculo por Cadastro)' 
          });
        }
      }

      if (matchedCourseEntries.size > 0) {
        matchedCourseEntries.forEach((info, cId) => {
          if (map.has(cId)) {
            const stats = map.get(cId)!;
            stats.totalStudentsCount += 1;
            if (st.status === 'Ativo') {
              stats.activeStudentsCount += 1;
            }
          }
          if (studentsMap.has(cId)) {
            studentsMap.get(cId)!.push({
              student: st,
              linkType: info.linkType,
              className: info.className,
              allClassNames: studentClassNames
            });
          }
        });
        if (st.status === 'Ativo') {
          assignedActiveCount += 1;
        }
      } else {
        if (st.status === 'Ativo') {
          unassignedActiveCount += 1;
        }
      }
    });

    // Sort students alphabetically inside each course
    studentsMap.forEach((list) => {
      list.sort((a, b) => (a.student.name || '').localeCompare(b.student.name || ''));
    });

    return { 
      courseStats: map, 
      courseStudentsMap: studentsMap,
      totalActiveInCourses: assignedActiveCount, 
      unassignedActiveStudents: unassignedActiveCount 
    };
  }, [courses, classes, students, enrollments]);

  // Filter and logically group active vs inactive
  const { activeCourses, inactiveCourses } = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    
    const filtered = courses.filter(c => {
      const matchesSearch = 
        (c.name || '').toLowerCase().includes(term) ||
        (c.code || '').toLowerCase().includes(term) ||
        (c.description || '').toLowerCase().includes(term);

      const matchesStatus = statusFilter === 'Todos' || c.status === statusFilter;

      return matchesSearch && matchesStatus;
    });

    return {
      activeCourses: filtered.filter(c => c.status === 'Ativo'),
      inactiveCourses: filtered.filter(c => c.status === 'Inativo')
    };
  }, [courses, searchTerm, statusFilter]);

  const totalFiltered = activeCourses.length + inactiveCourses.length;

  const currentCourseClasses = useMemo(() => {
    if (!viewingStudentsCourse) return [];
    const list = courseStudentsMap.get(viewingStudentsCourse.id) || [];
    const classNamesSet = new Set<string>();
    list.forEach(item => {
      if (item.className) classNamesSet.add(item.className);
    });
    return Array.from(classNamesSet).sort((a, b) => a.localeCompare(b));
  }, [viewingStudentsCourse, courseStudentsMap]);

  const handleExportCSV = (course: Course) => {
    const list = courseStudentsMap.get(course.id) || [];
    if (list.length === 0) {
      showNotification('error', 'Nenhum aluno encontrado para exportar.');
      return;
    }

    const headers = ['#', 'Nome do Aluno', 'Matrícula (RA)', 'Turma', 'Tipo de Vínculo', 'Situação'];
    const rows = list.map((item, idx) => [
      (idx + 1).toString(),
      `"${(item.student.name || '').replace(/"/g, '""')}"`,
      `"${item.student.registration_number || ''}"`,
      `"${(item.className || '').replace(/"/g, '""')}"`,
      `"${item.linkType === 'parallel' ? 'Matrícula em Paralelo' : item.linkType === 'direct' ? 'Vínculo por Cadastro' : 'Turma Principal'}"`,
      `"${item.student.status || 'Ativo'}"`
    ]);

    const csvContent = '\uFEFF' + [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Alunos_${(course.code || course.name || 'Curso').replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showNotification('success', `Relação de ${list.length} alunos exportada com sucesso!`);
  };

  const handlePrintRoster = () => {
    try {
      window.print();
    } catch (e) {
      console.error('Print failed:', e);
    }
  };

  const handleOpenCreate = () => {
    setEditingCourse(null);
    setFormData({
      code: '',
      name: '',
      description: '',
      duration_total: '',
      meetings_per_week: 0,
      meeting_days: [],
      status: 'Ativo'
    });
    setShowModal(true);
  };

  const handleOpenEdit = (course: Course) => {
    setEditingCourse(course);
    const isInactive = course.status === 'Inativo';
    
    // Extract numerical duration (1 to 4) if available
    let initialDuration = '';
    if (!isInactive) {
      if (course.duration_total && course.duration_total.trim() !== '' && course.duration_total.trim() !== '—') {
        const match = course.duration_total.match(/^[1-4]$/) || course.duration_total.match(/^([1-4])\s*ano/i);
        if (match) {
          initialDuration = match[1] || match[0];
        }
      } else if (course.duration_years && [1, 2, 3, 4].includes(course.duration_years)) {
        initialDuration = String(course.duration_years);
      }
    } else {
      // Inativo: only keep if explicitly defined as 1-4
      if (course.duration_total && course.duration_total.trim() !== '' && course.duration_total.trim() !== '—') {
        const match = course.duration_total.match(/^[1-4]$/) || course.duration_total.match(/^([1-4])\s*ano/i);
        if (match) {
          initialDuration = match[1] || match[0];
        }
      }
    }

    const initialMeetings = course.meetings_per_week !== undefined
      ? course.meetings_per_week
      : (isInactive ? 0 : 0);

    const initialDays = course.meeting_days && course.meeting_days.length > 0
      ? [...course.meeting_days]
      : [];

    setFormData({
      code: course.code || '',
      name: course.name || '',
      description: course.description || '',
      duration_total: initialDuration,
      meetings_per_week: initialMeetings,
      meeting_days: initialDays,
      status: course.status || 'Ativo'
    });
    setShowModal(true);
  };

  const handleToggleStatus = async (course: Course) => {
    const newStatus = course.status === 'Ativo' ? 'Inativo' : 'Ativo';
    try {
      const updatedPayload: Course = {
        ...course,
        status: newStatus,
        duration_total: newStatus === 'Inativo' ? '' : (course.duration_total || ''),
        duration_years: newStatus === 'Inativo' ? undefined : course.duration_years,
        meetings_per_week: newStatus === 'Inativo' ? 0 : (course.meetings_per_week || 0),
        meeting_days: newStatus === 'Inativo' ? [] : (course.meeting_days || []),
        updated_at: new Date().toISOString()
      };
      // Immediately reflect in state
      setCourses(prev => prev.map(c => c.id === course.id ? updatedPayload : c));
      await saveData('courses', course.id, updatedPayload);
      showNotification('success', `Curso alterado para "${newStatus}" com sucesso.`);
      await loadData();
    } catch (err: any) {
      console.error('Erro ao alterar status:', err);
      showNotification('error', 'Falha ao alterar status do curso.');
    }
  };

  // Auto-generate code when typing name if creating new
  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    const updates: Partial<Course> = { name: val };
    
    if (!editingCourse && (!formData.code || formData.code.trim() === '')) {
      const STOP_WORDS = new Set(['de', 'da', 'do', 'dos', 'das', 'e', 'para', 'em']);
      const words = val.trim().split(/\s+/).filter(w => !STOP_WORDS.has(w.toLowerCase()));
      if (words.length >= 3) {
        updates.code = words.slice(0, 3).map(w => w[0]).join('').toUpperCase();
      } else if (words.length > 0 && words[0].length >= 3) {
        updates.code = words[0].slice(0, 3).toUpperCase();
      }
    }
    
    setFormData(prev => ({ ...prev, ...updates }));
  };

  const handleMeetingsCountChange = (count: number) => {
    const safeCount = Math.max(0, Math.min(7, count));
    if (safeCount === 0) {
      setFormData(prev => ({
        ...prev,
        meetings_per_week: 0,
        meeting_days: []
      }));
      return;
    }
    const currentDays = [...(formData.meeting_days || [])];
    const defaultSeq = ['Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado', 'Domingo'];
    
    const newDays = currentDays.slice(0, safeCount);
    while (newDays.length < safeCount) {
      const nextUnused = defaultSeq.find(d => !newDays.includes(d)) || defaultSeq[newDays.length % defaultSeq.length];
      newDays.push(nextUnused);
    }

    setFormData(prev => ({
      ...prev,
      meetings_per_week: safeCount,
      meeting_days: newDays
    }));
  };

  const handleSlotDayChange = (slotIndex: number, dayValue: string) => {
    setFormData(prev => {
      const count = prev.meetings_per_week || 1;
      const currentDays = [...(prev.meeting_days || [])];
      while (currentDays.length < count) {
        currentDays.push('');
      }
      currentDays[slotIndex] = dayValue;
      return {
        ...prev,
        meeting_days: currentDays
      };
    });
  };

  const isDurationValid = (rawDuration?: string, isActive = true) => {
    const trimmed = (rawDuration || '').trim();
    if (!trimmed) {
      return !isActive; // Empty is valid only if course is inactive
    }
    return ['1', '2', '3', '4'].includes(trimmed);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name?.trim() || !formData.code?.trim()) {
      showNotification('error', 'Nome e Sigla / Código do curso são obrigatórios.');
      return;
    }

    const cleanCode = formData.code.trim().toUpperCase();
    const cleanName = formData.name.trim();
    const isActive = formData.status === 'Ativo';
    const rawDuration = (formData.duration_total || '').trim();

    // Validar Duração (deve ser número de 1 a 4)
    if (isActive) {
      if (!rawDuration) {
        showNotification('error', 'A duração é obrigatória para cursos ativos (informe um número de 1 a 4 anos).');
        return;
      }
      if (!['1', '2', '3', '4'].includes(rawDuration)) {
        showNotification('error', 'Duração inválida! Digite apenas um número de 1 a 4 (anos).');
        return;
      }
      const meetingsCount = Number(formData.meetings_per_week) || 0;
      if (meetingsCount <= 0) {
        showNotification('error', 'Informe a quantidade de encontros semanais para cursos ativos.');
        return;
      }
      const selectedDays = (formData.meeting_days || []).slice(0, meetingsCount);
      const hasEmptyDay = selectedDays.length < meetingsCount || selectedDays.some(d => !d || !d.trim());
      if (hasEmptyDay) {
        showNotification('error', 'Informe o dia da semana para todos os encontros do curso ativo.');
        return;
      }
    } else {
      // Inactive course: duration is optional, but if filled, must be 1 to 4
      if (rawDuration && !['1', '2', '3', '4'].includes(rawDuration)) {
        showNotification('error', 'Duração inválida! Digite apenas um número de 1 a 4 (anos) ou deixe em branco.');
        return;
      }
    }

    // Check code duplication
    const duplicate = courses.find(c => 
      c.code.toUpperCase() === cleanCode && 
      (!editingCourse || c.id !== editingCourse.id)
    );

    if (duplicate) {
      showNotification('error', `O código "${cleanCode}" já está sendo utilizado pelo curso "${duplicate.name}".`);
      return;
    }

    setIsSaving(true);
    try {
      const id = editingCourse?.id || `course-${cleanCode.toLowerCase().replace(/[^a-z0-9]/g, '')}-${Date.now().toString().slice(-4)}`;
      const meetingsCount = Number(formData.meetings_per_week) || 0;
      
      const durationNum = ['1', '2', '3', '4'].includes(rawDuration)
        ? parseInt(rawDuration, 10)
        : undefined;

      const formattedDuration = durationNum 
        ? `${durationNum} ${durationNum === 1 ? 'ano' : 'anos'}` 
        : '';

      const cleanMeetingDays = meetingsCount > 0 
        ? (formData.meeting_days || []).slice(0, meetingsCount).filter(Boolean)
        : [];
      
      const payload: Course = {
        id,
        code: cleanCode,
        name: cleanName,
        description: formData.description?.trim() || '',
        duration_years: durationNum,
        duration_total: formattedDuration,
        meetings_per_week: meetingsCount,
        meeting_days: cleanMeetingDays,
        status: formData.status || 'Ativo',
        updated_at: new Date().toISOString(),
        created_at: editingCourse?.created_at || new Date().toISOString()
      };

      // Atualiza estado imediatamente para garantir atualização instantânea na tela de gestão
      setCourses(prev => {
        const idx = prev.findIndex(c => c.id === id);
        if (idx >= 0) {
          const updated = [...prev];
          updated[idx] = payload;
          return updated;
        }
        return [payload, ...prev];
      });

      await saveData('courses', id, payload);
      showNotification('success', editingCourse ? 'Curso salvo com sucesso!' : 'Novo curso salvo com sucesso!');
      setShowModal(false);
      await loadData();
    } catch (err: any) {
      console.error('Erro ao salvar curso:', err);
      showNotification('error', 'Falha ao salvar curso: ' + (err.message || 'Erro desconhecido.'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (courseId: string) => {
    const stats = courseStats.get(courseId);
    if (stats && (stats.classesCount > 0 || stats.totalStudentsCount > 0)) {
      showNotification('error', `Não é possível excluir este curso pois existem ${stats.classesCount} turma(s) e ${stats.totalStudentsCount} estudante(s) vinculados a ele.`);
      setDeleteConfirmId(null);
      return;
    }

    try {
      await deleteData('courses', courseId);
      showNotification('success', 'Curso removido do catálogo com sucesso.');
      setDeleteConfirmId(null);
      await loadData();
    } catch (err: any) {
      console.error('Erro ao excluir curso:', err);
      showNotification('error', 'Falha ao excluir curso: ' + (err.message || 'Erro desconhecido.'));
    }
  };

  const renderCourseCard = (course: Course) => {
    const stats = courseStats.get(course.id) || { classesCount: 0, activeStudentsCount: 0, totalStudentsCount: 0 };
    const isDeleting = deleteConfirmId === course.id;
    const isInactive = course.status === 'Inativo';
    const hasValidDuration = course.duration_total && course.duration_total.trim() !== '' && course.duration_total.trim() !== '—';
    const durationNum = !isInactive ? (course.duration_years && [1, 2, 3, 4].includes(course.duration_years) ? course.duration_years : undefined) : undefined;
    const durationDisplay = hasValidDuration 
      ? course.duration_total 
      : (durationNum ? `${durationNum} ${durationNum === 1 ? 'ano' : 'anos'}` : '—');
    const meetingDaysText = course.meeting_days && course.meeting_days.length > 0 
      ? course.meeting_days.filter(Boolean).join(', ') 
      : '—';
    const meetingsCount = course.meetings_per_week !== undefined ? course.meetings_per_week : (course.meeting_days?.length || 0);

    return (
      <div 
        key={course.id}
        id={`course-card-${course.id}`}
        className={cn(
          "bg-white border transition-all shadow-sm flex flex-col justify-between relative group",
          isInactive 
            ? "border-slate-200 bg-slate-50/60 opacity-85 hover:opacity-100" 
            : "border-slate-200 hover:border-slate-400"
        )}
      >
        <div className="p-5 space-y-4">
          {/* Card Header */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className={cn(
                "w-10 h-10 border flex items-center justify-center font-black text-xs uppercase shrink-0",
                isInactive 
                  ? "bg-slate-100 border-slate-200 text-slate-500" 
                  : "bg-slate-900 border-slate-900 text-white"
              )}>
                {course.code || 'CRS'}
              </div>
              <div className="min-w-0">
                <h3 className={cn(
                  "text-sm font-bold leading-tight truncate",
                  isInactive ? "text-slate-700" : "text-slate-900"
                )}>
                  {course.name}
                </h3>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Código: {course.code}
                </span>
              </div>
            </div>

            <button
              onClick={() => canEdit && handleToggleStatus(course)}
              disabled={!canEdit}
              title={canEdit ? "Clique para alternar o status" : undefined}
              className={cn(
                "text-[9px] font-black uppercase px-2 py-0.5 border tracking-wider transition-all shrink-0",
                course.status === 'Ativo' 
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100" 
                  : "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100"
              )}
            >
              {course.status}
            </button>
          </div>

          {/* Description */}
          <p className="text-xs text-slate-600 line-clamp-2 min-h-[32px] leading-relaxed">
            {course.description || 'Nenhuma descrição complementar informada para este curso.'}
          </p>

          {/* Technical Specs Badge Grid - Duração, Encontros e Dias da Semana */}
          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100">
            <div className="bg-slate-50 border border-slate-100 p-2.5">
              <span className="text-[9px] font-bold text-slate-400 uppercase block">Duração Total</span>
              <span className="text-xs font-black text-slate-800 flex items-center gap-1 mt-0.5">
                <Clock className="w-3 h-3 text-slate-500" />
                {durationDisplay}
              </span>
            </div>
            <div className="bg-slate-50 border border-slate-100 p-2.5">
              <span className="text-[9px] font-bold text-slate-400 uppercase block">Encontros Semanais</span>
              <span className="text-xs font-black text-slate-800 flex items-center gap-1 mt-0.5">
                <Calendar className="w-3 h-3 text-slate-500" />
                {meetingsCount > 0 ? `${meetingsCount} ${meetingsCount === 1 ? 'encontro/sem.' : 'encontros/sem.'}` : '—'}
              </span>
            </div>
          </div>

          {/* Dia(s) da Semana */}
          <div className="bg-slate-50/80 border border-slate-100 px-3 py-2 text-[11px] flex items-center justify-between">
            <span className="font-bold text-slate-500 text-[10px] uppercase">Dia(s) da Semana:</span>
            <span className="font-bold text-slate-900 truncate max-w-[180px]" title={meetingDaysText}>
              {meetingDaysText}
            </span>
          </div>

          {/* Related Data Counter */}
          <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
            <span className="flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-slate-400" />
              <strong>{stats.classesCount}</strong> turma(s)
            </span>
            <button
              onClick={() => setViewingStudentsCourse(course)}
              className="flex items-center gap-1.5 px-2 py-1 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-800 font-bold transition-all rounded-xs hover:border-slate-300 group cursor-pointer"
              title="Clique para ver os alunos deste curso"
            >
              <Users className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-800" />
              <span><strong>{stats.activeStudentsCount}</strong> aluno(s) ativo(s)</span>
            </button>
          </div>
        </div>

        {/* Card Footer Actions */}
        {canEdit && (
          <div className="border-t border-slate-100 bg-slate-50/70 p-3 flex items-center justify-between gap-2">
            {isDeleting ? (
              <div className="flex items-center gap-2 w-full justify-between">
                <span className="text-[11px] font-bold text-rose-600">Confirmar exclusão?</span>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setDeleteConfirmId(null)}
                    className="px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-200 border border-slate-300 font-semibold"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => handleDelete(course.id)}
                    className="px-2.5 py-1 text-xs bg-rose-600 text-white hover:bg-rose-700 font-bold"
                  >
                    Sim, Excluir
                  </button>
                </div>
              </div>
            ) : (
              <>
                <button
                  onClick={() => handleToggleStatus(course)}
                  className={cn(
                    "flex items-center gap-1 text-[11px] font-semibold transition-colors px-2 py-1 border",
                    isInactive 
                      ? "text-emerald-700 hover:bg-emerald-50 border-emerald-200 bg-white" 
                      : "text-slate-600 hover:bg-slate-100 border-slate-200 bg-white"
                  )}
                  title={isInactive ? "Reativar curso" : "Inativar curso"}
                >
                  {isInactive ? <Power className="w-3 h-3 text-emerald-600" /> : <PowerOff className="w-3 h-3 text-slate-400" />}
                  <span>{isInactive ? 'Reativar' : 'Inativar'}</span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    id={`edit-course-btn-${course.id}`}
                    onClick={() => handleOpenEdit(course)}
                    className="flex items-center gap-1.5 px-3 py-1 bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 text-xs font-bold transition-colors shadow-2xs"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    Editar
                  </button>
                  <button
                    id={`delete-course-btn-${course.id}`}
                    onClick={() => setDeleteConfirmId(course.id)}
                    className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-200 transition-colors"
                    title="Excluir curso"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderCourseTable = (list: Course[], title: string, badgeColor: string) => {
    return (
      <div className="bg-white border border-slate-200 shadow-sm overflow-hidden mb-6">
        <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className={cn("w-2.5 h-2.5 rounded-full", badgeColor)} />
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              {title} ({list.length})
            </h3>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/50 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                <th className="py-3 px-4">Código</th>
                <th className="py-3 px-4">Nome do Curso</th>
                <th className="py-3 px-4">Duração Total</th>
                <th className="py-3 px-4">Encontros Semanais</th>
                <th className="py-3 px-4">Dia(s) da Semana</th>
                <th className="py-3 px-4 text-center">Turmas</th>
                <th className="py-3 px-4 text-center">Alunos Ativos</th>
                <th className="py-3 px-4 text-center">Status</th>
                {canEdit && <th className="py-3 px-4 text-right">Ações</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {list.map(course => {
                const stats = courseStats.get(course.id) || { classesCount: 0, activeStudentsCount: 0, totalStudentsCount: 0 };
                const isDeleting = deleteConfirmId === course.id;
                const isInactive = course.status === 'Inativo';
                const hasValidDuration = course.duration_total && course.duration_total.trim() !== '' && course.duration_total.trim() !== '—';
                const durationNum = !isInactive ? (course.duration_years && [1, 2, 3, 4].includes(course.duration_years) ? course.duration_years : undefined) : undefined;
                const durationDisplay = hasValidDuration 
                  ? course.duration_total 
                  : (durationNum ? `${durationNum} ${durationNum === 1 ? 'ano' : 'anos'}` : '—');
                const meetingDaysText = course.meeting_days && course.meeting_days.length > 0 
                  ? course.meeting_days.filter(Boolean).join(', ') 
                  : '—';
                const meetingsCount = course.meetings_per_week !== undefined ? course.meetings_per_week : (course.meeting_days?.length || 0);

                return (
                  <tr 
                    key={course.id} 
                    className={cn(
                      "hover:bg-slate-50/80 transition-colors",
                      isInactive && "bg-slate-50/40 text-slate-600"
                    )}
                  >
                    <td className="py-3.5 px-4 font-black uppercase text-slate-900">
                      <span className="px-2 py-0.5 bg-slate-100 border border-slate-200 text-[11px]">
                        {course.code}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-slate-900">{course.name}</div>
                      {course.description && (
                        <div className="text-[11px] text-slate-500 line-clamp-1 max-w-md mt-0.5">
                          {course.description}
                        </div>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-slate-700 font-bold">
                      {durationDisplay}
                    </td>
                    <td className="py-3.5 px-4 text-slate-700 font-medium">
                      {meetingsCount > 0 ? `${meetingsCount} ${meetingsCount === 1 ? 'encontro/sem.' : 'encontros/sem.'}` : '—'}
                    </td>
                    <td className="py-3.5 px-4 text-slate-700 font-medium">
                      <span className="inline-flex items-center px-2 py-0.5 bg-slate-100 border border-slate-200 text-[11px] font-semibold text-slate-800">
                        {meetingDaysText}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <span className="inline-flex items-center gap-1 font-bold text-slate-800">
                        <Layers className="w-3 h-3 text-slate-400" />
                        {stats.classesCount}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <button
                        onClick={() => setViewingStudentsCourse(course)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-50 hover:bg-slate-100 border border-slate-200 hover:border-slate-300 font-bold text-slate-800 transition-all rounded-xs cursor-pointer group shadow-2xs"
                        title="Clique para inspecionar a lista de alunos deste curso"
                      >
                        <Users className="w-3 h-3 text-slate-400 group-hover:text-slate-800" />
                        <span>{stats.activeStudentsCount}</span>
                      </button>
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <button
                        onClick={() => canEdit && handleToggleStatus(course)}
                        disabled={!canEdit}
                        className={cn(
                          "text-[9px] font-black uppercase px-2 py-0.5 border tracking-wider",
                          course.status === 'Ativo' 
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100" 
                            : "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100"
                        )}
                      >
                        {course.status}
                      </button>
                    </td>
                    {canEdit && (
                      <td className="py-3.5 px-4 text-right">
                        {isDeleting ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <span className="text-[10px] font-bold text-rose-600 mr-1">Confirmar?</span>
                            <button
                              onClick={() => setDeleteConfirmId(null)}
                              className="px-2 py-0.5 text-[11px] text-slate-600 hover:bg-slate-200 border border-slate-300"
                            >
                              Não
                            </button>
                            <button
                              onClick={() => handleDelete(course.id)}
                              className="px-2 py-0.5 text-[11px] bg-rose-600 text-white hover:bg-rose-700 font-bold"
                            >
                              Sim
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => handleOpenEdit(course)}
                              className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-transparent hover:border-slate-200 rounded-xs"
                              title="Editar curso"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setDeleteConfirmId(course.id)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-200 rounded-xs"
                              title="Excluir curso"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div id="courses-page-container" className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Toast Notification */}
      {notification && (
        <div 
          id="courses-notification-toast"
          className={cn(
            "fixed top-5 right-5 z-[99999] p-4 shadow-2xl flex items-center gap-3 text-sm font-bold border transition-all animate-in slide-in-from-top-2",
            notification.type === 'success' 
              ? "bg-emerald-600 text-white border-emerald-700 shadow-emerald-950/30" 
              : "bg-rose-600 text-white border-rose-700 shadow-rose-950/30"
          )}
        >
          {notification.type === 'success' ? <CheckCircle2 className="w-5 h-5 text-white" /> : <AlertCircle className="w-5 h-5 text-white" />}
          <span>{notification.message}</span>
        </div>
      )}

      {/* Header */}
      <PageHeader 
        title="Gestão de Cursos"
        description="Catálogo acadêmico oficial de cursos, matrizes de formação e carga horária"
        icon={GraduationCap}
        badge="Catálogo Acadêmico"
      >
        <div className="flex items-center gap-2">
          <button
            id="refresh-courses-btn"
            onClick={loadData}
            disabled={loading}
            className="p-2 bg-white border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors shadow-sm"
            title="Recarregar catálogo"
          >
            <RotateCcw className={cn("w-4 h-4", loading && "animate-spin text-slate-400")} />
          </button>
          {canEdit && (
            <button
              id="create-course-btn"
              onClick={handleOpenCreate}
              className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white hover:bg-slate-800 text-xs font-bold uppercase tracking-wider transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4" />
              Novo Curso
            </button>
          )}
        </div>
      </PageHeader>

      {/* Stats Cards Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Cursos Cadastrados</span>
            <GraduationCap className="w-4 h-4 text-slate-500" />
          </div>
          <p className="text-2xl font-black text-slate-900 mt-2">{courses.length}</p>
          <div className="flex items-center gap-3 text-[11px] text-slate-500 mt-1">
            <span className="text-emerald-700 font-bold">{courses.filter(c => c.status === 'Ativo').length} ativos</span>
            <span>•</span>
            <span className="text-slate-500">{courses.filter(c => c.status === 'Inativo').length} inativos</span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total de Turmas</span>
            <Layers className="w-4 h-4 text-slate-500" />
          </div>
          <p className="text-2xl font-black text-slate-900 mt-2">{classes.length}</p>
          <p className="text-[11px] text-slate-500 mt-1">
            Distribuídas nos cursos
          </p>
        </div>

        <div className="bg-white border border-slate-200 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Alunos Ativos</span>
            <Users className="w-4 h-4 text-slate-500" />
          </div>
          <p className="text-2xl font-black text-slate-900 mt-2">
            {students.filter(s => s.status === 'Ativo').length}
          </p>
          <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-slate-500 mt-1">
            <span className="font-semibold text-emerald-700">{totalActiveInCourses} em cursos</span>
            {unassignedActiveStudents > 0 && (
              <>
                <span>•</span>
                <span className="text-amber-700 font-medium">{unassignedActiveStudents} sem turma</span>
              </>
            )}
          </div>
        </div>

        <div className="bg-white border border-slate-200 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Encontros Semanais</span>
            <Calendar className="w-4 h-4 text-slate-500" />
          </div>
          <p className="text-2xl font-black text-slate-900 mt-2">
            {courses.length > 0 
              ? (courses.reduce((acc, curr) => acc + (curr.meetings_per_week || curr.meeting_days?.length || 1), 0) / courses.length).toFixed(1).replace('.0', '')
              : 0}
          </p>
          <p className="text-[11px] text-slate-500 mt-1">
            Média por curso formativo
          </p>
        </div>
      </div>

      {/* Search, Filter & Layout View Toolbar */}
      <div className="bg-white border border-slate-200 p-4 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="relative w-full md:w-96">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            id="course-search-input"
            type="text"
            placeholder="Buscar por nome, sigla ou descrição..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-slate-200 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-slate-800 transition-colors"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto justify-end">
          {/* Status Filter Tabs */}
          <div className="flex items-center bg-slate-100 p-0.5 border border-slate-200">
            {(['Todos', 'Ativo', 'Inativo'] as const).map(st => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={cn(
                  "px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider transition-colors",
                  statusFilter === st 
                    ? "bg-white text-slate-900 shadow-2xs font-black" 
                    : "text-slate-600 hover:text-slate-900"
                )}
              >
                {st}
              </button>
            ))}
          </div>

          {/* View Mode Switcher: Grid vs Table */}
          <div className="flex items-center border border-slate-200 bg-white p-0.5">
            <button
              id="courses-view-table-btn"
              onClick={() => handleSetViewMode('table')}
              className={cn(
                "p-1.5 transition-colors",
                viewMode === 'table' 
                  ? "bg-slate-900 text-white" 
                  : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"
              )}
              title="Visualização em Listagem (Padrão)"
            >
              <ListIcon className="w-4 h-4" />
            </button>
            <button
              id="courses-view-grid-btn"
              onClick={() => handleSetViewMode('grid')}
              className={cn(
                "p-1.5 transition-colors",
                viewMode === 'grid' 
                  ? "bg-slate-900 text-white" 
                  : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"
              )}
              title="Visualização em Blocos"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Content Rendering based on viewMode and Status Sections */}
      {totalFiltered === 0 && !loading ? (
        <div className="py-16 text-center bg-white border border-slate-200 p-8 shadow-sm">
          <GraduationCap className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Nenhum curso encontrado</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
            {searchTerm 
              ? 'Nenhum registro corresponde aos termos pesquisados. Tente ajustar os filtros.' 
              : 'O catálogo de cursos está vazio. Clique em "Novo Curso" para iniciar o cadastro.'}
          </p>
          {canEdit && !searchTerm && (
            <button
              onClick={handleOpenCreate}
              className="mt-4 px-4 py-2 bg-slate-900 text-white text-xs font-bold uppercase tracking-wider hover:bg-slate-800 shadow-sm"
            >
              Cadastrar Primeiro Curso
            </button>
          )}
        </div>
      ) : viewMode === 'grid' ? (
        <div className="space-y-8">
          {/* SECTION: CURSOS ATIVOS */}
          {activeCourses.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-600" />
                  <h2 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                    Cursos Ativos ({activeCourses.length})
                  </h2>
                </div>
                <span className="text-[11px] text-slate-500">
                  Disponíveis para matrículas e novas turmas
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {activeCourses.map(renderCourseCard)}
              </div>
            </div>
          )}

          {/* SECTION: CURSOS INATIVOS */}
          {inactiveCourses.length > 0 && (
            <div className="space-y-4 pt-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                <div className="flex items-center gap-2">
                  <Archive className="w-4 h-4 text-amber-600" />
                  <h2 className="text-xs font-black text-slate-700 uppercase tracking-wider">
                    Cursos Inativos / Arquivados ({inactiveCourses.length})
                  </h2>
                </div>
                <span className="text-[11px] text-slate-500">
                  Ocultos para novas turmas, mantidos para histórico
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {inactiveCourses.map(renderCourseCard)}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {/* Table for Active Courses */}
          {activeCourses.length > 0 && renderCourseTable(activeCourses, 'Cursos Ativos', 'bg-emerald-500')}

          {/* Table for Inactive Courses */}
          {inactiveCourses.length > 0 && renderCourseTable(inactiveCourses, 'Cursos Inativos / Arquivados', 'bg-amber-500')}
        </div>
      )}

      {/* Modal de Criação / Edição */}
      {showModal && (
        <div id="course-form-modal" className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 shadow-xl max-w-lg w-full">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
              <div className="flex items-center gap-2.5">
                <GraduationCap className="w-5 h-5 text-slate-700" />
                <h3 className="text-sm font-bold text-slate-900">
                  {editingCourse ? 'Editar Curso' : 'Novo Curso'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-slate-700 p-1 transition-colors cursor-pointer"
                title="Fechar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-4">
              {/* Inline Modal Error Banner if any */}
              {notification && notification.type === 'error' && (
                <div className="p-3 bg-rose-50 border border-rose-300 text-rose-900 text-xs font-bold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{notification.message}</span>
                </div>
              )}

              {/* Nome e Sigla */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2 space-y-1">
                  <label className="text-xs font-semibold text-slate-700 block">
                    Nome do Curso <span className="text-rose-500">*</span>
                  </label>
                  <input
                    id="course-name-input"
                    type="text"
                    required
                    placeholder="Ex: Teologia, Doutrina Social..."
                    value={formData.name || ''}
                    onChange={handleNameChange}
                    className="w-full px-3 py-2 border border-slate-300 text-xs font-medium text-slate-900 focus:outline-none focus:border-slate-800 focus:ring-1 focus:ring-slate-800"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700 block">
                    Sigla / Código <span className="text-rose-500">*</span>
                  </label>
                  <input
                    id="course-code-input"
                    type="text"
                    required
                    maxLength={6}
                    placeholder="Ex: TEO"
                    value={formData.code || ''}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                    className="w-full px-3 py-2 border border-slate-300 text-xs font-bold text-slate-900 uppercase focus:outline-none focus:border-slate-800 focus:ring-1 focus:ring-slate-800"
                  />
                </div>
              </div>

              {/* Descrição */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700 block">
                  Descrição
                </label>
                <input
                  id="course-description-input"
                  type="text"
                  placeholder="—"
                  value={formData.description || ''}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 text-xs text-slate-900 focus:outline-none focus:border-slate-800 focus:ring-1 focus:ring-slate-800"
                />
              </div>

              {/* Duração, Quantidade de Encontros e Status */}
              <div className="pt-2 border-t border-slate-100 space-y-2">
                <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wide block">
                  Duração e Encontros
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Duração Total */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-slate-700 block">
                        Duração (anos) {formData.status === 'Ativo' && <span className="text-rose-500">*</span>}
                      </label>
                      {formData.duration_total && ['1', '2', '3', '4'].includes(formData.duration_total.trim()) && (
                        <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 border border-emerald-200">
                          {formData.duration_total.trim()} {formData.duration_total.trim() === '1' ? 'ano' : 'anos'}
                        </span>
                      )}
                    </div>
                    <div className="relative">
                      <input
                        id="course-duration-total-input"
                        type="text"
                        placeholder="—"
                        value={formData.duration_total || ''}
                        onChange={(e) => setFormData({ ...formData, duration_total: e.target.value })}
                        className={cn(
                          "w-full px-3 py-2 pr-7 border text-xs font-medium focus:outline-none focus:ring-1",
                          !isDurationValid(formData.duration_total, formData.status === 'Ativo')
                            ? "border-rose-500 bg-rose-50/20 text-rose-900 focus:border-rose-600 focus:ring-rose-600"
                            : "border-slate-300 text-slate-900 focus:border-slate-800 focus:ring-slate-800"
                        )}
                      />
                      {formData.duration_total && (
                        <button
                          type="button"
                          onClick={() => setFormData({ ...formData, duration_total: '' })}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-0.5 cursor-pointer"
                          title="Limpar"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    {!isDurationValid(formData.duration_total, formData.status === 'Ativo') && (
                      <p className="text-[10px] font-bold text-rose-600 flex items-center gap-1 mt-0.5">
                        <AlertCircle className="w-3 h-3 shrink-0" />
                        {formData.status === 'Ativo' && !(formData.duration_total || '').trim() 
                          ? 'Duração obrigatória (digite de 1 a 4).' 
                          : 'Valor inválido. Digite um número de 1 a 4.'}
                      </p>
                    )}
                  </div>

                  {/* Encontros Semanais */}
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700 block">
                      Encontros / Semana {formData.status === 'Ativo' && <span className="text-rose-500">*</span>}
                    </label>
                    <select
                      id="course-meetings-count-select"
                      value={formData.meetings_per_week !== undefined ? formData.meetings_per_week : 0}
                      onChange={(e) => handleMeetingsCountChange(parseInt(e.target.value, 10))}
                      className="w-full px-3 py-2 border border-slate-300 text-xs font-medium text-slate-900 bg-white focus:outline-none focus:border-slate-800 focus:ring-1 focus:ring-slate-800"
                    >
                      <option value={0}>—</option>
                      <option value={1}>1 dia por semana</option>
                      <option value={2}>2 dias por semana</option>
                      <option value={3}>3 dias por semana</option>
                      <option value={4}>4 dias por semana</option>
                      <option value={5}>5 dias por semana</option>
                    </select>
                  </div>

                  {/* Chave Seletora de Status (Ativo / Inativo) */}
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700 block">
                      Status
                    </label>
                    <button
                      id="course-status-toggle"
                      type="button"
                      onClick={() => {
                        const newStatus = formData.status === 'Ativo' ? 'Inativo' : 'Ativo';
                        setFormData(prev => ({
                          ...prev,
                          status: newStatus,
                          ...(newStatus === 'Inativo' ? {
                            duration_total: '',
                            meetings_per_week: 0,
                            meeting_days: []
                          } : {})
                        }));
                      }}
                      className={cn(
                        "w-full h-[38px] px-3 border flex items-center justify-between transition-colors cursor-pointer text-xs font-semibold",
                        formData.status === 'Ativo'
                          ? "bg-emerald-50 border-emerald-300 text-emerald-800"
                          : "bg-slate-50 border-slate-300 text-slate-600"
                      )}
                    >
                      <span>{formData.status === 'Ativo' ? 'Ativo' : 'Inativo'}</span>
                      <span className={cn(
                        "w-4 h-4 rounded-full flex items-center justify-center text-[10px] text-white font-bold",
                        formData.status === 'Ativo' ? "bg-emerald-600" : "bg-slate-400"
                      )}>
                        {formData.status === 'Ativo' ? '✓' : '✕'}
                      </span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Vinculação dos Dias da Semana conforme a quantidade */}
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <label className="text-xs font-semibold text-slate-700 block">
                  Dia(s) da Semana {(formData.meetings_per_week || 0) > 1 ? 'de cada encontro' : 'do encontro'} {formData.status === 'Ativo' && <span className="text-rose-500">*</span>}:
                </label>

                {(formData.meetings_per_week || 0) > 0 ? (
                  <div className={cn(
                    "grid gap-2.5",
                    formData.meetings_per_week === 1 ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2"
                  )}>
                    {Array.from({ length: formData.meetings_per_week || 1 }).map((_, slotIndex) => {
                      const selectedDay = (formData.meeting_days || [])[slotIndex] || '';
                      return (
                        <div key={slotIndex} className="flex items-center gap-2">
                          {(formData.meetings_per_week || 1) > 1 && (
                            <span className="text-xs text-slate-500 font-medium whitespace-nowrap min-w-[75px]">
                              {slotIndex + 1}º Encontro:
                            </span>
                          )}
                          <select
                            value={selectedDay}
                            onChange={(e) => handleSlotDayChange(slotIndex, e.target.value)}
                            className="w-full px-3 py-2 border border-slate-300 text-xs font-medium text-slate-900 bg-white focus:outline-none focus:border-slate-800 focus:ring-1 focus:ring-slate-800"
                          >
                            <option value="">—</option>
                            {WEEK_DAYS.map(day => (
                              <option key={day} value={day}>
                                {day}
                              </option>
                            ))}
                          </select>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 font-medium py-1">
                    —
                  </p>
                )}
              </div>

              {/* Ações */}
              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  disabled={isSaving}
                  className="px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-semibold transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="flex items-center gap-1.5 px-5 py-2 bg-slate-900 text-white hover:bg-slate-800 text-xs font-bold transition-colors shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  {isSaving ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Inspeção de Alunos do Curso */}
      {viewingStudentsCourse && (
        <div id="course-students-modal" className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 print:hidden">
          <div className="bg-white border border-slate-200 shadow-2xl max-w-5xl w-full max-h-[92vh] flex flex-col animate-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex flex-wrap items-center justify-between p-4 sm:p-5 border-b border-slate-200 bg-slate-50 gap-3 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-slate-900 text-white flex items-center justify-center font-bold shrink-0">
                  <GraduationCap className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-slate-900 uppercase tracking-wide">
                      {viewingStudentsCourse.name}
                    </h3>
                    <span className="px-2 py-0.5 bg-slate-200 text-slate-800 text-[10px] font-black uppercase">
                      {viewingStudentsCourse.code}
                    </span>
                  </div>
                  <p className="text-[11px] font-medium text-slate-500 mt-0.5">
                    Lista nominal de alunos matriculados neste curso formativo
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handlePrintRoster}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-100 hover:border-slate-400 text-slate-800 text-xs font-bold transition-all shadow-2xs cursor-pointer"
                  title="Imprimir listagem completa dos alunos matriculados"
                >
                  <Printer className="w-4 h-4 text-slate-600" />
                  <span>Imprimir Listagem</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleExportCSV(viewingStudentsCourse)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-100 hover:border-slate-400 text-slate-800 text-xs font-bold transition-all shadow-2xs cursor-pointer"
                  title="Exportar listagem em formato CSV / Excel"
                >
                  <Download className="w-4 h-4 text-slate-600" />
                  <span>Exportar CSV</span>
                </button>

                <button
                  onClick={() => {
                    setViewingStudentsCourse(null);
                    setStudentSearchTerm('');
                    setStudentClassFilter('all');
                  }}
                  className="text-slate-400 hover:text-slate-700 p-1.5 transition-colors cursor-pointer"
                  title="Fechar"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Search, Filter & Order Bar */}
            <div className="p-3 sm:p-4 border-b border-slate-200 bg-white flex flex-wrap items-center justify-between gap-3 shrink-0">
              {/* Search input */}
              <div className="relative flex-1 min-w-[240px] max-w-md">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Buscar por nome, matrícula ou turma..."
                  value={studentSearchTerm}
                  onChange={(e) => setStudentSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-8 py-1.5 border border-slate-200 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-slate-900"
                />
                {studentSearchTerm && (
                  <button
                    onClick={() => setStudentSearchTerm('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Class Filter Dropdown */}
              {currentCourseClasses.length > 1 && (
                <div className="flex items-center gap-1.5">
                  <Filter className="w-3.5 h-3.5 text-slate-400" />
                  <select
                    value={studentClassFilter}
                    onChange={(e) => setStudentClassFilter(e.target.value)}
                    className="py-1.5 px-2.5 border border-slate-200 text-xs font-semibold text-slate-800 bg-white focus:outline-none focus:border-slate-900 cursor-pointer"
                  >
                    <option value="all">Todas as Turmas</option>
                    {currentCourseClasses.map(clsName => (
                      <option key={clsName} value={clsName}>
                        Turma: {clsName}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Sorting / Grouping selector */}
              <div className="flex items-center gap-1 bg-slate-100 p-1 border border-slate-200">
                <button
                  type="button"
                  onClick={() => setStudentSortMode('class')}
                  className={cn(
                    "flex items-center gap-1 px-2.5 py-1 text-xs font-bold transition-all cursor-pointer",
                    studentSortMode === 'class'
                      ? "bg-slate-900 text-white shadow-xs"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/60"
                  )}
                  title="Agrupar os alunos por turma"
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>Agrupar por Turma</span>
                </button>

                <button
                  type="button"
                  onClick={() => setStudentSortMode('name')}
                  className={cn(
                    "flex items-center gap-1 px-2.5 py-1 text-xs font-bold transition-all cursor-pointer",
                    studentSortMode === 'name'
                      ? "bg-slate-900 text-white shadow-xs"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/60"
                  )}
                  title="Listar em ordem alfabética de A a Z"
                >
                  <SortAsc className="w-3.5 h-3.5" />
                  <span>Ordem Alfabética (A-Z)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setStudentSortMode('registration')}
                  className={cn(
                    "flex items-center gap-1 px-2.5 py-1 text-xs font-bold transition-all cursor-pointer",
                    studentSortMode === 'registration'
                      ? "bg-slate-900 text-white shadow-xs"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/60"
                  )}
                  title="Ordenar por número de Matrícula (RA)"
                >
                  <ArrowUpDown className="w-3.5 h-3.5" />
                  <span>Por Matrícula</span>
                </button>
              </div>
            </div>

            {/* Students List Body */}
            <div className="overflow-y-auto flex-1 p-0">
              {(() => {
                const list = courseStudentsMap.get(viewingStudentsCourse.id) || [];
                const term = studentSearchTerm.toLowerCase().trim();
                
                // Filter by search term and class filter
                const filtered = list.filter(item => {
                  if (studentClassFilter !== 'all' && item.className !== studentClassFilter) {
                    return false;
                  }
                  if (!term) return true;
                  return (
                    (item.student.name || '').toLowerCase().includes(term) ||
                    (item.student.registration_number || '').toLowerCase().includes(term) ||
                    (item.student.cpf || '').toLowerCase().includes(term) ||
                    (item.className || '').toLowerCase().includes(term)
                  );
                });

                if (filtered.length === 0) {
                  return (
                    <div className="p-12 text-center text-slate-500 space-y-2">
                      <Users className="w-8 h-8 text-slate-300 mx-auto" />
                      <p className="text-xs font-semibold">Nenhum aluno encontrado para os critérios pesquisados.</p>
                      {(studentSearchTerm || studentClassFilter !== 'all') && (
                        <button
                          onClick={() => {
                            setStudentSearchTerm('');
                            setStudentClassFilter('all');
                          }}
                          className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors"
                        >
                          Limpar Filtros
                        </button>
                      )}
                    </div>
                  );
                }

                // If grouping by class
                if (studentSortMode === 'class') {
                  // Group items by className
                  const groupedMap = new Map<string, typeof filtered>();
                  filtered.forEach(item => {
                    const groupKey = item.className || 'Sem Turma Alocada';
                    if (!groupedMap.has(groupKey)) {
                      groupedMap.set(groupKey, []);
                    }
                    groupedMap.get(groupKey)!.push(item);
                  });

                  // Sort each group alphabetically by student name
                  groupedMap.forEach(groupList => {
                    groupList.sort((a, b) => (a.student.name || '').localeCompare(b.student.name || ''));
                  });

                  // Sort group keys
                  const sortedGroups = Array.from(groupedMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));

                  return (
                    <div className="divide-y-2 divide-slate-200">
                      {sortedGroups.map(([groupName, groupStudents]) => (
                        <div key={groupName} className="bg-white">
                          {/* Group Header Banner */}
                          <div className="sticky top-0 z-10 px-4 py-2.5 bg-slate-100 border-b border-slate-200 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Layers className="w-4 h-4 text-slate-600" />
                              <span className="font-black text-xs text-slate-900 uppercase tracking-wide">
                                Turma: {groupName}
                              </span>
                            </div>
                            <span className="px-2.5 py-0.5 bg-slate-900 text-white text-[10px] font-bold">
                              {groupStudents.length} aluno(s)
                            </span>
                          </div>

                          {/* Table inside group */}
                          <table className="w-full text-left border-collapse text-xs">
                            <thead className="bg-slate-50/70 border-b border-slate-100 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                              <tr>
                                <th className="py-2 px-4 w-12 text-center">#</th>
                                <th className="py-2 px-4">Estudante</th>
                                <th className="py-2 px-4">Matrícula (RA)</th>
                                <th className="py-2 px-4">Tipo de Vínculo</th>
                                <th className="py-2 px-4 text-center">Situação</th>
                                <th className="py-2 px-4 text-right">Ações</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {groupStudents.map((item, idx) => {
                                const isParallel = item.linkType === 'parallel';
                                const isDirect = item.linkType === 'direct';

                                return (
                                  <tr key={`${item.student.id}-${idx}`} className="hover:bg-slate-50/80 transition-colors">
                                    <td className="py-2.5 px-4 text-center font-black text-slate-400 text-[11px]">
                                      {idx + 1}
                                    </td>
                                    <td className="py-2.5 px-4">
                                      <div className="font-bold text-slate-900">{item.student.name}</div>
                                      {item.allClassNames.length > 1 && (
                                        <div className="text-[10px] text-indigo-600 font-semibold mt-0.5 flex items-center gap-1">
                                          <span>✦ Cursando {item.allClassNames.length} turmas em paralelo</span>
                                        </div>
                                      )}
                                    </td>
                                    <td className="py-2.5 px-4 font-mono font-bold text-slate-700">
                                      {item.student.registration_number || '—'}
                                    </td>
                                    <td className="py-2.5 px-4">
                                      {isParallel ? (
                                        <span className="inline-flex items-center px-2 py-0.5 bg-purple-50 text-purple-800 border border-purple-200 text-[10px] font-bold">
                                          Matrícula em Paralelo (2º Curso)
                                        </span>
                                      ) : isDirect ? (
                                        <span className="inline-flex items-center px-2 py-0.5 bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-bold">
                                          Vínculo por Cadastro
                                        </span>
                                      ) : (
                                        <span className="inline-flex items-center px-2 py-0.5 bg-slate-100 text-slate-800 border border-slate-200 text-[10px] font-bold">
                                          Turma Principal
                                        </span>
                                      )}
                                    </td>
                                    <td className="py-2.5 px-4 text-center">
                                      <span className={cn(
                                        "px-2 py-0.5 text-[9px] font-black uppercase tracking-wider border",
                                        item.student.status === 'Ativo' 
                                          ? "bg-emerald-50 text-emerald-700 border-emerald-200" 
                                          : "bg-rose-50 text-rose-700 border-rose-200"
                                      )}>
                                        {item.student.status || 'Ativo'}
                                      </span>
                                    </td>
                                    <td className="py-2.5 px-4 text-right">
                                      <button
                                        onClick={() => {
                                          setViewingStudentsCourse(null);
                                          navigate(`/students?search=${encodeURIComponent(item.student.registration_number || item.student.name)}`);
                                        }}
                                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 hover:text-slate-900 text-[11px] font-bold transition-all shadow-2xs cursor-pointer"
                                        title="Abrir ficha do aluno"
                                      >
                                        <span>Ver Ficha</span>
                                        <ExternalLink className="w-3 h-3 text-slate-400" />
                                      </button>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      ))}
                    </div>
                  );
                }

                // If Flat list (Alphabetical or Registration)
                const sortedList = [...filtered];
                if (studentSortMode === 'name') {
                  sortedList.sort((a, b) => (a.student.name || '').localeCompare(b.student.name || ''));
                } else if (studentSortMode === 'registration') {
                  sortedList.sort((a, b) => (a.student.registration_number || '').localeCompare(b.student.registration_number || ''));
                }

                return (
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 z-10">
                      <tr className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                        <th className="py-2.5 px-4 w-12 text-center">#</th>
                        <th className="py-2.5 px-4">Estudante</th>
                        <th className="py-2.5 px-4">Matrícula (RA)</th>
                        <th className="py-2.5 px-4">Turma Vinculada</th>
                        <th className="py-2.5 px-4">Tipo de Vínculo</th>
                        <th className="py-2.5 px-4 text-center">Situação</th>
                        <th className="py-2.5 px-4 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {sortedList.map((item, idx) => {
                        const isParallel = item.linkType === 'parallel';
                        const isDirect = item.linkType === 'direct';

                        return (
                          <tr key={`${item.student.id}-${idx}`} className="hover:bg-slate-50/80 transition-colors">
                            <td className="py-2.5 px-4 text-center font-black text-slate-400 text-[11px]">
                              {idx + 1}
                            </td>
                            <td className="py-2.5 px-4">
                              <div className="font-bold text-slate-900">{item.student.name}</div>
                              {item.allClassNames.length > 1 && (
                                <div className="text-[10px] text-indigo-600 font-semibold mt-0.5 flex items-center gap-1">
                                  <span>✦ Cursando {item.allClassNames.length} turmas em paralelo</span>
                                </div>
                              )}
                            </td>
                            <td className="py-2.5 px-4 font-mono font-bold text-slate-700">
                              {item.student.registration_number || '—'}
                            </td>
                            <td className="py-2.5 px-4 text-slate-800 font-medium">
                              <span className="px-2 py-0.5 bg-slate-100 border border-slate-200 text-[11px] font-semibold">
                                {item.className}
                              </span>
                            </td>
                            <td className="py-2.5 px-4">
                              {isParallel ? (
                                <span className="inline-flex items-center px-2 py-0.5 bg-purple-50 text-purple-800 border border-purple-200 text-[10px] font-bold">
                                  Matrícula em Paralelo (2º Curso)
                                </span>
                              ) : isDirect ? (
                                <span className="inline-flex items-center px-2 py-0.5 bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-bold">
                                  Vínculo por Cadastro
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-2 py-0.5 bg-slate-100 text-slate-800 border border-slate-200 text-[10px] font-bold">
                                  Turma Principal
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 px-4 text-center">
                              <span className={cn(
                                "px-2 py-0.5 text-[9px] font-black uppercase tracking-wider border",
                                item.student.status === 'Ativo' 
                                  ? "bg-emerald-50 text-emerald-700 border-emerald-200" 
                                  : "bg-rose-50 text-rose-700 border-rose-200"
                              )}>
                                {item.student.status || 'Ativo'}
                              </span>
                            </td>
                            <td className="py-2.5 px-4 text-right">
                              <button
                                onClick={() => {
                                  setViewingStudentsCourse(null);
                                  navigate(`/students?search=${encodeURIComponent(item.student.registration_number || item.student.name)}`);
                                }}
                                className="inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 hover:text-slate-900 text-[11px] font-bold transition-all shadow-2xs cursor-pointer"
                                title="Abrir ficha do aluno"
                              >
                                <span>Ver Ficha</span>
                                <ExternalLink className="w-3 h-3 text-slate-400" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                );
              })()}
            </div>

            {/* Modal Footer */}
            <div className="p-3 sm:p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
              <div className="text-[11px] text-slate-500 font-medium flex items-center gap-1.5">
                <BookOpen className="w-3.5 h-3.5 text-slate-400" />
                <span>Total de <strong>{(courseStudentsMap.get(viewingStudentsCourse.id) || []).length} aluno(s)</strong> vinculados ao curso.</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setViewingStudentsCourse(null);
                  setStudentSearchTerm('');
                  setStudentClassFilter('all');
                }}
                className="px-5 py-2 bg-slate-900 text-white hover:bg-slate-800 text-xs font-bold uppercase tracking-wider transition-colors shadow-sm cursor-pointer"
              >
                Fechar Lista
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Relatório Oficial para Impressão (Visível exclusivamente durante o Print) */}
      {viewingStudentsCourse && (
        <div id="printable-course-roster" className="hidden print:block font-sans text-black p-4 bg-white">
          <div className="text-center border-b-2 border-black pb-3 mb-4">
            <h1 className="text-lg font-bold uppercase tracking-wide">Escola Diocesana de Ministério</h1>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-700 mt-0.5">
              Relação Oficial de Alunos Matriculados por Curso
            </h2>
            <div className="mt-2 flex flex-wrap items-center justify-center gap-4 text-[11px] text-slate-800">
              <span><strong>Curso:</strong> {viewingStudentsCourse.name} ({viewingStudentsCourse.code})</span>
              <span><strong>Duração Total:</strong> {viewingStudentsCourse.duration_total || (viewingStudentsCourse.duration_years ? `${viewingStudentsCourse.duration_years} ano(s)` : '1 ano')}</span>
              <span><strong>Encontros:</strong> {viewingStudentsCourse.meeting_days && viewingStudentsCourse.meeting_days.length > 0 ? viewingStudentsCourse.meeting_days.join(', ') : 'A definir'} ({viewingStudentsCourse.meetings_per_week || viewingStudentsCourse.meeting_days?.length || 1}x/sem)</span>
              <span><strong>Status:</strong> {viewingStudentsCourse.status}</span>
              <span><strong>Total:</strong> {(courseStudentsMap.get(viewingStudentsCourse.id) || []).length} alunos</span>
              <span><strong>Data de Emissão:</strong> {new Date().toLocaleDateString('pt-BR')} às {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
          </div>

          <table className="w-full text-left border-collapse text-[11px] border border-black">
            <thead>
              <tr className="bg-slate-100 border-b border-black font-bold uppercase text-[9px]">
                <th className="p-1.5 border-r border-black w-8 text-center">#</th>
                <th className="p-1.5 border-r border-black w-24">Matrícula (RA)</th>
                <th className="p-1.5 border-r border-black">Nome Completo do Estudante</th>
                <th className="p-1.5 border-r border-black w-32">Turma</th>
                <th className="p-1.5 border-r border-black w-20 text-center">Situação</th>
                <th className="p-1.5 w-36 text-center">Assinatura / Visto</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                const list = [...(courseStudentsMap.get(viewingStudentsCourse.id) || [])];
                list.sort((a, b) => {
                  const classCompare = (a.className || '').localeCompare(b.className || '');
                  if (classCompare !== 0) return classCompare;
                  return (a.student.name || '').localeCompare(b.student.name || '');
                });

                return list.map((item, idx) => (
                  <tr key={`${item.student.id}-print-${idx}`} className="border-b border-slate-300">
                    <td className="p-1.5 border-r border-slate-300 text-center font-bold text-slate-600">
                      {idx + 1}
                    </td>
                    <td className="p-1.5 border-r border-slate-300 font-mono font-bold">
                      {item.student.registration_number || '—'}
                    </td>
                    <td className="p-1.5 border-r border-slate-300 font-bold">
                      {item.student.name}
                      {item.linkType === 'parallel' && (
                        <span className="text-[9px] font-normal text-slate-500 ml-1">(2º Curso)</span>
                      )}
                    </td>
                    <td className="p-1.5 border-r border-slate-300">
                      {item.className}
                    </td>
                    <td className="p-1.5 border-r border-slate-300 text-center uppercase font-bold text-[9px]">
                      {item.student.status || 'Ativo'}
                    </td>
                    <td className="p-1.5 border-slate-300">
                      {/* Espaço para visto manual */}
                    </td>
                  </tr>
                ));
              })()}
            </tbody>
          </table>

          <div className="mt-8 pt-4 flex justify-between items-end text-[10px] text-slate-600 border-t border-slate-300">
            <div>
              <p>Escola Diocesana de Ministério — Gestão Acadêmica</p>
              <p className="text-[9px] text-slate-400">Documento gerado automaticamente pelo Sistema Diocesano</p>
            </div>
            <div className="text-center">
              <div className="w-56 border-b border-black mb-1"></div>
              <p className="font-bold text-slate-800">Secretaria Acadêmica / Direção</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
