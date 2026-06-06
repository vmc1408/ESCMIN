import React, { useState, useEffect } from 'react';
import { 
  ClipboardCheck, 
  Search, 
  Calendar as CalendarIcon,
  ChevronRight,
  Filter,
  Check,
  X,
  Info,
  Printer,
  FileText,
  ChevronDown,
  Clock,
  BookOpen,
  School,
  Save,
  Loader2,
  Download,
  Edit,
  Unlock
} from 'lucide-react';
import { cn, maskDate, formatDateForDisplay, parseDateToDB } from '../lib/utils';
import { fetchAll, saveData, deleteData, fetchQuery, saveBatch } from '../lib/database';
import { useAuth } from '../contexts/AuthContext';
import { motion, AnimatePresence } from 'motion/react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

interface Student {
  id: string;
  name: string;
  registration_number: string;
  class_id: string;
}

interface Class {
  id: string;
  name: string;
  code: string;
  room?: string;
  subject_ids?: string[];
  days_of_week?: string[];
  start_date?: string;
}

interface Subject {
  id: string;
  code?: string;
  name: string;
  teacher_id?: string;
  program_content?: string;
  semester?: string;
  year?: number | string;
}

interface Teacher {
  id: string;
  name: string;
  subject_ids?: string[];
}

interface AttendanceRecord {
  id?: string;
  student_id: string;
  class_id: string;
  subject_id: string;
  date: string;
  status: 'P' | 'F' | 'J';
  observations?: string;
}

interface AttendanceProps {
  initialMode?: 'marking' | 'monthly';
}

export function Attendance({ initialMode }: AttendanceProps = {}) {
  const { userAuth, isAdmin, isDirector } = useAuth();
  const [activeTab, setActiveTab] = useState<'marking' | 'monthly'>(initialMode || 'marking');

  useEffect(() => {
    if (initialMode) {
      setActiveTab(initialMode);
    }
  }, [initialMode]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [attendance, setAttendance] = useState<Record<string, AttendanceRecord>>({});
  const [academicParams, setAcademicParams] = useState<any>(null);
  const [calendarDays, setCalendarDays] = useState<number>(0);
  const [studentAbsences, setStudentAbsences] = useState<Record<string, number>>({});
  const [studentGrades, setStudentGrades] = useState<Record<string, any>>({});
  const [closedSessionsCount, setClosedSessionsCount] = useState<number>(0);
  const [closedDates, setClosedDates] = useState<Set<string>>(new Set());
  const [monthlyAttendance, setMonthlyAttendance] = useState<Record<string, Record<string, string>>>({});
  const [initialMonthlyAttendance, setInitialMonthlyAttendance] = useState<Record<string, Record<string, string>>>({});
  const [modifiedRecords, setModifiedRecords] = useState<Record<string, { studentId: string; date: string; status: string | null }>>({});
  const [savingMonthly, setSavingMonthly] = useState(false);
  
  const [institution, setInstitution] = useState<any>(null);
  const [attendancePdfBlobUrl, setAttendancePdfBlobUrl] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [selectedClass, setSelectedClass] = useState<string>('');
  const [selectedSubject, setSelectedSubject] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<string>(formatDateForDisplay(new Date().toISOString().split('T')[0]));
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [classEvents, setClassEvents] = useState<any[]>([]);
  
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [closing, setClosing] = useState(false);
  const [isClosed, setIsClosed] = useState(false);
  const [reopenConfirm, setReopenConfirm] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'err', message: string } | null>(null);
  const [abonoModal, setAbonoModal] = useState<{
    isOpen: boolean;
    studentId: string;
    studentName: string;
    type: 'atraso' | 'ausencia' | 'outros';
    customReason: string;
    isMonthly?: boolean;
    date?: string;
  } | null>(null);

  const fetchData = React.useCallback(async () => {
    try {
      const [classesData, subjectsData, paramsData, instData, teachersData] = await Promise.all([
        fetchQuery('classes', [{ field: 'status', operator: '==', value: 'Ativo' }]),
        fetchQuery('subjects', [{ field: 'status', operator: '==', value: 'Ativo' }]),
        fetchAll('academic_parameters', '*', ''),
        fetchAll('institution_settings'),
        fetchAll('teachers', 'id, name, subject_ids, status', 'name', true)
      ]);

      if (instData && instData.length > 0) {
        setInstitution(instData[0]);
      }
      
      const normalizedTeachers = (teachersData || []).map((t: any) => {
        let normalized = { ...t };
        let sIds = normalized.subject_ids || [];
        if (typeof sIds === 'string') {
          if (sIds.startsWith('{')) {
            sIds = sIds.replace(/[{}]/g, '').split(',').filter(Boolean);
          } else {
            try {
              const parsed = JSON.parse(sIds);
              sIds = Array.isArray(parsed) ? parsed : [parsed];
            } catch (e) {
              sIds = sIds ? [sIds] : [];
            }
          }
        }
        normalized.subject_ids = sIds;
        return normalized;
      });
      setTeachers(normalizedTeachers);

      const normalizedClasses = (classesData || []).map((cls: any) => {
        let normalized = { ...cls };
        // Ensure subject_ids is always an array
        let sIds: string[] = [];
        if (Array.isArray(normalized.subject_ids)) {
          sIds = normalized.subject_ids;
        } else if (typeof normalized.subject_ids === 'string') {
          try {
            const parsed = JSON.parse(normalized.subject_ids);
            sIds = Array.isArray(parsed) ? parsed : [parsed];
          } catch (e) {
            sIds = normalized.subject_ids ? [normalized.subject_ids] : [];
          }
        } else if (normalized.subject_id) {
          sIds = [normalized.subject_id];
        }
        normalized.subject_ids = sIds;

        // Ensure days_of_week is always an array
        if (typeof normalized.days_of_week === 'string') {
          try {
            normalized.days_of_week = JSON.parse(normalized.days_of_week);
          } catch (e) {
            normalized.days_of_week = normalized.days_of_week ? [normalized.days_of_week] : [];
          }
        } else if (!Array.isArray(normalized.days_of_week)) {
          normalized.days_of_week = [];
        }

        return normalized;
      });

      const sortedClasses = (normalizedClasses || []).sort((a: any, b: any) => {
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

      const normalizedSubjects = (subjectsData || []).map((s: any) => {
        let normalized = { ...s };
        if ((!normalized.semester || !normalized.teacher_id || !normalized.year) && normalized.program_content) {
          const match = normalized.program_content.match(/\[METADATA:(\{[\s\S]*?\})\]/);
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

      setClasses(sortedClasses);
      setSubjects(normalizedSubjects);
      if (paramsData && paramsData.length > 0) {
        setAcademicParams(paramsData[0]);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    }
  }, []);

  const fetchClassEvents = React.useCallback(async () => {
    if (!selectedClass) {
      setClassEvents([]);
      return;
    }
    try {
      // Fetch ALL calendar events for the selected year
      // This ensures we catch global holidays/cancellations and class-specific ones
      const events = await fetchQuery('calendar_events', [
        { field: 'start_date', operator: '>=', value: `${selectedYear}-01-01` },
        { field: 'start_date', operator: '<=', value: `${selectedYear}-12-31` }
      ]);
      
      setClassEvents(events || []);
    } catch (error) {
      console.error('Error fetching class events:', error);
    }
  }, [selectedClass, selectedYear]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    fetchClassEvents();
  }, [fetchClassEvents]);

  useEffect(() => {
  }, [selectedClass]);

  const fetchStudentsAndAttendance = React.useCallback(async () => {
    if (!selectedClass) {
      setStudents([]);
      return;
    }
    
    setLoading(true);
    setReopenConfirm(false);
    try {
      const dbDate = parseDateToDB(selectedDate);
      const [studentsList, attendanceList, closureData] = await Promise.all([
        fetchQuery('students', [
          { field: 'class_id', operator: '==', value: selectedClass },
          { field: 'status', operator: '==', value: 'Ativo' }
        ]),
        (selectedSubject && selectedDate) ? fetchQuery('attendances', [
          { field: 'class_id', operator: '==', value: selectedClass },
          { field: 'subject_id', operator: '==', value: selectedSubject },
          { field: 'date', operator: '==', value: dbDate }
        ]) : Promise.resolve([]),
        (selectedClass && selectedSubject && selectedDate) ? fetchQuery('calendar_events', [
          { field: 'class_id', operator: '==', value: selectedClass },
          { field: 'subject_id', operator: '==', value: selectedSubject },
          { field: 'start_date', operator: '==', value: dbDate },
          { field: 'title', operator: '==', value: 'SISTEMA_FECHAMENTO_PRESENCA' }
        ]) : Promise.resolve([])
      ]);

      setStudents((studentsList || []).sort((a, b) => a.name.localeCompare(b.name)));
      setIsClosed(closureData && closureData.length > 0);

      if (attendanceList) {
        const attendanceMap: Record<string, AttendanceRecord> = {};
        attendanceList.forEach(data => {
          attendanceMap[data.student_id] = data as AttendanceRecord;
        });
        setAttendance(attendanceMap);
      } else {
        setAttendance({});
      }
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  }, [selectedClass, selectedSubject, selectedDate]);

  useEffect(() => {
    fetchStudentsAndAttendance();
    // Reset selected subject if it's not in the filtered list
    if (selectedClass && selectedSubject) {
      const cls = classes.find(c => c.id === selectedClass);
      if (cls && cls.subject_ids && !cls.subject_ids.includes(selectedSubject)) {
        setSelectedSubject('');
      }
    }
  }, [fetchStudentsAndAttendance]);

  const filteredSubjects = React.useMemo(() => {
    if (!selectedClass) return [];
    const cls = classes.find(c => c.id === selectedClass);
    if (!cls) return [];
    if (!cls.subject_ids || cls.subject_ids.length === 0) return subjects; // Fallback
    return subjects.filter(s => cls.subject_ids?.includes(s.id));
  }, [selectedClass, classes, subjects]);

  const fetchMonthlyData = React.useCallback(async () => {
    if (!selectedClass || activeTab !== 'monthly') return;
    setLoading(true);
    try {
      const monthStr = String(selectedMonth + 1).padStart(2, '0');
      const start = `${selectedYear}-${monthStr}-01`;
      const lastDay = new Date(selectedYear, selectedMonth + 1, 0).getDate();
      const end = `${selectedYear}-${monthStr}-${String(lastDay).padStart(2, '0')}`;

      const filters: any[] = [
        { field: 'class_id', operator: '==', value: selectedClass },
        { field: 'date', operator: '>=', value: start },
        { field: 'date', operator: '<=', value: end }
      ];

      if (selectedSubject) {
        filters.push({ field: 'subject_id', operator: '==', value: selectedSubject });
      }

      const allRecords = await fetchQuery('attendances', filters);

      const map: Record<string, Record<string, string>> = {};
      (allRecords || []).forEach(record => {
        if (!map[record.student_id]) map[record.student_id] = {};
        map[record.student_id][record.date] = record.status;
      });
      setInitialMonthlyAttendance(JSON.parse(JSON.stringify(map)));
      setMonthlyAttendance(map);
      setModifiedRecords({});
    } catch (error) {
      console.error('Error fetching monthly data:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedClass, selectedMonth, selectedYear, activeTab, selectedSubject]);

  useEffect(() => {
    fetchMonthlyData();
  }, [fetchMonthlyData]);

  const getCellStatus = React.useCallback((studentId: string, date: string) => {
    const modKey = `${studentId}_${date}`;
    if (modifiedRecords[modKey] !== undefined) {
      return modifiedRecords[modKey].status;
    }
    return monthlyAttendance[studentId]?.[date] || null;
  }, [monthlyAttendance, modifiedRecords]);

  const handleMonthlyCellClick = (studentId: string, date: string) => {
    if (!selectedSubject) {
      setNotification({ type: 'err', message: 'Selecione uma disciplina antes.' });
      setTimeout(() => setNotification(null), 3000);
      return;
    }
    
    const modKey = `${studentId}_${date}`;
    const initialStatus = initialMonthlyAttendance[studentId]?.[date] || null;
    const currentStatus = modifiedRecords[modKey] !== undefined ? modifiedRecords[modKey].status : initialStatus;
    
    let nextStatus: string | null = null;
    if (!currentStatus) {
      nextStatus = 'P';
    } else if (currentStatus === 'P') {
      nextStatus = 'F';
    } else if (currentStatus === 'F') {
      nextStatus = 'J';
    } else if (currentStatus === 'J') {
      nextStatus = null;
    }
    
    setModifiedRecords(prev => {
      const next = { ...prev };
      if (nextStatus === initialStatus) {
        delete next[modKey];
      } else {
        next[modKey] = { studentId, date, status: nextStatus };
      }
      return next;
    });
  };

  const saveMonthlyEdits = async () => {
    if (!userAuth || !selectedClass || !selectedSubject) return;

    setSavingMonthly(true);
    try {
      const payloads: any[] = [];
      const keysToDelete: string[] = [];

      Object.entries(modifiedRecords).forEach(([key, record]) => {
        const docId = `${selectedClass}_${selectedSubject}_${record.date}_${record.studentId}`;
        if (record.status) {
          payloads.push({
            id: docId,
            student_id: record.studentId,
            class_id: selectedClass,
            subject_id: selectedSubject,
            date: record.date,
            status: record.status,
            observations: ""
          });
        } else {
          keysToDelete.push(docId);
        }
      });

      if (payloads.length > 0) {
        await saveBatch('attendances', payloads);
      }

      if (keysToDelete.length > 0) {
        await Promise.all(keysToDelete.map(id => deleteData('attendances', id)));
      }

      setNotification({ type: 'success', message: 'Lançamentos mensais salvos com sucesso!' });
      setTimeout(() => setNotification(null), 3000);

      await fetchMonthlyData();
    } catch (error) {
      console.error("Error saving monthly edits:", error);
      setNotification({ type: 'err', message: 'Erro ao salvar lançamentos.' });
      setTimeout(() => setNotification(null), 3000);
    } finally {
      setSavingMonthly(false);
    }
  };

  const handleStatusChange = (studentId: string, status: 'P' | 'F' | 'J') => {
    if (!selectedSubject) {
      setNotification({ type: 'err', message: 'Selecione uma disciplina antes.' });
      setTimeout(() => setNotification(null), 3000);
      return;
    }
    setAttendance(prev => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        student_id: studentId,
        class_id: selectedClass,
        subject_id: selectedSubject,
        date: selectedDate,
        status
      }
    }));
  };

  const handleMarkAll = (status: 'P' | 'F') => {
    if (!selectedSubject) {
      setNotification({ type: 'err', message: 'Selecione uma disciplina antes.' });
      setTimeout(() => setNotification(null), 3000);
      return;
    }
    const newAttendance = { ...attendance };
    students.forEach(student => {
      newAttendance[student.id] = {
        ...(newAttendance[student.id] || {}),
        student_id: student.id,
        class_id: selectedClass,
        subject_id: selectedSubject,
        date: selectedDate,
        status
      };
    });
    setAttendance(newAttendance);
  };

  const selectedClassWeekdays = React.useMemo(() => {
    const classInfo = classes.find(c => c.id === selectedClass);
    if (!classInfo) return [];

    const dayMap: Record<string, number> = {
      'Domingo': 0, 'Segunda': 1, 'Terça': 2, 'Quarta': 3, 'Quinta': 4, 'Sexta': 5, 'Sábado': 6,
      'domingo': 0, 'segunda': 1, 'terça': 2, 'quarta': 3, 'quinta': 4, 'sexta': 5, 'sábado': 6,
      'Segunda-feira': 1, 'Terça-feira': 2, 'Quarta-feira': 3, 'Quinta-feira': 4, 'Sexta-feira': 5,
      'segunda-feira': 1, 'terça-feira': 2, 'quarta-feira': 3, 'quinta-feira': 4, 'sexta-feira': 5,
    };

    let targetDayIndices: number[] = [];

    // A. Use explicit days_of_week if available (handling string/JSON/array)
    let rawDays: any = classInfo.days_of_week;
    if (typeof rawDays === 'string') {
      try {
        rawDays = JSON.parse(rawDays);
      } catch (e) {
        rawDays = rawDays.split(',').map((s: string) => s.trim());
      }
    }

    if (Array.isArray(rawDays) && rawDays.length > 0) {
      targetDayIndices = rawDays
        .map(d => dayMap[d] !== undefined ? dayMap[d] : dayMap[d.charAt(0).toUpperCase() + d.slice(1).toLowerCase()])
        .filter(d => d !== undefined);
    }

    // B. Fallback: Parse class name for weekday keywords
    if (targetDayIndices.length === 0 && classInfo?.name) {
      const lowerName = classInfo.name.toLowerCase();
      const dayMatches = [
        { keywords: ['segunda', '2ª', '2a', 'seg-'], index: 1 },
        { keywords: ['terça', '3ª', '3a', 'ter-'], index: 2 },
        { keywords: ['quarta', '4ª', '4a', 'qua-'], index: 3 },
        { keywords: ['quinta', '5ª', '5a', 'qui-'], index: 4 },
        { keywords: ['sexta', '6ª', '6a', 'sex-'], index: 5 },
        { keywords: ['sábado', 'sab', 'sáb'], index: 6 },
        { keywords: ['domingo', 'dom'], index: 0 },
      ];
      dayMatches.forEach(match => {
        if (match.keywords.some(k => lowerName.includes(k))) {
          targetDayIndices.push(match.index);
        }
      });
    }

    // C. Fallback: Check significant days in class-specific events
    if (targetDayIndices.length === 0) {
      const classSpecific = classEvents.filter(e => String(e.class_id) === String(selectedClass));
      if (classSpecific.length > 0) {
        const dayCounts: Record<number, number> = {};
        classSpecific.forEach(e => {
          const d = new Date(e.start_date + 'T12:00:00').getDay();
          dayCounts[d] = (dayCounts[d] || 0) + 1;
        });
        
        const entries = Object.entries(dayCounts).sort((a: any, b: any) => b[1] - a[1]);
        if (entries.length > 0) {
          const maxCount = entries[0][1];
          // Include any day that has at least 25% of the frequency of the most frequent day
          targetDayIndices = entries
            .filter(e => e[1] >= maxCount * 0.25)
            .map(e => parseInt(e[0]));
        }
      }
    }

    return targetDayIndices;
  }, [classes, selectedClass, classEvents]);

  const isScheduledDay = React.useMemo(() => {
    if (!selectedClass || !selectedDate || classEvents.length === 0) return false;
    const dbDate = parseDateToDB(selectedDate);
    
    return classEvents.some(event => {
      const isCorrectDate = event.start_date === dbDate;
      const isForThisClass = String(event.class_id) === String(selectedClass);
      const isGlobal = !event.class_id;
      
      if (!isCorrectDate) return false;
      if (isForThisClass) return true;
      if (isGlobal) {
        // For global events, only count as scheduled if it matches the class weekdays
        if (selectedClassWeekdays.length > 0) {
          const dateObj = new Date(dbDate + 'T12:00:00');
          return selectedClassWeekdays.includes(dateObj.getDay());
        }
        return true;
      }
      return false;
    });
  }, [selectedDate, classEvents, selectedClass, selectedClassWeekdays]);

  const attendanceStats = React.useMemo(() => {
    let present = 0;
    let absent = 0;
    let justified = 0;
    let missing = 0;

    students.forEach(student => {
      const status = attendance[student.id]?.status;
      if (status === 'P') present++;
      else if (status === 'F') absent++;
      else if (status === 'J') justified++;
      else missing++;
    });

    return {
      present,
      absent,
      justified,
      missing,
      total: students.length
    };
  }, [students, attendance]);

  const monthlyClassDays = React.useMemo(() => {
    if (!selectedClass) return [];
    
    // 1. Get all academic events for this class in the current year
    const academicEvents = classEvents.filter(e => 
      e.start_date.startsWith(selectedYear.toString()) &&
      (
        String(e.class_id) === String(selectedClass) || 
        !e.class_id || 
        e.type === 'cancelled_class' || 
        e.type === 'excused_class' ||
        e.type?.includes('holiday')
      )
    );

    // 2. Identify holidays
    const holidayDates = new Set(
      academicEvents
        .filter(e => e.type?.includes('holiday'))
        .map(e => e.start_date)
    );

    // 3. Extract and sort ALL valid lesson events (those that contribute to counting)
    // We count: class_day, exam, excused_class (EXCEPT holidays and cancelled_class)
    const lessonMap = new Map();
    academicEvents
      .filter(e => 
        ['class_day', 'exam', 'excused_class'].includes(e.type) &&
        !holidayDates.has(e.start_date) &&
        !academicEvents.some(ce => ce.type === 'cancelled_class' && ce.start_date === e.start_date)
      )
      .forEach(e => {
        // STRICT FILTER: Only show days that match identified target weekdays
        if (selectedClassWeekdays.length > 0) {
          const dateObj = new Date(e.start_date + 'T12:00:00');
          if (!selectedClassWeekdays.includes(dateObj.getDay())) return;
        }

        const existing = lessonMap.get(e.start_date);
        if (!existing) {
          lessonMap.set(e.start_date, e);
        } else {
          const typePriority = { 'exam': 3, 'class_day': 2, 'excused_class': 1 };
          if ((typePriority[e.type as keyof typeof typePriority] || 0) > (typePriority[existing.type as keyof typeof typePriority] || 0)) {
            lessonMap.set(e.start_date, e);
          }
        }
      });

    const sortedLessons = Array.from(lessonMap.values())
      .sort((a, b) => a.start_date.localeCompare(b.start_date));

    // 4. Extract ALL events intended for display in the columns (Lessons + Cancelled)
    const displayMap = new Map();
    academicEvents
      .filter(e => 
        ['class_day', 'exam', 'excused_class', 'cancelled_class'].includes(e.type) &&
        !holidayDates.has(e.start_date)
      )
      .forEach(e => {
        // STRICT FILTER: Only show days that match identified target weekdays
        if (selectedClassWeekdays.length > 0) {
          const dateObj = new Date(e.start_date + 'T12:00:00');
          if (!selectedClassWeekdays.includes(dateObj.getDay())) return;
        }

        const existing = displayMap.get(e.start_date);
        if (!existing) {
          displayMap.set(e.start_date, e);
        } else {
          // Priority: cancelled_class > exam > class_day > excused_class
          const typePriority = { 'cancelled_class': 4, 'exam': 3, 'class_day': 2, 'excused_class': 1 };
          if ((typePriority[e.type as keyof typeof typePriority] || 0) > (typePriority[existing.type as keyof typeof typePriority] || 0)) {
            displayMap.set(e.start_date, e);
          }
        }
      });

    const monthStr = String(selectedMonth + 1).padStart(2, '0');
    const prefix = `${selectedYear}-${monthStr}-`;
    
    return Array.from(displayMap.values())
      .filter(e => e.start_date.startsWith(prefix))
      .map(e => {
        const date = new Date(e.start_date + 'T12:00:00');
        // Find index in the global lesson list (if it is a lesson)
        const lessonIndex = sortedLessons.findIndex(l => l.start_date === e.start_date);
        
        return {
          dbValue: e.start_date,
          dayNumber: date.getDate(),
          weekday: date.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '').toUpperCase(),
          lessonNumber: lessonIndex !== -1 ? lessonIndex + 1 : null,
          isExcused: e.type === 'excused_class',
          isCancelled: e.type === 'cancelled_class'
        };
      })
      .sort((a, b) => a.dbValue.localeCompare(b.dbValue));
  }, [selectedClass, selectedMonth, selectedYear, classEvents, selectedClassWeekdays]);

  const availableDates = React.useMemo(() => {
    // 3. Process events into display dates
    const uniqueMap = new Map();
    const sortedEvents = [...classEvents].sort((a, b) => {
      // Prioritize class-specific events if they exist for the same date
      if (a.class_id && !b.class_id) return -1;
      if (!a.class_id && b.class_id) return 1;
      return 0;
    });

    sortedEvents.forEach(event => {
      const dateKey = event.start_date;
      if (!uniqueMap.has(dateKey)) {
        // Filter which days to show in the dropdown:
        // Include events specific to this class OR global holidays/cancellations
        const isGlobal = !event.class_id;
        const isThisClass = String(event.class_id) === String(selectedClass);
        
        if (!isGlobal && !isThisClass) return;

        // Only include actual lesson days (class_day, exam, excused_class)
        if (!['class_day', 'exam', 'excused_class'].includes(event.type)) return;

        // STRICT FILTER: Only show if it matches identified target weekdays
        if (selectedClassWeekdays.length > 0) {
          const dateObj = new Date(dateKey + 'T12:00:00');
          if (!selectedClassWeekdays.includes(dateObj.getDay())) return;
        }

        // Filter by subject if specified on the event
        if (selectedSubject && event.subject_id && String(event.subject_id) !== String(selectedSubject)) return;

        // Skip cancelled classes or holidays for markings
        if (event.type === 'cancelled_class' || event.type?.includes('holiday')) return;

        uniqueMap.set(dateKey, event);
      }
    });

    return Array.from(uniqueMap.values())
      .sort((a: any, b: any) => a.start_date.localeCompare(b.start_date)) // Sort ascending for auto-select logic
      .map((event: any) => {
        const date = new Date(event.start_date + 'T12:00:00');
        const weekdayName = date.toLocaleDateString('pt-BR', { weekday: 'long' });
        return {
          dbValue: event.start_date,
          displayValue: formatDateForDisplay(event.start_date),
          label: `${event.start_date.split('-').reverse().join('/')} (${weekdayName.split('-')[0]})`
        };
      });
  }, [classEvents, selectedClass, selectedSubject, selectedClassWeekdays]);

  // Auto-select logic: Choose next class, today's class, or the most recent one
  useEffect(() => {
    if (availableDates.length > 0 && selectedClass) {
      const today = new Date().toISOString().split('T')[0];
      const nextDates = availableDates.filter(d => d.dbValue >= today);
      const bestDate = nextDates.length > 0 ? nextDates[0] : availableDates[availableDates.length - 1];
      
      if (bestDate && bestDate.displayValue !== selectedDate) {
        setSelectedDate(bestDate.displayValue);
      }
    }
  }, [availableDates, selectedClass]);

  const saveAttendance = async () => {
    if (!userAuth || !selectedSubject) return;
    
    if (!isScheduledDay) {
      setNotification({
        type: 'err',
        message: 'Data de aula não agendada no calendário acadêmico para esta turma.'
      });
      return;
    }

    setSaving(true);
    try {
      const dbDate = parseDateToDB(selectedDate);
      const payloads: any[] = [];
      const keysToDelete: string[] = [];

      students.forEach(student => {
        const docId = `${selectedClass}_${selectedSubject}_${dbDate}_${student.id}`;
        const record = attendance[student.id];

        if (record && record.status) {
          payloads.push({
            id: docId,
            student_id: student.id,
            class_id: selectedClass,
            subject_id: selectedSubject,
            date: dbDate,
            status: record.status,
            observations: record.observations || ""
          });
        } else {
          // Se o status da marcação foi limpo por duplo clique, remove do banco de dados
          keysToDelete.push(docId);
        }
      });
      
      if (payloads.length > 0) {
        await saveBatch('attendances', payloads);
      }

      if (keysToDelete.length > 0) {
        await Promise.all(keysToDelete.map(id => deleteData('attendances', id)));
      }

      await fetchStudentsAndAttendance();
      setNotification({ type: 'success', message: 'Presença salva com sucesso!' });
      setTimeout(() => setNotification(null), 3000);
    } catch (error) {
      console.error("Error saving attendance:", error);
      setNotification({ type: 'err', message: 'Erro ao salvar presença.' });
    } finally {
      setSaving(false);
    }
  };

  const closeAttendance = async () => {
    if (!userAuth || !selectedSubject || !selectedClass || !selectedDate) return;
    
    // Check if everything is marked
    const markedCount = students.filter(s => attendance[s.id]?.status).length;
    if (markedCount < students.length) {
      setNotification({ 
        type: 'err', 
        message: 'Complete a chamada de todos os alunos antes de fechar a data.' 
      });
      setTimeout(() => setNotification(null), 3000);
      return;
    }

    setClosing(true);
    try {
      const dbDate = parseDateToDB(selectedDate);
      const closureId = `CLOSURE_${selectedClass}_${selectedSubject}_${dbDate}`;
      
      const closureRecord = {
        id: closureId,
        title: 'SISTEMA_FECHAMENTO_PRESENCA',
        description: `FECHAMENTO DE CHAMADA: ${JSON.stringify({ 
          closed_by: userAuth.uid, 
          closed_at: new Date().toISOString(), 
          student_count: students.length 
        })}`,
        class_id: selectedClass,
        subject_id: selectedSubject,
        start_date: dbDate,
        end_date: dbDate,
        type: 'event',
        user_id: userAuth.uid,
        created_at: new Date().toISOString()
      };
      
      await saveData('calendar_events', closureId, closureRecord);
      
      // Also save attendance one last time to be sure
      await saveAttendance();
      
      setIsClosed(true);
      setNotification({ type: 'success', message: 'Lançamentos finalizados com sucesso! A data está fechada para edições.' });
      setTimeout(() => setNotification(null), 4000);
    } catch (error) {
      console.error("Error closing attendance:", error);
      setNotification({ type: 'err', message: 'Erro ao finalizar lançamentos.' });
    } finally {
      setClosing(false);
    }
  };

  const reopenAttendance = async () => {
    if (!userAuth || !selectedSubject || !selectedClass || !selectedDate) return;

    setClosing(true);
    try {
      const dbDate = parseDateToDB(selectedDate);
      const closureId = `CLOSURE_${selectedClass}_${selectedSubject}_${dbDate}`;
      
      await deleteData('calendar_events', closureId);
      
      setIsClosed(false);
      setReopenConfirm(false);
      
      setNotification({ type: 'success', message: 'Chamada reaberta com sucesso! Agora você pode editar os lançamentos.' });
      setTimeout(() => setNotification(null), 4000);
    } catch (error) {
      console.error("Error reopening attendance:", error);
      setNotification({ type: 'err', message: 'Erro ao reabrir a chamada.' });
      setTimeout(() => setNotification(null), 4000);
    } finally {
      setClosing(false);
    }
  };

  const [isPrinting, setIsPrinting] = useState(false);

  const processPrint = async (targetType: 'marking' | 'report') => {
    setIsPrinting(true);
    try {
      const blobUrl = await generateAttendancePDF(targetType);
      if (blobUrl) {
        // Fallback function to download the generated PDF directly
        const triggerDownload = () => {
          try {
            const link = document.createElement('a');
            link.href = blobUrl;
            link.download = `frequencia_${targetType === 'marking' ? 'manual' : 'consolidada'}_${new Date().getFullYear()}.pdf`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            setNotification({
              type: 'success',
              message: 'Inserção direta de impressão bloqueada pelo navegador no ambiente simulado. O PDF foi gerado e baixado automaticamente.'
            });
            setTimeout(() => setNotification(null), 6000);
          } catch (downloadErr) {
            console.warn('Erro silencioso ao baixar PDF:', downloadErr);
          }
        };

        const iframe = document.createElement('iframe');
        iframe.style.position = 'fixed';
        iframe.style.right = '0';
        iframe.style.bottom = '0';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = 'none';
        iframe.src = blobUrl;
        document.body.appendChild(iframe);
        iframe.onload = () => {
          setTimeout(() => {
            try {
              if (!iframe.contentWindow) {
                throw new Error("Acesso ao Iframe bloqueado");
              }
              iframe.contentWindow.focus();
              iframe.contentWindow.print();
            } catch (e) {
              console.warn('Impressão direta bloqueada por segurança do frameset. Baixando PDF diretamente...', e);
              triggerDownload();
            }
            setTimeout(() => {
              if (iframe.parentNode) {
                document.body.removeChild(iframe);
              }
            }, 15000);
          }, 150);
        };
      }
    } catch (err) {
      console.warn('Processo de geração/impressão de frequência falhou:', err);
    } finally {
      setIsPrinting(false);
    }
  };

  const generateAttendancePDF = async (overridePrintType?: 'marking' | 'report') => {
    const activePrintType = overridePrintType || 'report';
    try {
      const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4'
      });

      const pageWidth = doc.internal.pageSize.width; // 297mm
      const pageHeight = doc.internal.pageSize.height; // 210mm
      const margin = 8;
      const contentWidth = pageWidth - (margin * 2);

      // Standard pagination filled to capacity up to 20 items per page
      const itemsPerPage = activePrintType === 'report' ? 18 : 20;
      const totalPages = Math.ceil(students.length / itemsPerPage) || 1;

      const currentClassObj = classes.find(c => c.id === selectedClass);
      const currentSubjectObj = subjects.find(s => s.id === selectedSubject);

      // Pre-load logo if available
      let logoData: string | null = null;
      if (institution?.logo || institution?.logo_url) {
        try {
          const logoUrl = institution.logo || institution.logo_url;
          logoData = await new Promise<string>((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'Anonymous';
            img.onload = () => {
              const canvas = document.createElement('canvas');
              canvas.width = img.width;
              canvas.height = img.height;
              const ctx = canvas.getContext('2d');
              if (ctx) {
                ctx.drawImage(img, 0, 0);
                resolve(canvas.toDataURL('image/png'));
              } else {
                reject(new Error('Canvas context error'));
              }
            };
            img.onerror = () => reject(new Error('Image load error'));
            img.src = logoUrl;
          });
        } catch (e) {
          console.error("Error loading logo for PDF:", e);
        }
      }

      for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
        if (pageIdx > 0) doc.addPage();

        // Header - Modern Design
        if (logoData) {
          doc.addImage(logoData, 'PNG', margin, margin, 15, 15);
        }

        doc.setFontSize(8);
        doc.setTextColor(100);
        doc.setFont('helvetica', 'bold');
        doc.text('DIOCESE DE GUARULHOS', margin + 20, margin + 4);
        
        doc.setFontSize(16);
        doc.setTextColor(0);
        doc.setFont('helvetica', 'bold');
        doc.text(institution?.name || 'ESCOLA DIOCESANA DE MINISTÉRIOS', margin + 20, margin + 10);
        
        doc.setFontSize(10);
        doc.setTextColor(80);
        doc.setFont('helvetica', 'bold');
        doc.text(institution?.subtitle || 'PE. JOSÉ FERNANDO DE BRITO', margin + 20, margin + 15);

        // Page info (Top Right)
        doc.setFontSize(7);
        doc.setTextColor(150);
        doc.text('PÁGINA', pageWidth - margin - 20, margin + 5, { align: 'right' });
        doc.setFontSize(14);
        doc.setTextColor(0);
        doc.text(`${pageIdx + 1} / ${totalPages}`, pageWidth - margin - 5, margin + 12, { align: 'right' });

        // Underline
        doc.setDrawColor(0);
        doc.setLineWidth(0.5);
        doc.line(margin, margin + 17, pageWidth - margin, margin + 17);

        // Info Section matching the model layout precisely (No gray background card, clean lines and labels)
        const formatYear = (yrVal?: string | number) => {
          if (!yrVal) return '';
          const clean = String(yrVal).trim();
          if (/^\d+$/.test(clean)) {
            return `${clean}º Ano`;
          }
          return clean;
        };

        const formatSemester = (semVal?: string | number) => {
          if (!semVal) return '';
          const clean = String(semVal).trim();
          if (/^\d+$/.test(clean)) {
            return `${clean}º Sem.`;
          }
          return clean;
        };

        const yearStr = currentSubjectObj?.year ? formatYear(currentSubjectObj.year) : '';
        const semesterStr = currentSubjectObj?.semester ? formatSemester(currentSubjectObj.semester) : '';

        // Header Title (centered)
        const mainTitle = (activePrintType === 'marking' ? 'LISTA DE CHAMADA' : 'LISTA DE PRESENÇA MENSAL').toUpperCase();
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10.5);
        doc.setTextColor(0);
        doc.text(mainTitle, pageWidth / 2, margin + 22.2, { align: 'center' });

        const teacherObj = teachers.find(t => 
          t.id === currentSubjectObj?.teacher_id || 
          (Array.isArray(t.subject_ids) && t.subject_ids.includes(selectedSubject))
        );
        const teacherName = (teacherObj?.name || 'NÃO DEFINIDO').toUpperCase();
        
        const monthName = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'][selectedMonth];
        const monthString = `${monthName} / ${selectedYear}`.toUpperCase();

        const rawTurmaVal = `${currentClassObj?.code || '---'}   ${currentClassObj?.name || 'N/A'}`.toUpperCase();

        const subCode = currentSubjectObj?.code || '---';
        const subName = currentSubjectObj?.name || 'Todas as Categorias';
        const metaParts = [yearStr, semesterStr].filter(Boolean);
        const metaStr = metaParts.length > 0 ? `   (${metaParts.join('  •  ')})` : '';
        const rawDiscVal = `${subCode}   ${subName}${metaStr}`.toUpperCase();

        const rawSalaVal = (currentClassObj?.room || '---').toUpperCase();

        const row1Y = margin + 27;

        // Row 1 - Left: Professor
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(100);
        doc.text('Professor', margin, row1Y);
        const profLabelWidth = doc.getTextWidth('Professor   ');

        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0);
        const limitProfWidth = pageWidth - margin - 60 - (margin + profLabelWidth);
        let truncatedProf = teacherName;
        if (doc.getTextWidth(truncatedProf) > limitProfWidth) {
          while (doc.getTextWidth(truncatedProf + '...') > limitProfWidth && truncatedProf.length > 5) {
            truncatedProf = truncatedProf.slice(0, -1);
          }
          truncatedProf += '...';
        }
        doc.text(truncatedProf, margin + profLabelWidth, row1Y);

        // Row 1 - Right: Month/Year Referencia (e.g. MAIO / 2026)
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(0);
        doc.text(monthString, pageWidth - margin, row1Y, { align: 'right' });

        const row2Y = margin + 32;

        // Row 2 - Col 1: Turma
        const col1X = margin;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(100);
        doc.text('Turma', col1X, row2Y);
        const turmaLabelWidth = doc.getTextWidth('Turma   ');

        const col2X = margin + 80;
        const maxTurmaWidth = col2X - col1X - turmaLabelWidth - 4;
        let truncatedTurma = rawTurmaVal;
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0);
        if (doc.getTextWidth(truncatedTurma) > maxTurmaWidth) {
          while (doc.getTextWidth(truncatedTurma + '...') > maxTurmaWidth && truncatedTurma.length > 5) {
            truncatedTurma = truncatedTurma.slice(0, -1);
          }
          truncatedTurma += '...';
        }
        doc.text(truncatedTurma, col1X + turmaLabelWidth, row2Y);

        // Row 2 - Col 2: Disciplina (including Semester & Year metadata)
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100);
        doc.text('Disciplina', col2X, row2Y);
        const discLabelWidth = doc.getTextWidth('Disciplina   ');

        // Row 2 - Col 3: Sala (Right-aligned to match the right edge of the table and the month reference)
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(100);
        
        const salaLabel = 'Sala  ';
        const salaLabelWidth = doc.getTextWidth(salaLabel);
        const salaValWidth = doc.getTextWidth(rawSalaVal);
        const salaTotalWidth = salaLabelWidth + salaValWidth;
        const salaStartX = pageWidth - margin - salaTotalWidth;

        // Draw "Sala" label
        doc.text('Sala', salaStartX, row2Y);

        // Draw Room value in bold at the correct offset to end at margin
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0);
        doc.text(rawSalaVal, salaStartX + salaLabelWidth, row2Y);

        // Limit the width of the discipline to not overlap with the Sala on the right
        const maxDiscColWidth = salaStartX - col2X - discLabelWidth - 4;
        let truncatedDisc = rawDiscVal;
        if (doc.getTextWidth(truncatedDisc) > maxDiscColWidth) {
          while (doc.getTextWidth(truncatedDisc + '...') > maxDiscColWidth && truncatedDisc.length > 5) {
            truncatedDisc = truncatedDisc.slice(0, -1);
          }
          truncatedDisc += '...';
        }
        doc.text(truncatedDisc, col2X + discLabelWidth, row2Y);

        // Decorative horizontal separator line under row 2 before the table
        doc.setDrawColor(200);
        doc.setLineWidth(0.3);
        doc.line(margin, margin + 35, pageWidth - margin, margin + 35);

        // Table Head
        const head: any[] = [
          [
            { content: 'Nº', styles: { halign: 'center', valign: 'middle' } },
            { content: 'MATRÍCULA', styles: { valign: 'middle' } },
            { content: 'NOME COMPLETO DO ALUNO', styles: { valign: 'middle' } },
            ...monthlyClassDays.map(day => {
              return { content: '', styles: { halign: 'center' } };
            })
          ]
        ];

        // Table Body
        const chunk = students.slice(pageIdx * itemsPerPage, (pageIdx + 1) * itemsPerPage);
        const body: any[] = chunk.map((student, idx) => {
          const overallIndex = pageIdx * itemsPerPage + idx;
          return [
            { content: String(overallIndex + 1), styles: { halign: 'center' } },
            { content: student.registration_number, styles: { font: 'courier' } },
            student.name.toUpperCase(),
            ...monthlyClassDays.map(day => {
              if (day?.isCancelled) return { content: '---', styles: { halign: 'center', textColor: [200, 200, 200] } };
              if (activePrintType === 'marking') return '';
              const status = day ? (activeTab === 'monthly' ? getCellStatus(student.id, day.dbValue) : (day.dbValue === parseDateToDB(selectedDate) ? attendance[student.id]?.status : null)) : null;
              return { 
                content: status === 'P' ? 'PRESENTE' : status === 'F' ? 'FALTOU' : status === 'J' ? 'ABONADA' : '',
                styles: { halign: 'center', fontStyle: status === 'P' ? 'bold' : 'normal', fontSize: 5.5 }
              };
            })
          ];
        });

        const colStyles: any = {
          0: { cellWidth: 8 },
          1: { cellWidth: 28 },
          2: { cellWidth: 80 }
        };
        const extraColCount = monthlyClassDays.length;
        if (extraColCount > 0) {
          const extraColWidth = (contentWidth - 8 - 28 - 80) / extraColCount;
          for (let i = 0; i < extraColCount; i++) {
            colStyles[3 + i] = { cellWidth: extraColWidth };
          }
        }

        autoTable(doc, {
          startY: margin + 38,
          head: head,
          body: body,
          theme: 'grid',
          margin: { left: margin, right: margin, bottom: 10 },
          headStyles: { 
            fillColor: [240, 240, 240],
            textColor: [0, 0, 0],
            fontSize: 7.5,
            lineWidth: 0.1,
            lineColor: [100, 100, 100],
            fontStyle: 'bold',
            minCellHeight: 11
          },
          styles: { 
            fontSize: 8.0,
            cellPadding: 1.2,
            lineWidth: 0.1,
            lineColor: [180, 180, 180],
            minCellHeight: 6.5,
            valign: 'middle'
          },
          columnStyles: colStyles,
          didDrawCell: (data) => {
            if (data.row.section === 'head' && data.column.index >= 3) {
              const cell = data.cell;
              const dayIndex = data.column.index - 3;
              const day = monthlyClassDays[dayIndex];
              if (day) {
                const dateStr = `${day.dayNumber.toString().padStart(2, '0')}/${new Date(day.dbValue + 'T12:00:00').toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '').toUpperCase()}`;
                const typeStr = day?.isCancelled ? 'CANC' : day?.isExcused ? 'ABON' : `AULA ${day?.lessonNumber || ''}`;
                
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(7.5);
                doc.setTextColor(0, 0, 0);
                doc.text(dateStr, cell.x + cell.width / 2, cell.y + 4.2, { align: 'center' });
                
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(5.5);
                doc.setTextColor(110, 110, 110);
                doc.text(typeStr, cell.x + cell.width / 2, cell.y + 8.2, { align: 'center' });
              }
            }
          },
          didDrawPage: (data) => {
            // Footer
            doc.setFontSize(7);
            doc.setTextColor(150);
            const footerY = pageHeight - 6;
            doc.text(institution?.address || 'AV. VENUS, 195 - GUARULHOS', margin, footerY);
            
            // Fixed overlap in footer
            const emissionDate = `EMISSÃO: ${new Date().toLocaleDateString('pt-BR')}`;
            const pageText = `PÁGINA ${pageIdx + 1}/${totalPages}`;
            
            doc.text(emissionDate, pageWidth - margin - 35, footerY, { align: 'right' });
            doc.text(pageText, pageWidth - margin, footerY, { align: 'right' });
          }
        });

        if (activePrintType === 'report' && pageIdx === totalPages - 1) {
          const cardsY = 182; // Height 10mm. Stretches to 192mm.
          const cardWidth = 42;
          const cardHeight = 10;
          const gap = 4;
          let startX = margin;

          // CARD 1: Matriculados
          // Left box (Colored block)
          doc.setFillColor(30, 41, 59); // slate-800
          doc.rect(startX, cardsY, 10, cardHeight, 'F');
          
          // Number inside block
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(10);
          doc.setTextColor(255, 255, 255);
          doc.text(String(attendanceStats.total), startX + 5, cardsY + 7, { align: 'center' });
          
          // Right box (white with border)
          doc.setDrawColor(226, 232, 240); // border-slate-200
          doc.setFillColor(255, 255, 255);
          doc.rect(startX + 10, cardsY, cardWidth - 10, cardHeight, 'FD');
          
          // Labels inside right box
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(6);
          doc.setTextColor(30, 41, 59); // text-slate-800
          doc.text('MATRICULADOS', startX + 13, cardsY + 4);
          
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(5);
          doc.setTextColor(148, 163, 184); // text-slate-400
          doc.text('TOTAL', startX + 13, cardsY + 7.8);

          startX += cardWidth + gap;

          // CARD 2: Presentes
          // Left box
          doc.setFillColor(71, 85, 105); // slate-600
          doc.rect(startX, cardsY, 10, cardHeight, 'F');
          
          // Number
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(10);
          doc.setTextColor(255, 255, 255);
          doc.text(String(attendanceStats.present), startX + 5, cardsY + 7, { align: 'center' });
          
          // Right box
          doc.setDrawColor(226, 232, 240); // border-slate-200
          doc.setFillColor(255, 255, 255);
          doc.rect(startX + 10, cardsY, cardWidth - 10, cardHeight, 'FD');
          
          // Labels
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(6);
          doc.setTextColor(51, 65, 85); // text-slate-700
          doc.text('PRESENTES', startX + 13, cardsY + 4);
          
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(5);
          doc.setTextColor(148, 163, 184); // text-slate-400
          doc.text('LANÇADOS P', startX + 13, cardsY + 7.8);

          startX += cardWidth + gap;

          // CARD 3: Faltantes
          // Left box
          doc.setFillColor(190, 18, 60); // rose-700
          doc.rect(startX, cardsY, 10, cardHeight, 'F');
          
          // Number
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(10);
          doc.setTextColor(255, 255, 255);
          doc.text(String(attendanceStats.absent), startX + 5, cardsY + 7, { align: 'center' });
          
          // Right box
          doc.setDrawColor(254, 205, 211); // border-rose-200
          doc.setFillColor(255, 255, 255);
          doc.rect(startX + 10, cardsY, cardWidth - 10, cardHeight, 'FD');
          
          // Labels
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(6);
          doc.setTextColor(159, 18, 57); // text-rose-800
          doc.text('FALTANTES', startX + 13, cardsY + 4);
          
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(5);
          doc.setTextColor(244, 63, 94); // text-rose-500
          doc.text('LANÇADOS F', startX + 13, cardsY + 7.8);

          startX += cardWidth + gap;

          // CARD 4: Abonados
          // Left box
          doc.setFillColor(217, 119, 6); // amber-600
          doc.rect(startX, cardsY, 10, cardHeight, 'F');
          
          // Number
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(10);
          doc.setTextColor(255, 255, 255);
          doc.text(String(attendanceStats.justified), startX + 5, cardsY + 7, { align: 'center' });
          
          // Right box
          doc.setDrawColor(253, 230, 138); // border-amber-200
          doc.setFillColor(255, 255, 255);
          doc.rect(startX + 10, cardsY, cardWidth - 10, cardHeight, 'FD');
          
          // Labels
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(6);
          doc.setTextColor(146, 64, 14); // text-amber-800
          doc.text('ABONADOS', startX + 13, cardsY + 4);
          
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(5);
          doc.setTextColor(217, 119, 6); // text-amber-600
          doc.text('LANÇADOS J', startX + 13, cardsY + 7.8);
        }
      }

      return doc.output('bloburl') as any;
    } catch (err) {
      console.error('Error generating PDF:', err);
      return null;
    }
  };

  const currentClass = classes.find(c => c.id === selectedClass);
  const currentSubject = subjects.find(s => s.id === selectedSubject);

  return (
    <>
      <style>{`
        @media print {
          @page { 
            size: A4 landscape; 
            margin: 0; 
          }
          
          /* Nuclear Print Reset */
          html, body, #root, .no-print, [role="dialog"], .fixed {
            display: none !important;
            visibility: hidden !important;
            height: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
          }

          body {
            display: block !important;
            visibility: visible !important;
            background: white !important;
          }

          .print-modal-container,
          .print-modal-container *,
          .print-modal-content,
          .print-modal-content *,
          .print-preview-scroll-area,
          .print-preview-scroll-area *,
          #attendance-print-area,
          #attendance-print-area * {
            display: block !important;
            visibility: visible !important;
            height: auto !important;
          }

          .print-modal-container {
            position: static !important;
            width: 100% !important;
            padding: 0 !important;
            margin: 0 !important;
            background: white !important;
          }

          .print-modal-content {
            max-width: none !important;
            width: 100% !important;
            height: auto !important;
            box-shadow: none !important;
            border: none !important;
            border-radius: 0 !important;
          }

          .print-preview-scroll-area {
            padding: 0 !important;
            background: white !important;
            overflow: visible !important;
          }

          #attendance-print-area {
            transform: none !important;
            width: 100% !important;
            max-width: none !important;
            margin: 0 !important;
            padding: 0 !important;
          }

          .print-page {
            width: 297mm !important;
            height: 209.8mm !important; 
            margin: 0 !important;
            padding: 10mm !important;
            page-break-after: always !important;
            break-after: page !important;
            display: flex !important;
            flex-direction: column !important;
            box-sizing: border-box !important;
            background: white !important;
            position: relative !important;
            overflow: hidden !important;
          }

          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          .print-page .mt-auto {
            margin-top: auto !important;
          }
        }
      `}</style>

      <div className="max-w-[1600px] mx-auto p-4 md:p-6 lg:p-6 space-y-6 no-print">
      {/* Page Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 p-2 bg-white rounded-none border border-slate-200 no-print flex items-center justify-center group overflow-hidden relative">
            {institution?.logo ? (
              <img src={institution.logo} alt="Logo" className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-500 relative z-10" />
            ) : (
              <School size={20} className="text-slate-605 relative z-10" />
            )}
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight uppercase">
              {activeTab === 'marking' ? 'Chamada Diária' : 'Frequência Mensal'}
            </h2>
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 mt-1">
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-slate-400" />
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">{institution?.name || 'CENTRO DE ENSINO'}</p>
              </div>
              <div className="hidden sm:block w-1 h-1 bg-slate-300" />
              <p className="text-[10px] font-semibold text-slate-600 uppercase tracking-widest bg-slate-100/60 px-3 py-1 rounded-none border border-slate-200/50">Diário Digital de Classe</p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          {selectedClass && (
            <div className="flex flex-wrap items-center gap-3">
              {activeTab === 'monthly' && (
                <div className="px-4 py-2 bg-slate-50 border border-slate-200 text-slate-700 rounded-none text-[10px] font-semibold uppercase tracking-[0.12em] flex items-center gap-2.5 transition-all shadow-sm">
                   <span className="relative flex h-1.5 w-1.5">
                     <span className="relative inline-flex bg-slate-400 h-1.5 w-1.5"></span>
                   </span>
                   <span>{monthlyClassDays.filter(d => !d.isCancelled).length} Aulas Agendadas</span>
                </div>
              )}
              <div className="px-4 py-2 bg-slate-50 border border-slate-200 text-slate-700 rounded-none text-[10px] font-semibold uppercase tracking-[0.12em] flex items-center gap-2.5 transition-all shadow-sm">
                 <span className="relative flex h-1.5 w-1.5">
                   <span className="relative inline-flex bg-slate-400 h-1.5 w-1.5"></span>
                 </span>
                 <span>{students.length} Alunos Inscritos</span>
              </div>
            </div>
          )}

          {!initialMode && (
            <div className="flex bg-slate-150 p-1 rounded-none border border-slate-200/60 shadow-inner">
              {[
                { id: 'marking', label: 'Chamada' },
                { id: 'monthly', label: 'Mensal' }
              ].map((tab) => (
                <button 
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={cn(
                    "px-5 py-2 rounded-none text-[10px] font-bold uppercase tracking-[0.1em] transition-all duration-300",
                    activeTab === tab.id 
                      ? "bg-slate-800 text-white shadow border border-slate-700" 
                      : "text-slate-500 hover:text-slate-700 hover:bg-slate-100/50"
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center gap-3">

            {activeTab === 'marking' && students.length > 0 && (
              <div className="flex items-center gap-3">
                {!isClosed ? (
                  <>
                    <button 
                      disabled={saving || closing || !selectedSubject}
                      onClick={saveAttendance}
                      className="group relative flex items-center gap-2 h-10 px-4 bg-slate-100 text-slate-700 border border-slate-350 rounded-none text-[10px] font-bold uppercase tracking-widest hover:bg-white transition-all active:scale-95 disabled:opacity-50"
                    >
                      {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                      <span>Salvar Rascunho</span>
                    </button>
                    <button 
                      disabled={saving || closing || !selectedSubject}
                      onClick={closeAttendance}
                      className="group relative flex items-center gap-2 h-10 px-5 bg-slate-800 text-white rounded-none text-[10px] font-bold uppercase tracking-widest hover:bg-slate-900 border border-slate-800 transition-all active:scale-95 disabled:opacity-50"
                    >
                      {closing ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                      <span>Fechar Lançamentos</span>
                    </button>
                  </>
                ) : (
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 h-10 px-5 bg-slate-100 text-slate-600 rounded-none text-[10px] font-bold uppercase tracking-widest border border-slate-200 select-none">
                      <Check size={14} className="text-emerald-600" />
                      <span>Lançamentos Finalizados</span>
                    </div>

                    {!reopenConfirm ? (
                      <button
                        type="button"
                        disabled={closing}
                        onClick={() => setReopenConfirm(true)}
                        className="group flex items-center gap-1.5 h-10 px-4 bg-rose-50 text-rose-700 hover:bg-rose-100/80 border border-rose-200 rounded-none text-[10px] font-bold uppercase tracking-widest transition-all duration-200 hover:shadow-sm"
                        title="Reabrir chamada finalizada para novas edições"
                      >
                        <Unlock size={13} className="transition-transform group-hover:rotate-12" />
                        <span>Reabrir Chamada</span>
                      </button>
                    ) : (
                      <div className="flex items-center gap-1.5 bg-rose-50 border border-rose-200 p-1">
                        <span className="text-[9px] font-bold text-rose-700 uppercase tracking-widest px-2 font-sans">
                          Confirmar?
                        </span>
                        <button
                          type="button"
                          disabled={closing}
                          onClick={reopenAttendance}
                          className="h-8 px-3 bg-rose-700 hover:bg-rose-800 text-white rounded-none text-[9px] font-bold uppercase tracking-widest transition-all"
                        >
                          {closing ? <Loader2 size={10} className="animate-spin" /> : "Reabrir"}
                        </button>
                        <button
                          type="button"
                          disabled={closing}
                          onClick={() => setReopenConfirm(false)}
                          className="h-8 px-2.5 bg-white hover:bg-slate-100 text-slate-600 rounded-none text-[9px] font-bold uppercase tracking-widest border border-slate-200 transition-all"
                        >
                          Cancelar
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="bg-white rounded-none border border-slate-200 shadow-sm text-slate-900">
        {/* Filter Bar */}
        <div className="p-4 md:p-5 border-b border-slate-200 bg-slate-50 sticky top-0 z-20 shadow-md">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest ml-1">Turma</label>
              <div className="relative group">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 w-8 h-8 bg-white rounded-none flex items-center justify-center text-slate-400 border border-slate-205">
                  <School size={16} />
                </div>
                <select
                  value={selectedClass}
                  onChange={e => {
                    setSelectedClass(e.target.value);
                    setSelectedSubject('');
                  }}
                  className="w-full pl-13 pr-8 py-3 bg-white border border-slate-200 rounded-none text-[12px] font-semibold text-slate-800 appearance-none transition-all outline-none"
                >
                  <option value="">SELECIONAR TURMA...</option>
                  {classes.map(c => <option key={c.id} value={c.id}>{c.name} ({c.code})</option>)}
                </select>
                <ChevronDown className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-400 transition-colors pointer-events-none" size={16} />
              </div>
            </div>

            {(activeTab === 'marking' || activeTab === 'monthly') && (
              <div className="space-y-2">
                <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest ml-1">Disciplina</label>
                <div className="relative group">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 w-8 h-8 bg-white rounded-none flex items-center justify-center text-slate-400 border border-slate-205">
                    <BookOpen size={16} />
                   </div>
                  <select
                    value={selectedSubject}
                    onChange={e => setSelectedSubject(e.target.value)}
                    disabled={!selectedClass}
                    className="w-full pl-13 pr-8 py-3 bg-white border border-slate-200 rounded-none text-[12px] font-semibold text-slate-800 appearance-none transition-all disabled:bg-slate-100/50 disabled:opacity-60 outline-none"
                  >
                    <option value="">SELECIONAR DISCIPLINA...</option>
                    {filteredSubjects.map(s => <option key={s.id} value={s.id}>{s.name.toUpperCase()}</option>)}
                  </select>
                  <ChevronDown className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-400 transition-colors pointer-events-none" size={16} />
                </div>
              </div>
            )}

            {activeTab === 'monthly' && (
              <div className="space-y-2">
                <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest ml-1">Período</label>
                <div className="grid grid-cols-5 gap-3">
                  <div className="col-span-3 relative group">
                    <select
                      value={selectedMonth}
                      onChange={e => setSelectedMonth(parseInt(e.target.value))}
                      className="w-full px-4 py-3 bg-white border border-slate-200 rounded-none text-[12px] font-semibold text-slate-805 appearance-none outline-none"
                    >
                      {['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'].map((m, i) => (
                        <option key={i} value={i}>{m.toUpperCase()}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
                  </div>
                  <div className="col-span-2 relative group">
                    <select
                      value={selectedYear}
                      onChange={e => setSelectedYear(parseInt(e.target.value))}
                      className="w-full px-4 py-3 bg-white border border-slate-200 rounded-none text-[12px] font-semibold text-slate-805 appearance-none outline-none text-center"
                    >
                      {[2024, 2025, 2026, 2027, 2028].map(y => (
                        <option key={y} value={y}>{y}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'marking' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between ml-1">
                  <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">Data</label>
                </div>
                <div className="grid grid-cols-4 gap-3">
                  <div className="col-span-3 relative group">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 w-8 h-8 bg-white rounded-none flex items-center justify-center text-slate-400 border border-slate-205">
                      <CalendarIcon size={16} />
                    </div>
                    <select
                      disabled={!selectedClass || availableDates.length === 0}
                      value={parseDateToDB(selectedDate)}
                      onChange={e => setSelectedDate(formatDateForDisplay(e.target.value))}
                      className="w-full pl-13 pr-8 py-3 bg-white border border-slate-200 rounded-none text-[12px] font-semibold text-slate-800 appearance-none outline-none"
                    >
                      <option value="">DATA...</option>
                      {[...availableDates].reverse().map(date => (
                        <option key={date.dbValue} value={date.dbValue}>
                          {date.label.toUpperCase()}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
                  </div>
                  <div className="col-span-1 relative group">
                    <select
                      value={selectedYear}
                      onChange={e => setSelectedYear(parseInt(e.target.value))}
                      className="w-full px-2 pr-6 py-3 bg-white border border-slate-200 rounded-none text-[12px] font-semibold text-slate-800 appearance-none outline-none text-center"
                    >
                      {[2024, 2025, 2026, 2027, 2028].map(y => (
                        <option key={y} value={y}>{y}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={12} />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Placar em Tempo Real centralizado no formulário */}
          {activeTab === 'marking' && selectedClass && selectedSubject && students.length > 0 && (
            <div className="mt-5 pt-4 border-t border-slate-200 flex justify-center w-full">
              <div className="flex flex-wrap items-center justify-center gap-3.5 select-none">
                {/* Matriculados */}
                <div className="flex items-center border border-slate-200 bg-white pr-4">
                  <div className="w-10 h-10 bg-slate-800 text-white font-bold flex items-center justify-center text-sm shadow-sm md:text-base">
                    {attendanceStats.total}
                  </div>
                  <div className="pl-3 text-left">
                    <p className="text-[9px] font-bold text-slate-800 uppercase tracking-wider leading-none">Matriculados</p>
                    <p className="text-[8px] font-semibold text-slate-400 uppercase tracking-widest mt-0.5">Total</p>
                  </div>
                </div>

                {/* Presentes */}
                <div className="flex items-center border border-slate-200 bg-white pr-4">
                  <div className="w-10 h-10 bg-slate-600 text-white font-bold flex items-center justify-center text-sm shadow-sm md:text-base">
                    {attendanceStats.present}
                  </div>
                  <div className="pl-3 text-left">
                    <p className="text-[9px] font-bold text-slate-700 uppercase tracking-wider leading-none">Presentes</p>
                    <p className="text-[8px] font-semibold text-slate-400 uppercase tracking-widest mt-0.5">Lançados P</p>
                  </div>
                </div>

                {/* Faltantes */}
                <div className="flex items-center border border-rose-200 bg-white pr-4">
                  <div className="w-10 h-10 bg-rose-700 text-white font-bold flex items-center justify-center text-sm shadow-sm md:text-base">
                    {attendanceStats.absent}
                  </div>
                  <div className="pl-3 text-left">
                    <p className="text-[9px] font-bold text-rose-800 uppercase tracking-wider leading-none">Faltantes</p>
                    <p className="text-[8px] font-semibold text-rose-500 uppercase tracking-widest mt-0.5">Lançados F</p>
                  </div>
                </div>

                {/* Abonados */}
                <div className="flex items-center border border-amber-200 bg-white pr-4">
                  <div className="w-10 h-10 bg-amber-600 text-white font-bold flex items-center justify-center text-sm shadow-sm md:text-base">
                    {attendanceStats.justified}
                  </div>
                  <div className="pl-3 text-left">
                    <p className="text-[9px] font-bold text-amber-805 uppercase tracking-wider leading-none">Abonados</p>
                    <p className="text-[8px] font-semibold text-amber-600 uppercase tracking-widest mt-0.5">Lançados J</p>
                  </div>
                </div>

                {/* Pendentes */}
                {attendanceStats.missing > 0 && (
                  <div className="flex items-center border border-dashed border-slate-300 bg-white pr-4">
                    <div className="w-10 h-10 bg-slate-100 text-slate-600 font-bold flex items-center justify-center text-sm md:text-base">
                      {attendanceStats.missing}
                    </div>
                    <div className="pl-3 text-left">
                      <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider leading-none">Pendentes</p>
                      <p className="text-[8px] font-semibold text-slate-400 uppercase tracking-widest mt-0.5">A Marcar</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Content Area */}
        <div className="p-4 md:p-5 bg-white">
          <AnimatePresence mode="wait">
            {!selectedClass ? (
              <motion.div 
                key="empty"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="py-12 md:py-16 flex flex-col items-center text-center space-y-4"
              >
                <div className="relative">
                  <div className="relative w-20 h-20 bg-white text-slate-300 rounded-none flex items-center justify-center border border-slate-200 group hover:border-slate-300 transition-colors duration-500">
                    <ClipboardCheck size={32} className="relative group-hover:text-slate-500 transition-all duration-500" />
                  </div>
                </div>
                <div className="max-w-md space-y-2">
                  <h3 className="text-base font-bold text-slate-800 uppercase tracking-wider">Painel de Assiduidade</h3>
                  <p className="text-[11px] font-medium text-slate-500 uppercase tracking-widest leading-relaxed">
                    Selecione o grupo acadêmico no seletor principal para carregar o quadro de frequências dinâmico.
                  </p>
                </div>
              </motion.div>
            ) : loading ? (
              <motion.div 
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="py-12 md:py-16 flex flex-col items-center justify-center gap-4"
              >
                <div className="relative w-12 h-12">
                   <div className="absolute inset-0 border-[4px] border-slate-100 rounded-full" />
                   <div className="absolute inset-0 border-[4px] border-slate-650 rounded-full animate-spin border-t-transparent" />
                </div>
                <div className="text-center space-y-1">
                  <p className="text-xs font-bold text-slate-700 uppercase tracking-widest animate-pulse">Sincronizando</p>
                  <p className="text-[10px] font-medium text-slate-400 uppercase tracking-widest leading-none">Acessando registros...</p>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-8"
              >
                {notification && (
                  <motion.div 
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className={cn(
                      "p-4 rounded-none flex items-center gap-4 border shadow-sm",
                      notification.type === 'success' 
                        ? "bg-slate-900 text-white border-slate-800" 
                        : "bg-rose-950 text-white border-rose-900"
                    )}
                  >
                    <div className="w-8 h-8 rounded-none bg-slate-800 flex items-center justify-center flex-shrink-0 text-white">
                      {notification.type === 'success' ? <Check size={16} /> : <X size={16} />}
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest opacity-60 mb-0.5">Notificação do Sistema</p>
                      <p className="text-xs font-semibold uppercase tracking-wide">{notification.message}</p>
                    </div>
                    <button onClick={() => setNotification(null)} className="ml-auto w-8 h-8 rounded-none bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors">
                      <X size={16} />
                    </button>
                  </motion.div>
                )}

                {activeTab === 'marking' ? (
                  <div className="space-y-4">
                    {!selectedSubject && (
                      <div className="bg-slate-50 border border-slate-205 p-5 rounded-none flex items-center gap-4 text-slate-700 shadow-sm transition-all duration-500">
                        <div className="w-10 h-10 bg-slate-100 rounded-none flex items-center justify-center text-slate-500 flex-shrink-0 shadow-sm">
                          <Info size={18} />
                        </div>
                        <div className="space-y-0.5">
                           <p className="text-xs font-bold uppercase tracking-wider text-slate-900">Etapa Pendente</p>
                           <p className="text-[11px] font-medium text-slate-505 uppercase tracking-widest leading-relaxed">Selecione a disciplina correspondente no menu superior para carregar a grade de frequência.</p>
                        </div>
                      </div>
                    )}



                    <div className="grid grid-cols-1 gap-2 mt-4">
                      {students.map((student, idx) => (
                        <motion.div 
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: idx * 0.02 }}
                          key={student.id} 
                          className={cn(
                            "group flex flex-col md:flex-row md:items-center justify-between p-4 rounded-none border transition-all duration-200 relative overflow-hidden",
                            attendance[student.id]?.status === 'P' ? "bg-slate-50/50 border-slate-300 shadow-none" :
                            attendance[student.id]?.status === 'F' ? "bg-rose-50/20 border-rose-200 shadow-none" :
                            attendance[student.id]?.status === 'J' ? "bg-amber-50/20 border-amber-200 shadow-none" :
                            "bg-white border-slate-200 hover:border-slate-300 shadow-none"
                          )}
                        >
                          <div className="flex items-center gap-4 mb-4 md:mb-0 relative z-10">
                            <div className={cn(
                              "w-8 h-8 rounded-none flex items-center justify-center text-xs font-bold transition-all duration-300",
                              attendance[student.id]?.status === 'P' ? "bg-slate-800 text-white" :
                              attendance[student.id]?.status === 'F' ? "bg-rose-700 text-white" :
                              attendance[student.id]?.status === 'J' ? "bg-amber-600 text-white" :
                              "bg-slate-200 text-slate-705 animate-none"
                            )}>
                              {String(idx + 1).padStart(2, '0')}
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-slate-900 tracking-tight uppercase leading-none">{student.name}</p>
                              <div className="flex flex-wrap items-center gap-2 mt-1.5">
                                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest px-2 py-0.5 bg-slate-50 border border-slate-200 rounded-none">RA: {student.registration_number}</span>
                                {attendance[student.id]?.status === 'J' ? (
                                  <button
                                    type="button"
                                    disabled={isClosed}
                                    title="Clique para editar as observações do abono"
                                    onClick={() => {
                                      const existingRecord = attendance[student.id];
                                      let type: 'atraso' | 'ausencia' | 'outros' = 'ausencia';
                                      let customReason = '';
                                      if (existingRecord?.status === 'J' && existingRecord?.observations) {
                                        const obs = existingRecord.observations.trim();
                                        if (/^ATRASO/i.test(obs)) {
                                          type = 'atraso';
                                          customReason = obs.replace(/^ATRASO(\s*-\s*)?/i, '');
                                        } else if (/^AUS[ÊE]NCIA/i.test(obs)) {
                                          type = 'ausencia';
                                          customReason = obs.replace(/^AUS[ÊE]NCIA(\s*-\s*)?/i, '');
                                        } else if (/^OUTROS/i.test(obs)) {
                                          type = 'outros';
                                          customReason = obs.replace(/^OUTROS(\s*-\s*)?/i, '');
                                        } else {
                                          type = 'outros';
                                          customReason = obs;
                                        }
                                      }
                                      setAbonoModal({
                                        isOpen: true,
                                        studentId: student.id,
                                        studentName: student.name,
                                        type,
                                        customReason,
                                        isMonthly: false
                                      });
                                    }}
                                    className={cn(
                                      "flex items-center gap-1.5 transition-all text-left",
                                      !isClosed && "hover:bg-amber-100 hover:border-amber-300 cursor-pointer text-amber-850 bg-amber-50 border border-amber-205 px-2 py-0.5 shadow-sm"
                                    )}
                                  >
                                    <span className="text-[9px] font-extrabold uppercase tracking-widest flex items-center gap-1 text-amber-800">
                                      ABONADA
                                      {!isClosed && <Edit size={9} className="text-amber-600 ml-0.5" />}
                                    </span>
                                    {attendance[student.id]?.observations && (
                                      <span className="text-[9px] font-semibold uppercase tracking-wider text-amber-700 max-w-[120px] sm:max-w-[200px] truncate border-l border-amber-200/60 pl-1.5">
                                        {attendance[student.id]?.observations}
                                      </span>
                                    )}
                                  </button>
                                ) : (
                                  attendance[student.id]?.status && (
                                    <span className={cn(
                                      "text-[9px] font-bold uppercase tracking-widest px-2.5 py-0.5 rounded-none border shadow-sm",
                                      attendance[student.id]?.status === 'P' ? "bg-slate-100 text-slate-700 border-slate-300" :
                                      "bg-rose-50 text-rose-700 border-rose-200"
                                    )}>
                                      {attendance[student.id]?.status === 'P' ? 'PRESENTE' : 'FALTOU'}
                                    </span>
                                  )
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 relative z-10">
                            {[
                              { id: 'P', label: 'Presente', icon: Check },
                              { id: 'F', label: 'Falta', icon: X },
                              { id: 'J', label: 'Abonar', icon: Info }
                            ].map((btn) => (
                              <button
                                key={btn.id}
                                disabled={isClosed}
                                title={isClosed ? undefined : "Dê um clique simples para marcar ou duplo clique para limpar a seleção"}
                                onClick={() => {
                                  if (btn.id === 'J') {
                                    const existingRecord = attendance[student.id];
                                    let type: 'atraso' | 'ausencia' | 'outros' = 'ausencia';
                                    let customReason = '';
                                    if (existingRecord?.status === 'J' && existingRecord?.observations) {
                                      const obs = existingRecord.observations.trim();
                                      if (/^ATRASO/i.test(obs)) {
                                        type = 'atraso';
                                        customReason = obs.replace(/^ATRASO(\s*-\s*)?/i, '');
                                      } else if (/^AUS[ÊE]NCIA/i.test(obs)) {
                                        type = 'ausencia';
                                        customReason = obs.replace(/^AUS[ÊE]NCIA(\s*-\s*)?/i, '');
                                      } else if (/^OUTROS/i.test(obs)) {
                                        type = 'outros';
                                        customReason = obs.replace(/^OUTROS(\s*-\s*)?/i, '');
                                      } else {
                                        type = 'outros';
                                        customReason = obs;
                                      }
                                    }
                                    setAbonoModal({
                                      isOpen: true,
                                      studentId: student.id,
                                      studentName: student.name,
                                      type,
                                      customReason,
                                      isMonthly: false
                                    });
                                  } else {
                                    handleStatusChange(student.id, btn.id as any);
                                  }
                                }}
                                onDoubleClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  if (isClosed) return;
                                  
                                  // Limpa totalmente a seleção do aluno
                                  setAttendance(prev => {
                                    const copy = { ...prev };
                                    delete copy[student.id];
                                    return copy;
                                  });
                                }}
                                className={cn(
                                  "flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-none text-[9px] font-bold uppercase tracking-widest transition-all duration-200 border select-none",
                                  attendance[student.id]?.status === btn.id
                                    ? `bg-slate-800 text-white border-slate-800 shadow-sm`
                                    : `bg-white border-slate-200 text-slate-500 hover:border-slate-400 hover:text-slate-800`,
                                  isClosed && attendance[student.id]?.status !== btn.id && "opacity-20 grayscale cursor-not-allowed"
                                )}
                              >
                                <btn.icon size={12} />
                                <span className="hidden sm:block">{btn.label}</span>
                              </button>
                            ))}
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {!selectedSubject ? (
                      <div className="bg-slate-50 border border-slate-205 p-5 rounded-none flex items-center gap-4 text-slate-700 shadow-sm transition-all duration-500">
                        <div className="w-10 h-10 bg-slate-100 rounded-none flex items-center justify-center text-slate-500 flex-shrink-0 shadow-sm">
                          <Info size={18} />
                        </div>
                        <div className="space-y-0.5">
                           <p className="text-xs font-bold uppercase tracking-wider text-slate-900">Etapa Pendente</p>
                           <p className="text-[11px] font-medium text-slate-505 uppercase tracking-widest leading-relaxed">Selecione a disciplina correspondente no menu superior para carregar os relatórios de frequência.</p>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          {/* Card 1: Relatório de Lançamentos */}
                          <div className="bg-white border border-slate-200 p-6 rounded-none flex flex-col justify-between hover:border-slate-400 group transition-all duration-300 shadow-none relative overflow-hidden">
                            <div className="relative z-10">
                              <div className="w-12 h-12 bg-slate-50 rounded-none flex items-center justify-center text-slate-705 mb-4 border border-slate-200">
                                <FileText size={24} />
                              </div>
                              <h4 className="text-sm font-bold text-slate-900 uppercase tracking-tight">Frequência Consolidada</h4>
                              <p className="text-[10px] font-semibold text-slate-400 uppercase mt-1 tracking-widest">Lançamentos do Mês</p>
                              <p className="text-xs font-medium text-slate-550 mt-3 leading-relaxed max-w-sm">
                                Documento que consolida todas as presenças, faltas e justificativas já registradas no sistema ao longo de todo o mês para fins de avaliação de presença.
                              </p>
                            </div>
                            <div className="mt-6 pt-4 border-t border-slate-100 relative z-10">
                              <button 
                                onClick={() => processPrint('report')}
                                disabled={isPrinting}
                                className="w-full h-11 bg-slate-800 hover:bg-slate-900 text-white rounded-none text-[10px] font-bold uppercase tracking-widest transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2"
                              >
                                {isPrinting ? (
                                  <>
                                    <Loader2 size={14} className="animate-spin" />
                                    Preparando Documento...
                                  </>
                                ) : (
                                  <>
                                    <Printer size={14} />
                                    Imprimir Relatório Mensal
                                  </>
                                )}
                              </button>
                            </div>
                          </div>

                          {/* Card 2: Lista Chamada em Branco (Gabarito) */}
                          <div className="bg-white border border-slate-200 p-6 rounded-none flex flex-col justify-between hover:border-slate-400 group transition-all duration-300 shadow-none relative overflow-hidden">
                            <div className="relative z-10">
                              <div className="w-12 h-12 bg-slate-50 rounded-none flex items-center justify-center text-slate-705 mb-4 border border-slate-200">
                                <ClipboardCheck size={24} />
                              </div>
                              <h4 className="text-sm font-bold text-slate-900 uppercase tracking-tight">Ficha para Visto Manual</h4>
                              <p className="text-[10px] font-semibold text-slate-400 uppercase mt-1 tracking-widest">Cédula em Branco</p>
                              <p className="text-xs font-medium text-slate-550 mt-3 leading-relaxed max-w-sm">
                                Imprime a folha de presença mestre em branco, contendo a lista completa de alunos e o calendário de datas, ideal para preenchimento manual em sala.
                              </p>
                            </div>
                            <div className="mt-6 pt-4 border-t border-slate-100 relative z-10">
                              <button 
                                onClick={() => processPrint('marking')}
                                disabled={isPrinting}
                                className="w-full h-11 bg-slate-800 hover:bg-slate-900 text-white rounded-none text-[10px] font-bold uppercase tracking-widest transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2"
                              >
                                {isPrinting ? (
                                  <>
                                    <Loader2 size={14} className="animate-spin" />
                                    Preparando Documento...
                                  </>
                                ) : (
                                  <>
                                    <Printer size={14} />
                                    Imprimir Lista em Branco
                                  </>
                                )}
                              </button>
                            </div>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
    
    {/* PDF Printing Overlay Backdrop */}
      {isPrinting && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[500] flex items-center justify-center p-4">
          <div className="bg-white px-6 py-8 rounded-none shadow-xl flex flex-col items-center justify-center max-w-sm w-full text-center border border-slate-200">
            <div className="w-12 h-12 rounded-none bg-slate-50 text-slate-800 flex items-center justify-center mb-4 border border-slate-200">
              <Loader2 size={24} className="animate-spin" />
            </div>
            <h3 className="text-sm font-bold text-slate-900 tracking-tight uppercase">Gerando Relatório</h3>
            <p className="text-[10px] font-semibold text-slate-400 uppercase mt-1 tracking-wider">Aguarde um instante</p>
            <p className="text-xs font-medium text-slate-500 mt-4 leading-relaxed">
              O documento está sendo consolidado e a tela de impressão do seu navegador abrirá automaticamente em instantes.
            </p>
          </div>
        </div>
      )}

      {/* Abono/Justification Modal (Atraso ou Ausencia) */}
      {abonoModal && abonoModal.isOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[600] flex items-center justify-center p-4">
          <div className="bg-white p-6 max-w-sm w-full border border-slate-200 shadow-2xl rounded-none flex flex-col gap-5 animate-in fade-in zoom-in-95 duration-200">
            <div>
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-tight">Justificar Abono de Falta</h3>
              <p className="text-[10px] font-semibold text-slate-400 uppercase mt-0.5 tracking-wider">Aluno(a): {abonoModal.studentName}</p>
            </div>

            <div className="space-y-3">
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest block mb-1">Qual o motivo do abono?</label>
              
              <div className="flex flex-col gap-2">
                {[
                  { id: 'atraso', label: 'Atraso', icon: Clock },
                  { id: 'ausencia', label: 'Ausência', icon: Info },
                  { id: 'outros', label: 'Outro Motivo', icon: FileText }
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setAbonoModal(prev => prev ? { ...prev, type: opt.id as any } : null)}
                    className={cn(
                      "flex items-center gap-2.5 p-3 border text-[10px] font-bold uppercase tracking-widest transition-all duration-200 rounded-none w-full text-left",
                      abonoModal.type === opt.id
                        ? "bg-slate-800 text-white border-slate-800 shadow-sm"
                        : "bg-slate-50 border-slate-205 text-slate-600 hover:bg-slate-100/80"
                    )}
                  >
                    <opt.icon size={14} className="flex-shrink-0" />
                    <span>{opt.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest block font-sans">Observações / Detalhes (Opcional)</label>
                <span className="text-[9px] font-bold text-slate-400 font-sans uppercase">
                  {120 - (abonoModal.customReason || '').length} restam
                </span>
              </div>
              <textarea
                value={abonoModal.customReason}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val.length <= 120) {
                    setAbonoModal(prev => prev ? { ...prev, customReason: val } : null);
                  }
                }}
                maxLength={120}
                placeholder="Exemplo: Apresentou atestado de saúde ou justificativa oficial de trabalho..."
                className="w-full h-24 p-3 bg-slate-50 border border-slate-205 rounded-none text-xs text-slate-850 focus:bg-white focus:border-slate-400 outline-none resize-none transition-all placeholder:text-slate-400"
              />
            </div>

            <div className="flex gap-2.5 justify-end pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setAbonoModal(null)}
                className="px-4 py-2 bg-white border border-slate-200 hover:border-slate-400 text-slate-500 text-[9px] font-bold uppercase tracking-widest rounded-none transition-all"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  const finalObs = `${abonoModal.type === 'atraso' ? 'ATRASO' : abonoModal.type === 'ausencia' ? 'AUSÊNCIA' : 'OUTROS'}${abonoModal.customReason ? ` - ${abonoModal.customReason.toUpperCase()}` : ''}`;
                  setAttendance(prev => ({
                    ...prev,
                    [abonoModal.studentId]: {
                      ...prev[abonoModal.studentId],
                      student_id: abonoModal.studentId,
                      class_id: selectedClass,
                      subject_id: selectedSubject,
                      date: selectedDate,
                      status: 'J',
                      observations: finalObs
                    }
                  }));
                  setAbonoModal(null);
                }}
                className="px-5 py-2 bg-slate-800 hover:bg-slate-900 text-white text-[9px] font-bold uppercase tracking-widest rounded-none transition-all shadow-md"
              >
                Confirmar Abono
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default Attendance;
