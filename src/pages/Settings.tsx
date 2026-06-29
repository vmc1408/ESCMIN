import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { 
  Building2, 
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
  MessageCircle,
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
  Terminal,
  Key,
  Info,
  ArrowUpRight
} from 'lucide-react';
import { fetchCount, uploadImage, saveData, fetchAll, getInstitutionSettings, saveBatch } from '../lib/database';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { Student, Class, InstitutionSettings, UserProfile, AcademicParameters } from '../types';
import { cn } from '../lib/utils';
import { financialService } from '../services/financialService';
import { schemaService } from '../services/schemaService';
import { useAuth } from '../contexts/AuthContext';
import { useLocation } from 'react-router-dom';
import { BackupSection } from '../components/BackupSection';





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
  const location = useLocation();
  const [activeTab, setActiveTab] = useState<'institution' | 'maintenance' | 'academic' | 'security' | 'backup'>(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab');
    if (tab === 'backup' || tab === 'institution' || tab === 'maintenance' || tab === 'academic' || tab === 'security') {
      return tab;
    }
    return 'institution';
  });

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tab = params.get('tab');
    if (tab && (tab === 'backup' || tab === 'institution' || tab === 'maintenance' || tab === 'academic' || tab === 'security')) {
      setActiveTab(tab);
    }
  }, [location.search]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error', message: string } | null>(null);

  // Security State
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [currentPin, setCurrentPin] = useState('');
  const [savingPin, setSavingPin] = useState(false);
  const [lockTimeoutMinutes, setLockTimeoutMinutes] = useState(5);
  const [localLockEnabled, setLocalLockEnabled] = useState(true);

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
    receipt_message: '',
    secretary: '',
    cep: '',
    city_uf: '',
    subtitle: ''
  });

  // Academic Parameters State
  const [academicParams, setAcademicParams] = useState<AcademicParameters>({
    approval_grade: 7.0,
    recovery_grade: 5.0,
    failure_grade: 4.9,
    absence_limit_percentage: 25,
    updated_at: new Date().toISOString()
  });

  const handleUpdatePin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.id) return;

    if (newPin.length !== 4 || !/^\d+$/.test(newPin)) {
      setNotification({ type: 'error', message: 'O PIN deve ter 4 números.' });
      return;
    }

    if (newPin !== confirmPin) {
      setNotification({ type: 'error', message: 'Os PINs não conferem.' });
      return;
    }

    try {
      setSavingPin(true);
      await saveData('users', profile.id, { ...profile, pin: newPin });
      await refreshProfile();
      setNewPin('');
      setConfirmPin('');
      setNotification({ type: 'success', message: 'PIN atualizado com sucesso!' });
    } catch (err: any) {
      setNotification({ type: 'error', message: 'Erro ao salvar PIN: ' + err.message });
    } finally {
      setSavingPin(false);
      setTimeout(() => setNotification(null), 3000);
    }
  };

  const { user, profile, refreshProfile, isLockEnabled, lockTimeout, updateLockSettings } = useAuth();

  useEffect(() => {
    if (lockTimeout !== undefined) {
      setLockTimeoutMinutes(Math.floor(lockTimeout / 60));
    }
    if (isLockEnabled !== undefined) {
      setLocalLockEnabled(isLockEnabled);
    }
  }, [lockTimeout, isLockEnabled]);

  const [uploadingLogo, setUploadingLogo] = useState(false);

  // Maintenance State
  const [counts, setCounts] = useState<Record<string, number>>({
    students: 0,
    teachers: 0,
    classes: 0,
    subjects: 0
  });
  const [inactiveCounts, setInactiveCounts] = useState<Record<string, number>>({
    students: 0,
    teachers: 0,
    classes: 0,
    subjects: 0
  });
  const [schemaReport, setSchemaReport] = useState<any>(null);
  const [fixSql, setFixSql] = useState<string>('');
  const [checkingSchema, setCheckingSchema] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isCleaningStudents, setIsCleaningStudents] = useState(false);
  const [syncProgress, setSyncProgress] = useState<{
    currentCol: string;
    completed: string[];
    failed: string[];
    totalSynced: number;
    totalFailed: number;
  }>({
    currentCol: '',
    completed: [],
    failed: [],
    totalSynced: 0,
    totalFailed: 0
  });
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

  const handleInactivateStudentsWithoutClass = async () => {
    setShowConfirmModal({
      show: true,
      title: 'Inativar Alunos Sem Turma',
      message: 'Esta ação irá alterar o status de todos os alunos que não possuem uma turma vinculada para "Inativo". Deseja continuar?',
      type: 'warning',
      onConfirm: async () => {
        try {
          setIsCleaningStudents(true);
          setShowConfirmModal(prev => ({ ...prev, show: false }));
          
          const [students, enrollments] = await Promise.all([
            fetchAll('students'),
            fetchAll('enrollments')
          ]);

          const toUpdate = students
            .filter(s => {
              const hasNoLegacyClass = !s.class_id || 
                               s.class_id.toString().trim() === '' || 
                               s.class_id === 'null' ||
                               s.class_id === 'undefined';
              
              const hasNoEnrollments = !enrollments.some(e => e.student_id === s.id && e.status === 'Ativo');
              
              const isNotAlreadyInactive = s.status !== 'Inativo';
              return hasNoLegacyClass && hasNoEnrollments && isNotAlreadyInactive;
            })
            .map(s => ({ ...s, status: 'Inativo' }));

          if (toUpdate.length === 0) {
            setNotification({ type: 'success', message: 'Todos os alunos sem turma já estão inativos!' });
            return;
          }

          await saveBatch('students', toUpdate);
          setNotification({ type: 'success', message: `${toUpdate.length} alunos foram inativados.` });
          fetchCounts();
        } catch (error: any) {
          console.error('Error inactivating students:', error);
          setNotification({ type: 'error', message: 'Erro ao inativar alunos: ' + error.message });
        } finally {
          setIsCleaningStudents(false);
          setTimeout(() => setNotification(null), 3000);
        }
      }
    });
  };

  const handleSyncSupabase = async () => {
    try {
      setIsSyncing(true);
      const collectionsToSync = [
        'institution_settings',
        'users', 
        'email_registry', 
        'foraries',            
        'parishes',            
        'clergy_leity',        
        'subjects',
        'teachers',
        'classes',             
        'students',            
        'attendances',         
        'grades',             
        'calendar_events',     
        'contributions',       
        'pix_reconciliations', 
        'certificates',
        'assessments'         
      ];

      setSyncProgress({
        currentCol: '',
        completed: [],
        failed: [],
        totalSynced: 0,
        totalFailed: 0
      });

      let totalSynced = 0;
      let totalFailed = 0;

      for (let i = 0; i < collectionsToSync.length; i++) {
        const col = collectionsToSync[i];
        setSyncProgress(prev => ({ ...prev, currentCol: col }));

        try {
          const items = await fetchAll(col) as any[];
          
          if (items && items.length > 0) {
            const chunkSize = 20;
            for (let j = 0; j < items.length; j += chunkSize) {
              const chunk = items.slice(j, j + chunkSize);
              
              await Promise.all(chunk.map(async (item) => {
                const cleanItem: any = {};
                try {
                  const baseFields = ['id', 'created_at', 'updated_at', 'user_id', 'status'];
                  const whitelist: Record<string, string[]> = {
                    institution_settings: ['id', 'name', 'cnpj', 'address', 'phone', 'email', 'website', 'logo_url', 'footer_text', 'receipt_message', 'secretary', 'cep', 'city_uf', 'subtitle', 'phone_is_whatsapp', 'updated_at'],
                    users: [...baseFields, 'email', 'full_name', 'avatar_url', 'role'],
                    email_registry: ['id', 'email', 'role', 'status', 'metadata', 'created_at'],
                    foraries: [...baseFields, 'code', 'name', 'priest_name'],
                    parishes: [...baseFields, 'code', 'name', 'forania_id', 'priest_id', 'priest_name', 'address_street', 'address_number', 'address_neighborhood', 'address_city', 'address_zip', 'email', 'phone'],
                    clergy_leity: [...baseFields, 'code', 'name', 'address', 'phone_mobile', 'phone_whatsapp', 'email', 'parish_id', 'role'],
                    subjects: [...baseFields, 'code', 'name', 'program_content'],
                    classes: [...baseFields, 'code', 'name', 'room', 'period', 'days_of_week', 'semester', 'start_date', 'observations'],
                    students: [...baseFields, 'registration_number', 'name', 'cpf', 'rg', 'birth_date', 'start_date', 'is_former_student', 'class_id', 'parish_id', 'address_street', 'address_city', 'address_state', 'address_neighborhood', 'address_zip', 'parish', 'forania', 'course', 'pastoral_participates', 'phone_mobile', 'phone_mobile_is_whatsapp', 'phone_residential', 'phone_commercial', 'email', 'guardian_father', 'guardian_mother', 'guardian_cpf', 'photo_url'],
                    teachers: [...baseFields, 'code', 'name', 'email', 'phone', 'phone_mobile', 'cpf', 'rg', 'address_street', 'address_city', 'address_state', 'address_zip', 'birth_date', 'observations'],
                    attendances: ['id', 'student_id', 'class_id', 'subject_id', 'date', 'status', 'observations', 'user_id', 'created_at'],
                    grades: ['id', 'student_id', 'class_id', 'subject_id', 'period', 'value', 'status', 'user_id', 'created_at'],
                    calendar_events: ['id', 'title', 'description', 'start_date', 'end_date', 'type', 'class_id', 'subject_id', 'user_id', 'created_at'],
                    contributions: ['id', 'student_id', 'amount', 'reference_month', 'reference_year', 'payment_date', 'payment_method', 'origin', 'pix_id', 'observations', 'user_id', 'created_at'],
                    pix_reconciliations: ['id', 'date', 'payer_name', 'origin_bank', 'amount', 'transaction_id', 'batch_id', 'status', 'matched_student_id', 'is_manual', 'created_at'],
                    certificates: ['id', 'student_id', 'type', 'issuance_date', 'course', 'verification_code', 'user_id', 'created_at'],
                    assessments: ['id', 'title', 'date', 'weight', 'period', 'class_id', 'subject_id', 'description', 'user_id', 'created_at']
                  };

                  const allowedFields = whitelist[col] || null;

                  Object.keys(item).forEach(key => {
                    if (key !== 'id' && (!allowedFields || allowedFields.includes(key))) {
                      if (key.endsWith('_id') && item[key] === '') {
                        cleanItem[key] = null;
                      } else {
                        cleanItem[key] = item[key];
                      }
                    }
                  });

                  await saveData(col, item.id, cleanItem);
                  totalSynced++;
                  setSyncProgress(prev => ({ ...prev, totalSynced }));
                } catch (saveErr: any) {
                  if (saveErr.message?.includes('Dependência não encontrada')) {
                    const saferItem = { ...cleanItem };
                    Object.keys(saferItem).forEach(k => {
                      if (k.endsWith('_id')) delete saferItem[k];
                    });
                    try {
                      await saveData(col, item.id, saferItem);
                      totalSynced++;
                      setSyncProgress(prev => ({ ...prev, totalSynced }));
                      return;
                    } catch (retryErr: any) {}
                  }
                  totalFailed++;
                  setSyncProgress(prev => ({ ...prev, totalFailed }));
                }
              }));
              await new Promise(r => setTimeout(r, 50));
            }
          }
          setSyncProgress(prev => ({ ...prev, completed: [...prev.completed, col] }));
        } catch (colErr: any) {
          console.error(`Falha ao sincronizar coleção ${col}:`, colErr);
          setSyncProgress(prev => ({ ...prev, failed: [...prev.failed, col] }));
          if (colErr.message?.includes('Quota Exceeded') || colErr.message?.includes('cota diária')) {
            throw new Error('A cota diária do Firebase foi atingida. A migração não pode continuar hoje.');
          }
        }
        await new Promise(r => setTimeout(r, 200));
      }
      
      setNotification({ 
        type: 'success', 
        message: `Sincronização concluída! ${totalSynced} registros migrados.` 
      });
      fetchCounts();
    } catch (err: any) {
      console.error('Sync failed:', err);
      setNotification({ type: 'error', message: 'Falha na sincronização: ' + err.message });
    } finally {
      setIsSyncing(false);
    }
  };

  const fetchAcademicParams = async () => {
    try {
      const data = await fetchAll('academic_parameters', '*', '');
      if (data && data.length > 0) {
        setAcademicParams(data[0] as AcademicParameters);
      }
    } catch (error) {
      console.error('Error fetching academic params:', error);
    }
  };

  const handleSaveAcademicParams = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      const dataToSave = {
        ...academicParams,
        updated_at: new Date().toISOString()
      };
      
      let docId = academicParams.id;
      if (!docId) {
        const existing = await fetchAll('academic_parameters', '*', '');
        if (existing && existing.length > 0) docId = existing[0].id;
        else docId = crypto.randomUUID();
      }

      await saveData('academic_parameters', docId, dataToSave);
      setAcademicParams({ ...dataToSave, id: docId });
      setNotification({ type: 'success', message: 'Parâmetros acadêmicos salvos!' });
    } catch (error: any) {
      setNotification({ type: 'error', message: 'Erro ao salvar: ' + error.message });
    } finally {
      setSaving(false);
      setTimeout(() => setNotification(null), 3000);
    }
  };

  useEffect(() => {
    fetchInstitution();
    if (activeTab === 'maintenance') {
      fetchCounts();
    }
    if (activeTab === 'academic') {
      fetchAcademicParams();
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
      const newInactiveCounts: Record<string, number> = {};
      
      await Promise.all(collections.map(async (col) => {
        newCounts[col] = await fetchCount(col, 'Ativo');
        newInactiveCounts[col] = await fetchCount(col, 'Inativo');
      }));
      
      setCounts(newCounts);
      setInactiveCounts(newInactiveCounts);
    } catch (e) {
      console.error('Error fetching counts:', e);
    }
  };

  const fetchInstitution = async () => {
    try {
      setLoading(true);
      const data = await financialService.getInstitutionSettings();
      if (data) {
        setInstitution(data as InstitutionSettings);
        return;
      }
    } catch (error: any) {
      if (!error.message?.includes('quota')) {
        console.error('Error fetching institution:', error.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploadingLogo(true);
      const url = await uploadImage(file, 'students', 'logos');
      setInstitution({ ...institution, logo_url: url });
      setNotification({ type: 'success', message: 'Logo carregada com sucesso!' });
    } catch (error: any) {
      setNotification({ type: 'error', message: 'Erro ao carregar logo: ' + error.message });
    } finally {
      setUploadingLogo(false);
    }
  };



  const formatCEP = (value: string) => {
    const digits = value.replace(/\D/g, '');
    if (digits.length <= 5) return digits;
    return `${digits.slice(0, 5)}-${digits.slice(5, 8)}`;
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
        ...institution,
        updated_at: now
      };

      // Ensure we have an ID for institution_settings
      let instId = institution.id;
      if (!instId) {
        const institutions = await fetchAll('institution_settings');
        if (institutions && institutions.length > 0) instId = institutions[0].id;
        else instId = '1'; // Default fixed ID
      }

      // Tentar salvar com todos os campos
      // saveData no database.ts já possui retry-loop para colunas faltantes
      const finalId = await saveData('institution_settings', instId, dataToSave);
      
      setInstitution({ ...institution, id: finalId as string, ...dataToSave });
      setNotification({ type: 'success', message: 'Configurações sincronizadas com sucesso!' });
      window.dispatchEvent(new Event('institution-updated'));
    } catch (error: any) {
      console.error('Save error:', error);
      let message = error.message || 'Erro desconhecido';
      
      if (message.includes('column') || message.includes('schema cache')) {
        message = 'Erro de Banco de Dados: Colunas faltando. Vá na aba "Manutenção" e execute o "Checkup de Schema" para baixar o SQL de correção.';
      }
      
      setNotification({ type: 'error', message: message });
    } finally {
      setSaving(false);
      setTimeout(() => setNotification(null), 8000);
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

          // Bulk Update in chunks
          const toUpdateIds = toUpdate.map(s => s.id);
          for (let i = 0; i < toUpdateIds.length; i += 100) {
            const chunk = toUpdateIds.slice(i, i + 100);
            const { error } = await supabase.from('students').update({ status: 'Inativo', updated_at: new Date().toISOString() }).in('id', chunk);
            if (error) throw error;
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

          // Bulk Update
          const toUpdateIds = toUpdate.map(s => s.id);
          for (let i = 0; i < toUpdateIds.length; i += 100) {
            const chunk = toUpdateIds.slice(i, i + 100);
            const { error } = await supabase.from('students').update({ status: 'Ativo', updated_at: new Date().toISOString() }).in('id', chunk);
            if (error) throw error;
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
          
          const items = await fetchAll('classes');
          const toUpdateIds: string[] = [];
          
          (items || []).forEach(data => {
            // Try to find year in code or name first
            const yearFromCode = extractYearFromText(data.code);
            const yearFromName = extractYearFromText(data.name);
            const createdAt = data.created_at ? new Date(data.created_at) : null;
            
            // Priority: Code > Name > CreatedAt
            const detectedYear = yearFromCode || yearFromName || (createdAt ? createdAt.getFullYear() : null);
            
            if (detectedYear && detectedYear < 2023 && data.status !== 'Inativo') {
              toUpdateIds.push(data.id);
            }
          });

          if (toUpdateIds.length === 0) {
            setNotification({ type: 'success', message: 'Nenhuma turma anterior a 2023 encontrada para inativar.' });
            return;
          }

          // Batch update
          for (let i = 0; i < toUpdateIds.length; i += 100) {
            const chunk = toUpdateIds.slice(i, i + 100);
            const { error } = await supabase.from('classes').update({ status: 'Inativo', updated_at: new Date().toISOString() }).in('id', chunk);
            if (error) throw error;
          }
          
          setNotification({ type: 'success', message: `${toUpdateIds.length} turmas inativadas com sucesso!` });
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

  const MIGRATED_COLLECTIONS = [
    'institution_settings', 'users', 'email_registry', 'foraries', 'parishes', 
    'clergy_leity', 'subjects', 'teachers', 'classes', 
    'students', 'attendances', 'grades', 'calendar_events', 
    'contributions', 'pix_reconciliations', 'certificates', 'assessments'
  ];

  const handleClearModule = async (module: string, label: string) => {
    console.log(`Iniciando handleClearModule para: ${module}`);
    
    setShowConfirmModal({
      show: true,
      title: `Excluir ${label}`,
      message: `ATENÇÃO: Isso irá EXCLUIR DEFINITIVAMENTE os registros encontrados em "${label}". Confirma?`,
      type: 'danger',
      onConfirm: async () => {
        try {
          setLoading(true);
          setShowConfirmModal(prev => ({ ...prev, show: false }));
          setNotification({ type: 'success', message: `Iniciando limpeza de ${label}...` });
          
          if (!isSupabaseConfigured) throw new Error('Supabase não configurado.');
          
          // Fetch all IDs to delete
          const items = await fetchAll(module, 'id');
          if (!items || items.length === 0) {
            setNotification({ type: 'success', message: `O módulo ${label} já está vazio.` });
            return;
          }

          const ids = items.map(i => i.id);
          
          // Delete in chunks of 100 for Supabase safety (or just one call if manageable)
          const chunkSize = 100;
          for (let i = 0; i < ids.length; i += chunkSize) {
            const chunk = ids.slice(i, i + chunkSize);
            const { error } = await supabase.from(module).delete().in('id', chunk);
            if (error) throw error;
          }
          
          setNotification({ type: 'success', message: `${ids.length} registros de ${label} removidos com sucesso!` });
          fetchCounts();
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
          
          const items = await fetchAll('students');
          const records: Record<string, any[]> = {};
          
          (items || []).forEach(data => {
            const reg = String(data.registration_number || '').trim();
            if (reg) {
              if (!records[reg]) records[reg] = [];
              records[reg].push(data);
            }
          });

          const toDeleteIds: string[] = [];

          Object.values(records).forEach(group => {
            if (group.length > 1) {
              group.sort((a, b) => {
                const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
                const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
                return dateB - dateA;
              });
              for (let i = 1; i < group.length; i++) {
                toDeleteIds.push(group[i].id);
              }
            }
          });

          if (toDeleteIds.length > 0) {
            for (let i = 0; i < toDeleteIds.length; i += 100) {
              const chunk = toDeleteIds.slice(i, i + 100);
              const { error } = await supabase.from('students').delete().in('id', chunk);
              if (error) throw error;
            }
            setNotification({ type: 'success', message: `${toDeleteIds.length} registros duplicados removidos!` });
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



  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 tracking-tight">Configurações</h2>
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mt-1">Gestão da Instituição e Parâmetros do Sistema</p>
        </div>

        <div className="flex bg-white p-1 rounded-lg border border-slate-200 shadow-sm">
          <button 
            onClick={() => setActiveTab('institution')}
            className={cn(
              "px-4 py-2 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all flex items-center gap-2",
              activeTab === 'institution' ? "bg-slate-800 text-white shadow-md" : "text-slate-400 hover:text-slate-600"
            )}
          >
            <Building2 size={14} />
            Instituição
          </button>

          <button 
            onClick={() => setActiveTab('academic')}
            className={cn(
              "px-4 py-2 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all flex items-center gap-2",
              activeTab === 'academic' ? "bg-emerald-600 text-white shadow-md" : "text-slate-400 hover:text-slate-600"
            )}
          >
            <Clock size={14} />
            Acadêmico
          </button>

          <button 
            onClick={() => setActiveTab('security')}
            className={cn(
              "px-4 py-2 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all flex items-center gap-2",
              activeTab === 'security' ? "bg-amber-600 text-white shadow-md" : "text-slate-400 hover:text-slate-600"
            )}
          >
            <ShieldCheck size={14} />
            Segurança
          </button>

          <button 
            onClick={() => setActiveTab('maintenance')}
            className={cn(
              "px-4 py-2 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all flex items-center gap-2",
              activeTab === 'maintenance' ? "bg-red-600 text-white shadow-md" : "text-slate-400 hover:text-slate-600"
            )}
          >
            <Database size={14} />
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

      {activeTab === 'institution' && (
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
          <form onSubmit={handleSaveInstitution} className="p-8 md:p-10 space-y-10">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-12 gap-y-10">
              {/* Identificação & Endereço Section */}
              <div className="lg:col-span-2 space-y-6">
                <h3 className="text-base font-bold text-slate-800 flex items-center gap-3 border-b border-slate-100 pb-4 tracking-tight">
                  <div className="w-8 h-8 rounded bg-slate-100 text-slate-600 flex items-center justify-center border border-slate-200">
                    <Building2 size={16} />
                  </div>
                  Informações da Instituição
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-6 gap-5">
                  {/* Row 1: Name and Subtitle */}
                  <div className="md:col-span-3 space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Nome da Instituição</label>
                    <input 
                      type="text"
                      value={institution.name || ''}
                      onChange={(e) => setInstitution({...institution, name: e.target.value})}
                      className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-md focus:ring-1 focus:ring-indigo-500/20 focus:border-indigo-300 outline-none transition-all font-bold text-slate-700 text-[13px]"
                      placeholder="Ex: Escola ESCMIN"
                      required
                    />
                  </div>
                  <div className="md:col-span-3 space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Subtítulo / Patrono / Complemento</label>
                    <input 
                      type="text"
                      value={institution.subtitle || ''}
                      onChange={(e) => setInstitution({...institution, subtitle: e.target.value})}
                      className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-md focus:ring-1 focus:ring-indigo-500/20 focus:border-indigo-300 outline-none transition-all font-bold text-slate-700 text-[13px]"
                      placeholder="Ex: Pe. José Fernando de Brito"
                    />
                  </div>

                  {/* Row 2: Address, CEP, City/UF */}
                  <div className="md:col-span-3 space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Endereço Completo</label>
                    <input 
                      type="text"
                      value={institution.address || ''}
                      onChange={(e) => setInstitution({...institution, address: e.target.value})}
                      className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-md focus:ring-1 focus:ring-indigo-500/20 focus:border-indigo-300 outline-none transition-all font-bold text-slate-700 text-[13px]"
                      placeholder="Rua, Número, Bairro"
                    />
                  </div>
                  <div className="md:col-span-1 space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">CEP</label>
                    <input 
                      type="text"
                      value={institution.cep || ''}
                      onChange={(e) => setInstitution({...institution, cep: formatCEP(e.target.value)})}
                      className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-md focus:ring-1 focus:ring-indigo-500/20 focus:border-indigo-300 outline-none transition-all font-bold text-slate-700 text-[13px]"
                      placeholder="00000-000"
                      maxLength={9}
                    />
                  </div>
                  <div className="md:col-span-2 space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Cidade / UF</label>
                    <input 
                      type="text"
                      value={institution.city_uf || ''}
                      onChange={(e) => setInstitution({...institution, city_uf: e.target.value})}
                      className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-md focus:ring-1 focus:ring-indigo-500/20 focus:border-indigo-300 outline-none transition-all font-bold text-slate-700 text-[13px]"
                      placeholder="Ex: Guarulhos / SP"
                    />
                  </div>

                  {/* Row 3: Phone, WhatsApp and Email */}
                  <div className="md:col-span-2 space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Telefone</label>
                    <div className="relative">
                      <input 
                        type="text"
                        value={institution.phone || ''}
                        onChange={(e) => setInstitution({...institution, phone: formatPhone(e.target.value)})}
                        className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-md focus:ring-1 focus:ring-indigo-500/20 focus:border-indigo-300 outline-none transition-all font-bold text-slate-700 text-[13px] pr-12"
                        placeholder="(00) 00000-0000"
                      />
                      <button
                        type="button"
                        onClick={() => setInstitution({...institution, phone_is_whatsapp: !institution.phone_is_whatsapp})}
                        className={cn(
                          "absolute right-4 top-1/2 -translate-y-1/2 transition-all p-1 rounded-md",
                          institution.phone_is_whatsapp ? "text-emerald-500 bg-emerald-50" : "text-slate-300 hover:text-slate-400"
                        )}
                        title={institution.phone_is_whatsapp ? "Número com WhatsApp" : "Marcar como WhatsApp"}
                      >
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L0 24l6.335-1.662c1.72.937 3.659 1.43 5.623 1.43h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                        </svg>
                      </button>
                    </div>
                  </div>
                  <div className="md:col-span-2 space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 text-green-600 flex items-center gap-1">
                      <MessageCircle size={10} /> WhatsApp
                    </label>
                    <div className="relative">
                      <input 
                        type="text"
                        value={institution.whatsapp || ''}
                        onChange={(e) => setInstitution({...institution, whatsapp: formatPhone(e.target.value)})}
                        className="w-full px-5 py-3 bg-slate-50 border border-transparent border-green-100 rounded-xl focus:ring-2 focus:ring-green-500/20 focus:bg-white focus:border-green-200 transition-all font-bold text-[#00174b] text-sm pr-12"
                        placeholder="(00) 00000-0000"
                      />
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 text-green-600">
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L0 24l6.335-1.662c1.72.937 3.659 1.43 5.623 1.43h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                        </svg>
                      </div>
                    </div>
                  </div>
                  <div className="md:col-span-2 space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">E-mail</label>
                    <input 
                      type="email"
                      value={institution.email || ''}
                      onChange={(e) => setInstitution({...institution, email: e.target.value})}
                      className="w-full px-5 py-3 bg-slate-50 border border-transparent rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:bg-white focus:border-blue-200 transition-all font-bold text-[#00174b] text-sm"
                      placeholder="contato@escola.com"
                    />
                  </div>

                  {/* Row 4: CNPJ and Website */}
                  <div className="md:col-span-3 space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">CNPJ</label>
                    <input 
                      type="text"
                      value={institution.cnpj || ''}
                      onChange={(e) => setInstitution({...institution, cnpj: formatCNPJ(e.target.value)})}
                      className="w-full px-5 py-3 bg-slate-50 border border-transparent rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:bg-white focus:border-blue-200 transition-all font-bold text-[#00174b] text-sm"
                      placeholder="00.000.000/0000-00"
                    />
                  </div>
                  <div className="md:col-span-3 space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Website</label>
                    <input 
                      type="text"
                      value={institution.website || ''}
                      onChange={(e) => setInstitution({...institution, website: e.target.value})}
                      className="w-full px-5 py-3 bg-slate-50 border border-transparent rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:bg-white focus:border-blue-200 transition-all font-bold text-[#00174b] text-sm"
                      placeholder="www.escola.com.br"
                    />
                  </div>

                  {/* Rodapé info */}
                  <div className="md:col-span-3 space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Atendimento Secretaria (Rodapé)</label>
                    <textarea 
                      rows={3}
                      value={institution.secretary || ''}
                      onChange={(e) => setInstitution({...institution, secretary: e.target.value})}
                      className="w-full px-5 py-3 bg-slate-50 border border-transparent rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:bg-white focus:border-blue-200 transition-all font-bold text-[#00174b] text-sm resize-none"
                      placeholder="Informações de atendimento (Máx 3 linhas de 50 caracteres)"
                      maxLength={150}
                    />
                  </div>

                  <div className="md:col-span-3 space-y-1.5">
                    <div className="flex justify-between items-center ml-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Aviso de Recibo</label>
                      <span className={cn(
                        "text-[10px] font-bold transition-colors",
                        (institution.receipt_message?.length || 0) >= 280 ? "text-amber-500" : "text-slate-300"
                      )}>
                        {institution.receipt_message?.length || 0} / 300
                      </span>
                    </div>
                    <textarea 
                      rows={3}
                      value={institution.receipt_message || ''}
                      onChange={(e) => setInstitution({...institution, receipt_message: e.target.value.substring(0, 300)})}
                      className="w-full px-5 py-3 bg-slate-50 border border-transparent rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:bg-white focus:border-blue-200 transition-all font-bold text-[#00174b] text-sm resize-none"
                      placeholder="Ex: 'Mensalidade paga com sucesso. Paz e Bem!'"
                      maxLength={300}
                    />
                  </div>
                </div>

              {/* Visual Section */}
              <div className="lg:col-span-2 space-y-6">
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-5">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">URL da Logo</label>
                      <div className="flex gap-2">
                        <input 
                          type="text"
                          value={institution.logo_url || ''}
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
                </div>

                {/* Document Preview Mockup */}
                <div className="mt-10 p-4 bg-slate-50 rounded-3xl border border-slate-100">
                  <div className="flex items-center gap-2 mb-4">
                    <Layout size={16} className="text-blue-600" />
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Pré-visualização do Padrão de Documentos Oficiais</span>
                  </div>
                  
                  {/* Standardized Header Mockup */}
                  <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-200 min-h-[400px] flex flex-col scale-[0.85] origin-top">
                    <div className="flex items-center gap-6 border-b-2 border-black pb-4">
                      <div className="flex-shrink-0 w-20 h-20 flex items-center justify-center">
                        {institution.logo_url ? (
                          <img src={institution.logo_url} alt="Logo" className="w-full h-full object-contain max-h-20" referrerPolicy="no-referrer" />
                        ) : (
                          <div className="w-full h-full border-2 border-slate-200 border-dashed flex items-center justify-center text-[10px] text-slate-300 font-black uppercase">LOGO</div>
                        )}
                      </div>
                      <div className="flex-1 flex flex-col text-left">
                        <p className="text-[9pt] font-semibold tracking-widest text-slate-800 leading-tight">DIOCESE DE GUARULHOS</p>
                        <h4 className="text-[16pt] font-black text-black uppercase leading-tight my-0.5 tracking-tight">{institution.name || 'NOME DA INSTITUIÇÃO'}</h4>
                        <p className="text-[10pt] font-bold text-slate-700 tracking-wide uppercase">{institution.subtitle || 'SUBTÍTULO / PADROEIRO'}</p>
                      </div>
                    </div>
                    
                    <div className="flex-1 py-10 flex flex-col items-center justify-center">
                      <h5 className="text-[14pt] font-bold uppercase tracking-[0.2em] mb-4 border-b border-black/10 pb-0.5">Título do Documento</h5>
                      <div className="w-full space-y-3 opacity-10 select-none">
                        <div className="h-4 bg-slate-200 rounded w-full"></div>
                        <div className="h-4 bg-slate-200 rounded w-[90%]"></div>
                        <div className="h-4 bg-slate-200 rounded w-full"></div>
                        <div className="h-4 bg-slate-200 rounded w-[80%]"></div>
                      </div>
                    </div>

                    {/* Standardized Footer Mockup */}
                    <div className="mt-auto">
                      <div className="flex justify-between items-end text-[7pt] font-black text-black uppercase tracking-tight mb-1 px-1">
                        <div className="flex-1 text-left space-y-1">
                          <p className="leading-none">
                            {institution.address || 'Endereço não configurado'} {institution.cep ? ` - CEP: ${institution.cep}` : ''} {institution.city_uf ? ` - ${institution.city_uf}` : ''}
                          </p>
                          <div className="flex items-center gap-3 leading-none font-bold">
                            {institution.phone && (
                              <span className="flex items-center gap-1">
                                TEL: {institution.phone}
                                <svg viewBox="0 0 24 24" width="10" height="10" fill="#25D366" className="shrink-0">
                                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L0 24l6.335-1.662c1.72.937 3.659 1.43 5.623 1.43h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                                </svg>
                              </span>
                            )}
                            {institution.email && (
                              <span className="flex items-center gap-1">
                                EMAIL: <span className="lowercase font-bold">{institution.email}</span>
                              </span>
                            )}
                          </div>
                        </div>
                        {institution.secretary && (
                          <div className="text-right max-w-[250px] leading-tight text-black font-black uppercase text-[7pt]">
                            <p className="underline underline-offset-2 mb-1">Atendimento Secretaria:</p>
                            <p className="lowercase font-bold text-[7.5pt]">{institution.secretary}</p>
                          </div>
                        )}
                      </div>
                      <div className="border-t-2 border-black"></div>
                    </div>
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
        )}

      {activeTab === 'academic' && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="bg-emerald-50/50 border border-emerald-100 p-6 rounded-lg flex flex-col md:flex-row items-center gap-6">
            <div className="w-14 h-14 rounded bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-200">
              <School size={28} />
            </div>
            <div>
              <h3 className="text-base font-bold text-emerald-900 tracking-tight">Parâmetros Acadêmicos</h3>
              <p className="text-emerald-700 font-medium text-[11px] mt-1">
                Configure as regras para aprovação, recuperação e limites de faltas das turmas.
              </p>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden p-8 md:p-10">
            <form onSubmit={handleSaveAcademicParams} className="space-y-10">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1 text-emerald-600">Média de Aprovação</label>
                  <input 
                    type="number"
                    step="0.1"
                    min="0"
                    max="10"
                    value={academicParams.approval_grade}
                    onChange={(e) => setAcademicParams({...academicParams, approval_grade: parseFloat(e.target.value)})}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-1 focus:ring-emerald-500/20 focus:border-emerald-300 outline-none transition-all font-black text-slate-800 text-lg"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1 text-amber-600">Limite Recuperação</label>
                  <input 
                    type="number"
                    step="0.1"
                    min="0"
                    max="10"
                    value={academicParams.recovery_grade}
                    onChange={(e) => setAcademicParams({...academicParams, recovery_grade: parseFloat(e.target.value)})}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-1 focus:ring-amber-500/20 focus:border-amber-300 outline-none transition-all font-black text-slate-800 text-lg"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1 text-red-600">Média de Reprovação</label>
                  <input 
                    type="number"
                    step="0.1"
                    min="0"
                    max="10"
                    value={academicParams.failure_grade}
                    onChange={(e) => setAcademicParams({...academicParams, failure_grade: parseFloat(e.target.value)})}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-1 focus:ring-red-500/20 focus:border-red-300 outline-none transition-all font-black text-slate-800 text-lg"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1 text-indigo-600">% Limite de Faltas</label>
                  <input 
                    type="number"
                    min="0"
                    max="100"
                    value={academicParams.absence_limit_percentage}
                    onChange={(e) => setAcademicParams({...academicParams, absence_limit_percentage: parseInt(e.target.value)})}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-1 focus:ring-indigo-500/20 focus:border-indigo-300 outline-none transition-all font-black text-slate-800 text-lg"
                  />
                </div>
              </div>

              <div className="pt-8 border-t border-slate-100 flex justify-end">
                <button 
                  type="submit"
                  disabled={saving}
                  className="px-10 py-4 bg-[#00174b] text-white rounded-xl font-black flex items-center gap-3 hover:bg-blue-900 transition-all shadow-xl active:scale-95 disabled:opacity-50"
                >
                  {saving ? <Loader2 size={20} className="animate-spin" /> : <Save size={20} />}
                  Salvar Parâmetros
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {activeTab === 'security' && (
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="bg-amber-50/50 border border-amber-100 p-6 rounded-lg flex flex-col md:flex-row items-center gap-6">
            <div className="w-14 h-14 rounded bg-amber-100 text-amber-600 flex items-center justify-center shrink-0 border border-amber-200">
              <ShieldCheck size={28} />
            </div>
            <div>
              <h3 className="text-base font-bold text-amber-900 tracking-tight">Segurança de Acesso (PIN)</h3>
              <p className="text-amber-700 font-medium text-[11px] mt-1">
                Aumente a segurança do sistema definindo um código PIN numérico de 4 dígitos para acesso rápido.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-6 space-y-6">
              <div className="flex items-center gap-4 border-b border-slate-100 pb-4">
                <div className="w-9 h-9 rounded bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-100">
                  <Key size={16} />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-800 tracking-tight">Gestão de PIN</h4>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Defina seu código de acesso</p>
                </div>
              </div>

              <form onSubmit={handleUpdatePin} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Novo PIN (4 dígitos)</label>
                    <input 
                      type="password"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={4}
                      value={newPin}
                      onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
                      className="w-full px-4 py-3 bg-white border border-slate-200 rounded-md focus:ring-1 focus:ring-amber-500/20 focus:border-amber-300 outline-none transition-all font-bold text-slate-800 text-center text-xl tracking-[0.5em]"
                      placeholder="****"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Confirmar Novo PIN</label>
                    <input 
                      type="password"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={4}
                      value={confirmPin}
                      onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
                      className="w-full px-4 py-3 bg-white border border-slate-200 rounded-md focus:ring-1 focus:ring-amber-500/20 focus:border-amber-300 outline-none transition-all font-bold text-slate-800 text-center text-xl tracking-[0.5em]"
                      placeholder="****"
                    />
                  </div>
                </div>

                <div className="pt-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {profile?.pin ? (
                      <div className="px-2.5 py-1 bg-emerald-50 text-emerald-600 rounded text-[9px] font-bold uppercase tracking-wider flex items-center gap-1.5 border border-emerald-100">
                        <Check size={12} />
                        ATIVADO
                      </div>
                    ) : (
                      <div className="px-2.5 py-1 bg-slate-100 text-slate-500 rounded text-[9px] font-bold uppercase tracking-wider border border-slate-200">
                        DESATIVADO
                      </div>
                    )}
                  </div>
                  
                  <button 
                    type="submit"
                    disabled={savingPin || newPin.length < 4}
                    className="px-6 py-2.5 bg-amber-600 text-white rounded-md text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 hover:bg-amber-700 transition-all shadow-md shadow-amber-600/20 disabled:opacity-50"
                  >
                    {savingPin ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                    {profile?.pin ? 'ATUALIZAR PIN' : 'DEFINIR PIN'}
                  </button>
                </div>
              </form>
            </div>

            <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-6 space-y-6">
              <div className="flex items-center gap-4 border-b border-slate-100 pb-4">
                <div className="w-9 h-9 rounded bg-indigo-50 text-indigo-600 flex items-center justify-center border border-indigo-100">
                  <Info size={16} />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-800 tracking-tight">Instruções</h4>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Segurança em duas camadas</p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0 mt-0.5 font-bold text-[10px] border border-indigo-100">1</div>
                  <p className="text-[11px] font-medium text-slate-600 leading-normal">O PIN será solicitado imediatamente após o login ou ao reabrir o sistema.</p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0 mt-0.5 font-bold text-[10px] border border-indigo-100">2</div>
                  <p className="text-[11px] font-medium text-slate-600 leading-normal">Este código é pessoal. Cada usuário define o seu próprio PIN de acesso.</p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0 mt-0.5 font-bold text-[10px] border border-indigo-100">3</div>
                  <p className="text-[11px] font-medium text-slate-600 leading-normal">Se esquecer seu PIN, solicite o reset do perfil para o administrador.</p>
                </div>
              </div>

              {profile?.pin && (
                <div className="p-4 bg-red-50/50 border border-red-100 rounded-md">
                   <button 
                    onClick={async () => {
                      if (window.confirm('Tem certeza que deseja remover a proteção por PIN da sua conta?')) {
                        try {
                          await saveData('users', profile.id, { ...profile, pin: null });
                          await refreshProfile();
                          setNotification({ type: 'success', message: 'Proteção por PIN removida.' });
                        } catch (e: any) {
                          setNotification({ type: 'error', message: 'Erro ao remover: ' + e.message });
                        }
                      }
                    }}
                    className="w-full py-2 bg-white text-red-600 border border-red-200 rounded-md text-[9px] font-bold uppercase tracking-widest hover:bg-red-600 hover:text-white transition-all shadow-sm"
                  >
                    Remover Proteção por PIN
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Bloqueio de Tela por Inatividade */}
          <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-6 space-y-6 mt-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
              <div className="flex items-center gap-4">
                <div className="w-9 h-9 rounded bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100">
                  <Clock size={16} />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-800 tracking-tight">Bloqueio Automático por Inatividade</h4>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Defina o comportamento do bloqueio de tela por inatividade</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Bloqueio Automático:</span>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={localLockEnabled} 
                    onChange={(e) => setLocalLockEnabled(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-600"></div>
                </label>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
              <div className="md:col-span-7 space-y-4">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1 block">Tempo limite de inatividade</label>
                <div className="flex flex-wrap gap-2">
                  {[1, 3, 5, 10, 15, 30, 60].map((mins) => (
                    <button
                      key={mins}
                      type="button"
                      disabled={!localLockEnabled}
                      onClick={() => setLockTimeoutMinutes(mins)}
                      className={cn(
                        "px-4 py-2 border rounded-md text-xs font-semibold tracking-tight transition-all",
                        !localLockEnabled ? "opacity-40 cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400" :
                        lockTimeoutMinutes === mins 
                          ? "bg-amber-50 border-amber-500 text-amber-700 font-bold shadow-sm shadow-amber-500/10" 
                          : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                      )}
                    >
                      {mins === 1 ? '1 Minuto' : `${mins} Minutos`}
                    </button>
                  ))}
                </div>

                <div className="pt-2 flex items-center gap-4">
                  <div className="w-full max-w-[200px] space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block ml-1">Ou tempo personalizado (minutos)</label>
                    <div className="relative">
                      <input
                        type="number"
                        min={1}
                        max={1440}
                        disabled={!localLockEnabled}
                        value={lockTimeoutMinutes}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10);
                          if (!isNaN(val) && val > 0) {
                            setLockTimeoutMinutes(val);
                          } else if (e.target.value === '') {
                            setLockTimeoutMinutes('' as any);
                          }
                        }}
                        className="w-full px-4 py-2 bg-white border border-slate-200 rounded-md focus:ring-1 focus:ring-amber-500/20 focus:border-amber-300 outline-none transition-all font-semibold text-slate-800 disabled:opacity-40"
                        placeholder="Ex: 8"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="md:col-span-5 bg-slate-50/50 rounded-lg p-5 border border-slate-100 flex flex-col justify-between gap-4">
                <div className="space-y-3">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Resumo do comportamento</span>
                  {localLockEnabled ? (
                    <div className="space-y-2">
                      <p className="text-xs text-slate-600 leading-relaxed font-medium">
                        • <span className="font-bold text-amber-700">Bloqueio de Tela:</span> O sistema será bloqueado após <span className="font-bold text-amber-700">{lockTimeoutMinutes || 5} minutos</span> de inatividade. O PIN de segurança será solicitado para retomar o acesso.
                      </p>
                      <p className="text-xs text-slate-600 leading-relaxed font-medium">
                        • <span className="font-bold text-red-600">Desconexão Automática:</span> Se o usuário ficar o dobro do tempo (<span className="font-bold text-red-600">{(lockTimeoutMinutes || 5) * 2} minutos</span>) sem atividade ou sem desbloquear, o sistema fechará a sessão completamente, exigindo e-mail e senha.
                      </p>
                      <p className="text-xs text-blue-600 leading-relaxed font-medium">
                        • <span className="font-bold">Segurança da Sessão:</span> Caso feche o navegador ou a aba, a sessão será encerrada e o login será exigido novamente ao reabrir.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-xs text-slate-500 leading-relaxed font-medium">
                        • O bloqueio automático por inatividade está <span className="font-bold text-red-600">desativado</span>.
                      </p>
                      <p className="text-xs text-blue-600 leading-relaxed font-medium">
                        • <span className="font-bold">Segurança da Sessão:</span> Mesmo sem bloqueio automático, caso feche o navegador ou a aba, a sessão será encerrada e o login será exigido novamente ao reabrir.
                      </p>
                    </div>
                  )}
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    onClick={async () => {
                      const mins = typeof lockTimeoutMinutes === 'number' ? lockTimeoutMinutes : 5;
                      await updateLockSettings(localLockEnabled, mins);
                      setNotification({ type: 'success', message: 'Configurações de bloqueio salvas e sincronizadas!' });
                      setTimeout(() => setNotification(null), 3000);
                    }}
                    className="px-6 py-2.5 bg-amber-600 text-white rounded-md text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 hover:bg-amber-700 transition-all shadow-md shadow-amber-600/20"
                  >
                    <Save size={14} />
                    Salvar Ajustes de Bloqueio
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

        {activeTab === 'maintenance' && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="bg-red-50/50 border border-red-100 p-6 rounded-lg flex flex-col md:flex-row items-center gap-6">
            <div className="w-14 h-14 rounded bg-red-100 text-red-600 flex items-center justify-center shrink-0 border border-red-200">
              <AlertTriangle size={28} />
            </div>
            <div>
              <h3 className="text-base font-bold text-red-900 tracking-tight">Área de Risco & Manutenção</h3>
              <p className="text-red-700 font-medium text-[11px] mt-1 leading-relaxed">
                As ferramentas abaixo executam ações em massa. Certifique-se antes de prosseguir, pois dados excluídos não podem ser recuperados.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-6 space-y-6">
              <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2 tracking-tight">
                <RefreshCw size={16} className="text-indigo-500" />
                Status da Migração Progressiva
              </h4>
              
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
                {[
                  'institution_settings', 'users', 'email_registry', 'foraries', 'parishes', 
                  'clergy_leity', 'subjects', 'teachers', 'classes', 
                  'students', 'attendances', 'grades', 'calendar_events', 
                  'contributions', 'pix_reconciliations', 'certificates', 'assessments'
                ].map(col => {
                  const isMigrated = MIGRATED_COLLECTIONS.includes(col);
                  return (
                    <div key={col} className={cn(
                      "p-2.5 rounded border flex flex-col gap-1 transition-all",
                      isMigrated ? "bg-emerald-50 border-emerald-100" : "bg-slate-50 border-slate-100 grayscale opacity-60"
                    )}>
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] font-bold uppercase text-slate-700 truncate tracking-tighter">{col}</span>
                        {isMigrated ? <CheckCircle2 size={10} className="text-emerald-500" /> : <Clock size={10} className="text-slate-400" />}
                      </div>
                      <span className={cn(
                        "text-[8px] font-bold uppercase tracking-widest",
                        isMigrated ? "text-emerald-600" : "text-slate-400"
                      )}>
                        {isMigrated ? 'Ativo' : 'Off'}
                      </span>
                    </div>
                  );
                })}
              </div>

              {isSyncing && (
                <div className="mt-6 p-4 bg-indigo-50 border border-indigo-100 rounded-md space-y-3 animate-in fade-in slide-in-from-top-2">
                  <div className="flex items-center justify-between">
                    <h5 className="text-[11px] font-bold text-indigo-900 flex items-center gap-2 uppercase tracking-wider">
                      <Loader2 size={12} className="animate-spin" />
                      Sincronizando: {syncProgress.currentCol}
                    </h5>
                    <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest">
                      {syncProgress.totalSynced} OK
                    </span>
                  </div>
                  <div className="h-1.5 bg-indigo-100/50 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-indigo-600 transition-all duration-500 shadow-sm" 
                      style={{ width: `${(syncProgress.completed.length / 17) * 100}%` }}
                    />
                  </div>
                </div>
              )}

              <div className="space-y-2 pt-2">
                <button 
                  onClick={handleSchemaCheckup}
                  disabled={checkingSchema}
                  className="w-full h-12 px-4 bg-slate-50 border border-slate-200 rounded-md flex items-center justify-between group hover:border-indigo-300 transition-all text-left active:scale-[0.98] outline-none"
                >
                  <div className="flex items-center gap-3">
                    <Shield size={16} className="text-slate-400" />
                    <div>
                      <p className="text-[11px] font-bold text-slate-700 uppercase tracking-wider leading-none">Checkup de Schema</p>
                    </div>
                  </div>
                  {checkingSchema ? <Loader2 size={14} className="animate-spin text-indigo-300" /> : <RefreshCw size={14} className="text-slate-300" />}
                </button>

                <button 
                  onClick={handleSyncSupabase}
                  disabled={isSyncing}
                  className="w-full h-12 px-4 bg-indigo-600 text-white rounded-md flex items-center justify-between group hover:bg-indigo-700 transition-all text-left active:scale-[0.98] outline-none shadow-sm shadow-indigo-600/20"
                >
                  <div className="flex items-center gap-3">
                    <Database size={16} className={cn(isSyncing && "animate-pulse")} />
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wider leading-none">Sincronizar Banco</p>
                    </div>
                  </div>
                  {isSyncing ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <RefreshCw size={14} className="opacity-40 group-hover:rotate-180 transition-transform duration-700" />
                  )}
                </button>
              </div>
            </div>

            <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-6 space-y-6">
               <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2 tracking-tight">
                <Eraser size={16} className="text-red-500" />
                Limpeza e Manutenção
              </h4>
              <div className="space-y-2">
                {[
                  { label: 'Inativar Alunos Antigos (< 2023)', action: handleInactivateOldStudents, icon: <Clock size={14} /> },
                  { label: 'Ativar Alunos Recentes (> 2023)', action: handleActivateRecentStudents, icon: <UserCheck size={14} /> },
                  { label: 'Inativar Alunos Sem Turma', action: handleInactivateStudentsWithoutClass, icon: <AlertCircle size={14} /> },
                  { label: 'Inativar Turmas Antigas (< 2023)', action: handleInactivateOldClasses, icon: <School size={14} /> },
                  { label: 'Limpar Duplicatas de Alunos', action: handleCleanDuplicates, icon: <Search size={14} /> }
                ].map((tool, idx) => (
                  <button 
                    key={idx}
                    onClick={tool.action}
                    disabled={loading}
                    className="w-full h-11 px-4 bg-white border border-slate-200 rounded-md flex items-center justify-between hover:bg-slate-50 transition-all text-left group outline-none"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-slate-400 group-hover:text-indigo-600 transition-colors">{tool.icon}</span>
                      <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest leading-none">{tool.label}</p>
                    </div>
                    <ArrowUpRight size={14} className="text-slate-200 group-hover:text-slate-400" />
                  </button>
                ))}
              </div>

               <div className="grid grid-cols-1 gap-2 pt-2">
                <div className="p-4 bg-red-50/50 border border-red-100 rounded-md">
                   <h5 className="text-[10px] font-bold text-red-800 uppercase tracking-widest mb-3 flex items-center gap-2">
                     <Trash2 size={12} />
                     Exclusão Definitiva (Zerar Módulos)
                   </h5>
                   <div className="flex flex-wrap gap-2">
                    {[
                      { id: 'students', label: 'Alunos' },
                      { id: 'teachers', label: 'Professores' },
                      { id: 'classes', label: 'Turmas' },
                      { id: 'subjects', label: 'Disciplinas' }
                    ].map((mod) => (
                      <button
                        key={mod.id}
                        onClick={() => handleClearModule(mod.id, mod.label)}
                        className="px-3 py-1.5 bg-white border border-red-200 text-red-600 rounded text-[9px] font-bold uppercase tracking-widest hover:bg-red-600 hover:text-white transition-all shadow-sm"
                      >
                        {mod.label}
                      </button>
                    ))}
                   </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'backup' && (
        <BackupSection />
      )}
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
                      (info.status === 'up_to_date' || info.status === 'ok') ? "bg-emerald-50/40 border-emerald-100 shadow-sm shadow-emerald-500/5 hover:bg-emerald-50" : 
                      info.status === 'incomplete' ? "bg-amber-50/20 border-amber-100" : 
                      "bg-red-50/20 border-red-100"
                    )}>
                      <div className="flex justify-between items-start mb-3">
                        <h5 className="font-black text-[#00174b] uppercase text-xs tracking-tight">{table}</h5>
                        {(info.status === 'up_to_date' || info.status === 'ok') ? (
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
                      ) : (info.status === 'up_to_date' || info.status === 'ok') ? (
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
