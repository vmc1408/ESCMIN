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
import { db, fetchAll, saveData, deleteData } from '../lib/database';
import { collection, addDoc, updateDoc, doc, query, limit, getDocs } from 'firebase/firestore';

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
  const [selectedTeacher, setSelectedTeacher] = useState<Teacher | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<Partial<Teacher>>({});
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    fetchTeachers();
  }, []);

  const fetchTeachers = React.useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchAll('teachers', '*', 'name', true);
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
  }, [selectedTeacher]);

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
      await saveData('teachers', selectedTeacher?.id, formData);
      
      setIsEditing(false);
      fetchTeachers();
    } catch (error: any) {
      console.error('Error saving teacher:', error);
      alert('Erro ao salvar professor: ' + error.message);
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
      
      const matchesStatus = statusFilter === 'Todos' || (t.status || 'Ativo') === statusFilter || (t.status === '' && statusFilter === 'Ativo');
      
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
                  <button 
                    onClick={() => setIsEditing(true)}
                    className="px-6 py-2 bg-white border border-slate-200 text-[#131b2e] rounded-xl text-sm font-bold hover:bg-slate-50 transition-all flex items-center gap-2"
                  >
                    <Edit2 size={16} />
                    Editar Cadastro
                  </button>
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
                      <input 
                        type="text"
                        disabled={!isEditing}
                        value={formData.phone_mobile || ''}
                        onChange={(e) => setFormData({...formData, phone_mobile: maskPhone(e.target.value)})}
                        onKeyDown={handleKeyDown}
                        className="w-full px-4 py-2 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60"
                        placeholder="(00) 00000-0000"
                        tabIndex={9}
                      />
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
    </div>
  );
}
