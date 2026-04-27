import React, { useState, useEffect } from 'react';
import { 
  FileSpreadsheet, 
  Search, 
  ChevronRight,
  Filter,
  Check,
  X,
  Info,
  Clock,
  BookOpen,
  School,
  Save,
  Loader2,
  Trophy,
  AlertTriangle
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
  setDoc,
  limit
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

interface GradeRecord {
  id: string;
  student_id: string;
  class_id: string;
  subject_id: string;
  period: string;
  value: number;
  status: 'Aprovado' | 'Reprovado' | 'Recuperação';
  observations?: string;
}

export function Grades() {
  const { userAuth, isAdmin, isDirector } = useAuth();
  const [classes, setClasses] = useState<Class[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [grades, setGrades] = useState<Record<string, GradeRecord>>({});
  
  const [selectedClass, setSelectedClass] = useState<string>('');
  const [selectedSubject, setSelectedSubject] = useState<string>('');
  const [selectedPeriod, setSelectedPeriod] = useState<string>('Bimestre 1');
  
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'err', message: string } | null>(null);

  const periods = ['Bimestre 1', 'Bimestre 2', 'Bimestre 3', 'Bimestre 4', 'Final'];

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
    if (!selectedClass || !selectedSubject || !selectedPeriod) return;
    
    const fetchStudentsAndGrades = async () => {
      setLoading(true);
      try {
        const qStudents = query(
          collection(db, 'students'), 
          where('class_id', '==', selectedClass),
          where('status', '==', 'Ativo')
        );
        const studentsSnap = await getDocs(qStudents);
        const studentsList = studentsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Student));
        setStudents(studentsList.sort((a, b) => a.name.localeCompare(b.name)));

        const qGrades = query(
          collection(db, 'grades'),
          where('class_id', '==', selectedClass),
          where('subject_id', '==', selectedSubject),
          where('period', '==', selectedPeriod)
        );
        const gradesSnap = await getDocs(qGrades);
        const gradesMap: Record<string, GradeRecord> = {};
        gradesSnap.docs.forEach(d => {
          const data = d.data() as GradeRecord;
          gradesMap[data.student_id] = { id: d.id, ...data };
        });
        setGrades(gradesMap);
      } catch (error) {
        console.error("Error fetching data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchStudentsAndGrades();
  }, [selectedClass, selectedSubject, selectedPeriod]);

  const handleGradeChange = (studentId: string, value: string) => {
    const numValue = parseFloat(value.replace(',', '.'));
    if (isNaN(numValue) && value !== '') return;

    let status: GradeRecord['status'] = 'Reprovado';
    if (numValue >= 7) status = 'Aprovado';
    else if (numValue >= 5) status = 'Recuperação';

    setGrades(prev => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        student_id: studentId,
        class_id: selectedClass,
        subject_id: selectedSubject,
        period: selectedPeriod,
        value: numValue,
        status: value === '' ? prev[studentId]?.status || 'Reprovado' : status
      }
    }));
  };

  const saveGrades = async () => {
    if (!userAuth) return;
    setSaving(true);
    try {
      const promises = (Object.entries(grades) as [string, GradeRecord][]).map(async ([studentId, record]) => {
        if (record.value === undefined || isNaN(record.value)) return;
        
        const docId = record.id || `${selectedClass}_${selectedSubject}_${selectedPeriod}_${studentId}`;
        const docRef = doc(db, 'grades', docId);
        
        const data = {
          ...record,
          user_id: userAuth.uid,
          updated_at: serverTimestamp(),
          created_at: record.id ? undefined : serverTimestamp()
        };
        
        await setDoc(docRef, data, { merge: true });
      });

      await Promise.all(promises);
      setNotification({ type: 'success', message: 'Notas salvas com sucesso!' });
      setTimeout(() => setNotification(null), 3000);
    } catch (error) {
      console.error("Error saving grades:", error);
      setNotification({ type: 'err', message: 'Erro ao salvar notas.' });
    } finally {
      setSaving(false);
    }
  };

  const getStatusColor = (status: GradeRecord['status']) => {
    switch (status) {
      case 'Aprovado': return 'bg-emerald-50 text-emerald-600 border-emerald-100';
      case 'Recuperação': return 'bg-amber-50 text-amber-600 border-amber-100';
      case 'Reprovado': return 'bg-red-50 text-red-600 border-red-100';
      default: return 'bg-slate-50 text-slate-400 border-slate-100';
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-800 flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-700 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-200">
              <FileSpreadsheet size={20} />
            </div>
            Apontamento de Notas
          </h2>
          <p className="text-sm font-bold text-slate-400 mt-1 uppercase tracking-widest pl-13">Registro de Desempenho Acadêmico</p>
        </div>

        {students.length > 0 && (
          <button 
            disabled={saving}
            onClick={saveGrades}
            className="flex items-center gap-2 px-8 py-4 bg-blue-700 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-800 shadow-xl shadow-blue-200 transition-all active:scale-95 disabled:opacity-50"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            Salvar Notas
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
                className="w-full pl-12 pr-4 py-3 bg-slate-50 border-none rounded-2xl text-sm font-bold focus:ring-2 focus:ring-blue-500 appearance-none"
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
                className="w-full pl-12 pr-4 py-3 bg-slate-50 border-none rounded-2xl text-sm font-bold focus:ring-2 focus:ring-blue-500 appearance-none"
              >
                <option value="">Selecione uma disciplina...</option>
                {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Período/Avaliação</label>
            <div className="relative">
              <Clock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <select
                value={selectedPeriod}
                onChange={e => setSelectedPeriod(e.target.value)}
                className="w-full pl-12 pr-4 py-3 bg-slate-50 border-none rounded-2xl text-sm font-bold focus:ring-2 focus:ring-blue-500 appearance-none"
              >
                {periods.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
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
            <div className="w-12 h-12 border-4 border-blue-600/20 border-t-blue-600 rounded-full animate-spin" />
            <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Buscando pautas...</p>
          </div>
        ) : selectedClass && selectedSubject ? (
          <div className="space-y-6">
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex items-center gap-4">
              <Info size={16} className="text-blue-500 shrink-0" />
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest leading-relaxed">
                As notas variam de 0 a 10. <span className="text-emerald-600">7.0+ (Aprovado)</span> | <span className="text-amber-600">5.0-6.9 (Recuperação)</span> | <span className="text-red-600">Sub 5.0 (Reprovado)</span>
              </p>
            </div>

            <div className="grid grid-cols-1 gap-2">
              {students.length > 0 ? (
                students.map((student, idx) => (
                  <div key={student.id} className={cn(
                    "flex flex-col md:flex-row md:items-center justify-between p-6 rounded-[2rem] transition-all border border-transparent hover:bg-slate-50/50 hover:border-slate-100",
                    idx % 2 === 0 ? "bg-white" : "bg-slate-50/30"
                  )}>
                    <div className="flex items-center gap-4 mb-4 md:mb-0">
                      <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center text-sm font-black">
                        {idx + 1}
                      </div>
                      <div>
                        <p className="text-sm font-black text-slate-900 leading-tight uppercase tracking-tight">{student.name}</p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">RA: {student.registration_number}</p>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row items-center gap-6">
                      <div className="flex items-center gap-4 w-full sm:w-auto">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest sm:hidden">Nota:</label>
                        <div className="relative w-full sm:w-32">
                          <input
                            type="text"
                            placeholder="0,00"
                            value={grades[student.id]?.value?.toString().replace('.', ',') || ''}
                            onChange={e => handleGradeChange(student.id, e.target.value)}
                            className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-center font-black text-slate-700 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                        </div>
                      </div>

                      <div className={cn(
                        "w-full sm:w-32 px-4 py-3 rounded-xl border text-[9px] font-black uppercase tracking-widest text-center transition-all",
                        grades[student.id] ? getStatusColor(grades[student.id].status) : "bg-slate-50 text-slate-300 border-slate-100"
                      )}>
                        {grades[student.id]?.status || 'N/A'}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-20 text-center space-y-4">
                  <div className="w-16 h-16 bg-slate-50 text-slate-300 rounded-2xl flex items-center justify-center mx-auto">
                    <AlertTriangle size={32} />
                  </div>
                  <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Lista de alunos vazia.</p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="py-24 text-center space-y-6">
            <div className="w-24 h-24 bg-slate-50 text-slate-300 rounded-[2.5rem] flex items-center justify-center mx-auto">
              <Trophy size={48} />
            </div>
            <div>
              <p className="text-lg font-black text-slate-400 tracking-tight">Gestão de Aproveitamento</p>
              <p className="text-sm font-bold text-slate-300">Selecione os parâmetros acima para lançar os resultados.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
