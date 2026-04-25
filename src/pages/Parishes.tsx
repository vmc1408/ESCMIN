import React, { useState, useEffect } from 'react';
import { 
  Church, 
  Map as MapIcon, 
  Plus, 
  Search, 
  Edit2, 
  Trash2, 
  Save, 
  X, 
  Loader2,
  ChevronRight,
  Phone,
  Mail,
  MapPin,
  User,
  Hash,
  AlertCircle
} from 'lucide-react';
import { db, fetchAll, saveData, deleteData } from '../lib/firebase';
import { cn, maskCEP, maskPhone } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { Parish, Foraria } from '../types';

export function Parishes() {
  const [parishes, setParishes] = useState<Parish[]>([]);
  const [foraries, setForaries] = useState<Foraria[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [selectedParish, setSelectedParish] = useState<Parish | null>(null);
  const [showForariaManager, setShowForariaManager] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error', message: string } | null>(null);

  // Form State
  const [formData, setFormData] = useState<Partial<Parish>>({
    code: '',
    name: '',
    forania: '',
    priest_name: '',
    address_street: '',
    address_neighborhood: '',
    address_city: 'Guarulhos',
    address_state: 'SP',
    address_zip: '',
    email: '',
    phone: ''
  });

  const [forariaFormData, setForariaFormData] = useState<Partial<Foraria>>({
    code: '',
    name: ''
  });

  const fetchData = async () => {
    try {
      setLoading(true);
      const [parishesData, forariesData] = await Promise.all([
        fetchAll('parishes', '*', 'name'),
        fetchAll('foraries', '*', 'name')
      ]);
      setParishes(parishesData || []);
      setForaries(forariesData || []);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const handleEdit = (parish: Parish) => {
    setSelectedParish(parish);
    setFormData({
      code: parish.code || '',
      name: parish.name || '',
      forania: parish.forania || '',
      priest_name: parish.priest_name || '',
      address_street: parish.address_street || '',
      address_neighborhood: parish.address_neighborhood || '',
      address_city: parish.address_city || 'Guarulhos',
      address_state: parish.address_state || 'SP',
      address_zip: parish.address_zip || '',
      email: parish.email || '',
      phone: parish.phone || ''
    });
    setIsEditing(true);
  };

  const handleAddNew = () => {
    setSelectedParish(null);
    setFormData({
      code: '',
      name: '',
      forania: '',
      priest_name: '',
      address_street: '',
      address_neighborhood: '',
      address_city: 'Guarulhos',
      address_state: 'SP',
      address_zip: '',
      email: '',
      phone: ''
    });
    setIsEditing(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.code) return;

    try {
      setLoading(true);
      const docId = selectedParish?.id || formData.code?.replace(/\//g, '-');
      await saveData('parishes', docId, {
        ...formData,
        created_at: selectedParish?.created_at || new Date().toISOString()
      });
      setNotification({ type: 'success', message: `Paróquia ${selectedParish ? 'atualizada' : 'cadastrada'} com sucesso!` });
      setIsEditing(false);
      fetchData();
    } catch (error) {
      setNotification({ type: 'error', message: 'Erro ao salvar paróquia.' });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja excluir esta paróquia?')) return;

    try {
      setLoading(true);
      await deleteData('parishes', id);
      setNotification({ type: 'success', message: 'Paróquia excluída com sucesso!' });
      fetchData();
    } catch (error) {
      setNotification({ type: 'error', message: 'Erro ao excluir paróquia.' });
    } finally {
      setLoading(false);
    }
  };

  const handleSaveForaria = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forariaFormData.name || !forariaFormData.code) return;

    try {
      setLoading(true);
      const docId = forariaFormData.code.replace(/\//g, '-');
      await saveData('foraries', docId, {
        ...forariaFormData,
        created_at: new Date().toISOString()
      });
      setForariaFormData({ code: '', name: '' });
      fetchData();
    } catch (error) {
      console.error('Error saving foraria:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteForaria = async (id: string) => {
    if (!window.confirm('Excluir esta forania?')) return;
    try {
      await deleteData('foraries', id);
      fetchData();
    } catch (error) {
      console.error('Error deleting foraria:', error);
    }
  };

  const filteredParishes = parishes.filter(p => 
    (p.name || '').toLowerCase().includes(search.toLowerCase()) ||
    (p.forania || '').toLowerCase().includes(search.toLowerCase()) ||
    p.priest_name?.toLowerCase().includes(search.toLowerCase()) ||
    (p.code || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-extrabold text-[#131b2e] tracking-tight">Cadastro de Paróquias</h2>
          <p className="text-slate-500">Gerencie as paróquias e foranias da diocese.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowForariaManager(!showForariaManager)}
            className="px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl text-sm font-bold hover:bg-slate-50 transition-all flex items-center gap-2"
          >
            <MapIcon size={18} />
            Gerenciar Foranias
          </button>
          <button
            onClick={handleAddNew}
            className="px-6 py-2 bg-[#00174b] text-white rounded-xl text-sm font-bold hover:scale-[1.02] active:scale-95 transition-all shadow-lg flex items-center gap-2"
          >
            <Plus size={18} />
            Nova Paróquia
          </button>
        </div>
      </header>

      {/* Foraria Manager Panel */}
      <AnimatePresence>
        {showForariaManager && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="bg-white p-6 rounded-3xl border border-indigo-100 shadow-sm space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-[#131b2e] flex items-center gap-2">
                  <MapIcon className="text-indigo-600" size={20} />
                  Foranias
                </h3>
                <button onClick={() => setShowForariaManager(false)} className="text-slate-400 hover:text-slate-600">
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleSaveForaria} className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-indigo-50/50 rounded-2xl border border-indigo-100">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-indigo-900 uppercase tracking-widest pl-1">Código</label>
                  <input 
                    type="text"
                    value={forariaFormData.code}
                    onChange={e => setForariaFormData({...forariaFormData, code: e.target.value})}
                    placeholder="Ex: F-01"
                    className="w-full px-4 py-2 bg-white border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500/20 shadow-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-indigo-900 uppercase tracking-widest pl-1">Nome da Forania</label>
                  <input 
                    type="text"
                    value={forariaFormData.name}
                    onChange={e => setForariaFormData({...forariaFormData, name: e.target.value})}
                    placeholder="Ex: Forania Sul"
                    className="w-full px-4 py-2 bg-white border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500/20 shadow-sm"
                  />
                </div>
                <div className="flex items-end">
                  <button 
                    type="submit"
                    disabled={loading}
                    className="w-full h-10 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all shadow-md flex items-center justify-center gap-2"
                  >
                    {loading ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                    Adicionar Forania
                  </button>
                </div>
              </form>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {foraries.map(f => (
                  <div key={f.id} className="group flex items-center justify-between p-3 bg-white border border-slate-100 rounded-xl hover:border-indigo-200 hover:shadow-sm transition-all">
                    <div>
                      <p className="text-[10px] font-black text-indigo-600 uppercase leading-none">{f.code}</p>
                      <p className="text-sm font-bold text-[#131b2e]">{f.name}</p>
                    </div>
                    <button 
                      onClick={() => handleDeleteForaria(f.id)}
                      className="opacity-0 group-hover:opacity-100 p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Parishes List */}
        <div className={cn("lg:col-span-2 space-y-4", isEditing && "hidden lg:block")}>
          <div className="flex items-center gap-4 bg-white p-4 rounded-3xl shadow-sm border border-slate-100">
            <Search className="text-slate-400" size={20} />
            <input 
              type="text"
              placeholder="Buscar paróquia, forania ou padre..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="flex-1 bg-transparent border-none focus:ring-0 text-sm font-medium"
            />
          </div>

          <div className="grid gap-4">
            {loading && parishes.length === 0 ? (
              <div className="p-12 text-center animate-pulse">
                <Loader2 className="mx-auto text-slate-300 animate-spin mb-4" size={32} />
                <p className="text-slate-400 font-medium">Carregando paróquias...</p>
              </div>
            ) : filteredParishes.length === 0 ? (
              <div className="p-12 bg-white rounded-3xl border border-dashed text-center">
                <p className="text-slate-400 font-medium">Nenhuma paróquia encontrada.</p>
              </div>
            ) : (
              filteredParishes.map(parish => (
                <div key={parish.id} className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-all group">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center">
                        <Church size={24} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 bg-slate-100 text-slate-500 rounded text-[10px] font-black uppercase tracking-widest">{parish.code}</span>
                          <h4 className="text-lg font-bold text-[#131b2e]">{parish.name}</h4>
                        </div>
                        <p className="text-sm font-medium text-blue-600 mt-0.5 flex items-center gap-1.5">
                          <MapIcon size={14} />
                          Forania: {parish.forania}
                        </p>
                        <div className="grid grid-cols-2 gap-x-8 gap-y-1 mt-4">
                          <div className="flex items-center gap-2 text-xs text-slate-500">
                            <User size={14} className="text-slate-400" />
                            <span className="font-bold">Padre:</span> {parish.priest_name}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-slate-500">
                            <Phone size={14} className="text-slate-400" />
                            {parish.phone || 'N/A'}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-slate-500 truncate col-span-2">
                            <MapPin size={14} className="text-slate-400" />
                            {parish.address_street} - {parish.address_neighborhood}, {parish.address_city}-{parish.address_state}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={() => handleEdit(parish)}
                        className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
                      >
                        <Edit2 size={18} />
                      </button>
                      <button 
                        onClick={() => handleDelete(parish.id)}
                        className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Edit/New Form */}
        <AnimatePresence>
          {isEditing && (
            <motion.div
              initial={{ x: 20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 20, opacity: 0 }}
              className="lg:col-span-1"
            >
              <div className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-2xl sticky top-24 space-y-8">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-black text-[#131b2e] flex items-center gap-2">
                    {selectedParish ? <Edit2 size={20} className="text-blue-600" /> : <Plus size={20} className="text-blue-600" />}
                    {selectedParish ? 'Editar Paróquia' : 'Nova Paróquia'}
                  </h3>
                  <button onClick={() => setIsEditing(false)} className="text-slate-400 hover:text-slate-600">
                    <X size={24} />
                  </button>
                </div>

                <form onSubmit={handleSave} className="space-y-6">
                  {/* Basic Info */}
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Código</label>
                        <div className="relative">
                          <Hash size={14} className="absolute left-3 top-3 text-slate-400" />
                          <input 
                            type="text"
                            required
                            value={formData.code}
                            onChange={e => setFormData({...formData, code: e.target.value})}
                            className="w-full pl-9 pr-4 py-2 bg-slate-50 border-none rounded-xl text-sm font-bold focus:ring-2 focus:ring-blue-500/20"
                            placeholder="Ex: P-001"
                          />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Forania</label>
                        <select 
                          required
                          value={formData.forania}
                          onChange={e => setFormData({...formData, forania: e.target.value})}
                          className="w-full px-4 py-2 bg-slate-50 border-none rounded-xl text-sm font-bold focus:ring-2 focus:ring-blue-500/20"
                        >
                          <option value="">Selecione...</option>
                          {foraries.map(f => (
                            <option key={f.id} value={f.name}>{f.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Nome da Paróquia</label>
                      <div className="relative">
                        <Church size={14} className="absolute left-3 top-3 text-slate-400" />
                        <input 
                          type="text"
                          required
                          value={formData.name}
                          onChange={e => setFormData({...formData, name: e.target.value})}
                          className="w-full pl-9 pr-4 py-2 bg-slate-50 border-none rounded-xl text-sm font-bold focus:ring-2 focus:ring-blue-500/20"
                          placeholder="Nome oficial"
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Padre Responsável</label>
                      <div className="relative">
                        <User size={14} className="absolute left-3 top-3 text-slate-400" />
                        <input 
                          type="text"
                          value={formData.priest_name}
                          onChange={e => setFormData({...formData, priest_name: e.target.value})}
                          className="w-full pl-9 pr-4 py-2 bg-slate-50 border-none rounded-xl text-sm font-bold focus:ring-2 focus:ring-blue-500/20"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Address Section */}
                  <div className="space-y-4 pt-4 border-t border-slate-100">
                    <h4 className="text-[11px] font-black text-blue-600 uppercase tracking-widest flex items-center gap-2">
                      <MapPin size={12} />
                      Endereço e Contato
                    </h4>
                    
                    <div className="grid grid-cols-12 gap-4">
                      <div className="col-span-12 space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Logradouro (Rua, Número, Complemento)</label>
                        <input 
                          type="text"
                          value={formData.address_street}
                          onChange={e => setFormData({...formData, address_street: e.target.value})}
                          className="w-full px-4 py-2 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Bairro</label>
                        <input 
                          type="text"
                          value={formData.address_neighborhood}
                          onChange={e => setFormData({...formData, address_neighborhood: e.target.value})}
                          className="w-full px-4 py-2 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">CEP</label>
                        <input 
                          type="text"
                          value={formData.address_zip}
                          onChange={e => setFormData({...formData, address_zip: maskCEP(e.target.value)})}
                          className="w-full px-4 py-2 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20"
                          placeholder="00000-000"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Telefone</label>
                        <div className="relative">
                          <Phone size={14} className="absolute left-3 top-3 text-slate-400" />
                          <input 
                            type="text"
                            value={formData.phone}
                            onChange={e => setFormData({...formData, phone: maskPhone(e.target.value)})}
                            className="w-full pl-9 pr-4 py-2 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20"
                            placeholder="(00) 00000-0000"
                          />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">E-mail</label>
                        <div className="relative">
                          <Mail size={14} className="absolute left-3 top-3 text-slate-400" />
                          <input 
                            type="email"
                            value={formData.email}
                            onChange={e => setFormData({...formData, email: e.target.value})}
                            className="w-full pl-9 pr-4 py-2 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-4 pt-4">
                    <button
                      type="button"
                      onClick={() => setIsEditing(false)}
                      className="flex-1 px-4 py-3 bg-slate-100 text-slate-600 rounded-2xl text-sm font-bold hover:bg-slate-200 transition-all"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={loading}
                      className="flex-[2] px-4 py-3 bg-[#00174b] text-white rounded-2xl text-sm font-bold hover:scale-[1.02] active:scale-95 transition-all shadow-xl shadow-blue-900/10 flex items-center justify-center gap-2"
                    >
                      {loading ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                      Salvar Cadastro
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {notification && (
        <div className={cn(
          "fixed bottom-8 right-8 px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 animate-in slide-in-from-right",
          notification.type === 'success' ? "bg-emerald-500 text-white" : "bg-red-500 text-white"
        )}>
          {notification.type === 'success' ? <Loader2 size={20} /> : <AlertCircle size={20} />}
          <span className="font-bold">{notification.message}</span>
        </div>
      )}
    </div>
  );
}
