import React, { useState, useEffect, useMemo } from 'react';
import { 
  FileSpreadsheet, 
  Search, 
  Info,
  School,
  Loader2,
  AlertTriangle,
  Printer,
  ChevronDown,
  FileText,
  User,
  GraduationCap
} from 'lucide-react';
import { Student, Class, Subject, AcademicParameters } from '../types';
import { cn } from '../lib/utils';
import { fetchAll, fetchQuery } from '../lib/database';
import { financialService } from '../services/financialService';
import { useAuth } from '../contexts/AuthContext';
import { motion } from 'motion/react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

interface GradeRecord {
  id: string;
  student_id: string;
  class_id: string;
  subject_id: string;
  period: string;
  value: any;
}

export function Bulletin() {
  const { userAuth } = useAuth();
  
  // Database States
  const [classes, setClasses] = useState<Class[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [dbGrades, setDbGrades] = useState<GradeRecord[]>([]);
  const [assessments, setAssessments] = useState<any[]>([]);
  const [attendanceData, setAttendanceData] = useState<any[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<any[]>([]);
  const [institution, setInstitution] = useState<any>(null);
  const [academicParams, setAcademicParams] = useState<AcademicParameters>({
    approval_grade: 5.0,
    recovery_grade: 5.0,
    failure_grade: 4.9,
    absence_limit_percentage: 40,
    updated_at: ''
  });

  // Interface/Filter States
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [viewMode, setViewMode] = useState<'student' | 'class'>('student');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [exportingPDF, setExportingPDF] = useState<boolean>(false);

  // Load Database Records
  useEffect(() => {
    async function loadInitialData() {
      setLoading(true);
      try {
        const [
          classesData,
          subjectsData,
          studentsData,
          gradesData,
          assessmentsData,
          attendancesData,
          calendarData,
          paramsData,
          instSettings
        ] = await Promise.all([
          fetchQuery('classes', [{ field: 'status', operator: '==', value: 'Ativo' }]),
          fetchQuery('subjects', [{ field: 'status', operator: '==', value: 'Ativo' }]),
          fetchAll('students'),
          fetchAll('grades'),
          fetchAll('assessments'),
          fetchAll('attendances'),
          fetchQuery('calendar_events', [{ field: 'type', operator: '==', value: 'class_day' }]),
          fetchAll('academic_parameters'),
          financialService.getInstitutionSettings()
        ]);

        // Prioritize actively listed classes
        const sortedClasses = (classesData || []).sort((a: any, b: any) => 
          (a.name || '').localeCompare(b.name || '')
        );

        setClasses(sortedClasses);
        setSubjects(subjectsData || []);
        setStudents(studentsData || []);
        setDbGrades(gradesData || []);
        setAssessments(assessmentsData || []);
        setAttendanceData(attendancesData || []);
        setCalendarEvents(calendarData || []);
        
        if (paramsData && paramsData.length > 0) {
          setAcademicParams(paramsData[0] as AcademicParameters);
        }
        if (instSettings) {
          setInstitution(instSettings);
        }
      } catch (error) {
        console.error("Error loading Bulletin components database:", error);
      } finally {
        setLoading(false);
      }
    }
    loadInitialData();
  }, []);

  // Filter Active Students for local class
  const classStudents = useMemo(() => {
    if (!selectedClassId) return [];
    return students
      .filter(s => s.class_id === selectedClassId && (s.status === 'Ativo' || s.status === 'Concluído' || !s.status))
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [selectedClassId, students]);

  // Handle auto-selection of first student when changing class in student view mode
  useEffect(() => {
    if (viewMode === 'student' && classStudents.length > 0) {
      // Keep selected is still in class, otherwise default to first
      const exists = classStudents.some(s => s.id === selectedStudentId);
      if (!exists) {
        setSelectedStudentId(classStudents[0].id);
      }
    } else if (classStudents.length === 0) {
      setSelectedStudentId('');
    }
  }, [selectedClassId, classStudents, viewMode, selectedStudentId]);

  // Filter Active Subjects for local class
  const classSubjects = useMemo(() => {
    if (!selectedClassId) return [];
    const classObj = classes.find(c => c.id === selectedClassId);
    if (!classObj) return [];

    let sIds: string[] = [];
    if (Array.isArray(classObj.subject_ids)) {
      sIds = classObj.subject_ids;
    } else if (typeof classObj.subject_ids === 'string') {
      try {
        const parsed = JSON.parse(classObj.subject_ids);
        sIds = Array.isArray(parsed) ? parsed : [parsed];
      } catch {
        sIds = classObj.subject_ids ? [classObj.subject_ids] : [];
      }
    }

    if (sIds.length > 0) {
      return subjects.filter(sub => sIds.includes(sub.id));
    }
    // Fallback: assessments subject_id linkages
    return subjects.filter(sub => 
      assessments.some(a => a.class_id === selectedClassId && a.subject_id === sub.id)
    );
  }, [selectedClassId, classes, subjects, assessments]);

  // Calendar specific events
  const classSchoolDays = useMemo(() => {
    if (!selectedClassId) return [];
    return calendarEvents.filter(e => !e.class_id || e.class_id === selectedClassId);
  }, [selectedClassId, calendarEvents]);

  // Robust total class days count calculation
  const totalClassDays = useMemo(() => {
    if (classSchoolDays.length > 0) return classSchoolDays.length;
    
    // Fallback 1: unique attendance dates marked for this class
    const markedDates = new Set(
      attendanceData
        .filter(a => a.class_id === selectedClassId)
        .map(a => a.date)
    );
    if (markedDates.size > 0) return markedDates.size;
    
    // Fallback 2: standard typical calendar value
    return 30;
  }, [selectedClassId, classSchoolDays, attendanceData]);

  // Date parser function for month columns (0 to 11)
  const getMonthFromDate = (dateStr: string): number => {
    if (!dateStr) return -1;
    if (dateStr.includes('-')) {
      const parts = dateStr.split('-');
      if (parts.length >= 2) return parseInt(parts[1], 10) - 1;
    }
    if (dateStr.includes('/')) {
      const parts = dateStr.split('/');
      if (parts.length >= 2) return parseInt(parts[1], 10) - 1;
    }
    return -1;
  };

  // Helper list of months matching columns in Portuguese
  const monthsList = [
    { label: 'JAN', index: 0 },
    { label: 'FEV', index: 1 },
    { label: 'MAR', index: 2 },
    { label: 'ABR', index: 3 },
    { label: 'MAI', index: 4 },
    { label: 'JUN', index: 5 },
    { label: 'JUL', index: 6 },
    { label: 'AGO', index: 7 },
    { label: 'SET', index: 8 },
    { label: 'OUT', index: 9 },
    { label: 'NOV', index: 10 },
    { label: 'DEZ', index: 11 }
  ];

  // Core calculations memo to map student performance structured cards
  const studentReports = useMemo(() => {
    if (!selectedClassId || classStudents.length === 0 || classSubjects.length === 0) return [];

    return classStudents.map(student => {
      // 1. Calculate general stats across multiple subjects
      const subjectsPerformance = classSubjects.map(sub => {
        
        // 1a. Attendance per subject month
        const subjectAttendances = attendanceData.filter(a => 
          a.student_id === student.id && 
          a.class_id === selectedClassId &&
          a.subject_id === sub.id
        );

        // Calculate absences per Month Index
        const monthlyAbsences: Record<number, number> = {};
        monthsList.forEach(m => { monthlyAbsences[m.index] = 0; });
        
        subjectAttendances.forEach(a => {
          if (a.status === 'F') {
            const mIdx = getMonthFromDate(a.date);
            if (mIdx >= 0 && mIdx < 12) {
              monthlyAbsences[mIdx] += 1;
            }
          }
        });

        const totalAbsences = subjectAttendances.filter(a => a.status === 'F').length;
        const presencePct = totalClassDays > 0 
          ? Math.max(0, Math.min(100, ((totalClassDays - totalAbsences) / totalClassDays) * 100))
          : 100;

        const isAttendanceApproved = presencePct >= (100 - (academicParams.absence_limit_percentage || 40));

        // 1b. Grades resolver: search "Resultado Final" first, else average assessments
        const finalGradeRecord = dbGrades.find(g => 
          g.student_id === student.id && 
          g.class_id === selectedClassId && 
          g.subject_id === sub.id && 
          g.period === 'Resultado Final'
        );

        let finalGradeValue: number | null = null;
        let isCalculated = false;

        // Fetch all subject assessments
        const subAssessments = assessments.filter(a => 
          a.class_id === selectedClassId && 
          a.subject_id === sub.id
        );
        const assessmentIds = subAssessments.map(a => a.id);
        const assessmentTitles = subAssessments.map(a => a.title);

        const studentSubGrades = dbGrades.filter(g => 
          g.student_id === student.id && 
          g.class_id === selectedClassId && 
          g.subject_id === sub.id && 
          (assessmentIds.includes(g.period) || assessmentTitles.includes(g.period)) &&
          g.value !== null && g.value !== undefined && g.value !== ''
        );

        if (finalGradeRecord && finalGradeRecord.value !== null && finalGradeRecord.value !== undefined && finalGradeRecord.value !== '') {
          finalGradeValue = typeof finalGradeRecord.value === 'string'
            ? parseFloat(finalGradeRecord.value.replace(',', '.'))
            : finalGradeRecord.value;
        } else if (subAssessments.length > 0 && studentSubGrades.length > 0) {
          const sum = studentSubGrades.reduce((acc, curr) => {
            const v = typeof curr.value === 'string' ? parseFloat(curr.value.replace(',', '.')) : curr.value;
            return acc + (v || 0);
          }, 0);
          finalGradeValue = sum / subAssessments.length;
          isCalculated = true;
        }

        // Split assessments into 1ª and 2ª parts to represent standard mid-term / final-term evaluation
        let grade1: number | null = null;
        let grade2: number | null = null;

        // Try exact match first
        const g1Record = dbGrades.find(g => 
          g.student_id === student.id && 
          g.class_id === selectedClassId && 
          g.subject_id === sub.id && 
          (g.period === 'Avaliação 1' || g.period === '1ª Avaliação' || g.period === '1º Bimestre')
        );
        const g2Record = dbGrades.find(g => 
          g.student_id === student.id && 
          g.class_id === selectedClassId && 
          g.subject_id === sub.id && 
          (g.period === 'Avaliação 2' || g.period === '2ª Avaliação' || g.period === '2º Bimestre')
        );

        if (g1Record && g1Record.value !== null && g1Record.value !== '') {
          grade1 = typeof g1Record.value === 'string' ? parseFloat(g1Record.value.replace(',', '.')) : g1Record.value;
        }
        if (g2Record && g2Record.value !== null && g2Record.value !== '') {
          grade2 = typeof g2Record.value === 'string' ? parseFloat(g2Record.value.replace(',', '.')) : g2Record.value;
        }

        // Fallback: If no exact pre-named periods exist, split student assessments sequentially by date
        if (grade1 === null && grade2 === null && studentSubGrades.length > 0) {
          const sortedAssessments = [...subAssessments].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
          const halfIndex = Math.ceil(sortedAssessments.length / 2);
          
          const g1Ids = sortedAssessments.slice(0, halfIndex).map(a => a.id);
          const g1Titles = sortedAssessments.slice(0, halfIndex).map(a => a.title);
          const g2Ids = sortedAssessments.slice(halfIndex).map(a => a.id);
          const g2Titles = sortedAssessments.slice(halfIndex).map(a => a.title);

          const g1Matches = studentSubGrades.filter(g => g1Ids.includes(g.period) || g1Titles.includes(g.period));
          const g2Matches = studentSubGrades.filter(g => g2Ids.includes(g.period) || g2Titles.includes(g.period));

          if (g1Matches.length > 0) {
            const sumG1 = g1Matches.reduce((acc, curr) => acc + (typeof curr.value === 'string' ? parseFloat(curr.value.replace(',', '.')) : curr.value || 0), 0);
            grade1 = sumG1 / g1Matches.length;
          }
          if (g2Matches.length > 0) {
            const sumG2 = g2Matches.reduce((acc, curr) => acc + (typeof curr.value === 'string' ? parseFloat(curr.value.replace(',', '.')) : curr.value || 0), 0);
            grade2 = sumG2 / g2Matches.length;
          }
        }

        // Determine Status per Subject
        let subjectStatus: 'Aprovado' | 'Reprovado' | 'Recuperação' | 'Pendente' = 'Pendente';
        const minApp = academicParams.approval_grade || 5.0;

        if (!isAttendanceApproved) {
          subjectStatus = 'Reprovado';
        } else if (finalGradeValue === null) {
          subjectStatus = 'Pendente';
        } else if (finalGradeValue >= minApp) {
          subjectStatus = 'Aprovado';
        } else if (finalGradeValue >= (academicParams.recovery_grade || 4.0)) {
          subjectStatus = 'Recuperação';
        } else {
          subjectStatus = 'Reprovado'; // If below recovery limit
        }

        return {
          subjectId: sub.id,
          subjectCode: sub.code || '000',
          subjectName: sub.name,
          monthlyAbsences,
          totalAbsences,
          presencePercentage: presencePct,
          isAttendanceApproved,
          grade1,
          grade2,
          finalGrade: finalGradeValue,
          isCalculated,
          status: subjectStatus
        };
      });

      // Calculate Class averages for the summary footer
      let overallAbsences = 0;
      let validGradesCount = 0;
      let overallGradesSum = 0;
      let overallPresenceSum = 0;

      subjectsPerformance.forEach(sp => {
        overallAbsences += sp.totalAbsences;
        overallPresenceSum += sp.presencePercentage;
        if (sp.finalGrade !== null) {
          validGradesCount++;
          overallGradesSum += sp.finalGrade;
        }
      });

      const averageFrequency = classSubjects.length > 0 ? (overallPresenceSum / classSubjects.length) : 100;
      const averageGrade = validGradesCount > 0 ? (overallGradesSum / validGradesCount) : 0;

      // Class status evaluation
      let finalStatus: 'Aprovado' | 'Recuperação' | 'Reprovado' | 'Pendente' = 'Aprovado';
      const hasPending = subjectsPerformance.some(sp => sp.status === 'Pendente');
      const minApp = academicParams.approval_grade || 5.0;
      const attendanceThreshold = 100 - (academicParams.absence_limit_percentage || 40);
      const isAttendanceApprovedClass = averageFrequency >= attendanceThreshold;

      if (!isAttendanceApprovedClass) {
        finalStatus = 'Reprovado';
      } else if (hasPending) {
        finalStatus = 'Pendente';
      } else {
        const failedSubjectCount = subjectsPerformance.filter(sp => sp.finalGrade !== null && sp.finalGrade < minApp).length;
        if (failedSubjectCount > 0) {
          // If failing in 1 or 2 subjects => eligible for Recuperação, if more => Reprovado
          finalStatus = failedSubjectCount <= 2 ? 'Recuperação' : 'Reprovado';
        }
      }

      return {
        student,
        subjectsPerformance,
        totalAbsences: overallAbsences,
        averageFrequency,
        averageGrade,
        finalStatus
      };
    });
  }, [selectedClassId, classStudents, classSubjects, attendanceData, dbGrades, assessments, academicParams, totalClassDays]);

  // Current selected student report (individual bulletin card)
  const activeStudentReport = useMemo(() => {
    if (!selectedStudentId) return null;
    return studentReports.find(r => r.student.id === selectedStudentId) || null;
  }, [selectedStudentId, studentReports]);

  // General filter for class table
  const filteredReports = useMemo(() => {
    if (!searchQuery) return studentReports;
    return studentReports.filter(r => 
      r.student.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      (r.student.registration_number && r.student.registration_number.toLowerCase().includes(searchQuery.toLowerCase()))
    );
  }, [searchQuery, studentReports]);

  // Print current screen report card
  const handlePrint = () => {
    window.print();
  };

  // Helper function to format grade values safely
  const formatGrade = (val: any): string => {
    if (val === null || val === undefined || val === '') return '-';
    const num = typeof val === 'string' ? parseFloat(val.replace(',', '.')) : val;
    if (isNaN(num)) return '-';
    return parseFloat(num.toFixed(2)).toString();
  };

  const formatPresence = (val: number | null | undefined): string => {
    if (val === null || val === undefined) return '100,0';
    return val.toFixed(1).replace('.', ',');
  };

  // 1. Export Dynamic Individual Report Card as A4 PDF
  const exportIndividualPDF = (reportToPdf: any) => {
    if (!reportToPdf) return;
    setExportingPDF(true);

    try {
      const doc = new jsPDF({
        orientation: 'p',
        unit: 'mm',
        format: 'a4'
      });

      const pageWidth = doc.internal.pageSize.width;
      const margin = 15;
      const centerX = pageWidth / 2;
      let y = 15;

      const darkColor = [33, 41, 54]; // Dark slate

      // --- 1. Logo or School Standard Header ---
      let textStartX = margin;
      let logoWidth = 0;

      if (institution?.logo_url) {
        try { 
          doc.addImage(institution.logo_url, 'auto', margin, y, 22, 22); 
          logoWidth = 26;
        } catch (e) {}
      }
      
      textStartX = margin + logoWidth;

      doc.setTextColor(0, 0, 0);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text('DIOCESE DE GUARULHOS', textStartX, y + 5);

      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text(institution?.name?.toUpperCase() || 'ESCMIN - GESTÃO ESCOLAR', textStartX, y + 12);
      
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(80);
      const subTitleText = (institution?.subtitle || institution?.address || 'SECRETARIA ACADÊMICA').toUpperCase();
      doc.text(subTitleText, textStartX, y + 17);

      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.8);
      doc.line(margin, y + 24, pageWidth - margin, y + 24);

      y += 32;

      // --- 2. Centered Page Title ---
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(darkColor[0], darkColor[1], darkColor[2]);
      doc.text('BOLETIM ESCOLAR DE RENDIMENTO ACADÊMICO', centerX, y, { align: 'center' });

      // --- 3. Student Metadata block ---
      const activeClassObj = classes.find(c => c.id === selectedClassId);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(60);
      doc.text('ALUNO:', 15, y + 10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(30);
      doc.text(`${reportToPdf.student.registration_number || 'S/M'} - ${reportToPdf.student.name.toUpperCase()}`, 32, y + 10);

      doc.setFont('helvetica', 'bold');
      doc.setTextColor(60);
      doc.text('SITUAÇÃO:', 150, y + 10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(30);
      doc.text(`${reportToPdf.student.status || 'Ativo'}`.toUpperCase(), 170, y + 10);

      doc.setFont('helvetica', 'bold');
      doc.setTextColor(60);
      doc.text('TURMA:', 15, y + 16);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(30);
      doc.text(`${activeClassObj?.name || 'N/D'}`.toUpperCase(), 32, y + 16);

      doc.setFont('helvetica', 'bold');
      doc.setTextColor(60);
      doc.text('PERÍODO:', 150, y + 16);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(30);
      doc.text(`${activeClassObj?.period || 'Noite'} - ${(activeClassObj?.days_of_week || []).join(', ') || 'Semanal'}`.toUpperCase(), 170, y + 16);

      doc.setDrawColor(220);
      doc.setLineWidth(0.3);
      doc.line(margin, y + 20, pageWidth - margin, y + 20);

      const tableStartY = y + 23;

      // --- 4. VIA FREQUÊNCIA: Monthly Absences Table ---
      const headersFreq: any[] = [[
        { content: 'Disciplinas (Controle de Faltas Mensais)', styles: { halign: 'left' as any, valign: 'middle' as any } },
        'JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ',
        { content: 'Qt. Faltas', styles: { halign: 'center' as any, valign: 'middle' as any } },
        { content: '% Freq.', styles: { halign: 'center' as any, valign: 'middle' as any } }
      ]];

      const rowsFreq = reportToPdf.subjectsPerformance.map((sp: any) => {
        const row = [
          `${sp.subjectCode} - ${sp.subjectName}`
        ];
        monthsList.forEach(m => {
          const abs = sp.monthlyAbsences[m.index];
          row.push(abs > 0 ? abs.toString() : '');
        });
        row.push(sp.totalAbsences.toString());
        row.push(formatPresence(sp.presencePercentage) + '%');
        return row;
      });

      autoTable(doc, {
        head: headersFreq,
        body: rowsFreq,
        startY: tableStartY,
        theme: 'grid',
        styles: {
          fontSize: 7,
          cellPadding: { top: 2, bottom: 2, left: 0.5, right: 0.5 },
          lineColor: [226, 232, 240],
          lineWidth: 0.15,
          textColor: [33, 41, 54],
          font: 'helvetica'
        },
        headStyles: {
          fillColor: [241, 245, 249],
          textColor: [15, 23, 42],
          fontStyle: 'bold',
          fontSize: 6.8,
          lineWidth: 0.15,
          lineColor: [226, 232, 240]
        },
        columnStyles: {
          0: { cellWidth: 54, fontStyle: 'bold' },
          1: { cellWidth: 8.5, halign: 'center' },
          2: { cellWidth: 8.5, halign: 'center' },
          3: { cellWidth: 8.5, halign: 'center' },
          4: { cellWidth: 8.5, halign: 'center' },
          5: { cellWidth: 8.5, halign: 'center' },
          6: { cellWidth: 8.5, halign: 'center' },
          7: { cellWidth: 8.5, halign: 'center' },
          8: { cellWidth: 8.5, halign: 'center' },
          9: { cellWidth: 8.5, halign: 'center' },
          10: { cellWidth: 8.5, halign: 'center' },
          11: { cellWidth: 8.5, halign: 'center' },
          12: { cellWidth: 8.5, halign: 'center' },
          13: { cellWidth: 11, halign: 'center' },
          14: { cellWidth: 13, halign: 'center' }
        }
      });

      const nextY = (doc as any).lastAutoTable.finalY + 8;

      // --- 5. VIA RENDIMENTO: Grades and Academic Performance Table ---
      const headersGrades: any[] = [[
        { content: 'Disciplinas (Aproveitamento Acadêmico)', styles: { halign: 'left' as any, valign: 'middle' as any } },
        { content: '1ª Nota', styles: { halign: 'center' as any, valign: 'middle' as any } },
        { content: '2ª Nota', styles: { halign: 'center' as any, valign: 'middle' as any } },
        { content: 'Média Final', styles: { halign: 'center' as any, valign: 'middle' as any } },
        { content: 'Situação Geral', styles: { halign: 'center' as any, valign: 'middle' as any } }
      ]];

      const rowsGrades = reportToPdf.subjectsPerformance.map((sp: any) => {
        return [
          `${sp.subjectCode} - ${sp.subjectName}`,
          formatGrade(sp.grade1),
          formatGrade(sp.grade2),
          formatGrade(sp.finalGrade),
          sp.status === 'Pendente' ? 'Pendente' : sp.status
        ];
      });

      autoTable(doc, {
        head: headersGrades,
        body: rowsGrades,
        startY: nextY,
        theme: 'grid',
        styles: {
          fontSize: 7.5,
          cellPadding: { top: 2.2, bottom: 2.2, left: 1.5, right: 1.5 },
          lineColor: [226, 232, 240],
          lineWidth: 0.15,
          textColor: [33, 41, 54],
          font: 'helvetica'
        },
        headStyles: {
          fillColor: [241, 245, 249],
          textColor: [15, 23, 42],
          fontStyle: 'bold',
          fontSize: 7,
          lineWidth: 0.15,
          lineColor: [226, 232, 240]
        },
        columnStyles: {
          0: { cellWidth: 92, fontStyle: 'bold' },
          1: { cellWidth: 20, halign: 'center' },
          2: { cellWidth: 20, halign: 'center' },
          3: { cellWidth: 20, halign: 'center' },
          4: { cellWidth: 28, halign: 'center', fontStyle: 'bold' }
        }
      });

      // --- 6. Summary Footer block ---
      const finalY = (doc as any).lastAutoTable.finalY + 4;
      
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.2);

      // Drawing elegant averages summary card aligned to the right margin (195mm)
      // Card width is 80mm, so starting X is 195 - 80 = 115mm
      doc.setFillColor(248, 250, 252);
      doc.rect(115, finalY, 80, 14, 'F');
      doc.rect(115, finalY, 80, 14, 'S');

      doc.line(155, finalY, 155, finalY + 14);
      doc.line(115, finalY + 7, 195, finalY + 7);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      doc.setTextColor(51, 65, 85);
      doc.text('MÉDIA DE FREQUÊNCIA', 135, finalY + 4.5, { align: 'center' });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.text(`${formatPresence(reportToPdf.averageFrequency)}%`, 135, finalY + 11.5, { align: 'center' });

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      doc.text('MÉDIA GERAL DE NOTAS', 175, finalY + 4.5, { align: 'center' });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.text(formatGrade(reportToPdf.averageGrade), 175, finalY + 11.5, { align: 'center' });

      // --- 7. Bottom System Footer ---
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.3);
      doc.line(margin, 282, pageWidth - margin, 282);

      const todayFormatted = new Date().toLocaleDateString('pt-BR');
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(120);
      doc.text(`Relatório Emitido em ${todayFormatted}`, margin, 288);
      doc.text('ESCMIN - Sistema de Gestão de Secretaria', centerX, 288, { align: 'center' });
      doc.text('Página 1 de 1', pageWidth - margin, 288, { align: 'right' });

      doc.save(`boletim_${reportToPdf.student.name.toLowerCase().replace(/\s+/g, '_')}_${new Date().getFullYear()}.pdf`);
    } catch (err) {
      console.error('Error generating individual PDF:', err);
    } finally {
      setKeepStateTimeout(() => setExportingPDF(false), 800);
    }
  };

  // 2. Export Class-wide summary situation report as PDF (fixed and aligned)
  const exportClassSummaryPDF = () => {
    if (!selectedClassId) return;
    setExportingPDF(true);

    try {
      const doc = new jsPDF({
        orientation: 'p',
        unit: 'mm',
        format: 'a4'
      });

      const pageWidth = doc.internal.pageSize.width;
      const margin = 15;
      const centerX = pageWidth / 2;
      let y = 15;

      const activeClassObj = classes.find(c => c.id === selectedClassId);

      // --- 1. Logo or School Standard Header ---
      let textStartX = margin;
      let logoWidth = 0;

      if (institution?.logo_url) {
        try { 
          doc.addImage(institution.logo_url, 'auto', margin, y, 22, 22); 
          logoWidth = 26;
        } catch (e) {}
      }
      
      textStartX = margin + logoWidth;

      doc.setTextColor(0, 0, 0);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text('DIOCESE DE GUARULHOS', textStartX, y + 5);

      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text(institution?.name?.toUpperCase() || 'ESCMIN - GESTÃO ESCOLAR', textStartX, y + 12);
      
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(80);
      const subTitleText = (institution?.subtitle || institution?.address || 'SECRETARIA ACADÊMICA').toUpperCase();
      doc.text(subTitleText, textStartX, y + 17);

      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.8);
      doc.line(margin, y + 24, pageWidth - margin, y + 24);

      y += 32;

      // --- 2. Centered Page Title ---
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(33, 41, 54);
      doc.text('RELATÓRIO RESUMIDO DE RENDIMENTO ACADÊMICO', centerX, y, { align: 'center' });

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(100);
      doc.text(`Turma: ${activeClassObj?.name || 'N/D'} | Semestre: ${activeClassObj?.semester || '1º'} | Turno: ${activeClassObj?.period || 'Noite'}`, centerX, y + 6, { align: 'center' });
      doc.text(`Quantidade total de dias letivos considerados: ${totalClassDays} dias`, centerX, y + 11, { align: 'center' });

      y += 18;

      // Statistics grid
      const total = studentReports.length;
      const approved = studentReports.filter(r => r.finalStatus === 'Aprovado').length;
      const recuperation = studentReports.filter(r => r.finalStatus === 'Recuperação').length;
      const failed = studentReports.filter(r => r.finalStatus === 'Reprovado').length;
      const pending = studentReports.filter(r => r.finalStatus === 'Pendente').length;

      doc.setFillColor(248, 250, 252);
      doc.rect(margin, y, pageWidth - (margin * 2), 14, 'F');
      doc.setDrawColor(226, 232, 240);
      doc.rect(margin, y, pageWidth - (margin * 2), 14, 'S');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(71, 85, 105);
      doc.text(`Total Alunos: ${total}`, margin + 5, y + 8.5);
      doc.text(`Aprovados: ${approved}`, margin + 35, y + 8.5);
      doc.text(`Em Recuperação: ${recuperation}`, margin + 70, y + 8.5);
      doc.text(`Reprovados: ${failed}`, margin + 112, y + 8.5);
      doc.text(`Pendentes: ${pending}`, margin + 148, y + 8.5);

      y += 20;

      // Student rows Table
      const headers = [['Matrícula (RA)', 'Aluno', 'Média Notas', 'Total Faltas', 'Freq. %', 'Situação Geral']];
      const rows = filteredReports.map(res => [
        res.student.registration_number || 'N/D',
        res.student.name.toUpperCase(),
        formatGrade(res.averageGrade),
        res.totalAbsences.toString(),
        `${formatPresence(res.averageFrequency)}%`,
        res.finalStatus.toUpperCase()
      ]);

      autoTable(doc, {
        head: headers,
        body: rows,
        startY: y,
        theme: 'grid',
        styles: { 
          fontSize: 8, 
          cellPadding: { top: 2.5, bottom: 2.5, left: 2, right: 2 },
          lineColor: [226, 232, 240],
          lineWidth: 0.15,
          textColor: [33, 41, 54],
          font: 'helvetica'
        },
        headStyles: { 
          fillColor: [241, 245, 249], 
          textColor: [15, 23, 42], 
          fontStyle: 'bold',
          lineWidth: 0.15,
          lineColor: [226, 232, 240]
        },
        columnStyles: {
          0: { cellWidth: 28 },
          1: { cellWidth: 62 },
          2: { cellWidth: 22, halign: 'center' },
          3: { cellWidth: 22, halign: 'center' },
          4: { cellWidth: 20, halign: 'center' },
          5: { cellWidth: 26, halign: 'center', fontStyle: 'bold' }
        }
      });

      // Bottom footer information
      const finalHeight = doc.internal.pageSize.height;
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.3);
      doc.line(margin, finalHeight - 15, pageWidth - margin, finalHeight - 15);

      const todayFormatted = new Date().toLocaleDateString('pt-BR');
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(140);
      doc.text(`Relatório emitido em ${todayFormatted}`, margin, finalHeight - 9);
      doc.text('ESCMIN - Sistema de Gestão de Secretaria', centerX, finalHeight - 9, { align: 'center' });
      doc.text('Página 1 de 1', pageWidth - margin, finalHeight - 9, { align: 'right' });

      doc.save(`situacao_academica_turma_${activeClassObj?.name.toLowerCase().replace(/\s+/g, '_') || 'classe'}.pdf`);
    } catch (e) {
      console.error('Error generating class summary PDF:', e);
    } finally {
      setKeepStateTimeout(() => setExportingPDF(false), 800);
    }
  };

  // 3. Export ALL active bulletins of the class sequentially (Lote) in a single dynamic file!
  const exportAllClassBulletinsPDF = () => {
    if (!selectedClassId || studentReports.length === 0) return;
    setExportingPDF(true);

    try {
      const doc = new jsPDF({
        orientation: 'p',
        unit: 'mm',
        format: 'a4'
      });

      const pageWidth = doc.internal.pageSize.width;
      const margin = 15;
      const centerX = pageWidth / 2;

      const darkColor = [33, 41, 54];
      const activeClassObj = classes.find(c => c.id === selectedClassId);

      studentReports.forEach((report, index) => {
        // Only trigger page addition if index > 0 (subsequent pages)
        if (index > 0) {
          doc.addPage();
        }

        let y = 15;

        // --- 1. Logo or School Standard Header ---
        let textStartX = margin;
        let logoWidth = 0;

        if (institution?.logo_url) {
          try { 
            doc.addImage(institution.logo_url, 'auto', margin, y, 22, 22); 
            logoWidth = 26;
          } catch (e) {}
        }
        
        textStartX = margin + logoWidth;

        doc.setTextColor(0, 0, 0);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.text('DIOCESE DE GUARULHOS', textStartX, y + 5);

        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.text(institution?.name?.toUpperCase() || 'ESCMIN - GESTÃO ESCOLAR', textStartX, y + 12);
        
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(80);
        const subTitleText = (institution?.subtitle || institution?.address || 'SECRETARIA ACADÊMICA').toUpperCase();
        doc.text(subTitleText, textStartX, y + 17);

        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(0.8);
        doc.line(margin, y + 24, pageWidth - margin, y + 24);

        y += 32;

        // --- 2. Centered Page Title ---
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(darkColor[0], darkColor[1], darkColor[2]);
        doc.text('BOLETIM ESCOLAR DE RENDIMENTO ACADÊMICO', centerX, y, { align: 'center' });

        // --- 3. Student Metadata block ---
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(60);
        doc.text('ALUNO:', 15, y + 10);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(30);
        doc.text(`${report.student.registration_number || 'S/M'} - ${report.student.name.toUpperCase()}`, 32, y + 10);

        doc.setFont('helvetica', 'bold');
        doc.setTextColor(60);
        doc.text('SITUAÇÃO:', 150, y + 10);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(30);
        doc.text(`${report.student.status || 'Ativo'}`.toUpperCase(), 170, y + 10);

        doc.setFont('helvetica', 'bold');
        doc.setTextColor(60);
        doc.text('TURMA:', 15, y + 16);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(30);
        doc.text(`${activeClassObj?.name || 'N/D'}`.toUpperCase(), 32, y + 16);

        doc.setFont('helvetica', 'bold');
        doc.setTextColor(60);
        doc.text('PERÍODO:', 150, y + 16);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(30);
        doc.text(`${activeClassObj?.period || 'Noite'} - ${(activeClassObj?.days_of_week || []).join(', ') || 'Semanal'}`.toUpperCase(), 170, y + 16);

        doc.setDrawColor(220);
        doc.setLineWidth(0.3);
        doc.line(margin, y + 20, pageWidth - margin, y + 20);

        const tableStartY = y + 23;

        // --- 4. VIA FREQUÊNCIA: Monthly Absences Table ---
        const headersFreq: any[] = [[
          { content: 'Disciplinas (Controle de Faltas Mensais)', styles: { halign: 'left' as any, valign: 'middle' as any } },
          'JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ',
          { content: 'Qt. Faltas', styles: { halign: 'center' as any, valign: 'middle' as any } },
          { content: '% Freq.', styles: { halign: 'center' as any, valign: 'middle' as any } }
        ]];

        const rowsFreq = report.subjectsPerformance.map((sp: any) => {
          const row = [
            `${sp.subjectCode} - ${sp.subjectName}`
          ];
          monthsList.forEach(m => {
            const abs = sp.monthlyAbsences[m.index];
            row.push(abs > 0 ? abs.toString() : '');
          });
          row.push(sp.totalAbsences.toString());
          row.push(formatPresence(sp.presencePercentage) + '%');
          return row;
        });

        autoTable(doc, {
          head: headersFreq,
          body: rowsFreq,
          startY: tableStartY,
          theme: 'grid',
          styles: {
            fontSize: 7,
            cellPadding: { top: 2, bottom: 2, left: 0.5, right: 0.5 },
            lineColor: [226, 232, 240],
            lineWidth: 0.15,
            textColor: [33, 41, 54],
            font: 'helvetica'
          },
          headStyles: {
            fillColor: [241, 245, 249],
            textColor: [15, 23, 42],
            fontStyle: 'bold',
            fontSize: 6.8,
            lineWidth: 0.15,
            lineColor: [226, 232, 240]
          },
          columnStyles: {
            0: { cellWidth: 54, fontStyle: 'bold' },
            1: { cellWidth: 8.5, halign: 'center' },
            2: { cellWidth: 8.5, halign: 'center' },
            3: { cellWidth: 8.5, halign: 'center' },
            4: { cellWidth: 8.5, halign: 'center' },
            5: { cellWidth: 8.5, halign: 'center' },
            6: { cellWidth: 8.5, halign: 'center' },
            7: { cellWidth: 8.5, halign: 'center' },
            8: { cellWidth: 8.5, halign: 'center' },
            9: { cellWidth: 8.5, halign: 'center' },
            10: { cellWidth: 8.5, halign: 'center' },
            11: { cellWidth: 8.5, halign: 'center' },
            12: { cellWidth: 8.5, halign: 'center' },
            13: { cellWidth: 11, halign: 'center' },
            14: { cellWidth: 13, halign: 'center' }
          }
        });

        const nextY = (doc as any).lastAutoTable.finalY + 8;

        // --- 5. VIA RENDIMENTO: Grades and Academic Performance Table ---
        const headersGrades: any[] = [[
          { content: 'Disciplinas (Aproveitamento Acadêmico)', styles: { halign: 'left' as any, valign: 'middle' as any } },
          { content: '1ª Nota', styles: { halign: 'center' as any, valign: 'middle' as any } },
          { content: '2ª Nota', styles: { halign: 'center' as any, valign: 'middle' as any } },
          { content: 'Média Final', styles: { halign: 'center' as any, valign: 'middle' as any } },
          { content: 'Situação Geral', styles: { halign: 'center' as any, valign: 'middle' as any } }
        ]];

        const rowsGrades = report.subjectsPerformance.map((sp: any) => {
          return [
            `${sp.subjectCode} - ${sp.subjectName}`,
            formatGrade(sp.grade1),
            formatGrade(sp.grade2),
            formatGrade(sp.finalGrade),
            sp.status === 'Pendente' ? 'Pendente' : sp.status
          ];
        });

        autoTable(doc, {
          head: headersGrades,
          body: rowsGrades,
          startY: nextY,
          theme: 'grid',
          styles: {
            fontSize: 7.5,
            cellPadding: { top: 2.2, bottom: 2.2, left: 1.5, right: 1.5 },
            lineColor: [226, 232, 240],
            lineWidth: 0.15,
            textColor: [33, 41, 54],
            font: 'helvetica'
          },
          headStyles: {
            fillColor: [241, 245, 249],
            textColor: [15, 23, 42],
            fontStyle: 'bold',
            fontSize: 7,
            lineWidth: 0.15,
            lineColor: [226, 232, 240]
          },
          columnStyles: {
            0: { cellWidth: 92, fontStyle: 'bold' },
            1: { cellWidth: 20, halign: 'center' },
            2: { cellWidth: 20, halign: 'center' },
            3: { cellWidth: 20, halign: 'center' },
            4: { cellWidth: 28, halign: 'center', fontStyle: 'bold' }
          }
        });

        // --- 6. Summary Footer block ---
        const finalY = (doc as any).lastAutoTable.finalY + 4;
        
        doc.setDrawColor(226, 232, 240);
        doc.setLineWidth(0.2);

        doc.setFillColor(248, 250, 252);
        doc.rect(115, finalY, 80, 14, 'F');
        doc.rect(115, finalY, 80, 14, 'S');

        doc.line(155, finalY, 155, finalY + 14);
        doc.line(115, finalY + 7, 195, finalY + 7);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.5);
        doc.setTextColor(51, 65, 85);
        doc.text('MÉDIA DE FREQUÊNCIA', 135, finalY + 4.5, { align: 'center' });
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.text(`${formatPresence(report.averageFrequency)}%`, 135, finalY + 11.5, { align: 'center' });

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.5);
        doc.text('MÉDIA GERAL DE NOTAS', 175, finalY + 4.5, { align: 'center' });
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.text(formatGrade(report.averageGrade), 175, finalY + 11.5, { align: 'center' });

        // --- 7. Bottom System Footer ---
        doc.setDrawColor(226, 232, 240);
        doc.setLineWidth(0.3);
        doc.line(margin, 282, pageWidth - margin, 282);

        const todayFormatted = new Date().toLocaleDateString('pt-BR');
        doc.setFontSize(7.5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(120);
        doc.text(`Relatório Emitido em ${todayFormatted}`, margin, 288);
        doc.text('ESCMIN - Sistema de Gestão de Secretaria', centerX, 288, { align: 'center' });
        doc.text(`Alunos: ${index + 1} de ${studentReports.length}`, pageWidth - margin, 288, { align: 'right' });
      });

      doc.save(`boletins_lote_turma_${activeClassObj?.name.toLowerCase().replace(/\s+/g, '_') || 'classe'}.pdf`);
    } catch (e) {
      console.error('Error in batch PDF export:', e);
    } finally {
      setKeepStateTimeout(() => setExportingPDF(false), 800);
    }
  };

  // Safe helper to timeout spinner
  const setKeepStateTimeout = (fn: Function, ms: number) => {
    const timer = setTimeout(fn, ms);
    return () => clearTimeout(timer);
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-750">
      
      {/* Page Core Header Frame */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-6 border-b border-slate-200 print:hidden">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 p-2 bg-white rounded-none border border-slate-205 flex items-center justify-center overflow-hidden">
            {institution?.logo_url ? (
               <img src={institution.logo_url} alt="Logo" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
            ) : (
               <FileSpreadsheet size={24} className="text-slate-600" />
            )}
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight uppercase">Boletim Escolar</h2>
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 mt-0.5">
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-slate-400" />
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">
                  {institution?.name || 'DIOCESE DE GUARULHOS'}
                </p>
              </div>
              <div className="hidden sm:block w-1 h-1 bg-slate-300" />
              <span className="text-[10px] font-semibold text-slate-600 uppercase tracking-widest bg-slate-100/70 px-3 py-1 border border-slate-200">
                Informativo & Notas
              </span>
            </div>
          </div>
        </div>

        {/* Action Widgets */}
        {selectedClassId && (
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => setViewMode('student')}
              className={cn(
                "px-4 py-2 border rounded-none text-[10px] font-semibold uppercase tracking-wider transition-all leading-none",
                viewMode === 'student' 
                  ? "bg-slate-900 text-white border-slate-900 shadow-sm" 
                  : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
              )}
            >
              Individual por Aluno
            </button>
            <button
              onClick={() => setViewMode('class')}
              className={cn(
                "px-4 py-2 border rounded-none text-[10px] font-semibold uppercase tracking-wider transition-all leading-none",
                viewMode === 'class' 
                  ? "bg-slate-900 text-white border-slate-900 shadow-sm" 
                  : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
              )}
            >
              Por Turma (Resumido)
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="min-h-[400px] flex items-center justify-center flex-col gap-3">
          <Loader2 className="animate-spin text-slate-400" size={32} />
          <p className="text-[10px] font-bold text-slate-450 uppercase tracking-widest">Carregando Diários de Notas...</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Filtering parameters section */}
          <div className="bg-white rounded-none border border-slate-200 shadow-sm p-4 md:p-5 print:hidden">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-end">
              
              {/* Select target class */}
              <div className="md:col-span-4 space-y-1.5">
                <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest ml-1">Turma</label>
                <div className="relative group">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 w-8 h-8 bg-white flex items-center justify-center text-slate-400 border border-slate-205">
                     <School size={15} />
                  </div>
                  <select
                    value={selectedClassId}
                    onChange={(e) => {
                      setSelectedClassId(e.target.value);
                      setSelectedStudentId('');
                    }}
                    className="w-full pl-12 pr-8 py-2.5 bg-white border border-slate-200 rounded-none text-[11px] font-semibold text-slate-800 appearance-none outline-none focus:border-slate-400 transition-colors"
                  >
                    <option value="">SELECIONAR TURMA...</option>
                    {classes.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={14} />
                </div>
              </div>

              {/* View mode custom filter inputs */}
              {selectedClassId && viewMode === 'student' && (
                <div className="md:col-span-5 space-y-1.5 animate-in fade-in duration-300">
                  <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest ml-1">Aluno Acadêmico</label>
                  <div className="relative group">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 w-8 h-8 bg-white flex items-center justify-center text-slate-400 border border-slate-205">
                       <User size={15} />
                    </div>
                    <select
                      value={selectedStudentId}
                      onChange={(e) => setSelectedStudentId(e.target.value)}
                      className="w-full pl-12 pr-8 py-2.5 bg-white border border-slate-200 rounded-none text-[11px] font-semibold text-slate-800 appearance-none outline-none focus:border-slate-400 transition-colors"
                    >
                      {classStudents.length === 0 ? (
                        <option value="">Nenhum Aluno Ativo Encontrado</option>
                      ) : (
                        classStudents.map(s => (
                          <option key={s.id} value={s.id}>
                            {s.registration_number ? `${s.registration_number} - ` : ''}{s.name}
                          </option>
                        ))
                      )}
                    </select>
                    <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={14} />
                  </div>
                </div>
              )}

              {selectedClassId && viewMode === 'class' && (
                <div className="md:col-span-5 space-y-1.5 animate-in fade-in duration-300">
                  <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest ml-1">Buscar por Aluno ou RA</label>
                  <div className="relative group">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 w-8 h-8 bg-white flex items-center justify-center text-slate-400 border border-slate-205">
                       <Search size={15} />
                    </div>
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="FILTRAR POR NOME OU MATRÍCULA..."
                      className="w-full pl-12 pr-4 py-2.5 bg-white border border-slate-200 rounded-none text-[11px] font-semibold text-slate-800 placeholder:text-slate-400 focus:border-slate-400 outline-none transition-colors"
                    />
                  </div>
                </div>
              )}

              {/* Action buttons area */}
              {selectedClassId && (
                <div className="md:col-span-3 flex gap-2">
                  <button
                    disabled={exportingPDF}
                    onClick={() => {
                      if (viewMode === 'student') {
                        exportIndividualPDF(activeStudentReport);
                      } else {
                        exportClassSummaryPDF();
                      }
                    }}
                    className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white rounded-none text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-colors shadow-sm cursor-pointer"
                  >
                    {exportingPDF ? (
                      <Loader2 className="animate-spin" size={13} />
                    ) : (
                      <FileText size={13} />
                    )}
                    Exportar PDF
                  </button>

                  <button
                    onClick={handlePrint}
                    className="py-2.5 px-3 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 rounded-none text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Printer size={13} />
                    Imprimir
                  </button>
                </div>
              )}
            </div>

            {selectedClassId && viewMode === 'student' && classStudents.length > 0 && (
              <div className="mt-4 pt-4 border-t border-slate-100 flex flex-wrap justify-between items-center gap-3 animate-in fade-in duration-500">
                <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">
                  Imprimir múltiplos diários de notas de uma única vez:
                </span>
                <button
                  onClick={exportAllClassBulletinsPDF}
                  className="px-4 py-1.5 bg-slate-900 border border-slate-900 hover:bg-black text-white rounded-none text-[9px] font-bold uppercase tracking-widest flex items-center gap-1.5 transition-all shadow-sm"
                >
                  <GraduationCap size={12} />
                  Emitir Todos da Turma (Lote)
                </button>
              </div>
            )}
          </div>

          {!selectedClassId ? (
            <div className="bg-white border border-slate-200 shadow-sm p-8 text-center rounded-none print:hidden">
              <div className="w-12 h-12 bg-slate-50 border border-slate-200 text-slate-500 flex items-center justify-center mx-auto mb-4">
                 <Info size={20} />
              </div>
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-widest">Nenhuma Turma Selecionada</h3>
              <p className="text-[10px] text-slate-505 leading-relaxed font-semibold uppercase tracking-widest mt-1.5 max-w-md mx-auto">
                Por favor, escolha uma de suas turmas ativas no seletor acima para renderizar os boletins individuais ou visões gerais.
              </p>
            </div>
          ) : viewMode === 'student' ? (
            activeStudentReport ? (
              /* --- INDIVIDUAL INDOOR BULLETIN LAYOUT --- */
              <div className="space-y-4">
                
                {/* On-screen paper layout framing simulating standard print sheet */}
                <div id="printable-boletim" className="bg-white border border-slate-200 p-6 md:p-8 text-slate-900 shadow-sm max-w-[210mm] mx-auto relative font-sans leading-relaxed animate-in fade-in duration-300">
                  
                  {/* Inner container */}
                  <div className="space-y-6">
                    
                    {/* Professional Header using Institution Data */}
                    <div className="flex flex-col sm:flex-row items-center gap-4 border-b border-slate-200 pb-5">
                      {institution?.logo_url ? (
                        <img 
                          src={institution.logo_url} 
                          alt="Logo" 
                          referrerPolicy="no-referrer"
                          className="w-16 h-16 object-contain"
                        />
                      ) : (
                        <div className="w-16 h-16 bg-slate-50 border border-slate-200 rounded-none flex flex-col items-center justify-center p-1 font-sans flex-shrink-0">
                          <span className="text-[6px] font-black text-slate-400 uppercase tracking-widest leading-none">DIOCESE</span>
                          <School size={16} className="text-slate-350 my-1" />
                          <span className="text-[5px] font-black text-slate-400 uppercase tracking-widest leading-none">GUARULHOS</span>
                        </div>
                      )}
                      
                      <div className="text-center sm:text-left flex-1 min-w-0">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-0.5">DIOCESE DE GUARULHOS</span>
                        <h1 className="text-xs sm:text-sm font-black text-slate-900 uppercase tracking-tight leading-snug">
                          {institution?.name || 'ESCOLA DIOCESANA DE MINISTÉRIOS'}
                        </h1>
                        <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mt-0.5 leading-normal truncate">
                          {institution?.subtitle || institution?.address || 'SECRETARIA ACADÊMICA'}
                        </p>
                      </div>
                    </div>

                    {/* Report title header */}
                    <div className="bg-slate-50 border border-slate-200 py-2.5 text-center">
                      <h2 className="text-[10px] font-black text-slate-800 uppercase tracking-widest">
                        Boletim Escolar de Rendimento Acadêmico
                      </h2>
                    </div>

                    {/* Student details display bar */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-[10px] uppercase tracking-wider font-semibold text-slate-500 border-b border-slate-100 pb-5">
                      <div className="flex flex-col gap-1">
                        <span className="text-[8px] font-bold text-slate-400">Aluno</span>
                        <span className="text-slate-800 font-extrabold">
                          <strong className="text-slate-950 font-mono mr-1.5">{activeStudentReport.student.registration_number || '000000/0000'}</strong> 
                          {activeStudentReport.student.name}
                        </span>
                      </div>
                      
                      <div className="flex flex-col gap-1 sm:items-end">
                        <span className="text-[8px] font-bold text-slate-400">Situação Cadastral</span>
                        <span className="text-emerald-700 font-extrabold bg-emerald-50 border border-emerald-250 px-3 py-0.5 inline-block text-[9px] leading-tight select-none">
                          {activeStudentReport.student.status || 'Ativo'}
                        </span>
                      </div>

                      <div className="flex flex-col gap-1">
                        <span className="text-[8px] font-bold text-slate-400">Turma</span>
                        <span className="text-slate-800 font-extrabold">
                          {classes.find(c => c.id === selectedClassId)?.name || 'N/D'}
                        </span>
                      </div>

                      <div className="flex flex-col gap-1 sm:items-end">
                        <span className="text-[8px] font-bold text-slate-400">Período / Frequência</span>
                        <span className="text-slate-800 font-bold">
                          {classes.find(c => c.id === selectedClassId)?.period || 'Noite'} - {(classes.find(c => c.id === selectedClassId)?.days_of_week || []).join(', ') || 'Semanal'}
                        </span>
                      </div>
                    </div>

                    {/* Tabela I - Registro de Frequência e Faltas */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-1.5 pb-1">
                        <span className="w-1.5 h-1.5 bg-slate-800" />
                        <h3 className="text-[9px] font-black text-slate-800 uppercase tracking-wider">
                          Controle de Faltas Mensais e Frequência
                        </h3>
                      </div>
                      <div className="overflow-x-auto select-text border border-slate-200">
                        <table className="w-full text-left font-sans text-[10px] border-collapse uppercase">
                          <thead>
                            <tr className="bg-slate-50 border-b border-slate-200 text-slate-800 text-[9px] font-bold tracking-wider">
                              <th className="px-3 py-2.5 border-r border-slate-200 text-left min-w-[150px]">
                                Disciplinas
                              </th>
                              {monthsList.map(month => (
                                <th key={month.index} className="py-2.5 text-center border-r border-slate-200 w-[32px] min-w-[32px] px-1 text-[8.5px] whitespace-nowrap">
                                  {month.label}
                                </th>
                              ))}
                              <th className="py-2.5 border-r border-slate-200 text-center text-[9px] leading-tight w-[32px]">
                                Faltas
                              </th>
                              <th className="py-2.5 text-center text-[9px] leading-tight w-[36px]">
                                Freq.
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 text-slate-700">
                            {activeStudentReport.subjectsPerformance.map(sp => (
                              <tr key={sp.subjectId} className="hover:bg-slate-50/50 text-[10px] font-semibold">
                                <td className="px-3 py-2 border-r border-slate-100 text-slate-900 whitespace-nowrap overflow-hidden text-ellipsis max-w-[200px]">
                                  {sp.subjectCode} - {sp.subjectName}
                                </td>
                                {monthsList.map(m => {
                                  const absCount = sp.monthlyAbsences[m.index];
                                  return (
                                    <td key={m.index} className="py-2 text-center border-r border-slate-100 font-mono text-[9.5px]">
                                      {absCount > 0 ? absCount : ''}
                                    </td>
                                  );
                                })}
                                <td className="py-2 text-center border-r border-slate-100 font-bold font-mono text-slate-800">
                                  {sp.totalAbsences}
                                </td>
                                <td className="py-2 text-center font-bold font-mono text-slate-800">
                                  {formatPresence(sp.presencePercentage)}%
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Tabela II - Aproveitamento Acadêmico (Notas e Situação) */}
                    <div className="space-y-2 pt-2">
                      <div className="flex items-center gap-1.5 pb-1">
                        <span className="w-1.5 h-1.5 bg-slate-800" />
                        <h3 className="text-[9px] font-black text-slate-800 uppercase tracking-wider">
                          Aproveitamento Acadêmico e Situação Final
                        </h3>
                      </div>
                      <div className="overflow-x-auto select-text border border-slate-200">
                        <table className="w-full text-left font-sans text-[10px] border-collapse uppercase">
                          <thead>
                            <tr className="bg-slate-50 border-b border-slate-200 text-slate-800 text-[9px] font-bold tracking-wider">
                              <th className="px-3 py-2.5 border-r border-slate-200 text-left">
                                Disciplinas
                              </th>
                              <th className="py-2.5 border-r border-slate-200 text-center w-[70px]">
                                1ª Nota
                              </th>
                              <th className="py-2.5 border-r border-slate-200 text-center w-[70px]">
                                2ª Nota
                              </th>
                              <th className="py-2.5 border-r border-slate-200 text-center w-[70px]">
                                Média Final
                              </th>
                              <th className="py-2.5 text-center w-[90px]">
                                Situação Geral
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 text-slate-700">
                            {activeStudentReport.subjectsPerformance.map(sp => {
                              const showFailed = sp.status === 'Reprovado';
                              const showRecup = sp.status === 'Recuperação';
                              const showPending = sp.status === 'Pendente';

                              return (
                                <tr key={sp.subjectId} className="hover:bg-slate-50/50 text-[10px] font-semibold">
                                  <td className="px-3 py-2.5 border-r border-slate-100 text-slate-900 font-bold whitespace-nowrap overflow-hidden text-ellipsis">
                                    {sp.subjectCode} - {sp.subjectName}
                                  </td>
                                  <td className="py-2.5 text-center border-r border-slate-100 font-mono text-slate-600">
                                    {formatGrade(sp.grade1)}
                                  </td>
                                  <td className="py-2.5 text-center border-r border-slate-100 font-mono text-slate-600">
                                    {formatGrade(sp.grade2)}
                                  </td>
                                  <td className="py-2.5 text-center border-r border-slate-200 font-extrabold font-mono text-slate-900">
                                    {formatGrade(sp.finalGrade)}
                                  </td>
                                  <td className={cn(
                                    "py-2.5 text-center font-bold text-[9px] tracking-widest uppercase px-2",
                                    showFailed ? "text-rose-650 bg-rose-50/40" :
                                    showRecup ? "text-amber-650 bg-amber-50/40" :
                                    showPending ? "text-slate-400 bg-slate-50" : "text-emerald-650 bg-emerald-50/40"
                                  )}>
                                    {sp.status === 'Pendente' ? 'Pendente' : sp.status}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Integrated footer statistics aligned right below table */}
                    <div className="flex justify-end pt-1">
                      <div className="border border-slate-200 font-sans text-[10px] w-full sm:max-w-[340px] uppercase">
                        <div className="grid grid-cols-2 border-b border-slate-200 divide-x divide-slate-200 bg-slate-50/40">
                          <div className="px-3 py-1.5 font-bold text-slate-500">Média Geral de Frequência</div>
                          <div className="px-3 py-1.5 text-right font-black font-mono text-slate-800">
                            {formatPresence(activeStudentReport.averageFrequency)}%
                          </div>
                        </div>
                        <div className="grid grid-cols-2 divide-x divide-slate-200 bg-slate-50/40">
                          <div className="px-3 py-1.5 font-bold text-slate-500">Média Geral de Notas</div>
                          <div className="px-3 py-1.5 text-right font-black font-mono text-slate-800">
                            {formatGrade(activeStudentReport.averageGrade)}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Base validation credentials or certificates badge warning */}
                    <div className="pt-5 border-t border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 text-[9px] uppercase font-sans font-bold text-slate-400 select-none">
                      <div className="flex items-center gap-4">
                        <span>{new Date().toLocaleDateString('pt-BR')}</span>
                        <span>ESCMIN - Sistema de Gestão</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span>Página 1 de 1</span>
                      </div>
                    </div>

                  </div>
                </div>

                {/* Additional diagnostic indicator info */}
                <div className="max-w-[210mm] mx-auto p-4 bg-slate-50 border border-slate-205 flex items-center gap-3 text-slate-700 print:hidden mt-4">
                  <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center flex-shrink-0 text-slate-500 border border-slate-200">
                     <Info size={14} />
                  </div>
                  <p className="text-[10px] font-bold uppercase tracking-wider leading-relaxed">
                    Dica: Use as opções do navegador para imprimir em formato Retrato (A4). As margens e botões de controle serão omitidos automaticamente no papel!
                  </p>
                </div>
              </div>
            ) : (
              <div className="bg-white border border-slate-200 p-8 text-center rounded-none print:hidden">
                <AlertTriangle className="text-amber-500 mx-auto mb-3" size={24} />
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-widest">Nenhum Aluno Ativo</h3>
                <p className="text-[10px] text-slate-400 uppercase tracking-widest mt-1">Essa turma não possui alunos regularmente matriculados.</p>
              </div>
            )
          ) : (
            /* --- CLASS LISTING GENERAL PERFORMANCE LAYOUT --- */
            <div id="printable-class-bulletin" className="bg-white rounded-none border border-slate-200 shadow-sm overflow-hidden animate-in fade-in duration-300">
              {/* PRINTABLE ONLY HEADER */}
              <div className="hidden print:block p-8 border-b border-slate-200 bg-white">
                <div className="flex items-center gap-6 mb-6">
                  {institution?.logo_url ? (
                    <img 
                      src={institution.logo_url} 
                      alt="Logo" 
                      referrerPolicy="no-referrer"
                      className="w-16 h-16 object-contain"
                    />
                  ) : (
                    <div className="w-16 h-16 bg-slate-50 border border-slate-200 flex flex-col items-center justify-center p-1 font-sans flex-shrink-0">
                      <span className="text-[6px] font-black text-slate-400 uppercase tracking-widest leading-none">DIOCESE</span>
                      <School size={16} className="text-slate-350 my-1" />
                      <span className="text-[5px] font-black text-slate-400 uppercase tracking-widest leading-none">GUARULHOS</span>
                    </div>
                  )}
                  <div className="flex-1">
                    <span className="text-[9px] font-black text-slate-450 uppercase tracking-widest block mb-0.5">DIOCESE DE GUARULHOS</span>
                    <h1 className="text-sm font-black text-slate-900 uppercase tracking-tight">
                      {institution?.name || 'ESCOLA DIOCESANA DE MINISTÉRIOS'}
                    </h1>
                    <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mt-0.5">
                      {institution?.address || 'SECRETARIA ACADÊMICA'}
                    </p>
                  </div>
                </div>
                <div className="bg-slate-100/60 border border-slate-200 p-3 text-center uppercase mb-6">
                  <h2 className="text-[10px] font-black text-slate-800 tracking-widest">
                    Pauta de Notas & Rendimentos Gerais por Turma
                  </h2>
                </div>
                <div className="grid grid-cols-2 gap-4 text-[9px] font-bold text-slate-600 uppercase tracking-wider">
                  <div>Turma: <span className="text-slate-900 font-extrabold">{classes.find(c => c.id === selectedClassId)?.name}</span></div>
                  <div className="text-right">Emissão: <span className="text-slate-900 font-extrabold">{new Date().toLocaleDateString('pt-BR')}</span></div>
                </div>
              </div>

              <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/60 flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:hidden">
                <h3 className="text-[10px] font-black text-slate-800 uppercase tracking-widest">
                  Resumo de Rendimentos e Situações Finais ({classes.find(c => c.id === selectedClassId)?.name})
                </h3>
                <span className="text-[9px] font-bold text-slate-600 bg-slate-200 border border-slate-300 px-3 py-1 uppercase tracking-widest leading-none">
                  Totalizador Acadêmico
                </span>
              </div>

              {filteredReports.length === 0 ? (
                <div className="p-12 text-center text-slate-400 font-bold uppercase text-[10px] tracking-widest">
                  Nenhum registro de aluno correspondente na busca.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left font-sans">
                    <thead>
                      <tr className="bg-slate-50/60 text-[9px] font-bold text-slate-500 border-b border-slate-200 uppercase tracking-widest">
                        <th className="px-6 py-4">Matrícula (RA)</th>
                        <th className="px-6 py-4">Aluno</th>
                        <th className="px-6 py-4 text-center">Faltas Globais</th>
                        <th className="px-6 py-4 text-center">Frequência Letiva</th>
                        <th className="px-6 py-4 text-center">Média de Notas</th>
                        <th className="px-6 py-4 text-center">Situação Final</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-800 uppercase text-[11px] font-semibold">
                      {filteredReports.map(res => {
                        const showFailed = res.finalStatus === 'Reprovado';
                        const showRecup = res.finalStatus === 'Recuperação';
                        const showPending = res.finalStatus === 'Pendente';

                        return (
                          <tr key={res.student.id} className="hover:bg-slate-50/40 transition-colors">
                            <td className="px-6 py-3.5 font-mono text-[10.5px] font-bold text-slate-450 tracking-tight">
                              {res.student.registration_number || 'N/D'}
                            </td>
                            <td className="px-6 py-3.5 text-slate-900 font-extrabold tracking-tight">
                              {res.student.name}
                            </td>
                            <td className="px-6 py-3.5 text-center font-mono font-bold text-slate-600">
                              {res.totalAbsences} faltas
                            </td>
                            <td className="px-6 py-3.5 text-center">
                              <span className={cn(
                                "font-mono font-black",
                                res.averageFrequency >= (100 - (academicParams.absence_limit_percentage || 40)) 
                                  ? "text-slate-800" 
                                  : "text-rose-600"
                              )}>
                                {formatPresence(res.averageFrequency)}%
                              </span>
                            </td>
                            <td className="px-6 py-3.5 text-center">
                              <span className={cn(
                                "px-2.5 py-1 rounded-none border text-[10.5px] font-black font-mono shadow-sm",
                                res.averageGrade >= (academicParams.approval_grade || 5.0) 
                                  ? "bg-emerald-50 text-emerald-700 border-emerald-250" 
                                  : "bg-rose-50 text-rose-700 border-rose-250"
                              )}>
                                {formatGrade(res.averageGrade)}
                              </span>
                            </td>
                            <td className="px-6 py-3.5 text-center">
                              <span className={cn(
                                "px-3 py-1 text-[9px] font-bold uppercase tracking-widest border shadow-sm inline-block w-28 text-center",
                                showFailed ? "bg-rose-50 text-rose-650 border-rose-200" :
                                showRecup ? "bg-amber-50 text-amber-650 border-amber-200" :
                                showPending ? "bg-slate-50 text-slate-500 border-slate-200" :
                                "bg-emerald-50 text-emerald-650 border-emerald-200"
                              )}>
                                {res.finalStatus}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Custom class print rules override to bypass the page height restriction of [id^="printable-"] selectors */}
      <style>{`
        @media print {
          #printable-class-bulletin {
            position: relative !important;
            left: auto !important;
            top: auto !important;
            width: 100% !important;
            height: auto !important;
            min-height: 0 !important;
            margin: 0 !important;
            padding: 8mm !important;
            background: white !important;
            z-index: 9999 !important;
            display: block !important;
            visibility: visible !important;
            overflow: visible !important;
            border: none !important;
            box-shadow: none !important;
          }
          #printable-class-bulletin * {
            visibility: visible !important;
            overflow: visible !important;
          }
          
          /* Set custom column widths and align correctly under print */
          #printable-class-bulletin th,
          #printable-class-bulletin td {
            padding: 1.5mm 1mm !important;
            word-break: break-word !important;
            white-space: normal !important;
          }
          
          /* Column widths */
          #printable-class-bulletin th:nth-child(1),
          #printable-class-bulletin td:nth-child(1) {
            width: 13% !important;
            text-align: left !important;
          }
          #printable-class-bulletin th:nth-child(2),
          #printable-class-bulletin td:nth-child(2) {
            width: 47% !important;
            text-align: left !important;
            font-size: 10px !important;
            line-height: 1.1 !important;
          }
          #printable-class-bulletin th:nth-child(3),
          #printable-class-bulletin td:nth-child(3) {
            width: 10% !important;
            text-align: center !important;
          }
          #printable-class-bulletin th:nth-child(4),
          #printable-class-bulletin td:nth-child(4) {
            width: 10% !important;
            text-align: center !important;
          }
          #printable-class-bulletin th:nth-child(5),
          #printable-class-bulletin td:nth-child(5) {
            width: 10% !important;
            text-align: center !important;
          }
          #printable-class-bulletin th:nth-child(6),
          #printable-class-bulletin td:nth-child(6) {
            width: 10% !important;
            text-align: center !important;
          }

          /* Compress final status and average grade badges under print to prevent tall cells */
          #printable-class-bulletin td span {
            padding: 0.5mm 1.5mm !important;
            font-size: 8.5px !important;
            width: auto !important;
            min-width: 0 !important;
            max-width: none !important;
            display: inline-block !important;
            box-shadow: none !important;
          }

          /* Ensure table elements wrap and break beautifully */
          tr {
            page-break-inside: avoid !important;
          }
          thead {
            display: table-header-group !important;
          }
        }
      `}</style>
    </div>
  );
}
