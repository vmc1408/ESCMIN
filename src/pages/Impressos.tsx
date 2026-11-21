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
  Mail,
  MapPin,
  HelpCircle,
  X
} from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { fetchAll } from '../lib/database';
import { Student, Class, Contribution } from '../types';
import { financialService } from '../services/financialService';
import { cn, formatDateForDisplay, filterStudentsForClass, formatRegistrationNumber, normalizeClass, matchesStudentSearch, calculateStudentSearchRank, isInstitutionPhoneWhatsapp } from '../lib/utils';
import { FooterWhatsAppIcon } from '../components/print/StandardPrintLayout';
import { motion, AnimatePresence } from 'motion/react';
import { useSearchParams } from 'react-router-dom';
import { getStudentContributionPlan, formatContributionMonth, isPeriodOverdue } from '../lib/contributionRules';
import { useUnits } from '../contexts/UnitContext';
import { getItemUnitId, isItemInUnit } from '../lib/unitService';
import { DEFAULT_LOGO } from '../lib/default-logo';

type PrintType = 'declaracao' | 'ficha' | 'carteirinhas' | 'quitacao' | 'carta' | 'etiquetas';

const stripEmbeddedSettingsTags = (text?: string | null): string => {
  if (!text) return '';
  let result = text;
  const tagRegex = /\[[A-Z0-9_]+_SETTINGS:/;

  while (true) {
    const match = tagRegex.exec(result);
    if (!match || match.index === undefined) break;

    const startIdx = match.index;
    const scanStart = startIdx + match[0].length;
    let depth = 1;
    let endIdx = -1;

    for (let i = scanStart; i < result.length; i++) {
      if (result[i] === '[') depth++;
      else if (result[i] === ']') {
        depth--;
        if (depth === 0) {
          endIdx = i;
          break;
        }
      }
    }

    if (endIdx === -1) {
      result = result.slice(0, startIdx);
      break;
    }

    result = result.slice(0, startIdx) + result.slice(endIdx + 1);
  }

  return result.trim();
};

export function Impressos() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { selectedUnitId, activeUnits } = useUnits();
  const typeParam = searchParams.get('type') as PrintType | null;

  const [students, setStudents] = useState<Student[]>([]);
  const [enrollments, setEnrollments] = useState<any[]>([]);
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
  const [showPhotoBorder, setShowPhotoBorder] = useState(false);
  const [isFormFilled, setIsFormFilled] = useState(true);

  // Sincroniza classe global e folha @page no head para folhas Carta (Pimaco 6183/6180) tanto no botão quanto por Ctrl+P
  useEffect(() => {
    const isLetterSheet = selectedType === 'carteirinhas' || selectedType === 'etiquetas';
    document.documentElement.classList.toggle('print-letter-sheet', isLetterSheet);
    document.body.classList.toggle('print-letter-sheet', isLetterSheet);

    const styleId = 'impressos-page-size-style';
    let styleEl = document.getElementById(styleId) as HTMLStyleElement | null;
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = styleId;
      document.head.appendChild(styleEl);
    }
    styleEl.textContent = isLetterSheet
      ? '@page { size: letter portrait; margin: 0; } @media print { @page { size: letter portrait; margin: 0; } }'
      : '@page { size: A4 portrait; margin: 0; } @media print { @page { size: A4 portrait; margin: 0; } }';

    return () => {
      document.documentElement.classList.remove('print-letter-sheet');
      document.body.classList.remove('print-letter-sheet');
      const existing = document.getElementById(styleId);
      if (existing) existing.remove();
    };
  }, [selectedType]);

  // States for student cards (Pimaco 6183)
  const [selectedCardStudentIds, setSelectedCardStudentIds] = useState<string[]>([]);
  const [startPosition, setStartPosition] = useState<number>(1);
  const [cardFillMode, setCardFillMode] = useState<'individual' | 'repeat'>('individual');
  const [showCardCutBorders, setShowCardCutBorders] = useState<boolean>(false);

  // States for address labels (Pimaco 6180)
  const [selectedLabelStudentIds, setSelectedLabelStudentIds] = useState<string[]>([]);
  const [labelStartPosition, setLabelStartPosition] = useState<number>(1);
  const [labelFillMode, setLabelFillMode] = useState<'individual' | 'repeat'>('individual');
  const [showLabelCutBorders, setShowLabelCutBorders] = useState<boolean>(false);
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

  // Limpa todas as configurações, seleções e pré-definições ao trocar de módulo de impressão
  useEffect(() => {
    setSelectedStudentId('');
    setSelectedClassId('');
    setStudentSearch('');
    setIsDropdownOpen(false);
    setCustomText('');
    setSignerRole('secretario');
    setSignerName('');
    setSignerTitle('Secretário Acadêmico');
    setCoSignerName('');
    setCoSignerTitle('Diretor Geral');
    setShowPhotoBorder(false);
    setIsFormFilled(true);
    setSelectedCardStudentIds([]);
    setStartPosition(1);
    setCardFillMode('individual');
    setShowCardCutBorders(false);
    setSelectedLabelStudentIds([]);
    setLabelStartPosition(1);
    setLabelFillMode('individual');
    setShowLabelCutBorders(false);
    setLabelShowAddress(false);
    setLabelShowBirthday(false);
    setLabelShowMatricula(false);
    setLabelShowCourse(false);
    setStudentSortOrder('name');
    
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    setDocumentDate(`${year}-${month}-${day}`);
  }, [selectedType]);

  const admissionNorms = useMemo(() => {
    const cleaned = stripEmbeddedSettingsTags(institution?.admission_norms);
    if (cleaned) {
      const lines = cleaned
        .split('\n')
        .map((line: string) => line.trim())
        .filter((line: string) => line.length > 0);
      if (lines.length > 0) return lines;
    }
    return [
      "No ato da matrícula o(a) aluno(a) concorda em priorizar a frequência no curso escolhido.",
      "Como critério de aprovação o(a) aluno(a) deverá ter frequência mínima de 75% das aulas.",
      "A nota mínima exigida para a promoção do(a) aluno(a) é de 5,0 (cinco) por disciplina.",
      "O(a) aluno(a) se compromete a manter em dia a mensalidade estabelecida dentro do prazo de vencimento."
    ];
  }, [institution?.admission_norms]);

  const presentationInfo = useMemo(() => {
    const cleaned = stripEmbeddedSettingsTags(institution?.presentation_info);
    if (cleaned) {
      const lines = cleaned
        .split('\n')
        .map((line: string) => line.trim())
        .filter((line: string) => line.length > 0);
      if (lines.length > 0) return lines;
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
        const [studs, clss, instSettings, conts, enrollmentsData] = await Promise.all([
          fetchAll('students', '*', 'name'),
          fetchAll('classes', '*', 'name'),
          financialService.getInstitutionSettings(),
          financialService.getContributions(),
          fetchAll('enrollments').catch(() => [])
        ]);
        
        const validClassIds = new Set((clss || []).map((c: any) => c.id));
        const normalizedStudents = (studs || []).map((s: Student) => {
          const hasValidDirectClass = s.class_id && validClassIds.has(s.class_id);
          if (!hasValidDirectClass) {
            const activeEnr = (enrollmentsData || []).find((e: any) => 
              e.student_id === s.id && 
              (e.status || 'Ativo') === 'Ativo' && 
              e.class_id && 
              validClassIds.has(e.class_id)
            ) || (enrollmentsData || []).find((e: any) => 
              e.student_id === s.id && 
              e.class_id && 
              validClassIds.has(e.class_id)
            );
            return {
              ...s,
              class_id: activeEnr ? activeEnr.class_id : ''
            };
          }
          return s;
        });

        setStudents(normalizedStudents);
        setEnrollments(enrollmentsData || []);
        setContributions(conts || []);
        
        // Normalize classes (subject_ids handling)
        const normalizedClasses = (clss || []).map((cls: Class) => normalizeClass(cls));
        
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

  // Unit-scoped classes & students so restricted polo users cannot access other polos
  const unitClasses = useMemo(() => {
    if (!selectedUnitId || selectedUnitId === 'all') return classes;
    return classes.filter(c => isItemInUnit(getItemUnitId(c), selectedUnitId, activeUnits));
  }, [classes, selectedUnitId, activeUnits]);

  const unitStudents = useMemo(() => {
    if (!selectedUnitId || selectedUnitId === 'all') return students;
    return students.filter(s => {
      const directUnit = getItemUnitId(s);
      if (directUnit) return isItemInUnit(directUnit, selectedUnitId, activeUnits);
      const cls = classes.find(c => c.id === s.class_id);
      return isItemInUnit(cls ? getItemUnitId(cls) : undefined, selectedUnitId, activeUnits);
    });
  }, [students, classes, selectedUnitId, activeUnits]);

  useEffect(() => {
    if (selectedStudentId && !unitStudents.some(s => s.id === selectedStudentId)) {
      setSelectedStudentId('');
    }
    if (selectedClassId && !unitClasses.some(c => c.id === selectedClassId)) {
      setSelectedClassId('');
    }
  }, [selectedUnitId, unitStudents, unitClasses, selectedStudentId, selectedClassId]);

  // Derived filtered students list for dropdowns/search
  const filteredStudents = useMemo(() => {
    const term = studentSearch.trim();
    if (!term) return unitStudents;

    const matched = unitStudents.filter(s => matchesStudentSearch(s, term));

    return matched.sort((a, b) => {
      const rankA = calculateStudentSearchRank(a, term);
      const rankB = calculateStudentSearchRank(b, term);
      if (rankA !== rankB) return rankA - rankB;

      return (a.name || '').localeCompare(b.name || '', 'pt-BR', { sensitivity: 'base' });
    });
  }, [unitStudents, studentSearch]);

  const activeStudent = useMemo(() => {
    return unitStudents.find(s => s.id === selectedStudentId) || null;
  }, [unitStudents, selectedStudentId]);

  const activeClass = useMemo(() => {
    return unitClasses.find(c => c.id === selectedClassId) || null;
  }, [unitClasses, selectedClassId]);

  const activeStudentClass = useMemo(() => {
    if (!activeStudent) return null;
    if (activeStudent.class_id) {
      const directClass = classes.find(c => c.id === activeStudent.class_id);
      if (directClass) return directClass;
    }
    const activeEnr = enrollments.find(
      (e: any) => e.student_id === activeStudent.id && (e.status || 'Ativo') === 'Ativo' && e.class_id
    ) || enrollments.find(
      (e: any) => e.student_id === activeStudent.id && e.class_id
    );
    return activeEnr ? classes.find(c => c.id === activeEnr.class_id) || null : null;
  }, [activeStudent, classes, enrollments]);

  const institutionDioceseLabel = useMemo(() => {
    if (institution?.city_uf) {
      const cityPart = institution.city_uf.split('/')[0].split('-')[0].trim();
      if (cityPart) return `DIOCESE DE ${cityPart.toUpperCase()}`;
    }
    return institution?.diocese_name || 'DIOCESE DE GUARULHOS';
  }, [institution]);

  const institutionCityName = useMemo(() => {
    if (institution?.city_uf) {
      const cityPart = institution.city_uf.split('/')[0].split('-')[0].trim();
      if (cityPart) return cityPart;
    }
    return 'Guarulhos';
  }, [institution]);

  const institutionNameLabel = institution?.name || 'ESCOLA DIOCESANA DE MINISTÉRIOS';
  const institutionSubtitleLabel = institution?.subtitle || 'PE. JOSÉ FERNANDO DE BRITO';

  // Find pending payments for the activeStudent respecting [enrollment_date .. inactivation_date]
  const pendingPayments = useMemo(() => {
    if (!activeStudent) return { isPending: false, months: [], year: new Date().getFullYear() };

    const currentYear = new Date().getFullYear();
    const studentClass = classes.find(c => c.id === activeStudent.class_id);

    // Verifica ano atual + eventual ano anterior onde houve vínculo encerrado com data explícita
    const yearsToCheck = new Set<number>([currentYear]);
    const stEnrs = enrollments.filter((e: any) => String(e.student_id) === String(activeStudent.id));
    stEnrs.forEach((e: any) => {
      if (e.inactivation_date) {
        const y = parseInt(String(e.inactivation_date).slice(0, 4), 10);
        if (y >= 2000 && y <= currentYear) yearsToCheck.add(y);
      }
      if (e.enrollment_date && e.inactivation_date) {
        const y = parseInt(String(e.enrollment_date).slice(0, 4), 10);
        if (y >= 2000 && y <= currentYear) yearsToCheck.add(y);
      }
    });
    if ((activeStudent as any).inactivation_date) {
      const y = parseInt(String((activeStudent as any).inactivation_date).slice(0, 4), 10);
      if (y >= 2000 && y <= currentYear) yearsToCheck.add(y);
    }

    const sortedYears = Array.from(yearsToCheck).sort((a, b) => b - a);
    const pendingItems: string[] = [];
    let primaryPendingYear = currentYear;

    for (const yr of sortedYears) {
      const studentConts = contributions.filter(
        c => c.student_id === activeStudent.id && Number(c.reference_year) === yr
      );
      const paidMonths = studentConts.map(c => Number(c.reference_month));
      const plan = getStudentContributionPlan(activeStudent, studentClass, yr, paidMonths, undefined, {
        enrollments,
        classes
      });

      const unpaidPeriods = plan.expectedPeriods.filter(m => {
        if (paidMonths.includes(m)) return false;
        return isPeriodOverdue(m, yr, plan.meetingsStartMonth);
      });

      if (unpaidPeriods.length > 0) {
        if (pendingItems.length === 0) primaryPendingYear = yr;
        unpaidPeriods.forEach(m => {
          pendingItems.push(sortedYears.length > 1 && yr !== currentYear
            ? `${formatContributionMonth(m)}/${yr}`
            : formatContributionMonth(m));
        });
      }
    }

    return {
      isPending: pendingItems.length > 0,
      months: pendingItems,
      year: primaryPendingYear
    };
  }, [activeStudent, contributions, classes, enrollments]);

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
    const filtered = filterStudentsForClass(unitStudents, selectedClassId, enrollments, true);
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
  }, [unitStudents, selectedClassId, enrollments, studentSortOrder]);

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

  const isSinglePageType = selectedType === 'declaracao' || selectedType === 'quitacao' || selectedType === 'ficha' || selectedType === 'carta';
  const isLetterType = selectedType === 'carteirinhas' || selectedType === 'etiquetas';
  const isPrintDisabled =
    ((selectedType === 'declaracao' || selectedType === 'quitacao') && !selectedStudentId) ||
    (selectedType === 'carteirinhas' && cardItemsForPrinting.length === 0) ||
    (selectedType === 'etiquetas' && labelItemsForPrinting.length === 0);

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
    <div className={cn(
      "relative font-sans text-slate-800 pb-12 print:pb-0 print:p-0 print:m-0",
      isLetterType && "impressos-letter-sheet"
    )}>
      {/* Folha de estilo sempre ativa (garante fidelidade tanto no botão Imprimir quanto via CTRL+P) */}
      <style dangerouslySetInnerHTML={{ __html: `
        /* Pimaco 6183 / 8099F Sheet layout (2 colunas x 5 linhas = 10 etiquetas, Carta 215.9mm x 279.4mm) */
        .pimaco-sheet {
          display: grid;
          grid-template-columns: 80.0mm 80.0mm;
          grid-template-rows: repeat(5, 46.0mm);
          column-gap: 6.0mm;
          row-gap: 4.0mm;
          width: 215.9mm;
          min-width: 215.9mm;
          max-width: 215.9mm;
          height: 279.4mm;
          min-height: 279.4mm;
          max-height: 279.4mm;
          padding: 17.0mm 24.95mm 16.4mm 24.95mm;
          margin: 0 auto;
          box-sizing: border-box;
          background-color: #fff;
        }
        .pimaco-label {
          width: 80.0mm;
          height: 46.0mm;
          max-width: 80.0mm;
          max-height: 46.0mm;
          min-width: 80.0mm;
          min-height: 46.0mm;
          box-sizing: border-box;
          position: relative;
          overflow: hidden;
          background-color: #fff;
          border: ${showCardCutBorders ? '0.75pt dashed #94a3b8' : '1px solid transparent'};
        }

        /* Pimaco 6180 Sheet layout oficial (3 colunas x 10 linhas = 30 etiquetas, Carta 215.9mm x 279.4mm) */
        .pimaco-sheet-6180 {
          display: grid;
          grid-template-columns: 66.7mm 66.7mm 66.7mm;
          grid-template-rows: repeat(10, 25.4mm);
          column-gap: 3.18mm;
          row-gap: 0mm;
          width: 215.9mm;
          min-width: 215.9mm;
          max-width: 215.9mm;
          height: 279.4mm;
          min-height: 279.4mm;
          max-height: 279.4mm;
          padding: 12.7mm 4.72mm;
          margin: 0 auto;
          box-sizing: border-box;
          background-color: #fff;
          position: relative;
        }
        .pimaco-label-6180 {
          width: 66.7mm;
          height: 25.4mm;
          max-width: 66.7mm;
          max-height: 25.4mm;
          min-width: 66.7mm;
          min-height: 25.4mm;
          box-sizing: border-box;
          position: relative;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          background-color: #fff;
          padding: 1.8mm 3.0mm;
          border: ${showLabelCutBorders ? '0.75pt dashed #94a3b8' : '1px solid transparent'};
        }

        @media print {
          ${isLetterType ? `
            @page {
              size: letter portrait;
              margin: 0;
            }
          ` : `
            @page {
              size: A4 portrait;
              margin: 0;
            }
          `}

          .pimaco-sheet, .pimaco-sheet-6180 {
            display: grid !important;
            height: 279mm !important;
            min-height: 279mm !important;
            max-height: 279mm !important;
            overflow: hidden !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            background-color: #fff !important;
            box-shadow: none !important;
            border: none !important;
            margin: 0 auto !important;
          }
          .pimaco-label, .pimaco-label-6180 {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            background-color: #fff !important;
          }
          .print-page-break {
            page-break-after: always !important;
            break-after: always !important;
          }
        }
      `}} />

      {/* Page Title */}
      <PageHeader 
        title="Documentos e Impressos" 
        description="Emissão e impressão direta de declarações, fichas de matrículas, cartas de apresentação e etiquetas Pimaco." 
        icon={Printer}
        badge="Impressos"
      >
        <button
          onClick={handlePrint}
          disabled={isPrintDisabled}
          title={isPrintDisabled ? "Selecione os dados obrigatórios na barra lateral para habilitar a impressão" : "Abrir janela de impressão para o documento configurado"}
          className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:text-slate-500 disabled:cursor-not-allowed disabled:shadow-none text-white rounded-lg font-bold text-[10px] uppercase tracking-wider transition-all flex items-center gap-1.5 active:scale-95 shadow-2xs"
        >
          <Printer size={13} />
          Imprimir Documento
        </button>
      </PageHeader>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 sm:gap-4 items-start print:block print:p-0 print:m-0">
        {/* Left Control Column (35%) */}
        <div className="lg:col-span-4 space-y-3 sm:space-y-4 print:hidden lg:sticky lg:top-0 lg:max-h-[calc(100vh-120px)] lg:overflow-y-auto pr-1 custom-scrollbar">
          {/* Context-Based Selector (Student or Class) */}
          <div className="bg-white border border-slate-200/90 rounded-xl p-3.5 sm:p-4 space-y-3 shadow-2xs">
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
                  title="Data que será exibida na assinatura e emissão do documento"
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
                      <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 shrink-0 font-bold text-[10px]">
                        {activeStudent?.name ? activeStudent.name.charAt(0).toUpperCase() : '?'}
                      </div>
                      <div className="min-w-0">
                        <p className="text-[11px] font-black text-blue-900 uppercase tracking-wide truncate">
                          {activeStudent?.name}
                        </p>
                        <p className="text-[9.5px] font-mono font-bold text-blue-700 uppercase">
                          Matrícula: {formatRegistrationNumber(activeStudent?.registration_number, 'Sem Registro')}
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
                        title="Pesquisar aluno por nome ou número de matrícula"
                        className="w-full pl-8 pr-8 py-2 border border-slate-200 rounded-xl text-xs font-semibold uppercase focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 bg-white transition-all shadow-sm placeholder:text-slate-400"
                      />
                      {studentSearch && (
                        <button 
                          type="button"
                          onClick={() => setStudentSearch('')}
                          title="Limpar pesquisa de aluno"
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
                            filteredStudents.slice(0, 15).map((s, idx) => (
                              <button
                                key={`imp-stu-search-${s.id || idx}-${idx}`}
                                type="button"
                                onClick={() => {
                                  setSelectedStudentId(s.id);
                                  setStudentSearch('');
                                  setIsDropdownOpen(false);
                                }}
                                title={`Selecionar ${s.name} para emitir documento`}
                                className="w-full px-4 py-2.5 text-left hover:bg-blue-50/50 transition-all flex flex-col gap-0.5 group"
                              >
                                <span className="text-[11px] font-black text-slate-700 uppercase group-hover:text-blue-700 transition-colors">{s.name}</span>
                                <span className="text-[9.5px] font-mono font-bold text-slate-500 uppercase">Matrícula: {formatRegistrationNumber(s.registration_number, 'Sem Registro')}</span>
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
                    title="Selecionar a turma cujos alunos serão listados para impressão"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-semibold focus:outline-none focus:border-blue-500 uppercase bg-slate-50"
                  >
                    <option value="">Selecione uma turma...</option>
                    {unitClasses.map((c, idx) => (
                      <option key={`imp-cls-opt-${c.id || idx}-${idx}`} value={c.id}>{c.name}</option>
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
                        title="Ordenar estudantes alfabeticamente por nome"
                        className={cn(
                          "py-1 px-1.5 rounded text-[8.5px] font-black uppercase tracking-wider transition-all",
                          studentSortOrder === 'name'
                            ? "bg-slate-900 text-white shadow-sm"
                            : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
                        )}
                      >
                        Por Nome
                      </button>
                      <button
                        type="button"
                        onClick={() => setStudentSortOrder('registration')}
                        title="Ordenar estudantes por número de matrícula (RA)"
                        className={cn(
                          "py-1 px-1.5 rounded text-[8.5px] font-black uppercase tracking-wider transition-all",
                          studentSortOrder === 'registration'
                            ? "bg-slate-900 text-white shadow-sm"
                            : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
                        )}
                      >
                        Por Matrícula / RA
                      </button>
                    </div>
                  </div>
                )}

                {/* Checklist of students to print - directly below class selection */}
                {selectedClassId && (selectedType === 'carteirinhas' || selectedType === 'etiquetas') && (
                  <div className="space-y-2 pt-2 border-t border-slate-200">
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
                        title="Marcar todos os alunos desta turma para impressão"
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
                        title="Desmarcar todos os alunos selecionados"
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
                        classStudents.map((student, idx) => {
                          const isChecked = selectedType === 'carteirinhas' 
                            ? selectedCardStudentIds.includes(student.id)
                            : selectedLabelStudentIds.includes(student.id);
                          return (
                            <label
                              key={`imp-cls-stu-${student.id || idx}-${idx}`}
                              title={`Incluir ou remover ${student.name} da impressão`}
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
                                title={`Selecionar ${student.name}`}
                                className="w-3.5 h-3.5 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                              />
                              <div className="flex-1 min-w-0">
                                <p className="text-[10px] font-black uppercase text-slate-800 leading-none truncate mb-0.5">
                                  {student.name}
                                </p>
                                <p className="text-[8.5px] font-mono font-bold text-slate-600 uppercase leading-none">
                                  RA: {formatRegistrationNumber(student.registration_number, 'Sem RA')}
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
              <div className={cn("space-y-3 pt-2 border-t border-slate-200", !selectedStudentId && "opacity-45 pointer-events-none select-none")}>
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
                    title="Texto adicional opcional para exibir na declaração"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-[11px] font-medium focus:outline-none focus:border-blue-500 disabled:bg-slate-50"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Quem Assina?</label>
                  <select
                    value={signerRole}
                    onChange={(e) => setSignerRole(e.target.value as any)}
                    disabled={!selectedStudentId}
                    title="Definir quantas e quais assinaturas constarão no rodapé do documento"
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
                      title="Nome completo do responsável principal pela assinatura"
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
                      title="Cargo exibido abaixo da assinatura 1"
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
                          title="Nome completo do segundo assinante do documento"
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
                          title="Cargo exibido abaixo da assinatura 2"
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
              <div className="space-y-4 pt-4 border-t border-slate-200">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Configuração das Etiquetas</h4>
                
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">Exibir Borda de Foto?</label>
                    <input 
                      type="checkbox"
                      checked={showPhotoBorder}
                      onChange={(e) => setShowPhotoBorder(e.target.checked)}
                      title="Exibir ou ocultar moldura da foto 3x4 na etiqueta da carteirinha"
                      className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">Cartão em Branco?</label>
                    <input 
                      type="checkbox"
                      checked={!isFormFilled}
                      onChange={(e) => setIsFormFilled(!e.target.checked)}
                      title="Gerar etiquetas em branco para preenchimento manual"
                      className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">Bordas Guia de Corte?</label>
                    <input 
                      type="checkbox"
                      checked={showCardCutBorders}
                      onChange={(e) => setShowCardCutBorders(e.target.checked)}
                      title="Exibir linhas tracejadas de guia entre as etiquetas Pimaco 6183"
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
                      title="Imprimir uma etiqueta sequencial para cada aluno selecionado"
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
                      title="Repetir os dados do primeiro aluno selecionado em toda a folha"
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
              <div className="space-y-4 pt-4 border-t border-slate-200">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Configuração das Etiquetas (6180)</h4>
                
                <div className="space-y-3">
                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">Opções de Conteúdo (Se somam na etiqueta)</label>
                    <div className="space-y-2 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                      <label className="flex items-center gap-2.5 text-xs font-semibold text-slate-700 cursor-pointer select-none" title="Exibir endereço completo do aluno na etiqueta">
                        <input
                          type="checkbox"
                          checked={labelShowAddress}
                          onChange={(e) => setLabelShowAddress(e.target.checked)}
                          title="Incluir endereço completo na etiqueta"
                          className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500 cursor-pointer"
                        />
                        <span>Endereço Completo</span>
                      </label>
                      <label className="flex items-center gap-2.5 text-xs font-semibold text-slate-700 cursor-pointer select-none" title="Exibir data de nascimento do aluno na etiqueta">
                        <input
                          type="checkbox"
                          checked={labelShowBirthday}
                          onChange={(e) => setLabelShowBirthday(e.target.checked)}
                          title="Incluir data de nascimento na etiqueta"
                          className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500 cursor-pointer"
                        />
                        <span>Data de Nascimento</span>
                      </label>
                      <label className="flex items-center gap-2.5 text-xs font-semibold text-slate-700 cursor-pointer select-none" title="Exibir número de matrícula (RA) na etiqueta">
                        <input
                          type="checkbox"
                          checked={labelShowMatricula}
                          onChange={(e) => setLabelShowMatricula(e.target.checked)}
                          title="Incluir número de matrícula na etiqueta"
                          className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500 cursor-pointer"
                        />
                        <span>Nº de Matrícula (RA)</span>
                      </label>
                      <label className="flex items-center gap-2.5 text-xs font-semibold text-slate-700 cursor-pointer select-none" title="Exibir nome da turma ou curso na etiqueta">
                        <input
                          type="checkbox"
                          checked={labelShowCourse}
                          onChange={(e) => setLabelShowCourse(e.target.checked)}
                          title="Incluir nome da turma/curso na etiqueta"
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
                      title="Exibir linhas guia de recorte entre as 30 etiquetas Pimaco 6180"
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
                      title="Imprimir uma etiqueta por aluno selecionado em sequência"
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
                      title="Repetir a etiqueta do primeiro aluno selecionado em toda a folha"
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
              <div className="space-y-3 pt-2 border-t border-slate-200">
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Responsável Assinatura</label>
                  <input 
                    type="text"
                    placeholder="Nome do Secretário ou Tesoureiro..."
                    value={signerName}
                    onChange={(e) => setSignerName(e.target.value)}
                    maxLength={35}
                    title="Nome do responsável que assinará a declaração financeira"
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
                    title="Cargo exibido abaixo da assinatura na declaração"
                    className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-3">
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
              Pré-Visualização do Documento {(selectedType === 'carteirinhas' || selectedType === 'etiquetas') ? '(Formato Carta)' : '(Folha A4 210x297mm - Proporção Real 1:1)'}
            </h3>
            <span className="text-[9px] bg-slate-100 font-black text-slate-600 uppercase tracking-widest px-2 py-0.5 border border-slate-200">
              {(selectedType === 'carteirinhas' || selectedType === 'etiquetas') ? 'Papel Carta Real' : 'Papel A4 Real (Margem 15mm)'}
            </span>
          </div>

          {/* Standard Page Container - Paridade estrita 1:1 entre Pré-Visualização e Impressão */}
          <div className="bg-slate-200/60 p-2 sm:p-4 md:p-6 min-h-[calc(100vh-250px)] overflow-x-auto rounded-lg print:p-0 print:m-0 print:bg-transparent print:min-h-0 print:overflow-visible">
            <div 
              id="printable-impressos" 
              className={cn(
                "print-preview-container select-text relative flex flex-col box-border mx-auto",
                isLetterType
                  ? "bg-transparent border-none shadow-none p-0 w-fit print:h-auto print:min-h-0"
                  : cn(
                      "bg-white shadow-2xl border border-slate-300 text-slate-950 font-sans",
                      "w-[210mm] min-w-[210mm] max-w-[210mm] p-[12mm_15mm_10mm_15mm]",
                      "print:w-[210mm] print:min-w-[210mm] print:max-w-[210mm] print:p-[12mm_15mm_10mm_15mm] print:m-0 print:border-none print:shadow-none",
                      isSinglePageType
                        ? "printable-single-page h-[297mm] min-h-[297mm] max-h-[297mm] justify-between overflow-hidden"
                        : "min-h-[297mm]"
                    )
              )}
            >
            
            {/* Cabeçalho Institucional Padronizado (idêntico ao padrão oficial do sistema) */}
            {isSinglePageType && (
              <header className="printable-header shrink-0 flex items-center gap-4 pb-2.5 border-b-2 border-slate-900 text-left">
                <div className="shrink-0 w-[18mm] h-[18mm] flex items-center justify-center">
                  <img
                    src={institution?.logo_url || DEFAULT_LOGO}
                    className="w-full h-full object-contain max-w-[18mm] max-h-[18mm]"
                    referrerPolicy="no-referrer"
                    alt="Brasão Diocesano"
                  />
                </div>
                <div className="flex-1 min-w-0 flex flex-col justify-center">
                  <p className="text-[8.5pt] font-extrabold tracking-[0.2em] text-slate-600 uppercase leading-none mb-1 font-sans">
                    {institutionDioceseLabel}
                  </p>
                  <h1 className="text-[14pt] font-black uppercase tracking-tight text-slate-950 leading-tight font-sans">
                    {institutionNameLabel}
                  </h1>
                  <p className="text-[8.5pt] font-bold text-slate-600 tracking-wider uppercase leading-tight mt-0.5 font-sans">
                    {institutionSubtitleLabel}
                  </p>
                </div>
              </header>
            )}

            {/* RENDER SELECTED DOCUMENT PATTERN */}

            {/* 1. DECLARAÇÃO DE MATRÍCULA */}
            {selectedType === 'declaracao' && (
              <div className="flex-1 min-h-0 flex flex-col justify-between pt-[10mm] pb-[14mm]">
                {activeStudent ? (
                  <>
                    <div className="space-y-6">
                      {/* Título Formal */}
                      <div className="text-center space-y-1.5">
                        <h2 className="text-[15pt] font-bold uppercase tracking-[0.2em] font-serif text-slate-950 border-b-2 border-slate-900 pb-1.5 px-8 inline-block">
                          Declaração de Matrícula
                        </h2>
                        <p className="text-[8.5pt] text-slate-600 tracking-[0.16em] uppercase font-mono font-bold pt-0.5">
                          Matrícula Escolar Nº {formatRegistrationNumber(activeStudent.registration_number)} • Ano Letivo {new Date().getFullYear()}
                        </p>
                      </div>

                      {/* Corpo Editorial */}
                      <div className="text-[11.5pt] text-slate-900 leading-[1.9] text-justify font-serif space-y-5 pt-4">
                        <p className="indent-8">
                          Declaramos, para os devidos fins de direito e a quem possa interessar, que o(a) estudante{' '}
                          <strong className="text-slate-950 font-bold uppercase tracking-wide">
                            {activeStudent.name}
                          </strong>
                          , inscrito(a) sob o registro de matrícula acadêmica nº{' '}
                          <strong className="font-mono text-slate-950">
                            {formatRegistrationNumber(activeStudent.registration_number)}
                          </strong>
                          , portador(a) do CPF{' '}
                          <strong className="text-slate-950">{activeStudent.cpf || 'Não Informado'}</strong> e RG{' '}
                          <strong className="text-slate-950">{activeStudent.rg || 'Não Informado'}</strong>, encontra-se regularmente matriculado(a) e com frequência ativa nesta instituição de ensino no curso de{' '}
                          <strong className="text-slate-950">
                            {activeStudent.course || activeStudentClass?.course || 'Teologia e Formação Ministerial'}
                          </strong>
                          .
                        </p>

                        <p className="indent-8">
                          O(a) referido(a) estudante encontra-se devidamente vinculado(a) à turma{' '}
                          <strong className="text-slate-950">
                            {activeStudentClass
                              ? `${activeStudentClass.name}${activeStudentClass.code ? ` (${activeStudentClass.code})` : ''}`
                              : 'Turma Regular Ativa'}
                          </strong>
                          , correspondente ao ciclo letivo em exercício, frequentando as aulas com assiduidade e aproveitamento compatíveis às exigências acadêmicas e regimentais vigentes.
                        </p>

                        {customText && (
                          <div className="italic text-slate-800 bg-slate-50 px-4 py-3 border-l-2 border-slate-800 my-2 text-[10.5pt] leading-relaxed indent-0">
                            {customText}
                          </div>
                        )}

                        <p className="indent-8 pt-1">
                          Por ser a expressão da verdade, firmamos o presente documento para que produza todos os seus devidos e legais efeitos.
                        </p>
                      </div>
                    </div>

                    {/* Local, Data e Assinaturas */}
                    <div className="w-full pt-8 space-y-16">
                      <div className="w-full text-right text-[11pt] font-serif text-slate-900">
                        <p className="font-semibold tracking-wide">
                          {institutionCityName}, {formatLongDate(documentDate)}.
                        </p>
                      </div>

                      {signerRole === 'ambos' ? (
                        <div className="w-full grid grid-cols-2 gap-12 justify-items-center font-sans">
                          <div className="w-[68mm] flex flex-col items-center text-center">
                            <div className="w-full border-t border-slate-900 pt-1.5" />
                            {signerName.trim() && (
                              <p className="text-[9.5pt] font-bold text-slate-950 uppercase tracking-wider leading-tight">
                                {signerName.trim()}
                              </p>
                            )}
                            <p className="text-[8pt] font-bold text-slate-700 uppercase tracking-widest mt-0.5">
                              {signerTitle}
                            </p>
                          </div>
                          <div className="w-[68mm] flex flex-col items-center text-center">
                            <div className="w-full border-t border-slate-900 pt-1.5" />
                            {coSignerName.trim() && (
                              <p className="text-[9.5pt] font-bold text-slate-950 uppercase tracking-wider leading-tight">
                                {coSignerName.trim()}
                              </p>
                            )}
                            <p className="text-[8pt] font-bold text-slate-700 uppercase tracking-widest mt-0.5">
                              {coSignerTitle}
                            </p>
                          </div>
                        </div>
                      ) : (
                        <div className="w-full flex justify-center font-sans">
                          <div className="w-[74mm] mx-auto flex flex-col items-center text-center">
                            <div className="w-full border-t border-slate-900 pt-1.5" />
                            {signerName.trim() && (
                              <p className="text-[9.5pt] font-bold text-slate-950 uppercase tracking-wider leading-tight">
                                {signerName.trim()}
                              </p>
                            )}
                            <p className="text-[8pt] font-bold text-slate-700 uppercase tracking-widest mt-0.5">
                              {signerTitle}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-center space-y-4">
                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-full text-slate-400">
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
              <div className="flex-1 min-h-0 flex flex-col justify-start pt-3 pb-4 text-[9pt] leading-snug font-sans text-slate-950">
                {/* Título */}
                <div className="text-center pb-3">
                  <h2 className="text-[13.5pt] font-extrabold uppercase tracking-[0.2em] text-slate-950 border-b-2 border-slate-900 pb-0.5 px-6 inline-block">
                    Ficha de Inscrição
                  </h2>
                </div>

                {/* Bloco Superior: Controle da Escola | Curso | Foto 3x4 */}
                <div className="grid grid-cols-12 gap-3 border-[1.5px] border-slate-900 p-3 items-stretch">
                  {/* Esquerda: Controle da Escola */}
                  <div className="col-span-4 border-r border-slate-900 pr-3 flex flex-col justify-start">
                    <h4 className="text-[8.5pt] font-black uppercase tracking-wider text-slate-950 border-b border-slate-900 pb-1 mb-3">
                      Controle da Escola
                    </h4>
                    <div className="space-y-2 pt-1">
                      <p className="text-[8pt] font-bold uppercase text-slate-800">Nº de Inscrição:</p>
                      <div className="flex items-baseline gap-1.5 pt-4">
                        <span className="text-[9pt] font-bold uppercase text-slate-800 shrink-0">Nº</span>
                        <div className="flex-1 border-b border-dotted border-slate-800 h-[5mm]">&nbsp;</div>
                      </div>
                    </div>
                  </div>

                  {/* Centro: CURSO */}
                  <div className="col-span-5 border-r border-slate-900 pr-3 flex flex-col justify-between">
                    <div>
                      <h4 className="text-[8.5pt] font-black uppercase tracking-wider text-slate-950 border-b border-slate-900 pb-1 mb-3">
                        Curso Pretendido
                      </h4>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-3.5 text-[8.5pt] font-bold text-slate-900 pt-1">
                        <div className="flex items-center gap-2">
                          <div className="w-5 h-5 border-[1.5px] border-slate-900 rounded-[2px] shrink-0 bg-white" />
                          <span className="leading-tight">Teologia</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-5 h-5 border-[1.5px] border-slate-900 rounded-[2px] shrink-0 bg-white" />
                          <span className="leading-tight">Latim</span>
                        </div>
                        <div className="flex items-start gap-2">
                          <div className="w-5 h-5 border-[1.5px] border-slate-900 rounded-[2px] shrink-0 bg-white mt-0.5" />
                          <span className="leading-tight">Doutrina Social da Igreja</span>
                        </div>
                        <div className="flex items-start gap-2">
                          <div className="w-5 h-5 border-[1.5px] border-slate-900 rounded-[2px] shrink-0 bg-white mt-0.5" />
                          <span className="leading-tight">História dos Santos Negros</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Direita: Foto 3x4 real (30mm x 40mm) */}
                  <div className="col-span-3 flex items-center justify-center">
                    <div className="w-[30mm] h-[40mm] border-[1.5px] border-dashed border-slate-700 flex flex-col items-center justify-center text-center p-1 bg-white">
                      <span className="text-[7.5pt] font-black text-slate-600 uppercase tracking-wider leading-tight">COLE AQUI</span>
                      <span className="text-[7.5pt] font-black text-slate-600 uppercase tracking-wider leading-tight mt-0.5">FOTO 3X4</span>
                    </div>
                  </div>
                </div>

                {/* Campos de Preenchimento Manuscrito */}
                <div className="space-y-2.5 mt-3.5">
                  <div className="flex items-baseline gap-2">
                    <span className="font-bold text-slate-800 uppercase text-[8.5pt] tracking-wider shrink-0">Nome:</span>
                    <div className="flex-1 border-b border-dotted border-slate-700 h-[5.5mm]">&nbsp;</div>
                  </div>

                  <div className="flex items-baseline gap-2">
                    <span className="font-bold text-slate-800 uppercase text-[8.5pt] tracking-wider shrink-0">Endereço:</span>
                    <div className="flex-1 border-b border-dotted border-slate-700 h-[5.5mm]">&nbsp;</div>
                  </div>

                  <div className="grid grid-cols-12 gap-x-3">
                    <div className="col-span-5 flex items-baseline gap-2">
                      <span className="font-bold text-slate-800 uppercase text-[8.5pt] tracking-wider shrink-0">Bairro:</span>
                      <div className="flex-1 border-b border-dotted border-slate-700 h-[5.5mm]">&nbsp;</div>
                    </div>
                    <div className="col-span-5 flex items-baseline gap-2">
                      <span className="font-bold text-slate-800 uppercase text-[8.5pt] tracking-wider shrink-0">Cidade:</span>
                      <div className="flex-1 border-b border-dotted border-slate-700 h-[5.5mm]">&nbsp;</div>
                    </div>
                    <div className="col-span-2 flex items-baseline gap-2">
                      <span className="font-bold text-slate-800 uppercase text-[8.5pt] tracking-wider shrink-0">UF:</span>
                      <div className="flex-1 border-b border-dotted border-slate-700 h-[5.5mm]">&nbsp;</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-12 gap-x-3">
                    <div className="col-span-4 flex items-baseline gap-2">
                      <span className="font-bold text-slate-800 uppercase text-[8.5pt] tracking-wider shrink-0">CEP:</span>
                      <div className="flex-1 border-b border-dotted border-slate-700 h-[5.5mm]">&nbsp;</div>
                    </div>
                    <div className="col-span-8 flex items-baseline gap-2">
                      <span className="font-bold text-slate-800 uppercase text-[8.5pt] tracking-wider shrink-0">E-mail:</span>
                      <div className="flex-1 border-b border-dotted border-slate-700 h-[5.5mm]">&nbsp;</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-12 gap-x-3 items-end pt-1">
                    <div className="col-span-4 flex items-end gap-1.5 leading-none">
                      <span className="font-bold text-slate-800 uppercase text-[8.5pt] tracking-wider shrink-0">Fone:</span>
                      <div className="flex-1 border-b border-dotted border-slate-700 h-[5mm] flex items-end justify-between px-1 text-[8.5pt] text-slate-700 font-bold leading-none pb-[1px]">
                        <span>( &nbsp; &nbsp; )</span>
                        <span>-</span>
                        <span className="invisible select-none">.</span>
                      </div>
                    </div>
                    <div className="col-span-4 flex items-center justify-center gap-2 leading-none">
                      <div className="flex items-center gap-1 shrink-0">
                        <svg className="w-3.5 h-3.5 text-[#25D366] fill-current shrink-0" viewBox="0 0 24 24" aria-label="WhatsApp">
                          <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/>
                        </svg>
                        <span className="font-bold text-slate-800 text-[8pt] uppercase">WhatsApp:</span>
                      </div>
                      <div className="flex items-center gap-1 text-[8pt] font-bold">
                        <span>Sim</span>
                        <div className="w-4 h-4 border-[1.5px] border-slate-900 rounded-[2px] bg-white shrink-0" />
                      </div>
                      <div className="flex items-center gap-1 text-[8pt] font-bold">
                        <span>Não</span>
                        <div className="w-4 h-4 border-[1.5px] border-slate-900 rounded-[2px] bg-white shrink-0" />
                      </div>
                    </div>
                    <div className="col-span-4 flex items-end justify-end gap-1.5 whitespace-nowrap leading-none">
                      <span className="font-bold text-slate-800 uppercase text-[8.5pt] tracking-wider shrink-0">Nasc.:</span>
                      <span className="text-slate-700 font-mono text-[8.5pt] tracking-wider leading-none">____ / ____ / ______</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-12 gap-x-3">
                    <div className="col-span-6 flex items-baseline gap-2">
                      <span className="font-bold text-slate-800 uppercase text-[8.5pt] tracking-wider shrink-0">RG:</span>
                      <div className="flex-1 border-b border-dotted border-slate-700 h-[5.5mm]">&nbsp;</div>
                    </div>
                    <div className="col-span-6 flex items-baseline gap-2">
                      <span className="font-bold text-slate-800 uppercase text-[8.5pt] tracking-wider shrink-0">CPF:</span>
                      <div className="flex-1 border-b border-dotted border-slate-700 h-[5.5mm]">&nbsp;</div>
                    </div>
                  </div>

                  <div className="flex items-baseline gap-2">
                    <span className="font-bold text-slate-800 uppercase text-[8.5pt] tracking-wider shrink-0">Paróquia / Comunidade:</span>
                    <div className="flex-1 border-b border-dotted border-slate-700 h-[5.5mm]">&nbsp;</div>
                  </div>

                  <div className="flex items-center gap-5 pt-1">
                    <span className="font-bold text-slate-800 uppercase text-[8.5pt] tracking-wider shrink-0">Já foi aluno(a) da Escola?</span>
                    <div className="flex items-center gap-1.5 text-[8.5pt] font-bold">
                      <span>Sim</span>
                      <div className="w-4 h-4 border-[1.5px] border-slate-900 rounded-[2px] bg-white shrink-0" />
                    </div>
                    <div className="flex items-center gap-1.5 text-[8.5pt] font-bold">
                      <span>Não</span>
                      <div className="w-4 h-4 border-[1.5px] border-slate-900 rounded-[2px] bg-white shrink-0" />
                    </div>
                  </div>
                </div>

                {/* Normas de Admissão */}
                <div className="mt-3.5 pt-2.5 border-t-[1.5px] border-slate-900">
                  <h3 className="font-black uppercase text-[8.5pt] tracking-wider text-slate-950 text-center border-b border-slate-300 pb-1 mb-2">
                    Informações básicas para admissão ao curso escolhido
                  </h3>
                  <ul className="text-[8.5pt] text-slate-900 leading-[1.45] space-y-1 font-medium list-none px-0.5">
                    {admissionNorms.map((norm, index) => {
                      const hasIndexPrefix = /^\s*[0-9]+[\s\)\.\-]/i.test(norm);
                      return (
                        <li key={index} className="flex items-start gap-1.5 break-words">
                          {!hasIndexPrefix && <strong className="text-slate-950 font-black shrink-0">{index + 1})</strong>}
                          <span className="min-w-0 break-words">{norm}</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>

                {/* Termo de Ciência e Assinatura */}
                <div className="mt-3.5 pt-2 border-t border-slate-200 font-sans">
                  <p className="text-[9.5pt] text-justify text-slate-950 font-medium leading-[1.6]">
                    Eu, <span className="inline-block w-[102mm] border-b border-dotted border-slate-900 align-baseline">&nbsp;</span>, declaro que estou ciente e de ACORDO com as normas estabelecidas para ingresso no curso escolhido, promovido pela <span className="uppercase font-semibold">{institutionDioceseLabel}</span>, e autorizo o armazenamento de meus dados pessoais necessários para a inscrição acadêmica.
                  </p>

                  <div className="mt-6 space-y-14 font-sans">
                    <div className="text-[9pt] text-slate-900 font-semibold">
                      <span>{institutionCityName}, ________ de ____________________ de ________.</span>
                    </div>
                    <div className="w-full flex justify-center">
                      <div className="w-[78mm] flex flex-col items-center text-center">
                        <div className="w-full border-t border-slate-900 pt-1">
                          <span className="text-[8pt] font-black text-slate-800 uppercase tracking-widest">Assinatura do(a) Aluno(a)</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}


            {/* 2.2 CARTA DE APRESENTAÇÃO */}
            {selectedType === 'carta' && (
              <div className="flex-1 min-h-0 flex flex-col justify-between pt-[6mm] pb-[4mm] text-[10.5pt] leading-relaxed font-sans text-slate-950">
                <div className="space-y-6">
                  {/* Título */}
                  <div className="text-center">
                    <h2 className="text-[15pt] font-bold uppercase tracking-[0.2em] font-serif text-slate-950 border-b-2 border-slate-900 pb-1.5 px-8 inline-block">
                      Carta de Apresentação
                    </h2>
                  </div>

                  {/* Destinatário */}
                  <div className="space-y-0.5 text-left pt-2 font-serif">
                    <p className="text-[11pt] font-semibold text-slate-700">À</p>
                    <p className="text-[11.5pt] font-bold uppercase tracking-wide text-slate-950">{institutionNameLabel}</p>
                    <p className="text-[10.5pt] font-semibold text-slate-700 italic">{institutionSubtitleLabel}</p>
                  </div>

                  {/* Corpo manuscrito alinhado por baseline */}
                  <div className="space-y-4 pt-2 text-justify font-serif text-[11.5pt] leading-[2]">
                    <div className="flex items-baseline gap-2 w-full">
                      <span className="shrink-0">Eu, Padre</span>
                      <span className="flex-1 border-b border-dotted border-slate-700 translate-y-[-2px]">&nbsp;</span>
                    </div>

                    <div className="flex items-center gap-6 text-[9pt] font-bold font-sans uppercase pl-1 select-none text-slate-800">
                      <div className="flex items-center gap-1.5">
                        <div className="w-3.5 h-3.5 border-[1.5px] border-slate-900 rounded-[2px] shrink-0 bg-white" />
                        <span>Pároco</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="w-3.5 h-3.5 border-[1.5px] border-slate-900 rounded-[2px] shrink-0 bg-white" />
                        <span>Vigário</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="w-3.5 h-3.5 border-[1.5px] border-slate-900 rounded-[2px] shrink-0 bg-white" />
                        <span>Adm. Paroquial</span>
                      </div>
                    </div>

                    <div className="flex items-baseline gap-2 w-full">
                      <span className="shrink-0">da Paróquia:</span>
                      <span className="flex-1 border-b border-dotted border-slate-700 translate-y-[-2px]">&nbsp;</span>
                    </div>

                    <p>venho, através desta, apresentar</p>

                    <div className="flex items-baseline gap-2 w-full">
                      <span className="shrink-0">o(a) Sr.(a)</span>
                      <span className="flex-1 border-b border-dotted border-slate-700 translate-y-[-2px]">&nbsp;</span>
                    </div>

                    <p>
                      membro ativo(a) da comunidade paroquial, para inscrição no <strong className="font-bold">Curso de Teologia</strong>.
                    </p>
                  </div>

                  {/* Local, Data e Assinatura */}
                  <div className="pt-6 space-y-14 font-sans">
                    <div className="text-left text-[10.5pt] font-serif text-slate-900 font-semibold">
                      <span>{institutionCityName}, _____ de ____________________ de ________.</span>
                    </div>
                    <div className="w-full flex justify-end">
                      <div className="w-[90mm] flex flex-col items-center text-center">
                        <div className="w-full border-t border-slate-900 pt-1">
                          <span className="text-[8pt] font-black text-slate-700 uppercase tracking-widest">Assinatura do Pároco / Responsável</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Selo de Carimbo Paroquial e Orientações de Matrícula */}
                <div className="mt-auto pt-6 grid grid-cols-12 gap-6 items-center">
                  {/* Esquerda: Selo Circular para Carimbo */}
                  <div className="col-span-5 flex items-center justify-center">
                    <div className="w-[38mm] h-[38mm] rounded-full border-2 border-dashed border-slate-400 flex items-center justify-center p-1.5 select-none">
                      <div className="w-full h-full rounded-full border border-dashed border-slate-300 flex flex-col items-center justify-center text-center px-2">
                        <span className="text-[8pt] font-black text-slate-400 uppercase tracking-[0.15em] leading-snug">
                          Carimbo<br />da<br />Paróquia
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Direita: Documentação para Efetivação */}
                  <div className="col-span-7 bg-slate-50 border border-slate-400 p-4 rounded-md font-sans text-left space-y-2">
                    <h4 className="text-[9pt] font-black uppercase tracking-wider text-slate-900 border-b border-slate-300 pb-1">
                      Para efetivar a matrícula:
                    </h4>
                    <ol className="text-[8.5pt] text-slate-800 font-medium space-y-1.5 list-none leading-[1.45]">
                      {presentationInfo.map((item, index) => {
                        const hasIndexPrefix = /^\s*[0-9]+[\s\)\.\-]/i.test(item);
                        return (
                          <li key={index} className="flex items-start gap-1.5 min-w-0 break-words">
                            {!hasIndexPrefix && <strong className="text-slate-950 font-bold shrink-0">{index + 1}.</strong>}
                            <span className="min-w-0 break-words">{item}</span>
                          </li>
                        );
                      })}
                    </ol>
                  </div>
                </div>
              </div>
            )}


            {/* 3. ETIQUETAS PARA CARTEIRINHA (PIMACO 6183 / 8099F) */}
            {selectedType === 'carteirinhas' && (
              <div className="space-y-8 font-sans">
                {cardItemsForPrinting.length === 0 ? (
                  <div className="text-center py-20 px-8 bg-white border border-slate-200 rounded-xl text-slate-400 font-bold uppercase tracking-widest text-[10px] space-y-2 print:hidden">
                    <Info size={24} className="mx-auto text-slate-300" />
                    <p>Nenhum aluno selecionado para impressão de etiquetas para carteirinha.</p>
                    <p className="text-[9px] text-slate-500 normal-case">Selecione os alunos da turma na aba lateral esquerda para gerar as etiquetas.</p>
                  </div>
                ) : (
                  <div>
                    {/* Cabeçalho informativo na tela */}
                    <div className="text-center pb-4 border-b border-slate-200 mb-6 print:hidden">
                      <h2 className="text-xs font-black text-slate-500 uppercase tracking-widest">
                        Modelo de Etiquetas para Carteirinha (Pimaco 6183 / 8099F — 8,0cm × 4,6cm)
                      </h2>
                      <p className="text-[10px] text-slate-500 mt-1 max-w-md mx-auto leading-normal">
                        Etiquetas de <strong>80,0mm × 46,0mm</strong> (10 por folha Carta 215,9mm × 279,4mm). As posições puladas ficam em branco para reaproveitamento da folha.
                      </p>
                      <div className="mt-3 flex justify-center gap-4 text-[9px] font-mono font-bold text-slate-600">
                        <span className="bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                          Etiquetas Ativas: {selectedCardStudentIds.length}
                        </span>
                        <span className="bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                          Total de Folhas: {cardItemsForPrinting.length}
                        </span>
                      </div>
                    </div>

                    {/* Folhas */}
                    <div className="space-y-12 print:space-y-0">
                      {cardItemsForPrinting.map((sheet, sheetIdx) => (
                        <div key={sheetIdx} className="space-y-2 print:space-y-0">
                          <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-center mt-6 mb-2 print:hidden flex items-center justify-center gap-1.5">
                            <span className="w-6 h-[1px] bg-slate-200" />
                            Folha {sheetIdx + 1} de {cardItemsForPrinting.length}
                            <span className="w-6 h-[1px] bg-slate-200" />
                          </div>

                          <div className={cn(
                            "pimaco-sheet bg-white shadow-xl mx-auto border border-slate-200 print:shadow-none print:border-none print:m-0 box-border",
                            sheetIdx < cardItemsForPrinting.length - 1 && "print-page-break"
                          )}>
                            {sheet.map((student, slotIdx) => {
                              if (!student) {
                                return (
                                  <div 
                                    key={`empty-${sheetIdx}-${slotIdx}`} 
                                    className="pimaco-label flex flex-col items-center justify-center text-center p-2 border border-dashed border-slate-200/70 bg-slate-50/30 print:bg-transparent print:border-none print:opacity-0 select-none"
                                  >
                                    <span className="text-[8px] font-black uppercase tracking-wider text-slate-400 print:hidden">Etiqueta {slotIdx + 1}</span>
                                    <span className="text-[6px] font-bold uppercase tracking-tight mt-0.5 text-slate-400 print:hidden">(Vazio / Pulado)</span>
                                  </div>
                                );
                              }

                              const studentClassObj = activeClass || classes.find(c => c.id === student.class_id);

                              return (
                                <div 
                                  key={`filled-${sheetIdx}-${slotIdx}-${student.id}`} 
                                  className="pimaco-label p-[2.4mm_2.8mm] bg-white flex flex-row items-stretch gap-2.5 relative box-border select-none overflow-hidden"
                                >
                                  {/* Esquerda: Foto 3x4 proporcional */}
                                  <div className="flex flex-col justify-center shrink-0">
                                    <div className={cn(
                                      "w-[20.5mm] h-[27.5mm] bg-slate-50 flex items-center justify-center overflow-hidden shrink-0 rounded-xs relative z-10",
                                      showPhotoBorder ? "border border-slate-900" : "border border-slate-200 print:border-transparent"
                                    )}>
                                      {student.photo_url ? (
                                        <img src={student.photo_url} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                      ) : (
                                        <div className="text-center p-1">
                                          <User className="text-slate-300 mx-auto" size={16} />
                                          <span className="text-[5.5pt] text-slate-400 font-bold block uppercase mt-0.5">FOTO 3x4</span>
                                        </div>
                                      )}
                                    </div>
                                  </div>

                                  {/* Direita: Dados da Carteirinha */}
                                  <div className="flex-1 min-w-0 flex flex-col justify-between h-full py-[0.5mm] relative z-10 text-left">
                                    {/* Cabeçalho Institucional da Carteirinha */}
                                    <div className="flex items-center gap-1.5 pb-1 border-b border-slate-900/20">
                                      <div className="w-[4.5mm] h-[4.5mm] flex items-center justify-center bg-white shrink-0 overflow-hidden">
                                        <img 
                                          src={institution?.logo_url || DEFAULT_LOGO} 
                                          alt="" 
                                          className="w-full h-full object-contain" 
                                          referrerPolicy="no-referrer" 
                                        />
                                      </div>
                                      <h4 className="text-[6.2pt] font-black uppercase tracking-tight text-slate-950 truncate leading-none">
                                        {institutionNameLabel}
                                      </h4>
                                    </div>

                                    {/* Metadados Principais */}
                                    <div className="space-y-1 my-auto py-0.5">
                                      <div>
                                        <span className="text-[5pt] font-extrabold text-slate-600 uppercase block tracking-wider leading-none">ESTUDANTE</span>
                                        <h5 
                                          className="text-[7.5pt] font-black text-slate-950 uppercase whitespace-normal break-words leading-[1.12] mt-0.5"
                                          style={{
                                            display: '-webkit-box',
                                            WebkitLineClamp: 2,
                                            WebkitBoxOrient: 'vertical',
                                            overflow: 'hidden',
                                            maxHeight: '2.25em'
                                          }}
                                        >
                                          {isFormFilled ? student.name : '\u00A0'}
                                        </h5>
                                      </div>

                                      <div className="grid grid-cols-2 gap-x-2 pt-0.5">
                                        <div className="flex flex-col justify-start min-w-0">
                                          <span className="text-[5pt] font-extrabold text-slate-600 uppercase block tracking-wider leading-none">MATRÍCULA / RA</span>
                                          <span className="text-[6.5pt] font-bold font-mono text-slate-950 leading-none block mt-0.5 truncate">
                                            {isFormFilled ? formatRegistrationNumber(student.registration_number, 'S/ RA') : '\u00A0'}
                                          </span>
                                        </div>
                                        <div className="flex flex-col justify-start text-right min-w-0">
                                          <span className="text-[5pt] font-extrabold text-slate-600 uppercase block tracking-wider leading-none text-right">RG / CPF</span>
                                          <span className="text-[6.5pt] font-bold font-mono text-slate-950 leading-none block mt-0.5 truncate text-right">
                                            {isFormFilled ? (student.rg || student.cpf || 'N/C') : '\u00A0'}
                                          </span>
                                        </div>
                                      </div>

                                      <div>
                                        <span className="text-[5pt] font-extrabold text-slate-600 uppercase block tracking-wider leading-none">CURSO / TURMA</span>
                                        <span className="text-[6.2pt] font-bold text-slate-900 uppercase block truncate leading-none mt-0.5">
                                          {isFormFilled ? [student.course || studentClassObj?.course || 'CURSO', studentClassObj?.name].filter(Boolean).join(' • ') : '\u00A0'}
                                        </span>
                                      </div>
                                    </div>

                                    {/* Rodapé da Carteirinha */}
                                    <div className="flex items-center justify-between border-t border-slate-900/15 pt-1 mt-auto">
                                      <div>
                                        <span className="text-[4.8pt] font-extrabold text-slate-600 uppercase tracking-wider block leading-none">VALIDADE</span>
                                        <span className="text-[6.2pt] font-black font-mono text-emerald-800 leading-none">DEZ / {new Date().getFullYear()}</span>
                                      </div>
                                      <div className="text-right">
                                        <span className="text-[4.8pt] font-extrabold text-slate-600 uppercase tracking-wider block leading-none">ALUNO(A) DESDE</span>
                                        <span className="text-[6pt] font-bold font-mono text-slate-900 block leading-none uppercase">
                                          {isFormFilled ? (student.start_date ? formatDateForDisplay(student.start_date) : (student.created_at ? formatDateForDisplay(student.created_at) : 'N/D')) : '\u00A0'}
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
                  <div className="text-center py-20 px-8 bg-white border border-slate-200 rounded-xl text-slate-400 font-bold uppercase tracking-widest text-[10px] space-y-2 print:hidden">
                    <Info size={24} className="mx-auto text-slate-300" />
                    <p>Nenhuma etiqueta de endereçamento selecionada para impressão.</p>
                    <p className="text-[9px] text-slate-500 normal-case">Selecione os alunos da turma na aba lateral esquerda para gerar as etiquetas.</p>
                  </div>
                ) : (
                  <div>
                    {/* Cabeçalho informativo na tela */}
                    <div className="text-center pb-4 border-b border-slate-200 mb-6 print:hidden">
                      <h2 className="text-xs font-black text-slate-500 uppercase tracking-widest">
                        Modelo de Etiquetas de Endereçamento (Pimaco 6180 — 66,7mm × 25,4mm)
                      </h2>
                      <p className="text-[10px] text-slate-500 mt-1 max-w-md mx-auto leading-normal">
                        Etiquetas de <strong>66,7mm × 25,4mm</strong> (30 por folha Carta 215,9mm × 279,4mm). As posições puladas ficam em branco para reaproveitamento da folha.
                      </p>
                      <div className="mt-3 flex justify-center gap-4 text-[9px] font-mono font-bold text-slate-600">
                        <span className="bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                          Etiquetas Ativas: {selectedLabelStudentIds.length}
                        </span>
                        <span className="bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                          Total de Folhas: {labelItemsForPrinting.length}
                        </span>
                      </div>
                    </div>

                    {/* Folhas */}
                    <div className="space-y-12 print:space-y-0">
                      {labelItemsForPrinting.map((sheet, sheetIdx) => (
                        <div key={sheetIdx} className="space-y-2 print:space-y-0">
                          <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-center mt-6 mb-2 print:hidden flex items-center justify-center gap-1.5">
                            <span className="w-6 h-[1px] bg-slate-200" />
                            Folha {sheetIdx + 1} de {labelItemsForPrinting.length}
                            <span className="w-6 h-[1px] bg-slate-200" />
                          </div>

                          <div className={cn(
                            "pimaco-sheet-6180 bg-white shadow-xl mx-auto border border-slate-200 print:shadow-none print:border-none print:m-0 box-border",
                            sheetIdx < labelItemsForPrinting.length - 1 && "print-page-break"
                          )}>
                            {sheet.map((student, slotIdx) => {
                              if (!student) {
                                return (
                                  <div 
                                    key={`empty-${sheetIdx}-${slotIdx}`} 
                                    className="pimaco-label-6180 flex flex-col items-center justify-center text-center p-1 border border-dashed border-slate-200/70 bg-slate-50/20 print:bg-transparent print:border-none print:opacity-0 select-none"
                                  >
                                    <span className="text-[7px] font-bold uppercase tracking-wider text-slate-400 print:hidden">Etiqueta {slotIdx + 1}</span>
                                    <span className="text-[5.5px] font-semibold uppercase tracking-tight mt-0.5 text-slate-400 print:hidden">(Vazio)</span>
                                  </div>
                                );
                              }

                              const hasBodyOrFooter = labelShowAddress || labelShowCourse || labelShowBirthday;
                              const streetLine = [
                                student.address_street,
                                student.address_number ? `nº ${student.address_number}` : '',
                                student.address_complement || ''
                              ].filter(Boolean).join(', ');
                              const districtCityLine = [
                                student.address_neighborhood || '',
                                `${student.address_city || institutionCityName}/${student.address_state || 'SP'}`
                              ].filter(Boolean).join(' • ');

                              return (
                                <div 
                                  key={`filled-${sheetIdx}-${slotIdx}-${student.id}`} 
                                  className={cn(
                                    "pimaco-label-6180 bg-white flex flex-col relative box-border select-none text-left",
                                    hasBodyOrFooter ? "justify-between" : "justify-center"
                                  )}
                                >
                                  {/* Topo: Matrícula e Nome */}
                                  <div className="flex flex-col">
                                    {labelShowMatricula && (
                                      <div className="text-[5.5pt] font-mono font-bold text-slate-600 uppercase tracking-wider leading-none mb-0.5">
                                        Matrícula: <span className="text-slate-950 font-bold">{formatRegistrationNumber(student.registration_number, 'S/ RA')}</span>
                                      </div>
                                    )}
                                    <h5 
                                      className="text-[7.5pt] font-black text-slate-950 uppercase whitespace-normal break-words leading-[1.12]"
                                      style={{
                                        display: '-webkit-box',
                                        WebkitLineClamp: labelShowAddress ? 1 : 2,
                                        WebkitBoxOrient: 'vertical',
                                        overflow: 'hidden',
                                      }}
                                    >
                                      {student.name}
                                    </h5>
                                  </div>

                                  {/* Miolo: Endereço completo */}
                                  {labelShowAddress && (
                                    <div className="flex-1 min-h-0 flex flex-col justify-center text-[5.8pt] text-slate-800 font-semibold leading-[1.2] uppercase">
                                      {student.address_street ? (
                                        <>
                                          <p className="truncate font-bold text-slate-900">{streetLine}</p>
                                          <p className="truncate text-slate-700">{districtCityLine}</p>
                                          <p className="truncate text-slate-700 font-mono text-[5.5pt]">CEP: {student.address_zip || 'NÃO CADASTRADO'}</p>
                                        </>
                                      ) : (
                                        <p className="text-slate-500 italic font-semibold normal-case">Endereço não cadastrado</p>
                                      )}
                                    </div>
                                  )}

                                  {/* Rodapé da Etiqueta */}
                                  {(labelShowCourse || labelShowBirthday) && (
                                    <div className="flex items-center justify-between text-[5.5pt] font-bold text-slate-600 border-t border-slate-200 pt-0.5 uppercase tracking-wider mt-auto leading-none">
                                      <div className="truncate pr-2">
                                        {labelShowCourse ? (student.course || activeClass?.name || 'ESTUDANTE') : ''}
                                      </div>
                                      {labelShowBirthday && (
                                        <div className="flex items-center gap-0.5 text-slate-800 font-extrabold shrink-0 text-right">
                                          <Calendar size={7} className="text-slate-500 shrink-0" />
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


            {/* 5. DECLARAÇÃO FINANCEIRA */}
            {selectedType === 'quitacao' && (
              <div className="flex-1 min-h-0 flex flex-col justify-between pt-[10mm] pb-[14mm]">
                {activeStudent ? (
                  <>
                    <div className="space-y-6">
                      {/* Título Formal */}
                      <div className="text-center space-y-1.5">
                        <h2 className="text-[15pt] font-bold uppercase tracking-[0.18em] font-serif border-b-2 border-slate-900 pb-1.5 px-8 inline-block text-slate-950">
                          Declaração Financeira
                        </h2>
                        <p className="text-[8.5pt] text-slate-600 tracking-[0.16em] uppercase font-mono font-bold pt-0.5">
                          Exercício Letivo {new Date().getFullYear()} • Matrícula Nº {formatRegistrationNumber(activeStudent.registration_number)}
                        </p>
                      </div>

                      {/* Corpo Editorial */}
                      <div className="text-[11.5pt] text-slate-900 leading-[1.9] text-justify font-serif space-y-5 pt-4">
                        <p className="indent-8">
                          A tesouraria e diretoria administrativa da{' '}
                          <strong className="text-slate-950 font-bold uppercase tracking-wide">{institutionNameLabel}</strong>
                          , no uso de suas competências regimentais, certifica para os devidos fins que o(a) estudante{' '}
                          <strong className="text-slate-950 font-bold uppercase">{activeStudent.name}</strong>
                          , inscrito(a) sob o Registro Acadêmico nº{' '}
                          <strong className="text-slate-950 font-mono">{formatRegistrationNumber(activeStudent.registration_number)}</strong>
                          {activeStudentClass ? (
                            <>
                              , vinculado(a) à turma <strong className="text-slate-950">{activeStudentClass.name}</strong>
                            </>
                          ) : null}
                          :
                        </p>

                        {pendingPayments.isPending ? (
                          <div className="bg-rose-50/70 border-l-2 border-rose-700 px-4 py-3 text-slate-950 indent-0">
                            <p className="leading-[1.8]">
                              Apresenta <strong className="text-rose-800 font-bold uppercase">pendência financeira em aberto</strong> referente ao(s) mês(es) de{' '}
                              <strong className="text-slate-950 font-bold">{formatPendingMonthsText(pendingPayments.months)}</strong> do ano de{' '}
                              <strong className="text-slate-950 font-bold">{pendingPayments.year}</strong>, não se encontrando plenamente em dia com a tesouraria desta instituição de ensino até a presente data.
                            </p>
                          </div>
                        ) : (
                          <p className="indent-8">
                            Encontra-se com todas as parcelas e contribuições acadêmicas devidamente quitadas e em dia junto à tesouraria desta instituição de ensino, não constando nenhuma pendência financeira ou débito em aberto até a presente data.
                          </p>
                        )}

                        <p className="indent-8 pt-1">
                          Por ser a expressão da verdade e a pedido da parte interessada, expedimos e assinamos o presente termo.
                        </p>
                      </div>
                    </div>

                    {/* Local, Data e Assinatura */}
                    <div className="w-full pt-8 space-y-16">
                      <div className="w-full text-right text-[11pt] font-serif text-slate-900">
                        <p className="font-semibold tracking-wide">
                          {institutionCityName}, {formatLongDate(documentDate)}.
                        </p>
                      </div>

                      <div className="w-full flex justify-center font-sans">
                        <div className="w-[74mm] mx-auto flex flex-col items-center text-center">
                          <div className="w-full border-t border-slate-900 pt-1.5" />
                          {signerName.trim() && (
                            <p className="text-[9.5pt] font-bold text-slate-950 uppercase tracking-wider leading-tight">
                              {signerName.trim()}
                            </p>
                          )}
                          <p className="text-[8pt] font-bold text-slate-700 uppercase tracking-widest mt-0.5">
                            {signerTitle || 'Tesouraria / Gestão de Contas'}
                          </p>
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-center space-y-4">
                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-full text-slate-400">
                      <Search size={32} className="stroke-[1.5]" />
                    </div>
                    <div className="space-y-1.5 max-w-sm font-sans">
                      <h4 className="text-[12px] font-black text-slate-800 uppercase tracking-widest">Nenhum Aluno Selecionado</h4>
                      <p className="text-[11px] text-slate-500 leading-normal">
                        Para emitir a <strong>Declaração Financeira</strong>, por favor busque e selecione o aluno desejado no painel de configurações à esquerda.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Rodapé Institucional Oficial Unificado para todos os 4 documentos A4 */}
            {isSinglePageType && (
              <footer className="printable-footer mt-auto pt-2 shrink-0">
                <div className="border-t-2 border-slate-900 pt-2 pb-0 flex justify-between items-start gap-6 text-slate-900 text-[7.5pt] font-sans">
                  <div className="flex-1 space-y-0.5 font-bold">
                    <p className="leading-tight">
                      {institution?.address || 'Av. Vênus, 195 - Itapegica'}
                    </p>
                    <p className="leading-tight">
                      CEP: {institution?.cep || '07044-170'} - {institution?.city_uf || 'Guarulhos/SP'}
                    </p>
                    <p className="leading-tight pt-0.5 inline-flex items-center gap-1">
                      <span>Telefone: {institution?.phone || '(11) 2421-2935'}</span>
                      {isInstitutionPhoneWhatsapp(institution) && <FooterWhatsAppIcon />}
                    </p>
                  </div>
                  <div className="text-right max-w-[82mm] leading-tight text-slate-900 font-bold space-y-0.5">
                    <p className="uppercase underline underline-offset-2 mb-0.5">Atendimento Secretaria:</p>
                    <p className="whitespace-pre-line leading-tight font-bold">
                      {institution?.secretary || 'quarta a sexta-feira das 14h às 18h'}
                    </p>
                    <p className="pt-0.5 font-bold lowercase">
                      {(institution?.email || 'edm@diocesedeguarulhos.org.br').toLowerCase()}
                    </p>
                  </div>
                </div>
              </footer>
            )}

            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
