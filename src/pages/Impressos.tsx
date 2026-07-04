import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Printer, 
  Search, 
  FileText, 
  User, 
  Layers, 
  CreditCard, 
  FileCheck, 
  CalendarCheck,
  ShieldCheck,
  Loader2,
  ChevronRight,
  Info,
  Calendar,
  Phone,
  Mail,
  MapPin,
  HelpCircle
} from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { fetchAll } from '../lib/database';
import { Student, Class } from '../types';
import { financialService } from '../services/financialService';
import { cn, formatDateForDisplay } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

type PrintType = 'declaracao' | 'ficha' | 'carteirinhas' | 'diario' | 'quitacao';

export function Impressos() {
  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [institution, setInstitution] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Selector / Filter States
  const [selectedType, setSelectedType] = useState<PrintType>('declaracao');
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [studentSearch, setStudentSearch] = useState('');
  
  // Customization fields
  const [customText, setCustomText] = useState('');
  const [signerRole, setSignerRole] = useState<'diretor' | 'secretario' | 'ambos'>('secretario');
  const [signerName, setSignerName] = useState('');
  const [signerTitle, setSignerTitle] = useState('Secretário Acadêmico');
  const [coSignerName, setCoSignerName] = useState('');
  const [coSignerTitle, setCoSignerTitle] = useState('Diretor Geral');
  const [showPhotoBorder, setShowPhotoBorder] = useState(true);
  const [isFormFilled, setIsFormFilled] = useState(true);

  // Load Initial Data
  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const [studs, clss, instSettings] = await Promise.all([
          fetchAll('students', '*', 'name'),
          fetchAll('classes', '*', 'name'),
          financialService.getInstitutionSettings()
        ]);
        
        setStudents(studs || []);
        
        // Normalize classes (subject_ids handling)
        const normalizedClasses = (clss || []).map((cls: Class) => {
          let normalized = { ...cls };
          let sIds: string[] = [];
          if (Array.isArray((normalized as any).subject_ids)) {
            sIds = (normalized as any).subject_ids;
          } else if (typeof (normalized as any).subject_ids === 'string') {
            try {
              const parsed = JSON.parse((normalized as any).subject_ids);
              sIds = Array.isArray(parsed) ? parsed : [parsed];
            } catch (e) {
              sIds = (normalized as any).subject_ids ? [(normalized as any).subject_ids] : [];
            }
          }
          normalized.subject_ids = sIds;
          return normalized;
        });
        
        setClasses(normalizedClasses);
        setInstitution(instSettings || null);
        
        // Pick first student/class as default
        if (studs && studs.length > 0) {
          // Sort active students first
          const activeOnes = studs.filter(s => s.status === 'Ativo');
          if (activeOnes.length > 0) {
            setSelectedStudentId(activeOnes[0].id);
          } else {
            setSelectedStudentId(studs[0].id);
          }
        }
        if (clss && clss.length > 0) {
          setSelectedClassId(clss[0].id);
        }
      } catch (err) {
        console.error("Erro ao carregar dados para impressos:", err);
      } finally {
        setLoading(false);
      }
    }
    
    loadData();
  }, []);

  // Update signer default titles based on selection
  useEffect(() => {
    if (signerRole === 'secretario') {
      setSignerTitle('Secretário Acadêmico');
    } else if (signerRole === 'diretor') {
      setSignerTitle('Diretor Geral');
    }
  }, [signerRole]);

  // Derived filtered students list for dropdowns/search
  const filteredStudents = useMemo(() => {
    if (!studentSearch) return students;
    return students.filter(s => 
      s.name.toLowerCase().includes(studentSearch.toLowerCase()) ||
      (s.registration_number && s.registration_number.toLowerCase().includes(studentSearch.toLowerCase()))
    );
  }, [students, studentSearch]);

  const activeStudent = useMemo(() => {
    return students.find(s => s.id === selectedStudentId) || null;
  }, [students, selectedStudentId]);

  const activeClass = useMemo(() => {
    return classes.find(c => c.id === selectedClassId) || null;
  }, [classes, selectedClassId]);

  // Students enrolled in selected class
  const classStudents = useMemo(() => {
    if (!selectedClassId) return [];
    return students.filter(s => s.class_id === selectedClassId);
  }, [students, selectedClassId]);

  // Handle standard document print trigger
  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  const formatLongDate = (dateString: string) => {
    if (!dateString) return '';
    try {
      const cleanDate = dateString.split('T')[0];
      const parts = cleanDate.split('-');
      if (parts.length === 3) {
        const year = parts[0];
        const monthIndex = parseInt(parts[1], 10) - 1;
        const day = parseInt(parts[2], 10);
        const months = [
          'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
          'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
        ];
        return `${day < 10 ? '0' + day : day} de ${months[monthIndex]} de ${year}`;
      }
      return dateString;
    } catch {
      return dateString;
    }
  };

  const getInstitutionLogoText = () => {
    return institution?.name?.substring(0, 3).toUpperCase() || 'EFC';
  };

  if (loading) {
    return (
      <div className="min-h-[400px] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-slate-500 font-bold uppercase tracking-widest text-[10px]">
          <Loader2 className="animate-spin text-slate-400" size={24} />
          <span>Carregando Modelos de Impressão...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="relative font-sans text-slate-800 pb-12">
      {/* Dynamic print-only style sheet to format printed pages */}
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          body {
            background-color: #fff !important;
            color: #000 !important;
            font-family: 'Georgia', 'Times New Roman', serif !important;
          }
          nav, sidebar, .print\\:hidden, header, footer, button, select, input, textarea, .PageHeader {
            display: none !important;
          }
          main, .main-content-parent, #root, .App-container {
            padding: 0 !important;
            margin: 0 !important;
            background: none !important;
            border: none !important;
          }
          .print-preview-container {
            border: none !important;
            box-shadow: none !important;
            padding: 0 !important;
            margin: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
            background: #fff !important;
          }
          .print-page-break {
            page-break-after: always !important;
          }
          /* Custom overrides for crisp monochrome printing */
          .text-slate-900, .text-slate-800, .text-slate-700, .text-slate-600 {
            color: #000 !important;
          }
          .border-slate-100, .border-slate-200, .border-dashed {
            border-color: #333 !important;
          }
          .bg-slate-50, .bg-slate-100 {
            background-color: transparent !important;
          }
        }
      `}} />

      {/* Page Title */}
      <PageHeader 
        title="Documentos e Impressos" 
        description="Emissão e impressão direta de declarações, fichas de matrículas, carteirinhas de estudantes e diários." 
        icon={Printer}
        badge="Impressos"
      >
        <button
          onClick={handlePrint}
          className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-[10px] uppercase tracking-widest transition-all flex items-center gap-1.5 active:scale-95 shadow-md shadow-blue-600/10"
        >
          <Printer size={13} />
          Imprimir Documento
        </button>
      </PageHeader>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Control Column (35%) */}
        <div className="lg:col-span-4 space-y-6 print:hidden">
          {/* Section Selector */}
          <div className="bg-white border border-slate-200 p-5 space-y-3">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Modelos Disponíveis</h3>
            <div className="space-y-1.5">
              <button
                onClick={() => setSelectedType('declaracao')}
                className={cn(
                  "w-full px-4 py-3 flex items-center gap-3 transition-all text-left",
                  selectedType === 'declaracao' 
                    ? "bg-slate-900 text-white shadow-sm font-bold" 
                    : "bg-slate-50 text-slate-700 hover:bg-slate-100 font-semibold"
                )}
              >
                <FileCheck size={16} className={cn(selectedType === 'declaracao' ? "text-blue-450" : "text-slate-400")} />
                <span className="text-[11px] uppercase tracking-wider">Declaração de Matrícula</span>
              </button>

              <button
                onClick={() => setSelectedType('ficha')}
                className={cn(
                  "w-full px-4 py-3 flex items-center gap-3 transition-all text-left",
                  selectedType === 'ficha' 
                    ? "bg-slate-900 text-white shadow-sm font-bold" 
                    : "bg-slate-50 text-slate-700 hover:bg-slate-100 font-semibold"
                )}
              >
                <User size={16} className={cn(selectedType === 'ficha' ? "text-blue-450" : "text-slate-400")} />
                <span className="text-[11px] uppercase tracking-wider">Ficha de Matrícula (Cadastral)</span>
              </button>

              <button
                onClick={() => setSelectedType('carteirinhas')}
                className={cn(
                  "w-full px-4 py-3 flex items-center gap-3 transition-all text-left",
                  selectedType === 'carteirinhas' 
                    ? "bg-slate-900 text-white shadow-sm font-bold" 
                    : "bg-slate-50 text-slate-700 hover:bg-slate-100 font-semibold"
                )}
              >
                <CreditCard size={16} className={cn(selectedType === 'carteirinhas' ? "text-blue-450" : "text-slate-400")} />
                <span className="text-[11px] uppercase tracking-wider">Carteirinhas do Aluno</span>
              </button>

              <button
                onClick={() => setSelectedType('diario')}
                className={cn(
                  "w-full px-4 py-3 flex items-center gap-3 transition-all text-left",
                  selectedType === 'diario' 
                    ? "bg-slate-900 text-white shadow-sm font-bold" 
                    : "bg-slate-50 text-slate-700 hover:bg-slate-100 font-semibold"
                )}
              >
                <CalendarCheck size={16} className={cn(selectedType === 'diario' ? "text-blue-450" : "text-slate-400")} />
                <span className="text-[11px] uppercase tracking-wider">Lista / Diário de Presença</span>
              </button>

              <button
                onClick={() => setSelectedType('quitacao')}
                className={cn(
                  "w-full px-4 py-3 flex items-center gap-3 transition-all text-left",
                  selectedType === 'quitacao' 
                    ? "bg-slate-900 text-white shadow-sm font-bold" 
                    : "bg-slate-50 text-slate-700 hover:bg-slate-100 font-semibold"
                )}
              >
                <ShieldCheck size={16} className={cn(selectedType === 'quitacao' ? "text-blue-450" : "text-slate-400")} />
                <span className="text-[11px] uppercase tracking-wider">Certidão de Quitação Financeira</span>
              </button>
            </div>
          </div>

          {/* Context-Based Selector (Student or Class) */}
          <div className="bg-white border border-slate-200 p-5 space-y-4">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Configurações do Documento</h3>
            
            {/* Student Search & Select (Applicable for Declaracao, Ficha, Quitacao) */}
            {(selectedType === 'declaracao' || selectedType === 'ficha' || selectedType === 'quitacao') && (
              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Pesquisar Aluno</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={13} />
                    <input 
                      type="text"
                      placeholder="NOME OU MATRÍCULA..."
                      value={studentSearch}
                      onChange={(e) => setStudentSearch(e.target.value)}
                      className="w-full pl-8 pr-4 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold uppercase focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Selecionar Aluno *</label>
                  <select
                    value={selectedStudentId}
                    onChange={(e) => setSelectedStudentId(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-semibold focus:outline-none focus:border-blue-500 uppercase bg-slate-50"
                  >
                    {filteredStudents.length === 0 ? (
                      <option value="">Nenhum aluno encontrado</option>
                    ) : (
                      filteredStudents.map(s => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.registration_number || 'S/ RA'})
                        </option>
                      ))
                    )}
                  </select>
                </div>
              </div>
            )}

            {/* Class Selector (Applicable for Carteirinhas, Diario) */}
            {(selectedType === 'carteirinhas' || selectedType === 'diario') && (
              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Selecionar Turma/Classe</label>
                  <select
                    value={selectedClassId}
                    onChange={(e) => setSelectedClassId(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-semibold focus:outline-none focus:border-blue-500 uppercase bg-slate-50"
                  >
                    {classes.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {/* Additional custom fields for Declaracao / Quitacao */}
            {selectedType === 'declaracao' && (
              <div className="space-y-3 pt-2 border-t border-slate-150">
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Observação / Adendo Customizado</label>
                  <textarea 
                    placeholder="Adicione qualquer texto extra que deva constar no corpo da declaração..."
                    rows={3}
                    value={customText}
                    onChange={(e) => setCustomText(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-[11px] font-medium focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Quem Assina?</label>
                  <select
                    value={signerRole}
                    onChange={(e) => setSignerRole(e.target.value as any)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-semibold focus:outline-none"
                  >
                    <option value="secretario">Apenas Secretário Acadêmico</option>
                    <option value="diretor">Apenas Diretor Acadêmico</option>
                    <option value="ambos">Ambos (Secretário e Diretor)</option>
                  </select>
                </div>

                <div className="space-y-2.5">
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Nome do Assinante 1</label>
                    <input 
                      type="text"
                      placeholder="Nome completo..."
                      value={signerName}
                      onChange={(e) => setSignerName(e.target.value)}
                      className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Cargo do Assinante 1</label>
                    <input 
                      type="text"
                      value={signerTitle}
                      onChange={(e) => setSignerTitle(e.target.value)}
                      className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold"
                    />
                  </div>

                  {signerRole === 'ambos' && (
                    <>
                      <div className="space-y-1 pt-1 border-t border-slate-100">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Nome do Assinante 2</label>
                        <input 
                          type="text"
                          placeholder="Nome completo Assinante 2..."
                          value={coSignerName}
                          onChange={(e) => setCoSignerName(e.target.value)}
                          className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Cargo do Assinante 2</label>
                        <input 
                          type="text"
                          value={coSignerTitle}
                          onChange={(e) => setCoSignerTitle(e.target.value)}
                          className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold"
                        />
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Customization options for Student ID Cards */}
            {selectedType === 'carteirinhas' && (
              <div className="space-y-3 pt-2 border-t border-slate-150">
                <div className="flex items-center justify-between">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Exibir Borda de Foto?</label>
                  <input 
                    type="checkbox"
                    checked={showPhotoBorder}
                    onChange={(e) => setShowPhotoBorder(e.target.checked)}
                    className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Cartão Pré-Preenchido?</label>
                  <input 
                    type="checkbox"
                    checked={isFormFilled}
                    onChange={(e) => setIsFormFilled(e.target.checked)}
                    className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                  />
                </div>
              </div>
            )}

            {/* Quitacao options */}
            {selectedType === 'quitacao' && (
              <div className="space-y-3 pt-2 border-t border-slate-150">
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Responsável Assinatura</label>
                  <input 
                    type="text"
                    placeholder="Nome do Secretário ou Tesoureiro..."
                    value={signerName}
                    onChange={(e) => setSignerName(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Título Cargo</label>
                  <input 
                    type="text"
                    value={signerTitle}
                    onChange={(e) => setSignerTitle(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="p-4 bg-amber-50 border border-amber-200 rounded-none flex items-start gap-3">
            <Info className="text-amber-600 shrink-0 mt-0.5" size={16} />
            <div className="space-y-1">
              <p className="text-[10px] font-bold text-amber-800 uppercase tracking-wider">Dica de Impressão</p>
              <p className="text-[10px] leading-relaxed text-amber-700 font-medium">
                Pressione <kbd className="bg-amber-100 px-1 border border-amber-300 font-mono font-black text-[9px]">CTRL + P</kbd> (ou clique no botão no topo) para imprimir. Certifique-se de ativar "Gráficos de plano de fundo" (Background Graphics) nas opções de sua impressora para melhores resultados visuais.
              </p>
            </div>
          </div>
        </div>

        {/* Right Preview Pane (80% / 8 columns) */}
        <div className="lg:col-span-8 space-y-4">
          <div className="flex items-center justify-between print:hidden">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Pré-Visualização do Documento (Formato A4)</h3>
            <span className="text-[9px] bg-slate-100 font-black text-slate-600 uppercase tracking-widest px-2 py-0.5 border border-slate-200">Papel A4 Real</span>
          </div>

          {/* Standard Page Container - Mocking A4 Sheet */}
          <div className="print-preview-container bg-white border border-slate-350 shadow-xl p-8 md:p-12 min-h-[1123px] max-w-[800px] mx-auto select-text relative">
            
            {/* Header of Official Documents */}
            {(selectedType === 'declaracao' || selectedType === 'quitacao' || selectedType === 'ficha') && (
              <div className="flex flex-col items-center text-center pb-8 border-b-2 border-slate-900 mb-8 space-y-2">
                <div className="w-12 h-12 border-2 border-black flex items-center justify-center font-black text-lg tracking-wider bg-slate-50">
                  {getInstitutionLogoText()}
                </div>
                <div className="space-y-0.5">
                  <h1 className="text-[16px] font-bold tracking-widest uppercase font-serif">
                    {institution?.name || 'ESCOLA DE FORMAÇÃO CONCILIAR'}
                  </h1>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider font-sans">
                    {institution?.cnpj ? `CNPJ: ${institution.cnpj}` : 'CNPJ: 00.000.000/0001-00'} | {institution?.city_uf || 'Catedral Geral / SP'}
                  </p>
                  <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-widest font-sans">
                    {institution?.address || 'Rua da Catedral, 100 - Centro'}
                  </p>
                </div>
              </div>
            )}

            {/* RENDER SELECTED DOCUMENT PATTERN */}

            {/* 1. DECLARAÇÃO DE MATRÍCULA */}
            {selectedType === 'declaracao' && (
              <div className="space-y-12">
                {activeStudent ? (
                  <>
                    {/* Title */}
                    <div className="text-center space-y-2 pt-6">
                      <h2 className="text-[20px] font-extrabold uppercase tracking-[0.2em] font-serif border-b-2 border-slate-950 pb-2 max-w-md mx-auto">
                        Declaração de Matrícula
                      </h2>
                      <p className="text-[10px] text-slate-400 tracking-widest uppercase font-sans">Matrícula Escolar Nº {activeStudent.registration_number}</p>
                    </div>

                    {/* Body */}
                    <div className="text-[13px] text-slate-800 leading-[2.2] text-justify font-serif space-y-6 pt-6">
                      <p>
                        Declaramos, para os devidos fins de direito e a quem possa interessar, que o(a) estudante 
                        <strong className="text-black font-extrabold text-[14px] uppercase tracking-wide"> {activeStudent.name}</strong>, 
                        inscrito(a) sob o registro geral de matrícula acadêmica número <strong>{activeStudent.registration_number || '---'}</strong>, 
                        portador(a) do CPF <strong>{activeStudent.cpf || 'Não Informado'}</strong> e RG <strong>{activeStudent.rg || 'Não Informado'}</strong>, 
                        encontra-se regularmente matriculado(a) e com frequência ativa nesta instituição de ensino no curso de 
                        <strong> {activeStudent.course || 'Teologia e Formação Ministerial'}</strong>.
                      </p>

                      <p>
                        O referido aluno está devidamente vinculado à classe <strong>{activeClass?.name || 'Turma Ativa'}</strong> correspondente ao ano letivo em exercício, frequentando regularmente as aulas com aproveitamento e assiduidade compatíveis às exigências canônicas e acadêmicas vigentes.
                      </p>

                      {customText && (
                        <p className="italic text-slate-700 bg-slate-50 p-4 border-l-4 border-slate-300 my-4 text-[12px] leading-relaxed">
                          {customText}
                        </p>
                      )}

                      <p className="pt-4">
                        Por ser a expressão da verdade, firmamos o presente documento para que produza seus devidos e legais efeitos.
                      </p>
                    </div>

                    {/* Location & Date */}
                    <div className="text-right pt-12 text-[12px] font-serif">
                      <p className="uppercase tracking-wide font-bold">
                        {institution?.city_uf || 'Catedral Geral'}, {formatLongDate(new Date().toISOString())}
                      </p>
                    </div>

                    {/* Signatures Footer */}
                    <div className="pt-24 flex items-end justify-around font-sans">
                      {signerRole !== 'diretor' && (
                        <div className="flex flex-col items-center gap-1.5 text-center">
                          <div className="w-56 border-b border-black" />
                          <p className="text-[11px] font-bold text-slate-900 uppercase tracking-widest">
                            {signerName || 'Nome do Assinante'}
                          </p>
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                            {signerTitle}
                          </p>
                        </div>
                      )}

                      {signerRole === 'ambos' && (
                        <div className="w-12 h-[1px] bg-transparent" />
                      )}

                      {signerRole !== 'secretario' && (
                        <div className="flex flex-col items-center gap-1.5 text-center">
                          <div className="w-56 border-b border-black" />
                          <p className="text-[11px] font-bold text-slate-900 uppercase tracking-widest">
                            {signerRole === 'ambos' ? (coSignerName || 'Nome do Diretor') : (signerName || 'Nome do Diretor')}
                          </p>
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                            {signerRole === 'ambos' ? coSignerTitle : signerTitle}
                          </p>
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="text-center py-20 text-slate-400 font-bold uppercase tracking-widest text-[10px]">
                    Nenhum aluno selecionado ou cadastrado no sistema.
                  </div>
                )}
              </div>
            )}


            {/* 2. FICHA DE MATRÍCULA (CADASTRAL) */}
            {selectedType === 'ficha' && (
              <div className="space-y-6 text-[10.5pt] leading-relaxed">
                {activeStudent ? (
                  <>
                    {/* Header Title */}
                    <div className="text-center border-b border-black pb-3 mb-4">
                      <h2 className="text-[13pt] font-extrabold uppercase tracking-widest">Ficha Cadastral de Matrícula</h2>
                      <p className="text-[8.5pt] text-slate-500 uppercase font-mono mt-0.5">RA: {activeStudent.registration_number || 'NÃO ATRIBUÍDO'} | Status: {activeStudent.status || 'ATIVO'}</p>
                    </div>

                    {/* Grid of details */}
                    <div className="border border-black divide-y divide-black font-sans">
                      
                      {/* Personal Block */}
                      <div className="p-3 bg-neutral-50/50">
                        <h3 className="font-bold uppercase text-[9pt] tracking-wider text-slate-600 mb-2">Dados Pessoais</h3>
                        <div className="grid grid-cols-12 gap-y-2.5 gap-x-4">
                          <div className="col-span-12 flex gap-1.5 border-b border-dashed border-black/15 pb-1">
                            <span className="font-bold text-slate-500 uppercase text-[8.5pt] w-24">Estudante:</span>
                            <span className="font-black uppercase text-slate-900 text-[10pt]">{activeStudent.name}</span>
                          </div>

                          <div className="col-span-6 flex gap-1.5">
                            <span className="font-bold text-slate-500 uppercase text-[8.5pt] w-24">Nascimento:</span>
                            <span className="font-semibold text-slate-900">{activeStudent.birth_date ? formatDateForDisplay(activeStudent.birth_date) : 'Não informado'}</span>
                          </div>
                          <div className="col-span-6 flex gap-1.5">
                            <span className="font-bold text-slate-500 uppercase text-[8.5pt] w-24">Ingresso:</span>
                            <span className="font-semibold text-slate-900">{activeStudent.start_date ? formatDateForDisplay(activeStudent.start_date) : 'Não informado'}</span>
                          </div>

                          <div className="col-span-6 flex gap-1.5">
                            <span className="font-bold text-slate-500 uppercase text-[8.5pt] w-24">CPF:</span>
                            <span className="font-mono font-bold text-slate-900">{activeStudent.cpf || 'Não Informado'}</span>
                          </div>
                          <div className="col-span-6 flex gap-1.5">
                            <span className="font-bold text-slate-500 uppercase text-[8.5pt] w-24">RG:</span>
                            <span className="font-mono font-semibold text-slate-900">{activeStudent.rg || 'Não Informado'}</span>
                          </div>

                          <div className="col-span-6 flex gap-1.5">
                            <span className="font-bold text-slate-500 uppercase text-[8.5pt] w-24">Curso:</span>
                            <span className="font-bold text-slate-900 uppercase">{activeStudent.course || 'Teologia'}</span>
                          </div>
                          <div className="col-span-6 flex gap-1.5">
                            <span className="font-bold text-slate-500 uppercase text-[8.5pt] w-24">Turma:</span>
                            <span className="font-bold text-slate-900 uppercase">{activeClass?.name || 'Classe Vinculada'}</span>
                          </div>
                        </div>
                      </div>

                      {/* Parochial Block */}
                      <div className="p-3">
                        <h3 className="font-bold uppercase text-[9pt] tracking-wider text-slate-600 mb-2">Dados Paroquiais / Ministérios</h3>
                        <div className="grid grid-cols-12 gap-y-2.5 gap-x-4">
                          <div className="col-span-6 flex gap-1.5">
                            <span className="font-bold text-slate-500 uppercase text-[8.5pt] w-24">Paróquia:</span>
                            <span className="font-bold uppercase text-slate-900">{activeStudent.parish || 'Não Informado'}</span>
                          </div>
                          <div className="col-span-6 flex gap-1.5">
                            <span className="font-bold text-slate-500 uppercase text-[8.5pt] w-24">Forania:</span>
                            <span className="font-bold uppercase text-slate-900">{activeStudent.forania || 'Não Informada'}</span>
                          </div>
                          <div className="col-span-12 flex gap-1.5">
                            <span className="font-bold text-slate-500 uppercase text-[8.5pt] w-24">Participação:</span>
                            <span className="font-medium text-slate-800">{activeStudent.pastoral_participates || 'Não informado'}</span>
                          </div>
                        </div>
                      </div>

                      {/* Contact and Address Block */}
                      <div className="p-3 bg-neutral-50/50">
                        <h3 className="font-bold uppercase text-[9pt] tracking-wider text-slate-600 mb-2">Contatos e Localização</h3>
                        <div className="grid grid-cols-12 gap-y-2.5 gap-x-4">
                          <div className="col-span-6 flex gap-1.5">
                            <span className="font-bold text-slate-500 uppercase text-[8.5pt] w-24">Celular/Whats:</span>
                            <span className="font-mono text-slate-900 font-semibold">{activeStudent.phone_mobile || 'Não informado'}</span>
                          </div>
                          <div className="col-span-6 flex gap-1.5">
                            <span className="font-bold text-slate-500 uppercase text-[8.5pt] w-24">E-mail:</span>
                            <span className="text-slate-900 font-semibold truncate text-[9.5pt]">{activeStudent.email || 'Não informado'}</span>
                          </div>

                          <div className="col-span-12 flex gap-1.5 border-t border-dashed border-black/10 pt-2 mt-1">
                            <span className="font-bold text-slate-500 uppercase text-[8.5pt] w-24">Endereço:</span>
                            <span className="font-medium text-slate-900 uppercase">
                              {activeStudent.address_street ? (
                                `${activeStudent.address_street}${activeStudent.address_neighborhood ? `, ${activeStudent.address_neighborhood}` : ''}${activeStudent.address_city ? `, ${activeStudent.address_city}` : ''}${activeStudent.address_state ? ` - ${activeStudent.address_state}` : ''}${activeStudent.address_zip ? ` (CEP: ${activeStudent.address_zip})` : ''}`
                              ) : (
                                `${activeStudent.address_city || 'Não Informado'} - ${activeStudent.address_state || 'SP'}`
                              )}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Guardians Block */}
                      <div className="p-3">
                        <h3 className="font-bold uppercase text-[9pt] tracking-wider text-slate-600 mb-2">Filiação e Responsáveis</h3>
                        <div className="grid grid-cols-12 gap-y-2.5 gap-x-4">
                          <div className="col-span-12 flex gap-1.5">
                            <span className="font-bold text-slate-500 uppercase text-[8.5pt] w-24">Nome da Mãe:</span>
                            <span className="font-bold uppercase text-slate-900">{activeStudent.guardian_mother || 'Não Informado'}</span>
                          </div>
                          <div className="col-span-12 flex gap-1.5">
                            <span className="font-bold text-slate-500 uppercase text-[8.5pt] w-24">Nome do Pai:</span>
                            <span className="font-bold uppercase text-slate-900">{activeStudent.guardian_father || 'Não Informado'}</span>
                          </div>
                          <div className="col-span-12 flex gap-1.5">
                            <span className="font-bold text-slate-500 uppercase text-[8.5pt] w-24">CPF Resp.:</span>
                            <span className="font-mono font-bold text-slate-900">{activeStudent.guardian_cpf || 'Não Informado'}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Declaration of Responsibility */}
                    <div className="pt-6 text-[9.5pt] text-justify text-slate-600 leading-relaxed space-y-3 font-serif">
                      <p>
                        Declaro para os devidos fins de direito, sob as penas da lei, que as informações cadastrais prestadas acima são inteiramente verdadeiras, assumindo total responsabilidade civil e jurídica pela exatidão e veracidade das mesmas junto à secretaria da instituição.
                      </p>
                      <p>
                        Comprometo-me, outrossim, a observar com fidelidade o estatuto, regulamento interno, normas acadêmicas, canônicas e contribuições financeiras devidas ao corpo de estudos teológicos.
                      </p>
                    </div>

                    {/* Signatures */}
                    <div className="pt-20 flex justify-between gap-12 font-sans">
                      <div className="flex flex-col items-center text-center flex-1">
                        <div className="w-full border-b border-black" />
                        <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest mt-1">Assinatura do Aluno / Responsável</span>
                      </div>
                      <div className="flex flex-col items-center text-center flex-1">
                        <div className="w-full border-b border-black" />
                        <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest mt-1">Secretaria / Visto Acadêmico</span>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="text-center py-20 text-slate-400 font-bold uppercase tracking-widest text-[10px]">
                    Nenhum aluno selecionado.
                  </div>
                )}
              </div>
            )}


            {/* 3. CARTEIRINHAS DO ESTUDANTE */}
            {selectedType === 'carteirinhas' && (
              <div className="space-y-8 font-sans">
                {classStudents.length === 0 ? (
                  <div className="text-center py-20 text-slate-400 font-bold uppercase tracking-widest text-[10px] space-y-2">
                    <Info size={24} className="mx-auto text-slate-300" />
                    <p>Nenhum aluno vinculado à turma "{activeClass?.name || 'Selecionada'}" foi encontrado.</p>
                    <p className="text-[9px] text-slate-400">Verifique os cadastros dos alunos.</p>
                  </div>
                ) : (
                  <div>
                    {/* Header for ID card page */}
                    <div className="text-center pb-6 border-b border-slate-200 mb-8 print:hidden">
                      <h2 className="text-xs font-black text-slate-400 uppercase tracking-widest">Exibindo {classStudents.length} Carteiras de Estudantes</h2>
                      <p className="text-[10px] text-slate-500 mt-1">Abaixo está o layout das carteirinhas de tamanho padrão de bolso que serão impressas juntas.</p>
                    </div>

                    {/* Cards grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 print:grid-cols-2 print:gap-4 justify-center">
                      {classStudents.map((student) => (
                        <div 
                          key={student.id} 
                          className="w-[85mm] h-[55mm] border border-black/80 p-3 bg-white flex flex-col justify-between relative box-border mx-auto select-none print:m-0 print:border"
                        >
                          {/* Inner clean borders */}
                          <div className="absolute inset-1 border border-black/20 pointer-events-none" />

                          {/* Top Header of Card */}
                          <div className="flex items-center gap-2 pb-1.5 border-b border-slate-900">
                            <div className="w-6 h-6 border border-black flex items-center justify-center font-black text-[9px] bg-slate-100 shrink-0">
                              {getInstitutionLogoText()}
                            </div>
                            <div className="min-w-0">
                              <h4 className="text-[8px] font-black uppercase tracking-widest text-slate-900 truncate">
                                {institution?.name || 'ESCOLA DE FORMAÇÃO CONCILIAR'}
                              </h4>
                              <p className="text-[6.5px] font-bold text-slate-400 uppercase tracking-wider">CARTEIRA DE ESTUDANTE</p>
                            </div>
                          </div>

                          {/* Main Row: Photo and Bio */}
                          <div className="flex gap-2.5 items-start flex-1 py-2">
                            {/* Photo Slot */}
                            <div className={cn(
                              "w-[20mm] h-[26mm] bg-slate-50 flex items-center justify-center overflow-hidden shrink-0",
                              showPhotoBorder ? "border border-black" : "border border-slate-150"
                            )}>
                              {student.photo_url ? (
                                <img src={student.photo_url} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                              ) : (
                                <div className="text-center p-1">
                                  <User className="text-slate-300 mx-auto" size={14} />
                                  <span className="text-[5px] text-slate-400 font-bold block uppercase mt-0.5">FOTO 3X4</span>
                                </div>
                              )}
                            </div>

                            {/* Bio details */}
                            <div className="flex-1 min-w-0 space-y-1.5">
                              <div>
                                <span className="text-[5.5px] font-black text-slate-400 uppercase block tracking-wider leading-none">ESTUDANTE</span>
                                <h5 className="text-[9px] font-black text-slate-950 uppercase truncate tracking-tight leading-tight">{student.name}</h5>
                              </div>

                              <div className="grid grid-cols-2 gap-1">
                                <div>
                                  <span className="text-[5px] font-black text-slate-400 uppercase block tracking-wider leading-none">MATRÍCULA / RA</span>
                                  <span className="text-[7.5px] font-bold font-mono text-slate-900">{student.registration_number || 'S/ RA'}</span>
                                </div>
                                <div>
                                  <span className="text-[5px] font-black text-slate-400 uppercase block tracking-wider leading-none">DOCUMENTO (RG/CPF)</span>
                                  <span className="text-[7.5px] font-bold font-mono text-slate-900 truncate block">{student.rg || student.cpf || 'Não Informado'}</span>
                                </div>
                              </div>

                              <div>
                                <span className="text-[5px] font-black text-slate-400 uppercase block tracking-wider leading-none">CURSO / CLASSE</span>
                                <span className="text-[7.5px] font-bold text-slate-800 uppercase block truncate">{student.course || 'TEOLOGIA'} - {activeClass?.name}</span>
                              </div>
                            </div>
                          </div>

                          {/* Bottom Footer block */}
                          <div className="flex items-center justify-between border-t border-black/25 pt-1 mt-auto">
                            <div>
                              <span className="text-[4.5px] font-black text-slate-400 uppercase tracking-wider block leading-none">VALIDADE</span>
                              <span className="text-[6.5px] font-black font-mono text-emerald-800 leading-none">DEZ / {new Date().getFullYear()}</span>
                            </div>
                            <div className="text-right">
                              <span className="text-[4.5px] font-black text-slate-400 uppercase tracking-wider block leading-none">DIOCESE DE AMPARO</span>
                              <span className="text-[6px] font-bold text-slate-850 block leading-none uppercase">{student.status || 'Ativo'}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}


            {/* 4. DIÁRIO / LISTA DE PRESENÇA EM BRANCO */}
            {selectedType === 'diario' && (
              <div className="space-y-6 font-sans">
                {/* School Header Panel */}
                <div className="flex items-center justify-between border-b-2 border-black pb-4 mb-4">
                  <div className="space-y-1">
                    <h2 className="text-[14px] font-black uppercase tracking-wider text-slate-950">
                      {institution?.name || 'ESCOLA DE FORMAÇÃO CONCILIAR'}
                    </h2>
                    <h3 className="text-[12px] font-bold uppercase text-slate-700">Diário / Ficha de Chamada e Assiduidade</h3>
                  </div>
                  <div className="text-right text-[10px] font-mono space-y-0.5">
                    <p className="font-bold">ANO LETIVO: {new Date().getFullYear()}</p>
                    <p className="text-slate-500 uppercase font-bold">Turma: {activeClass?.name || '---'}</p>
                  </div>
                </div>

                {/* Info Bar */}
                <div className="grid grid-cols-4 gap-4 border border-black p-3 bg-neutral-50/50 text-[10px] uppercase font-bold">
                  <div>
                    <span className="text-slate-400 block text-[8px]">DISCIPLINA:</span>
                    <span className="text-slate-900 font-black">______________________</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[8px]">PROFESSOR:</span>
                    <span className="text-slate-900 font-black">______________________</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[8px]">PERÍODO / SEMESTRE:</span>
                    <span className="text-slate-900 font-black">{activeClass?.semester || '1º Semestre'} / {activeClass?.period || 'Noite'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[8px]">TOTAL ALUNOS:</span>
                    <span className="text-slate-900 font-black">{classStudents.length} ATIVOS</span>
                  </div>
                </div>

                {/* Grid roll-call table */}
                <table className="w-full text-left border-collapse text-[10px] border-2 border-black">
                  <thead>
                    <tr className="bg-neutral-100 uppercase text-[8px] font-black border-b-2 border-black h-9">
                      <th className="p-1.5 border-r border-black text-center w-8">Nº</th>
                      <th className="p-1.5 border-r border-black w-1/3">Nome do Estudante</th>
                      {/* Generates 12 blank columns for days */}
                      {Array.from({ length: 12 }).map((_, i) => (
                        <th key={i} className="border-r border-black text-center text-[7px] w-8 p-1">
                          __/__
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/50">
                    {classStudents.length === 0 ? (
                      <tr>
                        <td colSpan={14} className="p-6 text-center text-slate-500 font-bold uppercase tracking-wider">
                          Nenhum aluno matriculado nesta turma para listar.
                        </td>
                      </tr>
                    ) : (
                      classStudents.map((student, idx) => (
                        <tr key={student.id} className="h-8">
                          <td className="p-1 border-r border-black text-center font-bold font-mono text-slate-600">{idx + 1}</td>
                          <td className="p-1.5 border-r border-black font-black uppercase text-slate-950 truncate max-w-[200px]">{student.name}</td>
                          {Array.from({ length: 12 }).map((_, i) => (
                            <td key={i} className="border-r border-black p-0 bg-white" />
                          ))}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>

                {/* Sheet instructions / footer signature */}
                <div className="pt-16 flex justify-between items-end gap-12 text-[10px] font-sans">
                  <div className="space-y-1 text-slate-500 max-w-sm">
                    <p className="font-bold uppercase text-[8px]">Instruções para Lançamento:</p>
                    <p className="text-[8px] leading-tight italic">
                      Lançar "P" para presenças, "F" para faltas injustificadas e "J" para justificadas devidamente autorizadas pela diretoria acadêmica acadêmica.
                    </p>
                  </div>
                  <div className="flex flex-col items-center text-center w-56 shrink-0">
                    <div className="w-full border-b border-black" />
                    <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest mt-1">Assinatura do Professor Docente</span>
                  </div>
                </div>
              </div>
            )}


            {/* 5. DECLARAÇÃO DE QUITAÇÃO FINANCEIRA */}
            {selectedType === 'quitacao' && (
              <div className="space-y-12">
                {activeStudent ? (
                  <>
                    {/* Title */}
                    <div className="text-center space-y-2 pt-6">
                      <h2 className="text-[18px] font-extrabold uppercase tracking-[0.2em] font-serif border-b-2 border-slate-950 pb-2 max-w-lg mx-auto">
                        Certidão de Quitação Financeira
                      </h2>
                      <p className="text-[10px] text-slate-400 tracking-widest uppercase font-sans">Referente ao Ano Exercício de {new Date().getFullYear()}</p>
                    </div>

                    {/* Body text */}
                    <div className="text-[13px] text-slate-800 leading-[2.2] text-justify font-serif space-y-6 pt-6">
                      <p>
                        A tesouraria e diretoria administrativa da <strong className="text-black font-extrabold text-[14px] uppercase tracking-wide">{institution?.name || 'Escola de Formação Conciliar'}</strong>, no uso de suas competências regimentais, certifica que o(a) estudante:
                      </p>

                      <div className="bg-slate-50/50 border border-slate-200 p-5 rounded-none font-sans space-y-2 uppercase text-[11px] font-bold">
                        <div className="flex">
                          <span className="text-slate-400 w-28">Estudante:</span>
                          <span className="text-slate-950 font-black text-[12px]">{activeStudent.name}</span>
                        </div>
                        <div className="flex">
                          <span className="text-slate-400 w-28">Registro Geral:</span>
                          <span className="text-slate-900 font-mono">{activeStudent.registration_number || '---'}</span>
                        </div>
                        <div className="flex">
                          <span className="text-slate-400 w-28">Turma Vinculada:</span>
                          <span className="text-slate-900">{activeClass?.name || 'Ativa'}</span>
                        </div>
                        <div className="flex">
                          <span className="text-slate-400 w-28">Status Atual:</span>
                          <span className="text-emerald-800 font-black">{activeStudent.status || 'Ativo'}</span>
                        </div>
                      </div>

                      <p>
                        Certificamos plenamente que o aluno acima mencionado encontra-se com todas as parcelas e contribuições de ajuda de custo acadêmicas devidamente quitadas e em dia com o caixa desta instituição de ensino, não constando nenhuma pendência financeira ou débito pendente até a presente data.
                      </p>

                      <p>
                        Por ser verdade e a pedido da parte interessada para que conste e produza seus devidos fins legais, expedimos e assinamos o presente termo de quitação geral.
                      </p>
                    </div>

                    {/* Location / Date */}
                    <div className="text-right pt-12 text-[12px] font-serif">
                      <p className="uppercase tracking-wide font-bold">
                        {institution?.city_uf || 'Catedral Geral'}, {formatLongDate(new Date().toISOString())}
                      </p>
                    </div>

                    {/* Signature */}
                    <div className="pt-24 flex flex-col items-center justify-center font-sans">
                      <div className="flex flex-col items-center gap-1.5 text-center">
                        <div className="w-64 border-b border-black" />
                        <p className="text-[11px] font-bold text-slate-900 uppercase tracking-widest">
                          {signerName || 'Tesoureiro Acadêmico'}
                        </p>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                          {signerTitle || 'Tesouraria / Gestão de Contas'}
                        </p>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="text-center py-20 text-slate-400 font-bold uppercase tracking-widest text-[10px]">
                    Nenhum aluno selecionado.
                  </div>
                )}
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}
