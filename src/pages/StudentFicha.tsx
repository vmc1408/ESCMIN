import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { 
  User, 
  Search, 
  Printer, 
  Plus, 
  Trash2, 
  BookOpen, 
  GraduationCap, 
  Phone, 
  Mail, 
  MapPin, 
  CheckCircle2, 
  AlertCircle, 
  ShieldAlert,
  Loader2,
  Calendar,
  Layers,
  Award
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn, formatDateForDisplay, formatCurrency } from '../lib/utils';
import { PageHeader } from '../components/PageHeader';
import { fetchAll, saveData, deleteData, fetchQuery } from '../lib/database';
import { Student, Class, Subject, Assessment, Grade, Certificate } from '../types';
import { financialService } from '../services/financialService';

const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

const formatLongDate = (dateString: string) => {
  if (!dateString) return '';
  const dateStr = dateString.split('T')[0];
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const year = parts[0];
    const monthIndex = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    const months = [
      'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
      'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];
    return `${day < 10 ? '0' + day : day} de ${months[monthIndex]} de ${year}`;
  }
  
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
  } catch (e) {
    return dateString;
  }
};

const getCertificateBorderClassName = (type: string) => {
  if (type === 'participação') {
    return "border-[5px] border-black p-8 flex-[1_1_0%] flex flex-col justify-between h-full box-border relative";
  }
  if (type === 'honra') {
    return "border-[8px] border-black p-8 flex-[1_1_0%] flex flex-col justify-between h-full box-border relative";
  }
  return "border-[6px] border-double border-black p-8 flex-[1_1_0%] flex flex-col justify-between h-full box-border relative";
};

const renderCertificateDecorations = (type: string) => {
  if (type === 'participação') {
    return (
      <>
        <div className="absolute inset-1.5 border border-black/50 pointer-events-none" />
        <div className="absolute inset-3 border border-black/20 pointer-events-none" />
        <div className="absolute top-4 left-4 w-8 h-8 border-t-[2px] border-l-[2px] border-black pointer-events-none" />
        <div className="absolute top-4 right-4 w-8 h-8 border-t-[2px] border-r-[2px] border-black pointer-events-none" />
        <div className="absolute bottom-4 left-4 w-8 h-8 border-b-[2px] border-l-[2px] border-black pointer-events-none" />
        <div className="absolute bottom-4 right-4 w-8 h-8 border-b-[2px] border-r-[2px] border-black pointer-events-none" />
        <div className="absolute top-5 left-5 w-3 h-3 border-t border-l border-black/60 pointer-events-none" />
        <div className="absolute top-5 right-5 w-3 h-3 border-t border-r border-black/60 pointer-events-none" />
        <div className="absolute bottom-5 left-5 w-3 h-3 border-b border-l border-black/60 pointer-events-none" />
        <div className="absolute bottom-5 right-5 w-3 h-3 border-b border-r border-black/60 pointer-events-none" />
      </>
    );
  }
  if (type === 'honra') {
    return (
      <>
        <div className="absolute inset-1 border-[2px] border-white pointer-events-none" />
        <div className="absolute inset-1.5 border border-black pointer-events-none" />
        <div className="absolute inset-3.5 border border-black/30 pointer-events-none" />
        <div className="absolute top-4 left-4 w-2.5 h-2.5 bg-black pointer-events-none rotate-45" />
        <div className="absolute top-4 right-4 w-2.5 h-2.5 bg-black pointer-events-none rotate-45" />
        <div className="absolute bottom-4 left-4 w-2.5 h-2.5 bg-black pointer-events-none rotate-45" />
        <div className="absolute bottom-4 right-4 w-2.5 h-2.5 bg-black pointer-events-none rotate-45" />
      </>
    );
  }
  return (
    <>
      <div className="absolute inset-1 border border-black/30 pointer-events-none" />
      <div className="absolute inset-2.5 border border-black/10 pointer-events-none" />
      <div className="absolute top-3 left-3 w-5 h-[1px] bg-black/80 pointer-events-none" />
      <div className="absolute top-3 left-3 w-[1px] h-5 bg-black/80 pointer-events-none" />
      <div className="absolute top-3 right-3 w-5 h-[1px] bg-black/80 pointer-events-none" />
      <div className="absolute top-3 right-3 w-[1px] h-5 bg-black/80 pointer-events-none" />
      <div className="absolute bottom-3 left-3 w-5 h-[1px] bg-black/80 pointer-events-none" />
      <div className="absolute bottom-3 left-3 w-[1px] h-5 bg-black/80 pointer-events-none" />
      <div className="absolute bottom-3 right-3 w-5 h-[1px] bg-black/80 pointer-events-none" />
      <div className="absolute bottom-3 right-3 w-[1px] h-5 bg-black/80 pointer-events-none" />
    </>
  );
};

const renderCertificateInnerContent = (
  type: string,
  studentName: string,
  courseName: string,
  issuanceDate: string,
  institution: any
) => {
  const institutionName = institution?.name || 'Escola de Ministérios';
  const institutionLocation = institution?.city_uf || 'Guarulhos/SP';

  if (type === 'participação') {
    return (
      <>
        <div className="my-[1mm] space-y-[4mm] flex-1 flex flex-col justify-center text-center">
          <div className="flex items-center justify-center gap-6">
             <div className="h-[1.5px] w-14 bg-amber-450" />
             <h1 className="text-2xl md:text-3xl font-extrabold italic text-black tracking-[0.12em] md:tracking-[0.16em] uppercase font-serif">
                CERTIFICADO DE PARTICIPAÇÃO
             </h1>
             <div className="h-[1.5px] w-14 bg-amber-450" />
          </div>

          <p className="text-sm max-w-3xl mx-auto leading-relaxed font-sans text-slate-800 px-8 text-center">
             A <strong className="text-black font-extrabold">{institutionName}</strong> certifica que:
          </p>

          <div className="py-1 w-full flex justify-center">
             <h2 className="text-3xl font-extrabold uppercase tracking-widest text-[#00174b] font-serif inline-block px-12 bg-amber-50/10 text-center">
                {studentName}
             </h2>
          </div>

          <p className="text-sm max-w-3xl mx-auto leading-relaxed font-sans text-slate-800 px-8 text-center">
             concluiu, com dedicação e aproveitamento satisfatório, o Curso de <strong className="text-black font-extrabold">{courseName}</strong>, cumprindo integralmente os requisitos acadêmicos estabelecidos.
          </p>

          <p className="text-xs max-w-3xl mx-auto leading-relaxed font-sans text-slate-700 px-8 text-center">
             Em reconhecimento ao empenho demonstrado na busca do conhecimento teológico e na formação cristã, conferimos o presente certificado para que conste e produza seus legítimos efeitos.
          </p>

          <p className="text-[10px] text-slate-900 font-bold uppercase tracking-[0.22em] mt-4 font-sans max-w-sm mx-auto border-t border-slate-100 pt-2 text-center">
             {institutionLocation}, {formatLongDate(issuanceDate)}
          </p>
        </div>

        <div className="flex items-end justify-between px-12 mb-1.5 font-sans mt-4 w-full">
           <div className="flex flex-col items-center gap-1">
              <div className="w-44 border-b border-black/80" />
              <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest text-center">Diretor Geral Acadêmico</p>
           </div>
           <div className="flex flex-col items-center gap-1">
              <div className="w-44 border-b border-black/80" />
              <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest text-center">Secretário Acadêmico</p>
           </div>
           <div className="flex flex-col items-center gap-1">
              <div className="w-44 border-b border-black/80" />
              <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest text-center">Bispo Diocesano</p>
           </div>
        </div>
      </>
    );
  }

  if (type === 'honra') {
    return (
      <>
        <div className="my-[1mm] space-y-[4mm] flex-1 flex flex-col justify-center text-center">
          <div className="flex items-center justify-center gap-6">
             <div className="h-[1.5px] w-14 bg-amber-450" />
             <h1 className="text-3xl font-extrabold italic text-black tracking-[0.25em] uppercase font-serif">
                DIPLOMA
             </h1>
             <div className="h-[1.5px] w-14 bg-amber-450" />
          </div>

          <p className="text-sm max-w-3xl mx-auto leading-relaxed font-sans text-slate-800 px-8 text-center">
             A <strong className="text-black font-extrabold">{institutionName}</strong>, no uso de suas atribuições e de acordo com a legislação e regulamentos vigentes, confere o presente diploma a:
          </p>

          <div className="py-1 w-full flex justify-center">
             <h2 className="text-3xl font-extrabold uppercase tracking-widest text-[#00174b] font-serif inline-block px-12 bg-amber-50/10 text-center">
                {studentName}
             </h2>
          </div>

          <p className="text-sm max-w-3xl mx-auto leading-relaxed font-sans text-slate-800 px-8 text-center">
             por haver concluído com aproveitamento o curso de:
          </p>

          <div className="py-1 w-full flex justify-center">
             <h3 className="text-xl font-extrabold uppercase tracking-wide text-[#00174b] font-sans text-center">
                {courseName}
             </h3>
          </div>

          <p className="text-sm max-w-3xl mx-auto leading-relaxed font-sans text-slate-800 px-8 text-center">
             cumprindo todas as exigências acadêmicas previstas, fazendo jus ao presente Diploma de Conclusão de Curso.
          </p>

          <p className="text-xs max-w-3xl mx-auto leading-relaxed font-sans text-slate-600 px-8 text-center italic">
             Por ser expressão da verdade, expede-se o presente diploma para que produza seus efeitos legais e acadêmicos.
          </p>

          <p className="text-[11px] text-slate-900 font-bold uppercase tracking-[0.22em] mt-4 font-sans max-w-sm mx-auto border-t border-slate-100 pt-2 text-center">
             {institutionLocation}, {formatLongDate(issuanceDate)}
          </p>
        </div>

        <div className="flex items-end justify-between px-12 mb-1.5 font-sans mt-4 w-full">
           <div className="flex flex-col items-center gap-1">
              <div className="w-44 border-b border-black/80" />
              <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest text-center">Diretor(a) / Reitor(a)</p>
           </div>
           <div className="flex flex-col items-center gap-1">
              <div className="w-44 border-b border-black/80" />
              <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest text-center">Secretário(a) Acadêmico(a)</p>
           </div>
           <div className="flex flex-col items-center gap-1">
              <div className="w-44 border-b border-black/80" />
              <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest text-center">Bispo Diocesano</p>
           </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="my-[1mm] space-y-[4mm] flex-1 flex flex-col justify-center text-center">
        <div className="flex items-center justify-center gap-6">
           <div className="h-[1.5px] w-14 bg-amber-450" />
           <h1 className="text-3xl font-extrabold italic text-black tracking-[0.2em] uppercase font-serif">
              CERTIFICADO DE CONCLUSÃO
           </h1>
           <div className="h-[1.5px] w-14 bg-amber-450" />
        </div>

        <p className="text-sm max-w-3xl mx-auto leading-relaxed font-sans text-slate-800 px-8 text-center">
           A <strong className="text-black font-extrabold">{institutionName}</strong> certifica que o(a) estudante:
        </p>

        <div className="py-1 w-full flex justify-center">
           <h2 className="text-3xl font-extrabold uppercase tracking-widest text-[#00174b] font-serif inline-block px-12 bg-amber-50/10 text-center">
              {studentName}
           </h2>
        </div>

        <p className="text-sm max-w-3xl mx-auto leading-relaxed font-sans text-slate-800 px-8 text-center">
           concluiu com êxito o Curso de <strong className="text-black font-extrabold">{courseName}</strong>, tendo cumprido satisfatoriamente todas as exigências acadêmicas e formativas previstas no programa de estudos.
        </p>

        <p className="text-xs max-w-3xl mx-auto leading-relaxed font-sans text-slate-700 px-8 text-center">
           Conferimos o presente Certificado de Conclusão para que produza os efeitos educacionais e institucionais cabíveis.
        </p>

        <p className="text-[10px] text-slate-900 font-bold uppercase tracking-[0.22em] mt-4 font-sans max-w-sm mx-auto border-t border-slate-100 pt-2 text-center">
           {institutionLocation}, {formatLongDate(issuanceDate)}
        </p>
      </div>

      <div className="flex items-end justify-between px-12 mb-1.5 font-sans mt-4 w-full">
         <div className="flex flex-col items-center gap-1">
            <div className="w-44 border-b border-black/80" />
            <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest text-center">Diretor Acadêmico</p>
         </div>
         <div className="flex flex-col items-center gap-1">
            <div className="w-44 border-b border-black/80" />
            <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest text-center">Secretário Acadêmico</p>
         </div>
         <div className="flex flex-col items-center gap-1">
            <div className="w-44 border-b border-black/80" />
            <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest text-center">Bispo Diocesano</p>
         </div>
      </div>
    </>
  );
};

export function StudentFicha() {
  const location = useLocation();
  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [dbGrades, setDbGrades] = useState<Grade[]>([]);
  const [attendanceData, setAttendanceData] = useState<any[]>([]);
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [institution, setInstitution] = useState<any>(null);
  
  const [loading, setLoading] = useState(true);
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'Ativo' | 'Inativo' | 'Todos'>('Ativo');
  const [studentContributions, setStudentContributions] = useState<any[]>([]);
  const [academicSettingsList, setAcademicSettingsList] = useState<any[]>([]);

  // Fetch student contributions for alerts on change of selected student
  useEffect(() => {
    if (selectedStudentId) {
      const currentYear = new Date().getFullYear();
      fetchQuery('contributions', [
        { field: 'student_id', operator: '==', value: selectedStudentId },
        { field: 'reference_year', operator: '==', value: currentYear }
      ])
      .then(data => {
        setStudentContributions(data || []);
      })
      .catch(err => {
        console.error("Error fetching contributions for ficha alert:", err);
      });
    } else {
      setStudentContributions([]);
    }
  }, [selectedStudentId]);

  // Compute unpaid months alert for the current year
  const unpaidMonthsAlert = useMemo(() => {
    const student = students.find(s => s.id === selectedStudentId);
    if (!student || student.status !== 'Ativo') return null;

    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;

    // Helper to calculate expected months based on enrollment
    let studentStartMonth = 1;
    if (student.start_date) {
      const startDate = new Date(student.start_date);
      if (!isNaN(startDate.getTime()) && startDate.getFullYear() === currentYear) {
        studentStartMonth = startDate.getMonth() + 1;
      } else if (!isNaN(startDate.getTime()) && startDate.getFullYear() > currentYear) {
        return null; // Future start date
      }
    }

    // Determine academic year start month and end month from settings
    let academicStartMonth = 3; // Default March (3) as a fallback
    let academicEndMonth = 11; // Default November (11) as a fallback

    // Try finding settings for the student's class, then fallback to current settings, then default
    const classSettings = academicSettingsList.find(s => s.id === student.class_id);
    const generalSettings = academicSettingsList.find(s => s.id === 'current');
    const activeSettings = classSettings || generalSettings;

    if (activeSettings) {
      if (activeSettings.term1_start) {
        const date = new Date(activeSettings.term1_start + 'T00:00:00');
        if (!isNaN(date.getTime())) {
          academicStartMonth = date.getMonth() + 1;
        }
      }
      if (activeSettings.term2_end) {
        const date = new Date(activeSettings.term2_end + 'T00:00:00');
        if (!isNaN(date.getTime())) {
          academicEndMonth = date.getMonth() + 1;
        }
      }
    }

    // Since it's an overdue/pending alert, we only check up to the minimum of currentMonth and academicEndMonth.
    const effectiveEndMonth = Math.min(currentMonth, academicEndMonth);

    const expectedMonths: number[] = [];
    const minMonth = Math.max(studentStartMonth, academicStartMonth);
    const maxMonth = effectiveEndMonth;

    for (let m = minMonth; m <= maxMonth; m++) {
      expectedMonths.push(m);
    }

    const paidMonths = studentContributions.map(c => c.reference_month);
    const unpaidMonths = expectedMonths.filter(m => !paidMonths.includes(m));

    if (unpaidMonths.length > 0) {
      return {
        months: unpaidMonths,
        count: unpaidMonths.length,
        totalEstimated: unpaidMonths.length * 100
      };
    }

    return null;
  }, [selectedStudentId, studentContributions, students, academicSettingsList]);

  // Handle auto-selection when coming from other screens (e.g. Ficha Acadêmica button in Students)
  useEffect(() => {
    const passedStudentId = location.state?.studentId;
    if (passedStudentId && students.length > 0) {
      const targetStudent = students.find(s => s.id === passedStudentId);
      if (targetStudent) {
        setSearchTerm(targetStudent.name || '');
        setSelectedStudentId(targetStudent.id);
        if (targetStudent.status === 'Inativo') {
          setStatusFilter('Todos');
        }
        // Clear the history state to prevent re-opening on manual refresh or back navigations
        try {
          window.history.replaceState({}, document.title);
        } catch (e) {
          console.warn("Could not clear router state", e);
        }
      }
    }
  }, [location.state, students]);
  
  // Academic Configs
  const [academicParams, setAcademicParams] = useState({
    approval_grade: 7.0,
    recovery_grade: 5.0,
    failure_grade: 4.9,
    absence_limit_percentage: 25
  });

  // Certificate Issuance Modal State
  const [isIssuing, setIsIssuing] = useState(false);
  const [isSavingCert, setIsSavingCert] = useState(false);
  const [viewingCertificate, setViewingCertificate] = useState<Certificate | null>(null);
  const [certFormData, setCertFormData] = useState({
    type: 'conclusão' as Certificate['type'],
    issuance_date: new Date().toISOString().split('T')[0],
    course: ''
  });

  const [certScale, setCertScale] = useState(1);
  const certWrapperRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!viewingCertificate) return;
    const handleResize = () => {
      if (certWrapperRef.current) {
        const width = certWrapperRef.current.getBoundingClientRect().width;
        setCertScale(width / 990);
      }
    };
    handleResize();
    const observer = new ResizeObserver(() => {
      handleResize();
    });
    if (certWrapperRef.current) {
      observer.observe(certWrapperRef.current);
    }
    const timer = setTimeout(handleResize, 100);

    return () => {
      observer.disconnect();
      clearTimeout(timer);
    };
  }, [viewingCertificate]);

  const [notification, setNotification] = useState<{ type: 'success' | 'error', message: string } | null>(null);

  const showToast = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 3500);
  };

  const fetchAcademicSettings = useCallback(async () => {
    let settingsList: any[] = [];
    try {
      const dbSettings = await fetchAll('academic_settings');
      if (dbSettings && dbSettings.length > 0) {
        settingsList = [...dbSettings];
      }
    } catch (err) {
      console.warn("Could not fetch academic_settings from db:", err);
    }

    try {
      // General settings
      const currentStored = localStorage.getItem('academic_settings_current');
      if (currentStored) {
        const parsed = JSON.parse(currentStored);
        if (!settingsList.some(s => s.id === 'current')) {
          settingsList.push({ id: 'current', ...parsed });
        } else {
          settingsList = settingsList.map(s => s.id === 'current' ? { ...parsed, ...s } : s);
        }
      }
      
      // Class-specific settings from localStorage
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('academic_settings_') && key !== 'academic_settings_current') {
          const classId = key.replace('academic_settings_', '');
          const val = localStorage.getItem(key);
          if (val) {
            const parsedClassSettings = JSON.parse(val);
            if (!settingsList.some(s => s.id === classId)) {
              settingsList.push({ id: classId, ...parsedClassSettings });
            } else {
              settingsList = settingsList.map(s => s.id === classId ? { ...parsedClassSettings, ...s } : s);
            }
          }
        }
      }
    } catch (err) {
      console.warn("Could not read academic_settings from localStorage:", err);
    }

    setAcademicSettingsList(settingsList);
  }, []);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [studs, clss, subs, assms, grds, atts, certs, instSettings, academicParamsData] = await Promise.all([
        fetchAll('students', '*', 'name'),
        fetchAll('classes', '*', 'name'),
        fetchAll('subjects', '*', 'name'),
        fetchAll('assessments'),
        fetchAll('grades'),
        fetchAll('attendances'),
        fetchAll('certificates', '*', 'created_at', true),
        financialService.getInstitutionSettings(),
        fetchAll('academic_parameters', '*', ''),
        fetchAcademicSettings()
      ]);

      setStudents(studs || []);
      const normalizedClasses = (clss || []).map((cls: Class) => {
        let normalized = { ...cls };
        let sIds: string[] = [];
        if (Array.isArray((normalized as any).subject_ids)) {
          sIds = (normalized as any).subject_ids;
        } else if (typeof (normalized as any).subject_ids === 'string') {
          try {
            const parsed = JSON.parse((normalized as any).subject_ids);
            sIds = Array.isArray(parsed) ? parsed : [parsed];
          } catch (e) {
            sIds = (normalized as any).subject_ids ? [(normalized as any).subject_ids] : [];
          }
        } else if ((normalized as any).subject_id) {
          sIds = [(normalized as any).subject_id];
        }

        let isSpecial = false;
        if (normalized.observations) {
          const match = normalized.observations.match(/\[METADATA:(\{[\s\S]*\})\]/);
          if (match && match[1]) {
            try {
              const meta = JSON.parse(match[1]);
              if (!normalized.year) normalized.year = meta.year;
              if (!normalized.semester) normalized.semester = meta.semester || meta.semester_id;
              if (sIds.length === 0 && (meta.subject_ids || meta.subject_id)) {
                sIds = meta.subject_ids || [meta.subject_id];
              }
              isSpecial = !!meta.is_special;
            } catch (e) {}
          }
        }
        (normalized as any).is_special = isSpecial;
        normalized.subject_ids = sIds;
        return normalized;
      });

      setClasses(normalizedClasses);
      setSubjects(subs || []);
      setAssessments(assms || []);
      setDbGrades(grds || []);
      setAttendanceData(atts || []);
      setCertificates(certs || []);

      if (academicParamsData && academicParamsData.length > 0) {
        setAcademicParams(academicParamsData[0] as any);
      } else if (instSettings) {
        setAcademicParams({
          approval_grade: instSettings.approval_grade || 7.0,
          absence_limit_percentage: instSettings.absence_limit_percentage || 25,
          recovery_grade: 5.0,
          failure_grade: 4.9
        } as any);
      }
      if (instSettings) {
        setInstitution(instSettings);
      }
    } catch (e: any) {
      console.error("Error loading data in StudentFicha:", e);
      showToast('error', 'Erro ao carregar dados do aluno');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Sidebar list of students filtered by search & status selection to prevent mixing inactive info by default
  const filteredStudentsList = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) {
      return [];
    }
    const filtered = students.filter(s => {
      const matchSearch = (s.name || '').toLowerCase().includes(term) || 
                          (s.registration_number || '').toLowerCase().includes(term) ||
                          (s.cpf || '').toLowerCase().includes(term);
      
      const matchStatus = statusFilter === 'Todos' || 
                          (statusFilter === 'Ativo' && (s.status === 'Ativo' || !s.status)) ||
                          (statusFilter === 'Inativo' && s.status === 'Inativo');

      return matchSearch && matchStatus;
    });

    // Sort to bring initial correspondence first
    return [...filtered].sort((a, b) => {
      const nameA = (a.name || '').toLowerCase();
      const nameB = (b.name || '').toLowerCase();
      const regA = (a.registration_number || '').toLowerCase();
      const regB = (b.registration_number || '').toLowerCase();
      const cpfA = (a.cpf || '').toLowerCase();
      const cpfB = (b.cpf || '').toLowerCase();

      const getScore = (name: string, reg: string, cpf: string) => {
        // Rank 1: Full name starts with the search term
        if (name.startsWith(term)) return 1;
        
        // Rank 2: A word in the name starts with the search term
        const words = name.split(/\s+/);
        if (words.some(w => w.startsWith(term))) return 2;
        
        // Rank 3: Registration number starts with the search term
        if (reg.startsWith(term)) return 3;

        // Rank 4: CPF starts with the search term
        if (cpf.startsWith(term)) return 4;

        // Rank 5: Name contains the search term (any part)
        if (name.includes(term)) return 5;

        // Rank 6: Registration or CPF contains the search term
        if (reg.includes(term) || cpf.includes(term)) return 6;

        return 7;
      };

      const scoreA = getScore(nameA, regA, cpfA);
      const scoreB = getScore(nameB, regB, cpfB);

      if (scoreA !== scoreB) {
        return scoreA - scoreB;
      }

      // If scores are equal, sort alphabetically by name
      return nameA.localeCompare(nameB, 'pt-BR');
    });
  }, [students, searchTerm, statusFilter]);

  // Clear selected student if search is empty to ensure everything is blank until dynamic filter starts
  useEffect(() => {
    if (!searchTerm.trim()) {
      setSelectedStudentId('');
    }
  }, [searchTerm]);



  const activeStudent = useMemo(() => {
    return students.find(s => s.id === selectedStudentId);
  }, [students, selectedStudentId]);

  // Calculate current active student metrics
  const activeStudentMetrics = useMemo(() => {
    if (!activeStudent) return null;

    const classId = activeStudent.class_id;
    const cls = classId ? classes.find(c => c.id === classId) : null;
    
    // Total class days registered
    const totalClassDays = attendanceData.filter(a => a.class_id === classId).reduce((acc, curr) => {
      // Group by date or count unique days
      return acc;
    }, 0);

    // Filter subjects linked to coordinates
    let sIds: string[] = [];
    if (cls) {
      if (Array.isArray(cls.subject_ids)) {
        sIds = cls.subject_ids;
      } else if (typeof cls.subject_ids === 'string') {
        try {
          const parsed = JSON.parse(cls.subject_ids);
          sIds = Array.isArray(parsed) ? parsed : [parsed];
        } catch (_) {
          sIds = cls.subject_ids ? [cls.subject_ids] : [];
        }
      }
    }

    const classSubjects = subjects.filter(sub => {
      if (sIds.length > 0) return sIds.includes(sub.id);
      return assessments.some(a => a.class_id === classId && a.subject_id === sub.id);
    });

    // Attendance Calculations
    const studentAbsences = attendanceData.filter(a => a.student_id === activeStudent.id && a.class_id === classId && a.status === 'F').length;
    const studentPresences = attendanceData.filter(a => a.student_id === activeStudent.id && a.class_id === classId && a.status === 'P').length;
    
    // Theoretical total days in this specific class
    const registeredLessons = studentAbsences + studentPresences;
    const totalDays = registeredLessons || 30;
    const presencePercentage = registeredLessons > 0 
      ? Math.max(0, Math.min(100, ((totalDays - studentAbsences) / totalDays) * 100)) 
      : 0;

    // Grades and performance calculations
    const subjectRecords = classSubjects.map(sub => {
      const finalGradeRecord = dbGrades.find(g => 
        g.student_id === activeStudent.id && 
        g.class_id === classId && 
        g.subject_id === sub.id && 
        g.period === 'Resultado Final'
      );

      let gradeValue: number | null = null;
      if (finalGradeRecord && finalGradeRecord.value !== null && finalGradeRecord.value !== undefined && finalGradeRecord.value !== '') {
        gradeValue = typeof finalGradeRecord.value === 'string' 
          ? parseFloat(finalGradeRecord.value.replace(',', '.')) 
          : finalGradeRecord.value;
      } else {
        const subAssessments = assessments.filter(a => a.class_id === classId && a.subject_id === sub.id);
        const subAssessmentIds = subAssessments.map(a => a.id);
        const subAssessmentTitles = subAssessments.map(a => a.title);

        const studentSubGrades = dbGrades.filter(g => 
          g.student_id === activeStudent.id && 
          g.class_id === classId && 
          g.subject_id === sub.id && 
          (subAssessmentIds.includes(g.period) || subAssessmentTitles.includes(g.period)) &&
          g.value !== null && g.value !== undefined && g.value !== ''
        );

        if (subAssessments.length > 0 && studentSubGrades.length > 0) {
          const sum = studentSubGrades.reduce((acc, curr) => {
            const v = typeof curr.value === 'string' ? parseFloat(curr.value.replace(',', '.')) : curr.value;
            return acc + (v || 0);
          }, 0);
          gradeValue = sum / subAssessments.length;
        }
      }

      return {
        subject: sub,
        grade: gradeValue
      };
    });

    const studentDocs = certificates.filter(c => c.student_id === activeStudent.id);

    const minPresence = 100 - (academicParams.absence_limit_percentage || 25);
    let finalStatus = 'Aprovado';
    if (presencePercentage < minPresence) {
      finalStatus = 'Reprovado';
    } else {
      const failedGradesCount = subjectRecords.filter(rec => 
        rec.grade !== null && rec.grade < (academicParams.approval_grade || 7.0)
      ).length;
      if (failedGradesCount > 0) {
        finalStatus = failedGradesCount <= 2 ? 'Recuperação' : 'Reprovado';
      }
    }

    return {
      cls,
      absences: studentAbsences,
      presences: studentPresences,
      totalDays,
      presencePercentage,
      subjectRecords,
      studentDocs,
      finalStatus
    };
  }, [activeStudent, classes, subjects, assessments, dbGrades, attendanceData, certificates]);

  const handleIssueCertificate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeStudent || !activeStudentMetrics) return;

    // Enforce Approval status
    if (activeStudentMetrics.finalStatus !== 'Aprovado') {
      showToast('error', 'Emissão Bloqueada! Aluno está com o status de "' + activeStudentMetrics.finalStatus + '"');
      return;
    }

    // Enforce Diploma limits if type is 'honra'
    if (certFormData.type === 'honra') {
      let yearsCompleted = 0;
      if (activeStudent.start_date) {
        let startYearStr = '';
        if (activeStudent.start_date.includes('/')) {
          startYearStr = activeStudent.start_date.split('/').pop() || '';
        } else if (activeStudent.start_date.includes('-')) {
          startYearStr = activeStudent.start_date.split('-')[0] || '';
        }
        const startYear = parseInt(startYearStr, 10);
        const issuanceYear = new Date(certFormData.issuance_date).getFullYear();
        if (!isNaN(startYear) && !isNaN(issuanceYear)) {
          yearsCompleted = issuanceYear - startYear;
        }
      }

      const completedDisciplines = dbGrades.filter(g => 
        g.student_id === activeStudent.id && 
        g.period === 'Resultado Final' && 
        g.value !== null && g.value !== undefined && g.value !== '' &&
        (typeof g.value === 'string' ? parseFloat(g.value.replace(',', '.')) : g.value) >= (academicParams.approval_grade || 7.0)
      ).length;

      const studentClass = classes.find(c => c.id === activeStudent.class_id);
      const isSpecialClass = studentClass?.is_special === true;
      const diplomaRequirementsMet = isSpecialClass 
        ? yearsCompleted >= 1 
        : (yearsCompleted >= 4 || completedDisciplines >= 16);

      if (!diplomaRequirementsMet) {
        const errorMsg = isSpecialClass
          ? `Emissão Bloqueada! Curso especial exige tempo mínimo de 1 ano letivo (Concluído: ${yearsCompleted}/1 ano).`
          : `Emissão Bloqueada! Requisitos faltantes: ${yearsCompleted}/4 anos ou ${completedDisciplines}/16 disciplinas aprovadas.`;
        showToast('error', errorMsg);
        return;
      }
    }

    setIsSavingCert(true);
    const verificationCode = `REG-${Math.floor(100000 + Math.random() * 900000)}`;

    const newCert: Omit<Certificate, 'id'> = {
      student_id: activeStudent.id,
      student_name: activeStudent.name,
      type: certFormData.type,
      course: certFormData.course || activeStudentMetrics.cls?.name || 'Curso Diaconal/Teologia',
      issuance_date: certFormData.issuance_date,
      verification_code: verificationCode,
      created_at: new Date().toISOString()
    };

    try {
      await saveData('certificates', undefined, newCert);
      showToast('success', 'Certificado emitido e registrado no histórico do aluno!');
      setIsIssuing(false);
      loadData();
    } catch (err: any) {
      console.error(err);
      showToast('error', 'Falha ao salvar certificado: ' + err.message);
    } finally {
      setIsSavingCert(false);
    }
  };

  const handleCreateNewCertClick = () => {
    if (!activeStudent || !activeStudentMetrics) return;
    setCertFormData({
      type: 'conclusão',
      issuance_date: new Date().toISOString().split('T')[0],
      course: activeStudentMetrics.cls?.name || ''
    });
    setIsIssuing(true);
  };

  const handleDeleteCertificate = async (id: string) => {
    if (!window.confirm("Deseja realmente excluir este certificado do histórico? Esta ação é irreversível.")) return;
    try {
      await deleteData('certificates', id);
      showToast('success', 'Certificado excluído com sucesso.');
      loadData();
    } catch (e: any) {
      showToast('error', 'Erro ao excluir certificado: ' + e.message);
    }
  };

  const triggerDossierPrint = () => {
    window.print();
  };

  return (
    <div id="student-ficha-module" className="min-h-screen bg-slate-50/50 pb-12 font-sans text-slate-800">
      
      {/* Toast Notification */}
      <AnimatePresence>
        {notification && (
          <motion.div 
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className={cn(
              "fixed top-4 right-4 z-50 px-5 py-4 border shadow-xl flex items-center gap-3 font-semibold text-xs uppercase tracking-wide",
              notification.type === 'success' 
                ? "bg-slate-900 border-slate-950 text-white" 
                : "bg-red-900 border-red-950 text-white"
            )}
          >
            {notification.type === 'success' ? <CheckCircle2 size={16} className="text-emerald-400" /> : <AlertCircle size={16} className="text-amber-400" />}
            {notification.message}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Screen Title Block */}
      <div className="bg-white border-b border-slate-200 px-8 py-4 print:hidden">
        <div className="max-w-7xl mx-auto">
          <PageHeader
            title="Ficha do Aluno"
            description="Consulta de informações cadastrais e desempenho acadêmico para fins de registro interno da escola."
            icon={User}
          >
            {activeStudent && (
              <button
                onClick={triggerDossierPrint}
                className="h-10 px-4 bg-slate-900 hover:bg-slate-800 text-white text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 transition-all shadow-md active:scale-95 shrink-0 cursor-pointer rounded-none"
              >
                <Printer size={14} /> Imprimir Ficha Completa
              </button>
            )}
          </PageHeader>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center p-24 gap-4 print:hidden">
          <Loader2 size={36} className="animate-spin text-slate-400" />
          <p className="text-xs uppercase font-extrabold tracking-widest text-slate-400 animate-pulse">Buscando Fichas...</p>
        </div>
      ) : (
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8 print:hidden">
          
          {/* LEFT PANEL: Student Lookup sidebar */}
          <div className={cn("lg:col-span-4 space-y-4", activeStudent ? "hidden lg:block" : "block")}>
            <div className="bg-white border border-slate-200 p-5 rounded-none shadow-sm space-y-4">
              <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                <h3 className="text-[10px] font-extrabold text-slate-800 uppercase tracking-widest">
                  Consultar Aluno
                </h3>
                
                {/* Segregation of inactive students filter */}
                <div className="flex gap-1">
                  {(['Ativo', 'Inativo', 'Todos'] as const).map(tab => (
                    <button
                      key={tab}
                      onClick={() => setStatusFilter(tab)}
                      className={cn(
                        "px-2 py-0.5 text-[8px] font-bold uppercase tracking-wider border",
                        statusFilter === tab 
                          ? "bg-slate-800 text-white border-slate-900" 
                          : "text-slate-400 border-slate-100 bg-slate-50 hover:bg-slate-100 hover:text-slate-600"
                      )}
                    >
                      {tab}
                    </button>
                  ))}
                </div>
              </div>

              {/* Search Field */}
              <div className="relative">
                <Search size={14} className="absolute left-3 top-3 text-slate-400" />
                <input 
                  type="text"
                  placeholder="Nome, RA ou CPF..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-none text-xs font-semibold focus:outline-none focus:border-slate-800 focus:bg-white focus:ring-1 focus:ring-slate-800/10 placeholder-slate-400 uppercase"
                />
              </div>

              {/* Students Selection List */}
              <div className="max-h-[380px] overflow-y-auto divide-y divide-slate-100 border border-slate-150 rounded-none bg-slate-50/20">
                {!searchTerm.trim() ? (
                  <div className="p-8 text-center text-xs font-bold text-slate-400 uppercase tracking-widest leading-relaxed">
                    Digite o nome, RA ou CPF para buscar
                  </div>
                ) : filteredStudentsList.length === 0 ? (
                  <div className="p-8 text-center text-xs font-bold text-slate-450 uppercase tracking-widest leading-relaxed">
                    Nenhum aluno encontrado
                  </div>
                ) : (
                  filteredStudentsList.map(stu => {
                    const isSelected = stu.id === selectedStudentId;
                    return (
                      <button
                        key={stu.id}
                        onClick={() => setSelectedStudentId(stu.id)}
                        className={cn(
                          "w-full p-3 flex items-center justify-between transition-colors text-left",
                          isSelected 
                            ? "bg-white border-l-4 border-indigo-600 shadow-sm" 
                            : "hover:bg-white"
                        )}
                      >
                        <div className="min-w-0 pr-2">
                          <p className={cn(
                            "text-xs font-bold truncate",
                            isSelected ? "text-indigo-900 font-extrabold" : "text-slate-700"
                          )}>
                            {stu.name}
                          </p>
                          <p className="text-[9px] font-mono text-slate-400">
                            RA: {stu.registration_number || 'Sem RA'}
                          </p>
                        </div>
                        <span className={cn(
                          "px-1.5 py-0.5 text-[8px] font-extrabold uppercase shrink-0 border",
                          stu.status === 'Inativo' 
                            ? "bg-rose-50 text-rose-700 border-rose-200/50" 
                            : stu.status === 'Concluído'
                            ? "bg-indigo-50 text-indigo-700 border-indigo-200/50"
                            : "bg-emerald-50 text-emerald-700 border-emerald-200/50"
                        )}>
                          {stu.status || 'Ativo'}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* RIGHT PANEL: Student detailed Dossier */}
          <div className={cn("lg:col-span-8 space-y-6", !activeStudent ? "hidden lg:block" : "block")}>
            {!activeStudent ? (
              <div className="bg-white border border-slate-200 py-24 text-center space-y-4">
                <div className="w-16 h-16 bg-slate-50 text-slate-350 border border-slate-100 rounded-none flex items-center justify-center mx-auto">
                  <User size={28} />
                </div>
                <div>
                  <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">Selecione um Aluno</h4>
                  <p className="text-xs text-slate-400 max-w-xs mx-auto mt-1 leading-relaxed">
                    Escolha um registro na barra de pesquisa à esquerda para visualizar seu histórico, frequências e notas consolidadas.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-6">

                {/* Back button for mobile/tablet */}
                <button
                  onClick={() => setSelectedStudentId(null)}
                  className="lg:hidden w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-750 font-bold text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 border border-slate-200 transition-colors rounded-none"
                >
                  ← Voltar para a Consulta de Alunos
                </button>

                {/* Financial Alert for Unpaid Contributions */}
                {unpaidMonthsAlert && (
                  <div className="bg-amber-50 border-l-4 border-amber-500 p-5 rounded-none flex items-start gap-4.5 shadow-sm animate-in fade-in duration-200">
                    <AlertCircle className="text-amber-600 shrink-0 mt-0.5" size={20} />
                    <div className="space-y-1 flex-1">
                      <div className="flex items-center justify-between">
                        <h4 className="text-[11px] font-black text-amber-900 uppercase tracking-widest font-sans">
                          Aviso de Tesouraria: Contribuições Pendentes
                        </h4>
                        <span className="text-[9px] font-black text-amber-700 bg-amber-100/50 border border-amber-200/60 px-2 py-0.5 uppercase tracking-wider rounded-none">
                          Em Aberto
                        </span>
                      </div>
                      <p className="text-xs text-amber-800 leading-relaxed font-semibold">
                        Este estudante possui <strong className="text-amber-950 font-extrabold">{unpaidMonthsAlert.count} {unpaidMonthsAlert.count === 1 ? 'mensalidade' : 'mensalidades'} em aberto</strong> para o ano letivo de {new Date().getFullYear()}:{' '}
                        <span className="font-extrabold text-amber-950 underline decoration-amber-500/50 underline-offset-2">
                          {unpaidMonthsAlert.months.map(m => MONTHS[m - 1]).join(', ')}
                        </span>.
                      </p>
                      <div className="flex gap-4 pt-1.5 text-[10px] text-amber-600 font-bold uppercase tracking-wider font-mono">
                        <span>Pendente Estimado: {formatCurrency(unpaidMonthsAlert.totalEstimated)}</span>
                        <span>•</span>
                        <span className="text-amber-700 italic">Por favor, regularize na aba de Contribuições</span>
                      </div>
                    </div>
                  </div>
                )}
                
                {/* 1. Personal & Contact Dossier Tab */}
                <div className="bg-white border border-slate-200 p-6 rounded-none space-y-6 shadow-sm">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-105 pb-4 gap-4">
                    <div className="flex items-center gap-4">
                      <div className="w-14 h-14 bg-slate-100 border border-slate-200 rounded-none flex-shrink-0 flex items-center justify-center overflow-hidden">
                        {activeStudent.photo_url ? (
                          <img src={activeStudent.photo_url} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        ) : (
                          <User size={24} className="text-slate-400" />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h2 className="text-base font-black text-slate-900 uppercase tracking-tight">
                            {activeStudent.name}
                          </h2>
                          <span className={cn(
                            "px-2 py-0.5 text-[8.5px] font-black uppercase tracking-wider border",
                            activeStudent.status === 'Inativo' 
                              ? "bg-rose-50 text-rose-700 border-rose-250" 
                              : activeStudent.status === 'Concluído'
                              ? "bg-indigo-50 text-indigo-700 border-indigo-250"
                              : "bg-emerald-50 text-emerald-700 border-emerald-250"
                          )}>
                            {activeStudent.status || 'Ativo'}
                          </span>
                        </div>
                        <p className="text-xs font-bold text-slate-400 font-mono mt-0.5 uppercase">
                          RA do Estudante: {activeStudent.registration_number || 'Não Informado'}
                        </p>
                      </div>
                    </div>

                    <div className="text-left sm:text-right">
                      <span className="text-[8px] font-extrabold text-indigo-700 bg-indigo-50 px-2 py-1 uppercase tracking-widest border border-indigo-200/50">
                        Ficha Geral do Aluno
                      </span>
                      <p className="text-[10px] text-slate-400 font-bold mt-1">
                        Desde: {activeStudent.start_date ? formatDateForDisplay(activeStudent.start_date) : 'N/D'}
                      </p>
                    </div>
                  </div>

                  {/* Identification & Document Fields */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 text-xs">
                    <div className="space-y-3">
                      <h4 className="text-[9px] font-extrabold text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-1 flex items-center gap-1.5">
                        <GraduationCap size={12} className="text-slate-450" /> Identificação e Vínculos
                      </h4>
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span className="text-slate-400 font-semibold uppercase text-[10px]">Turma Atual:</span>
                          <span className="font-bold text-slate-700 uppercase">{activeStudentMetrics?.cls?.name || 'Sem turma vinculada'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400 font-semibold uppercase text-[10px]">Curso:</span>
                          <span className="font-bold text-slate-700 uppercase">{activeStudent.course || 'Sem Curso Informado'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400 font-semibold uppercase text-[10px]">Data de Ingressão:</span>
                          <span className="font-semibold text-slate-750">{activeStudent.start_date ? formatDateForDisplay(activeStudent.start_date) : 'Não informado'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400 font-semibold uppercase text-[10px]">CPF:</span>
                          <span className="font-mono font-bold text-slate-850">{activeStudent.cpf || 'Não Informado'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400 font-semibold uppercase text-[10px]">RG:</span>
                          <span className="font-mono font-semibold text-slate-850">{activeStudent.rg || 'Não Informado'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400 font-semibold uppercase text-[10px]">Nascimento:</span>
                          <span className="font-semibold text-slate-750">{activeStudent.birth_date ? formatDateForDisplay(activeStudent.birth_date) : 'Não informado'}</span>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <h4 className="text-[9px] font-extrabold text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-1 flex items-center gap-1.5">
                        <Mail size={12} className="text-slate-450" /> Contato e Localidade
                      </h4>
                      <div className="space-y-2">
                        <div className="flex justify-between items-center gap-4">
                          <span className="text-slate-400 font-semibold uppercase text-[10px] shrink-0">Email:</span>
                          <span className="font-semibold text-slate-700 text-right truncate max-w-[180px] sm:max-w-[280px]" title={activeStudent.email}>{activeStudent.email || 'Não informado'}</span>
                        </div>
                        <div className="flex justify-between items-center gap-4">
                          <span className="text-slate-400 font-semibold uppercase text-[10px] shrink-0">Celular:</span>
                          <span className="font-bold text-slate-700 font-mono text-right">{activeStudent.phone_mobile || 'Não informado'}</span>
                        </div>
                        <div className="flex justify-between items-center gap-4">
                          <span className="text-slate-400 font-semibold uppercase text-[10px] shrink-0">Paróquia:</span>
                          <span className="font-bold text-slate-700 uppercase text-right truncate max-w-[180px] sm:max-w-[280px]" title={activeStudent.parish}>{activeStudent.parish || 'Não informado'}</span>
                        </div>
                        <div className="flex justify-between items-center gap-4">
                          <span className="text-slate-400 font-semibold uppercase text-[10px] shrink-0">Forania:</span>
                          <span className="font-bold text-indigo-900 uppercase text-right">{activeStudent.forania || 'Não informado'}</span>
                        </div>
                        <div className="flex justify-between items-center gap-4">
                          <span className="text-slate-400 font-semibold uppercase text-[10px] shrink-0">Cidade / UF:</span>
                          <span className="font-semibold text-slate-750 uppercase text-right">{activeStudent.address_city || 'Não informado'} - {activeStudent.address_state || 'SP'}</span>
                        </div>
                        {activeStudent.address_street && (
                          <div className="flex justify-between items-start gap-4 pt-1 border-t border-slate-100/50">
                            <span className="text-slate-400 font-semibold uppercase text-[9px] shrink-0 mt-0.5">Rua:</span>
                            <span className="font-semibold text-slate-700 uppercase text-right text-[11px] leading-tight truncate max-w-[180px] sm:max-w-[280px]">{activeStudent.address_street}</span>
                          </div>
                        )}
                        {activeStudent.address_neighborhood && (
                          <div className="flex justify-between items-center gap-4">
                            <span className="text-slate-400 font-semibold uppercase text-[9px] shrink-0">Bairro:</span>
                            <span className="font-semibold text-slate-700 uppercase text-right truncate max-w-[180px] sm:max-w-[280px]">{activeStudent.address_neighborhood}</span>
                          </div>
                        )}
                        {activeStudent.address_zip && (
                          <div className="flex justify-between items-center gap-4">
                            <span className="text-slate-400 font-semibold uppercase text-[9px] shrink-0">CEP:</span>
                            <span className="font-mono text-slate-700 text-right">{activeStudent.address_zip}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Filiação section if mother or father is set */}
                  {(activeStudent.guardian_mother || activeStudent.guardian_father) && (
                    <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3 text-xs">
                      {activeStudent.guardian_mother && (
                        <div className="flex justify-between items-center gap-4">
                          <span className="text-slate-400 font-semibold uppercase text-[10px] shrink-0">Nome da Mãe:</span>
                          <span className="font-bold text-slate-700 uppercase text-right truncate max-w-[180px] sm:max-w-[280px]" title={activeStudent.guardian_mother}>{activeStudent.guardian_mother}</span>
                        </div>
                      )}
                      {activeStudent.guardian_father && (
                        <div className="flex justify-between items-center gap-4">
                          <span className="text-slate-400 font-semibold uppercase text-[10px] shrink-0">Nome do Pai:</span>
                          <span className="font-bold text-slate-700 uppercase text-right truncate max-w-[180px] sm:max-w-[280px]" title={activeStudent.guardian_father}>{activeStudent.guardian_father}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Grid row: Attendance & Grades */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                  {/* 2. Frequency Control card */}
                  <div className="bg-white border border-slate-200 p-5 rounded-none shadow-sm space-y-4">
                    <h3 className="text-[10px] font-extrabold text-slate-800 uppercase tracking-widest flex items-center gap-2 border-b border-slate-150 pb-2">
                      Frequência e Presença
                    </h3>

                    <div className="grid grid-cols-2 gap-3 text-center">
                      <div className="bg-slate-50 p-3 border border-slate-100">
                        <p className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider">Faltas Registradas</p>
                        <p className="text-2xl font-black font-mono text-rose-600 mt-1">{activeStudentMetrics?.absences}</p>
                      </div>
                      <div className="bg-slate-50 p-3 border border-slate-100">
                        <p className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider">Presenças</p>
                        <p className="text-2xl font-black font-mono text-slate-700 mt-1">{activeStudentMetrics?.presences}</p>
                      </div>
                    </div>

                    <div className="space-y-1.5 pt-1">
                      <div className="flex justify-between items-center text-[10px] uppercase tracking-wider font-extrabold">
                        <span className="text-slate-400">Taxa de Assiduidade</span>
                        <span className={cn(
                          "font-mono font-black text-sm",
                          (activeStudentMetrics?.presencePercentage ?? 0) >= (100 - academicParams.absence_limit_percentage) 
                            ? "text-emerald-700" 
                            : "text-rose-600"
                        )}>
                          {activeStudentMetrics?.presences === 0 && activeStudentMetrics?.absences === 0
                            ? '-'
                            : `${Math.round(activeStudentMetrics?.presencePercentage ?? 0)}%`}
                        </span>
                      </div>
                      
                      <div className="w-full bg-slate-100 h-2.5 rounded-none overflow-hidden border border-slate-200/50">
                        <div 
                          className={cn(
                            "h-full transition-all duration-500",
                            (activeStudentMetrics?.presencePercentage ?? 0) >= (100 - academicParams.absence_limit_percentage)
                              ? "bg-emerald-600" 
                              : "bg-rose-600"
                          )} 
                          style={{ 
                            width: `${activeStudentMetrics?.presences === 0 && activeStudentMetrics?.absences === 0 
                              ? 0 
                              : (activeStudentMetrics?.presencePercentage ?? 0)}%` 
                          }}
                        />
                      </div>

                      <div className="flex items-center gap-2 pt-1 text-[9px] text-slate-450 uppercase tracking-wide">
                        <Calendar size={13} />
                        Limite Diocesano: máx {academicParams.absence_limit_percentage}% de faltas.
                      </div>
                    </div>
                  </div>

                  {/* 3. Grades and performance */}
                  <div className="bg-white border border-slate-200 p-5 rounded-none shadow-sm space-y-4">
                    <h3 className="text-[10px] font-extrabold text-slate-800 uppercase tracking-widest flex items-center gap-2 border-b border-slate-150 pb-2">
                      Rendimento Escolar (Notas)
                    </h3>

                    <div className="divide-y divide-slate-100 max-h-[170px] overflow-y-auto pr-1">
                      {!activeStudentMetrics || activeStudentMetrics.subjectRecords.length === 0 ? (
                        <div className="py-8 text-center text-xs font-bold uppercase tracking-widest text-slate-400">
                          Nenhum registro de nota encontrado
                        </div>
                      ) : (
                        activeStudentMetrics.subjectRecords.map(rec => (
                          <div key={rec.subject.id} className="py-2.5 flex items-center justify-between gap-4 text-xs">
                            <span className="font-bold text-slate-700 uppercase truncate max-w-[170px] sm:max-w-[280px] md:max-w-[360px]" title={rec.subject.name}>
                              {rec.subject.name}
                            </span>
                            <div className="flex items-center gap-3 shrink-0">
                              <span className={cn(
                                "font-mono font-black text-[11px] px-1.5 py-0.5 border",
                                rec.grade !== null 
                                  ? rec.grade >= academicParams.approval_grade
                                    ? "text-emerald-700 bg-emerald-50 border-emerald-250" 
                                    : rec.grade >= (academicParams.recovery_grade ?? 4.9)
                                      ? "text-amber-700 bg-amber-50 border-amber-200"
                                      : "text-rose-700 bg-rose-50 border-rose-200"
                                  : "text-slate-400 bg-slate-50 border-slate-150"
                              )}>
                                {rec.grade !== null ? rec.grade.toFixed(1).replace('.', ',') : 'N/D'}
                              </span>
                              <span className="text-[8.5px] font-bold text-slate-400 uppercase tracking-wider w-14 text-right">
                                {rec.grade !== null 
                                  ? rec.grade >= academicParams.approval_grade 
                                    ? 'Aprovado' 
                                    : rec.grade >= (academicParams.recovery_grade ?? 4.9)
                                      ? 'Em Rec.' 
                                      : 'Reprovado'
                                  : 'Falta lançar'}
                              </span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                {/* 4. Historic & Issued Certificates block */}
                <div className="bg-white border border-slate-200 rounded-none shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-200 bg-slate-50/50 flex items-center justify-between">
                    <h3 className="text-[10px] font-extrabold text-slate-800 uppercase tracking-widest flex items-center gap-2">
                      <Award size={13} className="text-indigo-600" /> Registro Diocesano de Documentação e Diplomas
                    </h3>
                    
                    <button
                      onClick={handleCreateNewCertClick}
                      className="px-3 py-1 bg-slate-900 border border-slate-905 hover:bg-slate-800 text-white text-[8.5px] font-bold uppercase tracking-widest flex items-center gap-1 active:scale-95 transition-transform"
                    >
                      <Plus size={10} /> Novo Certificado
                    </button>
                  </div>

                  <div className="divide-y divide-slate-100">
                    {!activeStudentMetrics || activeStudentMetrics.studentDocs.length === 0 ? (
                      <div className="p-10 text-center text-xs font-bold uppercase tracking-widest text-slate-400">
                        Nenhum certificado emitido para este aluno no sistema.
                      </div>
                    ) : (
                      activeStudentMetrics.studentDocs.map(doc => (
                        <div key={doc.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/50 transition-colors">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className={cn(
                                "px-1.5 py-0.5 text-[8px] font-extrabold uppercase tracking-wider border",
                                doc.type === 'conclusão' ? "bg-slate-50 text-slate-800 border-slate-200" :
                                doc.type === 'honra' ? "bg-amber-50 text-amber-800 border-amber-200" :
                                "bg-indigo-50 text-indigo-800 border-indigo-200"
                              )}>
                                {doc.type}
                              </span>
                              <span className="text-xs font-bold text-slate-800 uppercase">{doc.course}</span>
                            </div>
                            <p className="text-[9.5px] font-semibold text-slate-400 font-mono uppercase">
                              Validando Código: {doc.verification_code} | Criado: {new Date(doc.issuance_date + 'T00:00:00').toLocaleDateString('pt-BR')}
                            </p>
                          </div>

                          <div className="flex items-center gap-2">
                            <button 
                              onClick={() => setViewingCertificate(doc)}
                              className="px-3 py-1.5 text-slate-700 hover:text-slate-950 border border-slate-200 font-bold text-[9px] uppercase tracking-widest bg-white shadow-sm flex items-center gap-1.5 transition-colors"
                            >
                              <Printer size={11} /> Visualizar
                            </button>
                            <button 
                              onClick={() => handleDeleteCertificate(doc.id)}
                              className="p-1.5 text-rose-500 hover:text-rose-700 border border-slate-200 hover:border-rose-300 bg-white shadow-sm flex items-center justify-center transition-colors"
                              title="Excluir"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

              </div>
            )}
          </div>

        </div>
      )}

      {/* ISSUING DIALOG */}
      {isIssuing && activeStudent && activeStudentMetrics && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm print:hidden">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-md bg-white border border-slate-200 p-6 shadow-2xl relative"
          >
            <div className="flex justify-between items-center border-b border-slate-100 pb-3 mb-4">
              <h3 className="text-xs font-black text-slate-850 uppercase tracking-widest">Emitir Novo Certificado</h3>
              <button onClick={() => setIsIssuing(false)} className="text-slate-400 hover:text-slate-600 text-xs uppercase font-extrabold tracking-widest">Fechar</button>
            </div>

            <form onSubmit={handleIssueCertificate} className="space-y-4 text-xs font-semibold">
              <div className="bg-indigo-50 p-3 border border-indigo-100 text-indigo-950 leading-relaxed text-[11px] mb-2">
                Preparando emissor para: <strong>{activeStudent.name.toUpperCase()}</strong>. O registro gerará um código seguro de validação automática.
              </div>

              {/* Requirement indicators and validation feedback */}
              {(() => {
                const fStatus = activeStudentMetrics.finalStatus;

                let yearsCompleted = 0;
                if (activeStudent.start_date) {
                  let startYearStr = '';
                  if (activeStudent.start_date.includes('/')) {
                    startYearStr = activeStudent.start_date.split('/').pop() || '';
                  } else if (activeStudent.start_date.includes('-')) {
                    startYearStr = activeStudent.start_date.split('-')[0] || '';
                  }
                  const startYear = parseInt(startYearStr, 10);
                  const issuanceYear = new Date(certFormData.issuance_date).getFullYear();
                  if (!isNaN(startYear) && !isNaN(issuanceYear)) {
                    yearsCompleted = issuanceYear - startYear;
                  }
                }

                const completedDisciplines = dbGrades.filter(g => 
                  g.student_id === activeStudent.id && 
                  g.period === 'Resultado Final' && 
                  g.value !== null && g.value !== undefined && g.value !== '' &&
                  (typeof g.value === 'string' ? parseFloat(g.value.replace(',', '.')) : g.value) >= (academicParams.approval_grade || 7.0)
                ).length;

                const studentClass = classes.find(c => c.id === activeStudent.class_id);
                const isSpecialClass = studentClass?.is_special === true;
                const diplomaRequirementsMet = isSpecialClass 
                  ? yearsCompleted >= 1 
                  : (yearsCompleted >= 4 || completedDisciplines >= 16);

                if (fStatus !== 'Aprovado') {
                  return (
                    <div className="bg-rose-50 border border-rose-300 p-4 rounded-none space-y-1.5 text-rose-800 text-[10.5px] font-medium leading-normal">
                      <h5 className="font-bold text-rose-850 text-xs font-sans uppercase flex items-center gap-1">
                        <AlertCircle size={14} /> IMPEDIMENTO ACADÊMICO
                      </h5>
                      <p>Este estudante está com o status de <strong>"{fStatus}"</strong> no boletim final.</p>
                      <p className="font-bold">A emissão de qualquer certificado ou diploma exige que o estudante atinja status de "Aprovado" (média e presenças suficientes).</p>
                    </div>
                  );
                }

                if (certFormData.type === 'honra' && !diplomaRequirementsMet) {
                  return (
                    <div className="bg-amber-50 border border-amber-300 p-4 rounded-none space-y-2 text-amber-800 text-[10.5px] font-medium leading-normal">
                      <h5 className="font-bold text-amber-855 text-xs font-sans uppercase flex items-center gap-1">
                        <AlertCircle size={14} /> CRITÉRIOS DE DIPLOMA PENDENTES
                      </h5>
                      {isSpecialClass ? (
                        <p>Para emitir o Diploma de Conclusão de uma Turma Especial, o estudante necessita cumprir o requisito de tempo de curso (mínimo de 1 ano letivo):</p>
                      ) : (
                        <p>Para emitir o Diploma de Conclusão, o estudante necessita cumprir as exigências (mínimo de 4 anos de duração do curso ou 16 disciplinas aprovadas):</p>
                      )}
                      <div className="grid grid-cols-2 gap-2 text-[10px] mt-1 font-sans">
                        <div className="bg-white/45 p-2 border border-amber-200 col-span-2">
                          <p className="font-bold uppercase text-[8px] text-amber-700">Tempo de Curso</p>
                          <span className="font-extrabold text-[11px]">{yearsCompleted} / {isSpecialClass ? 1 : 4} {isSpecialClass ? 'ano' : 'anos'}</span>
                        </div>
                        {!isSpecialClass && (
                          <div className="bg-white/45 p-2 border border-amber-200 col-span-2">
                            <p className="font-bold uppercase text-[8px] text-amber-700">Disciplinas Concluídas</p>
                            <span className="font-extrabold text-[11px]">{completedDisciplines} / 16</span>
                          </div>
                        )}
                      </div>
                      <p className="text-[10px] font-bold text-amber-700">O botão de registrar emissão está desativado.</p>
                    </div>
                  );
                }
                return null;
              })()}

              <div className="space-y-1">
                <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Tipo do Documento</label>
                <select 
                  value={certFormData.type}
                  onChange={e => setCertFormData({...certFormData, type: e.target.value as any})}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 text-xs font-bold focus:outline-none uppercase"
                >
                  <option value="conclusão">Certificado de Conclusão de Curso</option>
                  <option value="participação">Certificado de Participação</option>
                  <option value="honra">Honra ao Mérito / Diploma</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Identificação do Curso</label>
                <input 
                  type="text"
                  required
                  placeholder="Nome por extenso do Curso"
                  value={certFormData.course}
                  onChange={e => setCertFormData({...certFormData, course: e.target.value})}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 text-xs font-bold focus:bg-white focus:outline-none uppercase"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Data de Emissão oficial</label>
                <input 
                  type="date"
                  required
                  value={certFormData.issuance_date}
                  onChange={e => setCertFormData({...certFormData, issuance_date: e.target.value})}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 text-xs font-bold focus:bg-white focus:outline-none"
                />
              </div>

              <div className="flex gap-2 pt-4 justify-end">
                <button 
                  type="button" 
                  onClick={() => setIsIssuing(false)} 
                  className="px-4 py-2 border border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[9px]"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  disabled={isSavingCert || (() => {
                    if (activeStudentMetrics.finalStatus !== 'Aprovado') return true;

                    if (certFormData.type === 'honra') {
                      let yearsCompleted = 0;
                      if (activeStudent.start_date) {
                        let startYearStr = '';
                        if (activeStudent.start_date.includes('/')) {
                          startYearStr = activeStudent.start_date.split('/').pop() || '';
                        } else if (activeStudent.start_date.includes('-')) {
                          startYearStr = activeStudent.start_date.split('-')[0] || '';
                        }
                        const startYear = parseInt(startYearStr, 10);
                        const issuanceYear = new Date(certFormData.issuance_date).getFullYear();
                        if (!isNaN(startYear) && !isNaN(issuanceYear)) {
                          yearsCompleted = issuanceYear - startYear;
                        }
                      }

                      const completedDisciplines = dbGrades.filter(g => 
                        g.student_id === activeStudent.id && 
                        g.period === 'Resultado Final' && 
                        g.value !== null && g.value !== undefined && g.value !== '' &&
                        (typeof g.value === 'string' ? parseFloat(g.value.replace(',', '.')) : g.value) >= (academicParams.approval_grade || 7.0)
                      ).length;

                      const studentClass = classes.find(c => c.id === activeStudent.class_id);
                      const isSpecialClass = studentClass?.is_special === true;
                      if (isSpecialClass) {
                        return yearsCompleted < 1;
                      }
                      return yearsCompleted < 4 && completedDisciplines < 16;
                    }
                    return false;
                  })()}
                  className="px-5 py-2 bg-indigo-700 text-white font-bold uppercase tracking-wider text-[9px] hover:bg-indigo-800 disabled:opacity-40 disabled:cursor-not-allowed font-sans"
                >
                  {isSavingCert ? 'Salvando...' : 'Registrar Emissão'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* VIEW CERTIFICATE TO PRINT */}
      {viewingCertificate && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/65 flex flex-col items-center justify-start py-10 px-4 print:hidden">
          <div className="w-full max-w-4xl bg-white shadow-2xl relative border-8 border-slate-800/20 p-8 flex flex-col gap-6">
            
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h4 className="text-xs font-black uppercase tracking-widest text-slate-500 font-sans">
                Visualização de Documento Gerado
              </h4>
              <div className="flex gap-2">
                <button 
                  onClick={() => window.print()}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[9px] uppercase tracking-widest transition-colors flex items-center gap-1"
                >
                  <Printer size={12} /> Executar Impressão
                </button>
                <button 
                  onClick={() => setViewingCertificate(null)}
                  className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-600 font-bold text-[9px] uppercase tracking-widest transition-colors"
                >
                  Fechar
                </button>
              </div>
            </div>

            {/* SCREEN VIEW REPRESENTATION OF THE PREMIUM CERTIFICATE */}
            <div 
              ref={certWrapperRef} 
              className="w-full bg-slate-100 overflow-hidden relative border border-slate-200"
              style={{ height: `${700 * certScale}px` }}
            >
              <div 
                className="absolute left-0 top-0 bg-white text-black font-serif flex flex-col justify-between p-[10mm] text-center box-border select-none pointer-events-none"
                style={{ 
                  width: '990px', 
                  height: '700px', 
                  transform: `scale(${certScale})`, 
                  transformOrigin: 'top left' 
                }}
              >
                 <div className={getCertificateBorderClassName(viewingCertificate.type)}>
                    {renderCertificateDecorations(viewingCertificate.type)}

                    <div className="flex items-center justify-center gap-6 mt-2 relative">
                       {institution?.logo_url && (
                          <img 
                             src={institution.logo_url} 
                             alt="Logo" 
                             className="h-24 w-24 object-contain" 
                             referrerPolicy="no-referrer" 
                          />
                       )}
                       <div className="text-left space-y-1">
                          <h2 className="text-2xl font-black uppercase tracking-[0.2em] text-black font-sans leading-tight">
                             {institution?.name || 'ESCOLA DIOCESANA DE MINISTÉRIOS'}
                          </h2>
                          <p className="text-xs font-sans font-bold uppercase text-amber-600 tracking-[0.15em] mt-1">
                             {institution?.subtitle || 'PASTORAL E REGISTRO ACADÊMICO'}
                          </p>
                       </div>
                    </div>

                    {renderCertificateInnerContent(
                       viewingCertificate.type,
                       viewingCertificate.student_name || activeStudent?.name || 'Estudante',
                       viewingCertificate.course || '',
                       viewingCertificate.issuance_date,
                       institution
                    )}
                 </div>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* PORTAL FOR PERFECT PHYSICAL OR PDF LANDSCAPE PRINTING */}
      {viewingCertificate && typeof document !== 'undefined' && createPortal(
         <div id="certificate-printable" className="hidden print:flex absolute left-0 top-0 bg-white text-black font-serif justify-between text-center w-[297mm] h-[210mm] max-h-[210mm] max-w-[297mm] p-[10mm] z-[99999] overflow-hidden flex-col box-border bg-white">
           <div className={getCertificateBorderClassName(viewingCertificate.type)}>
              {renderCertificateDecorations(viewingCertificate.type)}
              <div className="flex items-center justify-center gap-6 mt-2">
                 {institution?.logo_url && (
                    <img 
                       src={institution.logo_url} 
                       alt="Logo" 
                       className="h-24 w-24 object-contain" 
                       referrerPolicy="no-referrer" 
                    />
                 )}
                 <div className="text-left space-y-1">
                    <h2 className="text-2xl font-black uppercase tracking-[0.2em] text-black font-sans leading-tight">
                       {institution?.name || 'ESCOLA DIOCESANA DE MINISTÉRIOS'}
                    </h2>
                    <p className="text-xs font-sans font-bold uppercase text-amber-600 tracking-[0.15em] mt-1">
                       {institution?.subtitle || 'PASTORAL E REGISTRO ACADÊMICO'}
                    </p>
                 </div>
              </div>

              {renderCertificateInnerContent(
                 viewingCertificate.type,
                 viewingCertificate.student_name || activeStudent?.name || 'Estudante',
                 viewingCertificate.course || '',
                 viewingCertificate.issuance_date,
                 institution
              )}
           </div>
         </div>,
         document.body
      )}

      {/* DYNAMIC LANDSCAPE PRINT RULE INJECTION */}
      {viewingCertificate && (
        <style dangerouslySetInnerHTML={{ __html: `
          @media print {
            @page {
              size: A4 landscape;
              margin: 0;
            }
            html, body {
              width: 297mm !important;
              height: 210mm !important;
              margin: 0 !important;
              padding: 0 !important;
              overflow: hidden !important;
              background-color: #ffffff !important;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            
            #root, .fixed, .backdrop-blur, [role="dialog"], .print-hidden, .no-print {
              display: none !important;
              visibility: hidden !important;
              height: 0 !important;
              width: 0 !important;
              margin: 0 !important;
              padding: 0 !important;
            }
            
            body {
              display: block !important;
              visibility: visible !important;
              background: white !important;
            }

            #certificate-printable {
               display: flex !important;
               visibility: visible !important;
               width: 297mm !important;
               height: 210mm !important;
               box-sizing: border-box !important;
               margin: 0 !important;
               padding: 10mm !important;
               background: white !important;
               z-index: 99999999 !important;
               flex-direction: column !important;
               justify-content: space-between !important;
               page-break-inside: avoid !important;
               overflow: hidden !important;
               position: absolute !important;
               left: 0 !important;
               top: 0 !important;
             }
            #certificate-printable * {
              visibility: visible !important;
            }
          }
        ` }} />
      )}
      
      {/* DYNAMIC PORTRAIT PRINT RULE INJECTION */}
      {!viewingCertificate && (
        <style dangerouslySetInnerHTML={{ __html: `
          @media print {
            @page {
              size: A4 portrait !important;
              margin: 12mm 15mm 12mm 15mm !important;
            }
            html, body {
              width: 100% !important;
              height: auto !important;
              margin: 0 !important;
              padding: 0 !important;
              overflow: visible !important;
              background-color: #ffffff !important;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            
            #student-ficha-module > :not(#printable-student-record) {
              display: none !important;
            }

            .fixed, .backdrop-blur, [role="dialog"], .print-hidden, .no-print, .print\\:hidden {
              display: none !important;
              visibility: hidden !important;
              height: 0 !important;
              width: 0 !important;
              margin: 0 !important;
              padding: 0 !important;
            }
            
            body {
              display: block !important;
              visibility: visible !important;
              background: white !important;
            }

            #student-ficha-module {
              background-color: transparent !important;
              padding: 0 !important;
              margin: 0 !important;
            }

            #printable-student-record {
              display: block !important;
              visibility: visible !important;
              width: 100% !important;
              height: auto !important;
              min-height: 0 !important;
              box-sizing: border-box !important;
              margin: 0 !important;
              padding: 0 !important;
              background: white !important;
              overflow: visible !important;
              position: static !important;
            }

            #printable-student-record * {
              visibility: visible !important;
            }

            /* Prevent page break inside table rows and containers */
            .break-inside-avoid, 
            .page-break-inside-avoid,
            #printable-student-record table, 
            #printable-student-record tr, 
            #printable-student-record .border, 
            #printable-student-record .border-2,
            .signatures-container-print {
              page-break-inside: avoid !important;
              break-inside: avoid !important;
            }
          }
        ` }} />
      )}

      {/* PRINT VERSION OF THE COMPLETED DOSSIER SHEET (HIDDEN ON SCREEN) */}
      {activeStudent && activeStudentMetrics && (
        <div id="printable-student-record" className="hidden print:block text-black bg-white overflow-visible font-sans leading-tight w-full mx-auto print:p-0">
          
          {/* HEADER SECTION */}
          <div className="flex items-center gap-6 mb-6 pb-2 border-b-2 border-black">
            <div className="flex-shrink-0 w-24 h-24 flex items-center justify-center">
              {institution?.logo_url ? (
                <img src={institution.logo_url} className="w-full h-full object-contain max-h-24" referrerPolicy="no-referrer" alt="Logo" />
              ) : (
                <div className="w-full h-full border-2 border-slate-200 border-dashed flex flex-col items-center justify-center text-[8pt] text-slate-300 font-bold uppercase">
                  <span className="leading-none">SEM</span>
                  <span className="leading-none">LOGO</span>
                </div>
              )}
            </div>
            <div className="flex-1 flex flex-col">
              <p className="text-[11pt] font-semibold tracking-widest text-slate-800 leading-tight">DIOCESE DE GUARULHOS</p>
              <h1 className="text-[19pt] font-bold uppercase tracking-tight text-black leading-tight my-0.5">
                {institution?.name || 'ESCOLA DIOCESANA DE MINISTÉRIOS'}
              </h1>
              <p className="text-[12pt] font-bold text-slate-700 tracking-wide mt-1 uppercase">
                {institution?.subtitle || 'PE. JOSÉ FERNANDO DE BRITO'}
              </p>
            </div>
          </div>

          <div className="text-center mb-6">
            <h2 className="text-[12pt] font-extrabold uppercase tracking-[0.15em] w-fit mx-auto border-b-2 border-black pb-0.5">Ficha de Frequência e Aproveitamento do Aluno</h2>
          </div>

          {/* BIO INFORMATION GRID */}
          <div className="grid grid-cols-12 gap-y-3 gap-x-6 border-2 border-black p-4 mb-6 text-[10.5pt] leading-relaxed">
            <div className="col-span-12 font-bold uppercase text-[11pt] border-b border-black/25 pb-1 mb-1">
              Informações Pessoais do Aluno
            </div>
            
            <div className="col-span-8 flex gap-2">
              <span className="font-bold uppercase text-slate-650 min-w-[120px]">Nome Completo:</span>
              <span className="font-bold uppercase flex-1 border-b border-dashed border-black/20">{activeStudent.name}</span>
            </div>
            <div className="col-span-4 flex gap-2">
              <span className="font-bold uppercase text-slate-650">RA:</span>
              <span className="font-mono font-bold flex-1 border-b border-dashed border-black/20 pl-1">{activeStudent.registration_number || 'Não Informado'}</span>
            </div>

            <div className="col-span-6 flex gap-2">
              <span className="font-bold uppercase text-slate-650 min-w-[120px]">Nascimento:</span>
              <span className="font-semibold flex-1 border-b border-dashed border-black/20">{activeStudent.birth_date ? formatDateForDisplay(activeStudent.birth_date) : 'Não informado'}</span>
            </div>
            <div className="col-span-6 flex gap-2">
              <span className="font-bold uppercase text-slate-650 min-w-[120px]">Data de Ingressão:</span>
              <span className="font-semibold flex-1 border-b border-dashed border-black/20">{activeStudent.start_date ? formatDateForDisplay(activeStudent.start_date) : 'Não informado'}</span>
            </div>

            <div className="col-span-6 flex gap-2">
              <span className="font-bold uppercase text-slate-650 min-w-[120px]">CPF:</span>
              <span className="font-mono font-semibold flex-1 border-b border-dashed border-black/20">{activeStudent.cpf || 'Não Informado'}</span>
            </div>
            <div className="col-span-6 flex gap-2">
              <span className="font-bold uppercase text-slate-650 min-w-[120px]">RG:</span>
              <span className="font-mono font-semibold flex-1 border-b border-dashed border-black/20">{activeStudent.rg || 'Não Informado'}</span>
            </div>

            <div className="col-span-6 flex gap-2">
              <span className="font-bold uppercase text-slate-650 min-w-[120px]">Status Canônico:</span>
              <span className="font-bold flex-1 border-b border-dashed border-black/20 uppercase pl-1">{activeStudent.status || 'ATIVO'}</span>
            </div>
            <div className="col-span-6 flex gap-2">
              <span className="font-bold uppercase text-slate-650 min-w-[120px]">Curso Vinculado:</span>
              <span className="font-bold flex-1 border-b border-dashed border-black/20 uppercase pl-1">{activeStudent.course || 'TEOLOGIA'}</span>
            </div>

            <div className="col-span-6 flex gap-2">
              <span className="font-bold uppercase text-slate-650 min-w-[120px]">E-mail:</span>
              <span className="font-semibold flex-1 border-b border-dashed border-black/20 truncate">{activeStudent.email || 'Não informado'}</span>
            </div>
            <div className="col-span-6 flex gap-2">
              <span className="font-bold uppercase text-slate-650 min-w-[120px]">Contatos:</span>
              <span className="font-semibold flex-1 border-b border-dashed border-black/20 font-mono">{activeStudent.phone_mobile || activeStudent.phone_residential || 'Sem Telefone'}</span>
            </div>

            <div className="col-span-6 flex gap-2">
              <span className="font-bold uppercase text-slate-650 min-w-[120px]">Paróquia:</span>
              <span className="font-bold uppercase flex-1 border-b border-dashed border-black/20">{activeStudent.parish || 'Não cadastrado'}</span>
            </div>
            <div className="col-span-6 flex gap-2">
              <span className="font-bold uppercase text-slate-650 min-w-[120px]">Forania:</span>
              <span className="font-bold uppercase flex-1 border-b border-dashed border-black/20">{activeStudent.forania || 'Não cadastrada'}</span>
            </div>

            <div className="col-span-12 flex gap-2">
              <span className="font-bold uppercase text-slate-650 min-w-[120px]">Endereço:</span>
              <span className="font-semibold uppercase flex-1 border-b border-dashed border-black/20">
                {activeStudent.address_street ? (
                  `${activeStudent.address_street}${activeStudent.address_neighborhood ? `, ${activeStudent.address_neighborhood}` : ''}${activeStudent.address_city ? `, ${activeStudent.address_city}` : ''}${activeStudent.address_state ? ` - ${activeStudent.address_state}` : ''}${activeStudent.address_zip ? ` (CEP: ${activeStudent.address_zip})` : ''}`
                ) : (
                  `${activeStudent.address_city || 'Não Informado'} - ${activeStudent.address_state || 'SP'}`
                )}
              </span>
            </div>

            {(activeStudent.guardian_mother || activeStudent.guardian_father) && (
              <>
                <div className="col-span-12 font-bold uppercase text-[10pt] border-t border-black/15 pt-2 mt-1">
                  Filiação / Responsáveis
                </div>
                {activeStudent.guardian_mother && (
                  <div className="col-span-12 flex gap-2">
                    <span className="font-bold uppercase text-slate-650 min-w-[120px]">Nome da Mãe:</span>
                    <span className="font-semibold uppercase flex-1 border-b border-dashed border-black/20">{activeStudent.guardian_mother}</span>
                  </div>
                )}
                {activeStudent.guardian_father && (
                  <div className="col-span-12 flex gap-2">
                    <span className="font-bold uppercase text-slate-650 min-w-[120px]">Nome do Pai:</span>
                    <span className="font-semibold uppercase flex-1 border-b border-dashed border-black/20">{activeStudent.guardian_father}</span>
                  </div>
                )}
              </>
            )}
          </div>

          {/* ATTENDANCE SECTION */}
          <div className="border border-black p-4 mb-6 text-[10.5pt] leading-relaxed">
            <h3 className="font-bold uppercase text-[11pt] border-b border-black pb-1 mb-2">Controle de Assiduidade e Frequência</h3>
            <div className="grid grid-cols-3 gap-4 text-center mt-2">
              <div className="border border-black/30 p-2">
                <p className="text-[9pt] font-bold uppercase text-slate-500">Aulas Presenciais</p>
                <p className="text-xl font-bold font-mono text-black">{activeStudentMetrics?.presences}</p>
              </div>
              <div className="border border-black/30 p-2">
                <p className="text-[9pt] font-bold uppercase text-slate-500">Ausências / Faltas</p>
                <p className="text-xl font-bold font-mono text-rose-700">{activeStudentMetrics?.absences}</p>
              </div>
              <div className="border border-black/30 p-2 bg-neutral-50">
                <p className="text-[9pt] font-bold uppercase text-slate-500">Porcentagem Final</p>
                <p className="text-xl font-bold font-mono text-black">
                  {activeStudentMetrics?.presences === 0 && activeStudentMetrics?.absences === 0
                    ? '-'
                    : `${Math.round(activeStudentMetrics?.presencePercentage ?? 0)}%`}
                </p>
              </div>
            </div>
          </div>

          {/* ACADEMIC PERFORMANCE (GRADES) TABLE */}
          <div className="border border-black p-4 text-[10.5pt] leading-relaxed">
            <h3 className="font-bold uppercase text-[11pt] border-b border-black pb-1 mb-3">Histórico e Controle Acadêmico por Disciplina</h3>
            
            <table className="w-full text-left border-collapse text-[10pt] border border-black/20">
              <thead>
                <tr className="bg-neutral-50 uppercase text-[9pt] font-bold border-b border-black">
                  <th className="p-2 border-r border-black/20">Código</th>
                  <th className="p-2 border-r border-black/20 w-1/2">Disciplina</th>
                  <th className="p-2 border-r border-black/20 text-center">Nota Final</th>
                  <th className="p-2 text-center">Situação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/25">
                {activeStudentMetrics?.subjectRecords.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-4 text-center text-slate-500 font-bold uppercase">Nenhuma nota ou aproveitamento lançado.</td>
                  </tr>
                ) : (
                  activeStudentMetrics?.subjectRecords.map(rec => {
                    let situation = 'S/ Nota';
                    if (rec.grade !== null) {
                      if (rec.grade >= academicParams.approval_grade) {
                        situation = 'Aprovado';
                      } else if (rec.grade >= (academicParams.recovery_grade ?? 4.9)) {
                        situation = 'Recuperação';
                      } else {
                        situation = 'Reprovado';
                      }
                    }
                    return (
                      <tr key={rec.subject.id}>
                        <td className="p-2 font-mono font-semibold border-r border-black/20">{rec.subject.code || 'S/C'}</td>
                        <td className="p-2 uppercase font-bold border-r border-black/20">{rec.subject.name}</td>
                        <td className="p-2 font-bold font-mono text-center border-r border-black/20">
                          {rec.grade !== null ? rec.grade.toFixed(1).replace('.', ',') : '---'}
                        </td>
                        <td className="p-2 font-bold text-center uppercase">
                          {situation}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* SIGNATURES FOOTER FOR PRINT REMOVED BY USER REQUEST */}
          
        </div>
      )}

    </div>
  );
}
