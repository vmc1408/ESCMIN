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
  Camera,
  Upload,
  RotateCcw,
  ArrowUpDown,
  CreditCard,
  DollarSign,
  Info,
  BookOpen,
  Users,
  ArrowLeft
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Webcam from 'react-webcam';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { formatCurrency, cn, maskDate, formatDateForDisplay, parseDateToDB, maskPhone } from '../lib/utils';
import { uploadImage, fetchAll, saveData, deleteData, saveBatch, fetchQuery, getInstitutionSettings } from '../lib/database';
import { Student, Class, Enrollment } from '../types';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

// Memoized List Item to prevent lag
const StudentItem = React.memo(({ 
  student, 
  isSelected, 
  onSelect, 
  className 
}: { 
  student: Student, 
  isSelected: boolean, 
  onSelect: (s: Student) => void,
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
        <div className="flex items-center gap-2">
          <span className={cn(
            "text-[9px] font-bold px-1.5 py-0.5 rounded-none uppercase tracking-wider",
            student.status === 'Inativo' ? "bg-red-50 text-red-700 border border-red-100" : "bg-emerald-50 text-emerald-700 border border-emerald-100"
          )}>
            {student.status || 'Ativo'}
          </span>
          <span className="text-[10px] text-slate-400 font-medium">{student.registration_number}</span>
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

const maskRG = (value: string) => {
  return value.replace(/\D/g, '').replace(/(\d{2})(\d{3})(\d{3})(\d{1})/, '$1.$2.$3-$4');
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
  address_neighborhood: '',
  address_city: 'Guarulhos',
  address_state: 'SP',
  address_zip: '',
  parish: '',
  forania: '',
  course: '',
  pastoral_participates: '',
  start_date: '',
  photo_url: ''
};

export function Students() {
  const navigate = useNavigate();
  const location = useLocation();
  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
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
  const [institution, setInstitution] = useState<any>(null);

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
  const { user, profile, refreshProfile } = useAuth();

  // Automatic list collapsing and showing is based on active selected student state.


  const fetchStudents = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchAll('students', '*', 'registration_number', true);
      setStudents(data);
    } catch (error) {
      console.error('Error fetching students:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStudents();
    fetchClasses();
    fetchParishes();
    fetchForaries();
    fetchAllEnrollments();
    fetchInstitution();
  }, [fetchStudents]);

  const fetchInstitution = async () => {
    try {
      const data = await getInstitutionSettings();
      if (data) setInstitution(data);
    } catch (error) {
      console.error('Error fetching institution:', error);
    }
  };

  // Handle auto-selection from Dashboard deep links
  useEffect(() => {
    const studentId = (location.state as any)?.studentId;
    if (studentId && students.length > 0) {
      const student = students.find(s => s.id === studentId);
      if (student) {
        // Select student and keep in view mode (isEditing = false)
        setSelectedStudent(student);
        setFormData({
          ...INITIAL_STUDENT_STATE,
          ...student,
          birth_date: student.birth_date,
          start_date: student.start_date
        });
        setIsEditing(false);
        fetchEnrollments(student.id);
        
        // Clear state to avoid re-selecting if the user navigates away and back
        window.history.replaceState({}, document.title);
      }
    }
  }, [students, location.state]);

  // Auto-fill student start date and course based on selected class
  useEffect(() => {
    if (isEditing && formData.class_id) {
      const targetClass = classes.find(c => c.id === formData.class_id);
      
      if (targetClass) {
        const updates: any = {};
        
        // Auto-fill date
        if (targetClass.start_date && formData.start_date !== targetClass.start_date) {
          updates.start_date = targetClass.start_date;
        }

        // Auto-detect course if not already selected
        if (!formData.course) {
          const className = (targetClass.name || '').toLowerCase();
          if (className.includes('teologia')) updates.course = 'Teologia';
          else if (className.includes('latim')) updates.course = 'Latim';
          else if (className.includes('doutrina social')) updates.course = 'Doutrina Social da Igreja';
          else if (className.includes('negros') || className.includes('história')) updates.course = 'História dos Santos Negros';
        }

        if (Object.keys(updates).length > 0) {
          setFormData(prev => ({ ...prev, ...updates }));
        }
      }
    }
  }, [formData.class_id, classes, isEditing]);

  const fetchClasses = async () => {
    try {
      const data = await fetchAll('classes', '*', 'name', true);
      const sorted = (data || []).sort((a: any, b: any) => {
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

  const fetchAllEnrollments = async () => {
    try {
      const data = await fetchAll('enrollments');
      setAllEnrollments(data || []);
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
      const data = await fetchQuery('enrollments', 'student_id', '==', studentId);
      setStudentEnrollments(data || []);
    } catch (error: any) {
      // Ingore 404 (table not found) to prevent crash before migration
      if (error?.code === 'PGRST204' || error?.message?.includes('schema cache')) {
        console.warn('Tabela enrollments ainda não criada no Supabase.');
        setStudentEnrollments([]);
        return;
      }
      console.error('Error fetching enrollments:', error);
    }
  };

  const handleAddEnrollment = async (classId: string) => {
    if (!selectedStudent || !classId) return;
    
    // Check if already enrolled
    if (studentEnrollments.some(e => e.class_id === classId)) {
      setNotification({ type: 'error', message: 'Aluno já está matriculado nesta turma' });
      setTimeout(() => setNotification(null), 3000);
      return;
    }

    const newEnrollment: Partial<Enrollment> = {
      student_id: selectedStudent.id,
      class_id: classId,
      status: 'Ativo',
      enrollment_date: new Date().toISOString().split('T')[0],
      created_at: new Date().toISOString()
    };

    try {
      await saveData('enrollments', undefined, newEnrollment);
      setNotification({ type: 'success', message: 'Matrícula realizada com sucesso!' });
      fetchEnrollments(selectedStudent.id);
      fetchAllEnrollments();
    } catch (error: any) {
      setNotification({ type: 'error', message: 'Erro ao matricular: ' + error.message });
    } finally {
      setTimeout(() => setNotification(null), 3000);
    }
  };

  const handleRemoveEnrollment = async (enrollmentId: string) => {
    try {
      await deleteData('enrollments', enrollmentId);
      setNotification({ type: 'success', message: 'Matrícula removida com sucesso!' });
      if (selectedStudent) fetchEnrollments(selectedStudent.id);
      fetchAllEnrollments();
    } catch (error: any) {
      setNotification({ type: 'error', message: 'Erro ao remover matrícula: ' + error.message });
    } finally {
      setTimeout(() => setNotification(null), 3000);
    }
  };

  const handleSelectStudent = useCallback((student: Student) => {
    setSelectedStudent(student);
    setFormData({
      ...INITIAL_STUDENT_STATE,
      ...student,
      // Ensure specific fields aren't null/undefined from DB
      name: student.name || '',
      registration_number: student.registration_number || '',
      status: student.status || 'Ativo',
      class_id: student.class_id || '',
      email: student.email || '',
      phone_mobile: student.phone_mobile || '',
      phone_residential: student.phone_residential || '',
      cpf: student.cpf || '',
      rg: student.rg || '',
      birth_date: student.birth_date,
      address_street: student.address_street || '',
      address_neighborhood: student.address_neighborhood || '',
      address_city: student.address_city || 'Guarulhos',
      address_state: student.address_state || 'SP',
      address_zip: student.address_zip || '',
      parish: student.parish || '',
      forania: student.forania || '',
      course: student.course || '',
      pastoral_participates: student.pastoral_participates || '',
      start_date: student.start_date,
      photo_url: student.photo_url || ''
    });
    setIsEditing(false);
    setHoverShowList(false);
    fetchEnrollments(student.id);
  }, []);

  const handleNew = () => {
    setSelectedStudent(null);
    const nextReg = generateNextRegistrationNumber(students);
    setFormData({
      ...INITIAL_STUDENT_STATE,
      name: '',
      status: 'Ativo',
      registration_number: nextReg,
    });
    setIsEditing(true);
    setHoverShowList(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const target = e.target as HTMLElement;
      const nextTabIndex = (target.tabIndex || 0) + 1;
      const nextElement = document.querySelector(`[tabIndex="${nextTabIndex}"]`) as HTMLElement;
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
    
    try {
      setLoading(true);
      
      const dataToSave: any = { 
        ...formData,
        birth_date: parseDateToDB(formData.birth_date),
        start_date: parseDateToDB(formData.start_date),
        class_id: formData.class_id || null
      };

      // Set created_at only if it's the first time saving (no id)
      const isNew = !selectedStudent?.id;
      if (isNew && !dataToSave.created_at) {
        dataToSave.created_at = new Date().toISOString();
      }

      // Try saving with all fields, fallback if column missing
      let savedId;
      try {
        savedId = await saveData('students', selectedStudent?.id, dataToSave);
      } catch (err: any) {
        if (err.message?.includes('phone_mobile_is_whatsapp')) {
          console.warn('[Supabase] Coluna phone_mobile_is_whatsapp ausente, salvando sem ela.');
          const fallbackData = { ...dataToSave };
          delete fallbackData.phone_mobile_is_whatsapp;
          savedId = await saveData('students', selectedStudent?.id, fallbackData);
        } else {
          throw err;
        }
      }

      // Auto-enroll in selected class if it's new
      if (isNew && savedId && dataToSave.class_id) {
        try {
          await saveData('enrollments', undefined, {
            student_id: savedId,
            class_id: dataToSave.class_id,
            status: 'Ativo',
            enrollment_date: new Date().toISOString().split('T')[0],
            created_at: new Date().toISOString()
          });
        } catch (enrollErr) {
          console.error('Error auto-enrolling student:', enrollErr);
        }
      }
      
      setNotification({ type: 'success', message: 'Ficha do aluno salva com sucesso!' });
      setIsEditing(false);
      setUploadingPhoto(false); // Reset upload state on save success
      setSelectedStudent(null);
      fetchStudents();
    } catch (error: any) {
      console.error('Error saving student:', error);
      setNotification({ type: 'error', message: 'Erro ao salvar aluno: ' + error.message });
    } finally {
      setLoading(false);
      setTimeout(() => setNotification(null), 3000);
    }
  };

  const handleDelete = useCallback(async () => {
    if (!selectedStudent?.id) return;

    try {
      setLoading(true);
      await deleteData('students', selectedStudent.id);
      
      setNotification({ type: 'success', message: 'Aluno removido com sucesso!' });
      setSelectedStudent(null);
      setFormData(INITIAL_STUDENT_STATE);
      setIsEditing(false);
      setShowDeleteConfirm(false);
      fetchStudents();
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
      <div id="printable-student-record" className="hidden print:block text-black bg-white overflow-visible font-sans leading-tight relative w-full h-[285mm] mx-auto">
        <div className="w-full h-full flex flex-col p-8">
          
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

          <div className="text-center mb-2">
            <h2 className="text-[16pt] font-bold uppercase tracking-[0.2em] w-fit mx-auto border-b border-black/10 pb-0.5">Ficha de Inscrição</h2>
          </div>

          {/* TOP CONTROL BOXES */}
          <div className="grid grid-cols-12 gap-3 mb-4">
            <div className="col-span-4 border border-black/40 p-2 flex flex-col h-[4cm]">
              <p className="text-[10pt] font-semibold border-b border-black/10 pb-0.5 mb-2">Controle da Escola</p>
              <div className="flex-1 flex flex-col justify-center items-center">
                <p className="text-[9pt] font-semibold mb-1 uppercase opacity-40 text-center">Matrícula</p>
                <div className="border border-black/10 h-10 w-full flex items-center justify-center font-bold text-[15pt] bg-white">
                  {selectedStudent.registration_number || ''}
                </div>
              </div>
            </div>

            <div className="col-span-5 border border-black/40 p-2 h-[4cm] flex flex-col">
              <p className="text-[9pt] font-bold mb-2 uppercase border-b border-black/10 pb-0.5">CURSO:</p>
              <div className="flex-1 flex flex-col justify-center gap-1">
                {['Teologia', 'Latim', 'Doutrina Social da Igreja', 'S. Negros'].map(course => {
                  const isInPrimaryClass = currentClass?.name?.toLowerCase().includes(course.toLowerCase());
                  const isInExtraEnrollments = studentEnrollments.some(enrollment => {
                    const targetClass = classes.find(c => c.id === enrollment.class_id);
                    return targetClass?.name?.toLowerCase().includes(course.toLowerCase()) && enrollment.status === 'Ativo';
                  });
                  const isChecked = isInPrimaryClass || isInExtraEnrollments || selectedStudent.course?.toLowerCase().includes(course.toLowerCase());
                  
                  return (
                    <div key={course} className="flex items-center gap-3">
                      <div className="w-3.5 h-3.5 border border-black flex items-center justify-center bg-white relative shrink-0">
                        {isChecked && <span className="text-[10pt] font-bold leading-none text-black">X</span>}
                      </div>
                      <span className="text-[9.5pt] font-medium leading-none uppercase">{course === 'S. Negros' ? 'História dos Santos Negros' : course}</span>
                    </div>
                  );
                })}

                {/* List all active enrollments explicitly if there are multiple */}
                {(studentEnrollments.length > 0) && (
                  <div className="mt-2 pt-2 border-t border-black/10">
                    <p className="text-[7pt] font-bold uppercase mb-1">Turmas Ativas:</p>
                    <p className="text-[8.5pt] font-bold leading-tight uppercase">
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
            </div>

            <div className="col-span-3 flex justify-end">
              <div className="border border-black/40 flex items-center justify-center relative bg-white w-[3cm] h-[4cm]">
                {selectedStudent.photo_url ? (
                  <img src={selectedStudent.photo_url} className="w-full h-full object-cover p-0.5" referrerPolicy="no-referrer" />
                ) : (
                  <div className="text-center text-black/10 uppercase">
                    <p className="text-[7pt] font-bold leading-tight tracking-tighter">FOTO 3X4</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* PERSONAL DATA */}
          <div className="space-y-2 mb-2 text-[10.5pt]">
            <div className="flex items-end gap-2">
              <span className="font-semibold uppercase min-w-[60px] text-slate-900">Nome:</span>
              <span className="flex-1 border-b border-black/20 font-bold uppercase px-2 pb-0.5 min-h-[20px]">{selectedStudent.name}</span>
            </div>

            <div className="flex items-end gap-2">
              <span className="font-semibold uppercase min-w-[60px] text-slate-900">Endereço:</span>
              <span className="flex-1 border-b border-black/20 font-medium uppercase px-2 pb-0.5 min-h-[22px]">{selectedStudent.address_street}</span>
            </div>

            <div className="flex gap-4">
              <div className="flex-[4] flex items-end gap-2">
                <span className="font-semibold uppercase text-slate-900">Bairro:</span>
                <span className="flex-1 border-b border-black/20 font-medium uppercase px-2 pb-0.5 min-h-[22px]">
                   {selectedStudent.address_neighborhood || (selectedStudent.address_street?.includes(' - ') ? selectedStudent.address_street.split(' - ').pop() : '')}
                </span>
              </div>
              <div className="flex-[4] flex items-end gap-2">
                <span className="font-semibold uppercase text-slate-900">Cidade:</span>
                <span className="flex-1 border-b border-black/20 font-medium uppercase px-2 pb-0.5 min-h-[22px]">{selectedStudent.address_city}</span>
              </div>
              <div className="flex-[1] flex items-end gap-2">
                <span className="font-semibold uppercase text-slate-900">Uf:</span>
                <span className="flex-1 border-b border-black/20 font-medium uppercase px-2 pb-0.5 text-center min-h-[22px]">{selectedStudent.address_state}</span>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex-[3] flex items-end gap-2">
                <span className="font-semibold uppercase text-slate-900">Cep:</span>
                <span className="flex-1 border-b border-black/20 font-medium px-2 pb-0.5 min-h-[22px]">{selectedStudent.address_zip}</span>
              </div>
              <div className="flex-[5] flex items-end relative gap-2">
                <span className="font-semibold uppercase text-slate-900">Celular:</span>
                <span className="flex-1 border-b border-black/20 font-medium px-2 pb-0.5 min-h-[22px]">{selectedStudent.phone_mobile}</span>
                <div className="flex items-center gap-3 ml-2 mb-0.5 text-[9pt]">
                  <span className="text-slate-900 font-semibold uppercase">WhatsApp:</span>
                  <div className="flex items-center gap-1">
                    <div className="w-3.5 h-3.5 border border-black flex items-center justify-center bg-white shrink-0">
                       {selectedStudent.phone_mobile?.trim() && (String(selectedStudent.phone_mobile_is_whatsapp) === 'true' || selectedStudent.phone_mobile_is_whatsapp === true) && (
                         <span className="text-[10pt] font-bold leading-none text-black">X</span>
                       )}
                    </div>
                    <span className="font-bold uppercase text-[8pt]">Sim</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-3.5 h-3.5 border border-black flex items-center justify-center bg-white shrink-0">
                       {selectedStudent.phone_mobile?.trim() && (String(selectedStudent.phone_mobile_is_whatsapp) !== 'true' && selectedStudent.phone_mobile_is_whatsapp !== true) && (
                         <span className="text-[10pt] font-bold leading-none text-black">X</span>
                       )}
                    </div>
                    <span className="font-bold uppercase text-[8pt]">Não</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex-[2] flex items-end gap-2">
                <span className="font-semibold uppercase whitespace-nowrap text-slate-900">Nasc.:</span>
                <span className="flex-1 border-b border-black/20 font-medium px-2 pb-0.5 text-center min-h-[22px]">
                  {selectedStudent.birth_date ? formatDateForDisplay(selectedStudent.birth_date) : '__ / __ / ____'}
                </span>
              </div>
              <div className="flex-[1.5] flex items-end gap-2">
                <span className="font-semibold uppercase text-slate-900">RG:</span>
                <span className="flex-1 border-b border-black/20 font-medium px-2 pb-0.5 text-center min-h-[22px]">{selectedStudent.rg}</span>
              </div>
              <div className="flex-[2] flex items-end gap-2">
                <span className="font-semibold uppercase text-slate-900">CPF:</span>
                <span className="flex-1 border-b border-black/20 font-medium px-2 pb-0.5 text-center min-h-[22px]">{selectedStudent.cpf}</span>
              </div>
            </div>

            <div className="flex items-end gap-2">
              <span className="font-semibold uppercase min-w-[60px] text-slate-900">Email:</span>
              <span className="flex-1 border-b border-black/20 font-medium px-2 pb-0.5 lowercase min-h-[22px]">{selectedStudent.email}</span>
            </div>

            {/* Pastoral Info Grid */}
            <div className="space-y-3 pt-1">
              <div className="flex items-end gap-2">
                <span className="font-semibold uppercase whitespace-nowrap text-slate-900">Paróquia:</span>
                <span className="flex-1 border-b border-black/20 font-medium uppercase px-2 pb-0.5 min-h-[22px]">{selectedStudent.parish}</span>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-end gap-2">
                  <span className="font-semibold uppercase whitespace-nowrap text-slate-900">Forania:</span>
                  <span className="flex-1 border-b border-black/20 font-medium uppercase px-2 pb-0.5 min-h-[22px] text-center">{selectedStudent.forania}</span>
                </div>
                <div className="flex items-end gap-2">
                  <span className="font-semibold uppercase whitespace-nowrap text-slate-900">Pastoral:</span>
                  <span className="flex-1 border-b border-black/20 font-medium uppercase px-2 pb-0.5 min-h-[22px] text-center">{selectedStudent.pastoral_participates}</span>
                </div>
              </div>
            </div>
          </div>

          {/* BASIC INFORMATION SECTION */}
          <div className="mb-2 p-3 bg-white border border-black/20 rounded-none">
            <h4 className="text-[10pt] font-bold uppercase text-center mb-3 tracking-wider">Normas Básicas para Admissão</h4>
            <div className="text-[8.5pt] leading-relaxed space-y-1 font-normal text-slate-800">
              {admissionNorms.map((norm, index) => {
                const hasIndexPrefix = /^\s*[0-9]+[\s\)\.\-]/i.test(norm);
                return (
                  <p key={index}>
                    {!hasIndexPrefix && <span>{index + 1}) </span>}
                    {norm}
                  </p>
                );
              })}
            </div>
          </div>

          <div className="text-[10.5pt] leading-normal mb-10 pt-1">
            <div className="flex items-baseline mb-1 gap-2">
              <span className="font-bold uppercase">Eu,</span>
              <span className="flex-1 border-b border-black font-semibold uppercase px-2">{selectedStudent.name}</span>
            </div>
            <p className="text-justify leading-relaxed font-normal text-slate-800">
              declaro que estou ciente e de ACORDO com as normas estabelecidas para ingresso no curso promovido pela Diocese de Guarulhos e autorizo o armazenamento de meus dados pessoais necessários para a inscrição.
            </p>
          </div>

          {/* DATE AND SIGNATURE - Adjusted to be above footer line */}
          <div className="mt-auto mb-4 scale-[0.95] origin-bottom">
            <div className="flex justify-between items-end px-6">
              <div className="flex flex-col pb-2">
                <p className="text-[11pt] font-bold text-black">
                  Guarulhos, <span>
                    {selectedStudent.created_at ? new Date(selectedStudent.created_at).toLocaleDateString('pt-BR') : new Date().toLocaleDateString('pt-BR')}
                  </span>
                </p>
              </div>
              <div className="flex flex-col items-center">
                <div className="w-[90mm] border-t-2 border-black mb-1"></div>
                <p className="text-[10pt] font-bold uppercase tracking-[0.2em] text-black">Assinatura do Aluno(a)</p>
              </div>
            </div>
          </div>

          {/* RODAPÉ */}
          <div className="border-t-2 border-black pt-3 flex justify-between items-start text-[8.5pt] font-bold text-black uppercase tracking-tight mb-2">
            <div className="flex-1 space-y-1">
              <p className="leading-none text-[9pt]">
                {institution?.address}
              </p>
              {(institution?.cep || institution?.city_uf) && (
                <p className="leading-none text-[9pt]">
                  {institution?.cep ? `CEP: ${institution.cep}` : ''} {institution?.city_uf ? ` - ${institution.city_uf}` : ''}
                </p>
              )}
              <div className="flex items-center gap-4 leading-none font-bold text-[9pt]">
                {institution?.phone && (
                  <span className="flex items-center gap-1.5">
                    TEL: {institution.phone}
                    <svg viewBox="0 0 24 24" width="12" height="12" fill="#25D366" className="shrink-0">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L0 24l6.335-1.662c1.72.937 3.659 1.43 5.623 1.43h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                    </svg>
                  </span>
                )}
                {institution?.phone && institution?.email && <span className="opacity-30">|</span>}
                {institution?.email && (
                  <span className="flex items-center gap-1">
                    EMAIL: <span className="lowercase font-bold">{institution.email}</span>
                  </span>
                )}
              </div>
            </div>
            {institution?.secretary && (
              <div className="text-right max-w-[450px] leading-tight text-black font-bold uppercase text-[8pt]">
                <p className="whitespace-pre-line underline underline-offset-2 mb-1">Atendimento Secretaria:</p>
                <p className="whitespace-pre-line lowercase font-bold text-[8.5pt]">{institution.secretary}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const filteredStudents = React.useMemo(() => {
    return students.filter(s => {
      const matchesSearch = 
        (s.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (s.registration_number || '').includes(searchTerm) ||
        (s.cpf || '').includes(searchTerm);
      
      const matchesStatus = statusFilter === 'Todos' || (s.status || 'Ativo') === statusFilter;
      
      // Filter logic
      let matchesYear = true;
      if (selectedYear !== '' && selectedYear !== 'all') {
        const studentYear = getYearFromRegistration(s.registration_number);
        matchesYear = studentYear === selectedYear;
      }

      let matchesClass = true;
      if (selectedClassId !== '') {
        const isInPrimaryClass = s.class_id === selectedClassId;
        const isEnrolledViaMultiTurma = allEnrollments.some(e => e.student_id === s.id && e.class_id === selectedClassId && e.status === 'Ativo');
        matchesClass = isInPrimaryClass || isEnrolledViaMultiTurma;
      }

      // If user selected "all" for year, we still check search and status
      if (selectedYear === 'all') matchesYear = true;

      return matchesSearch && matchesStatus && matchesYear && matchesClass;
    }).sort((a, b) => {
      if (sortBy === 'name') {
        return a.name.localeCompare(b.name);
      } else {
        const yearA = getYearFromRegistration(a.registration_number) || '0000';
        const yearB = getYearFromRegistration(b.registration_number) || '0000';
        if (yearA !== yearB) return yearB.localeCompare(yearA);
        return (b.registration_number || '').localeCompare(a.registration_number || '', undefined, { numeric: true });
      }
    });
  }, [students, searchTerm, statusFilter, selectedYear, selectedClassId, sortBy, allEnrollments]);

  const availableYears = React.useMemo(() => {
    return Array.from(new Set(students.map(s => getYearFromRegistration(s.registration_number)).filter(Boolean))).sort().reverse();
  }, [students]);

  const actualListCollapsed = selectedStudent !== null || isEditing;

  return (
    <div className={cn(
      "h-[calc(100vh-6rem)] relative flex gap-4 w-full transition-all duration-300",
      actualListCollapsed ? "justify-center" : "justify-end"
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
          "bg-white rounded-none shadow-sm flex flex-col order-last transition-all duration-300 ease-in-out border border-slate-200 overflow-hidden",
          actualListCollapsed 
            ? (hoverShowList 
                ? "absolute right-0 top-0 bottom-0 h-full z-50 w-full sm:w-[380px] opacity-100 shadow-2xl border-l border-slate-200" 
                : "w-0 opacity-0 border-0 pointer-events-none overflow-hidden hidden"
              )
            : "w-full lg:w-[380px] opacity-100"
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

            <div className="space-y-1.5">
              <select 
                value={selectedClassId}
                onChange={(e) => setSelectedClassId(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-none text-[11px] font-medium text-slate-600 focus:ring-1 focus:ring-slate-500/10 outline-none"
              >
                <option value="">Todas as Turmas</option>
                {classes.filter(c => c.status === 'Ativo').map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
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
                  {availableYears.map(y => <option key={y} value={y}>Matrícula {y}</option>)}
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
          ) : !selectedYear ? (
            <div className="flex flex-col items-center justify-center p-6 text-center text-slate-400">
              <GraduationCap size={32} className="mb-2 opacity-20" />
              <p className="text-xs font-medium">Selecione uma turma para visualizar os alunos</p>
            </div>
          ) : filteredStudents.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-6 text-center text-slate-400">
              <Search size={32} className="mb-2 opacity-20" />
              <p className="text-xs font-medium">Nenhum aluno encontrado</p>
            </div>
          ) : filteredStudents.map((student) => (
            <StudentItem
              key={student.id}
              student={student}
              isSelected={selectedStudent?.id === student.id}
              onSelect={handleSelectStudent}
            />
          ))}
        </div>
      </div>
    </div>

      {/* Main Content (Student Details or Registration Form) */}
      <div className={cn(
        "bg-white rounded-none shadow-sm border border-slate-200 flex flex-col overflow-hidden transition-all duration-300",
        actualListCollapsed ? "flex-grow flex-1 max-w-5xl w-[100%] mx-auto opacity-100" : "w-0 h-0 opacity-0 pointer-events-none hidden"
      )}>
        {selectedStudent || isEditing ? (
          <>
            {notification && (
              <div className={cn(
                "fixed top-4 left-1/2 -translate-x-1/2 z-[100] px-4 py-2 rounded-none shadow-lg animate-in fade-in slide-in-from-top-4 duration-300 flex items-center gap-2",
                notification.type === 'success' ? "bg-emerald-600 text-white" : "bg-red-600 text-white"
              )}>
                {notification.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                <p className="text-[11px] font-bold uppercase tracking-wider">{notification.message}</p>
              </div>
            )}
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/30">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-5">
                <div className="relative group">
                  <div className="w-20 h-28 rounded-none bg-white shadow-sm flex items-center justify-center text-slate-400 overflow-hidden border border-slate-200 relative">
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
                <div>
                  <h3 className="text-lg font-bold text-slate-800 tracking-tight leading-tight">
                    {isEditing ? (selectedStudent ? 'Editar Aluno' : 'Novo Registro') : formData.name}
                  </h3>
                  <div className="flex items-center gap-3 mt-1.5">
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Matrícula: {formData.registration_number || '---'}</span>
                    <span className={cn(
                      "px-1.5 py-0.5 rounded text-[9px] font-bold uppercase border tracking-wider",
                      formData.status === 'Ativo' ? "bg-emerald-50 text-emerald-700 border-emerald-100" : "bg-slate-50 text-slate-500 border-slate-200"
                    )}>
                      {formData.status}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 w-full md:w-auto md:justify-end">
                {!isEditing && selectedStudent && (
                  <>
                    <button 
                      onClick={() => {
                        setSelectedStudent(null);
                        setIsEditing(false);
                      }}
                      className="h-10 px-4 bg-rose-50 border border-rose-200 text-rose-700 hover:bg-rose-100 hover:border-rose-300 rounded-none text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-sm uppercase tracking-wider"
                      title="Fechar Ficha"
                    >
                      <X size={15} />
                      <span className="hidden sm:inline">Fechar Ficha</span>
                    </button>

                    <button 
                      onClick={handlePrint}
                      className="h-10 w-10 bg-white border border-slate-200 text-slate-500 rounded-none hover:text-slate-800 hover:bg-slate-50 transition-all flex items-center justify-center shadow-sm cursor-pointer"
                      title="Imprimir"
                    >
                      <Printer size={16} />
                    </button>
                    
                    <button 
                      onClick={() => navigate('/contributions', { state: { studentId: selectedStudent.id } })}
                      className="h-10 w-10 bg-emerald-50 border border-emerald-200 text-emerald-600 rounded-none hover:text-emerald-800 hover:bg-emerald-100/50 transition-all flex items-center justify-center shadow-sm cursor-pointer"
                      title="Financeiro"
                    >
                      <DollarSign size={18} />
                    </button>

                    <button 
                      onClick={() => navigate('/student-ficha', { state: { studentId: selectedStudent.id } })}
                      className="h-10 px-3 bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 hover:border-indigo-300 rounded-none text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-sm uppercase tracking-wider cursor-pointer"
                      title="Ficha Acadêmica"
                    >
                      <GraduationCap size={15} />
                      <span className="hidden sm:inline">Ficha Acadêmica</span>
                    </button>

                    <button 
                      onClick={() => setIsEditing(true)}
                      className="h-10 px-4 bg-slate-800 border border-slate-800 hover:bg-slate-900 text-white rounded-none text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-sm uppercase tracking-wider"
                      title="Editar"
                    >
                      <Edit2 size={14} />
                      <span>Editar</span>
                    </button>
                  </>
                )}
                {isEditing && (
                  <>
                    {selectedStudent && (
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
                    )}
                    <button 
                      onClick={() => {
                        setIsEditing(false);
                        setUploadingPhoto(false);
                        setSelectedStudent(null);
                        setFormData(INITIAL_STUDENT_STATE);
                      }}
                      className="h-10 px-4 bg-rose-50 border border-rose-200 hover:bg-rose-100 hover:border-rose-300 text-rose-700 rounded-none text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-sm"
                    >
                      <X size={15} />
                      <span className="uppercase tracking-wider text-[10px] hidden sm:inline">Cancelar Inscrição</span>
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
                      <div className="col-span-12 sm:col-span-4 space-y-1">
                        <label className="text-xs font-bold text-slate-700">CPF</label>
                        <input 
                          type="text"
                          disabled={!isEditing}
                          value={formData.cpf || ''}
                          onChange={(e) => setFormData({...formData, cpf: maskCPF(e.target.value)})}
                          onKeyDown={handleKeyDown}
                          className="w-full px-4 py-2 bg-white border border-slate-200 rounded-none text-sm focus:ring-2 focus:ring-slate-500/10 disabled:opacity-60"
                          placeholder="000.000.000-00"
                          tabIndex={4}
                        />
                      </div>
                      <div className="col-span-12 sm:col-span-4 space-y-1">
                        <label className="text-xs font-bold text-slate-700">RG</label>
                        <input 
                          type="text"
                          disabled={!isEditing}
                          value={formData.rg || ''}
                          onChange={(e) => setFormData({...formData, rg: maskRG(e.target.value)})}
                          onKeyDown={handleKeyDown}
                          className="w-full px-4 py-2 bg-white border border-slate-200 rounded-none text-sm focus:ring-2 focus:ring-slate-500/10 disabled:opacity-60"
                          placeholder="00.000.000-0"
                          tabIndex={5}
                        />
                      </div>
                      <div className="col-span-12 sm:col-span-4 space-y-1">
                        <label className="text-xs font-bold text-slate-700">Data de Nascimento</label>
                        <input 
                          type="date"
                          disabled={!isEditing}
                          value={formData.birth_date || ''}
                          onChange={(e) => setFormData({...formData, birth_date: e.target.value})}
                          onKeyDown={handleKeyDown}
                          className="w-full px-4 py-2 bg-white border border-slate-200 rounded-none text-sm focus:ring-2 focus:ring-slate-500/10 disabled:opacity-60"
                          tabIndex={6}
                        />
                      </div>
                      <div className="col-span-12 md:col-span-8 space-y-1">
                        <label className="text-xs font-bold text-slate-700">Turma Principal (Vínculo Direto)</label>
                        <select 
                          disabled={!isEditing}
                          value={formData.class_id || ''}
                          onChange={(e) => setFormData({...formData, class_id: e.target.value})}
                          onKeyDown={handleKeyDown}
                          className="w-full px-4 py-2 bg-white border border-slate-200 rounded-none text-sm focus:ring-2 focus:ring-slate-500/10 disabled:opacity-60 font-bold"
                          tabIndex={7}
                        >
                          <option value="">Selecione uma turma</option>
                          {classes.filter(c => c.status === 'Ativo' || c.id === formData.class_id).map(c => (
                            <option key={c.id} value={c.id}>
                              {c.name} ({c.code}) - {c.period}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="col-span-12 md:col-span-4 space-y-1">
                        <label className="text-xs font-bold text-slate-700 font-bold text-slate-800">Curso / Identificação</label>
                        <select 
                          disabled={!isEditing}
                          value={formData.course || ''}
                          onChange={(e) => setFormData({...formData, course: e.target.value})}
                          onKeyDown={handleKeyDown}
                          className="w-full px-4 py-2 bg-slate-50 border border-slate-205 rounded-none text-sm focus:ring-2 focus:ring-slate-500/10 disabled:opacity-60 font-bold text-slate-800"
                          tabIndex={7.5}
                        >
                          <option value="">Identificar Curso...</option>
                          <option value="Teologia">Teologia</option>
                          <option value="Latim">Latim</option>
                          <option value="Doutrina Social da Igreja">Doutrina Social da Igreja</option>
                          <option value="História dos Santos Negros">História dos Santos Negros</option>
                          <option value="Outros">Outros</option>
                        </select>
                      </div>

                      <div className="col-span-12 md:col-span-4 space-y-1">
                        <label className="text-xs font-bold text-slate-700">Data de inicio da TURMA</label>
                        <input 
                          type="date"
                          disabled={!isEditing}
                          value={formData.start_date || ''}
                          onChange={(e) => setFormData({...formData, start_date: e.target.value})}
                          onKeyDown={handleKeyDown}
                          className="w-full px-4 py-2 bg-white border border-slate-200 rounded-none text-sm focus:ring-2 focus:ring-slate-500/10 disabled:opacity-60"
                          tabIndex={8}
                        />
                      </div>

                      {/* Enrollment Management - Integrated directly */}
                      {selectedStudent?.id ? (
                        <div className="col-span-12 p-5 bg-slate-50/30 border border-slate-200 rounded-none space-y-4 mt-2 mb-6 shadow-sm">
                          <div className="flex items-center justify-between">
                            <h4 className="text-[10px] font-bold text-slate-800 uppercase tracking-widest flex items-center gap-2">
                              <BookOpen size={14} />
                              Matrículas em Outras Turmas
                            </h4>
                          </div>

                          <div className="flex gap-2">
                            <select 
                              disabled={!isEditing}
                              value={enrollClassId}
                              onChange={(e) => setEnrollClassId(e.target.value)}
                              className="flex-1 px-3 py-2 bg-white border border-slate-200 rounded-none text-xs focus:ring-1 focus:ring-slate-500/10 outline-none shadow-sm disabled:opacity-50"
                            >
                              <option value="">Matricular em outra turma...</option>
                              {classes.filter(c => c.status === 'Ativo' && c.id !== formData.class_id).map(c => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                              ))}
                            </select>
                            <button
                              onClick={() => {
                                handleAddEnrollment(enrollClassId);
                                setEnrollClassId('');
                              }}
                              disabled={!enrollClassId || !isEditing}
                              className="px-4 py-2 bg-slate-800 text-white rounded-none text-[10px] font-bold uppercase hover:bg-slate-900 transition-all disabled:opacity-50 flex items-center gap-1 shadow-sm"
                            >
                              <Plus size={14} />
                              Matricular
                            </button>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-[200px] overflow-y-auto pr-1">
                            {studentEnrollments.length === 0 ? (
                              <div className="col-span-full py-4 text-center bg-white/50 rounded-none border border-dashed border-slate-200">
                                <p className="text-[10px] text-slate-500 font-medium uppercase tracking-tight">Nenhuma matrícula adicional</p>
                              </div>
                            ) : (
                              studentEnrollments.map(enrollment => {
                                const targetClass = classes.find(c => c.id === enrollment.class_id);
                                return (
                                  <div key={enrollment.id} className="flex items-center justify-between p-2.5 bg-white rounded-none border border-slate-100 shadow-sm group hover:border-slate-205 transition-all">
                                    <div className="flex items-center gap-3">
                                      <div className="w-8 h-8 rounded bg-slate-50 flex items-center justify-center text-slate-800">
                                        <GraduationCap size={14} />
                                      </div>
                                      <div className="leading-tight">
                                        <p className="text-[11px] font-bold text-slate-700 uppercase">{targetClass?.name || 'Turma N/I'}</p>
                                        <p className="text-[9px] text-slate-400 font-medium uppercase tracking-wider">
                                          {enrollment.enrollment_date ? formatDateForDisplay(enrollment.enrollment_date) : ''}
                                        </p>
                                      </div>
                                    </div>
                                    {isEditing && (
                                      <button 
                                        onClick={() => handleRemoveEnrollment(enrollment.id)}
                                        className="p-1 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded transition-all"
                                        title="Remover Matrícula"
                                      >
                                        <X size={14} />
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
                      <div className="col-span-12 space-y-1">
                        <label className="text-xs font-bold text-slate-700">Logradouro (Rua, Número, Complemento)</label>
                        <input 
                          type="text"
                          disabled={!isEditing}
                          value={formData.address_street || ''}
                          onChange={(e) => setFormData({...formData, address_street: e.target.value})}
                          onKeyDown={handleKeyDown}
                          className="w-full px-4 py-2 bg-white border border-slate-200 rounded-none text-sm focus:ring-2 focus:ring-slate-500/10 disabled:opacity-60"
                          tabIndex={9}
                        />
                      </div>
                      <div className="col-span-12 sm:col-span-4 space-y-1">
                        <label className="text-xs font-bold text-slate-700">Bairro</label>
                        <input 
                          type="text"
                          disabled={!isEditing}
                          value={formData.address_neighborhood || ''}
                          onChange={(e) => setFormData({...formData, address_neighborhood: e.target.value})}
                          onKeyDown={handleKeyDown}
                          className="w-full px-4 py-2 bg-white border border-slate-200 rounded-none text-sm focus:ring-2 focus:ring-slate-500/10 disabled:opacity-60"
                          tabIndex={10}
                        />
                      </div>
                      <div className="col-span-12 sm:col-span-5 space-y-1">
                        <label className="text-xs font-bold text-slate-700">Cidade</label>
                        <input 
                          type="text"
                          disabled={!isEditing}
                          value={formData.address_city || ''}
                          onChange={(e) => setFormData({...formData, address_city: e.target.value})}
                          onKeyDown={handleKeyDown}
                          className="w-full px-4 py-2 bg-white border border-slate-200 rounded-none text-sm focus:ring-2 focus:ring-slate-500/10 disabled:opacity-60"
                          tabIndex={11}
                        />
                      </div>
                      <div className="col-span-12 sm:col-span-3 space-y-1">
                        <label className="text-xs font-bold text-slate-700">UF / Estado</label>
                        <input 
                          type="text"
                          disabled={!isEditing}
                          value={formData.address_state || ''}
                          onChange={(e) => setFormData({...formData, address_state: e.target.value})}
                          onKeyDown={handleKeyDown}
                          className="w-full px-4 py-2 bg-white border border-slate-200 rounded-none text-sm focus:ring-2 focus:ring-slate-500/10 disabled:opacity-60"
                          tabIndex={12}
                        />
                      </div>
                      <div className="col-span-12 sm:col-span-3 space-y-1">
                        <label className="text-xs font-bold text-slate-700">CEP</label>
                        <input 
                          type="text"
                          disabled={!isEditing}
                          value={formData.address_zip || ''}
                          onChange={(e) => setFormData({...formData, address_zip: maskCEP(e.target.value)})}
                          onKeyDown={handleKeyDown}
                          className="w-full px-4 py-2 bg-white border border-slate-200 rounded-none text-sm focus:ring-2 focus:ring-slate-500/10 disabled:opacity-60"
                          placeholder="00000-000"
                          tabIndex={13}
                        />
                      </div>
                      <div className="col-span-12 sm:col-span-5 space-y-1">
                        <label className="text-xs font-bold text-slate-700">E-mail</label>
                        <input 
                          type="email"
                          disabled={!isEditing}
                          value={formData.email || ''}
                          onChange={(e) => setFormData({...formData, email: e.target.value})}
                          onKeyDown={handleKeyDown}
                          className="w-full px-4 py-2 bg-white border border-slate-200 rounded-none text-sm focus:ring-2 focus:ring-slate-500/10 disabled:opacity-60"
                          tabIndex={14}
                        />
                      </div>
                      <div className="col-span-12 sm:col-span-4 space-y-1">
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
                            tabIndex={15}
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
                          tabIndex={16}
                        >
                          <option value="">Selecione...</option>
                          {parishesList.map(p => (
                            <option key={p.id} value={p.name}>{p.name}</option>
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
                          tabIndex={16}
                        >
                          <option value="">Selecione...</option>
                          {forariesList.map(f => (
                            <option key={f.id} value={f.name}>{f.name}</option>
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
                          tabIndex={17}
                        />
                      </div>
                    </div>
                  </section>

                  {/* Registration Date (Last Field) */}
                  <section className="space-y-4 pt-4 border-t border-slate-100">
                    <div className="grid grid-cols-12 gap-4">
                      <div className="col-span-12 sm:col-span-6 space-y-1">
                        <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5 cursor-help" title="Data em que o aluno foi cadastrado pela primeira vez">
                          <AlertCircle size={12} className="text-slate-705" />
                          Data da Inscrição
                        </label>
                        <div className="w-full px-4 py-2 bg-slate-100/50 text-slate-500 rounded-none text-sm border border-dashed border-slate-200 flex items-center gap-2">
                          <Calendar size={14} />
                          {formData.created_at ? (
                            <span className="font-bold">{formatDateForDisplay(formData.created_at)}</span>
                          ) : (
                            <span className="italic">Será preenchido automaticamente ao salvar</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </section>

                  {/* Action Buttons removed from footer and moved to the persistent top header actions bar */}
                </div>
              )}
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 space-y-4">
            <div className="w-20 h-20 bg-slate-50 rounded-none flex items-center justify-center">
              <GraduationCap size={40} />
            </div>
            <p className="text-sm font-medium">Selecione um aluno para ver os detalhes</p>
          </div>
        )}
      </div>
      <PrintableGrade />

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && selectedStudent && (
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
  );
}
