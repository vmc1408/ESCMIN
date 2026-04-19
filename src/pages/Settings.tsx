import React, { useState, useEffect } from 'react';
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
  X
} from 'lucide-react';
import { cn } from '../lib/utils';
import { supabase, uploadImage } from '../lib/supabase';

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
  email: string;
  role: 'admin' | 'manager' | 'teacher' | 'clerk';
  avatar_url?: string;
  created_at: string;
}

export function Settings() {
  const [activeTab, setActiveTab] = useState<'institution' | 'users' | 'profile'>('institution');
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
    role: 'clerk'
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

  useEffect(() => {
    fetchInstitution();
    fetchUsers();
    fetchMyProfile();
  }, []);

  const fetchMyProfile = async () => {
    try {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .limit(1)
        .single();
      if (data) setMyProfile(data);
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

      // Ensure 'assets' bucket exists
      try {
        const { data: buckets } = await supabase.storage.listBuckets();
        const assetsBucket = buckets?.find(b => b.name === 'assets');
        if (!assetsBucket) {
          await supabase.storage.createBucket('assets', {
            public: true,
            fileSizeLimit: 1024 * 1024 * 2, // 2MB
          });
        }
      } catch (e) {
        console.warn('Storage bucket check/creation failed:', e);
      }

      const { data, error } = await supabase
        .from('institution_settings')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1);

      if (error) throw error;
      if (data && data.length > 0) {
        setInstitution(data[0]);
      }
    } catch (error: any) {
      console.error('Error fetching institution:', error.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('full_name', { ascending: true });

      if (error) throw error;
      setUsers(data || []);
    } catch (error: any) {
      console.error('Error fetching users:', error.message);
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
        receipt_message: institution.receipt_message || null,
      };

      // Se já temos um ID no estado, usamos ele para garantir o update
      if (institution.id) {
        dataToSave.id = institution.id;
      } else {
        // Se não temos ID no estado, tentamos buscar o ID do primeiro registro existente no banco
        const { data: existing } = await supabase
          .from('institution_settings')
          .select('id')
          .limit(1);
        
        if (existing && existing.length > 0) {
          dataToSave.id = existing[0].id;
        }
      }

      // Usar upsert que resolve tanto insert quanto update baseado no ID
      const { data, error } = await supabase
        .from('institution_settings')
        .upsert(dataToSave)
        .select()
        .single();

      if (error) throw error;
      
      if (data) {
        setInstitution(data);
      }
      
      setNotification({ type: 'success', message: 'Configurações salvas com sucesso!' });
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
      const { error } = await supabase
        .from('profiles')
        .upsert({
          ...userFormData,
          id: selectedUser?.id || crypto.randomUUID(), // In a real app, this would be handled by Auth
          created_at: selectedUser?.created_at || new Date().toISOString()
        });

      if (error) throw error;
      setNotification({ type: 'success', message: 'Usuário salvo com sucesso!' });
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
    try {
      setSaving(true);
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: myProfile.full_name,
          avatar_url: myProfile.avatar_url
        })
        .eq('id', myProfile.id);

      if (error) throw error;
      setNotification({ type: 'success', message: 'Perfil atualizado com sucesso!' });
      window.dispatchEvent(new Event('profile-updated'));
    } catch (error: any) {
      setNotification({ type: 'error', message: 'Erro ao salvar perfil: ' + error.message });
    } finally {
      setSaving(false);
      setTimeout(() => setNotification(null), 3000);
    }
  };

  const handleDeleteUser = async (id: string) => {
    if (!confirm('Tem certeza que deseja remover este usuário?')) return;
    try {
      const { error } = await supabase
        .from('profiles')
        .delete()
        .eq('id', id);

      if (error) throw error;
      setNotification({ type: 'success', message: 'Usuário removido com sucesso!' });
      fetchUsers();
    } catch (error: any) {
      setNotification({ type: 'error', message: 'Erro ao remover: ' + error.message });
    } finally {
      setTimeout(() => setNotification(null), 3000);
    }
  };

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
                setUserFormData({ role: 'clerk' });
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
              <div key={user.id} className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all group relative">
                <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-all flex gap-1">
                  <button 
                    onClick={() => {
                      setSelectedUser(user);
                      setUserFormData(user);
                      setShowUserModal(true);
                    }}
                    className="p-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors"
                  >
                    <Edit2 size={14} />
                  </button>
                  <button 
                    onClick={() => handleDeleteUser(user.id)}
                    className="p-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>

                <div className="flex items-center gap-4 mb-5">
                  <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center overflow-hidden border border-slate-100">
                    {user.avatar_url ? (
                      <img src={user.avatar_url} alt={user.full_name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <User size={24} className="text-slate-300" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-black text-[#00174b] truncate">{user.full_name}</h4>
                    <p className="text-[10px] font-bold text-slate-400 truncate">{user.email}</p>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-slate-50">
                  <div className={cn(
                    "px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5",
                    user.role === 'admin' ? "bg-purple-50 text-purple-600" :
                    user.role === 'manager' ? "bg-blue-50 text-blue-600" :
                    user.role === 'teacher' ? "bg-green-50 text-green-600" :
                    "bg-slate-50 text-slate-500"
                  )}>
                    <Shield size={10} />
                    {user.role === 'admin' ? 'Administrador' :
                     user.role === 'manager' ? 'Gestor' :
                     user.role === 'teacher' ? 'Professor' : 'Secretaria'}
                  </div>
                  <span className="text-[9px] font-bold text-slate-300">
                    {new Date(user.created_at).toLocaleDateString('pt-BR')}
                  </span>
                </div>
              </div>
            ))}
          </div>
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
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">E-mail de Acesso</label>
                <input 
                  type="email"
                  value={userFormData.email}
                  onChange={(e) => setUserFormData({...userFormData, email: e.target.value})}
                  className="w-full px-5 py-3 bg-slate-50 border border-transparent rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:bg-white focus:border-blue-200 transition-all font-bold text-[#00174b] text-sm"
                  placeholder="email@escola.com"
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
                    <option value="manager">Gestor</option>
                    <option value="teacher">Professor</option>
                    <option value="clerk">Secretaria</option>
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
    </div>
  );
}
