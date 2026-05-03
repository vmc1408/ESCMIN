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
  Plus
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatCurrency, cn } from '../lib/utils';
import { fetchAll, saveData, deleteData, archiveRecord, restoreRecord } from '../lib/database';
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
  created_at: string;
  user_id: string;
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
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'Ativo' | 'Inativo' | 'Todos'>('Ativo');
  const [isArchivedMode, setIsArchivedMode] = useState(false);
  const [selectedTeacher, setSelectedTeacher] = useState<Teacher | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<Partial<Teacher>>({});
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error', message: string } | null>(null);

  const fetchTeachers = React.useCallback(async () => {
    setLoading(true);
    try {
      const table = isArchivedMode ? 'archived_teachers' : 'teachers';
      const data = await fetchAll(table, '*', 'name', true);
      setTeachers(data || []);
      if (data && data.length > 0 && !selectedTeacher) {
        setSelectedTeacher(data[0]);
        setFormData(data[0]);
      }
    } catch (error) {
      console.error('Error fetching teachers:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedTeacher, isArchivedMode]);

  const handleArchiveTeacher = async (id: string) => {
    if (!window.confirm('Deseja mover este professor para o Arquivo Morto?')) return;
    try {
      setLoading(true);
      await archiveRecord('teachers', id);
      setNotification({ type: 'success', message: 'Professor movido para o Arquivo Morto!' });
      setSelectedTeacher(null);
      fetchTeachers();
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleRestoreTeacher = async (id: string) => {
    if (!window.confirm('Deseja restaurar este professor do Arquivo Morto?')) return;
    try {
      setLoading(true);
      await restoreRecord('teachers', id);
      setNotification({ type: 'success', message: 'Professor restaurado com sucesso!' });
      setSelectedTeacher(null);
      fetchTeachers();
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTeachers();
  }, [fetchTeachers]);

  const handleSelectTeacher = React.useCallback((teacher: Teacher) => {
    setSelectedTeacher(teacher);
    setFormData(teacher);
    setIsEditing(false);
  }, []);

  const handleNew = () => {
    setSelectedTeacher(null);
    setFormData({
      name: '',
      code: String(teachers.length + 1).padStart(3, '0'),
      status: 'Ativo',
    });
    setIsEditing(true);
  };

  const handleSave = async () => {
    try {
      const dataToSave = { ...formData };
      
      // Try saving with all fields, fallback if column missing
      let savedId;
      try {
        savedId = await saveData('teachers', selectedTeacher?.id, dataToSave);
      } catch (err: any) {
        if (err.message?.includes('phone_mobile_is_whatsapp')) {
          console.warn('[Supabase] Coluna phone_mobile_is_whatsapp ausente em teachers, salvando sem ela.');
          const fallbackData = { ...dataToSave };
          delete (fallbackData as any).phone_mobile_is_whatsapp;
          savedId = await saveData('teachers', selectedTeacher?.id, fallbackData);
        } else {
          throw err;
        }
      }
      
      setNotification({ type: 'success', message: 'Ficha do professor salva com sucesso!' });
      setIsEditing(false);
      fetchTeachers();
      
      // Update local state
      if (!selectedTeacher?.id && savedId) {
        setSelectedTeacher({ ...dataToSave, id: savedId } as Teacher);
      } else {
        setSelectedTeacher({ ...dataToSave, id: selectedTeacher?.id } as Teacher);
      }
    } catch (error: any) {
      console.error('Error saving teacher:', error);
      setNotification({ type: 'error', message: 'Erro ao salvar professor: ' + error.message });
    } finally {
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
      const personalData = [
        ['Nome:', teacher.name],
        ['Situação:', teacher.status],
        ['CPF:', teacher.cpf || '---'],
        ['RG:', teacher.rg || '---'],
        ['E-mail:', teacher.email || '---']
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
        doc.text(teacher.observations, margin, obsY + 10, { maxWidth: pageWidth - (margin * 2) });
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
    <div className="h-[calc(100vh-8rem)] flex gap-6">
      {/* Sidebar List */}
      <div className="w-72 bg-white rounded-3xl shadow-sm border border-slate-100 flex flex-col overflow-hidden">
        <div className="p-4 border-b border-slate-50 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-[#131b2e]">Professores</h2>
            <div className="flex gap-2">
              <div className="px-2 py-1 bg-blue-50 text-blue-700 text-[10px] font-black rounded-lg border border-blue-100">
                {teachers.length}
              </div>
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
            <div className="p-6 border-b border-slate-50 flex items-center justify-between bg-slate-50/50">
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
                    {isArchivedMode ? (
                      <button 
                        onClick={() => handleRestoreTeacher(selectedTeacher!.id)}
                        className="px-6 py-2 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 transition-all flex items-center gap-2 shadow-lg active:scale-95"
                      >
                        <RotateCcw size={16} />
                        Restaurar Registro
                      </button>
                    ) : (
                      <>
                        {selectedTeacher?.status === 'Inativo' && (
                          <button 
                            onClick={() => handleArchiveTeacher(selectedTeacher!.id)}
                            className="px-6 py-2 bg-amber-600 text-white rounded-xl text-sm font-bold hover:bg-amber-700 transition-all flex items-center gap-2 shadow-lg active:scale-95"
                          >
                            <FileIcon size={16} />
                            Arquivar Registro
                          </button>
                        )}
                        <button 
                          onClick={() => setIsEditing(true)}
                          className="px-6 py-2 bg-white border border-slate-200 text-[#131b2e] rounded-xl text-sm font-bold hover:bg-slate-50 transition-all flex items-center gap-2"
                        >
                          <Edit2 size={16} />
                          Editar Cadastro
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-8">
              <div className="max-w-4xl space-y-8">
                {/* Basic Info */}
                <section className="space-y-4">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <UserIcon size={14} />
                    Informações Básicas
                  </h4>
                  <div className="grid grid-cols-2 gap-4">
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
                <section className="space-y-4">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <MapPin size={14} />
                    Endereço e Contato
                  </h4>
                  <div className="grid grid-cols-12 gap-4">
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
                <section className="space-y-4">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <FileText size={14} />
                    Observações
                  </h4>
                  <textarea 
                    disabled={!isEditing}
                    value={formData.observations || ''}
                    onChange={(e) => setFormData({...formData, observations: e.target.value})}
                    onKeyDown={handleKeyDown}
                    rows={4}
                    className="w-full px-4 py-2 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60 resize-none"
                    tabIndex={10}
                  />
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
