import React, { useState, useEffect } from 'react';
import { 
  Shield, 
  Plus, 
  Search, 
  Edit2, 
  Trash2, 
  Save, 
  X, 
  Loader2,
  Mail,
  User,
  MoreVertical,
  CheckCircle2,
  XCircle,
  Key,
  Camera,
  RefreshCw,
  ChevronDown
} from 'lucide-react';
import { db, fetchAll, saveData, deleteData, uploadImage } from '../lib/firebase';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { UserProfile, UserRole } from '../types';
import { updatePassword, verifyBeforeUpdateEmail } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';

export function Users() {
  const { user, profile: currentProfile, refreshProfile, isAdmin } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'err', message: string } | null>(null);

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

  const fetchData = async () => {
    try {
      setLoading(true);
      let data = await fetchAll('users', 'name') as UserProfile[];
      
      // If not admin, only show self
      if (!isAdmin && user) {
        data = data.filter(u => u.id === user.uid);
      }
      
      setUsers(data || []);
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleEdit = (user: UserProfile) => {
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
    setIsEditing(true);
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
    if (!user || user.uid !== selectedUser?.id) return;
    
    setUpdatingSecurity(true);
    try {
      // 1. Update Email if changed
      if (newEmail !== user.email && newEmail) {
        await verifyBeforeUpdateEmail(user, newEmail);
        setNotification({ type: 'success', message: 'Verificação enviada para o novo e-mail!' });
      }

      // 2. Update Password if provided
      if (passwordData.newPassword) {
        if (passwordData.newPassword !== passwordData.confirmPassword) {
          throw new Error('As senhas não coincidem');
        }
        await updatePassword(user, passwordData.newPassword);
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

        await saveData('users', selectedUser.id, updatePayload);
        
        // Handle security if it's the current user
        if (user?.uid === selectedUser.id && (newEmail !== user.email || passwordData.newPassword)) {
          await handleUpdateSecurity();
        }

        if (user?.uid === selectedUser.id && refreshProfile) {
          await refreshProfile();
        }

        setNotification({ type: 'success', message: 'Usuário atualizado com sucesso!' });
      } else {
        // New user - Save to Firestore
        // Use email as ID for pre-registered users to facilitate linking on first login
        const emailId = formData.email.toLowerCase().trim();
        await saveData('users', emailId, {
          id: emailId,
          email: emailId,
          name: formData.name,
          role: formData.role,
          status: formData.status,
          created_at: new Date().toISOString(),
          is_pre_registered: true
        });
        setNotification({ type: 'success', message: 'Usuário pré-cadastrado! Ele deve agora criar sua conta com este e-mail.' });
      }
      setIsEditing(false);
      fetchData();
    } catch (error: any) {
      setNotification({ type: 'err', message: error.message || 'Erro ao salvar usuário.' });
    } finally {
      setLoading(false);
      setTimeout(() => setNotification(null), 3000);
    }
  };

  const handleDelete = async (id: string) => {
    const targetUser = users.find(u => u.id === id);
    if (!targetUser) return;

    if (!confirm(`Tem certeza que deseja excluir o usuário ${targetUser.name}?`)) return;

    try {
      setLoading(true);

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
      setNotification({ type: 'success', message: 'Usuário removido com sucesso!' });
      fetchData();
    } catch (error: any) {
      setNotification({ type: 'err', message: error.message || 'Erro ao excluir usuário.' });
    } finally {
      setLoading(false);
      setTimeout(() => setNotification(null), 3000);
    }
  };

  const filteredUsers = users.filter(u => 
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  );

  const activeUsers = users.filter(u => u.status === 'active').length;
  const suspendedUsers = users.filter(u => u.status === 'inactive').length;

  return (
    <div className="max-w-[1600px] mx-auto space-y-10 pb-10">
      {/* Dynamic Header & Stats Center */}
      <div className="flex flex-col gap-8">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-2.5 h-8 bg-[#00174b] rounded-full shadow-[0_0_15px_rgba(0,23,75,0.2)]" />
              <h2 className="text-4xl font-black text-[#131b2e] tracking-tight">
                {isAdmin ? 'Controle de Acessos' : 'Meu Perfil'}
              </h2>
            </div>
            <p className="text-slate-500 font-medium ml-5">
              {isAdmin ? 'Gerenciamento centralizado de credenciais e privilégios da equipe.' : 'Segurança e informações da sua conta institucional.'}
            </p>
          </div>
          
          {isAdmin && (
            <button
              onClick={handleAddNew}
              className="px-8 py-4 bg-[#00174b] text-white rounded-2xl text-sm font-black uppercase tracking-widest flex items-center justify-center gap-3 hover:scale-[1.03] active:scale-95 transition-all shadow-2xl shadow-blue-900/20 group"
            >
              <div className="w-6 h-6 rounded-lg bg-white/10 flex items-center justify-center group-hover:rotate-90 transition-transform">
                <Plus size={18} />
              </div>
              Novo Gestor
            </button>
          )}
        </header>

        {/* Operational Indicators */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex items-center gap-5">
            <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center shadow-inner">
              <User size={28} />
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Base Total</p>
              <h4 className="text-2xl font-black text-[#131b2e]">{users.length}</h4>
            </div>
          </div>
          
          <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex items-center gap-5">
            <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shadow-inner">
              <CheckCircle2 size={28} />
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Ativos</p>
              <h4 className="text-2xl font-black text-[#131b2e]">{activeUsers}</h4>
            </div>
          </div>

          <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex items-center gap-5">
            <div className="w-14 h-14 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center shadow-inner">
              <XCircle size={28} />
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Suspensos</p>
              <h4 className="text-2xl font-black text-[#131b2e]">{suspendedUsers}</h4>
            </div>
          </div>

          <div className="bg-gradient-to-br from-[#00174b] to-[#002a8a] p-6 rounded-[2rem] shadow-xl flex items-center gap-5 text-white">
            <div className="w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center backdrop-blur-md">
              <Shield size={28} />
            </div>
            <div>
              <p className="text-[10px] font-black text-white/50 uppercase tracking-widest">Segurança</p>
              <h4 className="text-lg font-black leading-tight">ISO-27001 Protegido</h4>
            </div>
          </div>
        </div>
      </div>

      {notification && (
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className={cn(
            "p-6 rounded-2xl flex items-center justify-between shadow-lg border-2",
            notification.type === 'success' ? "bg-emerald-50 text-emerald-800 border-emerald-100" : "bg-red-50 text-red-800 border-red-100"
          )}
        >
          <div className="flex items-center gap-4">
            <div className={cn(
              "p-2 rounded-xl",
              notification.type === 'success' ? "bg-emerald-500 text-white" : "bg-red-500 text-white"
            )}>
              {notification.type === 'success' ? <CheckCircle2 size={24} /> : <XCircle size={24} />}
            </div>
            <div>
              <h5 className="font-black text-sm uppercase tracking-widest leading-none mb-1">Status do Sistema</h5>
              <p className="text-sm font-bold opacity-80">{notification.message}</p>
            </div>
          </div>
          <button onClick={() => setNotification(null)} className="hover:rotate-90 transition-transform p-2">
            <X size={20} />
          </button>
        </motion.div>
      )}

      {/* Main Content Area */}
      <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-200/50 overflow-hidden">
        {/* Unified Search & Control Bar */}
        <div className="p-8 border-b border-slate-100 flex flex-col md:flex-row items-center gap-6 bg-slate-50/30">
          <div className="relative group flex-1 w-full">
            <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-600 transition-colors" size={20} />
            <input 
              type="text"
              placeholder="Pesquisar gestor por nome, e-mail ou identificador..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-16 pr-6 py-5 bg-white border-2 border-transparent rounded-2xl text-base font-bold text-[#131b2e] focus:ring-8 focus:ring-blue-500/5 focus:border-blue-200 transition-all shadow-sm"
            />
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button 
              onClick={fetchData}
              className="p-5 bg-white text-slate-400 hover:text-blue-600 border border-slate-100 rounded-2xl transition-all shadow-sm active:scale-95"
            >
              <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
            </button>
            <div className="h-10 w-px bg-slate-200" />
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] px-2 italic">Resultados: {filteredUsers.length}</p>
          </div>
        </div>

        {/* Enterprise Data Grid */}
        <div className="overflow-x-auto">
          {/* Desktop Table */}
          <table className="w-full text-left hidden md:table">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="px-10 py-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Identificação</th>
                <th className="px-10 py-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Perfil de Acesso</th>
                <th className="px-10 py-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Estado Operacional</th>
                <th className="px-10 py-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] text-right">Controles</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td colSpan={4} className="px-10 py-10">
                      <div className="flex items-center gap-6">
                        <div className="w-16 h-16 bg-slate-50 rounded-2xl border-2 border-white shadow-sm" />
                        <div className="space-y-3 flex-1">
                          <div className="h-6 bg-slate-50 rounded-full w-1/3" />
                          <div className="h-4 bg-slate-50 rounded-full w-1/4" />
                        </div>
                      </div>
                    </td>
                  </tr>
                ))
              ) : filteredUsers.length > 0 ? (
                filteredUsers.map(user => (
                  <tr key={user.id} className="hover:bg-blue-50/30 transition-all group border-b border-slate-50 last:border-0 group">
                    <td className="px-10 py-8">
                      <div className="flex items-center gap-6">
                        <div className="relative shrink-0">
                          <div className={cn(
                            "w-16 h-16 rounded-[1.25rem] bg-white flex items-center justify-center text-[#00174b] font-black text-2xl border-2 shadow-sm overflow-hidden transition-all duration-500 group-hover:scale-110",
                            user.status === 'active' ? "border-slate-100" : "border-slate-100 grayscale opacity-50"
                          )}>
                            {user.avatar_url ? (
                              <img src={user.avatar_url} alt="" className="w-full h-full object-cover" />
                            ) : (
                              user.name.charAt(0).toUpperCase()
                            )}
                          </div>
                          <div className={cn(
                            "absolute -bottom-1 -right-1 w-6 h-6 rounded-full border-[3px] border-white shadow-md",
                            user.status === 'active' ? "bg-emerald-500" : "bg-slate-300"
                          )} />
                        </div>
                        <div className="min-w-0">
                          <p className="font-black text-[#131b2e] text-lg leading-tight group-hover:text-blue-600 transition-colors uppercase tracking-tight truncate max-w-[300px]">
                            {user.name}
                          </p>
                          <div className="flex items-center gap-2 mt-1.5">
                            <Mail size={12} className="text-slate-400" />
                            <p className="text-sm font-bold text-slate-500 truncate max-w-[250px]">
                              {user.email}
                            </p>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-10 py-8">
                      <div className={cn(
                        "px-5 py-2.5 rounded-2xl text-[11px] font-black uppercase tracking-[0.15em] text-center w-fit border-2 shadow-sm",
                        user.role === 'admin' ? "bg-purple-50 text-purple-700 border-purple-100" :
                        user.role === 'diretor' ? "bg-amber-50 text-amber-700 border-amber-100" : 
                        "bg-blue-50 text-blue-700 border-blue-100"
                      )}>
                        {user.role === 'admin' ? 'Administrador do Sistema' : user.role === 'diretor' ? 'Diretoria Executiva' : 'Membro Secretaria'}
                      </div>
                    </td>
                    <td className="px-10 py-8">
                      <div className="flex items-center gap-4">
                        <div className={cn(
                          "w-3 h-3 rounded-full",
                          user.status === 'active' ? "bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.5)] animate-pulse" : "bg-slate-300"
                        )} />
                        <span className={cn(
                          "text-xs font-black uppercase tracking-widest",
                          user.status === 'active' ? "text-emerald-700" : "text-slate-400"
                        )}>
                          {user.status === 'active' ? 'Operacional' : 'Acesso Suspenso'}
                        </span>
                      </div>
                    </td>
                    <td className="px-10 py-8 text-right">
                      <div className="flex items-center justify-end gap-3 transition-all">
                        <button 
                          onClick={() => handleEdit(user)}
                          className="p-4 text-slate-400 hover:text-blue-600 hover:bg-blue-100 rounded-2xl transition-all active:scale-90 shadow-sm border border-transparent hover:border-blue-100"
                          title="Gerenciar Dados"
                        >
                          <Edit2 size={24} />
                        </button>
                        {isAdmin && (
                          <button 
                            onClick={() => handleDelete(user.id)}
                            className="p-4 text-slate-400 hover:text-red-600 hover:bg-red-100 rounded-2xl transition-all active:scale-90 shadow-sm border border-transparent hover:border-red-100"
                            title="Remover Acesso"
                          >
                            <Trash2 size={24} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="px-10 py-32 text-center text-slate-300 italic font-medium text-lg">Nenhum registro localizado no sistema.</td>
                </tr>
              )}
            </tbody>
          </table>

          {/* Mobile Card Layout */}
          <div className="md:hidden divide-y divide-slate-100">
            {filteredUsers.map(user => (
              <div key={user.id} className="p-8 space-y-6">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-4">
                    <div className="relative">
                      <div className="w-16 h-16 rounded-2xl bg-white border-2 border-slate-100 shadow-sm flex items-center justify-center text-2xl font-black text-[#00174b]">
                        {user.avatar_url ? <img src={user.avatar_url} className="w-full h-full object-cover" /> : user.name.charAt(0)}
                      </div>
                      <div className={cn("absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-[3px] border-white", user.status === 'active' ? "bg-emerald-500" : "bg-slate-300")} />
                    </div>
                    <div>
                      <h4 className="font-black text-[#131b2e] leading-tight uppercase tracking-tight">{user.name}</h4>
                      <p className="text-xs font-bold text-slate-400 truncate max-w-[150px]">{user.email}</p>
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-4 pt-4 border-t border-slate-50">
                   <span className={cn(
                        "px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border",
                        user.role === 'admin' ? "bg-purple-50 text-purple-700 border-purple-100" :
                        user.role === 'diretor' ? "bg-amber-50 text-amber-700 border-amber-100" : 
                        "bg-blue-50 text-blue-700 border-blue-100"
                      )}>
                        {user.role}
                      </span>
                  <div className="flex items-center gap-2">
                    <button onClick={() => handleEdit(user)} className="p-3 bg-slate-50 text-blue-600 rounded-xl shadow-sm"><Edit2 size={20} /></button>
                    {isAdmin && <button onClick={() => handleDelete(user.id)} className="p-3 bg-slate-50 text-red-600 rounded-xl shadow-sm"><Trash2 size={20} /></button>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

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
              initial={{ opacity: 0, scale: 0.9, y: 40 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 40 }}
              className="relative w-full max-w-6xl bg-white rounded-[3rem] shadow-[0_32px_64px_-16px_rgba(0,23,75,0.4)] overflow-hidden flex flex-col md:flex-row h-[90vh] md:max-h-[850px]"
              onClick={e => e.stopPropagation()}
            >
              {/* Left Column: Personality & Meta-Data */}
              <div className="w-full md:w-[380px] bg-slate-50 border-r border-slate-100 flex flex-col overflow-y-auto shrink-0">
                <div className="p-10 space-y-10">
                  {/* Photo Management */}
                  <div className="space-y-6 flex flex-col items-center text-center">
                    <div className="relative group">
                      <div className="w-48 h-48 rounded-[3.5rem] bg-white flex items-center justify-center overflow-hidden border-8 border-white shadow-2xl relative">
                        {formData.avatar_url ? (
                          <img src={formData.avatar_url} className="w-full h-full object-cover" alt="Profile" />
                        ) : (
                          <User className="text-slate-200" size={80} />
                        )}
                        {uploadingAvatar && (
                          <div className="absolute inset-0 bg-white/80 flex items-center justify-center transition-all">
                            <Loader2 className="animate-spin text-blue-600" size={40} />
                          </div>
                        )}
                      </div>
                      <label className="absolute -bottom-2 -right-2 w-14 h-14 bg-[#00174b] text-white rounded-2xl flex items-center justify-center shadow-lg cursor-pointer hover:scale-110 active:scale-95 transition-all border-4 border-white">
                        <Camera size={24} />
                        <input type="file" className="hidden" accept="image/*" onChange={handleAvatarUpload} />
                      </label>
                    </div>
                    
                    <div className="space-y-2">
                        <h3 className="text-2xl font-black text-[#131b2e] leading-tight">
                          {formData.name || 'Identidade Visual'}
                        </h3>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] leading-relaxed">
                          {selectedUser ? `ID OPERACIONAL: ${selectedUser.id}` : 'CONFIGURAÇÃO DE NOVO PERFIL'}
                        </p>
                    </div>
                  </div>

                  {/* Operational Summary */}
                  <div className="space-y-4 pt-4">
                    <div className="p-6 bg-white rounded-3xl border border-slate-200 shadow-sm space-y-2">
                       <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Nível de Acesso Institucional</p>
                       <div className="flex items-center gap-3">
                         <Shield size={18} className="text-blue-600" />
                         <span className="font-black text-sm text-[#131b2e] uppercase tracking-tight">
                           {formData.role === 'admin' ? 'Administrador Pleno' : formData.role === 'diretor' ? 'Diretoria Estratégica' : 'Corpo Secretariado'}
                         </span>
                       </div>
                    </div>

                    <div className="p-6 bg-white rounded-3xl border border-slate-200 shadow-sm space-y-2">
                       <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Estado de Disponibilidade</p>
                       <div className="flex items-center gap-3">
                         <div className={cn("w-3 h-3 rounded-full", formData.status === 'active' ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-slate-300")} />
                         <span className={cn("font-black text-sm uppercase tracking-tight", formData.status === 'active' ? "text-emerald-600" : "text-slate-400")}>
                           {formData.status === 'active' ? 'Ativo no Ecossistema' : 'Acesso Interrompido'}
                         </span>
                       </div>
                    </div>
                  </div>
                </div>

                <div className="mt-auto p-10 border-t border-slate-100 bg-slate-100/50">
                    <p className="text-[10px] text-slate-400 font-bold leading-relaxed">
                      Este painel gerencia privilégios críticos de segurança. Toda alteração é auditada e registrada nos logs de sistema para conformidade com a LGPD.
                    </p>
                </div>
              </div>

              {/* Right Column: Configuration Controls */}
              <div className="flex-1 flex flex-col bg-white overflow-y-auto">
                {/* Fixed Action Header */}
                <div className="px-10 py-8 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white/80 backdrop-blur-md z-10">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                       <Plus size={20} />
                    </div>
                    <h4 className="text-lg font-black text-[#131b2e] uppercase tracking-tight">Parâmetros de Configuração</h4>
                  </div>
                  <button 
                    onClick={() => setIsEditing(false)}
                    className="p-3 bg-slate-50 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-2xl transition-all"
                  >
                    <X size={24} />
                  </button>
                </div>

                <div className="p-10 flex-1">
                  <form id="user-form" onSubmit={handleSave} className="space-y-12">
                    {/* Identification Block */}
                    <section className="space-y-8">
                       <div className="flex items-center gap-4">
                         <div className="px-3 py-1 bg-[#131b2e] text-white text-[10px] font-black rounded-lg uppercase tracking-widest">01</div>
                         <h5 className="text-sm font-black text-[#131b2e] uppercase tracking-widest">Identificação Civil e Digital</h5>
                       </div>

                       <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                          <div className="space-y-3">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nome Completo do Portador</label>
                            <input 
                              required
                              type="text"
                              value={formData.name}
                              onChange={e => setFormData({...formData, name: e.target.value})}
                              placeholder="Ex: João da Silva Santos"
                              className="w-full px-6 py-5 bg-slate-50 border-2 border-transparent rounded-2xl text-base font-bold text-[#131b2e] focus:bg-white focus:border-blue-200 transition-all outline-none"
                            />
                          </div>
                          <div className="space-y-3">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Endereço de E-mail Corporativo</label>
                            <input 
                              required
                              type="email"
                              value={formData.email}
                              onChange={e => setFormData({...formData, email: e.target.value})}
                              placeholder="corporativo@escola.com.br"
                              className="w-full px-6 py-5 bg-slate-50 border-2 border-transparent rounded-2xl text-base font-bold text-[#131b2e] focus:bg-white focus:border-blue-200 transition-all outline-none"
                            />
                          </div>
                       </div>
                    </section>

                    {/* Hierarchy Block */}
                    {isAdmin && (
                      <section className="space-y-8">
                         <div className="flex items-center gap-4">
                           <div className="px-3 py-1 bg-blue-600 text-white text-[10px] font-black rounded-lg uppercase tracking-widest">02</div>
                           <h5 className="text-sm font-black text-[#131b2e] uppercase tracking-widest">Hierarquia e Privilégios</h5>
                         </div>

                         <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div className="space-y-3">
                              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Cargo no Ecossistema</label>
                              <div className="relative">
                                <select
                                  value={formData.role}
                                  onChange={e => setFormData({...formData, role: e.target.value as UserRole})}
                                  className="w-full px-6 py-5 bg-slate-50 border-2 border-transparent rounded-2xl text-base font-bold text-[#131b2e] appearance-none focus:bg-white focus:border-blue-200 transition-all outline-none"
                                >
                                  <option value="admin">Administrador Geral do Sistema</option>
                                  <option value="diretor">Diretoria Escola / Mantenedora</option>
                                  <option value="secretario">Equipe Secretaria e Atendimento</option>
                                </select>
                                <ChevronDown size={20} className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                              </div>
                            </div>
                            <div className="space-y-3">
                              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Estado da Credencial</label>
                              <div className="relative">
                                <select
                                  value={formData.status}
                                  onChange={e => setFormData({...formData, status: e.target.value as any})}
                                  className="w-full px-6 py-5 bg-slate-50 border-2 border-transparent rounded-2xl text-base font-bold text-[#131b2e] appearance-none focus:bg-white focus:border-blue-200 transition-all outline-none"
                                >
                                  <option value="active">✓ AUTORIZADO (Acesso Total)</option>
                                  <option value="inactive">✕ SUSPENSO (Sem Acesso)</option>
                                </select>
                                <ChevronDown size={20} className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                              </div>
                            </div>
                         </div>
                      </section>
                    )}

                    {/* Security Hardening Block */}
                    {(selectedUser && user?.uid === selectedUser.id) && (
                      <section className="space-y-8 p-10 bg-orange-50/50 rounded-[2.5rem] border border-orange-100 shadow-inner">
                         <div className="flex items-center gap-4">
                           <div className="px-3 py-1 bg-orange-600 text-white text-[10px] font-black rounded-lg uppercase tracking-widest">03</div>
                           <h5 className="text-sm font-black text-orange-950 uppercase tracking-widest">Fortalecimento de Segurança</h5>
                         </div>

                         <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div className="space-y-3">
                              <label className="text-[10px] font-black text-orange-800/60 uppercase tracking-widest ml-1">Nova Senha Complexa</label>
                              <div className="relative">
                                <input 
                                  type="password"
                                  value={passwordData.newPassword}
                                  onChange={e => setPasswordData({...passwordData, newPassword: e.target.value})}
                                  placeholder="••••••••••••"
                                  className="w-full px-6 py-5 bg-white border-2 border-orange-200/50 rounded-2xl text-base font-bold text-[#131b2e] focus:border-orange-400 outline-none transition-all pr-12"
                                />
                                <Key size={18} className="absolute right-6 top-1/2 -translate-y-1/2 text-orange-300" />
                              </div>
                            </div>
                            <div className="space-y-3">
                              <label className="text-[10px] font-black text-orange-800/60 uppercase tracking-widest ml-1">Confirmar Nova Senha</label>
                              <div className="relative">
                                <input 
                                  type="password"
                                  value={passwordData.confirmPassword}
                                  onChange={e => setPasswordData({...passwordData, confirmPassword: e.target.value})}
                                  placeholder="••••••••••••"
                                  className="w-full px-6 py-5 bg-white border-2 border-orange-200/50 rounded-2xl text-base font-bold text-[#131b2e] focus:border-orange-400 outline-none transition-all pr-12"
                                />
                                <Key size={18} className="absolute right-6 top-1/2 -translate-y-1/2 text-orange-300" />
                              </div>
                            </div>
                         </div>
                         <div className="flex items-center gap-2 px-1 text-[9px] font-bold text-orange-800/50 uppercase tracking-widest">
                           <Shield size={12} />
                           Use no mínimo 8 caracteres, incluindo letras, números e símbolos.
                         </div>
                      </section>
                    )}
                  </form>
                </div>

                {/* Footer Controls */}
                <div className="px-10 py-10 border-t border-slate-100 bg-slate-50 flex items-center justify-between gap-6 shrink-0 sticky bottom-0">
                  <button 
                    onClick={() => setIsEditing(false)}
                    className="px-8 py-5 text-slate-400 hover:text-slate-600 font-black uppercase tracking-widest text-[10px] transition-all"
                  >
                    Descartar Mudanças
                  </button>
                  <button 
                    form="user-form"
                    type="submit"
                    disabled={loading}
                    className="px-12 py-5 bg-[#00174b] text-white rounded-2xl font-black uppercase tracking-widest text-xs hover:scale-[1.03] active:scale-95 transition-all shadow-2xl shadow-blue-900/40 flex items-center gap-3 disabled:opacity-50"
                  >
                    {loading ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                    {selectedUser ? 'Aplicar Alterações' : 'Confirmar Cadastro'}
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
