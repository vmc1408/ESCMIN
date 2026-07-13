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
  HelpCircle,
  MessageCircle,
  X
} from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { fetchAll } from '../lib/database';
import { Student, Class, Contribution } from '../types';
import { financialService } from '../services/financialService';
import { cn, formatDateForDisplay } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { useSearchParams } from 'react-router-dom';

type PrintType = 'declaracao' | 'ficha' | 'carteirinhas' | 'quitacao' | 'carta' | 'etiquetas';

export function Impressos() {
  const [searchParams, setSearchParams] = useSearchParams();
  const typeParam = searchParams.get('type') as PrintType | null;

  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [contributions, setContributions] = useState<Contribution[]>([]);
  const [institution, setInstitution] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Selector / Filter States
  const [selectedType, setSelectedType] = useState<PrintType>('declaracao');

  // Sync state with URL search param
  useEffect(() => {
    if (typeParam && ['declaracao', 'ficha', 'carteirinhas', 'quitacao', 'carta', 'etiquetas'].includes(typeParam)) {
      setSelectedType(typeParam);
    }
  }, [typeParam]);

  const handleSelectType = useCallback((type: PrintType) => {
    setSelectedType(type);
    setSearchParams({ type });
    if (type === 'declaracao' || type === 'quitacao') {
      setSelectedStudentId('');
    }
  }, [setSearchParams]);
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [studentSearch, setStudentSearch] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  
  // Customization fields
  const [customText, setCustomText] = useState('');
  const [signerRole, setSignerRole] = useState<'diretor' | 'secretario' | 'ambos'>('secretario');
  const [signerName, setSignerName] = useState('');
  const [signerTitle, setSignerTitle] = useState('Secretário Acadêmico');
  const [coSignerName, setCoSignerName] = useState('');
  const [coSignerTitle, setCoSignerTitle] = useState('Diretor Geral');
  const [showPhotoBorder, setShowPhotoBorder] = useState(true);
  const [isFormFilled, setIsFormFilled] = useState(true);

  // States for student cards (Pimaco 6183)
  const [selectedCardStudentIds, setSelectedCardStudentIds] = useState<string[]>([]);
  const [startPosition, setStartPosition] = useState<number>(1);
  const [cardFillMode, setCardFillMode] = useState<'individual' | 'repeat'>('individual');
  const [showCardCutBorders, setShowCardCutBorders] = useState<boolean>(true);

  // States for address labels (Pimaco 6180)
  const [selectedLabelStudentIds, setSelectedLabelStudentIds] = useState<string[]>([]);
  const [labelStartPosition, setLabelStartPosition] = useState<number>(1);
  const [labelFillMode, setLabelFillMode] = useState<'individual' | 'repeat'>('individual');
  const [showLabelCutBorders, setShowLabelCutBorders] = useState<boolean>(true);
  const [labelShowAddress, setLabelShowAddress] = useState<boolean>(false);
  const [labelShowBirthday, setLabelShowBirthday] = useState<boolean>(false);
  const [labelShowMatricula, setLabelShowMatricula] = useState<boolean>(false);
  const [labelShowCourse, setLabelShowCourse] = useState<boolean>(false);
  const [studentSortOrder, setStudentSortOrder] = useState<'name' | 'registration'>('name');

  const [documentDate, setDocumentDate] = useState<string>(() => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  });

  const admissionNorms = useMemo(() => {
    if (institution?.admission_norms && institution.admission_norms.trim()) {
      return institution.admission_norms
        .split('\n')
        .map((line: string) => line.trim())
        .filter((line: string) => line.length > 0);
    }
    return [
      "No ato da matrícula o(a) aluno(a) concorda em priorizar a frequência no curso escolhido.",
      "Como critério de aprovação o(a) aluno(a) deverá ter frequência mínima de 75% das aulas.",
      "A nota mínima exigida para a promoção do(a) aluno(a) é de 5,0 (cinco) por disciplina.",
      "O(a) aluno(a) se compromete a manter em dia a mensalidade estabelecida dentro do prazo de vencimento."
    ];
  }, [institution?.admission_norms]);

  const presentationInfo = useMemo(() => {
    if (institution?.presentation_info && institution.presentation_info.trim()) {
      return institution.presentation_info
        .split('\n')
        .map((line: string) => line.trim())
        .filter((line: string) => line.length > 0);
    }
    return [
      "Vá até a Secretaria da escola (endereço abaixo no rodapé)",
      "Leve a carta de apresentação,",
      "Leve a ficha de inscrição,",
      "Uma (01) cópia do RG ou CNH,",
      "Uma (01) Foto 3x4 recente,",
      "Taxa de matrícula de R$ 100,00."
    ];
  }, [institution?.presentation_info]);

  // Load Initial Data
  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const [studs, clss, instSettings, conts] = await Promise.all([
          fetchAll('students', '*', 'name'),
          fetchAll('classes', '*', 'name'),
          financialService.getInstitutionSettings(),
          financialService.getContributions()
        ]);
        
        setStudents(studs || []);
        setContributions(conts || []);
        
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
        setSelectedStudentId('');
        setSelectedClassId('');
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
    } else if (signerRole === 'ambos') {
      setSignerTitle('Secretário Acadêmico');
      setCoSignerTitle('Diretor Geral');
    }
  }, [signerRole]);

  // Derived filtered students list for dropdowns/search
  const filteredStudents = useMemo(() => {
    if (!studentSearch) return students;
    const query = studentSearch.toLowerCase().trim();
    if (!query) return students;

    const matched = students.filter(s => 
      s.name.toLowerCase().includes(query) ||
      (s.registration_number && s.registration_number.toLowerCase().includes(query))
    );

    return matched.sort((a, b) => {
      const aName = a.name.toLowerCase();
      const bName = b.name.toLowerCase();
      const aReg = a.registration_number ? a.registration_number.toLowerCase() : '';
      const bReg = b.registration_number ? b.registration_number.toLowerCase() : '';

      // 1. Exact name starts-with
      const aStartsName = aName.startsWith(query);
      const bStartsName = bName.startsWith(query);
      if (aStartsName && !bStartsName) return -1;
      if (!aStartsName && bStartsName) return 1;

      // 2. Registration number starts-with
      const aStartsReg = aReg.startsWith(query);
      const bStartsReg = bReg.startsWith(query);
      if (aStartsReg && !bStartsReg) return -1;
      if (!aStartsReg && bStartsReg) return 1;

      // 3. Any word in the name starts-with (e.g. "Da Silva")
      const aWordStarts = aName.split(/\s+/).some(word => word.startsWith(query));
      const bWordStarts = bName.split(/\s+/).some(word => word.startsWith(query));
      if (aWordStarts && !bWordStarts) return -1;
      if (!aWordStarts && bWordStarts) return 1;

      // 4. Alphabetical by name as fallback
      return a.name.localeCompare(b.name);
    });
  }, [students, studentSearch]);

  const activeStudent = useMemo(() => {
    return students.find(s => s.id === selectedStudentId) || null;
  }, [students, selectedStudentId]);

  const activeClass = useMemo(() => {
    return classes.find(c => c.id === selectedClassId) || null;
  }, [classes, selectedClassId]);

  // Find pending payments for the activeStudent
  const pendingPayments = useMemo(() => {
    if (!activeStudent) return { isPending: false, months: [], year: new Date().getFullYear() };
    
    // Filter contributions for this student in the current year
    const currentYear = new Date().getFullYear();
    const studentConts = contributions.filter(
      c => c.student_id === activeStudent.id && c.reference_year === currentYear
    );
    
    // Check months starting from their start_date month (if it falls in the current year), otherwise from January
    let startCheckMonth = 1; // Default to January
    if (activeStudent.start_date) {
      const dateParts = activeStudent.start_date.split('/');
      if (dateParts.length === 3) {
        const startYear = parseInt(dateParts[2], 10);
        const startMonth = parseInt(dateParts[1], 10);
        if (startYear === currentYear) {
          startCheckMonth = startMonth;
        }
      } else {
        const datePartsDash = activeStudent.start_date.split('-');
        if (datePartsDash.length === 3) {
          const startYear = parseInt(datePartsDash[0], 10);
          const startMonth = parseInt(datePartsDash[1], 10);
          if (startYear === currentYear) {
            startCheckMonth = startMonth;
          }
        }
      }
    }
    
    const currentMonth = new Date().getMonth() + 1;
    const unpaidMonths: number[] = [];
    
    // Check months up to the current month
    for (let m = startCheckMonth; m <= currentMonth; m++) {
      const paid = studentConts.some(c => c.reference_month === m);
      if (!paid) {
        unpaidMonths.push(m);
      }
    }
    
    const MONTH_NAMES: { [key: number]: string } = {
      1: 'Janeiro', 2: 'Fevereiro', 3: 'Março', 4: 'Abril', 5: 'Maio', 6: 'Junho',
      7: 'Julho', 8: 'Agosto', 9: 'Setembro', 10: 'Outubro', 11: 'Novembro', 12: 'Dezembro'
    };
    
    return {
      isPending: unpaidMonths.length > 0,
      months: unpaidMonths.map(m => MONTH_NAMES[m] || `Mês ${m}`),
      year: currentYear
    };
  }, [activeStudent, contributions]);

  const formatPendingMonthsText = useCallback((months: string[]) => {
    if (months.length === 0) return '';
    if (months.length === 1) return months[0];
    const last = months[months.length - 1];
    const rest = months.slice(0, months.length - 1);
    return `${rest.join(', ')} e ${last}`;
  }, []);

  // Students enrolled in selected class, sorted by name or registration number
  const classStudents = useMemo(() => {
    if (!selectedClassId) return [];
    const filtered = students.filter(s => s.class_id === selectedClassId);
    return filtered.sort((a, b) => {
      if (studentSortOrder === 'registration') {
        const aReg = a.registration_number || '';
        const bReg = b.registration_number || '';
        if (!aReg && bReg) return 1;
        if (aReg && !bReg) return -1;
        if (!aReg && !bReg) return a.name.localeCompare(b.name, 'pt-BR');
        return aReg.localeCompare(bReg, 'pt-BR', { numeric: true });
      }
      return a.name.localeCompare(b.name, 'pt-BR');
    });
  }, [students, selectedClassId, studentSortOrder]);

  // Reset student selection when class changes
  useEffect(() => {
    setSelectedCardStudentIds([]);
    setSelectedLabelStudentIds([]);
  }, [selectedClassId]);

  // Group students into Pimaco 6183 sheets of 10 labels each
  const cardItemsForPrinting = useMemo(() => {
    const selectedStudentsToPrint = classStudents.filter(s => selectedCardStudentIds.includes(s.id));
    
    if (selectedStudentsToPrint.length === 0) {
      return [];
    }

    const items: (Student | null)[] = [];

    // First sheet: insert empty slots before the starting position
    const emptyStartCount = Math.max(0, startPosition - 1);
    for (let i = 0; i < emptyStartCount; i++) {
      items.push(null);
    }

    if (cardFillMode === 'repeat') {
      // Repeat the first selected student to fill the remaining slots of the sheet
      const studentToRepeat = selectedStudentsToPrint[0];
      const remainingOnFirstSheet = 10 - emptyStartCount;
      for (let i = 0; i < remainingOnFirstSheet; i++) {
        items.push(studentToRepeat);
      }
    } else {
      // Sequencial mode
      selectedStudentsToPrint.forEach(student => {
        items.push(student);
      });
    }

    // Chunk the flat array into sheets of 10 items
    const sheets: (Student | null)[][] = [];
    for (let i = 0; i < items.length; i += 10) {
      const sheet = items.slice(i, i + 10);
      // Pad the last sheet to always have exactly 10 items (filled with nulls)
      while (sheet.length < 10) {
        sheet.push(null);
      }
      sheets.push(sheet);
    }

    return sheets;
  }, [classStudents, selectedCardStudentIds, startPosition, cardFillMode]);

  // Group students into Pimaco 6180 sheets of 30 labels each
  const labelItemsForPrinting = useMemo(() => {
    const selectedStudentsToPrint = classStudents.filter(s => selectedLabelStudentIds.includes(s.id));
    
    if (selectedStudentsToPrint.length === 0) {
      return [];
    }

    const items: (Student | null)[] = [];

    // First sheet: insert empty slots before the starting position
    const emptyStartCount = Math.max(0, labelStartPosition - 1);
    for (let i = 0; i < emptyStartCount; i++) {
      items.push(null);
    }

    if (labelFillMode === 'repeat') {
      // Repeat the first selected student to fill the remaining slots of the sheet
      const studentToRepeat = selectedStudentsToPrint[0];
      const remainingOnFirstSheet = 30 - emptyStartCount;
      for (let i = 0; i < remainingOnFirstSheet; i++) {
        items.push(studentToRepeat);
      }
    } else {
      // Sequencial mode
      selectedStudentsToPrint.forEach(student => {
        items.push(student);
      });
    }

    // Chunk the flat array into sheets of 30 items
    const sheets: (Student | null)[][] = [];
    for (let i = 0; i < items.length; i += 30) {
      const sheet = items.slice(i, i + 30);
      // Pad the last sheet to always have exactly 30 items (filled with nulls)
      while (sheet.length < 30) {
        sheet.push(null);
      }
      sheets.push(sheet);
    }

    return sheets;
  }, [classStudents, selectedLabelStudentIds, labelStartPosition, labelFillMode]);

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

  const isSinglePageType = selectedType === 'declaracao' || selectedType === 'quitacao' || selectedType === 'ficha' || selectedType === 'carta';

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
    <div className="relative font-sans text-slate-800 pb-12 print:pb-0 print:p-0 print:m-0">
      {/* Dynamic print-only style sheet to format printed pages */}
      <style dangerouslySetInnerHTML={{ __html: `
        /* General Sheet and Label Grid Layouts (Apply on screen for high fidelity, and overridden in print) */
        .pimaco-sheet {
          display: grid;
          grid-template-columns: 99.1mm 99.1mm;
          grid-auto-rows: 50.8mm;
          column-gap: 8.1mm;
          row-gap: 0mm;
          width: 215.9mm;
          height: 279.4mm;
          padding: 12.7mm 4.8mm;
          margin: 0 auto;
          box-sizing: border-box;
          background-color: #fff;
        }
        .pimaco-label {
          width: 99.1mm;
          height: 50.8mm;
          max-width: 99.1mm;
          max-height: 50.8mm;
          min-width: 99.1mm;
          min-height: 50.8mm;
          box-sizing: border-box;
          position: relative;
          overflow: hidden;
          background-color: #fff;
          border: ${showCardCutBorders ? '1px dashed #ddd' : 'none'};
        }

        /* Pimaco 6180 Sheet layout (3 columns, 10 rows = 30 labels) */
        .pimaco-sheet-6180 {
          display: grid;
          grid-template-columns: 65.0mm 65.0mm 65.0mm;
          grid-auto-rows: 25.0mm;
          column-gap: 3.0mm;
          row-gap: 0mm;
          width: 215.9mm;
          height: 279.4mm;
          padding: 12.0mm 5.0mm 13.0mm 5.0mm;
          margin: 0 auto;
          box-sizing: border-box;
          background-color: #fff;
        }
        .pimaco-label-6180 {
          width: 65.0mm;
          height: 25.0mm;
          max-width: 65.0mm;
          max-height: 25.0mm;
          min-width: 65.0mm;
          min-height: 25.0mm;
          box-sizing: border-box;
          position: relative;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          overflow: hidden;
          background-color: #fff;
          padding: 2.5mm 3.5mm;
          border: ${showLabelCutBorders ? '1px dashed #ddd' : 'none'};
        }

        @media print {
          @page {
            size: ${(selectedType === 'carteirinhas' || selectedType === 'etiquetas') ? 'letter portrait' : 'A4 portrait'} !important;
            margin: ${(selectedType === 'carteirinhas' || selectedType === 'etiquetas') ? '0mm !important' : '10mm 15mm 4mm 15mm !important'};
          }
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
            background: transparent !important;
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

          /* Print Overrides for Pimaco Sheets */
          .pimaco-sheet, .pimaco-sheet-6180 {
            display: grid !important;
            page-break-inside: avoid !important;
            background-color: #fff !important;
            box-shadow: none !important;
            border: none !important;
            margin: 0 auto !important;
          }
          .pimaco-label, .pimaco-label-6180 {
            page-break-inside: avoid !important;
            background-color: #fff !important;
          }
        }
      `}} />

      {/* Page Title */}
      <PageHeader 
        title="Documentos e Impressos" 
        description="Emissão e impressão direta de declarações, fichas de matrículas, etiquetas para carteirinhas de estudantes e diários." 
        icon={Printer}
        badge="Impressos"
      >
        <button
          onClick={handlePrint}
          disabled={selectedType === 'declaracao' && !selectedStudentId}
          className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:text-slate-500 disabled:cursor-not-allowed disabled:shadow-none text-white rounded-xl font-bold text-[10px] uppercase tracking-widest transition-all flex items-center gap-1.5 active:scale-95 shadow-md shadow-blue-600/10"
        >
          <Printer size={13} />
          Imprimir Documento
        </button>
      </PageHeader>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start print:block print:p-0 print:m-0">
        {/* Left Control Column (35%) */}
        <div className="lg:col-span-4 space-y-6 print:hidden lg:sticky lg:top-0 lg:max-h-[calc(100vh-190px)] lg:overflow-y-auto pr-2 custom-scrollbar">
          {/* Context-Based Selector (Student or Class) */}
          <div className="bg-white border border-slate-200 p-5 space-y-4">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Configurações do Documento</h3>
            
            {/* Data de Emissão do Documento - Only show where logically used (Declarations/Discharge) */}
            {(selectedType === 'declaracao' || selectedType === 'quitacao') && (
              <div className="space-y-1">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Data de Emissão</label>
                <input 
                  type="date"
                  value={documentDate}
                  onChange={(e) => setDocumentDate(e.target.value)}
                  disabled={(selectedType === 'declaracao' || selectedType === 'quitacao') && !selectedStudentId}
                  className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold focus:outline-none focus:border-blue-500 bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>
            )}

            {/* Student Search (Single field) */}
            {(selectedType === 'declaracao' || selectedType === 'quitacao') && (
              <div className="space-y-1.5 relative">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Buscar Aluno *</label>
                
                {selectedStudentId ? (
                  /* Beautiful selected student badge */
                  <div className="flex items-center justify-between w-full px-3 py-2.5 border border-blue-200 bg-blue-50/70 rounded-xl transition-all shadow-sm">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-6 h-6 rounded-full bg-blue-150 flex items-center justify-center text-blue-600 shrink-0 font-bold text-[10px]">
                        {activeStudent?.name ? activeStudent.name.charAt(0).toUpperCase() : '?'}
                      </div>
                      <div className="min-w-0">
                        <p className="text-[11px] font-black text-blue-900 uppercase tracking-wide truncate">
                          {activeStudent?.name}
                        </p>
                        <p className="text-[9px] font-mono text-blue-600/80 uppercase">
                          Matrícula: {activeStudent?.registration_number || 'Sem Registro'}
                        </p>
                      </div>
                    </div>
                    <button 
                      type="button" 
                      onClick={() => {
                        setSelectedStudentId('');
                        setStudentSearch('');
                      }}
                      className="text-blue-500 hover:text-blue-700 p-1.5 rounded-lg hover:bg-blue-100/60 transition-colors shrink-0"
                      title="Alterar Aluno"
                    >
                      <X size={14} className="stroke-[2.5]" />
                    </button>
                  </div>
                ) : (
                  /* Interactive search input */
                  <div className="relative z-30">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={13} />
                      <input 
                        type="text"
                        placeholder="DIGITE O NOME OU MATRÍCULA..."
                        value={studentSearch}
                        onChange={(e) => {
                          setStudentSearch(e.target.value);
                          setIsDropdownOpen(true);
                        }}
                        onFocus={() => setIsDropdownOpen(true)}
                        className="w-full pl-8 pr-8 py-2 border border-slate-200 rounded-xl text-xs font-semibold uppercase focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 bg-white transition-all shadow-sm placeholder:text-slate-400"
                      />
                      {studentSearch && (
                        <button 
                          type="button"
                          onClick={() => setStudentSearch('')}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded"
                        >
                          <X size={12} />
                        </button>
                      )}
                    </div>

                    {/* Floating Dropdown Results */}
                    {isDropdownOpen && studentSearch.trim() !== '' && (
                      <>
                        <div className="fixed inset-0 z-20" onClick={() => setIsDropdownOpen(false)} />
                        <div className="absolute z-30 mt-1.5 w-full bg-white border border-slate-200 rounded-xl shadow-xl max-h-56 overflow-y-auto divide-y divide-slate-100 animate-in fade-in slide-in-from-top-1 duration-150">
                          {filteredStudents.length === 0 ? (
                            <div className="px-4 py-4 text-center text-slate-400 text-[10px] font-bold uppercase tracking-wider">
                              Nenhum estudante encontrado
                            </div>
                          ) : (
                            filteredStudents.slice(0, 15).map(s => (
                              <button
                                key={s.id}
                                type="button"
                                onClick={() => {
                                  setSelectedStudentId(s.id);
                                  setStudentSearch('');
                                  setIsDropdownOpen(false);
                                }}
                                className="w-full px-4 py-2.5 text-left hover:bg-blue-50/50 transition-all flex flex-col gap-0.5 group"
                              >
                                <span className="text-[11px] font-black text-slate-700 uppercase group-hover:text-blue-700 transition-colors">{s.name}</span>
                                <span className="text-[9px] font-mono text-slate-450 uppercase">Matrícula: {s.registration_number || 'Sem Registro'}</span>
                              </button>
                            ))
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Information Block for Blank Forms */}
            {(selectedType === 'ficha' || selectedType === 'carta') && (
              <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl space-y-2">
                <div className="flex gap-2 text-slate-800">
                  <Info size={16} className="shrink-0 mt-0.5 text-blue-500" />
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-700">Documento em Branco</span>
                </div>
                <p className="text-[11px] text-slate-500 leading-normal font-medium">
                  {selectedType === 'ficha' 
                    ? "Este é um modelo oficial em branco da Ficha de Inscrição. Ideal para imprimir e disponibilizar para preenchimento manual à caneta." 
                    : "Este é um modelo oficial em branco da Carta de Apresentação de candidato. Deve ser impresso para assinatura e carimbo do pároco de origem."}
                </p>
              </div>
            )}

            {/* Class Selector (Applicable for Carteirinhas, Etiquetas) */}
            {(selectedType === 'carteirinhas' || selectedType === 'etiquetas') && (
              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Selecionar Turma/Classe</label>
                  <select
                    value={selectedClassId}
                    onChange={(e) => setSelectedClassId(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-semibold focus:outline-none focus:border-blue-500 uppercase bg-slate-50"
                  >
                    <option value="">Selecione uma turma...</option>
                    {classes.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                {/* Sort Order Selector (for carteirinhas, etiquetas) */}
                {selectedClassId && (selectedType === 'carteirinhas' || selectedType === 'etiquetas') && (
                  <div className="space-y-1 pt-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">Ordem dos Alunos</label>
                    <div className="grid grid-cols-2 gap-1.5 bg-slate-50 p-1 border border-slate-200 rounded-lg">
                      <button
                        type="button"
                        onClick={() => setStudentSortOrder('name')}
                        className={cn(
                          "py-1 px-1.5 rounded text-[8.5px] font-black uppercase tracking-wider transition-all",
                          studentSortOrder === 'name'
                            ? "bg-slate-900 text-white shadow-sm"
                            : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-150"
                        )}
                      >
                        Por Nome
                      </button>
                      <button
                        type="button"
                        onClick={() => setStudentSortOrder('registration')}
                        className={cn(
                          "py-1 px-1.5 rounded text-[8.5px] font-black uppercase tracking-wider transition-all",
                          studentSortOrder === 'registration'
                            ? "bg-slate-900 text-white shadow-sm"
                            : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-150"
                        )}
                      >
                        Por Matrícula / RA
                      </button>
                    </div>
                  </div>
                )}

                {/* Checklist of students to print - directly below class selection */}
                {selectedClassId && (selectedType === 'carteirinhas' || selectedType === 'etiquetas') && (
                  <div className="space-y-2 pt-2 border-t border-slate-150">
                    <div className="flex items-center justify-between">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Estudantes a Imprimir</label>
                      <span className="text-[9px] font-mono font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                        {selectedType === 'carteirinhas' ? selectedCardStudentIds.length : selectedLabelStudentIds.length} selecionado(s)
                      </span>
                    </div>
                    
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          if (selectedType === 'carteirinhas') {
                            setSelectedCardStudentIds(classStudents.map(s => s.id));
                          } else {
                            setSelectedLabelStudentIds(classStudents.map(s => s.id));
                          }
                        }}
                        className="flex-1 py-1 px-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold uppercase tracking-wider text-[8px] rounded border border-slate-200"
                      >
                        Todos
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (selectedType === 'carteirinhas') {
                            setSelectedCardStudentIds([]);
                          } else {
                            setSelectedLabelStudentIds([]);
                          }
                        }}
                        className="flex-1 py-1 px-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold uppercase tracking-wider text-[8px] rounded border border-slate-200"
                      >
                        Limpar
                      </button>
                    </div>

                    <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100 bg-slate-50/50 p-1">
                      {classStudents.length === 0 ? (
                        <p className="text-[9px] text-slate-400 font-bold text-center py-8 uppercase tracking-wider">
                          Nenhum aluno nesta turma
                        </p>
                      ) : (
                        classStudents.map(student => {
                          const isChecked = selectedType === 'carteirinhas' 
                            ? selectedCardStudentIds.includes(student.id)
                            : selectedLabelStudentIds.includes(student.id);
                          return (
                            <label
                              key={student.id}
                              className="flex items-center gap-2.5 px-2 py-2 hover:bg-white cursor-pointer transition-colors"
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={(e) => {
                                  const setList = selectedType === 'carteirinhas' ? setSelectedCardStudentIds : setSelectedLabelStudentIds;
                                  if (e.target.checked) {
                                    setList(prev => [...prev, student.id]);
                                  } else {
                                    setList(prev => prev.filter(id => id !== student.id));
                                  }
                                }}
                                className="w-3.5 h-3.5 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                              />
                              <div className="flex-1 min-w-0">
                                <p className="text-[10px] font-black uppercase text-slate-800 leading-none truncate mb-0.5">
                                  {student.name}
                                </p>
                                <p className="text-[8px] font-mono text-slate-450 uppercase leading-none">
                                  RA: {student.registration_number || 'Sem RA'}
                                </p>
                              </div>
                            </label>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Additional custom fields for Declaracao / Quitacao */}
            {selectedType === 'declaracao' && (
              <div className={cn("space-y-3 pt-2 border-t border-slate-150", !selectedStudentId && "opacity-45 pointer-events-none select-none")}>
                {!selectedStudentId && (
                  <p className="text-[9.5px] text-amber-700 font-bold bg-amber-50 p-2.5 text-center leading-normal border border-amber-200 rounded-lg">
                    Selecione um aluno acima para liberar as opções adicionais da Declaração.
                  </p>
                )}
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Observação / Adendo Customizado</label>
                  <textarea 
                    placeholder="Adicione qualquer texto extra que deva constar no corpo da declaração..."
                    rows={3}
                    value={customText}
                    onChange={(e) => setCustomText(e.target.value)}
                    disabled={!selectedStudentId}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-[11px] font-medium focus:outline-none focus:border-blue-500 disabled:bg-slate-50"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Quem Assina?</label>
                  <select
                    value={signerRole}
                    onChange={(e) => setSignerRole(e.target.value as any)}
                    disabled={!selectedStudentId}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-semibold focus:outline-none disabled:bg-slate-50"
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
                      maxLength={35}
                      className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Cargo do Assinante 1</label>
                    <input 
                      type="text"
                      value={signerTitle}
                      onChange={(e) => setSignerTitle(e.target.value)}
                      maxLength={30}
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
                          maxLength={35}
                          className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Cargo do Assinante 2</label>
                        <input 
                          type="text"
                          value={coSignerTitle}
                          onChange={(e) => setCoSignerTitle(e.target.value)}
                          maxLength={30}
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
              <div className="space-y-4 pt-4 border-t border-slate-150">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Configuração das Etiquetas</h4>
                
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">Exibir Borda de Foto?</label>
                    <input 
                      type="checkbox"
                      checked={showPhotoBorder}
                      onChange={(e) => setShowPhotoBorder(e.target.checked)}
                      className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">Cartão Pré-Preenchido?</label>
                    <input 
                      type="checkbox"
                      checked={isFormFilled}
                      onChange={(e) => setIsFormFilled(e.target.checked)}
                      className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">Bordas Guia de Corte?</label>
                    <input 
                      type="checkbox"
                      checked={showCardCutBorders}
                      onChange={(e) => setShowCardCutBorders(e.target.checked)}
                      className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div className="space-y-2 pt-2 border-t border-slate-100">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Modo de Preenchimento</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setCardFillMode('individual')}
                      className={cn(
                        "py-2 px-2 border rounded-lg text-[9px] font-black uppercase tracking-wider transition-all",
                        cardFillMode === 'individual'
                          ? "bg-slate-900 border-slate-900 text-white shadow-sm animate-none"
                          : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                      )}
                    >
                      Sequencial
                    </button>
                    <button
                      type="button"
                      onClick={() => setCardFillMode('repeat')}
                      className={cn(
                        "py-2 px-2 border rounded-lg text-[9px] font-black uppercase tracking-wider transition-all",
                        cardFillMode === 'repeat'
                          ? "bg-slate-900 border-slate-900 text-white shadow-sm animate-none"
                          : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                      )}
                    >
                      Repetir 1º Aluno
                    </button>
                  </div>
                  {cardFillMode === 'repeat' && (
                    <p className="text-[8.5px] font-medium text-blue-600 italic leading-snug">
                      * Repete o primeiro aluno selecionado em todas as etiquetas disponíveis na folha.
                    </p>
                  )}
                </div>

                <div className="space-y-2 pt-2 border-t border-slate-100">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Posição Inicial na Folha (8099F)</label>
                    <span className="text-[9.5px] font-mono font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                      Posição: {startPosition}
                    </span>
                  </div>
                  <p className="text-[8.5px] text-slate-400 font-medium leading-normal">
                    Selecione onde começará a impressão. Útil para reutilizar folhas Pimaco já começadas.
                  </p>
                  
                  {/* Visual 2x5 Grid representing 10 Pimaco labels on Letter sheet */}
                  <div className="grid grid-cols-2 gap-1.5 max-w-[160px] mx-auto bg-slate-50 p-2 border border-slate-200 rounded-lg">
                    {Array.from({ length: 10 }).map((_, idx) => {
                      const pos = idx + 1;
                      const isBeforeStart = pos < startPosition;
                      const isStart = pos === startPosition;
                      return (
                        <button
                          key={pos}
                          type="button"
                          onClick={() => setStartPosition(pos)}
                          className={cn(
                            "h-7 border rounded text-[9px] font-black uppercase transition-all flex items-center justify-center relative select-none",
                            isBeforeStart 
                              ? "bg-slate-200 border-slate-300 text-slate-400/60 line-through cursor-pointer"
                              : isStart
                                ? "bg-blue-600 border-blue-600 text-white shadow-sm font-extrabold ring-2 ring-blue-500/20"
                                : "bg-white border-slate-300 text-slate-700 hover:border-blue-500 hover:bg-blue-50/20"
                          )}
                          title={`Imprimir a partir da posição ${pos}`}
                        >
                          {pos}
                          {isBeforeStart && (
                            <span className="absolute inset-0 bg-red-100/5 diagonal-cross opacity-30 pointer-events-none rounded" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Customization options for Addressing Labels (Pimaco 6180) */}
            {selectedType === 'etiquetas' && (
              <div className="space-y-4 pt-4 border-t border-slate-150">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Configuração das Etiquetas (6180)</h4>
                
                <div className="space-y-3">
                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">Opções de Conteúdo (Se somam na etiqueta)</label>
                    <div className="space-y-2 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                      <label className="flex items-center gap-2.5 text-xs font-semibold text-slate-700 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={labelShowAddress}
                          onChange={(e) => setLabelShowAddress(e.target.checked)}
                          className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500 cursor-pointer"
                        />
                        <span>Endereço Completo</span>
                      </label>
                      <label className="flex items-center gap-2.5 text-xs font-semibold text-slate-700 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={labelShowBirthday}
                          onChange={(e) => setLabelShowBirthday(e.target.checked)}
                          className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500 cursor-pointer"
                        />
                        <span>Data de Nascimento</span>
                      </label>
                      <label className="flex items-center gap-2.5 text-xs font-semibold text-slate-700 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={labelShowMatricula}
                          onChange={(e) => setLabelShowMatricula(e.target.checked)}
                          className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500 cursor-pointer"
                        />
                        <span>Nº de Matrícula (RA)</span>
                      </label>
                      <label className="flex items-center gap-2.5 text-xs font-semibold text-slate-700 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={labelShowCourse}
                          onChange={(e) => setLabelShowCourse(e.target.checked)}
                          className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500 cursor-pointer"
                        />
                        <span>Nome da Turma / Curso</span>
                      </label>
                    </div>
                    <p className="text-[8.5px] text-slate-400 font-semibold italic leading-snug">
                      * O nome do aluno é sempre exibido. As opções marcadas serão somadas e empilhadas na etiqueta.
                    </p>
                  </div>

                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">Bordas Guia de Corte?</label>
                    <input 
                      type="checkbox"
                      checked={showLabelCutBorders}
                      onChange={(e) => setShowLabelCutBorders(e.target.checked)}
                      className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div className="space-y-2 pt-2 border-t border-slate-100">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Modo de Preenchimento</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setLabelFillMode('individual')}
                      className={cn(
                        "py-2 px-2 border rounded-lg text-[9px] font-black uppercase tracking-wider transition-all",
                        labelFillMode === 'individual'
                          ? "bg-slate-900 border-slate-900 text-white shadow-sm animate-none"
                          : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                      )}
                    >
                      Sequencial
                    </button>
                    <button
                      type="button"
                      onClick={() => setLabelFillMode('repeat')}
                      className={cn(
                        "py-2 px-2 border rounded-lg text-[9px] font-black uppercase tracking-wider transition-all",
                        labelFillMode === 'repeat'
                          ? "bg-slate-900 border-slate-900 text-white shadow-sm animate-none"
                          : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                      )}
                    >
                      Repetir 1º
                    </button>
                  </div>
                  {labelFillMode === 'repeat' && (
                    <p className="text-[8.5px] font-medium text-blue-600 italic leading-snug">
                      * Repete o primeiro aluno selecionado em todas as etiquetas disponíveis na folha.
                    </p>
                  )}
                </div>

                <div className="space-y-2 pt-2 border-t border-slate-100">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Posição Inicial na Folha (6180)</label>
                    <span className="text-[9.5px] font-mono font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                      Posição: {labelStartPosition}
                    </span>
                  </div>
                  <p className="text-[8.5px] text-slate-400 font-medium leading-normal">
                    Selecione onde começará a impressão (1 a 30). Útil para reaproveitar folhas Pimaco já começadas.
                  </p>
                  
                  {/* Visual 3x10 Grid representing 30 Pimaco labels on Letter sheet */}
                  <div className="grid grid-cols-3 gap-1 max-w-[210px] mx-auto bg-slate-50 p-1.5 border border-slate-200 rounded-lg">
                    {Array.from({ length: 30 }).map((_, idx) => {
                      const pos = idx + 1;
                      const isBeforeStart = pos < labelStartPosition;
                      const isStart = pos === labelStartPosition;
                      return (
                        <button
                          key={pos}
                          type="button"
                          onClick={() => setLabelStartPosition(pos)}
                          className={cn(
                            "h-6 border rounded text-[8px] font-black uppercase transition-all flex items-center justify-center relative select-none",
                            isBeforeStart 
                              ? "bg-slate-200 border-slate-300 text-slate-400/60 line-through cursor-pointer"
                              : isStart
                                ? "bg-blue-600 border-blue-600 text-white shadow-sm font-extrabold ring-2 ring-blue-500/10"
                                : "bg-white border-slate-200 text-slate-700 hover:border-blue-500 hover:bg-blue-50/20"
                          )}
                          title={`Imprimir a partir da posição ${pos}`}
                        >
                          {pos}
                          {isBeforeStart && (
                            <span className="absolute inset-0 bg-red-100/5 diagonal-cross opacity-35 pointer-events-none rounded" />
                          )}
                        </button>
                      );
                    })}
                  </div>
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
                    maxLength={35}
                    className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Título Cargo</label>
                  <input 
                    type="text"
                    value={signerTitle}
                    onChange={(e) => setSignerTitle(e.target.value)}
                    maxLength={30}
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
        <div className="lg:col-span-8 space-y-4 lg:max-h-[calc(100vh-190px)] lg:overflow-y-auto pr-2 custom-scrollbar pb-10 print:pb-0 print:p-0 print:m-0 print:max-h-none print:overflow-visible">
          <div className="flex items-center justify-between print:hidden">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
              Pré-Visualização do Documento {(selectedType === 'carteirinhas' || selectedType === 'etiquetas') ? '(Formato Carta)' : '(Formato A4)'}
            </h3>
            <span className="text-[9px] bg-slate-100 font-black text-slate-600 uppercase tracking-widest px-2 py-0.5 border border-slate-200">
              {(selectedType === 'carteirinhas' || selectedType === 'etiquetas') ? 'Papel Carta Real' : 'Papel A4 Real'}
            </span>
          </div>

          {/* Standard Page Container - Mocking A4 Sheet */}
          <div 
            id="printable-impressos" 
            className={cn(
              "print-preview-container select-text relative flex flex-col",
              (selectedType === 'carteirinhas' || selectedType === 'etiquetas')
                ? "bg-transparent border-none shadow-none p-0 max-w-none w-auto"
                : cn(
                    "bg-white border border-slate-350 shadow-xl pt-8 px-8 md:pt-12 md:px-12 max-w-[800px] mx-auto",
                    isSinglePageType ? "h-[1123px] pb-2 md:pb-3" : "min-h-[1123px] pb-3 md:pb-4"
                  )
            )}
          >
            
            {/* Header of Official Documents */}
            {(selectedType === 'declaracao' || selectedType === 'quitacao' || selectedType === 'ficha' || selectedType === 'carta') && (
              <div className={cn(
                "flex items-center gap-6 pb-4 border-b-2 border-black text-left",
                selectedType === 'ficha' ? "mb-1 pb-2" : "mb-8 pb-4"
              )}>
                <div className="flex-shrink-0 w-24 h-24 flex items-center justify-center">
                  {institution?.logo_url ? (
                    <img src={institution.logo_url} className="w-full h-full object-contain max-h-24" referrerPolicy="no-referrer" alt="Logo" />
                  ) : (
                    <div className="w-full h-full border-2 border-slate-300 border-dashed flex flex-col items-center justify-center text-[8pt] text-slate-400 font-bold uppercase">
                      <span className="leading-none">SEM</span>
                      <span className="leading-none">LOGO</span>
                    </div>
                  )}
                </div>
                <div className="flex-1 flex flex-col">
                  <p className="text-[10px] md:text-[10pt] font-semibold tracking-widest text-slate-800 leading-tight uppercase font-sans">
                    {institution?.city_uf ? `DIOCESE DE ${institution.city_uf.split('/')[0].toUpperCase()}` : 'DIOCESE DE GUARULHOS'}
                  </p>
                  <h1 className="text-[16px] md:text-[17pt] font-bold uppercase tracking-tight text-black leading-tight my-0.5 font-sans">
                    {institution?.name || 'ESCOLA DIOCESANA DE MINISTÉRIOS'}
                  </h1>
                  {institution?.subtitle && (
                    <p className="text-[10px] md:text-[10.5pt] font-bold text-slate-700 tracking-wide mt-0.5 uppercase font-sans">
                      {institution.subtitle}
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-x-2 text-[9px] text-slate-500 font-bold uppercase tracking-wider pt-1 mt-1 border-t border-slate-150 font-sans">
                    {[
                      institution?.cnpj ? `CNPJ: ${institution.cnpj}` : '',
                      institution?.address ? institution.address : '',
                      (institution?.city_uf && (!institution?.address || !institution.address.toLowerCase().includes(institution.city_uf.toLowerCase()))) ? institution.city_uf : '',
                      institution?.phone ? `TEL: ${institution.phone}` : ''
                    ].filter(Boolean).map((text, idx, arr) => (
                      <React.Fragment key={idx}>
                        <span>{text}</span>
                        {idx < arr.length - 1 && <span className="text-slate-300">|</span>}
                      </React.Fragment>
                    ))}
                  </div>
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
                      <h2 className="text-[20px] font-extrabold uppercase tracking-[0.2em] font-serif pb-2 max-w-md mx-auto">
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
                        {institution?.city_uf || 'Catedral Geral'}, {formatLongDate(documentDate)}
                      </p>
                    </div>

                    {/* Signatures Footer */}
                    <div className="pt-24 flex items-end justify-around font-sans">
                      {signerRole !== 'diretor' && (
                        <div className="flex flex-col items-center gap-1.5 text-center">
                          <div className="w-56 border-b border-black" />
                          <p className="text-[11px] font-bold text-slate-900 uppercase tracking-widest">
                            {signerName}
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
                            {signerRole === 'ambos' ? coSignerName : signerName}
                          </p>
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                            {signerRole === 'ambos' ? coSignerTitle : signerTitle}
                          </p>
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center py-32 text-center space-y-4">
                    <div className="p-4 bg-slate-50 border border-slate-150 rounded-full text-slate-400">
                      <Search size={32} className="stroke-[1.5]" />
                    </div>
                    <div className="space-y-1.5 max-w-sm">
                      <h4 className="text-[12px] font-black text-slate-800 uppercase tracking-widest">Nenhum Aluno Selecionado</h4>
                      <p className="text-[11px] text-slate-500 leading-normal">
                        Para emitir a <strong>Declaração de Matrícula</strong>, por favor busque e selecione o aluno desejado no painel de configurações à esquerda.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}


            {/* 2. FICHA DE INSCRIÇÃO (CADASTRAL EM BRANCO) */}
            {selectedType === 'ficha' && (
              <div className="flex-1 flex flex-col justify-between min-h-[920px] text-[10pt] leading-relaxed font-sans text-black">
                <div className="space-y-3.5">
                  {/* Title */}
                  <div className="text-center pt-0">
                    <h2 className="text-[14pt] font-extrabold uppercase tracking-widest text-black max-w-xs mx-auto">
                      Ficha de Inscrição
                    </h2>
                  </div>

                  {/* Sub-header grid: Controle da Escola, Curso selection, and Foto box */}
                  <div className="grid grid-cols-12 gap-4 border-2 border-slate-900 p-3 items-stretch">
                    {/* Left: Controle da Escola */}
                    <div className="col-span-4 border-r-2 border-slate-900 pr-3 flex flex-col justify-between">
                      <div>
                        <h4 className="text-[10px] font-black uppercase tracking-wider text-slate-900 border-b-2 border-slate-900 pb-1 mb-2">
                          Controle da Escola
                        </h4>
                        <div className="space-y-3">
                          <div>
                            <p className="text-[11px] font-bold uppercase text-slate-800">Inscrição:</p>
                            <div className="mt-1 h-8 w-40 border-2 border-slate-900 rounded bg-white flex items-center px-2">
                              <span className="text-[12px] font-black text-slate-600 uppercase tracking-widest">Nº</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Middle: CURSO selection */}
                    <div className="col-span-5 border-r-2 border-slate-900 pr-3 flex flex-col justify-between">
                      <div>
                        <h4 className="text-[10px] font-black uppercase tracking-wider text-slate-900 border-b-2 border-slate-900 pb-1 mb-2">
                          CURSO:
                        </h4>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-[12px] font-bold text-slate-800">
                          <div className="flex items-center gap-2">
                            <div className="w-4 h-4 border-2 border-slate-900 rounded-sm shrink-0 bg-white" />
                            <span>Teologia</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-4 h-4 border-2 border-slate-900 rounded-sm shrink-0 bg-white" />
                            <span>Latim</span>
                          </div>
                          <div className="flex items-center gap-2 mb-0.5">
                            <div className="w-4 h-4 border-2 border-slate-900 rounded-sm shrink-0 bg-white" />
                            <span>Doutrina Social da Igreja</span>
                          </div>
                          <div className="flex items-center gap-2 mb-0.5">
                            <div className="w-4 h-4 border-2 border-slate-900 rounded-sm shrink-0 bg-white" />
                            <span>História dos Santos Negros</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Right: COLE FOTO */}
                    <div className="col-span-3 flex items-center justify-center">
                      <div className="w-[3cm] h-[4cm] border-2 border-dashed border-slate-800 flex flex-col items-center justify-center text-center p-1 bg-white">
                        <span className="text-[8px] font-black text-slate-700 uppercase tracking-wider leading-tight">COLE AQUI</span>
                        <span className="text-[8px] font-black text-slate-700 uppercase tracking-wider leading-tight mt-0.5">FOTO 3X4</span>
                      </div>
                    </div>
                  </div>

                  {/* Form Fields Section */}
                  <div className="space-y-3 pt-1">
                    <div className="flex items-end gap-2">
                      <span className="font-bold text-slate-700 uppercase text-[11px] tracking-wider shrink-0">Nome:</span>
                      <div className="flex-1 border-b-2 border-dotted border-slate-500 h-5">&nbsp;</div>
                    </div>

                    <div className="flex items-end gap-2">
                      <span className="font-bold text-slate-700 uppercase text-[11px] tracking-wider shrink-0">Endereço:</span>
                      <div className="flex-1 border-b-2 border-dotted border-slate-500 h-5">&nbsp;</div>
                    </div>

                    <div className="grid grid-cols-12 gap-x-4 gap-y-2">
                      <div className="col-span-5 flex items-end gap-2">
                        <span className="font-bold text-slate-700 uppercase text-[11px] tracking-wider shrink-0">Bairro:</span>
                        <div className="flex-1 border-b-2 border-dotted border-slate-500 h-5">&nbsp;</div>
                      </div>
                      <div className="col-span-5 flex items-end gap-2">
                        <span className="font-bold text-slate-700 uppercase text-[11px] tracking-wider shrink-0">Cidade:</span>
                        <div className="flex-1 border-b-2 border-dotted border-slate-500 h-5">&nbsp;</div>
                      </div>
                      <div className="col-span-2 flex items-end gap-2">
                        <span className="font-bold text-slate-700 uppercase text-[11px] tracking-wider shrink-0">Uf:</span>
                        <div className="flex-1 border-b-2 border-dotted border-slate-500 h-5">&nbsp;</div>
                      </div>
                    </div>

                    <div className="grid grid-cols-12 gap-x-4 gap-y-2">
                      <div className="col-span-4 flex items-end gap-2">
                        <span className="font-bold text-slate-700 uppercase text-[11px] tracking-wider shrink-0">Cep:</span>
                        <div className="flex-1 border-b-2 border-dotted border-slate-500 h-5">&nbsp;</div>
                      </div>
                      <div className="col-span-8 flex items-end gap-2">
                        <span className="font-bold text-slate-700 uppercase text-[11px] tracking-wider shrink-0">Email:</span>
                        <div className="flex-1 border-b-2 border-dotted border-slate-500 h-5">&nbsp;</div>
                      </div>
                    </div>

                    <div className="grid grid-cols-12 gap-x-4 gap-y-2">
                      <div className="col-span-5 flex items-end gap-2">
                        <Phone size={15} className="text-slate-800 shrink-0 mb-1" />
                        <div className="flex-1 border-b-2 border-dotted border-slate-500 h-5 relative">
                          <span className="absolute left-1 bottom-0 text-[13px] text-slate-800 font-bold tracking-wide">( &nbsp; &nbsp; &nbsp; ) &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; - &nbsp; &nbsp; &nbsp; &nbsp;</span>
                        </div>
                      </div>
                      <div className="col-span-3 flex items-center gap-2 self-end h-5">
                        <MessageCircle size={15} className="text-emerald-600 fill-emerald-100 shrink-0" />
                        <div className="flex items-center gap-1.5 text-[10px] font-bold">
                          <span>Sim</span>
                          <div className="w-3.5 h-3.5 border-2 border-slate-900 rounded-sm bg-white" />
                        </div>
                        <div className="flex items-center gap-1.5 text-[10px] font-bold">
                          <span>Não</span>
                          <div className="w-3.5 h-3.5 border-2 border-slate-900 rounded-sm bg-white" />
                        </div>
                      </div>
                      <div className="col-span-4 flex items-end gap-1.5">
                        <span className="font-bold text-slate-700 uppercase text-[11px] tracking-wider shrink-0 mb-0.5">Nasc.:</span>
                        <div className="text-slate-500 font-mono text-[10px] pb-0.5">______ / ______ / ________</div>
                      </div>
                    </div>

                    <div className="grid grid-cols-12 gap-x-4 gap-y-2">
                      <div className="col-span-6 flex items-end gap-2">
                        <span className="font-bold text-slate-700 uppercase text-[11px] tracking-wider shrink-0">RG:</span>
                        <div className="flex-1 border-b-2 border-dotted border-slate-500 h-5">&nbsp;</div>
                      </div>
                      <div className="col-span-6 flex items-end gap-2">
                        <span className="font-bold text-slate-700 uppercase text-[11px] tracking-wider shrink-0">CPF:</span>
                        <div className="flex-1 border-b-2 border-dotted border-slate-500 h-5">&nbsp;</div>
                      </div>
                    </div>

                    <div className="flex items-end gap-2">
                      <span className="font-bold text-slate-700 uppercase text-[11px] tracking-wider shrink-0">É participante de qual Paróquia/Comunidade?:</span>
                      <div className="flex-1 border-b-2 border-dotted border-slate-500 h-5">&nbsp;</div>
                    </div>

                    <div className="flex items-center gap-4">
                      <span className="font-bold text-slate-700 uppercase text-[11px] tracking-wider shrink-0">Já foi aluno(a) da Escola?:</span>
                      <div className="flex items-center gap-1.5 text-[11px] font-bold">
                        <span>Sim</span>
                        <div className="w-3.5 h-3.5 border-2 border-slate-900 rounded-sm bg-white" />
                      </div>
                      <div className="flex items-center gap-1.5 text-[11px] font-bold">
                        <span>Não</span>
                        <div className="w-3.5 h-3.5 border-2 border-slate-900 rounded-sm bg-white" />
                      </div>
                    </div>
                  </div>

                  {/* Admission Instructions */}
                  <div className="pt-4 border-t border-slate-200">
                    <h3 className="font-extrabold uppercase text-[9.5px] tracking-wider text-slate-800 text-center border-b border-slate-200 pb-1 mb-2">
                      Informações básicas para admissão ao curso escolhido
                    </h3>
                    <ul className="text-[9px] text-slate-700 leading-relaxed space-y-1 font-medium list-none px-1">
                      {admissionNorms.map((norm, index) => {
                        const hasIndexPrefix = /^\s*[0-9]+[\s\)\.\-]/i.test(norm);
                        return (
                          <li key={index}>
                            {!hasIndexPrefix && <strong className="text-slate-900">{index + 1}) </strong>}
                            {norm}
                          </li>
                        );
                      })}
                    </ul>
                  </div>

                  {/* Agreement and signature */}
                  <div className="pt-4 space-y-6 font-serif">
                    <p className="text-[12px] text-justify text-slate-800 leading-relaxed">
                      Eu <span className="inline-block w-[380px] border-b-2 border-dotted border-slate-500 h-4 translate-y-0.5">&nbsp;</span>, declaro que estou ciente e de ACORDO com as normas estabelecidas para ingresso no curso Básico de Teologia, promovido pela Diocese de Guarulhos e autorizo o armazenamento de meus dados pessoais necessários para a inscrição neste curso.
                    </p>

                    <div className="pt-6 pb-12 flex justify-between items-start gap-8 font-sans">
                      <div className="w-1/2 flex flex-col">
                        <div className="flex items-end gap-1.5 text-[11px] text-slate-800 font-medium h-6 pb-0.5">
                          <span className="shrink-0 font-bold">Guarulhos,</span>
                          <div className="flex-1 text-center text-slate-500 font-mono text-[10px]">______ / ______ / _________</div>
                        </div>
                        <div className="mt-1 text-[9px] invisible select-none">&nbsp;</div>
                      </div>
                      <div className="w-1/2 shrink-0 flex flex-col items-center">
                        <div className="w-2/3 border-b-2 border-slate-500 h-6">&nbsp;</div>
                        <span className="text-[9.5px] font-black text-slate-500 uppercase tracking-widest mt-1.5 text-center">Aluno(a)</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Document Footer Divider */}
                <div className="pt-1.5 border-t border-black mt-auto flex flex-col justify-end">
                  <div className="grid grid-cols-12 gap-4 items-start text-left text-[8px] leading-tight text-slate-600 font-sans pt-0.5">
                    <div className="col-span-7 space-y-0.5">
                      <p className="font-black uppercase tracking-wider text-slate-900">ENDEREÇO:</p>
                      <p className="font-semibold uppercase">{institution?.address || 'Avenida Vênus, 195 - Itapegica - Guarulhos-SP'}</p>
                      <p className="font-semibold uppercase">Telefone: {institution?.phone || '(11) 2421-2935'}</p>
                      <p className="font-semibold uppercase">Email: {institution?.email || 'edm@diocesedeguarulhos.org.br'}</p>
                    </div>
                    <div className="col-span-5 text-right space-y-0.5">
                      <p className="font-black uppercase tracking-wider text-slate-900">ATENDIMENTO SECRETARIA:</p>
                      <p className="font-semibold uppercase">De Quarta à Sexta-feira das 14h às 18h</p>
                    </div>
                  </div>
                  <div className="text-center pt-1.5 border-t border-slate-100 mt-1.5 text-[7px] text-slate-400 uppercase tracking-widest font-sans font-medium">
                    Copyright © {institution?.name || 'Escola Diocesana de Ministérios'}
                  </div>
                </div>
              </div>
            )}


            {/* 2.2 CARTA DE APRESENTAÇÃO */}
            {selectedType === 'carta' && (
              <div className="flex-1 flex flex-col justify-between min-h-[920px] space-y-6 text-[10.5pt] leading-relaxed font-sans text-black">
                <div className="space-y-6">
                  {/* Title */}
                  <div className="text-center pt-2">
                    <h2 className="text-[14pt] font-extrabold uppercase tracking-widest text-black pb-1.5 max-w-sm mx-auto">
                      Carta de Apresentação
                    </h2>
                  </div>

                  {/* Recipient */}
                  <div className="space-y-1 text-left pt-2 font-serif">
                    <p className="text-[12pt] font-bold text-slate-800">À</p>
                    <p className="text-[12pt] font-black uppercase tracking-wide text-slate-900">Escola Diocesana de Ministérios</p>
                    <p className="text-[11pt] font-bold text-slate-700 italic">Pe. José Fernando de Brito</p>
                  </div>

                  {/* Letter body with blank lines */}
                  <div className="space-y-5 pt-4 text-justify font-serif text-[11pt] leading-[2.2em]">
                    <div className="flex flex-wrap items-end gap-x-2">
                      <span>Eu, Padre</span>
                      <span className="flex-1 border-b-2 border-dotted border-slate-500 min-w-[200px] h-5 inline-block">&nbsp;</span>
                    </div>

                    <div className="flex items-center gap-6 text-[10px] font-bold font-sans uppercase pl-2 select-none">
                      <div className="flex items-center gap-1.5">
                        <div className="w-3.5 h-3.5 border-2 border-slate-900 rounded-sm shrink-0 bg-white" />
                        <span>pároco</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="w-3.5 h-3.5 border-2 border-slate-900 rounded-sm shrink-0 bg-white" />
                        <span>vigário</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="w-3.5 h-3.5 border-2 border-slate-900 rounded-sm shrink-0 bg-white" />
                        <span>adm. paroquial</span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-end gap-x-2">
                      <span>da Paróquia:</span>
                      <span className="flex-1 border-b-2 border-dotted border-slate-500 min-w-[300px] h-5 inline-block">&nbsp;</span>
                    </div>

                    <p>venho através desta apresentar,</p>

                    <div className="flex flex-wrap items-end gap-x-2">
                      <span>O(a) Sr.(a)</span>
                      <span className="flex-1 border-b-2 border-dotted border-slate-500 min-w-[300px] h-5 inline-block">&nbsp;</span>
                    </div>

                    <div className="flex flex-wrap items-end gap-x-2 leading-[2em]">
                      <span>membro da comunidade paroquial para o CURSO DE TEOLOGIA.</span>
                    </div>
                  </div>

                  {/* Date & Signature */}
                  <div className="pt-10 flex justify-between items-start gap-8 font-sans">
                    <div className="w-1/2 flex flex-col">
                      <div className="flex items-end gap-1.5 text-[10px] text-slate-800 font-medium h-6 pb-0.5">
                        <span className="shrink-0 font-bold">Guarulhos,</span>
                        <div className="flex-1 text-center text-slate-500 font-mono text-[9px]">______ / ______ / _________</div>
                      </div>
                      <div className="mt-1 text-[9px] invisible select-none">&nbsp;</div>
                    </div>
                    <div className="w-1/2 shrink-0 flex flex-col items-center">
                      <div className="w-2/3 border-b-2 border-slate-500 h-6">&nbsp;</div>
                      <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest mt-1 text-center">Assinatura do Padre</span>
                    </div>
                  </div>

                  {/* Stamps & Requirements box */}
                  <div className="pt-8 grid grid-cols-12 gap-4 items-stretch">
                    {/* Left: Parish Stamp */}
                    <div className="col-span-5 flex items-center justify-center">
                      <div className="w-36 h-36 relative flex flex-col items-center justify-center text-center p-2 select-none">
                        {/* Realistic hand-drawn double-stroke gray marker watermark */}
                        <svg 
                          viewBox="0 0 100 80" 
                          className="absolute inset-0 w-full h-full text-slate-400/20 pointer-events-none stroke-[2.5]" 
                          fill="none" 
                          stroke="currentColor" 
                          strokeLinecap="round"
                        >
                          {/* Inner soft stroke */}
                          <path d="M 45,18 C 25,19 12,28 10,42 C 8,56 18,68 38,71 C 58,74 85,69 92,54 C 99,39 94,27 78,21 C 63,15 38,18 28,22" />
                          {/* Outer overlapping stroke */}
                          <path d="M 48,14 C 28,15 15,24 13,38 C 11,52 21,64 42,67 C 63,70 88,64 95,49 C 102,34 96,22 81,16 C 66,10 44,13 34,17" />
                        </svg>
                        <span className="text-[9px] font-black text-slate-300/20 uppercase tracking-wider leading-tight z-10">Carimbo</span>
                        <span className="text-[9px] font-black text-slate-300/20 uppercase tracking-wider leading-tight z-10">da</span>
                        <span className="text-[9px] font-black text-slate-300/20 uppercase tracking-wider leading-tight z-10">Paróquia</span>
                      </div>
                    </div>

                    {/* Right: Requirements Callout Box */}
                    <div className="col-span-7 bg-slate-50 border border-slate-300 p-4 rounded-none font-sans text-left space-y-1.5">
                      <h4 className="text-[9.5px] font-black uppercase tracking-wider text-slate-800 border-b border-slate-200 pb-1 mb-1">
                        Para efetivar a matrícula,
                      </h4>
                      <ol className="text-[8.5px] text-slate-700 font-semibold space-y-1 list-none leading-normal">
                        {presentationInfo.map((item, index) => {
                          const hasIndexPrefix = /^\s*[0-9]+[\s\)\.\-]/i.test(item);
                          return (
                            <li key={index}>
                              {!hasIndexPrefix && <strong className="text-slate-950">{index + 1} - </strong>}
                              {item}
                            </li>
                          );
                        })}
                      </ol>
                    </div>
                  </div>
                </div>

                {/* Document Footer Divider */}
                <div className="pt-1.5 border-t border-black mt-auto flex flex-col justify-end">
                  <div className="grid grid-cols-12 gap-4 items-start text-left text-[8px] leading-tight text-slate-600 font-sans pt-0.5">
                    <div className="col-span-7 space-y-0.5">
                      <p className="font-black uppercase tracking-wider text-slate-900">ENDEREÇO:</p>
                      <p className="font-semibold uppercase">{institution?.address || 'Avenida Vênus, 195 - Itapegica - Guarulhos-SP'}</p>
                      <p className="font-semibold uppercase">Telefone: {institution?.phone || '(11) 2421-2935'}</p>
                      <p className="font-semibold uppercase">Email: {institution?.email || 'edm@diocesedeguarulhos.org.br'}</p>
                    </div>
                    <div className="col-span-5 text-right space-y-0.5">
                      <p className="font-black uppercase tracking-wider text-slate-900">ATENDIMENTO SECRETARIA:</p>
                      <p className="font-semibold uppercase">De Quarta à Sexta-feira das 14h às 18h</p>
                    </div>
                  </div>
                  <div className="text-center pt-1.5 border-t border-slate-100 mt-1.5 text-[7px] text-slate-400 uppercase tracking-widest font-sans font-medium">
                    Copyright © {institution?.name || 'Escola Diocesana de Ministérios'}
                  </div>
                </div>
              </div>
            )}


            {/* 3. ETIQUETAS PARA CARTEIRINHA (PIMACO 8099F) */}
            {selectedType === 'carteirinhas' && (
              <div className="space-y-8 font-sans">
                {cardItemsForPrinting.length === 0 ? (
                  <div className="text-center py-20 bg-white border border-slate-150 rounded-xl text-slate-400 font-bold uppercase tracking-widest text-[10px] space-y-2 print:hidden">
                    <Info size={24} className="mx-auto text-slate-300" />
                    <p>Nenhum aluno selecionado para impressão de etiquetas para carteirinha.</p>
                    <p className="text-[9px] text-slate-450 normal-case">Selecione os alunos da turma na aba lateral esquerda para gerar as etiquetas.</p>
                  </div>
                ) : (
                  <div>
                    {/* Header for ID card page in preview */}
                    <div className="text-center pb-4 border-b border-slate-200 mb-6 print:hidden">
                      <h2 className="text-xs font-black text-slate-500 uppercase tracking-widest">
                        Modelo de Etiquetas para Carteirinha (Pimaco 8099F / Avery 5163 / Avery 8163)
                      </h2>
                      <p className="text-[10px] text-slate-400 mt-1 max-w-md mx-auto leading-normal">
                        Etiquetas de <strong>99,1mm x 50,8mm</strong> (10 por folha Carta). As posições puladas serão deixadas em branco para reaproveitamento de folhas.
                      </p>
                      <div className="mt-3 flex justify-center gap-4 text-[9px] font-mono font-bold text-slate-500">
                        <span className="bg-slate-100 px-2 py-0.5 rounded border border-slate-200 animate-none">
                          Etiquetas Ativas: {selectedCardStudentIds.length}
                        </span>
                        <span className="bg-slate-100 px-2 py-0.5 rounded border border-slate-200 animate-none">
                          Total de Folhas: {cardItemsForPrinting.length}
                        </span>
                      </div>
                    </div>

                    {/* Sheets list container */}
                    <div className="space-y-12 print:space-y-0">
                      {cardItemsForPrinting.map((sheet, sheetIdx) => (
                        <div key={sheetIdx} className="space-y-2 print:space-y-0">
                          {/* Sheet indicator for screen */}
                          <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-center mt-6 mb-2 print:hidden flex items-center justify-center gap-1.5">
                            <span className="w-6 h-[1px] bg-slate-200" />
                            Folha {sheetIdx + 1} de {cardItemsForPrinting.length}
                            <span className="w-6 h-[1px] bg-slate-200" />
                          </div>

                          {/* 10-Label Grid representing physical Letter Sheet */}
                          <div className={cn(
                            "pimaco-sheet bg-white shadow-xl mx-auto border border-slate-200 print:shadow-none print:border-none print:m-0 box-border",
                            sheetIdx < cardItemsForPrinting.length - 1 && "print-page-break"
                          )}>
                            {sheet.map((student, slotIdx) => {
                              if (!student) {
                                // Empty label / blank slot (for skipped or empty positions)
                                return (
                                  <div 
                                    key={`empty-${sheetIdx}-${slotIdx}`} 
                                    className="pimaco-label flex flex-col items-center justify-center text-center p-2 border border-dashed border-slate-200/60 bg-slate-50/20 print:bg-transparent print:border-none print:opacity-0 select-none"
                                  >
                                    <span className="text-[8px] font-black uppercase tracking-wider text-slate-350 print:hidden">Etiqueta {slotIdx + 1}</span>
                                    <span className="text-[6px] font-bold uppercase tracking-tight mt-0.5 text-slate-350/80 print:hidden">(Vazio / Pulado)</span>
                                  </div>
                                );
                              }

                              // Filled card slot
                              return (
                                <div 
                                  key={`filled-${sheetIdx}-${slotIdx}-${student.id}`} 
                                  className="pimaco-label p-2.5 bg-white flex flex-row items-stretch gap-3.5 relative box-border select-none overflow-hidden"
                                >
                                  {/* Inner subtle alignment line */}
                                  <div className="absolute inset-1 border border-slate-900/10 pointer-events-none rounded" />

                                  {/* Left: Photo Slot (3x4 aspect ratio, scaled for card height) */}
                                  <div className="flex flex-col justify-center shrink-0">
                                    <div className={cn(
                                      "w-[21mm] h-[28mm] bg-slate-50 flex items-center justify-center overflow-hidden shrink-0 rounded-sm relative z-10",
                                      showPhotoBorder ? "border border-slate-950" : "border border-slate-150"
                                    )}>
                                      {student.photo_url ? (
                                        <img src={student.photo_url} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                      ) : (
                                        <div className="text-center p-1">
                                          <User className="text-slate-300 mx-auto" size={16} />
                                          <span className="text-[5.5px] text-slate-400 font-bold block uppercase mt-0.5">FOTO 3X4</span>
                                        </div>
                                      )}
                                    </div>
                                  </div>

                                  {/* Right: Info Area */}
                                  <div className="flex-1 min-w-0 flex flex-col justify-between h-full py-0.5 relative z-10 text-left">
                                    {/* Logo and Inst. Header */}
                                    <div className="flex items-center gap-1.5 pb-1 border-b border-slate-900/15">
                                      <div className="w-5 h-5 border border-slate-900/10 flex items-center justify-center bg-white shrink-0 overflow-hidden rounded-sm">
                                        {institution?.logo_url ? (
                                          <img 
                                            src={institution.logo_url} 
                                            alt="" 
                                            className="w-full h-full object-contain" 
                                            referrerPolicy="no-referrer" 
                                          />
                                        ) : (
                                          <span className="font-black text-[6.5px] text-slate-800 uppercase leading-none">
                                            {getInstitutionLogoText()}
                                          </span>
                                        )}
                                      </div>
                                      <h4 className="text-[8px] font-black uppercase tracking-wider text-slate-900 truncate">
                                        {institution?.name || 'ESCOLA DE FORMAÇÃO CONCILIAR'}
                                      </h4>
                                    </div>

                                    {/* Main student metadata */}
                                    <div className="space-y-1.5 py-1">
                                      <div>
                                        <span className="text-[5.5px] font-black text-slate-400 uppercase block tracking-wider leading-none">ESTUDANTE</span>
                                        <h5 className="text-[11px] font-black text-slate-950 uppercase truncate tracking-tight leading-none mt-1">
                                          {isFormFilled ? student.name : '________________________'}
                                        </h5>
                                      </div>

                                      <div className="grid grid-cols-2 gap-x-2">
                                        <div>
                                          <span className="text-[5.5px] font-black text-slate-400 uppercase block tracking-wider leading-none">MATRÍCULA / RA</span>
                                          <span className="text-[8.5px] font-bold font-mono text-slate-900 leading-none">
                                            {isFormFilled ? (student.registration_number || 'S/ RA') : '________'}
                                          </span>
                                        </div>
                                        <div>
                                          <span className="text-[5.5px] font-black text-slate-400 uppercase block tracking-wider leading-none">DOCUMENTO (RG/CPF)</span>
                                          <span className="text-[8.5px] font-bold font-mono text-slate-900 leading-none truncate block">
                                            {isFormFilled ? (student.rg || student.cpf || 'Não Consta') : '________'}
                                          </span>
                                        </div>
                                      </div>

                                      <div>
                                        <span className="text-[5.5px] font-black text-slate-400 uppercase block tracking-wider leading-none">CURSO / CLASSE</span>
                                        <span className="text-[8.5px] font-bold text-slate-800 uppercase block truncate leading-none mt-1">
                                          {isFormFilled ? `${student.course || 'CURSO'} - ${activeClass?.name}` : '________________________'}
                                        </span>
                                      </div>
                                    </div>

                                    {/* Footer items */}
                                    <div className="flex items-center justify-between border-t border-slate-900/10 pt-1 mt-auto">
                                      <div>
                                        <span className="text-[5px] font-black text-slate-400 uppercase tracking-wider block leading-none">VALIDADE</span>
                                        <span className="text-[8px] font-black font-mono text-emerald-800 leading-none">DEZ / {new Date().getFullYear()}</span>
                                      </div>
                                      <div className="text-right">
                                        <span className="text-[5px] font-black text-slate-400 uppercase tracking-wider block leading-none">ALUNO(A) DESDE</span>
                                        <span className="text-[7.5px] font-bold font-mono text-slate-800 block leading-none uppercase">
                                          {isFormFilled ? (student.start_date ? formatDateForDisplay(student.start_date) : (student.created_at ? formatDateForDisplay(student.created_at) : 'N/D')) : '________'}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}


            {/* 3.2 ETIQUETAS DE ENDEREÇAMENTO (PIMACO 6180) */}
            {selectedType === 'etiquetas' && (
              <div className="space-y-6 font-sans">
                {labelItemsForPrinting.length === 0 ? (
                  <div className="text-center py-20 bg-white border border-slate-150 rounded-xl text-slate-400 font-bold uppercase tracking-widest text-[10px] space-y-2 print:hidden">
                    <Info size={24} className="mx-auto text-slate-300" />
                    <p>Nenhuma etiqueta de endereçamento selecionada para impressão.</p>
                    <p className="text-[9px] text-slate-450 normal-case">Selecione os alunos da turma na aba lateral esquerda para gerar as etiquetas.</p>
                  </div>
                ) : (
                  <div>
                    {/* Header for labels page in preview */}
                    <div className="text-center pb-4 border-b border-slate-200 mb-6 print:hidden">
                      <h2 className="text-xs font-black text-slate-500 uppercase tracking-widest">
                        Modelo de Etiquetas (Pimaco 6180 / Avery 5160)
                      </h2>
                      <p className="text-[10px] text-slate-400 mt-1 max-w-md mx-auto leading-normal">
                        Etiquetas de <strong>66,7mm x 25,4mm</strong> (30 por folha Carta). As posições puladas serão deixadas em branco para reaproveitamento de folhas.
                      </p>
                      <div className="mt-3 flex justify-center gap-4 text-[9px] font-mono font-bold text-slate-500">
                        <span className="bg-slate-100 px-2 py-0.5 rounded border border-slate-200 animate-none">
                          Etiquetas Ativas: {selectedLabelStudentIds.length}
                        </span>
                        <span className="bg-slate-100 px-2 py-0.5 rounded border border-slate-200 animate-none">
                          Total de Folhas: {labelItemsForPrinting.length}
                        </span>
                      </div>
                    </div>

                    {/* Sheets list container */}
                    <div className="space-y-12 print:space-y-0">
                      {labelItemsForPrinting.map((sheet, sheetIdx) => (
                        <div key={sheetIdx} className="space-y-2 print:space-y-0">
                          {/* Sheet indicator for screen */}
                          <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-center mt-6 mb-2 print:hidden flex items-center justify-center gap-1.5">
                            <span className="w-6 h-[1px] bg-slate-200" />
                            Folha {sheetIdx + 1} de {labelItemsForPrinting.length}
                            <span className="w-6 h-[1px] bg-slate-200" />
                          </div>

                          {/* 30-Label Grid representing physical Letter Sheet */}
                          <div className={cn(
                            "pimaco-sheet-6180 bg-white shadow-xl mx-auto border border-slate-200 print:shadow-none print:border-none print:m-0 box-border",
                            sheetIdx < labelItemsForPrinting.length - 1 && "print-page-break"
                          )}>
                            {sheet.map((student, slotIdx) => {
                              if (!student) {
                                // Empty label / blank slot (for skipped or empty positions)
                                return (
                                  <div 
                                    key={`empty-${sheetIdx}-${slotIdx}`} 
                                    className="pimaco-label-6180 flex flex-col items-center justify-center text-center p-1 border border-dashed border-slate-200/50 bg-slate-50/10 print:bg-transparent print:border-none print:opacity-0 select-none"
                                  >
                                    <span className="text-[7px] font-bold uppercase tracking-wider text-slate-300 print:hidden">Etiqueta {slotIdx + 1}</span>
                                    <span className="text-[5.5px] font-semibold uppercase tracking-tight mt-0.5 text-slate-300/80 print:hidden">(Vazio)</span>
                                  </div>
                                );
                              }

                              // Filled card slot
                              return (
                                <div 
                                  key={`filled-${sheetIdx}-${slotIdx}-${student.id}`} 
                                  className="pimaco-label-6180 bg-white flex flex-col justify-between relative box-border select-none text-left"
                                >
                                  {/* Top part: RA/Matrícula above the name if checked */}
                                  <div className="flex flex-col">
                                    {labelShowMatricula && (
                                      <div className="text-[7.5px] font-mono font-bold text-slate-500 uppercase tracking-wider leading-none mb-0.5">
                                        Matrícula (RA): <span className="text-slate-800 font-extrabold">{student.registration_number || 'S/ RA'}</span>
                                      </div>
                                    )}
                                    {/* Student Name is always shown */}
                                    <h5 className="text-[10px] font-black text-slate-950 uppercase truncate leading-tight">
                                      {student.name}
                                    </h5>
                                  </div>

                                  {/* Middle part: Address */}
                                  <div className="flex-1 min-h-0 flex flex-col justify-center my-0.5">
                                    {labelShowAddress && (
                                      <div className="text-[8px] text-slate-600 font-semibold leading-tight uppercase space-y-0.5">
                                        {student.address_street ? (
                                          <>
                                            <p className="truncate text-slate-850 font-bold">{student.address_street}{student.address_neighborhood ? ` - ${student.address_neighborhood}` : ''}</p>
                                            <p className="truncate text-slate-500 font-bold text-[7.5px]">CEP: {student.address_zip || 'NÃO CADASTRADO'}</p>
                                            <p className="truncate text-slate-500 font-bold text-[7.5px]">{student.address_city || 'GUARULHOS'} - {student.address_state || 'SP'}</p>
                                          </>
                                        ) : (
                                          <p className="text-slate-400 italic font-semibold text-[7.5px] normal-case">Endereço não cadastrado</p>
                                        )}
                                      </div>
                                    )}
                                  </div>

                                  {/* Bottom part (Footer) */}
                                  {(labelShowCourse || labelShowBirthday) && (
                                    <div className="flex items-center justify-between text-[7.5px] font-bold text-slate-400 border-t border-slate-100 pt-0.5 uppercase tracking-wider mt-auto leading-none">
                                      <div className="truncate pr-2">
                                        {labelShowCourse ? (student.course || 'ESTUDANTE') : ''}
                                      </div>
                                      {labelShowBirthday && (
                                        <div className="flex items-center gap-0.5 text-slate-600 font-extrabold shrink-0 text-right">
                                          <Calendar size={8} className="text-slate-450 shrink-0" />
                                          <span>NASC: {student.birth_date ? formatDateForDisplay(student.birth_date) : 'N/C'}</span>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
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
                    <div className="text-[14px] text-slate-800 leading-[2.4] text-justify font-serif space-y-6 pt-6">
                      <p>
                        A tesouraria e diretoria administrativa da <strong className="text-black font-extrabold uppercase tracking-wide">{institution?.name || 'Escola de Formação Conciliar'}</strong>, no uso de suas competências regimentais, certifica para os devidos fins que o(a) estudante <strong className="text-black font-extrabold uppercase">{activeStudent.name}</strong>, inscrito(a) sob o Registro Geral nº <strong className="text-black font-mono">{activeStudent.registration_number || '---'}</strong>:
                      </p>

                      {pendingPayments.isPending ? (
                        <p>
                          Apresenta <strong className="text-red-700 font-extrabold">pendência financeira em aberto</strong> referente ao(s) mês(es) de <strong className="text-black font-extrabold">{formatPendingMonthsText(pendingPayments.months)}</strong> do ano de <strong className="text-black font-extrabold">{pendingPayments.year}</strong>, não se encontrando plenamente em dia com o caixa desta instituição de ensino até a presente data.
                        </p>
                      ) : (
                        <p>
                          Encontra-se com todas as parcelas e contribuições de ajuda de custo acadêmicas devidamente quitadas e em dia com o caixa desta instituição de ensino, não constando nenhuma pendência financeira ou débito pendente até a presente data.
                        </p>
                      )}

                      <p>
                        Por ser verdade e a pedido da parte interessada para que conste e produza seus devidos fins legais, expedimos e assinamos o presente termo.
                      </p>
                    </div>

                    {/* Location / Date */}
                    <div className="text-right pt-12 text-[12px] font-serif">
                      <p className="uppercase tracking-wide font-bold">
                        {institution?.city_uf || 'Catedral Geral'}, {formatLongDate(documentDate)}
                      </p>
                    </div>

                    {/* Signature */}
                    <div className="pt-24 flex flex-col items-center justify-center font-sans">
                      <div className="flex flex-col items-center gap-1.5 text-center">
                        <div className="w-64 border-b border-black" />
                        <p className="text-[11px] font-bold text-slate-900 uppercase tracking-widest">
                          {signerName}
                        </p>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                          {signerTitle || 'Tesouraria / Gestão de Contas'}
                        </p>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center py-32 text-center space-y-4">
                    <div className="p-4 bg-slate-50 border border-slate-150 rounded-full text-slate-400">
                      <Search size={32} className="stroke-[1.5]" />
                    </div>
                    <div className="space-y-1.5 max-w-sm font-sans">
                      <h4 className="text-[12px] font-black text-slate-800 uppercase tracking-widest">Nenhum Aluno Selecionado</h4>
                      <p className="text-[11px] text-slate-500 leading-normal">
                        Para emitir a <strong>Certidão de Quitação Financeira</strong>, por favor busque e selecione o aluno desejado no painel de configurações à esquerda.
                      </p>
                    </div>
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
