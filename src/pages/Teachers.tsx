import React, { useState, useEffect } from 'react';
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
  Printer
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatCurrency, cn } from '../lib/utils';
import { fetchAll, saveData, deleteData } from '../lib/database';
import { RotateCcw, FileText as FileIcon } from 'lucide-react';

interface Teacher {
  id: string;
  code: string;
  name: string;
  address_street?: string;
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
  created_at: string;
  user_id: string;
}

interface Subject {
  id: string;
  code: string;
  name: string;
  status: 'Ativo' | 'Inativo';
}

// Masking helpers
const maskCPF = (value: string) => {
  return value
    .replace(/\D/g, '')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})/, '$1-$2')
    .replace(/(-\d{2})\d+?$/, '$1');
};

const maskRG = (value: string) => {
  return value.replace(/\D/g, '').replace(/(\d{2})(\d{3})(\d{3})(\d{1})/, '$1.$2.$3-$4');
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
  className 
}: { 
  teacher: Teacher, 
  isSelected: boolean, 
  onSelect: (t: Teacher) => void,
  className?: string
}) => {
  return (
    <button
      onClick={() => onSelect(teacher)}
      className={cn(
        "w-full flex items-center gap-3 p-3 rounded-2xl transition-all text-left",
        isSelected 
          ? "bg-blue-50 border-blue-100" 
          : "hover:bg-slate-50 border-transparent",
        className
      )}
    >
      <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500 font-bold text-xs relative">
        {teacher.code}
        <div className={cn(
          "absolute -top-1 -right-1 w-3 h-3 rounded-full border-2 border-white",
          teacher.status === 'Inativo' ? "bg-slate-300" : "bg-emerald-500"
        )} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-bold text-[#131b2e] truncate">{teacher.name}</p>
          <span className={cn(
            "px-1.5 py-0.5 text-[8px] font-black rounded uppercase",
            teacher.status === 'Inativo' ? "bg-slate-100 text-slate-500" : "bg-green-100 text-green-700"
          )}>
            {teacher.status || 'Ativo'}
          </span>
        </div>
        <p className="text-xs text-slate-500 truncate">{teacher.email || 'Sem e-mail'}</p>
      </div>
    </button>
  );
});

export function Teachers() {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [inst, setInst] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'Ativo' | 'Inativo' | 'Todos'>('Ativo');
  const [selectedTeacher, setSelectedTeacher] = useState<Teacher | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<Partial<Teacher>>({});
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error', message: string } | null>(null);

  const fetchTeachers = React.useCallback(async () => {
    setLoading(true);
    try {
      const [teachersData, subjectsData, instData] = await Promise.all([
        fetchAll('teachers', '*', 'name', true),
        fetchAll('subjects', 'id, code, name, status', 'name', true),
        fetchAll('institution_settings')
      ]);
      const normalizedTeachers = (teachersData || []).map((t: Teacher) => {
        let normalized = { ...t };
        let sIds = normalized.subject_ids || [];
        
        if (typeof sIds === 'string' && (sIds as string).startsWith('{')) {
          sIds = (sIds as string).replace(/[{}]/g, '').split(',').filter(Boolean);
        }
        
        if ((!sIds || sIds.length === 0) && normalized.observations) {
          const match = normalized.observations.match(/\[SUBJECTS:(.+?)\]/);
          if (match && match[1]) {
            try { sIds = JSON.parse(match[1]); } catch (e) {}
          }
        }
        normalized.subject_ids = Array.isArray(sIds) ? sIds : [];
        return normalized;
      });

      setTeachers(normalizedTeachers);
      setSubjects(subjectsData || []);
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
      const match = teacher.observations.match(/\[SUBJECTS:(.+?)\]/);
      if (match && match[1]) {
        try {
          subjectIds = JSON.parse(match[1]);
        } catch (e) {
          console.warn('Failed to parse subject_ids from observations');
        }
      }
    }
    
    const normalizedTeacher = {
      ...teacher,
      subject_ids: Array.isArray(subjectIds) ? subjectIds : []
    };
    setSelectedTeacher(normalizedTeacher);
    setFormData(normalizedTeacher);
    setIsEditing(false);
  }, []);

  const generateTeacherListPDF = async () => {
    try {
      const doc = new jsPDF();
      const margin = 15;
      const pageWidth = doc.internal.pageSize.width;

      // Header
      if (inst?.logo_url) {
        try {
          doc.addImage(inst.logo_url, 'PNG', margin, 10, 20, 20);
        } catch (e) {
          console.error('Error adding logo to list PDF', e);
        }
      }
      
      doc.setFontSize(14);
      doc.setTextColor(0, 23, 75);
      doc.setFont('helvetica', 'bold');
      doc.text(inst?.name?.toUpperCase() || 'ESCOLA DIOCESANA DE MINISTÉRIOS', 38, 18);
      
      doc.setFontSize(9);
      doc.setTextColor(100);
      doc.setFont('helvetica', 'normal');
      doc.text(`RELAÇÃO DE CORPO DOCENTE • FILTRO: ${statusFilter.toUpperCase()}`, 38, 24);
      doc.text(`${inst?.city_uf || ''} • EMISSÃO: ${new Date().toLocaleString('pt-BR')}`, 38, 29);

      doc.setDrawColor(0, 23, 75);
      doc.setLineWidth(0.5);
      doc.line(margin, 35, pageWidth - margin, 35);

      const tableData = filteredTeachers.map(t => {
        const teacherSubjects = subjects
          .filter(s => t.subject_ids?.includes(s.id))
          .map(s => s.name)
          .join(', ');
          
        return [
          t.code,
          t.name.toUpperCase(),
          t.email || '---',
          teacherSubjects || '---',
          t.status || 'Ativo'
        ];
      });

      autoTable(doc, {
        startY: 40,
        head: [['CÓD.', 'NOME DO PROFESSOR', 'E-MAIL', 'DISCIPLINAS', 'STATUS']],
        body: tableData,
        headStyles: { fillColor: [0, 23, 75], textColor: 255, fontSize: 8, fontStyle: 'bold' },
        styles: { fontSize: 7, cellPadding: 2, font: 'helvetica' },
        columnStyles: {
          0: { cellWidth: 12 },
          1: { cellWidth: 55 },
          2: { cellWidth: 40 },
          3: { cellWidth: 55 },
          4: { cellWidth: 18 }
        },
        alternateRowStyles: { fillColor: [245, 247, 250] },
        margin: { left: margin, right: margin }
      });

      // Footer
      const pages = (doc as any).internal.getNumberOfPages();
      for (let i = 1; i <= pages; i++) {
        doc.setPage(i);
        doc.setFontSize(7);
        doc.setTextColor(150);
        const footerText = `SISTEMA ESCMIN • Documento emitido em ${new Date().toLocaleString('pt-BR')} • Página ${i} de ${pages}`;
        doc.text(footerText, pageWidth / 2, doc.internal.pageSize.height - 10, { align: 'center' });
      }

      doc.autoPrint();
      const blob = doc.output('blob');
      const url = URL.createObjectURL(blob);
      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      iframe.src = url;
      document.body.appendChild(iframe);
      iframe.onload = () => {
        setTimeout(() => {
          iframe.contentWindow?.print();
          // Remove iframe and revoke URL after some time
          setTimeout(() => {
            document.body.removeChild(iframe);
            URL.revokeObjectURL(url);
          }, 1000);
        }, 300);
      };
    } catch (error) {
      console.error('Error generating teacher list PDF:', error);
      alert('Erro ao gerar relatório de professores');
    }
  };

  const handleNew = () => {
    setSelectedTeacher(null);
    setFormData({
      name: '',
      code: String(teachers.length + 1).padStart(3, '0'),
      status: 'Ativo',
      subject_ids: [],
    });
    setIsEditing(true);
  };

  const handleSave = async () => {
    try {
      setLoading(true);
      
      const syncData = { 
        ...formData,
        subject_ids: formData.subject_ids || []
      };

      // PROACTIVE METADATA SYNC:
      // Always sync subject_ids into observations metadata before saving.
      // This ensures data persistence even if the Supabase column is missing.
      if (syncData.subject_ids && syncData.subject_ids.length > 0) {
        const metadataStr = `[SUBJECTS:${JSON.stringify(syncData.subject_ids)}]`;
        // Clean up existing metadata first
        let cleanObs = (syncData.observations || '').replace(/\[SUBJECTS:.+?\]/, '').trim();
        syncData.observations = (cleanObs + (cleanObs ? '\n' : '') + metadataStr).trim();
      }

      console.log('[Teachers] Saving data:', syncData);
      
      const savedId = await saveData('teachers', selectedTeacher?.id, syncData);
      
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

  const handleDelete = React.useCallback(async () => {
    if (!selectedTeacher?.id) return;

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
      e.preventDefault();
      const target = e.target as HTMLElement;
      const nextTabIndex = (target.tabIndex || 0) + 1;
      const nextElement = document.querySelector(`[tabIndex="${nextTabIndex}"]`) as HTMLElement;
      if (nextElement) {
        nextElement.focus();
      }
    }
  };

  const generateTeacherPDF = async (teacher: Teacher) => {
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.width;
      const margin = 20;
      
      const institutions = await fetchAll('institution_settings');
      const inst = institutions && institutions.length > 0 ? institutions[0] : null;

      if (inst?.logo_url) {
        try {
          doc.addImage(inst.logo_url, 'PNG', margin, 15, 25, 25);
        } catch (e) {
          console.error('Error adding logo to PDF', e);
        }
      }
      
      doc.setFontSize(22);
      doc.setTextColor(0, 23, 75);
      doc.setFont('helvetica', 'bold');
      doc.text('FICHA DO PROFESSOR', 50, 25);
      
      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.setFont('helvetica', 'normal');
      doc.text(inst?.name || 'ESCMIN - Gestão Escolar', 50, 32);
      doc.text(`Código: ${teacher.code}`, 50, 37);

      doc.setFontSize(14);
      doc.setTextColor(0, 23, 75);
      doc.text('DADOS PESSOAIS', margin, 75);
      doc.setDrawColor(0, 23, 75);
      doc.line(margin, 77, pageWidth - margin, 77);

      doc.setFontSize(10);
      doc.setTextColor(0);
      
      // Get subject names
      const teacherSubjects = subjects
        .filter(s => teacher.subject_ids?.includes(s.id))
        .map(s => s.name)
        .join(', ');

      const personalData = [
        ['Nome:', teacher.name],
        ['Situação:', teacher.status],
        ['CPF:', teacher.cpf || '---'],
        ['RG:', teacher.rg || '---'],
        ['E-mail:', teacher.email || '---'],
        ['Disciplinas:', teacherSubjects || 'Nenhuma selecionada']
      ];

      autoTable(doc, {
        startY: 80,
        body: personalData,
        theme: 'plain',
        styles: { cellPadding: 2, fontSize: 10 },
        columnStyles: { 0: { fontStyle: 'bold', cellWidth: 30 } }
      });

      const nextY = (doc as any).lastAutoTable.finalY + 10;
      doc.setFontSize(14);
      doc.setTextColor(0, 23, 75);
      doc.text('CONTATO E ENDEREÇO', margin, nextY);
      doc.line(margin, nextY + 2, pageWidth - margin, nextY + 2);

      const contactData = [
        ['Endereço:', teacher.address_street || '---'],
        ['Cidade/UF:', `${teacher.address_city || '---'} / ${teacher.address_state || '---'}`],
        ['CEP:', teacher.address_zip || '---'],
        ['Celular:', teacher.phone_mobile || '---']
      ];

      autoTable(doc, {
        startY: nextY + 5,
        body: contactData,
        theme: 'plain',
        styles: { cellPadding: 2, fontSize: 10 },
        columnStyles: { 0: { fontStyle: 'bold', cellWidth: 30 } }
      });

      if (teacher.observations) {
        const obsY = (doc as any).lastAutoTable.finalY + 10;
        doc.setFontSize(14);
        doc.setTextColor(0, 23, 75);
        doc.text('OBSERVAÇÕES', margin, obsY);
        doc.line(margin, obsY + 2, pageWidth - margin, obsY + 2);
        
        doc.setFontSize(10);
        doc.setTextColor(0);
        doc.text(teacher.observations.replace(/\[SUBJECTS:.+?\]/, '').trim(), margin, obsY + 10, { maxWidth: pageWidth - (margin * 2) });
      }

      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text(`Documento gerado em ${new Date().toLocaleString('pt-BR')}`, margin, doc.internal.pageSize.height - 10);

      doc.save(`Ficha_Prof_${teacher.name.replace(/\s+/g, '_')}.pdf`);
    } catch (error) {
      console.error('Error generating teacher PDF:', error);
      alert('Erro ao gerar PDF do professor');
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const PrintableTeacher = () => {
    if (!selectedTeacher) return null;
    
    // Get subject names
    const teacherSubjects = subjects
      .filter(s => selectedTeacher.subject_ids?.includes(s.id))
      .map(s => s.name)
      .join(', ');

    return (
      <div id="printable-teacher-record" className="hidden print:block text-black bg-white overflow-visible font-sans leading-tight relative w-full h-[285mm] mx-auto">
        <div className="w-full max-w-[210mm] mx-auto bg-white p-8 flex flex-col h-full">
          {/* Institutional Header */}
          <div className="flex items-center gap-6 mb-6 pb-2 border-b-2 border-black">
            <div className="flex-shrink-0 w-24 h-24 flex items-center justify-center">
              {inst?.logo_url ? (
                <img src={inst.logo_url} className="w-full h-full object-contain max-h-24" referrerPolicy="no-referrer" alt="Logo" />
              ) : (
                <div className="w-full h-full border-2 border-slate-200 border-dashed flex flex-col items-center justify-center text-[8pt] text-slate-300 font-black uppercase">
                  <span className="leading-none">SEM</span>
                  <span className="leading-none">LOGO</span>
                </div>
              )}
            </div>
            <div className="flex-1 flex flex-col">
              <p className="text-[11pt] font-semibold tracking-widest text-slate-800 leading-tight">DIOCESE DE GUARULHOS</p>
              <h1 className="text-[19pt] font-black uppercase tracking-tight text-black leading-tight my-0.5">
                {inst?.name || 'ESCOLA DIOCESANA DE MINISTÉRIOS'}
              </h1>
              <p className="text-[12pt] font-bold text-slate-700 tracking-wide mt-1 uppercase">
                {inst?.subtitle || 'PE. JOSÉ FERNANDO DE BRITO'}
              </p>
            </div>
          </div>

          <div className="text-center mb-4">
            <h2 className="text-[16pt] font-bold uppercase tracking-widest w-fit mx-auto pb-0.5 border-b-2 border-black">Ficha do Professor</h2>
          </div>

          {/* TOP CONTROL BOXES - Matching Student Record Style */}
          <div className="grid grid-cols-12 gap-3 mb-6">
            <div className="col-span-4 border border-black/40 p-3 flex flex-col h-32 justify-between">
              <p className="text-[10pt] font-bold border-b border-black/10 pb-1 uppercase tracking-tight">Controle</p>
              <div className="text-center space-y-1">
                <p className="text-[8pt] font-bold uppercase opacity-50">Código Registro</p>
                <div className="bg-slate-50 border border-black/10 h-12 flex items-center justify-center font-bold text-[18pt]">
                  {selectedTeacher.code}
                </div>
              </div>
            </div>

            <div className="col-span-5 border border-black/40 p-3 h-32">
              <p className="text-[10pt] font-bold mb-3 uppercase border-b border-black/10 pb-1 tracking-tight">Disciplinas:</p>
              <div className="overflow-y-auto h-20 pr-1 custom-scrollbar-mini">
                <p className="text-[9pt] font-bold leading-tight uppercase text-blue-900">
                  {teacherSubjects || 'NENHUMA SELECIONADA'}
                </p>
              </div>
            </div>

            <div className="col-span-3 border border-black/40 p-3 flex flex-col justify-between items-center bg-white h-32">
              <p className="text-[8pt] font-bold uppercase opacity-50 text-center">Situação</p>
              <div className={cn(
                "w-full py-2 text-center font-black text-[12pt] uppercase rounded",
                selectedTeacher.status === 'Ativo' ? "bg-green-100 text-green-800" : "bg-slate-100 text-slate-800"
              )}>
                {selectedTeacher.status}
              </div>
              <div className="w-full text-[7pt] text-center font-bold opacity-30 mt-1">Status Atual</div>
            </div>
          </div>

          {/* Teacher Detailed Info */}
          <div className="border border-black/40 p-6 rounded-sm space-y-6">
            <div className="grid grid-cols-1 gap-6">
              <div className="space-y-1">
                <p className="text-[9pt] font-bold text-slate-500 uppercase tracking-tighter">Nome Completo do Professor</p>
                <p className="text-[14pt] font-black uppercase border-b border-black/20 pb-1">{selectedTeacher.name}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-8">
              <div className="space-y-1">
                <p className="text-[9pt] font-bold text-slate-500 uppercase tracking-tighter">CPF</p>
                <p className="text-[11pt] font-bold border-b border-black/20 pb-1">{selectedTeacher.cpf || '---'}</p>
              </div>
              <div className="space-y-1">
                <p className="text-[9pt] font-bold text-slate-500 uppercase tracking-tighter">RG</p>
                <p className="text-[11pt] font-bold border-b border-black/20 pb-1">{selectedTeacher.rg || '---'}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-8">
              <div className="space-y-1">
                <p className="text-[9pt] font-bold text-slate-500 uppercase tracking-tighter">E-mail</p>
                <p className="text-[11pt] font-bold border-b border-black/20 pb-1 lowercase">{selectedTeacher.email || '---'}</p>
              </div>
              <div className="space-y-1">
                <p className="text-[9pt] font-bold text-slate-500 uppercase tracking-tighter">Celular</p>
                <p className="text-[11pt] font-bold border-b border-black/20 pb-1">{selectedTeacher.phone_mobile || '---'}</p>
              </div>
            </div>

            <div className="space-y-1">
              <p className="text-[9pt] font-bold text-slate-500 uppercase tracking-tighter">Endereço Residencial</p>
              <p className="text-[11pt] font-bold border-b border-black/20 pb-1">
                {selectedTeacher.address_street || '---'}{selectedTeacher.address_zip ? `, CEP: ${selectedTeacher.address_zip}` : ''}
              </p>
            </div>

            <div className="grid grid-cols-3 gap-8">
              <div className="col-span-2 space-y-1">
                <p className="text-[9pt] font-bold text-slate-500 uppercase tracking-tighter">Cidade</p>
                <p className="text-[11pt] font-bold border-b border-black/20 pb-1">{selectedTeacher.address_city || '---'}</p>
              </div>
              <div className="space-y-1">
                <p className="text-[9pt] font-bold text-slate-500 uppercase tracking-tighter">Estado (UF)</p>
                <p className="text-[11pt] font-bold border-b border-black/20 pb-1 uppercase">{selectedTeacher.address_state || '---'}</p>
              </div>
            </div>

            {selectedTeacher.observations && (
              <div className="space-y-1 pt-4">
                <p className="text-[9pt] font-bold text-slate-500 uppercase tracking-tighter">Observações Gerais</p>
                <div className="text-[10pt] font-medium border border-black/10 p-4 rounded bg-slate-50/20 whitespace-pre-wrap leading-relaxed min-h-[100px]">
                  {selectedTeacher.observations.replace(/\[SUBJECTS:.+?\]/, '').trim()}
                </div>
              </div>
            )}
          </div>

          {/* Institutional Footer */}
          <div className="mt-auto border-t-2 border-black pt-3 flex justify-between items-start text-[8.5pt] font-black text-black uppercase tracking-tight mb-2">
            <div className="flex-1 space-y-1">
              <p className="leading-none text-[9pt]">
                {inst?.address}
              </p>
              {(inst?.cep || inst?.city_uf) && (
                <p className="leading-none text-[9pt]">
                  {inst?.cep ? `CEP: ${inst.cep}` : ''} {inst?.city_uf ? ` - ${inst.city_uf}` : ''}
                </p>
              )}
              <div className="flex items-center gap-4 leading-none font-bold text-[9pt]">
                {inst?.phone && (
                  <span className="flex items-center gap-1.5">
                    TEL: {inst.phone}
                    <svg viewBox="0 0 24 24" width="12" height="12" fill="#25D366" className="shrink-0">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L0 24l6.335-1.662c1.72.937 3.659 1.43 5.623 1.43h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                    </svg>
                  </span>
                )}
                {inst?.phone && inst?.email && <span className="opacity-30">|</span>}
                {inst?.email && (
                  <span className="flex items-center gap-1">
                    EMAIL: <span className="lowercase font-bold">{inst.email}</span>
                  </span>
                )}
              </div>
            </div>
            {inst?.secretary && (
              <div className="text-right max-w-[450px] leading-tight text-black font-black uppercase text-[8pt]">
                <p className="whitespace-pre-line underline underline-offset-2 mb-1">Atendimento Secretaria:</p>
                <p className="whitespace-pre-line lowercase font-bold text-[8.5pt]">{inst.secretary}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const filteredTeachers = React.useMemo(() => {
    return teachers.filter(t => {
      const matchesSearch = t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.code.includes(searchTerm) ||
        t.cpf?.includes(searchTerm);
      
      const matchesStatus = statusFilter === 'Todos' || (t.status || 'Ativo') === statusFilter;
      
      return matchesSearch && matchesStatus;
    });
  }, [teachers, searchTerm, statusFilter]);

  return (
    <div className="h-[calc(100vh-8rem)] flex gap-2">
      {/* Sidebar List */}
      <div className="w-[432px] bg-white rounded-3xl shadow-sm border border-slate-100 flex flex-col overflow-hidden order-last">
        <div className="p-4 border-b border-slate-50 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-[#131b2e]">Professores</h2>
            <div className="flex gap-2">
              <div className="px-2 py-1 bg-blue-50 text-blue-700 text-[10px] font-black rounded-lg border border-blue-100 flex items-center">
                {teachers.length}
              </div>
              <button 
                onClick={generateTeacherListPDF}
                className="p-1.5 bg-slate-50 text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
                title="Imprimir Listagem"
              >
                <Printer size={18} />
              </button>
              <button 
                onClick={handleNew}
                className="p-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors"
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
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
          <div className="flex bg-slate-50 p-1 rounded-xl">
            {(['Ativo', 'Inativo', 'Todos'] as const).map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={cn(
                  "flex-1 py-1.5 text-[10px] font-bold rounded-lg transition-all",
                  statusFilter === status 
                    ? "bg-white text-blue-600 shadow-sm" 
                    : "text-slate-500 hover:text-slate-700"
                )}
              >
                {status}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="animate-spin text-blue-500" />
            </div>
          ) : filteredTeachers.map((teacher) => (
            <TeacherItem
              key={teacher.id}
              teacher={teacher}
              isSelected={selectedTeacher?.id === teacher.id}
              onSelect={handleSelectTeacher}
            />
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 bg-white rounded-3xl shadow-sm border border-slate-100 flex flex-col overflow-hidden">
        {selectedTeacher || isEditing ? (
          <>
            <div className="p-4 border-b border-slate-50 bg-slate-50/50">
              <div className="max-w-4xl mx-auto flex items-center justify-between">
                <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-white shadow-sm flex items-center justify-center text-blue-600">
                  <UserIcon size={32} />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-[#131b2e]">
                    {isEditing ? (selectedTeacher ? 'Editar Professor' : 'Novo Professor') : formData.name}
                  </h3>
                  <p className="text-sm text-slate-500">Código: {formData.code}</p>
                </div>
              </div>
              <div className="flex gap-3">
                {!isEditing && selectedTeacher && (
                  <button 
                    onClick={handlePrint}
                    className="px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl text-sm font-bold hover:bg-slate-50 transition-all flex items-center gap-2"
                  >
                    <Printer size={16} />
                    Imprimir
                  </button>
                )}
                {!isEditing && selectedTeacher && (
                  <button 
                    onClick={() => generateTeacherPDF(selectedTeacher)}
                    className="px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl text-sm font-bold hover:bg-slate-50 transition-all flex items-center gap-2"
                  >
                    <FileText size={16} />
                    Gerar PDF
                  </button>
                )}
                {!isEditing && selectedTeacher && (
                  <button 
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setShowDeleteConfirm(true);
                    }}
                    className="p-3 text-red-500 hover:bg-red-50 rounded-xl transition-all cursor-pointer flex items-center justify-center group"
                    title="Excluir Professor"
                  >
                    <Trash2 size={20} className="group-hover:scale-110 transition-transform" />
                  </button>
                )}
                {isEditing ? (
                  <>
                    <button 
                      onClick={() => setIsEditing(false)}
                      className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl text-sm font-bold transition-all"
                    >
                      Cancelar
                    </button>
                    <button 
                      onClick={handleSave}
                      className="px-6 py-2 bg-[#00174b] text-white rounded-xl text-sm font-bold hover:scale-[1.02] active:scale-95 transition-all shadow-lg"
                    >
                      Salvar Professor
                    </button>
                  </>
                ) : (
                  <div className="flex gap-2">
                    <button 
                      onClick={() => setIsEditing(true)}
                      className="px-6 py-2 bg-white border border-slate-200 text-[#131b2e] rounded-xl text-sm font-bold hover:bg-slate-50 transition-all flex items-center gap-2"
                    >
                      <Edit2 size={16} />
                      Editar Cadastro
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
              <div className="max-w-4xl mx-auto space-y-4">
                {/* Basic Info */}
                <section className="space-y-3">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <UserIcon size={14} />
                    Informações Básicas
                  </h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-700">Nome Completo</label>
                      <input 
                        type="text"
                        disabled={!isEditing}
                        value={formData.name || ''}
                        onChange={(e) => setFormData({...formData, name: e.target.value})}
                        onKeyDown={handleKeyDown}
                        className="w-full px-4 py-2 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60"
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
                        className="w-full px-4 py-2 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60"
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
                        className="w-full px-4 py-2 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60"
                        placeholder="000.000.000-00"
                        tabIndex={3}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-700">RG</label>
                      <input 
                        type="text"
                        disabled={!isEditing}
                        value={formData.rg || ''}
                        onChange={(e) => setFormData({...formData, rg: maskRG(e.target.value)})}
                        onKeyDown={handleKeyDown}
                        className="w-full px-4 py-2 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60"
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
                        className="w-full px-4 py-2 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60"
                        tabIndex={11}
                      >
                        <option value="Ativo">Ativo</option>
                        <option value="Inativo">Inativo</option>
                      </select>
                    </div>
                  </div>
                </section>

                {/* Contact & Address */}
                <section className="space-y-3">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <MapPin size={14} />
                    Endereço e Contato
                  </h4>
                  <div className="grid grid-cols-12 gap-3">
                    <div className="col-span-8 space-y-1">
                      <label className="text-xs font-bold text-slate-700">Logradouro (Rua, Av, etc)</label>
                      <input 
                        type="text"
                        disabled={!isEditing}
                        value={formData.address_street || ''}
                        onChange={(e) => setFormData({...formData, address_street: e.target.value})}
                        onKeyDown={handleKeyDown}
                        className="w-full px-4 py-2 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60"
                        tabIndex={5}
                      />
                    </div>
                    <div className="col-span-4 space-y-1">
                      <label className="text-xs font-bold text-slate-700">CEP</label>
                      <input 
                        type="text"
                        disabled={!isEditing}
                        value={formData.address_zip || ''}
                        onChange={(e) => setFormData({...formData, address_zip: maskCEP(e.target.value)})}
                        onKeyDown={handleKeyDown}
                        className="w-full px-4 py-2 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60"
                        placeholder="00000-000"
                        tabIndex={6}
                      />
                    </div>
                    <div className="col-span-5 space-y-1">
                      <label className="text-xs font-bold text-slate-700">Cidade</label>
                      <input 
                        type="text"
                        disabled={!isEditing}
                        value={formData.address_city || ''}
                        onChange={(e) => setFormData({...formData, address_city: e.target.value})}
                        onKeyDown={handleKeyDown}
                        className="w-full px-4 py-2 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60"
                        tabIndex={7}
                      />
                    </div>
                    <div className="col-span-2 space-y-1">
                      <label className="text-xs font-bold text-slate-700">UF</label>
                      <input 
                        type="text"
                        disabled={!isEditing}
                        value={formData.address_state || ''}
                        onChange={(e) => setFormData({...formData, address_state: e.target.value})}
                        onKeyDown={handleKeyDown}
                        className="w-full px-4 py-2 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60"
                        tabIndex={8}
                      />
                    </div>
                    <div className="col-span-5 space-y-1">
                      <label className="text-xs font-bold text-slate-700">Celular</label>
                      <div className="relative">
                        <input 
                          type="text"
                          disabled={!isEditing}
                          value={formData.phone_mobile || ''}
                          onChange={(e) => setFormData({...formData, phone_mobile: maskPhone(e.target.value)})}
                          onKeyDown={handleKeyDown}
                          className="w-full px-4 py-2 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60 pr-10"
                          placeholder="(00) 00000-0000"
                          tabIndex={9}
                        />
                        <button
                          type="button"
                          disabled={!isEditing}
                          onClick={() => setFormData({ ...formData, phone_mobile_is_whatsapp: !formData.phone_mobile_is_whatsapp })}
                          className={cn(
                            "absolute right-3 top-1/2 -translate-y-1/2 transition-all p-1 rounded-md",
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
                    value={(formData.observations || '').replace(/\[SUBJECTS:.+?\]/, '').trim()}
                    onChange={(e) => setFormData({...formData, observations: e.target.value})}
                    onKeyDown={handleKeyDown}
                    rows={4}
                    className="w-full px-4 py-2 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60 resize-none"
                    tabIndex={10}
                  />
                </section>

                {/* Subjects Selection */}
                <section className="space-y-3">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <BookOpen size={14} />
                    Disciplinas Lecionadas
                  </h4>
                  <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
                    {subjects.length === 0 ? (
                      <p className="text-xs text-slate-500 py-4 text-center">Nenhuma disciplina cadastrada no sistema.</p>
                    ) : (
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                        {subjects.filter(s => s.status === 'Ativo' || (formData.subject_ids || []).includes(s.id)).map((subject) => (
                          <label 
                            key={subject.id}
                            className={cn(
                              "flex items-center gap-2 p-2 rounded-xl cursor-pointer transition-all border border-transparent",
                              (formData.subject_ids || []).includes(subject.id) 
                                ? "bg-blue-50 border-blue-100 text-blue-700" 
                                : "hover:bg-white hover:border-slate-200 text-slate-600",
                              !isEditing && "cursor-default opacity-80"
                            )}
                          >
                            <input 
                              type="checkbox"
                              disabled={!isEditing}
                              checked={(formData.subject_ids || []).includes(subject.id)}
                              onChange={(e) => {
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
                              "w-4 h-4 rounded border flex items-center justify-center transition-all",
                              (formData.subject_ids || []).includes(subject.id)
                                ? "bg-blue-600 border-blue-600 text-white"
                                : "bg-white border-slate-300"
                            )}>
                              {(formData.subject_ids || []).includes(subject.id) && <Plus size={10} className="stroke-[4]" />}
                            </div>
                            <div className="min-w-0">
                              <p className="text-[10px] font-bold truncate">{subject.name}</p>
                              <p className="text-[8px] text-slate-400 font-mono tracking-tighter">{subject.code}</p>
                            </div>
                          </label>
                        ))}
                      </div>
                    )}
                    {!isEditing && (formData.subject_ids || []).length === 0 && (
                      <p className="text-xs text-slate-400 italic">Professor sem disciplinas vinculadas.</p>
                    )}
                  </div>
                </section>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 space-y-4">
            <div className="w-20 h-20 bg-slate-50 rounded-3xl flex items-center justify-center">
              <UserIcon size={40} />
            </div>
            <p className="text-sm font-medium">Selecione um professor para ver os detalhes</p>
          </div>
        )}
      </div>
      <PrintableTeacher />

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && selectedTeacher && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-sm w-full space-y-6 animate-in zoom-in-95 duration-200">
            <div className="w-16 h-16 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mx-auto">
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
                className="flex-1 px-4 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold text-sm hover:bg-slate-200 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                disabled={loading}
                className="flex-1 px-4 py-3 bg-red-600 text-white rounded-xl font-bold text-sm hover:bg-red-700 transition-colors shadow-lg shadow-red-200 disabled:opacity-50"
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
          "fixed bottom-8 left-1/2 -translate-x-1/2 px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-bottom-5 z-[300]",
          notification.type === 'success' ? "bg-emerald-600 text-white" : "bg-red-600 text-white"
        )}>
          {notification.type === 'success' ? <Loader2 className="animate-spin" size={20} /> : <X size={20} />}
          <span className="font-bold text-sm tracking-wide">{notification.message}</span>
        </div>
      )}
    </div>
  );
}
