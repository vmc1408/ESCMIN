import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { 
  FileCheck, 
  Search, 
  Plus,
  Printer,
  Trash2,
  Calendar,
  User,
  School,
  Trophy,
  Loader2,
  CheckCircle2,
  Download,
  AlertCircle,
  Award,
  BookOpen,
  Info,
  ChevronRight,
  ShieldCheck,
  Ban,
  X
} from 'lucide-react';
import { createPortal } from 'react-dom';
import { cn, formatDateForDisplay, parseDateToDB } from '../lib/utils';
import { fetchAll, saveData, deleteData, fetchQuery } from '../lib/database';
import { useAuth } from '../contexts/AuthContext';
import { financialService } from '../services/financialService';
import { motion, AnimatePresence } from 'motion/react';

interface Certificate {
  id: string;
  student_id: string;
  student_name?: string;
  type: 'conclusão' | 'participação' | 'honra';
  issuance_date: string;
  course: string;
  verification_code: string;
  user_id: string;
}

interface Student {
  id: string;
  name: string;
  registration_number: string;
  class_id?: string;
  status?: string;
  email?: string;
  address_city?: string;
  address_state?: string;
}

interface Class {
  id: string;
  name: string;
  subject_ids?: any;
}

interface Subject {
  id: string;
  name: string;
}

interface Grade {
  id: string;
  student_id: string;
  class_id: string;
  subject_id: string;
  period: string;
  value: any;
}

interface Assessment {
  id: string;
  class_id: string;
  subject_id: string;
  title: string;
}

interface Attendance {
  id: string;
  student_id: string;
  class_id: string;
  status: 'P' | 'F' | 'J';
  date: string;
}

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

const getCertificateTitle = (type: string) => {
  if (type === 'participação') return 'CERTIFICADO DE PARTICIPAÇÃO';
  if (type === 'honra') return 'DIPLOMA DE DIÁCONATO';
  return 'CERTIFICADO DE CONCLUSÃO DE CURSO';
};

const getCertificateBorderClassName = (type: string) => {
  if (type === 'participação') {
    // Elegant thin solid border in classical black
    return "border-[4px] border-black p-8 flex-[1_1_0%] flex flex-col justify-between h-full box-border relative m-1";
  }
  if (type === 'honra') {
    // Premium distinct black border frame
    return "border-[6px] border-black p-8 flex-[1_1_0%] flex flex-col justify-between h-full box-border relative m-1";
  }
  // Modelo Certificado de Conclusão: classic double border in black
  return "border-[5px] border-double border-black p-8 flex-[1_1_0%] flex flex-col justify-between h-full box-border relative m-1";
};

const renderCertificateDecorations = (type: string) => {
  if (type === 'participação') {
    return (
      <>
        {/* Elegant thin inner black frame with nested fine lines */}
        <div className="absolute inset-1.5 border border-black/40 pointer-events-none" />
        <div className="absolute inset-3 border border-black/15 pointer-events-none" />
        {/* Artistic Corner Ornaments (L-shapes) */}
        <div className="absolute top-4 left-4 w-8 h-8 border-t-[2px] border-l-[2px] border-black pointer-events-none" />
        <div className="absolute top-4 right-4 w-8 h-8 border-t-[2px] border-r-[2px] border-black pointer-events-none" />
        <div className="absolute bottom-4 left-4 w-8 h-8 border-b-[2px] border-l-[2px] border-black pointer-events-none" />
        <div className="absolute bottom-4 right-4 w-8 h-8 border-b-[2px] border-r-[2px] border-black pointer-events-none" />
      </>
    );
  }
  if (type === 'honra') {
    return (
      <>
        {/* Elite multi-layered academic diploma frame all in deep black */}
        <div className="absolute inset-1 border-[2px] border-white pointer-events-none" />
        <div className="absolute inset-1.5 border border-black pointer-events-none" />
        <div className="absolute inset-3.5 border border-black/30 pointer-events-none" />
        {/* Sophisticated black certificate corner stars/blocks */}
        <div className="absolute top-4 left-4 w-2.5 h-2.5 bg-black pointer-events-none rotate-45" />
        <div className="absolute top-4 right-4 w-2.5 h-2.5 bg-black pointer-events-none rotate-45" />
        <div className="absolute bottom-4 left-4 w-2.5 h-2.5 bg-black pointer-events-none rotate-45" />
        <div className="absolute bottom-4 right-4 w-2.5 h-2.5 bg-black pointer-events-none rotate-45" />
      </>
    );
  }
  // Modelo Certificado de Conclusão: classic black double line with elegant minimalist modern corners
  return (
    <>
      <div className="absolute inset-1 border border-black/30 pointer-events-none" />
      <div className="absolute inset-2.5 border border-black/10 pointer-events-none" />
      {/* Corner crosshairs for a perfect engineered blueprint layout */}
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
  const institutionName = institution?.name || 'Escola de Formação Conciliar';
  const institutionLocation = institution?.city_uf || 'Catedral Geral / SP';

  if (type === 'participação') {
    return (
      <>
        <div className="my-[1mm] space-y-[4mm] flex-1 flex flex-col justify-center items-center text-center">
          <div className="flex items-center justify-center gap-6">
             <div className="h-[1.5px] w-14 bg-black/80" />
             <h1 className="text-xl md:text-2xl font-bold text-black tracking-[0.18em] uppercase font-display">
                CERTIFICADO DE PARTICIPAÇÃO
             </h1>
             <div className="h-[1.5px] w-14 bg-black/80" />
          </div>

          <p className="text-xs md:text-sm max-w-3xl mx-auto leading-relaxed font-serif text-slate-800 px-8 text-center">
             A diretoria e coordenação da <strong className="text-black font-semibold font-serif italic">{institutionName}</strong> confere o presente título acadêmico e formativo a:
          </p>

          <div className="py-1 w-full flex justify-center">
             <h2 className="text-2xl md:text-3xl font-bold uppercase tracking-widest text-slate-950 font-serif inline-block px-12 bg-slate-50/10 text-center">
                {studentName}
             </h2>
          </div>

          <p className="text-xs md:text-sm max-w-3xl mx-auto leading-relaxed font-serif text-slate-800 px-8 text-center">
             por ter participado ativamente das sessões seminaristas, colóquios, palestras e atividades práticas integradas no programa pastoral de estudos de <strong className="text-black font-semibold italic">{courseName}</strong>.
          </p>

          <p className="text-[11px] md:text-xs max-w-3xl mx-auto leading-relaxed font-serif text-slate-600 px-8 pt-1 text-center italic">
             Comprovando digna dedicação intelectual e acadêmica compatível com as diretrizes da Diocese.
          </p>

          <p className="text-[10px] text-slate-900 font-bold uppercase tracking-[0.22em] mt-4 font-sans max-w-sm mx-auto border-t border-slate-200 pt-2 text-center">
             {institutionLocation}, {formatLongDate(issuanceDate)}
          </p>
        </div>

        <div className="flex items-end justify-between px-12 mb-1 font-sans mt-4">
           <div className="flex flex-col items-center gap-1">
              <div className="w-40 border-b border-black/80" />
              <p className="text-[8px] font-bold text-slate-650 uppercase tracking-widest text-center">Secretário Acadêmico</p>
           </div>
           <div className="flex flex-col items-center gap-1">
              <div className="w-40 border-b border-black/80" />
              <p className="text-[8px] font-bold text-slate-650 uppercase tracking-widest text-center">Coordenador do Curso</p>
           </div>
        </div>
      </>
    );
  }

  if (type === 'honra') {
    return (
      <>
        <div className="my-[1mm] space-y-[4mm] flex-1 flex flex-col justify-center items-center text-center">
          <div className="flex items-center justify-center gap-6">
             <div className="h-[1.5px] w-14 bg-black/60" />
             <h1 className="text-2xl md:text-3xl font-bold text-black tracking-[0.2em] uppercase font-display">
                DIPLOMA ACADÊMICO
             </h1>
             <div className="h-[1.5px] w-14 bg-black/60" />
          </div>

          <p className="text-xs md:text-sm max-w-3xl mx-auto leading-relaxed font-serif text-slate-800 px-8 text-center">
             O Conselho de Formadores e Orientadores do Seminário Maior da <strong className="text-black font-semibold font-serif italic">{institutionName}</strong>, no cumprimento de suas atribuições ministeriais e teológicas, concede o diploma de mérito ao estudante:
          </p>

          <div className="py-2 w-full flex justify-center">
             <h2 className="text-2xl md:text-3xl font-bold uppercase tracking-widest text-slate-950 font-serif inline-block px-14 bg-slate-50/10 text-center">
                {studentName}
             </h2>
          </div>

          <p className="text-xs md:text-sm max-w-3xl mx-auto leading-relaxed font-serif text-slate-800 px-8 text-center">
             por haver concluído brilhantemente os estudos sagrados teológicos do curso de <strong className="text-black font-semibold italic">{courseName}</strong>, demonstrando elevada idoneidade pastoral, dedicação canônica, inteligência crítica e vida espiritual exemplar.
          </p>

          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-[0.22em] mt-3 font-sans max-w-sm mx-auto text-center">
             {institutionLocation}, {formatLongDate(issuanceDate)}
          </p>
        </div>

        <div className="flex items-end justify-between px-12 mb-1 font-sans mt-4">
           <div className="flex flex-col items-center gap-1">
              <div className="w-40 border-b border-black/80" />
              <p className="text-[8px] font-bold text-slate-600 uppercase tracking-widest text-center">Reitor do Seminário</p>
           </div>
           <div className="flex flex-col items-center gap-1">
              <div className="w-40 border-b border-black/80" />
              <p className="text-[8px] font-bold text-slate-600 uppercase tracking-widest text-center">Secretário(a) Acadêmico(a)</p>
           </div>
           <div className="flex flex-col items-center gap-1">
              <div className="w-40 border-b border-black/80" />
              <p className="text-[8px] font-bold text-slate-600 uppercase tracking-widest text-center">Bispo Diocesano</p>
           </div>
        </div>
      </>
    );
  }

  // Modelo CERTIFICADO DE CONCLUSÃO
  return (
    <>
      <div className="my-[1mm] space-y-[4mm] flex-1 flex flex-col justify-center items-center text-center">
        <div className="flex items-center justify-center gap-6">
           <div className="h-[1.5px] w-14 bg-black/70" />
           <h1 className="text-xl md:text-2xl font-bold text-black tracking-[0.18em] uppercase font-display">
              CERTIFICADO DE CONCLUSÃO
           </h1>
           <div className="h-[1.5px] w-14 bg-black/70" />
        </div>

        <p className="text-xs md:text-sm max-w-3xl mx-auto leading-relaxed font-serif text-slate-800 px-8 text-center">
           A <strong className="text-black font-semibold font-serif italic">{institutionName}</strong> certifica que o(a) estudante:
        </p>

        <div className="py-1 w-full flex justify-center">
           <h2 className="text-2xl md:text-3xl font-bold uppercase tracking-widest text-slate-950 font-serif inline-block px-12 bg-slate-50/10 text-center">
              {studentName}
           </h2>
        </div>

        <p className="text-xs md:text-sm max-w-3xl mx-auto leading-relaxed font-serif text-slate-800 px-8 text-center">
           concluiu com êxito o Curso de <strong className="text-black font-semibold italic">{courseName}</strong>, tendo cumprido satisfatoriamente todas as exigências acadêmicas e formativas previstas no programa de estudos.
        </p>

        <p className="text-[11px] md:text-xs max-w-3xl mx-auto leading-relaxed font-serif text-slate-600 px-8 text-center">
           Conferimos o presente Certificado de Conclusão para que produza os efeitos educacionais e institucionais cabíveis.
        </p>

        <p className="text-[10px] text-slate-900 font-bold uppercase tracking-[0.22em] mt-4 font-sans max-w-sm mx-auto border-t border-slate-100 pt-2 text-center">
           {institutionLocation}, {formatLongDate(issuanceDate)}
        </p>
      </div>

      <div className="flex items-end justify-between px-12 mb-1.5 font-sans mt-4">
         <div className="flex flex-col items-center gap-1">
            <div className="w-40 border-b border-black/80" />
            <p className="text-[8px] font-bold text-slate-600 uppercase tracking-widest text-center">Diretor Acadêmico</p>
         </div>
         <div className="flex flex-col items-center gap-1">
            <div className="w-40 border-b border-black/80" />
            <p className="text-[8px] font-bold text-slate-600 uppercase tracking-widest text-center">Secretário Acadêmico</p>
         </div>
         <div className="flex flex-col items-center gap-1">
            <div className="w-40 border-b border-black/80" />
            <p className="text-[8px] font-bold text-slate-600 uppercase tracking-widest text-center">Bispo Diocesano</p>
         </div>
      </div>
    </>
  );
};

export function Documents() {
  const { userAuth, isAdmin, isDirector } = useAuth();
  
  // Tabs & Filters
  const [activeTab, setActiveTab] = useState<'issue' | 'list' | 'student_file'>('issue');
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [selectedFichaStudentId, setSelectedFichaStudentId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Database States
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [dbGrades, setDbGrades] = useState<Grade[]>([]);
  const [attendanceData, setAttendanceData] = useState<Attendance[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<any[]>([]);
  const [institution, setInstitution] = useState<any>(null);
  
  const [academicParams, setAcademicParams] = useState<any>({
    approval_grade: 7.0,
    absence_limit_percentage: 25
  });

  const [loading, setLoading] = useState(true);
  
  // Modals / Issue Action State
  const [isIssuing, setIsIssuing] = useState(false);
  const [viewingCertificate, setViewingCertificate] = useState<Certificate | null>(null);
  const [issuingStudentData, setIssuingStudentData] = useState<any | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  
  const [formData, setFormData] = useState({
    student_id: '',
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

  const fetchData = React.useCallback(async () => {
    try {
      setLoading(true);
      const [certs, studs, clss, subs, assms, grds, atts, calEvts, instSettings] = await Promise.all([
        fetchAll('certificates', '*', 'created_at', true),
        fetchAll('students', '*', 'name'),
        fetchAll('classes', '*', 'name'),
        fetchAll('subjects'),
        fetchAll('assessments'),
        fetchAll('grades'),
        fetchAll('attendances'),
        fetchQuery('calendar_events', [{ field: 'type', operator: '==', value: 'class_day' }]),
        financialService.getInstitutionSettings()
      ]);
      
      setStudents((studs || []).filter((s: any) => s.status === 'Ativo' || !s.status));
      const enrichedCerts = (certs || []).map((cert: any) => {
        const student = (studs || []).find((s: any) => s.id === cert.student_id);
        return {
          ...cert,
          student_name: student?.name || cert.student_name || 'Estudante Sem Nome'
        };
      });
      setCertificates(enrichedCerts);
      setClasses((clss || []).filter((c: any) => c.status === 'Ativo'));
      setSubjects((subs || []).filter((sub: any) => sub.status === 'Ativo' || !sub.status));
      setAssessments(assms || []);
      setDbGrades(grds || []);
      setAttendanceData(atts || []);
      setCalendarEvents(calEvts || []);
      
      if (instSettings) {
        setInstitution(instSettings);
        setAcademicParams({
          approval_grade: instSettings.approval_grade || 7.0,
          absence_limit_percentage: instSettings.absence_limit_percentage || 25
        });
      }
    } catch (error) {
      console.error('Error fetching documents data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Handle trigger notification
  const showToast = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 4000);
  };

  // Run dynamic results per class
  const classObj = classes.find(c => c.id === selectedClassId);
  const totalClassDays = calendarEvents?.length || 0;

  const calculatedClassStudents = React.useMemo(() => {
    if (!selectedClassId) return [];

    let sIds: string[] = [];
    if (classObj) {
      if (Array.isArray(classObj.subject_ids)) {
        sIds = classObj.subject_ids;
      } else if (typeof classObj.subject_ids === 'string') {
        try {
          const parsed = JSON.parse(classObj.subject_ids);
          sIds = Array.isArray(parsed) ? parsed : [parsed];
        } catch (e) {
          sIds = classObj.subject_ids ? [classObj.subject_ids] : [];
        }
      }
    }

    const classSubjects = subjects.filter(sub => {
      if (sIds.length > 0) return sIds.includes(sub.id);
      return assessments.some(a => a.class_id === selectedClassId && a.subject_id === sub.id);
    });

    return students
      .filter(student => student.class_id === selectedClassId && (student.status === 'Ativo' || !student.status))
      .map(student => {
        // Attendance
        const totalDays = totalClassDays > 0 ? totalClassDays : 30;
        const studentAbsences = attendanceData.filter(a => a.student_id === student.id && a.class_id === selectedClassId && a.status === 'F').length;
        const presencePercentage = totalDays > 0 ? Math.max(0, Math.min(100, ((totalDays - studentAbsences) / totalDays) * 100)) : 100;
        const minPresence = 100 - (academicParams.absence_limit_percentage || 25);
        const isAttendanceApproved = presencePercentage >= minPresence;

        // Grades
        let sumGrades = 0;
        let countGrades = 0;

        const subjectGradesArray = classSubjects.map(sub => {
          const finalGradeRecord = dbGrades.find(g => 
            g.student_id === student.id && 
            g.class_id === selectedClassId && 
            g.subject_id === sub.id && 
            g.period === 'Resultado Final'
          );

          let gradeValue: number | null = null;
          if (finalGradeRecord && finalGradeRecord.value !== null && finalGradeRecord.value !== undefined && finalGradeRecord.value !== '') {
            gradeValue = typeof finalGradeRecord.value === 'string' 
              ? parseFloat(finalGradeRecord.value.replace(',', '.')) 
              : finalGradeRecord.value;
          } else {
            // Dynamic average
            const subAssessments = assessments.filter(a => a.class_id === selectedClassId && a.subject_id === sub.id);
            const subAssessmentIds = subAssessments.map(a => a.id);
            const subAssessmentTitles = subAssessments.map(a => a.title);

            const studentSubGrades = dbGrades.filter(g => 
              g.student_id === student.id && 
              g.class_id === selectedClassId && 
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

          if (gradeValue !== null) {
            sumGrades += gradeValue;
            countGrades++;
          }

          return {
            subjectId: sub.id,
            grade: gradeValue
          };
        });

        const minApp = academicParams.approval_grade || 7.0;
        let finalStatus: 'Aprovado' | 'Recuperação' | 'Reprovado' | 'Pendente' = 'Aprovado';
        const hasMissingGrades = subjectGradesArray.some(sg => sg.grade === null);

        if (!isAttendanceApproved) {
          finalStatus = 'Reprovado';
        } else if (hasMissingGrades) {
          finalStatus = 'Pendente';
        } else {
          const failedCount = subjectGradesArray.filter(sg => sg.grade !== null && sg.grade < minApp).length;
          if (failedCount > 0) {
            finalStatus = failedCount <= 2 ? 'Recuperação' : 'Reprovado';
          }
        }

        const averageGrade = countGrades > 0 ? (sumGrades / countGrades) : 0;
        const isEligible = finalStatus === 'Aprovado';

        // Check already issued certificates
        const issuedCerts = certificates.filter(cert => 
          cert.student_id === student.id && 
          cert.course.toLowerCase().trim() === (classObj?.name || '').toLowerCase().trim()
        );

        return {
          student,
          absences: studentAbsences,
          presencePercentage,
          averageGrade,
          finalStatus,
          isEligible,
          issuedCerts
        };
      });
  }, [selectedClassId, classObj, classes, students, totalClassDays, attendanceData, dbGrades, assessments, academicParams, certificates, subjects]);

  const fichaStudent = students.find(s => s.id === selectedFichaStudentId);

  const studentFichaData = React.useMemo(() => {
    if (!fichaStudent) return null;
    
    const classId = fichaStudent.class_id;
    if (!classId) {
      return { 
        fichaStudent, 
        cls: null, 
        totalDays: 0, 
        absences: 0, 
        presences: 0, 
        presencePercentage: 100, 
        subjectRecords: [], 
        studentDocs: certificates.filter(c => c.student_id === fichaStudent.id) 
      };
    }

    const cls = classes.find(c => c.id === classId);
    
    let sIds: string[] = [];
    if (cls) {
      if (Array.isArray(cls.subject_ids)) {
        sIds = cls.subject_ids;
      } else if (typeof cls.subject_ids === 'string') {
        try {
          const parsed = JSON.parse(cls.subject_ids);
          sIds = Array.isArray(parsed) ? parsed : [parsed];
        } catch (e) {
          sIds = cls.subject_ids ? [cls.subject_ids] : [];
        }
      }
    }

    const classSubjects = subjects.filter(sub => {
      if (sIds.length > 0) return sIds.includes(sub.id);
      return assessments.some(a => a.class_id === classId && a.subject_id === sub.id);
    });

    const studentAbsences = attendanceData.filter(a => a.student_id === fichaStudent.id && a.class_id === classId && a.status === 'F').length;
    const studentPresences = attendanceData.filter(a => a.student_id === fichaStudent.id && a.class_id === classId && a.status === 'P').length;
    
    const totalDays = totalClassDays > 0 ? totalClassDays : 30;
    const presencePercentage = totalDays > 0 ? Math.max(0, Math.min(100, ((totalDays - studentAbsences) / totalDays) * 100)) : 100;

    // Calculate grades per subject
    const subjectRecords = classSubjects.map(sub => {
      const finalGradeRecord = dbGrades.find(g => 
        g.student_id === fichaStudent.id && 
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
          g.student_id === fichaStudent.id && 
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

    const studentDocs = certificates.filter(c => c.student_id === fichaStudent.id);

    return {
      fichaStudent,
      cls,
      totalDays,
      absences: studentAbsences,
      presences: studentPresences,
      presencePercentage,
      subjectRecords,
      studentDocs
    };
  }, [fichaStudent, classes, subjects, dbGrades, assessments, attendanceData, totalClassDays, certificates]);

  const handleIssueSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userAuth) return;

    const student = students.find(s => s.id === formData.student_id);
    const verificationCode = Math.random().toString(36).substring(2, 10).toUpperCase();

    try {
      const newDocId = crypto.randomUUID();
      const payload = {
        id: newDocId,
        student_id: formData.student_id,
        student_name: student?.name,
        type: formData.type,
        course: formData.course,
        issuance_date: formData.issuance_date,
        verification_code: verificationCode,
        user_id: userAuth.uid,
        created_at: new Date().toISOString()
      };

      await saveData('certificates', newDocId, payload);

      setIsIssuing(false);
      setFormData({
        student_id: '',
        type: 'conclusão',
        issuance_date: new Date().toISOString().split('T')[0],
        course: ''
      });
      
      showToast('success', 'Documento emitido e registrado com sucesso!');
      fetchData();
    } catch (error) {
      console.error("Error issuing certificate:", error);
      showToast('error', 'Houve um erro técnico ao registrar o documento no banco de dados.');
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`Deseja realmente cancelar e excluir o registro do documento de ${name}? Esta ação é irreversível!`)) return;
    try {
      await deleteData('certificates', id);
      showToast('success', 'Documento excluído com sucesso.');
      fetchData();
    } catch (error) {
      console.error("Error deleting document:", error);
      showToast('error', 'Erro ao excluir o documento do servidor.');
    }
  };

  const printCertificate = () => {
    try {
      window.print();
    } catch (err) {
      console.error("Print failed:", err);
      alert('Seu navegador bloqueou a impressão direta. Abra em uma aba limpa ou use Ctrl+P.');
    }
  };

  // Filtering list
  const filteredCertificates = certificates.filter(cert => {
    const studentName = cert.student_name || '';
    const courseName = cert.course || '';
    const query = searchQuery.toLowerCase();
    return studentName.toLowerCase().includes(query) || courseName.toLowerCase().includes(query) || cert.verification_code.toLowerCase().includes(query);
  });

  return (
    <div className="max-w-7xl mx-auto space-y-6 px-4 py-3 pb-20">
      {/* Toast Notification Container */}
      {notification && (
        <div className="fixed top-5 right-5 z-[10000] p-4 bg-slate-900 text-white rounded-none border border-slate-700 shadow-2xl space-y-1 animate-in slide-in-from-top-12 duration-305 flex flex-col">
          <p className="text-xs font-extrabold uppercase tracking-widest text-[#00174b] bg-amber-400 px-2 py-0.5 self-start mb-1">
            {notification.type === 'success' ? 'Sucesso' : 'Falha'}
          </p>
          <p className="text-xs font-medium text-slate-100">{notification.message}</p>
        </div>
      )}

      {/* Header Panel */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 print:hidden bg-white border border-slate-200 p-6 rounded-none shadow-sm">
        <div>
          <h2 className="text-2xl font-black text-slate-800 flex items-center gap-3 font-serif">
            <div className="w-10 h-10 bg-slate-900 rounded-none flex items-center justify-center text-white border-b-4 border-b-amber-400">
              <Trophy size={20} className="text-amber-400" />
            </div>
            Certificados & Diplomas
          </h2>
          <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-[0.2em] pl-1">
            Emissão de Documentos Acadêmicos Baseada no Diário de Classe
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => {
              setActiveTab('issue');
              setSelectedClassId('');
            }}
            className={cn(
              "px-5 py-2.5 rounded-none text-[10px] font-bold uppercase tracking-widest transition-all",
              activeTab === 'issue'
                ? "bg-slate-900 text-white border border-slate-905"
                : "bg-white text-slate-500 border border-slate-200 hover:bg-slate-50"
            )}
          >
            Emitir
          </button>
          <button
            onClick={() => {
              setActiveTab('student_file');
              setSelectedFichaStudentId('');
            }}
            className={cn(
              "px-5 py-2.5 rounded-none text-[10px] font-bold uppercase tracking-widest transition-all",
              activeTab === 'student_file'
                ? "bg-slate-900 text-white border border-slate-905"
                : "bg-white text-slate-500 border border-slate-200 hover:bg-slate-50"
            )}
          >
            Ficha do Aluno
          </button>
          <button
            onClick={() => setActiveTab('list')}
            className={cn(
              "px-5 py-2.5 rounded-none text-[10px] font-bold uppercase tracking-widest transition-all",
              activeTab === 'list'
                ? "bg-slate-900 text-white border border-slate-905"
                : "bg-white text-slate-500 border border-slate-200 hover:bg-slate-50"
            )}
          >
            Emitidos ({certificates.length})
          </button>
        </div>
      </div>

      {loading ? (
        <div className="py-20 flex justify-center print:hidden">
          <div className="w-8 h-8 border-4 border-slate-900/10 border-t-slate-900 rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-6">
          {/* TAB 1: ISSUE WORKFLOW (CONGRESS DIARIO) */}
          {activeTab === 'issue' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 print:hidden">
              {/* Left Selector Side: Class select */}
              <div className="lg:col-span-4 space-y-4">
                <div className="bg-white border border-slate-200 p-5 rounded-none space-y-4 shadow-sm">
                  <h4 className="text-[10px] font-extrabold text-slate-800 uppercase tracking-widest flex items-center gap-2">
                    <BookOpen size={12} className="text-amber-500" /> Selecione a Turma
                  </h4>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Escolha uma turma para ver notas, faltas e aprovações, liberando somente alunos elegíveis.
                  </p>
                  
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Turma / Diário</label>
                    <select
                      value={selectedClassId}
                      onChange={e => setSelectedClassId(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-250 rounded-none text-xs font-bold uppercase tracking-wider focus:outline-none focus:border-slate-800 focus:bg-white"
                    >
                      <option value="">Selecione a turma...</option>
                      {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                </div>

                {selectedClassId && (
                  <div className="bg-slate-50 border border-slate-200 p-5 rounded-none space-y-3">
                    <h5 className="text-[9.5px] font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                      <Info size={11} className="text-slate-500" /> Critérios de Liberação
                    </h5>
                    <div className="space-y-1.5 text-[11px] text-slate-600 font-medium">
                      <div className="flex justify-between border-b border-slate-200/60 pb-1">
                        <span>Média de Aprovação:</span>
                        <strong className="text-slate-800 font-bold">{academicParams.approval_grade?.toFixed(1).replace('.', ',')}</strong>
                      </div>
                      <div className="flex justify-between">
                        <span>Limite Absenteísmo:</span>
                        <strong className="text-slate-805 font-bold">{(academicParams.absence_limit_percentage)}% faltas</strong>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Right Side: Eligible Student Listing */}
              <div className="lg:col-span-8">
                {!selectedClassId ? (
                  <div className="bg-white border-2 border-dashed border-slate-200 py-16 text-center space-y-4 rounded-none">
                    <div className="w-14 h-14 bg-slate-50 text-slate-300 border border-slate-100 rounded-none flex items-center justify-center mx-auto">
                      <School size={24} />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-450 uppercase tracking-widest">Nenhuma turma selecionada</p>
                      <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1">Conforme orientações gerais do diário de classe, selecione a turma correspondente fictícia no menu ao lado.</p>
                    </div>
                  </div>
                ) : (
                  <div className="bg-white border border-slate-200 rounded-none shadow-sm overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/50 flex items-center justify-between">
                      <h4 className="text-[10px] font-extrabold text-slate-800 uppercase tracking-widest">
                        Status de Elegibilidade para Certificação ({calculatedClassStudents.length})
                      </h4>
                      <span className="text-[9px] font-bold text-slate-600 uppercase tracking-widest bg-slate-200/50 px-2.5 py-1">
                         {classObj?.name}
                      </span>
                    </div>

                    <div className="divide-y divide-slate-100">
                      {calculatedClassStudents.length === 0 ? (
                        <div className="p-8 text-center text-xs font-bold uppercase tracking-widest text-slate-400">Nenhum estudante matriculado nesta turma</div>
                      ) : (
                        calculatedClassStudents.map(cs => (
                          <div key={cs.student.id} className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/40 transition-colors">
                            <div className="space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-xs font-bold text-slate-850 uppercase">{cs.student.name}</span>
                                <span className="text-[8px] font-bold text-slate-400 font-mono tracking-wider">RA: {cs.student.registration_number || 'N/D'}</span>
                              </div>
                              <div className="flex items-center gap-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                <span>Média: <span className={cn("font-mono font-bold", cs.averageGrade >= (academicParams.approval_grade || 7.0) ? "text-slate-700" : "text-rose-500")}>{cs.averageGrade.toFixed(1).replace('.', ',')}</span></span>
                                <span>Frequência: <span className="font-mono font-bold">{Math.round(cs.presencePercentage)}%</span></span>
                              </div>
                            </div>

                            <div className="flex items-center gap-3 self-end sm:self-auto">
                              {/* Status Tag */}
                              <span className={cn(
                                "inline-flex items-center gap-1 text-[8.5px] font-bold px-3 py-1 border uppercase tracking-widest",
                                cs.finalStatus === 'Aprovado' 
                                  ? "text-emerald-700 bg-emerald-50 border-emerald-200"
                                  : cs.finalStatus === 'Pendente'
                                  ? "text-amber-700 bg-amber-50 border-amber-200"
                                  : "text-rose-700 bg-rose-50 border-rose-200"
                              )}>
                                <ShieldCheck size={11} /> {cs.finalStatus}
                              </span>

                              {/* Button control (Never blocked, always allow issuance) */}
                              {cs.issuedCerts.length > 0 ? (
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[8px] font-bold text-indigo-700 bg-indigo-50 px-2 py-1 uppercase tracking-widest border border-indigo-200">
                                    {cs.issuedCerts.length} Emitido(s)
                                  </span>
                                  <button
                                    onClick={() => {
                                      setActiveTab('list');
                                      setSearchQuery(cs.student.name);
                                    }}
                                    className="px-2 py-1 border border-slate-300 font-bold text-[8.5px] uppercase tracking-widest hover:border-slate-500 text-slate-700 bg-white"
                                    title="Ver no registro histórico"
                                  >
                                    Ver
                                  </button>
                                  <button
                                    onClick={() => {
                                      setFormData({
                                        student_id: cs.student.id,
                                        type: 'conclusão',
                                        issuance_date: new Date().toISOString().split('T')[0],
                                        course: classObj?.name || 'Curso Conciliar'
                                      });
                                      setIssuingStudentData(cs);
                                      setIsIssuing(true);
                                    }}
                                    className="px-2 py-1 bg-slate-900 border border-slate-905 hover:bg-slate-800 text-white text-[8.5px] font-bold uppercase tracking-widest shadow-sm"
                                  >
                                    Emitir Outro
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => {
                                    setFormData({
                                      student_id: cs.student.id,
                                      type: 'conclusão',
                                      issuance_date: new Date().toISOString().split('T')[0],
                                      course: classObj?.name || 'Curso Conciliar'
                                    });
                                    setIssuingStudentData(cs);
                                    setIsIssuing(true);
                                  }}
                                  className="px-3.5 py-1.5 bg-slate-900 border border-slate-905 hover:bg-slate-800 text-white rounded-none text-[8.5px] font-bold uppercase tracking-widest shadow-sm active:scale-95 transition-all"
                                >
                                  Emitir Doc
                                </button>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: REGISTER VIEW & PRINT */}
          {activeTab === 'list' && (
            <div className="space-y-6 print:hidden">
              {/* Filter Row */}
              <div className="bg-white border border-slate-200 p-4 rounded-none flex items-center justify-between gap-4 shadow-sm flex-col md:flex-row">
                <div className="relative w-full max-w-md">
                  <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Pesquisar por Código, Nome ou Curso..."
                    className="w-full pl-10 pr-4 py-2 border border-slate-250 text-xs font-medium focus:outline-none focus:border-slate-800 bg-slate-50/50"
                  />
                </div>

                <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold self-start md:self-auto">
                  Total de Documentos no Acervo: <strong className="text-slate-850 font-extrabold">{filteredCertificates.length} de {certificates.length}</strong>
                </div>
              </div>

              {/* Grid cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredCertificates.length > 0 ? (
                  filteredCertificates.map(cert => (
                    <motion.div 
                      layout
                      initial={{ opacity: 0, scale: 0.98 }}
                      animate={{ opacity: 1, scale: 1 }}
                      key={cert.id} 
                      className="bg-white border border-slate-220 rounded-none shadow-sm hover:shadow-md transition-all group p-5 relative flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2 mb-4">
                          <span className={cn(
                            "px-2.5 py-1 text-[8.5px] font-extrabold uppercase tracking-widest border shadow-none",
                            cert.type === 'conclusão' ? "bg-slate-50 text-slate-700 border-slate-200" :
                            cert.type === 'honra' ? "bg-amber-50 text-amber-700 border-amber-200" :
                            "bg-indigo-50 text-indigo-700 border-indigo-200"
                          )}>
                            {cert.type}
                          </span>

                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button 
                              onClick={() => setViewingCertificate(cert)}
                              className="p-1.5 text-slate-405 hover:text-slate-900 border border-slate-200 hover:border-slate-400 rounded-none bg-white shadow-sm flex items-center justify-center"
                              title="Visualizar e Imprimir"
                            >
                              <Printer size={13} />
                            </button>
                            <button 
                              onClick={() => handleDelete(cert.id, cert.student_name || 'Estudante')}
                              className="p-1.5 text-rose-500 hover:text-rose-700 border border-slate-200 hover:border-rose-300 rounded-none bg-white shadow-sm flex items-center justify-center ml-0.5"
                              title="Cancelar/Excluir"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <h4 className="text-xs font-extrabold text-slate-850 uppercase tracking-tight line-clamp-2">
                            {cert.student_name}
                          </h4>
                          <div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Curso / Programa</p>
                            <p className="text-xs text-slate-700 font-medium">{cert.course}</p>
                          </div>
                        </div>
                      </div>

                      <div className="pt-4 border-t border-slate-100 mt-4 flex items-center justify-between text-[11px] font-medium text-slate-400">
                        <div className="flex items-center gap-1.5 font-bold">
                          <Calendar size={12} className="text-slate-350" />
                          <span>{new Date(cert.issuance_date + 'T00:00:00').toLocaleDateString('pt-BR')}</span>
                        </div>
                      </div>
                    </motion.div>
                  ))
                ) : (
                  <div className="col-span-full py-16 text-center bg-white border border-slate-200 rounded-none space-y-4">
                    <div className="w-16 h-16 bg-slate-50 text-slate-300 border border-slate-100 rounded-none flex items-center justify-center mx-auto">
                      <FileCheck size={32} />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-450 uppercase tracking-widest">Nenhum certificado registrado no acervo</p>
                      <p className="text-xs text-slate-400 mt-1">Nenhum documento coincide com os filtros salvos no momento.</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: FICHA DE ALUNO INTEGRADA */}
          {activeTab === 'student_file' && (
            <div className="space-y-6 print:hidden">
              <div className="bg-white border border-slate-200 p-8 rounded-none text-center space-y-6 shadow-sm max-w-2xl mx-auto my-12">
                <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-none flex items-center justify-center mx-auto border border-indigo-100">
                  <User size={32} />
                </div>
                <div className="space-y-2">
                  <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest font-sans">
                    Módulo Dedicado Ativado
                  </h3>
                  <p className="text-xs text-slate-500 leading-relaxed max-w-md mx-auto">
                    Conforme as novas diretrizes de organização escolar da diocese, a Ficha Cadastral e Acadêmica do Aluno agora possui um módulo totalmente dedicado, com filtros inteligentes de status, histórico diocesano completo, boletins consolidados e suporte avançado de impressão.
                  </p>
                </div>
                <div className="pt-2">
                  <Link 
                    to="/student-ficha"
                    className="inline-flex items-center gap-2 px-6 py-3 bg-slate-900 hover:bg-slate-800 text-white font-bold text-[10px] uppercase tracking-widest transition-all shadow-md active:scale-95"
                  >
                    Ir para Ficha do Aluno <ChevronRight size={14} />
                  </Link>
                </div>
              </div>
            </div>
          )}

          {false && activeTab === 'student_file' && (
            <div className="space-y-6 print:hidden">
              <div className="bg-white border border-slate-200 p-6 rounded-none space-y-4 shadow-sm">
                <div className="max-w-md space-y-1">
                  <h4 className="text-[10px] font-extrabold text-slate-800 uppercase tracking-widest flex items-center gap-2">
                    <User size={13} className="text-amber-500" /> Selecionar Aluno
                  </h4>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Selecione um aluno para consultar as suas notas, registrar faltas e visualizar ou imprimir certificados gerados.
                  </p>
                  <select
                    value={selectedFichaStudentId}
                    onChange={e => setSelectedFichaStudentId(e.target.value)}
                    className="w-full mt-2 px-3 py-2.5 bg-slate-50 border border-slate-250 rounded-none text-xs font-bold uppercase tracking-wider focus:outline-none focus:border-slate-800 focus:bg-white"
                  >
                    <option value="">Selecione um aluno...</option>
                    {students.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.registration_number ? `RA: ${s.registration_number}` : 'Sem RA'})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {!studentFichaData ? (
                <div className="bg-white border-2 border-dashed border-slate-200 py-16 text-center space-y-4 rounded-none">
                  <div className="w-14 h-14 bg-slate-50 text-slate-350 border border-slate-100 rounded-none flex items-center justify-center mx-auto">
                    <User size={24} />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-450 uppercase tracking-widest">Nenhum aluno selecionado</p>
                    <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1">
                      Selecione um aluno do menu acima para visualizar as notas, faltas e o histórico de certificados do aluno.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                  {/* Left Column: Cadastral Info & Attendance Summary */}
                  <div className="lg:col-span-4 space-y-6">
                    {/* Cadastral Info Card */}
                    <div className="bg-white border border-slate-200 p-5 rounded-none space-y-4 shadow-sm">
                      <div className="border-b border-slate-100 pb-3">
                        <span className="text-[8px] font-bold text-[#00174b] bg-amber-400 px-2 py-0.5 uppercase tracking-widest">
                          Ficha Acadêmica
                        </span>
                        <h3 className="text-sm font-black text-slate-850 uppercase tracking-tight mt-1">
                          {studentFichaData.fichaStudent.name}
                        </h3>
                        <p className="text-[10px] font-bold text-slate-400 font-mono tracking-wider mt-0.5">
                          RA: {studentFichaData.fichaStudent.registration_number || 'Não cadastrado'}
                        </p>
                      </div>

                      <div className="space-y-3.5 text-xs">
                        <div>
                          <p className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider">Turma Atual</p>
                          <p className="font-bold text-slate-700 uppercase mt-0.5">
                            {studentFichaData.cls?.name || 'Sem turma vinculada'}
                          </p>
                        </div>

                        <div>
                          <p className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider">Email para Contato</p>
                          <p className="font-semibold text-slate-600 mt-0.5 truncate">
                            {studentFichaData.fichaStudent.email || 'Nenhum email fornecido'}
                          </p>
                        </div>

                        <div>
                          <p className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider">Cidade / Estado</p>
                          <p className="font-semibold text-slate-600 mt-0.5">
                            {studentFichaData.fichaStudent.address_city || 'Não informado'} - {studentFichaData.fichaStudent.address_state || 'SP'}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Attendance Analysis Card */}
                    <div className="bg-white border border-slate-200 p-5 rounded-none space-y-4 shadow-sm">
                      <h4 className="text-[10px] font-extrabold text-slate-800 uppercase tracking-widest flex items-center gap-2 border-b border-slate-150 pb-2">
                        Controle de Frequência
                      </h4>

                      <div className="grid grid-cols-2 gap-3 text-center">
                        <div className="bg-slate-50 p-2.5 border border-slate-100">
                          <p className="text-[9px] font-extrabold text-slate-450 uppercase tracking-wider">Faltas</p>
                          <p className="text-xl font-bold font-mono text-rose-600 mt-0.5">{studentFichaData.absences}</p>
                        </div>
                        <div className="bg-slate-50 p-2.5 border border-slate-100">
                          <p className="text-[9px] font-extrabold text-slate-450 uppercase tracking-wider">Presenças</p>
                          <p className="text-xl font-bold font-mono text-slate-700 mt-0.5">{studentFichaData.presences}</p>
                        </div>
                      </div>

                      <div className="space-y-1.5 pt-1">
                        <div className="flex justify-between items-center text-[10px] uppercase tracking-wider font-extrabold">
                          <span className="text-slate-500">Porcentagem de Frequência</span>
                          <span className={cn(
                            "font-mono font-black",
                            studentFichaData.presencePercentage >= (100 - (academicParams.absence_limit_percentage || 25)) 
                              ? "text-emerald-700" 
                              : "text-rose-600"
                          )}>
                            {Math.round(studentFichaData.presencePercentage)}%
                          </span>
                        </div>
                        
                        <div className="w-full bg-slate-100 h-2 rounded-none overflow-hidden border border-slate-200/50">
                          <div 
                            className={cn(
                              "h-full transition-all duration-500",
                              studentFichaData.presencePercentage >= (100 - (academicParams.absence_limit_percentage || 25))
                                ? "bg-emerald-600" 
                                : "bg-rose-600"
                            )} 
                            style={{ width: `${studentFichaData.presencePercentage}%` }}
                          />
                        </div>

                        <p className="text-[9px] text-slate-400 font-medium">
                          Limite tolerado de faltas pelas regras da diocese: <strong>{academicParams.absence_limit_percentage}%</strong>.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Grades and Generated Documents */}
                  <div className="lg:col-span-8 space-y-6">
                    {/* Grades Card */}
                    <div className="bg-white border border-slate-200 rounded-none shadow-sm overflow-hidden">
                      <div className="px-5 py-4 border-b border-slate-200 bg-slate-50/50">
                        <h4 className="text-[10px] font-extrabold text-slate-800 uppercase tracking-widest">
                          Aproveitamento Acadêmico (Notas Gerais por Disciplina)
                        </h4>
                      </div>

                      <div className="divide-y divide-slate-100">
                        {studentFichaData.subjectRecords.length === 0 ? (
                          <div className="p-8 text-center text-xs font-bold uppercase tracking-widest text-slate-400">
                            Nenhuma disciplina cadastrada para a turma deste aluno.
                          </div>
                        ) : (
                          studentFichaData.subjectRecords.map(rec => (
                            <div key={rec.subject.id} className="p-4 flex items-center justify-between hover:bg-slate-50/50 transition-colors">
                              <span className="text-xs font-bold text-slate-700 uppercase">{rec.subject.name}</span>
                              <div className="flex items-center gap-4">
                                <span className={cn(
                                  "text-xs font-black font-mono px-2 py-0.5 rounded-none border",
                                  rec.grade !== null 
                                    ? rec.grade >= (academicParams.approval_grade || 7.0)
                                      ? "text-emerald-700 bg-emerald-50 border-emerald-250" 
                                      : "text-rose-700 bg-rose-50 border-rose-200"
                                    : "text-slate-400 bg-slate-50 border-slate-150"
                                )}>
                                  {rec.grade !== null ? rec.grade.toFixed(1).replace('.', ',') : 'N/D'}
                                </span>
                                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider w-16 text-right">
                                  {rec.grade !== null 
                                    ? rec.grade >= (academicParams.approval_grade || 7.0) 
                                      ? 'Aprovado' 
                                      : 'Reprovado/Rec.'
                                    : 'Sem nota'}
                                </span>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    {/* Generated Documents Card */}
                    <div className="bg-white border border-slate-200 rounded-none shadow-sm overflow-hidden">
                      <div className="px-5 py-4 border-b border-slate-200 bg-slate-50/50 flex items-center justify-between">
                        <h4 className="text-[10px] font-extrabold text-slate-800 uppercase tracking-widest">
                          Documentos Emitidos (Certificados & Diplomas)
                        </h4>
                        
                        <button
                          onClick={() => {
                            setFormData({
                              student_id: studentFichaData.fichaStudent.id,
                              type: 'conclusão',
                              issuance_date: new Date().toISOString().split('T')[0],
                              course: studentFichaData.cls?.name || 'Curso Conciliar'
                            });
                            // Create dummy CS object
                            const dummyCS = {
                              student: studentFichaData.fichaStudent,
                              averageGrade: studentFichaData.subjectRecords.length > 0
                                ? studentFichaData.subjectRecords.filter(r => r.grade !== null).reduce((acc, curr) => acc + (curr.grade || 0), 0) / (studentFichaData.subjectRecords.filter(r => r.grade !== null).length || 1)
                                : 0,
                              presencePercentage: studentFichaData.presencePercentage,
                              absences: studentFichaData.absences,
                              finalStatus: 'Aprovado',
                              isEligible: true,
                              issuedCerts: studentFichaData.studentDocs
                            };
                            setIssuingStudentData(dummyCS);
                            setIsIssuing(true);
                          }}
                          className="px-3 py-1 bg-slate-900 border border-slate-905 hover:bg-slate-800 text-white text-[8.5px] font-bold uppercase tracking-widest shadow-sm active:scale-95 transition-all flex items-center gap-1"
                        >
                          <Plus size={10} /> Novo Certificado
                        </button>
                      </div>

                      <div className="divide-y divide-slate-100">
                        {studentFichaData.studentDocs.length === 0 ? (
                          <div className="p-8 text-center text-xs font-bold uppercase tracking-widest text-slate-400">
                            Nenhum certificado ou diploma emitido para este aluno ainda.
                          </div>
                        ) : (
                          studentFichaData.studentDocs.map(doc => (
                            <div key={doc.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/50 transition-colors">
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <span className={cn(
                                    "px-1.5 py-0.5 text-[8px] font-extrabold uppercase tracking-wider border shadow-none",
                                    doc.type === 'conclusão' ? "bg-slate-50 text-slate-700 border-slate-200" :
                                    doc.type === 'honra' ? "bg-amber-50 text-amber-700 border-amber-200" :
                                    "bg-indigo-50 text-indigo-700 border-indigo-200"
                                  )}>
                                    {doc.type}
                                  </span>
                                  <span className="text-xs font-bold text-slate-750 uppercase">{doc.course}</span>
                                </div>
                                <p className="text-[9.5px] font-semibold text-slate-400">
                                  Emitido em: {new Date(doc.issuance_date + 'T00:00:00').toLocaleDateString('pt-BR')}
                                </p>
                              </div>

                              <div className="flex items-center gap-1.5 self-end sm:self-auto">
                                <button 
                                  onClick={() => setViewingCertificate(doc)}
                                  className="px-3 py-1.5 text-slate-700 hover:text-slate-950 border border-slate-300 hover:border-slate-500 font-bold text-[9px] uppercase tracking-widest bg-white shadow-sm flex items-center gap-1.5 transition-colors"
                                  title="Visualizar e Imprimir"
                                >
                                  <Printer size={11} /> Impressão
                                </button>
                                <button 
                                  onClick={() => handleDelete(doc.id, doc.student_name || doc.student_id)}
                                  className="p-1.5 text-rose-500 hover:text-rose-700 border border-slate-300 hover:border-rose-450 rounded-none bg-white shadow-sm flex items-center justify-center transition-colors"
                                  title="Excluir Registro"
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
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* FORM MODAL: REGISTER AND EMIT CERTIFICATE */}
      <AnimatePresence>
        {isIssuing && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 print:hidden">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white max-w-md w-full rounded-none border border-slate-200 shadow-2xl overflow-hidden"
            >
              <div className="bg-slate-900 text-white p-6 border-b border-b-amber-400">
                <h3 className="text-sm font-extrabold uppercase tracking-widest flex items-center gap-3 text-white">
                  <div className="w-8 h-8 bg-slate-800 rounded-none flex items-center justify-center text-amber-400 border border-slate-700">
                    <Award size={16} />
                  </div>
                  Emitir Documento Oficial
                </h3>
              </div>

              <form onSubmit={handleIssueSubmit} className="p-6 space-y-4">
                {issuingStudentData && (
                  <div className="bg-emerald-50 border border-emerald-250 p-4 rounded-none space-y-1.5 text-slate-800 text-[11px] font-medium leading-normal">
                    <h5 className="font-bold text-emerald-805 text-xs text-slate-900 uppercase">Estudante Validado e Elegível:</h5>
                    <p>Nome: <strong className="font-extrabold">{issuingStudentData.student.name}</strong></p>
                    <p>Média Final: <strong className="font-extrabold">{issuingStudentData.averageGrade.toFixed(1).replace('.', ',')}</strong></p>
                    <p>Frequência: <strong className="font-extrabold">{Math.round(issuingStudentData.presencePercentage)}% ({issuingStudentData.absences} faltas)</strong></p>
                  </div>
                )}

                <div className="space-y-4">
                  {/* Read-only selection */}
                  {!issuingStudentData && (
                    <div className="space-y-1">
                      <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest pl-0.5">Aluno</label>
                      <select 
                        required
                        value={formData.student_id}
                        onChange={e => setFormData({...formData, student_id: e.target.value})}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-250 rounded-none text-xs font-bold uppercase focus:outline-none focus:border-slate-800"
                      >
                        <option value="">Selecione o aluno...</option>
                        {students.map(s => <option key={s.id} value={s.id}>{s.name} ({s.registration_number})</option>)}
                      </select>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest pl-0.5 font-sans">Desenho / Estilo do Documento & Margens</label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { type: 'conclusão', label: 'Conclusão', style: 'Borda Dupla' },
                        { type: 'participação', label: 'Participação', style: 'Borda Fina L-Corner' },
                        { type: 'honra', label: 'Diploma / Honra', style: 'Borda Frame Star' }
                      ].map(item => (
                        <button
                          key={item.type}
                          type="button"
                          onClick={() => setFormData({...formData, type: item.type as any})}
                          className={cn(
                            "p-2.5 rounded-none border text-center transition-all flex flex-col justify-center items-center gap-1",
                            formData.type === item.type 
                              ? "bg-slate-900 border-slate-905 text-white" 
                              : "bg-slate-50 border-slate-200 text-slate-500 hover:border-slate-350"
                          )}
                        >
                          <span className="text-[9.5px] font-black uppercase tracking-wider">{item.label}</span>
                          <span className={cn("text-[7.5px] font-bold font-mono tracking-tighter uppercase", formData.type === item.type ? "text-amber-400" : "text-slate-400")}>{item.style}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest pl-0.5">Programa Acadêmico / Curso</label>
                    <input 
                      required
                      type="text"
                      value={formData.course}
                      onChange={e => setFormData({...formData, course: e.target.value})}
                      placeholder="Curso Conciliar de Teologia"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-250 rounded-none text-xs font-bold uppercase focus:outline-none focus:border-slate-800"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest pl-0.5">Data de Emissão do Documento</label>
                    <input 
                      required
                      type="date"
                      value={formData.issuance_date}
                      onChange={e => setFormData({...formData, issuance_date: e.target.value})}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-250 rounded-none text-xs font-bold uppercase focus:outline-none focus:border-slate-800"
                    />
                  </div>
                </div>

                <div className="flex gap-2 pt-4 border-t border-slate-100">
                  <button 
                    type="button"
                    onClick={() => {
                      setIsIssuing(false);
                      setIssuingStudentData(null);
                    }}
                    className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-650 border border-slate-250 text-[10px] font-bold uppercase tracking-widest rounded-none text-center"
                  >
                    Cancelar
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 py-2.5 bg-slate-900 hover:bg-slate-850 text-white border border-slate-905 text-[10px] font-bold uppercase tracking-widest rounded-none text-center"
                  >
                    Emitir & Registrar
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* FULL-SCREEN PRINT MODAL (CREATE PORTAL TO RENDER AT ROOT LEVEL FOR PERFECT LANDSCAPE AND ZERO SCREEN CLUTTER) */}
      <AnimatePresence>
        {viewingCertificate && (
          <div className="fixed inset-0 bg-white z-[12000] flex flex-col items-center justify-start overflow-auto p-4 md:p-12 print:hidden">
             {/* Toolbar Controls */}
             <div className="w-full max-w-5xl flex items-center justify-between border-b border-slate-205 pb-4 mb-6 print:hidden">
                <div className="flex items-center gap-3">
                   <div className="w-10 h-10 bg-slate-900 flex items-center justify-center text-white rounded-none border-b-2 border-amber-400 shadow-sm">
                      <Trophy size={18} className="text-amber-400" />
                   </div>
                   <div>
                      <h3 className="text-xs font-extrabold uppercase tracking-widest text-slate-805">Homologação Digital</h3>
                      <p className="text-[9.5px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">ESCMIN Digital Security Protocol</p>
                   </div>
                </div>

                <div className="flex gap-2 font-sans">
                   <button
                     onClick={printCertificate}
                     className="px-5 py-2.5 bg-slate-900 border border-slate-905 hover:bg-slate-800 text-white rounded-none text-[10px] font-bold uppercase tracking-widest shadow-sm flex items-center gap-2 cursor-pointer"
                   >
                     <Printer size={13} className="text-amber-400" /> Imprimir Documento (Lote/Aba)
                   </button>
                   <button
                     onClick={() => setViewingCertificate(null)}
                     className="px-5 py-2.5 bg-white border border-slate-350 hover:bg-slate-50 text-slate-700 rounded-none text-[10px] font-bold uppercase tracking-widest shadow-sm cursor-pointer"
                   >
                     Fechar Painel
                   </button>
                </div>
             </div>

             {/* SCREEN VIEW REPRESENTATION OF THE PREMIUM CERTIFICATE */}
             <div className="w-full max-w-5xl mx-auto flex justify-center">
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
                           viewingCertificate.student_name || 'Estudante Sem Nome',
                           viewingCertificate.course || '',
                           viewingCertificate.issuance_date,
                           institution
                        )}

                        {/* Secure Registry Footer lines */}
                        <div className="absolute bottom-5 left-12 right-12 flex justify-end items-center text-[7.5px] font-bold text-slate-405 font-sans uppercase tracking-[0.15em] border-t border-slate-100 pt-1 pointer-events-none">
                           <span>ESCMIN Registro e Controle Acadêmico Diocesano</span>
                        </div>
                     </div>
                  </div>
                </div>
             </div>
          </div>
        )}
      </AnimatePresence>

      {/* STYLESHEET FOR PRINT MULTIPAGE A4 LANDSCAPE FORMATTING */}
      {viewingCertificate && (
        <style dangerouslySetInnerHTML={{ __html: `
          @media print {
            @page {
              size: A4 landscape !important;
              margin: 0 !important;
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
            
            /* Hide the main #root layout so only the React Portal-rendered certificate is rendered */
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
        `}} />
      )}

      {/* PORTAL FOR DECOUPLING PRINT VIEW TO BODY ROOT LEVEL */}
      {viewingCertificate && typeof document !== 'undefined' && createPortal(
        <div id="certificate-printable" className="hidden print:flex absolute left-0 top-0 bg-white text-black font-serif justify-between text-center w-[297mm] h-[210mm] max-h-[210mm] max-w-[297mm] p-[10mm] z-[99999] overflow-hidden flex-col box-border">
          <div className={getCertificateBorderClassName(viewingCertificate.type)}>
             {renderCertificateDecorations(viewingCertificate.type)}

             {/* Header with diocese logo and custom diocese titles */}
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
                   <h2 className="text-xl md:text-2xl font-bold uppercase tracking-[0.16em] text-black font-display leading-[1.3]">
                      {institution?.name || 'SISTEMA DE ENSINO'}
                   </h2>
                   <p className="text-xs font-sans font-bold uppercase text-amber-600 tracking-[0.15em] mt-1">
                      {institution?.subtitle || 'SECRETARIA ACADÊMICA & CADASTRO DE DIPLOMAS'}
                   </p>
                </div>
             </div>

             {/* Certificate Content Parser */}
             {renderCertificateInnerContent(
               viewingCertificate.type,
               viewingCertificate.student_name || 'Estudante Sem Nome',
               viewingCertificate.course,
               viewingCertificate.issuance_date,
               institution
             )}

             {/* Secure Registry Footer lines */}
             <div className="absolute bottom-5 left-12 right-12 flex justify-end items-center text-[7.5px] font-bold text-slate-400 font-sans uppercase tracking-[0.15em] border-t border-slate-100 pt-1 pointer-events-none">
               <span>ESCMIN Registro e Controle Acadêmico Diocesano</span>
             </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
