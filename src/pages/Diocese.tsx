import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
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
  Filter,
  Download,
  FileText,
  CheckCircle2,
  FileDown,
  Bookmark,
  Target,
  LayoutGrid,
  SlidersHorizontal
} from 'lucide-react';
import { fetchAll, saveData, deleteData, getInstitutionSettings } from '../lib/database';
import { cn, maskCEP, maskPhone, maskDate, formatDateForDisplay, parseDateToDB } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { Parish, Foraria, ClergyLeity, ClergyRole, InstitutionSettings } from '../types';
import { DioceseReportType, formatCNPJ, getParishClergy, getClergyRoleRank, formatClergyRoleLabel } from '../types/diocese';
import { useAuth } from '../contexts/AuthContext';
import { PageHeader } from '../components/PageHeader';
import { DioceseReportsView } from '../components/diocese/DioceseReportsView';

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
  const [searchParams, setSearchParams] = useSearchParams();
  const currentView = searchParams.get('view') === 'reports' ? 'reports' : 'management';

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
  const [institution, setInstitution] = useState<InstitutionSettings | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  // Report States
  const [reportType, setReportType] = useState<DioceseReportType>('parishes_by_forania');
  const [reportForaniaFilter, setReportForaniaFilter] = useState<string>('all');
  const [reportSearch, setReportSearch] = useState('');
  const [reportParishesByForaniaSort, setReportParishesByForaniaSort] = useState<'name' | 'cnpj'>('cnpj');
  const [reportClergyRoleFilter, setReportClergyRoleFilter] = useState<string>('all');
  const [reportClergyGroupBy, setReportClergyGroupBy] = useState<'none' | 'forania' | 'role'>('none');
  const [reportParishesCnpjSort, setReportParishesCnpjSort] = useState<'name' | 'cnpj'>('cnpj');

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


  const fetchData = async () => {
    try {
      setLoading(true);
      const [pData, fData, cData, instData] = await Promise.all([
        fetchAll('parishes', '*', 'name', true),
        fetchAll('foraries', '*', 'code', true),
        fetchAll('clergy_leity', '*', 'code', true),
        getInstitutionSettings().catch(() => null)
      ]);
      setParishes(pData || []);
      setForaries(fData || []);
      setClergy(cData || []);
      if (instData) {
        setInstitution(instData);
      }
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

  const getReportTitle = () => {
    const searchSuffix = reportSearch.trim() ? ` (FILTRO: "${reportSearch.toUpperCase()}")` : '';
    
    if (reportType === 'forania_summary') {
      return `QUADRO RESUMO DE FORANIAS E VIGÁRIOS FORÂNEOS${searchSuffix}`;
    }
    
    if (reportType === 'clergy_directory') {
      let base = 'DIRETÓRIO GERAL DO CLERO DIOCESANO';
      if (reportForaniaFilter !== 'all') {
        const selectedForania = foraries.find(f => f.id === reportForaniaFilter);
        const fName = selectedForania ? (selectedForania.code ? `FORANIA ${selectedForania.code} — ${selectedForania.name.toUpperCase()}` : selectedForania.name.toUpperCase()) : '';
        base = `DIRETÓRIO DO CLERO — ${fName}`;
      }
      if (reportClergyRoleFilter !== 'all') {
        base += ` [FUNÇÃO: ${reportClergyRoleFilter.toUpperCase()}]`;
      }
      if (reportClergyGroupBy === 'forania') {
        base += ' [AGRUPADO POR FORANIA]';
      } else if (reportClergyGroupBy === 'role') {
        base += ' [AGRUPADO POR FUNÇÃO/TÍTULO]';
      }
      return `${base}${searchSuffix}`;
    }
    
    if (reportType === 'parishes_cnpj_list') {
      let base = 'RELAÇÃO OFICIAL DE PARÓQUIAS E CNPJ';
      if (reportForaniaFilter !== 'all') {
        const selectedForania = foraries.find(f => f.id === reportForaniaFilter);
        const fName = selectedForania ? (selectedForania.code ? `FORANIA ${selectedForania.code} — ${selectedForania.name.toUpperCase()}` : selectedForania.name.toUpperCase()) : '';
        base = `RELAÇÃO DE PARÓQUIAS E CNPJ — ${fName}`;
      }
      if (reportParishesCnpjSort === 'cnpj') {
        base += ' [ORDENADO POR CNPJ]';
      } else {
        base += ' [ORDENADO POR NOME]';
      }
      return `${base}${searchSuffix}`;
    }

    let base = 'RELATÓRIO OFICIAL DE PARÓQUIAS, CNPJ E CLERO RESPONSÁVEL POR FORANIA';
    if (reportForaniaFilter !== 'all') {
      const selectedForania = foraries.find(f => f.id === reportForaniaFilter);
      if (selectedForania) {
        const foraniaLabel = `FORANIA ${selectedForania.name.toUpperCase()}`;
        base = `RELATÓRIO OFICIAL DE PARÓQUIAS E CLERO — ${foraniaLabel}`;
      }
    }
    if (reportParishesByForaniaSort === 'cnpj') {
      base += ' [ORDENADO POR CNPJ]';
    }
    return `${base}${searchSuffix}`;
  };

  const getFilteredReportStats = () => {
    const foraniasToFilter = reportForaniaFilter === 'all' 
      ? foraries 
      : foraries.filter(f => f.id === reportForaniaFilter);

    const matchedParishes: Parish[] = [];
    const matchedForaniasSet = new Set<string>();

    foraniasToFilter.forEach(f => {
      const pList = parishes.filter(p => p.forania_id === f.id);
      const filteredPList = reportSearch.trim()
        ? pList.filter(p => {
            const q = reportSearch.toLowerCase().trim();
            const cData = getParishClergy(p, clergy);
            const priestMatch = cData.priests.some(pr => pr.name.toLowerCase().includes(q));
            const deaconMatch = cData.deacons.some(d => d.toLowerCase().includes(q));
            return p.name.toLowerCase().includes(q) || (p.cnpj && p.cnpj.toLowerCase().includes(q)) || priestMatch || deaconMatch;
          })
        : pList;

      if (filteredPList.length > 0) {
        matchedForaniasSet.add(f.id);
        matchedParishes.push(...filteredPList);
      }
    });

    if (reportForaniaFilter === 'all') {
      const unassigned = parishes.filter(p => !p.forania_id || !foraries.some(f => f.id === p.forania_id));
      const filteredUnassigned = reportSearch.trim()
        ? unassigned.filter(p => {
            const q = reportSearch.toLowerCase().trim();
            const cData = getParishClergy(p, clergy);
            const priestMatch = cData.priests.some(pr => pr.name.toLowerCase().includes(q));
            const deaconMatch = cData.deacons.some(d => d.toLowerCase().includes(q));
            return p.name.toLowerCase().includes(q) || (p.cnpj && p.cnpj.toLowerCase().includes(q)) || priestMatch || deaconMatch;
          })
        : unassigned;
      matchedParishes.push(...filteredUnassigned);
    }

    let priestCount = 0;
    let deaconCount = 0;

    if (reportType === 'clergy_directory') {
      let cl = clergy;
      if (reportForaniaFilter !== 'all') {
        const pIds = new Set(matchedParishes.map(p => p.id));
        cl = cl.filter(c => c.parish_id && pIds.has(c.parish_id));
      }
      if (reportClergyRoleFilter !== 'all') {
        cl = cl.filter(c => (c.role || '').toLowerCase() === reportClergyRoleFilter.toLowerCase());
      }
      if (reportSearch.trim()) {
        const q = reportSearch.toLowerCase().trim();
        cl = cl.filter(c => {
          const parish = parishes.find(p => p.id === c.parish_id);
          return (
            c.name.toLowerCase().includes(q) || 
            (c.role && c.role.toLowerCase().includes(q)) || 
            (parish && parish.name.toLowerCase().includes(q)) ||
            (c.email && c.email.toLowerCase().includes(q)) ||
            (c.phone && c.phone.toLowerCase().includes(q))
          );
        });
      }
      priestCount = cl.filter(c => (c.role || '').toLowerCase() !== 'diácono').length;
      deaconCount = cl.filter(c => (c.role || '').toLowerCase() === 'diácono').length;
    } else {
      matchedParishes.forEach(p => {
        const cData = getParishClergy(p, clergy);
        priestCount += cData.priests.length;
        deaconCount += cData.deacons.length;
      });
    }

    return {
      foraniasCount: reportForaniaFilter === 'all' ? foraries.length : matchedForaniasSet.size,
      parishesCount: matchedParishes.length,
      priestsCount: priestCount,
      deaconsCount: deaconCount
    };
  };

  const generateDiocesePDFDoc = () => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 10;
    let currentY = margin;

    const emissionDate = new Date();
    const emissionText = `Emissão: ${emissionDate.toLocaleDateString('pt-BR')} às ${emissionDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
    const systemOfficialName = institution?.name?.toUpperCase() || 'ESCOLA DIOCESANA DE MINISTÉRIO';
    const dioceseOfficialName = 'DIOCESE DE GUARULHOS';
    const reportTitle = getReportTitle();
    const reportStats = getFilteredReportStats();

    const drawPageHeader = () => {
      // Header White Card with subtle border and crisp bottom divider (NO BLACK BACKGROUND)
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(203, 213, 225); // slate-300
      doc.setLineWidth(0.3);
      doc.roundedRect(margin, margin, pageWidth - (margin * 2), 20, 1, 1, 'FD');

      // Subtle bottom accent border
      doc.setDrawColor(15, 23, 42); // slate-900
      doc.setLineWidth(0.7);
      doc.line(margin, margin + 20, pageWidth - margin, margin + 20);

      let textStartX = margin + 5;
      if (institution?.logo_url) {
        try {
          doc.addImage(institution.logo_url, 'auto', margin + 3, margin + 2.5, 15, 15);
          textStartX = margin + 21;
        } catch (e) {
          // ignore if image load fails
        }
      }

      doc.setTextColor(15, 23, 42); // slate-900
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10.5);
      doc.text(systemOfficialName, textStartX, margin + 5.5);

      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(51, 65, 85); // slate-700
      doc.text(dioceseOfficialName, textStartX, margin + 10.5);

      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42); // slate-900
      const truncatedTitle = doc.splitTextToSize(reportTitle, pageWidth - margin - textStartX - 80)[0] || reportTitle;
      doc.text(truncatedTitle, textStartX, margin + 15.5);

      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(71, 85, 105); // slate-600
      doc.text(emissionText, pageWidth - margin - 5, margin + 7.5, { align: 'right' });

      doc.setFontSize(7);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(30, 41, 59); // slate-800
      const statsSummary = `${reportStats.foraniasCount} foranias • ${reportStats.parishesCount} paróquias • ${reportStats.priestsCount} padres • ${reportStats.deaconsCount} diáconos`;
      doc.text(statsSummary, pageWidth - margin - 5, margin + 13.5, { align: 'right' });
    };

    if (reportType === 'forania_summary') {
      drawPageHeader();
      currentY = margin + 22;

      const summaryRows = foraries.map(f => {
        const foraniaParishes = parishes.filter(p => p.forania_id === f.id);
        let pCount = 0;
        let dCount = 0;
        foraniaParishes.forEach(p => {
          const cData = getParishClergy(p, clergy);
          pCount += cData.priests.length;
          dCount += cData.deacons.length;
        });

        return [
          f.name.toUpperCase(),
          f.priest_name ? `Pe. ${f.priest_name}` : 'A designar',
          String(foraniaParishes.length),
          String(pCount),
          String(dCount)
        ];
      });

      // Filter by search if needed
      const filteredSummary = reportSearch.trim()
        ? summaryRows.filter(row => row.some(cell => cell.toLowerCase().includes(reportSearch.toLowerCase().trim())))
        : summaryRows;

      autoTable(doc, {
        startY: currentY,
        head: [['NOME DA FORANIA', 'VIGÁRIO FORÂNEO RESPONSÁVEL', 'PARÓQUIAS', 'PADRES', 'DIÁCONOS']],
        body: filteredSummary,
        margin: { left: margin, right: margin },
        styles: {
          fontSize: 8,
          cellPadding: 3,
          valign: 'middle',
          textColor: [30, 41, 59],
          lineColor: [226, 232, 240],
          lineWidth: 0.2
        },
        headStyles: {
          fillColor: [241, 245, 249],
          textColor: [15, 23, 42],
          fontStyle: 'bold',
          fontSize: 8
        },
        columnStyles: {
          0: { cellWidth: 80, fontStyle: 'bold' },
          1: { cellWidth: 95 },
          2: { cellWidth: 32, halign: 'center' },
          3: { cellWidth: 35, halign: 'center' },
          4: { cellWidth: 'auto', halign: 'center' }
        },
        theme: 'grid'
      });
    } else if (reportType === 'clergy_directory') {
      drawPageHeader();
      currentY = margin + 22;

      let filteredClergy = [...clergy];
      if (reportForaniaFilter !== 'all') {
        const foraniaParishIds = new Set(parishes.filter(p => p.forania_id === reportForaniaFilter).map(p => p.id));
        filteredClergy = filteredClergy.filter(c => c.parish_id && foraniaParishIds.has(c.parish_id));
      }

      if (reportClergyRoleFilter !== 'all') {
        filteredClergy = filteredClergy.filter(c => (c.role || '').toLowerCase() === reportClergyRoleFilter.toLowerCase());
      }

      if (reportSearch.trim()) {
        const q = reportSearch.toLowerCase().trim();
        filteredClergy = filteredClergy.filter(c => {
          const parish = parishes.find(p => p.id === c.parish_id);
          return (
            c.name.toLowerCase().includes(q) || 
            (c.role && c.role.toLowerCase().includes(q)) || 
            (parish && parish.name.toLowerCase().includes(q)) ||
            (c.email && c.email.toLowerCase().includes(q)) ||
            (c.phone && c.phone.toLowerCase().includes(q))
          );
        });
      }

      if (reportClergyGroupBy === 'forania') {
        // Group by Forania
        const foraniasToDisplay = reportForaniaFilter === 'all' 
          ? foraries 
          : foraries.filter(f => f.id === reportForaniaFilter);

        let renderedGroups = 0;

        for (let i = 0; i < foraniasToDisplay.length; i++) {
          const forania = foraniasToDisplay[i];
          const foraniaParishIds = new Set(parishes.filter(p => p.forania_id === forania.id).map(p => p.id));
          const foraniaClergy = filteredClergy
            .filter(c => c.parish_id && foraniaParishIds.has(c.parish_id))
            .sort((a, b) => {
              const rankA = getClergyRoleRank(a.role);
              const rankB = getClergyRoleRank(b.role);
              if (rankA !== rankB) return rankA - rankB;
              return a.name.localeCompare(b.name);
            });

          if (foraniaClergy.length === 0 && (reportSearch.trim() || reportClergyRoleFilter !== 'all')) continue;

          if (renderedGroups > 0 && currentY > pageHeight - 55) {
            doc.addPage();
            drawPageHeader();
            currentY = margin + 22;
          }
          renderedGroups++;

          const priestForaneo = forania.priest_name ? `   •   Padre Forâneo: Pe. ${forania.priest_name}` : '';
          const groupTitle = `FORANIA ${forania.name.toUpperCase()}${priestForaneo}   (${foraniaClergy.length} ${foraniaClergy.length === 1 ? 'clérigo' : 'clérigos'})`;

          doc.setFillColor(241, 245, 249);
          doc.setDrawColor(203, 213, 225);
          doc.setLineWidth(0.3);
          doc.roundedRect(margin, currentY, pageWidth - (margin * 2), 7.5, 0.5, 0.5, 'FD');
          doc.setTextColor(15, 23, 42);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(8.5);
          doc.text(groupTitle, margin + 4, currentY + 5.2);
          currentY += 8.5;

          const groupRows = foraniaClergy.map(c => {
            const parish = parishes.find(p => p.id === c.parish_id);
            const contacts = [c.phone, c.email].filter(Boolean).join(' | ') || 'Não informado';
            return [
              c.name,
              (c.role || 'Membro do Clero').toUpperCase(),
              parish?.name || 'Diocese / Cúria',
              contacts
            ];
          });

          autoTable(doc, {
            startY: currentY,
            head: [['NOME DO CLÉRIGO', 'FUNÇÃO ECLESIÁSTICA', 'PARÓQUIA DE ATUAÇÃO', 'CONTATO']],
            body: groupRows.length > 0 ? groupRows : [['Nenhum membro do clero nesta forania com os filtros aplicados.', '—', '—', '—']],
            margin: { left: margin, right: margin },
            styles: { fontSize: 7.5, cellPadding: 2.5, valign: 'middle', textColor: [30, 41, 59], lineColor: [226, 232, 240], lineWidth: 0.2 },
            headStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold', fontSize: 7.5 },
            columnStyles: { 0: { cellWidth: 80, fontStyle: 'bold' }, 1: { cellWidth: 50 }, 2: { cellWidth: 85 }, 3: { cellWidth: 'auto' } },
            theme: 'grid'
          });

          // @ts-ignore
          currentY = (doc as any).lastAutoTable.finalY + 6;
        }

        // Unassigned or general curia clergy
        const unassignedClergy = filteredClergy
          .filter(c => !c.parish_id || !parishes.some(p => p.id === c.parish_id && p.forania_id && foraries.some(f => f.id === p.forania_id)))
          .sort((a, b) => {
            const rankA = getClergyRoleRank(a.role);
            const rankB = getClergyRoleRank(b.role);
            if (rankA !== rankB) return rankA - rankB;
            return a.name.localeCompare(b.name);
          });

        if (reportForaniaFilter === 'all' && unassignedClergy.length > 0) {
          if (currentY > pageHeight - 55) {
            doc.addPage();
            drawPageHeader();
            currentY = margin + 22;
          }

          doc.setFillColor(241, 245, 249);
          doc.setDrawColor(203, 213, 225);
          doc.setLineWidth(0.3);
          doc.roundedRect(margin, currentY, pageWidth - (margin * 2), 7.5, 0.5, 0.5, 'FD');
          doc.setTextColor(15, 23, 42);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(8.5);
          doc.text(`CÚRIA DIOCESANA / SEM FORANIA DEFINIDA (${unassignedClergy.length} clérigos)`, margin + 4, currentY + 5.2);
          currentY += 8.5;

          const groupRows = unassignedClergy.map(c => {
            const parish = parishes.find(p => p.id === c.parish_id);
            const contacts = [c.phone, c.email].filter(Boolean).join(' | ') || 'Não informado';
            return [
              c.name,
              (c.role || 'Membro do Clero').toUpperCase(),
              parish?.name || 'Diocese / Cúria Geral',
              contacts
            ];
          });

          autoTable(doc, {
            startY: currentY,
            head: [['NOME DO CLÉRIGO', 'FUNÇÃO ECLESIÁSTICA', 'PARÓQUIA DE ATUAÇÃO', 'CONTATO']],
            body: groupRows,
            margin: { left: margin, right: margin },
            styles: { fontSize: 7.5, cellPadding: 2.5, valign: 'middle', textColor: [30, 41, 59], lineColor: [226, 232, 240], lineWidth: 0.2 },
            headStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold', fontSize: 7.5 },
            columnStyles: { 0: { cellWidth: 80, fontStyle: 'bold' }, 1: { cellWidth: 50 }, 2: { cellWidth: 85 }, 3: { cellWidth: 'auto' } },
            theme: 'grid'
          });
        }
      } else if (reportClergyGroupBy === 'role') {
        // Group by Role / Title
        const distinctRoles = Array.from(new Set(filteredClergy.map(c => (c.role || 'outros').trim().toLowerCase()))).sort((a, b) => {
          const rankA = getClergyRoleRank(a);
          const rankB = getClergyRoleRank(b);
          if (rankA !== rankB) return rankA - rankB;
          return a.localeCompare(b);
        });

        let renderedGroups = 0;

        for (let i = 0; i < distinctRoles.length; i++) {
          const roleKey = distinctRoles[i];
          const roleClergy = filteredClergy
            .filter(c => (c.role || 'outros').trim().toLowerCase() === roleKey)
            .sort((a, b) => a.name.localeCompare(b.name));

          if (roleClergy.length === 0) continue;

          if (renderedGroups > 0 && currentY > pageHeight - 55) {
            doc.addPage();
            drawPageHeader();
            currentY = margin + 22;
          }
          renderedGroups++;

          const roleLabel = roleKey.toUpperCase();
          const groupTitle = `${roleLabel} (${roleClergy.length} ${roleClergy.length === 1 ? 'membro' : 'membros'})`;

          doc.setFillColor(241, 245, 249);
          doc.setDrawColor(203, 213, 225);
          doc.setLineWidth(0.3);
          doc.roundedRect(margin, currentY, pageWidth - (margin * 2), 7.5, 0.5, 0.5, 'FD');
          doc.setTextColor(15, 23, 42);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(8.5);
          doc.text(groupTitle, margin + 4, currentY + 5.2);
          currentY += 8.5;

          const groupRows = roleClergy.map(c => {
            const parish = parishes.find(p => p.id === c.parish_id);
            const forania = parish ? foraries.find(f => f.id === parish.forania_id) : null;
            const contacts = [c.phone, c.email].filter(Boolean).join(' | ') || 'Não informado';
            return [
              c.name,
              parish?.name || 'Diocese / Cúria',
              forania ? forania.name : '—',
              contacts
            ];
          });

          autoTable(doc, {
            startY: currentY,
            head: [['NOME DO CLÉRIGO', 'PARÓQUIA DE ATUAÇÃO', 'FORANIA', 'CONTATO']],
            body: groupRows,
            margin: { left: margin, right: margin },
            styles: { fontSize: 7.5, cellPadding: 2.5, valign: 'middle', textColor: [30, 41, 59], lineColor: [226, 232, 240], lineWidth: 0.2 },
            headStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold', fontSize: 7.5 },
            columnStyles: { 0: { cellWidth: 80, fontStyle: 'bold' }, 1: { cellWidth: 85 }, 2: { cellWidth: 45 }, 3: { cellWidth: 'auto' } },
            theme: 'grid'
          });

          // @ts-ignore
          currentY = (doc as any).lastAutoTable.finalY + 6;
        }
      } else {
        // Flat alphabetical list
        filteredClergy.sort((a, b) => a.name.localeCompare(b.name));

        const clergyRows = filteredClergy.map(c => {
          const parish = parishes.find(p => p.id === c.parish_id);
          const forania = parish ? foraries.find(f => f.id === parish.forania_id) : null;
          const contacts = [c.phone, c.email].filter(Boolean).join(' | ') || 'Não informado';

          return [
            c.name,
            (c.role || 'Membro do Clero').toUpperCase(),
            parish?.name || 'Diocese / Cúria',
            forania ? forania.name : '—',
            contacts
          ];
        });

        autoTable(doc, {
          startY: currentY,
          head: [['NOME DO CLÉRIGO', 'FUNÇÃO ECLESIÁSTICA', 'PARÓQUIA DE ATUAÇÃO', 'FORANIA', 'CONTATO']],
          body: clergyRows.length > 0 ? clergyRows : [['Nenhum membro do clero localizado com os filtros selecionados.', '—', '—', '—', '—']],
          margin: { left: margin, right: margin },
          styles: {
            fontSize: 7.5,
            cellPadding: 2.5,
            valign: 'middle',
            textColor: [30, 41, 59],
            lineColor: [226, 232, 240],
            lineWidth: 0.2
          },
          headStyles: {
            fillColor: [241, 245, 249],
            textColor: [15, 23, 42],
            fontStyle: 'bold',
            fontSize: 7.5
          },
          columnStyles: {
            0: { cellWidth: 70, fontStyle: 'bold' },
            1: { cellWidth: 42 },
            2: { cellWidth: 75 },
            3: { cellWidth: 35 },
            4: { cellWidth: 'auto' }
          },
          theme: 'grid'
        });
      }
    } else if (reportType === 'parishes_cnpj_list') {
      drawPageHeader();
      currentY = margin + 22;

      let filteredParishes = [...parishes];
      if (reportForaniaFilter !== 'all') {
        filteredParishes = filteredParishes.filter(p => p.forania_id === reportForaniaFilter);
      }

      if (reportSearch.trim()) {
        const q = reportSearch.toLowerCase().trim();
        filteredParishes = filteredParishes.filter(p => 
          p.name.toLowerCase().includes(q) ||
          (p.cnpj && p.cnpj.toLowerCase().includes(q)) ||
          (p.address_neighborhood && p.address_neighborhood.toLowerCase().includes(q)) ||
          (p.address_city && p.address_city.toLowerCase().includes(q))
        );
      }

      if (reportParishesCnpjSort === 'cnpj') {
        filteredParishes.sort((a, b) => {
          const cleanA = (a.cnpj || '').replace(/\D/g, '');
          const cleanB = (b.cnpj || '').replace(/\D/g, '');
          if (!cleanA && !cleanB) return a.name.localeCompare(b.name);
          if (!cleanA) return 1;
          if (!cleanB) return -1;
          return cleanA.localeCompare(cleanB);
        });
      } else {
        filteredParishes.sort((a, b) => a.name.localeCompare(b.name));
      }

      const parishRows = filteredParishes.map(p => {
        const forania = foraries.find(f => f.id === p.forania_id);
        const loc = [p.address_neighborhood, p.address_city ? `${p.address_city}${p.address_state ? `/${p.address_state}` : ''}` : ''].filter(Boolean).join(' - ') || 'Não informado';
        const contact = [p.phone, p.email].filter(Boolean).join(' | ') || 'Não informado';

        return [
          p.name,
          formatCNPJ(p.cnpj),
          forania ? forania.name : 'Sem Forania',
          loc,
          contact
        ];
      });

      autoTable(doc, {
        startY: currentY,
        head: [['PARÓQUIA', 'CNPJ', 'FORANIA', 'BAIRRO / CIDADE', 'CONTATO']],
        body: parishRows.length > 0 ? parishRows : [['Nenhuma paróquia localizada com os filtros selecionados.', '—', '—', '—', '—']],
        margin: { left: margin, right: margin },
        styles: {
          fontSize: 7.5,
          cellPadding: 2.5,
          valign: 'middle',
          textColor: [30, 41, 59],
          lineColor: [226, 232, 240],
          lineWidth: 0.2
        },
        headStyles: {
          fillColor: [241, 245, 249],
          textColor: [15, 23, 42],
          fontStyle: 'bold',
          fontSize: 7.5
        },
        columnStyles: {
          0: { cellWidth: 75, fontStyle: 'bold' },
          1: { cellWidth: 45, fontStyle: 'bold' },
          2: { cellWidth: 40 },
          3: { cellWidth: 55 },
          4: { cellWidth: 'auto' }
        },
        theme: 'grid'
      });
    } else {
      // Default: parishes_by_forania
      const foraniasToDisplay = reportForaniaFilter === 'all' 
        ? foraries 
        : foraries.filter(f => f.id === reportForaniaFilter);

      const parishesWithoutForania = parishes.filter(p => !p.forania_id || !foraries.some(f => f.id === p.forania_id));

      let renderedForaniasCount = 0;

      for (let i = 0; i < foraniasToDisplay.length; i++) {
        const forania = foraniasToDisplay[i];
        let foraniaParishes = parishes.filter(p => p.forania_id === forania.id);
        
        if (reportSearch.trim()) {
          const q = reportSearch.toLowerCase().trim();
          foraniaParishes = foraniaParishes.filter(p => {
            const clergyData = getParishClergy(p, clergy);
            const priestMatch = clergyData.priests.some(pr => pr.name.toLowerCase().includes(q));
            const deaconMatch = clergyData.deacons.some(d => d.toLowerCase().includes(q));
            return p.name.toLowerCase().includes(q) || 
                   (p.cnpj && p.cnpj.toLowerCase().includes(q)) || 
                   priestMatch || 
                   deaconMatch;
          });
        }

        if (foraniaParishes.length === 0 && reportSearch.trim()) continue;

        if (reportParishesByForaniaSort === 'cnpj') {
          foraniaParishes.sort((a, b) => {
            const cleanA = (a.cnpj || '').replace(/\D/g, '');
            const cleanB = (b.cnpj || '').replace(/\D/g, '');
            if (!cleanA && !cleanB) return a.name.localeCompare(b.name);
            if (!cleanA) return 1;
            if (!cleanB) return -1;
            return cleanA.localeCompare(cleanB);
          });
        } else {
          foraniaParishes.sort((a, b) => a.name.localeCompare(b.name));
        }

        // Page break for each forania
        if (renderedForaniasCount > 0) {
          doc.addPage();
        }
        renderedForaniasCount++;

        drawPageHeader();
        currentY = margin + 22;

        const priestForaneo = forania.priest_name ? `   •   Padre Forâneo: Pe. ${forania.priest_name}` : '';
        const foraniaTitle = `FORANIA ${forania.name.toUpperCase()}${priestForaneo}   (${foraniaParishes.length} ${foraniaParishes.length === 1 ? 'paróquia' : 'paróquias'})`;

        // Section header with clean light slate background (NO BLACK BACKGROUND)
        doc.setFillColor(241, 245, 249); // slate-100
        doc.setDrawColor(203, 213, 225); // slate-300
        doc.setLineWidth(0.3);
        doc.roundedRect(margin, currentY, pageWidth - (margin * 2), 7.5, 0.5, 0.5, 'FD');
        
        doc.setTextColor(15, 23, 42); // slate-900
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.text(foraniaTitle, margin + 4, currentY + 5.2);
        currentY += 8.5;

        const tableData = foraniaParishes.map(p => {
          const cData = getParishClergy(p, clergy);
          const addressParts = [
            p.address_neighborhood,
            p.address_city ? `${p.address_city}${p.address_state ? `/${p.address_state}` : ''}` : ''
          ].filter(Boolean).join(' - ');

          const contactParts = [p.phone, p.email].filter(Boolean).join(' | ');

          const parishCell = `${p.name}${addressParts ? `\n${addressParts}` : ''}${contactParts ? `\nContato: ${contactParts}` : ''}`;

          const priestsCell = cData.priests.length > 0 
            ? cData.priests.map(pr => `${pr.name} (${pr.role})`).join('\n')
            : 'A designar';

          const deaconsCell = cData.deacons.length > 0
            ? cData.deacons.join('\n')
            : '—';

          return [
            parishCell,
            formatCNPJ(p.cnpj),
            priestsCell,
            deaconsCell
          ];
        });

        if (tableData.length === 0) {
          tableData.push(['Nenhuma paróquia cadastrada nesta forania.', '—', '—', '—']);
        }

        autoTable(doc, {
          startY: currentY,
          head: [['PARÓQUIA / LOCALIZAÇÃO', 'CNPJ', 'PADRE(S) RESPONSÁVEL(IS)', 'DIÁCONO(S)']],
          body: tableData,
          margin: { left: margin, right: margin },
          styles: {
            fontSize: 7.5,
            cellPadding: 2.5,
            valign: 'middle',
            textColor: [30, 41, 59],
            lineColor: [226, 232, 240],
            lineWidth: 0.2
          },
          headStyles: {
            fillColor: [241, 245, 249],
            textColor: [15, 23, 42],
            fontStyle: 'bold',
            fontSize: 7.5
          },
          columnStyles: {
            0: { cellWidth: 105 },
            1: { cellWidth: 42, fontStyle: 'bold' },
            2: { cellWidth: 75 },
            3: { cellWidth: 'auto' }
          },
          theme: 'grid'
        });
      }

      // Parishes without forania (if any)
      if (reportForaniaFilter === 'all' && parishesWithoutForania.length > 0) {
        let unassigned = parishesWithoutForania;
        if (reportSearch.trim()) {
          const q = reportSearch.toLowerCase().trim();
          unassigned = unassigned.filter(p => {
            const cData = getParishClergy(p, clergy);
            const priestMatch = cData.priests.some(pr => pr.name.toLowerCase().includes(q));
            const deaconMatch = cData.deacons.some(d => d.toLowerCase().includes(q));
            return p.name.toLowerCase().includes(q) || 
                   (p.cnpj && p.cnpj.toLowerCase().includes(q)) || 
                   priestMatch || 
                   deaconMatch;
          });
        }

        if (reportParishesByForaniaSort === 'cnpj') {
          unassigned.sort((a, b) => {
            const cleanA = (a.cnpj || '').replace(/\D/g, '');
            const cleanB = (b.cnpj || '').replace(/\D/g, '');
            if (!cleanA && !cleanB) return a.name.localeCompare(b.name);
            if (!cleanA) return 1;
            if (!cleanB) return -1;
            return cleanA.localeCompare(cleanB);
          });
        } else {
          unassigned.sort((a, b) => a.name.localeCompare(b.name));
        }

        if (unassigned.length > 0) {
          if (renderedForaniasCount > 0) {
            doc.addPage();
          }
          drawPageHeader();
          currentY = margin + 22;

          doc.setFillColor(241, 245, 249);
          doc.setDrawColor(203, 213, 225);
          doc.setLineWidth(0.3);
          doc.roundedRect(margin, currentY, pageWidth - (margin * 2), 7.5, 0.5, 0.5, 'FD');

          doc.setTextColor(15, 23, 42);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(8.5);
          doc.text(`OUTRAS COMUNIDADES / SEM FORANIA DEFINIDA (${unassigned.length} ${unassigned.length === 1 ? 'paróquia' : 'paróquias'})`, margin + 4, currentY + 5.2);
          currentY += 8.5;

          const tableData = unassigned.map(p => {
            const cData = getParishClergy(p, clergy);
            const priestsCell = cData.priests.length > 0 ? cData.priests.map(pr => `${pr.name} (${pr.role})`).join('\n') : 'A designar';
            const deaconsCell = cData.deacons.length > 0 ? cData.deacons.join('\n') : '—';
            return [
              p.name,
              formatCNPJ(p.cnpj),
              priestsCell,
              deaconsCell
            ];
          });

          autoTable(doc, {
            startY: currentY,
            head: [['PARÓQUIA / LOCALIZAÇÃO', 'CNPJ', 'PADRE(S) RESPONSÁVEL(IS)', 'DIÁCONO(S)']],
            body: tableData,
            margin: { left: margin, right: margin },
            styles: { fontSize: 7.5, cellPadding: 2.5, valign: 'middle' },
            headStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold' },
            columnStyles: { 0: { cellWidth: 105 }, 1: { cellWidth: 42, fontStyle: 'bold' }, 2: { cellWidth: 75 }, 3: { cellWidth: 'auto' } },
            theme: 'grid'
          });
        }
      }
    }

    // Add page numbers and footer
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFontSize(7);
      doc.setTextColor(100, 116, 139);
      doc.text(`Página ${i} de ${totalPages} • ${systemOfficialName} • Diocese de Guarulhos`, margin, pageHeight - 5);
      doc.text('Documento Administrativo Oficial', pageWidth - margin, pageHeight - 5, { align: 'right' });
    }

    return doc;
  };

  const handlePrint = () => {
    try {
      const doc = generateDiocesePDFDoc();
      if (!doc) {
        window.print();
        return;
      }
      doc.autoPrint();
      const blobUrl = String(doc.output('bloburl'));
      const printIframe = document.createElement('iframe');
      printIframe.style.position = 'fixed';
      printIframe.style.right = '0';
      printIframe.style.bottom = '0';
      printIframe.style.width = '0';
      printIframe.style.height = '0';
      printIframe.style.border = '0';
      printIframe.src = blobUrl;
      document.body.appendChild(printIframe);
      printIframe.onload = () => {
        setTimeout(() => {
          try {
            printIframe.contentWindow?.focus();
            printIframe.contentWindow?.print();
          } catch (err) {
            window.open(blobUrl, '_blank');
          }
        }, 200);
      };
    } catch (error) {
      console.error('Error triggering print:', error);
      window.print();
    }
  };

  const handleExportPDF = () => {
    try {
      const doc = generateDiocesePDFDoc();
      if (!doc) return;
      doc.save(`Relatorio_Paroquias_Clero_Diocese_${new Date().toISOString().split('T')[0]}.pdf`);
      setNotification({ type: 'success', message: 'Relatório em PDF gerado com sucesso!' });
    } catch (error) {
      console.error('Error generating PDF:', error);
      setNotification({ type: 'error', message: 'Erro ao gerar o arquivo PDF.' });
    }
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
      {currentView === 'reports' ? (
        <DioceseReportsView
          parishes={parishes}
          foraries={foraries}
          clergy={clergy}
          institution={institution}
          reportType={reportType}
          setReportType={setReportType}
          reportForaniaFilter={reportForaniaFilter}
          setReportForaniaFilter={setReportForaniaFilter}
          reportSearch={reportSearch}
          setReportSearch={setReportSearch}
          reportParishesByForaniaSort={reportParishesByForaniaSort}
          setReportParishesByForaniaSort={setReportParishesByForaniaSort}
          reportClergyRoleFilter={reportClergyRoleFilter}
          setReportClergyRoleFilter={setReportClergyRoleFilter}
          reportClergyGroupBy={reportClergyGroupBy}
          setReportClergyGroupBy={setReportClergyGroupBy}
          reportParishesCnpjSort={reportParishesCnpjSort}
          setReportParishesCnpjSort={setReportParishesCnpjSort}
          handlePrint={handlePrint}
          handleExportPDF={handleExportPDF}
          getFilteredReportStats={getFilteredReportStats}
          getReportTitle={getReportTitle}
        />
      ) : (
        <>
          <PageHeader
            title="Gestão da Diocese"
            description="Painel Central de paróquias, foranias e clero para controle de uso exclusivo e interno."
            icon={Scroll}
          />

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
                        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                          <div className="col-span-1 sm:col-span-3 space-y-1">
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
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                          <div className="col-span-1 sm:col-span-2 space-y-1">
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
        </>
      )}

      {/* PRINT REPORT - OFFICIAL DIOCESAN REPORT GROUPED BY FORANIA */}
      <div id="printable-diocese-report" className="hidden print:block bg-white text-slate-900 w-full" ref={printRef}>
        <style dangerouslySetInnerHTML={{ __html: `
          @media print {
            @page {
              size: A4 landscape !important;
              margin: 10mm 10mm 10mm 10mm !important;
            }
            html, body {
              width: 100% !important;
              height: auto !important;
              background: #ffffff !important;
              color: #0f172a !important;
              overflow: visible !important;
              margin: 0 !important;
              padding: 0 !important;
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            #printable-diocese-report {
              display: block !important;
              visibility: visible !important;
              position: static !important;
              width: 100% !important;
              max-width: 100% !important;
              margin: 0 !important;
              padding: 0 !important;
              background: #ffffff !important;
              z-index: 999999 !important;
            }
            #printable-diocese-report * {
              visibility: visible !important;
            }
            .forania-print-page {
              width: 100% !important;
              box-sizing: border-box !important;
              page-break-inside: avoid !important;
              break-inside: avoid !important;
              margin: 0 0 20px 0 !important;
              padding: 0 !important;
            }
            .forania-print-page:not(:first-child) {
              page-break-before: always !important;
              break-before: page !important;
            }
            .no-print, .print\\:hidden, [role="dialog"], .backdrop-blur {
              display: none !important;
              visibility: hidden !important;
              height: 0 !important;
              width: 0 !important;
            }
          }
        `}} />

        {/* Dynamic Report Content for HTML Print */}
        <div className="p-4 bg-white text-slate-900">
          {/* Header Banner - Clean Light Theme (No black background) */}
          <div className="bg-white border-b-2 border-slate-900 pb-3 mb-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              {institution?.logo_url ? (
                <img
                  src={institution.logo_url}
                  alt="Logotipo"
                  className="w-12 h-12 object-contain rounded"
                  referrerPolicy="no-referrer"
                />
              ) : null}
              <div className="space-y-0.5">
                <h1 className="text-[12pt] font-black uppercase tracking-wider text-slate-900 leading-tight">
                  {institution?.name?.toUpperCase() || 'ESCOLA DIOCESANA DE MINISTÉRIO'}
                </h1>
                <h2 className="text-[8.5pt] font-bold uppercase tracking-wider text-slate-600">
                  DIOCESE DE GUARULHOS
                </h2>
                <p className="text-[8pt] font-bold text-blue-800 uppercase">
                  {getReportTitle()}
                </p>
              </div>
            </div>
            <div className="text-right space-y-0.5">
              <p className="text-[7.5pt] font-medium text-slate-500 uppercase tracking-wider">
                Emissão: {new Date().toLocaleDateString('pt-BR')} às {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
              </p>
              <p className="text-[7.5pt] text-slate-700 font-bold uppercase tracking-wider">
                {getFilteredReportStats().parishesCount} {getFilteredReportStats().parishesCount === 1 ? 'Paróquia' : 'Paróquias'} • {getFilteredReportStats().priestsCount} Padres • {getFilteredReportStats().deaconsCount} Diáconos
              </p>
            </div>
          </div>

          {/* Model 1: parishes_by_forania */}
          {reportType === 'parishes_by_forania' && (
            <div>
              {(reportForaniaFilter === 'all' ? foraries : foraries.filter(f => f.id === reportForaniaFilter)).map((forania) => {
                const foraniaParishes = parishes.filter(p => p.forania_id === forania.id);
                const filteredForaniaParishes = reportSearch.trim()
                  ? foraniaParishes.filter(p => {
                      const q = reportSearch.toLowerCase().trim();
                      const cData = getParishClergy(p, clergy);
                      const priestMatch = cData.priests.some(pr => pr.name.toLowerCase().includes(q));
                      const deaconMatch = cData.deacons.some(d => d.toLowerCase().includes(q));
                      return p.name.toLowerCase().includes(q) || (p.cnpj && p.cnpj.toLowerCase().includes(q)) || priestMatch || deaconMatch;
                    })
                  : foraniaParishes;

                if (filteredForaniaParishes.length === 0 && reportSearch.trim()) return null;

                return (
                  <div key={forania.id} className="forania-print-page mb-6">
                    <div className="bg-slate-100 px-3 py-1.5 flex items-center justify-between border border-slate-300 text-slate-900">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-[9pt] uppercase tracking-wider">
                          {forania.code ? `FORANIA ${forania.code} — ` : ''}{forania.name}
                        </span>
                        {forania.priest_name && (
                          <span className="text-[8pt] font-medium text-slate-600 border-l border-slate-300 pl-2">
                            Padre Forâneo: <strong className="text-slate-900 font-bold">Pe. {forania.priest_name}</strong>
                          </span>
                        )}
                      </div>
                      <span className="text-[8pt] font-bold uppercase tracking-wider text-slate-700">
                        {filteredForaniaParishes.length} {filteredForaniaParishes.length === 1 ? 'Paróquia' : 'Paróquias'}
                      </span>
                    </div>

                    <table className="w-full text-left text-[8pt] border-collapse border border-slate-300 table-fixed">
                      <colgroup>
                        <col style={{ width: '38%' }} />
                        <col style={{ width: '15%' }} />
                        <col style={{ width: '27%' }} />
                        <col style={{ width: '20%' }} />
                      </colgroup>
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-300 text-slate-900 font-bold uppercase text-[7.5pt]">
                          <th className="py-2 px-2.5 border-r border-slate-300">Paróquia / Localização</th>
                          <th className="py-2 px-2.5 border-r border-slate-300">CNPJ</th>
                          <th className="py-2 px-2.5 border-r border-slate-300">Padre(s) Responsável(is)</th>
                          <th className="py-2 px-2.5">Diácono(s)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {filteredForaniaParishes.length > 0 ? (
                          filteredForaniaParishes.map((parish) => {
                            const clergyData = getParishClergy(parish, clergy);
                            return (
                              <tr key={parish.id} className="border-b border-slate-200">
                                <td className="py-2 px-2.5 align-top border-r border-slate-200">
                                  <p className="font-bold text-slate-900 uppercase text-[8.5pt] leading-tight">{parish.name}</p>
                                  {(parish.address_neighborhood || parish.address_city) && (
                                    <p className="text-[7.5pt] text-slate-600 mt-0.5">
                                      {[parish.address_neighborhood, parish.address_city ? `${parish.address_city}${parish.address_state ? `/${parish.address_state}` : ''}` : ''].filter(Boolean).join(' - ')}
                                    </p>
                                  )}
                                  {(parish.phone || parish.email) && (
                                    <p className="text-[7pt] text-slate-500 mt-0.5">
                                      {[parish.phone ? `Tel: ${parish.phone}` : '', parish.email].filter(Boolean).join(' | ')}
                                    </p>
                                  )}
                                </td>
                                <td className="py-2 px-2.5 align-top border-r border-slate-200">
                                  <span className="font-mono font-bold text-slate-800 text-[8pt]">
                                    {formatCNPJ(parish.cnpj)}
                                  </span>
                                </td>
                                <td className="py-2 px-2.5 align-top border-r border-slate-200">
                                  {clergyData.priests.length > 0 ? (
                                    <div className="space-y-1">
                                      {clergyData.priests.map((p, idx) => (
                                        <div key={idx} className="leading-tight">
                                          <p className="font-bold text-slate-800 text-[8pt]">{p.name}</p>
                                          <span className="text-[7pt] font-medium uppercase text-slate-500">({p.role})</span>
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <span className="text-slate-400 italic text-[7.5pt]">A designar</span>
                                  )}
                                </td>
                                <td className="py-2 px-2.5 align-top">
                                  {clergyData.deacons.length > 0 ? (
                                    <div className="space-y-1">
                                      {clergyData.deacons.map((d, idx) => (
                                        <p key={idx} className="font-semibold text-slate-700 text-[8pt] leading-tight">{d}</p>
                                      ))}
                                    </div>
                                  ) : (
                                    <span className="text-slate-400 text-[7.5pt]">—</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })
                        ) : (
                          <tr>
                            <td colSpan={4} className="py-3 text-center text-slate-400 italic text-[8pt]">
                              Nenhuma paróquia vinculada a esta forania.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                );
              })}
            </div>
          )}

          {/* Model 2: forania_summary */}
          {reportType === 'forania_summary' && (
            <table className="w-full text-left text-[8.5pt] border-collapse border border-slate-300">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-300 text-slate-900 font-bold uppercase text-[8pt]">
                  <th className="py-2 px-3 border-r border-slate-300 w-16">Cód.</th>
                  <th className="py-2 px-3 border-r border-slate-300">Nome da Forania</th>
                  <th className="py-2 px-3 border-r border-slate-300">Vigário Forâneo</th>
                  <th className="py-2 px-3 text-center w-28">Paróquias</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {(reportForaniaFilter === 'all' ? foraries : foraries.filter(f => f.id === reportForaniaFilter)).map((forania) => {
                  const foraniaParishes = parishes.filter(p => p.forania_id === forania.id);
                  return (
                    <tr key={forania.id} className="border-b border-slate-200">
                      <td className="py-2 px-3 font-mono font-bold text-slate-700 border-r border-slate-200">{forania.code || '-'}</td>
                      <td className="py-2 px-3 font-bold text-slate-900 uppercase border-r border-slate-200">{forania.name}</td>
                      <td className="py-2 px-3 text-slate-800 border-r border-slate-200">
                        {forania.priest_name ? `Pe. ${forania.priest_name}` : <span className="text-slate-400 italic">Não designado</span>}
                      </td>
                      <td className="py-2 px-3 text-center font-bold text-slate-800">{foraniaParishes.length}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {/* Model 3: clergy_directory */}
          {reportType === 'clergy_directory' && (
            <table className="w-full text-left text-[8pt] border-collapse border border-slate-300">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-300 text-slate-900 font-bold uppercase text-[7.5pt]">
                  <th className="py-2 px-3 border-r border-slate-300 w-[30%]">Nome do Clérigo</th>
                  <th className="py-2 px-3 border-r border-slate-300 w-[18%]">Função / Título</th>
                  <th className="py-2 px-3 border-r border-slate-300 w-[32%]">Paróquia de Atuação</th>
                  <th className="py-2 px-3 w-[20%]">Contato / E-mail</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {clergy
                  .filter(c => {
                    const q = reportSearch.toLowerCase().trim();
                    if (!q) return true;
                    return c.name.toLowerCase().includes(q) || (c.role && c.role.toLowerCase().includes(q)) || (c.email && c.email.toLowerCase().includes(q));
                  })
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((c) => {
                    const parish = parishes.find(p => p.id === c.parish_id);
                    return (
                      <tr key={c.id} className="border-b border-slate-200">
                        <td className="py-2 px-3 font-bold text-slate-900 border-r border-slate-200">{c.name}</td>
                        <td className="py-2 px-3 font-semibold text-slate-700 uppercase text-[7.5pt] border-r border-slate-200">{c.role || 'Membro do Clero'}</td>
                        <td className="py-2 px-3 text-slate-800 border-r border-slate-200">{parish ? parish.name : <span className="text-slate-400 italic">Geral / Sem Paróquia</span>}</td>
                        <td className="py-2 px-3 text-slate-600 text-[7.5pt]">{[c.phone, c.email].filter(Boolean).join(' • ') || '—'}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          )}

          {/* Model 4: parishes_cnpj_list */}
          {reportType === 'parishes_cnpj_list' && (
            <table className="w-full text-left text-[8pt] border-collapse border border-slate-300">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-300 text-slate-900 font-bold uppercase text-[7.5pt]">
                  <th className="py-2 px-3 border-r border-slate-300 w-[35%]">Paróquia</th>
                  <th className="py-2 px-3 border-r border-slate-300 w-[18%]">CNPJ</th>
                  <th className="py-2 px-3 border-r border-slate-300 w-[20%]">Forania</th>
                  <th className="py-2 px-3 w-[27%]">Bairro / Cidade</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {parishes
                  .filter(p => {
                    if (reportForaniaFilter !== 'all' && p.forania_id !== reportForaniaFilter) return false;
                    const q = reportSearch.toLowerCase().trim();
                    if (!q) return true;
                    return p.name.toLowerCase().includes(q) || (p.cnpj && p.cnpj.toLowerCase().includes(q));
                  })
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((p) => {
                    const f = foraries.find(forania => forania.id === p.forania_id);
                    return (
                      <tr key={p.id} className="border-b border-slate-200">
                        <td className="py-2 px-3 font-bold text-slate-900 border-r border-slate-200">{p.name}</td>
                        <td className="py-2 px-3 font-mono font-bold text-slate-800 border-r border-slate-200">{formatCNPJ(p.cnpj)}</td>
                        <td className="py-2 px-3 text-slate-700 border-r border-slate-200">{f ? (f.code ? `Forania ${f.code}` : f.name) : 'Sem Forania'}</td>
                        <td className="py-2 px-3 text-slate-600">{[p.address_neighborhood, p.address_city].filter(Boolean).join(' - ') || '—'}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          )}

          {/* Page Footer */}
          <div className="mt-6 pt-2 border-t border-slate-300 flex justify-between items-center text-[7.5pt] text-slate-500">
            <p className="font-medium text-slate-600">
              {institution?.name?.toUpperCase() || 'ESCOLA DIOCESANA DE MINISTÉRIO'} • Diocese de Guarulhos
            </p>
            <p className="text-slate-500">Documento Administrativo Oficial</p>
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
    </div>
  );
}
