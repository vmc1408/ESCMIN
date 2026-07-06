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
  PlusCircle,
  MessageCircle,
  Layers,
  Eye,
  Shield,
  Upload,
  Filter
} from 'lucide-react';
import { fetchAll, saveData, deleteData } from '../lib/database';
import { cn, maskCEP, maskPhone, maskDate, formatDateForDisplay, parseDateToDB } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { Parish, Foraria, ClergyLeity, ClergyRole } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { PageHeader } from '../components/PageHeader';

type TabType = 'dashboard' | 'foranias' | 'parishes' | 'clergy';

const DetailField = ({ label, value, icon, fullWidth = false }: { label: string, value: any, icon: React.ReactNode, fullWidth?: boolean }) => (
  <div className={cn("space-y-1.5 min-w-0", fullWidth ? "md:col-span-2" : "")}>
    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1 border-l-2 border-blue-500/20">{label}</label>
    <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200/80 min-w-0">
      <div className="text-blue-500 shrink-0">
        {icon}
      </div>
      <span className="text-sm font-semibold text-slate-700 break-all select-all">{value || 'Não informado'}</span>
    </div>
  </div>
);

const SummaryCard = ({ label, value, icon, color }: { label: string, value: number, icon: React.ReactNode, color: string }) => (
  <div className="bg-white p-5 rounded-lg border border-slate-200/80 shadow-sm flex items-center gap-4 group transition-all duration-200">
    <div className={cn("w-12 h-12 rounded-lg flex items-center justify-center text-white shadow-sm", color)}>
      {icon}
    </div>
    <div>
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none mb-1">{label}</p>
      <p className="text-2xl font-bold text-slate-800 tracking-tight">{value}</p>
    </div>
  </div>
);

export function Diocese() {
  const { user: userAuth } = useAuth();
  const [activeTab, setActiveTab ] = useState<TabType>('dashboard');
  const [parishes, setParishes] = useState<Parish[]>([]);
  const [foraries, setForaries] = useState<Foraria[]>([]);
  const [clergy, setClergy] = useState<ClergyLeity[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterForania, setFilterForania] = useState<string>('');
  const [filterParish, setFilterParish] = useState<string>('');
  const [filterClergyMember, setFilterClergyMember] = useState<string>('');
  const [filterRole, setFilterRole] = useState<string>('');
  const [sortBy, setSortBy] = useState<'name' | 'date'>('name');
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
    priest_id: '',
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
    phone_mobile_is_whatsapp: false,
    phone_whatsapp: '',
    email: '',
    parish_id: '',
    role: 'pároco'
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Import Mapping States
  const [isImportMapping, setIsImportMapping] = useState(false);
  const [importRows, setImportRows] = useState<any[][]>([]);
  const [importHeaders, setImportHeaders] = useState<string[]>([]);
  const [importHeaderIdx, setImportHeaderIdx] = useState(-1);
  const [importMapping, setImportMapping] = useState<Record<string, number>>({
    forania: -1,
    paroquia: -1,
    membro: -1,
    cargo: -1,
    cnpj: -1,
    telefone: -1,
    email: -1,
    endereco: -1,
    cidade: -1
  });

  const TARGET_FIELDS = [
    { key: 'forania', label: 'Forania / Região', keywords: ['forania', 'regiao', 'setor', 'area pastoral'] },
    { key: 'paroquia', label: 'Paróquia / Comunidade', keywords: ['paroquia', 'comunidade', 'parish', 'igreja'] },
    { key: 'membro', label: 'Padre / Membro', keywords: ['padre', 'clero', 'membro', 'nome', 'priest', 'presbítero'] },
    { key: 'cargo', label: 'Cargo / Função', keywords: ['cargo', 'funcao', 'oficio', 'titulo', 'role', 'posicao'] },
    { key: 'cnpj', label: 'CNPJ', keywords: ['cnpj', 'inscricao federal', 'c.n.p.j.'] },
    { key: 'telefone', label: 'Telefone / Contato', keywords: ['telefone', 'celular', 'fone', 'phone', 'contato', 'tel'] },
    { key: 'email', label: 'E-mail', keywords: ['email', 'e-mail', 'correio', 'mail', 'endereço eletrônico'] },
    { key: 'endereco', label: 'Endereço / Rua', keywords: ['endereco', 'rua', 'address', 'logradouro', 'localizacao'] },
    { key: 'cidade', label: 'Cidade / Município', keywords: ['cidade', 'municipio', 'city', 'localidade'] }
  ];

  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !userAuth) return;

    try {
      setLoading(true);
      const reader = new FileReader();
      reader.onload = async (evt) => {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'array' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
        if (rows.length === 0) {
          setNotification({ type: 'error', message: 'Planilha vazia.' });
          setLoading(false);
          return;
        }

        // Find header row
        let hIdx = -1;
        for (let i = 0; i < Math.min(rows.length, 20); i++) {
          const row = rows[i];
          if (row && row.some(cell => {
            const val = String(cell || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            return val.includes('paroquia') || val.includes('forania') || val.includes('padre') || val.includes('cnpj') || val.includes('membro');
          })) {
            hIdx = i;
            break;
          }
        }

        if (hIdx === -1) hIdx = 0; // Fallback to first row

        const headers = rows[hIdx].map(h => String(h || '').trim());
        const normalizedHeaders = headers.map(h => h.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""));

        // Initial Auto-Mapping
        const initialMapping: Record<string, number> = {};
        TARGET_FIELDS.forEach(field => {
          let foundIdx = normalizedHeaders.findIndex(h => field.keywords.some(k => h === k));
          if (foundIdx === -1) {
            foundIdx = normalizedHeaders.findIndex(h => h.length > 2 && field.keywords.some(k => h.includes(k)));
          }
          initialMapping[field.key] = foundIdx;
        });

        setImportRows(rows);
        setImportHeaders(headers);
        setImportHeaderIdx(hIdx);
        setImportMapping(initialMapping);
        setIsImportMapping(true);
        setLoading(false);
      };
      reader.readAsArrayBuffer(file);
    } catch (error) {
      console.error('Error reading excel:', error);
      setNotification({ type: 'error', message: 'Erro ao ler planilha.' });
      setLoading(false);
    }
  };

  const executeImport = async () => {
    if (!userAuth || importRows.length === 0) return;

    try {
      setLoading(true);
      setIsImportMapping(false);

      const colIdx = importMapping;
      const rows = importRows;
      const headerRowIdx = importHeaderIdx;

      let currentForaries = [...foraries];
      let currentParishes = [...parishes];
      let currentClergy = [...clergy];

      const cleanupValue = (val: any) => {
        let str = String(val || '').trim();
        str = str.replace(/^(paroquia|paróquia|forania|padre):?\s*/i, '');
        return str.trim();
      };

      const normalizeRole = (role: string): ClergyRole => {
        const r = String(role || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        if (r.includes('paroco')) return 'pároco';
        if (r.includes('vigario')) return 'vigário';
        if (r.includes('diacono')) return 'diácono';
        if (r.includes('seminarista')) return 'seminarista';
        return 'leigo formado';
      };

      let importedCount = 0;
      let parishesCreated = 0;
      let clergyCreated = 0;
      let foraniasCreated = 0;
      let lastForaniaObj: Foraria | null = null;
      let lastParishObj: Parish | null = null;

      for (let i = headerRowIdx + 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length === 0) continue;

        const rawForName = colIdx.forania >= 0 ? cleanupValue(row[colIdx.forania]) : '';
        const rawParName = colIdx.paroquia >= 0 ? cleanupValue(row[colIdx.paroquia]) : '';
        const priestName = colIdx.membro >= 0 ? cleanupValue(row[colIdx.membro]) : '';
        const roleRaw = colIdx.cargo >= 0 ? String(row[colIdx.cargo] || '').trim() : '';
        const cnpj = colIdx.cnpj >= 0 ? String(row[colIdx.cnpj] || '').trim() : '';
        const phone = colIdx.telefone >= 0 ? String(row[colIdx.telefone] || '').trim() : '';
        const email = colIdx.email >= 0 ? String(row[colIdx.email] || '').trim() : '';
        const address = colIdx.endereco >= 0 ? String(row[colIdx.endereco] || '').trim() : '';
        const city = colIdx.cidade >= 0 ? String(row[colIdx.cidade] || '').trim() : '';

        const forName = rawForName || (lastForaniaObj ? lastForaniaObj.name : '');
        const parName = rawParName || (lastParishObj ? lastParishObj.name : '');

        if (!forName && !parName && !priestName) continue;

        // Forania Logic
        let forania: Foraria | undefined;
        if (forName) {
          forania = currentForaries.find(f => f.name.toLowerCase() === forName.toLowerCase());
          if (!forania) {
            const newCode = getNextCode(currentForaries);
            const newForania: Foraria = {
              id: newCode,
              code: newCode,
              name: forName,
              priest_name: '',
              user_id: userAuth.uid,
              created_at: new Date().toISOString()
            };
            await saveData('foraries', newForania.id, newForania);
            currentForaries.push(newForania);
            forania = newForania;
            foraniasCreated++;
          }
          lastForaniaObj = forania;
        } else {
          forania = lastForaniaObj || undefined;
        }

        // Parish Logic
        let parish: Parish | undefined;
        if (parName) {
          parish = currentParishes.find(p => p.name.toLowerCase() === parName.toLowerCase());
          if (!parish) {
            const forId = forania?.id || lastForaniaObj?.id;
            if (!forId) continue;

            const newCode = getNextCode(currentParishes);
            const newParish: Partial<Parish> = {
              id: newCode,
              code: newCode,
              name: parName,
              forania_id: forId,
              priest_id: '',
              priest_name: '',
              address_city: city || 'Guarulhos',
              address_state: 'SP',
              address_street: address,
              phone: phone,
              email: email,
              user_id: userAuth.uid,
              created_at: new Date().toISOString()
            };
            if (cnpj) (newParish as any).cnpj = cnpj;
            
            await saveData('parishes', newCode, newParish);
            currentParishes.push(newParish as Parish);
            parish = newParish as Parish;
            parishesCreated++;
          } else {
            let updated = false;
            if (cnpj && (parish as any).cnpj !== cnpj) { (parish as any).cnpj = cnpj; updated = true; }
            if (phone && parish.phone !== phone) { parish.phone = phone; updated = true; }
            if (email && parish.email !== email) { parish.email = email; updated = true; }
            if (address && parish.address_street !== address) { parish.address_street = address; updated = true; }
            if (city && parish.address_city !== city) { parish.address_city = city; updated = true; }
            
            const forId = forania?.id || lastForaniaObj?.id;
            if (!parish.forania_id && forId) {
              parish.forania_id = forId;
              updated = true;
            }
            if (updated) await saveData('parishes', parish.id, parish);
          }
          lastParishObj = parish || null;
        } else {
          parish = lastParishObj || undefined;
        }

        // Clergy Logic
        const targetParish = parish || lastParishObj;
        if (priestName && targetParish) {
          let member = currentClergy.find(c => c.name.toLowerCase() === priestName.toLowerCase());
          const role = normalizeRole(roleRaw);

          if (!member) {
            const newCode = getNextCode(currentClergy);
            const newMember: ClergyLeity = {
              id: newCode,
              code: newCode,
              name: priestName,
              role: role,
              parish_id: targetParish.id,
              forania_id: targetParish.forania_id,
              phone_mobile: phone,
              email: email,
              address: address,
              address_city: city || 'Guarulhos',
              address_state: 'SP',
              user_id: userAuth.uid,
              created_at: new Date().toISOString()
            };
            await saveData('clergy_leity', newMember.id, newMember);
            currentClergy.push(newMember);
            member = newMember;
            clergyCreated++;
          } else {
            let memberUpdated = false;
            if (role && member.role !== role) { member.role = role; memberUpdated = true; }
            if (targetParish.id && member.parish_id !== targetParish.id) { 
              member.parish_id = targetParish.id; 
              member.forania_id = targetParish.forania_id;
              memberUpdated = true; 
            }
            if (phone && member.phone_mobile !== phone) { member.phone_mobile = phone; memberUpdated = true; }
            if (email && member.email !== email) { member.email = email; memberUpdated = true; }
            
            if (memberUpdated) await saveData('clergy_leity', member.id, member);
          }

          if (member && role === 'pároco' && targetParish.priest_id !== member.id) {
            targetParish.priest_id = member.id;
            targetParish.priest_name = member.name;
            await saveData('parishes', targetParish.id, {
              ...targetParish,
              priest_id: member.id,
              priest_name: member.name
            });
          }
        }
        importedCount++;
      }

      setNotification({ 
        type: 'success', 
        message: `Importação concluída! Processados: ${importedCount} linhas. Criados: ${foraniasCreated} foranias, ${parishesCreated} paróquias, ${clergyCreated} membros do clero.` 
      });
      fetchData();
    } catch (error) {
      console.error('Error executing import:', error);
      setNotification({ type: 'error', message: 'Erro ao processar importação.' });
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
        priest_id: '',
        priest_name: ''
      });
    } else if (activeTab === 'parishes' || activeTab === 'dashboard') {
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
        cnpj: '',
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
        forania_id: '',
        role: 'pároco'
      });
    }
    setIsEditing(true);
  };

  const handleEdit = (item: any) => {
    setSelectedItem(item);
    if (activeTab === 'foranias') {
      const foraniaData = { ...item };
      if (!foraniaData.priest_id && foraniaData.priest_name) {
        const priest = clergy.find(c => c.name === foraniaData.priest_name);
        if (priest) foraniaData.priest_id = priest.id;
      }
      setForariaForm(foraniaData);
    } else if (activeTab === 'parishes' || activeTab === 'dashboard') {
      setParishForm({
        address_city: 'Guarulhos',
        address_state: 'SP',
        cnpj: '',
        ...item,
        foundation_date: item.foundation_date
      });
    } else {
      setClergyForm({
        address_city: 'Guarulhos',
        address_state: 'SP',
        forania_id: '',
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
      const collection = activeTab === 'foranias' ? 'foraries' : (activeTab === 'parishes' || activeTab === 'dashboard') ? 'parishes' : 'clergy_leity';
      let data = { ...(activeTab === 'foranias' ? forariaForm : (activeTab === 'parishes' || activeTab === 'dashboard') ? parishForm : clergyForm) };
      
      // Prepare data for DB
      const dataForDB = { ...data };
      
      if (activeTab === 'parishes' || activeTab === 'dashboard') {
        const foundationDate = (dataForDB as any).foundation_date;
        const parsed = foundationDate ? parseDateToDB(foundationDate) : null;
        
        if (parsed) {
          (dataForDB as any).foundation_date = parsed;
        } else {
          // Explicitly delete if empty to avoid sending "" to a DATE column
          delete (dataForDB as any).foundation_date;
        }
      }
      
      if (activeTab === 'clergy') {
        // Automatically sync forania_id from parish if missing but parish is present
        if (!(dataForDB as any).forania_id && (dataForDB as any).parish_id) {
          const p = parishes.find(par => par.id === (dataForDB as any).parish_id);
          if (p) (dataForDB as any).forania_id = p.forania_id;
        }
      }
      
      const docId = selectedItem?.id || (dataForDB as any).code;

      await saveData(collection, docId as string, {
        ...dataForDB,
        user_id: userAuth.uid,
        created_at: selectedItem?.created_at || new Date().toISOString()
      });

      setNotification({ type: 'success', message: 'Registro salvo com sucesso!' });
      setIsEditing(false);
      fetchData();
    } catch (error) {
      console.error('Save error:', error);
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

  const filteredItems = (() => {
    let baseItems: any[] = [];
    if (activeTab === 'dashboard') {
      const anyFilter = search.trim() || filterForania || filterParish || filterClergyMember || filterRole;
      if (!anyFilter) return [];

      let typesToShow = new Set(['forania', 'parish', 'clergy']);
      
      if (!search.trim()) {
        if (filterClergyMember) {
          typesToShow = new Set(['clergy']);
        } else if (filterParish) {
          if (filterParish === 'all') {
            typesToShow = new Set(['parish']);
          } else {
            typesToShow = new Set(['parish', 'clergy']);
          }
        } else if (filterForania) {
          if (filterForania === 'all') {
            typesToShow = new Set(['parish']);
          } else {
            typesToShow = new Set(['forania', 'parish', 'clergy']);
          }
        }
      }
      
      if (typesToShow.has('forania')) baseItems.push(...foraries.map(f => ({ ...f, _type: 'forania' })));
      if (typesToShow.has('parish')) baseItems.push(...parishes.map(p => ({ ...p, _type: 'parish' })));
      if (typesToShow.has('clergy')) baseItems.push(...clergy.map(c => ({ ...c, _type: 'clergy' })));
    } else if (activeTab === 'foranias') {
      baseItems = foraries.map(f => ({ ...f, _type: 'forania' }));
    } else if (activeTab === 'parishes') {
      baseItems = parishes.map(p => ({ ...p, _type: 'parish' }));
    } else {
      baseItems = clergy.map(c => ({ ...c, _type: 'clergy' }));
    }

    return baseItems.filter(item => {
      const query = search.toLowerCase().trim();
      
      // Robust search: checks own fields
      const matchesSearchOwn = !query || Object.entries(item).some(([key, val]) => {
        if (['_type', 'id', 'forania_id', 'parish_id', 'priest_id', 'user_id', 'created_at', 'updated_at'].includes(key)) return false;
        return String(val || '').toLowerCase().includes(query);
      });

      // Robust search: checks linked fields (Cross-reference search)
      let matchesSearchLinked = false;
      if (query) {
        if (item._type === 'parish') {
          // Search parish by forania name or priest name
          const fName = foraries.find(f => f.id === item.forania_id)?.name.toLowerCase() || '';
          const pName = item.priest_name?.toLowerCase() || '';
          if (fName.includes(query) || pName.includes(query)) matchesSearchLinked = true;
        } else if (item._type === 'clergy') {
          // Search clergy by parish name or forania name
          const pName = parishes.find(p => p.id === item.parish_id)?.name.toLowerCase() || '';
          const fName = foraries.find(f => f.id === item.forania_id)?.name.toLowerCase() || '';
          if (pName.includes(query) || fName.includes(query)) matchesSearchLinked = true;
        } else if (item._type === 'forania') {
          // Search forania by its priest name (already covered by own fields, but good for clarity)
          const pName = item.priest_name?.toLowerCase() || '';
          if (pName.includes(query)) matchesSearchLinked = true;
        }
      }

      const matchesSearch = matchesSearchOwn || matchesSearchLinked;
      
      // Secondary Filters (Forania / Parish / Clergy / Role)
      const matchesForania = !filterForania || filterForania === 'all' || (
        item._type === 'forania' ? item.id === filterForania :
        item._type === 'parish' ? item.forania_id === filterForania :
        item._type === 'clergy' ? (
          item.forania_id === filterForania || 
          (item.parish_id && parishes.find(p => p.id === item.parish_id)?.forania_id === filterForania)
        ) : false
      );

      const matchesParish = !filterParish || filterParish === 'all' || (
        item._type === 'parish' ? item.id === filterParish :
        item._type === 'clergy' ? item.parish_id === filterParish :
        item._type === 'forania' ? parishes.some(p => p.id === filterParish && p.forania_id === item.id) : false
      );

      const matchesClergyMember = !filterClergyMember || filterClergyMember === 'all' || (
        item._type === 'clergy' ? item.id === filterClergyMember :
        item._type === 'parish' ? (
          item.priest_id === filterClergyMember ||
          clergy.some(c => c.id === filterClergyMember && c.parish_id === item.id)
        ) :
        item._type === 'forania' ? (
          clergy.some(c => c.id === filterClergyMember && (
            c.forania_id === item.id || 
            (c.parish_id && parishes.find(p => p.id === c.parish_id)?.forania_id === item.id)
          ))
        ) : false
      );

      const matchesRole = !filterRole || (
        item._type === 'clergy' ? item.role === filterRole : false
      );
      
      return matchesSearch && matchesForania && matchesParish && matchesClergyMember && (activeTab === 'clergy' || activeTab === 'dashboard' ? matchesRole : true);
    });
  })()
    .sort((a: any, b: any) => {
      let valA: any, valB: any;
      
      if (sortBy === 'name') {
        valA = String(a.name || '').toLowerCase();
        valB = String(b.name || '').toLowerCase();
      } else if (sortBy === 'date') {
        valA = a.foundation_date || a.created_at || '';
        valB = b.foundation_date || b.created_at || '';
      } else {
        valA = String(a.name || '').toLowerCase();
        valB = String(b.name || '').toLowerCase();
      }

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-20">
      <PageHeader
        title="Gestão da Diocese"
        description="Painel Central de paróquias, foranias e clero para controle de uso exclusivo e interno."
        icon={Scroll}
      >
        <div className="flex items-center gap-3">
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleImportExcel} 
            accept=".xlsx, .xls, .csv" 
            className="hidden" 
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="h-10 px-4 bg-white border border-slate-200 text-slate-600 rounded-none text-[10px] font-bold uppercase tracking-widest hover:bg-slate-50 transition-all flex items-center gap-2 shadow-sm cursor-pointer"
          >
            <Upload size={14} className="text-slate-600" />
            Importar Excel
          </button>
          <button
            onClick={handlePrint}
            className="h-10 px-4 bg-slate-900 text-white rounded-none text-[10px] font-bold uppercase tracking-widest hover:bg-slate-800 transition-all flex items-center gap-2 shadow-sm cursor-pointer"
          >
            <Printer size={14} />
            Gerar Relatório
          </button>
        </div>
      </PageHeader>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 print:hidden">
        <SummaryCard label="Foranias" value={foraries.length} icon={<MapIcon size={20} />} color="bg-slate-700" />
        <SummaryCard label="Paróquias" value={parishes.length} icon={<Church size={20} />} color="bg-blue-600" />
        <SummaryCard label="Clero e Diáconos" value={clergy.length} icon={<Users size={20} />} color="bg-slate-800" />
      </div>

      {/* Nav Tabs */}
      <div className="flex flex-col md:flex-row items-center gap-6 print:hidden">
        <div className="flex items-center gap-1 p-1 bg-slate-100/50 rounded-lg border border-slate-200 w-full md:w-fit">
          <button
            onClick={() => { 
              setActiveTab('dashboard'); 
              setIsEditing(false); 
              setSearch('');
              setFilterForania('');
              setFilterParish('');
              setFilterClergyMember('');
              setFilterRole('');
            }}
            className={cn(
              "flex-1 md:flex-none px-6 py-2 rounded-md text-[9px] font-bold uppercase tracking-widest tracking-wider transition-all flex items-center justify-center gap-2",
              activeTab === 'dashboard' ? "bg-white text-blue-600 shadow-sm border border-slate-150" : "text-slate-400 hover:text-slate-600"
            )}
          >
            <Layers size={14} />
            Geral
          </button>
          <button
            onClick={() => { setActiveTab('parishes'); setIsEditing(false); setFilterParish(''); }}
            className={cn(
              "flex-1 md:flex-none px-6 py-2 rounded-md text-[9px] font-bold uppercase tracking-widest tracking-wider transition-all flex items-center justify-center gap-2",
              activeTab === 'parishes' ? "bg-white text-blue-600 shadow-sm border border-slate-150" : "text-slate-400 hover:text-slate-600"
            )}
          >
            <Church size={14} />
            Paróquias
          </button>
          <button
            onClick={() => { setActiveTab('foranias'); setIsEditing(false); setFilterForania(''); }}
            className={cn(
              "flex-1 md:flex-none px-6 py-2 rounded-md text-[9px] font-bold uppercase tracking-widest tracking-wider transition-all flex items-center justify-center gap-2",
              activeTab === 'foranias' ? "bg-white text-blue-600 shadow-sm border border-slate-150" : "text-slate-400 hover:text-slate-600"
            )}
          >
            <MapIcon size={14} />
            Foranias
          </button>
          <button
            onClick={() => { setActiveTab('clergy'); setIsEditing(false); setFilterClergyMember(''); }}
            className={cn(
              "flex-1 md:flex-none px-6 py-2 rounded-md text-[9px] font-bold uppercase tracking-widest tracking-wider transition-all flex items-center justify-center gap-2",
              activeTab === 'clergy' ? "bg-white text-blue-600 shadow-sm border border-slate-150" : "text-slate-400 hover:text-slate-600"
            )}
          >
            <Shield size={14} />
            Clero/Diaconia
          </button>
        </div>

        <button
          onClick={handleAddNew}
          className="w-full md:w-auto px-5 py-2.5 bg-blue-600 text-white rounded-lg text-[10px] font-bold uppercase tracking-widest hover:bg-blue-700 active:scale-95 transition-all shadow-sm flex items-center justify-center gap-3"
        >
          <Plus size={16} />
          Novo Cadastro
        </button>
      </div>

      {/* Filters Hub */}
      <div className="bg-white p-5 rounded-lg shadow-sm border border-slate-200 flex flex-col md:flex-row items-center gap-4 print:hidden">
        <div className="flex-1 flex items-center gap-3 w-full bg-slate-50 px-4 py-2 border border-slate-200 rounded-lg focus-within:bg-white focus-within:ring-2 focus-within:ring-blue-500/10 transition-all">
          <Search className="text-slate-400" size={16} />
          <input 
            type="text"
            placeholder="Qualquer informação (Nome, Padre, CNPJ, Cidade...)"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 bg-transparent border-none focus:ring-0 text-sm font-semibold text-slate-700 placeholder:text-slate-350"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto shrink-0">
          {/* Forania Filter - Hidden only if we are in Foranias tab and user considers search box as "auto-busca" */}
          {activeTab !== 'foranias' && (
            <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-lg border border-slate-200">
              <MapIcon size={14} className="text-indigo-400" />
              <select
                value={filterForania}
                onChange={(e) => {
                  setFilterForania(e.target.value);
                  setFilterParish('');
                  setFilterClergyMember('');
                }}
                className="bg-transparent border-none text-[9px] font-bold uppercase tracking-widest text-slate-500 focus:ring-0 cursor-pointer p-0"
              >
                <option value="">Selecionar Forania...</option>
                <option value="all">Todas as Foranias</option>
                {foraries.map(f => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Parish Filter - Hidden if in Parishes tab */}
          {activeTab !== 'parishes' && (
            <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-lg border border-slate-200">
              <Church size={14} className="text-blue-400" />
              <select
                value={filterParish}
                onChange={(e) => {
                  setFilterParish(e.target.value);
                  if (e.target.value !== 'all' && e.target.value !== '') {
                    const p = parishes.find(par => par.id === e.target.value);
                    if (p && !filterForania) setFilterForania(p.forania_id);
                  }
                  setFilterClergyMember('');
                }}
                className="bg-transparent border-none text-[9px] font-bold uppercase tracking-widest text-slate-500 focus:ring-0 cursor-pointer p-0 max-w-[120px]"
              >
                <option value="">Selecionar Paróquia...</option>
                <option value="all">Todas as Paróquias</option>
                {parishes
                  .filter(p => !filterForania || filterForania === 'all' || p.forania_id === filterForania)
                  .map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
              </select>
            </div>
          )}

          {/* Clergy Filter - Hidden if in Clergy tab */}
          {activeTab !== 'clergy' && (
            <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-lg border border-slate-200">
              <User size={14} className="text-amber-400" />
              <select
                value={filterClergyMember}
                onChange={(e) => {
                  setFilterClergyMember(e.target.value);
                  if (e.target.value !== 'all' && e.target.value !== '') {
                    const c = clergy.find(cle => cle.id === e.target.value);
                    if (c) {
                      if (c.forania_id && (!filterForania || filterForania === 'all')) setFilterForania(c.forania_id);
                      if (c.parish_id && (!filterParish || filterParish === 'all')) setFilterParish(c.parish_id);
                    }
                  }
                }}
                className="bg-transparent border-none text-[9px] font-bold uppercase tracking-widest text-slate-500 focus:ring-0 cursor-pointer p-0 max-w-[120px]"
              >
                <option value="">Selecionar Clero...</option>
                <option value="all">Todo o Clero</option>
                {clergy
                  .filter(c => {
                    if ((!filterForania || filterForania === 'all') && (!filterParish || filterParish === 'all')) return true;
                    const matchesForania = !filterForania || filterForania === 'all' || c.forania_id === filterForania || parishes.find(p => p.id === c.parish_id)?.forania_id === filterForania;
                    const matchesParish = !filterParish || filterParish === 'all' || c.parish_id === filterParish;
                    return matchesForania && matchesParish;
                  })
                  .map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
              </select>
            </div>
          )}

          {activeTab === 'clergy' && (
            <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-lg border border-slate-200">
              <Shield size={14} className="text-slate-400" />
              <select
                value={filterRole}
                onChange={(e) => setFilterRole(e.target.value)}
                className="bg-transparent border-none text-[9px] font-bold uppercase tracking-widest text-slate-500 focus:ring-0 cursor-pointer p-0"
              >
                <option value="">Todos Cargos</option>
                <option value="pároco">Pároco</option>
                <option value="vigário">Vigário</option>
                <option value="diácono">Diácono</option>
                <option value="seminarista">Seminarista</option>
              </select>
            </div>
          )}

          <div className="px-3 py-2 bg-blue-50 text-blue-600 rounded-lg text-[9px] font-bold uppercase tracking-widest shrink-0 border border-blue-100">
            {filteredItems.length} registros
          </div>
        </div>
      </div>

      {/* Main Content View */}
      <div className="space-y-4">
        {loading ? (
          <div className="bg-white p-12 rounded-lg shadow-sm border border-slate-200 text-center flex flex-col items-center justify-center gap-6">
            <div className="relative">
              <div className="w-16 h-16 border-4 border-slate-100 border-t-blue-600 rounded-full animate-spin"></div>
              <Scroll className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-blue-600" size={24} />
            </div>
            <div>
              <p className="text-lg font-bold text-slate-800">Organizando Hub Diocese</p>
              <p className="text-slate-400 font-semibold uppercase text-[10px] tracking-widest mt-2">Sincronizando dados eclesiásticos...</p>
            </div>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="bg-white p-12 rounded-lg border border-slate-200 border-dashed text-center">
            <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-slate-200">
              {activeTab === 'dashboard' && !(search || filterForania || filterParish || filterClergyMember) ? (
                <Filter size={20} className="text-slate-350" />
              ) : (
                <Search size={20} className="text-slate-350" />
              )}
            </div>
            <h3 className="text-lg font-bold text-slate-800 mb-2">
              {activeTab === 'dashboard' && !(search || filterForania || filterParish || filterClergyMember) 
                ? 'Selecione um filtro para começar' 
                : 'Sem resultados encontrados'}
            </h3>
            <p className="text-slate-400 font-semibold max-w-xs mx-auto text-xs">
              {activeTab === 'dashboard' && !(search || filterForania || filterParish || filterClergyMember)
                ? 'Utilize os filtros acima para visualizar os dados integrados da diocese.'
                : 'Tente ajustar sua busca ou limpar os filtros aplicados.'}
            </p>
            <button 
              onClick={() => { setSearch(''); setFilterForania(''); setFilterParish(''); setFilterClergyMember(''); setFilterRole(''); }}
              className="mt-6 px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-md text-[10px] font-bold uppercase tracking-widest hover:bg-slate-50 transition-all shadow-sm"
            >
              Limpar Filtros
            </button>
          </div>
        ) : activeTab === 'dashboard' ? (
          /* INTEGRATED VIEW - THE "MASTER TABLE" - SHOWS ALL CATEGORIES */
          <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/50 border-b border-slate-100">
                    <th className="px-6 py-4 text-[9px] font-bold text-slate-400 uppercase tracking-widest underline decoration-blue-500/30 underline-offset-4">Tipo / Cadastro</th>
                    <th className="px-6 py-4 text-[9px] font-bold text-slate-400 uppercase tracking-widest hidden md:table-cell underline decoration-blue-500/30 underline-offset-4">Região / Forania</th>
                    <th className="px-6 py-4 text-[9px] font-bold text-slate-400 uppercase tracking-widest underline decoration-blue-500/30 underline-offset-4">Responsável / Cargo</th>
                    <th className="px-6 py-4 text-[9px] font-bold text-slate-400 uppercase tracking-widest hidden lg:table-cell underline decoration-blue-500/30 underline-offset-4">Contato / Localização</th>
                    <th className="px-6 py-4 text-[9px] font-bold text-slate-400 uppercase tracking-widest text-right print:hidden underline decoration-blue-500/30 underline-offset-4">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filteredItems.map((item: any) => (
                    <motion.tr 
                      key={`${item._type}-${item.id}`} 
                      className="group hover:bg-blue-50/30 transition-colors"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                    >
                      <td className="px-8 py-6">
                        <div className="flex items-center gap-4">
                          <div className={cn(
                            "w-10 h-10 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 shadow-inner",
                            item._type === 'parish' ? "bg-blue-50 text-blue-600" : 
                            item._type === 'forania' ? "bg-slate-50 text-slate-600" : "bg-amber-50 text-amber-600"
                          )}>
                            {item._type === 'parish' ? <Church size={18} /> : 
                             item._type === 'forania' ? <MapIcon size={18} /> : <User size={18} />}
                          </div>
                          <div>
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className={cn(
                                "text-[8px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded",
                                item._type === 'parish' ? "bg-blue-100 text-blue-700" : 
                                item._type === 'forania' ? "bg-slate-100 text-slate-750" : "bg-amber-100 text-amber-700"
                              )}>
                                {item._type === 'parish' ? 'Paróquia' : item._type === 'forania' ? 'Forania' : 'Clero/Membro'}
                              </span>
                            </div>
                            <h5 className="font-bold text-slate-800 leading-tight group-hover:text-blue-700 transition-colors uppercase tracking-tight">{item.name}</h5>
                          </div>
                        </div>
                      </td>
                      <td className="px-8 py-6 hidden md:table-cell">
                        <div className="flex flex-col">
                          <div className="flex items-center gap-2">
                            <MapIcon size={14} className="text-blue-400" />
                            <span className="text-sm font-bold text-slate-600 truncate max-w-[150px]">
                              {item._type === 'forania' ? 'Própria Forania' : 
                               (foraries.find(f => f.id === item.forania_id)?.name || 'S/ Forania')}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="px-8 py-6">
                        <div className="flex flex-col">
                           <div className="flex items-center gap-2">
                            <User size={14} className="text-amber-500" />
                            <span className="text-sm font-bold text-slate-700 leading-none">
                              {item._type === 'clergy' ? item.role : (item.priest_name || 'A definir')}
                            </span>
                           </div>
                           {item._type === 'parish' && (
                             <div className="flex items-center gap-2 mt-2">
                               <Users size={12} className="text-blue-400" />
                               <span className="text-[10px] font-bold text-blue-600 uppercase tracking-widest">
                                 {clergy.filter(c => c.parish_id === item.id).length} Membros
                               </span>
                             </div>
                           )}
                           {item._type === 'clergy' && (
                             <div className="flex items-center gap-2 mt-2">
                               <Church size={12} className="text-amber-400" />
                               <span className="text-[10px] font-bold text-amber-600 uppercase tracking-widest truncate max-w-[150px]">
                                 {parishes.find(p => p.id === item.parish_id)?.name || 'Avulso'}
                               </span>
                             </div>
                           )}
                        </div>
                      </td>
                      <td className="px-8 py-6 hidden lg:table-cell max-w-xs">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
                            <Phone size={12} className="text-slate-300" /> {item.phone || item.phone_mobile || '---'}
                          </div>
                          <div className="flex items-center gap-2 text-xs font-bold text-slate-400 truncate">
                            <MapPin size={12} className="text-red-300" /> {item.address_street || item.address_city || '---'}
                          </div>
                        </div>
                      </td>
                      <td className="px-8 py-6 text-right print:hidden">
                        <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all">
                          <button 
                            onClick={() => {
                              // Ensure activeTab is set correctly for the item in view/edit
                              if (item._type === 'parish') { setActiveTab('parishes'); handleView(item); }
                              else if (item._type === 'forania') { setActiveTab('foranias'); handleView(item); }
                              else { setActiveTab('clergy'); handleView(item); }
                            }} 
                            className="flex items-center gap-1.5 px-2.5 py-1.5 text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-all shadow-sm border border-blue-100 text-[10px] font-bold uppercase tracking-wider"
                          >
                            <Eye size={14} />
                            Ficha
                          </button>
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          /* PREVIOUS LIST VIEWS (for other categories like Clergy directly) */
          <div className="grid gap-4 print:block">
            {filteredItems.map((item: any) => (
              <div key={`${item._type}-${item.id}`} className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm hover:shadow-md hover:border-blue-200 transition-all group relative overflow-hidden print:border-slate-300 print:mb-4 print:shadow-none">
                <div className="absolute top-0 left-0 w-1.5 h-full bg-blue-600 opacity-20 group-hover:opacity-100 transition-opacity" />
                
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                  <div className="flex items-start gap-5 flex-1">
                    <div className="w-14 h-14 bg-slate-50 text-slate-400 rounded-lg flex items-center justify-center group-hover:bg-blue-50 group-hover:text-blue-600 transition-all shrink-0 shadow-inner group-hover:scale-105 duration-300">
                      {activeTab === 'foranias' ? <MapIcon size={24} /> : activeTab === 'parishes' ? <Church size={24} /> : <User size={24} />}
                    </div>
                    <div className="space-y-2 flex-1">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          {activeTab === 'clergy' && (
                            <span className="px-2 py-0.5 bg-amber-50 text-amber-600 rounded text-[9px] font-bold uppercase tracking-widest border border-amber-100">
                              {item.role}
                            </span>
                          )}
                          {activeTab === 'parishes' && item.foundation_date && (
                            <span className="px-2 py-0.5 bg-emerald-50 text-emerald-600 rounded text-[9px] font-bold uppercase tracking-widest border border-emerald-100 flex items-center gap-1">
                              <Scroll size={10} />
                              Fundada em: {new Date(item.foundation_date).toLocaleDateString('pt-BR')}
                            </span>
                          )}
                        </div>
                        <h4 className="text-lg font-bold text-slate-800 group-hover:text-blue-600 transition-colors leading-tight">{item.name}</h4>
                        
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
                              {item.cnpj && (
                                <p className="text-[10px] font-black text-slate-400 flex items-center gap-2 uppercase tracking-tighter">
                                  <Building2 size={12} className="text-blue-400" />
                                  CNPJ: {item.cnpj}
                                </p>
                              )}
                            </>
                          ) : (
                            <p className="text-sm font-bold text-slate-500 flex items-center gap-2 italic">
                              <Church size={14} className="text-blue-500" />
                              Paróquia: {parishes.find(p => p.id === item.parish_id)?.name || 'Nenhuma paróquia'}
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
                              {item.phone_mobile_is_whatsapp && (
                                <MessageCircle size={14} className="text-emerald-500" />
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 md:opacity-0 group-hover:opacity-100 transition-all shrink-0 mt-4 md:mt-0">
                    <button onClick={() => handleView(item)} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-slate-100 rounded-lg transition-all"><Eye size={18} /></button>
                    <button onClick={() => handleEdit(item)} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-slate-100 rounded-lg transition-all"><Edit2 size={18} /></button>
                    <button onClick={() => handleDeleteClick(item)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-slate-100 rounded-lg transition-all"><Trash2 size={18} /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

        {/* Modal Form */}
        <AnimatePresence>
          {isEditing && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm print:hidden">
              <motion.div
                initial={{ scale: 0.95, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.95, opacity: 0, y: 20 }}
                className="bg-white w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl shadow-lg border border-slate-200 p-6 space-y-6 custom-scrollbar"
              >
                <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center">
                      {activeTab === 'foranias' ? <MapIcon size={20} /> : activeTab === 'parishes' ? <Church size={20} /> : <User size={20} />}
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-slate-800">
                        {selectedItem ? 'Editar' : 'Novo'} {activeTab === 'foranias' ? 'Forania' : activeTab === 'parishes' ? 'Paróquia' : 'Clero/Leigo'}
                      </h3>
                      <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">Código: #{activeTab === 'foranias' ? forariaForm.code : activeTab === 'parishes' ? parishForm.code : clergyForm.code}</p>
                    </div>
                  </div>
                  <button onClick={() => setIsEditing(false)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-all">
                    <X size={20} />
                  </button>
                </div>

                <form onSubmit={handleSave} className="space-y-4">
                  {/* FORANIAS FORM */}
                  {activeTab === 'foranias' && (
                    <>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-1">Número de Cadastro (Sequencial)</label>
                          <input 
                            type="text"
                            readOnly
                            value={forariaForm.code || ''}
                            className="w-full px-4 py-2 bg-slate-100 border border-slate-200 rounded-lg text-sm font-semibold text-slate-500 cursor-not-allowed"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-1">Nome da Forania</label>
                          <input 
                            type="text"
                            required
                            value={forariaForm.name || ''}
                            onChange={e => setForariaForm({...forariaForm, name: e.target.value})}
                            className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 focus:ring-4 focus:ring-blue-100/50 focus:border-blue-500 transition-all placeholder:text-slate-400"
                            placeholder="Ex: Forania Norte"
                          />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-1">Padre Forâneo</label>
                        <div className="relative">
                          <User size={16} className="absolute left-3.5 top-2.5 text-slate-400 pointer-events-none" />
                          <select 
                            value={forariaForm.priest_id || ''}
                            onChange={e => {
                              const priest = clergy.find(c => c.id === e.target.value);
                              setForariaForm({
                                ...forariaForm, 
                                priest_id: e.target.value,
                                priest_name: priest ? priest.name : ''
                              });
                            }}
                            className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 focus:ring-4 focus:ring-blue-100/50 focus:border-blue-500 transition-all appearance-none"
                          >
                            <option value="">Selecione um Padre...</option>
                            {clergy
                              .sort((a, b) => a.name.localeCompare(b.name))
                              .map(c => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                              ))
                            }
                          </select>
                        </div>
                      </div>
                    </>
                  )}

                  {/* PARISHES FORM */}
                  {(activeTab === 'parishes' || activeTab === 'dashboard') && (
                    <>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-1 col-span-1">
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-1">Cod. Cadastro</label>
                          <input 
                            type="text"
                            readOnly
                            value={parishForm.code || ''}
                            className="w-full px-4 py-2 bg-slate-100 border border-slate-200 rounded-lg text-sm font-semibold text-slate-500"
                          />
                        </div>
                        <div className="space-y-1 col-span-2">
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-1">Nome da Paróquia</label>
                          <input 
                            type="text"
                            required
                            value={parishForm.name || ''}
                            onChange={e => setParishForm({...parishForm, name: e.target.value})}
                            className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 focus:ring-4 focus:ring-blue-100/50 focus:border-blue-500"
                            placeholder="Nome Completo da Unidade"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-1">Forania</label>
                          <select 
                            required
                            value={parishForm.forania_id || ''}
                            onChange={e => setParishForm({...parishForm, forania_id: e.target.value})}
                            className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 focus:ring-4 focus:ring-blue-100/50 focus:border-blue-500"
                          >
                            <option value="">Selecione...</option>
                            {foraries.map(f => (
                              <option key={f.id} value={f.id}>{f.name}</option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-1">Padre Responsável (Pároco)</label>
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
                            className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 focus:ring-4 focus:ring-blue-100/50 focus:border-blue-500"
                          >
                            <option value="">Selecione no clero...</option>
                            {clergy.map(c => (
                              <option key={c.id} value={c.id}>{c.name} ({c.role})</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {selectedItem && (
                        <div className="p-5 bg-blue-50/20 rounded-lg border border-blue-100 space-y-4">
                          <div className="flex items-center justify-between">
                            <h4 className="text-[11px] font-bold text-blue-600 uppercase tracking-widest flex items-center gap-2">
                              <Users size={14} />
                              Equipe de Clero e Diáconos
                            </h4>
                            <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-[9px] font-bold uppercase border border-blue-100">
                              {clergy.filter(c => c.parish_id === selectedItem.id).length} Vinculados
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setClergyForm({
                                  ...clergyForm,
                                  parish_id: selectedItem.id,
                                  forania_id: selectedItem.forania_id,
                                  code: getNextCode(clergy)
                                });
                                setActiveTab('clergy');
                                setIsEditing(true);
                                setSelectedItem(null);
                              }}
                              className="text-[10px] font-bold text-blue-600 hover:underline hover:text-blue-750 uppercase flex items-center gap-1"
                            >
                              <PlusCircle size={12} />
                              Vincular Novo Membro
                            </button>
                          </div>
                          
                          <div className="space-y-2">
                            {(() => {
                              const members = clergy.filter(c => c.parish_id === selectedItem.id);
                              if (members.length === 0) return <p className="text-xs text-slate-400 italic bg-white/50 p-4 rounded-lg border border-dashed border-blue-100 text-center">Nenhum membro cadastrado nesta unidade.</p>;
                              
                              const roleOrder: Record<string, number> = { 'pároco': 1, 'vigário': 2, 'diácono': 3, 'seminarista': 4, 'leigo formado': 5 };
                              const sorted = [...members].sort((a, b) => (roleOrder[a.role] || 9) - (roleOrder[b.role] || 9));

                              return sorted.map(m => (
                                <div key={m.id} className="flex items-center justify-between p-3 bg-white rounded-lg border border-slate-150 group/item hover:border-blue-400 hover:shadow-sm transition-all">
                                  <div className="flex items-center gap-3">
                                    <div className={cn(
                                      "w-8 h-8 rounded flex items-center justify-center text-xs font-bold",
                                      m.role === 'pároco' ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-500"
                                    )}>
                                      {m.name.charAt(0)}
                                    </div>
                                    <div>
                                      <p className="text-sm font-semibold text-slate-700">{m.name}</p>
                                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{m.role}</p>
                                    </div>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => { setActiveTab('clergy'); handleEdit(m); }}
                                    className="p-1 text-slate-300 hover:text-blue-600 hover:bg-slate-50 rounded opacity-0 group-hover/item:opacity-100 transition-all"
                                  >
                                    <Edit2 size={14} />
                                  </button>
                                </div>
                              ));
                            })()}
                          </div>
                        </div>
                      )}

                      <div className="p-5 bg-slate-50/50 rounded-lg border border-slate-200 space-y-4">
                        <h4 className="text-[11px] font-bold text-blue-600 uppercase tracking-widest flex items-center gap-2">
                          <Scroll size={14} />
                          Informações Históricas e Contato
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-1">CNPJ</label>
                            <input 
                              type="text"
                              value={parishForm.cnpj || ''}
                              onChange={e => setParishForm({...parishForm, cnpj: e.target.value})}
                              placeholder="00.000.000/0000-00"
                              className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 focus:ring-4 focus:ring-blue-100/50 focus:border-blue-500"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-1">Data de Fundação</label>
                            <input 
                              type="date"
                              value={parishForm.foundation_date || ''}
                              onChange={e => setParishForm({...parishForm, foundation_date: e.target.value})}
                              className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 focus:ring-4 focus:ring-blue-100/50 focus:border-blue-500"
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-1">Telefone Fixo</label>
                            <input 
                              type="text"
                              value={parishForm.phone || ''}
                              onChange={e => setParishForm({...parishForm, phone: maskPhone(e.target.value)})}
                              placeholder="(00) 0000-0000"
                              className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 focus:ring-4 focus:ring-blue-100/50 focus:border-blue-500"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-1">Telefone Celular</label>
                            <input 
                              type="text"
                              value={parishForm.phone_mobile || ''}
                              onChange={e => setParishForm({...parishForm, phone_mobile: maskPhone(e.target.value)})}
                              placeholder="(00) 00000-0000"
                              className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 focus:ring-4 focus:ring-blue-100/50 focus:border-blue-500"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-1">E-mail</label>
                            <input 
                              type="email"
                              value={parishForm.email || ''}
                              onChange={e => setParishForm({...parishForm, email: e.target.value})}
                              placeholder="paroquia@diocese.org.br"
                              className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 focus:ring-4 focus:ring-blue-100/50 focus:border-blue-500"
                            />
                          </div>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-1">Observações Gerais</label>
                          <textarea 
                            value={parishForm.notes || ''}
                            onChange={e => setParishForm({...parishForm, notes: e.target.value})}
                            rows={3}
                            placeholder="Informações adicionais sobre a paróquia..."
                            className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium resize-none focus:ring-4 focus:ring-blue-100/50 focus:border-blue-500"
                          />
                        </div>
                      </div>

                      <div className="p-5 bg-slate-50/50 rounded-lg border border-slate-200 space-y-4">
                        <h4 className="text-[11px] font-bold text-blue-600 uppercase tracking-widest flex items-center gap-2">
                          <MapPin size={14} />
                          Localização
                        </h4>
                        <div className="grid grid-cols-4 gap-4">
                          <div className="col-span-3 space-y-1">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-1">Logradouro (Rua, Av...)</label>
                            <input 
                              type="text"
                              value={parishForm.address_street || ''}
                              onChange={e => setParishForm({...parishForm, address_street: e.target.value})}
                              placeholder="Ex: Rua das Flores"
                              className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 focus:ring-4 focus:ring-blue-100/50 focus:border-blue-500"
                            />
                          </div>
                          <div className="col-span-1 space-y-1">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-1">Número</label>
                            <input 
                              type="text"
                              value={parishForm.address_number || ''}
                              onChange={e => setParishForm({...parishForm, address_number: e.target.value})}
                              placeholder="SN"
                              className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 focus:ring-4 focus:ring-blue-100/50 focus:border-blue-500"
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-1">Bairro</label>
                            <input 
                              type="text"
                              value={parishForm.address_neighborhood || ''}
                              onChange={e => setParishForm({...parishForm, address_neighborhood: e.target.value})}
                              placeholder="Bairro"
                              className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 focus:ring-4 focus:ring-blue-100/50 focus:border-blue-500"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-1">CEP</label>
                            <input 
                              type="text"
                              value={parishForm.address_zip || ''}
                              onChange={e => setParishForm({...parishForm, address_zip: maskCEP(e.target.value)})}
                              placeholder="00000-000"
                              className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 focus:ring-4 focus:ring-blue-100/50 focus:border-blue-500"
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-4">
                          <div className="col-span-2 space-y-1">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-1">Cidade</label>
                            <input 
                              type="text"
                              value={parishForm.address_city || ''}
                              onChange={e => setParishForm({...parishForm, address_city: e.target.value})}
                              placeholder="Cidade"
                              className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 focus:ring-4 focus:ring-blue-100/50 focus:border-blue-500"
                            />
                          </div>
                          <div className="col-span-1 space-y-1">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-1">UF</label>
                            <input 
                              type="text"
                              value={parishForm.address_state || ''}
                              onChange={e => setParishForm({...parishForm, address_state: e.target.value.toUpperCase()})}
                              placeholder="UF"
                              maxLength={2}
                              className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 focus:ring-4 focus:ring-blue-100/50 focus:border-blue-500 uppercase font-bold"
                            />
                          </div>
                        </div>
                      </div>
                    </>
                  )}

                  {/* CLERGY FORM */}
                  {activeTab === 'clergy' && (
                    <>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-1">Cód. Clero</label>
                          <input type="text" readOnly value={clergyForm.code || ''} className="w-full px-4 py-2 bg-slate-100 border border-slate-200 rounded-lg text-sm font-bold text-slate-500" />
                        </div>
                        <div className="space-y-1 col-span-2">
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-1">Nome Completo</label>
                          <input 
                            type="text" 
                            required 
                            value={clergyForm.name || ''} 
                            onChange={e => setClergyForm({...clergyForm, name: e.target.value})} 
                            className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 focus:ring-4 focus:ring-blue-100/50 focus:border-blue-500" 
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-1">Identificação / Função</label>
                          <select 
                            required 
                            value={clergyForm.role || ''} 
                            onChange={e => setClergyForm({...clergyForm, role: e.target.value as ClergyRole})} 
                            className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 focus:ring-4 focus:ring-blue-100/50 focus:border-blue-500 font-bold"
                          >
                            <option value="pároco">Pároco</option>
                            <option value="vigário">Vigário</option>
                            <option value="diácono">Diácono</option>
                            <option value="seminarista">Seminarista</option>
                            <option value="leigo formado">Leigo Formado</option>
                          </select>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-1">Paróquia Vinculada</label>
                          <select 
                            required 
                            value={clergyForm.parish_id || ''} 
                            onChange={e => setClergyForm({...clergyForm, parish_id: e.target.value})} 
                            className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 focus:ring-4 focus:ring-blue-100/50 focus:border-blue-500"
                          >
                            <option value="">Selecione a sede...</option>
                            {parishes.map(p => (
                              <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="p-5 bg-slate-50/50 rounded-lg border border-slate-200 space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                          <div className="md:col-span-3">
                            <input 
                              type="text" 
                              value={clergyForm.address || ''} 
                              onChange={e => setClergyForm({...clergyForm, address: e.target.value})} 
                              placeholder="Endereço (Rua, Av...)"
                              className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 focus:ring-4 focus:ring-blue-100/50 focus:border-blue-500" 
                            />
                          </div>
                          <div className="md:col-span-1">
                            <input 
                              type="text" 
                              value={clergyForm.address_number || ''} 
                              onChange={e => setClergyForm({...clergyForm, address_number: e.target.value})} 
                              placeholder="Nº"
                              className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 focus:ring-4 focus:ring-blue-100/50 focus:border-blue-500" 
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                          <div className="md:col-span-2">
                            <input 
                              type="text" 
                              value={clergyForm.address_neighborhood || ''} 
                                                placeholder="Bairro"
                              className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 focus:ring-4 focus:ring-blue-100/50 focus:border-blue-500" 
                            />
                          </div>
                          <div className="md:col-span-1">
                            <input 
                              type="text" 
                              value={clergyForm.address_city || ''} 
                              onChange={e => setClergyForm({...clergyForm, address_city: e.target.value})} 
                              placeholder="Cidade"
                              className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 focus:ring-4 focus:ring-blue-100/50 focus:border-blue-500" 
                            />
                          </div>
                          <div className="md:col-span-1">
                            <input 
                              type="text" 
                              value={clergyForm.address_state || ''} 
                              onChange={e => setClergyForm({...clergyForm, address_state: e.target.value.toUpperCase()})} 
                              placeholder="UF"
                              maxLength={2}
                              className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 focus:ring-4 focus:ring-blue-100/50 focus:border-blue-500 uppercase" 
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-1">Celular</label>
                            <div className="relative">
                              <PhoneCall size={14} className="absolute left-3 top-2.5 text-slate-400" />
                              <input 
                                type="text" 
                                value={clergyForm.phone_mobile || ''} 
                                onChange={e => setClergyForm({...clergyForm, phone_mobile: maskPhone(e.target.value)})} 
                                className="w-full pl-9 pr-10 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 focus:ring-4 focus:ring-blue-100/50 focus:border-blue-500" 
                              />
                              <button
                                type="button"
                                onClick={() => setClergyForm({ ...clergyForm, phone_mobile_is_whatsapp: !clergyForm.phone_mobile_is_whatsapp })}
                                className={cn(
                                  "absolute right-2 top-1/2 -translate-y-1/2 transition-all p-1 rounded-md",
                                  clergyForm.phone_mobile_is_whatsapp ? "text-green-500 bg-green-50" : "text-slate-300 hover:text-slate-400"
                                )}
                                title={clergyForm.phone_mobile_is_whatsapp ? "Número com WhatsApp" : "Marcar como WhatsApp"}
                              >
                                <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L0 24l6.335-1.662c1.72.937 3.659 1.43 5.623 1.43h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                              </svg>
                            </button>
                          </div>
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-1">WhatsApp</label>
                            <div className="relative">
                              <MessageCircle size={14} className="absolute left-3 top-2.5 text-emerald-500" />
                              <input 
                                type="text" 
                                value={clergyForm.phone_whatsapp || ''} 
                                onChange={e => setClergyForm({...clergyForm, phone_whatsapp: maskPhone(e.target.value)})} 
                                className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 focus:ring-4 focus:ring-blue-100/50 focus:border-blue-500" 
                              />
                            </div>
                          </div>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-1">E-mail</label>
                          <div className="relative">
                            <Mail size={14} className="absolute left-3 top-2.5 text-slate-400" />
                            <input 
                              type="email" 
                              value={clergyForm.email || ''} 
                              onChange={e => setClergyForm({...clergyForm, email: e.target.value})} 
                              className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 focus:ring-4 focus:ring-blue-100/50 focus:border-blue-500" 
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
                      className="flex-1 px-4 py-2.5 bg-slate-100 text-slate-600 rounded-lg text-xs font-bold uppercase tracking-widest hover:bg-slate-200 transition-all"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={loading}
                      className="flex-[2] px-4 py-2.5 bg-blue-600 text-white rounded-lg text-xs font-bold uppercase tracking-widest hover:bg-blue-700 transition-all shadow-sm flex items-center justify-center gap-2"
                    >
                      {loading ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                      Salvar Registro
                    </button>
                  </div>
                </form>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* IMPORT MAPPING MODAL */}
        <AnimatePresence>
          {isImportMapping && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm">
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="bg-white w-full max-w-4xl rounded-xl shadow-lg border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]"
              >
                <div className="p-6 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-slate-800 tracking-tight">Mapeamento de Importação</h3>
                    <p className="text-slate-400 font-bold uppercase text-[9px] tracking-widest mt-1">Associe as colunas da sua planilha aos campos do sistema</p>
                  </div>
                  <button onClick={() => setIsImportMapping(false)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-lg transition-all">
                    <X size={20} />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-6">
                      <h4 className="text-xs font-bold text-blue-600 uppercase tracking-widest flex items-center gap-2 mb-4">
                        <div className="w-5 h-5 bg-blue-100 rounded flex items-center justify-center text-[10px] font-bold">1</div>
                        Configuração de Campos
                      </h4>

                      <div className="p-4 bg-blue-50/50 border border-blue-100 rounded-lg mb-6">
                        <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest mb-1">Relatório de Descoberta</p>
                        <ul className="text-xs font-semibold text-blue-800 space-y-1">
                          <li>• Detectamos <span className="underline">{importHeaders.length} colunas</span> na sua planilha.</li>
                          <li>• <span className="underline">{Object.values(importMapping).filter(v => v !== -1).length} campos</span> foram mapeados automaticamente.</li>
                          <li>• <span className="text-blue-600 bg-blue-50/50 px-1 rounded">Dica:</span> Para paróquias com múltiplos membros (Pároco, Vigário, etc), utilize uma linha para cada membro repetindo o nome da paróquia.</li>
                        </ul>
                      </div>
                      
                      <div className="space-y-4">
                        {TARGET_FIELDS.map((field) => {
                          const isMapped = importMapping[field.key] !== -1;
                          return (
                            <div key={field.key} className={cn(
                              "flex flex-col gap-2 p-4 rounded-lg border transition-all",
                              isMapped ? "bg-white border-blue-200 shadow-sm" : "bg-slate-50 border-slate-100 opacity-60"
                            )}>
                              <div className="flex items-center justify-between">
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{field.label}</label>
                                {isMapped && (
                                  <span className="text-[9px] font-bold px-2 py-0.5 bg-emerald-50 text-emerald-600 rounded border border-emerald-100 uppercase tracking-tight">Auto-detectado</span>
                                )}
                              </div>
                              <select
                                value={importMapping[field.key] ?? -1}
                                onChange={(e) => setImportMapping({ ...importMapping, [field.key]: parseInt(e.target.value) })}
                                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-750 focus:ring-4 focus:ring-blue-100/50 focus:border-blue-500"
                              >
                                <option value="-1">-- Ignorar esta coluna --</option>
                                {importHeaders.map((header, idx) => (
                                  <option key={idx} value={idx}>{header || `Coluna ${idx + 1}`}</option>
                                ))}
                              </select>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="space-y-6">
                      <h4 className="text-xs font-bold text-blue-600 uppercase tracking-widest flex items-center gap-2 mb-4">
                        <div className="w-5 h-5 bg-blue-100 rounded flex items-center justify-center text-[10px] font-bold">2</div>
                        Prévia dos Dados (Primeiras 5 linhas)
                      </h4>
                      
                      <div className="bg-slate-900 rounded-lg p-5 overflow-x-auto shadow-inner h-[500px] border border-slate-800">
                        <table className="w-full text-xs text-left">
                          <thead>
                            <tr className="border-b border-slate-800">
                              {importHeaders.map((h, i) => (
                                <th key={i} className="px-3 py-2 text-slate-500 font-bold uppercase tracking-tighter whitespace-nowrap">{h || `Col ${i+1}`}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800">
                            {importRows.slice(importHeaderIdx + 1, importHeaderIdx + 6).map((row, rIdx) => (
                              <tr key={rIdx}>
                                {row.map((cell, cIdx) => (
                                  <td key={cIdx} className="px-3 py-2 text-slate-300 font-medium whitespace-nowrap opacity-80">{String(cell || '')}</td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {importRows.length > 6 && (
                          <div className="p-4 text-center text-slate-500 font-bold italic text-[10px] uppercase">
                            + {importRows.length - (importHeaderIdx + 6)} linhas restantes...
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-6 bg-white border-t border-slate-100 flex items-center justify-between gap-6">
                  <div className="flex items-center gap-3 text-slate-500">
                    <AlertCircle size={18} className="text-amber-500 shrink-0" />
                    <p className="text-xs font-medium leading-tight">Certifique-se de que os nomes das Foranias e Paróquias estão idênticos aos cadastrados para evitar duplicidade.</p>
                  </div>
                  <div className="flex gap-4 shrink-0">
                    <button
                      onClick={() => setIsImportMapping(false)}
                      className="px-6 py-2.5 bg-slate-100 text-slate-600 rounded-lg text-xs font-bold uppercase tracking-widest hover:bg-slate-200 transition-all"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={executeImport}
                      className="px-8 py-2.5 bg-blue-600 text-white rounded-lg text-xs font-bold uppercase tracking-widest hover:bg-blue-700 transition-all shadow-sm flex items-center gap-2"
                    >
                      <Upload size={16} />
                      Iniciar Importação Real
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>


      {/* PRINT REPORT - THE HIGH CONCENTRATED INFO */}
      <div className="hidden print:block bg-white p-12" ref={printRef}>
        <div className="text-center space-y-4 mb-12 border-b-4 border-slate-800 pb-8">
          <div className="flex items-center justify-center gap-6">
             <Church size={48} className="text-slate-800" />
             <div>
               <h1 className="text-3xl font-bold text-slate-900 uppercase tracking-tighter">DIOCESE DE GUARULHOS</h1>
               <p className="text-lg font-bold text-slate-500 uppercase tracking-widest italic">Hub de Relatório e Gestão Unificada</p>
             </div>
          </div>
          <div className="flex items-center justify-center gap-4 text-xs font-bold text-slate-400 uppercase tracking-widest pt-2">
            <span>Emitido em: {new Date().toLocaleDateString('pt-BR')}</span>
            <span>•</span>
            <span>Unidade Administrativa: Chancelaria</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-8 mb-12">
          <div className="p-4 bg-slate-50 rounded-lg border border-slate-200/80 text-center">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total Foranias</p>
            <p className="text-3xl font-bold text-slate-800">{foraries.length}</p>
          </div>
          <div className="p-4 bg-slate-50 rounded-lg border border-slate-200/80 text-center">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total Paróquias</p>
            <p className="text-3xl font-bold text-slate-800">{parishes.length}</p>
          </div>
          <div className="p-4 bg-slate-50 rounded-lg border border-slate-200/80 text-center">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Efetivo de Clero</p>
            <p className="text-3xl font-bold text-slate-800">{clergy.length}</p>
          </div>
        </div>

        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b-2 border-slate-300">
              <th className="py-4 text-left font-bold text-sm uppercase">Paróquia / Forania</th>
              <th className="py-4 text-left font-bold text-sm uppercase">Pároco / Responsável</th>
              <th className="py-4 text-left font-bold text-sm uppercase">Contato Principal</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredItems.map((item: any) => (
              <tr key={`${item._type}-${item.id}`} className="page-break-inside-avoid">
                <td className="py-4">
                  <p className="font-bold text-slate-800 uppercase text-sm leading-none mb-1">{item.name}</p>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    {foraries.find(f => f.id === item.forania_id)?.name || '---'}
                  </p>
                </td>
                <td className="py-4">
                  <p className="font-bold text-slate-700 text-sm">Pe. {item.priest_name || 'A definir'}</p>
                  <p className="text-[10px] text-slate-400 font-medium">Responsável Administrativo</p>
                </td>
                <td className="py-4">
                  <p className="text-sm font-bold text-slate-600">{item.phone || '---'}</p>
                  <p className="text-[10px] text-slate-400">{item.email || '---'}</p>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        
        <div className="mt-20 flex justify-between items-end border-t border-slate-100 pt-8 opacity-50">
          <div className="text-[10px] font-bold text-slate-400">
            © 2026 Sistema de Gestão Eclesial - ERP Diocese
          </div>
          <div className="w-48 border-t-2 border-slate-300 pt-2 text-center text-[10px] font-bold uppercase">
            Chancelaria / Diocese
          </div>
        </div>
      </div>
      <AnimatePresence>
        {isViewing && selectedItem && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm print:hidden">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-xl shadow-lg border border-slate-200 w-full max-w-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-slate-50/50 to-white relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full -mr-16 -mt-16" />
                <div className="flex items-center gap-4 relative z-10">
                  <div className="w-12 h-12 bg-blue-600 text-white rounded-lg flex items-center justify-center shadow-sm">
                    {activeTab === 'foranias' ? <MapIcon size={24} /> : (activeTab === 'parishes' || activeTab === 'dashboard') ? <Church size={24} /> : <User size={24} />}
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-800 tracking-tight">Ficha Detalhada</h3>
                  </div>
                </div>
                <button onClick={() => setIsViewing(false)} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-slate-100 rounded-lg transition-all border border-slate-150 relative z-10">
                  <X size={20} />
                </button>
              </div>

              <div className="p-8 max-h-[70vh] overflow-y-auto space-y-8 custom-scrollbar">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {activeTab === 'foranias' && (
                    <>
                      <DetailField label="Nome da Forania" value={selectedItem.name} icon={<MapIcon size={14} />} fullWidth />
                      <DetailField label="Padre Forâneo" value={selectedItem.priest_name} icon={<User size={14} />} fullWidth />
                    </>
                  )}

                  {(activeTab === 'parishes' || activeTab === 'dashboard') && (
                    <>
                      <DetailField label="Nome da Unidade" value={selectedItem.name} icon={<Church size={14} />} fullWidth />
                      <DetailField label="Forania" value={foraries.find(f => f.id === selectedItem.forania_id)?.name} icon={<MapIcon size={14} />} />
                      <DetailField label="Padre Responsável" value={selectedItem.priest_name} icon={<User size={14} />} />
                      <DetailField label="CNPJ" value={selectedItem.cnpj} icon={<Building2 size={14} />} />
                      <DetailField label="Data de Fundação" value={selectedItem.foundation_date ? new Date(selectedItem.foundation_date + 'T00:00:00').toLocaleDateString('pt-BR') : 'Não informada'} icon={<Scroll size={14} />} />
                      <DetailField label="Endereço" value={`${selectedItem.address_street || ''}, ${selectedItem.address_number || ''}`} icon={<MapPin size={14} />} fullWidth />
                      <DetailField label="Bairro" value={selectedItem.address_neighborhood} icon={<MapPin size={14} />} />
                      <DetailField label="Cidade/UF" value={`${selectedItem.address_city || ''} - ${selectedItem.address_state || ''}`} icon={<MapPin size={14} />} />
                      <DetailField label="E-mail Institucional" value={selectedItem.email} icon={<Mail size={14} />} fullWidth />
                      <DetailField label="Telefone Fixo" value={selectedItem.phone} icon={<Phone size={14} />} />
                      <DetailField label="Telefone Celular" value={selectedItem.phone_mobile} icon={<PhoneCall size={14} />} />
                      
                      {selectedItem.notes && (
                        <div className="md:col-span-2 space-y-1.5">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1 border-l-2 border-amber-500/20">Observações</label>
                          <div className="p-3 bg-amber-50/20 rounded-lg border border-amber-100/50 text-sm font-medium text-slate-600 italic">
                            {selectedItem.notes}
                          </div>
                        </div>
                      )}

                      <div className="md:col-span-2 pt-4 border-t border-slate-200">
                        <div className="flex items-center justify-between mb-4">
                          <h4 className="text-[11px] font-bold text-blue-600 uppercase tracking-widest flex items-center gap-2">
                            <Users size={14} />
                            Equipe / Membros do Clero
                          </h4>
                          <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-md text-[9px] font-bold uppercase">
                            {clergy.filter(c => c.parish_id === selectedItem.id).length} Vinculados
                          </span>
                        </div>
                        <div className="space-y-2">
                          {(() => {
                            const members = clergy.filter(c => c.parish_id === selectedItem.id);
                            if (members.length === 0) return <p className="text-xs text-slate-400 italic bg-slate-50 p-3 rounded-lg text-center border border-slate-100">Nenhum membro cadastrado nesta unidade.</p>;
                            
                            const roleOrder: Record<string, number> = { 'pároco': 1, 'vigário': 2, 'diácono': 3, 'seminarista': 4, 'leigo formado': 5 };
                            const sorted = [...members].sort((a, b) => (roleOrder[a.role] || 9) - (roleOrder[b.role] || 9));

                            return sorted.map(m => (
                              <div key={m.id} className="flex items-center justify-between p-3 bg-white rounded-lg border border-slate-200/80">
                                <div className="flex items-center gap-3">
                                  <div className={cn(
                                    "w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold",
                                    m.role === 'pároco' ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-500"
                                  )}>
                                    {m.name.charAt(0)}
                                  </div>
                                  <div>
                                    <p className="text-sm font-bold text-slate-700">{m.name}</p>
                                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{m.role}</p>
                                  </div>
                                </div>
                                <div className="flex gap-2">
                                  {m.phone_mobile && <span className="text-[10px] font-bold text-slate-400">{m.phone_mobile}</span>}
                                </div>
                              </div>
                            ));
                          })()}
                        </div>
                      </div>
                    </>
                  )}

                  {activeTab === 'clergy' && (
                    <>
                      <DetailField label="Nome Completo" value={selectedItem.name} icon={<User size={14} />} fullWidth />
                      <DetailField label="Função/Identificação" value={selectedItem.role} icon={<Shield size={14} />} />
                      <DetailField label="Paróquia Vinculada" value={parishes.find(p => p.id === selectedItem.parish_id)?.name} icon={<Church size={14} />} />
                      <DetailField label="E-mail" value={selectedItem.email} icon={<Mail size={14} />} fullWidth />
                      <DetailField label="Endereço Residencial" value={`${selectedItem.address || ''}, ${selectedItem.address_number || ''}`} icon={<MapPin size={14} />} fullWidth />
                      <DetailField label="Bairro" value={selectedItem.address_neighborhood} icon={<MapPin size={14} />} />
                      <DetailField label="Cidade/UF" value={`${selectedItem.address_city || ''} - ${selectedItem.address_state || ''}`} icon={<MapPin size={14} />} />
                      <DetailField label="Celular" value={selectedItem.phone_mobile} icon={<Phone size={14} />} />
                      <DetailField label="WhatsApp" value={selectedItem.phone_whatsapp} icon={<MessageCircle size={14} />} />
                    </>
                  )}
                </div>
              </div>

              <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-3">
                <button 
                  onClick={() => setIsViewing(false)}
                  className="px-5 py-2.5 text-slate-600 font-bold text-xs uppercase tracking-wider hover:bg-slate-200/60 rounded-lg transition-all"
                >
                  Fechar
                </button>
                <button 
                  onClick={() => {
                    setIsViewing(false);
                    handleEdit(selectedItem);
                  }}
                  className="px-5 py-2.5 bg-blue-600 text-white font-bold text-xs uppercase tracking-wider rounded-lg shadow-sm hover:bg-blue-700 transition-all flex items-center gap-2"
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
              className="bg-white w-full max-w-md rounded-xl shadow-lg border border-slate-200 p-6 space-y-6 text-center"
            >
              <div className="w-16 h-16 bg-red-50 text-red-500 rounded-lg flex items-center justify-center mx-auto mb-2 border border-red-100">
                <Trash2 size={32} />
              </div>
              
              <div className="space-y-2">
                <h3 className="text-lg font-bold text-slate-800">Confirmar Exclusão</h3>
                <p className="text-slate-500 font-medium leading-relaxed text-sm">
                  Tem certeza que deseja excluir permanentemente <span className="text-red-600 font-bold">"{itemToDelete?.name}"</span>? Esta ação não pode ser desfeita.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-2">
                <button
                  onClick={() => { setIsDeleting(false); setItemToDelete(null); }}
                  className="px-6 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-xs font-bold transition-all uppercase tracking-wider"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleDeleteConfirm}
                  disabled={loading}
                  className="px-6 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold shadow-sm transition-all flex items-center justify-center gap-2 uppercase tracking-wider"
                >
                  {loading ? (
                    <Loader2 size={16} className="animate-spin" />
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
          "fixed bottom-8 left-1/2 -translate-x-1/2 px-6 py-4 rounded-lg shadow-lg flex items-center gap-3 animate-in fade-in slide-in-from-bottom-5 z-[100] print:hidden",
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
          .max-w-\[1920px\] { max-width: 100% !important; margin: 0 !important; width: 100% !important; }
          .grid { display: block !important; }
          .rounded-[2rem] { border-radius: 0 !important; border: 1px solid #e2e8f0 !important; margin-bottom: 2rem !important; page-break-inside: avoid; }
          @page { margin: 2cm; }
        }
      `}</style>
    </div>
  );
}
