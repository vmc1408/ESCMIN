import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  DollarSign, 
  Printer, 
  Download, 
  Filter, 
  Calendar, 
  GraduationCap, 
  Users, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  Search, 
  RefreshCw, 
  ChevronRight, 
  FileSpreadsheet, 
  FileText,
  Building2,
  TrendingUp,
  TrendingDown,
  Percent,
  Check,
  X,
  CreditCard,
  Layers,
  ArrowUpDown
} from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { fetchAll, getInstitutionSettings } from '../lib/database';
import { financialService } from '../services/financialService';
import { Student, Class, Contribution } from '../types';
import { useUnits } from '../contexts/UnitContext';
import { useAuth } from '../contexts/AuthContext';
import { isItemInUnit, getItemUnitId } from '../lib/unitService';
import { formatCurrency, cn, parseSafeDate, matchesStudentSearch, formatDateForDisplay } from '../lib/utils';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

const MONTH_SHORT = [
  'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
  'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'
];

type PeriodType = 'mensal' | 'trimestral' | 'semestral' | 'anual';
type FinancialStatusFilter = 'all' | 'paid' | 'partial' | 'pending';

export function FinancialReport() {
  const { selectedUnitId, selectedUnit, activeUnits, getUnitName } = useUnits();
  const { profile } = useAuth();

  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [contributions, setContributions] = useState<Contribution[]>([]);
  const [institution, setInstitution] = useState<any>(null);
  const [academicSettingsList, setAcademicSettingsList] = useState<any[]>([]);

  // Filtros
  const [selectedClassId, setSelectedClassId] = useState<string>('all');
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [periodType, setPeriodType] = useState<PeriodType>('mensal');
  
  // Sub-períodos
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1); // 1 a 12
  const [selectedQuarter, setSelectedQuarter] = useState<number>(Math.floor(new Date().getMonth() / 3) + 1); // 1 a 4
  const [selectedSemester, setSelectedSemester] = useState<number>(new Date().getMonth() < 6 ? 1 : 2); // 1 ou 2

  const [statusFilter, setStatusFilter] = useState<FinancialStatusFilter>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [monthlyStandardFee, setMonthlyStandardFee] = useState<number>(100);
  const [isExportingPDF, setIsExportingPDF] = useState(false);

  // Carregamento de dados
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [studentsData, classesData, contribsData, instData, acadData] = await Promise.all([
        fetchAll('students'),
        fetchAll('classes'),
        financialService.getContributions(),
        getInstitutionSettings(),
        fetchAll('academic_settings')
      ]);

      setStudents(studentsData || []);
      setClasses(classesData || []);
      setContributions(contribsData || []);
      setInstitution(instData || null);
      setAcademicSettingsList(acadData || []);
    } catch (err) {
      console.error('Erro ao carregar dados do relatório financeiro:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Turmas filtradas pelo polo ativo
  const scopedClasses = useMemo(() => {
    if (!selectedUnitId || selectedUnitId === 'all') return classes;
    return classes.filter(c => isItemInUnit(getItemUnitId(c), selectedUnitId, activeUnits));
  }, [classes, selectedUnitId, activeUnits]);

  // Alunos filtrados pelo polo ativo
  const scopedStudents = useMemo(() => {
    if (!selectedUnitId || selectedUnitId === 'all') return students;
    return students.filter(s => {
      const studentClass = classes.find(c => c.id === s.class_id);
      const unit = getItemUnitId(s) || (studentClass ? getItemUnitId(studentClass) : 'matriz');
      return isItemInUnit(unit, selectedUnitId, activeUnits);
    });
  }, [students, classes, selectedUnitId, activeUnits]);

  // Determina os meses que compõem o período selecionado
  const periodMonths = useMemo((): number[] => {
    switch (periodType) {
      case 'mensal':
        return [selectedMonth];
      case 'trimestral':
        if (selectedQuarter === 1) return [1, 2, 3];
      if (selectedQuarter === 2) return [4, 5, 6];
      if (selectedQuarter === 3) return [7, 8, 9];
      return [10, 11, 12];
    case 'semestral':
      return selectedSemester === 1 ? [1, 2, 3, 4, 5, 6] : [7, 8, 9, 10, 11, 12];
    case 'anual':
      return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    default:
      return [selectedMonth];
  }
}, [periodType, selectedMonth, selectedQuarter, selectedSemester]);

// Nome amigável do período
const periodLabel = useMemo(() => {
  switch (periodType) {
    case 'mensal':
      return `${MONTH_NAMES[selectedMonth - 1]} de ${selectedYear}`;
    case 'trimestral':
      return `${selectedQuarter}º Trimestre de ${selectedYear} (${MONTH_SHORT[(selectedQuarter - 1) * 3]} a ${MONTH_SHORT[selectedQuarter * 3 - 1]})`;
    case 'semestral':
      return `${selectedSemester}º Semestre de ${selectedYear} (${selectedSemester === 1 ? 'Jan a Jun' : 'Jul a Dez'})`;
    case 'anual':
      return `Ano Letivo Completo de ${selectedYear}`;
    default:
      return `${selectedYear}`;
  }
}, [periodType, selectedMonth, selectedQuarter, selectedSemester, selectedYear]);

// Helper para descobrir os meses esperados academicamente para o aluno no ano
const getExpectedMonthsForStudent = useCallback((student: Student, year: number, paidMonths: number[] = []) => {
  if (student.start_date) {
    const startDate = parseSafeDate(student.start_date);
    if (!isNaN(startDate.getTime()) && startDate.getFullYear() > year) {
      return [];
    }
  }

  let studentStartMonth = 1;
  if (student.start_date) {
    const startDate = parseSafeDate(student.start_date);
    if (!isNaN(startDate.getTime()) && startDate.getFullYear() === year) {
      studentStartMonth = startDate.getMonth() + 1;
    }
  }

  let academicStartMonth = 1;
  let academicEndMonth = 12;

  const classSettings = academicSettingsList.find(s => s.id === student.class_id);
  const generalSettings = academicSettingsList.find(s => s.id === 'current');
  const activeSettings = classSettings || generalSettings;

  if (activeSettings) {
    if (activeSettings.term1_start) {
      const date = new Date(activeSettings.term1_start + 'T00:00:00');
      if (!isNaN(date.getTime())) {
        academicStartMonth = date.getMonth() + 1;
      }
    }
    if (activeSettings.term2_end) {
      const date = new Date(activeSettings.term2_end + 'T00:00:00');
      if (!isNaN(date.getTime())) {
        academicEndMonth = date.getMonth() + 1;
      }
    }
  }

  const expected: number[] = [];
  const minMonth = Math.max(studentStartMonth, academicStartMonth);
  const maxMonth = Math.min(12, Math.max(academicEndMonth, minMonth));

  for (let m = minMonth; m <= maxMonth; m++) {
    expected.push(m);
  }

  // Inclui meses que o aluno pagou mesmo se estiverem fora da grade padrão (ex: antecipações)
  paidMonths.forEach(m => {
    if (m >= studentStartMonth && !expected.includes(m)) {
      expected.push(m);
    }
  });

  expected.sort((a, b) => a - b);
  return expected;
}, [academicSettingsList]);

// Processamento analítico por aluno
const reportData = useMemo(() => {
  // Filtragem de alunos por turma e busca
  const filteredStudents = scopedStudents.filter(student => {
    if (selectedClassId !== 'all' && student.class_id !== selectedClassId) {
      return false;
    }
    if (searchTerm.trim() && !matchesStudentSearch(student, searchTerm.trim())) {
      return false;
    }
    return true;
  });

  return filteredStudents.map(student => {
    const studentClass = classes.find(c => c.id === student.class_id);
    
    // Contribuições deste aluno no ano selecionado
    const studentContribs = contributions.filter(
      c => c.student_id === student.id && Number(c.reference_year) === Number(selectedYear)
    );

    const paidMonthsInYear = studentContribs.map(c => Number(c.reference_month));
    const allExpectedInYear = getExpectedMonthsForStudent(student, selectedYear, paidMonthsInYear);

    // Meses esperados que caem no período selecionado
    const expectedInPeriod = periodMonths.filter(m => allExpectedInYear.includes(m));

    // Contribuições correspondentes aos meses do período
    const contribsInPeriod = studentContribs.filter(c => periodMonths.includes(Number(c.reference_month)));

    // Valor Previsto
    const valorPrevisto = expectedInPeriod.length * monthlyStandardFee;

    // Valor Efetuado (Soma das contribuições do período)
    const valorEfetuado = contribsInPeriod.reduce((sum, c) => sum + (Number(c.amount) || 0), 0);

    // Saldo Pendente
    const saldoPendente = Math.max(0, valorPrevisto - valorEfetuado);

    // Meses Quitados e Pendentes
    const paidMonthsSet = new Set(contribsInPeriod.map(c => Number(c.reference_month)));
    const monthsStatus = periodMonths.map(m => {
      const isExpected = allExpectedInYear.includes(m);
      const isPaid = paidMonthsSet.has(m);
      const contrib = contribsInPeriod.find(c => Number(c.reference_month) === m);
      return {
        month: m,
        monthName: MONTH_NAMES[m - 1],
        monthShort: MONTH_SHORT[m - 1],
        isExpected,
        isPaid,
        amountPaid: contrib ? Number(contrib.amount) : 0,
        paymentDate: contrib?.payment_date,
        paymentMethod: contrib?.payment_method
      };
    });

    // Situação
    let status: 'paid' | 'partial' | 'pending' | 'exempt' = 'pending';
    if (valorPrevisto === 0 && valorEfetuado === 0) {
      status = 'exempt';
    } else if (valorEfetuado >= valorPrevisto && valorPrevisto > 0) {
      status = 'paid';
    } else if (valorEfetuado > 0 && valorEfetuado < valorPrevisto) {
      status = 'partial';
    } else {
      status = 'pending';
    }

    return {
      student,
      studentClass,
      expectedMonthsCount: expectedInPeriod.length,
      paidMonthsCount: contribsInPeriod.length,
      valorPrevisto,
      valorEfetuado,
      saldoPendente,
      monthsStatus,
      status,
      contribsInPeriod
    };
  })
  .filter(item => {
    if (statusFilter === 'all') return true;
    return item.status === statusFilter;
  })
  .sort((a, b) => (a.student.name || '').localeCompare(b.student.name || ''));
}, [
  scopedStudents, 
  classes, 
  contributions, 
  selectedYear, 
  selectedClassId, 
  periodMonths, 
  monthlyStandardFee, 
  searchTerm, 
  statusFilter, 
  getExpectedMonthsForStudent
]);

// Totais e Indicadores Consolidados
const totals = useMemo(() => {
  const totalAlunos = reportData.length;
  const totalPrevisto = reportData.reduce((acc, curr) => acc + curr.valorPrevisto, 0);
  const totalEfetuado = reportData.reduce((acc, curr) => acc + curr.valorEfetuado, 0);
  const totalPendente = reportData.reduce((acc, curr) => acc + curr.saldoPendente, 0);

  const adimplentesCount = reportData.filter(r => r.status === 'paid').length;
  const parciaisCount = reportData.filter(r => r.status === 'partial').length;
  const pendentesCount = reportData.filter(r => r.status === 'pending').length;

  const taxaAdimplencia = totalPrevisto > 0 
    ? Math.min(100, Math.round((totalEfetuado / totalPrevisto) * 100)) 
    : 100;

  return {
    totalAlunos,
    totalPrevisto,
    totalEfetuado,
    totalPendente,
    adimplentesCount,
    parciaisCount,
    pendentesCount,
    taxaAdimplencia
  };
}, [reportData]);

// Disparo da impressão padrão do navegador (Ctrl+P / Botão)
const handlePrint = () => {
  window.print();
};

// Geração de PDF Oficial para Download
const handleExportPDF = () => {
  try {
    setIsExportingPDF(true);
    const doc = new jsPDF('landscape');
    const pageWidth = doc.internal.pageSize.width;

    // Cabeçalho da Instituição
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(institution?.name || 'Escola Diocesana de Ministério', 14, 15);

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    const subheader = [
      institution?.address || 'Diocese de Guarulhos',
      institution?.city ? `${institution.city} - SP` : '',
      institution?.cnpj ? `CNPJ: ${institution.cnpj}` : ''
    ].filter(Boolean).join(' | ');
    doc.text(subheader, 14, 21);

    // Título do Relatório
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(`RELATÓRIO FINANCEIRO: PREVISTO vs. EFETUADO`, 14, 29);

    // Parâmetros do Relatório
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    const selectedClassName = selectedClassId === 'all' 
      ? 'Todas as Turmas' 
      : classes.find(c => c.id === selectedClassId)?.name || 'Turma Selecionada';
    
    const paramsText = `Turma: ${selectedClassName}  |  Período: ${periodLabel}  |  Base Mensalidade: ${formatCurrency(monthlyStandardFee)}  |  Unidade: ${getUnitName(selectedUnitId) || 'Todas'}`;
    doc.text(paramsText, 14, 35);

    // Linha divisória
    doc.setDrawColor(200, 200, 200);
    doc.line(14, 38, pageWidth - 14, 38);

    // Quadro de Totais Sintéticos
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text(`Alunos: ${totals.totalAlunos}  |  Previsto: ${formatCurrency(totals.totalPrevisto)}  |  Arrecadado: ${formatCurrency(totals.totalEfetuado)}  |  Pendente: ${formatCurrency(totals.totalPendente)}  |  Adimplência: ${totals.taxaAdimplencia}%`, 14, 44);

    // Tabela detalhada de alunos
    const tableBody = reportData.map((item, index) => {
      const statusLabel = item.status === 'paid' 
        ? 'Adimplente' 
        : item.status === 'partial' 
        ? 'Parcial' 
        : item.status === 'exempt'
        ? 'Isento'
        : 'Inadimplente';

      // Resumo dos meses
      const mesesResumo = item.monthsStatus
        .map(m => `${m.monthShort}: ${m.isPaid ? 'OK' : m.isExpected ? 'PEND' : '-'}`)
        .join(' ');

      return [
        (index + 1).toString(),
        item.student.registration_number || '---',
        item.student.name || '---',
        item.studentClass?.code || item.studentClass?.name || '---',
        mesesResumo,
        formatCurrency(item.valorPrevisto),
        formatCurrency(item.valorEfetuado),
        formatCurrency(item.saldoPendente),
        statusLabel
      ];
    });

    autoTable(doc, {
      startY: 48,
      head: [['#', 'Matrícula', 'Nome do Aluno', 'Turma', 'Meses do Período', 'Previsto', 'Efetuado', 'Pendente', 'Situação']],
      body: tableBody,
      theme: 'grid',
      headStyles: {
        fillColor: [30, 41, 59],
        textColor: [255, 255, 255],
        fontSize: 8,
        fontStyle: 'bold',
        halign: 'center'
      },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' },
        1: { cellWidth: 24, halign: 'center' },
        2: { cellWidth: 60, halign: 'left' },
        3: { cellWidth: 26, halign: 'center' },
        4: { cellWidth: 55, halign: 'left', fontSize: 7 },
        5: { cellWidth: 26, halign: 'right' },
        6: { cellWidth: 26, halign: 'right' },
        7: { cellWidth: 26, halign: 'right' },
        8: { cellWidth: 24, halign: 'center' }
      },
      styles: {
        fontSize: 8,
        cellPadding: 2,
        overflow: 'linebreak'
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252]
      }
    });

    // Rodapé com data de emissão e assinaturas
    const finalY = (doc as any).lastAutoTable.finalY + 14;
    if (finalY < doc.internal.pageSize.height - 35) {
      doc.setFontSize(8);
      doc.text(`Relatório emitido em ${format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })} por ${profile?.name || 'Administração'}.`, 14, finalY);

      const signY = finalY + 16;
      doc.line(30, signY, 110, signY);
      doc.text('Tesouraria / Gestão Financeira', 45, signY + 4);

      doc.line(pageWidth - 110, signY, pageWidth - 30, signY);
      doc.text('Secretaria Acadêmica / Direção', pageWidth - 100, signY + 4);
    }

    doc.save(`relatorio-financeiro-${selectedYear}-${periodType}.pdf`);
  } catch (err) {
    console.error('Erro ao gerar PDF:', err);
  } finally {
    setIsExportingPDF(false);
  }
};

// Exportar CSV para planilhas
const handleExportCSV = () => {
  const headers = ['Matrícula', 'Aluno', 'CPF', 'Turma', 'Período', 'Previsto', 'Efetuado', 'Pendente', 'Situação'];
  const rows = reportData.map(item => [
    item.student.registration_number || '',
    `"${item.student.name || ''}"`,
    item.student.cpf || '',
    `"${item.studentClass?.name || ''}"`,
    `"${periodLabel}"`,
    item.valorPrevisto.toFixed(2),
    item.valorEfetuado.toFixed(2),
    item.saldoPendente.toFixed(2),
    item.status === 'paid' ? 'Adimplente' : item.status === 'partial' ? 'Parcial' : 'Inadimplente'
  ]);

  const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `relatorio-financeiro-${selectedYear}-${periodType}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

return (
  <div className="space-y-6">
    {/* PageHeader exclusivo na visualização em tela */}
    <div className="print:hidden">
      <PageHeader
        title="Relatório Financeiro"
        description="Acompanhamento consolidado de contribuições e mensalidades previstas e efetuadas por turma."
        icon={DollarSign}
        badge={getUnitName(selectedUnitId) || 'Geral'}
      >
        <div className="flex items-center gap-2">
          <button
            onClick={loadData}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-2xs active:scale-95"
            title="Recarregar Dados Financeiros"
          >
            <RefreshCw size={14} className={cn(loading && "animate-spin")} />
            <span className="hidden sm:inline">Atualizar</span>
          </button>

          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-2xs active:scale-95"
            title="Exportar dados para Excel/CSV"
          >
            <FileSpreadsheet size={15} className="text-emerald-600" />
            <span className="hidden sm:inline">Exportar CSV</span>
          </button>

          <button
            onClick={handleExportPDF}
            disabled={isExportingPDF}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-2xs active:scale-95"
            title="Baixar em formato PDF Oficial"
          >
            <Download size={15} className="text-blue-700" />
            <span className="hidden sm:inline">{isExportingPDF ? 'Gerando...' : 'Baixar PDF'}</span>
          </button>

          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-xs active:scale-95"
            title="Imprimir relatório formatado"
          >
            <Printer size={15} />
            <span>Imprimir</span>
          </button>
        </div>
      </PageHeader>
    </div>

    {/* Cabeçalho Oficial de Impressão (visível apenas na impressão) */}
    <div className="hidden print:block mb-6 border-b border-slate-300 pb-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {institution?.logo_url && (
            <img 
              src={institution.logo_url} 
              alt="Logo" 
              className="w-16 h-16 object-contain"
            />
          )}
          <div>
            <h1 className="text-lg font-black text-slate-900 uppercase">
              {institution?.name || 'Escola Diocesana de Ministério'}
            </h1>
            <p className="text-xs text-slate-600 font-medium">
              {institution?.address || 'Diocese de Guarulhos'} {institution?.city && `- ${institution.city}`} {institution?.cnpj && `| CNPJ: ${institution.cnpj}`}
            </p>
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wide mt-1">
              Relatório Financeiro: Contribuições Previstas vs. Efetuadas
            </h2>
          </div>
        </div>
        <div className="text-right text-xs text-slate-500">
          <p className="font-bold text-slate-700">Emissão: {format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</p>
          <p>Unidade: {getUnitName(selectedUnitId) || 'Todas as Unidades'}</p>
          <p>Operador: {profile?.name || 'Administração'}</p>
        </div>
      </div>
      
      {/* Faixa de Parâmetros na Impressão */}
      <div className="mt-3 p-2.5 bg-slate-100 rounded text-xs flex items-center justify-between font-medium text-slate-800">
        <div>
          <span className="font-bold">Turma: </span>
          {selectedClassId === 'all' ? 'Todas as Turmas' : classes.find(c => c.id === selectedClassId)?.name}
        </div>
        <div>
          <span className="font-bold">Período: </span>
          {periodLabel}
        </div>
        <div>
          <span className="font-bold">Valor Base Mensal: </span>
          {formatCurrency(monthlyStandardFee)}
        </div>
        <div>
          <span className="font-bold">Filtro de Situação: </span>
          {statusFilter === 'all' ? 'Todos' : statusFilter === 'paid' ? 'Adimplentes' : statusFilter === 'partial' ? 'Parciais' : 'Inadimplentes'}
        </div>
      </div>
    </div>

    {/* Painel de Filtros e Seletores (oculto na impressão) */}
    <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-4 sm:p-5 print:hidden space-y-4">
      <div className="flex items-center justify-between pb-3 border-b border-slate-100 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Filter size={16} className="text-blue-600" />
          <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Filtros do Relatório</h3>
        </div>
        <div className="text-xs font-medium text-slate-500">
          Período ativo: <span className="font-bold text-slate-800">{periodLabel}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* Seletor de Turma */}
        <div>
          <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
            Turma
          </label>
          <select
            value={selectedClassId}
            onChange={(e) => setSelectedClassId(e.target.value)}
            className="w-full h-10 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 cursor-pointer"
          >
            <option value="all">Todas as Turmas ({scopedClasses.length})</option>
            {scopedClasses.map(c => (
              <option key={c.id} value={c.id}>
                {c.code ? `[${c.code}] ` : ''}{c.name} {c.period ? `(${c.period})` : ''}
              </option>
            ))}
          </select>
        </div>

        {/* Seletor de Ano Letivo */}
        <div>
          <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
            Ano de Referência
          </label>
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="w-full h-10 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 cursor-pointer"
          >
            {[2027, 2026, 2025, 2024, 2023, 2022].map(yr => (
              <option key={yr} value={yr}>
                {yr} {yr === new Date().getFullYear() ? '(Ano Corrente)' : ''}
              </option>
            ))}
          </select>
        </div>

        {/* Seletor de Regime do Período */}
        <div>
          <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
            Tipo de Período
          </label>
          <div className="grid grid-cols-4 gap-1 bg-slate-100 p-1 rounded-xl h-10">
            {(['mensal', 'trimestral', 'semestral', 'anual'] as PeriodType[]).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setPeriodType(type)}
                className={cn(
                  "text-[10.5px] font-bold capitalize rounded-lg transition-all cursor-pointer flex items-center justify-center",
                  periodType === type 
                    ? "bg-white text-blue-900 shadow-2xs" 
                    : "text-slate-600 hover:text-slate-900"
                )}
              >
                {type === 'mensal' ? 'Mês' : type === 'trimestral' ? 'Trim' : type === 'semestral' ? 'Sem' : 'Ano'}
              </button>
            ))}
          </div>
        </div>

        {/* Sub-seletor do Período Especificado */}
        <div>
          <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
            {periodType === 'mensal' ? 'Mês Selecionado' : periodType === 'trimestral' ? 'Trimestre' : periodType === 'semestral' ? 'Semestre' : 'Exercício Anual'}
          </label>

          {periodType === 'mensal' && (
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              className="w-full h-10 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 cursor-pointer"
            >
              {MONTH_NAMES.map((name, idx) => (
                <option key={idx + 1} value={idx + 1}>
                  {name}
                </option>
              ))}
            </select>
          )}

          {periodType === 'trimestral' && (
            <select
              value={selectedQuarter}
              onChange={(e) => setSelectedQuarter(Number(e.target.value))}
              className="w-full h-10 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 cursor-pointer"
            >
              <option value={1}>1º Trimestre (Janeiro a Março)</option>
              <option value={2}>2º Trimestre (Abril a Junho)</option>
              <option value={3}>3º Trimestre (Julho a Setembro)</option>
              <option value={4}>4º Trimestre (Outubro a Dezembro)</option>
            </select>
          )}

          {periodType === 'semestral' && (
            <select
              value={selectedSemester}
              onChange={(e) => setSelectedSemester(Number(e.target.value))}
              className="w-full h-10 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 cursor-pointer"
            >
              <option value={1}>1º Semestre (Janeiro a Junho)</option>
              <option value={2}>2º Semestre (Julho a Dezembro)</option>
            </select>
          )}

          {periodType === 'anual' && (
            <div className="w-full h-10 px-3 bg-slate-100/80 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 flex items-center">
              12 Meses (Jan a Dez de {selectedYear})
            </div>
          )}
        </div>
      </div>

      {/* Linha secundária de filtros: Situação, Busca e Valor Padrão */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 pt-2 border-t border-slate-100">
        {/* Filtro por Situação Financeira */}
        <div>
          <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
            Situação da Contribuição
          </label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as FinancialStatusFilter)}
            className="w-full h-10 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 cursor-pointer"
          >
            <option value="all">Todas as Situações</option>
            <option value="paid">Apenas Adimplentes (100% Quitados)</option>
            <option value="partial">Apenas Parciais (Quitados em Parte)</option>
            <option value="pending">Apenas Inadimplentes (Pendentes)</option>
          </select>
        </div>

        {/* Busca por Aluno */}
        <div>
          <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
            Buscar Aluno
          </label>
          <div className="relative">
            <Search size={15} className="absolute left-3 top-3 text-slate-400" />
            <input
              type="text"
              placeholder="Nome, Matrícula ou CPF..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full h-10 pl-9 pr-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 p-0.5"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Valor Base da Mensalidade / Previsão */}
        <div>
          <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
            Valor Padrão da Contribuição (Mês)
          </label>
          <div className="relative">
            <span className="absolute left-3 top-2.5 text-xs font-bold text-slate-400">R$</span>
            <input
              type="number"
              min="0"
              step="5"
              value={monthlyStandardFee}
              onChange={(e) => setMonthlyStandardFee(Math.max(0, Number(e.target.value) || 0))}
              className="w-full h-10 pl-9 pr-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>
        </div>
      </div>
    </div>

    {/* Cards de Métricas e Indicadores Consolidados */}
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5 print:grid-cols-4 print:gap-2">
      {/* Card 1: Previsto */}
      <div className="p-4 bg-white rounded-2xl border border-slate-200/90 shadow-2xs flex flex-col justify-between">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
            Total Previsto
          </span>
          <div className="p-2 bg-blue-50 text-blue-700 rounded-xl">
            <Calendar size={18} />
          </div>
        </div>
        <div className="mt-3">
          <span className="text-2xl font-black text-slate-900 tabular-nums">
            {formatCurrency(totals.totalPrevisto)}
          </span>
          <p className="text-[10px] text-slate-500 font-medium mt-1">
            Previsão para {totals.totalAlunos} aluno(s) no período
          </p>
        </div>
      </div>

      {/* Card 2: Efetuado / Arrecadado */}
      <div className="p-4 bg-white rounded-2xl border border-slate-200/90 shadow-2xs flex flex-col justify-between">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
            Total Arrecadado
          </span>
          <div className="p-2 bg-emerald-50 text-emerald-700 rounded-xl">
            <CheckCircle2 size={18} />
          </div>
        </div>
        <div className="mt-3">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-emerald-700 tabular-nums">
              {formatCurrency(totals.totalEfetuado)}
            </span>
          </div>
          <p className="text-[10px] text-slate-500 font-medium mt-1">
            {totals.adimplentesCount} quitados | {totals.parciaisCount} parciais
          </p>
        </div>
      </div>

      {/* Card 3: Saldo Pendente */}
      <div className="p-4 bg-white rounded-2xl border border-slate-200/90 shadow-2xs flex flex-col justify-between">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
            Saldo Pendente
          </span>
          <div className="p-2 bg-amber-50 text-amber-700 rounded-xl">
            <AlertCircle size={18} />
          </div>
        </div>
        <div className="mt-3">
          <span className="text-2xl font-black text-amber-700 tabular-nums">
            {formatCurrency(totals.totalPendente)}
          </span>
          <p className="text-[10px] text-slate-500 font-medium mt-1">
            {totals.pendentesCount} aluno(s) sem contribuição
          </p>
        </div>
      </div>

      {/* Card 4: Taxa de Adimplência */}
      <div className="p-4 bg-white rounded-2xl border border-slate-200/90 shadow-2xs flex flex-col justify-between">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
            Índice de Adimplência
          </span>
          <div className="p-2 bg-indigo-50 text-indigo-700 rounded-xl">
            <Percent size={18} />
          </div>
        </div>
        <div className="mt-3">
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-black text-slate-900 tabular-nums">
              {totals.taxaAdimplencia}%
            </span>
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-slate-100 text-slate-700">
              {totals.taxaAdimplencia >= 80 ? 'Meta Atingida' : totals.taxaAdimplencia >= 50 ? 'Regular' : 'Atenção'}
            </span>
          </div>
          {/* Barra de progresso */}
          <div className="mt-2 h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
            <div 
              className={cn(
                "h-full rounded-full transition-all duration-500",
                totals.taxaAdimplencia >= 80 ? "bg-emerald-500" : totals.taxaAdimplencia >= 50 ? "bg-amber-500" : "bg-rose-500"
              )}
              style={{ width: `${totals.taxaAdimplencia}%` }}
            />
          </div>
        </div>
      </div>
    </div>

    {/* Tabela Analítica de Contribuições por Aluno */}
    <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden print:border-none print:shadow-none">
      <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between print:hidden">
        <div className="flex items-center gap-2">
          <Users size={16} className="text-slate-600" />
          <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
            Demonstrativo por Aluno ({reportData.length})
          </h4>
        </div>
        <div className="text-[11px] font-medium text-slate-500">
          Valores calculados com base no calendário de matrículas e grade da instituição
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50/80 border-b border-slate-200 text-[10px] font-bold uppercase tracking-wider text-slate-600 print:bg-slate-100">
              <th className="py-3 px-3.5 text-center w-12">#</th>
              <th className="py-3 px-3.5">Aluno / Matrícula</th>
              <th className="py-3 px-3.5">Turma</th>
              <th className="py-3 px-3.5 text-center">Meses do Período</th>
              <th className="py-3 px-3.5 text-right">Previsto</th>
              <th className="py-3 px-3.5 text-right">Efetuado</th>
              <th className="py-3 px-3.5 text-right">Pendente</th>
              <th className="py-3 px-3.5 text-center">Situação</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-xs">
            {reportData.length > 0 ? (
              reportData.map((item, idx) => (
                <tr 
                  key={item.student.id}
                  className="hover:bg-slate-50/60 transition-colors"
                >
                  {/* Número sequencial */}
                  <td className="py-3 px-3.5 text-center font-mono text-[10px] text-slate-400">
                    {idx + 1}
                  </td>

                  {/* Nome e Matrícula */}
                  <td className="py-3 px-3.5">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-slate-100 text-slate-700 font-bold text-[11px] flex items-center justify-center shrink-0 border border-slate-200 print:hidden">
                        {item.student.name ? item.student.name.charAt(0).toUpperCase() : '?'}
                      </div>
                      <div className="min-w-0">
                        <span className="font-bold text-slate-900 block truncate leading-tight">
                          {item.student.name}
                        </span>
                        <span className="text-[10px] font-mono text-slate-500 block mt-0.5">
                          Matrícula: {item.student.registration_number || '---'} {item.student.cpf ? `| CPF: ${item.student.cpf}` : ''}
                        </span>
                      </div>
                    </div>
                  </td>

                  {/* Turma */}
                  <td className="py-3 px-3.5">
                    <span className="inline-block px-2 py-0.5 bg-slate-100 text-slate-800 rounded-md text-[10px] font-bold border border-slate-200">
                      {item.studentClass ? (item.studentClass.code || item.studentClass.name) : 'Sem Turma'}
                    </span>
                  </td>

                  {/* Meses do período com badges interativos */}
                  <td className="py-3 px-3.5 text-center">
                    <div className="flex items-center justify-center gap-1 flex-wrap max-w-xs mx-auto">
                      {item.monthsStatus.map((m) => (
                        <span
                          key={m.month}
                          title={
                            m.isPaid 
                              ? `${m.monthName}: Pago ${formatCurrency(m.amountPaid)} em ${m.paymentDate ? formatDateForDisplay(m.paymentDate) : 'data n/d'} (${m.paymentMethod || 'PIX'})` 
                              : m.isExpected 
                              ? `${m.monthName}: Pendente de contribuição` 
                              : `${m.monthName}: Mês facultativo ou fora do ciclo`
                          }
                          className={cn(
                            "px-1.5 py-0.5 rounded text-[9px] font-bold uppercase transition-all",
                            m.isPaid 
                              ? "bg-emerald-100 text-emerald-800 border border-emerald-300" 
                              : m.isExpected 
                              ? "bg-red-50 text-red-700 border border-red-200" 
                              : "bg-slate-100 text-slate-400 border border-slate-200 opacity-60"
                          )}
                        >
                          {m.monthShort}
                        </span>
                      ))}
                    </div>
                  </td>

                  {/* Valor Previsto */}
                  <td className="py-3 px-3.5 text-right font-medium text-slate-600 tabular-nums">
                    {formatCurrency(item.valorPrevisto)}
                  </td>

                  {/* Valor Efetuado */}
                  <td className="py-3 px-3.5 text-right font-bold text-emerald-700 tabular-nums">
                    {formatCurrency(item.valorEfetuado)}
                  </td>

                  {/* Saldo Pendente */}
                  <td className="py-3 px-3.5 text-right font-bold tabular-nums">
                    <span className={cn(item.saldoPendente > 0 ? "text-amber-700 font-black" : "text-slate-400 font-normal")}>
                      {item.saldoPendente > 0 ? formatCurrency(item.saldoPendente) : 'R$ 0,00'}
                    </span>
                  </td>

                  {/* Situação */}
                  <td className="py-3 px-3.5 text-center">
                    {item.status === 'paid' && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <Check size={11} /> Adimplente
                      </span>
                    )}
                    {item.status === 'partial' && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                        <Clock size={11} /> Parcial
                      </span>
                    )}
                    {item.status === 'pending' && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-red-50 text-red-700 border border-red-200">
                        <X size={11} /> Pendente
                      </span>
                    )}
                    {item.status === 'exempt' && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500 border border-slate-200">
                        Isento
                      </span>
                    )}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={8} className="py-12 text-center text-slate-400">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <DollarSign size={32} className="text-slate-300" />
                    <p className="text-xs font-bold text-slate-700">Nenhum aluno encontrado para os filtros selecionados.</p>
                    <p className="text-[11px] text-slate-400">Experimente alterar a turma, o período ou limpar o termo de busca.</p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>

          {/* Rodapé da Tabela com Totais */}
          {reportData.length > 0 && (
            <tfoot>
              <tr className="bg-slate-100/90 font-bold border-t-2 border-slate-300 text-slate-900 text-xs">
                <td colSpan={4} className="py-3 px-3.5 text-right uppercase tracking-wider text-[11px]">
                  Total Consolidado ({reportData.length} alunos):
                </td>
                <td className="py-3 px-3.5 text-right font-black text-slate-800 tabular-nums">
                  {formatCurrency(totals.totalPrevisto)}
                </td>
                <td className="py-3 px-3.5 text-right font-black text-emerald-700 tabular-nums">
                  {formatCurrency(totals.totalEfetuado)}
                </td>
                <td className="py-3 px-3.5 text-right font-black text-amber-700 tabular-nums">
                  {formatCurrency(totals.totalPendente)}
                </td>
                <td className="py-3 px-3.5 text-center text-[11px] font-black text-indigo-700">
                  {totals.taxaAdimplencia}% Arrecadado
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>

    {/* Seção de Assinaturas e Rodapé da Impressão */}
    <div className="hidden print:block mt-12 pt-8 border-t border-slate-300">
      <div className="grid grid-cols-2 gap-12 text-center text-xs text-slate-700">
        <div>
          <div className="border-t border-slate-400 w-3/4 mx-auto pt-2">
            <p className="font-bold text-slate-900">Tesouraria / Gestão Financeira</p>
            <p className="text-[10px] text-slate-500">Responsável pela Prestação de Contas</p>
          </div>
        </div>
        <div>
          <div className="border-t border-slate-400 w-3/4 mx-auto pt-2">
            <p className="font-bold text-slate-900">Secretaria Acadêmica / Direção</p>
            <p className="text-[10px] text-slate-500">Conferência e Arquivamento Oficial</p>
          </div>
        </div>
      </div>
      <div className="mt-8 text-center text-[9px] text-slate-400">
        Documento emitido eletronicamente pelo Sistema de Gestão Escolar ESCMIN em {format(new Date(), "dd/MM/yyyy 'às' HH:mm:ss")}.
      </div>
    </div>
  </div>
);
}
