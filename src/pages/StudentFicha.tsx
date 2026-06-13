import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
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
import { cn, formatDateForDisplay } from '../lib/utils';
import { fetchAll, saveData, deleteData, fetchQuery } from '../lib/database';
import { Student, Class, Subject, Assessment, Grade, Certificate } from '../types';
import { financialService } from '../services/financialService';

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
        <div className="my-[2mm] space-y-[6mm] flex-1 flex flex-col justify-center text-center">
          <div className="flex items-center justify-center gap-6">
             <div className="h-[2px] w-20 bg-amber-450" />
             <h1 className="text-4xl font-extrabold italic text-black tracking-[0.2em] uppercase font-serif">
                CERTIFICADO DE PARTICIPAÇÃO DE CURSO
             </h1>
             <div className="h-[2px] w-20 bg-amber-450" />
          </div>

          <p className="text-lg max-w-4xl mx-auto leading-relaxed font-sans text-slate-800 px-8 text-center">
             A <strong className="text-black font-extrabold">{institutionName}</strong> certifica que:
          </p>

          <div className="py-2.5 w-full flex justify-center">
             <h2 className="text-5xl font-extrabold uppercase tracking-widest text-[#00174b] font-serif inline-block px-14 py-2 bg-amber-500/5 border-y-2 border-amber-500/10 text-center">
                {studentName}
             </h2>
          </div>

          <p className="text-lg max-w-4xl mx-auto leading-relaxed font-sans text-slate-800 px-12 text-center">
             concluiu, com dedicação e aproveitamento satisfatório, o Curso de <strong className="text-black font-extrabold">{courseName}</strong>, cumprindo integralmente os requisitos acadêmicos estabelecidos.
          </p>

          <p className="text-sm max-w-4xl mx-auto leading-relaxed font-sans text-slate-700 px-8 text-center">
             Em reconhecimento ao empenho demonstrado na busca do conhecimento teológico e na formação cristã, conferimos o presente certificado para que conste e produza seus legítimos efeitos.
          </p>

          <p className="text-sm text-slate-900 font-bold uppercase tracking-[0.25em] mt-8 font-sans max-w-md mx-auto border-t-2 border-slate-200 pt-2.5 text-center">
             {institutionLocation}, {formatLongDate(issuanceDate)}
          </p>
        </div>

        <div className="flex items-end justify-between px-16 mb-2 font-sans mt-6 w-full">
           <div className="flex flex-col items-center gap-1.5">
              <div className="w-56 border-b-2 border-black/80" />
              <p className="text-xs font-bold text-slate-705 uppercase tracking-widest text-center">Diretor Geral Acadêmico</p>
           </div>
           <div className="flex flex-col items-center gap-1.5">
              <div className="w-56 border-b-2 border-black/80" />
              <p className="text-xs font-bold text-slate-705 uppercase tracking-widest text-center">Secretário Acadêmico</p>
           </div>
           <div className="flex flex-col items-center gap-1.5">
              <div className="w-56 border-b-2 border-black/80" />
              <p className="text-xs font-bold text-slate-705 uppercase tracking-widest text-center">Bispo Diocesano</p>
           </div>
        </div>
      </>
    );
  }

  if (type === 'honra') {
    return (
      <>
        <div className="my-[2mm] space-y-[6mm] flex-1 flex flex-col justify-center text-center">
          <div className="flex items-center justify-center gap-6">
             <div className="h-[2px] w-20 bg-amber-450" />
             <h1 className="text-5xl font-black text-black tracking-[0.25em] uppercase font-serif">
                DIPLOMA
             </h1>
             <div className="h-[2px] w-20 bg-amber-450" />
          </div>

          <p className="text-lg max-w-4xl mx-auto leading-relaxed font-sans text-slate-800 px-8 text-center">
             A <strong className="text-black font-extrabold">{institutionName}</strong>, no uso de suas atribuições e de acordo com a legislação e regulamentos vigentes, confere o presente diploma a:
          </p>

          <div className="py-2.5 w-full flex justify-center">
             <h2 className="text-5xl font-extrabold uppercase tracking-widest text-[#00174b] font-serif inline-block px-14 py-2 bg-amber-500/5 border-y-2 border-amber-500/10 text-center">
                {studentName}
             </h2>
          </div>

          <p className="text-lg max-w-4xl mx-auto leading-relaxed font-sans text-slate-800 px-8 text-center">
             por haver concluído com aproveitamento o curso de:
          </p>

          <div className="py-1 w-full flex justify-center">
             <h3 className="text-2xl font-black uppercase tracking-wide text-[#00174b] font-sans text-center">
                {courseName}
             </h3>
          </div>

          <p className="text-lg max-w-4xl mx-auto leading-relaxed font-sans text-slate-800 px-12 text-center">
             cumprindo todas as exigências acadêmicas previstas, fazendo jus ao presente Diploma de Conclusão de Curso.
          </p>

          <p className="text-sm max-w-4xl mx-auto leading-relaxed font-sans text-slate-605 px-8 text-center italic">
             Por ser expressão da verdade, expede-se o presente diploma para que produza seus efeitos legais e acadêmicos.
          </p>

          <p className="text-sm text-slate-900 font-bold uppercase tracking-[0.25em] mt-8 font-sans max-w-md mx-auto border-t-2 border-slate-200 pt-2.5 text-center">
             {institutionLocation}, {formatLongDate(issuanceDate)}
          </p>
        </div>

        <div className="flex items-end justify-between px-16 mb-2 font-sans mt-6 w-full">
           <div className="flex flex-col items-center gap-1.5">
              <div className="w-56 border-b-2 border-black/80" />
              <p className="text-xs font-bold text-slate-705 uppercase tracking-widest text-center">Diretor(a) / Reitor(a)</p>
           </div>
           <div className="flex flex-col items-center gap-1.5">
              <div className="w-56 border-b-2 border-black/80" />
              <p className="text-xs font-bold text-slate-705 uppercase tracking-widest text-center">Secretário(a) Acadêmico(a)</p>
           </div>
           <div className="flex flex-col items-center gap-1.5">
              <div className="w-56 border-b-2 border-black/80" />
              <p className="text-xs font-bold text-slate-705 uppercase tracking-widest text-center">Bispo Diocesano</p>
           </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="my-[2mm] space-y-[6mm] flex-1 flex flex-col justify-center text-center">
        <div className="flex items-center justify-center gap-6">
           <div className="h-[2px] w-20 bg-amber-450" />
           <h1 className="text-4xl font-extrabold italic text-black tracking-[0.2em] uppercase font-serif">
              CERTIFICADO DE CONCLUSÃO
           </h1>
           <div className="h-[2px] w-20 bg-amber-450" />
        </div>

        <p className="text-lg max-w-4xl mx-auto leading-relaxed font-sans text-slate-800 px-8 text-center">
           A <strong className="text-black font-extrabold">{institutionName}</strong> certifica que o(a) estudante:
        </p>

        <div className="py-2.5 w-full flex justify-center">
           <h2 className="text-5xl font-extrabold uppercase tracking-widest text-[#00174b] font-serif inline-block px-14 py-2 bg-amber-500/5 border-y-2 border-amber-500/10 text-center">
              {studentName}
           </h2>
        </div>

        <p className="text-lg max-w-4xl mx-auto leading-relaxed font-sans text-slate-800 px-12 text-center">
           concluiu com êxito o Curso de <strong className="text-black font-extrabold">{courseName}</strong>, tendo cumprido satisfatoriamente todas as exigências acadêmicas e formativas previstas no programa de estudos.
        </p>

        <p className="text-sm max-w-4xl mx-auto leading-relaxed font-sans text-slate-700 px-8 text-center">
           Conferimos o presente Certificado de Conclusão para que produza os efeitos educacionais e institucionais cabíveis.
        </p>

        <p className="text-sm text-slate-900 font-bold uppercase tracking-[0.25em] mt-8 font-sans max-w-md mx-auto border-t-2 border-slate-200 pt-2.5 text-center">
           {institutionLocation}, {formatLongDate(issuanceDate)}
        </p>
      </div>

      <div className="flex items-end justify-between px-16 mb-2 font-sans mt-6 w-full">
         <div className="flex flex-col items-center gap-1.5">
            <div className="w-56 border-b-2 border-black/80" />
            <p className="text-xs font-bold text-slate-705 uppercase tracking-widest text-center">Diretor Acadêmico</p>
         </div>
         <div className="flex flex-col items-center gap-1.5">
            <div className="w-56 border-b-2 border-black/80" />
            <p className="text-xs font-bold text-slate-705 uppercase tracking-widest text-center">Secretário Acadêmico</p>
         </div>
         <div className="flex flex-col items-center gap-1.5">
            <div className="w-56 border-b-2 border-black/80" />
            <p className="text-xs font-bold text-slate-705 uppercase tracking-widest text-center">Bispo Diocesano</p>
         </div>
      </div>
    </>
  );
};

export function StudentFicha() {
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
  
  // Academic Configs
  const [academicParams, setAcademicParams] = useState({
    approval_grade: 7.0,
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

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [studs, clss, subs, assms, grds, atts, certs, instSettings] = await Promise.all([
        fetchAll('students', '*', 'name'),
        fetchAll('classes', '*', 'name'),
        fetchAll('subjects', '*', 'name'),
        fetchAll('assessments'),
        fetchAll('grades'),
        fetchAll('attendances'),
        fetchAll('certificates', '*', 'created_at', true),
        financialService.getInstitutionSettings()
      ]);

      setStudents(studs || []);
      setClasses(clss || []);
      setSubjects(subs || []);
      setAssessments(assms || []);
      setDbGrades(grds || []);
      setAttendanceData(atts || []);
      setCertificates(certs || []);

      if (instSettings) {
        setInstitution(instSettings);
        setAcademicParams({
          approval_grade: instSettings.approval_grade || 7.0,
          absence_limit_percentage: instSettings.absence_limit_percentage || 25
        });
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
    return students.filter(s => {
      const matchSearch = s.name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          s.registration_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          s.cpf?.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchStatus = statusFilter === 'Todos' || 
                          (statusFilter === 'Ativo' && (s.status === 'Ativo' || !s.status)) ||
                          (statusFilter === 'Inativo' && s.status === 'Inativo');

      return matchSearch && matchStatus;
    });
  }, [students, searchTerm, statusFilter]);

  // Auto-select first student if available and none selected
  useEffect(() => {
    if (filteredStudentsList.length > 0 && !selectedStudentId) {
      setSelectedStudentId(filteredStudentsList[0].id);
    }
  }, [filteredStudentsList, selectedStudentId]);

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
    const totalDays = (studentAbsences + studentPresences) || 30;
    const presencePercentage = totalDays > 0 ? Math.max(0, Math.min(100, ((totalDays - studentAbsences) / totalDays) * 100)) : 100;

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

    return {
      cls,
      absences: studentAbsences,
      presences: studentPresences,
      totalDays,
      presencePercentage,
      subjectRecords,
      studentDocs
    };
  }, [activeStudent, classes, subjects, assessments, dbGrades, attendanceData, certificates]);

  const handleIssueCertificate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeStudent || !activeStudentMetrics) return;

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
      <div className="bg-white border-b border-slate-200 py-6 px-8 print:hidden">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <span className="text-[9px] font-black tracking-widest text-indigo-600 uppercase">Gestão de Alunos</span>
            <h1 className="text-xl font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
              <User size={20} className="text-indigo-650" /> Ficha Cadastral e Acadêmica do Aluno
            </h1>
          </div>
          
          {activeStudent && (
            <button
              onClick={triggerDossierPrint}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 transition-all shadow-md active:scale-95 shrink-0"
            >
              <Printer size={14} /> Imprimir Ficha Completa
            </button>
          )}
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
          <div className="lg:col-span-4 space-y-4">
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
                {filteredStudentsList.length === 0 ? (
                  <div className="p-8 text-center text-xs font-bold text-slate-400 uppercase tracking-widest">
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
          <div className="lg:col-span-8 space-y-6">
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
                        <div className="flex justify-between items-center">
                          <span className="text-slate-400 font-semibold uppercase text-[10px]">Email:</span>
                          <span className="font-semibold text-slate-700 truncate max-w-[150px]" title={activeStudent.email}>{activeStudent.email || 'Não informado'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400 font-semibold uppercase text-[10px]">Celular:</span>
                          <span className="font-bold text-slate-700 font-mono">{activeStudent.phone_mobile || 'Não informado'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400 font-semibold uppercase text-[10px]">Paróquia:</span>
                          <span className="font-bold text-slate-700 uppercase truncate max-w-[150px]">{activeStudent.parish || 'Não informado'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400 font-semibold uppercase text-[10px]">Forania:</span>
                          <span className="font-bold text-indigo-900 uppercase">{activeStudent.forania || 'Não informado'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400 font-semibold uppercase text-[10px]">Cidade / UF:</span>
                          <span className="font-semibold text-slate-750 uppercase">{activeStudent.address_city || 'Não informado'} - {activeStudent.address_state || 'SP'}</span>
                        </div>
                      </div>
                    </div>
                  </div>
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
                          {Math.round(activeStudentMetrics?.presencePercentage ?? 0)}%
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
                          style={{ width: `${activeStudentMetrics?.presencePercentage ?? 0}%` }}
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
                          <div key={rec.subject.id} className="py-2.5 flex items-center justify-between text-xs">
                            <span className="font-bold text-slate-700 uppercase truncate max-w-[170px]" title={rec.subject.name}>
                              {rec.subject.name}
                            </span>
                            <div className="flex items-center gap-3 shrink-0">
                              <span className={cn(
                                "font-mono font-black text-[11px] px-1.5 py-0.5 border",
                                rec.grade !== null 
                                  ? rec.grade >= academicParams.approval_grade
                                    ? "text-emerald-700 bg-emerald-50 border-emerald-250" 
                                    : "text-rose-700 bg-rose-50 border-rose-200"
                                  : "text-slate-400 bg-slate-50 border-slate-150"
                              )}>
                                {rec.grade !== null ? rec.grade.toFixed(1).replace('.', ',') : 'N/D'}
                              </span>
                              <span className="text-[8.5px] font-bold text-slate-400 uppercase tracking-wider w-14 text-right">
                                {rec.grade !== null 
                                  ? rec.grade >= academicParams.approval_grade 
                                    ? 'Aproveitamento' 
                                    : 'Falta Rec.'
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
                  disabled={isSavingCert}
                  className="px-5 py-2 bg-indigo-700 text-white font-bold uppercase tracking-wider text-[9px] hover:bg-indigo-800 disabled:opacity-50"
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
                       viewingCertificate.student_name,
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
                 viewingCertificate.student_name,
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

      {/* PRINT VERSION OF THE COMPLETED DOSSIER SHEET (HIDDEN ON SCREEN) */}
      {activeStudent && activeStudentMetrics && (
        <div id="printable-student-record" className="hidden print:block text-black bg-white overflow-visible font-sans leading-tight relative w-full h-[285mm] mx-auto p-12">
          
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
            <h2 className="text-[16pt] font-bold uppercase tracking-[0.2em] w-fit mx-auto border-b-2 border-black pb-0.5">Ficha de Frequência e Aproveitamento do Aluno</h2>
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
              <span className="font-bold uppercase text-slate-650 min-w-[120px]">Status Canônico:</span>
              <span className="font-bold flex-1 border-b border-dashed border-black/20 uppercase pl-1">{activeStudent.status || 'ATIVO'}</span>
            </div>
            <div className="col-span-6 flex gap-2">
              <span className="font-bold uppercase text-slate-650 min-w-[120px]">Curso Vinculado:</span>
              <span className="font-bold flex-1 border-b border-dashed border-black/20 uppercase pl-1">{activeStudent.course || 'TEOLOGIA'}</span>
            </div>

            <div className="col-span-6 flex gap-2">
              <span className="font-bold uppercase text-slate-650 min-w-[120px]">CPF:</span>
              <span className="font-mono font-semibold flex-1 border-b border-dashed border-black/20">{activeStudent.cpf || 'Não Informado'}</span>
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
              <span className="font-bold uppercase text-slate-650 min-w-[120px]">Residência:</span>
              <span className="font-semibold uppercase flex-1 border-b border-dashed border-black/20">{activeStudent.address_city || 'Não Informado'} - {activeStudent.address_state || 'SP'}</span>
            </div>
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
                <p className="text-xl font-bold font-mono text-black">{Math.round(activeStudentMetrics?.presencePercentage ?? 0)}%</p>
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
                    const isApproved = rec.grade !== null && rec.grade >= academicParams.approval_grade;
                    return (
                      <tr key={rec.subject.id}>
                        <td className="p-2 font-mono font-semibold border-r border-black/20">{rec.subject.code || 'S/C'}</td>
                        <td className="p-2 uppercase font-bold border-r border-black/20">{rec.subject.name}</td>
                        <td className="p-2 font-bold font-mono text-center border-r border-black/20">
                          {rec.grade !== null ? rec.grade.toFixed(1).replace('.', ',') : '---'}
                        </td>
                        <td className="p-2 font-bold text-center uppercase">
                          {rec.grade !== null ? (isApproved ? 'Aprovado' : 'Falta Rec.') : 'S/ Nota'}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* SIGNATURES FOOTER FOR PRINT */}
          <div className="absolute bottom-16 left-12 right-12 grid grid-cols-2 gap-16 text-[10.5pt]">
            <div className="flex flex-col items-center border-t border-black pt-2">
              <p className="uppercase text-[9pt] tracking-wider text-slate-500">Secretaria e Registro Acadêmico</p>
              <p className="mt-1 font-bold">ESCMIN Diocesana</p>
            </div>
            <div className="flex flex-col items-center border-t border-black pt-2">
              <p className="uppercase text-[9pt] tracking-wider text-slate-500">Coordenador Geral</p>
              <p className="mt-1 font-bold">{institution?.president_name || 'Prof. Responsável'}</p>
            </div>
          </div>
          
        </div>
      )}

    </div>
  );
}
