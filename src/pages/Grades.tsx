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
import { financialService } from '../services/financialService';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router-dom';

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
  const navigate = useNavigate();
  const { userAuth, isAdmin, isDirector } = useAuth();
  const [classes, setClasses] = useState<Class[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [grades, setGrades] = useState<Record<string, GradeRecord>>({});
  const [dbGrades, setDbGrades] = useState<any[]>([]);
  const [institution, setInstitution] = useState<any>(null);
  const [academicParams, setAcademicParams] = useState<AcademicParameters>({
    approval_grade: 5.0,
    recovery_grade: 5.0,
    failure_grade: 4.9,
    absence_limit_percentage: 40, // Match 60% requirement mentioned in calculateFinalResults
    updated_at: ''
  });
  
  const [selectedClass, setSelectedClass] = useState<string>('');
  const [selectedSubject, setSelectedSubject] = useState<string>('');
  const [selectedPeriod, setSelectedPeriod] = useState<string>('Resultado Final');

  const availablePeriods = React.useMemo(() => {
    const sortedAssessments = [...assessments].sort((a, b) => {
      const timeA = a.date ? new Date(a.date).getTime() : 0;
      const timeB = b.date ? new Date(b.date).getTime() : 0;
      if (timeA !== timeB) return timeA - timeB;
      return (a.title || '').localeCompare(b.title || '');
    });

    const list = sortedAssessments.map(a => ({
      id: a.id,
      title: a.title,
      label: `${a.period || '1º Bimestre'} - ${a.title} (${new Date(a.date).toLocaleDateString('pt-BR')} - Peso: ${a.weight})`
    }));
    return [
      ...list,
      { id: 'Resultado Final', title: 'Resultado Final', label: 'Resultado Final' }
    ];
  }, [assessments]);
  
  const [loading, setLoading] = useState(false);
  const [loadingAssessments, setLoadingAssessments] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'err', message: string } | null>(null);

  const periods = ['Avaliação 1', 'Avaliação 2', 'Avaliação 3', 'Avaliação 4', 'Resultado Final'];

  const fetchData = React.useCallback(async () => {
    const [params, classesData, subjectsData, instSettings] = await Promise.all([
      fetchAll('academic_parameters', '*', ''), // Passing empty string to avoid ordering by created_at
      fetchQuery('classes', [{ field: 'status', operator: '==', value: 'Ativo' }]),
      fetchQuery('subjects', [{ field: 'status', operator: '==', value: 'Ativo' }]),
      financialService.getInstitutionSettings()
    ]);

    if (params && params.length > 0) {
      setAcademicParams(params[0] as AcademicParameters);
    }

    if (instSettings) {
      setInstitution(instSettings);
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
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Handle redirect from Assessments page to automatically filter Class, Subject, and Assessment
  useEffect(() => {
    const redirectDataStr = sessionStorage.getItem('grades_redirect');
    if (redirectDataStr) {
      try {
        const data = JSON.parse(redirectDataStr);
        if (data.classId) setSelectedClass(data.classId);
        if (data.subjectId) setSelectedSubject(data.subjectId);
        if (data.periodId) setSelectedPeriod(data.periodId);
        sessionStorage.removeItem('grades_redirect');
      } catch (e) {
        console.error('Error parsing grades redirect session cache:', e);
      }
    }
  }, [classes, subjects]);

  const fetchStudentsAndGrades = React.useCallback(async () => {
    if (!selectedClass || !selectedSubject) return;
    
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
          { field: 'subject_id', operator: '==', value: selectedSubject }
        ]),
        fetchQuery('assessments', [
          { field: 'class_id', operator: '==', value: selectedClass },
          { field: 'subject_id', operator: '==', value: selectedSubject }
        ])
      ]);

      setStudents((studentsList || []).sort((a, b) => a.name.localeCompare(b.name)));
      setAssessments(assessmentsList as Assessment[] || []);
      setDbGrades(gradesList || []);
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
  }, [selectedClass, selectedSubject]);

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
    if (availablePeriods.length > 0 && !loadingAssessments) {
      const exists = availablePeriods.some(p => p.id === selectedPeriod);
      if (!exists) {
        setSelectedPeriod(availablePeriods[0].id);
      }
    }
  }, [availablePeriods, selectedPeriod, loadingAssessments]);

  // Handle client-side mapping of loaded grades into local active edit state
  useEffect(() => {
    if (!selectedPeriod) return;

    const currentAssessment = assessments.find(a => a.id === selectedPeriod);
    const periodGrades = dbGrades.filter(g => {
      if (selectedPeriod === 'Resultado Final') {
        return g.period === 'Resultado Final';
      }
      // Support matching by ID (current perfect design) or title (for backwards compatibility)
      return g.period === selectedPeriod || (currentAssessment && g.period === currentAssessment.title);
    });

    const gradesMap: Record<string, GradeRecord> = {};
    periodGrades.forEach(data => {
      const record = { ...data } as GradeRecord;
      if (record.value !== undefined && record.value !== null) {
        const num = typeof record.value === 'number'
          ? record.value
          : parseFloat(record.value.toString().replace(',', '.'));
        if (!isNaN(num)) {
          if (Number.isInteger(num) || num % 1 === 0) {
            record.value = num.toString();
          } else {
            const fixed = Number(num.toFixed(2));
            if (Number.isInteger(fixed)) {
              record.value = fixed.toString();
            } else {
              record.value = fixed.toString().replace('.', ',');
            }
          }
        }
      }
      gradesMap[data.student_id] = record;
    });

    setGrades(gradesMap);
  }, [selectedPeriod, dbGrades, students, assessments]);

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

    // Limit to two decimal places (after comma or dot)
    if (value !== '') {
      const parts = value.split(/[,.]/);
      if (parts.length > 2) return; // more than one decimal separator
      if (parts.length === 2 && parts[1].length > 2) return; // more than two decimal places
    }

    // Strict validation: values must be between 1 and 10 inclusive
    if (value !== '') {
      const rawValue = value.replace(',', '.');
      const numValue = parseFloat(rawValue);

      if (!isNaN(numValue)) {
        if (numValue < 1 || numValue > 10) {
          return;
        }
      } else {
        // Allow temporary prefix characters if they are '.' or ','
        if (value !== '.' && value !== ',') {
          return;
        }
      }
    }

    const rawValue = value.replace(',', '.');
    const numValue = parseFloat(rawValue);
    
    // Calculate status only if it's a valid number
    let status: GradeRecord['status'] = 'Pendente';
    if (value !== '' && !isNaN(numValue)) {
      const minApp = academicParams.approval_grade || 5.0;
      const minRec = academicParams.recovery_grade !== undefined && academicParams.recovery_grade !== null
        ? academicParams.recovery_grade
        : 4.0;
      
      if (numValue >= minApp) {
        status = 'Aprovado';
      } else if (numValue >= minRec) {
        status = 'Recuperação';
      } else {
        status = 'Reprovado';
      }
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
      const [allGrades, assessmentsList, attendances, calendarEvents, excusedEvents] = await Promise.all([
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
        fetchQuery('calendar_events', [
          { field: 'type', operator: '==', value: 'class_day' }
        ]),
        fetchQuery('calendar_events', [
          { field: 'type', operator: '==', value: 'excused_class' },
          { field: 'class_id', operator: '==', value: selectedClass }
        ])
      ]);
      
      const newGradesMap = { ...grades };
      
      // Filter calendar events for THIS class Specifically
      const classSpecificEvents = (calendarEvents || []).filter(e => !e.class_id || e.class_id === selectedClass);
      const totalSchoolDays = (classSpecificEvents.length || 0); // Total intended class days
      
      // Total effective days (Total - Excused)
      // Note: If a day is excused, it's not a class day anymore.
      const totalEffectiveDays = totalSchoolDays; 
      
      const numAssessments = assessmentsList?.length || 0;
      
      const assessmentTitles = (assessmentsList || []).map(a => a.title);
      const assessmentIds = (assessmentsList || []).map(a => a.id);
      
      students.forEach(student => {
        // Filter grades specifically for assessments (title or ID matching)
        const studentGrades = (allGrades || []).filter(g => 
          g.student_id === student.id && 
          (assessmentTitles.includes(g.period) || assessmentIds.includes(g.period)) &&
          g.value !== null && g.value !== undefined && g.value !== ''
        );
        
        // Final Grade Calculation: Average of registered assessments
        let avg: number | null = null;
        let hasGrades = false;
        
        if (numAssessments > 0 && studentGrades.length > 0) {
          hasGrades = true;
          const sum = studentGrades.reduce((acc, curr) => {
            const v = typeof curr.value === 'string' ? parseFloat(curr.value.replace(',', '.')) : curr.value;
            return acc + (v || 0);
          }, 0);
          avg = sum / numAssessments;
        }

        // Attendance Calculation: Present days >= 60% of school days
        const absences = (attendances || []).filter(a => a.student_id === student.id).length;
        const presencePercentage = totalEffectiveDays > 0 ? ((totalEffectiveDays - absences) / totalEffectiveDays) * 100 : 100;
        const isAttendanceApproved = presencePercentage >= (100 - (academicParams.absence_limit_percentage || 40));
        
        // Status Determination
        let status: GradeRecord['status'] = 'Pendente';
        
        // Only determine final status if ALL assessments are launched and there's at least one assessment
        const hasAssessments = numAssessments > 0;
        const allGradesLaunched = hasAssessments && studentGrades.length === numAssessments;

        if (allGradesLaunched && avg !== null) {
          const minApp = academicParams.approval_grade || 5.0;
          const minRec = academicParams.recovery_grade !== undefined && academicParams.recovery_grade !== null
            ? academicParams.recovery_grade
            : 4.0;

          if (!isAttendanceApproved) {
            status = 'Reprovado';
          } else if (avg >= minApp) {
            status = 'Aprovado';
          } else if (avg >= minRec) {
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
          value: avg !== null ? avg.toFixed(2).replace('.', ',') : '',
          status: status,
          observations: !isAttendanceApproved ? `Reprovado por Falta (${presencePercentage.toFixed(1)}% pres.)` : ''
        };
      });
      
      setGrades(newGradesMap);
      setNotification({ 
        type: 'success', 
        message: 'Médias e situações finais calculadas com sucesso!' 
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
    
    let printWindow;
    try {
      printWindow = window.open('', '_blank');
    } catch (err) {
      console.error("Failed to open print window:", err);
    }

    if (!printWindow) {
      setNotification({
        type: 'err',
        message: 'A abertura de novas janelas para impressão está bloqueada pelo navegador dentro do painel de visualização. Por favor, abra o sistema em uma nova aba (botão no canto superior direito) para gerar o relatório.'
      });
      setTimeout(() => setNotification(null), 5000);
      return;
    }

    const html = `
      <html>
        <head>
          <title>Relatório de Notas - ${className}</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;900&family=JetBrains+Mono:wght@400;500;600&display=swap');
            
            @page {
              size: A4 portrait;
              margin: 15mm 15mm 20mm 15mm;
            }
            
            body {
              font-family: 'Inter', sans-serif;
              color: #0f172a;
              background-color: #ffffff;
              margin: 0;
              padding: 0;
              font-size: 11px;
              line-height: 1.4;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            
            /* Logo & Diocese Header */
            .header-container {
              display: flex;
              align-items: center;
              gap: 20px;
              border-bottom: 2px solid #0f172a;
              padding-bottom: 12px;
              margin-bottom: 20px;
            }
            
            .logo-box {
              width: 75px;
              height: 75px;
              display: flex;
              align-items: center;
              justify-content: center;
              flex-shrink: 0;
            }
            
            .logo-img {
              max-height: 75px;
              max-width: 75px;
              object-fit: contain;
            }
            
            .logo-placeholder {
              width: 70px;
              height: 70px;
              border: 1px dashed #cbd5e1;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              font-size: 8px;
              color: #94a3b8;
              font-weight: bold;
            }
            
            .header-info {
              flex-grow: 1;
            }
            
            .header-diocese {
              font-size: 10px;
              font-weight: 700;
              letter-spacing: 2px;
              color: #475569;
              text-transform: uppercase;
              margin: 0 0 2px 0;
            }
            
            .header-title {
              font-size: 18px;
              font-weight: 900;
              color: #0f172a;
              text-transform: uppercase;
              margin: 0 0 2px 0;
              letter-spacing: -0.5px;
            }
            
            .header-subtitle {
              font-size: 11px;
              font-weight: 600;
              color: #64748b;
              text-transform: uppercase;
              margin: 0;
            }
            
            /* Document Title */
            .doc-title-container {
              text-align: center;
              margin-bottom: 18px;
            }
            
            .doc-title {
              display: inline-block;
              font-size: 14px;
              font-weight: 800;
              text-transform: uppercase;
              letter-spacing: 1.5px;
              border-bottom: 2px solid #0f172a;
              padding-bottom: 4px;
              margin: 0;
            }
            
            /* Metadata Grid Row */
            .metadata-grid {
              display: grid;
              grid-template-columns: repeat(4, 1fr);
              gap: 12px;
              border: 1px solid #cbd5e1;
              background-color: #f8fafc;
              padding: 10px 14px;
              margin-bottom: 20px;
            }
            
            .metadata-item {
              display: flex;
              flex-direction: column;
            }
            
            .metadata-label {
              font-size: 8px;
              font-weight: 800;
              text-transform: uppercase;
              color: #64748b;
              letter-spacing: 0.5px;
              margin-bottom: 2px;
            }
            
            .metadata-value {
              font-size: 10px;
              font-weight: 700;
              color: #0f172a;
              text-transform: uppercase;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
            }
            
            /* Main Table */
            table {
              width: 100%;
              border-collapse: collapse;
              margin-bottom: 30px;
            }
            
            th {
              background-color: #f1f5f9;
              border: 1px solid #cbd5e1;
              color: #334155;
              font-size: 9px;
              font-weight: 800;
              text-transform: uppercase;
              letter-spacing: 0.5px;
              padding: 8px 10px;
              text-align: left;
            }
            
            td {
              border: 1px solid #cbd5e1;
              padding: 7px 10px;
              font-size: 10.5px;
              color: #1e293b;
            }
            
            .col-number {
              width: 35px;
              text-align: center;
              color: #64748b;
              font-weight: 600;
            }
            
            .col-name {
              font-weight: 700;
              color: #0f172a;
              text-transform: uppercase;
            }
            
            .col-ra {
              width: 110px;
              font-family: 'JetBrains Mono', monospace;
              font-size: 9.5px;
              color: #475569;
            }
            
            .col-grade {
              width: 75px;
              text-align: center;
              font-family: 'JetBrains Mono', monospace;
              font-weight: 800;
              font-size: 11px;
            }
            
            .col-status {
              width: 100px;
              text-align: center;
            }
            
            .col-obs {
              font-size: 9.5px;
              color: #475569;
            }
            
            /* Status Badges */
            .status-badge {
              display: inline-block;
              width: 80px;
              padding: 2.5px 0;
              font-size: 8.5px;
              font-weight: 800;
              text-transform: uppercase;
              text-align: center;
              border-radius: 3px;
              letter-spacing: 0.5px;
            }
            
            .status-aprovado {
              background-color: #d1fae5;
              color: #065f46;
              border: 1px solid #a7f3d0;
            }
            
            .status-recuperacao {
              background-color: #fef3c7;
              color: #92400e;
              border: 1px solid #fde68a;
            }
            
            .status-reprovado {
              background-color: #fee2e2;
              color: #991b1b;
              border: 1px solid #fca5a5;
            }
            
            .status-pendente {
              background-color: #f1f5f9;
              color: #475569;
              border: 1px solid #e2e8f0;
            }
            
            /* Signatures Footer */
            .signatures-container {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 50px;
              margin-top: 40px;
              page-break-inside: avoid;
            }
            
            .signature-block {
              display: flex;
              flex-direction: column;
              align-items: center;
              text-align: center;
            }
            
            .signature-line {
              width: 85%;
              border-top: 1px solid #0f172a;
              margin-bottom: 6px;
            }
            
            .signature-role {
              font-size: 8.5px;
              font-weight: 700;
              text-transform: uppercase;
              color: #64748b;
              letter-spacing: 0.5px;
            }
            
            .signature-name {
              font-size: 10px;
              font-weight: 700;
              color: #0f172a;
            }
            
            /* Footer page tracking */
            .document-footer {
              position: fixed;
              bottom: 10px;
              left: 15mm;
              right: 15mm;
              display: flex;
              justify-content: space-between;
              font-size: 8px;
              color: #94a3b8;
              font-weight: 600;
              text-transform: uppercase;
              border-top: 1px solid #e2e8f0;
              padding-top: 6px;
            }
          </style>
        </head>
        <body>
          <div class="header-container">
            <div class="logo-box">
              ${institution?.logo_url 
                ? `<img class="logo-img" src="${institution.logo_url}" referrerPolicy="no-referrer" alt="Logo" />`
                : `<div class="logo-placeholder"><span>SEM</span><span>LOGO</span></div>`
              }
            </div>
            <div class="header-info">
              <p class="header-diocese">${institution?.city 
                ? `DIOCESE DE ${institution.city.toUpperCase()}` 
                : 'DIOCESE DE GUARULHOS'
              }</p>
              <h1 class="header-title">${institution?.name || 'ESCOLA DIOCESANA DE MINISTÉRIOS'}</h1>
              <p class="header-subtitle">${institution?.subtitle || 'PASTORAL E REGISTRO ACADÊMICO'}</p>
            </div>
          </div>
          
          <div class="doc-title-container">
            <h2 class="doc-title">Relatório de Desempenho Escolar</h2>
          </div>
          
          <div class="metadata-grid">
            <div class="metadata-item">
              <span class="metadata-label">Turma</span>
              <span class="metadata-value" title="${className}">${className}</span>
            </div>
            <div class="metadata-item">
              <span class="metadata-label">Disciplina</span>
              <span class="metadata-value" title="${subjectName}">${subjectName}</span>
            </div>
            <div class="metadata-item">
              <span class="metadata-label">Período/Avaliação</span>
              <span class="metadata-value" title="${selectedPeriod}">${selectedPeriod}</span>
            </div>
            <div class="metadata-item">
              <span class="metadata-label">Data de Emissão</span>
              <span class="metadata-value">${new Date().toLocaleDateString('pt-BR')}</span>
            </div>
          </div>
          
          <table>
            <thead>
              <tr>
                <th class="col-number">Nº</th>
                <th>Nome do Aluno</th>
                <th style="width: 110px">RA</th>
                <th style="width: 75px; text-align: center;">Nota</th>
                <th style="width: 100px; text-align: center;">Situação</th>
                <th>Observações</th>
              </tr>
            </thead>
            <tbody>
              ${students.map((student, idx) => {
                const gradeInfo = grades[student.id];
                const gradeValue = gradeInfo?.value !== undefined && gradeInfo?.value !== null && gradeInfo?.value !== ''
                  ? gradeInfo.value
                  : '---';
                
                let statusClass = 'status-pendente';
                let statusLabel = 'Pendente';
                
                if (gradeInfo?.status) {
                  statusLabel = gradeInfo.status;
                  const statusLower = gradeInfo.status.toLowerCase();
                  if (statusLower === 'aprovado') statusClass = 'status-aprovado';
                  else if (statusLower === 'recuperação') statusClass = 'status-recuperacao';
                  else if (statusLower === 'reprovado') statusClass = 'status-reprovado';
                }
                
                return `
                  <tr>
                    <td class="col-number">${idx + 1}</td>
                    <td class="col-name">${student.name}</td>
                    <td class="col-ra">${student.registration_number || '---'}</td>
                    <td class="col-grade" style="text-align: center;">${gradeValue}</td>
                    <td class="col-status">
                      <span class="status-badge ${statusClass}">
                        ${statusLabel}
                      </span>
                    </td>
                    <td class="col-obs">${gradeInfo?.observations || ''}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
          
          <div class="document-footer">
            <span></span>
            <span>Emitido em ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}</span>
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
                {availablePeriods.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <AnimatePresence>
          {notification && (
            <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className={cn(
                  "w-full max-w-sm bg-white rounded-2xl shadow-xl border p-6 flex flex-col items-center text-center space-y-4",
                  notification.type === 'success' ? "border-emerald-100" : "border-red-100"
                )}
              >
                <div className={cn(
                  "w-12 h-12 rounded-full flex items-center justify-center shadow-xs",
                  notification.type === 'success' ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"
                )}>
                  {notification.type === 'success' ? <Check size={24} /> : <AlertTriangle size={24} />}
                </div>
                
                <div className="space-y-1.5">
                  <h4 className="text-sm font-bold text-slate-900">
                    {notification.type === 'success' ? 'Sucesso!' : 'Atenção / Aviso'}
                  </h4>
                  <p className="text-xs text-slate-500 leading-relaxed font-semibold">
                    {notification.message}
                  </p>
                </div>

                <button 
                  onClick={() => setNotification(null)}
                  className={cn(
                    "w-full py-2 rounded-lg text-xs font-bold transition-all shadow-xs cursor-pointer",
                    notification.type === 'success' 
                      ? "bg-emerald-600 text-white hover:bg-emerald-700" 
                      : "bg-red-600 text-white hover:bg-red-700"
                  )}
                >
                  Entendido
                </button>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center gap-4">
            <div className="w-12 h-12 border-4 border-blue-600/20 border-t-blue-600 rounded-full animate-spin" />
            <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Buscando pautas...</p>
          </div>
        ) : selectedClass && selectedSubject ? (
          <div className="space-y-6">
            {/* Bloco de Ajuda/Orientação para Lançamento de Notas */}
            {selectedPeriod === 'Resultado Final' && (
              <div className="bg-sky-50/70 p-5 rounded-xl border border-sky-100 flex flex-col sm:flex-row items-start gap-4">
                <div className="w-10 h-10 bg-sky-100 rounded-lg flex items-center justify-center text-sky-600 shrink-0">
                  <Info size={20} />
                </div>
                <div className="space-y-3 flex-1">
                  <div>
                    <h4 className="text-xs font-bold text-sky-900 uppercase tracking-wider">Como Lançar ou Alterar Notas / Avaliações?</h4>
                    <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                      Você está visualizando a tela de <strong>Resultado Final</strong> (soma e cálculo automático de médias). Para poder lançar ou editar as notas individuais dos alunos:
                    </p>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                    {assessments.length === 0 ? (
                      <div className="bg-white/80 p-3 rounded-lg border border-amber-200 col-span-2">
                        <p className="text-[11px] font-bold text-amber-800 uppercase tracking-wider mb-1">Atenção: Nenhuma avaliação cadastrada ainda!</p>
                        <p className="text-xs text-slate-500 leading-normal mb-3">
                          Para lançar notas, você precisa primeiro cadastrar uma avaliação específica (ex: Prova 1, Resenha, Seminário) para esta turma e disciplina.
                        </p>
                        <button 
                          onClick={() => {
                            sessionStorage.setItem('assessments_redirect', JSON.stringify({ classId: selectedClass, subjectId: selectedSubject }));
                            navigate('/assessments');
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded text-xs font-semibold hover:bg-indigo-700 transition-colors shadow-sm cursor-pointer"
                        >
                          Ir para Cadastrar Avaliações
                          <ChevronRight size={12} />
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="bg-white/80 p-3 rounded-lg border border-sky-100/50">
                          <p className="text-[11px] font-bold text-sky-900 uppercase tracking-wider mb-1">Passo 1: Selecionar a Avaliação</p>
                          <p className="text-xs text-slate-500 leading-normal">
                            Mude o campo <strong>"Período/Avaliação"</strong> acima para uma das avaliações cadastradas da lista (ex: <em>"{assessments[0].title}"</em>).
                          </p>
                        </div>
                        <div className="bg-white/80 p-3 rounded-lg border border-sky-100/50">
                          <p className="text-[11px] font-bold text-sky-900 uppercase tracking-wider mb-1">Passo 2: Digitar e Salvar</p>
                          <p className="text-xs text-slate-500 leading-normal font-sans">
                            Assim que a avaliação for selecionada, os campos de digitação de notas ficarão desbloqueados para inserção de notas. Lembre-se de clicar em "Salvar Notas" ao terminar.
                          </p>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="bg-amber-50/50 p-4 rounded-xl border border-amber-100 flex items-start gap-4">
              <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center text-amber-600 shrink-0">
                <Info size={18} />
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-black text-amber-800 uppercase tracking-widest">Critérios Acadêmicos</p>
                <p className="text-[11px] font-medium text-slate-600 leading-relaxed">
                  Para aprovação, é necessária uma média igual ou superior a <span className="text-emerald-700 font-bold underline decoration-emerald-200 decoration-2 underline-offset-2">{(academicParams.approval_grade || 5.0).toFixed(2).replace('.', ',')}</span>. 
                  Resultados inferiores a <span className="text-red-700 font-bold">{(academicParams.approval_grade || 5.0).toFixed(2).replace('.', ',')}</span> configuram reprovação. 
                  O aluno deve manter uma presença mínima de <span className="text-slate-900 font-bold underline decoration-slate-200 decoration-2 underline-offset-2">{100 - (academicParams.absence_limit_percentage || 40)}%</span> das aulas.
                </p>
              </div>
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
                            id={`grade-input-${idx}`}
                            type="text"
                            placeholder="0,00"
                            value={grades[student.id]?.value ?? ''}
                            readOnly={selectedPeriod === 'Resultado Final'}
                            onClick={() => {
                              if (selectedPeriod === 'Resultado Final') {
                                setNotification({ 
                                  type: 'err', 
                                  message: 'O Resultado Final é gerado automaticamente. Mude o seletor "Período/Avaliação" no topo da página para a avaliação desejada para lançar as notas.' 
                                });
                                setTimeout(() => setNotification(null), 6000);
                              }
                            }}
                            onChange={e => handleGradeChange(student.id, e.target.value)}
                            onBlur={() => {
                              const currentValue = grades[student.id]?.value ?? '';
                              if (currentValue !== '') {
                                const rawValue = currentValue.toString().replace(',', '.');
                                const numValue = parseFloat(rawValue);
                                if (!isNaN(numValue)) {
                                  let formattedValue = '';
                                  if (Number.isInteger(numValue) || numValue % 1 === 0) {
                                    formattedValue = numValue.toString();
                                  } else {
                                    const fixedValue = Number(numValue.toFixed(2));
                                    if (Number.isInteger(fixedValue)) {
                                      formattedValue = fixedValue.toString();
                                    } else {
                                      formattedValue = fixedValue.toString().replace('.', ',');
                                    }
                                  }
                                  
                                  // Update state with formatted value
                                  setGrades(prev => ({
                                    ...prev,
                                    [student.id]: {
                                      ...prev[student.id],
                                      value: formattedValue
                                    }
                                  }));
                                }
                              }
                            }}
                            onKeyDown={e => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                const nextInput = document.getElementById(`grade-input-${idx + 1}`);
                                if (nextInput) {
                                  nextInput.focus();
                                  (nextInput as HTMLInputElement).select();
                                }
                              }
                            }}
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
