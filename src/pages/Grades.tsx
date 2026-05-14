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
  RefreshCw,
  Printer,
  Eraser,
  Trash2
} from 'lucide-react';
import { Student, Class, Subject, AcademicParameters, Assessment } from '../types';
import { cn } from '../lib/utils';
import { fetchAll, saveData, deleteData, fetchQuery, saveBatch } from '../lib/database';
import { useAuth } from '../contexts/AuthContext';
import { motion, AnimatePresence } from 'motion/react';

interface GradeRecord {
  id: string;
  student_id: string;
  class_id: string;
  subject_id: string;
  period: string;
  value: number | string;
  status: 'Aprovado' | 'Reprovado' | 'Recuperação' | 'Pendente';
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
  const [selectedPeriod, setSelectedPeriod] = useState<string>('Resultado Final');

  const availablePeriods = React.useMemo(() => {
    const assessmentTitles = assessments.map(a => a.title);
    // Removemos os períodos base e mantemos apenas os cadastrados + Resultado Final
    return Array.from(new Set([...assessmentTitles, 'Resultado Final'])) as string[];
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
    } catch (error: any) {
      console.error("Error fetching data:", error);
      const errorMsg = error.message || '';
      if (errorMsg.includes('42P01') || errorMsg.includes('does not exist')) {
        setNotification({ 
          type: 'err', 
          message: 'A tabela de Notas não existe. Use o Checkup de Schema em Configurações para criá-la.' 
        });
      }
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
    if (selectedPeriod === 'Resultado Final') {
      setNotification({ 
        type: 'err', 
        message: 'O Resultado Final é calculado automaticamente. Para alterar a nota, edite as avaliações individuais.' 
      });
      setTimeout(() => setNotification(null), 5000);
      return;
    }

    // Basic validation: allow numbers, comma and dot
    if (value !== '' && !/^[0-9,.]*$/.test(value)) return;

    const rawValue = value.replace(',', '.');
    const numValue = parseFloat(rawValue);
    
    // Calculate status only if it's a valid number
    let status: GradeRecord['status'] = 'Pendente';
    if (value !== '' && !isNaN(numValue)) {
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
      // 1. Fetch all academic components necessary for calculation
      const [allGrades, assessmentsList, attendances, calendarEvents] = await Promise.all([
        fetchQuery('grades', [
          { field: 'class_id', operator: '==', value: selectedClass },
          { field: 'subject_id', operator: '==', value: selectedSubject }
        ]),
        fetchQuery('assessments', [
          { field: 'class_id', operator: '==', value: selectedClass },
          { field: 'subject_id', operator: '==', value: selectedSubject }
        ]),
        fetchQuery('attendances', [
          { field: 'class_id', operator: '==', value: selectedClass },
          { field: 'subject_id', operator: '==', value: selectedSubject },
          { field: 'status', operator: '==', value: 'F' } // Just focus on absences
        ]),
        fetchQuery('calendar_events', [{ field: 'type', operator: '==', value: 'Dia de Aula' }])
      ]);
      
      const newGradesMap = { ...grades };
      const totalSchoolDays = calendarEvents?.length || 20; // Fallback to 20 if none defined, or handle gracefully
      const numAssessments = assessmentsList?.length || 0;
      
      students.forEach(student => {
        // Filter grades specifically for assessments (title matching)
        const assessmentTitles = (assessmentsList || []).map(a => a.title);
        const studentGrades = (allGrades || []).filter(g => 
          g.student_id === student.id && 
          assessmentTitles.includes(g.period)
        );
        
        // Final Grade Calculation: Average of registered assessments
        let avg = 0;
        if (numAssessments > 0) {
          const sum = studentGrades.reduce((acc, curr) => {
            const v = typeof curr.value === 'string' ? parseFloat(curr.value.replace(',', '.')) : curr.value;
            return acc + (v || 0);
          }, 0);
          avg = sum / numAssessments;
        }

        // Attendance Calculation: Present days >= 60% of school days
        const absences = (attendances || []).filter(a => a.student_id === student.id).length;
        const presencePercentage = totalSchoolDays > 0 ? ((totalSchoolDays - absences) / totalSchoolDays) * 100 : 100;
        const isAttendanceApproved = presencePercentage >= 60;
        
        // Status Determination
        let status: GradeRecord['status'] = 'Pendente';
        if (numAssessments > 0) {
          if (avg >= academicParams.approval_grade && isAttendanceApproved) {
            status = 'Aprovado';
          } else if (avg >= academicParams.recovery_grade && isAttendanceApproved) {
            status = 'Recuperação';
          } else {
            status = 'Reprovado';
          }
        }
        
        newGradesMap[student.id] = {
          ...newGradesMap[student.id],
          student_id: student.id,
          class_id: selectedClass,
          subject_id: selectedSubject,
          period: 'Resultado Final',
          value: avg.toFixed(2).replace('.', ','),
          status: status as any,
          observations: !isAttendanceApproved ? `Reprovado por Falta (${presencePercentage.toFixed(1)}% pres.)` : ''
        };
      });
      
      setGrades(newGradesMap);
      setNotification({ 
        type: 'success', 
        message: `Médias calculadas: Média das ${numAssessments} avaliações + Mínimo 60% de presença!` 
      });
      setTimeout(() => setNotification(null), 5000);
    } catch (error) {
      console.error("Error calculating results:", error);
      setNotification({ type: 'err', message: 'Erro ao calcular resultados finais.' });
    } finally {
      setLoading(false);
    }
  };

  const saveGrades = async () => {
    if (!userAuth || !selectedClass || !selectedSubject || !selectedPeriod) return;
    setSaving(true);
    try {
      const recordsToSave: any[] = [];
      const recordsToToDelete: string[] = [];

      Object.values(grades).forEach(record => {
        let numericValue = typeof record.value === 'string' 
          ? (record.value.trim() === '' ? null : parseFloat(record.value.replace(',', '.')))
          : record.value;
        
        const docId = record.id || `${selectedClass}_${selectedSubject}_${selectedPeriod}_${record.student_id}`;

        if (numericValue === null) {
          if (record.id) {
            recordsToToDelete.push(record.id);
          }
        } else {
          recordsToSave.push({
            ...record,
            id: docId,
            value: numericValue,
            class_id: selectedClass,
            subject_id: selectedSubject,
            period: selectedPeriod,
            user_id: userAuth.uid,
            updated_at: new Date().toISOString()
          });
        }
      });

      // Execute saves
      if (recordsToSave.length > 0) {
        await saveBatch('grades', recordsToSave);
      }

      // Execute deletions
      if (recordsToToDelete.length > 0) {
        await Promise.all(recordsToToDelete.map(id => deleteData('grades', id)));
      }

      setNotification({ type: 'success', message: 'Notas salvas com sucesso!' });
      setTimeout(() => setNotification(null), 3000);
      await fetchStudentsAndGrades();
    } catch (error: any) {
      console.error("Error saving grades:", error);
      setNotification({ 
        type: 'err', 
        message: 'Erro ao salvar notas: ' + (error.message || 'Verifique sua conexão.') 
      });
    } finally {
      setSaving(false);
    }
  };

  const handleFinalPrint = () => {
    // We can reuse the existing handlePrint as it already uses current grades map
    handlePrint();
  };

  const handlePrint = () => {
    const className = classes.find(c => c.id === selectedClass)?.name || '';
    const subjectName = subjects.find(s => s.id === selectedSubject)?.name || '';
    
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const html = `
      <html>
        <head>
          <title>Relatório de Notas - ${className}</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap');
            body { font-family: 'Inter', sans-serif; padding: 40px; color: #1e293b; }
            .header { text-align: center; margin-bottom: 40px; border-bottom: 2px solid #e2e8f0; padding-bottom: 20px; }
            h1 { margin: 0; font-size: 24px; text-transform: uppercase; letter-spacing: 1px; }
            .info { display: flex; justify-content: space-between; margin-top: 15px; font-weight: bold; text-transform: uppercase; font-size: 12px; color: #64748b; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th { background: #f8fafc; text-align: left; padding: 12px; border: 1px solid #e2e8f0; font-size: 10px; text-transform: uppercase; }
            td { padding: 12px; border: 1px solid #e2e8f0; font-size: 12px; }
            .status { font-weight: bold; text-transform: uppercase; font-size: 10px; }
            .aprovado { color: #059669; }
            .recuperacao { color: #d97706; }
            .reprovado { color: #dc2626; }
            .footer { margin-top: 50px; text-align: right; font-size: 10px; border-top: 1px solid #e2e8f0; padding-top: 10px; color: #94a3b8; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>Relatório de Desempenho Escolar</h1>
            <div class="info">
              <span>Turma: ${className}</span>
              <span>Disciplina: ${subjectName}</span>
              <span>Período: ${selectedPeriod}</span>
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th style="width: 40px">Nº</th>
                <th>Nome do Aluno</th>
                <th style="width: 120px">RA</th>
                <th style="width: 80px; text-align: center;">Nota</th>
                <th style="width: 120px; text-align: center;">Status</th>
                <th>Observações</th>
              </tr>
            </thead>
            <tbody>
              ${students.map((student, idx) => `
                <tr>
                  <td>${idx + 1}</td>
                  <td style="font-weight: bold">${student.name}</td>
                  <td>${student.registration_number || '---'}</td>
                  <td style="text-align: center; font-weight: bold">${grades[student.id]?.value || '---'}</td>
                  <td style="text-align: center;">
                    <span class="status ${grades[student.id]?.status.toLowerCase() || ''}">
                      ${grades[student.id]?.status || 'Pendente'}
                    </span>
                  </td>
                  <td style="font-size: 10px; color: #64748b;">${grades[student.id]?.observations || ''}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <div class="footer">
            Documento gerado em ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}
          </div>
          <script>
            window.onload = () => {
              window.print();
              setTimeout(() => { window.close(); }, 500);
            };
          </script>
        </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
  };

  const handleClearAll = () => {
    if (window.confirm('Deseja realmente limpar TODAS as notas desta pauta?')) {
      const clearedGrades: Record<string, GradeRecord> = {};
      students.forEach(student => {
        clearedGrades[student.id] = {
          ...grades[student.id],
          student_id: student.id,
          class_id: selectedClass,
          subject_id: selectedSubject,
          period: selectedPeriod,
          value: '',
          status: 'Pendente'
        };
      });
      setGrades(clearedGrades);
      setNotification({ type: 'success', message: 'Campos de notas limpos!' });
      setTimeout(() => setNotification(null), 3000);
    }
  };

  const clearStudentGrade = (studentId: string) => {
    setGrades(prev => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        value: '',
        status: 'Pendente'
      }
    }));
  };

  const getStatusColor = (status: GradeRecord['status']) => {
    switch (status) {
      case 'Aprovado': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'Recuperação': return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'Reprovado': return 'bg-red-50 text-red-700 border-red-200';
      case 'Pendente': return 'bg-slate-50 text-slate-500 border-slate-200';
      default: return 'bg-slate-50 text-slate-500 border-slate-200';
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900 flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center text-white shadow-sm">
              <FileSpreadsheet size={20} />
            </div>
            Apontamento de Notas
          </h2>
          <p className="text-xs text-slate-500 mt-1 pl-13">Registro de desempenho acadêmico e resultados finais</p>
        </div>

        {students.length > 0 && (
          <div className="flex gap-3">
            {selectedPeriod === 'Resultado Final' && (
              <button 
                onClick={calculateFinalResults}
                className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 transition-colors"
              >
                <RefreshCw size={16} />
                Calcular Médias
              </button>
            )}
          {selectedPeriod === 'Resultado Final' ? (
            <button 
              onClick={handleFinalPrint}
              className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-white rounded-lg text-sm font-medium hover:bg-slate-900 transition-colors"
            >
              <Printer size={16} />
              Imprimir Resultado Final
            </button>
          ) : (
            <>
              <button 
                onClick={handleClearAll}
                className="flex items-center gap-2 px-4 py-2 bg-white text-red-600 border border-red-200 rounded-lg text-sm font-medium hover:bg-red-50 transition-colors"
              >
                <Eraser size={16} />
                Limpar Tudo
              </button>
              <button 
                onClick={handlePrint}
                className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-white rounded-lg text-sm font-medium hover:bg-slate-900 transition-colors"
              >
                <Printer size={16} />
                Imprimir
              </button>
              <button 
                disabled={saving}
                onClick={saveGrades}
                className="flex items-center gap-2 px-6 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                Salvar Notas
              </button>
            </>
          )}
          </div>
        )}
      </div>

      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-700 ml-1">Turma</label>
            <div className="relative">
              <School className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <select
                value={selectedClass}
                onChange={e => setSelectedClass(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 appearance-none transition-all"
              >
                <option value="">Selecione uma turma...</option>
                {classes.map(c => <option key={c.id} value={c.id}>{c.name} ({c.code})</option>)}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-700 ml-1">Disciplina</label>
            <div className="relative">
              <BookOpen className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <select
                value={selectedSubject}
                onChange={e => setSelectedSubject(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 appearance-none transition-all"
              >
                <option value="">Selecione uma disciplina...</option>
                {filteredSubjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-700 ml-1">Período/Avaliação</label>
            <div className="relative">
              <Clock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <select
                value={selectedPeriod}
                onChange={e => setSelectedPeriod(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 appearance-none transition-all"
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
              "p-3 rounded-lg text-xs font-medium flex items-center gap-3",
              notification.type === 'success' ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-red-50 text-red-700 border border-red-200"
            )}
          >
            {notification.type === 'success' ? <Check size={16} /> : <X size={16} />}
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
            <div className="bg-indigo-50/50 p-4 rounded-lg border border-indigo-100 flex items-center gap-4">
              <Info size={16} className="text-indigo-600 shrink-0" />
              <p className="text-[11px] font-medium text-slate-600 leading-relaxed">
                As notas variam de 1 a 10. <span className="text-emerald-700 font-bold">{academicParams.approval_grade}+ (Aprovado)</span> | <span className="text-amber-700 font-bold">{academicParams.recovery_grade}-{academicParams.approval_grade - 0.1} (Recuperação)</span> | <span className="text-red-700 font-bold">Sub {academicParams.failure_grade} (Reprovado)</span>
              </p>
            </div>

            <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100">
              {students.length > 0 ? (
                students.map((student, idx) => (
                  <div key={student.id} className={cn(
                    "flex flex-col md:flex-row md:items-center justify-between p-4 transition-all hover:bg-slate-50",
                    idx % 2 === 0 ? "bg-white" : "bg-slate-50/30"
                  )}>
                    <div className="flex items-center gap-4 mb-4 md:mb-0">
                      <div className="w-8 h-8 rounded bg-slate-100 text-slate-600 flex items-center justify-center text-xs font-semibold">
                        {idx + 1}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-900 leading-tight">{student.name}</p>
                        <p className="text-[11px] text-slate-500">RA: {student.registration_number}</p>
                        {grades[student.id]?.observations && (
                          <p className="text-[10px] font-medium text-red-600 flex items-center gap-1 mt-0.5">
                            <AlertTriangle size={12} />
                            {grades[student.id].observations}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row items-center gap-6">
                      <div className="flex items-center gap-3 w-full sm:w-auto">
                        <label className="text-[11px] font-medium text-slate-500 sm:hidden">Nota:</label>
                        <div className="relative w-full sm:w-24 group">
                          <input
                            type="text"
                            placeholder="0,00"
                            value={grades[student.id]?.value ?? ''}
                            readOnly={selectedPeriod === 'Resultado Final'}
                            onClick={() => {
                              if (selectedPeriod === 'Resultado Final') {
                                setNotification({ 
                                  type: 'err', 
                                  message: 'Para alterar o Resultado Final, você deve editar as avaliações deste aluno.' 
                                });
                                setTimeout(() => setNotification(null), 4000);
                              }
                            }}
                            onChange={e => handleGradeChange(student.id, e.target.value)}
                            className={cn(
                              "w-full px-3 py-1.5 bg-white border border-slate-200 rounded text-center text-sm font-semibold text-slate-700 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all pr-7",
                              selectedPeriod === 'Resultado Final' && "bg-slate-100 cursor-not-allowed opacity-80"
                            )}
                          />
                          {grades[student.id]?.value && selectedPeriod !== 'Resultado Final' && (
                            <button 
                              onClick={() => clearStudentGrade(student.id)}
                              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-300 hover:text-red-500 transition-colors"
                            >
                              <Trash2 size={12} />
                            </button>
                          )}
                        </div>
                      </div>

                      <div className={cn(
                        "w-full sm:w-28 px-3 py-1.5 rounded border text-[11px] font-semibold text-center whitespace-nowrap",
                        grades[student.id] ? getStatusColor(grades[student.id].status) : "bg-slate-50 text-slate-400 border-slate-200"
                      )}>
                        {grades[student.id]?.status || '---'}
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
