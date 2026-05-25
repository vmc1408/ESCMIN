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
  Loader2
} from 'lucide-react';
import { cn, maskDate, formatDateForDisplay, parseDateToDB } from '../lib/utils';
import { fetchAll, saveData, deleteData, fetchQuery, saveBatch } from '../lib/database';
import { useAuth } from '../contexts/AuthContext';
import { motion, AnimatePresence } from 'motion/react';

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

  const isScheduledDay = React.useMemo(() => {
    if (!selectedClass || !selectedDate || classEvents.length === 0) return false;
    const dbDate = parseDateToDB(selectedDate);
    return classEvents.some(event => event.start_date === dbDate);
  }, [selectedDate, classEvents, selectedClass]);
  
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

    // A. Use explicit days_of_week if available
    if (Array.isArray(classInfo.days_of_week) && classInfo.days_of_week.length > 0) {
      targetDayIndices = classInfo.days_of_week.map(d => dayMap[d]).filter(d => d !== undefined);
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
        if (
          String(event.class_id) !== String(selectedClass) && 
          !(!event.class_id || event.type === 'cancelled_class' || event.type === 'excused_class' || event.type?.includes('holiday'))
        ) {
          return;
        }

        // STRICT FILTER: Only show days that match identified target weekdays
        if (selectedClassWeekdays.length > 0) {
          const dateObj = new Date(dateKey + 'T12:00:00');
          if (!selectedClassWeekdays.includes(dateObj.getDay())) return;
        }

        // Filter by subject if specified on the event
        if (selectedSubject && event.subject_id !== selectedSubject) return;

        // Skip cancelled classes or holidays for markings
        if (event.type === 'cancelled_class' || event.type?.includes('holiday')) return;

        uniqueMap.set(dateKey, event);
      }
    });

    return Array.from(uniqueMap.values())
      .sort((a, b) => a.start_date.localeCompare(b.start_date))
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

  // Auto-select logic
  useEffect(() => {
    if (availableDates.length > 0 && selectedClass) {
      const today = new Date().toISOString().split('T')[0];
      const bestDate = availableDates.find(d => d.dbValue >= today) || availableDates[0];
      if (bestDate) setSelectedDate(bestDate.displayValue);
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

  const handlePrint = () => {
    setShowPrintPreview(true);
  };

  const confirmPrint = () => {
    window.print();
    setShowPrintPreview(false);
  };

  const currentClass = classes.find(c => c.id === selectedClass);
  const currentSubject = subjects.find(s => s.id === selectedSubject);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          @page { 
            size: A4 landscape;
            margin: 0;
          }
          html, body {
            width: 297mm !important;
            height: 210mm !important;
            background: #fff !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: hidden !important;
          }
          body * {
            visibility: hidden !important;
          }
          #print-root, #printable-area, #printable-area * {
            visibility: visible !important;
          }
          #root {
            display: none !important;
          }
          #printable-area {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 297mm !important;
            margin: 0 !important;
            display: block !important;
            background: white !important;
            z-index: 99999 !important;
          }
          .print-page {
            width: 297mm !important;
            height: 210mm !important;
            padding: 15mm !important;
            overflow: hidden !important;
            break-after: page !important;
            background: white !important;
            position: relative !important;
            display: flex !important;
            flex-direction: column !important;
          }
          .no-print, [role="dialog"], .backdrop-blur-sm {
            display: none !important;
            visibility: hidden !important;
          }
        }
      `}} />

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
                <div className="relative group">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-white rounded-xl flex items-center justify-center text-slate-400 border border-slate-200 transition-all duration-300 shadow-sm">
                    <CalendarIcon size={18} />
                  </div>
                  <select
                    disabled={!selectedClass || availableDates.length === 0}
                    value={parseDateToDB(selectedDate)}
                    onChange={e => setSelectedDate(formatDateForDisplay(e.target.value))}
                    className={cn(
                      "w-full pl-16 pr-12 py-4 bg-white border border-slate-200 rounded-xl text-[13px] font-bold text-slate-900 focus:ring-4 focus:border-slate-400 appearance-none transition-all outline-none",
                      availableDates.length > 0 ? "focus:ring-slate-500/5" : "ring-4 ring-red-50/50"
                    )}
                  >
                    <option value="">DATA...</option>
                    {availableDates.map(date => (
                      <option key={date.dbValue} value={date.dbValue}>
                        {date.label.toUpperCase()}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-400 transition-colors pointer-events-none" size={20} />
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
      {/* Print Preview Modal */}
          {showPrintPreview && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[500] flex items-center justify-center p-4 no-print">
          <div className="bg-white w-full max-w-[1200px] h-[95vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in duration-300">
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-white relative z-10">
              <div className="flex items-center gap-5">
                <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-lg shadow-indigo-200">
                  <Printer size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-800 tracking-tight">Visualização de Impressão</h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mt-1">Padrão A4 Paisagem (Landscape)</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => setShowPrintPreview(false)}
                  className="px-6 py-2.5 bg-slate-50 text-slate-500 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-100 transition-all active:scale-95"
                >
                  Fechar
                </button>
                <button 
                  onClick={confirmPrint}
                  className="px-8 py-2.5 bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-xl shadow-emerald-200 active:scale-95 flex items-center gap-2"
                >
                  <Printer size={18} />
                  Confirmar Impressão
                </button>
              </div>
            </div>

            {/* Preview Content */}
            <div className="flex-1 overflow-auto bg-slate-100/50 p-12 flex flex-col items-center gap-10 scrollbar-thin scrollbar-thumb-slate-300">
              <div 
                id="attendance-print-container"
                className="shrink-0 scale-[0.7] xl:scale-[0.75] 2xl:scale-95 origin-top transform"
              >
                <style>{`
                  @media print {
                    @page { size: A4 landscape; margin: 0; }
                    body { visibility: hidden !important; }
                    #attendance-print-container, #attendance-print-container * { visibility: visible !important; }
                    #attendance-print-container { 
                      position: absolute !important; 
                      left: 0 !important; 
                      top: 0 !important; 
                      width: 297mm !important; 
                      height: auto !important;
                      margin: 0 !important;
                      padding: 0 !important;
                    }
                    .print-page {
                      width: 297mm !important;
                      height: 210mm !important;
                      page-break-after: always !important;
                      break-after: page !important;
                      position: relative !important;
                      display: flex !important;
                      flex-direction: column !important;
                      margin: 0 !important;
                      padding: 10mm !important;
                      border: none !important;
                    }
                    .shadow-xl, .shadow-2xl, .shadow-[0_30px_60px_rgba(0,0,0,0.12)] {
                      box-shadow: none !important;
                    }
                  }
                `}</style>
                {(() => {
                  const itemsPerPage = 18;
                  const totalStudents = students.length;
                  const studentChunks = [];
                  for (let i = 0; i < Math.max(totalStudents, 1); i += itemsPerPage) {
                    studentChunks.push(students.slice(i, i + itemsPerPage));
                  }
                  const totalPages = studentChunks.length;

                  return studentChunks.map((chunk, pageIdx) => (
                    <div 
                      key={pageIdx}
                      className="print-page bg-white shadow-[0_30px_60px_rgba(0,0,0,0.12)] mb-12 last:mb-0 flex flex-col font-sans text-black pointer-events-none select-none p-[10mm] border border-slate-100 print:shadow-none print:border-none print:p-0 print:mb-0"
                      style={{ width: '297mm', height: '210mm', minWidth: '297mm', minHeight: '210mm' }}
                    >
                      {/* OFFICIAL SYSTEM HEADER - OPTIMIZED SIZE */}
                      <div className="flex items-center gap-6 mb-2 pb-1 border-b-2 border-black">
                        <div className="flex-shrink-0 w-16 h-16 flex items-center justify-center">
                          {institution?.logo || institution?.logo_url ? (
                            <img 
                              src={institution.logo || institution.logo_url} 
                              className="w-full h-full object-contain max-h-16" 
                              referrerPolicy="no-referrer" 
                              alt="Logo" 
                            />
                          ) : (
                            <div className="w-full h-full border-2 border-slate-200 border-dashed flex flex-col items-center justify-center text-[6pt] text-slate-300 font-black uppercase">
                              <span className="leading-none">SEM</span>
                              <span className="leading-none">LOGO</span>
                            </div>
                          )}
                        </div>
                        <div className="flex-1 flex flex-col">
                          <p className="text-[8pt] font-semibold tracking-[0.2em] text-slate-800 leading-tight uppercase">DIOCESE DE GUARULHOS</p>
                          <h1 className="text-[15pt] font-black uppercase tracking-tight text-black leading-tight my-0.5">
                            {institution?.name || 'ESCOLA DIOCESANA DE MINISTÉRIOS'}
                          </h1>
                          <p className="text-[10pt] font-bold text-slate-600 tracking-wide uppercase">
                            {institution?.subtitle || 'PE. JOSÉ FERNANDO DE BRITO'}
                          </p>
                        </div>
                        <div className="text-right flex flex-col justify-center border-l-2 border-black/5 pl-6 h-12">
                          <p className="text-[6pt] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Página</p>
                          <p className="text-[14pt] font-black text-black leading-none">{pageIdx + 1}<span className="text-[9pt] text-slate-300 mx-1">/</span>{totalPages}</p>
                        </div>
                      </div>

                      {/* COMPACT UNIFIED INFORMATION BOX */}
                      <div className="bg-slate-50/40 border-y border-slate-200 p-1.5 mb-1.5 flex flex-col gap-1">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="w-1 h-4 bg-black rounded-full"></div>
                            <h2 className="text-[10pt] font-black uppercase tracking-[0.05em] text-black">Lista de Presença Mensal</h2>
                          </div>
                          <div className="text-right text-[7.5pt] font-bold text-slate-400 uppercase tracking-wider">
                            Mês Referência: <span className="text-slate-900 font-black">{['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'][selectedMonth]} / {selectedYear}</span>
                          </div>
                        </div>

                        <div className="grid grid-cols-4 gap-4 items-end pt-1 border-t border-slate-100">
                          <div className="col-span-1 space-y-0">
                            <p className="text-[6.5pt] font-black text-slate-400 uppercase tracking-widest">Turma / Código</p>
                            <p className="text-[9pt] font-black text-black uppercase truncate">
                              {currentClass?.name || 'N/A'} <span className="text-slate-400 font-bold">({currentClass?.code || '---'})</span>
                            </p>
                          </div>
                          <div className="col-span-1 space-y-0">
                            <p className="text-[6.5pt] font-black text-slate-400 uppercase tracking-widest">Sala / Local</p>
                            <p className="text-[9pt] font-black text-black uppercase">{currentClass?.room || '002'}</p>
                          </div>
                          <div className="col-span-1 space-y-0">
                            <p className="text-[6.5pt] font-black text-slate-400 uppercase tracking-widest">Disciplina</p>
                            <p className="text-[9pt] font-black text-black uppercase truncate">{currentSubject?.name || 'Todas as Categorias'}</p>
                          </div>
                          <div className="col-span-1 text-right">
                            <p className="text-[6.5pt] font-black text-slate-400 uppercase tracking-widest">Total de Alunos</p>
                            <p className="text-[16pt] font-black text-black leading-none">{students.length}</p>
                          </div>
                        </div>
                      </div>

                      {/* MAIN ATTENDANCE TABLE - REFINED STYLING */}
                      <div className="w-full flex-1 overflow-hidden">
                        <table className="w-full border-collapse table-fixed text-black border-slate-300 border">
                          <colgroup>
                            <col className="w-[3.5%]" />
                            <col className="w-[10%]" />
                            <col className="w-[34%]" />
                            {monthlyClassDays.map((_, i) => (
                              <col key={i} />
                            ))}
                          </colgroup>
                          <thead>
                            <tr className="bg-gray-200 text-black h-8">
                              <th className="px-1 text-center font-bold text-[9pt] uppercase border border-gray-400">Nº</th>
                              <th className="px-3 text-left font-bold text-[9pt] uppercase border border-gray-400 tracking-tighter">Matrícula</th>
                              <th className="px-4 text-left font-bold text-[10pt] uppercase border border-gray-400">Nome Completo do Aluno</th>
                               {monthlyClassDays.map((day, i) => (
                                 <th key={i} className="border border-gray-400 text-center p-0.5 align-middle">
                                   <div className="flex flex-col items-center justify-center leading-none">
                                     <div className="flex items-center gap-0.5 whitespace-nowrap">
                                       <span className="text-[9pt] font-black">{day ? day.dayNumber.toString().padStart(2, '0') : '--'}</span>
                                       <span className="text-[7pt] font-black uppercase text-gray-500">
                                         /{day ? new Date(day.dbValue + 'T12:00:00').toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '').toUpperCase() : '--'}
                                       </span>
                                     </div>
                                     <span className={cn(
                                       "text-[5.5pt] font-bold uppercase mt-0.5",
                                       day?.isCancelled ? "text-red-600" : day?.isExcused ? "text-gray-500" : "text-gray-600"
                                     )}>
                                       {day?.isCancelled ? 'Cancelada' : day?.isExcused ? 'Abonada' : `Aula ${day?.lessonNumber ? `Nº ${day.lessonNumber}` : '--'}`}
                                     </span>
                                   </div>
                                 </th>
                               ))}
                            </tr>
                          </thead>
                          <tbody>
                            {chunk.map((student, idx) => {
                              const overallIndex = pageIdx * itemsPerPage + idx;
                              return (
                                <tr key={student.id} className={cn("h-[7mm] border-b border-slate-200", idx % 2 === 0 ? "bg-white" : "bg-gray-50/20")}>
                                  <td className="px-1 text-center text-[9pt] font-bold border-x border-slate-200 text-gray-400">{overallIndex + 1}</td>
                                  <td className="px-3 text-left text-[10pt] font-mono font-black border-x border-slate-200 text-black tracking-tighter">{student.registration_number}</td>
                                  <td className="px-4 text-left text-[10.5pt] font-black uppercase border-x border-slate-200 truncate text-black tracking-tight">{student.name}</td>
                                  {monthlyClassDays.map((day, i) => (
                                    <td key={i} className={cn("border-x border-slate-200 p-0 text-center text-[12.5pt] font-black", day?.isCancelled && "bg-gray-50")}>
                                      {(() => {
                                        if (day?.isCancelled) return <span className="text-gray-300 text-[8pt] font-black rotate-[-45deg] inline-block opacity-40">CANCELADA</span>;
                                        const status = day ? (activeTab === 'monthly' ? monthlyAttendance[student.id]?.[day.dbValue] : (day.dbValue === parseDateToDB(selectedDate) ? attendance[student.id]?.status : null)) : null;
                                        return status === 'P' ? '●' : status === 'F' ? 'F' : status === 'J' ? 'J' : '';
                                      })()}
                                    </td>
                                  ))}
                                </tr>
                              );
                            })}
                            {/* Fill empty rows for consistency if last page is short */}
                            {chunk.length < itemsPerPage && pageIdx === totalPages - 1 && Array.from({ length: itemsPerPage - chunk.length }).map((_, i) => (
                              <tr key={`empty-${i}`} className="h-[7mm] border-b border-slate-50 opacity-20">
                                <td className="px-1 text-center text-[8pt] border-x border-slate-50"></td>
                                <td className="px-3 border-x border-slate-50"></td>
                                <td className="px-4 border-x border-slate-50"></td>
                                {monthlyClassDays.map((_, i) => (
                                  <td key={i} className="border-x border-slate-50"></td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      <div className="mt-auto pt-2">
                        <div className="border-t border-black/20 pt-2 flex justify-between items-center text-[7.5pt] font-bold text-slate-400 uppercase tracking-widest leading-none">
                          <p>{institution?.address || 'AV. VENUS, 195 - ITAPECICA - GUARULHOS'}</p>
                          <div className="flex items-center gap-6">
                            <p>Emissão: <span className="text-slate-900 font-bold">{new Date().toLocaleDateString('pt-BR')}</span></p>
                            <p className="text-slate-900 font-black">Página {pageIdx + 1}/{totalPages}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  ));
                })()}
              </div>
            </div>

          </div>
        </div>
      )}
    </>
  );
}
