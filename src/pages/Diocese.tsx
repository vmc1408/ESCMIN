import React, { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
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
  AlertCircle,
  Printer,
  Scroll,
  Users,
  Building2,
  PhoneCall,
  MessageCircle,
  Layers,
  Eye,
  Shield,
  Upload
} from 'lucide-react';
import { db, fetchAll, saveData, deleteData } from '../lib/database';
import { cn, maskCEP, maskPhone } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { Parish, Foraria, ClergyLeity, ClergyRole } from '../types';
import { useAuth } from '../contexts/AuthContext';

type TabType = 'foranias' | 'parishes' | 'clergy';

const DetailField = ({ label, value, icon, fullWidth = false }: { label: string, value: any, icon: React.ReactNode, fullWidth?: boolean }) => (
  <div className={cn("space-y-1.5", fullWidth ? "md:col-span-2" : "")}>
    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1 border-l-2 border-blue-500/20">{label}</label>
    <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-100">
      <div className="text-blue-500">
        {icon}
      </div>
      <span className="text-sm font-bold text-slate-700">{value || 'Não informado'}</span>
    </div>
  </div>
);

export function Diocese() {
  const { user: userAuth } = useAuth();
  const [activeTab, setActiveTab ] = useState<TabType>('parishes');
  const [parishes, setParishes] = useState<Parish[]>([]);
  const [foraries, setForaries] = useState<Foraria[]>([]);
  const [clergy, setClergy] = useState<ClergyLeity[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'code' | 'name' | 'date'>('code');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [isEditing, setIsEditing] = useState(false);
  const [isViewing, setIsViewing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<any>(null);
  const [selectedItem, setSelectedItem] = useState<any | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  // Form States
  const [forariaForm, setForariaForm] = useState<Partial<Foraria>>({
    code: '',
    name: '',
    priest_name: ''
  });

  const [parishForm, setParishForm] = useState<Partial<Parish>>({
    code: '',
    name: '',
    forania_id: '',
    priest_id: '',
    priest_name: '',
    address: '',
    address_street: '',
    address_number: '',
    address_neighborhood: '',
    address_city: 'Guarulhos',
    address_state: 'SP',
    address_zip: '',
    email: '',
    phone: '',
    foundation_date: ''
  });

  const [clergyForm, setClergyForm] = useState<Partial<ClergyLeity>>({
    code: '',
    name: '',
    address: '',
    address_number: '',
    address_neighborhood: '',
    address_city: 'Guarulhos',
    address_state: 'SP',
    phone_mobile: '',
    phone_whatsapp: '',
    email: '',
    parish_id: '',
    role: 'pároco'
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !userAuth) return;

    try {
      setLoading(true);
      const reader = new FileReader();
      reader.onload = async (evt) => {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws) as any[];

        let currentForaries = [...foraries];
        let currentParishes = [...parishes];

        for (const row of data) {
          const forName = String(row['forania'] || row['Forania'] || '').trim();
          const parName = String(row['paroquia'] || row['paróquia'] || row['Paroquia'] || row['Paróquia'] || '').trim();

          if (!forName || !parName) continue;

          // Find or create Forania
          let forania = currentForaries.find(f => f.name.toLowerCase() === String(forName).toLowerCase());
          if (!forania) {
            const newCode = getNextCode(currentForaries);
            const newId = newCode;
            const newForania: Foraria = {
              id: newId,
              code: newCode,
              name: String(forName),
              priest_name: '',
              user_id: userAuth.uid,
              created_at: new Date().toISOString()
            };
            await saveData('foraries', newId, newForania);
            currentForaries.push(newForania);
            forania = newForania;
          }

          // Create Parish if not exists
          const parishExists = currentParishes.some(p => p.name.toLowerCase() === String(parName).toLowerCase());
          if (!parishExists) {
            const newCode = getNextCode(currentParishes);
            const newId = newCode;
            const newParish: Partial<Parish> = {
              code: newCode,
              name: String(parName),
              forania_id: forania.id,
              priest_id: '',
              priest_name: '',
              address_city: 'Guarulhos',
              address_state: 'SP',
              user_id: userAuth.uid,
              created_at: new Date().toISOString()
            };
            await saveData('parishes', newId, newParish);
            currentParishes.push(newParish as Parish);
          }
        }

        setNotification({ type: 'success', message: 'Importação concluída com sucesso!' });
        fetchData();
      };
      reader.readAsBinaryString(file);
    } catch (error) {
      console.error('Error importing excel:', error);
      setNotification({ type: 'error', message: 'Erro ao importar planilha.' });
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      const [pData, fData, cData] = await Promise.all([
        fetchAll('parishes', '*', 'name', true),
        fetchAll('foraries', '*', 'code', true),
        fetchAll('clergy_leity', '*', 'code', true)
      ]);
      setParishes(pData || []);
      setForaries(fData || []);
      setClergy(cData || []);
    } catch (error) {
      console.error('Error fetching diocese data:', error);
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

  const handleView = (item: any) => {
    setSelectedItem(item);
    setIsViewing(true);
  };

  const getNextCode = (items: any[]) => {
    if (!items || items.length === 0) return '01';
    const codes = items.map(i => parseInt(i.code)).filter(c => !isNaN(c));
    if (codes.length === 0) return '01';
    const max = Math.max(...codes);
    return (max + 1).toString().padStart(2, '0');
  };

  const handleAddNew = () => {
    setSelectedItem(null);
    if (activeTab === 'foranias') {
      setForariaForm({
        code: getNextCode(foraries),
        name: '',
        priest_name: ''
      });
    } else if (activeTab === 'parishes') {
      setParishForm({
        code: getNextCode(parishes),
        name: '',
        forania_id: '',
        priest_id: '',
        priest_name: '',
        address_street: '',
        address_number: '',
        address_neighborhood: '',
        address_city: 'Guarulhos',
        address_state: 'SP',
        address_zip: '',
        email: '',
        phone: '',
        foundation_date: ''
      });
    } else {
      setClergyForm({
        code: getNextCode(clergy),
        name: '',
        address: '',
        address_number: '',
        address_neighborhood: '',
        address_city: 'Guarulhos',
        address_state: 'SP',
        phone_mobile: '',
        phone_whatsapp: '',
        email: '',
        parish_id: '',
        role: 'pároco'
      });
    }
    setIsEditing(true);
  };

  const handleEdit = (item: any) => {
    setSelectedItem(item);
    if (activeTab === 'foranias') {
      setForariaForm({ ...item });
    } else if (activeTab === 'parishes') {
      setParishForm({
        address_city: 'Guarulhos',
        address_state: 'SP',
        ...item
      });
    } else {
      setClergyForm({
        address_city: 'Guarulhos',
        address_state: 'SP',
        ...item
      });
    }
    setIsEditing(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userAuth) return;

    try {
      setLoading(true);
      const collection = activeTab === 'foranias' ? 'foraries' : activeTab === 'parishes' ? 'parishes' : 'clergy_leity';
      const data = activeTab === 'foranias' ? forariaForm : activeTab === 'parishes' ? parishForm : clergyForm;
      const docId = selectedItem?.id || data.code;

      await saveData(collection, docId as string, {
        ...data,
        user_id: userAuth.uid,
        created_at: selectedItem?.created_at || new Date().toISOString()
      });

      setNotification({ type: 'success', message: 'Registro salvo com sucesso!' });
      setIsEditing(false);
      fetchData();
    } catch (error) {
      setNotification({ type: 'error', message: 'Erro ao salvar registro.' });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteClick = (item: any) => {
    setItemToDelete(item);
    setIsDeleting(true);
  };

  const handleDeleteConfirm = async () => {
    if (!itemToDelete?.id) return;
    
    try {
      setLoading(true);
      const collection = activeTab === 'foranias' ? 'foraries' : activeTab === 'parishes' ? 'parishes' : 'clergy_leity';
      
      console.log(`[handleDeleteConfirm] Iniciando exclusão de ${itemToDelete.id} (code: ${itemToDelete.code}) na coleção ${collection}`);
      await deleteData(collection, itemToDelete.id);
      
      setNotification({ type: 'success', message: 'Registro excluído!' });
      fetchData();
    } catch (error) {
      console.error('Erro na exclusão:', error);
      setNotification({ type: 'error', message: 'Erro ao excluir o registro.' });
    } finally {
      setIsDeleting(false);
      setItemToDelete(null);
      setLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const filteredItems = (activeTab === 'foranias' ? foraries : activeTab === 'parishes' ? parishes : clergy)
    .filter(item => 
      Object.values(item).some(val => 
        String(val).toLowerCase().includes(search.toLowerCase())
      )
    )
    .sort((a, b) => {
      if (activeTab === 'parishes') {
        let valA: any, valB: any;
        
        if (sortBy === 'code') {
          valA = parseInt(a.code) || 0;
          valB = parseInt(b.code) || 0;
        } else if (sortBy === 'name') {
          valA = a.name.toLowerCase();
          valB = b.name.toLowerCase();
        } else if (sortBy === 'date') {
          // Use foundation_date if exists, otherwise created_at
          valA = a.foundation_date || a.created_at || '';
          valB = b.foundation_date || b.created_at || '';
        }

        if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
        if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
        return 0;
      }
      return 0; // Default order for other tabs (already set by fetchAll)
    });

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-20">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 print:hidden">
        <div>
          <h2 className="text-3xl font-black text-[#131b2e] tracking-tight flex items-center gap-3">
            <Building2 className="text-blue-600" size={32} />
            Gestão da Diocese
          </h2>
          <p className="text-slate-500 font-medium">Gerenciamento completo de Foranias, Paróquias e Clero.</p>
        </div>
        <div className="flex items-center gap-2">
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleImportExcel} 
            accept=".xlsx, .xls, .csv" 
            className="hidden" 
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-4 py-2.5 bg-white border border-slate-200 text-slate-600 rounded-xl text-sm font-bold hover:bg-slate-50 transition-all flex items-center gap-2 shadow-sm"
          >
            <Upload size={18} />
            Importar
          </button>
          <button
            onClick={handlePrint}
            className="px-4 py-2.5 bg-white border border-slate-200 text-slate-600 rounded-xl text-sm font-bold hover:bg-slate-50 transition-all flex items-center gap-2 shadow-sm"
          >
            <Printer size={18} />
            Imprimir
          </button>
          <button
            onClick={handleAddNew}
            className="px-6 py-2.5 bg-[#00174b] text-white rounded-xl text-sm font-black uppercase tracking-widest hover:scale-[1.02] active:scale-95 transition-all shadow-xl shadow-blue-900/10 flex items-center gap-2"
          >
            <Plus size={18} />
            Novo Registro
          </button>
        </div>
      </header>

      {/* Tabs */}
      <div className="flex items-center gap-1 p-1 bg-slate-100/50 rounded-2xl border border-slate-200 w-fit print:hidden">
        <button
          onClick={() => { setActiveTab('parishes'); setIsEditing(false); setSearch(''); }}
          className={cn(
            "px-6 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all",
            activeTab === 'parishes' ? "bg-white text-blue-600 shadow-sm border border-slate-200" : "text-slate-400 hover:text-slate-600"
          )}
        >
          Paróquias
        </button>
        <button
          onClick={() => { setActiveTab('foranias'); setIsEditing(false); setSearch(''); }}
          className={cn(
            "px-6 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all",
            activeTab === 'foranias' ? "bg-white text-blue-600 shadow-sm border border-slate-200" : "text-slate-400 hover:text-slate-600"
          )}
        >
          Foranias
        </button>
        <button
          onClick={() => { setActiveTab('clergy'); setIsEditing(false); setSearch(''); }}
          className={cn(
            "px-6 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all",
            activeTab === 'clergy' ? "bg-white text-blue-600 shadow-sm border border-slate-200" : "text-slate-400 hover:text-slate-600"
          )}
        >
          Clero & Leigos
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className={cn("lg:col-span-2 space-y-4", isEditing && "hidden lg:block")}>
          <div className="flex flex-col md:flex-row items-center gap-4 bg-white p-4 rounded-3xl shadow-sm border border-slate-100 print:hidden">
            <div className="flex-1 flex items-center gap-4 w-full">
              <Search className="text-slate-400" size={20} />
              <input 
                type="text"
                placeholder="Pesquisar em registros..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="flex-1 bg-transparent border-none focus:ring-0 text-sm font-medium"
              />
            </div>
            
            {activeTab === 'parishes' && (
              <div className="flex items-center gap-2 border-l border-slate-100 pl-4 w-full md:w-auto">
                <Layers size={16} className="text-slate-400" />
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="bg-transparent border-none text-xs font-black uppercase tracking-widest text-slate-500 focus:ring-0 cursor-pointer"
                >
                  <option value="code">Código</option>
                  <option value="name">Nome</option>
                  <option value="date">Data</option>
                </select>
                <button
                  onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
                  className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors text-slate-400"
                  title="Inverter Ordem"
                >
                  <Scroll size={14} className={cn("transition-transform", sortOrder === 'desc' && "rotate-180")} />
                </button>
              </div>
            )}

            <div className="px-3 py-1 bg-slate-50 text-slate-400 rounded-lg text-[10px] font-black uppercase tracking-tighter shrink-0">
              {filteredItems.length} Registros
            </div>
          </div>

          <div className="grid gap-4 print:block">
            {loading ? (
              <div className="p-12 text-center animate-pulse">
                <Loader2 className="mx-auto text-blue-500 animate-spin mb-4" size={32} />
                <p className="text-slate-400 font-medium">Sincronizando dados...</p>
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="p-20 bg-white rounded-[2rem] border-2 border-dashed border-slate-200 text-center">
                <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-300">
                  <Search size={32} />
                </div>
                <p className="text-slate-400 font-bold">Nenhum registro encontrado nesta categoria.</p>
              </div>
            ) : (
              filteredItems.map(item => (
                <div key={item.id} className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm hover:shadow-xl hover:border-blue-100 transition-all group relative overflow-hidden print:border-slate-300 print:mb-4 print:shadow-none">
                  <div className="absolute top-0 left-0 w-1.5 h-full bg-blue-600 opacity-20 group-hover:opacity-100 transition-opacity" />
                  
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="flex items-start gap-5 flex-1">
                      <div className="w-16 h-16 bg-slate-50 text-slate-400 rounded-[1.5rem] flex items-center justify-center group-hover:bg-blue-50 group-hover:text-blue-600 transition-all shrink-0 shadow-inner group-hover:scale-110 duration-300">
                        {activeTab === 'foranias' ? <MapIcon size={32} /> : activeTab === 'parishes' ? <Church size={32} /> : <User size={32} />}
                      </div>
                      <div className="space-y-2 flex-1">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded text-[10px] font-black uppercase tracking-widest border border-blue-100 flex items-center gap-1">
                              <Hash size={10} />
                              {item.code}
                            </span>
                            {activeTab === 'clergy' && (
                              <span className="px-2 py-0.5 bg-amber-50 text-amber-600 rounded text-[9px] font-black uppercase tracking-widest border border-amber-100">
                                {item.role}
                              </span>
                            )}
                            {activeTab === 'parishes' && item.foundation_date && (
                              <span className="px-2 py-0.5 bg-emerald-50 text-emerald-600 rounded text-[9px] font-black uppercase tracking-widest border border-emerald-100 flex items-center gap-1">
                                <Scroll size={10} />
                                Fundada em: {new Date(item.foundation_date).toLocaleDateString('pt-BR')}
                              </span>
                            )}
                          </div>
                          <h4 className="text-xl font-black text-[#131b2e] group-hover:text-blue-700 transition-colors leading-tight">{item.name}</h4>
                          
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1 mt-3">
                            {activeTab === 'foranias' ? (
                              <p className="text-sm font-bold text-slate-500 flex items-center gap-2 italic">
                                <User size={14} className="text-blue-500" />
                                Pe. Forâneo: {item.priest_name || 'Não informado'}
                              </p>
                            ) : activeTab === 'parishes' ? (
                              <>
                                <p className="text-sm font-bold text-slate-500 flex items-center gap-2 italic">
                                  <User size={14} className="text-blue-500" />
                                  Pároco: {item.priest_name || 'Não informado'}
                                </p>
                                <p className="text-xs font-medium text-slate-400 flex items-center gap-2">
                                  <MapIcon size={12} />
                                  {foraries.find(f => f.id === item.forania_id)?.name || 'Forania não vinculada'}
                                </p>
                              </>
                            ) : (
                              <p className="text-sm font-bold text-slate-500 flex items-center gap-2 italic">
                                <Church size={14} className="text-blue-500" />
                                Nomeado em: {parishes.find(p => p.id === item.parish_id)?.name || 'Nenhuma paróquia'}
                              </p>
                            )}
                          </div>
                        </div>

                        {(item.phone || item.email || item.phone_mobile) && (
                          <div className="flex flex-wrap gap-4 pt-3 border-t border-slate-50">
                            {item.phone && (
                              <div className="flex items-center gap-2 text-xs font-bold text-slate-500 bg-slate-50 px-2 py-1 rounded-lg">
                                <Phone size={14} className="text-blue-400" />
                                {item.phone}
                              </div>
                            )}
                            {item.email && (
                              <div className="flex items-center gap-2 text-xs font-bold text-slate-500 bg-slate-50 px-2 py-1 rounded-lg">
                                <Mail size={14} className="text-blue-400" />
                                {item.email}
                              </div>
                            )}
                            {item.phone_mobile && (
                              <div className="flex items-center gap-2 text-xs font-bold text-slate-500 bg-slate-50 px-2 py-1 rounded-lg">
                                <PhoneCall size={14} className="text-blue-400" />
                                {item.phone_mobile}
                              </div>
                            )}
                          </div>
                        )}

                        {(item.address_street || item.address) && (
                          <p className="text-xs font-bold text-slate-400 flex items-center gap-2 pt-2">
                            <MapPin size={14} className="text-red-400 shrink-0" />
                            <span className="truncate max-w-md">
                              {item.address || `${item.address_street}, ${item.address_number} - ${item.address_neighborhood}`}
                            </span>
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 md:opacity-0 group-hover:opacity-100 transition-all shrink-0 mt-4 md:mt-0">
                      <button 
                         onClick={() => handleView(item)}
                         className="p-3 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-2xl transition-all"
                         title="Visualizar Detalhes"
                      >
                        <Eye size={20} />
                      </button>
                      <button 
                        onClick={() => handleEdit(item)}
                        className="p-3 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-2xl transition-all"
                        title="Editar Registro"
                      >
                        <Edit2 size={20} />
                      </button>
                      <button 
                        onClick={() => handleDeleteClick(item)}
                        className="p-3 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-2xl transition-all"
                        title="Excluir Registro"
                      >
                        <Trash2 size={20} />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Modal Form */}
        <AnimatePresence>
          {isEditing && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm print:hidden">
              <motion.div
                initial={{ scale: 0.95, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.95, opacity: 0, y: 20 }}
                className="bg-white w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-[2.5rem] shadow-2xl border border-white/20 p-8 space-y-8 custom-scrollbar"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center">
                      {activeTab === 'foranias' ? <MapIcon size={24} /> : activeTab === 'parishes' ? <Church size={24} /> : <User size={24} />}
                    </div>
                    <div>
                      <h3 className="text-2xl font-black text-[#131b2e]">
                        {selectedItem ? 'Editar' : 'Novo'} {activeTab === 'foranias' ? 'Forania' : activeTab === 'parishes' ? 'Paróquia' : 'Clero/Leigo'}
                      </h3>
                      <p className="text-slate-400 text-sm font-bold uppercase tracking-widest">Código: #{activeTab === 'foranias' ? forariaForm.code : activeTab === 'parishes' ? parishForm.code : clergyForm.code}</p>
                    </div>
                  </div>
                  <button onClick={() => setIsEditing(false)} className="p-3 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-2xl transition-all">
                    <X size={24} />
                  </button>
                </div>

                <form onSubmit={handleSave} className="space-y-6">
                  {/* FORANIAS FORM */}
                  {activeTab === 'foranias' && (
                    <>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-1">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Número de Cadastro (Sequencial)</label>
                          <input 
                            type="text"
                            readOnly
                            value={forariaForm.code || ''}
                            className="w-full px-5 py-3 bg-slate-50 border-2 border-slate-100 rounded-2xl text-sm font-black text-slate-400 cursor-not-allowed"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Nome da Forania</label>
                          <input 
                            type="text"
                            required
                            value={forariaForm.name || ''}
                            onChange={e => setForariaForm({...forariaForm, name: e.target.value})}
                            className="w-full px-5 py-3 bg-slate-50 border-2 border-slate-100 rounded-2xl text-sm font-bold focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all"
                            placeholder="Ex: Forania Norte"
                          />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Padre Forâneo</label>
                        <div className="relative">
                          <User size={18} className="absolute left-4 top-3.5 text-slate-400" />
                          <input 
                            type="text"
                            value={forariaForm.priest_name || ''}
                            onChange={e => setForariaForm({...forariaForm, priest_name: e.target.value})}
                            className="w-full pl-12 pr-5 py-3 bg-slate-50 border-2 border-slate-100 rounded-2xl text-sm font-bold focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all"
                            placeholder="Nome do Padre Responsável por esta Forania"
                          />
                        </div>
                      </div>
                    </>
                  )}

                  {/* PARISHES FORM */}
                  {activeTab === 'parishes' && (
                    <>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="space-y-1 col-span-1">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Cod. Cadastro</label>
                          <input 
                            type="text"
                            readOnly
                            value={parishForm.code || ''}
                            className="w-full px-5 py-3 bg-slate-50 border-2 border-slate-100 rounded-2xl text-sm font-black text-slate-400"
                          />
                        </div>
                        <div className="space-y-1 col-span-2">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Nome da Paróquia</label>
                          <input 
                            type="text"
                            required
                            value={parishForm.name || ''}
                            onChange={e => setParishForm({...parishForm, name: e.target.value})}
                            className="w-full px-5 py-3 bg-slate-50 border-2 border-slate-100 rounded-2xl text-sm font-bold focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-1">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Forania</label>
                          <select 
                            required
                            value={parishForm.forania_id || ''}
                            onChange={e => setParishForm({...parishForm, forania_id: e.target.value})}
                            className="w-full px-5 py-3 bg-slate-50 border-2 border-slate-100 rounded-2xl text-sm font-bold focus:ring-4 focus:ring-blue-500/10"
                          >
                            <option value="">Selecione...</option>
                            {foraries.map(f => (
                              <option key={f.id} value={f.id}>{f.name}</option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Padre Responsável</label>
                          <select 
                            value={parishForm.priest_id || ''}
                            onChange={e => {
                              const selected = clergy.find(c => c.id === e.target.value);
                              setParishForm({
                                ...parishForm, 
                                priest_id: e.target.value,
                                priest_name: selected?.name || ''
                              });
                            }}
                            className="w-full px-5 py-3 bg-slate-50 border-2 border-slate-100 rounded-2xl text-sm font-bold focus:ring-4 focus:ring-blue-500/10"
                          >
                            <option value="">Selecione no clero...</option>
                            {clergy.map(c => (
                              <option key={c.id} value={c.id}>{c.name} ({c.role})</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {selectedItem && (
                        <div className="p-6 bg-blue-50/50 rounded-3xl border-2 border-blue-100 space-y-4">
                          <h4 className="text-[11px] font-black text-blue-600 uppercase tracking-widest flex items-center gap-2">
                            <Users size={14} />
                            Membros e Equipe Paroquial
                          </h4>
                          <div className="space-y-2">
                            {(() => {
                              const members = clergy.filter(c => c.parish_id === selectedItem.id);
                              const roleOrder: Record<string, number> = {
                                'pároco': 1,
                                'vigário': 2,
                                'diácono': 3,
                                'seminarista': 4,
                                'leigo formado': 5
                              };
                              const sortedMembers = [...members].sort((a, b) => 
                                (roleOrder[a.role] || 99) - (roleOrder[b.role] || 99)
                              );

                              if (sortedMembers.length === 0) {
                                return <p className="text-xs text-slate-400 italic">Nenhum membro vinculado a esta paróquia.</p>;
                              }

                              return sortedMembers.map(member => {
                                const isParoco = member.role === 'pároco';
                                return (
                                  <div key={member.id} className={cn(
                                    "flex items-center justify-between p-2 rounded-xl border transition-all",
                                    isParoco 
                                      ? "bg-blue-600 text-white border-blue-700 shadow-md transform scale-[1.02]" 
                                      : "bg-white text-slate-700 border-blue-100"
                                  )}>
                                    <div className="flex items-center gap-3">
                                      <div className={cn(
                                        "w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold",
                                        isParoco ? "bg-white text-blue-600" : "bg-blue-100 text-blue-600"
                                      )}>
                                        {member.name.charAt(0)}
                                      </div>
                                      <div>
                                        <p className={cn("text-sm font-bold", isParoco ? "text-white" : "text-slate-700")}>{member.name}</p>
                                        <p className={cn("text-[10px] font-medium uppercase tracking-wider", isParoco ? "text-blue-100" : "text-slate-400")}>
                                          {member.role} {isParoco && "(Responsável)"}
                                        </p>
                                      </div>
                                    </div>
                                    <button 
                                      type="button"
                                      onClick={() => {
                                        setActiveTab('clergy');
                                        handleEdit(member);
                                      }}
                                      className={cn(
                                        "p-2 rounded-lg transition-all",
                                        isParoco ? "text-white hover:bg-blue-500" : "text-blue-600 hover:bg-blue-50"
                                      )}
                                    >
                                      <Edit2 size={14} />
                                    </button>
                                  </div>
                                );
                              });
                            })()}
                          </div>
                        </div>
                      )}

                      <div className="p-6 bg-slate-50 rounded-3xl border-2 border-slate-100 space-y-4">
                        <h4 className="text-[11px] font-black text-blue-600 uppercase tracking-widest flex items-center gap-2">
                          <Scroll size={14} />
                          Informações Históricas e Contato
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Data de Fundação</label>
                            <input 
                              type="date"
                              value={parishForm.foundation_date || ''}
                              onChange={e => setParishForm({...parishForm, foundation_date: e.target.value})}
                              className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Telefone Fixo</label>
                            <input 
                              type="text"
                              value={parishForm.phone || ''}
                              onChange={e => setParishForm({...parishForm, phone: maskPhone(e.target.value)})}
                              placeholder="(00) 0000-0000"
                              className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm"
                            />
                          </div>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">E-mail Institucional</label>
                          <input 
                            type="email"
                            value={parishForm.email || ''}
                            onChange={e => setParishForm({...parishForm, email: e.target.value})}
                            placeholder="paroquia@diocese.org.br"
                            className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm"
                          />
                        </div>
                      </div>

                      <div className="p-6 bg-slate-50 rounded-3xl border-2 border-slate-100 space-y-4">
                        <h4 className="text-[11px] font-black text-blue-600 uppercase tracking-widest flex items-center gap-2">
                          <MapPin size={14} />
                          Localização
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                          <div className="md:col-span-3">
                            <input 
                              type="text"
                              value={parishForm.address_street || ''}
                              onChange={e => setParishForm({...parishForm, address_street: e.target.value})}
                              placeholder="Endereço (Rua, Av...)"
                              className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm"
                            />
                          </div>
                          <div className="md:col-span-1">
                            <input 
                              type="text"
                              value={parishForm.address_number || ''}
                              onChange={e => setParishForm({...parishForm, address_number: e.target.value})}
                              placeholder="Nº"
                              className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm"
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                          <div className="md:col-span-2">
                            <input 
                              type="text"
                              value={parishForm.address_neighborhood || ''}
                              onChange={e => setParishForm({...parishForm, address_neighborhood: e.target.value})}
                              placeholder="Bairro"
                              className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm"
                            />
                          </div>
                          <div className="md:col-span-1">
                            <input 
                              type="text"
                              value={parishForm.address_city || ''}
                              onChange={e => setParishForm({...parishForm, address_city: e.target.value})}
                              placeholder="Cidade"
                              className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm"
                            />
                          </div>
                          <div className="md:col-span-1">
                            <input 
                              type="text"
                              value={parishForm.address_state || ''}
                              onChange={e => setParishForm({...parishForm, address_state: e.target.value.toUpperCase()})}
                              placeholder="UF"
                              maxLength={2}
                              className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm uppercase"
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <input 
                            type="text"
                            value={parishForm.phone || ''}
                            onChange={e => setParishForm({...parishForm, phone: maskPhone(e.target.value)})}
                            placeholder="Telefone Fixo"
                            className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm"
                          />
                          <input 
                            type="email"
                            value={parishForm.email || ''}
                            onChange={e => setParishForm({...parishForm, email: e.target.value})}
                            placeholder="E-mail da Paróquia"
                            className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm"
                          />
                        </div>
                      </div>
                    </>
                  )}

                  {/* CLERGY FORM */}
                  {activeTab === 'clergy' && (
                    <>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="space-y-1">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Cód. Clero</label>
                          <input type="text" readOnly value={clergyForm.code || ''} className="w-full px-5 py-3 bg-slate-50 border-2 border-slate-100 rounded-2xl text-sm font-black text-slate-400" />
                        </div>
                        <div className="space-y-1 col-span-2">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Nome Completo</label>
                          <input 
                            type="text" 
                            required 
                            value={clergyForm.name || ''} 
                            onChange={e => setClergyForm({...clergyForm, name: e.target.value})} 
                            className="w-full px-5 py-3 bg-slate-50 border-2 border-slate-100 rounded-2xl text-sm font-bold focus:ring-4 focus:ring-blue-500/10" 
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-1">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Identificação / Função</label>
                          <select 
                            required 
                            value={clergyForm.role || ''} 
                            onChange={e => setClergyForm({...clergyForm, role: e.target.value as ClergyRole})} 
                            className="w-full px-5 py-3 bg-slate-50 border-2 border-slate-100 rounded-2xl text-sm font-bold focus:ring-4 focus:ring-blue-500/10 transition-all font-sans"
                          >
                            <option value="pároco">Pároco</option>
                            <option value="vigário">Vigário</option>
                            <option value="diácono">Diácono</option>
                            <option value="seminarista">Seminarista</option>
                            <option value="leigo formado">Leigo Formado</option>
                          </select>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Paróquia Vinculada</label>
                          <select 
                            required 
                            value={clergyForm.parish_id || ''} 
                            onChange={e => setClergyForm({...clergyForm, parish_id: e.target.value})} 
                            className="w-full px-5 py-3 bg-slate-50 border-2 border-slate-100 rounded-2xl text-sm font-bold focus:ring-4 focus:ring-blue-500/10"
                          >
                            <option value="">Selecione a sede...</option>
                            {parishes.map(p => (
                              <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="p-6 bg-slate-50 rounded-3xl border-2 border-slate-100 space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                          <div className="md:col-span-3">
                            <input 
                              type="text" 
                              value={clergyForm.address || ''} 
                              onChange={e => setClergyForm({...clergyForm, address: e.target.value})} 
                              placeholder="Endereço (Rua, Av...)"
                              className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm" 
                            />
                          </div>
                          <div className="md:col-span-1">
                            <input 
                              type="text" 
                              value={clergyForm.address_number || ''} 
                              onChange={e => setClergyForm({...clergyForm, address_number: e.target.value})} 
                              placeholder="Nº"
                              className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm" 
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                          <div className="md:col-span-2">
                            <input 
                              type="text" 
                              value={clergyForm.address_neighborhood || ''} 
                              onChange={e => setClergyForm({...clergyForm, address_neighborhood: e.target.value})} 
                              placeholder="Bairro"
                              className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm" 
                            />
                          </div>
                          <div className="md:col-span-1">
                            <input 
                              type="text" 
                              value={clergyForm.address_city || ''} 
                              onChange={e => setClergyForm({...clergyForm, address_city: e.target.value})} 
                              placeholder="Cidade"
                              className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm" 
                            />
                          </div>
                          <div className="md:col-span-1">
                            <input 
                              type="text" 
                              value={clergyForm.address_state || ''} 
                              onChange={e => setClergyForm({...clergyForm, address_state: e.target.value.toUpperCase()})} 
                              placeholder="UF"
                              maxLength={2}
                              className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm uppercase" 
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Celular</label>
                            <div className="relative">
                              <PhoneCall size={14} className="absolute left-3 top-2.5 text-slate-400" />
                              <input 
                                type="text" 
                                value={clergyForm.phone_mobile || ''} 
                                onChange={e => setClergyForm({...clergyForm, phone_mobile: maskPhone(e.target.value)})} 
                                className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm" 
                              />
                            </div>
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">WhatsApp</label>
                            <div className="relative">
                              <MessageCircle size={14} className="absolute left-3 top-2.5 text-emerald-500" />
                              <input 
                                type="text" 
                                value={clergyForm.phone_whatsapp || ''} 
                                onChange={e => setClergyForm({...clergyForm, phone_whatsapp: maskPhone(e.target.value)})} 
                                className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm" 
                              />
                            </div>
                          </div>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">E-mail</label>
                          <div className="relative">
                            <Mail size={14} className="absolute left-3 top-2.5 text-slate-400" />
                            <input 
                              type="email" 
                              value={clergyForm.email || ''} 
                              onChange={e => setClergyForm({...clergyForm, email: e.target.value})} 
                              className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm" 
                              placeholder="exemplo@email.com"
                            />
                          </div>
                        </div>
                      </div>
                    </>
                  )}

                  <div className="flex gap-4 pt-4 sticky bottom-0 bg-white pb-2">
                    <button
                      type="button"
                      onClick={() => setIsEditing(false)}
                      className="flex-1 px-4 py-4 bg-slate-100 text-slate-600 rounded-2xl text-sm font-black uppercase tracking-widest hover:bg-slate-200 transition-all"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={loading}
                      className="flex-[2] px-4 py-4 bg-[#00174b] text-white rounded-2xl text-sm font-black uppercase tracking-widest hover:bg-blue-600 transition-all shadow-xl shadow-blue-900/10 flex items-center justify-center gap-2"
                    >
                      {loading ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                      Salvar Registro
                    </button>
                  </div>
                </form>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>

      {/* Detail View Modal */}
      <AnimatePresence>
        {isViewing && selectedItem && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm print:hidden">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-[40px] shadow-2xl w-full max-w-2xl overflow-hidden"
            >
              <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-blue-600 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-blue-200">
                    {activeTab === 'foranias' ? <MapIcon size={24} /> : activeTab === 'parishes' ? <Church size={24} /> : <User size={24} />}
                  </div>
                  <div>
                    <h3 className="text-2xl font-black text-slate-800 tracking-tight">Visualizar Registro</h3>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">CÓDIGO: #{selectedItem.code}</p>
                  </div>
                </div>
                <button onClick={() => setIsViewing(false)} className="p-3 text-slate-400 hover:text-slate-600 hover:bg-white rounded-2xl transition-all shadow-sm">
                  <X size={20} />
                </button>
              </div>

              <div className="p-8 max-h-[60vh] overflow-y-auto space-y-8 custom-scrollbar">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {activeTab === 'foranias' && (
                    <>
                      <DetailField label="Nome da Forania" value={selectedItem.name} icon={<MapIcon size={14} />} fullWidth />
                      <DetailField label="Padre Forâneo" value={selectedItem.priest_name} icon={<User size={14} />} fullWidth />
                    </>
                  )}

                  {activeTab === 'parishes' && (
                    <>
                      <DetailField label="Nome da Paróquia" value={selectedItem.name} icon={<Church size={14} />} fullWidth />
                      <DetailField label="Forania" value={foraries.find(f => f.id === selectedItem.forania_id)?.name} icon={<MapIcon size={14} />} />
                      <DetailField label="Padre Responsável" value={selectedItem.priest_name} icon={<User size={14} />} />
                      <DetailField label="Endereço" value={`${selectedItem.address_street || ''}, ${selectedItem.address_number || ''}`} icon={<MapPin size={14} />} fullWidth />
                      <DetailField label="Bairro" value={selectedItem.address_neighborhood} icon={<MapPin size={14} />} />
                      <DetailField label="Cidade/UF" value={`${selectedItem.address_city || ''} - ${selectedItem.address_state || ''}`} icon={<MapPin size={14} />} />
                          <DetailField label="E-mail" value={selectedItem.email} icon={<Mail size={14} />} />
                      <DetailField label="Telefone" value={selectedItem.phone} icon={<Phone size={14} />} />
                      <DetailField label="Data de Fundação" value={selectedItem.foundation_date ? new Date(selectedItem.foundation_date + 'T00:00:00').toLocaleDateString('pt-BR') : 'Não informada'} icon={<Scroll size={14} />} />
                    </>
                  )}

                  {activeTab === 'clergy' && (
                    <>
                      <DetailField label="Nome Completo" value={selectedItem.name} icon={<User size={14} />} fullWidth />
                      <DetailField label="Função/Identificação" value={selectedItem.role} icon={<Shield size={14} />} />
                      <DetailField label="Paróquia Vinculada" value={parishes.find(p => p.id === selectedItem.parish_id)?.name} icon={<Church size={14} />} />
                      <DetailField label="E-mail" value={selectedItem.email} icon={<Mail size={14} />} />
                      <DetailField label="Endereço Residencial" value={`${selectedItem.address || ''}, ${selectedItem.address_number || ''}`} icon={<MapPin size={14} />} fullWidth />
                      <DetailField label="Bairro" value={selectedItem.address_neighborhood} icon={<MapPin size={14} />} />
                      <DetailField label="Cidade/UF" value={`${selectedItem.address_city || ''} - ${selectedItem.address_state || ''}`} icon={<MapPin size={14} />} />
                      <DetailField label="Celular" value={selectedItem.phone_mobile} icon={<Phone size={14} />} />
                      <DetailField label="WhatsApp" value={selectedItem.phone_whatsapp} icon={<MessageCircle size={14} />} />
                    </>
                  )}
                </div>
              </div>

              <div className="p-8 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
                <button 
                  onClick={() => setIsViewing(false)}
                  className="px-8 py-4 text-slate-600 font-black text-xs uppercase tracking-widest hover:bg-slate-200 rounded-2xl transition-all"
                >
                  Fechar
                </button>
                <button 
                  onClick={() => {
                    setIsViewing(false);
                    handleEdit(selectedItem);
                  }}
                  className="px-8 py-4 bg-blue-600 text-white font-black text-xs uppercase tracking-widest rounded-2xl shadow-xl shadow-blue-200 hover:bg-blue-700 transition-all flex items-center gap-2"
                >
                  <Edit2 size={14} />
                  Editar Registro
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Deletion Confirmation Modal */}
      <AnimatePresence>
        {isDeleting && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm print:hidden">
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl border border-white/20 p-8 space-y-6 text-center"
            >
              <div className="w-20 h-20 bg-red-50 text-red-500 rounded-3xl flex items-center justify-center mx-auto mb-2">
                <Trash2 size={40} />
              </div>
              
              <div className="space-y-2">
                <h3 className="text-2xl font-black text-[#131b2e]">Confirmar Exclusão</h3>
                <p className="text-slate-500 font-medium leading-relaxed">
                  Tem certeza que deseja excluir permanentemente <span className="text-red-600 font-bold">"{itemToDelete?.name}"</span>? Esta ação não pode ser desfeita.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-2">
                <button
                  onClick={() => { setIsDeleting(false); setItemToDelete(null); }}
                  className="px-6 py-4 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-2xl font-bold transition-all"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleDeleteConfirm}
                  disabled={loading}
                  className="px-6 py-4 bg-red-600 hover:bg-red-700 text-white rounded-2xl font-bold shadow-lg shadow-red-200 transition-all flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <Loader2 size={20} className="animate-spin" />
                  ) : (
                    "Excluir Agora"
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {notification && (
        <div className={cn(
          "fixed bottom-8 left-1/2 -translate-x-1/2 px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-bottom-5 z-[100] print:hidden",
          notification.type === 'success' ? "bg-emerald-500 text-white" : "bg-red-500 text-white"
        )}>
          {notification.type === 'success' ? <Loader2 size={20} className="animate-spin" /> : <AlertCircle size={20} />}
          <span className="font-bold">{notification.message}</span>
        </div>
      )}

      {/* Print Styles */}
      <style>{`
        @media print {
          body { background: white !important; }
          .print\\:hidden { display: none !important; }
          .max-w-7xl { max-width: 100% !important; margin: 0 !important; width: 100% !important; }
          .grid { display: block !important; }
          .rounded-[2rem] { border-radius: 0 !important; border: 1px solid #e2e8f0 !important; margin-bottom: 2rem !important; page-break-inside: avoid; }
          @page { margin: 2cm; }
        }
      `}</style>
    </div>
  );
}
