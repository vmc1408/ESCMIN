import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { 
  Building2, 
  Users, 
  Save, 
  Plus, 
  Trash2, 
  Shield, 
  Mail, 
  User, 
  Loader2,
  CheckCircle2,
  AlertCircle,
  Camera,
  Globe,
  MapPin,
  Phone,
  FileText,
  Upload,
  Edit2,
  X,
  Database,
  RefreshCw,
  AlertTriangle,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  Clock,
  ShieldCheck,
  Crown,
  UserCheck,
  Search,
  Filter,
  Check,
  Edit,
  Eraser,
  LayoutDashboard as Layout,
  School,
  CheckCircle,
  Copy,
  Terminal
} from 'lucide-react';
import { db, fetchCount, uploadImage, saveData, fetchAll } from '../lib/firebase';
import { collection, query, limit, getDocs, doc, updateDoc, setDoc, deleteDoc, orderBy, addDoc, writeBatch } from 'firebase/firestore';
import { Student, Class } from '../types';
import { cn } from '../lib/utils';
import { financialService } from '../services/financialService';
import { supabase } from '../lib/supabase';
import { schemaService } from '../services/schemaService';

const USER_ROLES = [
  { value: 'admin', label: 'Administrador', color: 'bg-indigo-50 text-indigo-700 border-indigo-100', icon: Crown },
  { value: 'coordenador', label: 'Coordenador', color: 'bg-emerald-50 text-emerald-700 border-emerald-100', icon: ShieldCheck },
  { value: 'secretario', label: 'Secretário', color: 'bg-amber-50 text-amber-700 border-amber-100', icon: UserCheck },
];

const USER_STATUS = [
  { value: 'authorized', label: 'Ativo', color: 'bg-green-50 text-green-600', dot: 'bg-green-500' },
  { value: 'pending', label: 'Pendente', color: 'bg-amber-50 text-amber-600', dot: 'bg-amber-500' },
  { value: 'suspended', label: 'Suspenso', color: 'bg-red-50 text-red-600', dot: 'bg-red-500' },
];

interface InstitutionSettings {
  id?: string;
  name: string;
  cnpj: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  logo_url: string;
  footer_text: string;
  receipt_message: string;
}

interface UserProfile {
  id: string;
  full_name: string;
  username: string;
  email?: string;
  role: 'admin' | 'coordenador' | 'secretario';
  avatar_url?: string;
  status: 'pending' | 'authorized' | 'suspended';
  created_at: string;
  updated_at?: string;
}

// Memoized Professional User Card
const UserCard = React.memo(({ 
  user, 
  onEdit, 
  onDelete 
}: { 
  user: any, 
  onEdit: (u: any) => void, 
  onDelete: (id: string) => void 
}) => {
  const role = USER_ROLES.find(r => r.value === user.role) || USER_ROLES[2];
  const RoleIcon = role.icon;
  const status = USER_STATUS.find(s => s.value === user.status) || USER_STATUS[0];

  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm hover:shadow-md transition-all group relative overflow-hidden flex flex-col">
      <div className={`absolute top-0 left-0 w-1.5 h-full ${role.color.split(' ')[0]}`} title={role.label} />
      
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-14 h-14 rounded-xl bg-slate-50 overflow-hidden border border-slate-100 transition-transform group-hover:scale-105">
              {user.avatar_url ? (
                <img src={user.avatar_url} alt={user.full_name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-slate-300">
                  <User size={28} />
                </div>
              )}
            </div>
            <div className={cn("absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-2 border-white shadow-sm transition-transform group-hover:scale-110", status.dot)} title={status.label} />
          </div>
          <div>
            <h4 className="font-black text-[#00174b] text-sm line-clamp-1">{user.full_name}</h4>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{user.username}</p>
          </div>
        </div>
        
        <div className="flex items-center gap-1">
          <button 
            onClick={() => onEdit(user)} 
            className="p-2 text-slate-400 hover:bg-blue-50 hover:text-blue-600 rounded-xl transition-all"
            title="Editar Perfil"
          >
            <Edit2 size={16} />
          </button>
          <button 
            onClick={() => onDelete(user.id)} 
            className="p-2 text-slate-300 hover:bg-red-50 hover:text-red-600 rounded-xl transition-all opacity-0 group-hover:opacity-100"
            title="Remover Usuário"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      <div className="mt-auto pt-5 flex items-center justify-between gap-2 border-t border-slate-50">
        <div className={cn("flex items-center gap-2 px-3 py-1 rounded-lg border text-[10px] font-black uppercase tracking-widest transition-colors", role.color)}>
          <RoleIcon size={12} strokeWidth={3} />
          {role.label}
        </div>
        
        <div className="flex flex-col items-end">
          <div className="flex items-center gap-1 text-[9px] font-bold text-slate-300">
            <Clock size={10} />
            {user.updated_at ? new Date(user.updated_at).toLocaleDateString('pt-BR') : 'Sem registros'}
          </div>
        </div>
      </div>
    </div>
  );
});

const getYearFromRegistration = (reg: string | undefined): string => {
  if (!reg) return '';
  if (reg.includes('/')) return reg.split('/')[1];
  if (reg.length === 10) return reg.substring(6);
  return '';
};

const extractYearFromText = (text: string | undefined): number | null => {
  if (!text) return null;
  
  // 1. Search for 4-digit years (1970-2029) - e.g., (2002) or 1997
  const fourDigitMatch = text.match(/\b(19[7-9][0-9]|20[0-2][0-9])\b/);
  if (fourDigitMatch) return parseInt(fourDigitMatch[1]);
  
  // 2. Search for years in parentheses - e.g., (97)
  const parenMatch = text.match(/\((([7-9][0-9])|([0-2][0-9]))\)/);
  if (parenMatch) {
    const y = parseInt(parenMatch[1]);
    return y > 50 ? 1900 + y : 2000 + y;
  }

  // 3. Search for suffixes with 2 digits at the end of words/codes - e.g., TEO-97, T.EXT17, A02
  // We look for patterns like -XX, .XX or just letters followed by 2 digits at the end
  const suffixMatch = text.match(/([A-Z\-\.])([7-9][0-9]|[0-2][0-9])\b/i);
  if (suffixMatch) {
    const y = parseInt(suffixMatch[2]);
    return y > 50 ? 1900 + y : 2000 + y;
  }
  
  return null;
};

export function Settings() {
  const [activeTab, setActiveTab] = useState<'institution' | 'users' | 'profile' | 'maintenance'>('institution');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error', message: string } | null>(null);

  // Institution State
  const [institution, setInstitution] = useState<InstitutionSettings>({
    name: '',
    cnpj: '',
    address: '',
    phone: '',
    email: '',
    website: '',
    logo_url: '',
    footer_text: '',
    receipt_message: ''
  });

  // Users State
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [showUserModal, setShowUserModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [userFormData, setUserFormData] = useState<Partial<UserProfile>>({
    role: 'secretario',
    status: 'pending'
  });

  // My Profile State
  const [myProfile, setMyProfile] = useState<Partial<UserProfile>>({
    full_name: '',
    email: '',
    avatar_url: ''
  });

  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingMyAvatar, setUploadingMyAvatar] = useState(false);

  // Maintenance State
  const [counts, setCounts] = useState<Record<string, number>>({
    students: 0,
    teachers: 0,
    classes: 0,
    subjects: 0
  });
  const [schemaReport, setSchemaReport] = useState<any>(null);
  const [fixSql, setFixSql] = useState<string>('');
  const [checkingSchema, setCheckingSchema] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState<{
    show: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    type: 'danger' | 'warning';
  }>({
    show: false,
    title: '',
    message: '',
    onConfirm: () => {},
    type: 'warning'
  });

  useEffect(() => {
    fetchInstitution();
    fetchUsers();
    fetchMyProfile();
    if (activeTab === 'maintenance') {
      fetchCounts();
    }
  }, [activeTab]);

  // One-time automatic status update for students > 2023 (Requested by User)
  useEffect(() => {
    const triggerAutoUpdate = async () => {
      const hasExecuted = localStorage.getItem('auto_activate_2023_done');
      if (hasExecuted) return;

      try {
        const students = await fetchAll('students');
        const toUpdate = students.filter(s => {
          const yearStr = getYearFromRegistration(s.registration_number);
          const year = parseInt(yearStr);
          return year && year > 2023 && s.status !== 'Ativo';
        });

        if (toUpdate.length > 0) {
          // Batch process to avoid UI freeze or connection limit
          for (const student of toUpdate) {
            await saveData('students', student.id, { ...student, status: 'Ativo' });
          }
          localStorage.setItem('auto_activate_2023_done', 'true');
          window.location.reload(); // Refresh to update counts
        }
      } catch (e) {
        console.error('Auto update failure:', e);
      }
    };
    triggerAutoUpdate();
  }, []);

  const handleSchemaCheckup = async () => {
    try {
      setCheckingSchema(true);
      const report = await schemaService.checkup();
      setSchemaReport(report);
      const sql = schemaService.generateFixSQL(report);
      setFixSql(sql);
      setNotification({ type: 'success', message: 'Checkup de schema concluído!' });
    } catch (e: any) {
      console.error('Schema checkup error:', e);
      setNotification({ type: 'error', message: 'Erro no checkup: ' + e.message });
    } finally {
      setCheckingSchema(false);
      setTimeout(() => setNotification(null), 3000);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setNotification({ type: 'success', message: 'SQL copiado para a área de transferência!' });
    setTimeout(() => setNotification(null), 3000);
  };

  const fetchCounts = async () => {
    try {
      const collections = ['students', 'teachers', 'classes', 'subjects'];
      const newCounts: Record<string, number> = {};
      
      await Promise.all(collections.map(async (col) => {
        newCounts[col] = await fetchCount(col);
      }));
      
      setCounts(newCounts);
    } catch (e) {
      console.error('Error fetching counts:', e);
    }
  };

  const fetchMyProfile = async () => {
    try {
      const q = query(collection(db, 'profiles'), limit(1));
      const snap = await getDocs(q);
      if (!snap.empty) {
        setMyProfile({ id: snap.docs[0].id, ...snap.docs[0].data() } as UserProfile);
      }
    } catch (e) {
      console.error('Error fetching my profile:', e);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploadingLogo(true);
      const url = await uploadImage(file, 'assets', 'logos');
      setInstitution({ ...institution, logo_url: url });
      setNotification({ type: 'success', message: 'Logo carregada com sucesso!' });
    } catch (error: any) {
      setNotification({ type: 'error', message: 'Erro ao carregar logo: ' + error.message });
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploadingAvatar(true);
      const url = await uploadImage(file, 'assets', 'avatars');
      setUserFormData({ ...userFormData, avatar_url: url });
      setNotification({ type: 'success', message: 'Avatar carregado com sucesso!' });
    } catch (error: any) {
      setNotification({ type: 'error', message: 'Erro ao carregar avatar: ' + error.message });
    } finally {
      setUploadingAvatar(false);
    }
  };

  const fetchInstitution = async () => {
    try {
      setLoading(true);
      // Prio 1: Supabase
      const data = await financialService.getInstitutionSettings();
      if (data) {
        setInstitution(data as InstitutionSettings);
        return;
      }

      // Prio 2: Firebase Fallback
      if (db) {
        const q = query(collection(db, 'institution_settings'), limit(1));
        const snap = await getDocs(q);

        if (!snap.empty) {
          setInstitution({ id: snap.docs[0].id, ...snap.docs[0].data() } as InstitutionSettings);
        }
      }
    } catch (error: any) {
      if (!error.message?.includes('quota')) {
        console.error('Error fetching institution:', error.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      // Prio 1: Supabase
      const { data, error } = await supabase.from('profiles').select('*').order('full_name', { ascending: true });
      if (!error && data && data.length > 0) {
        setUsers(data as UserProfile[]);
        return;
      }

      // Prio 2: Firebase
      if (db) {
        const q = query(collection(db, 'profiles'), orderBy('full_name', 'asc'));
        const snap = await getDocs(q);
        const fbData = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as UserProfile[];
        setUsers(fbData);
      }
    } catch (error: any) {
      if (!error.message?.includes('quota')) {
        console.error('Error fetching users:', error.message);
      }
    }
  };

  const formatCNPJ = (value: string) => {
    const digits = value.replace(/\D/g, '');
    return digits
      .replace(/^(\d{2})(\d)/, '$1.$2')
      .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/\.(\d{3})(\d)/, '.$1/$2')
      .replace(/(\d{4})(\d)/, '$1-$2')
      .substring(0, 18);
  };

  const formatPhone = (value: string) => {
    const digits = value.replace(/\D/g, '');
    if (digits.length <= 10) {
      return digits
        .replace(/^(\d{2})(\d)/, '($1) $2')
        .replace(/(\d{4})(\d)/, '$1-$2')
        .substring(0, 14);
    }
    return digits
      .replace(/^(\d{2})(\d)/, '($1) $2')
      .replace(/(\d{5})(\d)/, '$1-$2')
      .substring(0, 15);
  };

  const handleSaveInstitution = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      
      const now = new Date().toISOString();
      // Preparar dados para salvar
      const dataToSave: any = {
        name: institution.name,
        cnpj: institution.cnpj || null,
        address: institution.address || null,
        phone: institution.phone || null,
        email: institution.email || null,
        website: institution.website || null,
        logo_url: institution.logo_url || null,
        footer_text: institution.footer_text || null,
        receipt_message: institution.receipt_message || null
      };

      // Ensure we have an ID for institution_settings
      let instId = institution.id;
      if (!instId) {
        const q = query(collection(db, 'institution_settings'), limit(1));
        const snap = await getDocs(q);
        if (!snap.empty) instId = snap.docs[0].id;
        else instId = '1'; // Default fixed ID
      }

      const finalId = await saveData('institution_settings', instId, dataToSave);
      
      setInstitution({ ...institution, id: finalId as string, ...dataToSave });
      setNotification({ type: 'success', message: 'Configurações sincronizadas com sucesso!' });
      window.dispatchEvent(new Event('institution-updated'));
    } catch (error: any) {
      console.error('Save error:', error);
      setNotification({ type: 'error', message: 'Erro ao salvar: ' + (error.message || 'Erro desconhecido') });
    } finally {
      setSaving(false);
      setTimeout(() => setNotification(null), 3000);
    }
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      
      const id = selectedUser?.id;
      const now = new Date().toISOString();
      const userUpdateData = {
        full_name: userFormData.full_name,
        username: userFormData.username,
        email: userFormData.email || null,
        role: userFormData.role,
        avatar_url: userFormData.avatar_url || null,
        status: userFormData.status || 'authorized',
        created_at: selectedUser?.created_at || now
      };

      await saveData('profiles', id, userUpdateData);

      setNotification({ type: 'success', message: 'Usuário sincronizado com Supabase!' });
      setShowUserModal(false);
      fetchUsers();
      window.dispatchEvent(new Event('profile-updated'));
    } catch (error: any) {
      setNotification({ type: 'error', message: 'Erro ao salvar usuário: ' + error.message });
    } finally {
      setSaving(false);
      setTimeout(() => setNotification(null), 3000);
    }
  };

  const handleMyAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploadingMyAvatar(true);
      const url = await uploadImage(file, 'assets', 'avatars');
      setMyProfile({ ...myProfile, avatar_url: url });
      setNotification({ type: 'success', message: 'Avatar carregado com sucesso!' });
    } catch (error: any) {
      setNotification({ type: 'error', message: 'Erro ao carregar avatar: ' + error.message });
    } finally {
      setUploadingMyAvatar(false);
    }
  };

  const handleSaveMyProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!myProfile.id) return;
    try {
      setSaving(true);
      const docRef = doc(db, 'profiles', myProfile.id);
      
      const updateData = {
        full_name: myProfile.full_name.trim(),
        avatar_url: myProfile.avatar_url || null
      };

      await updateDoc(docRef, updateData);

      setNotification({ type: 'success', message: 'Perfil atualizado com sucesso!' });
      
      // Update local storage if needed to reflect changes immediately in header/sidebar
      const userData = localStorage.getItem('user_data');
      if (userData) {
        const parsed = JSON.parse(userData);
        localStorage.setItem('user_data', JSON.stringify({
          ...parsed,
          ...updateData
        }));
      }

      window.dispatchEvent(new Event('profile-updated'));
    } catch (error: any) {
      setNotification({ type: 'error', message: 'Erro ao salvar perfil: ' + error.message });
    } finally {
      setSaving(false);
      setTimeout(() => setNotification(null), 3000);
    }
  };

  const handleInactivateOldStudents = async () => {
    setShowConfirmModal({
      show: true,
      title: 'Inativar Alunos Antigos',
      message: 'Deseja alterar o status para "Inativo" de todos os alunos com matrícula anterior ao ano de 2023? Esta ação não exclui os registros, apenas os oculta dos filtros ativos padronizados.',
      type: 'warning',
      onConfirm: async () => {
        try {
          setLoading(true);
          setShowConfirmModal(prev => ({ ...prev, show: false }));
          setNotification({ type: 'success', message: 'Iniciando processamento em lote...' });
          
          const students = await fetchAll('students');
          const toUpdate: any[] = [];
          
          students.forEach(s => {
            const yearStr = getYearFromRegistration(s.registration_number);
            const year = parseInt(yearStr);
            
            if (year && year < 2023 && s.status !== 'Inativo') {
              toUpdate.push(s);
            }
          });

          if (toUpdate.length === 0) {
            setNotification({ type: 'success', message: 'Nenhum aluno anterior a 2023 encontrado para inativar.' });
            return;
          }

          // Hybrid Batch Update
          for (const student of toUpdate) {
            await saveData('students', student.id, { ...student, status: 'Inativo' });
          }
          
          setNotification({ type: 'success', message: `${toUpdate.length} alunos inativados com sucesso!` });
          fetchCounts();
        } catch (error: any) {
          console.error('Erro ao inativar alunos:', error);
          setNotification({ type: 'error', message: 'Erro no processamento: ' + error.message });
        } finally {
          setLoading(false);
          setTimeout(() => setNotification(null), 3000);
        }
      }
    });
  };

  const handleActivateRecentStudents = async () => {
    setShowConfirmModal({
      show: true,
      title: 'Ativar Alunos Recentes (> 2023)',
      message: 'Deseja alterar o status para "Ativo" de todos os alunos matriculados a partir de 2024? Isso garantirá que novos registros estejam visíveis no Dashboard.',
      type: 'warning',
      onConfirm: async () => {
        try {
          setLoading(true);
          setShowConfirmModal(prev => ({ ...prev, show: false }));
          setNotification({ type: 'success', message: 'Pesquisando alunos recentes...' });
          
          const students = await fetchAll('students');
          const toUpdate: any[] = [];
          
          students.forEach(s => {
            const yearStr = getYearFromRegistration(s.registration_number);
            const year = parseInt(yearStr);
            
            if (year && year > 2023 && s.status !== 'Ativo') {
              toUpdate.push(s);
            }
          });

          if (toUpdate.length === 0) {
            setNotification({ type: 'success', message: 'Nenhum aluno recente (> 2023) com status pendente encontrado.' });
            return;
          }

          setNotification({ type: 'success', message: `Atualizando ${toUpdate.length} alunos...` });

          // Hybrid Batch Update
          for (const student of toUpdate) {
            await saveData('students', student.id, { ...student, status: 'Ativo' });
          }
          
          setNotification({ type: 'success', message: `${toUpdate.length} alunos ativados com sucesso!` });
          fetchCounts();
        } catch (error: any) {
          console.error('Erro ao ativar alunos:', error);
          setNotification({ type: 'error', message: 'Erro no processamento: ' + error.message });
        } finally {
          setLoading(false);
          setTimeout(() => setNotification(null), 3000);
        }
      }
    });
  };

  const handleInactivateOldClasses = async () => {
    setShowConfirmModal({
      show: true,
      title: 'Inativar Turmas Antigas',
      message: 'Deseja alterar o status para "Inativo" de todas as turmas criadas anteriormente ao ano de 2023? Esta ação ajuda a limpar as listas de seleção ativa do sistema.',
      type: 'warning',
      onConfirm: async () => {
        try {
          setLoading(true);
          setShowConfirmModal(prev => ({ ...prev, show: false }));
          setNotification({ type: 'success', message: 'Iniciando processamento de turmas...' });
          
          const snap = await getDocs(collection(db, 'classes'));
          const toUpdate: any[] = [];
          
          snap.docs.forEach(doc => {
            const data = doc.data();
            
            // Try to find year in code or name first
            const yearFromCode = extractYearFromText(data.code);
            const yearFromName = extractYearFromText(data.name);
            const createdAt = data.created_at ? new Date(data.created_at) : null;
            
            // Priority: Code > Name > CreatedAt
            const detectedYear = yearFromCode || yearFromName || (createdAt ? createdAt.getFullYear() : null);
            
            if (detectedYear && detectedYear < 2023 && data.status !== 'Inativo') {
              toUpdate.push(doc.ref);
            }
          });

          if (toUpdate.length === 0) {
            setNotification({ type: 'success', message: 'Nenhuma turma anterior a 2023 encontrada para inativar.' });
            return;
          }

          // Batch update
          for (let i = 0; i < toUpdate.length; i += 500) {
            const batch = writeBatch(db);
            toUpdate.slice(i, i + 500).forEach(ref => {
              batch.update(ref, { status: 'Inativo', updated_at: new Date().toISOString() });
            });
            await batch.commit();
          }
          
          setNotification({ type: 'success', message: `${toUpdate.length} turmas inativadas com sucesso!` });
          fetchCounts();
        } catch (error: any) {
          console.error('Erro ao inativar turmas:', error);
          setNotification({ type: 'error', message: 'Erro no processamento: ' + error.message });
        } finally {
          setLoading(false);
          setTimeout(() => setNotification(null), 3000);
        }
      }
    });
  };

  const handleClearModule = async (module: string, label: string) => {
    console.log(`Iniciando handleClearModule para: ${module}`);
    
    setShowConfirmModal({
      show: true,
      title: `Excluir ${label}`,
      message: `ATENÇÃO: Isso irá EXCLUIR DEFINITIVAMENTE os ${counts[module] || 0} registros encontrados em "${label}". Confirma?`,
      type: 'danger',
      onConfirm: async () => {
        try {
          setLoading(true);
          setShowConfirmModal(prev => ({ ...prev, show: false }));
          setNotification({ type: 'success', message: `Iniciando limpeza de ${label}...` });
          
          const snap = await getDocs(collection(db, module));
          const totalDocs = snap.docs.length;
          
          if (totalDocs === 0) {
            setNotification({ type: 'success', message: `O módulo ${label} já está vazio.` });
            return;
          }

          // Firestore batch limit is 500 operations
          const chunks = [];
          for (let i = 0; i < snap.docs.length; i += 500) {
            chunks.push(snap.docs.slice(i, i + 500));
          }

          for (const chunk of chunks) {
            const batch = writeBatch(db);
            chunk.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
          }
          
          setNotification({ type: 'success', message: `${totalDocs} registros de ${label} removidos com sucesso!` });
          fetchCounts();
          if (module === 'profiles') fetchUsers();
        } catch (error: any) {
          console.error(`Erro ao limpar módulo ${module}:`, error);
          setNotification({ type: 'error', message: 'Erro ao limpar módulo: ' + error.message });
        } finally {
          setLoading(false);
          setTimeout(() => setNotification(null), 3000);
        }
      }
    });
  };

  const handleCleanDuplicates = async () => {
    console.log('Iniciando handleCleanDuplicates');
    
    setShowConfirmModal({
      show: true,
      title: 'Limpeza de Duplicatas',
      message: 'Deseja analisar e remover registros duplicados de Alunos baseado na matrícula? Apenas a versão mais recente de cada aluno será mantida.',
      type: 'warning',
      onConfirm: async () => {
        try {
          setLoading(true);
          setShowConfirmModal(prev => ({ ...prev, show: false }));
          setNotification({ type: 'success', message: 'Analisando duplicatas de alunos...' });
          
          const snap = await getDocs(collection(db, 'students'));
          const records: Record<string, any[]> = {};
          
          snap.docs.forEach(doc => {
            const data = doc.data();
            const reg = String(data.registration_number || '').trim();
            if (reg) {
              if (!records[reg]) records[reg] = [];
              records[reg].push({ id: doc.id, ...data, ref: doc.ref });
            }
          });

          const toDeleteRefs: any[] = [];

          Object.values(records).forEach(group => {
            if (group.length > 1) {
              group.sort((a, b) => {
                const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
                const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
                return dateB - dateA;
              });
              for (let i = 1; i < group.length; i++) {
                toDeleteRefs.push(group[i].ref);
              }
            }
          });

          if (toDeleteRefs.length > 0) {
            for (let i = 0; i < toDeleteRefs.length; i += 500) {
              const batch = writeBatch(db);
              toDeleteRefs.slice(i, i + 500).forEach(ref => batch.delete(ref));
              await batch.commit();
            }
            setNotification({ type: 'success', message: `${toDeleteRefs.length} registros duplicados removidos!` });
            fetchCounts();
          } else {
            setNotification({ type: 'success', message: 'Nenhum registro duplicado encontrado.' });
          }
        } catch (error: any) {
          console.error('Erro ao limpar duplicatas:', error);
          setNotification({ type: 'error', message: 'Erro ao limpar duplicatas: ' + error.message });
        } finally {
          setLoading(false);
          setTimeout(() => setNotification(null), 3000);
        }
      }
    });
  };

  const handleDeleteUser = async (id: string) => {
    if (!confirm('Tem certeza que deseja remover este usuário?')) return;
    try {
      const docRef = doc(db, 'profiles', id);
      await deleteDoc(docRef);

      setNotification({ type: 'success', message: 'Usuário removido com sucesso!' });
      fetchUsers();
    } catch (error: any) {
      setNotification({ type: 'error', message: 'Erro ao remover: ' + error.message });
    } finally {
      setTimeout(() => setNotification(null), 3000);
    }
  };

  const handleEditUser = useCallback((user: any) => {
    setSelectedUser(user);
    setUserFormData(user);
    setShowUserModal(true);
  }, []);

  const handleDeleteUserClick = useCallback((userId: string) => {
    handleDeleteUser(userId);
  }, [handleDeleteUser]);

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black text-[#00174b] tracking-tight">Configurações</h2>
          <p className="text-slate-500 font-medium mt-1">Gerencie os dados da instituição e permissões de usuários.</p>
        </div>

        <div className="flex bg-white p-1.5 rounded-2xl border border-slate-100 shadow-sm">
          <button 
            onClick={() => setActiveTab('institution')}
            className={cn(
              "px-6 py-2.5 rounded-xl text-sm font-black uppercase tracking-wider transition-all flex items-center gap-2",
              activeTab === 'institution' ? "bg-[#00174b] text-white shadow-lg" : "text-slate-400 hover:text-slate-600"
            )}
          >
            <Building2 size={18} />
            Instituição
          </button>
          <button 
            onClick={() => setActiveTab('users')}
            className={cn(
              "px-6 py-2.5 rounded-xl text-sm font-black uppercase tracking-wider transition-all flex items-center gap-2",
              activeTab === 'users' ? "bg-[#00174b] text-white shadow-lg" : "text-slate-400 hover:text-slate-600"
            )}
          >
            <Users size={18} />
            Usuários
          </button>
          <button 
            onClick={() => setActiveTab('profile')}
            className={cn(
              "px-6 py-2.5 rounded-xl text-sm font-black uppercase tracking-wider transition-all flex items-center gap-2",
              activeTab === 'profile' ? "bg-[#00174b] text-white shadow-lg" : "text-slate-400 hover:text-slate-600"
            )}
          >
            <User size={18} />
            Meu Perfil
          </button>
          <button 
            onClick={() => setActiveTab('maintenance')}
            className={cn(
              "px-6 py-2.5 rounded-xl text-sm font-black uppercase tracking-wider transition-all flex items-center gap-2",
              activeTab === 'maintenance' ? "bg-red-600 text-white shadow-lg shadow-red-100" : "text-slate-400 hover:text-slate-600"
            )}
          >
            <Database size={18} />
            Manutenção
          </button>
        </div>
      </header>

      {notification && (
        <div className={cn(
          "fixed top-6 right-6 z-[200] px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-4 duration-300",
          notification.type === 'success' ? "bg-green-600 text-white" : "bg-red-600 text-white"
        )}>
          {notification.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
          <p className="font-bold text-sm tracking-tight">{notification.message}</p>
          <button onClick={() => setNotification(null)} className="ml-2 opacity-70 hover:opacity-100">
            <X size={16} />
          </button>
        </div>
      )}

      {activeTab === 'institution' ? (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <form onSubmit={handleSaveInstitution} className="p-8 md:p-10 space-y-10">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-12 gap-y-10">
              {/* Identificação Section */}
              <div className="space-y-6">
                <h3 className="text-lg font-black text-[#00174b] flex items-center gap-3 border-b border-slate-50 pb-4">
                  <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                    <Building2 size={18} />
                  </div>
                  Identificação da Instituição
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="md:col-span-2 space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nome da Instituição</label>
                    <input 
                      type="text"
                      value={institution.name}
                      onChange={(e) => setInstitution({...institution, name: e.target.value})}
                      className="w-full px-5 py-3 bg-slate-50 border border-transparent rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:bg-white focus:border-blue-200 transition-all font-bold text-[#00174b] text-sm"
                      placeholder="Ex: Escola ESCMIN"
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">CNPJ</label>
                    <input 
                      type="text"
                      value={institution.cnpj}
                      onChange={(e) => setInstitution({...institution, cnpj: formatCNPJ(e.target.value)})}
                      className="w-full px-5 py-3 bg-slate-50 border border-transparent rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:bg-white focus:border-blue-200 transition-all font-bold text-[#00174b] text-sm"
                      placeholder="00.000.000/0000-00"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Website</label>
                    <input 
                      type="text"
                      value={institution.website}
                      onChange={(e) => setInstitution({...institution, website: e.target.value})}
                      className="w-full px-5 py-3 bg-slate-50 border border-transparent rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:bg-white focus:border-blue-200 transition-all font-bold text-[#00174b] text-sm"
                      placeholder="www.escola.com.br"
                    />
                  </div>
                </div>
              </div>

              {/* Contato Section */}
              <div className="space-y-6">
                <h3 className="text-lg font-black text-[#00174b] flex items-center gap-3 border-b border-slate-50 pb-4">
                  <div className="w-9 h-9 rounded-lg bg-green-50 text-green-600 flex items-center justify-center">
                    <MapPin size={18} />
                  </div>
                  Contato & Endereço
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="md:col-span-2 space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Endereço Completo</label>
                    <input 
                      type="text"
                      value={institution.address}
                      onChange={(e) => setInstitution({...institution, address: e.target.value})}
                      className="w-full px-5 py-3 bg-slate-50 border border-transparent rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:bg-white focus:border-blue-200 transition-all font-bold text-[#00174b] text-sm"
                      placeholder="Rua, Número, Bairro, Cidade - UF"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Telefone</label>
                    <input 
                      type="text"
                      value={institution.phone}
                      onChange={(e) => setInstitution({...institution, phone: formatPhone(e.target.value)})}
                      className="w-full px-5 py-3 bg-slate-50 border border-transparent rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:bg-white focus:border-blue-200 transition-all font-bold text-[#00174b] text-sm"
                      placeholder="(00) 00000-0000"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">E-mail</label>
                    <input 
                      type="email"
                      value={institution.email}
                      onChange={(e) => setInstitution({...institution, email: e.target.value})}
                      className="w-full px-5 py-3 bg-slate-50 border border-transparent rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:bg-white focus:border-blue-200 transition-all font-bold text-[#00174b] text-sm"
                      placeholder="contato@escola.com"
                    />
                  </div>
                </div>
              </div>

              {/* Visual Section */}
              <div className="lg:col-span-2 space-y-6">
                <h3 className="text-lg font-black text-[#00174b] flex items-center gap-3 border-b border-slate-50 pb-4">
                  <div className="w-9 h-9 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
                    <Globe size={18} />
                  </div>
                  Identidade Visual & Rodapé
                </h3>
                
                <div className="p-4 bg-amber-50 border border-amber-100 rounded-xl mb-4">
                  <p className="text-[10px] text-amber-800 font-bold flex items-center gap-2 uppercase tracking-wider">
                    <AlertCircle size={14} />
                    Dica: Se o upload falhar, execute o SQL de "Configuração de Storage" no Supabase.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-5">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">URL da Logo</label>
                      <div className="flex gap-2">
                        <input 
                          type="text"
                          value={institution.logo_url}
                          onChange={(e) => setInstitution({...institution, logo_url: e.target.value})}
                          className="flex-1 px-5 py-3 bg-slate-50 border border-transparent rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:bg-white focus:border-blue-200 transition-all font-bold text-[#00174b] text-sm"
                          placeholder="https://link-da-imagem.png"
                        />
                        <label className="cursor-pointer px-4 py-3 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-100 transition-all flex items-center justify-center" title="Upload Logo">
                          {uploadingLogo ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}
                          <input type="file" className="hidden" accept="image/*" onChange={handleLogoUpload} disabled={uploadingLogo} />
                        </label>
                        {institution.logo_url && (
                          <button 
                            type="button"
                            onClick={() => setInstitution({...institution, logo_url: ''})}
                            className="px-4 py-3 bg-red-50 text-red-600 rounded-xl hover:bg-red-100 transition-all flex items-center justify-center"
                            title="Remover Logo"
                          >
                            <Trash2 size={18} />
                          </button>
                        )}
                      </div>
                    </div>
                    {institution.logo_url && (
                      <div className="p-4 bg-slate-50 rounded-xl border border-dashed border-slate-200 flex items-center justify-center relative group">
                        <img src={institution.logo_url} alt="Preview" className="h-16 object-contain" referrerPolicy="no-referrer" />
                      </div>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center ml-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Observação / Mensagem do Recibo</label>
                      <span className={cn(
                        "text-[10px] font-bold transition-colors",
                        (institution.receipt_message?.length || 0) >= 280 ? "text-amber-500" : "text-slate-300"
                      )}>
                        {institution.receipt_message?.length || 0} / 300 Caracteres
                      </span>
                    </div>
                    <textarea 
                      value={institution.receipt_message}
                      onChange={(e) => setInstitution({...institution, receipt_message: e.target.value.substring(0, 300)})}
                      className="w-full px-5 py-3 bg-slate-50 border border-transparent rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:bg-white focus:border-blue-200 transition-all font-bold text-[#00174b] text-sm min-h-[110px] resize-none"
                      placeholder="Ex: 'Mensalidade paga com sucesso. Paz e Bem!'"
                      maxLength={300}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Texto do Rodapé (Relatórios)</label>
                    <textarea 
                      value={institution.footer_text}
                      onChange={(e) => setInstitution({...institution, footer_text: e.target.value})}
                      className="w-full px-5 py-3 bg-slate-50 border border-transparent rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:bg-white focus:border-blue-200 transition-all font-bold text-[#00174b] text-sm min-h-[110px] resize-none"
                      placeholder="Texto que aparecerá no rodapé dos documentos..."
                    />
                  </div>
                </div>

                {/* Document Preview Mockup */}
                <div className="mt-10 p-8 bg-slate-50 rounded-3xl border border-slate-100">
                  <div className="flex items-center gap-2 mb-6">
                    <Layout size={16} className="text-blue-600" />
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Pré-visualização em Documentos (Cabeçalho)</span>
                  </div>
                  
                  <div className="bg-white p-10 rounded-xl shadow-sm border border-slate-200 min-h-[200px] flex flex-col">
                    <div className="flex items-center gap-6 border-b-2 border-[#00174b] pb-6">
                      <div className="w-20 h-20 bg-slate-50 rounded-lg flex items-center justify-center border border-slate-100 overflow-hidden shrink-0">
                        {institution.logo_url ? (
                          <img src={institution.logo_url} alt="Logo" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
                        ) : (
                          <Building2 size={32} className="text-slate-200" />
                        )}
                      </div>
                      <div className="flex-1">
                        <h4 className="text-xl font-black text-[#00174b] uppercase leading-tight">{institution.name || 'NOME DA INSTITUIÇÃO'}</h4>
                        <p className="text-[10px] font-medium text-slate-500 mt-1 uppercase tracking-wide">{institution.address || 'Endereço não informado'}</p>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
                           {institution.cnpj && <span className="text-[9px] font-bold text-slate-400 uppercase">CNPJ: {institution.cnpj}</span>}
                           {institution.phone && <span className="text-[9px] font-bold text-slate-400 uppercase">TEL: {institution.phone}</span>}
                           {institution.email && <span className="text-[9px] font-bold text-slate-400 uppercase">EMAIL: {institution.email}</span>}
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex-1 py-10 flex items-center justify-center border-b border-dashed border-slate-100">
                      <div className="text-center space-y-2 opacity-20 select-none">
                        <FileText size={48} className="mx-auto" />
                        <p className="text-sm font-bold uppercase tracking-[0.2em]">Corpo do Relatório</p>
                      </div>
                    </div>

                    <div className="pt-6 text-center">
                      <p className="text-[9px] font-bold text-slate-300 uppercase tracking-widest leading-relaxed">
                        {institution.footer_text || 'O texto do rodapé configurado acima aparecerá aqui.'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-8 border-t border-slate-100 flex justify-end">
              <button 
                type="submit"
                disabled={saving}
                className="px-10 py-4 bg-[#00174b] text-white rounded-xl font-black flex items-center gap-3 hover:bg-blue-900 transition-all shadow-xl active:scale-95 disabled:opacity-50"
              >
                {saving ? <Loader2 size={20} className="animate-spin" /> : <Save size={20} />}
                Salvar Alterações
              </button>
            </div>
          </form>
        </div>
      ) : activeTab === 'users' ? (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h3 className="text-2xl font-black text-[#00174b]">Gestão de Usuários</h3>
            <button 
              onClick={() => {
                setSelectedUser(null);
                setUserFormData({ role: 'secretario', status: 'pending' });
                setShowUserModal(true);
              }}
              className="px-6 py-3 bg-[#00174b] text-white rounded-2xl font-bold flex items-center gap-2 hover:shadow-xl transition-all active:scale-95"
            >
              <Plus size={20} />
              Novo Usuário
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {users.map((user) => (
              <UserCard 
                key={user.id} 
                user={user} 
                onEdit={handleEditUser} 
                onDelete={handleDeleteUserClick} 
              />
            ))}
          </div>
        </div>
      ) : activeTab === 'maintenance' ? (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="bg-red-50 border border-red-100 p-8 rounded-3xl flex flex-col md:flex-row items-center gap-6">
            <div className="w-16 h-16 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center shrink-0">
              <AlertTriangle size={32} />
            </div>
            <div>
              <h3 className="text-xl font-black text-red-900">Área de Risco & Manutenção</h3>
              <p className="text-red-700 font-medium text-sm mt-1">
                As ferramentas abaixo executam ações em massa no banco de dados. 
                Certifique-se de ter certeza antes de prosseguir, pois os dados excluídos não podem ser recuperados.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-8 space-y-6">
              <h4 className="text-lg font-black text-[#00174b] flex items-center gap-2">
                <RefreshCw size={20} className="text-blue-500" />
                Limpeza de Integridade
              </h4>
              <p className="text-slate-500 text-sm">Remova inconsistências e dados duplicados causados por importações falhas.</p>
              
              <div className="space-y-3 pt-4">
                <button 
                  onClick={handleSchemaCheckup}
                  disabled={checkingSchema}
                  className="w-full p-4 bg-blue-50 border border-blue-100 rounded-2xl flex items-center justify-between group hover:bg-blue-600 hover:text-white transition-all text-left active:scale-[0.98]"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-white border border-slate-100 flex items-center justify-center group-hover:bg-blue-500 group-hover:text-white transition-all shadow-sm">
                      <Shield size={18} />
                    </div>
                    <div>
                      <p className="text-sm font-black text-[#00174b]">Sincronizar Schema (Checkup)</p>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                        Verificar se faltam colunas nas tabelas do Supabase
                      </p>
                    </div>
                  </div>
                  {checkingSchema ? <Loader2 size={18} className="animate-spin text-blue-300" /> : <RefreshCw size={18} className="text-blue-300" />}
                </button>

                <button 
                  onClick={handleCleanDuplicates}
                  disabled={loading}
                  className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl flex items-center justify-between group hover:bg-blue-50 hover:border-blue-100 transition-all text-left active:scale-[0.98]"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-white border border-slate-100 flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-all shadow-sm">
                      <Search size={18} />
                    </div>
                    <div>
                      <p className="text-sm font-black text-[#00174b]">Detectar & Limpar Duplicatas de Alunos</p>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                        {counts.students > 0 ? `${counts.students} alunos totais cadastrados` : 'Buscando contagem...'}
                      </p>
                    </div>
                  </div>
                  {loading ? <Loader2 size={18} className="animate-spin text-slate-300" /> : <Eraser size={18} className="text-slate-300" />}
                </button>

                <button 
                  onClick={handleInactivateOldStudents}
                  disabled={loading}
                  className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl flex items-center justify-between group hover:bg-amber-50 hover:border-amber-100 transition-all text-left active:scale-[0.98]"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-white border border-slate-100 flex items-center justify-center group-hover:bg-amber-500 group-hover:text-white transition-all shadow-sm">
                      <Database size={18} />
                    </div>
                    <div>
                      <p className="text-sm font-black text-[#00174b]">Inativar Alunos Antigos (&lt; 2023)</p>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                        Mudar status para Inativo de matrículas anteriores a 2023
                      </p>
                    </div>
                  </div>
                  {loading ? <Loader2 size={18} className="animate-spin text-slate-300" /> : <Database size={18} className="text-slate-300" />}
                </button>

                <button 
                  onClick={handleActivateRecentStudents}
                  disabled={loading}
                  className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl flex items-center justify-between group hover:bg-green-50 hover:border-green-100 transition-all text-left active:scale-[0.98]"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-white border border-slate-100 flex items-center justify-center group-hover:bg-green-600 group-hover:text-white transition-all shadow-sm">
                      <UserCheck size={18} />
                    </div>
                    <div>
                      <p className="text-sm font-black text-[#00174b]">Ativar Alunos Recentes (&gt; 2023)</p>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                        Corrigir status para Ativo de alunos matriculados após 2023
                      </p>
                    </div>
                  </div>
                  {loading ? <Loader2 size={18} className="animate-spin text-slate-300" /> : <Check size={18} className="text-slate-300" />}
                </button>

                <button 
                  onClick={handleInactivateOldClasses}
                  disabled={loading}
                  className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl flex items-center justify-between group hover:bg-amber-50 hover:border-amber-100 transition-all text-left active:scale-[0.98]"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-white border border-slate-100 flex items-center justify-center group-hover:bg-amber-500 group-hover:text-white transition-all shadow-sm">
                      <School size={18} />
                    </div>
                    <div>
                      <p className="text-sm font-black text-[#00174b]">Inativar Turmas Antigas (&lt; 2023)</p>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                        Mudar status para Inativo de turmas anteriores a 2023
                      </p>
                    </div>
                  </div>
                  {loading ? <Loader2 size={18} className="animate-spin text-slate-300" /> : <Database size={18} className="text-slate-300" />}
                </button>
              </div>
            </div>

            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-8 space-y-6">
              <h4 className="text-lg font-black text-[#00174b] flex items-center gap-2">
                <Trash2 size={20} className="text-red-500" />
                Exclusão em Massa
              </h4>
              <p className="text-slate-500 text-sm">Zere módulos específicos do sistema para reiniciar o processo de importação.</p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                {[
                  { id: 'students', label: 'Alunos' },
                  { id: 'teachers', label: 'Professores' },
                  { id: 'classes', label: 'Turmas' },
                  { id: 'subjects', label: 'Disciplinas' }
                ].map((mod) => (
                  <button
                    key={mod.id}
                    onClick={() => handleClearModule(mod.id, mod.label)}
                    disabled={loading}
                    className="p-4 bg-red-50 text-red-600 rounded-2xl font-bold text-xs uppercase tracking-wider hover:bg-red-600 hover:text-white transition-all flex flex-col items-center justify-center gap-1 disabled:opacity-50 active:scale-[0.98]"
                  >
                    <div className="flex items-center gap-2">
                      <Trash2 size={14} />
                      Zerar {mod.label}
                    </div>
                    <span className="text-[9px] opacity-70">
                      {counts[mod.id] || 0} registros
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {schemaReport && (
            <div className="mt-8 bg-white rounded-3xl border border-slate-100 shadow-xl overflow-hidden animate-in fade-in zoom-in duration-300">
              <div className="p-8 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-lg shadow-blue-200">
                    <Terminal size={24} />
                  </div>
                  <div>
                    <h4 className="text-xl font-black text-[#00174b]">Resultado do Diagnóstico de Schema</h4>
                    <p className="text-sm text-slate-500 font-medium tracking-tight">Comparação entre os formulários da tela e as tabelas do banco de dados.</p>
                  </div>
                </div>
                <button 
                  onClick={() => setSchemaReport(null)}
                  className="p-3 text-slate-400 hover:bg-red-50 hover:text-red-500 rounded-xl transition-all"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="p-8 space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {Object.entries(schemaReport).map(([table, info]: [any, any]) => (
                    <div key={table} className={cn(
                      "p-5 rounded-2xl border transition-all",
                      info.status === 'ok' ? "bg-emerald-50/30 border-emerald-100" : 
                      info.status === 'incomplete' ? "bg-amber-50/30 border-amber-100" : 
                      "bg-red-50/30 border-red-100"
                    )}>
                      <div className="flex justify-between items-start mb-3">
                        <h5 className="font-black text-[#00174b] uppercase text-xs tracking-tight">{table}</h5>
                        {info.status === 'ok' ? (
                          <CheckCircle2 size={16} className="text-emerald-500" />
                        ) : info.status === 'incomplete' ? (
                          <AlertCircle size={16} className="text-amber-500" />
                        ) : (
                          <AlertTriangle size={16} className="text-red-500" />
                        )}
                      </div>
                      
                      {info.status === 'incomplete' ? (
                        <div className="space-y-2">
                          <p className="text-[10px] font-black text-amber-700 uppercase tracking-widest">Colunas Faltantes:</p>
                          <div className="flex flex-wrap gap-1">
                            {info.missing.map((m: string) => (
                              <span key={m} className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-md text-[9px] font-bold">{m}</span>
                            ))}
                          </div>
                        </div>
                      ) : info.status === 'ok' ? (
                        <p className="text-[10px] font-bold text-emerald-600">Schema sincronizado.</p>
                      ) : (
                        <p className="text-[10px] font-bold text-red-600 truncate" title={info.message}>{info.message}</p>
                      )}
                    </div>
                  ))}
                </div>

                {fixSql && (
                  <div className="space-y-4">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div>
                        <h5 className="font-black text-[#00174b] flex items-center gap-2">
                          <Plus size={16} />
                          Ajuste de Schema Necessário
                        </h5>
                        <p className="text-sm text-slate-500 font-medium">Copie o SQL abaixo e execute no **Painel SQL** do seu painel Supabase.</p>
                      </div>
                      <button 
                        onClick={() => copyToClipboard(fixSql)}
                        className="px-6 py-3 bg-[#00174b] text-white rounded-xl font-bold flex items-center gap-2 hover:bg-blue-900 transition-all shadow-lg active:scale-95"
                      >
                        <Copy size={18} />
                        Copiar SQL de Correção
                      </button>
                    </div>

                    <div className="bg-slate-900 rounded-2xl p-6 overflow-hidden">
                      <pre className="text-emerald-400 font-mono text-sm leading-relaxed overflow-x-auto whitespace-pre-wrap">
                        {fixSql}
                      </pre>
                    </div>

                    <div className="p-6 bg-blue-50/50 border border-blue-100 rounded-2xl flex items-start gap-4">
                      <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center shrink-0 mt-1">
                        <Globe size={18} />
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-black text-blue-900">Como aplicar?</p>
                        <ul className="text-xs text-blue-800 font-medium space-y-1.5 list-disc pl-4 leading-relaxed">
                          <li>Acesse o painel do **Supabase**.</li>
                          <li>Vá na lateral esquerda em **"SQL Editor"**.</li>
                          <li>Clique em **"+ New Query"**.</li>
                          <li>Cole o código acima e clique em **"Run"**.</li>
                          <li>Após executar, retorne aqui e faça o Checkup novamente para confirmar.</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm overflow-hidden max-w-2xl mx-auto">
          <div className="p-8 md:p-10">
            <h3 className="text-xl font-black text-[#00174b] mb-8 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                <User size={20} />
              </div>
              Meu Perfil
            </h3>

            <form onSubmit={handleSaveMyProfile} className="space-y-6">
              <div className="flex flex-col items-center mb-8">
                <div className="relative group">
                  <div className="w-32 h-32 rounded-2xl bg-slate-50 border-4 border-white shadow-xl overflow-hidden flex items-center justify-center">
                    {myProfile.avatar_url ? (
                      <img src={myProfile.avatar_url} alt="Avatar" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <User size={48} className="text-slate-200" />
                    )}
                  </div>
                  <label className="absolute bottom-0 right-0 p-3 bg-[#00174b] text-white rounded-2xl shadow-lg cursor-pointer hover:scale-110 transition-all">
                    {uploadingMyAvatar ? <Loader2 size={20} className="animate-spin" /> : <Camera size={20} />}
                    <input type="file" className="hidden" accept="image/*" onChange={handleMyAvatarUpload} disabled={uploadingMyAvatar} />
                  </label>
                </div>
                <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-4">Foto de Perfil</p>
              </div>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nome Completo</label>
                  <input 
                    type="text"
                    value={myProfile.full_name}
                    onChange={(e) => setMyProfile({...myProfile, full_name: e.target.value})}
                    className="w-full px-5 py-3 bg-slate-50 border border-transparent rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:bg-white focus:border-blue-200 transition-all font-bold text-[#00174b] text-sm"
                    placeholder="Seu nome"
                    required
                  />
                </div>
                <div className="space-y-1.5 opacity-60">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">E-mail (Não alterável)</label>
                  <input 
                    type="email"
                    value={myProfile.email}
                    disabled
                    className="w-full px-5 py-3 bg-slate-100 border border-transparent rounded-xl font-bold text-slate-500 text-sm cursor-not-allowed"
                  />
                </div>
              </div>

              <button 
                type="submit"
                disabled={saving}
                className="w-full py-4 bg-[#00174b] text-white rounded-2xl font-black uppercase tracking-widest text-sm hover:bg-blue-900 transition-all shadow-xl shadow-blue-900/10 flex items-center justify-center gap-3 disabled:opacity-50 active:scale-[0.98]"
              >
                {saving ? <Loader2 size={20} className="animate-spin" /> : <Save size={20} />}
                Atualizar Perfil
              </button>
            </form>
          </div>
        </div>
      )}

      {/* User Modal */}
      {showUserModal && (
        <div className="fixed inset-0 bg-[#00174b]/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-lg shadow-blue-200">
                  <User size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-black text-[#00174b]">{selectedUser ? 'Editar Usuário' : 'Novo Usuário'}</h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Controle de acesso ao sistema</p>
                </div>
              </div>
              <button onClick={() => setShowUserModal(false)} className="p-2 text-slate-400 hover:text-red-500 transition-all">
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleSaveUser} className="p-8 space-y-5">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nome Completo</label>
                <input 
                  type="text"
                  value={userFormData.full_name}
                  onChange={(e) => setUserFormData({...userFormData, full_name: e.target.value})}
                  className="w-full px-5 py-3 bg-slate-50 border border-transparent rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:bg-white focus:border-blue-200 transition-all font-bold text-[#00174b] text-sm"
                  placeholder="Nome do colaborador"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Usuário de Acesso</label>
                <input 
                  type="text"
                  value={userFormData.username}
                  onChange={(e) => setUserFormData({...userFormData, username: e.target.value})}
                  className="w-full px-5 py-3 bg-slate-50 border border-transparent rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:bg-white focus:border-blue-200 transition-all font-bold text-[#00174b] text-sm"
                  placeholder="Ex: joao.silva"
                  required
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Perfil de Acesso</label>
                  <select 
                    value={userFormData.role}
                    onChange={(e) => setUserFormData({...userFormData, role: e.target.value as any})}
                    className="w-full px-5 py-3 bg-slate-50 border border-transparent rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:bg-white focus:border-blue-200 transition-all font-bold text-[#00174b] text-sm"
                  >
                    <option value="admin">Administrador</option>
                    <option value="coordenador">Coordenador</option>
                    <option value="secretario">Secretário</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">URL do Avatar</label>
                  <div className="flex gap-2">
                    <input 
                      type="text"
                      value={userFormData.avatar_url}
                      onChange={(e) => setUserFormData({...userFormData, avatar_url: e.target.value})}
                      className="flex-1 px-5 py-3 bg-slate-50 border border-transparent rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:bg-white focus:border-blue-200 transition-all font-bold text-[#00174b] text-sm"
                      placeholder="https://imagem.jpg"
                    />
                    <label className="cursor-pointer px-4 py-3 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-100 transition-all flex items-center justify-center" title="Upload Avatar">
                      {uploadingAvatar ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}
                      <input type="file" className="hidden" accept="image/*" onChange={handleAvatarUpload} disabled={uploadingAvatar} />
                    </label>
                    {userFormData.avatar_url && (
                      <button 
                        type="button"
                        onClick={() => setUserFormData({...userFormData, avatar_url: ''})}
                        className="px-4 py-3 bg-red-50 text-red-600 rounded-xl hover:bg-red-100 transition-all flex items-center justify-center"
                        title="Remover Avatar"
                      >
                        <Trash2 size={18} />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="pt-6 flex gap-3">
                <button 
                  type="button"
                  onClick={() => setShowUserModal(false)}
                  className="flex-1 py-3.5 border border-slate-200 text-slate-600 rounded-xl font-bold hover:bg-slate-50 transition-all"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  disabled={saving}
                  className="flex-1 py-3.5 bg-[#00174b] text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-blue-900 transition-all disabled:opacity-50"
                >
                  {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                  Salvar Usuário
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {showConfirmModal.show && (
        <div className="fixed inset-0 bg-[#00174b]/60 backdrop-blur-md z-[300] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-300">
            <div className="p-8 text-center space-y-4">
              <div className={cn(
                "w-20 h-20 rounded-full mx-auto flex items-center justify-center animate-bounce",
                showConfirmModal.type === 'danger' ? "bg-red-50 text-red-600" : "bg-amber-50 text-amber-600"
              )}>
                <AlertTriangle size={40} />
              </div>
              
              <div className="space-y-2">
                <h3 className="text-2xl font-black text-[#00174b] tracking-tight">
                  {showConfirmModal.title}
                </h3>
                <p className="text-slate-500 font-medium leading-relaxed">
                  {showConfirmModal.message}
                </p>
              </div>

              <div className="pt-6 flex flex-col gap-3">
                <button 
                  onClick={showConfirmModal.onConfirm}
                  disabled={loading}
                  className={cn(
                    "w-full py-4 rounded-2xl font-black uppercase tracking-widest text-sm shadow-xl transition-all active:scale-95 flex items-center justify-center gap-3",
                    showConfirmModal.type === 'danger' ? "bg-red-600 text-white hover:bg-red-700" : "bg-blue-600 text-white hover:bg-blue-700"
                  )}
                >
                  {loading ? <Loader2 size={20} className="animate-spin" /> : <Trash2 size={20} />}
                  Confirmar Ação
                </button>
                <button 
                  onClick={() => setShowConfirmModal(prev => ({ ...prev, show: false }))}
                  disabled={loading}
                  className="w-full py-4 bg-slate-50 text-slate-400 rounded-2xl font-black uppercase tracking-widest text-sm hover:bg-slate-100 transition-all"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
