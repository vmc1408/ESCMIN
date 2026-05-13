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
  AlertTriangle,
  RefreshCw
} from 'lucide-react';
import { Student, Class, Subject, AcademicParameters, Assessment } from '../types';
import { cn } from '../lib/utils';
import { fetchAll, saveData, deleteData, fetchQuery } from '../lib/database';
import { useAuth } from '../contexts/AuthContext';
import { motion, AnimatePresence } from 'motion/react';

interface GradeRecord {
  id: string;
  student_id: string;
  class_id: string;
  subject_id: string;
  period: string;
  value: number | string;
  status: 'Aprovado' | 'Reprovado' | 'Recuperação';
  observations?: string;
}

export function Grades() {
  const { userAuth, isAdmin, isDirector } = useAuth();
  const [classes, setClasses] = useState<Class[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [grades, setGrades] = useState<Record<string, GradeRecord>>({});
  const [academicParams, setAcademicParams] = useState<AcademicParameters>({
    approval_grade: 7.0,
    recovery_grade: 5.0,
    failure_grade: 4.9,
    absence_limit_percentage: 25,
    updated_at: ''
  });
  
  const [selectedClass, setSelectedClass] = useState<string>('');
  const [selectedSubject, setSelectedSubject] = useState<string>('');
  const [selectedPeriod, setSelectedPeriod] = useState<string>('Avaliação 1');

  const basePeriods = ['Avaliação 1', 'Avaliação 2', 'Avaliação 3', 'Avaliação 4', 'Resultado Final'];

  const availablePeriods = React.useMemo(() => {
    if (assessments.length === 0) return basePeriods;

    const assessmentTitles = assessments.map(a => a.title);
    const combined = Array.from(new Set([...basePeriods.slice(0, 4), ...assessmentTitles, 'Resultado Final']));
    return combined as string[];
  }, [assessments]);
  
  const [loading, setLoading] = useState(false);
  const [loadingAssessments, setLoadingAssessments] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'err', message: string } | null>(null);

  const periods = ['Avaliação 1', 'Avaliação 2', 'Avaliação 3', 'Avaliação 4', 'Resultado Final'];

  const fetchData = React.useCallback(async () => {
    const [params, classesData, subjectsData] = await Promise.all([
      fetchAll('academic_parameters'),
      fetchQuery('classes', [{ field: 'status', operator: '==', value: 'Ativo' }]),
      fetchQuery('subjects', [{ field: 'status', operator: '==', value: 'Ativo' }])
    ]);

    if (params && params.length > 0) {
      setAcademicParams(params[0] as AcademicParameters);
    }

    const normalizedClasses = (classesData || []).map((cls: any) => {
      let normalized = { ...cls };
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
      return normalized;
    });

    setClasses(normalizedClasses);
    setSubjects(subjectsData || []);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const fetchStudentsAndGrades = React.useCallback(async () => {
    if (!selectedClass || !selectedSubject || !selectedPeriod) return;
    
    setLoading(true);
    setLoadingAssessments(true);
    try {
      const [studentsList, gradesList, assessmentsList] = await Promise.all([
        fetchQuery('students', [
          { field: 'class_id', operator: '==', value: selectedClass },
          { field: 'status', operator: '==', value: 'Ativo' }
        ]),
        fetchQuery('grades', [
          { field: 'class_id', operator: '==', value: selectedClass },
          { field: 'subject_id', operator: '==', value: selectedSubject },
          { field: 'period', operator: '==', value: selectedPeriod }
        ]),
        fetchQuery('assessments', [
          { field: 'class_id', operator: '==', value: selectedClass },
          { field: 'subject_id', operator: '==', value: selectedSubject }
        ])
      ]);

      setStudents((studentsList || []).sort((a, b) => a.name.localeCompare(b.name)));
      setAssessments(assessmentsList as Assessment[] || []);

      const gradesMap: Record<string, GradeRecord> = {};
      (gradesList || []).forEach(data => {
        const record = data as GradeRecord;
        if (typeof record.value === 'number') {
          record.value = record.value.toString().replace('.', ',');
        }
        gradesMap[data.student_id] = record;
      });
      setGrades(gradesMap);
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
      setLoadingAssessments(false);
    }
  }, [selectedClass, selectedSubject, selectedPeriod]);

  useEffect(() => {
    fetchStudentsAndGrades();
    // Reset selected subject if it's not in the filtered list
    if (selectedClass && selectedSubject) {
      const cls = classes.find(c => c.id === selectedClass);
      if (cls && cls.subject_ids && !cls.subject_ids.includes(selectedSubject)) {
        setSelectedSubject('');
      }
    }
  }, [fetchStudentsAndGrades]);

  useEffect(() => {
    if (availablePeriods.length > 0 && !availablePeriods.includes(selectedPeriod)) {
      setSelectedPeriod(availablePeriods[0]);
    }
  }, [availablePeriods, selectedPeriod]);

  const filteredSubjects = React.useMemo(() => {
    if (!selectedClass) return [];
    const cls = classes.find(c => c.id === selectedClass);
    if (!cls) return [];
    if (!cls.subject_ids || cls.subject_ids.length === 0) return subjects; // Fallback
    return subjects.filter(s => cls.subject_ids?.includes(s.id));
  }, [selectedClass, classes, subjects]);

  const handleGradeChange = (studentId: string, value: string) => {
    // Basic validation: allow numbers, comma and dot
    if (value !== '' && !/^[0-9,.]*$/.test(value)) return;

    const rawValue = value.replace(',', '.');
    const numValue = parseFloat(rawValue);
    
    // Calculate status only if it's a valid number
    let status: GradeRecord['status'] = 'Reprovado';
    if (!isNaN(numValue)) {
      if (numValue >= academicParams.approval_grade) status = 'Aprovado';
      else if (numValue >= academicParams.recovery_grade) status = 'Recuperação';
      else status = 'Reprovado';
    }

    setGrades(prev => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        student_id: studentId,
        class_id: selectedClass,
        subject_id: selectedSubject,
        period: selectedPeriod,
        value: value, // Store as string to allow typing decimals
        status: status
      }
    }));
  };

  const calculateFinalResults = async () => {
    if (selectedPeriod !== 'Resultado Final') return;
    setLoading(true);
    try {
      const allGrades = await fetchQuery('grades', [
        { field: 'class_id', operator: '==', value: selectedClass },
        { field: 'subject_id', operator: '==', value: selectedSubject }
      ]);
      
      const newGradesMap = { ...grades };
      
      students.forEach(student => {
        const studentGrades = (allGrades || []).filter(g => 
          g.student_id === student.id && 
          g.period !== 'Resultado Final'
        );
        
        if (studentGrades.length > 0) {
          const sum = studentGrades.reduce((acc, curr) => {
            const v = typeof curr.value === 'string' ? parseFloat(curr.value.replace(',', '.')) : curr.value;
            return acc + (v || 0);
          }, 0);
          const avg = sum / 4; // Dividing by 4 evaluations as requested
          
          const status = avg >= academicParams.approval_grade ? 'Aprovado' : 
                         avg >= academicParams.recovery_grade ? 'Recuperação' : 'Reprovado';
          
          newGradesMap[student.id] = {
            ...newGradesMap[student.id],
            student_id: student.id,
            class_id: selectedClass,
            subject_id: selectedSubject,
            period: 'Resultado Final',
            value: avg.toFixed(2).replace('.', ','),
            status: status as any
          };
        }
      });
      
      setGrades(newGradesMap);
      setNotification({ type: 'success', message: 'Médias calculadas automaticamente (Soma das 4 avaliações / 4)!' });
      setTimeout(() => setNotification(null), 3000);
    } catch (error) {
      console.error("Error calculating results:", error);
    } finally {
      setLoading(false);
    }
  };

  const saveGrades = async () => {
    if (!userAuth) return;
    setSaving(true);
    try {
      const recordsToSave = Object.values(grades) as GradeRecord[];
      for (const record of recordsToSave) {
        let numericValue = typeof record.value === 'string' 
          ? parseFloat(record.value.replace(',', '.')) 
          : record.value;

        if (isNaN(numericValue as number)) continue;
        
        const docId = record.id || `${selectedClass}_${selectedSubject}_${selectedPeriod}_${record.student_id}`;
        
        const data = {
          ...record,
          id: docId,
          value: numericValue,
          user_id: userAuth.uid,
          updated_at: new Date().toISOString()
        };
        
        await saveData('grades', docId, data);
      }

      setNotification({ type: 'success', message: 'Notas salvas com sucesso!' });
      setTimeout(() => setNotification(null), 3000);
      fetchStudentsAndGrades();
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
          <div className="flex gap-3">
            {selectedPeriod === 'Resultado Final' && (
              <button 
                onClick={calculateFinalResults}
                className="flex items-center gap-2 px-6 py-4 bg-amber-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-amber-700 shadow-xl shadow-amber-200 transition-all active:scale-95"
              >
                <RefreshCw size={16} />
                Calcular Médias
              </button>
            )}
            <button 
              disabled={saving}
              onClick={saveGrades}
              className="flex items-center gap-2 px-8 py-4 bg-blue-700 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-800 shadow-xl shadow-blue-200 transition-all active:scale-95 disabled:opacity-50"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              Salvar Notas
            </button>
          </div>
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
                {filteredSubjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
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
                {availablePeriods.map(p => {
                  const assessment = assessments.find(a => a.title === p);
                  return (
                    <option key={p} value={p}>
                      {p} {assessment ? `(${new Date(assessment.date).toLocaleDateString('pt-BR')} - Peso: ${assessment.weight})` : ''}
                    </option>
                  );
                })}
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
                As notas variam de 1 a 10. <span className="text-emerald-600">{academicParams.approval_grade}+ (Aprovado)</span> | <span className="text-amber-600">{academicParams.recovery_grade}-{academicParams.approval_grade - 0.1} (Recuperação)</span> | <span className="text-red-600">Sub {academicParams.recovery_grade} (Reprovado)</span>
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
                            value={grades[student.id]?.value ?? ''}
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
