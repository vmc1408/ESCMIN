import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  Info,
  BookOpen
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Webcam from 'react-webcam';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { formatCurrency, cn, maskDate, formatDateForDisplay, parseDateToDB, maskPhone } from '../lib/utils';
import { uploadImage, fetchAll, saveData, deleteData, saveBatch, fetchQuery } from '../lib/database';
import { Student, Class, Enrollment } from '../types';
import { useNavigate } from 'react-router-dom';

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
        "w-full flex items-center gap-3 p-3 rounded-2xl transition-all text-left",
        isSelected 
          ? "bg-blue-50 border-blue-100 shadow-sm" 
          : "hover:bg-slate-50 border-transparent",
        className
      )}
    >
      <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500 font-bold text-[10px] overflow-hidden">
        {student.photo_url ? (
          <img src={student.photo_url} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
        ) : (
          student.registration_number?.substring(0, 6) || '---'
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-[#131b2e] truncate">{student.name}</p>
        <div className="flex items-center gap-2">
          <span className={cn(
            "text-[10px] font-black px-1.5 py-0.5 rounded-md uppercase",
            student.status === 'Inativo' ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"
          )}>
            {student.status || 'Ativo'}
          </span>
          <span className="text-[10px] text-slate-400 font-bold">{student.registration_number}</span>
          {student.start_date && (
            <span className="text-[9px] text-blue-600 font-black ml-1 uppercase">Entrada: {formatDateForDisplay(student.start_date)}</span>
          )}
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
export function Students() {
  const navigate = useNavigate();
  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [parishesList, setParishesList] = useState<any[]>([]);
  const [forariesList, setForariesList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'Ativo' | 'Inativo' | 'Todos'>('Ativo');
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  // Initialize with all fields to prevent uncontrolled input warnings
  const initialStudentState: Partial<Student> = {
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
    forany: '',
    course: '',
    pastoral_participates: '',
    start_date: '',
    photo_url: ''
  };

  const [formData, setFormData] = useState<Partial<Student>>(initialStudentState);
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
  const webcamRef = useRef<Webcam>(null);

  useEffect(() => {
    fetchStudents();
    fetchClasses();
    fetchParishes();
    fetchForaries();
    fetchAllEnrollments();
  }, []);

  // Auto-fill student start date based on selected class
  useEffect(() => {
    if (isEditing && formData.class_id) {
      const targetClass = classes.find(c => c.id === formData.class_id);
      if (targetClass?.start_date) {
        const formattedDate = formatDateForDisplay(targetClass.start_date);
        
        // Se a data da turma for diferente da data no formulário, atualizamos
        // para garantir que o aluno esteja sincronizado com a turma selecionada
        if (formData.start_date !== formattedDate) {
          setFormData(prev => ({ ...prev, start_date: formattedDate }));
        }
      }
    }
  }, [formData.class_id, classes, isEditing]);

  const fetchClasses = async () => {
    try {
      const data = await fetchAll('classes', '*', 'name', true);
      setClasses(data || []);
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
      ...initialStudentState,
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
      birth_date: formatDateForDisplay(student.birth_date),
      address_street: student.address_street || '',
      address_neighborhood: student.address_neighborhood || '',
      address_city: student.address_city || 'Guarulhos',
      address_state: student.address_state || 'SP',
      address_zip: student.address_zip || '',
      parish: student.parish || '',
      forany: student.forany || '',
      course: student.course || '',
      pastoral_participates: student.pastoral_participates || '',
      start_date: formatDateForDisplay(student.start_date),
      photo_url: student.photo_url || ''
    });
    setIsEditing(false);
    fetchEnrollments(student.id);
  }, [initialStudentState]);

  const handleNew = () => {
    setSelectedStudent(null);
    const nextReg = generateNextRegistrationNumber(students);
    setFormData({
      ...initialStudentState,
      name: '',
      status: 'Ativo',
      registration_number: nextReg,
    });
    setIsEditing(true);
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
        start_date: parseDateToDB(formData.start_date)
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
      fetchStudents();
      
      // Update selected student with local data (including UI-only fields if fallback occurred)
      if (savedId) {
        setSelectedStudent({ ...dataToSave, id: savedId } as Student);
      } else {
        setSelectedStudent({ ...dataToSave, id: selectedStudent?.id } as Student);
      }
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
      setFormData(initialStudentState);
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
    const [inst, setInst] = React.useState<any>(null);

    React.useEffect(() => {
      const loadInst = async () => {
        const institutions = await fetchAll('institution_settings');
        if (institutions && institutions.length > 0) setInst(institutions[0]);
      };
      loadInst();
    }, []);
    
    return (
      <div id="printable-student-record" className="hidden print:block text-black overflow-visible font-sans leading-tight">
        <div className="w-full">
          
          {/* HEADER SECTION - Left Aligned */}
          <div className="flex items-center gap-6 mb-4 pb-2 border-b-2 border-black border-opacity-20">
            {inst?.logo_url && (
              <div className="flex-shrink-0">
                <img src={inst.logo_url} className="w-24 h-24 object-contain" referrerPolicy="no-referrer" />
              </div>
            )}
            <div className="flex-1 space-y-0.5">
              <p className="text-[10pt] font-semibold tracking-wider text-left">DIOCESE DE GUARULHOS</p>
              <h1 className="text-[18pt] font-bold uppercase tracking-tight text-black leading-none text-left">
                {inst?.name || 'ESCOLA DIOCESANA DE MINISTÉRIOS'}
              </h1>
              {inst?.subtitle && (
                <p className="text-[11pt] font-bold uppercase text-blue-800 tracking-wider mt-1">{inst.subtitle}</p>
              )}
            </div>
          </div>

          <div className="text-center mb-2">
            <h2 className="text-[16pt] font-bold uppercase tracking-widest w-fit mx-auto pb-0.5">Ficha de Inscrição</h2>
          </div>

          {/* TOP CONTROL BOXES */}
          <div className="grid grid-cols-12 gap-3 mb-4">
            <div className="col-span-4 border border-black/40 p-2 flex flex-col h-32">
              <p className="text-[10pt] font-semibold border-b border-black/10 pb-0.5 mb-2">Controle da Escola</p>
              <div className="flex-1 flex flex-col justify-center items-center">
                <p className="text-[9pt] font-semibold mb-1 uppercase opacity-40 text-center">Matrícula</p>
                <div className="border border-black/10 h-10 w-full flex items-center justify-center font-bold text-[15pt] bg-white">
                  {selectedStudent.registration_number || ''}
                </div>
              </div>
            </div>

            <div className="col-span-5 border border-black/40 p-2 h-32 flex flex-col">
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
                        {isChecked && <span className="text-[10pt] font-black leading-none text-black">X</span>}
                      </div>
                      <span className="text-[9.5pt] font-medium leading-none uppercase">{course === 'S. Negros' ? 'História dos Santos Negros' : course}</span>
                    </div>
                  );
                })}

                {/* List all active enrollments explicitly if there are multiple */}
                {(studentEnrollments.length > 0) && (
                  <div className="mt-2 pt-2 border-t border-black/10">
                    <p className="text-[7pt] font-bold uppercase mb-1">Turmas Ativas:</p>
                    <p className="text-[8.5pt] font-black leading-tight uppercase">
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

            <div className="col-span-3 border border-black/40 flex items-center justify-center relative bg-white h-32">
              {selectedStudent.photo_url ? (
                <img src={selectedStudent.photo_url} className="w-full h-full object-cover p-0.5" referrerPolicy="no-referrer" />
              ) : (
                <div className="text-center text-black/10 uppercase">
                  <p className="text-[7pt] font-bold leading-tight tracking-tighter">FOTO 3X4</p>
                </div>
              )}
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
                         <span className="text-[10pt] font-black leading-none text-black">X</span>
                       )}
                    </div>
                    <span className="font-bold uppercase text-[8pt]">Sim</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-3.5 h-3.5 border border-black flex items-center justify-center bg-white shrink-0">
                       {selectedStudent.phone_mobile?.trim() && (String(selectedStudent.phone_mobile_is_whatsapp) !== 'true' && selectedStudent.phone_mobile_is_whatsapp !== true) && (
                         <span className="text-[10pt] font-black leading-none text-black">X</span>
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
                  <span className="flex-1 border-b border-black/20 font-medium uppercase px-2 pb-0.5 min-h-[22px] text-center">{selectedStudent.forany}</span>
                </div>
                <div className="flex items-end gap-2">
                  <span className="font-semibold uppercase whitespace-nowrap text-slate-900">Pastoral:</span>
                  <span className="flex-1 border-b border-black/20 font-medium uppercase px-2 pb-0.5 min-h-[22px] text-center">{selectedStudent.pastoral_participates}</span>
                </div>
              </div>
            </div>
          </div>

          {/* BASIC INFORMATION SECTION */}
          <div className="mb-2 p-3 bg-white border border-black/20 rounded-xl">
            <h4 className="text-[10pt] font-bold uppercase text-center mb-3 tracking-wider">Normas Básicas para Admissão</h4>
            <div className="text-[8.5pt] leading-relaxed space-y-1 font-normal text-slate-800">
              <p>1) O(a) aluno(a) concorda em priorizar a frequência no curso escolhido.</p>
              <p>2) Frequência mínima de 75% das aulas para aprovação.</p>
              <p>3) Nota mínima exigida para promoção é de 5,0 (cinco) por disciplina.</p>
              <p>4) Compromisso em manter em dia as contribuições estabelecidas.</p>
            </div>
          </div>

          <div className="text-[10.5pt] leading-normal mb-4 pt-1">
            <div className="flex items-baseline mb-1 gap-2">
              <span className="font-bold uppercase">Eu,</span>
              <span className="flex-1 border-b border-black font-semibold uppercase px-2">{selectedStudent.name}</span>
            </div>
            <p className="text-justify leading-relaxed font-normal text-slate-800">
              declaro que estou ciente e de ACORDO com as normas estabelecidas para ingresso no curso promovido pela Diocese de Guarulhos e autorizo o armazenamento de meus dados pessoais necessários para a inscrição.
            </p>
          </div>

          {/* DATE AND SIGNATURE */}
          <div className="flex justify-between items-end mb-4 px-2">
            <p className="text-[10.5pt] font-semibold text-slate-800">
              Guarulhos, <span>
                {selectedStudent.created_at ? new Date(selectedStudent.created_at).toLocaleDateString('pt-BR') : new Date().toLocaleDateString('pt-BR')}
              </span>
            </p>
            <div className="flex flex-col items-center">
              <div className="w-[80mm] border-t border-black/40 mb-1"></div>
              <p className="text-[9pt] font-semibold uppercase tracking-wider text-slate-700">Assinatura do Aluno(a)</p>
            </div>
          </div>

           {/* RODAPÉ */}
          <div className="border-t border-black/10 pt-3 flex justify-between items-end text-[7.2pt] font-medium text-slate-500 uppercase tracking-tight">
            <div className="flex-1 space-y-0.5">
              {inst?.address && <p>{inst.address}</p>}
              {(inst?.cep || inst?.city_uf) && (
                <p>
                  {inst?.cep && <span>CEP: {inst.cep}</span>}
                  {inst?.cep && inst?.city_uf && <span className="mx-2">-</span>}
                  {inst?.city_uf && <span>{inst.city_uf}</span>}
                </p>
              )}
              <p className="flex items-center gap-1.5">
                {inst?.phone && (
                  <span className="flex items-center gap-1 whitespace-nowrap">
                    <span>TEL:</span>
                    <span>{inst.phone}</span>
                    {inst?.phone_is_whatsapp && (
                      <svg viewBox="0 0 24 24" width="8" height="8" fill="#25D366" className="shrink-0 ml-0.5">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L0 24l6.335-1.662c1.72.937 3.659 1.43 5.623 1.43h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                      </svg>
                    )}
                  </span>
                )}
                {(inst?.phone && (inst?.whatsapp || inst?.email)) && (
                  <span className="opacity-20 mx-1 scale-y-125">|</span>
                )}
                {inst?.whatsapp && inst?.whatsapp !== inst?.phone && (
                  <span className="flex items-center gap-1 whitespace-nowrap">
                    <svg viewBox="0 0 24 24" width="9" height="9" fill="#25D366" className="shrink-0">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L0 24l6.335-1.662c1.72.937 3.659 1.43 5.623 1.43h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                      </svg>
                      <span>WHATSAPP:</span>
                      <span>{inst.whatsapp}</span>
                    </span>
                  )}
                {(inst?.whatsapp || inst?.phone) && inst?.email && (
                  <span className="opacity-20 mx-1 scale-y-125">|</span>
                )}
                {inst?.email && (
                  <span className="flex items-center gap-1 whitespace-nowrap">
                    <span>EMAIL:</span>
                    <span className="lowercase">{inst.email}</span>
                  </span>
                )}
              </p>
            </div>
            <div className="text-right max-w-[320px] pb-0.5 ml-8">
              {inst?.secretary && <p className="whitespace-pre-line leading-tight italic text-slate-400 font-normal">{inst.secretary}</p>}
            </div>
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

  return (
    <div className="h-[calc(100vh-8rem)] flex gap-6">
      {/* Sidebar List */}
      <div className="w-72 bg-white rounded-3xl shadow-sm border border-slate-100 flex flex-col overflow-hidden">
        <div className="p-4 border-b border-slate-100 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-[11px] font-black text-slate-400 uppercase tracking-widest leading-none">
              {selectedClassId ? 'Turma Selecionada' : 'Total Registrado'}
            </h2>
            <div className="flex gap-2 items-center">
              <div className="px-2 py-1 bg-blue-50 text-blue-700 text-[10px] font-black rounded-lg border border-blue-100" title={selectedClassId ? "Total na Turma Selecionada" : "Total de Alunos Registrados"}>
                {filteredStudents.length}
              </div>
              <button 
                onClick={handleNew}
                className="p-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors"
                title="Novo Aluno"
              >
                <Plus size={18} />
              </button>
            </div>
          </div>
          <div className="space-y-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input 
                type="text"
                placeholder="Buscar aluno..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
            <div className="flex gap-2">
              {(['Ativo', 'Inativo', 'Todos'] as const).map((status) => (
                <button
                  key={status}
                  onClick={() => setStatusFilter(status)}
                  className={cn(
                    "flex-1 py-1.5 text-[10px] font-bold rounded-lg transition-all border",
                    statusFilter === status 
                      ? "bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-200" 
                      : "bg-white border-slate-100 text-slate-500 hover:border-slate-200"
                  )}
                >
                  {status}
                </button>
              ))}
            </div>

            <div className="space-y-2">
              <select 
                value={selectedClassId}
                onChange={(e) => setSelectedClassId(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 focus:ring-2 focus:ring-blue-500/20"
              >
                <option value="">Todas as Turmas (Nome)</option>
                {classes.filter(c => c.status === 'Ativo').map(c => (
                  <option key={c.id} value={c.id}>{c.name} ({c.code})</option>
                ))}
              </select>
              <div className="flex gap-2">
                <select 
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(e.target.value)}
                  className="flex-1 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 focus:ring-2 focus:ring-blue-500/20"
                >
                  <option value="">Escolha um ano</option>
                  <option value="all">Todos os Anos</option>
                  {availableYears.map(y => <option key={y} value={y}>Matrícula {y}</option>)}
                </select>
                <button
                  onClick={() => setSortBy(sortBy === 'name' ? 'registration' : 'name')}
                  className="p-2 bg-white border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 transition-colors"
                  title={sortBy === 'name' ? "Ordering by Matrícula" : "Ordering by Name"}
                >
                  <ArrowUpDown size={16} />
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="animate-spin text-blue-500" />
            </div>
          ) : !selectedYear ? (
            <div className="flex flex-col items-center justify-center h-48 text-slate-400 p-6 text-center">
              <GraduationCap size={32} className="mb-2 opacity-20" />
              <p className="text-xs font-medium">Selecione uma turma para visualizar os alunos</p>
            </div>
          ) : filteredStudents.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-slate-400 p-6 text-center">
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

      {/* Main Content */}
      <div className="flex-1 bg-white rounded-3xl shadow-sm border border-slate-100 flex flex-col overflow-hidden">
        {selectedStudent || isEditing ? (
          <>
            {notification && (
              <div className={cn(
                "fixed top-4 left-1/2 -translate-x-1/2 z-[100] px-6 py-3 rounded-2xl shadow-2xl animate-in fade-in slide-in-from-top-4 duration-300 flex items-center gap-3",
                notification.type === 'success' ? "bg-green-600 text-white" : "bg-red-600 text-white"
              )}>
                {notification.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
                <p className="text-sm font-bold">{notification.message}</p>
              </div>
            )}
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-white">
              <div className="flex items-center gap-4">
                <div className="relative group">
                  <div className="w-24 h-32 rounded-2xl bg-white shadow-sm flex items-center justify-center text-blue-600 overflow-hidden border-2 border-white relative">
                    {formData.photo_url ? (
                      <img src={formData.photo_url} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <GraduationCap size={40} />
                    )}
                    
                    {uploadingPhoto && (
                      <div className="absolute inset-0 bg-blue-900/40 backdrop-blur-[2px] flex items-center justify-center">
                        <Loader2 className="text-white animate-spin" size={24} />
                      </div>
                    )}
                  </div>
                  {isEditing && !uploadingPhoto && (
                    <div className="absolute inset-0 bg-black/40 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                      <button 
                        onClick={() => setShowWebcam(true)}
                        className="p-1.5 bg-white text-blue-600 rounded-lg hover:scale-110 transition-transform"
                        title="Tirar Foto"
                      >
                        <Camera size={16} />
                      </button>
                      <label className="p-1.5 bg-white text-blue-600 rounded-lg hover:scale-110 transition-transform cursor-pointer" title="Upload Foto">
                        <Upload size={16} />
                        <input type="file" className="hidden" accept="image/*" onChange={handlePhotoUpload} />
                      </label>
                    </div>
                  )}
                </div>
                <div>
                  <h3 className="text-xl font-bold text-[#131b2e]">
                    {isEditing ? (selectedStudent ? 'Editar Aluno' : 'Novo Aluno') : formData.name}
                  </h3>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-slate-500 font-medium">Matrícula: {formData.registration_number || '---'}</span>
                    <span className={cn(
                      "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase",
                      formData.status === 'Ativo' ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-600"
                    )}>
                      {formData.status}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex gap-3">
                {!isEditing && selectedStudent && (
                  <button 
                    onClick={handlePrint}
                    className="h-10 px-4 bg-white border border-slate-200 text-slate-600 rounded-xl text-sm font-bold hover:bg-slate-50 transition-all flex items-center gap-2"
                  >
                    <Printer size={16} />
                    Imprimir Ficha
                  </button>
                )}
                {!isEditing && selectedStudent && (
                  <button 
                    onClick={() => navigate('/contributions', { state: { studentId: selectedStudent.id } })}
                    className="h-10 px-4 bg-blue-50 border border-blue-100 text-blue-600 rounded-xl text-sm font-bold hover:bg-blue-100 transition-all flex items-center gap-2"
                  >
                    <CreditCard size={16} />
                    Financeiro
                  </button>
                 )}
                {!isEditing && selectedStudent && (
                  <button 
                    onClick={() => setIsEditing(true)}
                    className="h-10 px-6 bg-[#00174b] text-white rounded-xl text-sm font-bold hover:scale-[1.02] active:scale-95 transition-all shadow-md flex items-center gap-2"
                  >
                    <Edit2 size={16} />
                    Editar
                  </button>
                )}
                {!isEditing && selectedStudent && (
                  <button 
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setShowDeleteConfirm(true);
                    }}
                    className="h-10 w-10 text-red-500 hover:bg-red-50 rounded-xl transition-all flex items-center justify-center bg-white border border-slate-100"
                    title="Excluir Aluno"
                  >
                    <Trash2 size={20} />
                  </button>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              <div className="p-8 pb-32">
                {showWebcam ? (
                <div className="max-w-md mx-auto space-y-4">
                  <div className="aspect-video bg-black rounded-3xl overflow-hidden relative">
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
                      className="px-4 py-2 bg-slate-100 text-slate-600 rounded-xl font-bold text-sm"
                    >
                      Cancelar
                    </button>
                    <button 
                      onClick={capturePhoto}
                      className="px-6 py-2 bg-blue-600 text-white rounded-xl font-bold text-sm flex items-center gap-2"
                    >
                      <Camera size={18} />
                      Capturar Foto
                    </button>
                  </div>
                </div>
              ) : (
                <div className="max-w-4xl space-y-8">
                  {/* Basic Info */}
                  <section className="space-y-4">
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                      <UserIcon size={14} />
                      Dados Pessoais
                    </h4>
                    <div className="grid grid-cols-12 gap-4">
                      <div className="col-span-3 space-y-1">
                        <label className="text-xs font-bold text-slate-700">Matrícula</label>
                        <input 
                          type="text"
                          disabled={!isEditing}
                          value={formData.registration_number || ''}
                          onChange={(e) => setFormData({...formData, registration_number: e.target.value})}
                          onKeyDown={handleKeyDown}
                          className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60"
                          tabIndex={1}
                        />
                      </div>
                      <div className="col-span-6 space-y-1">
                        <label className="text-xs font-bold text-slate-700">Nome Completo</label>
                        <input 
                          type="text"
                          disabled={!isEditing}
                          value={formData.name || ''}
                          onChange={(e) => setFormData({...formData, name: e.target.value})}
                          onKeyDown={handleKeyDown}
                          className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60"
                          tabIndex={2}
                        />
                      </div>
                      <div className="col-span-3 space-y-1">
                        <label className="text-xs font-bold text-slate-700">Situação</label>
                        <select 
                          disabled={!isEditing}
                          value={formData.status || 'Ativo'}
                          onChange={(e) => setFormData({...formData, status: e.target.value as any})}
                          onKeyDown={handleKeyDown}
                          className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60"
                          tabIndex={3}
                        >
                          <option value="Ativo">Ativo</option>
                          <option value="Inativo">Inativo</option>
                          <option value="Concluído">Concluído</option>
                          <option value="Suspenso">Suspenso</option>
                        </select>
                      </div>
                      <div className="col-span-4 space-y-1">
                        <label className="text-xs font-bold text-slate-700">CPF</label>
                        <input 
                          type="text"
                          disabled={!isEditing}
                          value={formData.cpf || ''}
                          onChange={(e) => setFormData({...formData, cpf: maskCPF(e.target.value)})}
                          onKeyDown={handleKeyDown}
                          className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60"
                          placeholder="000.000.000-00"
                          tabIndex={4}
                        />
                      </div>
                      <div className="col-span-4 space-y-1">
                        <label className="text-xs font-bold text-slate-700">RG</label>
                        <input 
                          type="text"
                          disabled={!isEditing}
                          value={formData.rg || ''}
                          onChange={(e) => setFormData({...formData, rg: maskRG(e.target.value)})}
                          onKeyDown={handleKeyDown}
                          className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60"
                          placeholder="00.000.000-0"
                          tabIndex={5}
                        />
                      </div>
                      <div className="col-span-4 space-y-1">
                        <label className="text-xs font-bold text-slate-700">Data de Nascimento</label>
                        <input 
                          type="text"
                          disabled={!isEditing}
                          placeholder="DD/MM/AAAA"
                          value={formData.birth_date || ''}
                          onChange={(e) => setFormData({...formData, birth_date: maskDate(e.target.value)})}
                          onKeyDown={handleKeyDown}
                          className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60"
                          tabIndex={6}
                        />
                      </div>
                      <div className="col-span-8 space-y-1">
                        <label className="text-xs font-bold text-slate-700">Turma Principal (Vínculo Direto)</label>
                        <select 
                          disabled={!isEditing}
                          value={formData.class_id || ''}
                          onChange={(e) => setFormData({...formData, class_id: e.target.value})}
                          onKeyDown={handleKeyDown}
                          className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60"
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

                      <div className="col-span-4 space-y-1">
                        <label className="text-xs font-bold text-slate-700">Data de inicio da TURMA</label>
                        <input 
                          type="text"
                          disabled={!isEditing}
                          placeholder="DD/MM/AAAA"
                          value={formData.start_date || ''}
                          onChange={(e) => setFormData({...formData, start_date: maskDate(e.target.value)})}
                          onKeyDown={handleKeyDown}
                          className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60"
                          tabIndex={8}
                        />
                      </div>

                      {/* Enrollment Management - Integrated directly */}
                      {selectedStudent?.id ? (
                        <div className="col-span-12 p-4 bg-blue-50/50 border border-blue-100 rounded-2xl space-y-3 mt-2 mb-4">
                          <div className="flex items-center justify-between">
                            <h4 className="text-[10px] font-black text-blue-600 uppercase tracking-widest flex items-center gap-2">
                              <BookOpen size={14} />
                              Matrículas Adicionais (Multi-turma)
                            </h4>
                            <span className="text-[9px] font-bold text-blue-400 uppercase bg-white px-2 py-0.5 rounded-full border border-blue-100">
                              Gestão Ativa
                            </span>
                          </div>

                          <div className="flex gap-2">
                            <select 
                              disabled={!isEditing}
                              value={enrollClassId}
                              onChange={(e) => setEnrollClassId(e.target.value)}
                              className="flex-1 px-3 py-2 bg-white border border-blue-100 rounded-xl text-xs focus:ring-2 focus:ring-blue-500/20 outline-none shadow-sm disabled:opacity-50"
                            >
                              <option value="">Matricular em outra turma...</option>
                              {classes.filter(c => c.status === 'Ativo' && c.id !== formData.class_id).map(c => (
                                <option key={c.id} value={c.id}>{c.name} ({c.code})</option>
                              ))}
                            </select>
                            <button
                              onClick={() => {
                                handleAddEnrollment(enrollClassId);
                                setEnrollClassId('');
                              }}
                              disabled={!enrollClassId || !isEditing}
                              className="px-4 py-2 bg-blue-600 text-white rounded-xl text-[10px] font-black uppercase hover:bg-blue-700 transition-all disabled:opacity-50 flex items-center gap-1 shadow-md shadow-blue-100"
                            >
                              <Plus size={14} />
                              Matricular
                            </button>
                          </div>

                          <div className="space-y-1.5 max-h-[150px] overflow-y-auto pr-1 custom-scrollbar">
                            {studentEnrollments.length === 0 ? (
                              <p className="text-[9px] text-blue-400 font-bold text-center py-2 italic bg-white/50 rounded-lg border border-dashed border-blue-100">
                                Nenhuma matrícula adicional registrada
                              </p>
                            ) : (
                              studentEnrollments.map(enrollment => {
                                const targetClass = classes.find(c => c.id === enrollment.class_id);
                                return (
                                  <div key={enrollment.id} className="flex items-center justify-between p-2 bg-white rounded-xl border border-blue-50 shadow-sm group">
                                    <div className="flex items-center gap-2">
                                      <div className="w-6 h-6 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
                                        <GraduationCap size={12} />
                                      </div>
                                      <div className="leading-tight">
                                        <p className="text-[10px] font-black text-slate-700 uppercase">{targetClass?.name || 'Turma N/I'}</p>
                                        <p className="text-[8px] text-slate-400 font-bold uppercase">
                                          {enrollment.enrollment_date ? formatDateForDisplay(enrollment.enrollment_date) : ''}
                                        </p>
                                      </div>
                                    </div>
                                    {isEditing && (
                                      <button 
                                        onClick={() => handleRemoveEnrollment(enrollment.id)}
                                        className="p-1 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                                        title="Remover Matrícula"
                                      >
                                        <X size={12} />
                                      </button>
                                    )}
                                  </div>
                                );
                              })
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="col-span-12 p-3 bg-slate-50 border border-dashed border-slate-200 rounded-2xl mb-4 text-center">
                          <p className="text-[9px] text-slate-400 font-bold uppercase tracking-tight">
                            Salve o cadastro básico primeiro para habilitar as matriculas múltiplas
                          </p>
                        </div>
                      )}
                    </div>
                  </section>

                  {/* Contact & Address */}
                  <section className="space-y-4">
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                      <MapPin size={14} />
                      Endereço e Contato
                    </h4>
                    <div className="grid grid-cols-12 gap-4">
                      <div className="col-span-12 space-y-1">
                        <label className="text-xs font-bold text-slate-700">Logradouro (Rua, Número, Complemento)</label>
                        <input 
                          type="text"
                          disabled={!isEditing}
                          value={formData.address_street || ''}
                          onChange={(e) => setFormData({...formData, address_street: e.target.value})}
                          onKeyDown={handleKeyDown}
                          className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60"
                          tabIndex={9}
                        />
                      </div>
                      <div className="col-span-4 space-y-1">
                        <label className="text-xs font-bold text-slate-700">Bairro</label>
                        <input 
                          type="text"
                          disabled={!isEditing}
                          value={formData.address_neighborhood || ''}
                          onChange={(e) => setFormData({...formData, address_neighborhood: e.target.value})}
                          onKeyDown={handleKeyDown}
                          className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60"
                          tabIndex={10}
                        />
                      </div>
                      <div className="col-span-5 space-y-1">
                        <label className="text-xs font-bold text-slate-700">Cidade</label>
                        <input 
                          type="text"
                          disabled={!isEditing}
                          value={formData.address_city || ''}
                          onChange={(e) => setFormData({...formData, address_city: e.target.value})}
                          onKeyDown={handleKeyDown}
                          className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60"
                          tabIndex={11}
                        />
                      </div>
                      <div className="col-span-3 space-y-1">
                        <label className="text-xs font-bold text-slate-700">UF / Estado</label>
                        <input 
                          type="text"
                          disabled={!isEditing}
                          value={formData.address_state || ''}
                          onChange={(e) => setFormData({...formData, address_state: e.target.value})}
                          onKeyDown={handleKeyDown}
                          className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60"
                          tabIndex={12}
                        />
                      </div>
                      <div className="col-span-3 space-y-1">
                        <label className="text-xs font-bold text-slate-700">CEP</label>
                        <input 
                          type="text"
                          disabled={!isEditing}
                          value={formData.address_zip || ''}
                          onChange={(e) => setFormData({...formData, address_zip: maskCEP(e.target.value)})}
                          onKeyDown={handleKeyDown}
                          className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60"
                          placeholder="00000-000"
                          tabIndex={13}
                        />
                      </div>
                      <div className="col-span-5 space-y-1">
                        <label className="text-xs font-bold text-slate-700">E-mail</label>
                        <input 
                          type="email"
                          disabled={!isEditing}
                          value={formData.email || ''}
                          onChange={(e) => setFormData({...formData, email: e.target.value})}
                          onKeyDown={handleKeyDown}
                          className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60"
                          tabIndex={14}
                        />
                      </div>
                      <div className="col-span-4 space-y-1">
                        <label className="text-xs font-bold text-slate-700">Celular</label>
                        <div className="relative">
                          <input 
                            type="text"
                            disabled={!isEditing}
                            value={formData.phone_mobile || ''}
                            onChange={(e) => setFormData({...formData, phone_mobile: maskPhone(e.target.value)})}
                            onKeyDown={handleKeyDown}
                            className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-normal focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60 pr-10"
                            placeholder="(00) 00000-0000"
                            tabIndex={15}
                          />
                          <button
                            type="button"
                            disabled={!isEditing}
                            onClick={() => setFormData({ ...formData, phone_mobile_is_whatsapp: !formData.phone_mobile_is_whatsapp })}
                            className={cn(
                              "absolute right-3 top-1/2 -translate-y-1/2 transition-all p-1 rounded-md",
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
                  <section className="space-y-4">
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                      <GraduationCap size={14} />
                      Informações Pastorais
                    </h4>
                    <div className="grid grid-cols-12 gap-4">
                      <div className="col-span-5 space-y-1">
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
                              if (foraria) updates.forany = foraria.name;
                            }
                            
                            setFormData({...formData, ...updates});
                          }}
                          onKeyDown={handleKeyDown}
                          className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60 font-bold"
                          tabIndex={16}
                        >
                          <option value="">Selecione...</option>
                          {parishesList.map(p => (
                            <option key={p.id} value={p.name}>{p.name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="col-span-4 space-y-1">
                        <label className="text-xs font-bold text-slate-700">Forania</label>
                        <select 
                          disabled={!isEditing}
                          value={formData.forany || ''}
                          onChange={(e) => setFormData({...formData, forany: e.target.value})}
                          onKeyDown={handleKeyDown}
                          className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60 font-bold"
                          tabIndex={16}
                        >
                          <option value="">Selecione...</option>
                          {forariesList.map(f => (
                            <option key={f.id} value={f.name}>{f.name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="col-span-3 space-y-1">
                        <label className="text-xs font-bold text-slate-700">Pastoral</label>
                        <input 
                          type="text"
                          disabled={!isEditing}
                          value={formData.pastoral_participates || ''}
                          onChange={(e) => setFormData({...formData, pastoral_participates: e.target.value})}
                          onKeyDown={handleKeyDown}
                          className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60"
                          tabIndex={17}
                        />
                      </div>
                    </div>
                  </section>

                  {/* Registration Date (Last Field) */}
                  <section className="space-y-4 pt-4 border-t border-slate-100">
                    <div className="grid grid-cols-12 gap-4">
                      <div className="col-span-6 space-y-1">
                        <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5 cursor-help" title="Data em que o aluno foi cadastrado pela primeira vez">
                          <AlertCircle size={12} className="text-blue-500" />
                          Data da Inscrição
                        </label>
                        <div className="w-full px-4 py-2 bg-slate-100/50 text-slate-500 rounded-xl text-sm border border-dashed border-slate-200 flex items-center gap-2">
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

                  {/* Action Buttons in Footer */}
                  {isEditing && (
                    <div className="pt-10 flex items-center gap-4 border-t border-slate-100 mt-12 pb-12">
                      <button 
                        onClick={() => {
                          setIsEditing(false);
                          setUploadingPhoto(false);
                        }}
                        className="flex-1 h-12 bg-slate-100 text-slate-600 rounded-2xl text-sm font-bold hover:bg-slate-200 transition-all flex items-center justify-center gap-2"
                        tabIndex={18}
                      >
                        <X size={18} />
                        Cancelar Alterações
                      </button>
                      <button 
                        onClick={handleSave}
                        disabled={loading || uploadingPhoto}
                        className="flex-[2] h-12 bg-[#00174b] text-white rounded-2xl text-sm font-bold hover:scale-[1.01] active:scale-95 transition-all shadow-xl shadow-blue-900/10 disabled:opacity-50 flex items-center justify-center gap-2"
                        tabIndex={19}
                      >
                        {loading ? (
                          <>
                            <Loader2 size={18} className="animate-spin" />
                            Processando...
                          </>
                        ) : (
                          <>
                            <Save size={18} />
                            Salvar Dados da Ficha
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              )}
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 space-y-4">
            <div className="w-20 h-20 bg-slate-50 rounded-3xl flex items-center justify-center">
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
          <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-sm w-full space-y-6 animate-in zoom-in-95 duration-200">
            <div className="w-16 h-16 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mx-auto">
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
                className="flex-1 px-4 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold text-sm hover:bg-slate-200 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                disabled={loading}
                className="flex-1 px-4 py-3 bg-red-600 text-white rounded-xl font-bold text-sm hover:bg-red-700 transition-colors shadow-lg shadow-red-200 disabled:opacity-50"
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
