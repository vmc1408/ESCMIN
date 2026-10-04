import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { 
  Search, 
  UserPlus, 
  Edit2, 
  Trash2, 
  Save, 
  X,
  User as UserIcon,
  Phone,
  Mail,
  MapPin,
  Calendar,
  FileText,
  Printer,
  Loader2,
  Plus,
  GraduationCap,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Camera,
  Upload,
  RotateCcw,
  ArrowUpDown,
  CreditCard,
  DollarSign,
  Info,
  BookOpen,
  Users,
  ArrowLeft,
  Layers,
  Sparkles,
  School,
  Building2,
  UserX,
  Receipt,
  Wallet,
  Check
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Webcam from 'react-webcam';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { formatCurrency, cn, maskDate, formatDateForDisplay, parseDateToDB, maskPhone, detectCourseFromClass, formatRegistrationNumber, matchesStudentSearch, calculateStudentSearchRank, safeFormat, numberToPortugueseWords, calculateAge, formatAge, isBirthdayToday, isValidCPF } from '../lib/utils';
import { getClassStartDateFromSchedule } from '../lib/academicUtils';
import { uploadImage, fetchAll, saveData, deleteData, saveBatch, deleteBatch, fetchQuery, getInstitutionSettings, cleanOrphanEnrollments, autoIdentifyAllStudentsCourses } from '../lib/database';
import { Student, Class, Enrollment, Course, Contribution } from '../types';
import { financialConfigService } from '../services/financialConfigService';
import { getClassStartYear } from '../lib/contributionRules';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useUnits } from '../contexts/UnitContext';
import { isItemInUnit, getItemUnitId } from '../lib/unitService';
import { UnitConflictBanner } from '../components/UnitConflictBanner';
import { maskRG, calculateRGValidation, RG_MAX_FORMATTED_LENGTH } from '../lib/rgUtils';
import { fetchAddressByCEP } from '../lib/cepUtils';
import { EnrollmentReceiptModal } from '../components/EnrollmentReceiptModal';
import { LiquidateEnrollmentFeeModal } from '../components/LiquidateEnrollmentFeeModal';
import { EnrollClassWithFeeModal } from '../components/EnrollClassWithFeeModal';

// Memoized List Item to prevent lag
const StudentItem = React.memo(({ 
  student, 
  isSelected, 
  onSelect, 
  isUnallocated,
  parallelClassesCount,
  unitName,
  className 
}: { 
  student: Student, 
  isSelected: boolean, 
  onSelect: (s: Student) => void,
  isUnallocated?: boolean,
  parallelClassesCount?: number,
  unitName?: string,
  className?: string
}) => {
  return (
    <button
      onClick={() => onSelect(student)}
      className={cn(
        "w-full flex items-center gap-3 p-2.5 rounded-none transition-all text-left",
        isSelected 
          ? "bg-slate-50 border-slate-200 shadow-sm" 
          : "hover:bg-slate-50 border-transparent",
        className
      )}
    >
      <div className="w-10 h-10 rounded-none bg-slate-100 flex items-center justify-center text-slate-500 font-bold text-[10px] overflow-hidden border border-slate-200">
        {student.photo_url ? (
          <img src={student.photo_url} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
        ) : (
          student.registration_number?.substring(0, 6) || '---'
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-bold text-slate-900 truncate tracking-tight">{student.name}</p>
        <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
          <span className={cn(
            "text-[9px] font-bold px-1.5 py-0.5 rounded-none uppercase tracking-wider",
            student.status === 'Inativo' ? "bg-red-50 text-red-700 border border-red-100" : "bg-emerald-50 text-emerald-700 border border-emerald-100"
          )}>
            {student.status || 'Ativo'}
          </span>
          {unitName && (
            <span className="text-[8.5px] font-bold px-1.5 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 uppercase tracking-wider">
              {unitName}
            </span>
          )}
          {isUnallocated && (
            <span className="text-[8.5px] font-black px-1.5 py-0.5 bg-amber-100 text-amber-900 border border-amber-300 uppercase tracking-wider">
              Sem Turma
            </span>
          )}
          {Boolean(parallelClassesCount && parallelClassesCount > 1) && (
            <span className="text-[8.5px] font-black px-1.5 py-0.5 bg-amber-100 text-amber-950 border border-amber-400 uppercase tracking-wider flex items-center gap-1 shadow-2xs" title={`Matriculado em ${parallelClassesCount} turmas simultâneas`}>
              <Layers size={10} className="text-amber-700 shrink-0" />
              {parallelClassesCount} Cursos
            </span>
          )}
          <span className="text-[10px] font-mono font-bold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">{formatRegistrationNumber(student.registration_number)}</span>
        </div>
      </div>
    </button>
  );
});

// Masking helpers
const maskCPF = (value: string) => {
  return value
    .replace(/\D/g, '')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})/, '$1-$2')
    .replace(/(-\d{2})\d+?$/, '$1');
};

const maskCEP = (value: string) => {
  return value.replace(/\D/g, '').replace(/(\d{5})(\d{3})/, '$1-$2').substring(0, 9);
};

const getYearFromRegistration = (reg: string | undefined): string => {
  if (!reg) return '';
  if (reg.includes('/')) return reg.split('/')[1];
  if (reg.length === 10) return reg.substring(6);
  return '';
};

const generateNextRegistrationNumber = (students: Student[]) => {
  const currentYear = new Date().getFullYear();
  const yearStr = String(currentYear);
  
  // Filter students from the current year
  const yearStudents = students.filter(s => {
    const year = getYearFromRegistration(s.registration_number);
    return year === yearStr;
  });
  
  let nextNum = 1;
  if (yearStudents.length > 0) {
    const numbers = yearStudents.map(s => {
      const reg = s.registration_number || '';
      let numPart = '0';
      if (reg.includes('/')) {
        numPart = reg.split('/')[0];
      } else if (reg.length === 10) {
        numPart = reg.substring(0, 6);
      } else {
        numPart = reg;
      }
      return parseInt(numPart.replace(/\D/g, '')) || 0;
    });
    nextNum = Math.max(...numbers) + 1;
  }
  
  return `${String(nextNum).padStart(6, '0')}${yearStr}`;
};

// Helper to format date from YYYY-MM-DD or ISO to DD/MM/YYYY
const INITIAL_STUDENT_STATE: Partial<Student> = {
  name: '',
  registration_number: '',
  status: 'Ativo',
  class_id: '',
  email: '',
  phone_mobile: '',
  phone_mobile_is_whatsapp: false,
  phone_residential: '',
  cpf: '',
  rg: '',
  birth_date: '',
  address_street: '',
  address_number: '',
  address_complement: '',
  address_neighborhood: '',
  address_city: 'Guarulhos',
  address_state: 'SP',
  address_zip: '',
  parish: '',
  forania: '',
  course: '',
  pastoral_participates: '',
  start_date: '',
  photo_url: '',
  unit_id: 'matriz'
};

export function Students() {
  const navigate = useNavigate();
  const location = useLocation();
  const { activeUnits, hasMultipleUnits, selectedUnitId: globalUnitId, getUnitName } = useUnits();
  const [returnOrigin, setReturnOrigin] = useState<{
    path: string;
    classId?: string;
    reopenModal?: boolean;
    reopenUnallocatedModal?: boolean;
    sourceTitle?: string;
    courseId?: string;
  } | null>(() => {
    return (location.state as any)?.returnTo || null;
  });
  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [coursesList, setCoursesList] = useState<Course[]>([]);
  const [parishesList, setParishesList] = useState<any[]>([]);
  const [forariesList, setForariesList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'Ativo' | 'Inativo' | 'Todos'>('Ativo');
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [hoverShowList, setHoverShowList] = useState(false);
  
  const [formData, setFormData] = useState<Partial<Student>>(INITIAL_STUDENT_STATE);
  const [selectedYear, setSelectedYear] = useState<string>('all');
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [sortBy, setSortBy] = useState<'name' | 'registration'>('registration');
  const [showWebcam, setShowWebcam] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [notification, setNotification] = useState<{type: 'success' | 'error', message: string} | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [studentEnrollments, setStudentEnrollments] = useState<Enrollment[]>([]);
  const [allEnrollments, setAllEnrollments] = useState<Enrollment[]>([]);
  const [enrollClassId, setEnrollClassId] = useState('');
  const [quickAssignClassId, setQuickAssignClassId] = useState('');
  const [isAssigningClass, setIsAssigningClass] = useState(false);
  const [institution, setInstitution] = useState<any>(null);
  const [academicSettingsList, setAcademicSettingsList] = useState<any[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<any[]>([]);

  // Estados para Amarração da Taxa de Matrícula / Inscrição
  const [studentContributions, setStudentContributions] = useState<Contribution[]>([]);
  const [financialSettings, setFinancialSettings] = useState<any>(null);

  const [enrollmentFeeStatus, setEnrollmentFeeStatus] = useState<'paid' | 'pending' | 'exempt'>('paid');
  const [enrollmentFeeAmount, setEnrollmentFeeAmount] = useState<number>(100);
  const [enrollmentFeeAmountStr, setEnrollmentFeeAmountStr] = useState<string>('100,00');
  const [enrollmentFeePaymentMethod, setEnrollmentFeePaymentMethod] = useState<'Dinheiro' | 'PIX' | 'Cartão'>('Dinheiro');
  const [enrollmentFeePaymentDate, setEnrollmentFeePaymentDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [enrollmentFeeObservations, setEnrollmentFeeObservations] = useState<string>('');
  const [enrollmentFeeExemptionReason, setEnrollmentFeeExemptionReason] = useState<string>('');

  const handleFeeAmountChange = (val: string) => {
    setEnrollmentFeeAmountStr(val);
    const clean = val.replace(/[^\d.,]/g, '');
    let numStr = clean;
    if (numStr.includes(',')) {
      numStr = numStr.replace(/\./g, '').replace(',', '.');
    }
    const num = parseFloat(numStr);
    if (!isNaN(num)) {
      setEnrollmentFeeAmount(num);
    }
  };

  const handleFeeAmountBlur = () => {
    let clean = enrollmentFeeAmountStr.replace(/[^\d.,]/g, '');
    if (!clean) {
      setEnrollmentFeeAmountStr('0,00');
      setEnrollmentFeeAmount(0);
      return;
    }
    let numStr = clean;
    if (numStr.includes(',')) {
      numStr = numStr.replace(/\./g, '').replace(',', '.');
    }
    const num = parseFloat(numStr);
    if (!isNaN(num)) {
      setEnrollmentFeeAmount(num);
      setEnrollmentFeeAmountStr(num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    }
  };

  // Modal para confirmação de matrícula em turma adicional com amarração da taxa
  const [enrollModalClass, setEnrollModalClass] = useState<Class | null>(null);
  const [enrollModalFeeStatus, setEnrollModalFeeStatus] = useState<'paid' | 'pending' | 'exempt'>('exempt');
  const [enrollModalFeeAmount, setEnrollModalFeeAmount] = useState<number>(100);
  const [enrollModalPaymentMethod, setEnrollModalPaymentMethod] = useState<string>('PIX');
  const [enrollModalPaymentDate, setEnrollModalPaymentDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [enrollModalExemptionReason, setEnrollModalExemptionReason] = useState<string>('Segunda turma / Curso adicional');

  // Modal de Liquidação Rápida da Taxa de Matrícula Pendente
  const [liquidateFeeModalData, setLiquidateFeeModalData] = useState<{
    student: Student;
    classItem?: Class;
    enrollment?: Enrollment;
    amount: number;
    year: number;
  } | null>(null);
  const [liquidatePaymentMethod, setLiquidatePaymentMethod] = useState<string>('PIX');
  const [liquidatePaymentDate, setLiquidatePaymentDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [liquidateObservations, setLiquidateObservations] = useState<string>('');
  const [isLiquidating, setIsLiquidating] = useState<boolean>(false);

  // Modal de Comprovante de Matrícula e Recibo de Taxa
  const [receiptModalData, setReceiptModalData] = useState<{
    student: Student;
    classItem?: Class;
    enrollment?: Enrollment;
    feeAmount: number;
    feeStatus: 'paid' | 'pending' | 'exempt';
    paymentMethod?: string;
    paymentDate?: string;
    observations?: string;
    isNew?: boolean;
  } | null>(null);

  useEffect(() => {
    financialConfigService.getSettings().then(setFinancialSettings).catch(() => {});
  }, []);

  const fetchStudentContributions = useCallback(async (studentId: string) => {
    if (!studentId) {
      setStudentContributions([]);
      return;
    }
    try {
      const data = await fetchQuery('contributions', 'student_id', '==', studentId);
      setStudentContributions(data || []);
    } catch (e) {
      console.warn('Erro ao carregar contribuições do aluno:', e);
      setStudentContributions([]);
    }
  }, []);

  useEffect(() => {
    if (selectedStudent?.id) {
      fetchStudentContributions(selectedStudent.id);
    } else {
      setStudentContributions([]);
    }
  }, [selectedStudent?.id, fetchStudentContributions]);

  // Taxa de Matrícula paga existente para o ano da turma do aluno
  const paidEnrollmentFeeContrib = useMemo(() => {
    if (!selectedStudent?.id || !studentContributions.length) return null;
    const targetCls = classes.find(c => c.id === (formData.class_id || selectedStudent.class_id));
    const targetYear = targetCls ? getClassStartYear(targetCls) : (targetCls?.start_year || new Date().getFullYear());
    return studentContributions.find(c => {
      const isMonthZero = Number(c.reference_month) === 0;
      const yrMatch = !c.reference_year || Number(c.reference_year) === targetYear;
      return isMonthZero && yrMatch;
    }) || null;
  }, [selectedStudent, studentContributions, classes, formData.class_id]);

  // Atualiza o valor sugerido da taxa sempre que a turma é alterada no formulário
  useEffect(() => {
    if (formData.class_id) {
      const targetCls = classes.find(c => c.id === formData.class_id);
      const targetYear = targetCls ? getClassStartYear(targetCls) : (Number(targetCls?.start_year) || new Date().getFullYear());
      const resolved = financialConfigService.resolveFee({
        classId: formData.class_id,
        studentClass: targetCls,
        year: Number(targetYear) || new Date().getFullYear()
      }, financialSettings);
      const fee = resolved || 100;
      setEnrollmentFeeAmount(fee);
      setEnrollmentFeeAmountStr(fee.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    }
  }, [formData.class_id, classes, financialSettings]);

  const getScheduleStartDateForClass = useCallback((targetClass: any) => {
    return getClassStartDateFromSchedule(targetClass, academicSettingsList, calendarEvents);
  }, [academicSettingsList, calendarEvents]);

  const admissionNorms = useMemo(() => {
    if (institution?.admission_norms && institution.admission_norms.trim()) {
      return institution.admission_norms
        .split('\n')
        .map((line: string) => line.trim())
        .filter((line: string) => line.length > 0);
    }
    return [
      "O(a) aluno(a) concorda em priorizar a frequência no curso escolhido.",
      "Frequência mínima de 75% das aulas para aprovação.",
      "Nota mínima exigida para promoção é de 5,0 (cinco) por disciplina.",
      "Compromisso em manter em dia as contribuições estabelecidas."
    ];
  }, [institution?.admission_norms]);
  const webcamRef = useRef<Webcam>(null);
  const { user, profile, refreshProfile, canDelete } = useAuth();

  // Cálculo em tempo real do tamanho válido e tipo de numeração do RG
  const rgValidation = useMemo(() => {
    return calculateRGValidation(formData.rg || '');
  }, [formData.rg]);

  // Validação em tempo real do CPF
  const cpfValidation = useMemo(() => {
    const rawDigits = (formData.cpf || '').replace(/\D/g, '');
    if (!rawDigits) {
      return { rawLength: 0, isValid: true, isIncomplete: false, message: '' };
    }
    if (rawDigits.length < 11) {
      return { rawLength: rawDigits.length, isValid: false, isIncomplete: true, message: `Incompleto (${rawDigits.length}/11 dígitos)` };
    }
    const valid = isValidCPF(formData.cpf);
    return {
      rawLength: 11,
      isValid: valid,
      isIncomplete: false,
      message: valid ? 'CPF válido' : 'Dígitos verificadores inconsistentes'
    };
  }, [formData.cpf]);

  // Cálculo da idade em tempo real a partir da data de nascimento
  const calculatedAge = useMemo(() => {
    return calculateAge(formData.birth_date);
  }, [formData.birth_date]);

  // Validação em tempo real da data de nascimento
  const birthDateValidation = useMemo(() => {
    if (!formData.birth_date) {
      return { isValid: true, isFuture: false, isAncient: false, message: '' };
    }
    const cleanDate = formData.birth_date.split('T')[0];
    const todayStr = new Date().toISOString().split('T')[0];
    if (cleanDate > todayStr) {
      return { isValid: false, isFuture: true, isAncient: false, message: 'Data futura incompatível' };
    }
    const year = parseInt(cleanDate.split('-')[0], 10);
    if (year < 1900 || (calculatedAge !== null && calculatedAge > 120)) {
      return { isValid: false, isFuture: false, isAncient: true, message: 'Ano incompatível (> 120 anos)' };
    }
    return { isValid: true, isFuture: false, isAncient: false, message: '' };
  }, [formData.birth_date, calculatedAge]);

  // Validação em tempo real da taxa de matrícula
  const isFeeAmountIncompatible = useMemo(() => {
    if (enrollmentFeeStatus === 'exempt') return false;
    return !enrollmentFeeAmount || isNaN(enrollmentFeeAmount) || enrollmentFeeAmount <= 0;
  }, [enrollmentFeeStatus, enrollmentFeeAmount]);

  const isFeeDateInFuture = useMemo(() => {
    if (enrollmentFeeStatus !== 'paid' || !enrollmentFeePaymentDate) return false;
    const todayStr = new Date().toISOString().split('T')[0];
    return enrollmentFeePaymentDate > todayStr;
  }, [enrollmentFeeStatus, enrollmentFeePaymentDate]);

  const isStudentBirthdayToday = useMemo(() => {
    return isBirthdayToday(formData.birth_date);
  }, [formData.birth_date]);

  // Turma atualmente selecionada na ficha
  const currentTargetClass = useMemo(() => {
    return classes.find(c => c.id === formData.class_id);
  }, [classes, formData.class_id]);

  // Curso informativo vinculado automaticamente à turma ou ao cadastro
  const effectiveCourseName = useMemo(() => {
    if (currentTargetClass) {
      return currentTargetClass.course || detectCourseFromClass(currentTargetClass, coursesList) || formData.course || '';
    }
    return formData.course || '';
  }, [currentTargetClass, coursesList, formData.course]);

  // Data de início informativa pré-definida no cadastro ou cronograma da turma
  const effectiveClassStartDate = useMemo(() => {
    if (currentTargetClass) {
      const cronoDate = getScheduleStartDateForClass(currentTargetClass);
      return cronoDate || currentTargetClass.start_date || formData.start_date || '';
    }
    return formData.start_date || '';
  }, [currentTargetClass, getScheduleStartDateForClass, formData.start_date]);

  // Estados e busca automática de endereço via CEP (ViaCEP)
  const [loadingCep, setLoadingCep] = useState(false);
  const [cepSuccess, setCepSuccess] = useState(false);

  const handleCepChange = async (val: string) => {
    const formatted = maskCEP(val);
    setFormData(prev => ({ ...prev, address_zip: formatted }));

    const cleanDigits = formatted.replace(/\D/g, '');
    if (cleanDigits.length === 8) {
      try {
        setLoadingCep(true);
        const data = await fetchAddressByCEP(cleanDigits);
        if (data && !data.erro) {
          setFormData(prev => ({
            ...prev,
            address_street: data.logradouro || prev.address_street || '',
            address_complement: data.complemento || prev.address_complement || '',
            address_neighborhood: data.bairro || prev.address_neighborhood || '',
            address_city: data.localidade || prev.address_city || '',
            address_state: data.uf || prev.address_state || ''
          }));
          setCepSuccess(true);
          setTimeout(() => setCepSuccess(false), 4000);
        }
      } catch (err) {
        console.warn('Erro ao consultar ViaCEP:', err);
      } finally {
        setLoadingCep(false);
      }
    }
  };

  // Automatic list collapsing and showing is based on active selected student state.


  const fetchStudents = useCallback(async () => {
    setLoading(true);
    try {
      const [data, enrollmentsData, classesData, coursesData, dbSettings, calendarEventsData] = await Promise.all([
        fetchAll('students', '*', 'registration_number', true),
        fetchAll('enrollments').catch(() => []),
        fetchAll('classes', '*', 'name').catch(() => []),
        fetchAll('courses').catch(() => []),
        fetchAll('academic_settings').catch(() => []),
        fetchAll('calendar_events').catch(() => [])
      ]);
      
      const validClassIds = new Set((classesData || []).map((c: any) => c.id));
      const classesMap = new Map<string, any>((classesData || []).map((c: any) => [c.id, c]));
      const currentAllEnrs = (enrollmentsData || []).filter((e: any) => e.class_id && validClassIds.has(e.class_id));
      setAllEnrollments(currentAllEnrs);
      if (coursesData && coursesData.length > 0) {
        setCoursesList(coursesData);
      }

      // Combine academic settings with local storage fallbacks
      let settingsList: any[] = [];
      if (dbSettings && dbSettings.length > 0) {
        settingsList = [...dbSettings];
      }
      try {
        const currentStored = localStorage.getItem('academic_settings_current');
        if (currentStored) {
          const parsed = JSON.parse(currentStored);
          if (!settingsList.some(s => s.id === 'current')) {
            settingsList.push({ id: 'current', ...parsed });
          } else {
            settingsList = settingsList.map(s => s.id === 'current' ? { ...parsed, ...s } : s);
          }
        }
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith('academic_settings_') && key !== 'academic_settings_current') {
            const classId = key.replace('academic_settings_', '');
            const val = localStorage.getItem(key);
            if (val) {
              const parsed = JSON.parse(val);
              if (!settingsList.some(s => s.id === classId)) {
                settingsList.push({ id: classId, ...parsed });
              } else {
                settingsList = settingsList.map(s => s.id === classId ? { ...parsed, ...s } : s);
              }
            }
          }
        }
      } catch (e) {}
      setAcademicSettingsList(settingsList);
      setCalendarEvents(calendarEventsData || []);

      // Merge & normalize students who have active enrollments, invalid class_id or missing course
      const normalizedStudents = (data || []).map((s: Student) => {
        const hasValidDirectClass = s.class_id && validClassIds.has(s.class_id);
        const effectiveClassId = hasValidDirectClass ? s.class_id : (
          currentAllEnrs.find((e: any) => e.student_id === s.id && (e.status || 'Ativo') === 'Ativo')?.class_id || ''
        );
        const targetClass = effectiveClassId ? classesMap.get(effectiveClassId) : null;
        
        let effectiveCourse = (s.course || '').trim();
        if (!effectiveCourse || effectiveCourse === 'Identificar Curso...' || effectiveCourse === 'null' || effectiveCourse === 'undefined' || effectiveCourse === 'Sem Curso Informado') {
          effectiveCourse = targetClass ? detectCourseFromClass(targetClass, coursesData || []) : '';
        }

        const schedDate = targetClass ? getClassStartDateFromSchedule(targetClass, settingsList, calendarEventsData || []) : '';
        const startDate = s.start_date || schedDate || targetClass?.start_date || '';

        let resolvedUnitId = s.unit_id;
        if (s.observations) {
          const match = s.observations.match(/\[UNIT_ID:([^\]]+)\]/);
          if (match && match[1]) {
            const parsed = match[1].trim();
            if (parsed && (!resolvedUnitId || resolvedUnitId === 'matriz' || parsed !== 'matriz')) {
              resolvedUnitId = parsed;
            }
          }
        }
        if ((!resolvedUnitId || resolvedUnitId === 'matriz') && targetClass?.unit_id && targetClass.unit_id !== 'matriz') {
          resolvedUnitId = targetClass.unit_id;
        }

        return {
          ...s,
          unit_id: resolvedUnitId || s.unit_id,
          class_id: effectiveClassId,
          course: effectiveCourse,
          start_date: startDate
        };
      });

      setStudents(normalizedStudents);
    } catch (error) {
      console.error('Error fetching students:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchCourses = async () => {
    try {
      const data = await fetchAll('courses');
      if (data && data.length > 0) setCoursesList(data);
    } catch (e) {
      console.error('Error fetching courses:', e);
    }
  };

  useEffect(() => {
    fetchStudents();
    fetchClasses();
    fetchCourses();
    fetchParishes();
    fetchForaries();
    fetchAllEnrollments();
    fetchInstitution();
    // Run background integrity check to clean historical orphan enrollments and identify courses
    cleanOrphanEnrollments().catch(() => {});
    autoIdentifyAllStudentsCourses().then(res => {
      if (res.updatedStudents > 0) {
        fetchStudents();
      }
    }).catch(() => {});
  }, [fetchStudents]);

  const fetchInstitution = async () => {
    try {
      const data = await getInstitutionSettings();
      if (data) setInstitution(data);
    } catch (error) {
      console.error('Error fetching institution:', error);
    }
  };

  const fetchAllEnrollments = async () => {
    try {
      const [data, clss] = await Promise.all([
        fetchAll('enrollments'),
        fetchAll('classes').catch(() => [])
      ]);
      const validClassIds = new Set((clss || []).map((c: any) => c.id));
      const validEnrs = (data || []).filter((e: any) => e.class_id && validClassIds.has(e.class_id));
      setAllEnrollments(validEnrs);
    } catch (error: any) {
      if (error?.code === 'PGRST204' || error?.message?.includes('schema cache')) {
        setAllEnrollments([]);
        return;
      }
      console.error('Error fetching all enrollments:', error);
    }
  };

  const fetchEnrollments = async (studentId: string) => {
    try {
      const [data, clss] = await Promise.all([
        fetchQuery('enrollments', 'student_id', '==', studentId),
        classes.length > 0 ? Promise.resolve(classes) : fetchAll('classes').catch(() => [])
      ]);
      const validClassIds = new Set((clss || []).map((c: any) => c.id));
      const rawEnrs = data || [];
      const validEnrs = rawEnrs.filter((e: any) => e.class_id && validClassIds.has(e.class_id));
      
      // Asynchronous background purge of orphan enrollments for this student
      const orphanEnrs = rawEnrs.filter((e: any) => !e.class_id || !validClassIds.has(e.class_id));
      if (orphanEnrs.length > 0) {
        const orphanIds = orphanEnrs.map((e: any) => e.id);
        deleteBatch('enrollments', orphanIds).catch(err => console.warn('Erro ao limpar matrículas órfãs:', err));
      }

      setStudentEnrollments(validEnrs);
      return validEnrs;
    } catch (error: any) {
      if (error?.code === 'PGRST204' || error?.message?.includes('schema cache')) {
        console.warn('Tabela enrollments ainda não criada no Supabase.');
        setStudentEnrollments([]);
        return [];
      }
      console.error('Error fetching enrollments:', error);
      return [];
    }
  };

  const handleSelectStudent = useCallback((student: Student) => {
    const validClassIds = new Set(classes.map(c => c.id));
    // 1. Check if student already has a direct VALID class_id
    let effectiveClassId = (student.class_id && validClassIds.has(student.class_id)) ? student.class_id : '';

    // 2. If not, check if student has an active enrollment in allEnrollments for a valid class
    if (!effectiveClassId) {
      const activeEnr = allEnrollments.find(e => e.student_id === student.id && (e.status || 'Ativo') === 'Ativo' && validClassIds.has(e.class_id));
      if (activeEnr) {
        effectiveClassId = activeEnr.class_id;
      }
    }

    const targetClass = classes.find(c => c.id === effectiveClassId);
    let detectedCourse = targetClass ? detectCourseFromClass(targetClass, coursesList) : (student.course || '');
    if (!detectedCourse && student.course) {
      const match = coursesList.find(c => 
        c.name.toLowerCase() === student.course.toLowerCase() || 
        (c.code && c.code.toLowerCase() === student.course.toLowerCase()) ||
        c.name.toLowerCase().includes(student.course.toLowerCase()) ||
        student.course.toLowerCase().includes(c.name.toLowerCase())
      );
      detectedCourse = match ? match.name : student.course;
    }
    const cronoStartDate = targetClass ? getScheduleStartDateForClass(targetClass) : '';
    const startDate = student.start_date || cronoStartDate || targetClass?.start_date || '';
    const studentUnitId = student.unit_id || targetClass?.unit_id || 'matriz';

    const enrichedStudent: Student = {
      ...student,
      class_id: effectiveClassId,
      course: detectedCourse,
      start_date: startDate,
      unit_id: studentUnitId
    };

    setSelectedStudent(enrichedStudent);
    setFormData({
      ...INITIAL_STUDENT_STATE,
      ...student,
      // Ensure specific fields aren't null/undefined from DB
      name: student.name || '',
      registration_number: student.registration_number || '',
      status: student.status || 'Ativo',
      class_id: effectiveClassId,
      course: detectedCourse,
      start_date: startDate,
      unit_id: studentUnitId,
      email: student.email || '',
      phone_mobile: student.phone_mobile || '',
      phone_residential: student.phone_residential || '',
      cpf: student.cpf || '',
      rg: student.rg || '',
      birth_date: student.birth_date,
      address_street: student.address_street || '',
      address_number: student.address_number || '',
      address_complement: student.address_complement || '',
      address_neighborhood: student.address_neighborhood || '',
      address_city: student.address_city || 'Guarulhos',
      address_state: student.address_state || 'SP',
      address_zip: student.address_zip || '',
      parish: student.parish || '',
      forania: student.forania || '',
      pastoral_participates: student.pastoral_participates || '',
      photo_url: student.photo_url || ''
    });
    setIsEditing(false);
    setHoverShowList(false);

    // Fetch individual enrollments and perform safe backfill if primary class was missing in DB
    fetchEnrollments(student.id).then((enrs) => {
      if (student.status === 'Inativo') return;
      if (!effectiveClassId && enrs && enrs.length > 0) {
        const found = enrs.find((e: any) => (e.status || 'Ativo') === 'Ativo') || enrs[0];
        if (found?.class_id && validClassIds.has(found.class_id)) {
          const cls = classes.find(c => c.id === found.class_id);
          const crs = student.course || (cls ? detectCourseFromClass(cls, coursesList) : '');
          const sDate = student.start_date || cls?.start_date || '';
          setFormData(prev => ({
            ...prev,
            class_id: found.class_id,
            course: crs,
            start_date: sDate
          }));
          setSelectedStudent(prev => prev ? ({
            ...prev,
            class_id: found.class_id,
            course: crs,
            start_date: sDate
          }) : null);
          // Safe background backfill in database
          saveData('students', student.id, {
            class_id: found.class_id,
            ...(crs ? { course: crs } : {}),
            ...(sDate ? { start_date: sDate } : {})
          }).catch(e => console.warn('Background class_id sync error:', e));
        }
      } else if (effectiveClassId && (!student.class_id || !validClassIds.has(student.class_id))) {
        // Safe background backfill in database
        saveData('students', student.id, {
          class_id: effectiveClassId,
          ...(detectedCourse ? { course: detectedCourse } : {}),
          ...(startDate ? { start_date: startDate } : {})
        }).catch(e => console.warn('Background class_id sync error:', e));
      } else if (detectedCourse && (!student.course || student.course === 'Identificar Curso...' || student.course === 'null' || student.course === 'undefined')) {
        // Background backfill missing course
        saveData('students', student.id, {
          course: detectedCourse
        }).catch(e => console.warn('Background course sync error:', e));
      }
    });
  }, [allEnrollments, classes, coursesList]);

  const handleNew = useCallback(() => {
    setSelectedStudent(null);
    const nextReg = generateNextRegistrationNumber(students);
    const defaultUnitId = globalUnitId !== 'all' ? globalUnitId : (activeUnits[0]?.id || 'matriz');
    setFormData({
      ...INITIAL_STUDENT_STATE,
      name: '',
      status: 'Ativo',
      registration_number: nextReg,
      unit_id: defaultUnitId
    });
    setIsEditing(true);
    setHoverShowList(false);
    // Reset dos estados da Taxa de Matrícula para o novo aluno
    const fee = financialSettings?.enrollment_fee || 100;
    setEnrollmentFeeStatus('paid');
    setEnrollmentFeeAmount(fee);
    setEnrollmentFeeAmountStr(fee.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    setEnrollmentFeePaymentMethod('Dinheiro');
    setEnrollmentFeePaymentDate(new Date().toISOString().split('T')[0]);
    setEnrollmentFeeObservations('');
    setEnrollmentFeeExemptionReason('');
  }, [students, globalUnitId, activeUnits, financialSettings]);

  // Fecha a ficha e retorna para a tela / modal de origem se veio de outro módulo
  const handleCloseFicha = useCallback(() => {
    if (returnOrigin) {
      navigate(returnOrigin.path, {
        state: {
          classId: returnOrigin.classId,
          reopenModal: returnOrigin.reopenModal,
          reopenUnallocatedModal: returnOrigin.reopenUnallocatedModal,
          courseId: returnOrigin.courseId
        }
      });
      return;
    }
    setSelectedStudent(null);
    setIsEditing(false);
  }, [returnOrigin, navigate]);

  // Handle auto-selection from Dashboard deep links
  useEffect(() => {
    const isNew = (location.state as any)?.action === 'new' || (location.state as any)?.isNew;
    if (isNew) {
      handleNew();
      window.history.replaceState({}, document.title);
      return;
    }

    const returnTo = (location.state as any)?.returnTo;
    if (returnTo) {
      setReturnOrigin(returnTo);
    }

    const classId = (location.state as any)?.classId;
    const filterUnallocated = (location.state as any)?.filterUnallocated;
    if (filterUnallocated || classId === 'unallocated') {
      setSelectedClassId('unallocated');
    } else if (classId) {
      setSelectedClassId(classId);
    }

    const studentId = (location.state as any)?.studentId;
    if (studentId && students.length > 0) {
      const student = students.find(s => s.id === studentId);
      if (student) {
        if (student.status === 'Inativo') {
          setStatusFilter('Todos');
        }
        handleSelectStudent(student);
        // Clear state to avoid re-selecting if the user navigates away and back
        window.history.replaceState({}, document.title);
      }
    }
  }, [students, location.state, handleNew, handleSelectStudent]);

  // Auto-fill student start date and course based on selected class
  useEffect(() => {
    if (isEditing && formData.class_id) {
      const targetClass = classes.find(c => c.id === formData.class_id);
      
      if (targetClass) {
        const updates: any = {};
        
        // Auto-fill date from cronograma
        const cronoStartDate = getScheduleStartDateForClass(targetClass);
        const resolvedStartDate = cronoStartDate || targetClass.start_date || '';
        if (resolvedStartDate && formData.start_date !== resolvedStartDate) {
          updates.start_date = resolvedStartDate;
        }

        // Auto-detect course
        const detectedCourse = detectCourseFromClass(targetClass, coursesList);
        if (detectedCourse && formData.course !== detectedCourse) {
          updates.course = detectedCourse;
        }

        if (Object.keys(updates).length > 0) {
          setFormData(prev => ({ ...prev, ...updates }));
        }

        // Auto-sync class start_date if missing or divergent from cronograma
        if (cronoStartDate && targetClass.start_date !== cronoStartDate) {
          saveData('classes', targetClass.id, { ...targetClass, start_date: cronoStartDate })
            .then(() => {
              setClasses(prev => prev.map(c => c.id === targetClass.id ? { ...c, start_date: cronoStartDate } : c));
            })
            .catch(e => console.warn('Could not sync class start_date:', e));
        }
      }
    }
  }, [formData.class_id, classes, coursesList, isEditing, getScheduleStartDateForClass]);

  const fetchClasses = async () => {
    try {
      const data = await fetchAll('classes', '*', 'name', true);
      const normalized = (data || []).map((cls: any) => {
        let course = cls.course || '';
        if (cls.observations) {
          const match = String(cls.observations).match(/\[METADATA:(\{[\s\S]*?\})\]/);
          if (match && match[1]) {
            try {
              const meta = JSON.parse(match[1]);
              if (meta.course && !course) course = meta.course;
            } catch (e) {}
          }
        }
        if (!course) {
          course = detectCourseFromClass(cls);
        }
        return {
          ...cls,
          course: course || detectCourseFromClass(cls)
        };
      });

      const sorted = normalized.sort((a: any, b: any) => {
        const extract = (s: string) => {
          const match = s.match(/\d{4}/);
          const yr = match ? parseInt(match[0]) : 0;
          const name = s.replace(/\d{4}/, '').trim().toLowerCase();
          return { yr, name };
        };
        const infoA = extract(a.name || '');
        const infoB = extract(b.name || '');
        if (infoA.name !== infoB.name) return infoA.name.localeCompare(infoB.name);
        return infoB.yr - infoA.yr;
      });
      setClasses(sorted);
    } catch (error) {
      console.error('Error fetching classes:', error);
    }
  };

  const fetchParishes = async () => {
    try {
      const data = await fetchAll('parishes', '*', 'name');
      setParishesList(data || []);
    } catch (error) {
      console.error('Error fetching parishes:', error);
    }
  };

  const fetchForaries = async () => {
    try {
      const data = await fetchAll('foraries', '*', 'name');
      setForariesList(data || []);
    } catch (error) {
      console.error('Error fetching foraries:', error);
    }
  };

  const handleAddEnrollment = async (classId: string) => {
    if (!selectedStudent || !classId) return;
    
    // Check if already enrolled
    if (studentEnrollments.some(e => e.class_id === classId && (e.status || 'Ativo') === 'Ativo')) {
      setNotification({ type: 'error', message: 'Aluno já está matriculado nesta turma' });
      setTimeout(() => setNotification(null), 3000);
      return;
    }

    const studentUnitId = formData.unit_id || selectedStudent.unit_id || (globalUnitId !== 'all' ? globalUnitId : 'matriz');
    const newEnrollment: Partial<Enrollment> = {
      student_id: selectedStudent.id,
      class_id: classId,
      unit_id: studentUnitId,
      status: 'Ativo',
      enrollment_date: new Date().toISOString().split('T')[0],
      created_at: new Date().toISOString()
    };

    try {
      await saveData('enrollments', undefined, newEnrollment);

      // If student has no primary class, also set this as their primary class
      if (!formData.class_id && !selectedStudent.class_id) {
        const targetClass = classes.find(c => c.id === classId);
        const detectedCourse = selectedStudent.course || (targetClass ? detectCourseFromClass(targetClass, coursesList) : '');
        const cronoStartDate = targetClass ? getScheduleStartDateForClass(targetClass) : '';
        const startDate = selectedStudent.start_date || cronoStartDate || targetClass?.start_date || '';

        await saveData('students', selectedStudent.id, {
          ...selectedStudent,
          class_id: classId,
          ...(detectedCourse ? { course: detectedCourse } : {}),
          ...(startDate ? { start_date: startDate } : {})
        });

        if (targetClass && cronoStartDate && targetClass.start_date !== cronoStartDate) {
          saveData('classes', targetClass.id, { ...targetClass, start_date: cronoStartDate })
            .then(() => {
              setClasses(prev => prev.map(c => c.id === targetClass.id ? { ...c, start_date: cronoStartDate } : c));
            })
            .catch(e => console.warn('Could not sync class start_date:', e));
        }

        setFormData(prev => ({
          ...prev,
          class_id: classId,
          course: detectedCourse,
          start_date: startDate
        }));
        setSelectedStudent(prev => prev ? ({
          ...prev,
          class_id: classId,
          course: detectedCourse,
          start_date: startDate
        }) : null);
      }

      setNotification({ type: 'success', message: 'Matrícula realizada com sucesso!' });
      fetchEnrollments(selectedStudent.id);
      fetchAllEnrollments();
      fetchStudents();
    } catch (error: any) {
      setNotification({ type: 'error', message: 'Erro ao matricular: ' + error.message });
    } finally {
      setTimeout(() => setNotification(null), 3000);
    }
  };

  const handleRemoveEnrollment = async (enrollmentId: string) => {
    try {
      const enrToRemove = studentEnrollments.find(e => e.id === enrollmentId);
      await deleteData('enrollments', enrollmentId);

      // If this removed enrollment was the student's primary class_id, re-evaluate primary class
      if (enrToRemove && selectedStudent && selectedStudent.class_id === enrToRemove.class_id) {
        const remaining = studentEnrollments.filter(e => e.id !== enrollmentId && (e.status || 'Ativo') === 'Ativo');
        const nextPrimaryClassId = remaining[0]?.class_id || null;
        const nextClass = nextPrimaryClassId ? classes.find(c => c.id === nextPrimaryClassId) : null;
        const nextCourse = nextClass ? detectCourseFromClass(nextClass, coursesList) : '';

        await saveData('students', selectedStudent.id, {
          class_id: nextPrimaryClassId,
          ...(nextCourse ? { course: nextCourse } : {})
        });

        setFormData(prev => ({
          ...prev,
          class_id: nextPrimaryClassId || '',
          course: nextCourse || prev.course
        }));
        setSelectedStudent(prev => prev ? ({
          ...prev,
          class_id: nextPrimaryClassId || '',
          course: nextCourse || prev.course
        }) : null);
      }

      setNotification({ type: 'success', message: 'Matrícula removida com sucesso!' });
      if (selectedStudent) fetchEnrollments(selectedStudent.id);
      fetchAllEnrollments();
      fetchStudents();
    } catch (error: any) {
      setNotification({ type: 'error', message: 'Erro ao remover matrícula: ' + error.message });
    } finally {
      setTimeout(() => setNotification(null), 3000);
    }
  };

  const handleOpenLiquidateModal = () => {
    if (!selectedStudent) return;
    const targetCls = classes.find(c => c.id === (formData.class_id || selectedStudent.class_id));
    const targetYear = targetCls ? getClassStartYear(targetCls) : (Number(targetCls?.start_year) || new Date().getFullYear());
    const resolved = financialConfigService.resolveFee({
      classId: targetCls?.id,
      studentClass: targetCls,
      year: Number(targetYear) || new Date().getFullYear()
    }, financialSettings);

    setLiquidateFeeModalData({
      student: selectedStudent,
      classItem: targetCls,
      amount: resolved || enrollmentFeeAmount || 100,
      year: Number(targetYear) || new Date().getFullYear()
    });
  };

  const handleConfirmLiquidate = async (data: {
    amount: number;
    paymentMethod: string;
    paymentDate: string;
    observations: string;
  }) => {
    if (!liquidateFeeModalData) return;
    try {
      const newContrib: Partial<Contribution> = {
        student_id: liquidateFeeModalData.student.id,
        reference_month: 0,
        reference_year: Number(liquidateFeeModalData.year) || new Date().getFullYear(),
        amount: Number(data.amount) || 0,
        payment_date: parseDateToDB(data.paymentDate) || new Date().toISOString().split('T')[0],
        payment_method: data.paymentMethod,
        observations: data.observations || 'Quitação da Taxa de Matrícula na secretaria',
        created_at: new Date().toISOString()
      };

      await saveData('contributions', undefined, newContrib);
      await fetchStudentContributions(liquidateFeeModalData.student.id);

      setNotification({ type: 'success', message: 'Taxa de matrícula quitada e registrada com sucesso!' });

      setReceiptModalData({
        student: liquidateFeeModalData.student,
        classItem: liquidateFeeModalData.classItem,
        feeAmount: Number(data.amount) || 0,
        feeStatus: 'paid',
        paymentMethod: data.paymentMethod,
        paymentDate: data.paymentDate,
        observations: data.observations
      });
      setLiquidateFeeModalData(null);
    } catch (err: any) {
      console.error('Erro ao liquidar taxa:', err);
      setNotification({ type: 'error', message: 'Erro ao liquidar taxa: ' + err.message });
    } finally {
      setTimeout(() => setNotification(null), 3000);
    }
  };

  const handleOpenEnrollModal = (classId: string) => {
    if (!selectedStudent || !classId) return;
    const targetClass = classes.find(c => c.id === classId);
    if (!targetClass) return;

    if (studentEnrollments.some(e => e.class_id === classId && (e.status || 'Ativo') === 'Ativo')) {
      setNotification({ type: 'error', message: 'Aluno já está matriculado nesta turma' });
      setTimeout(() => setNotification(null), 3000);
      return;
    }

    const targetYear = getClassStartYear(targetClass) || targetClass.start_year || new Date().getFullYear();
    const resolvedFee = financialConfigService.resolveFee({
      classId: targetClass.id,
      studentClass: targetClass,
      year: targetYear
    }, financialSettings);

    setEnrollModalFeeAmount(resolvedFee || 100);
    setEnrollModalClass(targetClass);
  };

  const handleConfirmEnrollWithFee = async (data: {
    classId: string;
    feeStatus: 'paid' | 'pending' | 'exempt';
    feeAmount: number;
    paymentMethod: string;
    paymentDate: string;
    observations: string;
    exemptionReason: string;
  }) => {
    if (!selectedStudent || !data.classId) return;
    if (data.feeStatus === 'paid') {
      const numAmount = Number(data.feeAmount);
      if (isNaN(numAmount) || numAmount <= 0) {
        setNotification({
          type: 'error',
          message: 'Valor incompatível: O valor da taxa de matrícula para pagamento imediato deve ser maior que zero (R$ 0,00). O sistema não registrará valores incompatíveis.'
        });
        return;
      }
    }
    const targetClass = classes.find(c => c.id === data.classId);
    const studentUnitId = formData.unit_id || selectedStudent.unit_id || (globalUnitId !== 'all' ? globalUnitId : 'matriz');

    const newEnrollment: Partial<Enrollment> = {
      student_id: selectedStudent.id,
      class_id: data.classId,
      unit_id: studentUnitId,
      status: 'Ativo',
      enrollment_date: new Date().toISOString().split('T')[0],
      created_at: new Date().toISOString()
    };

    try {
      await saveData('enrollments', undefined, newEnrollment);

      if (data.feeStatus === 'paid') {
        const targetYear = targetClass ? getClassStartYear(targetClass) : (Number(targetClass?.start_year) || new Date().getFullYear());
        const newFeeContrib: Partial<Contribution> = {
          student_id: selectedStudent.id,
          reference_month: 0,
          reference_year: Number(targetYear) || new Date().getFullYear(),
          amount: Number(data.feeAmount) || 0,
          payment_date: parseDateToDB(data.paymentDate) || new Date().toISOString().split('T')[0],
          payment_method: data.paymentMethod,
          observations: data.observations || `Taxa de Matrícula - Turma Adicional: ${targetClass?.name || ''}`,
          created_at: new Date().toISOString()
        };
        await saveData('contributions', undefined, newFeeContrib);
        await fetchStudentContributions(selectedStudent.id);

        setReceiptModalData({
          student: selectedStudent,
          classItem: targetClass,
          feeAmount: Number(data.feeAmount) || 0,
          feeStatus: 'paid',
          paymentMethod: data.paymentMethod,
          paymentDate: data.paymentDate,
          observations: data.observations || `Matrícula em curso adicional: ${targetClass?.name || ''}`
        });
      }

      setNotification({ type: 'success', message: `Aluno matriculado com sucesso na turma "${targetClass?.name || ''}"!` });
      fetchEnrollments(selectedStudent.id);
      fetchAllEnrollments();
      fetchStudents();
      setEnrollModalClass(null);
      setEnrollClassId('');
    } catch (err: any) {
      setNotification({ type: 'error', message: 'Erro ao matricular: ' + err.message });
    } finally {
      setTimeout(() => setNotification(null), 3000);
    }
  };

  const handleQuickAssignClass = async () => {
    if (!selectedStudent?.id || !quickAssignClassId) return;
    setIsAssigningClass(true);
    try {
      const targetClass = classes.find(c => c.id === quickAssignClassId);
      const detectedCourse = targetClass ? detectCourseFromClass(targetClass, coursesList) : selectedStudent.course;
      const cronoStartDate = targetClass ? getScheduleStartDateForClass(targetClass) : '';
      const startDate = cronoStartDate || targetClass?.start_date || selectedStudent.start_date;
      
      // Update student's primary class
      await saveData('students', selectedStudent.id, {
        ...selectedStudent,
        class_id: quickAssignClassId,
        ...(detectedCourse ? { course: detectedCourse } : {}),
        ...(startDate ? { start_date: startDate } : {})
      });

      // Also create enrollment record if not already enrolled
      const alreadyEnrolled = studentEnrollments.some(e => e.class_id === quickAssignClassId);
      if (!alreadyEnrolled) {
        await saveData('enrollments', undefined, {
          student_id: selectedStudent.id,
          class_id: quickAssignClassId,
          status: 'Ativo',
          enrollment_date: startDate || new Date().toISOString().split('T')[0]
        });
      }

      if (targetClass && cronoStartDate && targetClass.start_date !== cronoStartDate) {
        saveData('classes', targetClass.id, { ...targetClass, start_date: cronoStartDate })
          .then(() => {
            setClasses(prev => prev.map(c => c.id === targetClass.id ? { ...c, start_date: cronoStartDate } : c));
          })
          .catch(e => console.warn('Could not sync class start_date:', e));
      }

      // Update local state
      const updated: Student = {
        ...selectedStudent,
        class_id: quickAssignClassId,
        course: detectedCourse || selectedStudent.course,
        start_date: startDate
      };
      setSelectedStudent(updated);
      setFormData(prev => ({ ...prev, ...updated }));
      setStudents(prev => prev.map(s => s.id === selectedStudent.id ? updated : s));
      
      // Refresh enrollments
      fetchEnrollments(selectedStudent.id);
      fetchAllEnrollments();
      
      setNotification({ type: 'success', message: `Aluno vinculado com sucesso à turma "${targetClass?.name || ''}"!` });
      setQuickAssignClassId('');
    } catch (err: any) {
      console.error('Erro ao vincular aluno à turma:', err);
      setNotification({ type: 'error', message: 'Erro ao vincular aluno: ' + (err.message || 'Erro desconhecido') });
    } finally {
      setIsAssigningClass(false);
      setTimeout(() => setNotification(null), 3500);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if ((e.target as HTMLElement).tagName === 'TEXTAREA') return;
      e.preventDefault();
      const target = e.target as HTMLElement;
      const currentTabIndex = target.tabIndex || 0;
      let nextElement: HTMLElement | null = null;
      for (let i = currentTabIndex + 1; i <= currentTabIndex + 15; i++) {
        const el = document.querySelector(`[tabIndex="${i}"]`) as HTMLElement;
        if (el && !el.hasAttribute('disabled') && el.offsetParent !== null) {
          nextElement = el;
          break;
        }
      }
      if (nextElement) {
        nextElement.focus();
      }
    }
  };

  const handleSave = async () => {
    if (uploadingPhoto) {
      setNotification({ type: 'error', message: 'Aguarde o upload da foto terminar' });
      return;
    }

    // 1. Validação do Nome do Aluno (obrigatório e mínimo 3 caracteres)
    const cleanName = (formData.name || '').trim();
    if (!cleanName || cleanName.length < 3) {
      setNotification({ 
        type: 'error', 
        message: 'Valor incompatível: O Nome Completo do aluno é obrigatório (mínimo de 3 caracteres). O sistema não registrará com campos obrigatórios vazios ou inconsistentes.' 
      });
      return;
    }

    // 2. Validação do CPF (se preenchido)
    const cleanCPF = (formData.cpf || '').replace(/\D/g, '');
    if (cleanCPF.length > 0) {
      if (cleanCPF.length < 11) {
        setNotification({ 
          type: 'error', 
          message: `Valor incompatível: O CPF informado está incompleto (${cleanCPF.length} dígitos informados, esperado 11 dígitos). O sistema não registrará valores inconsistentes.` 
        });
        return;
      }
      if (!isValidCPF(formData.cpf)) {
        setNotification({ 
          type: 'error', 
          message: 'Valor incompatível: O CPF informado possui dígitos verificadores inválidos pelo padrão nacional. O sistema não registrará valores incompatíveis.' 
        });
        return;
      }
    }

    // 3. Validação do tamanho válido do RG (se preenchido)
    if (formData.rg) {
      const rgVal = calculateRGValidation(formData.rg);
      if (!rgVal.isValid) {
        setNotification({ 
          type: 'error', 
          message: `Valor incompatível: RG incompleto ou com formato não reconhecido (${rgVal.rawLength} dígitos). Um documento de identidade válido no Brasil possui entre 7 e 11 caracteres (padrões estaduais ou Nova CIN). O sistema não registrará.` 
        });
        return;
      }
    }

    // 4. Validação da Data de Nascimento (se preenchida)
    if (formData.birth_date) {
      const cleanBirth = formData.birth_date.split('T')[0];
      const todayStr = new Date().toISOString().split('T')[0];
      if (cleanBirth > todayStr) {
        setNotification({ 
          type: 'error', 
          message: 'Valor incompatível: A data de nascimento não pode ser uma data futura. O sistema não registrará valores incompatíveis.' 
        });
        return;
      }
      const birthParts = cleanBirth.split('-');
      const birthYear = parseInt(birthParts[0], 10);
      const studentAge = calculateAge(cleanBirth);
      if (birthYear < 1900 || (studentAge !== null && studentAge > 120)) {
        setNotification({ 
          type: 'error', 
          message: `Valor incompatível: A data de nascimento informada resulta em uma idade superior a 120 anos (${studentAge || 'ano inválido'}). O sistema não registrará.` 
        });
        return;
      }
    }

    // 5. Validação de E-mail (se preenchido)
    if (formData.email && formData.email.trim().length > 0) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(formData.email.trim())) {
        setNotification({
          type: 'error',
          message: `Valor incompatível: O e-mail informado ("${formData.email}") possui formato inválido. Corrija o endereço ou deixe o campo em branco.`
        });
        return;
      }
    }

    // 6. Validação de CEP (se preenchido)
    const cleanCEP = (formData.address_zip || '').replace(/\D/g, '');
    if (cleanCEP.length > 0 && cleanCEP.length < 8) {
      setNotification({
        type: 'error',
        message: `Valor incompatível: O CEP informado está incompleto (${cleanCEP.length} dígitos, esperado 8 dígitos). O sistema não registrará.`
      });
      return;
    }

    // 7. Validação de Telefones (se preenchido)
    const cleanMobile = (formData.phone_mobile || '').replace(/\D/g, '');
    if (cleanMobile.length > 0 && cleanMobile.length < 10) {
      setNotification({
        type: 'error',
        message: 'Valor incompatível: O telefone celular está incompleto (deve conter DDD + número com no mínimo 10 dígitos). O sistema não registrará.'
      });
      return;
    }

    // 8. Validação da Taxa de Matrícula (Módulo de Amarração da Taxa ao final da ficha)
    if (formData.class_id && !paidEnrollmentFeeContrib) {
      if (enrollmentFeeStatus === 'paid') {
        const numFee = Number(enrollmentFeeAmount);
        if (isNaN(numFee) || numFee <= 0) {
          setNotification({
            type: 'error',
            message: 'Valor incompatível: Para a opção de pagamento imediato da Taxa de Matrícula ("Pagar Agora"), o valor deve ser maior que zero (R$ 0,00). Caso o aluno seja isento, selecione "Isento". O sistema não registrará valores incompatíveis.'
          });
          return;
        }

        if (numFee > 50000) {
          setNotification({
            type: 'error',
            message: `Valor incompatível: O valor da taxa de matrícula informado (R$ ${numFee.toFixed(2)}) ultrapassa o limite máximo permitido pelo sistema (R$ 50.000,00).`
          });
          return;
        }

        if (!enrollmentFeePaymentDate) {
          setNotification({
            type: 'error',
            message: 'Valor incompatível: Selecione uma data de pagamento válida para a quitação da taxa de matrícula.'
          });
          return;
        }

        const todayStr = new Date().toISOString().split('T')[0];
        if (enrollmentFeePaymentDate > todayStr) {
          setNotification({
            type: 'error',
            message: 'Valor incompatível: A data de quitação da taxa de matrícula não pode ser uma data futura. O sistema não registrará.'
          });
          return;
        }

        if (!enrollmentFeePaymentMethod) {
          setNotification({
            type: 'error',
            message: 'Valor incompatível: Selecione a forma de pagamento (Dinheiro, PIX ou Cartão).'
          });
          return;
        }
      } else if (enrollmentFeeStatus === 'pending') {
        const numFee = Number(enrollmentFeeAmount);
        if (isNaN(numFee) || numFee <= 0) {
          setNotification({
            type: 'error',
            message: 'Valor incompatível: Para taxa de matrícula com status "Pendente", o valor a ser recebido deve ser maior que zero (R$ 0,00). Se o aluno for isento, marque como "Isento". O sistema não registrará.'
          });
          return;
        }
        if (numFee > 50000) {
          setNotification({
            type: 'error',
            message: 'Valor incompatível: O valor da taxa pendente excede o limite permitido pelo sistema.'
          });
          return;
        }
      } else if (enrollmentFeeStatus === 'exempt') {
        if (!enrollmentFeeExemptionReason) {
          setNotification({
            type: 'error',
            message: 'Valor incompatível: Selecione o motivo da isenção da taxa de matrícula.'
          });
          return;
        }
      }
    }
    
    try {
      setLoading(true);

      const targetClass = classes.find(c => c.id === formData.class_id);
      const cronoStartDate = targetClass ? getScheduleStartDateForClass(targetClass) : '';
      let finalStartDate = parseDateToDB(formData.start_date);
      if (!finalStartDate && cronoStartDate) {
        finalStartDate = cronoStartDate;
      }
      if (!finalStartDate && targetClass?.start_date) {
        finalStartDate = parseDateToDB(targetClass.start_date);
      }
      
      const resolvedCourse = effectiveCourseName || formData.course || (targetClass ? (targetClass.course || detectCourseFromClass(targetClass, coursesList)) : null);

      const studentUnitId = formData.unit_id || targetClass?.unit_id || (globalUnitId !== 'all' ? globalUnitId : 'matriz');

      const dataToSave: any = { 
        ...formData,
        unit_id: studentUnitId,
        birth_date: parseDateToDB(formData.birth_date),
        start_date: finalStartDate,
        class_id: formData.class_id || null,
        course: resolvedCourse || null
      };

      // Ensure unit_id is also preserved in observations metadata
      let cleanStudentObs = (dataToSave.observations || '').replace(/\[UNIT_ID:[^\]]+\]/g, '').trim();
      dataToSave.observations = `${cleanStudentObs} [UNIT_ID:${studentUnitId}]`.trim();

      // Set created_at only if it's the first time saving (no id)
      const isNew = !selectedStudent?.id;
      if (isNew && !dataToSave.created_at) {
        dataToSave.created_at = new Date().toISOString();
      }

      // Keep class start_date synchronized with schedule if needed
      if (targetClass && cronoStartDate && targetClass.start_date !== cronoStartDate) {
        saveData('classes', targetClass.id, { ...targetClass, start_date: cronoStartDate })
          .then(() => {
            setClasses(prev => prev.map(c => c.id === targetClass.id ? { ...c, start_date: cronoStartDate } : c));
          })
          .catch(e => console.warn('Could not sync class start_date:', e));
      }

      // Try saving with all fields, fallback if column missing
      let savedId;
      try {
        savedId = await saveData('students', selectedStudent?.id, dataToSave);
      } catch (err: any) {
        if (err.message?.includes('phone_mobile_is_whatsapp') || err.message?.includes('unit_id')) {
          console.warn('[Supabase] Coluna ausente no banco, salvando sem campos opcionais extras.');
          const fallbackData = { ...dataToSave };
          delete fallbackData.phone_mobile_is_whatsapp;
          if (err.message?.includes('unit_id')) {
            delete fallbackData.unit_id;
            const currentObs = fallbackData.observations || '';
            if (!currentObs.includes('[UNIT_ID:')) {
              fallbackData.observations = `${currentObs} [UNIT_ID:${studentUnitId}]`.trim();
            }
          }
          savedId = await saveData('students', selectedStudent?.id, fallbackData);
        } else {
          throw err;
        }
      }

      const effectiveStudentId = savedId || selectedStudent?.id;

      // Auto-ensure enrollment in selected primary class in the enrollments table
      if (effectiveStudentId) {
        try {
          const targetStatus = dataToSave.status === 'Inativo' ? 'Inativo' : 'Ativo';
          const currentEnrs = await fetchQuery('enrollments', 'student_id', '==', effectiveStudentId).catch(() => []);
          
          if (dataToSave.status === 'Inativo' && currentEnrs && currentEnrs.length > 0) {
            for (const enr of currentEnrs) {
              if (enr.status !== 'Inativo') {
                await saveData('enrollments', enr.id, { status: 'Inativo' });
              }
            }
          } else if (dataToSave.class_id) {
            const existingEnr = (currentEnrs || []).find((e: any) => e.class_id === dataToSave.class_id);
            if (!existingEnr) {
              await saveData('enrollments', undefined, {
                student_id: effectiveStudentId,
                class_id: dataToSave.class_id,
                unit_id: studentUnitId,
                status: targetStatus,
                enrollment_date: dataToSave.start_date || new Date().toISOString().split('T')[0],
                created_at: new Date().toISOString()
              });
            } else if (existingEnr.status !== targetStatus) {
              await saveData('enrollments', existingEnr.id, {
                status: targetStatus,
                unit_id: studentUnitId
              });
            }
          }
        } catch (enrollErr) {
          console.error('Error ensuring primary enrollment on save:', enrollErr);
        }
      }

      // Amarração da Taxa de Matrícula / Inscrição
      if (effectiveStudentId && dataToSave.class_id) {
        const targetCls = classes.find(c => c.id === dataToSave.class_id);
        const targetYear = targetCls ? getClassStartYear(targetCls) : (Number(targetCls?.start_year) || new Date().getFullYear());
        
        // Verificar se já tem contribuição da taxa (mês 0) para esse aluno e ano
        const existingFeeContrib = (studentContributions || []).find(c => 
          c.student_id === effectiveStudentId && 
          Number(c.reference_month) === 0 && 
          (!c.reference_year || Number(c.reference_year) === Number(targetYear))
        );

        if (!existingFeeContrib && enrollmentFeeStatus === 'paid') {
          try {
            const newFeeContrib: Partial<Contribution> = {
              student_id: effectiveStudentId,
              reference_month: 0,
              reference_year: Number(targetYear) || new Date().getFullYear(),
              amount: Number(enrollmentFeeAmount) || 0,
              payment_date: parseDateToDB(enrollmentFeePaymentDate) || new Date().toISOString().split('T')[0],
              payment_method: enrollmentFeePaymentMethod,
              observations: enrollmentFeeObservations || `Taxa de Inscrição / Matrícula inicial - Turma ${targetCls?.name || ''}`,
              created_at: new Date().toISOString()
            };
            await saveData('contributions', undefined, newFeeContrib);
            await fetchStudentContributions(effectiveStudentId);

            // Disponibilizar o comprovante de matrícula e recibo oficial
            const savedStudentObj = { ...dataToSave, id: effectiveStudentId };
            setReceiptModalData({
              student: savedStudentObj,
              classItem: targetCls,
              feeAmount: Number(enrollmentFeeAmount) || 0,
              feeStatus: 'paid',
              paymentMethod: enrollmentFeePaymentMethod,
              paymentDate: enrollmentFeePaymentDate,
              observations: enrollmentFeeObservations,
              isNew: isNew
            });
          } catch (feeErr) {
            console.error('Erro ao salvar taxa de matrícula:', feeErr);
          }
        }
      }
      
      setNotification({ type: 'success', message: 'Ficha do aluno salva com sucesso!' });
      setIsEditing(false);
      setUploadingPhoto(false); // Reset upload state on save success
      const finalSavedStudent = { ...dataToSave, id: effectiveStudentId };
      setSelectedStudent(finalSavedStudent);
      await fetchStudents();
      await fetchAllEnrollments();
      if (returnOrigin) {
        navigate(returnOrigin.path, {
          state: {
            classId: returnOrigin.classId,
            reopenModal: returnOrigin.reopenModal,
            reopenUnallocatedModal: returnOrigin.reopenUnallocatedModal,
            courseId: returnOrigin.courseId
          }
        });
      }
    } catch (error: any) {
      console.error('Error saving student:', error);
      setNotification({ type: 'error', message: 'Erro ao salvar aluno: ' + error.message });
    } finally {
      setLoading(false);
      setTimeout(() => setNotification(null), 3000);
    }
  };

  const handleToggleStudentStatus = useCallback(async () => {
    if (!selectedStudent?.id) return;
    const isCurrentlyInactive = formData.status === 'Inativo';
    const newStatus = isCurrentlyInactive ? 'Ativo' : 'Inativo';
    const confirmMsg = isCurrentlyInactive
      ? `Deseja reativar o aluno "${selectedStudent.name}"?`
      : `Deseja inativar o aluno "${selectedStudent.name}"? (O perfil de Assistente pode inativar ou desabilitar registros).`;

    if (!window.confirm(confirmMsg)) return;

    try {
      setLoading(true);
      await saveData('students', selectedStudent.id, {
        status: newStatus
      });
      setFormData(prev => ({ ...prev, status: newStatus }));
      setSelectedStudent(prev => prev ? { ...prev, status: newStatus } : null);
      setNotification({
        type: 'success',
        message: isCurrentlyInactive ? 'Aluno reativado com sucesso!' : 'Aluno inativado com sucesso!'
      });
      fetchStudents();
    } catch (error: any) {
      console.error('Erro ao alterar status:', error);
      setNotification({ type: 'error', message: 'Erro ao alterar status do aluno: ' + error.message });
    } finally {
      setLoading(false);
      setTimeout(() => setNotification(null), 3000);
    }
  }, [selectedStudent, formData.status, fetchStudents]);

  const handleDelete = useCallback(async () => {
    if (!selectedStudent?.id) return;
    if (!canDelete) {
      setNotification({
        type: 'error',
        message: 'Ação não permitida: O perfil de Assistente é vedado de excluir registros definitivamente. Utilize a opção de Inativar Aluno.'
      });
      setShowDeleteConfirm(false);
      return;
    }

    try {
      setLoading(true);
      await deleteData('students', selectedStudent.id);
      
      setNotification({ type: 'success', message: 'Aluno removido com sucesso!' });
      setSelectedStudent(null);
      setFormData(INITIAL_STUDENT_STATE);
      setIsEditing(false);
      setShowDeleteConfirm(false);
      fetchStudents();
      if (returnOrigin) {
        navigate(returnOrigin.path, {
          state: {
            classId: returnOrigin.classId,
            reopenModal: returnOrigin.reopenModal,
            reopenUnallocatedModal: returnOrigin.reopenUnallocatedModal,
            courseId: returnOrigin.courseId
          }
        });
      }
    } catch (error: any) {
      console.error('Error deleting student:', error);
      setNotification({ type: 'error', message: 'Erro ao excluir aluno: ' + error.message });
      setShowDeleteConfirm(false);
    } finally {
      setLoading(false);
      setTimeout(() => setNotification(null), 3000);
    }
  }, [selectedStudent, fetchStudents]);

  const capturePhoto = useCallback(async () => {
    const imageSrc = webcamRef.current?.getScreenshot();
    if (imageSrc) {
      try {
        setUploadingPhoto(true);
        setNotification({ type: 'success', message: 'Processando foto...' });
        // Convert base64 to blob
        const res = await fetch(imageSrc);
        const blob = await res.blob();
        const file = new File([blob], "photo.jpg", { type: "image/jpeg" });

        const url = await uploadImage(file, 'students', 'students');
        setFormData(prev => ({ ...prev, photo_url: url }));
        setShowWebcam(false);
        setNotification({ type: 'success', message: 'Foto capturada com sucesso!' });
      } catch (error: any) {
        console.error('Error capturing/uploading photo:', error.message);
        setNotification({ type: 'error', message: 'Erro ao capturar foto: ' + error.message });
      } finally {
        setUploadingPhoto(false);
        setTimeout(() => setNotification(null), 3000);
      }
    }
  }, [webcamRef]);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploadingPhoto(true);
      setNotification({ type: 'success', message: 'Carregando foto...' });
      const url = await uploadImage(file, 'students', 'students');
      setFormData(prev => ({ ...prev, photo_url: url }));
      setNotification({ type: 'success', message: 'Foto carregada com sucesso!' });
    } catch (error: any) {
      console.error('Error uploading photo:', error.message);
      setNotification({ type: 'error', message: 'Erro ao carregar foto: ' + error.message });
    } finally {
      setUploadingPhoto(false);
      setTimeout(() => setNotification(null), 3000);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const PrintableGrade = () => {
    if (!selectedStudent) return null;
    const currentClass = classes.find(c => c.id === selectedStudent.class_id);
    
    return (
      <div id="printable-student-record" className="hidden print:flex flex-col justify-between text-slate-950 bg-white overflow-hidden font-sans leading-relaxed relative w-full h-[270mm] max-h-[270mm] min-h-[270mm] mx-auto p-0 box-border">
        {/* TOP SECTION: Header + Control Boxes + Personal Data + Rules */}
        <div className="flex-1 flex flex-col justify-start pr-1">
          {/* Institutional Header with prominent doubled logo */}
          <div className="flex items-center gap-5 mb-2.5 pb-2.5 border-b-2 border-slate-900">
            <div className="flex-shrink-0 w-32 h-32 flex items-center justify-center">
              {institution?.logo_url ? (
                <img
                  src={institution.logo_url}
                  className="w-full h-full object-contain max-h-32 max-w-32"
                  referrerPolicy="no-referrer"
                  alt="Logo da Instituição"
                />
              ) : (
                <div className="w-full h-full border border-slate-300 border-dashed flex flex-col items-center justify-center text-[8pt] text-slate-400 font-bold uppercase">
                  <span>SEM</span>
                  <span>LOGO</span>
                </div>
              )}
            </div>
            <div className="flex-1 flex flex-col justify-center">
              <p className="text-[10pt] font-extrabold tracking-[0.2em] text-slate-600 uppercase leading-none mb-1.5">
                {institution?.city_uf ? `DIOCESE DE ${institution.city_uf.split('/')[0].toUpperCase()}` : 'DIOCESE DE GUARULHOS'}
              </p>
              <h1 className="text-[17pt] font-black uppercase tracking-tight text-slate-950 leading-tight">
                {institution?.name || 'ESCOLA DIOCESANA DE MINISTÉRIO'}
              </h1>
              <p className="text-[10pt] font-bold text-slate-600 tracking-wider uppercase mt-1">
                {institution?.subtitle || 'PE. JOSÉ FERNANDO DE BRITO'}
              </p>
            </div>
          </div>

          {/* Document Title */}
          <div className="text-center mt-3.5 mb-6">
            <h2 className="text-[12pt] font-black uppercase tracking-[0.28em] text-slate-900 border-b-2 border-slate-900 pb-1 px-8 inline-block">
              Ficha de Inscrição
            </h2>
          </div>

          {/* TOP CONTROL BOXES: Matrícula + Cursos + Foto 3x4 */}
          <div className="grid grid-cols-12 gap-4 mb-6">
            {/* Controle / Matrícula */}
            <div className="col-span-3 border border-slate-800 p-2 flex flex-col h-[3cm] justify-between bg-white">
              <p className="text-[8pt] font-black uppercase tracking-wider text-slate-700 border-b border-slate-200 pb-1">
                Controle da Escola
              </p>
              <div className="flex-1 flex flex-col justify-center items-center">
                <p className="text-[7pt] font-extrabold uppercase tracking-widest text-slate-400 mb-1.5 text-center">
                  Nº de Matrícula
                </p>
                <p className="font-black text-[13.5pt] tracking-wider text-slate-950 text-center font-mono">
                  {formatRegistrationNumber(selectedStudent.registration_number)}
                </p>
              </div>
            </div>

            {/* Cursos */}
            <div className="col-span-6 border border-slate-800 p-2.5 h-[3cm] flex flex-col justify-between bg-white">
              <p className="text-[8pt] font-black uppercase tracking-wider text-slate-700 border-b border-slate-200 pb-1 flex items-center justify-between">
                <span>CURSOS:</span>
                <span className="text-[6.5pt] text-slate-400 font-semibold lowercase">selecione o curso de ingresso</span>
              </p>
              <div className="flex-1 grid grid-cols-2 gap-x-4 gap-y-2.5 content-center py-1">
                {[
                  { key: 'Teologia', name: 'Teologia' },
                  { key: 'Latim', name: 'Latim' },
                  { key: 'Doutrina Social da Igreja', name: 'Doutrina Social da Igreja' },
                  { key: 'S. Negros', name: 'História dos Santos Negros' }
                ].map(course => {
                  const courseFullName = course.name;
                  const primaryClassCourse = currentClass ? detectCourseFromClass(currentClass) : '';
                  const isInPrimaryClass = primaryClassCourse.toLowerCase() === courseFullName.toLowerCase() ||
                    (currentClass?.name?.toLowerCase() || '').includes(course.key.toLowerCase());

                  const isInExtraEnrollments = studentEnrollments.some(enrollment => {
                    const targetClass = classes.find(c => c.id === enrollment.class_id);
                    const enrolledCourse = targetClass ? detectCourseFromClass(targetClass) : '';
                    return (enrolledCourse.toLowerCase() === courseFullName.toLowerCase() ||
                      (targetClass?.name?.toLowerCase() || '').includes(course.key.toLowerCase())) &&
                      enrollment.status === 'Ativo';
                  });

                  const isChecked = isInPrimaryClass || isInExtraEnrollments ||
                    (selectedStudent.course?.toLowerCase() === courseFullName.toLowerCase()) ||
                    (selectedStudent.course?.toLowerCase() || '').includes(course.key.toLowerCase());
                  
                  return (
                    <div key={course.key} className="flex items-start gap-2">
                      <div className="w-[19px] h-[19px] border-[1.8px] border-slate-900 rounded-[2px] flex items-center justify-center bg-white relative shrink-0 mt-0.5">
                        {isChecked && <span className="text-[10pt] font-black leading-none text-slate-950">✕</span>}
                      </div>
                      <span className="text-[7.5pt] font-bold leading-tight uppercase text-slate-900">
                        {course.name}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Active enrollments summary if multiple */}
              {(studentEnrollments.length > 0) && (
                <div className="pt-1 border-t border-slate-200 flex items-center gap-1.5">
                  <span className="text-[6.5pt] font-black uppercase text-slate-600 shrink-0">Turma(s):</span>
                  <p className="text-[7pt] font-bold leading-tight uppercase truncate text-slate-800">
                    {[
                      currentClass?.name,
                      ...studentEnrollments
                        .filter(e => e.status === 'Ativo')
                        .map(e => classes.find(c => c.id === e.class_id)?.name)
                    ].filter(Boolean).join(' / ')}
                  </p>
                </div>
              )}
            </div>

            {/* Foto 3x4 without borders */}
            <div className="col-span-3 flex justify-center">
              <div className="flex items-center justify-center relative w-[2.4cm] h-[3cm] overflow-hidden">
                {selectedStudent.photo_url ? (
                  <img
                    src={selectedStudent.photo_url}
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                    alt="Foto do Aluno"
                  />
                ) : (
                  <div className="w-full h-full border border-dashed border-slate-300 flex items-center justify-center text-center text-slate-300 uppercase">
                    <p className="text-[7pt] font-black tracking-widest">FOTO 3X4</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* PERSONAL DATA - Harmonious Grid with Roomy Line Spacing & Right Inset */}
          <div className="space-y-3 mb-3 text-[9pt]">
            <div className="flex items-end gap-2">
              <span className="font-bold uppercase min-w-[70px] text-[8.5pt] text-slate-800">Nome:</span>
              <span className="flex-1 border-b border-slate-400 font-bold uppercase text-[9.5pt] text-slate-950 px-2 pb-1 min-h-[22px]">
                {selectedStudent.name}
              </span>
            </div>

            <div className="flex items-end gap-2">
              <span className="font-bold uppercase min-w-[70px] text-[8.5pt] text-slate-800">Endereço:</span>
              <span className="flex-1 border-b border-slate-400 font-bold uppercase text-[9pt] text-slate-900 px-2 pb-1 min-h-[22px]">
                {selectedStudent.address_street ? `${selectedStudent.address_street}${selectedStudent.address_number ? `, Nº ${selectedStudent.address_number}` : ''}${selectedStudent.address_complement ? ` - ${selectedStudent.address_complement}` : ''}` : ''}
              </span>
            </div>

            <div className="flex gap-4">
              <div className="flex-[4] flex items-end gap-2">
                <span className="font-bold uppercase text-[8.5pt] text-slate-800">Bairro:</span>
                <span className="flex-1 border-b border-slate-400 font-bold uppercase text-[9pt] text-slate-950 px-2 pb-1 min-h-[22px]">
                  {selectedStudent.address_neighborhood || (selectedStudent.address_street?.includes(' - ') ? selectedStudent.address_street.split(' - ').pop() : '')}
                </span>
              </div>
              <div className="flex-[4] flex items-end gap-2">
                <span className="font-bold uppercase text-[8.5pt] text-slate-800">Cidade:</span>
                <span className="flex-1 border-b border-slate-400 font-bold uppercase text-[9pt] text-slate-950 px-2 pb-1 min-h-[22px]">
                  {selectedStudent.address_city}
                </span>
              </div>
              <div className="flex-[1.2] flex items-end gap-2">
                <span className="font-bold uppercase text-[8.5pt] text-slate-800">UF:</span>
                <span className="flex-1 border-b border-slate-400 font-bold uppercase text-[9pt] text-slate-950 px-2 pb-1 text-center min-h-[22px]">
                  {selectedStudent.address_state}
                </span>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex-[2.2] flex items-end gap-2">
                <span className="font-bold uppercase text-[8.5pt] text-slate-800">CEP:</span>
                <span className="flex-1 border-b border-slate-400 font-bold text-[9pt] text-slate-950 px-2 pb-1 min-h-[22px] whitespace-nowrap">
                  {selectedStudent.address_zip}
                </span>
              </div>
              <div className="flex-[3.8] flex items-end gap-2">
                <span className="font-bold uppercase text-[8.5pt] text-slate-800">Celular:</span>
                <span className="flex-1 border-b border-slate-400 font-bold text-[9pt] text-slate-950 px-2 pb-1 min-h-[22px] whitespace-nowrap">
                  {selectedStudent.phone_mobile}
                </span>
              </div>
              <div className="flex-[2.5] flex items-end justify-end pb-1 text-[8pt]">
                <div className="flex items-center gap-3">
                  <span className="text-slate-800 font-bold uppercase">WhatsApp:</span>
                  <div className="flex items-center gap-1">
                    <div className="w-3.5 h-3.5 border border-slate-900 flex items-center justify-center bg-white shrink-0">
                      {selectedStudent.phone_mobile?.trim() && (String(selectedStudent.phone_mobile_is_whatsapp) === 'true' || selectedStudent.phone_mobile_is_whatsapp === true) && (
                        <span className="text-[8.5pt] font-black leading-none text-slate-950">X</span>
                      )}
                    </div>
                    <span className="font-bold uppercase text-[7.5pt]">Sim</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-3.5 h-3.5 border border-slate-900 flex items-center justify-center bg-white shrink-0">
                      {selectedStudent.phone_mobile?.trim() && (String(selectedStudent.phone_mobile_is_whatsapp) !== 'true' && selectedStudent.phone_mobile_is_whatsapp !== true) && (
                        <span className="text-[8.5pt] font-black leading-none text-slate-950">X</span>
                      )}
                    </div>
                    <span className="font-bold uppercase text-[7.5pt]">Não</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex-[2.2] flex items-end gap-2">
                <span className="font-bold uppercase whitespace-nowrap text-[8.5pt] text-slate-800">Nasc.:</span>
                <span className="flex-1 border-b border-slate-400 font-bold text-[9pt] text-slate-950 px-2 pb-1 text-center min-h-[22px]">
                  {selectedStudent.birth_date ? formatDateForDisplay(selectedStudent.birth_date) : '__ / __ / ____'}
                </span>
              </div>
              <div className="flex-[2] flex items-end gap-2">
                <span className="font-bold uppercase text-[8.5pt] text-slate-800">RG:</span>
                <span className="flex-1 border-b border-slate-400 font-bold text-[9pt] text-slate-950 px-2 pb-1 text-center min-h-[22px]">
                  {selectedStudent.rg}
                </span>
              </div>
              <div className="flex-[2.5] flex items-end gap-2">
                <span className="font-bold uppercase text-[8.5pt] text-slate-800">CPF:</span>
                <span className="flex-1 border-b border-slate-400 font-bold text-[9pt] text-slate-950 px-2 pb-1 text-center min-h-[22px]">
                  {selectedStudent.cpf}
                </span>
              </div>
            </div>

            <div className="flex items-end gap-2">
              <span className="font-bold uppercase min-w-[70px] text-[8.5pt] text-slate-800">E-mail:</span>
              <span className="flex-1 border-b border-slate-400 font-bold lowercase text-[9pt] text-slate-950 px-2 pb-1 min-h-[22px]">
                {selectedStudent.email}
              </span>
            </div>

            {/* Pastoral Info Grid */}
            <div className="space-y-2.5 pt-2 border-t border-slate-200/80">
              <div className="flex items-end gap-2">
                <span className="font-bold uppercase whitespace-nowrap min-w-[70px] text-[8.5pt] text-slate-800">Paróquia:</span>
                <span className="flex-1 border-b border-slate-400 font-bold uppercase text-[9pt] text-slate-950 px-2 pb-1 min-h-[22px]">
                  {selectedStudent.parish}
                </span>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-end gap-2">
                  <span className="font-bold uppercase whitespace-nowrap text-[8.5pt] text-slate-800">Forania:</span>
                  <span className="flex-1 border-b border-slate-400 font-bold uppercase text-[9pt] text-slate-950 px-2 pb-1 min-h-[22px] text-center">
                    {selectedStudent.forania}
                  </span>
                </div>
                <div className="flex items-end gap-2">
                  <span className="font-bold uppercase whitespace-nowrap text-[8.5pt] text-slate-800">Pastoral:</span>
                  <span className="flex-1 border-b border-slate-400 font-bold uppercase text-[9pt] text-slate-950 px-2 pb-1 min-h-[22px] text-center">
                    {selectedStudent.pastoral_participates}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* BASIC INFORMATION SECTION - NORMAS */}
          <div className="my-2.5 p-2.5 bg-slate-50/50 border border-slate-300 rounded-none">
            <h4 className="text-[8pt] font-black uppercase text-center mb-1.5 tracking-wider text-slate-800 border-b border-slate-200 pb-1">
              Normas Básicas para Admissão
            </h4>
            <div className="text-[7pt] leading-normal space-y-1 font-medium text-slate-800">
              {admissionNorms.map((norm, index) => {
                const hasIndexPrefix = /^\s*[0-9]+[\s\)\.\-]/i.test(norm);
                return (
                  <p key={index} className="text-justify">
                    {!hasIndexPrefix && <strong className="font-bold">{index + 1}) </strong>}
                    {norm}
                  </p>
                );
              })}
            </div>
          </div>

          {/* DECLARATION */}
          <div className="text-[8pt] leading-relaxed pt-2">
            <div className="flex items-baseline mb-1 gap-2">
              <span className="font-bold uppercase text-slate-800">Eu,</span>
              <span className="flex-1 border-b border-slate-900 font-black uppercase px-2 text-slate-950">
                {selectedStudent.name}
              </span>
            </div>
            <p className="text-justify leading-relaxed font-medium text-slate-800 text-[7.5pt]">
              declaro que estou ciente e de ACORDO com as normas estabelecidas para ingresso no curso promovido pela Diocese de Guarulhos e autorizo o armazenamento de meus dados pessoais necessários para a inscrição.
            </p>
          </div>
        </div>

        {/* BOTTOM SECTION: DATE, SIGNATURE AND RODAPÉ PINNED AT BOTTOM */}
        <div className="mt-auto pt-3 shrink-0 pr-1">
          {/* DATE AND SIGNATURE */}
          <div className="mt-2 mb-7">
            <div className="flex justify-between items-end px-3 gap-8">
              <div className="flex flex-col pb-0.5">
                <p className="text-[8.5pt] font-bold text-slate-900">
                  Guarulhos, <span>
                    {selectedStudent.created_at ? new Date(selectedStudent.created_at).toLocaleDateString('pt-BR') : new Date().toLocaleDateString('pt-BR')}
                  </span>
                </p>
              </div>
              <div className="flex flex-col items-center">
                <div className="w-[70mm] border-t-2 border-slate-900 mb-1.5"></div>
                <p className="text-[7.5pt] font-black uppercase tracking-[0.2em] text-slate-900">
                  Assinatura do(a) Aluno(a)
                </p>
              </div>
            </div>
          </div>

          {/* RODAPÉ */}
          <div className="border-t-2 border-slate-900 pt-2 pb-0 flex justify-between items-start text-slate-900 uppercase tracking-tight text-[7pt]">
            <div className="flex-1 space-y-0.5">
              <p className="leading-snug font-bold">
                {institution?.address}
              </p>
              {(institution?.cep || institution?.city_uf) && (
                <p className="leading-snug font-bold">
                  {institution?.cep ? `CEP: ${institution.cep}` : ''} {institution?.city_uf ? ` - ${institution.city_uf}` : ''}
                </p>
              )}
              {institution?.phone && (
                <p className="leading-snug font-bold pt-0.5">
                  <span className="normal-case">Telefone: {institution.phone}</span>
                </p>
              )}
            </div>
            <div className="text-right max-w-[380px] leading-tight text-slate-900 font-bold text-[7pt] space-y-0.5 pr-1">
              {institution?.secretary && (
                <>
                  <p className="whitespace-pre-line uppercase underline underline-offset-2 mb-0.5">Atendimento Secretaria:</p>
                  <p className="whitespace-pre-line lowercase font-bold text-[7pt]">{institution.secretary}</p>
                </>
              )}
              {institution?.email && (
                <p className="lowercase font-bold text-[7pt] pt-0.5">
                  email: {institution.email.toLowerCase()}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const scopedClasses = React.useMemo(() => {
    if (!globalUnitId || globalUnitId === 'all') return classes;
    return classes.filter(c => isItemInUnit(getItemUnitId(c), globalUnitId, activeUnits));
  }, [classes, globalUnitId, activeUnits]);

  // Unidade de contexto da ficha do aluno (respeita a unidade selecionada na ficha para permitir transferências entre polos)
  const effectiveModalUnit = React.useMemo(() => {
    if (formData.unit_id) return formData.unit_id;
    if (globalUnitId && globalUnitId !== 'all') return globalUnitId;
    return 'matriz';
  }, [formData.unit_id, globalUnitId]);

  // Turmas estritamente restritas à unidade do aluno (garante que filiais não vejam turmas da matriz e vice-versa)
  const modalAvailableClasses = React.useMemo(() => {
    if (!effectiveModalUnit || effectiveModalUnit === 'all') return classes;
    return classes.filter(c => isItemInUnit(getItemUnitId(c), effectiveModalUnit, activeUnits));
  }, [classes, effectiveModalUnit, activeUnits]);

  const studentsInActiveUnitCount = React.useMemo(() => {
    if (!globalUnitId || globalUnitId === 'all') return students.length;
    return students.filter(s => {
      const studentClass = classes.find(c => c.id === s.class_id);
      const studentUnit = getItemUnitId(s) || (studentClass ? getItemUnitId(studentClass) : 'matriz');
      return isItemInUnit(studentUnit, globalUnitId, activeUnits);
    }).length;
  }, [students, classes, globalUnitId, activeUnits]);

  const unallocatedStudentIdsSet = React.useMemo(() => {
    const activeClassIds = new Set(scopedClasses.filter(c => c.status === 'Ativo' || !c.status).map(c => c.id));
    const set = new Set<string>();
    students.forEach(s => {
      if (s.status === 'Inativo') return;
      if (globalUnitId && globalUnitId !== 'all') {
        const studentClass = classes.find(c => c.id === s.class_id);
        const studentUnit = getItemUnitId(s) || (studentClass ? getItemUnitId(studentClass) : 'matriz');
        if (!isItemInUnit(studentUnit, globalUnitId, activeUnits)) return;
      }
      const isInValidPrimary = s.class_id && activeClassIds.has(s.class_id);
      const isInValidMulti = allEnrollments.some(e => e.student_id === s.id && (e.status || 'Ativo') === 'Ativo' && activeClassIds.has(e.class_id));
      if (!isInValidPrimary && !isInValidMulti) {
        set.add(s.id);
      }
    });
    return set;
  }, [students, scopedClasses, allEnrollments, globalUnitId, activeUnits, classes]);

  const unallocatedStudentsCount = React.useMemo(() => {
    return unallocatedStudentIdsSet.size;
  }, [unallocatedStudentIdsSet]);

  const studentParallelEnrollmentsMap = React.useMemo(() => {
    const map = new Map<string, number>();
    const validClassIds = new Set(classes.map(c => c.id));
    students.forEach(s => {
      const studentEnrs = allEnrollments.filter(e => e.student_id === s.id && (e.status || 'Ativo') === 'Ativo' && validClassIds.has(e.class_id));
      const classIds = new Set<string>();
      if (s.class_id && validClassIds.has(s.class_id)) classIds.add(s.class_id);
      studentEnrs.forEach(e => {
        if (e.class_id && validClassIds.has(e.class_id)) classIds.add(e.class_id);
      });
      if (classIds.size > 1) {
        map.set(s.id, classIds.size);
      }
    });
    return map;
  }, [students, allEnrollments, classes]);

  const isStudentUnallocated = React.useMemo(() => {
    if (!selectedStudent?.id) return false;
    return unallocatedStudentIdsSet.has(selectedStudent.id);
  }, [selectedStudent, unallocatedStudentIdsSet]);

  const filteredStudents = React.useMemo(() => {
    const trimmedSearch = searchTerm.trim();
    return students.filter(s => {
      const matchesSearch = !trimmedSearch || matchesStudentSearch(s, trimmedSearch);
      
      const studentStatus = s.status || 'Ativo';
      const matchesStatus = statusFilter === 'Todos' || studentStatus.toLowerCase() === statusFilter.toLowerCase();
      
      // Filter logic
      let matchesYear = true;
      if (selectedYear !== '' && selectedYear !== 'all' && selectedClassId !== 'unallocated') {
        const studentYear = getYearFromRegistration(s.registration_number);
        matchesYear = studentYear === selectedYear;
      }

      let matchesClass = true;
      if (selectedClassId === 'unallocated') {
        matchesClass = unallocatedStudentIdsSet.has(s.id);
      } else if (selectedClassId !== '') {
        const isInPrimaryClass = s.class_id === selectedClassId;
        const isEnrolledViaMultiTurma = allEnrollments.some(e => e.student_id === s.id && e.class_id === selectedClassId && e.status === 'Ativo');
        matchesClass = isInPrimaryClass || isEnrolledViaMultiTurma;
      }

      // If user selected "all" for year or unallocated is selected, year match is true
      if (selectedYear === 'all' || selectedClassId === 'unallocated') matchesYear = true;

      let matchesUnit = true;
      if (globalUnitId && globalUnitId !== 'all') {
        const studentClass = classes.find(c => c.id === s.class_id);
        const studentUnit = getItemUnitId(s) || (studentClass ? getItemUnitId(studentClass) : 'matriz');
        matchesUnit = isItemInUnit(studentUnit, globalUnitId, activeUnits);
      }

      return matchesSearch && matchesStatus && matchesYear && matchesClass && matchesUnit;
    }).sort((a, b) => {
      // If user typed a search term, prioritize highest relevance matches first
      if (trimmedSearch) {
        const rankA = calculateStudentSearchRank(a, trimmedSearch);
        const rankB = calculateStudentSearchRank(b, trimmedSearch);
        if (rankA !== rankB) return rankA - rankB;
      }

      if (sortBy === 'name') {
        const nameA = a.name || '';
        const nameB = b.name || '';
        return nameA.localeCompare(nameB, 'pt-BR', { sensitivity: 'base' });
      } else {
        const yearA = getYearFromRegistration(a.registration_number) || '0000';
        const yearB = getYearFromRegistration(b.registration_number) || '0000';
        if (yearA !== yearB) return yearB.localeCompare(yearA);
        return (b.registration_number || '').localeCompare(a.registration_number || '', undefined, { numeric: true });
      }
    });
  }, [students, searchTerm, statusFilter, selectedYear, selectedClassId, sortBy, allEnrollments, unallocatedStudentIdsSet, hasMultipleUnits, globalUnitId, classes]);

  const availableYears = React.useMemo(() => {
    return Array.from(new Set(students.map(s => getYearFromRegistration(s.registration_number)).filter(Boolean))).sort().reverse();
  }, [students]);

  const actualListCollapsed = selectedStudent !== null || isEditing;

  const validClassIds = React.useMemo(() => new Set(classes.map(c => c.id)), [classes]);
  const primaryClsId = (formData.class_id && validClassIds.has(formData.class_id))
    ? formData.class_id 
    : (selectedStudent?.class_id && validClassIds.has(selectedStudent.class_id) ? selectedStudent.class_id : '');

  const secondaryEnrollments = React.useMemo(() => {
    return studentEnrollments.filter(e => 
      e.class_id && 
      validClassIds.has(e.class_id) && 
      e.class_id !== primaryClsId && 
      (e.status || 'Ativo') === 'Ativo'
    );
  }, [studentEnrollments, primaryClsId, validClassIds]);
  const hasParallelCourses = secondaryEnrollments.length > 0;

  return (
    <>
      {notification && (
        <div className={cn(
          "fixed top-4 left-1/2 -translate-x-1/2 z-[300] px-4 py-3 rounded-none shadow-2xl animate-in fade-in slide-in-from-top-4 duration-300 flex items-start sm:items-center gap-3 max-w-xl w-[94vw] sm:w-auto border",
          notification.type === 'success' 
            ? "bg-emerald-600 border-emerald-700 text-white" 
            : "bg-rose-700 border-rose-800 text-white shadow-rose-950/30 ring-2 ring-rose-500/20"
        )}>
          {notification.type === 'success' ? (
            <CheckCircle2 size={18} className="shrink-0 mt-0.5 sm:mt-0 text-white" />
          ) : (
            <AlertCircle size={18} className="shrink-0 mt-0.5 sm:mt-0 text-amber-200" />
          )}
          <div className="flex-1">
            <p className="text-xs font-bold leading-snug">{notification.message}</p>
          </div>
          <button 
            type="button" 
            onClick={() => setNotification(null)}
            className="p-1 hover:bg-white/20 transition-colors cursor-pointer text-white/80 hover:text-white shrink-0 ml-1"
          >
            <X size={14} />
          </button>
        </div>
      )}

      <div className="pt-3 sm:pt-4 mb-3 print:hidden">
        <UnitConflictBanner
          moduleName="Alunos"
          entityNameSingular="aluno"
          entityNamePlural="alunos"
          totalRecordsAllUnits={students.length}
          recordsInActiveUnit={studentsInActiveUnitCount}
          selectedItemUnit={selectedStudent ? (getItemUnitId(selectedStudent) || classes.find(c => c.id === selectedStudent.class_id)?.unit_id) : undefined}
          selectedItemName={selectedStudent?.name}
          onAddNewInActiveUnit={handleNew}
        />
      </div>

      <div className={cn(
        "print:hidden h-auto lg:h-[calc(100vh-5.5rem)] min-h-[calc(100vh-5.5rem)] lg:min-h-0 relative flex flex-col lg:flex-row gap-3 sm:gap-4 w-full transition-all duration-300",
        actualListCollapsed ? "justify-center" : "justify-start"
      )}>
      {/* Green Hover Sensor / Marker */}
      {actualListCollapsed && !hoverShowList && (
        <div 
          onMouseEnter={() => setHoverShowList(true)}
          onClick={() => setHoverShowList(true)}
          className="absolute right-0 top-1/4 h-1/2 w-3 bg-emerald-500 hover:bg-emerald-600 cursor-pointer rounded-l-md shadow-md transition-all duration-200 flex flex-col justify-center items-center group z-[45]"
          title="Aproxime o mouse para ver a Lista de Alunos"
        >
          {/* Subtle glowing accent */}
          <div className="w-1 h-8 bg-white/40 rounded-full animate-pulse my-1" />
          <div className="w-1 h-8 bg-white/40 rounded-full animate-pulse my-1" />
          
          {/* Hover instruction tooltip */}
          <div className="absolute right-4 bg-slate-900 border border-slate-800 text-emerald-400 font-bold text-[10px] uppercase tracking-wider py-1.5 px-3 rounded-none shadow-xl opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-all duration-300 translate-x-2 group-hover:translate-x-0">
            ➔ Lista de Alunos <span className="text-slate-300">(Passe o mouse)</span>
          </div>
        </div>
      )}

      {/* Sidebar/Full List */}
      <div 
        onMouseLeave={() => {
          if (actualListCollapsed) {
            setHoverShowList(false);
          }
        }}
        className={cn(
          "bg-white rounded-none shadow-sm flex flex-col order-last transition-all duration-300 ease-in-out border border-slate-200 overflow-hidden shrink-0",
          actualListCollapsed 
            ? (hoverShowList 
                ? "absolute right-0 top-0 bottom-0 h-full z-50 w-full sm:w-[380px] opacity-100 shadow-2xl border-l border-slate-200" 
                : "w-0 opacity-0 border-0 pointer-events-none overflow-hidden hidden"
              )
            : "w-full lg:w-[380px] opacity-100 h-full"
        )}
      >
        <div className={cn(
          "flex-[1] flex flex-col overflow-hidden w-full",
        )}>
          <div className="p-4 border-b border-slate-100 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <h2 className="text-base font-bold text-slate-800 tracking-tight">Alunos</h2>
              <div className="px-1.5 py-0.5 bg-slate-100 text-slate-600 text-[9px] font-bold rounded border border-slate-200">
                {filteredStudents.length}
              </div>
            </div>
            <button 
              onClick={handleNew}
              className="px-3 h-8 bg-slate-800 text-white rounded-none text-[11px] font-bold hover:bg-slate-900 transition-all flex items-center justify-center gap-1.5 shadow-sm shadow-indigo-600/20 uppercase tracking-widest"
            >
              <Plus size={14} />
              Novo
            </button>
          </div>
          <div className="space-y-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
              <input 
                type="text"
                placeholder="Buscar por nome, RA ou CPF..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-8 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-none text-[11px] focus:ring-1 focus:ring-slate-500/10 focus:bg-white transition-all outline-none"
              />
            </div>
            <div className="flex gap-1.5">
              {(['Ativo', 'Inativo', 'Todos'] as const).map((status) => (
                <button
                  key={status}
                  onClick={() => setStatusFilter(status)}
                  className={cn(
                    "flex-1 py-1.5 text-[9px] font-bold rounded-none transition-all border uppercase tracking-wider",
                    statusFilter === status 
                      ? "bg-slate-800 border-slate-800 text-white shadow-sm" 
                      : "bg-white border-slate-200 text-slate-500 hover:border-slate-300"
                  )}
                >
                  {status}
                </button>
              ))}
            </div>

            {/* Quick Unallocated Filter Button */}
            <button
              type="button"
              onClick={() => {
                if (selectedClassId === 'unallocated') {
                  setSelectedClassId('');
                } else {
                  setSelectedClassId('unallocated');
                  setSelectedYear('all');
                }
              }}
              className={cn(
                "w-full py-2 px-3 text-[10px] font-extrabold uppercase tracking-wider flex items-center justify-between border transition-all cursor-pointer shadow-2xs",
                selectedClassId === 'unallocated'
                  ? "bg-amber-500 text-white border-amber-600 ring-2 ring-amber-400/40 font-black"
                  : "bg-amber-50 text-amber-950 border-amber-300 hover:bg-amber-100/90"
              )}
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <AlertTriangle size={13} className={selectedClassId === 'unallocated' ? "text-white shrink-0" : "text-amber-600 shrink-0"} />
                <span className="truncate">Filtrar Sem Turma</span>
              </div>
              <span className={cn(
                "px-2 py-0.5 text-[9px] font-black shrink-0",
                selectedClassId === 'unallocated' ? "bg-amber-700 text-white" : "bg-amber-200 text-amber-900 border border-amber-300"
              )}>
                {unallocatedStudentsCount}
              </span>
            </button>

            <div className="space-y-1.5">
              <select 
                value={selectedClassId}
                onChange={(e) => setSelectedClassId(e.target.value)}
                className={cn(
                  "w-full px-2.5 py-1.5 border rounded-none text-[11px] font-medium outline-none transition-all",
                  selectedClassId === 'unallocated'
                    ? "bg-amber-50 border-amber-300 text-amber-900 font-bold"
                    : "bg-slate-50 border-slate-200 text-slate-600 focus:ring-1 focus:ring-slate-500/10"
                )}
              >
                <option value="">Todas as Turmas</option>
                <option value="unallocated">
                  ⚠️ Sem Turma / Não Alocados ({unallocatedStudentsCount})
                </option>
                {scopedClasses.filter(c => !c.status || c.status === 'Ativo' || String(c.status).toLowerCase() === 'ativo').map((c, cIdx) => (
                  <option key={`st-cls-flt-${c.id || cIdx}-${cIdx}`} value={c.id}>{c.name}</option>
                ))}
              </select>
              <div className="flex gap-1.5">
                <select 
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(e.target.value)}
                  className="flex-1 px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-none text-[11px] font-medium text-slate-600 focus:ring-1 focus:ring-slate-500/10 outline-none"
                >
                  <option value="">Escolha um ano</option>
                  <option value="all">Todos os Anos</option>
                  {availableYears.map((y, yIdx) => <option key={`st-yr-${y}-${yIdx}`} value={y}>Matrícula {y}</option>)}
                </select>
                <button
                  onClick={() => setSortBy(sortBy === 'name' ? 'registration' : 'name')}
                  className="p-1.5 bg-white border border-slate-200 text-slate-500 rounded-none hover:bg-slate-50 transition-colors"
                  title={sortBy === 'name' ? "Ordering by RA" : "Ordering by Name"}
                >
                  <ArrowUpDown size={14} />
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="flex-grow flex-1 overflow-y-auto p-2 space-y-1">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="animate-spin text-slate-705" />
            </div>
          ) : (!selectedYear && selectedClassId !== 'unallocated') ? (
            <div className="flex flex-col items-center justify-center p-6 text-center text-slate-400">
              <GraduationCap size={32} className="mb-2 opacity-20" />
              <p className="text-xs font-medium">Selecione uma turma ou ano para visualizar os alunos</p>
            </div>
          ) : filteredStudents.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-6 text-center text-slate-400">
              <Search size={32} className="mb-2 opacity-20" />
              <p className="text-xs font-medium">Nenhum aluno encontrado</p>
            </div>
          ) : filteredStudents.map((student, sIdx) => (
            <StudentItem
              key={`st-item-${student.id || student.registration_number || sIdx}-${sIdx}`}
              student={student}
              isSelected={selectedStudent?.id === student.id}
              onSelect={handleSelectStudent}
              isUnallocated={unallocatedStudentIdsSet.has(student.id)}
              parallelClassesCount={studentParallelEnrollmentsMap.get(student.id)}
              unitName={hasMultipleUnits ? getUnitName(student.unit_id || classes.find(c => c.id === student.class_id)?.unit_id) : undefined}
            />
          ))}
        </div>
      </div>
    </div>

      {/* Main Content (Student Details or Registration Form) */}
      <div className={cn(
        "bg-white rounded-none shadow-sm border border-slate-200 flex flex-col overflow-hidden transition-all duration-300 min-w-0 h-full flex-1",
        actualListCollapsed ? "max-w-5xl mx-auto w-full" : "w-full"
      )}>
        {selectedStudent || isEditing ? (
          <>
            <div className="p-3 sm:px-6 sm:py-4 border-b border-slate-100 bg-slate-50/30">
              {/* Banner de navegação de retorno quando a ficha foi aberta a partir de outro módulo */}
              {returnOrigin && (
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2.5 bg-blue-50/90 border border-blue-200 px-3.5 py-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-blue-900 min-w-0">
                    <School size={16} className="text-blue-700 shrink-0" />
                    <span className="truncate">
                      Origem: <strong className="text-blue-950 font-extrabold">{returnOrigin.sourceTitle || 'Turmas'}</strong>
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleCloseFicha}
                    className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-900 hover:bg-blue-950 text-white text-[11px] font-black uppercase tracking-wider transition-all cursor-pointer shadow-2xs"
                    title={`Retornar para ${returnOrigin.sourceTitle || 'Origem'}`}
                  >
                    <ArrowLeft size={13} />
                    <span>Voltar para {returnOrigin.sourceTitle || 'Origem'}</span>
                  </button>
                </div>
              )}

              <button
                type="button"
                onClick={handleCloseFicha}
                className="lg:hidden mb-3 px-3.5 py-1.5 bg-slate-800 hover:bg-slate-900 text-white text-[10px] font-bold uppercase tracking-widest transition-all flex items-center gap-2 cursor-pointer shadow-xs"
              >
                <ArrowLeft size={14} />
                <span>{returnOrigin ? `Voltar para ${returnOrigin.sourceTitle || 'Origem'}` : 'Ver Lista Completa de Alunos'}</span>
              </button>
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="flex items-center gap-3 sm:gap-5 min-w-0">
                <div className="relative group shrink-0">
                  <div className="w-16 sm:w-20 h-22 sm:h-28 rounded-none bg-white shadow-sm flex items-center justify-center text-slate-400 overflow-hidden border border-slate-200 relative">
                    {formData.photo_url ? (
                      <img src={formData.photo_url} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <GraduationCap size={32} />
                    )}
                    
                    {uploadingPhoto && (
                      <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-[1px] flex items-center justify-center">
                        <Loader2 className="text-white animate-spin" size={20} />
                      </div>
                    )}
                  </div>
                  {isEditing && !uploadingPhoto && (
                    <div className="absolute inset-0 bg-black/40 rounded-none opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                      <button 
                        onClick={() => setShowWebcam(true)}
                        className="p-1.5 bg-white text-slate-800 rounded hover:scale-105 transition-transform"
                        title="Tirar Foto"
                      >
                        <Camera size={14} />
                      </button>
                      <label className="p-1.5 bg-white text-slate-800 rounded hover:scale-105 transition-transform cursor-pointer" title="Upload Foto">
                        <Upload size={14} />
                        <input type="file" className="hidden" accept="image/*" onChange={handlePhotoUpload} />
                      </label>
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-base sm:text-lg font-bold text-slate-800 tracking-tight leading-tight truncate">
                    {isEditing ? (selectedStudent ? 'Editar Aluno' : 'Novo Registro') : formData.name}
                  </h3>
                  <div className="flex flex-wrap items-center gap-2 sm:gap-3 mt-1.5">
                    <span className="text-[10.5px] font-mono font-bold text-slate-700 bg-slate-100 px-2 py-0.5 border border-slate-300 rounded uppercase tracking-wide truncate">
                      Matrícula: {formatRegistrationNumber(formData.registration_number)}
                    </span>
                    <span className={cn(
                      "px-1.5 py-0.5 rounded text-[9px] font-bold uppercase border tracking-wider shrink-0",
                      formData.status === 'Ativo' ? "bg-emerald-50 text-emerald-700 border-emerald-100" : "bg-slate-50 text-slate-500 border-slate-200"
                    )}>
                      {formData.status}
                    </span>
                    {hasParallelCourses && (
                      <span className="px-2 py-0.5 rounded-none text-[9.5px] font-black uppercase tracking-wider bg-amber-100 text-amber-950 border border-amber-400 shadow-2xs flex items-center gap-1.5 shrink-0 animate-in fade-in" title={`Aluno com ${secondaryEnrollments.length + 1} matrículas ativas simultâneas`}>
                        <Layers size={11} className="text-amber-700 shrink-0" />
                        <span>{secondaryEnrollments.length + 1} Cursos em Paralelo</span>
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 w-full md:w-auto md:justify-end">
                {!isEditing && selectedStudent && (
                  <>
                    <button 
                      onClick={handleCloseFicha}
                      className="h-10 w-10 bg-slate-100 border border-slate-300 text-slate-700 rounded-none hover:text-slate-900 hover:bg-slate-200 hover:border-slate-400 transition-all flex items-center justify-center shadow-sm cursor-pointer"
                      title={returnOrigin ? `Fechar e voltar para ${returnOrigin.sourceTitle || 'origem'}` : "Fechar Ficha (Voltar à lista)"}
                      aria-label={returnOrigin ? `Fechar e voltar para ${returnOrigin.sourceTitle || 'origem'}` : "Fechar Ficha"}
                    >
                      <ArrowLeft size={18} />
                    </button>

                    <button 
                      onClick={handlePrint}
                      className="h-10 w-10 bg-white border border-slate-200 text-slate-500 rounded-none hover:text-slate-800 hover:bg-slate-50 transition-all flex items-center justify-center shadow-sm cursor-pointer"
                      title="Imprimir Ficha"
                      aria-label="Imprimir Ficha"
                    >
                      <Printer size={16} />
                    </button>
                    
                    <button 
                      onClick={() => navigate('/contributions', { state: { studentId: selectedStudent.id } })}
                      className="h-10 w-10 bg-emerald-50 border border-emerald-200 text-emerald-600 rounded-none hover:text-emerald-800 hover:bg-emerald-100/50 transition-all flex items-center justify-center shadow-sm cursor-pointer"
                      title="Financeiro do Aluno"
                      aria-label="Financeiro do Aluno"
                    >
                      <DollarSign size={18} />
                    </button>

                    <button 
                      onClick={() => setIsEditing(true)}
                      className="h-10 w-10 bg-blue-50 border border-blue-200 text-blue-700 rounded-none hover:text-blue-900 hover:bg-blue-100/60 transition-all flex items-center justify-center shadow-sm cursor-pointer"
                      title="Editar Ficha"
                      aria-label="Editar Ficha"
                    >
                      <Edit2 size={16} />
                    </button>
                  </>
                )}
                {isEditing && (
                  <>
                    {selectedStudent && (
                      canDelete ? (
                        <button 
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setShowDeleteConfirm(true);
                          }}
                          className="h-10 px-4 bg-red-50 border border-red-200 hover:bg-red-100 hover:border-red-300 text-red-700 rounded-none text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-sm uppercase tracking-wide mr-auto"
                          title="Excluir Aluno"
                        >
                          <Trash2 size={16} />
                          <span className="hidden sm:inline">Excluir Aluno</span>
                        </button>
                      ) : (
                        <button 
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleToggleStudentStatus();
                          }}
                          className={cn(
                            "h-10 px-4 border rounded-none text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-sm uppercase tracking-wide mr-auto",
                            formData.status === 'Inativo'
                              ? "bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100"
                              : "bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100"
                          )}
                          title={formData.status === 'Inativo' ? "Reativar Aluno" : "Inativar Aluno (Exclusão física vedada para Assistente)"}
                        >
                          <UserX size={16} />
                          <span className="hidden sm:inline">
                            {formData.status === 'Inativo' ? "Reativar Aluno" : "Inativar Aluno"}
                          </span>
                        </button>
                      )
                    )}
                    <button 
                      onClick={() => {
                        setIsEditing(false);
                        setUploadingPhoto(false);
                        if (selectedStudent) {
                          setFormData(selectedStudent);
                        } else {
                          setSelectedStudent(null);
                          setFormData(INITIAL_STUDENT_STATE);
                          if (returnOrigin) {
                            handleCloseFicha();
                          }
                        }
                      }}
                      className="h-10 px-4 bg-rose-50 border border-rose-200 hover:bg-rose-100 hover:border-rose-300 text-rose-700 rounded-none text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-sm"
                    >
                      <X size={15} />
                      <span className="uppercase tracking-wider text-[10px] hidden sm:inline">Cancelar Edição</span>
                      <span className="uppercase tracking-wider text-[10px] sm:hidden">Cancelar</span>
                    </button>
                    <button 
                      onClick={handleSave}
                      disabled={loading || uploadingPhoto}
                      className="h-10 px-5 bg-[#00174b] hover:bg-indigo-950 text-white rounded-none text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-lg hover:scale-[1.01] active:scale-95 disabled:opacity-50"
                    >
                      {loading ? (
                        <>
                          <Loader2 size={15} className="animate-spin" />
                          <span className="uppercase tracking-wider text-[10px]">Processando...</span>
                        </>
                      ) : (
                        <>
                          <Save size={15} />
                          <span className="uppercase tracking-wider text-[10px] hidden sm:inline">Salvar Dados da Ficha</span>
                          <span className="uppercase tracking-wider text-[10px] sm:hidden">Salvar</span>
                        </>
                      )}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
              <div className="p-3 pb-24">
                {showWebcam ? (
                <div className="max-w-md mx-auto space-y-4">
                  <div className="aspect-video bg-black rounded-none overflow-hidden relative">
                    <Webcam
                      audio={false}
                      ref={webcamRef}
                      screenshotFormat="image/jpeg"
                      className="w-full h-full object-cover"
                      mirrored={false}
                      imageSmoothing={true}
                      forceScreenshotSourceSize={false}
                      disablePictureInPicture={true}
                      onUserMedia={() => {}}
                      onUserMediaError={() => {}}
                      screenshotQuality={1}
                    />
                  </div>
                  <div className="flex justify-center gap-4">
                    <button 
                      onClick={() => setShowWebcam(false)}
                      className="px-4 py-2 bg-slate-100 text-slate-600 rounded-none font-bold text-sm"
                    >
                      Cancelar
                    </button>
                    <button 
                      onClick={capturePhoto}
                      className="px-6 py-2 bg-slate-800 text-white rounded-none font-bold text-sm flex items-center gap-2"
                    >
                      <Camera size={18} />
                      Capturar Foto
                    </button>
                  </div>
                </div>
              ) : (
                <div className="max-w-4xl mx-auto space-y-4">
                  {/* Unallocated Quick Action Banner */}
                  {isStudentUnallocated && selectedStudent && !isEditing && (
                    <div className="bg-amber-50 border-2 border-amber-300 p-3 sm:p-4 rounded-none flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-amber-950 shadow-xs animate-in fade-in duration-200">
                      <div className="flex items-start sm:items-center gap-2.5">
                        <AlertTriangle className="text-amber-600 shrink-0 mt-0.5 sm:mt-0" size={20} />
                        <div>
                          <p className="text-xs font-black uppercase tracking-wider text-amber-900">
                            Aluno Sem Turma Ativa
                          </p>
                          <p className="text-[11px] text-amber-800 font-medium">
                            Este aluno não está matriculado em nenhuma turma ativa. Vincule-o agora:
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 w-full md:w-auto">
                        <select
                          value={quickAssignClassId}
                          onChange={(e) => setQuickAssignClassId(e.target.value)}
                          className="flex-1 md:w-64 px-2.5 py-1.5 bg-white border border-amber-300 text-xs font-semibold text-slate-800 outline-none"
                        >
                          <option value="">Selecione uma turma ativa...</option>
                          {scopedClasses.filter(c => c.status === 'Ativo' || !c.status).map(c => (
                            <option key={`quick-c-${c.id}`} value={c.id}>
                              {c.name} {c.code ? `(${c.code})` : ''} - {c.period || ''}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={handleQuickAssignClass}
                          disabled={!quickAssignClassId || isAssigningClass}
                          className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-xs font-bold uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 shadow-xs"
                        >
                          {isAssigningClass ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                          Vincular
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Basic Info */}
                  <section className="space-y-3">
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                      <UserIcon size={14} />
                      Dados Pessoais
                    </h4>
                    <div className="grid grid-cols-12 gap-3">
                      <div className="col-span-12 sm:col-span-3 space-y-1">
                        <label className="text-xs font-bold text-slate-700">Matrícula</label>
                        <input 
                          type="text"
                          disabled={!isEditing}
                          value={formData.registration_number || ''}
                          onChange={(e) => setFormData({...formData, registration_number: e.target.value})}
                          onKeyDown={handleKeyDown}
                          className="w-full px-4 py-2 bg-white border border-slate-200 rounded-none text-sm focus:ring-2 focus:ring-slate-500/10 disabled:opacity-60"
                          tabIndex={1}
                        />
                      </div>
                      <div className="col-span-12 sm:col-span-6 space-y-1">
                        <label className="text-xs font-bold text-slate-700">Nome Completo</label>
                        <input 
                          type="text"
                          disabled={!isEditing}
                          value={formData.name || ''}
                          onChange={(e) => setFormData({...formData, name: e.target.value})}
                          onKeyDown={handleKeyDown}
                          className="w-full px-4 py-2 bg-white border border-slate-200 rounded-none text-sm focus:ring-2 focus:ring-slate-500/10 disabled:opacity-60"
                          tabIndex={2}
                        />
                      </div>
                      <div className="col-span-12 sm:col-span-3 space-y-1">
                        <label className="text-xs font-bold text-slate-700">Situação</label>
                        <select 
                          disabled={!isEditing}
                          value={formData.status || 'Ativo'}
                          onChange={(e) => setFormData({...formData, status: e.target.value as any})}
                          onKeyDown={handleKeyDown}
                          className="w-full px-4 py-2 bg-white border border-slate-200 rounded-none text-sm focus:ring-2 focus:ring-slate-500/10 disabled:opacity-60"
                          tabIndex={3}
                        >
                          <option value="Ativo">Ativo</option>
                          <option value="Inativo">Inativo</option>
                          <option value="Concluído">Concluído</option>
                          <option value="Suspenso">Suspenso</option>
                        </select>
                      </div>
                      <div className="col-span-12 sm:col-span-3 space-y-1">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-bold text-slate-700">CPF</label>
                          {formData.cpf ? (
                            cpfValidation.rawLength === 11 ? (
                              cpfValidation.isValid ? (
                                <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 px-1 py-0.5 border border-emerald-200">
                                  ✓ Válido
                                </span>
                              ) : (
                                <span className="text-[10px] font-bold text-rose-800 bg-rose-50 px-1 py-0.5 border border-rose-200 animate-pulse">
                                  ⚠️ Incompatível
                                </span>
                              )
                            ) : (
                              <span className="text-[10px] text-amber-700 font-mono">
                                {cpfValidation.rawLength}/11
                              </span>
                            )
                          ) : null}
                        </div>
                        <input 
                          type="text"
                          disabled={!isEditing}
                          value={formData.cpf || ''}
                          onChange={(e) => setFormData({...formData, cpf: maskCPF(e.target.value)})}
                          onKeyDown={handleKeyDown}
                          className={cn(
                            "w-full px-4 py-2 bg-white border rounded-none text-sm focus:ring-2 disabled:opacity-60 transition-colors",
                            formData.cpf && cpfValidation.rawLength === 11 && !cpfValidation.isValid
                              ? "border-rose-400 focus:border-rose-500 focus:ring-rose-500/20 bg-rose-50/20"
                              : "border-slate-200 focus:ring-slate-500/10"
                          )}
                          placeholder="000.000.000-00"
                          tabIndex={4}
                        />
                        {formData.cpf && cpfValidation.rawLength === 11 && !cpfValidation.isValid && (
                          <span className="text-[10px] text-rose-600 font-bold block">
                            Dígitos verificadores inconsistentes
                          </span>
                        )}
                      </div>
                      <div className="col-span-12 sm:col-span-4 space-y-1">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-bold text-slate-700">RG / Identidade</label>
                          {formData.rg ? (
                            <span className={`text-[10px] font-bold uppercase tracking-tight px-1.5 py-0.5 rounded-none border ${
                              rgValidation.statusColor === 'success' 
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200' 
                                : rgValidation.statusColor === 'warning' 
                                  ? 'bg-amber-50 text-amber-800 border-amber-200' 
                                  : 'bg-rose-50 text-rose-800 border-rose-200'
                            }`}>
                              {rgValidation.typeLabel}
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-400 font-mono">
                              Máx. 14 chars
                            </span>
                          )}
                        </div>
                        <div className="relative">
                          <input 
                            type="text"
                            disabled={!isEditing}
                            value={formData.rg || ''}
                            onChange={(e) => setFormData({...formData, rg: maskRG(e.target.value)})}
                            onKeyDown={handleKeyDown}
                            maxLength={RG_MAX_FORMATTED_LENGTH}
                            className={`w-full px-4 py-2 bg-white border rounded-none text-sm focus:ring-2 focus:ring-slate-500/10 disabled:opacity-60 transition-colors ${
                              !formData.rg 
                                ? 'border-slate-200' 
                                : rgValidation.isValid 
                                  ? 'border-emerald-300 focus:border-emerald-500' 
                                  : 'border-amber-300 focus:border-amber-500'
                            }`}
                            placeholder="00.000.000-0"
                            tabIndex={5}
                          />
                        </div>
                        <div className="flex items-center justify-between text-[10px] px-0.5">
                          <span className={formData.rg && !rgValidation.isValid ? 'text-amber-700 font-medium' : 'text-slate-400'}>
                            {rgValidation.helperText}
                          </span>
                          <span className="text-slate-400 font-mono">
                            {(formData.rg || '').length}/{RG_MAX_FORMATTED_LENGTH}
                          </span>
                        </div>
                      </div>
                      <div className="col-span-8 sm:col-span-3 space-y-1">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-bold text-slate-700">Data de Nascimento</label>
                          {!birthDateValidation.isValid ? (
                            <span className="text-[10px] font-black text-rose-800 bg-rose-50 px-1 py-0.5 border border-rose-200 animate-pulse">
                              ⚠️ {birthDateValidation.message}
                            </span>
                          ) : isStudentBirthdayToday ? (
                            <span className="text-[10px] font-black text-amber-700 animate-pulse">🎂 Hoje!</span>
                          ) : null}
                        </div>
                        <input 
                          type="date"
                          disabled={!isEditing}
                          value={formData.birth_date || ''}
                          onChange={(e) => setFormData({...formData, birth_date: e.target.value})}
                          onKeyDown={handleKeyDown}
                          className={cn(
                            "w-full px-3 py-2 bg-white border rounded-none text-sm focus:ring-2 disabled:opacity-60 text-slate-900 font-medium",
                            !birthDateValidation.isValid
                              ? "border-rose-400 focus:border-rose-500 focus:ring-rose-500/20 bg-rose-50/20"
                              : "border-slate-200 focus:ring-slate-500/10"
                          )}
                          tabIndex={6}
                        />
                      </div>
                      <div className="col-span-4 sm:col-span-2 space-y-1">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-bold text-slate-700">Idade</label>
                          {calculatedAge !== null && (
                            <span className="text-[10px] text-slate-400 font-medium hidden sm:inline">
                              {calculatedAge === 1 ? 'ano' : 'anos'}
                            </span>
                          )}
                        </div>
                        <div className="relative">
                          <input 
                            type="text"
                            readOnly
                            disabled
                            value={
                              !birthDateValidation.isValid && birthDateValidation.isFuture
                                ? 'Inválida'
                                : calculatedAge !== null 
                                  ? `${calculatedAge} ${calculatedAge === 1 ? 'ano' : 'anos'}` 
                                  : ''
                            }
                            placeholder="---"
                            className={cn(
                              "w-full px-2 py-2 border rounded-none text-sm font-bold text-center select-none disabled:opacity-90 font-mono",
                              !birthDateValidation.isValid
                                ? "bg-rose-50 border-rose-300 text-rose-700"
                                : "bg-slate-100 border-slate-200 text-slate-800"
                            )}
                            title={
                              !birthDateValidation.isValid
                                ? birthDateValidation.message
                                : calculatedAge !== null 
                                  ? `Idade calculada: ${calculatedAge} anos completos` 
                                  : 'Idade calculada automaticamente a partir da data de nascimento'
                            }
                            tabIndex={-1}
                          />
                        </div>
                      </div>
                      {/* Turma Principal (Vínculo Direto) */}
                      <div className="col-span-12 sm:col-span-5 space-y-1">
                        <label className="text-xs font-bold text-slate-700">Turma Principal (Vínculo Direto)</label>
                        <select 
                          disabled={!isEditing}
                          value={formData.class_id || ''}
                          onChange={(e) => {
                            const newClassId = e.target.value;
                            const targetClass = classes.find(c => c.id === newClassId);
                            const detectedCourse = targetClass ? (targetClass.course || detectCourseFromClass(targetClass, coursesList)) : '';
                            const cronoStartDate = targetClass ? getScheduleStartDateForClass(targetClass) : '';
                            const resolvedStartDate = cronoStartDate || targetClass?.start_date || '';
                            const classUnit = targetClass?.unit_id || formData.unit_id || 'matriz';

                            setFormData(prev => ({
                              ...prev,
                              class_id: newClassId,
                              course: detectedCourse || prev.course,
                              ...(classUnit ? { unit_id: classUnit } : {}),
                              ...(resolvedStartDate ? { start_date: resolvedStartDate } : {})
                            }));

                            // Sincroniza a data de início da turma caso ainda não esteja definida ou diferente do cronograma
                            if (targetClass && cronoStartDate && targetClass.start_date !== cronoStartDate) {
                              saveData('classes', targetClass.id, { ...targetClass, start_date: cronoStartDate })
                                .then(() => {
                                  setClasses(prev => prev.map(c => c.id === targetClass.id ? { ...c, start_date: cronoStartDate } : c));
                                })
                                .catch(e => console.warn('Could not sync class start_date:', e));
                            }
                          }}
                          onKeyDown={handleKeyDown}
                          className="w-full px-4 py-2 bg-white border border-slate-200 rounded-none text-sm focus:ring-2 focus:ring-slate-500/10 disabled:opacity-60 font-bold"
                          tabIndex={7}
                        >
                          <option value="">
                            {modalAvailableClasses.length === 0 
                              ? 'Nenhuma turma disponível nesta unidade' 
                              : 'Selecione uma turma'}
                          </option>
                          {modalAvailableClasses.filter(c => c.status === 'Ativo' || c.id === formData.class_id).map((c, cIdx) => (
                            <option key={`st-cls-form-${c.id || cIdx}-${cIdx}`} value={c.id}>
                              {c.name} ({c.code}) - {c.period}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Curso / Identificação - Campo Somente Informativo */}
                      <div className="col-span-12 sm:col-span-4 space-y-1">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-bold text-slate-700">Curso / Identificação</label>
                          <span className="text-[10px] text-slate-400 font-medium">Informativo</span>
                        </div>
                        <div className="relative">
                          <input 
                            type="text"
                            readOnly
                            disabled
                            value={effectiveCourseName || ''}
                            placeholder="Vinculado à turma..."
                            className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-none text-sm font-bold text-slate-800 truncate select-none disabled:opacity-90 pr-8"
                            title={effectiveCourseName ? `Curso: ${effectiveCourseName}` : 'Curso vinculado à turma selecionada'}
                            tabIndex={-1}
                          />
                          <BookOpen size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                        </div>
                      </div>

                      {/* Data Início da Turma - Campo Somente Informativo com mesmo comprimento da Data de Nascimento (3 colunas) */}
                      <div className="col-span-12 sm:col-span-3 space-y-1">
                        <div className="flex items-center justify-between gap-1">
                          <label className="text-xs font-bold text-slate-700 whitespace-nowrap">Data Início da Turma</label>
                          {effectiveClassStartDate && (
                            <span className="text-[10px] text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.5 border border-emerald-200 whitespace-nowrap shrink-0">
                              Cronograma
                            </span>
                          )}
                        </div>
                        <div className="relative">
                          <input 
                            type="text"
                            readOnly
                            disabled
                            value={effectiveClassStartDate ? formatDateForDisplay(effectiveClassStartDate) : ''}
                            placeholder="DD/MM/AAAA"
                            className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-none text-sm font-bold text-slate-800 select-none disabled:opacity-90 font-mono pr-8"
                            title={effectiveClassStartDate ? `Data de início definida no cronograma: ${formatDateForDisplay(effectiveClassStartDate)}` : 'Data definida no cadastro e cronograma da turma'}
                            tabIndex={-1}
                          />
                          <Calendar size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                        </div>
                      </div>

                      {hasMultipleUnits && (
                        <div className="col-span-12 bg-blue-50/60 p-2.5 border border-blue-200/80 space-y-1">
                          <div className="flex items-center justify-between">
                            <label className="text-xs font-bold text-blue-950 flex items-center gap-1.5">
                              <Building2 size={13} className="text-blue-700" />
                              Polo / Unidade Educacional do Aluno
                            </label>
                            <span className="text-[10px] text-blue-700 font-semibold bg-blue-100/70 px-2 py-0.5 rounded">
                              🔄 Transferência: selecione o polo de destino para atualizar as turmas
                            </span>
                          </div>
                          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                            <select
                              disabled={!isEditing}
                              value={formData.unit_id || (globalUnitId !== 'all' ? globalUnitId : 'matriz')}
                              onChange={(e) => {
                                const newUnitId = e.target.value;
                                const currentCls = classes.find(c => c.id === formData.class_id);
                                const isClsInNewUnit = currentCls ? isItemInUnit(getItemUnitId(currentCls), newUnitId, activeUnits) : false;
                                setFormData(prev => ({
                                  ...prev,
                                  unit_id: newUnitId,
                                  // Ao transferir de polo, limpa turma caso pertença a outra unidade para forçar seleção de turma da nova unidade
                                  class_id: isClsInNewUnit ? prev.class_id : '',
                                  course: isClsInNewUnit ? prev.course : ''
                                }));
                              }}
                              onKeyDown={handleKeyDown}
                              tabIndex={10}
                              className="flex-1 px-3 py-1.5 bg-white border border-blue-200 text-xs font-bold text-slate-900 focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60"
                            >
                              {activeUnits.map(u => (
                                <option key={u.id} value={u.id}>
                                  {u.name} {u.is_main || u.id === 'matriz' ? '(Matriz Diocesana)' : ''}
                                </option>
                              ))}
                            </select>
                            <span className="text-[11px] text-blue-700 font-medium">
                              {formData.unit_id ? `Polo: ${getUnitName(formData.unit_id)}` : 'Polo Padrão Matriz'}
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Enrollment Management - Integrated directly */}
                      {selectedStudent?.id ? (
                        <div className={cn(
                          "col-span-12 p-3.5 sm:p-5 rounded-none space-y-3 sm:space-y-4 mt-2 mb-6 shadow-sm overflow-hidden transition-all",
                          hasParallelCourses 
                            ? "bg-gradient-to-r from-amber-50/90 via-orange-50/50 to-amber-50/90 border-2 border-amber-400 ring-2 ring-amber-400/20" 
                            : "bg-slate-50/50 border border-slate-200"
                        )}>
                          <div className={cn(
                            "flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b pb-2.5",
                            hasParallelCourses ? "border-amber-200" : "border-slate-200/70"
                          )}>
                            <div className="flex items-center gap-2.5">
                              <div className={cn(
                                "w-7 h-7 flex items-center justify-center text-white shrink-0 shadow-xs",
                                hasParallelCourses ? "bg-amber-600 ring-2 ring-amber-300" : "bg-slate-800"
                              )}>
                                <BookOpen size={14} />
                              </div>
                              <div>
                                <h4 className={cn(
                                  "text-[11px] font-black uppercase tracking-wider flex items-center gap-2",
                                  hasParallelCourses ? "text-amber-950" : "text-slate-800"
                                )}>
                                  <span>Matrículas em Outras Turmas (Cursos em Paralelo)</span>
                                </h4>
                                {hasParallelCourses ? (
                                  <p className="text-[10px] text-amber-800 font-bold uppercase tracking-wider">
                                    ⚡ Aluno cursando {secondaryEnrollments.length + 1} turmas simultâneas
                                  </p>
                                ) : (
                                  <p className="text-[9.5px] text-slate-400 font-medium uppercase tracking-wider">
                                    Vincule o aluno a outras turmas simultâneas se aplicável
                                  </p>
                                )}
                              </div>
                            </div>

                            {hasParallelCourses && (
                              <span className="self-start sm:self-auto px-2.5 py-1 bg-amber-200/90 text-amber-950 text-[10px] font-black border border-amber-400 uppercase tracking-wider shadow-2xs flex items-center gap-1.5 shrink-0">
                                <Sparkles size={12} className="text-amber-700 animate-pulse shrink-0" />
                                {secondaryEnrollments.length} {secondaryEnrollments.length === 1 ? 'Curso Adicional Ativo' : 'Cursos Adicionais Ativos'}
                              </span>
                            )}
                          </div>

                          <div className="flex flex-col sm:flex-row gap-2">
                            <select 
                              disabled={!isEditing}
                              value={enrollClassId}
                              onChange={(e) => setEnrollClassId(e.target.value)}
                              className={cn(
                                "w-full sm:flex-1 px-3 py-2 bg-white border rounded-none text-xs outline-none shadow-sm disabled:opacity-50 min-w-0 font-medium",
                                hasParallelCourses ? "border-amber-300 focus:ring-1 focus:ring-amber-500" : "border-slate-200 focus:ring-1 focus:ring-slate-500/10"
                              )}
                            >
                              <option value="">
                                {modalAvailableClasses.filter(c => c.status === 'Ativo' && c.id !== primaryClsId && !studentEnrollments.some(e => e.class_id === c.id && (e.status || 'Ativo') === 'Ativo')).length === 0
                                  ? 'Nenhuma outra turma disponível nesta unidade'
                                  : 'Matricular em outra turma...'}
                              </option>
                              {modalAvailableClasses.filter(c => c.status === 'Ativo' && c.id !== primaryClsId && !studentEnrollments.some(e => e.class_id === c.id && (e.status || 'Ativo') === 'Ativo')).map((c, cIdx) => (
                                <option key={`st-cls-oth-${c.id || cIdx}-${cIdx}`} value={c.id}>
                                  {c.name} {c.code ? `(${c.code})` : ''} - {c.period || ''}
                                </option>
                              ))}
                            </select>
                            <button
                              onClick={() => {
                                handleOpenEnrollModal(enrollClassId);
                              }}
                              disabled={!enrollClassId || !isEditing}
                              className={cn(
                                "w-full sm:w-auto px-4 py-2 rounded-none text-[10px] font-bold uppercase transition-all disabled:opacity-50 flex items-center justify-center gap-1.5 shadow-sm shrink-0 whitespace-nowrap cursor-pointer",
                                hasParallelCourses 
                                  ? "bg-amber-600 hover:bg-amber-700 text-white" 
                                  : "bg-slate-800 hover:bg-slate-900 text-white"
                              )}
                            >
                              <Plus size={14} />
                              Matricular
                            </button>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 max-h-[220px] overflow-y-auto pr-1">
                            {secondaryEnrollments.length === 0 ? (
                              <div className="col-span-full py-4 text-center bg-white/70 rounded-none border border-dashed border-slate-200">
                                <p className="text-[10px] text-slate-500 font-medium uppercase tracking-tight">
                                  {primaryClsId ? 'Nenhuma turma adicional vinculada (Aluno matriculado na turma principal acima)' : 'Nenhuma matrícula adicional'}
                                </p>
                              </div>
                            ) : (
                              secondaryEnrollments.map((enrollment, enIdx) => {
                                const targetClass = classes.find(c => c.id === enrollment.class_id);
                                const courseName = targetClass ? detectCourseFromClass(targetClass, coursesList) : '';
                                return (
                                  <div 
                                    key={`st-enr-${enrollment.id || enIdx}-${enIdx}`} 
                                    className="flex items-center justify-between p-3 bg-white rounded-none border-2 border-amber-300 border-l-[6px] border-l-amber-500 shadow-xs group hover:border-amber-400 hover:shadow-sm transition-all"
                                  >
                                    <div className="flex items-center gap-3 min-w-0">
                                      <div className="w-9 h-9 rounded-none bg-amber-100 text-amber-900 border border-amber-200 flex items-center justify-center shrink-0 font-bold shadow-2xs">
                                        <GraduationCap size={16} />
                                      </div>
                                      <div className="leading-tight min-w-0">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                          <span className="text-[8.5px] font-black uppercase tracking-wider px-1.5 py-0.5 bg-amber-100 text-amber-950 border border-amber-300">
                                            ⚡ Curso em Paralelo
                                          </span>
                                          {targetClass?.period && (
                                            <span className="text-[8.5px] font-bold uppercase tracking-wider px-1 py-0.5 text-slate-600 bg-slate-100 border border-slate-200">
                                              {targetClass.period}
                                            </span>
                                          )}
                                        </div>
                                        <p className="text-xs font-black text-slate-900 uppercase truncate mt-1" title={targetClass?.name}>
                                          {targetClass?.name || 'Turma N/I'}
                                        </p>
                                        <div className="flex items-center gap-2 text-[9px] text-slate-500 font-medium uppercase tracking-wider mt-0.5">
                                          {courseName && <span className="font-bold text-amber-900">{courseName}</span>}
                                          {enrollment.enrollment_date && (
                                            <span>• Matrícula: {formatDateForDisplay(enrollment.enrollment_date)}</span>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                    {isEditing && (
                                      <button 
                                        onClick={() => handleRemoveEnrollment(enrollment.id)}
                                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-none transition-all shrink-0 ml-2 cursor-pointer"
                                        title="Remover Matrícula Adicional"
                                      >
                                        <X size={15} />
                                      </button>
                                    )}
                                  </div>
                                );
                              })
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="col-span-12 p-4 bg-slate-50 border border-dashed border-slate-200 rounded-none mb-6 text-center">
                          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                            Salve o registro para habilitar matrículas em outras turmas
                          </p>
                        </div>
                      )}
                    </div>
                  </section>

                  {/* Contact & Address */}
                  <section className="space-y-3">
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                      <MapPin size={14} />
                      Endereço e Contato
                    </h4>
                    <div className="grid grid-cols-12 gap-3">
                      {/* Linha 1: CEP (estilo Correios com fundo/sombra azulada), Logradouro e Nº */}
                      <div className="col-span-12 sm:col-span-3 lg:col-span-2 space-y-1">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-bold text-blue-900 flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-600 inline-block"></span>
                            CEP
                          </label>
                          {loadingCep && (
                            <span className="text-[10px] text-blue-600 flex items-center gap-1 font-medium">
                              <Loader2 size={10} className="animate-spin" /> Buscando...
                            </span>
                          )}
                          {cepSuccess && (
                            <span className="text-[10px] text-emerald-600 flex items-center gap-1 font-medium">
                              <CheckCircle2 size={10} /> OK!
                            </span>
                          )}
                        </div>
                        <div className="relative">
                          <input 
                            type="text"
                            disabled={!isEditing}
                            value={formData.address_zip || ''}
                            onChange={(e) => handleCepChange(e.target.value)}
                            onKeyDown={handleKeyDown}
                            maxLength={9}
                            className="w-full px-3 py-2 bg-blue-50/70 border border-blue-200 rounded-none text-sm font-mono font-bold text-blue-950 shadow-xs shadow-blue-500/10 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60 transition-all"
                            placeholder="00000-000"
                            tabIndex={11}
                          />
                        </div>
                      </div>

                      <div className="col-span-12 sm:col-span-7 lg:col-span-9 space-y-1">
                        <label className="text-xs font-bold text-slate-700">Logradouro (Rua, Avenida...)</label>
                        <input 
                          type="text"
                          disabled={!isEditing}
                          value={formData.address_street || ''}
                          onChange={(e) => setFormData({...formData, address_street: e.target.value})}
                          onKeyDown={handleKeyDown}
                          placeholder="Rua, Avenida, Praça..."
                          className="w-full px-4 py-2 bg-white border border-slate-200 rounded-none text-sm focus:ring-2 focus:ring-slate-500/10 disabled:opacity-60"
                          tabIndex={12}
                        />
                      </div>

                      <div className="col-span-12 sm:col-span-2 lg:col-span-1 space-y-1">
                        <label className="text-xs font-bold text-slate-700">Nº</label>
                        <input 
                          type="text"
                          disabled={!isEditing}
                          value={formData.address_number || ''}
                          onChange={(e) => setFormData({...formData, address_number: e.target.value})}
                          onKeyDown={handleKeyDown}
                          maxLength={6}
                          placeholder="Nº"
                          className="w-full px-2 py-2 bg-white border border-slate-200 rounded-none text-sm font-mono font-bold focus:ring-2 focus:ring-slate-500/10 disabled:opacity-60 text-slate-800 text-center"
                          tabIndex={13}
                        />
                      </div>

                      {/* Linha 2: Complemento, Bairro, Cidade e UF na mesma linha em perfeito alinhamento */}
                      <div className="col-span-12 sm:col-span-3 lg:col-span-3 space-y-1">
                        <label className="text-xs font-bold text-slate-700">Complemento</label>
                        <input 
                          type="text"
                          disabled={!isEditing}
                          value={formData.address_complement || ''}
                          onChange={(e) => setFormData({...formData, address_complement: e.target.value})}
                          onKeyDown={handleKeyDown}
                          placeholder="Apto, Bloco..."
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-none text-sm focus:ring-2 focus:ring-slate-500/10 disabled:opacity-60"
                          tabIndex={14}
                        />
                      </div>

                      <div className="col-span-12 sm:col-span-4 lg:col-span-4 space-y-1">
                        <label className="text-xs font-bold text-slate-700">Bairro</label>
                        <input 
                          type="text"
                          disabled={!isEditing}
                          value={formData.address_neighborhood || ''}
                          onChange={(e) => setFormData({...formData, address_neighborhood: e.target.value})}
                          onKeyDown={handleKeyDown}
                          placeholder="Bairro"
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-none text-sm focus:ring-2 focus:ring-slate-500/10 disabled:opacity-60"
                          tabIndex={15}
                        />
                      </div>

                      <div className="col-span-12 sm:col-span-3 lg:col-span-4 space-y-1">
                        <label className="text-xs font-bold text-slate-700">Cidade</label>
                        <input 
                          type="text"
                          disabled={!isEditing}
                          value={formData.address_city || ''}
                          onChange={(e) => setFormData({...formData, address_city: e.target.value})}
                          onKeyDown={handleKeyDown}
                          placeholder="Cidade"
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-none text-sm focus:ring-2 focus:ring-slate-500/10 disabled:opacity-60"
                          tabIndex={16}
                        />
                      </div>

                      <div className="col-span-12 sm:col-span-2 lg:col-span-1 space-y-1">
                        <label className="text-xs font-bold text-slate-700">UF</label>
                        <input 
                          type="text"
                          disabled={!isEditing}
                          value={formData.address_state || ''}
                          onChange={(e) => setFormData({...formData, address_state: e.target.value.toUpperCase()})}
                          onKeyDown={handleKeyDown}
                          maxLength={2}
                          placeholder="SP"
                          className="w-full px-2 py-2 bg-white border border-slate-200 rounded-none text-sm focus:ring-2 focus:ring-slate-500/10 disabled:opacity-60 uppercase text-center font-bold"
                          tabIndex={17}
                        />
                      </div>

                      <div className="col-span-12 sm:col-span-7 space-y-1">
                        <label className="text-xs font-bold text-slate-700">E-mail</label>
                        <input 
                          type="email"
                          disabled={!isEditing}
                          value={formData.email || ''}
                          onChange={(e) => setFormData({...formData, email: e.target.value})}
                          onKeyDown={handleKeyDown}
                          placeholder="exemplo@email.com"
                          className="w-full px-4 py-2 bg-white border border-slate-200 rounded-none text-sm focus:ring-2 focus:ring-slate-500/10 disabled:opacity-60"
                          tabIndex={18}
                        />
                      </div>
                      <div className="col-span-12 sm:col-span-5 space-y-1">
                        <label className="text-xs font-bold text-slate-700 font-bold text-slate-800">Celular</label>
                        <div className="relative">
                          <input 
                            type="text"
                            disabled={!isEditing}
                            value={formData.phone_mobile || ''}
                            onChange={(e) => setFormData({...formData, phone_mobile: maskPhone(e.target.value)})}
                            onKeyDown={handleKeyDown}
                            className="w-full px-4 py-2 bg-white border border-slate-200 rounded-none text-sm font-normal focus:ring-2 focus:ring-slate-500/10 disabled:opacity-60 pr-10"
                            placeholder="(00) 00000-0000"
                            tabIndex={19}
                          />
                          <button
                            type="button"
                            disabled={!isEditing}
                            onClick={() => setFormData({ ...formData, phone_mobile_is_whatsapp: !formData.phone_mobile_is_whatsapp })}
                            className={cn(
                              "absolute right-3 top-1/2 -translate-y-1/2 transition-all p-1 rounded-none",
                              formData.phone_mobile_is_whatsapp ? "text-green-500 bg-green-50" : "text-slate-300 hover:text-slate-400"
                            )}
                            title={formData.phone_mobile_is_whatsapp ? "Número com WhatsApp" : "Marcar como WhatsApp"}
                          >
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L0 24l6.335-1.662c1.72.937 3.659 1.43 5.623 1.43h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                            </svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  </section>

                  {/* Pastoral Info */}
                  <section className="space-y-3">
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                      <GraduationCap size={14} />
                      Informações Pastorais
                    </h4>
                    <div className="grid grid-cols-12 gap-3">
                      <div className="col-span-12 sm:col-span-5 space-y-1">
                        <label className="text-xs font-bold text-slate-700">Paróquia Origem</label>
                        <select 
                          disabled={!isEditing}
                          value={formData.parish || ''}
                          onChange={(e) => {
                            const pName = e.target.value;
                            const parishData = parishesList.find(p => p.name === pName);
                            const updates: any = { parish: pName };
                            
                            if (parishData?.forania_id) {
                              const foraria = forariesList.find(f => f.id === parishData.forania_id);
                              if (foraria) updates.forania = foraria.name;
                            }
                            
                            setFormData({...formData, ...updates});
                          }}
                          onKeyDown={handleKeyDown}
                          className="w-full px-4 py-2 bg-white border border-slate-200 rounded-none text-sm focus:ring-2 focus:ring-slate-500/10 disabled:opacity-60 font-bold"
                          tabIndex={20}
                        >
                          <option value="">Selecione...</option>
                          {parishesList.map((p, pIdx) => (
                            <option key={`st-parish-opt-${p.id || pIdx}-${pIdx}`} value={p.name}>{p.name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="col-span-12 sm:col-span-4 space-y-1">
                        <label className="text-xs font-bold text-slate-700">Forania</label>
                        <select 
                          disabled={!isEditing}
                          value={formData.forania || ''}
                          onChange={(e) => setFormData({...formData, forania: e.target.value})}
                          onKeyDown={handleKeyDown}
                          className="w-full px-4 py-2 bg-white border border-slate-200 rounded-none text-sm focus:ring-2 focus:ring-slate-500/10 disabled:opacity-60 font-bold"
                          tabIndex={21}
                        >
                          <option value="">Selecione...</option>
                          {forariesList.map((f, fIdx) => (
                            <option key={`st-forania-opt-${f.id || fIdx}-${fIdx}`} value={f.name}>{f.name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="col-span-12 sm:col-span-3 space-y-1">
                        <label className="text-xs font-bold text-slate-700">Pastoral</label>
                        <input 
                          type="text"
                          disabled={!isEditing}
                          value={formData.pastoral_participates || ''}
                          onChange={(e) => setFormData({...formData, pastoral_participates: e.target.value})}
                          onKeyDown={handleKeyDown}
                          className="w-full px-4 py-2 bg-white border border-slate-200 rounded-none text-sm focus:ring-2 focus:ring-slate-500/10 disabled:opacity-60"
                          tabIndex={22}
                        />
                      </div>
                      <div className="col-span-12 sm:col-span-12 pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                        <span className="flex items-center gap-1 font-bold text-slate-600">
                          <Calendar size={13} className="text-slate-400" />
                          Data do Registro Inicial:
                        </span>
                        <span className="font-mono font-bold text-slate-700 bg-slate-100 px-2 py-0.5 border border-slate-200">
                          {formData.created_at ? formatDateForDisplay(formData.created_at) : 'Será preenchido automaticamente ao salvar'}
                        </span>
                      </div>
                    </div>
                  </section>

                  {/* Seção Amarração da Taxa de Matrícula / Inscrição (Ao Final da Ficha) */}
                  <section className="space-y-3 pt-5 border-t-2 border-indigo-200">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 bg-[#00174b] text-white rounded-none flex items-center justify-center shadow-xs">
                          <DollarSign size={14} />
                        </div>
                        <div>
                          <h4 className="text-xs font-black text-slate-900 uppercase tracking-widest flex items-center gap-1.5">
                            Amarração da Taxa de Matrícula / Inscrição
                          </h4>
                          <p className="text-[10px] text-slate-500 font-medium">
                            Etapa final do preenchimento da ficha de matrícula
                          </p>
                        </div>
                      </div>
                      <span className="text-[10px] font-black text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 uppercase tracking-wider">
                        Financeiro & Matrícula
                      </span>
                    </div>

                    {formData.class_id ? (
                      paidEnrollmentFeeContrib ? (
                        /* CASO 1: Taxa já paga para este ano */
                        <div className="bg-emerald-50/90 border-2 border-emerald-500/80 p-3.5 sm:p-4 rounded-none shadow-xs">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="flex items-start sm:items-center gap-3">
                              <div className="w-10 h-10 bg-emerald-600 text-white rounded-none flex items-center justify-center shrink-0 shadow-xs">
                                <CheckCircle2 size={20} />
                              </div>
                              <div>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 bg-emerald-200 text-emerald-950 border border-emerald-300">
                                    ✓ Taxa de Matrícula Quitada
                                  </span>
                                  <span className="text-base font-mono font-black text-emerald-900">
                                    {formatCurrency(paidEnrollmentFeeContrib.amount)}
                                  </span>
                                  <span className="text-[11px] text-emerald-800 font-bold flex items-center gap-1">
                                    <Calendar size={12} />
                                    Pago em: {formatDateForDisplay(paidEnrollmentFeeContrib.payment_date)}
                                  </span>
                                  {paidEnrollmentFeeContrib.payment_method && (
                                    <span className="text-[10px] uppercase font-black px-2 py-0.5 bg-white text-emerald-900 border border-emerald-300 shadow-2xs">
                                      Forma: {paidEnrollmentFeeContrib.payment_method}
                                    </span>
                                  )}
                                </div>
                                <p className="text-[11px] text-emerald-800 font-medium mt-1">
                                  A taxa de inscrição deste aluno está regularizada no financeiro referente ao ano letivo {paidEnrollmentFeeContrib.reference_year || 'vigente'}.
                                </p>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                const targetCls = classes.find(c => c.id === (formData.class_id || selectedStudent?.class_id));
                                setReceiptModalData({
                                  student: selectedStudent || formData as any,
                                  classItem: targetCls,
                                  feeAmount: paidEnrollmentFeeContrib.amount,
                                  feeStatus: 'paid',
                                  paymentMethod: paidEnrollmentFeeContrib.payment_method || 'Dinheiro',
                                  paymentDate: paidEnrollmentFeeContrib.payment_date,
                                  observations: paidEnrollmentFeeContrib.observations || 'Taxa de Matrícula quitada na secretaria'
                                });
                              }}
                              className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 shadow-sm transition-all shrink-0 cursor-pointer self-start sm:self-auto"
                            >
                              <Receipt size={14} />
                              <span>Ver / Imprimir Recibo</span>
                            </button>
                          </div>
                        </div>
                      ) : isEditing ? (
                        /* CASO 2: Em Edição / Novo Aluno - Amarração da Taxa */
                        <div className="bg-gradient-to-r from-blue-50/70 via-indigo-50/50 to-blue-50/70 border-2 border-indigo-200 p-3.5 sm:p-4 rounded-none shadow-xs space-y-3.5">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-indigo-100 pb-2.5">
                            <div>
                              <h5 className="text-xs font-black text-indigo-950 uppercase tracking-wider flex items-center gap-1.5">
                                Definição da Taxa de Inscrição / Matrícula
                              </h5>
                              <p className="text-[10px] text-indigo-700 font-medium">
                                A taxa será vinculada e lançada automaticamente no financeiro ao salvar a ficha
                              </p>
                            </div>

                            <div className="flex items-center gap-1 bg-white p-1 border border-indigo-200 shadow-2xs">
                              <button
                                type="button"
                                onClick={() => setEnrollmentFeeStatus('paid')}
                                className={cn(
                                  "px-3 py-1 text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer",
                                  enrollmentFeeStatus === 'paid'
                                    ? "bg-emerald-600 text-white shadow-2xs"
                                    : "text-slate-600 hover:bg-slate-100"
                                )}
                              >
                                ✓ Pagar Agora
                              </button>
                              <button
                                type="button"
                                onClick={() => setEnrollmentFeeStatus('pending')}
                                className={cn(
                                  "px-3 py-1 text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer",
                                  enrollmentFeeStatus === 'pending'
                                    ? "bg-amber-500 text-white shadow-2xs"
                                    : "text-slate-600 hover:bg-slate-100"
                                )}
                              >
                                ⏳ Pendente
                              </button>
                              <button
                                type="button"
                                onClick={() => setEnrollmentFeeStatus('exempt')}
                                className={cn(
                                  "px-3 py-1 text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer",
                                  enrollmentFeeStatus === 'exempt'
                                    ? "bg-slate-700 text-white shadow-2xs"
                                    : "text-slate-600 hover:bg-slate-100"
                                )}
                              >
                                🛡️ Isento
                              </button>
                            </div>
                          </div>

                          {enrollmentFeeStatus === 'paid' && (
                            <div className="space-y-3 pt-1">
                              <div className="grid grid-cols-12 gap-3">
                                {/* Campo Valor Formatado como Moeda */}
                                <div className="col-span-12 sm:col-span-4 space-y-1">
                                  <label className="text-[10px] font-black text-slate-700 uppercase tracking-widest flex items-center justify-between">
                                    <span>Valor da Taxa</span>
                                    {isFeeAmountIncompatible ? (
                                      <span className="text-[9px] text-rose-600 font-bold normal-case animate-pulse">
                                        ⚠️ Incompatível (&gt; R$ 0,00)
                                      </span>
                                    ) : (
                                      <span className="text-[9px] text-indigo-600 font-bold normal-case">Tabela vigente</span>
                                    )}
                                  </label>
                                  <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">R$</span>
                                    <input
                                      type="text"
                                      value={enrollmentFeeAmountStr}
                                      onChange={(e) => handleFeeAmountChange(e.target.value)}
                                      onBlur={handleFeeAmountBlur}
                                      onKeyDown={(e) => e.key === 'Enter' && handleFeeAmountBlur()}
                                      className={cn(
                                        "w-full pl-9 pr-3 py-2 bg-white border rounded-none text-sm font-black text-slate-900 focus:ring-2 shadow-2xs placeholder:text-slate-300 transition-colors",
                                        isFeeAmountIncompatible
                                          ? "border-rose-400 focus:border-rose-500 focus:ring-rose-500/20 bg-rose-50/20"
                                          : "border-indigo-300 focus:ring-indigo-500/20"
                                      )}
                                      placeholder="0,00"
                                    />
                                  </div>
                                </div>

                                {/* Campo Data Formatado como Data */}
                                <div className="col-span-12 sm:col-span-4 space-y-1">
                                  <div className="flex items-center justify-between">
                                    <label className="text-[10px] font-black text-slate-700 uppercase tracking-widest">
                                      Data do Pagamento
                                    </label>
                                    {isFeeDateInFuture && (
                                      <span className="text-[9px] text-rose-600 font-bold animate-pulse">
                                        ⚠️ Data futura incompatível
                                      </span>
                                    )}
                                  </div>
                                  <div className="relative">
                                    <input
                                      type="date"
                                      value={enrollmentFeePaymentDate}
                                      onChange={(e) => setEnrollmentFeePaymentDate(e.target.value)}
                                      className={cn(
                                        "w-full px-3 py-2 bg-white border rounded-none text-xs font-bold text-slate-900 focus:ring-2 shadow-2xs h-[38px] transition-colors",
                                        isFeeDateInFuture
                                          ? "border-rose-400 focus:border-rose-500 focus:ring-rose-500/20 bg-rose-50/20"
                                          : "border-indigo-300 focus:ring-indigo-500/20"
                                      )}
                                    />
                                  </div>
                                </div>

                                {/* Campo Forma de Pagamento Padronizado com Contribuições (Dinheiro, PIX, Cartão) */}
                                <div className="col-span-12 sm:col-span-4 space-y-1">
                                  <label className="text-[10px] font-black text-slate-700 uppercase tracking-widest">
                                    Forma de Pagamento
                                  </label>
                                  <div className="grid grid-cols-3 gap-1.5 h-[38px]">
                                    {(['Dinheiro', 'PIX', 'Cartão'] as const).map((method) => (
                                      <button
                                        key={method}
                                        type="button"
                                        onClick={() => setEnrollmentFeePaymentMethod(method)}
                                        className={cn(
                                          "h-full rounded-none text-xs font-black uppercase tracking-wider transition-all border cursor-pointer flex items-center justify-center",
                                          enrollmentFeePaymentMethod === method
                                            ? "bg-[#00174b] border-[#00174b] text-white shadow-xs"
                                            : "bg-white border-slate-200 text-slate-600 hover:border-indigo-300 hover:text-indigo-700"
                                        )}
                                      >
                                        {method}
                                      </button>
                                    ))}
                                  </div>
                                </div>

                                {/* Observações / Recibo */}
                                <div className="col-span-12 space-y-1">
                                  <label className="text-[10px] font-black text-slate-700 uppercase tracking-widest">
                                    Observações do Recibo (Opcional)
                                  </label>
                                  <input
                                    type="text"
                                    placeholder="Ex: Quitado na secretaria / Comprovante entregue"
                                    value={enrollmentFeeObservations}
                                    onChange={(e) => setEnrollmentFeeObservations(e.target.value)}
                                    className="w-full px-3 py-2 bg-white border border-indigo-300 rounded-none text-xs text-slate-800 focus:ring-2 focus:ring-indigo-500/20 shadow-2xs"
                                  />
                                </div>
                              </div>

                              <div className="bg-emerald-50 border border-emerald-200 p-2.5 text-[11px] text-emerald-900 flex items-center justify-between">
                                <span className="flex items-center gap-1.5">
                                  <CheckCircle2 size={15} className="text-emerald-600 shrink-0" />
                                  <span>
                                    <strong>Integração ativa:</strong> Ao salvar a ficha do aluno, a taxa de <strong>{formatCurrency(enrollmentFeeAmount)}</strong> ({enrollmentFeePaymentMethod}) será gravada e o <strong>Comprovante com Recibo Oficial</strong> será emitido para impressão imediata.
                                  </span>
                                </span>
                              </div>
                            </div>
                          )}

                          {enrollmentFeeStatus === 'pending' && (
                            <div className="p-3 bg-amber-50 border border-amber-300 text-amber-950 space-y-2">
                              <div className="flex items-center gap-2">
                                <AlertCircle size={16} className="text-amber-600 shrink-0" />
                                <p className="text-xs font-bold">
                                  Taxa de Matrícula ficará registrada como PENDENTE ({formatCurrency(enrollmentFeeAmount)})
                                </p>
                              </div>
                              {isFeeAmountIncompatible && (
                                <p className="text-[11px] text-rose-700 font-bold bg-rose-50 p-2 border border-rose-300">
                                  ⚠️ Valor incompatível: para taxa pendente, informe um valor maior que R$ 0,00 ou marque como &quot;Isento&quot;. O sistema não registrará valores zerados ou negativos.
                                </p>
                              )}
                              <p className="text-[11px] text-amber-800">
                                O valor da taxa constará no controle financeiro como a receber. O operador poderá liquidá-la a qualquer momento com emissão imediata do recibo.
                              </p>
                            </div>
                          )}

                          {enrollmentFeeStatus === 'exempt' && (
                            <div className="p-3 bg-slate-100 border border-slate-300 text-slate-800 space-y-2">
                              <div className="flex items-center gap-2">
                                <Info size={16} className="text-slate-600 shrink-0" />
                                <p className="text-xs font-bold">Isenção da Taxa de Inscrição / Matrícula</p>
                              </div>
                              <div className="grid grid-cols-12 gap-2">
                                <div className="col-span-12 sm:col-span-6 space-y-1">
                                  <label className="text-[10px] font-bold text-slate-600">Motivo da Isenção</label>
                                  <select
                                    value={enrollmentFeeExemptionReason}
                                    onChange={(e) => setEnrollmentFeeExemptionReason(e.target.value)}
                                    className="w-full px-2.5 py-1.5 bg-white border border-slate-300 text-xs font-bold"
                                  >
                                    <option value="Seminarista / Vocacionado">Seminarista / Vocacionado</option>
                                    <option value="Bolsista Integral">Bolsista Integral</option>
                                    <option value="Segunda Turma / Curso Paralelo">Segunda Turma / Curso Paralelo</option>
                                    <option value="Autorização da Direção / Caritativo">Autorização da Direção / Caritativo</option>
                                    <option value="Outro">Outro</option>
                                  </select>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        /* CASO 3: Visualização do Aluno com Taxa Não Paga / Pendente */
                        <div className="bg-amber-50/80 border-2 border-amber-300 p-3.5 sm:p-4 rounded-none shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="flex items-start sm:items-center gap-3">
                            <div className="w-10 h-10 bg-amber-500 text-white rounded-none flex items-center justify-center shrink-0 shadow-xs">
                              <AlertCircle size={20} />
                            </div>
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 bg-amber-200 text-amber-950 border border-amber-300">
                                  ⚠️ Taxa de Matrícula Pendente / Não Registrada
                                </span>
                                <span className="text-xs font-bold text-amber-900">
                                  Valor sugerido: {formatCurrency(enrollmentFeeAmount)}
                                </span>
                              </div>
                              <p className="text-[11px] text-amber-800 font-medium mt-1">
                                Não consta comprovante de quitação da taxa de matrícula para este aluno no ano letivo.
                              </p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={handleOpenLiquidateModal}
                            className="px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 shadow-sm transition-all shrink-0 cursor-pointer self-start sm:self-auto"
                          >
                            <CreditCard size={14} />
                            <span>Registrar Quitação da Taxa</span>
                          </button>
                        </div>
                      )
                    ) : (
                      <div className="p-3.5 bg-slate-50 border border-dashed border-slate-300 rounded-none text-slate-500 text-center space-y-1">
                        <GraduationCap size={20} className="mx-auto text-slate-400" />
                        <p className="text-xs font-bold text-slate-700">Selecione uma turma no bloco acadêmico</p>
                        <p className="text-[11px] text-slate-500">Ao vincular a turma do aluno, as opções da taxa de matrícula e emissão de recibo serão habilitadas aqui.</p>
                      </div>
                    )}
                  </section>

                  {/* Action Buttons removed from footer and moved to the persistent top header actions bar */}
                </div>
              )}
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 space-y-4 p-6 text-center">
            <div className="w-20 h-20 bg-slate-50 rounded-none flex items-center justify-center">
              <GraduationCap size={40} />
            </div>
            <p className="text-sm font-medium">Selecione um aluno para ver os detalhes</p>
            {returnOrigin && (
              <button
                type="button"
                onClick={handleCloseFicha}
                className="mt-2 inline-flex items-center gap-2 px-4 py-2 bg-blue-900 hover:bg-blue-950 text-white text-xs font-bold uppercase tracking-wider transition-all cursor-pointer shadow-sm"
              >
                <ArrowLeft size={14} />
                <span>Voltar para {returnOrigin.sourceTitle || 'Origem'}</span>
              </button>
            )}
          </div>
        )}

        {/* Delete Confirmation Modal (Apenas para perfis autorizados com canDelete) */}
        {showDeleteConfirm && canDelete && selectedStudent && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-none shadow-2xl p-8 max-w-sm w-full space-y-6 animate-in zoom-in-95 duration-200">
              <div className="w-16 h-16 bg-red-50 text-red-600 rounded-none flex items-center justify-center mx-auto">
                <Trash2 size={32} />
              </div>
              <div className="text-center space-y-2">
                <h3 className="text-xl font-bold text-[#131b2e]">Excluir Aluno?</h3>
                <p className="text-sm text-slate-500 font-medium leading-relaxed">
                  Tem certeza que deseja excluir a ficha do aluno <span className="font-bold text-slate-900">{selectedStudent.name}</span>? 
                  Esta ação não pode ser desfeita.
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 px-4 py-3 bg-slate-100 text-slate-600 rounded-none font-bold text-sm hover:bg-slate-200 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleDelete}
                  disabled={loading}
                  className="flex-1 px-4 py-3 bg-red-600 text-white rounded-none font-bold text-sm hover:bg-red-700 transition-colors shadow-lg shadow-red-200 disabled:opacity-50"
                >
                  {loading ? 'Excluindo...' : 'Sim, Excluir'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      </div>

      {/* Ficha impressa do aluno - Renderizada apenas se não houver recibo de matrícula aberto */}
      {!receiptModalData && <PrintableGrade />}

      {/* Modal de Comprovante de Matrícula e Recibo Oficial */}
      {receiptModalData && (
        <EnrollmentReceiptModal
          isOpen={Boolean(receiptModalData)}
          onClose={() => setReceiptModalData(null)}
          student={receiptModalData.student}
          classItem={receiptModalData.classItem}
          institution={institution}
          feeAmount={receiptModalData.feeAmount}
          feeStatus={receiptModalData.feeStatus}
          paymentMethod={receiptModalData.paymentMethod}
          paymentDate={receiptModalData.paymentDate}
          observations={receiptModalData.observations}
          unitName={getUnitName(receiptModalData.student.unit_id)}
          isNew={receiptModalData.isNew}
        />
      )}

      {/* Modal de Quitação Rápida da Taxa de Matrícula */}
      {liquidateFeeModalData && (
        <LiquidateEnrollmentFeeModal
          isOpen={Boolean(liquidateFeeModalData)}
          onClose={() => setLiquidateFeeModalData(null)}
          student={liquidateFeeModalData.student}
          classItem={liquidateFeeModalData.classItem}
          suggestedAmount={liquidateFeeModalData.amount}
          onConfirm={handleConfirmLiquidate}
        />
      )}

      {/* Modal de Matrícula em Turma Adicional com Taxa */}
      {enrollModalClass && (
        <EnrollClassWithFeeModal
          isOpen={Boolean(enrollModalClass)}
          onClose={() => setEnrollModalClass(null)}
          student={selectedStudent}
          targetClass={enrollModalClass}
          suggestedFee={enrollModalFeeAmount}
          onConfirm={handleConfirmEnrollWithFee}
        />
      )}
    </>
  );
}
