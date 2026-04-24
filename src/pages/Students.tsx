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
  Loader2,
  Plus,
  GraduationCap,
  CheckCircle2,
  AlertCircle,
  Camera,
  Upload,
  RotateCcw,
  ArrowUpDown,
  CreditCard
} from 'lucide-react';
import Webcam from 'react-webcam';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatCurrency, cn } from '../lib/utils';
import { db, uploadImage, fetchAll, saveData, deleteData } from '../lib/firebase';
import { collection, addDoc, updateDoc, doc, query, limit, getDocs } from 'firebase/firestore';
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
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'Ativo' | 'Inativo' | 'Todos'>('Ativo');
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<Partial<Student>>({});
  const [selectedYear, setSelectedYear] = useState<string>('all');
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [sortBy, setSortBy] = useState<'name' | 'registration'>('registration');
  const [showWebcam, setShowWebcam] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [notification, setNotification] = useState<{type: 'success' | 'error', message: string} | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const webcamRef = useRef<Webcam>(null);

  useEffect(() => {
    fetchStudents();
    fetchClasses();
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
    setFormData(student);
    setIsEditing(false);
  }, []);

  const handleNew = () => {
    setSelectedStudent(null);
    const nextReg = generateNextRegistrationNumber(students);
    setFormData({
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
      const savedId = await saveData('students', selectedStudent?.id, formData);
      
      setNotification({ type: 'success', message: 'Ficha do aluno salva com sucesso!' });
      setIsEditing(false);
      setUploadingPhoto(false); // Reset upload state on save success
      fetchStudents();
      
      // Update selected student with fresh data including the ID if it was new
      if (!selectedStudent?.id && savedId) {
        handleSelectStudent({ ...formData, id: savedId } as Student);
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
      setFormData({});
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

  const generateStudentPDF = async (student: Student) => {
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.width;
      const margin = 20;
      
      // Fetch institution for logo/name
      const instRef = collection(db, 'institution_settings');
      const instSnap = await getDocs(query(instRef, limit(1)));
      const inst = instSnap.empty ? null : instSnap.docs[0].data();

      // Header
      if (inst?.logo_url) {
        try {
          doc.addImage(inst.logo_url, 'PNG', margin, 15, 25, 25);
        } catch (e) {
          console.error('Error adding logo to PDF', e);
        }
      }
      
      doc.setFontSize(22);
      doc.setTextColor(0, 23, 75);
      doc.setFont('helvetica', 'bold');
      doc.text('FICHA INDIVIDUAL DO ALUNO', 50, 25);
      
      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.setFont('helvetica', 'normal');
      doc.text(inst?.name || 'ESCMIN - Gestão Escolar', 50, 32);
      doc.text(`Matrícula: ${student.registration_number}`, 50, 37);

      // Student Photo Placeholder or Image
      doc.setDrawColor(200);
      doc.rect(pageWidth - margin - 35, 15, 35, 45);
      if (student.photo_url) {
        try {
          doc.addImage(student.photo_url, 'JPEG', pageWidth - margin - 35, 15, 35, 45);
        } catch (e) {
          doc.setFontSize(8);
          doc.text('Foto não disponível', pageWidth - margin - 32, 40);
        }
      } else {
        doc.setFontSize(8);
        doc.text('SEM FOTO', pageWidth - margin - 25, 40);
      }

      // Personal Data Section
      doc.setFontSize(14);
      doc.setTextColor(0, 23, 75);
      doc.text('DADOS PESSOAIS', margin, 75);
      doc.setDrawColor(0, 23, 75);
      doc.line(margin, 77, pageWidth - margin, 77);

      doc.setFontSize(10);
      doc.setTextColor(0);
      const personalData = [
        ['Nome:', student.name],
        ['CPF:', student.cpf || '---'],
        ['RG:', student.rg || '---'],
        ['Nascimento:', student.birth_date ? new Date(student.birth_date).toLocaleDateString('pt-BR') : '---'],
        ['Curso:', student.course || '---'],
        ['Situação:', student.status]
      ];

      autoTable(doc, {
        startY: 80,
        body: personalData,
        theme: 'plain',
        styles: { cellPadding: 2, fontSize: 10 },
        columnStyles: { 0: { fontStyle: 'bold', cellWidth: 30 } }
      });

      // Contact Section
      const nextY = (doc as any).lastAutoTable.finalY + 10;
      doc.setFontSize(14);
      doc.setTextColor(0, 23, 75);
      doc.text('CONTATO E ENDEREÇO', margin, nextY);
      doc.line(margin, nextY + 2, pageWidth - margin, nextY + 2);

      const contactData = [
        ['Endereço:', student.address_street || '---'],
        ['Cidade/UF:', `${student.address_city || '---'} / ${student.address_state || '---'}`],
        ['CEP:', student.address_zip || '---'],
        ['E-mail:', student.email || '---'],
        ['Celular:', student.phone_mobile || '---']
      ];

      autoTable(doc, {
        startY: nextY + 5,
        body: contactData,
        theme: 'plain',
        styles: { cellPadding: 2, fontSize: 10 },
        columnStyles: { 0: { fontStyle: 'bold', cellWidth: 30 } }
      });

      // Pastoral Section
      const pastoralY = (doc as any).lastAutoTable.finalY + 10;
      doc.setFontSize(14);
      doc.setTextColor(0, 23, 75);
      doc.text('INFORMAÇÕES PASTORAIS', margin, pastoralY);
      doc.line(margin, pastoralY + 2, pageWidth - margin, pastoralY + 2);

      const pastoralData = [
        ['Paróquia:', student.parish || '---'],
        ['Pastoral:', student.pastoral_participates || '---']
      ];

      autoTable(doc, {
        startY: pastoralY + 5,
        body: pastoralData,
        theme: 'plain',
        styles: { cellPadding: 2, fontSize: 10 },
        columnStyles: { 0: { fontStyle: 'bold', cellWidth: 30 } }
      });

      // Footer
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text(`Documento gerado em ${new Date().toLocaleString('pt-BR')}`, margin, doc.internal.pageSize.height - 10);

      doc.save(`Ficha_${student.name.replace(/\s+/g, '_')}.pdf`);
    } catch (error) {
      console.error('Error generating student PDF:', error);
      alert('Erro ao gerar PDF do aluno');
    }
  };

  const filteredStudents = React.useMemo(() => {
    return students.filter(s => {
      const matchesSearch = 
        s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.registration_number?.includes(searchTerm) ||
        s.cpf?.includes(searchTerm);
      
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
                    onClick={() => generateStudentPDF(selectedStudent)}
                    className="px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl text-sm font-bold hover:bg-slate-50 transition-all flex items-center gap-2"
                  >
                    <FileText size={16} />
                    Gerar PDF
                  </button>
                )}
                {!isEditing && selectedStudent && (
                  <button 
                    onClick={() => navigate('/contributions', { state: { studentId: selectedStudent.id } })}
                    className="px-4 py-2 bg-blue-50 border border-blue-100 text-blue-600 rounded-xl text-sm font-bold hover:bg-blue-100 transition-all flex items-center gap-2"
                  >
                    <CreditCard size={16} />
                    Financeiro
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
                    className="p-3 text-red-500 hover:bg-red-50 rounded-xl transition-all cursor-pointer flex items-center justify-center group bg-white border border-slate-100"
                    title="Excluir Aluno"
                  >
                    <Trash2 size={20} className="group-hover:scale-110 transition-transform" />
                  </button>
                )}
                {isEditing ? (
                  <>
                    <button 
                      onClick={() => {
                        setIsEditing(false);
                        setUploadingPhoto(false);
                      }}
                      className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl text-sm font-bold transition-all"
                      tabIndex={100}
                    >
                      Cancelar
                    </button>
                    <button 
                      onClick={handleSave}
                      disabled={loading || uploadingPhoto}
                      className="px-6 py-2 bg-[#00174b] text-white rounded-xl text-sm font-bold hover:scale-[1.02] active:scale-95 transition-all shadow-lg disabled:opacity-50 disabled:grayscale"
                      tabIndex={101}
                    >
                      {loading ? (
                        <div className="flex items-center gap-2">
                          <Loader2 size={16} className="animate-spin" />
                          Salvando...
                        </div>
                      ) : uploadingPhoto ? (
                        <div className="flex items-center gap-2">
                          <Loader2 size={16} className="animate-spin" />
                          Subindo Foto...
                        </div>
                      ) : 'Salvar Aluno'}
                    </button>
                  </>
                ) : (
                  <button 
                    onClick={() => setIsEditing(true)}
                    className="px-6 py-2 bg-white border border-slate-200 text-[#131b2e] rounded-xl text-sm font-bold hover:bg-slate-50 transition-all flex items-center gap-2"
                  >
                    <Edit2 size={16} />
                    Editar Ficha
                  </button>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-8">
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
                      {formData.created_at && (
                        <div className="col-span-4 space-y-1">
                          <label className="text-xs font-bold text-slate-700">Data da Inscrição</label>
                          <div className="w-full px-4 py-2 bg-slate-100/50 text-slate-500 rounded-xl text-sm border-none italic">
                            {formatDateForDisplay(formData.created_at)}
                          </div>
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
                        <label className="text-xs font-bold text-slate-700">Logradouro</label>
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
                      <div className="col-span-5 space-y-1">
                        <label className="text-xs font-bold text-slate-700">Cidade</label>
                        <input 
                          type="text"
                          disabled={!isEditing}
                          value={formData.address_city || ''}
                          onChange={(e) => setFormData({...formData, address_city: e.target.value})}
                          onKeyDown={handleKeyDown}
                          className="w-full px-4 py-2 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60"
                          tabIndex={10}
                        />
                      </div>
                      <div className="col-span-2 space-y-1">
                        <label className="text-xs font-bold text-slate-700">UF</label>
                        <input 
                          type="text"
                          disabled={!isEditing}
                          value={formData.address_state || ''}
                          onChange={(e) => setFormData({...formData, address_state: e.target.value})}
                          onKeyDown={handleKeyDown}
                          className="w-full px-4 py-2 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60"
                          tabIndex={11}
                        />
                      </div>
                      <div className="col-span-5 space-y-1">
                        <label className="text-xs font-bold text-slate-700">CEP</label>
                        <input 
                          type="text"
                          disabled={!isEditing}
                          value={formData.address_zip || ''}
                          onChange={(e) => setFormData({...formData, address_zip: maskCEP(e.target.value)})}
                          onKeyDown={handleKeyDown}
                          className="w-full px-4 py-2 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60"
                          placeholder="00000-000"
                          tabIndex={12}
                        />
                      </div>
                      <div className="col-span-6 space-y-1">
                        <label className="text-xs font-bold text-slate-700">E-mail</label>
                        <input 
                          type="email"
                          disabled={!isEditing}
                          value={formData.email || ''}
                          onChange={(e) => setFormData({...formData, email: e.target.value})}
                          onKeyDown={handleKeyDown}
                          className="w-full px-4 py-2 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60"
                          tabIndex={13}
                        />
                      </div>
                      <div className="col-span-6 space-y-1">
                        <label className="text-xs font-bold text-slate-700">Celular</label>
                        <input 
                          type="text"
                          disabled={!isEditing}
                          value={formData.phone_mobile || ''}
                          onChange={(e) => setFormData({...formData, phone_mobile: maskPhone(e.target.value)})}
                          onKeyDown={handleKeyDown}
                          className="w-full px-4 py-2 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60"
                          placeholder="(00) 00000-0000"
                          tabIndex={14}
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
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-700">Paróquia Origem</label>
                        <input 
                          type="text"
                          disabled={!isEditing}
                          value={formData.parish || ''}
                          onChange={(e) => setFormData({...formData, parish: e.target.value})}
                          onKeyDown={handleKeyDown}
                          className="w-full px-4 py-2 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60"
                          tabIndex={15}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-700">Pastoral que participa</label>
                        <input 
                          type="text"
                          disabled={!isEditing}
                          value={formData.pastoral_participates || ''}
                          onChange={(e) => setFormData({...formData, pastoral_participates: e.target.value})}
                          onKeyDown={handleKeyDown}
                          className="w-full px-4 py-2 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60"
                          tabIndex={16}
                        />
                      </div>
                    </div>
                  </section>
                </div>
              )}
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
