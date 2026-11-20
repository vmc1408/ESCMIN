import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  Download,
  User,
  ArrowUp,
  ArrowDown,
  ArrowUpDown
} from 'lucide-react';
import { Student, Class, Subject, AcademicParameters } from '../types';
import { cn, filterStudentsForClass, formatRegistrationNumber, normalizeClass, normalizeSubject, getClassSubjects, getSubjectClassDetails, matchesStudentSearch, calculateStudentSearchRank } from '../lib/utils';
import { fetchAll, fetchQuery } from '../lib/database';
import { supabase, fetchWithTimeout, isSupabaseConfigured } from '../lib/supabase';
import { getClassSchoolDays, getScheduledDaysByMonth, getSubjectTotalClassDays, calculateAttendanceMetrics, resolveAcademicSettingsForUnit } from '../lib/academicUtils';
import { financialService } from '../services/financialService';
import { useAuth } from '../contexts/AuthContext';
import { useUnits } from '../contexts/UnitContext';
import { isItemInUnit, getItemUnitId } from '../lib/unitService';
import { UnitConflictBanner } from '../components/UnitConflictBanner';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { PageHeader } from '../components/PageHeader';
import { drawStandardReportHeader, drawStandardReportFooter, preloadReportLogoDataUrl } from '../lib/pdfReportHelper';
import { StandardReportHeader, StandardReportFooter } from '../components/print/StandardPrintLayout';

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
  const { selectedUnitId, selectedUnit, activeUnits, getUnitName } = useUnits();
  
  // Database States
  const [classes, setClasses] = useState<Class[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [enrollments, setEnrollments] = useState<any[]>([]);
  const [dbGrades, setDbGrades] = useState<GradeRecord[]>([]);
  const [assessments, setAssessments] = useState<any[]>([]);
  const [attendanceData, setAttendanceData] = useState<any[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<any[]>([]);
  const [institution, setInstitution] = useState<any>(null);
  const [academicSettingsList, setAcademicSettingsList] = useState<any[]>([]);
  const [academicParams, setAcademicParams] = useState<AcademicParameters>({
    approval_grade: 7.0,
    recovery_grade: 5.0,
    failure_grade: 4.9,
    absence_limit_percentage: 25,
    updated_at: ''
  });

  // Interface/Filter States
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [viewMode, setViewMode] = useState<'student' | 'class'>('student');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [loadingClassData, setLoadingClassData] = useState<boolean>(false);
  const [exportingPDF, setExportingPDF] = useState<boolean>(false);

  // Cache per-class grades/assessments/attendances to make switching classes instantaneous
  const classAcademicCacheRef = useRef<Map<string, { grades: GradeRecord[]; assessments: any[]; attendances: any[] }>>(new Map());

  // Load Lightweight Initial Catalogs (avoids downloading full historical attendances/grades upfront)
  useEffect(() => {
    async function loadInitialData() {
      setLoading(true);
      try {
        const [
          classesData,
          subjectsData,
          studentsData,
          enrollmentsData,
          calendarData,
          paramsData,
          instSettings,
          acadSettings
        ] = await Promise.all([
          fetchQuery('classes', [{ field: 'status', operator: '==', value: 'Ativo' }]),
          fetchAll('subjects', 'id,name,code,year,semester,status,program_content,teacher_id'),
          fetchAll('students', 'id,name,registration_number,class_id,unit_id,status,observations'),
          fetchAll('enrollments', 'id,student_id,class_id,status').catch(() => []),
          fetchQuery('calendar_events', [{ field: 'type', operator: '==', value: 'class_day' }]),
          fetchAll('academic_parameters'),
          financialService.getInstitutionSettings(),
          fetchAll('academic_settings').catch(() => [])
        ]);

        const normalizedSubjects = (subjectsData || []).map((s: any) => normalizeSubject(s));
        const normalizedClasses = (classesData || []).map((c: any) => normalizeClass(c, normalizedSubjects));

        const sortedClasses = normalizedClasses.sort((a: any, b: any) => 
          (a.name || '').localeCompare(b.name || '')
        );

        setClasses(sortedClasses);
        setSubjects(normalizedSubjects);
        setStudents(studentsData || []);
        setEnrollments(enrollmentsData || []);
        setCalendarEvents(calendarData || []);
        setAcademicSettingsList(Array.isArray(acadSettings) ? acadSettings : []);
        
        if (paramsData && paramsData.length > 0) {
          setAcademicParams(paramsData[0] as AcademicParameters);
        } else if (instSettings) {
          setAcademicParams({
            approval_grade: instSettings.approval_grade || 7.0,
            absence_limit_percentage: instSettings.absence_limit_percentage || 25,
            recovery_grade: 5.0,
            failure_grade: 4.9,
            updated_at: ''
          } as any);
        }
        if (instSettings) {
          setInstitution(instSettings);
          preloadReportLogoDataUrl(instSettings.logo_url).catch(() => {});
        }
      } catch (error) {
        console.error("Error loading Bulletin components database:", error);
      } finally {
        setLoading(false);
      }
    }
    loadInitialData();
  }, []);

  // Scoped, paginated fetch for ONLY the selected class (supports >1000 rows & instantaneous cache hits)
  useEffect(() => {
    if (!selectedClassId) {
      setDbGrades([]);
      setAssessments([]);
      setAttendanceData([]);
      return;
    }

    const cached = classAcademicCacheRef.current.get(selectedClassId);
    if (cached) {
      setDbGrades(cached.grades);
      setAssessments(cached.assessments);
      setAttendanceData(cached.attendances);
      return;
    }

    let cancelled = false;

    const fetchClassTablePaged = async (tableName: string, selectCols: string) => {
      if (!isSupabaseConfigured) return [];
      const rows: any[] = [];
      let from = 0;
      const step = 1000;
      let hasMore = true;

      while (hasMore) {
        const res = await fetchWithTimeout(
          () => supabase
            .from(tableName)
            .select(selectCols)
            .eq('class_id', selectedClassId)
            .order('id', { ascending: true })
            .range(from, from + step - 1),
          25000
        );
        if (res?.error) {
          if (selectCols !== '*' && res.error.message?.includes('column')) {
            const fallback = await fetchWithTimeout(
              () => supabase.from(tableName).select('*').eq('class_id', selectedClassId).order('id', { ascending: true }).range(from, from + step - 1),
              25000
            );
            if (!fallback?.error && Array.isArray(fallback?.data)) {
              rows.push(...fallback.data);
              from += step;
              hasMore = fallback.data.length === step;
              continue;
            }
          }
          break;
        }
        const chunk = Array.isArray(res?.data) ? res.data : [];
        rows.push(...chunk);
        from += step;
        hasMore = chunk.length === step;
      }
      return rows;
    };

    async function loadSelectedClassAcademicData() {
      setLoadingClassData(true);
      try {
        const [gradesRows, assessmentsRows, attendanceRows] = await Promise.all([
          fetchClassTablePaged('grades', 'id,student_id,class_id,subject_id,period,value'),
          fetchClassTablePaged('assessments', 'id,class_id,subject_id,title,date,weight'),
          fetchClassTablePaged('attendances', 'id,student_id,class_id,subject_id,date,status')
        ]);

        if (cancelled) return;
        classAcademicCacheRef.current.set(selectedClassId, {
          grades: gradesRows,
          assessments: assessmentsRows,
          attendances: attendanceRows
        });
        setDbGrades(gradesRows);
        setAssessments(assessmentsRows);
        setAttendanceData(attendanceRows);
      } catch (err) {
        console.error('Error loading class academic records:', err);
      } finally {
        if (!cancelled) setLoadingClassData(false);
      }
    }

    loadSelectedClassAcademicData();
    return () => {
      cancelled = true;
    };
  }, [selectedClassId]);

  const classesById = useMemo(() => {
    const map = new Map<string, Class>();
    classes.forEach(c => { if (c?.id) map.set(c.id, c); });
    return map;
  }, [classes]);

  const activeClassObj = useMemo(() => {
    return selectedClassId ? classesById.get(selectedClassId) : undefined;
  }, [selectedClassId, classesById]);

  // Scoped Classes to active unit
  const scopedClasses = useMemo(() => {
    if (!selectedUnitId || selectedUnitId === 'all') return classes;
    return classes.filter(c => isItemInUnit(getItemUnitId(c), selectedUnitId, activeUnits));
  }, [classes, selectedUnitId, activeUnits]);

  // Scoped Students to active unit
  const scopedStudents = useMemo(() => {
    if (!selectedUnitId || selectedUnitId === 'all') return students;
    return students.filter(s => {
      const studentClass = s.class_id ? classesById.get(s.class_id) : undefined;
      const studentUnit = getItemUnitId(s) || (studentClass ? getItemUnitId(studentClass) : 'matriz');
      return isItemInUnit(studentUnit, selectedUnitId, activeUnits);
    });
  }, [students, classesById, selectedUnitId, activeUnits]);

  // If active class does not belong to active unit, clear it
  useEffect(() => {
    if (selectedClassId && scopedClasses.length > 0) {
      const exists = scopedClasses.some(c => c.id === selectedClassId);
      if (!exists) {
        setSelectedClassId('');
        setSelectedStudentId('');
      }
    }
  }, [selectedClassId, scopedClasses]);

  // Filter Active Students for local class
  const classStudents = useMemo(() => {
    if (!selectedClassId) return [];
    return filterStudentsForClass(scopedStudents, selectedClassId, enrollments, true);
  }, [selectedClassId, scopedStudents, enrollments]);

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
    return getClassSubjects(classObj, subjects, assessments, dbGrades);
  }, [selectedClassId, classes, subjects, assessments, dbGrades]);

  const academicSettings = useMemo(() => {
    const classObj = classes.find(c => c.id === selectedClassId);
    const targetUnit = classObj ? getItemUnitId(classObj) : (selectedUnitId && selectedUnitId !== 'all' ? selectedUnitId : 'matriz');
    return resolveAcademicSettingsForUnit(targetUnit, academicSettingsList).settings;
  }, [classes, selectedClassId, selectedUnitId, academicSettingsList]);

  // Calendar specific events strictly matching the class's scheduled weekdays and unit
  const classSchoolDays = useMemo(() => {
    if (!selectedClassId) return [];
    const classObj = classes.find(c => c.id === selectedClassId);
    return getClassSchoolDays(classObj, calendarEvents, academicSettings, attendanceData);
  }, [selectedClassId, classes, calendarEvents, academicSettings, attendanceData]);

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
    return 33;
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

  // Count of scheduled class sessions per month index (0 to 11)
  const scheduledDaysByMonth = useMemo(() => {
    return getScheduledDaysByMonth(classSchoolDays);
  }, [classSchoolDays]);

  // Semester breakdown of scheduled class days
  const sem1Days = useMemo(() => {
    return [0, 1, 2, 3, 4, 5, 6].reduce((acc, mIdx) => acc + (scheduledDaysByMonth[mIdx] || 0), 0);
  }, [scheduledDaysByMonth]);

  const sem2Days = useMemo(() => {
    return [7, 8, 9, 10, 11].reduce((acc, mIdx) => acc + (scheduledDaysByMonth[mIdx] || 0), 0);
  }, [scheduledDaysByMonth]);

  // Subject semester detector helper
  const getSubjectSemester = (sub: any): '1º Semestre' | '2º Semestre' | 'Geral' => {
    if (!sub) return 'Geral';
    const classObj = classes.find(c => c.id === selectedClassId);
    const details = getSubjectClassDetails(sub, classObj);
    if (details.semester === '1º Semestre') return '1º Semestre';
    if (details.semester === '2º Semestre') return '2º Semestre';
    return 'Geral';
  };

  // Helper to test if a given month is blocked/outside the subject's semester
  const isSubjectMonthBlocked = (subSemester: string, monthIndex: number) => {
    if ((scheduledDaysByMonth[monthIndex] || 0) === 0) return true;
    if (subSemester === '1º Semestre' && monthIndex >= 7) return true;
    if (subSemester === '2º Semestre' && monthIndex < 7) return true;
    return false;
  };

  // Core O(N) indexed calculations memo to map student performance structured cards instantaneously
  const studentReports = useMemo(() => {
    if (!selectedClassId || classStudents.length === 0 || classSubjects.length === 0) return [];

    // Pre-index attendances, assessments, and grades once in O(N)
    const attByStudentSubj = new Map<string, any[]>();
    for (let i = 0; i < attendanceData.length; i++) {
      const a = attendanceData[i];
      if (a.class_id !== selectedClassId) continue;
      const key = `${a.student_id}::${a.subject_id}`;
      let arr = attByStudentSubj.get(key);
      if (!arr) {
        arr = [];
        attByStudentSubj.set(key, arr);
      }
      arr.push(a);
    }

    const assessmentsBySubj = new Map<string, any[]>();
    for (let i = 0; i < assessments.length; i++) {
      const a = assessments[i];
      if (a.class_id !== selectedClassId) continue;
      let arr = assessmentsBySubj.get(a.subject_id);
      if (!arr) {
        arr = [];
        assessmentsBySubj.set(a.subject_id, arr);
      }
      arr.push(a);
    }

    const gradesByStudentSubj = new Map<string, GradeRecord[]>();
    for (let i = 0; i < dbGrades.length; i++) {
      const g = dbGrades[i];
      if (g.class_id !== selectedClassId) continue;
      const key = `${g.student_id}::${g.subject_id}`;
      let arr = gradesByStudentSubj.get(key);
      if (!arr) {
        arr = [];
        gradesByStudentSubj.set(key, arr);
      }
      arr.push(g);
    }

    const minApp = academicParams.approval_grade || 7.0;
    const minRec = academicParams.recovery_grade !== undefined && academicParams.recovery_grade !== null
      ? academicParams.recovery_grade
      : 5.0;
    const absenceLimit = academicParams.absence_limit_percentage || 25;
    const todayStr = new Date().toISOString().split('T')[0];
    const hasFutureClasses = classSchoolDays.some(d => d.start_date > todayStr);

    // Precompute per-subject metadata (semester, class days, sorted assessments)
    const subjectMetaList = classSubjects.map(sub => {
      const details = getSubjectClassDetails(sub, activeClassObj);
      const subSemester: '1º Semestre' | '2º Semestre' | 'Geral' =
        details.semester === '1º Semestre' ? '1º Semestre' :
        details.semester === '2º Semestre' ? '2º Semestre' : 'Geral';
      const subjectTotalClassDays = getSubjectTotalClassDays(subSemester, scheduledDaysByMonth, totalClassDays);
      const subAssessments = assessmentsBySubj.get(sub.id) || [];
      const sortedAssessments = [...subAssessments].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
      const halfIndex = Math.ceil(sortedAssessments.length / 2);
      return {
        sub,
        subSemester,
        subjectTotalClassDays,
        subAssessments,
        assessmentIdSet: new Set(subAssessments.map(a => a.id)),
        assessmentTitleSet: new Set(subAssessments.map(a => a.title)),
        g1KeySet: new Set([
          ...sortedAssessments.slice(0, halfIndex).map(a => a.id),
          ...sortedAssessments.slice(0, halfIndex).map(a => a.title)
        ]),
        g2KeySet: new Set([
          ...sortedAssessments.slice(halfIndex).map(a => a.id),
          ...sortedAssessments.slice(halfIndex).map(a => a.title)
        ])
      };
    });

    const parseNum = (val: any): number =>
      typeof val === 'string' ? parseFloat(val.replace(',', '.')) : Number(val);

    return classStudents.map(student => {
      const subjectsPerformance = subjectMetaList.map(meta => {
        const { sub, subSemester, subjectTotalClassDays, subAssessments, assessmentIdSet, assessmentTitleSet, g1KeySet, g2KeySet } = meta;
        const lookupKey = `${student.id}::${sub.id}`;

        // 1a. Attendance per subject month (direct map lookup)
        const subjectAttendances = attByStudentSubj.get(lookupKey) || [];
        const monthlyAbsences: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 0, 11: 0 };
        const monthlyPresences: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 0, 11: 0 };
        let totalAbsences = 0;
        let totalPresences = 0;

        for (let j = 0; j < subjectAttendances.length; j++) {
          const a = subjectAttendances[j];
          if (a.status === 'F') totalAbsences++;
          else if (a.status === 'P') totalPresences++;
          const mIdx = getMonthFromDate(a.date);
          if (mIdx >= 0 && mIdx < 12) {
            if (a.status === 'F') monthlyAbsences[mIdx] += 1;
            else if (a.status === 'P') monthlyPresences[mIdx] += 1;
          }
        }

        const attMetrics = calculateAttendanceMetrics({
          presences: totalPresences,
          absences: totalAbsences,
          subjectTotalClassDays,
          absenceLimitPercentage: absenceLimit
        });

        const presencePct = attMetrics.presencePercentage;
        const isAttendanceApproved = attMetrics.isAttendanceApproved;

        // 1b. Grades lookup (O(1) per student+subject list)
        const studGrades = gradesByStudentSubj.get(lookupKey) || [];
        let finalGradeRecord: GradeRecord | undefined;
        let g1Record: GradeRecord | undefined;
        let g2Record: GradeRecord | undefined;
        const gradeByPeriod = new Map<string, GradeRecord>();
        const studentSubGrades: GradeRecord[] = [];

        for (let gIdx = 0; gIdx < studGrades.length; gIdx++) {
          const g = studGrades[gIdx];
          if (g.period) gradeByPeriod.set(g.period, g);
          if (g.period === 'Resultado Final') finalGradeRecord = g;
          if (g.period === 'Avaliação 1' || g.period === '1ª Avaliação' || g.period === '1º Bimestre') g1Record = g;
          if (g.period === 'Avaliação 2' || g.period === '2ª Avaliação' || g.period === '2º Bimestre') g2Record = g;
          if (
            (assessmentIdSet.has(g.period) || assessmentTitleSet.has(g.period)) &&
            g.value !== null && g.value !== undefined && g.value !== ''
          ) {
            studentSubGrades.push(g);
          }
        }

        let finalGradeValue: number | null = null;
        let isCalculated = false;

        if (finalGradeRecord && finalGradeRecord.value !== null && finalGradeRecord.value !== undefined && finalGradeRecord.value !== '') {
          finalGradeValue = parseNum(finalGradeRecord.value);
        } else if (subAssessments.length > 0 && studentSubGrades.length > 0) {
          let sum = 0;
          for (let sIdx = 0; sIdx < studentSubGrades.length; sIdx++) {
            sum += parseNum(studentSubGrades[sIdx].value) || 0;
          }
          finalGradeValue = sum / subAssessments.length;
          isCalculated = true;
        }

        let grade1: number | null = (g1Record && g1Record.value !== null && g1Record.value !== '') ? parseNum(g1Record.value) : null;
        let grade2: number | null = (g2Record && g2Record.value !== null && g2Record.value !== '') ? parseNum(g2Record.value) : null;

        if (grade1 === null && grade2 === null && studentSubGrades.length > 0) {
          let g1Sum = 0, g1Count = 0, g2Sum = 0, g2Count = 0;
          for (let sIdx = 0; sIdx < studentSubGrades.length; sIdx++) {
            const g = studentSubGrades[sIdx];
            const val = parseNum(g.value) || 0;
            if (g1KeySet.has(g.period)) { g1Sum += val; g1Count++; }
            if (g2KeySet.has(g.period)) { g2Sum += val; g2Count++; }
          }
          if (g1Count > 0) grade1 = g1Sum / g1Count;
          if (g2Count > 0) grade2 = g2Sum / g2Count;
        }

        const detailedAssessments = subAssessments.map(assessment => {
          const gradeRec = gradeByPeriod.get(assessment.id) || gradeByPeriod.get(assessment.title);
          const gradeVal = gradeRec && gradeRec.value !== null && gradeRec.value !== undefined && gradeRec.value !== ''
            ? parseNum(gradeRec.value)
            : null;
          return {
            id: assessment.id,
            title: assessment.title,
            date: assessment.date,
            weight: assessment.weight,
            grade: gradeVal
          };
        });

        if (detailedAssessments.length === 0) {
          if (grade1 !== null) {
            detailedAssessments.push({ id: 'virtual-g1', title: '1ª Avaliação', date: '', weight: 1, grade: grade1 });
          }
          if (grade2 !== null) {
            detailedAssessments.push({ id: 'virtual-g2', title: '2ª Avaliação', date: '', weight: 1, grade: grade2 });
          }
        }

        let gradesSumVal = 0;
        let gradesValidCount = 0;
        for (let dIdx = 0; dIdx < detailedAssessments.length; dIdx++) {
          const gVal = detailedAssessments[dIdx].grade;
          if (gVal !== null && gVal !== undefined) {
            gradesSumVal += gVal;
            gradesValidCount++;
          }
        }
        const gradesSum = gradesValidCount > 0 ? gradesSumVal : null;
        const gradesAverage = gradesValidCount > 0 ? (gradesSumVal / gradesValidCount) : null;

        let subjectStatus: 'Aprovado' | 'Reprovado' | 'Recuperação' | 'Pendente' = 'Pendente';
        if (!isAttendanceApproved) {
          subjectStatus = 'Reprovado';
        } else if (finalGradeValue === null) {
          subjectStatus = 'Pendente';
        } else if (finalGradeValue >= minApp) {
          subjectStatus = 'Aprovado';
        } else if (finalGradeValue >= minRec) {
          subjectStatus = 'Recuperação';
        } else {
          subjectStatus = 'Reprovado';
        }

        return {
          subjectId: sub.id,
          subjectCode: sub.code || '000',
          subjectName: sub.name,
          semester: subSemester,
          subjectTotalClassDays,
          monthlyAbsences,
          monthlyPresences,
          totalAbsences,
          totalPresences,
          presencePercentage: presencePct,
          isAttendanceApproved,
          grade1,
          grade2,
          finalGrade: finalGradeValue,
          isCalculated,
          status: subjectStatus,
          detailedAssessments,
          gradesSum,
          gradesAverage
        };
      });

      let overallAbsences = 0;
      let validGradesCount = 0;
      let overallGradesSum = 0;
      let validPresenceCount = 0;
      let overallPresenceSum = 0;

      subjectsPerformance.forEach(sp => {
        overallAbsences += sp.totalAbsences;
        if (sp.presencePercentage !== null) {
          validPresenceCount++;
          overallPresenceSum += sp.presencePercentage;
        }
        if (sp.finalGrade !== null) {
          validGradesCount++;
          overallGradesSum += sp.finalGrade;
        }
      });

      const averageFrequency = validPresenceCount > 0 ? (overallPresenceSum / validPresenceCount) : null;
      const averageGrade = validGradesCount > 0 ? (overallGradesSum / validGradesCount) : 0;

      let finalStatus: 'Aprovado' | 'Recuperação' | 'Reprovado' | 'Pendente' | 'Informativo' = 'Aprovado';
      const hasMissingGrades = subjectsPerformance.some(sp => sp.grade1 === null || sp.grade2 === null || sp.finalGrade === null);

      if (hasFutureClasses || hasMissingGrades) {
        finalStatus = 'Informativo';
      } else {
        const hasPending = subjectsPerformance.some(sp => sp.status === 'Pendente');
        const minApproval = academicParams.approval_grade || 5.0;
        const isAttendanceApprovedClass = subjectsPerformance.every(sp => sp.isAttendanceApproved);

        if (!isAttendanceApprovedClass) {
          finalStatus = 'Reprovado';
        } else if (hasPending) {
          finalStatus = 'Pendente';
        } else if (subjectsPerformance.some(sp => sp.status === 'Reprovado')) {
          finalStatus = 'Reprovado';
        } else {
          const failedSubjectCount = subjectsPerformance.filter(sp => sp.finalGrade !== null && sp.finalGrade < minApproval).length;
          if (failedSubjectCount > 0) {
            finalStatus = failedSubjectCount <= 2 ? 'Recuperação' : 'Reprovado';
          }
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
  }, [selectedClassId, activeClassObj, classStudents, classSubjects, attendanceData, dbGrades, assessments, academicParams, totalClassDays, classSchoolDays, scheduledDaysByMonth]);

  // Current selected student report (individual bulletin card)
  const activeStudentReport = useMemo(() => {
    if (!selectedStudentId) return null;
    return studentReports.find(r => r.student.id === selectedStudentId) || null;
  }, [selectedStudentId, studentReports]);

  const [classSort, setClassSort] = useState<{ key: string; subId?: string; direction: 'asc' | 'desc' } | null>({ key: 'student', direction: 'asc' });

  // General filter for class table
  const filteredReports = useMemo(() => {
    const term = searchQuery.trim();
    if (!term) return studentReports;
    return studentReports.filter(r => matchesStudentSearch(r.student, term));
  }, [searchQuery, studentReports]);

  // Dynamic sorting based on classSort
  const sortedReports = useMemo(() => {
    const results = [...filteredReports];
    if (!classSort) return results;

    const { key, subId, direction } = classSort;
    return results.sort((a, b) => {
      let valA: any = '';
      let valB: any = '';

      if (key === 'student') {
        const term = searchQuery.trim();
        if (term) {
          const rankA = calculateStudentSearchRank(a.student, term);
          const rankB = calculateStudentSearchRank(b.student, term);
          if (rankA !== rankB) return rankA - rankB;
        }
        valA = a.student.name || '';
        valB = b.student.name || '';
      } else if (key === 'presence') {
        valA = a.averageFrequency !== null ? a.averageFrequency : -1;
        valB = b.averageFrequency !== null ? b.averageFrequency : -1;
      } else if (key === 'status') {
        valA = a.finalStatus || '';
        valB = b.finalStatus || '';
      } else if (key === 'subject' && subId) {
        const perfA = a.subjectsPerformance.find(sp => sp.subjectId === subId);
        const perfB = b.subjectsPerformance.find(sp => sp.subjectId === subId);
        valA = perfA && perfA.finalGrade !== null ? perfA.finalGrade : -1;
        valB = perfB && perfB.finalGrade !== null ? perfB.finalGrade : -1;
      }

      if (typeof valA === 'string' && typeof valB === 'string') {
        return direction === 'asc'
          ? valA.localeCompare(valB, 'pt-BR')
          : valB.localeCompare(valA, 'pt-BR');
      } else {
        if (valA < valB) return direction === 'asc' ? -1 : 1;
        if (valA > valB) return direction === 'asc' ? 1 : -1;
        return 0;
      }
    });
  }, [filteredReports, classSort]);

  const { total, approved, recuperation, failed, pending, informative } = useMemo(() => {
    const totalCount = studentReports.length;
    const approvedCount = studentReports.filter(r => r.finalStatus === 'Aprovado').length;
    const recuperationCount = studentReports.filter(r => r.finalStatus === 'Recuperação').length;
    const failedCount = studentReports.filter(r => r.finalStatus === 'Reprovado').length;
    const pendingCount = studentReports.filter(r => r.finalStatus === 'Pendente').length;
    const informativeCount = studentReports.filter(r => r.finalStatus === 'Informativo').length;
    return {
      total: totalCount,
      approved: approvedCount,
      recuperation: recuperationCount,
      failed: failedCount,
      pending: pendingCount,
      informative: informativeCount
    };
  }, [studentReports]);

  const handleClassSort = (key: string, subId?: string) => {
    setClassSort(prev => {
      if (prev && prev.key === key && prev.subId === subId) {
        return { key, subId, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { key, subId, direction: 'asc' };
    });
  };

  const renderSortIcon = (key: string, subId?: string) => {
    if (!classSort || classSort.key !== key || (subId && classSort.subId !== subId)) {
      return <ArrowUpDown size={10} className="text-slate-400 ml-1.5 opacity-55 inline-block" />;
    }
    return classSort.direction === 'asc' 
      ? <ArrowUp size={10} className="text-blue-600 ml-1.5 font-bold inline-block" />
      : <ArrowDown size={10} className="text-blue-600 ml-1.5 font-bold inline-block" />;
  };

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
    if (val === null || val === undefined) return '-';
    return Math.round(val).toString();
  };

  const getReportJustificationText = (report: any, params: any) => {
    if (!report) return "";
    const minGrade = params.approval_grade || 5.0;
    const maxAbsencePct = params.absence_limit_percentage || 25;
    const attendanceThreshold = 100 - maxAbsencePct;
    const isAttendanceApproved = report.averageFrequency !== null ? report.averageFrequency >= attendanceThreshold : true;

    // Check if they have failed subjects (grade below minGrade)
    const failedSubjects = report.subjectsPerformance.filter((sp: any) => sp.finalGrade !== null && sp.finalGrade < minGrade);
    const hasFailedGrade = failedSubjects.length > 0;

    if (report.finalStatus === 'Informativo') {
      return "BOLETIM APENAS INFORMATIVO: O CURSO ACADÊMICO ESTÁ EM ANDAMENTO. A SITUAÇÃO FINAL (APROVADO OU REPROVADO) SERÁ HOMOLOGADA APENAS DEPOIS DE CONCLUÍDOS TODOS OS DIAS DE AULA E LANÇADAS TODAS AS AVALIAÇÕES.";
    } else if (report.finalStatus === 'Aprovado') {
      return "APROVADO POIS ATINGIU AS MÉDIAS NECESSÁRIAS DE NOTA E PRESENÇA EM AULA ESTABELECIDAS PARA APROVAÇÃO.";
    } else if (report.finalStatus === 'Recuperação') {
      return `EM RECUPERAÇÃO: O ALUNO NÃO ATINGIU A MÉDIA MÍNIMA DE APROVAÇÃO (${minGrade.toString().replace('.', ',')}) EM ATÉ DUAS DISCIPLINAS, MAS ATENDE AOS REQUISITOS DE PRESENÇA EM AULA.`;
    } else if (report.finalStatus === 'Reprovado') {
      if (!isAttendanceApproved && hasFailedGrade) {
        return `REPROVADO POR NOTA E FALTA: EXCEDEU O LIMITE MÁXIMO DE FALTAS PERMITIDO DE ${maxAbsencePct}% E NÃO ATINGIU A MÉDIA FINAL MÍNIMA DE ${minGrade.toString().replace('.', ',')} PARA APROVAÇÃO.`;
      } else if (!isAttendanceApproved) {
        return `REPROVADO POR FALTA: EXCEDEU O LIMITE MÁXIMO DE FALTAS PERMITIDO DE ${maxAbsencePct}% DE AUSÊNCIAS EM AULA.`;
      } else {
        return `REPROVADO POR NOTA: NÃO ATINGIU A MÉDIA FINAL MÍNIMA COBRADA DE ${minGrade.toString().replace('.', ',')} NAS DISCIPLINAS AVALIADAS.`;
      }
    } else if (report.finalStatus === 'Pendente') {
      return "PENDENTE: EXISTEM COMPONENTES CURRICULARES OU ATIVIDADES COM LANÇAMENTO DE NOTA OU REGISTRO DE FREQUÊNCIA PENDENTES DE HOMOLOGAÇÃO.";
    }
    return "";
  };

  // Shared builder for a student bulletin inside an A4 portrait jsPDF document
  const renderStudentBulletinToDoc = (
    doc: jsPDF,
    report: any,
    classObj: Class | undefined,
    preloadedLogo: string,
    margin: number = 14
  ) => {
    const pageWidth = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;
    const contentWidth = pageWidth - margin * 2; // 182mm on A4 portrait
    const filterText = `TURMA: ${classObj?.name || 'N/D'}  •  ALUNO: ${formatRegistrationNumber(report.student.registration_number, 'S/M')}`;

    const headerBottomY = drawStandardReportHeader(
      doc,
      institution,
      'BOLETIM ESCOLAR DE RENDIMENTO ACADÊMICO',
      filterText,
      margin,
      preloadedLogo
    );

    // --- Student Metadata Box (strictly bounded within [margin, pageWidth - margin]) ---
    const metaY = headerBottomY;
    const metaH = 16;
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.25);
    doc.rect(margin, metaY, contentWidth, metaH, 'FD');

    const leftColMaxW = 104;
    const rightColMaxW = 66;
    const rightX = pageWidth - margin - 3.5;

    // Row 1: Aluno & Situação Cadastral
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(71, 85, 105);
    doc.text('ALUNO:', margin + 3.5, metaY + 5.8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    const studentText = `${formatRegistrationNumber(report.student.registration_number, 'S/M')} - ${(report.student.name || '').toUpperCase()}`;
    const fittedStudent = doc.splitTextToSize(studentText, leftColMaxW - 14)[0] || studentText;
    doc.text(fittedStudent, margin + 17.5, metaY + 5.8);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(71, 85, 105);
    const statusValue = `${report.student.status || 'Ativo'}`.toUpperCase();
    doc.text(`SITUAÇÃO: ${statusValue}`, rightX, metaY + 5.8, { align: 'right', maxWidth: rightColMaxW });

    // Row 2: Turma & Período
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(71, 85, 105);
    doc.text('TURMA:', margin + 3.5, metaY + 12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    const classLabel = `${classObj?.name || 'N/D'}`.toUpperCase();
    const fittedClass = doc.splitTextToSize(classLabel, leftColMaxW - 14)[0] || classLabel;
    doc.text(fittedClass, margin + 17.5, metaY + 12);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(71, 85, 105);
    const periodText = `PERÍODO: ${classObj?.period || 'Noite'} - ${(classObj?.days_of_week || []).join(', ') || 'Semanal'}`.toUpperCase();
    const fittedPeriod = doc.splitTextToSize(periodText, rightColMaxW)[0] || periodText;
    doc.text(fittedPeriod, rightX, metaY + 12, { align: 'right' });

    let cursorY = metaY + metaH + 7;

    // --- Section I Label ---
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(15, 23, 42);
    doc.text('I. CONTROLE DE FALTAS MENSAIS E FREQUÊNCIA', margin, cursorY);
    cursorY += 3;

    // --- Table I: Frequency (strict 182mm total width = 52 + 12*8.2 + 14.6 + 17) ---
    const headersFreq: any[] = [[
      { content: 'Disciplinas', styles: { halign: 'left' as any, valign: 'middle' as any } },
      'JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ',
      { content: 'Faltas', styles: { halign: 'center' as any, valign: 'middle' as any } },
      { content: '% Freq.', styles: { halign: 'center' as any, valign: 'middle' as any } }
    ]];

    const rowsFreq = report.subjectsPerformance.map((sp: any) => {
      const row = [`${sp.subjectCode} - ${sp.subjectName}`];
      const subSem = sp.semester || 'Geral';
      monthsList.forEach(m => {
        const isBlocked = isSubjectMonthBlocked(subSem, m.index);
        if (isBlocked) {
          row.push('-');
        } else {
          const abs = sp.monthlyAbsences[m.index];
          row.push(abs > 0 ? abs.toString() : '');
        }
      });
      row.push(sp.totalAbsences.toString());
      row.push(sp.presencePercentage !== null ? `${formatPresence(sp.presencePercentage)}%` : '-');
      return row;
    });

    const rowScheduled = ['AULAS NO MÊS'];
    monthsList.forEach(m => {
      const count = scheduledDaysByMonth[m.index];
      rowScheduled.push(count > 0 ? count.toString() : '-');
    });
    rowScheduled.push(totalClassDays.toString());
    rowScheduled.push('-');
    rowsFreq.unshift(rowScheduled);

    autoTable(doc, {
      head: headersFreq,
      body: rowsFreq,
      startY: cursorY,
      margin: { top: 56, left: margin, right: margin, bottom: 25 },
      tableWidth: contentWidth,
      theme: 'grid',
      styles: {
        fontSize: 7,
        cellPadding: { top: 2.3, bottom: 2.3, left: 0.7, right: 0.7 },
        lineColor: [203, 213, 225],
        lineWidth: 0.15,
        textColor: [30, 41, 59],
        font: 'helvetica',
        overflow: 'linebreak'
      },
      headStyles: {
        fillColor: [15, 23, 42],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 6.6,
        lineWidth: 0.15,
        lineColor: [15, 23, 42]
      },
      columnStyles: {
        0: { cellWidth: 52, fontStyle: 'bold' },
        1: { cellWidth: 8.2, halign: 'center' },
        2: { cellWidth: 8.2, halign: 'center' },
        3: { cellWidth: 8.2, halign: 'center' },
        4: { cellWidth: 8.2, halign: 'center' },
        5: { cellWidth: 8.2, halign: 'center' },
        6: { cellWidth: 8.2, halign: 'center' },
        7: { cellWidth: 8.2, halign: 'center' },
        8: { cellWidth: 8.2, halign: 'center' },
        9: { cellWidth: 8.2, halign: 'center' },
        10: { cellWidth: 8.2, halign: 'center' },
        11: { cellWidth: 8.2, halign: 'center' },
        12: { cellWidth: 8.2, halign: 'center' },
        13: { cellWidth: 14.6, halign: 'center' },
        14: { cellWidth: 17, halign: 'center' }
      }
    });

    cursorY = (doc as any).lastAutoTable.finalY + 8;
    if (cursorY > pageHeight - 45) {
      doc.addPage();
      cursorY = drawStandardReportHeader(
        doc,
        institution,
        'BOLETIM ESCOLAR DE RENDIMENTO ACADÊMICO',
        filterText,
        margin,
        preloadedLogo
      );
    }

    // --- Section II Label ---
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(15, 23, 42);
    doc.text('II. APROVEITAMENTO ACADÊMICO E SITUAÇÃO FINAL', margin, cursorY);
    cursorY += 3;

    // --- Table II: Grades (strict 182mm total width = 92 + 22 + 20 + 20 + 28) ---
    const headersGrades: any[] = [[
      { content: 'Disciplina / Avaliações', styles: { halign: 'left' as any, valign: 'middle' as any } },
      { content: 'Nota', styles: { halign: 'center' as any, valign: 'middle' as any } },
      { content: 'Soma', styles: { halign: 'center' as any, valign: 'middle' as any } },
      { content: 'Média Final', styles: { halign: 'center' as any, valign: 'middle' as any } },
      { content: 'Situação', styles: { halign: 'center' as any, valign: 'middle' as any } }
    ]];

    const rowsGrades: any[] = [];
    report.subjectsPerformance.forEach((sp: any) => {
      rowsGrades.push([
        {
          content: `${sp.subjectCode} - ${sp.subjectName}`,
          colSpan: 5,
          styles: { fontStyle: 'bold' as any, fillColor: [241, 245, 249], textColor: [15, 23, 42] }
        }
      ]);

      sp.detailedAssessments?.forEach((da: any, idx: number) => {
        rowsGrades.push([
          `  ↳ ${da.title || `Avaliação ${idx + 1}`}`,
          da.grade !== null && da.grade !== undefined ? formatGrade(da.grade) : '-',
          '-',
          '-',
          '-'
        ]);
      });

      rowsGrades.push([
        { content: '  SOMA E MÉDIA DO COMPONENTE', styles: { fontStyle: 'bold' as any, textColor: [71, 85, 105] } },
        '-',
        sp.gradesSum !== null && sp.gradesSum !== undefined ? formatGrade(sp.gradesSum) : '-',
        sp.finalGrade !== null && sp.finalGrade !== undefined ? formatGrade(sp.finalGrade) : '-',
        sp.status === 'Pendente' ? 'Pendente' : (report.finalStatus === 'Informativo' ? '-' : sp.status)
      ]);
    });

    autoTable(doc, {
      head: headersGrades,
      body: rowsGrades,
      startY: cursorY,
      margin: { top: 56, left: margin, right: margin, bottom: 25 },
      tableWidth: contentWidth,
      theme: 'grid',
      styles: {
        fontSize: 7.4,
        cellPadding: { top: 2.6, bottom: 2.6, left: 2, right: 2 },
        lineColor: [203, 213, 225],
        lineWidth: 0.15,
        textColor: [30, 41, 59],
        font: 'helvetica'
      },
      headStyles: {
        fillColor: [15, 23, 42],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 7.2,
        lineWidth: 0.15,
        lineColor: [15, 23, 42]
      },
      columnStyles: {
        0: { cellWidth: 92 },
        1: { cellWidth: 22, halign: 'center' },
        2: { cellWidth: 20, halign: 'center' },
        3: { cellWidth: 20, halign: 'center' },
        4: { cellWidth: 28, halign: 'center', fontStyle: 'bold' }
      }
    });

    // --- Summary Card + Justification Panel (with bottom footer clearance guard) ---
    let finalY = (doc as any).lastAutoTable.finalY + 7;
    const justificationText = getReportJustificationText(report, academicParams);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.2);
    const wrappedJustif = doc.splitTextToSize(justificationText, contentWidth - 10);
    const justifHeight = 10 + wrappedJustif.length * 3.8;
    const summaryHeight = 18;
    const neededBlockHeight = summaryHeight + 5.5 + justifHeight;

    if (finalY + neededBlockHeight > pageHeight - 23) {
      doc.addPage();
      finalY = drawStandardReportHeader(
        doc,
        institution,
        'BOLETIM ESCOLAR DE RENDIMENTO ACADÊMICO',
        filterText,
        margin,
        preloadedLogo
      );
    }

    // 3-column summary card aligned strictly to [margin, pageWidth - margin] (width = 120mm, right-aligned)
    const cardW = 120;
    const cardX = pageWidth - margin - cardW;
    const colW = cardW / 3;
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.25);
    doc.setFillColor(248, 250, 252);
    doc.rect(cardX, finalY, cardW, summaryHeight, 'FD');
    doc.line(cardX + colW, finalY, cardX + colW, finalY + summaryHeight);
    doc.line(cardX + colW * 2, finalY, cardX + colW * 2, finalY + summaryHeight);
    doc.line(cardX, finalY + 8, cardX + cardW, finalY + 8);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(71, 85, 105);
    doc.text('MÉDIA FREQUÊNCIA', cardX + colW * 0.5, finalY + 5.3, { align: 'center' });
    doc.text('MÉDIA DE NOTAS', cardX + colW * 1.5, finalY + 5.3, { align: 'center' });
    doc.text('SITUAÇÃO GERAL', cardX + colW * 2.5, finalY + 5.3, { align: 'center' });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(15, 23, 42);
    doc.text(report.averageFrequency !== null ? `${formatPresence(report.averageFrequency)}%` : '-', cardX + colW * 0.5, finalY + 14.5, { align: 'center' });
    doc.text(formatGrade(report.averageGrade), cardX + colW * 1.5, finalY + 14.5, { align: 'center' });
    doc.text(String(report.finalStatus || '-').toUpperCase(), cardX + colW * 2.5, finalY + 14.5, { align: 'center' });

    // Justification block
    const jY = finalY + summaryHeight + 5.5;
    doc.setFillColor(255, 241, 242);
    doc.setDrawColor(254, 205, 211);
    doc.setLineWidth(0.25);
    doc.rect(margin, jY, contentWidth, justifHeight, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.8);
    doc.setTextColor(190, 18, 60);
    doc.text('JUSTIFICATIVA DO RESULTADO / PARECER DA SECRETARIA:', margin + 4.5, jY + 5.5);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.2);
    doc.setTextColor(51, 65, 85);
    doc.text(wrappedJustif, margin + 4.5, jY + 10.5);
  };

  // 1. Export Dynamic Individual Report Card as A4 PDF (Fast, async preloaded logo)
  const exportIndividualPDF = async (reportToPdf: any) => {
    if (!reportToPdf) return;
    setExportingPDF(true);

    try {
      const preloadedLogo = await preloadReportLogoDataUrl(institution?.logo_url);
      const doc = new jsPDF({
        orientation: 'p',
        unit: 'mm',
        format: 'a4'
      });

      const margin = 14;
      renderStudentBulletinToDoc(doc, reportToPdf, activeClassObj, preloadedLogo, margin);
      drawStandardReportFooter(doc, institution, margin);

      const safeName = (reportToPdf.student.name || 'aluno').toLowerCase().replace(/\s+/g, '_');
      doc.save(`boletim_${safeName}_${new Date().getFullYear()}.pdf`);
    } catch (err) {
      console.error('Error generating individual PDF:', err);
    } finally {
      setExportingPDF(false);
    }
  };

  // 2. Export Class-wide summary situation report as PDF (Aligned inside A4 margins with standard header/footer)
  const exportClassSummaryPDF = async () => {
    if (!selectedClassId) return;
    setExportingPDF(true);

    try {
      const preloadedLogo = await preloadReportLogoDataUrl(institution?.logo_url);
      const doc = new jsPDF({
        orientation: 'p',
        unit: 'mm',
        format: 'a4'
      });

      const pageWidth = doc.internal.pageSize.width;
      const margin = 14;
      const contentWidth = pageWidth - margin * 2; // 182mm

      const filterText = `TURMA: ${activeClassObj?.name || 'N/D'}  •  SEMESTRE: ${activeClassObj?.semester || '1º'}  •  TURNO: ${activeClassObj?.period || 'Noite'}  •  DIAS LETIVOS: ${totalClassDays}`;
      let y = drawStandardReportHeader(
        doc,
        institution,
        'RELATÓRIO RESUMIDO DE RENDIMENTO ACADÊMICO',
        filterText,
        margin,
        preloadedLogo
      );

      // Summary Statistics Strip (bounded cleanly inside contentWidth = 182mm)
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.25);
      doc.rect(margin, y, contentWidth, 12, 'FD');

      const statsLabels = [
        `ALUNOS: ${total}`,
        `INFORMATIVOS: ${informative}`,
        `APROVADOS: ${approved}`,
        `RECUPERAÇÃO: ${recuperation}`,
        `REPROVADOS: ${failed}`,
        `PENDENTES: ${pending}`
      ];
      const segmentW = contentWidth / statsLabels.length;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.8);
      doc.setTextColor(30, 41, 59);
      statsLabels.forEach((lbl, idx) => {
        doc.text(lbl, margin + segmentW * (idx + 0.5), y + 7.2, { align: 'center' });
      });

      y += 16;

      // Student rows Table (strict 182mm total width = 26 + 66 + 22 + 22 + 18 + 28)
      const headers = [['Matrícula', 'Aluno', 'Média Notas', 'Total Faltas', 'Freq. %', 'Situação Geral']];
      const rows = sortedReports.map(res => [
        formatRegistrationNumber(res.student.registration_number, 'N/D'),
        res.student.name.toUpperCase(),
        formatGrade(res.averageGrade),
        res.totalAbsences.toString(),
        res.averageFrequency !== null ? `${formatPresence(res.averageFrequency)}%` : '-',
        res.finalStatus.toUpperCase()
      ]);

      autoTable(doc, {
        head: headers,
        body: rows,
        startY: y,
        margin: { top: 56, left: margin, right: margin, bottom: 25 },
        tableWidth: contentWidth,
        theme: 'grid',
        styles: {
          fontSize: 7.5,
          cellPadding: { top: 2.2, bottom: 2.2, left: 1.5, right: 1.5 },
          lineColor: [203, 213, 225],
          lineWidth: 0.15,
          textColor: [30, 41, 59],
          font: 'helvetica'
        },
        headStyles: {
          fillColor: [15, 23, 42],
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          fontSize: 7.5,
          lineWidth: 0.15,
          lineColor: [15, 23, 42]
        },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: {
          0: { cellWidth: 26 },
          1: { cellWidth: 66 },
          2: { cellWidth: 22, halign: 'center' },
          3: { cellWidth: 22, halign: 'center' },
          4: { cellWidth: 18, halign: 'center' },
          5: { cellWidth: 28, halign: 'center', fontStyle: 'bold' }
        }
      });

      drawStandardReportFooter(doc, institution, margin);

      doc.save(`situacao_academica_turma_${activeClassObj?.name.toLowerCase().replace(/\s+/g, '_') || 'classe'}.pdf`);
    } catch (e) {
      console.error('Error generating class summary PDF:', e);
    } finally {
      setExportingPDF(false);
    }
  };

  // 3. Export ALL active bulletins of the class sequentially (Lote) without blocking UI
  const exportAllClassBulletinsPDF = async () => {
    if (!selectedClassId || studentReports.length === 0) return;
    setExportingPDF(true);

    try {
      const preloadedLogo = await preloadReportLogoDataUrl(institution?.logo_url);
      const doc = new jsPDF({
        orientation: 'p',
        unit: 'mm',
        format: 'a4'
      });

      const margin = 14;
      for (let i = 0; i < studentReports.length; i++) {
        if (i > 0) doc.addPage();
        renderStudentBulletinToDoc(doc, studentReports[i], activeClassObj, preloadedLogo, margin);
        if ((i + 1) % 6 === 0) {
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      }

      drawStandardReportFooter(doc, institution, margin);
      doc.save(`boletins_lote_turma_${activeClassObj?.name.toLowerCase().replace(/\s+/g, '_') || 'classe'}.pdf`);
    } catch (e) {
      console.error('Error in batch PDF export:', e);
    } finally {
      setExportingPDF(false);
    }
  };

  return (
    <div className="space-y-3 sm:space-y-3.5 animate-in fade-in duration-300">
      
      {/* Page Core Header Frame */}
      <PageHeader 
        title="Boletim Escolar" 
        description="Painel informativo de notas e aproveitamento escolar para controle de uso interno."
        icon={FileSpreadsheet}
        badge="Informativo & Notas"
      >
        {selectedClassId && (
          <>
            <button
              onClick={() => setViewMode('student')}
              title="Visualizar boletim completo individual de cada aluno"
              className={cn(
                "px-4 py-2 border rounded-lg text-[10px] font-semibold uppercase tracking-wider transition-all leading-none cursor-pointer",
                viewMode === 'student' 
                  ? "bg-slate-900 text-white border-slate-900 shadow-sm" 
                  : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
              )}
            >
              Individual por Aluno
            </button>
            <button
              onClick={() => setViewMode('class')}
              title="Visualizar quadro resumido com notas e frequência de toda a turma"
              className={cn(
                "px-4 py-2 border rounded-lg text-[10px] font-semibold uppercase tracking-wider transition-all leading-none cursor-pointer",
                viewMode === 'class' 
                  ? "bg-slate-900 text-white border-slate-900 shadow-sm" 
                  : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
              )}
            >
              Por Turma (Resumido)
            </button>
          </>
        )}
      </PageHeader>

      {loading ? (
        <div className="min-h-[400px] flex items-center justify-center flex-col gap-3">
          <Loader2 className="animate-spin text-slate-400" size={32} />
          <p className="text-[10px] font-bold text-slate-450 uppercase tracking-widest">Carregando Diários de Notas...</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Unit Conflict Banner */}
          <div className="print:hidden">
            <UnitConflictBanner
              moduleName="Boletim Escolar"
              entityNameSingular="turma"
              entityNamePlural="turmas"
              totalRecordsAllUnits={classes.length}
              recordsInActiveUnit={scopedClasses.length}
              selectedItemUnit={selectedClassId ? getItemUnitId(classes.find(c => c.id === selectedClassId)) : undefined}
              selectedItemName={classes.find(c => c.id === selectedClassId)?.name}
            />
          </div>

          {/* Filtering parameters section */}
          <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-4 md:p-5 print:hidden">
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
                    title="Selecionar a turma para exibir os boletins"
                    className="w-full pl-12 pr-8 py-2.5 bg-white border border-slate-200 rounded-lg text-[11px] font-semibold text-slate-800 appearance-none outline-none focus:border-slate-400 transition-colors"
                  >
                    <option value="">SELECIONAR TURMA...</option>
                    {scopedClasses.map((c, idx) => (
                      <option key={`blt-cls-opt-${c.id || idx}-${idx}`} value={c.id}>{c.name}</option>
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
                      title="Selecionar o aluno para visualização do boletim individual"
                      className="w-full pl-12 pr-8 py-2.5 bg-white border border-slate-200 rounded-lg text-[11px] font-semibold text-slate-800 appearance-none outline-none focus:border-slate-400 transition-colors"
                    >
                      {classStudents.length === 0 ? (
                        <option value="">Nenhum Aluno Ativo Encontrado</option>
                      ) : (
                        classStudents.map((s, idx) => (
                          <option key={`blt-stu-opt-${s.id || idx}-${idx}`} value={s.id}>
                            {s.registration_number ? `${formatRegistrationNumber(s.registration_number)} - ` : ''}{s.name}
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
                      title="Filtrar alunos no quadro resumido por nome ou matrícula"
                      className="w-full pl-12 pr-4 py-2.5 bg-white border border-slate-200 rounded-lg text-[11px] font-semibold text-slate-800 placeholder:text-slate-400 focus:border-slate-400 outline-none transition-colors"
                    />
                  </div>
                </div>
              )}

              {/* Action buttons area */}
              {selectedClassId && (
                <div className="md:col-span-3 flex flex-wrap items-center gap-2">
                  <button
                    onClick={handlePrint}
                    disabled={loadingClassData}
                    title={viewMode === 'student' ? 'Imprimir boletim individual do aluno selecionado' : 'Imprimir quadro resumido de rendimento da turma'}
                    className="flex-1 min-w-[96px] py-2.5 px-3 bg-slate-900 hover:bg-slate-950 disabled:opacity-60 border border-slate-900 text-white rounded-lg text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-sm"
                  >
                    <Printer size={13} />
                    Imprimir
                  </button>
                  {viewMode === 'student' ? (
                    <button
                      onClick={() => exportIndividualPDF(activeStudentReport)}
                      disabled={exportingPDF || loadingClassData || !activeStudentReport}
                      title="Gerar e baixar o Boletim Individual em arquivo PDF"
                      className="flex-1 min-w-[106px] py-2.5 px-3 bg-white hover:bg-slate-50 disabled:opacity-50 border border-slate-300 text-slate-800 rounded-lg text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-sm"
                    >
                      {exportingPDF ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                      {exportingPDF ? 'Gerando...' : 'Baixar PDF'}
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={exportClassSummaryPDF}
                        disabled={exportingPDF || loadingClassData || sortedReports.length === 0}
                        title="Baixar o quadro resumido da turma em PDF"
                        className="flex-1 min-w-[96px] py-2.5 px-2.5 bg-white hover:bg-slate-50 disabled:opacity-50 border border-slate-300 text-slate-800 rounded-lg text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-1 transition-colors cursor-pointer shadow-sm"
                      >
                        {exportingPDF ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                        PDF
                      </button>
                      <button
                        onClick={exportAllClassBulletinsPDF}
                        disabled={exportingPDF || loadingClassData || studentReports.length === 0}
                        title="Gerar PDF único com todos os boletins individuais da turma"
                        className="flex-1 min-w-[102px] py-2.5 px-2.5 bg-white hover:bg-slate-50 disabled:opacity-50 border border-slate-300 text-slate-800 rounded-lg text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-1 transition-colors cursor-pointer shadow-sm"
                      >
                        {exportingPDF ? <Loader2 size={12} className="animate-spin" /> : <FileText size={12} />}
                        Lote PDF
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          {!selectedClassId ? (
            <div className="bg-white border border-slate-200 shadow-sm p-8 text-center rounded-lg print:hidden">
              <div className="w-12 h-12 bg-slate-50 border border-slate-200 text-slate-500 flex items-center justify-center mx-auto mb-4">
                 <Info size={20} />
              </div>
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-widest">Nenhuma Turma Selecionada</h3>
              <p className="text-[10px] text-slate-505 leading-relaxed font-semibold uppercase tracking-widest mt-1.5 max-w-md mx-auto">
                Por favor, escolha uma de suas turmas ativas no seletor acima para renderizar os boletins individuais ou visões gerais.
              </p>
            </div>
          ) : loadingClassData ? (
            <div className="min-h-[300px] bg-white border border-slate-200 rounded-lg flex items-center justify-center flex-col gap-3 print:hidden">
              <Loader2 className="animate-spin text-slate-500" size={28} />
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Carregando notas e frequência da turma...</p>
            </div>
          ) : viewMode === 'student' ? (
            activeStudentReport ? (
              /* --- INDIVIDUAL INDOOR BULLETIN LAYOUT --- */
              <div className="space-y-4">
                
                {/* On-screen paper layout framing simulating standard print sheet */}
                <div id="printable-boletim" className="bg-white p-4 sm:p-6 text-slate-900 max-w-[210mm] mx-auto relative font-sans leading-relaxed border border-slate-200 shadow-sm print:shadow-none print:p-0 print:border-none print:max-w-none print:w-full">
                  
                  {/* Inner container: flex-col on screen, block with bottom-anchored footer in print to avoid Chromium flex fragmentation bug */}
                  <div className="space-y-6 print:space-y-0 flex flex-col justify-between min-h-[272mm] boletim-print-sheet">
                    
                    <div className="space-y-6 print:space-y-3 boletim-print-body">
                      {/* Standardized Institutional Header */}
                      <StandardReportHeader
                        inst={institution}
                        title="BOLETIM ESCOLAR DE RENDIMENTO ACADÊMICO"
                        filterText={`TURMA: ${activeClassObj?.name || 'N/D'}  •  PERÍODO: ${activeClassObj?.period || 'Noite'}`}
                      />

                      {/* Student details display bar */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 text-[10px] uppercase tracking-wider font-semibold text-slate-500 bg-slate-50/70 border border-slate-200 p-3.5 sm:p-4 rounded-sm print:grid-cols-2 print:gap-x-6 print:gap-y-1.5 print:p-2.5">
                        <div className="flex flex-col gap-1 min-w-0">
                          <span className="text-[8px] font-bold text-slate-400">Aluno</span>
                          <span className="text-slate-900 font-extrabold truncate">
                            <strong className="text-slate-950 font-mono mr-1.5">{formatRegistrationNumber(activeStudentReport.student.registration_number, '000000/0000')}</strong> 
                            {activeStudentReport.student.name}
                          </span>
                        </div>
                        
                        <div className="flex flex-col gap-1 sm:items-end print:items-end">
                          <span className="text-[8px] font-bold text-slate-400">Situação Cadastral</span>
                          <span className="text-emerald-700 font-extrabold bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 inline-block text-[9px] leading-tight select-none">
                            {activeStudentReport.student.status || 'Ativo'}
                          </span>
                        </div>

                        <div className="flex flex-col gap-1 min-w-0">
                          <span className="text-[8px] font-bold text-slate-400">Turma</span>
                          <span className="text-slate-900 font-extrabold truncate">
                            {activeClassObj?.name || 'N/D'}
                          </span>
                        </div>

                        <div className="flex flex-col gap-1 sm:items-end print:items-end min-w-0">
                          <span className="text-[8px] font-bold text-slate-400">Período / Frequência</span>
                          <span className="text-slate-800 font-bold text-right">
                            {activeClassObj?.period || 'Noite'} - {(activeClassObj?.days_of_week || []).join(', ') || 'Semanal'}
                          </span>
                        </div>
                      </div>

                      {/* Tabela I - Registro de Frequência e Faltas */}
                      <div className="space-y-2.5">
                        <div className="flex items-center gap-1.5 pb-0.5">
                          <span className="w-1.5 h-1.5 bg-slate-800" />
                          <h3 className="text-[9px] font-black text-slate-800 uppercase tracking-wider">
                            Controle de Faltas Mensais e Frequência
                          </h3>
                        </div>
                        <div className="overflow-x-auto select-text border border-slate-200 print:overflow-visible">
                          <table className="w-full text-left font-sans text-[10px] border-collapse uppercase table-fixed boletim-freq-table">
                            <colgroup>
                              <col className="w-[35%]" />
                              {monthsList.map(m => (
                                <col key={m.index} className="w-[4%]" />
                              ))}
                              <col className="w-[8%]" />
                              <col className="w-[9%]" />
                            </colgroup>
                            <thead>
                              {/* Semester Groupings Header Row */}
                              <tr className="bg-slate-100/70 border-b border-slate-200 text-slate-800 text-[8px] sm:text-[8.5px] font-black tracking-wider">
                                <th rowSpan={2} className="px-2.5 py-2 border-r border-slate-200 text-left align-middle">
                                  Disciplinas
                                </th>
                              <th colSpan={7} className="py-1.5 text-center border-r border-slate-200 bg-slate-100/90 text-slate-800 font-extrabold text-[7.5px] sm:text-[8px] md:text-[8.5px]">
                                1º Semestre {sem1Days > 0 ? `(${sem1Days} Aulas)` : ''}
                              </th>
                              <th colSpan={5} className="py-1.5 text-center border-r border-slate-200 bg-slate-100/90 text-slate-800 font-extrabold text-[7.5px] sm:text-[8px] md:text-[8.5px]">
                                2º Semestre {sem2Days > 0 ? `(${sem2Days} Aulas)` : ''}
                              </th>
                              <th rowSpan={2} className="py-2 border-r border-slate-200 text-center text-[7.5px] sm:text-[8.5px] md:text-[9px] leading-tight px-0.5 align-middle">
                                Total
                              </th>
                              <th rowSpan={2} className="py-2 text-center text-[7.5px] sm:text-[8.5px] md:text-[9px] leading-tight px-0.5 align-middle">
                                Freq.
                              </th>
                            </tr>
                            <tr className="bg-slate-50 border-b border-slate-200 text-slate-800 text-[9px] font-bold tracking-wider">
                              {monthsList.map(month => (
                                <th key={month.index} className="py-1.5 text-center border-r border-slate-200 px-0.5 text-[7.5px] sm:text-[8px] md:text-[8.5px] whitespace-nowrap">
                                  {month.label}
                                </th>
                              ))}
                            </tr>
                            <tr className="bg-slate-100/40 border-b border-slate-200 text-slate-700 text-[8px] font-black uppercase tracking-wider">
                              <th className="px-2.5 py-2 border-r border-slate-200 text-left text-[7.5px] sm:text-[8px] font-black text-slate-500 bg-slate-100/25">
                                Aulas no Mês
                              </th>
                              {monthsList.map(month => {
                                const dayCount = scheduledDaysByMonth[month.index];
                                return (
                                  <th key={month.index} className="py-2 text-center border-r border-slate-200 font-mono text-[7.5px] sm:text-[8px] md:text-[8.5px] font-black text-slate-600 bg-slate-100/10">
                                    {dayCount > 0 ? dayCount : '-'}
                                  </th>
                                );
                              })}
                              <th className="py-2 border-r border-slate-200 text-center font-mono text-[7.5px] sm:text-[8.5px] md:text-[9px] font-black text-slate-600 bg-slate-100/25">
                                {totalClassDays}
                              </th>
                              <th className="py-2 text-center font-mono text-[7.5px] sm:text-[8.5px] md:text-[9px] font-black text-slate-400 bg-slate-100/25">
                                -
                              </th>
                            </tr>
                          </thead>
                          {activeStudentReport.subjectsPerformance.map((sp, sIdx) => {
                            const subSem = sp.semester || getSubjectSemester(subjects.find(s => s.id === sp.subjectId));
                            return (
                              <tbody key={`blt-sub-perf-${sp.subjectId || sIdx}-${sIdx}`} className={cn(
                                "text-slate-700 break-inside-avoid page-break-inside-avoid bg-white",
                                sIdx > 0 ? "border-t border-slate-200" : ""
                              )}>
                                {/* Row 1: Faltas */}
                                <tr className="hover:bg-slate-50/50 text-[9px] sm:text-[10px] font-semibold border-b border-slate-100">
                                  <td className="px-2.5 py-2 border-r border-slate-100 text-slate-900 font-bold whitespace-nowrap overflow-hidden text-ellipsis">
                                    <div className="flex items-center justify-between gap-1.5 min-w-0">
                                      <span className="truncate text-[8px] sm:text-[9.5px]" title={`${sp.subjectCode} - ${sp.subjectName}`}>
                                        {sp.subjectCode} - {sp.subjectName}
                                      </span>
                                      <span className="text-[6.5px] sm:text-[7.5px] bg-rose-50 text-rose-700 px-1 py-0.5 sm:px-1.5 border border-rose-200 font-black rounded-lg shrink-0 boletim-badge-pill">FALTAS</span>
                                    </div>
                                  </td>
                                  {monthsList.map(m => {
                                    const absCount = sp.monthlyAbsences[m.index];
                                    const isBlocked = isSubjectMonthBlocked(subSem, m.index);
                                    return (
                                      <td 
                                        key={m.index} 
                                        className={cn(
                                          "py-2 text-center border-r border-slate-100 font-mono text-[8.5px] sm:text-[9.5px]",
                                          isBlocked && "bg-amber-50/40 text-slate-400"
                                        )}
                                      >
                                        {isBlocked ? '-' : (absCount > 0 ? absCount : '')}
                                      </td>
                                    );
                                  })}
                                  <td className="py-2 text-center border-r border-slate-100 font-bold font-mono text-slate-800 bg-rose-50/20 text-[8.5px] sm:text-[9.5px]">
                                    {sp.totalAbsences}
                                  </td>
                                  <td rowSpan={2} className="py-2 text-center font-bold font-mono text-slate-800 bg-slate-50/10 align-middle text-[8.5px] sm:text-[9.5px]">
                                    {sp.presencePercentage !== null ? `${formatPresence(sp.presencePercentage)}%` : '-'}
                                  </td>
                                </tr>
                                {/* Row 2: Presenças */}
                                <tr className="hover:bg-slate-50/50 text-[9px] sm:text-[10px] font-semibold border-b border-slate-200">
                                  <td className="px-2.5 py-2 border-r border-slate-100 text-slate-500 font-normal whitespace-nowrap overflow-hidden text-ellipsis">
                                    <div className="flex items-center justify-between gap-1.5 min-w-0">
                                      <span className="truncate text-slate-500 text-[8px] sm:text-[9.5px]" title={`${sp.subjectCode} - ${sp.subjectName}`}>
                                        {sp.subjectCode} - {sp.subjectName}
                                      </span>
                                      <span className="text-[6.5px] sm:text-[7.5px] bg-emerald-50 text-emerald-700 px-1 py-0.5 sm:px-1.5 border border-emerald-200 font-black rounded-lg shrink-0 font-bold boletim-badge-pill">PRESENÇAS</span>
                                    </div>
                                  </td>
                                  {monthsList.map(m => {
                                    const presCount = sp.monthlyPresences ? sp.monthlyPresences[m.index] : 0;
                                    const isBlocked = isSubjectMonthBlocked(subSem, m.index);
                                    return (
                                      <td 
                                        key={m.index} 
                                        className={cn(
                                          "py-2 text-center border-r border-slate-100 font-mono text-[8.5px] sm:text-[9.5px] text-slate-600",
                                          isBlocked && "bg-amber-50/40 text-slate-400"
                                        )}
                                      >
                                        {isBlocked ? '-' : (presCount > 0 ? presCount : '')}
                                      </td>
                                    );
                                  })}
                                  <td className="py-2 text-center border-r border-slate-100 font-bold font-mono text-emerald-700 bg-emerald-50/20 text-[8.5px] sm:text-[9.5px]">
                                    {sp.totalPresences || 0}
                                  </td>
                                </tr>
                              </tbody>
                            );
                          })}
                        </table>
                      </div>
                    </div>

                    {/* Tabela II - Aproveitamento Acadêmico (Notas e Situação) */}
                    <div className="space-y-2.5 print:space-y-1.5 pt-2 print:pt-0.5">
                      <div className="flex items-center gap-1.5 pb-0.5">
                        <span className="w-1.5 h-1.5 bg-slate-800" />
                        <h3 className="text-[9px] font-black text-slate-800 uppercase tracking-wider">
                          Aproveitamento Acadêmico e Situação Final
                        </h3>
                      </div>
                      <div className="overflow-x-auto select-text border border-slate-200">
                        <table className="w-full text-left font-sans text-[10px] border-collapse uppercase table-fixed">
                          <colgroup>
                            <col className="w-[58%] sm:w-[60%] md:w-[64%]" />
                            <col className="w-[14%] sm:w-[13.3%] md:w-[12%]" />
                            <col className="w-[14%] sm:w-[13.3%] md:w-[12%]" />
                            <col className="w-[14%] sm:w-[13.3%] md:w-[12%]" />
                          </colgroup>
                          <thead>
                            <tr className="bg-slate-50 border-b border-slate-200 text-slate-800 text-[9px] font-black tracking-wider">
                              <th className="px-3 py-2.5 border-r border-slate-200 text-left">
                                Disciplina / Avaliações
                              </th>
                              <th className="py-2.5 border-r border-slate-200 text-center">
                                Nota
                              </th>
                              <th className="py-2.5 border-r border-slate-200 text-center">
                                Soma
                              </th>
                              <th className="py-2.5 text-center">
                                Média Final
                              </th>
                            </tr>
                          </thead>
                          {activeStudentReport.subjectsPerformance.map((sp, sIdx) => (
                            <tbody key={`blt-sub-eval-${sp.subjectId || sIdx}-${sIdx}`} className={cn(
                              "text-slate-700 break-inside-avoid page-break-inside-avoid bg-white",
                              sIdx > 0 ? "border-t border-slate-200" : ""
                            )}>
                              {/* Subject Title Row spanning 4 columns */}
                              <tr className="bg-slate-50/70 border-b border-slate-200">
                                <td colSpan={4} className="px-3 py-2 text-slate-900 font-extrabold text-[10.5px]">
                                  {sp.subjectCode} - {sp.subjectName}
                                </td>
                              </tr>
                              {/* Assessment detailed rows */}
                              {sp.detailedAssessments?.map((da: any, idx: number) => (
                                  <tr key={`blt-da-${da.id || idx}-${idx}`} className="hover:bg-slate-50/50 border-b border-slate-100 text-[10px]">
                                    <td className="pl-6 pr-3 py-2 border-r border-slate-100 text-slate-600 font-medium italic">
                                      ↳ {da.title}
                                    </td>
                                    <td className="py-2 text-center border-r border-slate-100 font-mono text-slate-900 font-bold">
                                      {da.grade !== null && da.grade !== undefined ? formatGrade(da.grade) : '-'}
                                    </td>
                                    <td className="py-2 text-center border-r border-slate-100 font-mono text-slate-300">
                                      -
                                    </td>
                                    <td className="py-2 text-center font-mono text-slate-300">
                                      -
                                    </td>
                                  </tr>
                              ))}
                              {/* Totals/Averages Row for this Subject */}
                              <tr className="bg-slate-50/20 font-bold text-[10px]">
                                <td className="pl-6 pr-3 py-2 border-r border-slate-100 text-slate-600 font-extrabold tracking-wide">
                                  Soma e Média do Componente
                                </td>
                                <td className="py-2 text-center border-r border-slate-100 font-mono text-slate-300">
                                  -
                                </td>
                                <td className="py-2 text-center border-r border-slate-100 font-mono text-slate-900 font-black bg-slate-100/10">
                                  {sp.gradesSum !== null && sp.gradesSum !== undefined ? formatGrade(sp.gradesSum) : '-'}
                                </td>
                                <td className="py-2 text-center font-mono text-slate-900 font-black bg-slate-100/25">
                                  {sp.finalGrade !== null && sp.finalGrade !== undefined ? formatGrade(sp.finalGrade) : '-'}
                                </td>
                              </tr>
                            </tbody>
                          ))}
                        </table>
                      </div>
                    </div>

                    {/* Integrated footer statistics aligned right below table */}
                    <div className="flex justify-end pt-2 print:pt-0.5 break-inside-avoid page-break-inside-avoid">
                      <div className="border border-slate-200 font-sans text-[10px] w-full sm:max-w-[380px] uppercase">
                        <div className="grid grid-cols-[1.65fr_1fr] border-b border-slate-200 divide-x divide-slate-200 bg-slate-50/40">
                          <div className="px-4 py-2 print:py-1.5 font-bold text-slate-500 whitespace-nowrap">Média Geral de Frequência</div>
                          <div className="px-4 py-2 print:py-1.5 text-right font-black font-mono text-slate-800">
                            {activeStudentReport.averageFrequency !== null ? `${formatPresence(activeStudentReport.averageFrequency)}%` : '-'}
                          </div>
                        </div>
                        <div className="grid grid-cols-[1.65fr_1fr] border-b border-slate-200 divide-x divide-slate-200 bg-slate-50/40">
                          <div className="px-4 py-2 print:py-1.5 font-bold text-slate-500 whitespace-nowrap">Média Geral de Notas</div>
                          <div className="px-4 py-2 print:py-1.5 text-right font-black font-mono text-slate-800">
                            {formatGrade(activeStudentReport.averageGrade)}
                          </div>
                        </div>
                        {/* Final Status row replacing previous in-table column */}
                        <div className="grid grid-cols-[1.65fr_1fr] divide-x divide-slate-200 bg-slate-50/40">
                          <div className="px-4 py-2 print:py-1.5 font-bold text-slate-500 whitespace-nowrap">SITUAÇÃO GERAL (FINAL)</div>
                          <div className={cn(
                            "px-4 py-2 print:py-1.5 text-right font-black tracking-wider uppercase",
                            activeStudentReport.finalStatus === 'Reprovado' ? "text-rose-700 bg-rose-50/30" :
                            activeStudentReport.finalStatus === 'Recuperação' ? "text-amber-700 bg-amber-50/30" :
                            activeStudentReport.finalStatus === 'Pendente' ? "text-slate-400 bg-slate-50" :
                            activeStudentReport.finalStatus === 'Informativo' ? "text-blue-700 bg-blue-50/45" : 
                            "text-emerald-700 bg-emerald-50/30"
                          )}>
                            {activeStudentReport.finalStatus}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Justification / Explanation panel (represented as Pink highlighted card area) */}
                    <div className="border border-rose-200 bg-rose-50/15 p-4 print:p-2.5 mt-4 print:mt-1 text-left rounded-lg break-inside-avoid page-break-inside-avoid">
                      <p className="text-[8.5px] font-black text-rose-700 uppercase tracking-widest mb-2 print:mb-1">
                        Justificativa do Resultado / Parecer da Secretaria
                      </p>
                      <p className="text-[10px] print:text-[8.5px] font-extrabold text-slate-700 leading-relaxed print:leading-snug uppercase">
                        {getReportJustificationText(activeStudentReport, academicParams)}
                      </p>
                    </div>

                    </div>

                    {/* Standardized Institutional Footer (no email: prefix, green WhatsApp icon when marked) */}
                    <div className="boletim-print-footer-anchor shrink-0 mt-auto">
                      <StandardReportFooter
                        inst={institution}
                        pageNumber={1}
                        totalPages={1}
                      />
                    </div>

                  </div>
                </div>

                {/* Additional diagnostic indicator info */}
                <div className="max-w-[210mm] mx-auto p-4 bg-slate-50 border border-slate-205 flex items-center gap-3 text-slate-700 print:hidden mt-4">
                  <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center flex-shrink-0 text-slate-500 border border-slate-200">
                     <Info size={14} />
                  </div>
                  <p className="text-[10px] font-bold uppercase tracking-wider leading-relaxed">
                    Dica: Use Imprimir (A4 Retrato) ou Baixar PDF para gerar o documento oficial com margens, cabeçalho e rodapé institucional.
                  </p>
                </div>
              </div>
            ) : (
              <div className="bg-white border border-slate-200 p-8 text-center rounded-lg print:hidden">
                <AlertTriangle className="text-amber-500 mx-auto mb-3" size={24} />
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-widest">Nenhum Aluno Ativo</h3>
                <p className="text-[10px] text-slate-400 uppercase tracking-widest mt-1">Essa turma não possui alunos regularmente matriculados.</p>
              </div>
            )
          ) : (
            /* --- CLASS LISTING GENERAL PERFORMANCE LAYOUT --- */
            <div className="space-y-6">
              {/* Class Summary widgets */}
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 print:hidden">
                 <div className="bg-slate-50 border border-slate-200 p-5 rounded-lg shadow-none">
                   <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Alunos Ativos</p>
                   <h4 className="text-2xl font-bold text-slate-800 mt-1">{total}</h4>
                 </div>
                 <div className="bg-blue-50/50 border border-blue-250 p-5 rounded-lg shadow-none border-l-4 border-l-blue-600">
                   <p className="text-[10px] font-bold text-blue-805 uppercase tracking-widest">Informativos</p>
                   <h4 className="text-2xl font-bold text-blue-600 mt-1">{informative}</h4>
                 </div>
                 <div className="bg-emerald-50/50 border border-emerald-250 p-5 rounded-lg shadow-none border-l-4 border-l-emerald-600">
                   <p className="text-[10px] font-bold text-emerald-805 uppercase tracking-widest">Aprovados</p>
                   <h4 className="text-2xl font-bold text-emerald-600 mt-1">{approved}</h4>
                 </div>
                 <div className="bg-amber-50/50 border border-amber-250 p-5 rounded-lg shadow-none border-l-4 border-l-amber-600">
                   <p className="text-[10px] font-bold text-amber-805 uppercase tracking-widest">Em Recuperação</p>
                   <h4 className="text-2xl font-bold text-amber-500 mt-1">{recuperation}</h4>
                 </div>
                 <div className="bg-rose-50/50 border border-rose-250 p-5 rounded-lg shadow-none border-l-4 border-l-rose-600">
                   <p className="text-[10px] font-bold text-rose-805 uppercase tracking-widest">Reprovados / Pendentes</p>
                   <h4 className="text-2xl font-bold text-rose-500 mt-1">{failed + pending}</h4>
                 </div>
              </div>

              <div id="printable-class-bulletin" className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden print:border-none print:shadow-none print:overflow-visible">
                <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/60 flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:hidden">
                  <h3 className="text-[10px] font-black text-slate-800 uppercase tracking-widest">
                    Quadro Geral de Rendimento e Presença ({activeClassObj?.name})
                  </h3>
                  <span className="text-[9px] font-bold text-slate-600 bg-slate-200 border border-slate-300 px-3 py-1 uppercase tracking-widest leading-none">
                    {classSubjects.length} Disciplinas Ativas nesta Turma
                  </span>
                </div>

                {sortedReports.length === 0 ? (
                  <div className="p-12 text-center text-slate-400 font-bold uppercase text-[10px] tracking-widest">
                    Nenhum registro de aluno correspondente na busca.
                  </div>
                ) : (
                  <div className="overflow-x-auto print:overflow-visible">
                    <table className="w-full text-left font-sans">
                      <thead>
                        {/* PRINT REPEATED STANDARD HEADER - Visible only when printing */}
                        <tr className="hidden print:table-row">
                          <td colSpan={classSubjects.length + 3} className="p-0 pb-3 bg-white border-b-0">
                            <StandardReportHeader
                              inst={institution}
                              title="NOTAS E FREQUÊNCIA POR TURMA"
                              filterText={`TURMA: ${activeClassObj?.name || 'N/D'}  •  ${classSubjects.length} DISCIPLINAS ATIVAS  •  ${sortedReports.length} ALUNOS`}
                            />
                          </td>
                        </tr>

                        <tr className="bg-slate-50/60 text-[9px] font-bold text-slate-500 border-b border-slate-200 uppercase tracking-widest table-columns-header">
                          <th className="px-6 py-4 cursor-pointer hover:bg-slate-100 transition-colors select-none" title="Ordenar tabela por nome do aluno" onClick={() => handleClassSort('student')}>
                            <div className="flex items-center gap-1">
                              <span>Aluno</span>
                              {renderSortIcon('student')}
                            </div>
                          </th>
                          {classSubjects.map((sub, sIdx) => (
                            <th key={`blt-cls-sub-th-${sub.id || sIdx}-${sIdx}`} className="px-6 py-4 text-center cursor-pointer hover:bg-slate-100 transition-colors select-none" title={`${sub.name} — Clique para ordenar pela nota nesta disciplina`} onClick={() => handleClassSort('subject', sub.id)}>
                              <div className="flex items-center justify-center gap-1">
                                <span>{sub.code || sub.name.substring(0, 8).toUpperCase()}</span>
                                {renderSortIcon('subject', sub.id)}
                              </div>
                            </th>
                          ))}
                          <th className="px-6 py-4 text-center cursor-pointer hover:bg-slate-100 transition-colors select-none" title="Ordenar tabela por percentual de presença" onClick={() => handleClassSort('presence')}>
                            <div className="flex items-center justify-center gap-1">
                              <span>Presença %</span>
                              {renderSortIcon('presence')}
                            </div>
                          </th>
                          <th className="px-6 py-4 text-center cursor-pointer hover:bg-slate-100 transition-colors select-none" title="Ordenar tabela por situação final" onClick={() => handleClassSort('status')}>
                            <div className="flex items-center justify-center gap-1">
                              <span>Situação Final</span>
                              {renderSortIcon('status')}
                            </div>
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-slate-800 uppercase text-[11px] font-semibold">
                        {sortedReports.map((res, rIdx) => {
                          const showFailed = res.finalStatus === 'Reprovado';
                          const showRecup = res.finalStatus === 'Recuperação';
                          const showPending = res.finalStatus === 'Pendente';
                          const showInformativo = res.finalStatus === 'Informativo';
                          const minPresenceRequired = 100 - (academicParams.absence_limit_percentage || 25);

                          return (
                            <tr key={`blt-cls-row-${res.student.id || rIdx}-${rIdx}`} className="hover:bg-slate-50/40 transition-colors">
                              <td className="px-6 py-3.5">
                                <p className="text-xs font-bold text-slate-900 uppercase tracking-tight">{res.student.name}</p>
                                <p className="text-[10px] font-mono font-bold text-slate-700 uppercase tracking-wide mt-0.5">Matrícula: {formatRegistrationNumber(res.student.registration_number)}</p>
                              </td>
                              {classSubjects.map((sub, sIdx) => {
                                const perf = res.subjectsPerformance.find(sp => sp.subjectId === sub.id);
                                const gradeValue = perf ? perf.finalGrade : null;
                                const isApproved = gradeValue !== null && gradeValue >= (academicParams.approval_grade || 5.0);

                                return (
                                  <td key={`blt-cls-td-${res.student.id || rIdx}-${sub.id || sIdx}-${sIdx}`} className="px-6 py-3.5 text-center">
                                    {gradeValue !== null ? (
                                      <span className={cn(
                                        "px-2 py-1 text-xs font-bold font-mono inline-block min-w-10 text-center rounded-lg border shadow-sm",
                                        isApproved ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-rose-50 text-rose-700 border-rose-200"
                                      )}>
                                        {formatGrade(gradeValue).replace('.', ',')}
                                      </span>
                                    ) : (
                                      <span className="text-xs font-bold text-slate-350 uppercase">-</span>
                                    )}
                                  </td>
                                );
                              })}
                              <td className="px-6 py-3.5 text-center">
                                <div className="inline-flex flex-col items-center">
                                  <span className={cn(
                                    "font-mono font-black",
                                    res.averageFrequency !== null
                                      ? (res.averageFrequency >= minPresenceRequired ? "text-slate-800" : "text-rose-600")
                                      : "text-slate-400 font-normal"
                                  )}>
                                    {res.averageFrequency !== null ? `${formatPresence(res.averageFrequency)}%` : '-'}
                                  </span>
                                  {res.totalAbsences > 0 && (
                                    <span className="text-[8.5px] font-bold text-slate-400 uppercase tracking-widest">({res.totalAbsences} faltas)</span>
                                  )}
                                </div>
                              </td>
                              <td className="px-6 py-3.5 text-center">
                                <span className={cn(
                                  "px-3 py-1 text-[9px] font-bold uppercase tracking-widest border shadow-sm inline-block w-28 text-center",
                                  showFailed ? "bg-rose-50 text-rose-650 border-rose-200" :
                                  showRecup ? "bg-amber-50 text-amber-650 border-amber-200" :
                                  showPending ? "bg-slate-50 text-slate-500 border-slate-200" :
                                  showInformativo ? "bg-blue-50 text-blue-650 border-blue-200" :
                                  "bg-emerald-50 text-emerald-650 border-emerald-200"
                                )}>
                                  {res.finalStatus}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot className="hidden print:table-footer-group">
                        <tr>
                          <td colSpan={classSubjects.length + 3} className="p-0 border-t-0 pt-3 bg-white">
                            <StandardReportFooter
                              inst={institution}
                              pageNumber={1}
                              totalPages={1}
                            />
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Persistent @media print rules ensuring clean A4 margins, zero right-edge clipping, and Ctrl+P parity */}
      <style>{`
        @media print {
          @page {
            size: ${viewMode === 'class' ? 'A4 landscape' : 'A4 portrait'};
            margin: ${viewMode === 'class' ? '10mm 12mm' : '8mm 12mm'};
          }

          /* Override src/index.css global width: 210mm !important which clips inside @page margins */
          html, body {
            width: 100% !important;
            min-width: 0 !important;
            max-width: 100% !important;
            height: auto !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            overflow: visible !important;
          }

          #root, main {
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: visible !important;
          }

          .break-inside-avoid,
          .page-break-inside-avoid {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }

          #printable-boletim,
          #printable-class-bulletin {
            width: 100% !important;
            min-width: 0 !important;
            max-width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            box-sizing: border-box !important;
            overflow: visible !important;
            border: none !important;
            box-shadow: none !important;
          }

          #printable-boletim .boletim-print-sheet {
            display: block !important;
            position: relative !important;
            min-height: 270mm !important;
            padding-bottom: 19mm !important;
            box-sizing: border-box !important;
          }

          #printable-boletim .boletim-print-body {
            display: block !important;
          }

          #printable-boletim .boletim-print-footer-anchor {
            position: absolute !important;
            bottom: 0 !important;
            left: 0 !important;
            right: 0 !important;
            width: 100% !important;
            display: block !important;
            background: #ffffff !important;
          }

          #printable-boletim .overflow-x-auto,
          #printable-class-bulletin .overflow-x-auto {
            overflow: visible !important;
            overflow-x: visible !important;
            width: 100% !important;
          }

          #printable-boletim table {
            table-layout: fixed !important;
            width: 100% !important;
          }

          /* Table I (15 columns) airy readable padding while keeping 4 subjects within 1 A4 page */
          #printable-boletim table.boletim-freq-table th,
          #printable-boletim table.boletim-freq-table td {
            font-size: 7pt !important;
            padding: 3.2px 2px !important;
            line-height: 1.25 !important;
            box-sizing: border-box !important;
          }

          #printable-boletim table.boletim-freq-table .boletim-badge-pill {
            font-size: 5pt !important;
            padding: 0.5px 2.5px !important;
            border-radius: 2px !important;
          }

          /* Table II airy padding fitted for 4+ subjects */
          #printable-boletim table:not(.boletim-freq-table) th,
          #printable-boletim table:not(.boletim-freq-table) td {
            font-size: 7.4pt !important;
            padding: 3.5px 7px !important;
            line-height: 1.28 !important;
            box-sizing: border-box !important;
          }

          /* Landscape Class Bulletin table fit within 100% printable width */
          #printable-class-bulletin table {
            table-layout: auto !important;
            width: 100% !important;
          }

          #printable-class-bulletin thead tr.table-columns-header th,
          #printable-class-bulletin tbody td {
            padding: 4px 5px !important;
            font-size: 7.2pt !important;
            white-space: normal !important;
            word-break: break-word !important;
          }

          #printable-class-bulletin thead tr.table-columns-header th:first-child,
          #printable-class-bulletin tbody td:first-child {
            width: 26% !important;
            text-align: left !important;
          }

          #printable-class-bulletin tbody td span {
            padding: 1px 3px !important;
            font-size: 7pt !important;
            width: auto !important;
            min-width: 0 !important;
            box-shadow: none !important;
            white-space: nowrap !important;
          }

          tr {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          thead {
            display: table-header-group !important;
          }
          tfoot {
            display: table-footer-group !important;
          }
        }
      `}</style>
    </div>
  );
}
