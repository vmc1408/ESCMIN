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
  Download
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
  name: string;
  teacher_id?: string;
}

interface Teacher {
  id: string;
  name: string;
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

export function Attendance() {
  const { userAuth, isAdmin, isDirector } = useAuth();
  const [activeTab, setActiveTab] = useState<'marking' | 'monthly'>('marking');
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
  const [notification, setNotification] = useState<{ type: 'success' | 'err', message: string } | null>(null);

  const fetchData = React.useCallback(async () => {
    try {
      const [classesData, subjectsData, paramsData, instData, teachersData] = await Promise.all([
        fetchQuery('classes', [{ field: 'status', operator: '==', value: 'Ativo' }]),
        fetchQuery('subjects', [{ field: 'status', operator: '==', value: 'Ativo' }]),
        fetchAll('academic_parameters', '*', ''),
        fetchAll('institution_settings'),
        fetchAll('teachers', 'id, name', 'name', true)
      ]);

      if (instData && instData.length > 0) {
        setInstitution(instData[0]);
      }
      
      setTeachers(teachersData || []);

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

      setClasses(sortedClasses);
      setSubjects(subjectsData || []);
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

      const allRecords = await fetchQuery('attendances', [
        { field: 'class_id', operator: '==', value: selectedClass },
        { field: 'date', operator: '>=', value: start },
        { field: 'date', operator: '<=', value: end }
      ]);

      const map: Record<string, Record<string, string>> = {};
      (allRecords || []).forEach(record => {
        if (!map[record.student_id]) map[record.student_id] = {};
        map[record.student_id][record.date] = record.status;
      });
      setMonthlyAttendance(map);
    } catch (error) {
      console.error('Error fetching monthly data:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedClass, selectedMonth, selectedYear, activeTab]);

  useEffect(() => {
    fetchMonthlyData();
  }, [fetchMonthlyData]);

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
      const recordsToSave = Object.values(attendance) as AttendanceRecord[];
      const dbDate = parseDateToDB(selectedDate);
      
      const payloads = recordsToSave.map(record => {
        const studentId = record.student_id;
        const docId = record.id || `${selectedClass}_${selectedSubject}_${dbDate}_${studentId}`;
        return {
          id: docId,
          student_id: studentId,
          class_id: selectedClass,
          subject_id: selectedSubject,
          date: dbDate,
          status: record.status,
          observations: record.observations || ""
        };
      });
      
      if (payloads.length > 0) {
        await saveBatch('attendances', payloads);
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
    const markedCount = Object.keys(attendance).length;
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

  const [showPrintPreview, setShowPrintPreview] = useState(false);
  const [printType, setPrintType] = useState<'marking' | 'report'>('report');

  const handlePrint = () => {
    const type = activeTab === 'marking' ? 'marking' : 'report';
    setPrintType(type);
    setShowPrintPreview(true);
  };

  useEffect(() => {
    let active = true;
    if (showPrintPreview) {
      const updatePDF = async () => {
        setPdfLoading(true);
        const blobUrl = await generateAttendancePDF();
        if (active && blobUrl) {
          if (attendancePdfBlobUrl) URL.revokeObjectURL(attendancePdfBlobUrl);
          setAttendancePdfBlobUrl(blobUrl);
        }
        if (active) setPdfLoading(false);
      };
      updatePDF();
    }
    return () => { active = false; };
  }, [showPrintPreview, printType, students, institution, selectedMonth, selectedYear, activeTab, monthlyAttendance, attendance]);

  const confirmPrint = () => {
    const iframe = document.getElementById('attendance-preview-iframe') as HTMLIFrameElement;
    if (iframe && iframe.contentWindow) {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
    }
  };

  const generateAttendancePDF = async () => {
    try {
      const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4'
      });

      const pageWidth = doc.internal.pageSize.width; // 297mm
      const pageHeight = doc.internal.pageSize.height; // 210mm
      const margin = 10;
      const contentWidth = pageWidth - (margin * 2);

      const itemsPerPage = 20;
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
        doc.line(margin, margin + 18, pageWidth - margin, margin + 18);

        // Info Box
        doc.setFillColor(248, 250, 252);
        doc.roundedRect(margin, margin + 20, contentWidth, 18, 1, 1, 'F');
        
        doc.setFontSize(10);
        doc.setTextColor(0);
        doc.setFont('helvetica', 'bold');
        doc.text(printType === 'marking' ? 'LISTA DE CHAMADA' : 'LISTA DE PRESENÇA MENSAL', margin + 4, margin + 26);
        
        doc.setFontSize(8);
        doc.setTextColor(150);
        doc.text('MÊS REFERÊNCIA:', pageWidth - margin - 60, margin + 26, { align: 'right' });
        doc.setTextColor(0);
        const monthName = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'][selectedMonth];
        doc.text(`${monthName} / ${selectedYear}`.toUpperCase(), pageWidth - margin - 4, margin + 26, { align: 'right' });

        // Second line of Info Box
        doc.setFontSize(7);
        doc.setTextColor(150);
        doc.text('TURMA / CÓDIGO', margin + 4, margin + 31);
        doc.text('SALA / LOCAL', margin + 65, margin + 31);
        doc.text('DISCIPLINA', margin + 105, margin + 31);
        doc.text('TOTAL DE ALUNOS', pageWidth - margin - 4, margin + 31, { align: 'right' });

        doc.setFontSize(8);
        doc.setTextColor(0);
        doc.text(`${currentClassObj?.name || 'N/A'} (${currentClassObj?.code || '---'})`.toUpperCase(), margin + 4, margin + 35);
        doc.text(currentClassObj?.room || '002', margin + 65, margin + 35);
        doc.text((currentSubjectObj?.name || 'Todas as Categorias').toUpperCase(), margin + 105, margin + 35);
        
        doc.setFontSize(14);
        doc.text(String(students.length), pageWidth - margin - 4, margin + 36, { align: 'right' });

        // Table Head
        const head: any[] = [
          [
            { content: 'Nº', styles: { halign: 'center', valign: 'middle' } },
            { content: 'MATRÍCULA', styles: { valign: 'middle' } },
            { content: 'NOME COMPLETO DO ALUNO', styles: { valign: 'middle' } },
            ...monthlyClassDays.map(day => {
              const dateStr = day ? `${day.dayNumber.toString().padStart(2, '0')}/${new Date(day.dbValue + 'T12:00:00').toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '').toUpperCase()}` : '';
              const typeStr = day?.isCancelled ? 'CANC' : day?.isExcused ? 'ABON' : `AULA ${day?.lessonNumber || ''}`;
              return { content: `${dateStr}\n${typeStr}`, styles: { halign: 'center', fontSize: 6 } };
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
              if (printType === 'marking') return '';
              const status = day ? (activeTab === 'monthly' ? monthlyAttendance[student.id]?.[day.dbValue] : (day.dbValue === parseDateToDB(selectedDate) ? attendance[student.id]?.status : null)) : null;
              return { 
                content: status === 'P' ? 'OK' : status === 'F' ? 'F' : status === 'J' ? 'J' : '',
                styles: { halign: 'center', fontStyle: status === 'P' ? 'bold' : 'normal' }
              };
            })
          ];
        });

        autoTable(doc, {
          startY: margin + 40,
          head: head,
          body: body,
          theme: 'grid',
          headStyles: { 
            fillColor: [240, 240, 240],
            textColor: [0, 0, 0],
            fontSize: 7,
            lineWidth: 0.1,
            lineColor: [100, 100, 100],
            fontStyle: 'bold'
          },
          styles: { 
            fontSize: 8,
            cellPadding: 1.5,
            lineWidth: 0.1,
            lineColor: [180, 180, 180],
            minCellHeight: 8,
            valign: 'middle'
          },
          columnStyles: {
            0: { cellWidth: 8 },
            1: { cellWidth: 28 }, // Increased from 20
            2: { cellWidth: 75 }
          },
          didDrawPage: (data) => {
            // Footer
            doc.setFontSize(7);
            doc.setTextColor(150);
            const footerY = pageHeight - margin + 3;
            doc.text(institution?.address || 'AV. VENUS, 195 - GUARULHOS', margin, footerY);
            
            // Fixed overlap in footer
            const emissionDate = `EMISSÃO: ${new Date().toLocaleDateString('pt-BR')}`;
            const pageText = `PÁGINA ${pageIdx + 1}/${totalPages}`;
            
            doc.text(emissionDate, pageWidth - margin - 45, footerY, { align: 'right' });
            doc.text(pageText, pageWidth - margin, footerY, { align: 'right' });
          }
        });
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

      <div className="max-w-[1600px] mx-auto p-4 md:p-8 space-y-8 no-print">
      {/* Page Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="flex items-center gap-6">
          <div className="w-16 h-16 p-3 bg-white rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-100 no-print flex items-center justify-center group overflow-hidden relative">
            <div className="absolute inset-0 bg-gradient-to-br from-slate-50 to-white" />
            {institution?.logo ? (
              <img src={institution.logo} alt="Logo" className="w-full h-full object-contain group-hover:scale-110 transition-transform duration-700 relative z-10" />
            ) : (
              <School size={28} className="text-emerald-600 relative z-10" />
            )}
          </div>
          <div>
            <h2 className="text-2xl font-black text-slate-900 tracking-tight uppercase">Frequência</h2>
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 mt-2">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-lg shadow-emerald-200 animate-pulse" />
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">{institution?.name || 'CENTRO DE ENSINO'}</p>
              </div>
              <div className="hidden sm:block w-1 h-1 rounded-full bg-slate-300" />
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest bg-slate-100/50 px-3 py-1 rounded-full border border-slate-200/50">Diário Digital de Classe</p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <div className="flex bg-slate-100/50 backdrop-blur-xl p-1.5 rounded-2xl border border-slate-200/60 shadow-inner">
            {[
              { id: 'marking', label: 'Chamada', color: 'emerald' },
              { id: 'monthly', label: 'Mensal', color: 'indigo' }
            ].map((tab) => (
              <button 
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={cn(
                  "px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-[0.1em] transition-all duration-300",
                  activeTab === tab.id 
                    ? "bg-white text-slate-900 shadow-lg border border-slate-100" 
                    : "text-slate-400 hover:text-slate-600 hover:bg-white/50"
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            {selectedClass && (
              <button 
                onClick={handlePrint}
                className="w-12 h-12 bg-white text-slate-700 rounded-xl flex items-center justify-center border border-slate-200 hover:bg-slate-50 hover:border-slate-400 hover:text-slate-900 shadow-sm transition-all active:scale-90 group"
                title="IMPRIMIR RELATÓRIO"
              >
                <Printer size={18} className="group-hover:rotate-12 transition-transform" />
              </button>
            )}

            {activeTab === 'marking' && students.length > 0 && (
              <div className="flex items-center gap-3">
                {!isClosed ? (
                  <>
                    <button 
                      disabled={saving || closing || !selectedSubject || !isScheduledDay}
                      onClick={saveAttendance}
                      className="group relative flex items-center gap-3 h-12 px-6 bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-white hover:border-slate-400 transition-all active:scale-95 disabled:opacity-50 overflow-hidden"
                    >
                      {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                      <span>Salvar Rascunho</span>
                    </button>
                    <button 
                      disabled={saving || closing || !selectedSubject || !isScheduledDay}
                      onClick={closeAttendance}
                      className="group relative flex items-center gap-3 h-12 px-8 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-black shadow-xl shadow-slate-200/50 transition-all active:scale-95 disabled:opacity-50 overflow-hidden"
                    >
                      {closing ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                      <span>Fechar Lançamentos</span>
                    </button>
                  </>
                ) : (
                  <div className="flex items-center gap-3 h-12 px-8 bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase tracking-[0.2em] shadow-lg shadow-emerald-100">
                    <Check size={16} />
                    <span>Lançamentos Finalizados</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xl shadow-slate-200/30 overflow-hidden text-slate-900">
        {/* Filter Bar */}
        <div className="p-8 border-b border-slate-100 bg-slate-50/30">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-3">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Turma</label>
              <div className="relative group">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-white rounded-xl flex items-center justify-center text-slate-400 border border-slate-200 transition-all duration-300 shadow-sm">
                  <School size={18} />
                </div>
                <select
                  value={selectedClass}
                  onChange={e => {
                    setSelectedClass(e.target.value);
                    setSelectedSubject('');
                  }}
                  className="w-full pl-16 pr-8 py-4 bg-white border border-slate-200 rounded-xl text-[13px] font-bold text-slate-900 focus:ring-4 focus:ring-slate-500/5 focus:border-slate-400 appearance-none transition-all outline-none"
                >
                  <option value="">SELECIONAR TURMA...</option>
                  {classes.map(c => <option key={c.id} value={c.id}>{c.name} ({c.code})</option>)}
                </select>
                <ChevronDown className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-400 transition-colors pointer-events-none" size={20} />
              </div>
            </div>

            {activeTab === 'monthly' && (
              <div className="space-y-3">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Período</label>
                <div className="grid grid-cols-5 gap-3">
                  <div className="col-span-3 relative group">
                    <select
                      value={selectedMonth}
                      onChange={e => setSelectedMonth(parseInt(e.target.value))}
                      className="w-full px-6 py-4 bg-white border border-slate-200 rounded-xl text-[13px] font-bold text-slate-900 focus:ring-4 focus:ring-slate-500/5 focus:border-slate-400 appearance-none transition-all outline-none"
                    >
                      {['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'].map((m, i) => (
                        <option key={i} value={i}>{m.toUpperCase()}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-300 pointer-events-none" size={18} />
                  </div>
                  <div className="col-span-2 relative group">
                    <select
                      value={selectedYear}
                      onChange={e => setSelectedYear(parseInt(e.target.value))}
                      className="w-full px-6 py-4 bg-white border border-slate-200 rounded-xl text-[13px] font-bold text-slate-900 focus:ring-4 focus:ring-slate-500/5 focus:border-slate-400 appearance-none transition-all outline-none text-center"
                    >
                      {[2024, 2025, 2026, 2027, 2028].map(y => (
                        <option key={y} value={y}>{y}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 pointer-events-none" size={18} />
                  </div>
                </div>
              </div>
            )}
            
            {(activeTab === 'marking' || activeTab === 'monthly') && (
              <div className="space-y-3">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Disciplina</label>
                <div className="relative group">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-white rounded-xl flex items-center justify-center text-slate-400 border border-slate-200 transition-all duration-300 shadow-sm">
                    <BookOpen size={18} />
                  </div>
                  <select
                    value={selectedSubject}
                    onChange={e => setSelectedSubject(e.target.value)}
                    disabled={!selectedClass}
                    className="w-full pl-16 pr-8 py-4 bg-white border border-slate-200 rounded-xl text-[13px] font-bold text-slate-900 focus:ring-4 focus:ring-slate-500/5 focus:border-slate-400 appearance-none transition-all disabled:bg-slate-100/50 disabled:opacity-60 outline-none"
                  >
                    <option value="">SELECIONAR DISCIPLINA...</option>
                    {filteredSubjects.map(s => <option key={s.id} value={s.id}>{s.name.toUpperCase()}</option>)}
                  </select>
                  <ChevronDown className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-400 transition-colors pointer-events-none" size={20} />
                </div>
              </div>
            )}

            {activeTab === 'marking' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between ml-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Data</label>
                  {selectedClass && (
                    <motion.div 
                      layout
                      className={cn(
                        "px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-[0.1em] border",
                        availableDates.length > 0 ? "bg-emerald-50 text-emerald-700 border-emerald-100" : "bg-red-50 text-red-700 border-red-100"
                      )}
                    >
                      {availableDates.length > 0 ? `${availableDates.length} AGENDADOS` : 'FORA DO CALENDÁRIO'}
                    </motion.div>
                  )}
                </div>
                <div className="grid grid-cols-4 gap-3">
                  <div className="col-span-3 relative group">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-white rounded-xl flex items-center justify-center text-slate-400 border border-slate-200 transition-all duration-300 shadow-sm">
                      <CalendarIcon size={18} />
                    </div>
                    <select
                    disabled={!selectedClass || availableDates.length === 0}
                    value={parseDateToDB(selectedDate)}
                    onChange={e => setSelectedDate(formatDateForDisplay(e.target.value))}
                    className={cn(
                      "w-full pl-16 pr-10 py-4 bg-white border border-slate-200 rounded-xl text-[13px] font-bold text-slate-900 focus:ring-4 focus:border-slate-400 appearance-none transition-all outline-none",
                      availableDates.length > 0 ? "focus:ring-slate-500/5" : "ring-4 ring-red-50/50"
                    )}
                  >
                    <option value="">DATA...</option>
                    {[...availableDates].reverse().map(date => (
                      <option key={date.dbValue} value={date.dbValue}>
                        {date.label.toUpperCase()}
                      </option>
                    ))}
                  </select>
                    <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={18} />
                  </div>
                  <div className="col-span-1 relative group">
                    <select
                      value={selectedYear}
                      onChange={e => setSelectedYear(parseInt(e.target.value))}
                      className="w-full px-2 py-4 bg-white border border-slate-200 rounded-xl text-[12px] font-bold text-slate-900 focus:ring-4 focus:border-slate-400 appearance-none transition-all outline-none text-center"
                    >
                      {[2024, 2025, 2026, 2027, 2028].map(y => (
                        <option key={y} value={y}>{y}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Action Strip for Marking */}
        {activeTab === 'marking' && selectedClass && selectedSubject && students.length > 0 && (
          <div className="px-8 py-6 bg-white border-b border-slate-100 flex flex-col xl:flex-row xl:items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-slate-900 text-white rounded-xl flex items-center justify-center font-black text-xl shadow-lg shadow-slate-200">
                <span>{students.length}</span>
              </div>
              <div>
                <p className="text-xs font-black text-slate-900 uppercase tracking-tight leading-none">Matriculados</p>
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1 flex items-center gap-2">
                   <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                   Sessão ativa
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                disabled={isClosed}
                onClick={() => handleMarkAll('P')}
                className="flex items-center gap-3 px-6 py-3 bg-emerald-50 text-emerald-700 rounded-xl text-[10px] font-black uppercase tracking-[0.1em] hover:bg-emerald-600 hover:text-white transition-all duration-300 active:scale-95 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
              >
                <Check size={16} />
                Presença Geral
              </button>
              <button
                disabled={isClosed}
                onClick={() => handleMarkAll('F')}
                className="flex items-center gap-3 px-6 py-3 bg-red-50 text-red-700 rounded-xl text-[10px] font-black uppercase tracking-[0.1em] hover:bg-red-600 hover:text-white transition-all duration-300 active:scale-95 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
              >
                <X size={16} />
                Falta Geral
              </button>
            </div>
          </div>
        )}

        {/* Content Area */}
        <div className="p-8 bg-white">
          <AnimatePresence mode="wait">
            {!selectedClass ? (
              <motion.div 
                key="empty"
                initial={{ opacity: 0, y: 40 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="py-48 flex flex-col items-center text-center space-y-10"
              >
                <div className="relative">
                  <div className="absolute inset-0 bg-emerald-500/10 blur-[120px] rounded-full animate-pulse" />
                  <div className="relative w-40 h-40 bg-white text-slate-200 rounded-[3.5rem] flex items-center justify-center shadow-2xl border border-slate-50 group hover:border-emerald-100 transition-colors duration-700">
                    <ClipboardCheck size={80} className="relative group-hover:text-emerald-500 group-hover:scale-110 transition-all duration-700" />
                  </div>
                </div>
                <div className="max-w-md space-y-4">
                  <h3 className="text-3xl font-black text-slate-900 tracking-tighter uppercase">Painel de Assiduidade</h3>
                  <p className="text-[12px] font-bold text-slate-400 uppercase tracking-[0.2em] leading-loose">
                    Selecione o grupo acadêmico no seletor principal para carregar o quadro de frequências dinâmico.
                  </p>
                </div>
              </motion.div>
            ) : loading ? (
              <motion.div 
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="py-48 flex flex-col items-center justify-center gap-8"
              >
                <div className="relative w-24 h-24">
                   <div className="absolute inset-0 border-[8px] border-slate-100 rounded-full" />
                   <div className="absolute inset-0 border-[8px] border-emerald-600 rounded-full animate-spin border-t-transparent shadow-xl" />
                   <div className="absolute inset-0 flex items-center justify-center">
                     <div className="w-3 h-3 bg-emerald-600 rounded-full animate-ping" />
                   </div>
                </div>
                <div className="text-center space-y-3">
                  <p className="text-[14px] font-black text-slate-900 uppercase tracking-[0.4em] animate-pulse">Sincronizando</p>
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest leading-none">Acessando registros criptografados...</p>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-12"
              >
                {notification && (
                  <motion.div 
                    initial={{ opacity: 0, x: -30 }}
                    animate={{ opacity: 1, x: 0 }}
                    className={cn(
                      "p-8 rounded-[2rem] flex items-center gap-8 border shadow-2xl animate-in slide-in-from-left-12 duration-700",
                      notification.type === 'success' 
                        ? "bg-slate-900 text-white border-slate-800" 
                        : "bg-red-600 text-white border-red-500"
                    )}
                  >
                    <div className={cn(
                      "w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-inner text-white",
                      notification.type === 'success' ? "bg-emerald-500" : "bg-red-500"
                    )}>
                      {notification.type === 'success' ? <Check size={30} /> : <X size={30} />}
                    </div>
                    <div>
                      <p className="text-[11px] font-black uppercase tracking-[0.2em] opacity-50 mb-1">Notificação do Sistema</p>
                      <p className="text-sm font-black uppercase tracking-[0.05em]">{notification.message}</p>
                    </div>
                    <button onClick={() => setNotification(null)} className="ml-auto w-10 h-10 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors">
                      <X size={20} />
                    </button>
                  </motion.div>
                )}

                {activeTab === 'marking' ? (
                  <div className="space-y-8">
                    {!selectedSubject && (
                      <div className="bg-white border border-amber-100 p-12 rounded-[3.5rem] flex items-center gap-10 text-amber-900 shadow-2xl shadow-amber-50/50 group hover:border-amber-400 transition-all duration-700">
                        <div className="w-20 h-20 bg-amber-50 rounded-[2rem] flex items-center justify-center text-amber-500 shadow-sm group-hover:scale-110 transition-transform duration-500">
                          <Info size={40} />
                        </div>
                        <div className="space-y-3">
                           <p className="text-2xl font-black uppercase tracking-tight">Etapa Pendente</p>
                           <p className="text-[12px] font-bold text-amber-700/60 uppercase tracking-[0.1em] leading-loose">Selecione a disciplina correspondente no menu superior para carregar a grade de frequência.</p>
                        </div>
                      </div>
                    )}

                    {!isScheduledDay && selectedClass && (
                      <div className="bg-red-50/20 border border-red-100 p-12 rounded-[3.5rem] flex items-center gap-10 text-red-900 shadow-2xl shadow-red-50/50">
                        <div className="w-20 h-20 bg-white rounded-[2rem] flex items-center justify-center text-red-500 shadow-sm animate-pulse">
                          <Clock size={40} />
                        </div>
                        <div className="space-y-3">
                          <p className="text-2xl font-black uppercase tracking-tight">Data Inválida</p>
                          <p className="text-[12px] font-bold text-red-600/60 uppercase tracking-[0.1em] leading-loose">A data selecionada não foi identificada no cronograma acadêmico oficial desta turma.</p>
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-1 gap-4 mt-8">
                      {students.map((student, idx) => (
                        <motion.div 
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: idx * 0.03 }}
                          key={student.id} 
                          className={cn(
                            "group flex flex-col lg:flex-row lg:items-center justify-between p-6 rounded-2xl border transition-all duration-300 relative overflow-hidden",
                            attendance[student.id]?.status === 'P' ? "bg-emerald-50/30 border-emerald-100 shadow-sm" :
                            attendance[student.id]?.status === 'F' ? "bg-red-50/30 border-red-100 shadow-sm" :
                            attendance[student.id]?.status === 'J' ? "bg-amber-50/30 border-amber-100 shadow-sm" :
                            "bg-white border-slate-200 hover:border-slate-300 shadow-sm"
                          )}
                        >
                          <div className="flex items-center gap-6 mb-6 lg:mb-0 relative z-10">
                            <div className={cn(
                              "w-10 h-10 rounded-xl flex items-center justify-center text-sm font-black shadow-sm transition-all duration-300",
                              attendance[student.id]?.status === 'P' ? "bg-emerald-600 text-white" :
                              attendance[student.id]?.status === 'F' ? "bg-red-600 text-white" :
                              attendance[student.id]?.status === 'J' ? "bg-amber-600 text-white" :
                              "bg-slate-900 text-white"
                            )}>
                              {String(idx + 1).padStart(2, '0')}
                            </div>
                            <div>
                              <p className="text-lg font-black text-slate-900 tracking-tight uppercase leading-none">{student.name}</p>
                              <div className="flex flex-wrap items-center gap-3 mt-2">
                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-2 py-0.5 bg-slate-50 border border-slate-100 rounded-md">RA: {student.registration_number}</span>
                                {attendance[student.id]?.status && (
                                  <span className={cn(
                                    "text-[9px] font-black uppercase tracking-widest px-3 py-0.5 rounded-full border shadow-sm",
                                    attendance[student.id]?.status === 'P' ? "bg-emerald-500 text-white border-emerald-400" :
                                    attendance[student.id]?.status === 'F' ? "bg-red-500 text-white border-red-400" :
                                    "bg-amber-500 text-white border-amber-400"
                                  )}>
                                    {attendance[student.id]?.status === 'P' ? 'Presente' : attendance[student.id]?.status === 'F' ? 'Falta' : 'Justificado'}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 relative z-10">
                            {[
                              { id: 'P', label: 'Presente', icon: Check, color: 'emerald' },
                              { id: 'F', label: 'Falta', icon: X, color: 'red' },
                              { id: 'J', label: 'Justificar', icon: Info, color: 'amber' }
                            ].map((btn) => (
                              <button
                                key={btn.id}
                                disabled={isClosed}
                                onClick={() => handleStatusChange(student.id, btn.id as any)}
                                className={cn(
                                  "flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all duration-300 border",
                                  attendance[student.id]?.status === btn.id
                                    ? `bg-slate-900 text-white border-slate-900 shadow-lg`
                                    : `bg-white border-slate-200 text-slate-400 hover:border-slate-400 hover:text-slate-900`,
                                  isClosed && attendance[student.id]?.status !== btn.id && "opacity-20 grayscale cursor-not-allowed"
                                )}
                              >
                                <btn.icon size={14} />
                                <span className="hidden xl:block">{btn.label}</span>
                              </button>
                            ))}
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-8">
                    <div className="flex flex-col md:flex-row items-center justify-between gap-6 bg-slate-50 p-6 rounded-3xl border border-slate-200">
                      <div>
                        <h4 className="text-xl font-black text-slate-900 uppercase tracking-tight">Lista de Presença Mensal</h4>
                        <p className="text-xs font-bold text-slate-500 uppercase mt-1 tracking-widest">Gere formulários para assinatura manual ou visualize registros</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <button 
                          onClick={() => {
                            setShowPrintPreview(true);
                          }}
                          className="flex items-center gap-3 px-8 py-3 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-slate-800 transition-all active:scale-95 shadow-lg shadow-slate-200"
                        >
                          <Printer size={16} />
                          Imprimir Lista de Chamada
                        </button>
                      </div>
                    </div>

                    <div className="bg-slate-900 p-8 rounded-3xl border border-slate-800 flex flex-col md:flex-row items-center justify-between gap-8 group relative overflow-hidden">
                      <div className="absolute inset-0 bg-gradient-to-tr from-blue-500/10 to-transparent opacity-50" />
                      <div className="flex items-center gap-6 relative z-10">
                        <div className="w-16 h-16 bg-slate-800 rounded-2xl flex items-center justify-center text-blue-400 shadow-inner border border-slate-700/50">
                          <CalendarIcon size={32} />
                        </div>
                        <div>
                          <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Relatório Mensal</p>
                          <h4 className="text-2xl font-black text-white tracking-tight mt-1 uppercase">
                            {['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'][selectedMonth]} {selectedYear}
                          </h4>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-4 relative z-10">
                        <div className="px-5 py-3 bg-slate-800 text-white rounded-xl border border-slate-700/50 text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
                           <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                           {monthlyClassDays.filter(d => !d.isCancelled).length} Aulas
                        </div>
                        <div className="px-5 py-3 bg-slate-800 text-white rounded-xl border border-slate-700/50 text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
                           <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                           {students.length} Alunos
                        </div>
                      </div>
                    </div>

                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto overflow-hidden">
                      <table className="w-full border-collapse">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200">
                            <th className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest w-20">Nº</th>
                            <th className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest w-96">Nome do Aluno</th>
                            {monthlyClassDays.map(day => (
                              <th key={day.dbValue} className="px-4 py-4 text-center border-l border-slate-200 min-w-[70px]">
                                <div className="flex flex-col items-center justify-center gap-1">
                                  <p className="text-[13px] font-black text-slate-900 leading-none flex items-center">
                                    {String(day.dayNumber).padStart(2, '0')}
                                    <span className="text-[10px] text-slate-400 ml-0.5">/{new Date(day.dbValue + 'T12:00:00').toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '').toUpperCase()}</span>
                                  </p>
                                  <div className={cn(
                                    "px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-tighter",
                                    day.isCancelled ? "bg-red-500 text-white" : day.isExcused ? "bg-slate-500 text-white" : "bg-slate-100 text-slate-500"
                                  )}>
                                    {day.isCancelled ? 'Cancelada' : day.isExcused ? 'Abonada' : `Aula ${day.lessonNumber}`}
                                  </div>
                                </div>
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {students.map((student, idx) => (
                            <tr key={student.id} className="hover:bg-slate-50 transition-colors group">
                              <td className="px-6 py-4 text-xs font-black text-slate-400">{String(idx + 1).padStart(2, '0')}</td>
                              <td className="px-6 py-4">
                                <p className="text-xs font-black text-slate-800 uppercase tracking-tight group-hover:text-blue-600 transition-colors">{student.name}</p>
                              </td>
                              {monthlyClassDays.map(day => {
                                const status = monthlyAttendance[student.id]?.[day.dbValue];
                                if (day.isCancelled) {
                                  return (
                                    <td key={day.dbValue} className="px-3 py-4 border-l border-slate-100 bg-red-50/20">
                                      <div className="w-7 h-7 mx-auto flex items-center justify-center text-[8px] font-black text-red-300/50 uppercase rotate-[-45deg]">
                                        Canc
                                      </div>
                                    </td>
                                  );
                                }
                                return (
                                  <td key={day.dbValue} className="px-3 py-4 border-l border-slate-100">
                                    <div className={cn(
                                      "w-7 h-7 mx-auto rounded-lg flex items-center justify-center text-[10px] font-black",
                                      status === 'P' ? "bg-emerald-50 text-emerald-600 border border-emerald-100" :
                                      status === 'F' ? "bg-red-50 text-red-600 border border-red-100" :
                                      status === 'J' ? "bg-amber-50 text-amber-600 border border-amber-100" :
                                      "bg-slate-50 text-slate-300 border border-slate-100"
                                    )}>
                                       {status || '—'}
                                    </div>
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
    
    {/* PDF Print Preview Modal */}
      {showPrintPreview && attendancePdfBlobUrl && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[500] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-6xl rounded-[2.5rem] shadow-2xl flex flex-col h-[90vh] overflow-hidden animate-in fade-in zoom-in duration-300 border border-slate-100">
            {/* Modal Header */}
            <div className="p-8 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-center bg-slate-50/50 gap-6">
              <div className="flex items-center gap-5">
                <div className="w-14 h-14 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-xl shadow-indigo-200">
                  <Printer size={28} />
                </div>
                <div>
                  <h3 className="text-2xl font-black text-slate-900 tracking-tight">Visualização de Documento</h3>
                  <p className="text-sm font-medium text-slate-500 uppercase tracking-widest mt-1">Conferência final antes da impressão</p>
                </div>
              </div>
              
            <div className="flex bg-white p-1.5 rounded-2xl border border-slate-200 shadow-sm relative">
                {pdfLoading && (
                  <div className="absolute inset-0 bg-white/50 backdrop-blur-[1px] flex items-center justify-center z-20 rounded-2xl">
                    <Loader2 size={16} className="animate-spin text-indigo-600" />
                  </div>
                )}
                <button
                  onClick={() => setPrintType('marking')}
                  className={cn(
                    "px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                    printType === 'marking' ? "bg-slate-900 text-white shadow-lg" : "text-slate-400 hover:text-slate-600 hover:bg-slate-50"
                  )}
                >
                  Lista Chamada
                </button>
                <button
                  onClick={() => setPrintType('report')}
                  className={cn(
                    "px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                    printType === 'report' ? "bg-slate-900 text-white shadow-lg" : "text-slate-400 hover:text-slate-600 hover:bg-slate-50"
                  )}
                >
                  Relatório Mensal
                </button>
              </div>

              <div className="flex items-center gap-3 w-full sm:w-auto">
                <button 
                  onClick={() => {
                    const link = document.createElement('a');
                    link.href = attendancePdfBlobUrl;
                    link.download = `Chamada_${currentClass?.name || 'Lista'}_${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.pdf`;
                    link.click();
                  }}
                  className="p-4 bg-white text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-2xl transition-all border border-slate-200 shadow-sm"
                  title="Baixar PDF"
                >
                  <Download size={24} />
                </button>
                <button 
                  onClick={() => setShowPrintPreview(false)}
                  className="px-6 py-4 bg-white text-slate-900 border border-slate-200 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-red-50 hover:text-red-600 transition-all active:scale-95 shadow-sm"
                >
                  Fechar
                </button>
                <button 
                  onClick={confirmPrint}
                  className="flex-1 sm:flex-none px-10 py-4 bg-emerald-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-xl shadow-emerald-200 active:scale-95 flex items-center justify-center gap-3"
                >
                  <Printer size={20} />
                  Imprimir Agora
                </button>
              </div>
            </div>

            {/* Preview Content Area (iFrame) */}
            <div className="flex-1 bg-slate-200/50 p-6 flex items-center justify-center relative">
              <iframe 
                id="attendance-preview-iframe" 
                src={attendancePdfBlobUrl} 
                className="w-full h-full rounded-2xl border border-slate-300 bg-white shadow-2xl" 
                title="Attendance PDF Preview"
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default Attendance;
