import React, { useState, useEffect } from 'react';
import { Camera, RefreshCw, ChevronDown, CheckCircle2, XCircle, Shield, Plus, Search, Edit2, Trash2, Save, X, Loader2, Mail, User, MoreVertical, Key, Zap } from 'lucide-react';
import { auth, db, fetchAll, saveData, deleteData, uploadImage, fetchById, fetchQuery } from '../lib/database';
import { fetchSignInMethodsForEmail, updatePassword, verifyBeforeUpdateEmail } from 'firebase/auth';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { UserProfile, UserRole } from '../types';
import { useAuth } from '../contexts/AuthContext';
import Webcam from 'react-webcam';

export function Users() {
  const { user: userAuth, profile: currentProfile, refreshProfile, isAdmin, isSecretary, isDirector } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [sortBy, setSortBy] = useState<'name' | 'created_at'>('name');
  const [groupBy, setGroupBy] = useState<'none' | 'role' | 'status'>('none');
  const [notification, setNotification] = useState<{ type: 'success' | 'err', message: string } | null>(null);

  // Webcam
  const webcamRef = React.useRef<Webcam>(null);
  const [showWebcam, setShowWebcam] = useState(false);

  // Form
  const [formData, setFormData] = useState({
    email: '',
    name: '',
    role: 'secretario' as UserRole,
    status: 'active' as 'active' | 'inactive',
    avatar_url: ''
  });

  const [passwordData, setPasswordData] = useState({ newPassword: '', confirmPassword: '' });
  const [newEmail, setNewEmail] = useState('');
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [updatingSecurity, setUpdatingSecurity] = useState(false);

  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [sendingReset, setSendingReset] = useState(false);

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 8000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const handleResetPassword = async (email: string) => {
    if (!email) return;
    try {
      setSendingReset(true);
      const { sendPasswordResetEmail } = await import('firebase/auth');
      
      // Personalizando as notificações com a marca do sistema
      await sendPasswordResetEmail(auth, email);
      
      setNotification({ 
        type: 'success', 
        message: 'E-mail de redefinição enviado para o ESCMIN! Verifique sua caixa de entrada e siga as instruções para definir sua nova senha.' 
      });
    } catch (error: any) {
      console.error('Erro ao enviar reset:', error);
      setNotification({ type: 'err', message: 'Erro ao enviar e-mail. Verifique se o endereço está correto em nosso sistema.' });
    } finally {
      setSendingReset(false);
    }
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      let managers: UserProfile[] = [];
      let registered: any[] = [];

      if (isAdmin || isDirector) {
        // Admins and Directors can see everyone
        const [usersData, registryData] = await Promise.all([
          fetchAll('users', '*', 'name'),
          fetchAll('email_registry', '*', 'email')
        ]);
        managers = usersData as UserProfile[];
        registered = registryData as any[];
      } else if (currentProfile) {
        // Secretaries (or others) only see themselves
        managers = [currentProfile];
      }
      
      // deduplication Logic: Prioritize profiles with UID over pre-registered ones (Email ID)
      const uniqueUsersMap = new Map<string, UserProfile>();
      
      // 1. Process Managers first
      if (managers && managers.length > 0) {
        managers.forEach(u => {
          // Use ID as primary key, fallback to email if ID is missing (unlikely for users col)
          const key = u.id || u.email?.toLowerCase().trim() || Math.random().toString();
          const existing = uniqueUsersMap.get(key);
          
          const isPreReg = u.is_pre_registered === true;
          
          if (!existing) {
            uniqueUsersMap.set(key, u);
          } else {
            const existingIsPreReg = existing.is_pre_registered === true;
            if (existingIsPreReg && !isPreReg) {
               uniqueUsersMap.set(key, u);
            }
          }
        });
      }

      // 2. Add those from email_registry who are not in uniqueUsersMap yet
      if (registered && registered.length > 0) {
        registered.forEach(reg => {
          if (!reg.email) return;
          const emailKey = reg.email.toLowerCase().trim();
          
          // Check if this email is already represented in uniqueUsersMap
          const alreadyRepresented = Array.from(uniqueUsersMap.values()).some(u => u.email?.toLowerCase() === emailKey);
          
          if (!alreadyRepresented) {
            // Create a virtual profile for the UI
            uniqueUsersMap.set(emailKey, {
              id: reg.id || emailKey,
              email: reg.email,
              name: reg.name || reg.email.split('@')[0],
              role: (reg.role as any) || 'secretario',
              status: 'inactive', // Default to inactive if profile not created
              is_pre_registered: true,
              created_at: reg.registered_at || reg.created_at || new Date().toISOString()
            } as UserProfile);
          }
        });
      }
      
      setUsers(Array.from(uniqueUsersMap.values()));
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [isAdmin, isDirector, isSecretary, currentProfile]);

  const handleEdit = (user: UserProfile) => {
    // RBAC check: only admin can edit anyone. Director can edit secretaries and self. Secretary only self.
    const canEdit = isAdmin || 
                  (isDirector && (user.role === 'secretario' || user.id === userAuth?.uid)) ||
                  (isSecretary && user.id === userAuth?.uid);
    
    if (!canEdit) {
      setNotification({ type: 'err', message: 'Você não tem permissão para editar este perfil.' });
      return;
    }

    setSelectedUser(user);
    setFormData({
      email: user.email,
      name: user.name || user.full_name || '',
      role: user.role,
      status: user.status,
      avatar_url: user.avatar_url || ''
    });
    setNewEmail(user.email);
    setPasswordData({ newPassword: '', confirmPassword: '' });
    setShowWebcam(false);
    setIsEditing(true);
  };

  const handleAddNew = () => {
    setSelectedUser(null);
    setFormData({
      email: '',
      name: '',
      role: 'secretario',
      status: 'active',
      avatar_url: ''
    });
    setNewEmail('');
    setPasswordData({ newPassword: '', confirmPassword: '' });
    setShowWebcam(false);
    setIsEditing(true);
  };

  const handleCapture = async () => {
    if (!webcamRef.current) return;
    
    const imageSrc = webcamRef.current.getScreenshot();
    if (!imageSrc) return;

    try {
      setUploadingAvatar(true);
      // Convert base64 to blob
      const res = await fetch(imageSrc);
      const blob = await res.blob();
      const file = new File([blob], `webcam_${Date.now()}.jpg`, { type: 'image/jpeg' });
      
      const url = await uploadImage(file, 'avatars', `${Date.now()}_webcam.jpg`);
      setFormData(prev => ({ ...prev, avatar_url: url }));
      setNotification({ type: 'success', message: 'Foto capturada e salva!' });
      setShowWebcam(false);
    } catch (error) {
      setNotification({ type: 'err', message: 'Erro ao capturar foto.' });
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploadingAvatar(true);
      const url = await uploadImage(file, 'avatars', `${Date.now()}_${file.name}`);
      setFormData(prev => ({ ...prev, avatar_url: url }));
      setNotification({ type: 'success', message: 'Avatar carregado com sucesso!' });
    } catch (error) {
      setNotification({ type: 'err', message: 'Erro ao carregar avatar.' });
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleUpdateSecurity = async () => {
    if (!userAuth || userAuth.uid !== selectedUser?.id) return;
    
    setUpdatingSecurity(true);
    try {
      // 1. Update Email if changed
      if (newEmail !== userAuth.email && newEmail) {
        await verifyBeforeUpdateEmail(userAuth, newEmail);
        setNotification({ type: 'success', message: 'Verificação enviada para o novo e-mail!' });
      }

      // 2. Update Password if provided
      if (passwordData.newPassword) {
        if (passwordData.newPassword !== passwordData.confirmPassword) {
          throw new Error('As senhas não coincidem');
        }
        await updatePassword(userAuth, passwordData.newPassword);
        setNotification({ type: 'success', message: 'Senha atualizada com sucesso!' });
        setPasswordData({ newPassword: '', confirmPassword: '' });
      }
    } catch (error: any) {
      setNotification({ type: 'err', message: error.message });
    } finally {
      setUpdatingSecurity(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (selectedUser) {
        // Safety Check: Last Admin
        const activeAdmins = users.filter(u => u.role === 'admin' && u.status === 'active');
        const isEditingLastAdmin = selectedUser.role === 'admin' && 
                                  selectedUser.status === 'active' && 
                                  activeAdmins.length === 1 && 
                                  activeAdmins[0].id === selectedUser.id;

        const isDeactivatingOrChangingRole = formData.status === 'inactive' || formData.role !== 'admin';

        if (isEditingLastAdmin && isDeactivatingOrChangingRole) {
          throw new Error('Não é possível desativar ou alterar o cargo do único administrador ativo do sistema.');
        }

        // Sync name/full_name
        const updatePayload = {
          ...formData,
          full_name: formData.name,
          last_login: selectedUser.last_login || null,
          created_at: selectedUser.created_at,
          updated_at: new Date().toISOString()
        };

        // Security check: Prevent self-demotion
        if (userAuth?.uid === selectedUser.id) {
          if (formData.role !== 'admin' && selectedUser.role === 'admin') {
            throw new Error('Você não pode remover seu próprio privilégio de Administrador.');
          }
          if (formData.status !== 'active' && selectedUser.status === 'active') {
             // Inactivating self is risky, checking if last admin
             const activeAdmins = users.filter(u => u.role === 'admin' && u.status === 'active');
             if (activeAdmins.length === 1 && activeAdmins[0].id === userAuth.uid) {
               throw new Error('Você é o único administrador ativo do sistema e não pode desativar seu próprio perfil.');
             }
          }
        }

        // Security check: Protect last admin when editing others
        if (selectedUser.role === 'admin' && selectedUser.status === 'active') {
          const activeAdmins = users.filter(u => u.role === 'admin' && u.status === 'active');
          const isLeavingSystemWithoutAdmin = activeAdmins.length === 1 && 
                                           activeAdmins[0].id === selectedUser.id && 
                                           (formData.role !== 'admin' || formData.status !== 'active');
          
          if (isLeavingSystemWithoutAdmin) {
            throw new Error('Este é o único administrador ativo. Promova outro usuário a Administrador antes de alterar este perfil.');
          }
        }

        await saveData('users', selectedUser.id, updatePayload);
        
        // Handle security if it's the current user
        if (userAuth?.uid === selectedUser.id && (newEmail !== userAuth.email || passwordData.newPassword)) {
          await handleUpdateSecurity();
        }

        if (userAuth?.uid === selectedUser.id && refreshProfile) {
          await refreshProfile();
        }

        setNotification({ type: 'success', message: 'Usuário atualizado com sucesso!' });
      } else {
        // New user - Save to Firestore
        const emailId = formData.email.toLowerCase().trim();
        
        // 1. Check in current list first (performance)
        const existsLocally = users.find(u => u.email.toLowerCase() === emailId);
        if (existsLocally) {
          throw new Error('Este e-mail já possui um cadastro no sistema. Localize-o na lista para editar ou reativar.');
        }

        // 2. CHECK DEDICATED REGISTRY (CARTORIO DIGITAL)
        try {
          // Check by ID first (faster)
          const registryCheck = await fetchById('email_registry', emailId);
          if (registryCheck) {
            throw new Error('BLOQUEIO CENTRAL: Este e-mail já foi utilizado em um cadastro anterior. Por segurança, o sistema impede a reutilização imediata. Para liberar este e-mail, o administrador deve acessar o "Cartório de Registros" e remover o bloqueio.');
          }
        } catch (regErr: any) {
          if (regErr.message.includes('BLOQUEIO CENTRAL')) throw regErr;
          console.warn('Registro histórico não disponível:', regErr.message);
        }

        // 2. Double check by fetching across all sources (safety)
        try {
          // 2a. Check Firebase Authentication first
          try {
            const methods = await fetchSignInMethodsForEmail(auth, emailId);
            if (methods && methods.length > 0) {
              throw new Error('Este e-mail já possui uma conta de acesso ativa no sistema (Autenticação).');
            }
          } catch (authErr: any) {
             if (authErr.message?.includes('Autenticação')) throw authErr;
             console.log('Auth check skipped:', authErr.message);
          }

          // 2b. Check by ID (pre-registered)
          const preRegData = await fetchById('users', emailId);
          if (preRegData && preRegData.is_pre_registered === false && preRegData.id !== emailId) {
             throw new Error('Este e-mail já está vinculado a um perfil ativo no sistema (UID).');
          }

          // Check by email field
          const existingMatches = await fetchQuery('users', 'email', '==', emailId);
          if (existingMatches && existingMatches.length > 0) {
             const realProfile = existingMatches.find(m => m.id !== emailId);
             if (realProfile) {
               throw new Error('Este e-mail já está vinculado a um perfil ativo no sistema.');
             }
          }
        } catch (e: any) {
          if (e.message.includes('vinculado') || e.message.includes('ativa')) throw e;
        }

        // 3. Register in the global registry FIRST
        try {
          await saveData('email_registry', emailId, { 
            email: emailId, 
            registered_at: new Date().toISOString(),
            status: 'blocked'
          });
        } catch (regErr) {
          console.warn("Registry update failed, but proceeding.");
        }

        // 4. Save the user profile
        await saveData('users', emailId, {
          id: emailId,
          email: emailId,
          name: formData.name,
          role: formData.role,
          status: formData.status,
          created_at: new Date().toISOString(),
          is_pre_registered: true
        });
        setNotification({ type: 'success', message: 'Usuário pré-cadastrado com sucesso!' });
      }
      setIsEditing(false);
      fetchData();
    } catch (error: any) {
      setNotification({ type: 'err', message: error.message || 'Erro ao salvar usuário.' });
    } finally {
      setLoading(false);
      setTimeout(() => setNotification(null), 4000);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const targetUser = users.find(u => u.id === id);
      if (!targetUser) return;

      console.log('Iniciando exclusão do usuário:', id);
      setLoading(true);

      // Safety Check: Self-Deletion
      if (userAuth?.uid === id) {
        throw new Error('Você não pode excluir seu próprio perfil administrativo. Se deseja sair, outro administrador deve remover seu acesso.');
      }

      // Safety Check: Last Admin
      const activeAdmins = users.filter(u => u.role === 'admin' && u.status === 'active');
      const isDeletingLastAdmin = targetUser.role === 'admin' && 
                                 targetUser.status === 'active' && 
                                 activeAdmins.length === 1 && 
                                 activeAdmins[0].id === targetUser.id;

      if (isDeletingLastAdmin) {
        throw new Error('Não é possível excluir o único administrador ativo do sistema.');
      }

      await deleteData('users', id);
      
      // Limpeza do Cartório de E-mails para permitir recadastro futuro
      if (targetUser.email) {
        const emailToUnblock = targetUser.email.toLowerCase().trim();
        try {
          // No email_registry, o ID é o próprio e-mail
          await deleteData('email_registry', emailToUnblock);
          console.log(`[Segurança] E-mail ${emailToUnblock} liberado para novo uso.`);
        } catch (e) {
          console.log('E-mail não constava no registro central.');
        }

        // Extra safety: Try to delete by email too if it's different from ID (cleanup ghost profiles)
        if (emailToUnblock !== id.toLowerCase()) {
           try {
             await deleteData('users', emailToUnblock);
           } catch (e) {
             console.log('Sem perfil fantasma para limpar.');
           }
        }
      }
      
      setNotification({ type: 'success', message: 'Usuário removido com sucesso!' });
      setIsDeleting(null);
      fetchData();
    } catch (error: any) {
      console.error('Erro ao excluir usuário:', error);
      setNotification({ type: 'err', message: error.message || 'Falha ao excluir usuário. Verifique suas permissões.' });
      setIsDeleting(null);
      setLoading(false);
      setTimeout(() => setNotification(null), 8000);
      return; // Return early to avoid the finally notification clear if we want a specific duration
    } finally {
      if (loading) { // Only clear if we were loading (successful path)
        setLoading(false);
        setTimeout(() => setNotification(null), 4000);
      }
    }
  };

  const sortedUsers = [...users].sort((a, b) => {
    if (sortBy === 'name') {
      return (a.name || '').localeCompare(b.name || '');
    } else {
      return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
    }
  });

  const getRoleColor = (role: string, status?: string) => {
    if (status === 'inactive') return 'bg-slate-100 text-slate-500 border-slate-200';
    
    switch (role?.toLowerCase()) {
      case 'administrador':
        return 'bg-violet-50 text-violet-600 border-violet-100';
      case 'diretor':
        return 'bg-emerald-50 text-emerald-600 border-emerald-100';
      case 'secretario':
        return 'bg-amber-50 text-amber-600 border-amber-100';
      default:
        return 'bg-slate-50 text-slate-500 border-slate-100';
    }
  };

  const getRoleIconColor = (role: string, status?: string) => {
    if (status === 'inactive') return 'bg-slate-50 text-slate-400';
    
    switch (role?.toLowerCase()) {
      case 'administrador':
        return 'bg-violet-50 text-violet-500';
      case 'diretor':
        return 'bg-emerald-50 text-emerald-500';
      case 'secretario':
        return 'bg-amber-50 text-amber-500';
      default:
        return 'bg-slate-50 text-slate-400';
    }
  };

  const filteredUsers = sortedUsers.filter(u => {
    // 1. Search Filter
    const matchesSearch = (u.name || '').toLowerCase().includes(search.toLowerCase()) ||
                         (u.email || '').toLowerCase().includes(search.toLowerCase());
    
    if (!matchesSearch) return false;

    // 2. Role-Based Access Control (RBAC) Filter
    // ALWAYS permit self-visibility (Identification)
    const isSelf = u.id === userAuth?.uid || (u.email && userAuth?.email && u.email.toLowerCase() === userAuth?.email?.toLowerCase());
    if (isSelf) return true;

    if (isAdmin) return true; // Admin sees everyone
    
    if (isDirector) {
      // Director sees all secretaries
      return u.role === 'secretario';
    }
    
    // Secretary only sees themselves (already handled by isSelf above)
    return false;
  });

  const groupedUsers = React.useMemo(() => {
    if (groupBy === 'none') {
      return { 'Todos os Usuários': filteredUsers };
    }
    
    return filteredUsers.reduce((acc, user) => {
      const key = groupBy === 'role' ? user.role : user.status;
      const groupName = groupBy === 'role' 
        ? (key === 'admin' ? 'Administradores' : key === 'diretor' ? 'Diretoria' : 'Secretários')
        : (key === 'active' ? 'Ativos' : 'Inativos');
        
      if (!acc[groupName]) acc[groupName] = [];
      acc[groupName].push(user);
      return acc;
    }, {} as Record<string, UserProfile[]>);
  }, [filteredUsers, groupBy]);

  const activeUsers = users.filter(u => u.status === 'active').length;
  const suspendedUsers = users.filter(u => u.status === 'inactive').length;

  return (
    <div className="max-w-[1600px] mx-auto space-y-6 pb-6">
      {/* Dynamic Header & Stats Center */}
      <div className="flex flex-col gap-6">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <div className="w-1.5 h-6 bg-[#00174b] rounded-full" />
              <h2 className="text-2xl font-black text-[#131b2e] tracking-tight">
                {(isAdmin || isDirector) ? 'Controle de Acessos' : 'Meu Perfil'}
              </h2>
            </div>
            <p className="text-xs text-slate-500 font-medium ml-4">
              {(isAdmin || isDirector) ? 'Gerenciamento centralizado de credenciais e privilégios.' : 'Segurança e informações da sua conta institucional.'}
            </p>
          </div>
          
          {(isAdmin || isDirector) && (
            <div className="flex items-center gap-2">
              <button
                onClick={handleAddNew}
                className="px-6 py-3 bg-[#00174b] text-white rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-[#002a8a] transition-all shadow-lg active:scale-95 group"
              >
                <Plus size={14} className="group-hover:rotate-90 transition-transform" />
                Novo Gestor
              </button>
            </div>
          )}
        </header>

        {/* Operational Indicators - Compact */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <User size={20} />
            </div>
            <div>
              <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Base Total</p>
              <h4 className="text-xl font-black text-[#131b2e] leading-none">{users.length}</h4>
            </div>
          </div>
          
          <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 size={20} />
            </div>
            <div>
              <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Ativos</p>
              <h4 className="text-xl font-black text-[#131b2e] leading-none">{activeUsers}</h4>
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-red-50 text-red-600 flex items-center justify-center">
              <XCircle size={20} />
            </div>
            <div>
              <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Suspensos</p>
              <h4 className="text-xl font-black text-[#131b2e] leading-none">{suspendedUsers}</h4>
            </div>
          </div>

          <div className="bg-[#00174b] p-4 rounded-2xl shadow-lg flex items-center gap-4 text-white">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center backdrop-blur-md">
              <Shield size={20} />
            </div>
            <div>
              <p className="text-[8px] font-black text-white/50 uppercase tracking-widest">Segurança</p>
              <h4 className="text-xs font-black leading-tight">ISO-27001 Ativa</h4>
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {notification && (
          <motion.div 
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className="fixed top-6 left-1/2 -translate-x-1/2 z-[100] w-full max-w-md px-4"
          >
            <div className={cn(
              "p-6 rounded-2xl flex items-center justify-between shadow-2xl border-2",
              notification.type === 'success' ? "bg-emerald-50 text-emerald-800 border-emerald-100" : "bg-red-50 text-red-800 border-red-100"
            )}>
              <div className="flex items-center gap-4">
                <div className={cn(
                  "p-2 rounded-xl",
                  notification.type === 'success' ? "bg-emerald-500 text-white" : "bg-red-500 text-white"
                )}>
                  {notification.type === 'success' ? <CheckCircle2 size={24} /> : <XCircle size={24} />}
                </div>
                <div>
                  <h5 className="font-black text-sm uppercase tracking-widest leading-none mb-1">Status do Sistema</h5>
                  <p className="text-sm font-bold opacity-80 leading-tight">{notification.message}</p>
                </div>
              </div>
              <button onClick={() => setNotification(null)} className="hover:rotate-90 transition-transform p-2 ml-2">
                <X size={20} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content Area */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden min-h-[500px] flex flex-col">
        {/* Unified Search Bar - Refined */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-4 bg-slate-50/20">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input 
              type="text"
              placeholder="Pesquisar gestor..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-11 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-[#131b2e] focus:border-blue-400 focus:ring-4 focus:ring-blue-50 transition-all outline-none"
            />
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center bg-white border border-slate-200 rounded-xl px-2 py-1">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mr-2 ml-1">Ordem:</span>
              <button 
                onClick={() => setSortBy('name')}
                className={cn(
                  "px-2 py-1 rounded-lg text-[9px] font-bold transition-all",
                  sortBy === 'name' ? "bg-[#00174b] text-white" : "text-slate-400 hover:bg-slate-50"
                )}
              >
                NOME
              </button>
              <button 
                onClick={() => setSortBy('created_at')}
                className={cn(
                  "px-2 py-1 rounded-lg text-[9px] font-bold transition-all",
                  sortBy === 'created_at' ? "bg-[#00174b] text-white" : "text-slate-400 hover:bg-slate-50"
                )}
              >
                DATA
              </button>
            </div>

            <div className="flex items-center bg-white border border-slate-200 rounded-xl px-2 py-1">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mr-2 ml-1">Agrupar:</span>
              <button 
                onClick={() => setGroupBy('none')}
                className={cn(
                  "px-2 py-1 rounded-lg text-[9px] font-bold transition-all",
                  groupBy === 'none' ? "bg-[#00174b] text-white" : "text-slate-400 hover:bg-slate-50"
                )}
              >
                OFF
              </button>
              <button 
                onClick={() => setGroupBy('role')}
                className={cn(
                  "px-2 py-1 rounded-lg text-[9px] font-bold transition-all",
                  groupBy === 'role' ? "bg-[#00174b] text-white" : "text-slate-400 hover:bg-slate-50"
                )}
              >
                CARGO
              </button>
              <button 
                onClick={() => setGroupBy('status')}
                className={cn(
                  "px-2 py-1 rounded-lg text-[9px] font-bold transition-all",
                  groupBy === 'status' ? "bg-[#00174b] text-white" : "text-slate-400 hover:bg-slate-50"
                )}
              >
                STATUS
              </button>
            </div>

            <button 
              onClick={fetchData}
              className="p-2.5 bg-white text-slate-400 hover:text-blue-600 border border-slate-200 rounded-xl transition-all shadow-sm active:scale-95"
              title="Sincronizar"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            </button>
            <div className="h-6 w-px bg-slate-200 mx-1" />
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{filteredUsers.length} registros</span>
        </div>
      </div>

      {/* Enterprise Data Grid - Tightened */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden mb-6">
        <div className="overflow-x-auto">
          <table className="w-full text-left hidden md:table">
            <thead>
              <tr className="border-b border-slate-50">
                <th className="px-8 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest bg-slate-50/50">Identificação</th>
                <th className="px-8 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest bg-slate-50/50">Criação</th>
                <th className="px-8 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest bg-slate-50/50">Acesso</th>
                <th className="px-8 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest bg-slate-50/50 text-center">Status</th>
                <th className="px-8 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest bg-slate-50/50 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 text-[11px]">
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td colSpan={5} className="px-8 py-6">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-slate-100 rounded-xl" />
                        <div className="space-y-2 flex-1">
                          <div className="h-4 bg-slate-100 rounded w-1/4" />
                          <div className="h-3 bg-slate-100 rounded w-1/5" />
                        </div>
                      </div>
                    </td>
                  </tr>
                ))
              ) : Object.keys(groupedUsers).length > 0 ? (
                (Object.entries(groupedUsers) as [string, UserProfile[]][]).map(([group, groupItems]) => (
                  <React.Fragment key={group}>
                    {groupBy !== 'none' && (
                      <tr className="bg-slate-50/50">
                        <td colSpan={5} className="px-8 py-2 text-[10px] font-black text-slate-400 uppercase tracking-widest border-y border-slate-100">
                          {group} ({groupItems.length})
                        </td>
                      </tr>
                    )}
                    {groupItems.map(user => (
                      <tr key={user.id} className="hover:bg-blue-50/30 transition-all group">
                        <td className="px-8 py-4">
                          <div className="flex items-center gap-4">
                            <div className="relative shrink-0">
                              <div className={cn(
                              "w-11 h-11 rounded-xl bg-white flex items-center justify-center font-black text-lg border shadow-sm overflow-hidden transition-all",
                              getRoleIconColor(user.role || '', user.status),
                              (user.status === 'inactive') ? "grayscale opacity-60" : ""
                            )}>
                              {user.avatar_url ? (
                                <img src={user.avatar_url} alt="" className="w-full h-full object-cover" />
                              ) : (
                                user.name.charAt(0).toUpperCase()
                              )}
                            </div>
                            <div className={cn(
                              "absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full border-2 border-white",
                              (user.status === 'active') ? "bg-emerald-500 shadow-sm" : "bg-slate-300"
                            )} />
                          </div>
                          <div className="min-w-0">
                            <p className={cn(
                              "font-black text-sm leading-tight uppercase truncate max-w-[200px]",
                              (user.status === 'inactive') ? "text-slate-400" : "text-[#131b2e]"
                            )}>
                              {user.name}
                            </p>
                              <p className="text-[10px] font-bold text-slate-400 truncate max-w-[180px]">
                                {user.email}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-8 py-4">
                          <div className="flex flex-col">
                            <span className="text-[10px] font-bold text-slate-600">
                              {user.created_at ? new Date(user.created_at).toLocaleDateString('pt-BR') : 'N/D'}
                            </span>
                            <span className="text-[8px] font-black text-slate-400 uppercase tracking-tighter">
                              {user.created_at ? new Date(user.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''}
                            </span>
                          </div>
                        </td>
                        <td className="px-8 py-4">
                          <span className={cn(
                            "px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border",
                            getRoleColor(user.role || '', user.status)
                          )}>
                            {user.role}
                          </span>
                        </td>
                        <td className="px-8 py-4">
                          <div className="flex items-center justify-center gap-2">
                            <div className={cn(
                              "w-1.5 h-1.5 rounded-full",
                              user.status === 'active' ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-slate-300"
                            )} />
                            <span className={cn(
                              "text-[9px] font-black uppercase tracking-widest",
                              user.status === 'active' ? "text-emerald-700" : "text-slate-400"
                            )}>
                              {user.status === 'active' ? 'Ativo' : 'Inativo'}
                            </span>
                          </div>
                        </td>
                        <td className="px-8 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button 
                              onClick={() => handleEdit(user)}
                              className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                            >
                              <Edit2 size={16} />
                            </button>
                            {(isAdmin || (isDirector && user.role === 'secretario')) && user.id !== userAuth?.uid && (
                              <button 
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setIsDeleting(user.id);
                                }}
                                className="p-3 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all shadow-sm bg-white border border-slate-100"
                                title="Remover Usuário"
                              >
                                <Trash2 size={16} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </React.Fragment>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-10 py-24 text-center text-slate-300 italic font-medium text-sm">Nenhum registro localizado.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>

    {/* Mobile Card Layout - Enterprise Style */}
    <div className="md:hidden space-y-3">
        {filteredUsers.length > 0 ? (
          filteredUsers.map(user => (
            <div key={user.id} className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <div className={cn(
                      "w-10 h-10 rounded-xl bg-white border shadow-sm flex items-center justify-center text-lg font-black transition-all overflow-hidden",
                      getRoleIconColor(user.role || '', user.status),
                      (user.status === 'inactive') ? "grayscale opacity-60 border-slate-100" : ""
                    )}>
                      {user.avatar_url ? <img src={user.avatar_url} className="w-full h-full object-cover" /> : user.name.charAt(0).toUpperCase()}
                    </div>
                    <div className={cn("absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white", (user.status === 'active') ? "bg-emerald-500" : "bg-slate-300")} />
                  </div>
                  <div>
                    <h4 className={cn(
                      "font-black text-xs leading-tight uppercase tracking-tight",
                      (user.status === 'inactive') ? "text-slate-400" : "text-[#131b2e]"
                    )}>
                      {user.name}
                    </h4>
                    <p className="text-[10px] font-bold text-slate-400 truncate max-w-[150px]">{user.email}</p>
                  </div>
                </div>
                <span className={cn(
                  "px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-widest border",
                  getRoleColor(user.role || '', user.status)
                )}>
                  {user.role}
                </span>
              </div>
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-50">
                <button onClick={() => handleEdit(user)} className="px-4 py-2 bg-slate-50 text-blue-600 rounded-lg text-[9px] font-black flex items-center gap-2">
                  <Edit2 size={12} />
                  EDITAR
                </button>
                {(isAdmin || (isDirector && user.role === 'secretario')) && user.id !== userAuth?.uid && (
                  <button 
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setIsDeleting(user.id);
                    }}
                    className="p-3 text-red-500 bg-red-50 rounded-xl active:scale-95 transition-all"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            </div>
          ))
        ) : (
          <div className="bg-white p-12 rounded-2xl border border-slate-100 text-center">
            <p className="text-slate-400 font-bold text-xs uppercase tracking-widest italic">Nenhum registro localizado</p>
          </div>
        )}
      </div>

      {/* Confirmation Modal */}
      <AnimatePresence>
        {isDeleting && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-[#00174b]/40 backdrop-blur-sm"
              onClick={() => setIsDeleting(null)}
            />
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-[2rem] p-8 w-full max-w-md shadow-2xl relative z-10 space-y-6"
            >
              <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center text-red-500 mx-auto">
                <Trash2 size={32} />
              </div>
              <div className="text-center space-y-2">
                <h3 className="text-xl font-black text-[#131b2e] uppercase tracking-tight">Confirmar Exclusão</h3>
                <p className="text-sm text-slate-500 font-medium">
                  Deseja realmente remover este usuário? Esta ação é irreversível e removerá todo o acesso ao sistema.
                </p>
              </div>
              <div className="flex gap-4">
                <button 
                  onClick={() => setIsDeleting(null)}
                  className="flex-1 py-4 px-6 bg-slate-100 text-slate-600 rounded-2xl font-bold hover:bg-slate-200 transition-all"
                >
                  Cancelar
                </button>
                <button 
                  onClick={() => handleDelete(isDeleting)}
                  disabled={loading}
                  className="flex-1 py-4 px-6 bg-red-600 text-white rounded-2xl font-bold shadow-xl shadow-red-500/20 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2"
                >
                  {loading ? <Loader2 className="animate-spin" size={20} /> : 'Excluir'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* High-Performance Configuration Modal */}
      <AnimatePresence>
        {isEditing && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-8">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsEditing(false)}
              className="absolute inset-0 bg-[#00174b]/60 backdrop-blur-md"
            />
            
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-4xl bg-white rounded-[1.5rem] shadow-2xl flex flex-col md:flex-row max-h-[92vh] overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              {/* Left Column: Side Info */}
              <div className="w-full md:w-[280px] bg-slate-50 border-r border-slate-100 flex flex-col shrink-0">
                <div className="p-6 space-y-6">
                  {/* Photo Management - Refined */}
                  <div className="space-y-4 flex flex-col items-center text-center">
                    <div className="relative">
                      <div className="w-32 h-32 rounded-3xl bg-white flex items-center justify-center overflow-hidden border border-slate-200 shadow-lg relative bg-slate-50">
                        {showWebcam ? (
                          <Webcam
                            audio={false}
                            ref={webcamRef}
                            screenshotFormat="image/jpeg"
                            className="w-full h-full object-cover"
                            videoConstraints={{ facingMode: "user" }}
                            mirrored={true}
                            imageSmoothing={true}
                            screenshotQuality={0.92}
                            disablePictureInPicture={true}
                            forceScreenshotSourceSize={false}
                            onUserMedia={() => console.log('Camera active')}
                            onUserMediaError={() => setNotification({ type: 'err', message: 'Erro ao acessar webcam' })}
                          />
                        ) : formData.avatar_url ? (
                          <img src={formData.avatar_url} className="w-full h-full object-cover" alt="Profile" />
                        ) : (
                          <User className="text-slate-200" size={48} />
                        )}
                        {uploadingAvatar && (
                          <div className="absolute inset-0 bg-white/80 flex items-center justify-center z-10 transition-all">
                            <Loader2 className="animate-spin text-blue-600" size={24} />
                          </div>
                        )}
                      </div>
                      
                      <div className="absolute -bottom-1 -right-1 flex flex-col gap-1.5">
                        <label className="w-8 h-8 bg-[#00174b] text-white rounded-lg flex items-center justify-center shadow-md cursor-pointer hover:bg-blue-700 transition-all border-2 border-white">
                          <Camera size={14} />
                          <input type="file" className="hidden" accept="image/*" onChange={handleAvatarUpload} />
                        </label>
                        <button 
                          type="button"
                          onClick={() => setShowWebcam(!showWebcam)}
                          className={cn(
                            "w-8 h-8 rounded-lg flex items-center justify-center shadow-md transition-all border-2 border-white",
                            showWebcam ? "bg-red-500 text-white" : "bg-blue-600 text-white"
                          )}
                        >
                          {showWebcam ? <X size={14} /> : <Zap size={14} />}
                        </button>
                      </div>
                    </div>

                    {showWebcam && (
                      <button
                        type="button"
                        onClick={handleCapture}
                        disabled={uploadingAvatar}
                        className="px-4 py-1.5 bg-emerald-500 text-white rounded-lg text-[8px] font-black uppercase tracking-widest shadow-md hover:bg-emerald-600 transition-colors flex items-center gap-1"
                      >
                        <Camera size={12} />
                        Capturar
                      </button>
                    )}
                    
                    <div className="space-y-0.5 px-2 w-full truncate">
                        <h3 className="text-sm font-black text-[#131b2e] leading-tight truncate px-2">
                          {formData.name || (selectedUser ? 'Identidade' : 'Novo Perfil')}
                        </h3>
                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">
                          {selectedUser ? `ID: ${selectedUser.id}` : 'MODO DE CADASTRO'}
                        </p>
                    </div>
                  </div>

                  <div className="space-y-3 pt-6 border-t border-slate-100 flex-1">
                    <div className="p-4 bg-white rounded-2xl border border-slate-100 shadow-sm space-y-2 transition-all">
                       <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest opacity-60">Cargo Proposto</p>
                       <div className="flex items-center gap-3">
                         <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                            <Shield size={16} />
                         </div>
                         <span className="font-black text-[11px] text-[#131b2e] uppercase tracking-tight">
                            {formData.role === 'admin' ? 'Administrador' : formData.role === 'diretor' ? 'Diretoria' : 'Secretaria'}
                         </span>
                       </div>
                    </div>
                    <div className="p-4 bg-white rounded-2xl border border-slate-100 shadow-sm space-y-2 transition-all">
                       <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest opacity-60">Status Inicial</p>
                       <div className="flex items-center gap-3">
                         <div className={cn("w-2 h-2 rounded-full", formData.status === 'active' ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-slate-300")} />
                         <span className={cn("font-black text-[11px] uppercase tracking-tight", formData.status === 'active' ? "text-emerald-600" : "text-slate-400")}>
                           {formData.status === 'active' ? 'Ativo / Autorizado' : 'Suspenso / Bloqueado'}
                         </span>
                       </div>
                    </div>
                  </div>
                </div>

                <div className="mt-auto p-6 border-t border-slate-100 bg-slate-50/50">
                    <p className="text-[8px] text-slate-400 font-bold leading-tight">
                      Painel de controle institucional. As ações são registradas conforme LGPD.
                    </p>
                </div>
              </div>

              {/* Right Column: Configuration Controls */}
              <div className="flex-1 flex flex-col bg-white overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white z-10 shrink-0">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-8 h-8 rounded-lg flex items-center justify-center",
                      selectedUser ? "bg-blue-50 text-blue-600" : "bg-emerald-50 text-emerald-600"
                    )}>
                       {selectedUser ? <Edit2 size={16} /> : <Plus size={16} />}
                    </div>
                    <h4 className="text-sm font-black text-[#131b2e] uppercase tracking-tight">
                      {selectedUser ? 'Preferências de Perfil' : 'Cadastro de Novo Usuário'}
                    </h4>
                  </div>
                  <button 
                    onClick={() => setIsEditing(false)}
                    className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg transition-all"
                  >
                    <X size={20} />
                  </button>
                </div>

                <div className="p-6 flex-1 overflow-y-auto">
                  <form id="user-form" onSubmit={handleSave} className="space-y-5">
                    <section className="space-y-4">
                       <div className="flex items-center gap-2">
                         <div className="px-2 py-0.5 bg-[#131b2e] text-white text-[7px] font-black rounded-md uppercase tracking-widest">01</div>
                         <h5 className="text-[10px] font-black text-[#131b2e] uppercase tracking-widest">Identificação</h5>
                       </div>

                       <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Nome Completo</label>
                            <input 
                              required
                              type="text"
                              value={formData.name}
                              onChange={e => setFormData({...formData, name: e.target.value})}
                              placeholder="Digite o nome..."
                              className="w-full px-4 py-2 bg-slate-50 border border-slate-100 rounded-xl text-[11px] font-bold text-[#131b2e] focus:bg-white focus:border-blue-200 transition-all outline-none"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">E-mail Corporativo</label>
                            <input 
                              required
                              type="email"
                              value={formData.email}
                              onChange={e => setFormData({...formData, email: e.target.value})}
                              placeholder="corporativo@escola.com.br"
                              className="w-full px-4 py-2 bg-slate-50 border border-slate-100 rounded-xl text-[11px] font-bold text-[#131b2e] focus:bg-white focus:border-blue-200 transition-all outline-none"
                            />
                          </div>
                       </div>
                    </section>

                    {(isAdmin || isDirector) && (
                      <section className="space-y-4">
                         <div className="flex items-center gap-2">
                           <div className="px-2 py-0.5 bg-blue-600 text-white text-[7px] font-black rounded-md uppercase tracking-widest">02</div>
                           <h5 className="text-[10px] font-black text-[#131b2e] uppercase tracking-widest">Acesso e Privilégios</h5>
                         </div>

                         <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-1">
                              <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Cargo</label>
                              <div className="relative">
                                <select
                                  value={formData.role}
                                  onChange={e => setFormData({...formData, role: e.target.value as UserRole})}
                                  className="w-full px-4 py-2 bg-slate-50 border border-slate-100 rounded-xl text-[11px] font-bold text-[#131b2e] appearance-none focus:bg-white focus:border-blue-200 transition-all outline-none cursor-pointer"
                                >
                                  <option value="admin">Administrador Geral</option>
                                  <option value="diretor">Diretoria Escola</option>
                                  <option value="secretario">Equipe Secretaria</option>
                                </select>
                                <ChevronDown size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                              </div>
                            </div>
                            <div className="space-y-1">
                              <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Estado</label>
                              <div className="relative">
                                <select
                                  value={formData.status}
                                  onChange={e => setFormData({...formData, status: e.target.value as any})}
                                  className="w-full px-4 py-2 bg-slate-50 border border-slate-100 rounded-xl text-[11px] font-bold text-[#131b2e] appearance-none focus:bg-white focus:border-blue-200 transition-all outline-none cursor-pointer"
                                >
                                  <option value="active">✓ AUTORIZADO</option>
                                  <option value="inactive">✕ SUSPENSO</option>
                                </select>
                                <ChevronDown size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                              </div>
                            </div>
                         </div>
                      </section>
                    )}

                    {(selectedUser && userAuth?.uid === selectedUser.id) && (
                      <section className="space-y-4 p-4 bg-orange-50/50 rounded-2xl border border-orange-100">
                         <div className="flex items-center gap-2">
                           <div className="px-2 py-0.5 bg-orange-600 text-white text-[7px] font-black rounded-md uppercase tracking-widest">03</div>
                           <h5 className="text-[10px] font-black text-orange-950 uppercase tracking-widest">Segurança (Auto-Gestão)</h5>
                         </div>

                         <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-1">
                              <label className="text-[8px] font-black text-orange-800/60 uppercase tracking-widest ml-1">Nova Senha</label>
                              <div className="relative">
                                <input 
                                  type="password"
                                  value={passwordData.newPassword}
                                  onChange={e => setPasswordData({...passwordData, newPassword: e.target.value})}
                                  placeholder="••••••••"
                                  className="w-full px-4 py-2 bg-white border border-orange-200 rounded-xl text-[11px] font-bold text-[#131b2e] focus:border-orange-400 outline-none transition-all pr-10"
                                />
                                <Key size={12} className="absolute right-4 top-1/2 -translate-y-1/2 text-orange-300" />
                              </div>
                            </div>
                            <div className="space-y-1">
                              <label className="text-[8px] font-black text-orange-800/60 uppercase tracking-widest ml-1">Confirmar</label>
                              <div className="relative">
                                <input 
                                  type="password"
                                  value={passwordData.confirmPassword}
                                  onChange={e => setPasswordData({...passwordData, confirmPassword: e.target.value})}
                                  placeholder="••••••••"
                                  className="w-full px-4 py-2 bg-white border border-orange-200 rounded-xl text-[11px] font-bold text-[#131b2e] focus:border-orange-400 outline-none transition-all pr-10"
                                />
                                <Key size={12} className="absolute right-4 top-1/2 -translate-y-1/2 text-orange-300" />
                              </div>
                            </div>
                         </div>
                      </section>
                    )}

                    {(selectedUser && isAdmin && userAuth?.uid !== selectedUser.id) && (
                      <section className="space-y-4 p-4 bg-blue-50/50 rounded-2xl border border-blue-100">
                         <div className="flex items-center gap-2">
                           <div className="px-2 py-0.5 bg-blue-600 text-white text-[7px] font-black rounded-md uppercase tracking-widest">03</div>
                           <h5 className="text-[10px] font-black text-blue-950 uppercase tracking-widest">Acesso de Administrador</h5>
                         </div>
                         
                         <div className="p-4 bg-white rounded-xl border border-blue-100 space-y-3">
                           <p className="text-[10px] font-medium text-slate-500 leading-relaxed">
                             Como administrador, você pode solicitar a redefinição de senha para este usuário. Um e-mail de recuperação para o sistema <span className="font-bold text-blue-600">ESCMIN</span> será enviado para <span className="font-bold text-blue-600">{selectedUser.email}</span>.
                           </p>
                           <button
                             type="button"
                             onClick={() => handleResetPassword(selectedUser.email)}
                             disabled={sendingReset}
                             className="w-full py-3 bg-blue-600 text-white rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-blue-700 shadow-md flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                           >
                             {sendingReset ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                             Enviar E-mail de Redefinição
                           </button>
                         </div>
                      </section>
                    )}
                  </form>
                </div>

                {/* Footer Controls */}
                <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between shrink-0">
                  <button 
                    onClick={() => setIsEditing(false)}
                    className="px-4 py-2 text-slate-400 hover:text-slate-600 font-bold uppercase tracking-widest text-[8px] transition-all"
                  >
                    Descartar
                  </button>
                  <button 
                    form="user-form"
                    type="submit"
                    disabled={loading}
                    className="px-6 py-2.5 bg-[#00174b] text-white rounded-xl font-bold uppercase tracking-widest text-[9px] hover:bg-blue-800 shadow-lg flex items-center gap-2 disabled:opacity-50 transition-all"
                  >
                    {loading ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                    {selectedUser ? 'Aplicar Modificações' : 'Confirmar Cadastro'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
