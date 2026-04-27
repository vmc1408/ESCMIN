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
  Clock,
  BookOpen,
  School,
  Save,
  Loader2
} from 'lucide-react';
import { cn } from '../lib/utils';
import { db } from '../lib/firebase';
import { 
  collection, 
  query, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  serverTimestamp,
  orderBy,
  where,
  getDocs,
  setDoc
} from 'firebase/firestore';
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
}

interface Subject {
  id: string;
  name: string;
}

interface AttendanceRecord {
  id: string;
  student_id: string;
  class_id: string;
  subject_id: string;
  date: string;
  status: 'P' | 'F' | 'J';
  observations?: string;
}

export function Attendance() {
  const { userAuth, isAdmin, isDirector } = useAuth();
  const [classes, setClasses] = useState<Class[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [attendance, setAttendance] = useState<Record<string, AttendanceRecord>>({});
  
  const [selectedClass, setSelectedClass] = useState<string>('');
  const [selectedSubject, setSelectedSubject] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'err', message: string } | null>(null);

  useEffect(() => {
    const unsubscribeClasses = onSnapshot(query(collection(db, 'classes'), where('status', '==', 'Ativo')), (snap) => {
      setClasses(snap.docs.map(d => ({ id: d.id, ...d.data() } as Class)));
    });
    const unsubscribeSubjects = onSnapshot(query(collection(db, 'subjects'), where('status', '==', 'Ativo')), (snap) => {
      setSubjects(snap.docs.map(d => ({ id: d.id, ...d.data() } as Subject)));
    });
    return () => {
      unsubscribeClasses();
      unsubscribeSubjects();
    };
  }, []);

  useEffect(() => {
    if (!selectedClass || !selectedSubject || !selectedDate) return;
    
    const fetchStudentsAndAttendance = async () => {
      setLoading(true);
      try {
        // Fetch students of this class
        const qStudents = query(
          collection(db, 'students'), 
          where('class_id', '==', selectedClass),
          where('status', '==', 'Ativo')
        );
        const studentsSnap = await getDocs(qStudents);
        const studentsList = studentsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Student));
        setStudents(studentsList.sort((a, b) => a.name.localeCompare(b.name)));

        // Fetch existing attendance for this day/class/subject
        const qAttendance = query(
          collection(db, 'attendances'),
          where('class_id', '==', selectedClass),
          where('subject_id', '==', selectedSubject),
          where('date', '==', selectedDate)
        );
        const attendanceSnap = await getDocs(qAttendance);
        const attendanceMap: Record<string, AttendanceRecord> = {};
        attendanceSnap.docs.forEach(d => {
          const data = d.data() as AttendanceRecord;
          attendanceMap[data.student_id] = { id: d.id, ...data };
        });
        setAttendance(attendanceMap);
      } catch (error) {
        console.error("Error fetching data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchStudentsAndAttendance();
  }, [selectedClass, selectedSubject, selectedDate]);

  const handleStatusChange = (studentId: string, status: 'P' | 'F' | 'J') => {
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

  const saveAttendance = async () => {
    if (!userAuth) return;
    setSaving(true);
    try {
      const promises = (Object.entries(attendance) as [string, AttendanceRecord][]).map(async ([studentId, record]) => {
        const docId = record.id || `${selectedClass}_${selectedSubject}_${selectedDate}_${studentId}`;
        const docRef = doc(db, 'attendances', docId);
        
        const data = {
          ...record,
          user_id: userAuth.uid,
          updated_at: serverTimestamp(),
          created_at: record.id ? undefined : serverTimestamp()
        };
        
        await setDoc(docRef, data, { merge: true });
      });

      await Promise.all(promises);
      setNotification({ type: 'success', message: 'Presença salva com sucesso!' });
      setTimeout(() => setNotification(null), 3000);
    } catch (error) {
      console.error("Error saving attendance:", error);
      setNotification({ type: 'err', message: 'Erro ao salvar presença.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-800 flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-emerald-200">
              <ClipboardCheck size={20} />
            </div>
            Controle de Presença
          </h2>
          <p className="text-sm font-bold text-slate-400 mt-1 uppercase tracking-widest pl-13">Frequência Escolar Diária</p>
        </div>

        {students.length > 0 && (
          <button 
            disabled={saving}
            onClick={saveAttendance}
            className="flex items-center gap-2 px-8 py-4 bg-emerald-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 shadow-xl shadow-emerald-200 transition-all active:scale-95 disabled:opacity-50"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            Salvar Chamada
          </button>
        )}
      </div>

      <div className="bg-white p-6 md:p-8 rounded-[2.5rem] border border-slate-100 shadow-sm space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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
                {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Data da Aula</label>
            <div className="relative">
              <CalendarIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                type="date"
                value={selectedDate}
                onChange={e => setSelectedDate(e.target.value)}
                className="w-full pl-12 pr-4 py-3 bg-slate-50 border-none rounded-2xl text-sm font-bold focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>
        </div>

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
            <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Carregando lista de alunos...</p>
          </div>
        ) : selectedClass && selectedSubject ? (
          <div className="space-y-6">
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
        ) : (
          <div className="py-24 text-center space-y-6">
            <div className="w-20 h-20 bg-slate-50 text-slate-300 rounded-[2rem] flex items-center justify-center mx-auto">
              <ClipboardCheck size={40} />
            </div>
            <div>
              <p className="text-lg font-black text-slate-400">Pronto para a chamada?</p>
              <p className="text-sm font-bold text-slate-300">Selecione a turma, disciplina e data para iniciar o registro.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
