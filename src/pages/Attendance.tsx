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
  ChevronDown,
  Clock,
  BookOpen,
  School,
  Save,
  Loader2
} from 'lucide-react';
import { cn, maskDate, formatDateForDisplay, parseDateToDB } from '../lib/utils';
import { fetchAll, saveData, deleteData, fetchQuery } from '../lib/database';
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
  subject_ids?: string[];
  days_of_week?: string[];
}

interface Subject {
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
  const [activeTab, setActiveTab] = useState<'marking' | 'summary'>('marking');
  const [classes, setClasses] = useState<Class[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [attendance, setAttendance] = useState<Record<string, AttendanceRecord>>({});
  const [academicParams, setAcademicParams] = useState<any>(null);
  const [calendarDays, setCalendarDays] = useState<number>(0);
  const [studentAbsences, setStudentAbsences] = useState<Record<string, number>>({});
  
  const [institution, setInstitution] = useState<any>(null);
  const [selectedClass, setSelectedClass] = useState<string>('');
  const [selectedSubject, setSelectedSubject] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<string>(formatDateForDisplay(new Date().toISOString().split('T')[0]));
  const [classEvents, setClassEvents] = useState<any[]>([]);
  
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'err', message: string } | null>(null);

  const fetchData = React.useCallback(async () => {
    try {
      const [classesData, subjectsData, paramsData, instData] = await Promise.all([
        fetchQuery('classes', [{ field: 'status', operator: '==', value: 'Ativo' }]),
        fetchQuery('subjects', [{ field: 'status', operator: '==', value: 'Ativo' }]),
        fetchAll('academic_parameters', '*', ''),
        fetchAll('institution_settings')
      ]);

      if (instData && instData.length > 0) {
        setInstitution(instData[0]);
      }

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
          const match = s.match(/\d{4}/);
          const yr = match ? parseInt(match[0]) : 0;
          const name = s.replace(/\d{4}/, '').trim().toLowerCase();
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
      // Fetch both global class days and class-specific class days
      const [globalEvents, classSpecificEvents] = await Promise.all([
        fetchQuery('calendar_events', [
          { field: 'type', operator: '==', value: 'class_day' },
          { field: 'class_id', operator: 'is', value: null }
        ]),
        fetchQuery('calendar_events', [
          { field: 'type', operator: '==', value: 'class_day' },
          { field: 'class_id', operator: '==', value: selectedClass }
        ])
      ]);
      
      setClassEvents([...(globalEvents || []), ...(classSpecificEvents || [])]);
    } catch (error) {
      console.error('Error fetching class events:', error);
    }
  }, [selectedClass]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    fetchClassEvents();
  }, [fetchClassEvents]);

  const fetchAbsenceSummary = async () => {
    if (!selectedClass) return;
    setLoading(true);
    try {
      // 1. Fetch academic calendar to count school days
      const events = await fetchQuery('calendar_events', [{ field: 'type', operator: '==', value: 'class_day' }]);
      // Filter for this class specifically if needed, but for total school days we might use all class_days
      const classSpecific = events?.filter(e => !e.class_id || e.class_id === selectedClass) || [];
      setCalendarDays(classSpecific.length);

      // 2. Fetch all students in class
      const studentList = await fetchQuery('students', [
        { field: 'class_id', operator: '==', value: selectedClass },
        { field: 'status', operator: '==', value: 'Ativo' }
      ]);
      setStudents((studentList || []).sort((a, b) => a.name.localeCompare(b.name)));

      // 3. Fetch all absence records for this class
      const allAttendances = await fetchQuery('attendances', [
        { field: 'class_id', operator: '==', value: selectedClass },
        { field: 'status', operator: '==', value: 'F' }
      ]);

      const counts: Record<string, number> = {};
      (allAttendances || []).forEach(record => {
        counts[record.student_id] = (counts[record.student_id] || 0) + 1;
      });
      setStudentAbsences(counts);
    } catch (error) {
      console.error('Error fetching summary:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'summary' && selectedClass) {
      fetchAbsenceSummary();
    }
  }, [activeTab, selectedClass]);

  const fetchStudentsAndAttendance = React.useCallback(async () => {
    if (!selectedClass) {
      setStudents([]);
      return;
    }
    
    setLoading(true);
    try {
      const [studentsList, attendanceList] = await Promise.all([
        fetchQuery('students', [
          { field: 'class_id', operator: '==', value: selectedClass },
          { field: 'status', operator: '==', value: 'Ativo' }
        ]),
        (selectedSubject && selectedDate) ? fetchQuery('attendances', [
          { field: 'class_id', operator: '==', value: selectedClass },
          { field: 'subject_id', operator: '==', value: selectedSubject },
          { field: 'date', operator: '==', value: parseDateToDB(selectedDate) }
        ]) : Promise.resolve([])
      ]);

      setStudents((studentsList || []).sort((a, b) => a.name.localeCompare(b.name)));

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

  const availableDates = React.useMemo(() => {
    // Determine the scheduled weekdays from the class data
    const classInfo = classes.find(c => c.id === selectedClass);
    const targetDays = classInfo?.days_of_week || [];
    const dayMap: Record<string, number> = {
      'Domingo': 0, 'Segunda': 1, 'Terça': 2, 'Quarta': 3, 'Quinta': 4, 'Sexta': 5, 'Sábado': 6
    };
    
    let targetDayIndices: number[] = targetDays.map(d => dayMap[d]).filter(d => d !== undefined);

    // Fallback to name matching with more flexibility
    if (targetDayIndices.length === 0 && classInfo?.name) {
      const lowerName = classInfo.name.toLowerCase();
      
      const dayMatches = [
        { keywords: ['segunda', '2ª', '2a', 'seg'], index: 1 },
        { keywords: ['terça', '3ª', '3a', 'ter'], index: 2 },
        { keywords: ['quarta', '4ª', '4a', 'qua'], index: 3 },
        { keywords: ['quinta', '5ª', '5a', 'qui'], index: 4 },
        { keywords: ['sexta', '6ª', '6a', 'sex'], index: 5 },
        { keywords: ['sábado', 'sab', 'sáb'], index: 6 },
        { keywords: ['domingo', 'dom'], index: 0 },
      ];

      dayMatches.forEach(match => {
        if (match.keywords.some(k => lowerName.includes(k))) {
          targetDayIndices.push(match.index);
        }
      });
    }

    // If still empty, check if any class-specific event already exists to deduce the day
    if (targetDayIndices.length === 0) {
      const classSpecific = classEvents.filter(e => e.class_id === selectedClass);
      if (classSpecific.length > 0) {
        const days = new Set(classSpecific.map(e => new Date(e.start_date + 'T12:00:00').getDay()));
        targetDayIndices = Array.from(days);
      }
    }

    // 1. Filter for unique dates and respect weekday
    const uniqueMap = new Map();
    
    // Sort classEvents so that class-specific events come later to override global ones in uniqueMap if needed
    // However, since we check !has, we should put them first if we want to prefer them.
    const sortedEvents = [...classEvents].sort((a, b) => {
      if (a.class_id && !b.class_id) return -1;
      if (!a.class_id && b.class_id) return 1;
      return 0;
    });

    sortedEvents.forEach(event => {
      const dateKey = event.start_date;
      if (!uniqueMap.has(dateKey)) {
        // If it's a global class day (no class_id), check if it matches target days
        if (!event.class_id && targetDayIndices.length > 0) {
          const date = new Date(dateKey + 'T12:00:00');
          if (!targetDayIndices.includes(date.getDay())) return;
        }
        uniqueMap.set(dateKey, event);
      }
    });

    // 2. Sort chronologically (Jan to Dec)
    return Array.from(uniqueMap.values())
      .sort((a, b) => a.start_date.localeCompare(b.start_date))
      .map(event => {
        const date = new Date(event.start_date + 'T12:00:00');
        return {
          dbValue: event.start_date,
          displayValue: formatDateForDisplay(event.start_date),
          label: date.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })
        };
      });
  }, [classEvents, selectedClass, classes]);

  // Auto-select the next or current class day
  useEffect(() => {
    if (availableDates.length > 0 && selectedClass) {
      const today = new Date().toISOString().split('T')[0];
      
      // Try to find today's class or the first one in the future (Ascending order means first >= today is best)
      const bestDate = availableDates.find(d => d.dbValue >= today) || availableDates[availableDates.length - 1];
      
      if (bestDate) {
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
      
      for (const record of recordsToSave) {
        const studentId = record.student_id;
        const docId = record.id || `${selectedClass}_${selectedSubject}_${dbDate}_${studentId}`;
        
        const data = {
          ...record,
          id: docId,
          date: dbDate,
          user_id: userAuth.uid,
          updated_at: new Date().toISOString()
        };
        
        await saveData('attendances', docId, data);
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

  const handlePrint = () => {
    window.print();
  };

  const currentClass = classes.find(c => c.id === selectedClass);
  const currentSubject = subjects.find(s => s.id === selectedSubject);

  return (
    <div className="max-w-[1920px] mx-auto space-y-6">
      {/* Styles for printing */}
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          body * {
            visibility: hidden;
          }
          #printable-area, #printable-area * {
            visibility: visible;
          }
          #printable-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            padding: 20px;
            visibility: visible !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}} />

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 no-print">
        <div>
          <h2 className="text-2xl font-black text-slate-800 flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-emerald-200">
              <ClipboardCheck size={20} />
            </div>
            Gestão de Frequência
          </h2>
          <p className="text-sm font-bold text-slate-400 mt-1 uppercase tracking-widest pl-13">Controle e Resumo de Assiduidade</p>
        </div>

        <div className="flex items-center gap-2">
          {selectedClass && (
            <button 
              onClick={handlePrint}
              className="flex items-center gap-2 px-4 py-2 bg-white text-slate-600 rounded-xl text-[10px] font-black uppercase tracking-widest border border-slate-100 hover:bg-slate-50 shadow-sm transition-all active:scale-95 no-print"
            >
              <Printer size={16} />
              Imprimir {activeTab === 'marking' ? 'Lista' : 'Resumo'}
            </button>
          )}

          <div className="flex bg-white p-1 rounded-xl border border-slate-100 shadow-sm">
          <button 
            onClick={() => setActiveTab('marking')}
            className={cn(
              "px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all",
              activeTab === 'marking' ? "bg-emerald-600 text-white" : "text-slate-400 hover:text-slate-600"
            )}
          >
            Lançar Chamada
          </button>
          <button 
            onClick={() => setActiveTab('summary')}
            className={cn(
              "px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all",
              activeTab === 'summary' ? "bg-amber-600 text-white" : "text-slate-400 hover:text-slate-600"
            )}
          >
            Resumo de Faltas
          </button>
        </div>

        {activeTab === 'marking' && students.length > 0 && (
          <button 
            disabled={saving || !selectedSubject}
            onClick={saveAttendance}
            className="flex items-center gap-2 px-8 py-4 bg-emerald-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 shadow-xl shadow-emerald-200 transition-all active:scale-95 disabled:opacity-50 disabled:bg-slate-300 disabled:shadow-none"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            Salvar Chamada
          </button>
        )}
      </div>

      <div className="bg-white p-4 md:p-6 rounded-[2.5rem] border border-slate-100 shadow-sm space-y-4">
        <div className={cn(
          "grid grid-cols-1 gap-4",
          activeTab === 'marking' ? "md:grid-cols-3" : "md:grid-cols-2"
        )}>
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Turma</label>
            <div className="relative">
              <School className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <select
                value={selectedClass}
                onChange={e => setSelectedClass(e.target.value)}
                className="w-full pl-12 pr-4 py-3 bg-slate-50 border-none rounded-2xl text-sm font-bold focus:ring-2 focus:ring-emerald-500 appearance-none"
              >
                <option value="">Selecione uma turma...</option>
                {classes.map(c => <option key={c.id} value={c.id}>{c.name} ({c.code})</option>)}
              </select>
            </div>
          </div>

          {activeTab === 'marking' && (
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Disciplina</label>
              <div className="relative">
                <BookOpen className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <select
                  value={selectedSubject}
                  onChange={e => setSelectedSubject(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 bg-slate-50 border-none rounded-2xl text-sm font-bold focus:ring-2 focus:ring-emerald-500 appearance-none"
                >
                  <option value="">Selecione uma disciplina...</option>
                  {filteredSubjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            </div>
          )}

          {activeTab === 'marking' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between pl-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Selecione a Data da Aula</label>
                {selectedClass && (
                  <div className={cn(
                    "flex items-center gap-1 px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-tighter",
                    availableDates.length > 0 ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"
                  )}>
                    {availableDates.length > 0 ? (
                      <>
                        <Check size={8} />
                        {availableDates.length} Dias Agendados
                      </>
                    ) : (
                      <>
                        <X size={8} />
                        Sem datas agendadas
                      </>
                    )}
                  </div>
                )}
              </div>
              <div className="relative">
                <CalendarIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <select
                  disabled={!selectedClass || availableDates.length === 0}
                  value={parseDateToDB(selectedDate)}
                  onChange={e => {
                    const dbDate = e.target.value;
                    setSelectedDate(formatDateForDisplay(dbDate));
                  }}
                  className={cn(
                    "w-full pl-12 pr-10 py-3 bg-slate-50 border-none rounded-2xl text-sm font-bold focus:ring-2 appearance-none transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed",
                    availableDates.length > 0 ? "focus:ring-emerald-500" : "ring-1 ring-red-200"
                  )}
                >
                  <option value="">Selecione um dia de aula...</option>
                  {availableDates.map(date => (
                    <option key={date.dbValue} value={date.dbValue}>
                      {date.label}
                    </option>
                  ))}
                </select>
                <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                  <ChevronDown size={16} />
                </div>
              </div>
            </div>
          )}
        </div>

        {selectedClass && availableDates.length === 0 && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="bg-red-50 border border-red-100 p-4 rounded-2xl flex items-center gap-3 text-red-700"
          >
            <Info size={18} />
            <p className="text-[10px] font-bold uppercase tracking-widest leading-relaxed">
              Erro: Esta turma não possui dias de aula configurados no <span className="font-black text-red-800">Calendário Acadêmico</span>.
              <br className="hidden sm:block" />
              Você precisa gerar os dias de aula no calendário antes de lançar a frequência.
            </p>
          </motion.div>
        )}

        {notification && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn(
              "p-4 rounded-2xl text-xs font-bold uppercase tracking-widest flex items-center gap-3",
              notification.type === 'success' ? "bg-emerald-50 text-emerald-600 border border-emerald-100" : "bg-red-50 text-red-600 border border-red-100"
            )}
          >
            {notification.type === 'success' ? <Check size={18} /> : <X size={18} />}
            {notification.message}
          </motion.div>
        )}

        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center gap-4">
            <div className="w-12 h-12 border-4 border-emerald-600/20 border-t-emerald-600 rounded-full animate-spin" />
            <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Aguarde...</p>
          </div>
        ) : activeTab === 'marking' && selectedClass ? (
          <div className="space-y-6">
            {!selectedSubject && (
              <div className="bg-amber-50 border border-amber-100 p-4 rounded-2xl flex items-center gap-3 text-amber-700">
                <Info size={18} />
                <p className="text-xs font-bold uppercase tracking-widest">Selecione a disciplina para habilitar o lançamento.</p>
              </div>
            )}
            {/* Rest of the marking UI ... */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-100">
              <div className="flex items-center gap-4">
                <div className="px-3 py-1 bg-white text-emerald-600 rounded-lg text-[10px] font-black uppercase tracking-tighter shadow-sm">
                  {students.length} Alunos na Turma
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleMarkAll('P')}
                  className="px-4 py-2 bg-emerald-100 text-emerald-700 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-200 transition-all"
                >
                  Marcar Todos Presentes
                </button>
                <button
                  onClick={() => handleMarkAll('F')}
                  className="px-4 py-2 bg-red-100 text-red-700 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-red-200 transition-all"
                >
                  Marcar Todos Faltaram
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-1">
              {students.length > 0 ? (
                students.map((student, idx) => (
                  <div key={student.id} className={cn(
                    "flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-2xl transition-all border border-transparent hover:bg-slate-50",
                    idx % 2 === 0 ? "bg-white" : "bg-slate-50/30"
                  )}>
                    <div className="flex items-center gap-4 mb-3 sm:mb-0">
                      <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center text-xs font-black">
                        {idx + 1}
                      </div>
                      <div>
                        <p className="text-sm font-black text-slate-800 leading-tight uppercase">{student.name}</p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">RA: {student.registration_number}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleStatusChange(student.id, 'P')}
                        className={cn(
                          "flex-1 sm:w-24 flex items-center justify-center gap-2 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                          attendance[student.id]?.status === 'P' ? "bg-emerald-600 text-white shadow-lg shadow-emerald-200" : "bg-white border border-slate-200 text-slate-400 hover:border-emerald-200"
                        )}
                      >
                        <Check size={14} />
                        Presente
                      </button>
                      <button
                        onClick={() => handleStatusChange(student.id, 'F')}
                        className={cn(
                          "flex-1 sm:w-24 flex items-center justify-center gap-2 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                          attendance[student.id]?.status === 'F' ? "bg-red-600 text-white shadow-lg shadow-red-200" : "bg-white border border-slate-200 text-slate-400 hover:border-red-200"
                        )}
                      >
                        <X size={14} />
                        Faltou
                      </button>
                      <button
                        onClick={() => handleStatusChange(student.id, 'J')}
                        className={cn(
                          "flex-1 sm:w-24 flex items-center justify-center gap-2 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                          attendance[student.id]?.status === 'J' ? "bg-amber-600 text-white shadow-lg shadow-amber-200" : "bg-white border border-slate-200 text-slate-400 hover:border-amber-200"
                        )}
                      >
                        <Info size={14} />
                        Justific.
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-20 text-center space-y-4">
                  <div className="w-16 h-16 bg-slate-50 text-slate-300 rounded-2xl flex items-center justify-center mx-auto">
                    <Search size={32} />
                  </div>
                  <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Nenhum aluno vinculado a esta turma.</p>
                </div>
              )}
            </div>
          </div>
        ) : activeTab === 'summary' && selectedClass ? (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100 flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-white text-blue-600 flex items-center justify-center shadow-sm">
                  <CalendarIcon size={24} />
                </div>
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Dias Letivos</p>
                  <p className="text-2xl font-black text-slate-800">{calendarDays}</p>
                </div>
              </div>
              <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100 flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-white text-amber-600 flex items-center justify-center shadow-sm">
                  <Info size={24} />
                </div>
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Limite de Faltas</p>
                  <p className="text-2xl font-black text-slate-800">{academicParams?.absence_limit_percentage || 25}%</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2">
              {students.map((student, idx) => {
                const absences = studentAbsences[student.id] || 0;
                const limit = academicParams?.absence_limit_percentage || 25;
                const totalDays = calendarDays || 200; // Fallback to 200 if calendar empty
                const percentage = ((absences / totalDays) * 100).toFixed(1);
                const isOverLimit = parseFloat(percentage) > limit;

                return (
                  <div key={student.id} className="flex items-center justify-between p-5 bg-white border border-slate-100 rounded-[2rem]">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-slate-50 text-slate-400 flex items-center justify-center text-xs font-black">
                        {idx + 1}
                      </div>
                      <div>
                        <p className="text-sm font-black text-slate-800 uppercase leading-none">{student.name}</p>
                        <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-widest">RA: {student.registration_number}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-8">
                      <div className="text-right">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Faltas</p>
                        <p className="text-lg font-black text-slate-800 leading-none">{absences}</p>
                      </div>
                      
                      <div className="w-32">
                        <div className="flex justify-between items-end mb-1">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Assiduidade</p>
                          <span className={cn(
                            "text-[10px] font-black uppercase tracking-widest",
                            isOverLimit ? "text-red-500" : "text-emerald-500"
                          )}>
                            {percentage}%
                          </span>
                        </div>
                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div 
                            className={cn(
                              "h-full transition-all duration-500",
                              isOverLimit ? "bg-red-500" : "bg-emerald-500"
                            )}
                            style={{ width: `${Math.min(parseFloat(percentage), 100)}%` }}
                          />
                        </div>
                      </div>

                      <div className={cn(
                        "px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest w-24 text-center",
                        isOverLimit ? "bg-red-50 text-red-600 border border-red-100" : "bg-emerald-50 text-emerald-600 border border-emerald-100"
                      )}>
                        {isOverLimit ? 'Reprovado' : 'Regular'}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="py-24 text-center space-y-6">
            <div className="w-20 h-20 bg-slate-50 text-slate-300 rounded-[2rem] flex items-center justify-center mx-auto">
              <ClipboardCheck size={40} />
            </div>
            <div>
              <p className="text-lg font-black text-slate-400">Seleção Pendente</p>
              <p className="text-sm font-bold text-slate-300">Escolha uma turma para visualizar os dados.</p>
            </div>
          </div>
        )}
      </div>
      {/* Printable Area */}
      <div id="printable-area" className="hidden print:block text-slate-800">
        <div className="flex items-center justify-between border-b-2 border-slate-900 pb-4 mb-6">
          <div className="flex items-center gap-4">
            {institution?.logo && (
              <img src={institution.logo} alt="Logo" className="w-16 h-16 object-contain" />
            )}
            <div>
              <h1 className="text-xl font-black uppercase">{institution?.name || 'Escola Diocesana de Ministério'}</h1>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Controle de Frequência e Assiduidade</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm font-black uppercase">{new Date().toLocaleDateString('pt-BR')}</p>
            <p className="text-[10px] font-bold text-slate-500 uppercase">Página 1 de 1</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-8 mb-8 bg-slate-50 p-4 rounded-xl border border-slate-200">
          <div className="space-y-1">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none">Turma</p>
            <p className="text-sm font-black uppercase leading-tight">{currentClass?.name || 'N/A'} ({currentClass?.code || 'N/A'})</p>
          </div>
          {activeTab === 'marking' ? (
            <>
              <div className="space-y-1">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none">Disciplina</p>
                <p className="text-sm font-black uppercase leading-tight">{currentSubject?.name || 'N/A'}</p>
              </div>
              <div className="space-y-1">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none">Data da Aula</p>
                <p className="text-sm font-black uppercase leading-tight">{selectedDate || 'N/A'}</p>
              </div>
            </>
          ) : (
            <div className="space-y-1">
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none">Tipo de Relatório</p>
              <p className="text-sm font-black uppercase leading-tight">Resumo de Faltas e Assiduidade</p>
            </div>
          )}
        </div>

        {activeTab === 'marking' ? (
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-slate-900 text-white">
                <th className="px-4 py-2 text-left text-[10px] font-black uppercase border border-slate-900 w-12">Nº</th>
                <th className="px-4 py-2 text-left text-[10px] font-black uppercase border border-slate-900">Nome do Aluno</th>
                <th className="px-4 py-2 text-left text-[10px] font-black uppercase border border-slate-900 w-32">RA</th>
                <th className="px-4 py-2 text-center text-[10px] font-black uppercase border border-slate-900 w-24">Presença</th>
                <th className="px-4 py-2 text-center text-[10px] font-black uppercase border border-slate-900 w-48">Assinatura</th>
              </tr>
            </thead>
            <tbody>
              {students.map((student, idx) => {
                const status = attendance[student.id]?.status;
                const statusLabel = status === 'P' ? 'PRESENTE' : status === 'F' ? 'FALTOU' : status === 'J' ? 'JUSTIFIC.' : '';
                
                return (
                  <tr key={student.id}>
                    <td className="px-4 py-3 text-sm font-bold border border-slate-300 text-center">{idx + 1}</td>
                    <td className="px-4 py-3 text-sm font-black uppercase border border-slate-300">{student.name}</td>
                    <td className="px-4 py-3 text-xs font-bold border border-slate-300">{student.registration_number}</td>
                    <td className="px-4 py-3 text-xs font-black border border-slate-300 text-center uppercase">
                      {statusLabel || '__________'}
                    </td>
                    <td className="px-4 py-3 border border-slate-300">
                      <div className="w-full border-b border-slate-400 mt-4"></div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-slate-900 text-white">
                <th className="px-4 py-2 text-left text-[10px] font-black uppercase border border-slate-900 w-12">Nº</th>
                <th className="px-4 py-2 text-left text-[10px] font-black uppercase border border-slate-900">Nome do Aluno</th>
                <th className="px-4 py-2 text-center text-[10px] font-black uppercase border border-slate-900 w-24">Faltas</th>
                <th className="px-4 py-2 text-center text-[10px] font-black uppercase border border-slate-900 w-32">Assiduidade</th>
                <th className="px-4 py-2 text-center text-[10px] font-black uppercase border border-slate-900 w-48">Situação</th>
              </tr>
            </thead>
            <tbody>
              {students.map((student, idx) => {
                const absences = studentAbsences[student.id] || 0;
                const limit = academicParams?.absence_limit_percentage || 25;
                const totalDays = calendarDays || 200;
                const percentage = ((absences / totalDays) * 100).toFixed(1);
                const isOverLimit = parseFloat(percentage) > limit;

                return (
                  <tr key={student.id}>
                    <td className="px-4 py-3 text-sm font-bold border border-slate-300 text-center">{idx + 1}</td>
                    <td className="px-4 py-3 text-sm font-black uppercase border border-slate-300">{student.name}</td>
                    <td className="px-4 py-3 text-sm font-bold border border-slate-300 text-center">{absences}</td>
                    <td className="px-4 py-3 text-sm font-black border border-slate-300 text-center">{percentage}%</td>
                    <td className={cn(
                      "px-4 py-3 text-[10px] font-black uppercase border border-slate-300 text-center",
                      isOverLimit ? "text-red-600 bg-red-50" : "text-emerald-600 bg-emerald-50"
                    )}>
                      {isOverLimit ? 'Reprovado por Faltas' : 'Regular / Aprovado'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        <div className="mt-12 grid grid-cols-2 gap-12 pt-8">
          <div className="text-center">
            <div className="border-t-2 border-slate-900 w-full mb-2"></div>
            <p className="text-[10px] font-black uppercase tracking-widest">Assinatura do Coordenador</p>
          </div>
          <div className="text-center">
            <div className="border-t-2 border-slate-900 w-full mb-2"></div>
            <p className="text-[10px] font-black uppercase tracking-widest">Assinatura do Secretário</p>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
