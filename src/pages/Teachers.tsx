import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
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
  BookOpen,
  Printer,
  Camera,
  Upload,
  CheckCircle2,
  AlertCircle,
  ArrowLeft
} from 'lucide-react';
import Webcam from 'react-webcam';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatCurrency, cn, detectSubjectSemester, formatSubjectDisplayName } from '../lib/utils';
import { fetchAll, saveData, deleteData, uploadImage } from '../lib/database';
import { drawStandardReportHeader, drawStandardReportFooter } from '../lib/pdfReportHelper';
import { RotateCcw, FileText as FileIcon, Building2, UserX } from 'lucide-react';
import { useUnits } from '../contexts/UnitContext';
import { useAuth } from '../contexts/AuthContext';
import { isItemInUnit, getItemUnitId } from '../lib/unitService';
import { UnitConflictBanner } from '../components/UnitConflictBanner';
import { maskRG, calculateRGValidation, RG_MAX_FORMATTED_LENGTH } from '../lib/rgUtils';
import { fetchAddressByCEP } from '../lib/cepUtils';
import { DEFAULT_LOGO } from '../lib/default-logo';

interface Teacher {
  id: string;
  code: string;
  name: string;
  address_street?: string;
  address_number?: string;
  address_complement?: string;
  address_neighborhood?: string;
  address_city?: string;
  address_state?: string;
  address_zip?: string;
  phone?: string;
  phone_mobile?: string;
  phone_mobile_is_whatsapp?: boolean;
  birth_date?: string;
  email?: string;
  cpf?: string;
  rg?: string;
  status: 'Ativo' | 'Inativo';
  observations?: string;
  subject_ids?: string[];
  unit_id?: string;
  created_at: string;
  user_id: string;
  photo_url?: string;
}

interface Subject {
  id: string;
  code: string;
  name: string;
  status: 'Ativo' | 'Inativo';
  year?: string;
  semester?: string;
  program_content?: string;
}

const groupSubjectsBySemester = (subList: Subject[]) => {
  const sem1: Subject[] = [];
  const sem2: Subject[] = [];
  const others: Subject[] = [];

  subList.forEach(s => {
    const sem = detectSubjectSemester(s);
    if (sem.includes('1')) {
      sem1.push(s);
    } else if (sem.includes('2')) {
      sem2.push(s);
    } else {
      others.push(s);
    }
  });

  return { sem1, sem2, others };
};

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

const maskPhone = (value: string) => {
  return value
    .replace(/\D/g, '')
    .replace(/(\d{2})(\d)/, '($1) $2')
    .replace(/(\d{5})(\d)/, '$1-$2')
    .replace(/(-\d{4})\d+?$/, '$1');
};

// Memoized List Item to prevent lag
const TeacherItem = React.memo(({ 
  teacher, 
  isSelected, 
  onSelect, 
  unitName,
  className 
}: { 
  teacher: Teacher, 
  isSelected: boolean, 
  onSelect: (t: Teacher) => void,
  unitName?: string,
  className?: string
}) => {
  return (
    <button
      onClick={() => onSelect(teacher)}
      className={cn(
        "w-full flex items-center gap-3 p-3 rounded-lg transition-all text-left",
        isSelected 
          ? "bg-slate-50 border-slate-200" 
          : "hover:bg-slate-50 border-transparent",
        className
      )}
    >
      <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500 font-bold text-[10px] overflow-hidden border border-slate-200 relative">
        {teacher.photo_url ? (
          <img src={teacher.photo_url} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
        ) : (
          teacher.code || '---'
        )}
        <div className={cn(
          "absolute -top-1 -right-1 w-3 h-3 rounded-lg border-2 border-white",
          teacher.status === 'Inativo' ? "bg-slate-300" : "bg-emerald-500"
        )} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-bold text-[#131b2e] truncate">{teacher.name}</p>
          <span className={cn(
            "px-1.5 py-0.5 text-[8px] font-bold rounded uppercase",
            teacher.status === 'Inativo' ? "bg-slate-100 text-slate-500" : "bg-green-100 text-green-700"
          )}>
            {teacher.status || 'Ativo'}
          </span>
          {unitName && (
            <span className="px-1.5 py-0.5 text-[8px] font-bold rounded uppercase bg-blue-50 text-blue-700 border border-blue-200">
              {unitName}
            </span>
          )}
        </div>
        <p className="text-xs text-slate-500 truncate">{teacher.email || 'Sem e-mail'}</p>
      </div>
    </button>
  );
});

export function Teachers() {
  const location = useLocation();
  const navigate = useNavigate();
  const { activeUnits, hasMultipleUnits, selectedUnitId: globalUnitId, getUnitName } = useUnits();
  const { canDelete } = useAuth();
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [inst, setInst] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'Ativo' | 'Inativo' | 'Todos'>('Ativo');
  const [subjectFilter, setSubjectFilter] = useState<string>('all');
  const [semesterFilter, setSemesterFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'name' | 'code' | 'subject'>('name');
  const [selectedTeacher, setSelectedTeacher] = useState<Teacher | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [showWebcam, setShowWebcam] = useState(false);
  const webcamRef = useRef<Webcam>(null);
  const [hoverShowList, setHoverShowList] = useState(false);
  const [formData, setFormData] = useState<Partial<Teacher>>({});
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error', message: string } | null>(null);

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

  const fetchTeachers = React.useCallback(async () => {
    setLoading(true);
    try {
      const [teachersData, subjectsData, instData] = await Promise.all([
        fetchAll('teachers', '*', 'name', true),
        fetchAll('subjects', '*', 'name', true),
        fetchAll('institution_settings')
      ]);

      const normalizedSubjects = (subjectsData || []).map((s: Subject) => {
        let normalized = { ...s };
        if (!normalized.semester && normalized.program_content) {
          const match = normalized.program_content.match(/\[METADATA:(\{[\s\S]*?\})\]/);
          if (match && match[1]) {
            try {
              const meta = JSON.parse(match[1]);
              if (meta.semester) normalized.semester = meta.semester;
            } catch (e) {}
          }
        }
        return normalized;
      });

      const normalizedTeachers = (teachersData || []).map((t: Teacher) => {
        let normalized = { ...t };
        let sIds = normalized.subject_ids || [];
        
        if (typeof sIds === 'string' && (sIds as string).startsWith('{')) {
          sIds = (sIds as string).replace(/[{}]/g, '').split(',').filter(Boolean);
        }
        
        if ((!sIds || sIds.length === 0) && normalized.observations) {
          const match = normalized.observations.match(/\[SUBJECTS:(\[[\s\S]*?\])\]/);
          if (match && match[1]) {
            try { sIds = JSON.parse(match[1]); } catch (e) {}
          }
        }
        normalized.subject_ids = Array.isArray(sIds) ? sIds : [];

        // FALLBACK: Extract photo_url if stored in observations metadata
        if (!normalized.photo_url && normalized.observations) {
          const match = normalized.observations.match(/\[PHOTO_URL:([\s\S]*?)\]/);
          if (match && match[1]) {
            normalized.photo_url = match[1].trim();
          }
        }

        // FALLBACK: Extract unit_id if stored in observations metadata
        if (normalized.observations) {
          const match = normalized.observations.match(/\[UNIT_ID:([\s\S]*?)\]/);
          if (match && match[1]) {
            const parsed = match[1].trim();
            if (parsed && (!normalized.unit_id || normalized.unit_id === 'matriz' || parsed !== 'matriz')) {
              normalized.unit_id = parsed;
            }
          }
        }
        if (!normalized.unit_id) {
          normalized.unit_id = 'matriz';
        }

        return normalized;
      });

      // Deduplica professores e disciplinas por ID
      const seenTeachIds = new Set<string>();
      const uniqueTeachers: Teacher[] = [];
      for (const t of normalizedTeachers) {
        const idStr = String(t.id || '');
        if (idStr && !seenTeachIds.has(idStr)) {
          seenTeachIds.add(idStr);
          uniqueTeachers.push(t);
        } else if (!idStr) {
          uniqueTeachers.push(t);
        }
      }

      const seenSubIds = new Set<string>();
      const uniqueSubjects: Subject[] = [];
      for (const s of normalizedSubjects) {
        const idStr = String(s.id || s.code || '');
        if (idStr && !seenSubIds.has(idStr)) {
          seenSubIds.add(idStr);
          uniqueSubjects.push(s);
        } else if (!idStr) {
          uniqueSubjects.push(s);
        }
      }

      setTeachers(uniqueTeachers);
      setSubjects(uniqueSubjects);
      if (instData && instData.length > 0) setInst(instData[0]);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  }, []); // Remove selectedTeacher dependency

  useEffect(() => {
    fetchTeachers();
  }, [fetchTeachers]);

  const handleSelectTeacher = React.useCallback((teacher: Teacher) => {
    let subjectIds = teacher.subject_ids || [];
    
    // Handle potential Postgres array string format "{id1,id2}"
    if (typeof subjectIds === 'string' && (subjectIds as string).startsWith('{')) {
      subjectIds = (subjectIds as string).replace(/[{}]/g, '').split(',').filter(Boolean);
    }
    
    // FALLBACK: If subject_ids is empty, check if it's stored in observations as metadata
    if ((!subjectIds || subjectIds.length === 0) && teacher.observations) {
      const match = teacher.observations.match(/\[SUBJECTS:(\[[\s\S]*?\])\]/);
      if (match && match[1]) {
        try {
          subjectIds = JSON.parse(match[1]);
        } catch (e) {
          console.warn('Failed to parse subject_ids from observations');
        }
      }
    }

    // FALLBACK: Extract photo_url if stored in observations metadata
    let photoUrl = teacher.photo_url;
    if (!photoUrl && teacher.observations) {
      const match = teacher.observations.match(/\[PHOTO_URL:([\s\S]*?)\]/);
      if (match && match[1]) {
        photoUrl = match[1].trim();
      }
    }
    
    const normalizedTeacher = {
      ...teacher,
      subject_ids: Array.isArray(subjectIds) ? subjectIds : [],
      photo_url: photoUrl
    };
    setSelectedTeacher(normalizedTeacher);
    setFormData(normalizedTeacher);
    setIsEditing(false);
    setHoverShowList(false);
  }, []);

  // Handle auto-selection from Global Quick Search or deep links
  useEffect(() => {
    const teacherId = (location.state as any)?.teacherId;
    if (teacherId && teachers.length > 0) {
      const targetTeacher = teachers.find(t => t.id === teacherId);
      if (targetTeacher) {
        if (targetTeacher.status === 'Inativo') {
          setStatusFilter('Todos');
        }
        handleSelectTeacher(targetTeacher);
        window.history.replaceState({}, document.title);
      }
    }
  }, [teachers, location.state, handleSelectTeacher]);

  const generateTeacherListPDF = async () => {
    try {
      const doc = new jsPDF();
      const margin = 15;

      const filterLabels: string[] = [`STATUS: ${statusFilter.toUpperCase()}`];
      if (semesterFilter !== 'all') {
        filterLabels.push(`SEMESTRE: ${semesterFilter.toUpperCase()}`);
      } else {
        filterLabels.push('SEMESTRE: TODOS');
      }
      if (subjectFilter !== 'all') {
        const subName = subjects.find(s => s.id === subjectFilter)?.name;
        if (subName) filterLabels.push(`DISCIPLINA: ${subName.toUpperCase()}`);
      }
      const filterSummary = filterLabels.join('  •  ');

      const startY = drawStandardReportHeader(
        doc,
        inst,
        'RELAÇÃO DE CORPO DOCENTE',
        filterSummary,
        margin
      );

      const tableData = filteredTeachers.map(t => {
        const tSubList = subjects.filter(s => t.subject_ids?.includes(s.id));
        const { sem1, sem2, others } = groupSubjectsBySemester(tSubList);

        const parts: string[] = [];
        if (semesterFilter === '1º Semestre') {
          if (sem1.length > 0) parts.push(`1º SEM: ${sem1.map(s => s.name).join(', ')}`);
        } else if (semesterFilter === '2º Semestre') {
          if (sem2.length > 0) parts.push(`2º SEM: ${sem2.map(s => s.name).join(', ')}`);
        } else {
          if (sem1.length > 0) parts.push(`1º SEM: ${sem1.map(s => s.name).join(', ')}`);
          if (sem2.length > 0) parts.push(`2º SEM: ${sem2.map(s => s.name).join(', ')}`);
          if (others.length > 0) parts.push(`OUTRAS: ${others.map(s => s.name).join(', ')}`);
        }
          
        return [
          t.code,
          t.name.toUpperCase(),
          t.email || '---',
          parts.join('\n') || '---',
          t.status || 'Ativo'
        ];
      });

      autoTable(doc, {
        startY,
        head: [['CÓD.', 'NOME DO PROFESSOR', 'E-MAIL', 'DISCIPLINAS', 'STATUS']],
        body: tableData,
        headStyles: { fillColor: [15, 23, 42], textColor: 255, fontSize: 8, fontStyle: 'bold' },
        styles: { fontSize: 7, cellPadding: 2.5, font: 'helvetica' },
        columnStyles: {
          0: { cellWidth: 12 },
          1: { cellWidth: 55 },
          2: { cellWidth: 40 },
          3: { cellWidth: 55 },
          4: { cellWidth: 18 }
        },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        margin: { left: margin, right: margin, bottom: 25 }
      });

      drawStandardReportFooter(doc, inst, margin);

      doc.autoPrint();
      const blob = doc.output('blob');
      const url = URL.createObjectURL(blob);
      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      iframe.src = url;
      document.body.appendChild(iframe);
      iframe.onload = () => {
        setTimeout(() => {
          try {
            if (!iframe.contentWindow) {
              throw new Error("No contentWindow available");
            }

            const cleanup = () => {
              try {
                if (document.body.contains(iframe)) {
                  document.body.removeChild(iframe);
                }
              } catch (e) {}
              URL.revokeObjectURL(url);
            };

            try {
              iframe.contentWindow.addEventListener('afterprint', cleanup);
            } catch (e) {
              console.warn("Could not add afterprint listener on Teachers iframe:", e);
              setTimeout(cleanup, 15000);
            }
            try {
              iframe.contentWindow.print();
            } catch (e) {
              console.warn("Print call failed on Teachers iframe, triggering fallback:", e);
              throw e;
            }

            // Long fallback to clean up iframe in case afterprint doesn't trigger
            setTimeout(cleanup, 300000);
          } catch (err) {
            console.warn("Iframe printing blocked, downloading PDF instead:", err);
            doc.save(`Lista_Professores_${new Date().getFullYear()}.pdf`);
            setNotification({
              type: 'success',
              message: 'A impressão direta em iframe foi bloqueada pelo navegador. O arquivo PDF foi baixado para você imprimir manualmente.'
            });
            setTimeout(() => setNotification(null), 5000);
            try {
              if (document.body.contains(iframe)) {
                document.body.removeChild(iframe);
              }
            } catch (e) {}
            URL.revokeObjectURL(url);
          }
        }, 300);
      };
    } catch (error) {
      console.error('Error generating teacher list PDF:', error);
      alert('Erro ao gerar relatório de professores');
    }
  };

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

        const url = await uploadImage(file, 'students', 'teachers');
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
      const url = await uploadImage(file, 'students', 'teachers');
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

  const handleNew = () => {
    setSelectedTeacher(null);
    
    // Suggest next numeric code
    const maxCode = teachers.reduce((max, t) => {
      const num = parseInt(t.code, 10);
      return !isNaN(num) ? Math.max(max, num) : max;
    }, 0);
    const nextCode = String(maxCode + 1).padStart(3, '0');

    setFormData({
      name: '',
      code: nextCode,
      status: 'Ativo',
      subject_ids: [],
      unit_id: globalUnitId !== 'all' ? globalUnitId : (activeUnits[0]?.id || 'matriz')
    });
    setIsEditing(true);
    setHoverShowList(false);
  };

  const handleSave = async () => {
    try {
      setLoading(true);
      
      const syncData = { 
        ...formData,
        subject_ids: formData.subject_ids || [],
        unit_id: formData.unit_id || 'matriz'
      };

      // PROACTIVE METADATA SYNC:
      // Always sync subject_ids, photo_url and unit_id into observations metadata before saving.
      // This ensures data persistence even if the Supabase column is missing.
      let baseObs = (syncData.observations || '')
        .replace(/\[SUBJECTS:(\[[\s\S]*?\])\]/g, '')
        .replace(/\[SUBJECTS:\[[\s\S]*?\]\]/g, '')
        .replace(/\[PHOTO_URL:[\s\S]*?\]/g, '')
        .replace(/\[UNIT_ID:[\s\S]*?\]/g, '')
        .replace(/\]\]$/g, '')
        .trim();

      let metadataParts: string[] = [];
      if (syncData.subject_ids && syncData.subject_ids.length > 0) {
        metadataParts.push(`[SUBJECTS:${JSON.stringify(syncData.subject_ids)}]`);
      }
      if (syncData.photo_url) {
        metadataParts.push(`[PHOTO_URL:${syncData.photo_url}]`);
      }
      if (syncData.unit_id) {
        metadataParts.push(`[UNIT_ID:${syncData.unit_id}]`);
      }

      if (metadataParts.length > 0) {
        syncData.observations = (baseObs + (baseObs ? '\n' : '') + metadataParts.join('\n')).trim();
      } else {
        syncData.observations = baseObs;
      }

      console.log('[Teachers] Saving data:', syncData);
      
      let savedId;
      try {
        savedId = await saveData('teachers', selectedTeacher?.id, syncData);
      } catch (saveErr: any) {
        if (saveErr.message?.includes('unit_id')) {
          console.warn('[Teachers] Coluna unit_id ausente no banco, persistido via observações metadata');
          const fallbackData = { ...syncData };
          delete fallbackData.unit_id;
          savedId = await saveData('teachers', selectedTeacher?.id, fallbackData);
        } else {
          throw saveErr;
        }
      }
      
      setNotification({ type: 'success', message: 'Ficha do professor salva com sucesso!' });
      setIsEditing(false);
      
      // Update local state first to be responsive
      const updatedTeacher = { ...syncData, id: savedId || selectedTeacher?.id } as Teacher;
      setSelectedTeacher(updatedTeacher);
      setTeachers(prev => prev.map(t => t.id === updatedTeacher.id ? updatedTeacher : t));
      
      fetchTeachers();
    } catch (error: any) {
      console.error('Error saving teacher:', error);
      setNotification({ type: 'error', message: 'Erro ao salvar professor: ' + (error.message || 'Verifique o console') });
    } finally {
      setLoading(false);
      setTimeout(() => setNotification(null), 3000);
    }
  };

  const handleToggleTeacherStatus = React.useCallback(async () => {
    if (!selectedTeacher?.id) return;
    const isCurrentlyInactive = formData.status === 'Inativo';
    const newStatus = isCurrentlyInactive ? 'Ativo' : 'Inativo';
    const confirmMsg = isCurrentlyInactive
      ? `Deseja reativar o professor "${selectedTeacher.name}"?`
      : `Deseja inativar o professor "${selectedTeacher.name}"? (O perfil de Assistente pode inativar ou desabilitar registros).`;

    if (!window.confirm(confirmMsg)) return;

    try {
      setLoading(true);
      await saveData('teachers', selectedTeacher.id, {
        status: newStatus
      });
      setFormData(prev => ({ ...prev, status: newStatus }));
      setSelectedTeacher(prev => prev ? { ...prev, status: newStatus } : null);
      setNotification({
        type: 'success',
        message: isCurrentlyInactive ? 'Professor reativado com sucesso!' : 'Professor inativado com sucesso!'
      });
      fetchTeachers();
    } catch (error: any) {
      console.error('Erro ao alterar status:', error);
      alert('Erro ao alterar status do professor: ' + error.message);
    } finally {
      setLoading(false);
      setTimeout(() => setNotification(null), 3000);
    }
  }, [selectedTeacher, formData.status, fetchTeachers]);

  const handleDelete = React.useCallback(async () => {
    if (!selectedTeacher?.id) return;
    if (!canDelete) {
      alert('Ação não permitida: O perfil de Assistente é vedado de excluir registros definitivamente. Utilize a opção de Inativar Professor.');
      setShowDeleteConfirm(false);
      return;
    }

    try {
      setLoading(true);
      await deleteData('teachers', selectedTeacher.id);
      
      setSelectedTeacher(null);
      setFormData({});
      setIsEditing(false);
      setShowDeleteConfirm(false);
      fetchTeachers();
    } catch (error: any) {
      console.error('Error deleting teacher:', error);
      alert('Erro ao excluir professor: ' + error.message);
      setShowDeleteConfirm(false);
    } finally {
      setLoading(false);
    }
  }, [selectedTeacher, fetchTeachers]);

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

  const generateTeacherPDF = async (teacher: Teacher) => {
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.width;
      const pageHeight = doc.internal.pageSize.height;
      const margin = 15;
      
      const institutions = await fetchAll('institution_settings');
      const instData = institutions && institutions.length > 0 ? institutions[0] : inst;

      const logoToUse = instData?.logo_url || DEFAULT_LOGO;
      let textStartX = margin;
      if (logoToUse) {
        try {
          doc.addImage(logoToUse, 'auto', margin, 12, 20, 20);
          textStartX = margin + 24;
        } catch (e) {
          try {
            doc.addImage(logoToUse, 'PNG', margin, 12, 20, 20);
            textStartX = margin + 24;
          } catch (err2) {
            console.error('Error adding logo to PDF', err2);
          }
        }
      }
      
      // Institutional texts (3 lines)
      doc.setFontSize(8.5);
      doc.setTextColor(71, 85, 105);
      doc.setFont('helvetica', 'bold');
      doc.text((instData?.city_uf ? `DIOCESE DE ${instData.city_uf.split('/')[0].toUpperCase()}` : (instData?.diocese_name || 'DIOCESE DE GUARULHOS')).toUpperCase(), textStartX, 17);

      doc.setFontSize(14.5);
      doc.setTextColor(15, 23, 42);
      doc.setFont('helvetica', 'bold');
      doc.text((instData?.name || 'ESCOLA DIOCESANA DE MINISTÉRIO').toUpperCase(), textStartX, 23.5);

      doc.setFontSize(9);
      doc.setTextColor(71, 85, 105);
      doc.setFont('helvetica', 'bold');
      doc.text((instData?.subtitle || 'PE. JOSÉ FERNANDO DE BRITO').toUpperCase(), textStartX, 29.5);

      // Header divider line
      doc.setDrawColor(15, 23, 42);
      doc.setLineWidth(0.8);
      doc.line(margin, 34.5, pageWidth - margin, 34.5);

      // Title with underline banner
      doc.setFontSize(12);
      doc.setTextColor(15, 23, 42);
      doc.setFont('helvetica', 'bold');
      const docTitle = 'FICHA DO PROFESSOR';
      doc.text(docTitle, pageWidth / 2, 44, { align: 'center', charSpace: 1.0 });

      const titleWidth = doc.getTextWidth(docTitle);
      doc.setDrawColor(15, 23, 42);
      doc.setLineWidth(0.8);
      doc.line(pageWidth / 2 - (titleWidth / 2) - 10, 46.5, pageWidth / 2 + (titleWidth / 2) + 10, 46.5);

      // Subtitle
      doc.setFontSize(8);
      doc.setTextColor(71, 85, 105);
      doc.setFont('helvetica', 'bold');
      doc.text(`CÓDIGO DE REGISTRO: ${teacher.code}  •  SITUAÇÃO: ${(teacher.status || 'Ativo').toUpperCase()}`, margin, 52.5);
      doc.text(`EMISSÃO: ${new Date().toLocaleString('pt-BR')}`, pageWidth - margin, 52.5, { align: 'right' });
      
      // Get subjects grouped by semester
      const tSubList = subjects.filter(s => teacher.subject_ids?.includes(s.id));
      const { sem1, sem2, others } = groupSubjectsBySemester(tSubList);

      const parts: string[] = [];
      if (sem1.length > 0) parts.push(`1º SEM: ${sem1.map(s => s.name).join(', ')}`);
      if (sem2.length > 0) parts.push(`2º SEM: ${sem2.map(s => s.name).join(', ')}`);
      if (others.length > 0) parts.push(`OUTRAS: ${others.map(s => s.name).join(', ')}`);

      const personalData = [
        ['Nome do Professor:', teacher.name.toUpperCase()],
        ['Situação Cadastral:', teacher.status || 'Ativo'],
        ['CPF:', teacher.cpf || '---'],
        ['RG:', teacher.rg || '---'],
        ['E-mail:', teacher.email || '---'],
        ['Celular / WhatsApp:', teacher.phone_mobile || '---'],
        ['Disciplinas Vinculadas:', parts.join('\n') || 'Nenhuma selecionada']
      ];

      autoTable(doc, {
        startY: 56.5,
        head: [['DADOS DO PROFESSOR', 'INFORMAÇÕES']],
        body: personalData,
        headStyles: { fillColor: [15, 23, 42], textColor: 255, fontSize: 8, fontStyle: 'bold' },
        styles: { fontSize: 7.5, cellPadding: 2.5, font: 'helvetica' },
        columnStyles: { 0: { fontStyle: 'bold', cellWidth: 45 } },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        margin: { left: margin, right: margin }
      });

      const nextY = (doc as any).lastAutoTable.finalY + 6;

      const formattedAddress = [
        teacher.address_street,
        teacher.address_number ? `nº ${teacher.address_number}` : null,
        teacher.address_complement,
        teacher.address_neighborhood
      ].filter(Boolean).join(', ') || '---';

      const contactData = [
        ['Endereço Residencial:', formattedAddress],
        ['Cidade / UF:', `${teacher.address_city || '---'} / ${teacher.address_state || '---'}`],
        ['CEP:', teacher.address_zip || '---']
      ];

      autoTable(doc, {
        startY: nextY,
        head: [['ENDEREÇO E LOCALIZAÇÃO', 'DETALHES']],
        body: contactData,
        headStyles: { fillColor: [15, 23, 42], textColor: 255, fontSize: 8, fontStyle: 'bold' },
        styles: { fontSize: 7.5, cellPadding: 2.5, font: 'helvetica' },
        columnStyles: { 0: { fontStyle: 'bold', cellWidth: 45 } },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        margin: { left: margin, right: margin }
      });

      if (teacher.observations) {
        const obsY = (doc as any).lastAutoTable.finalY + 6;
        const cleanedObs = (teacher.observations || '')
          .replace(/\[SUBJECTS:(\[[\s\S]*?\])\]/g, '')
          .replace(/\[SUBJECTS:\[[\s\S]*?\]\]/g, '')
          .replace(/\[PHOTO_URL:[\s\S]*?\]/g, '')
          .replace(/\]\]$/g, '')
          .trim();
          
        if (cleanedObs) {
          autoTable(doc, {
            startY: obsY,
            head: [['OBSERVAÇÕES GERAIS']],
            body: [[cleanedObs]],
            headStyles: { fillColor: [15, 23, 42], textColor: 255, fontSize: 8, fontStyle: 'bold' },
            styles: { fontSize: 7.5, cellPadding: 2.5, font: 'helvetica' },
            margin: { left: margin, right: margin }
          });
        }
      }

      // Standard Institutional Footer
      const pages = (doc as any).internal.getNumberOfPages();
      for (let i = 1; i <= pages; i++) {
        doc.setPage(i);
        
        doc.setDrawColor(15, 23, 42);
        doc.setLineWidth(0.8);
        doc.line(margin, pageHeight - 19, pageWidth - margin, pageHeight - 19);

        // Coluna da Esquerda (Dados Institucionais / Endereço)
        doc.setFontSize(7);
        doc.setTextColor(15, 23, 42);
        doc.setFont('helvetica', 'bold');
        
        const addrLine1 = (instData?.address || 'AV. VENUS, 195 - ITAPEGICA - GUARULHOS/SP').toUpperCase();
        const addrLine2 = [
          instData?.cep ? `CEP: ${instData.cep}` : 'CEP: 07044-170',
          instData?.city_uf ? `- ${instData.city_uf}` : '- GUARULHOS/SP'
        ].filter(Boolean).join(' ').toUpperCase();
        const addrLine3 = `Telefone: ${instData?.phone || '(11) 2421-2935'}`;
        
        doc.text(addrLine1, margin, pageHeight - 14.5);
        doc.text(addrLine2, margin, pageHeight - 11);
        doc.text(addrLine3, margin, pageHeight - 7.5);

        // Coluna da Direita (Atendimento Secretaria & Paginação)
        doc.setFontSize(7);
        doc.setTextColor(15, 23, 42);
        doc.setFont('helvetica', 'bold');
        
        doc.text('ATENDIMENTO SECRETARIA:', pageWidth - margin, pageHeight - 14.5, { align: 'right' });
        
        const secLine = instData?.secretary ? instData.secretary.replace(/\n/g, ' ') : 'quarta a sexta-feira das 14h as 18h';
        doc.text(secLine, pageWidth - margin, pageHeight - 11, { align: 'right' });
        
        const emailAndPage = [
          instData?.email ? `email: ${instData.email.toLowerCase()}` : 'email: email@email.com.br',
          `Página ${i} de ${pages}`
        ].join('  •  ');
        doc.text(emailAndPage, pageWidth - margin, pageHeight - 7.5, { align: 'right' });
      }

      doc.save(`Ficha_Prof_${teacher.name.replace(/\s+/g, '_')}.pdf`);
    } catch (error) {
      console.error('Error generating teacher PDF:', error);
      alert('Erro ao gerar PDF do professor');
    }
  };

  const handlePrint = () => {
    try {
      window.print();
    } catch (err) {
      console.error("Print failed:", err);
      setNotification({
        type: 'error',
        message: 'A impressão direta é bloqueada pelo navegador dentro do painel de visualização. Por favor, abra o sistema em uma nova aba para imprimir.'
      });
      setTimeout(() => setNotification(null), 5000);
    }
  };

  const PrintableTeacher = () => {
    if (!selectedTeacher) return null;
    
    // Get subject names and objects
    const teacherSubjectList = subjects.filter(s => selectedTeacher.subject_ids?.includes(s.id));
    const { sem1, sem2, others } = groupSubjectsBySemester(teacherSubjectList);

    const summaryParts: string[] = [];
    if (sem1.length > 0) summaryParts.push(`1º SEM: ${sem1.map(s => s.name).join(', ')}`);
    if (sem2.length > 0) summaryParts.push(`2º SEM: ${sem2.map(s => s.name).join(', ')}`);
    if (others.length > 0) summaryParts.push(`OUTRAS: ${others.map(s => s.name).join(', ')}`);
    const teacherSubjectsSummary = summaryParts.join(' | ');

    return (
      <div id="printable-teacher-record" className="hidden print:flex flex-col justify-between text-slate-950 bg-white overflow-hidden font-sans leading-tight relative w-full h-[275mm] min-h-[275mm] max-h-[275mm] mx-auto p-0 box-border printable-single-page">
        {/* TOP SECTION: Header + Control Boxes + Teacher Data */}
        <div className="flex-1 flex flex-col justify-start pr-1">
          {/* Institutional Header with prominent logo */}
          <div>
            <div className="flex items-center gap-4 mb-2 pb-2 border-b-2 border-slate-900">
              <div className="flex-shrink-0 w-20 h-20 max-h-20 max-w-20 flex items-center justify-center">
                <img
                  src={inst?.logo_url || DEFAULT_LOGO}
                  className="w-full h-full object-contain max-h-20 max-w-20"
                  referrerPolicy="no-referrer"
                  alt="Logo da Instituição"
                />
              </div>
              <div className="flex-1 flex flex-col justify-center">
                <p className="text-[8.5pt] font-extrabold tracking-[0.2em] text-slate-600 uppercase leading-none mb-1">
                  {inst?.city_uf ? `DIOCESE DE ${inst.city_uf.split('/')[0].toUpperCase()}` : 'DIOCESE DE GUARULHOS'}
                </p>
                <h1 className="text-[14.5pt] font-black uppercase tracking-tight text-slate-950 leading-tight">
                  {inst?.name || 'ESCOLA DIOCESANA DE MINISTÉRIO'}
                </h1>
                <p className="text-[9pt] font-bold text-slate-600 tracking-wider uppercase mt-1">
                  {inst?.subtitle || 'PE. JOSÉ FERNANDO DE BRITO'}
                </p>
              </div>
            </div>

            <div className="text-center mt-5 mb-5">
              <h2 className="text-[12pt] font-black uppercase tracking-[0.28em] text-slate-900 border-b-2 border-slate-900 pb-1 px-10 inline-block">
                Ficha do Professor
              </h2>
            </div>
          </div>

          {/* TOP CONTROL BOXES */}
          <div className="grid grid-cols-12 gap-3.5 mt-2 mb-6">
            <div className="col-span-3 border border-slate-800 p-2 flex flex-col h-[3.2cm] justify-between bg-white">
              <p className="text-[8pt] font-black uppercase tracking-wider text-slate-800 border-b border-slate-200 pb-1">
                Controle
              </p>
              <div className="flex-1 flex flex-col justify-center items-center px-1">
                <p className="text-[7pt] font-extrabold uppercase tracking-widest text-slate-500 mb-1 text-center">
                  Código Registro
                </p>
                <p className="font-mono font-black text-[13.5pt] tracking-wider text-slate-950 text-center leading-none">
                  {selectedTeacher.code}
                </p>
              </div>
            </div>

            <div className="col-span-6 border border-slate-800 p-2 h-[3.2cm] flex flex-col justify-between bg-white">
              <p className="text-[8pt] font-black uppercase tracking-wider text-slate-800 border-b border-slate-200 pb-1">
                Disciplinas Vinculadas:
              </p>
              <div className="flex-1 overflow-hidden flex items-center py-1">
                <p className="text-[7.5pt] font-bold leading-snug uppercase text-slate-900 line-clamp-3">
                  {teacherSubjectsSummary || 'NENHUMA DISCIPLINA SELECIONADA'}
                </p>
              </div>
              <div className="text-[6.5pt] font-semibold text-slate-500 border-t border-slate-200 pt-0.5 flex justify-between">
                <span>Total de Matérias: <strong className="text-slate-900">{selectedTeacher.subject_ids?.length || 0}</strong></span>
                <span>Status: <strong className="text-slate-900">{selectedTeacher.status || 'Ativo'}</strong></span>
              </div>
            </div>

            <div className="col-span-3 flex justify-center">
              <div className="flex items-center justify-center relative w-[2.4cm] h-[3.2cm] overflow-hidden border border-slate-300">
                {formData.photo_url || selectedTeacher.photo_url ? (
                  <img
                    src={formData.photo_url || selectedTeacher.photo_url}
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                    alt="Foto do Professor"
                  />
                ) : (
                  <div className="w-full h-full border border-dashed border-slate-300 flex flex-col items-center justify-center text-center text-slate-300 uppercase">
                    <p className="text-[7pt] font-black tracking-widest">FOTO 3X4</p>
                    <span className={cn(
                      "inline-block mt-0.5 px-1 py-0.2 text-[5.5pt] font-black uppercase",
                      selectedTeacher.status === 'Ativo' ? "bg-emerald-100 text-emerald-900" : "bg-slate-200 text-slate-700"
                    )}>
                      {selectedTeacher.status}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* DADOS PESSOAIS */}
          <div className="space-y-3.5 mt-2 mb-6 text-[8.5pt]">
            <div className="flex items-baseline gap-2">
              <span className="font-bold uppercase w-[72px] shrink-0 text-[8pt] text-slate-800">Nome:</span>
              <span className="flex-1 border-b border-slate-700 font-bold uppercase text-[8.5pt] text-slate-950 pl-2.5 pb-0.5 text-left leading-normal min-h-[1.3em]">
                {selectedTeacher.name || '\u00A0'}
              </span>
            </div>

            <div className="flex gap-3 items-baseline">
              <div className="flex-[2] flex items-baseline gap-2">
                <span className="font-bold uppercase w-[72px] shrink-0 text-[8pt] text-slate-800">CPF:</span>
                <span className="flex-1 border-b border-slate-700 font-bold text-[8.5pt] text-slate-950 pl-2.5 pb-0.5 text-left leading-normal min-h-[1.3em]">
                  {selectedTeacher.cpf || '\u00A0'}
                </span>
              </div>
              <div className="flex-[2] flex items-baseline gap-2">
                <span className="font-bold uppercase shrink-0 text-[8pt] text-slate-800">RG:</span>
                <span className="flex-1 border-b border-slate-700 font-bold text-[8.5pt] text-slate-950 pl-2.5 pb-0.5 text-left leading-normal min-h-[1.3em]">
                  {selectedTeacher.rg || '\u00A0'}
                </span>
              </div>
              <div className="flex-[3] flex items-baseline gap-2">
                <span className="font-bold uppercase shrink-0 text-[8pt] text-slate-800">Celular:</span>
                <span className="flex-1 border-b border-slate-700 font-bold text-[8.5pt] text-slate-950 pl-2.5 pb-0.5 text-left leading-normal min-h-[1.3em]">
                  {selectedTeacher.phone_mobile || '\u00A0'}
                </span>
              </div>
            </div>

            <div className="flex items-baseline gap-2">
              <span className="font-bold uppercase w-[72px] shrink-0 text-[8pt] text-slate-800">E-mail:</span>
              <span className="flex-1 border-b border-slate-700 font-bold lowercase text-[8.5pt] text-slate-950 pl-2.5 pb-0.5 text-left leading-normal min-h-[1.3em]">
                {selectedTeacher.email || '\u00A0'}
              </span>
            </div>

            <div className="flex items-baseline gap-2">
              <span className="font-bold uppercase w-[72px] shrink-0 text-[8pt] text-slate-800">Endereço:</span>
              <span className="flex-1 border-b border-slate-700 font-bold uppercase text-[8.5pt] text-slate-950 pl-2.5 pb-0.5 text-left leading-normal min-h-[1.3em]">
                {[
                  selectedTeacher.address_street,
                  selectedTeacher.address_number ? `Nº ${selectedTeacher.address_number}` : null,
                  selectedTeacher.address_complement,
                  selectedTeacher.address_neighborhood
                ].filter(Boolean).join(', ') || '\u00A0'}
              </span>
            </div>

            <div className="flex gap-3 items-baseline">
              <div className="flex-[4] flex items-baseline gap-2">
                <span className="font-bold uppercase w-[72px] shrink-0 text-[8pt] text-slate-800">Cidade:</span>
                <span className="flex-1 border-b border-slate-700 font-bold uppercase text-[8.5pt] text-slate-950 pl-2.5 pb-0.5 text-left leading-normal min-h-[1.3em]">
                  {selectedTeacher.address_city || '\u00A0'}
                </span>
              </div>
              <div className="flex-[1.2] flex items-baseline gap-2">
                <span className="font-bold uppercase shrink-0 text-[8pt] text-slate-800">UF:</span>
                <span className="flex-1 border-b border-slate-700 font-bold uppercase text-[8.5pt] text-slate-950 pl-2.5 pb-0.5 text-left leading-normal min-h-[1.3em]">
                  {selectedTeacher.address_state || '\u00A0'}
                </span>
              </div>
              <div className="flex-[2.5] flex items-baseline gap-2">
                <span className="font-bold uppercase shrink-0 text-[8pt] text-slate-800">CEP:</span>
                <span className="flex-1 border-b border-slate-700 font-bold text-[8.5pt] text-slate-950 pl-2.5 pb-0.5 text-left leading-normal min-h-[1.3em]">
                  {selectedTeacher.address_zip || '\u00A0'}
                </span>
              </div>
            </div>
          </div>

          {/* DISCIPLINAS POR SEMESTRE */}
          <div className="mt-6 mb-6 p-3.5 bg-slate-50/80 border border-slate-300 rounded-md space-y-2">
            <h4 className="text-[8pt] font-black uppercase text-center border-b border-slate-200 pb-1.5 tracking-wider text-slate-900">
              Disciplinas Ministradas
            </h4>
            <div className="grid grid-cols-2 gap-3 text-[8pt]">
              {/* 1º SEMESTRE */}
              <div className="border border-slate-200 p-2.5 bg-white">
                <p className="font-bold uppercase text-blue-900 border-b border-slate-200 pb-1 mb-1 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-blue-600 inline-block"></span>
                  1º Semestre
                </p>
                {sem1.length > 0 ? (
                  <ul className="list-disc list-inside space-y-0.5 font-bold uppercase text-slate-900 text-[7.5pt]">
                    {sem1.map((s, idx) => (
                      <li key={`tsem1-${s.id || idx}-${idx}`}>{s.code ? `[${s.code}] ` : ''}{s.name}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[7pt] text-slate-400 italic">Nenhuma disciplina vinculada.</p>
                )}
              </div>

              {/* 2º SEMESTRE */}
              <div className="border border-slate-200 p-2.5 bg-white">
                <p className="font-bold uppercase text-emerald-900 border-b border-slate-200 pb-1 mb-1 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-600 inline-block"></span>
                  2º Semestre
                </p>
                {sem2.length > 0 ? (
                  <ul className="list-disc list-inside space-y-0.5 font-bold uppercase text-slate-900 text-[7.5pt]">
                    {sem2.map((s, idx) => (
                      <li key={`tsem2-${s.id || idx}-${idx}`}>{s.code ? `[${s.code}] ` : ''}{s.name}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[7pt] text-slate-400 italic">Nenhuma disciplina vinculada.</p>
                )}
              </div>
            </div>

            {others.length > 0 && (
              <div className="border border-slate-200 p-1.5 bg-white text-[7.5pt]">
                <span className="font-bold uppercase text-slate-700 mr-1.5">Outras Disciplinas:</span>
                <span className="font-medium uppercase text-slate-900">{others.map(s => s.name).join(', ')}</span>
              </div>
            )}
          </div>

          {/* OBSERVAÇÕES */}
          <div className="mt-6 mb-6">
            <span className="text-[8pt] font-black uppercase text-slate-800">Observações:</span>
            <div className="text-[8pt] border border-slate-300 p-2.5 min-h-[60px] leading-relaxed whitespace-pre-wrap mt-1 bg-slate-50/40">
              {(() => {
                const cleanedObs = (selectedTeacher.observations || '')
                  .replace(/\[SUBJECTS:(\[[\s\S]*?\])\]/g, '')
                  .replace(/\[SUBJECTS:\[[\s\S]*?\]\]/g, '')
                  .replace(/\[PHOTO_URL:[\s\S]*?\]/g, '')
                  .replace(/\]\]$/g, '')
                  .trim();
                return cleanedObs || 'Nenhuma observação registrada.';
              })()}
            </div>
          </div>
        </div>

        {/* BOTTOM SECTION: PINNED FOOTER */}
        <div className="mt-auto pt-2 shrink-0 pr-1">
          {/* DATE AND SIGNATURE */}
          <div className="mt-auto mb-6">
            <div className="flex justify-between items-end px-3 gap-8">
              <div className="flex flex-col pb-0.5">
                <p className="text-[8.5pt] font-bold text-slate-900">
                  {inst?.city_uf ? inst.city_uf.split('/')[0] : 'Guarulhos'}, <span>
                    {new Date().toLocaleDateString('pt-BR')}
                  </span>
                </p>
              </div>
              <div className="flex flex-col items-center">
                <div className="w-[75mm] border-t-2 border-slate-900 mb-1.5"></div>
                <p className="text-[7.5pt] font-black uppercase tracking-[0.2em] text-slate-900">
                  Assinatura do(a) Professor(a)
                </p>
              </div>
            </div>
          </div>

          {/* RODAPÉ INSTITUCIONAL */}
          <div className="border-t-2 border-slate-900 pt-2 pb-0 flex justify-between items-start text-slate-900 uppercase tracking-tight text-[7pt]">
            <div className="flex-1 space-y-0.5">
              <p className="leading-tight font-bold">
                {inst?.address || 'AV. VENUS, 195 - ITAPEGICA - GUARULHOS/SP'}
              </p>
              <p className="leading-tight font-bold">
                {inst?.cep ? `CEP: ${inst.cep}` : 'CEP: 07044-170'} {inst?.city_uf ? ` - ${inst.city_uf}` : ' - GUARULHOS/SP'}
              </p>
              <p className="leading-tight font-bold pt-0.5">
                <span className="normal-case">Telefone: {inst?.phone || '(11) 2421-2935'}</span>
              </p>
            </div>
            <div className="text-right max-w-[380px] leading-tight text-slate-900 font-bold text-[7pt] space-y-0.5 pr-1">
              <p className="whitespace-pre-line uppercase underline underline-offset-2 mb-0.5">Atendimento Secretaria:</p>
              <p className="whitespace-pre-line lowercase font-bold text-[7pt]">{inst?.secretary || 'quarta a sexta-feira das 14h as 18h'}</p>
              <p className="lowercase font-bold text-[7pt] pt-0.5">
                email: {(inst?.email || 'email@email.com.br').toLowerCase()}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const filteredTeachers = React.useMemo(() => {
    let result = teachers.filter(t => {
      const term = (searchTerm || '').trim().toLowerCase();
      const matchesSearch = !term ||
        (t.name || '').toLowerCase().includes(term) ||
        (t.code || '').toLowerCase().includes(term) ||
        (t.cpf || '').includes(term);
      
      const teacherStatus = t.status || 'Ativo';
      const matchesStatus = statusFilter === 'Todos' || teacherStatus.toLowerCase() === statusFilter.toLowerCase();
      
      const matchesSubject = subjectFilter === 'all' || (t.subject_ids || []).includes(subjectFilter);
      
      const matchesSemester = semesterFilter === 'all' || (t.subject_ids || []).some(id => {
        const sub = subjects.find(s => s.id === id);
        if (!sub) return false;
        const sem = (sub.semester || '').toLowerCase();
        const name = (sub.name || '').toLowerCase();
        if (semesterFilter === '1º Semestre') {
          return sem.includes('1') || sem.includes('1º') || sem.includes('1o') || name.includes('1º sem') || name.includes('1o sem') || name.includes('1 sem');
        }
        if (semesterFilter === '2º Semestre') {
          return sem.includes('2') || sem.includes('2º') || sem.includes('2o') || name.includes('2º sem') || name.includes('2o sem') || name.includes('2 sem');
        }
        return true;
      });
      
      let matchesUnit = true;
      if (globalUnitId && globalUnitId !== 'all') {
        const teacherUnit = getItemUnitId(t);
        matchesUnit = isItemInUnit(teacherUnit, globalUnitId, activeUnits);
      }

      return matchesSearch && matchesStatus && matchesSubject && matchesSemester && matchesUnit;
    });

    return [...result].sort((a, b) => {
      if (sortBy === 'code') return (a.code || '').localeCompare(b.code || '');
      if (sortBy === 'subject') {
        const subA = subjects.find(s => a.subject_ids?.includes(s.id))?.name || '';
        const subB = subjects.find(s => b.subject_ids?.includes(s.id))?.name || '';
        return subA.localeCompare(subB);
      }
      return (a.name || '').localeCompare(b.name || '');
    });
  }, [teachers, searchTerm, statusFilter, subjectFilter, semesterFilter, sortBy, subjects, hasMultipleUnits, globalUnitId, activeUnits]);

  const teachersInActiveUnitCount = React.useMemo(() => {
    if (!globalUnitId || globalUnitId === 'all') return teachers.length;
    return teachers.filter(t => isItemInUnit(getItemUnitId(t), globalUnitId, activeUnits)).length;
  }, [teachers, globalUnitId, activeUnits]);

  const actualListCollapsed = selectedTeacher !== null || isEditing;

  return (
    <>
      <div className={cn(
        "print:hidden h-auto lg:h-[calc(100vh-4.5rem)] min-h-[calc(100vh-4.5rem)] lg:min-h-0 relative flex flex-col lg:flex-row gap-2.5 sm:gap-3 w-full transition-all duration-300",
        actualListCollapsed ? "justify-center" : "justify-start"
      )}>
      {/* Green Hover Sensor / Marker */}
      {actualListCollapsed && !hoverShowList && (
        <div 
          onMouseEnter={() => setHoverShowList(true)}
          onClick={() => setHoverShowList(true)}
          className="absolute right-0 top-1/4 h-1/2 w-3 bg-emerald-500 hover:bg-emerald-600 cursor-pointer rounded-l-md shadow-md transition-all duration-200 flex flex-col justify-center items-center group z-[45]"
          title="Aproxime o mouse para ver a Lista de Professores"
        >
          {/* Subtle glowing accent */}
          <div className="w-1 h-8 bg-white/40 rounded-full animate-pulse my-1" />
          <div className="w-1 h-8 bg-white/40 rounded-full animate-pulse my-1" />
          
          {/* Hover instruction tooltip */}
          <div className="absolute right-4 bg-slate-900 border border-slate-800 text-emerald-400 font-bold text-[10px] uppercase tracking-wider py-1.5 px-3 rounded-lg shadow-xl opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-all duration-300 translate-x-2 group-hover:translate-x-0">
            ➔ Lista de Professores <span className="text-slate-300">(Passe o mouse)</span>
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
          "bg-white rounded-lg shadow-sm flex flex-col order-last transition-all duration-300 ease-in-out border border-slate-200 overflow-hidden shrink-0",
          actualListCollapsed 
            ? (hoverShowList 
                ? "absolute right-0 top-0 bottom-0 h-full z-50 w-full sm:w-[432px] opacity-100 shadow-2xl border-l border-slate-200" 
                : "w-0 opacity-0 border-0 pointer-events-none overflow-hidden hidden"
              )
            : "w-full lg:w-[380px] xl:w-[432px] opacity-100 h-full"
        )}
      >
        <div className="flex-[1] flex flex-col overflow-hidden w-full">
          <div className="p-4 border-b border-slate-50 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-[#131b2e]">Professores</h2>
              <div className="flex gap-2">
                <div className="px-2 py-1 bg-slate-50 text-slate-900 text-[10px] font-bold rounded-lg border border-slate-200 flex items-center">
                  {filteredTeachers.length}
                </div>
                <button 
                  onClick={() => navigate('/cadastros-relatorios?tab=professores')}
                  className="px-3 py-1.5 bg-slate-50 text-slate-800 rounded-lg hover:bg-slate-100 transition-all flex items-center gap-2 border border-slate-200 shadow-sm"
                  title="Abrir Relatório / Listagem Completa"
                >
                  <Printer size={16} />
                  <span className="text-[10px] font-bold uppercase tracking-tight">Listagem</span>
                </button>
                <button 
                  onClick={handleNew}
                  className="p-1.5 bg-slate-50 text-slate-800 rounded-lg hover:bg-slate-100 transition-colors"
                  title="Novo Professor"
                >
                  <Plus size={18} />
                </button>
              </div>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input 
                type="text"
                placeholder="Buscar professor..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-slate-50 border-none rounded-lg text-sm focus:ring-2 focus:ring-slate-500/10"
              />
            </div>
            <div className="flex bg-slate-50 p-1 rounded-lg">
              {(['Ativo', 'Inativo', 'Todos'] as const).map((status) => (
                <button
                  key={status}
                  onClick={() => setStatusFilter(status)}
                  className={cn(
                    "flex-1 py-1.5 text-[10px] font-bold rounded-lg transition-all",
                    statusFilter === status 
                      ? "bg-white text-slate-800 shadow-sm" 
                      : "text-slate-500 hover:text-slate-700"
                  )}
                >
                  {status}
                </button>
              ))}
            </div>
            
            <div className="grid grid-cols-3 gap-1.5">
              <select
                value={semesterFilter}
                onChange={(e) => setSemesterFilter(e.target.value)}
                className="px-2 py-2 bg-slate-50 border-none rounded-lg text-[10px] font-bold text-slate-600 focus:ring-1 focus:ring-slate-500/10 truncate"
              >
                <option value="all">Semestres (Todos)</option>
                <option value="1º Semestre">1º Semestre</option>
                <option value="2º Semestre">2º Semestre</option>
              </select>
              <select
                value={subjectFilter}
                onChange={(e) => setSubjectFilter(e.target.value)}
                className="px-2 py-2 bg-slate-50 border-none rounded-lg text-[10px] font-bold text-slate-600 focus:ring-1 focus:ring-slate-500/10 truncate"
              >
                <option value="all">Disciplinas (Todas)</option>
                {subjects.filter(s => s.status === 'Ativo').map((s, sIdx) => (
                  <option key={`teach-sub-opt-${s.id || s.code || sIdx}-${sIdx}`} value={s.id}>{formatSubjectDisplayName(s)}</option>
                ))}
              </select>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="px-2 py-2 bg-slate-50 border-none rounded-lg text-[10px] font-bold text-slate-600 focus:ring-1 focus:ring-slate-500/10 truncate"
              >
                <option value="name">Por Nome</option>
                <option value="code">Por Código</option>
                <option value="subject">Por Disciplina</option>
              </select>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {loading ? (
              <div className="flex items-center justify-center h-32">
                <Loader2 className="animate-spin text-slate-705" />
              </div>
            ) : filteredTeachers.map((teacher, tIdx) => (
              <TeacherItem
                key={`teach-item-${teacher.id || tIdx}-${tIdx}`}
                teacher={teacher}
                isSelected={selectedTeacher?.id === teacher.id}
                onSelect={handleSelectTeacher}
                unitName={hasMultipleUnits ? getUnitName(teacher.unit_id) : undefined}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className={cn(
        "bg-white rounded-lg shadow-sm border border-slate-200 flex flex-col overflow-hidden transition-all duration-300 min-w-0 h-full flex-1",
        actualListCollapsed ? "max-w-5xl mx-auto w-full" : "w-full"
      )}>
        {selectedTeacher || isEditing ? (
          <>
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/30">
              <button
                type="button"
                onClick={() => {
                  setSelectedTeacher(null);
                  setIsEditing(false);
                }}
                className="lg:hidden mb-3 px-3.5 py-1.5 bg-slate-800 hover:bg-slate-900 text-white text-[10px] font-bold uppercase tracking-widest transition-all flex items-center gap-2 cursor-pointer shadow-xs"
              >
                <ArrowLeft size={14} />
                <span>Ver Lista Completa de Professores</span>
              </button>
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-5">
                <div className="relative group">
                  <div className="w-20 h-28 rounded-lg bg-white shadow-sm flex items-center justify-center text-slate-400 overflow-hidden border border-slate-200 relative">
                    {formData.photo_url ? (
                      <img src={formData.photo_url} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <UserIcon size={32} />
                    )}
                    
                    {uploadingPhoto && (
                      <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-[1px] flex items-center justify-center">
                        <Loader2 className="text-white animate-spin" size={20} />
                      </div>
                    )}
                  </div>
                  {isEditing && !uploadingPhoto && (
                    <div className="absolute inset-0 bg-black/40 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                       <button 
                         type="button"
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
                    {isEditing ? (selectedTeacher ? 'Editar Professor' : 'Novo Professor') : formData.name}
                  </h3>
                  <div className="flex items-center gap-3 mt-1.5">
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Código: {formData.code || '---'}</span>
                    <span className={cn(
                      "px-1.5 py-0.5 rounded text-[9px] font-bold uppercase border tracking-wider",
                      formData.status === 'Ativo' ? "bg-emerald-50 text-emerald-700 border-emerald-100" : "bg-slate-50 text-slate-500 border-slate-200"
                    )}>
                      {formData.status || 'Ativo'}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 w-full md:w-auto md:justify-end">
                {isEditing ? (
                  <>
                    {selectedTeacher && (
                      canDelete ? (
                        <button 
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setShowDeleteConfirm(true);
                          }}
                          className="h-10 px-4 bg-red-50 border border-red-200 text-red-700 hover:bg-red-100 hover:border-red-300 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-sm uppercase tracking-wide mr-auto"
                          title="Excluir Professor"
                        >
                          <Trash2 size={16} />
                          <span>Excluir</span>
                        </button>
                      ) : (
                        <button 
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleToggleTeacherStatus();
                          }}
                          className={cn(
                            "h-10 px-4 border rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-sm uppercase tracking-wide mr-auto",
                            formData.status === 'Inativo'
                              ? "bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100"
                              : "bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100"
                          )}
                          title={formData.status === 'Inativo' ? "Reativar Cadastro do Professor" : "Inativar Professor (Exclusão física vedada para Assistente)"}
                        >
                          <UserX size={16} />
                          <span>{formData.status === 'Inativo' ? "Reativar" : "Inativar"}</span>
                        </button>
                      )
                    )}
                    <button 
                      onClick={() => setIsEditing(false)}
                      className="h-10 px-4 bg-rose-50 border border-rose-200 text-rose-700 hover:bg-rose-100 hover:border-rose-300 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-sm uppercase tracking-wider"
                    >
                      <X size={15} />
                      <span>Cancelar</span>
                    </button>
                    <button 
                      onClick={handleSave}
                      className="h-10 px-6 bg-[#00174b] text-white hover:bg-[#000f33] rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-md uppercase tracking-wider"
                    >
                      <Save size={16} />
                      <span>Salvar Professor</span>
                    </button>
                  </>
                ) : (
                  selectedTeacher && (
                    <div className="flex gap-2">
                      <button 
                        onClick={() => {
                          setSelectedTeacher(null);
                          setIsEditing(false);
                        }}
                        className="h-10 w-10 bg-slate-100 border border-slate-300 text-slate-700 rounded-lg hover:text-slate-900 hover:bg-slate-200 hover:border-slate-400 transition-all flex items-center justify-center shadow-sm cursor-pointer"
                        title="Fechar Ficha (Voltar à lista)"
                        aria-label="Fechar Ficha"
                      >
                        <ArrowLeft size={18} />
                      </button>

                      <button 
                        onClick={handlePrint}
                        className="h-10 w-10 bg-white border border-slate-200 text-slate-500 rounded-lg hover:text-slate-800 hover:bg-slate-50 transition-all flex items-center justify-center shadow-sm cursor-pointer"
                        title="Imprimir Ficha"
                        aria-label="Imprimir Ficha"
                      >
                        <Printer size={16} />
                      </button>

                      <button 
                        onClick={() => setIsEditing(true)}
                        className="h-10 w-10 bg-blue-50 border border-blue-200 text-blue-700 rounded-lg hover:text-blue-900 hover:bg-blue-100/60 transition-all flex items-center justify-center shadow-sm cursor-pointer"
                        title="Editar Ficha"
                        aria-label="Editar Ficha"
                      >
                        <Edit2 size={16} />
                      </button>
                    </div>
                  )
                )}
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
              <div className="p-3 pb-24">
                {showWebcam ? (
                <div className="max-w-md mx-auto space-y-4">
                  <div className="aspect-video bg-black rounded-lg overflow-hidden relative">
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
                      type="button"
                      onClick={() => setShowWebcam(false)}
                      className="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg font-bold text-sm"
                    >
                      Cancelar
                    </button>
                    <button 
                      type="button"
                      onClick={capturePhoto}
                      className="px-6 py-2 bg-slate-800 text-white rounded-lg font-bold text-sm flex items-center gap-2"
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
                    Informações Básicas
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-700">Nome Completo</label>
                      <input 
                        type="text"
                        disabled={!isEditing}
                        value={formData.name || ''}
                        onChange={(e) => setFormData({...formData, name: e.target.value})}
                        onKeyDown={handleKeyDown}
                        className="w-full px-4 py-2 bg-slate-50 border-none rounded-lg text-sm focus:ring-2 focus:ring-slate-500/10 disabled:opacity-60"
                        tabIndex={1}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-700">E-mail</label>
                      <input 
                        type="email"
                        disabled={!isEditing}
                        value={formData.email || ''}
                        onChange={(e) => setFormData({...formData, email: e.target.value})}
                        onKeyDown={handleKeyDown}
                        className="w-full px-4 py-2 bg-slate-50 border-none rounded-lg text-sm focus:ring-2 focus:ring-slate-500/10 disabled:opacity-60"
                        tabIndex={2}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-700">CPF</label>
                      <input 
                        type="text"
                        disabled={!isEditing}
                        value={formData.cpf || ''}
                        onChange={(e) => setFormData({...formData, cpf: maskCPF(e.target.value)})}
                        onKeyDown={handleKeyDown}
                        className="w-full px-4 py-2 bg-slate-50 border-none rounded-lg text-sm focus:ring-2 focus:ring-slate-500/10 disabled:opacity-60"
                        placeholder="000.000.000-00"
                        tabIndex={3}
                      />
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-slate-700">RG / Identidade</label>
                        {formData.rg && (
                          <span className="text-[10px] text-slate-500 font-mono">
                            {formData.rg.length}/{RG_MAX_FORMATTED_LENGTH}
                          </span>
                        )}
                      </div>
                      <input 
                        type="text"
                        disabled={!isEditing}
                        value={formData.rg || ''}
                        onChange={(e) => setFormData({...formData, rg: maskRG(e.target.value)})}
                        onKeyDown={handleKeyDown}
                        maxLength={RG_MAX_FORMATTED_LENGTH}
                        className="w-full px-4 py-2 bg-slate-50 border-none rounded-lg text-sm focus:ring-2 focus:ring-slate-500/10 disabled:opacity-60"
                        placeholder="00.000.000-0"
                        tabIndex={4}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-700">Situação</label>
                      <select 
                        disabled={!isEditing}
                        value={formData.status || 'Ativo'}
                        onChange={(e) => setFormData({...formData, status: e.target.value as any})}
                        onKeyDown={handleKeyDown}
                        className="w-full px-4 py-2 bg-slate-50 border-none rounded-lg text-sm focus:ring-2 focus:ring-slate-500/10 disabled:opacity-60"
                        tabIndex={5}
                      >
                        <option value="Ativo">Ativo</option>
                        <option value="Inativo">Inativo</option>
                      </select>
                    </div>
                    {hasMultipleUnits && (
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                          <Building2 size={13} className="text-blue-900" />
                          Polo / Unidade Principal
                        </label>
                        <select 
                          disabled={!isEditing}
                          value={formData.unit_id || 'matriz'}
                          onChange={(e) => setFormData({...formData, unit_id: e.target.value})}
                          onKeyDown={handleKeyDown}
                          className="w-full px-4 py-2 bg-slate-50 border-none rounded-lg text-sm focus:ring-2 focus:ring-slate-500/10 disabled:opacity-60 font-semibold"
                          tabIndex={6}
                        >
                          {activeUnits.map(u => (
                            <option key={u.id} value={u.id}>
                              {u.name} {u.is_main || u.id === 'matriz' ? '(Matriz)' : ''}
                            </option>
                          ))}
                        </select>
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
                          className="w-full px-3 py-2 bg-blue-50/70 border border-blue-200 rounded-lg text-sm font-mono font-bold text-blue-950 shadow-xs shadow-blue-500/10 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60 transition-all"
                          placeholder="00000-000"
                          tabIndex={7}
                        />
                      </div>
                    </div>

                    <div className="col-span-12 sm:col-span-7 lg:col-span-9 space-y-1">
                      <label className="text-xs font-bold text-slate-700">Logradouro (Rua, Av, etc)</label>
                      <input 
                        type="text"
                        disabled={!isEditing}
                        value={formData.address_street || ''}
                        onChange={(e) => setFormData({...formData, address_street: e.target.value})}
                        onKeyDown={handleKeyDown}
                        placeholder="Rua, Av, etc..."
                        className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-slate-500/10 disabled:opacity-60"
                        tabIndex={8}
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
                        className="w-full px-2 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-mono font-bold focus:ring-2 focus:ring-slate-500/10 disabled:opacity-60 text-slate-800 text-center"
                        tabIndex={9}
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
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-slate-500/10 disabled:opacity-60"
                        tabIndex={10}
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
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-slate-500/10 disabled:opacity-60"
                        tabIndex={11}
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
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-slate-500/10 disabled:opacity-60"
                        tabIndex={12}
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
                        className="w-full px-2 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-slate-500/10 disabled:opacity-60 uppercase text-center font-bold"
                        tabIndex={13}
                      />
                    </div>
                    <div className="col-span-12 sm:col-span-5 space-y-1">
                      <label className="text-xs font-bold text-slate-700">Celular</label>
                      <div className="relative">
                        <input 
                          type="text"
                          disabled={!isEditing}
                          value={formData.phone_mobile || ''}
                          onChange={(e) => setFormData({...formData, phone_mobile: maskPhone(e.target.value)})}
                          onKeyDown={handleKeyDown}
                          className="w-full px-4 py-2 bg-slate-50 border-none rounded-lg text-sm focus:ring-2 focus:ring-slate-500/10 disabled:opacity-60 pr-10"
                          placeholder="(00) 00000-0000"
                          tabIndex={14}
                        />
                        <button
                          type="button"
                          disabled={!isEditing}
                          onClick={() => setFormData({ ...formData, phone_mobile_is_whatsapp: !formData.phone_mobile_is_whatsapp })}
                          className={cn(
                            "absolute right-3 top-1/2 -translate-y-1/2 transition-all p-1 rounded-lg",
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

                {/* Additional Info */}
                <section className="space-y-3">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <FileText size={14} />
                    Observações
                  </h4>
                  <textarea 
                    disabled={!isEditing}
                    value={(formData.observations || '')
                      .replace(/\[SUBJECTS:(\[[\s\S]*?\])\]/g, '')
                      .replace(/\[SUBJECTS:\[[\s\S]*?\]\]/g, '')
                      .replace(/\[PHOTO_URL:[\s\S]*?\]/g, '')
                      .replace(/\]\]$/g, '')
                      .trim()}
                    onChange={(e) => setFormData({...formData, observations: e.target.value})}
                    onKeyDown={handleKeyDown}
                    rows={4}
                    className="w-full px-4 py-2 bg-slate-50 border-none rounded-lg text-sm focus:ring-2 focus:ring-slate-500/10 disabled:opacity-60 resize-none"
                    tabIndex={15}
                  />
                </section>

                {/* Subjects Selection */}
                <section className="space-y-3">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <BookOpen size={14} />
                    Disciplinas Lecionadas
                  </h4>
                  <div className="bg-slate-50 rounded-lg p-4 border border-slate-100">
                    {subjects.length === 0 ? (
                      <p className="text-xs text-slate-500 py-4 text-center">Nenhuma disciplina cadastrada no sistema.</p>
                    ) : (
                      (() => {
                        const activeSubjects = subjects.filter(s => s.status === 'Ativo' || (formData.subject_ids || []).includes(s.id));
                        const { sem1, sem2, others } = groupSubjectsBySemester(activeSubjects);

                        const renderSubjectGroup = (title: string, groupList: Subject[], badgeColor: string) => {
                          if (groupList.length === 0) return null;
                          return (
                            <div className="space-y-2 mb-4 last:mb-0">
                              <div className="flex items-center gap-2 border-b border-slate-200 pb-1">
                                <span className={cn("w-2 h-2 rounded-full", badgeColor)}></span>
                                <span className="text-xs font-bold uppercase tracking-wider text-slate-700">{title}</span>
                                <span className="text-[10px] text-slate-400 font-semibold">({groupList.length})</span>
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                                {groupList.map((subject, sIdx) => {
                                  const isSelected = (formData.subject_ids || []).includes(subject.id);
                                  return (
                                    <label 
                                      key={`tsub-${subject.id || subject.code || sIdx}-${sIdx}`}
                                      className={cn(
                                        "flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-all border",
                                        isSelected 
                                          ? "bg-white border-slate-300 shadow-sm text-slate-900 font-bold" 
                                          : "bg-slate-50 border-transparent hover:bg-white hover:border-slate-200 text-slate-600",
                                        !isEditing && "cursor-default opacity-80"
                                      )}
                                    >
                                      <input 
                                        type="checkbox"
                                        disabled={!isEditing}
                                        checked={isSelected}
                                        onChange={(e) => {
                                          if (!isEditing) return;
                                          const current = formData.subject_ids || [];
                                          if (e.target.checked) {
                                            setFormData({ ...formData, subject_ids: [...current, subject.id] });
                                          } else {
                                            setFormData({ ...formData, subject_ids: current.filter(id => id !== subject.id) });
                                          }
                                        }}
                                        className="hidden"
                                      />
                                      <div className={cn(
                                        "w-4 h-4 rounded border flex items-center justify-center transition-all shrink-0",
                                        isSelected 
                                          ? "bg-slate-800 border-slate-800 text-white" 
                                          : "bg-white border-slate-300"
                                      )}>
                                        {isSelected && <Plus size={10} className="stroke-[4]" />}
                                      </div>
                                      <div className="min-w-0">
                                        <p className="text-[10px] font-bold truncate">{subject.name}</p>
                                        <p className="text-[8px] text-slate-400 font-mono tracking-tighter">{subject.code}</p>
                                      </div>
                                    </label>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        };

                        return (
                          <div>
                            {renderSubjectGroup('1º Semestre', sem1, 'bg-blue-600')}
                            {renderSubjectGroup('2º Semestre', sem2, 'bg-emerald-600')}
                            {renderSubjectGroup('Outras Disciplinas', others, 'bg-slate-400')}
                          </div>
                        );
                      })()
                    )}
                    {!isEditing && (formData.subject_ids || []).length === 0 && (
                      <p className="text-xs text-slate-400 italic">Professor sem disciplinas vinculadas.</p>
                    )}
                  </div>
                </section>
              </div>
            )}
          </div>
        </div>
      </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 space-y-4">
            <div className="w-20 h-20 bg-slate-50 rounded-lg flex items-center justify-center">
              <UserIcon size={40} />
            </div>
            <p className="text-sm font-medium">Selecione um professor para ver os detalhes</p>
          </div>
        )}

        {/* Delete Confirmation Modal (Apenas para canDelete) */}
        {showDeleteConfirm && canDelete && selectedTeacher && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-lg shadow-2xl p-8 max-w-sm w-full space-y-6 animate-in zoom-in-95 duration-200">
              <div className="w-16 h-16 bg-red-50 text-red-600 rounded-lg flex items-center justify-center mx-auto">
                <Trash2 size={32} />
              </div>
              <div className="text-center space-y-2">
                <h3 className="text-xl font-bold text-[#131b2e]">Excluir Professor?</h3>
                <p className="text-sm text-slate-500 font-medium leading-relaxed">
                  Tem certeza que deseja excluir a ficha do professor <span className="font-bold text-slate-900">{selectedTeacher.name}</span>? 
                  Esta ação não pode ser desfeita.
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 px-4 py-3 bg-slate-100 text-slate-600 rounded-lg font-bold text-sm hover:bg-slate-200 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleDelete}
                  disabled={loading}
                  className="flex-1 px-4 py-3 bg-red-600 text-white rounded-lg font-bold text-sm hover:bg-red-700 transition-colors shadow-lg shadow-red-200 disabled:opacity-50"
                >
                  {loading ? 'Excluindo...' : 'Sim, Excluir'}
                </button>
              </div>
            </div>
          </div>
        )}
        {/* Notification Toast */}
        {notification && (
          <div className={cn(
            "fixed bottom-8 left-1/2 -translate-x-1/2 px-6 py-4 rounded-lg shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-bottom-5 z-[300]",
            notification.type === 'success' ? "bg-emerald-600 text-white" : "bg-red-600 text-white"
          )}>
            {notification.type === 'success' ? <Loader2 className="animate-spin" size={20} /> : <X size={20} />}
            <span className="font-bold text-sm tracking-wide">{notification.message}</span>
          </div>
        )}
      </div>
      </div>

      <PrintableTeacher />
    </>
  );
}
