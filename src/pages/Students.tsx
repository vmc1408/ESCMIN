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
import { formatCurrency, cn } from '../lib/utils';
import { uploadImage, fetchAll, saveData, deleteData } from '../lib/database';
import { Student, Class } from '../types';
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
            <span className="text-[9px] text-blue-600 font-black ml-1 uppercase">Entrada: {student.start_date}</span>
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

const maskPhone = (value: string) => {
  return value
    .replace(/\D/g, '')
    .replace(/(\d{2})(\d)/, '($1) $2')
    .replace(/(\d{5})(\d)/, '$1-$2')
    .replace(/(-\d{4})\d+?$/, '$1');
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
const formatDateForDisplay = (dateStr: string | undefined): string => {
  if (!dateStr) return '';
  
  // Handle ISO string by taking only the date part
  const pureDate = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr;
  
  if (pureDate.includes('/')) {
    // Check if it's already DD/MM/YYYY
    const parts = pureDate.split('/');
    if (parts.length === 3 && parts[0].length <= 2) return pureDate;
    return pureDate;
  }
  
  const parts = pureDate.split('-');
  if (parts.length === 3) {
    const [year, month, day] = parts;
    return `${day}/${month}/${year}`;
  }
  return pureDate;
};

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
  const [showPrintPreview, setShowPrintPreview] = useState(false);
  const webcamRef = useRef<Webcam>(null);

  useEffect(() => {
    fetchStudents();
    fetchClasses();
    fetchParishes();
    fetchForaries();
  }, []);

  // Auto-fill student start date based on selected class
  useEffect(() => {
    if (isEditing && formData.class_id) {
      const targetClass = classes.find(c => c.id === formData.class_id);
      if (targetClass?.start_date) {
        const formattedDate = formatDateForDisplay(targetClass.start_date);
        // Only auto-fill if the current start_date is empty or a default placeholder
        const isPlaceholder = !formData.start_date || 
                            formData.start_date === 'MM/AAAA' || 
                            formData.start_date === 'DD/MM/AAAA' ||
                            formData.start_date.includes('MM') ||
                            formData.start_date.includes('DD');
                            
        if (isPlaceholder) {
          setFormData(prev => ({ ...prev, start_date: formattedDate }));
        }
      }
    }
  }, [formData.class_id, classes, isEditing, formData.start_date]);

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
      birth_date: student.birth_date || '',
      address_street: student.address_street || '',
      address_neighborhood: student.address_neighborhood || '',
      address_city: student.address_city || 'Guarulhos',
      address_state: student.address_state || 'SP',
      address_zip: student.address_zip || '',
      parish: student.parish || '',
      course: student.course || '',
      pastoral_participates: student.pastoral_participates || '',
      start_date: student.start_date || '',
      photo_url: student.photo_url || ''
    });
    setIsEditing(false);
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
      
      const dataToSave = { ...formData };
      
      // Set created_at only if it's the first time saving (no id)
      if (!selectedStudent?.id && !dataToSave.created_at) {
        dataToSave.created_at = new Date().toISOString();
      }

      const savedId = await saveData('students', selectedStudent?.id, dataToSave);
      
      setNotification({ type: 'success', message: 'Ficha do aluno salva com sucesso!' });
      setIsEditing(false);
      setUploadingPhoto(false); // Reset upload state on save success
      fetchStudents();
      
      // Update selected student with fresh data including the ID if it was new
      if (!selectedStudent?.id && savedId) {
        handleSelectStudent({ ...dataToSave, id: savedId } as Student);
      } else {
        // Update local state if editing existing
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

        const url = await uploadImage(file, 'assets', 'students');
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
      const url = await uploadImage(file, 'assets', 'students');
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
    setShowPrintPreview(false);
  };

  const PrintableGrade = () => {
    if (!selectedStudent) return null;
    const currentClass = classes.find(c => c.id === selectedStudent.class_id);
    
    return (
      <div id="printable-student-record" className="hidden print:block fixed inset-0 bg-white z-[9999] p-12 text-black overflow-visible font-serif">
        <div className="max-w-[190mm] mx-auto space-y-8">
          {/* Cabeçalho Institucional */}
          <div className="flex items-center gap-8 border-b-4 border-slate-900 pb-6">
            <div className="w-24 h-24 bg-slate-100 flex items-center justify-center border-2 border-slate-900">
              <GraduationCap size={48} className="text-black" />
            </div>
            <div className="flex-1 text-center">
              <h1 className="text-2xl font-black uppercase tracking-tight">DIOCESE DE GUARULHOS</h1>
              <h2 className="text-lg font-bold text-slate-700 uppercase">Escola Diocesana de Ministérios</h2>
              <p className="text-[10px] mt-1 font-bold italic">Ficha de Inscrição Acadêmica - Registro Oficial</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-black uppercase">Matrícula</p>
              <p className="text-xl font-black tracking-tighter">{selectedStudent.registration_number}</p>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-8">
            <div className="col-span-1">
              <div className="aspect-[3/4] border-2 border-slate-900 flex items-center justify-center overflow-hidden bg-slate-50 relative">
                {selectedStudent.photo_url ? (
                   <img src={selectedStudent.photo_url} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <p className="text-[10px] font-black uppercase text-slate-300">Foto 3x4</p>
                )}
              </div>
            </div>
            
            <div className="col-span-3 space-y-6">
              <div>
                <p className="text-[10px] font-black uppercase text-slate-500 mb-1">Nome Completo do Candidato</p>
                <p className="text-2xl font-black uppercase border-b border-slate-900 pb-1">{selectedStudent.name}</p>
              </div>

              <div className="grid grid-cols-3 gap-6">
                <div>
                  <p className="text-[10px] font-black uppercase text-slate-500 mb-1">CPF</p>
                  <p className="text-sm font-bold border-b border-slate-100">{selectedStudent.cpf || '---'}</p>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase text-slate-500 mb-1">RG</p>
                  <p className="text-sm font-bold border-b border-slate-100">{selectedStudent.rg || '---'}</p>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase text-slate-500 mb-1">Nascimento</p>
                  <p className="text-sm font-bold border-b border-slate-100">{formatDateForDisplay(selectedStudent.birth_date) || '---'}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-12 py-8 border-t border-slate-200">
            <div className="space-y-4">
              <h3 className="text-xs font-black uppercase tracking-widest border-l-4 border-slate-900 pl-3 bg-slate-50 py-1">Endereço e Contato</h3>
              <div className="space-y-2">
                <div>
                  <p className="text-[9px] font-black text-slate-400 uppercase">Logradouro</p>
                  <p className="text-sm font-bold">{selectedStudent.address_street || '---'}</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-[9px] font-black text-slate-400 uppercase">Bairro</p>
                    <p className="text-sm font-bold">{selectedStudent.address_neighborhood || '---'}</p>
                  </div>
                  <div>
                    <p className="text-[9px] font-black text-slate-400 uppercase">Cidade/UF</p>
                    <p className="text-sm font-bold">{selectedStudent.address_city} - {selectedStudent.address_state}</p>
                  </div>
                </div>
                <div>
                  <p className="text-[9px] font-black text-slate-400 uppercase">E-mail</p>
                  <p className="text-sm font-bold">{(selectedStudent.email || '---').toLowerCase()}</p>
                </div>
              </div>
            </div>
            <div className="space-y-4">
              <h3 className="text-xs font-black uppercase tracking-widest border-l-4 border-slate-900 pl-3 bg-slate-50 py-1">Informações Pastorais</h3>
              <div className="space-y-4">
                <div>
                  <p className="text-[9px] font-black text-slate-400 uppercase">Paróquia / Forania</p>
                  <p className="text-sm font-bold">{selectedStudent.parish || '---'}</p>
                </div>
                <div>
                  <p className="text-[9px] font-black text-slate-400 uppercase">Atuação Pastoral</p>
                  <p className="text-sm font-bold">{selectedStudent.pastoral_participates || '---'}</p>
                </div>
                <div className="p-4 border-2 border-slate-100 rounded-xl bg-slate-50/50">
                   <p className="text-[9px] font-black text-slate-400 uppercase mb-2">Curso Selecionado</p>
                   <p className="text-base font-black text-blue-800">{currentClass?.name || 'FORMAÇÃO TEOLÓGICA BÁSICA'}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="p-8 border-2 border-slate-900 rounded-3xl space-y-6">
            <h4 className="text-xs font-black uppercase text-center border-b border-slate-200 pb-2">Termo de Ciência e Acordo</h4>
            <div className="text-[11px] leading-relaxed text-slate-700 italic text-justify space-y-2">
              <p>1. O(a) interessado(a) afirma estar ciente de que as aulas ocorrerão conforme o calendário acadêmico vigente.</p>
              <p>2. É obrigatória a frequência mínima de 75% em cada disciplina para a obtenção do certificado de conclusão.</p>
              <p>3. O(a) aluno(a) autoriza a Diocese de Guarulhos a utilizar seus dados cadastrais para fins exclusivamente acadêmicos e administrativos.</p>
            </div>
            <p className="text-[11px] pt-4">
              Eu, <strong>{selectedStudent.name.toUpperCase()}</strong>, declaro para os devidos fins que os dados acima são verdadeiros e que aceito as normas da Escola Diocesana de Ministérios.
            </p>
          </div>

          <div className="mt-24 flex justify-between items-end px-12">
            <div className="w-72 border-t-2 border-slate-900 pt-3 text-center">
              <p className="text-[10px] font-black uppercase">Assinatura do Candidato</p>
            </div>
            <div className="w-72 border-t-2 border-slate-900 pt-3 text-center">
              <p className="text-[10px] font-black uppercase">Secretaria Acadêmica</p>
              <p className="text-[8px] font-bold text-slate-400 uppercase mt-1 tracking-widest">Selo de Autenticidade</p>
            </div>
          </div>

          <div className="mt-16 text-[9px] text-slate-400 font-bold uppercase text-center flex justify-between items-center opacity-50">
            <p>Gerado pelo Sistema Acadêmico ESCMIN</p>
            <p>Guarulhos, {new Date().toLocaleDateString('pt-BR')}</p>
            <p>Pág 1/1</p>
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
      
      const matchesStatus = statusFilter === 'Todos' || (s.status || 'Ativo') === statusFilter || (s.status === '' && statusFilter === 'Ativo');
      
      // Filter logic
      let matchesYear = true;
      if (selectedYear !== '' && selectedYear !== 'all') {
        const studentYear = getYearFromRegistration(s.registration_number);
        matchesYear = studentYear === selectedYear;
      }

      let matchesClass = true;
      if (selectedClassId !== '') {
        matchesClass = s.class_id === selectedClassId;
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
  }, [students, searchTerm, statusFilter, selectedYear, selectedClassId, sortBy]);

  const availableYears = React.useMemo(() => {
    return Array.from(new Set(students.map(s => getYearFromRegistration(s.registration_number)).filter(Boolean))).sort().reverse();
  }, [students]);

  return (
    <div className="h-[calc(100vh-8rem)] flex gap-6">
      {/* Sidebar List */}
      <div className="w-72 bg-white rounded-3xl shadow-sm border border-slate-100 flex flex-col overflow-hidden">
        <div className="p-4 border-b border-slate-50 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-[#131b2e]">Alunos</h2>
            <div className="flex gap-2">
              <div className="px-2 py-1 bg-blue-50 text-blue-700 text-[10px] font-black rounded-lg border border-blue-100">
                {students.length}
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
                className="w-full pl-9 pr-4 py-2 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20"
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
                className="w-full px-3 py-2 bg-slate-50 border-none rounded-xl text-xs font-bold text-slate-600 focus:ring-2 focus:ring-blue-500/20"
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
                  className="flex-1 px-3 py-2 bg-slate-50 border-none rounded-xl text-xs font-bold text-slate-600 focus:ring-2 focus:ring-blue-500/20"
                >
                  <option value="">Escolha um ano</option>
                  <option value="all">Todos os Anos</option>
                  {availableYears.map(y => <option key={y} value={y}>Matrícula {y}</option>)}
                </select>
                <button
                  onClick={() => setSortBy(sortBy === 'name' ? 'registration' : 'name')}
                  className="p-2 bg-slate-50 text-slate-600 rounded-xl hover:bg-slate-100 transition-colors"
                  title={sortBy === 'name' ? "Ordenar por Matrícula" : "Ordenar por Nome"}
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
            <div className="p-6 border-b border-slate-50 flex items-center justify-between bg-slate-50/50">
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
                    onClick={() => setShowPrintPreview(true)}
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
                          className="w-full px-4 py-2 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60"
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
                          className="w-full px-4 py-2 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60"
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
                          className="w-full px-4 py-2 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60"
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
                          className="w-full px-4 py-2 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60"
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
                          className="w-full px-4 py-2 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60"
                          placeholder="00.000.000-0"
                          tabIndex={5}
                        />
                      </div>
                      <div className="col-span-4 space-y-1">
                        <label className="text-xs font-bold text-slate-700">Data de Nascimento</label>
                        <input 
                          type="date"
                          disabled={!isEditing}
                          value={formData.birth_date || ''}
                          onChange={(e) => setFormData({...formData, birth_date: e.target.value})}
                          onKeyDown={handleKeyDown}
                          className="w-full px-4 py-2 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60"
                          tabIndex={6}
                        />
                      </div>
                      <div className="col-span-8 space-y-1">
                        <label className="text-xs font-bold text-slate-700">Turma</label>
                        <select 
                          disabled={!isEditing}
                          value={formData.class_id || ''}
                          onChange={(e) => setFormData({...formData, class_id: e.target.value})}
                          onKeyDown={handleKeyDown}
                          className="w-full px-4 py-2 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60"
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
                        <label className="text-xs font-bold text-slate-700">Data de Início</label>
                        <input 
                          type="text"
                          disabled={!isEditing}
                          placeholder="DD/MM/AAAA"
                          value={formData.start_date || ''}
                          onChange={(e) => setFormData({...formData, start_date: e.target.value})}
                          onKeyDown={handleKeyDown}
                          className="w-full px-4 py-2 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60"
                          tabIndex={8}
                        />
                      </div>
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
                          className="w-full px-4 py-2 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60"
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
                          className="w-full px-4 py-2 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60"
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
                          className="w-full px-4 py-2 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60"
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
                          className="w-full px-4 py-2 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60"
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
                          className="w-full px-4 py-2 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60"
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
                          className="w-full px-4 py-2 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60"
                          tabIndex={14}
                        />
                      </div>
                      <div className="col-span-4 space-y-1">
                        <label className="text-xs font-bold text-slate-700">Celular</label>
                        <input 
                          type="text"
                          disabled={!isEditing}
                          value={formData.phone_mobile || ''}
                          onChange={(e) => setFormData({...formData, phone_mobile: maskPhone(e.target.value)})}
                          onKeyDown={handleKeyDown}
                          className="w-full px-4 py-2 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60"
                          placeholder="(00) 00000-0000"
                          tabIndex={15}
                        />
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
                          className="w-full px-4 py-2 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60 font-bold"
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
                          className="w-full px-4 py-2 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60 font-bold"
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
                          className="w-full px-4 py-2 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60"
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
      {/* Print Preview Modal */}
      <AnimatePresence>
        {showPrintPreview && selectedStudent && (
          <div className="fixed inset-0 z-[250] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-[2.5rem] shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col border border-slate-200"
            >
              {/* Header */}
              <div className="px-8 py-10 bg-[#00174b] text-white flex items-center justify-between">
                <div className="flex items-center gap-6">
                  <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center shadow-2xl ring-4 ring-white/10">
                    <Printer size={32} className="text-white" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-black uppercase tracking-tight">Pré-visualização da Ficha</h3>
                    <p className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em] mt-1">
                      Revise os dados antes de confirmar a impressão
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowPrintPreview(false)}
                  className="p-3 hover:bg-white/10 rounded-full transition-all text-white/50 hover:text-white"
                >
                  <X size={24} />
                </button>
              </div>

              {/* Content Preview */}
              <div className="flex-1 overflow-y-auto p-10 bg-slate-50/30">
                <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm p-8 space-y-10">
                  {/* Institutional Mini Header */}
                  <div className="flex items-center gap-6 pb-8 border-b border-slate-50">
                    <div className="w-16 h-16 bg-slate-100 rounded-xl flex items-center justify-center text-slate-400">
                      <GraduationCap size={32} />
                    </div>
                    <div>
                      <h4 className="text-sm font-black text-slate-800 uppercase tracking-tight">DIOCESE DE GUARULHOS</h4>
                      <p className="text-xs font-bold text-slate-500">Escola Diocesana de Ministérios</p>
                    </div>
                  </div>

                  {/* Student Summary */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
                    <div className="aspect-[3/4] bg-slate-50 rounded-2xl border-2 border-slate-100 overflow-hidden flex items-center justify-center relative">
                      {selectedStudent.photo_url ? (
                        <img src={selectedStudent.photo_url} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      ) : (
                        <div className="text-center p-4">
                          <UserIcon size={32} className="mx-auto text-slate-300 mb-2" />
                          <p className="text-[10px] font-bold text-slate-400 uppercase">Sem Foto</p>
                        </div>
                      )}
                      <div className="absolute top-2 right-2 px-2 py-1 bg-white/90 backdrop-blur-sm rounded-lg shadow-sm border border-slate-100">
                        <p className="text-[9px] font-black text-slate-600 uppercase tracking-tighter">
                          MAT: {selectedStudent.registration_number}
                        </p>
                      </div>
                    </div>

                    <div className="md:col-span-3 space-y-6">
                      <div className="space-y-1">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nome do Aluno</p>
                        <p className="text-2xl font-black text-[#131b2e] leading-tight uppercase">{selectedStudent.name}</p>
                      </div>

                      <div className="grid grid-cols-2 lg:grid-cols-3 gap-6">
                        <div className="space-y-1">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Documento CPF</p>
                          <p className="text-sm font-bold text-slate-700">{selectedStudent.cpf || 'Não informado'}</p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Documento RG</p>
                          <p className="text-sm font-bold text-slate-700">{selectedStudent.rg || 'Não informado'}</p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nascimento</p>
                          <p className="text-sm font-bold text-slate-700">{formatDateForDisplay(selectedStudent.birth_date) || 'Não informado'}</p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Turma Vinculada</p>
                          <p className="text-sm font-bold text-blue-600">
                            {classes.find(c => c.id === selectedStudent.class_id)?.name || 'Geral'}
                          </p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Data Inscrição</p>
                          <p className="text-sm font-bold text-slate-700">{formatDateForDisplay(selectedStudent.created_at) || '---'}</p>
                        </div>
                         <div className="space-y-1">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Celular</p>
                          <p className="text-sm font-bold text-slate-700">{selectedStudent.phone_mobile || 'Não informado'}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Contact Info */}
                  <div className="grid grid-cols-2 gap-8 pt-8 border-t border-slate-50">
                    <div className="space-y-3">
                      <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                        <MapPin size={12} className="text-blue-500" />
                        Endereço Completo
                      </h5>
                      <div className="space-y-1">
                        <p className="text-sm font-bold text-slate-700 leading-snug">
                          {selectedStudent.address_street || 'Rua não informada'}, {selectedStudent.address_neighborhood || 'Bairro omitido'}
                        </p>
                        <p className="text-xs font-bold text-slate-400 uppercase">
                          {selectedStudent.address_city} - {selectedStudent.address_state} | CEP: {selectedStudent.address_zip}
                        </p>
                      </div>
                    </div>
                    <div className="space-y-3">
                      <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                        <Phone size={12} className="text-blue-500" />
                        Participação Pastoral
                      </h5>
                      <div className="space-y-1">
                        <p className="text-sm font-bold text-slate-700 leading-snug">
                          {selectedStudent.parish || 'Sem paróquia vinculada'}
                        </p>
                        <p className="text-xs font-bold text-slate-400 uppercase">
                          Pastoral: {selectedStudent.pastoral_participates || 'Não informada'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Warning Box */}
                  <div className="p-6 bg-amber-50 border border-amber-100 rounded-3xl flex gap-4">
                    <div className="w-10 h-10 bg-amber-200/50 rounded-xl flex items-center justify-center text-amber-600 shrink-0">
                      <AlertCircle size={20} />
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-black text-amber-900 uppercase">Atenção</p>
                      <p className="text-[11px] font-bold text-amber-700 leading-relaxed">
                        Ao imprimir, o sistema irá gerar o documento oficial em formato PDF com o timbre da Diocese e as normas de admissão. Certifique-se de que todos os dados acima estão corretos.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="p-8 bg-slate-50 border-t border-slate-100 flex gap-4">
                <button 
                  onClick={() => setShowPrintPreview(false)}
                  className="flex-1 py-5 px-6 bg-white border-2 border-slate-200 text-slate-500 rounded-[1.5rem] text-[10px] font-black uppercase tracking-widest hover:bg-slate-100 hover:border-slate-300 transition-all active:scale-[0.98]"
                >
                  Cancelar e Voltar
                </button>
                <button 
                  onClick={handlePrint}
                  className="flex-[1.5] py-5 px-6 bg-blue-600 text-white rounded-[1.5rem] text-[10px] font-black uppercase tracking-widest hover:bg-blue-700 shadow-2xl shadow-blue-200 transition-all active:scale-[0.98] flex items-center justify-center gap-3"
                >
                  <Printer size={18} />
                  Confirmar Impressão da Ficha
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

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
