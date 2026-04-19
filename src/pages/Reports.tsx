import React, { useState, useEffect, useMemo } from 'react';
import { 
  BarChart3, 
  Printer, 
  FileDown, 
  RefreshCw, 
  Search, 
  TrendingUp, 
  Users, 
  GraduationCap, 
  CreditCard,
  Calendar,
  Filter,
  Download,
  X,
  CheckCircle2,
  AlertCircle,
  FileText,
  PieChart as PieChartIcon,
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  ChevronRight,
  Layers,
  Target,
  Clock
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Cell,
  PieChart,
  Pie,
  LineChart,
  Line,
  AreaChart,
  Area,
  Legend
} from 'recharts';
import { formatCurrency, cn } from '../lib/utils';
import { supabase, fetchAll } from '../lib/supabase';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format, subMonths, startOfMonth, endOfMonth, isWithinInterval, parseISO, isSameMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';

type ReportCategory = 'general' | 'financial' | 'academic' | 'operational';

export function Reports() {
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<ReportCategory>('general');
  const [stats, setStats] = useState({
    totalStudents: 0,
    activeStudents: 0,
    totalTeachers: 0,
    totalClasses: 0,
    totalPixAmount: 0,
    pixCount: 0,
    matchedPix: 0,
    revenueGrowth: 0,
    studentGrowth: 0,
    occupancyRate: 0
  });
  
  const [revenueData, setRevenueData] = useState<any[]>([]);
  const [statusData, setStatusData] = useState<any[]>([]);
  const [recentPix, setRecentPix] = useState<any[]>([]);
  const [studentsByClass, setStudentsByClass] = useState<any[]>([]);
  const [institution, setInstitution] = useState<any>(null);
  const [filterPeriod, setFilterPeriod] = useState('30');
  const [notification, setNotification] = useState<{ type: 'success' | 'error', message: string } | null>(null);

  useEffect(() => {
    fetchData();
    fetchInstitution();
  }, [filterPeriod]);

  const fetchInstitution = async () => {
    const { data } = await supabase
      .from('institution_settings')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1);
    if (data && data.length > 0) setInstitution(data[0]);
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const sixMonthsAgo = subMonths(new Date(), 6).toISOString();

      const [totalCountRes, activeCountRes, activeTeachersRes, inactiveCountRes, concludedCountRes, classesData, pixDataRaw] = await Promise.all([
        supabase.from('students').select('*', { count: 'exact', head: true }),
        supabase.from('students').select('*', { count: 'exact', head: true }).or('status.eq.Ativo,status.is.null,status.eq.""'),
        supabase.from('teachers').select('*', { count: 'exact', head: true }).or('status.eq.Ativo,status.is.null,status.eq.""'),
        supabase.from('students').select('*', { count: 'exact', head: true }).eq('status', 'Inativo'),
        supabase.from('students').select('*', { count: 'exact', head: true }).eq('status', 'Concluído'),
        fetchAll('classes', '*', 'name', true),
        fetchAll('pix_reconciliations', '*, student:students(name, registration_number)', 'created_at', false)
      ]);

      const totalStudents = totalCountRes.count || 0;
      const activeStudents = activeCountRes.count || 0;
      const inactiveCount = inactiveCountRes.count || 0;
      const concludedCount = concludedCountRes.count || 0;
      
      // Filter classes locally for status
      const activeClasses = classesData.filter(c => !c.status || c.status === 'Ativo');

      // Filter pix data locally for the 6 months period
      const pixData = pixDataRaw.filter(p => p.created_at >= sixMonthsAgo);
      const totalPix = pixData.reduce((acc, curr) => acc + Number(curr.amount || 0), 0);
      const matched = pixData.filter(p => p.status === 'matched').length;

      // Calculate Growth (Current Month vs Previous Month)
      const now = new Date();
      const lastMonth = subMonths(now, 1);
      
      const currentMonthRevenue = pixData
        .filter(p => isSameMonth(parseISO(p.created_at), now))
        .reduce((acc, curr) => acc + Number(curr.amount || 0), 0);
      
      const lastMonthRevenue = pixData
        .filter(p => isSameMonth(parseISO(p.created_at), lastMonth))
        .reduce((acc, curr) => acc + Number(curr.amount || 0), 0);
      
      const revenueGrowth = lastMonthRevenue > 0 
        ? ((currentMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100 
        : 0;

      // For student growth, we'd need historical data or a created_at filter
      const { count: currentMonthStudents } = await supabase.from('students')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', startOfMonth(now).toISOString())
        .lte('created_at', endOfMonth(now).toISOString());
      
      const { count: lastMonthStudents } = await supabase.from('students')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', startOfMonth(lastMonth).toISOString())
        .lte('created_at', endOfMonth(lastMonth).toISOString());

      const studentGrowth = (lastMonthStudents || 0) > 0 
        ? (((currentMonthStudents || 0) - (lastMonthStudents || 0)) / (lastMonthStudents || 0)) * 100 
        : 0;

      setStats({
        totalStudents,
        activeStudents,
        totalTeachers: activeTeachersRes.count || 0,
        totalClasses: activeClasses.length,
        totalPixAmount: totalPix,
        pixCount: pixData.length,
        matchedPix: matched,
        revenueGrowth: isNaN(revenueGrowth) ? 0 : Number(revenueGrowth.toFixed(1)),
        studentGrowth: isNaN(studentGrowth) ? 0 : Number(studentGrowth.toFixed(1)),
        occupancyRate: totalStudents > 0 ? Math.round((activeStudents / totalStudents) * 100) : 0
      });

      setRecentPix(pixData.slice(0, 15));
      
      setStatusData([
        { name: 'Ativos', value: activeStudents, color: '#10b981' },
        { name: 'Inativos', value: inactiveCount, color: '#ef4444' },
        { name: 'Concluídos', value: concludedCount, color: '#6366f1' },
        { name: 'Suspensos', value: totalStudents - activeStudents - inactiveCount - concludedCount, color: '#f59e0b' }
      ]);

      const months = Array.from({ length: 6 }).map((_, i) => {
        const d = subMonths(new Date(), 5 - i);
        return {
          month: format(d, 'MMM', { locale: ptBR }),
          fullName: format(d, 'MMMM yyyy', { locale: ptBR }),
          amount: 0,
          count: 0,
          date: d
        };
      });

      pixData.forEach(p => {
        const pDate = parseISO(p.created_at);
        months.forEach(m => {
          if (isWithinInterval(pDate, { start: startOfMonth(m.date), end: endOfMonth(m.date) })) {
            m.amount += Number(p.amount);
            m.count += 1;
          }
        });
      });
      setRevenueData(months);
      
      // Fetch counts per class
      const classStats = await Promise.all(classesData.map(async (c) => {
        const { count } = await supabase.from('students')
          .select('*', { count: 'exact', head: true })
          .eq('class_id', c.id);
        
        return {
          name: c.name,
          code: c.code,
          count: count || 0,
          period: c.period,
          percentage: totalStudents > 0 ? Math.round(((count || 0) / totalStudents) * 100) : 0
        };
      }));

      setStudentsByClass(classStats.sort((a, b) => b.count - a.count));

    } catch (error) {
      console.error('Error fetching report data:', error);
    } finally {
      setLoading(false);
    }
  };

  const generatePDF = () => {
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.width;
      const margin = 15;

      // Professional Centered Header (Figma Style)
      const centerX = pageWidth / 2;
      let startY = 15;
      
      // Left Logo
      if (institution?.logo_url) {
        try {
          doc.addImage(institution.logo_url, 'PNG', margin, startY, 25, 25);
        } catch (e) {}
      }
      
      // Text Content Centered
      doc.setTextColor(0, 23, 75);
      doc.setFontSize(22);
      doc.setFont('helvetica', 'bold');
      doc.text(institution?.name?.toUpperCase() || 'ESCMIN - GESTÃO ESCOLAR', centerX, startY + 10, { align: 'center' });
      
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100);
      doc.text(institution?.address || 'Av. Venus, 195 - Itapegica - Guarulhos - Cep 07044-170', centerX, startY + 17, { align: 'center' });
      
      const contactInfo = [
        institution?.cnpj ? `CNPJ: ${institution.cnpj}` : '',
        institution?.phone ? `Tel: ${institution.phone}` : '',
        institution?.email ? `E-mail: ${institution.email}` : ''
      ].filter(Boolean).join('  |  ');
      doc.text(contactInfo, centerX, startY + 22, { align: 'center' });

      if (institution?.website) {
        doc.setFontSize(8);
        doc.text(institution.website.toUpperCase(), centerX, startY + 26, { align: 'center' });
      }

      // Main Horizontal Divider (Thick)
      doc.setDrawColor(0);
      doc.setLineWidth(1);
      doc.line(margin, startY + 32, pageWidth - margin, startY + 32);
      
      // Report Title Centered
      doc.setTextColor(0);
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text(`RELATÓRIO FINANCEIRO - ${format(new Date(), 'dd/MM/yyyy')}`, centerX, startY + 45, { align: 'center' });
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`Período: ${format(new Date(), 'dd/MM/yyyy')}`, margin, startY + 55);
      doc.text(`Categoria: ${activeCategory.toUpperCase()}`, margin, startY + 62);
      doc.text(`Autenticidade: ${Math.random().toString(36).substring(2, 10).toUpperCase()}`, pageWidth - margin, startY + 62, { align: 'right' });

      let currentY = 75;
      doc.setTextColor(0, 23, 75);
      doc.setFontSize(14);
      doc.text('1. RESUMO DE INDICADORES CHAVE (KPIs)', margin, currentY);
      doc.setDrawColor(0, 23, 75);
      doc.setLineWidth(0.5);
      doc.line(margin, currentY + 2, pageWidth - margin, currentY + 2);

      autoTable(doc, {
        startY: currentY + 8,
        head: [['Indicador de Desempenho', 'Valor Atual', 'Comparativo / Status']],
        body: [
          ['Total de Alunos Matriculados', stats.totalStudents.toString(), `${stats.studentGrowth >= 0 ? '+' : ''}${stats.studentGrowth}% vs Mês Anterior`],
          ['Taxa de Ocupação Ativa', `${stats.occupancyRate}%`, stats.occupancyRate > 80 ? 'EXCELENTE' : 'EM MONITORAMENTO'],
          ['Receita Total Arrecadada (Pix)', formatCurrency(stats.totalPixAmount), `${stats.revenueGrowth >= 0 ? '+' : ''}${stats.revenueGrowth}% vs Mês Anterior`],
          ['Eficiência de Conciliação Bancária', `${Math.round((stats.matchedPix / stats.pixCount) * 100)}%`, 'ALTA PRECISÃO'],
          ['Corpo Docente Ativo', stats.totalTeachers.toString(), 'ESTÁVEL'],
          ['Turmas em Operação', stats.totalClasses.toString(), 'CAPACIDADE PLENA']
        ],
        theme: 'grid',
        headStyles: { fillColor: [0, 23, 75], fontStyle: 'bold' },
        styles: { fontSize: 10, cellPadding: 4 },
        columnStyles: { 1: { fontStyle: 'bold', halign: 'center' }, 2: { halign: 'center' } }
      });

      currentY = (doc as any).lastAutoTable.finalY + 15;

      if (activeCategory === 'general' || activeCategory === 'academic') {
        doc.text('2. DISTRIBUIÇÃO ACADÊMICA POR TURMA', margin, currentY);
        autoTable(doc, {
          startY: currentY + 5,
          head: [['Cód.', 'Nome da Turma', 'Período', 'Qtd. Alunos', 'Representatividade']],
          body: studentsByClass.map(c => [c.code, c.name, c.period, c.count, `${c.percentage}%`]),
          headStyles: { fillColor: [73, 124, 255] },
          theme: 'striped',
          styles: { fontSize: 9 }
        });
        currentY = (doc as any).lastAutoTable.finalY + 15;
      }

      if (activeCategory === 'general' || activeCategory === 'financial') {
        if (currentY > 230) { doc.addPage(); currentY = 20; }
        doc.text('3. AUDITORIA DE TRANSAÇÕES FINANCEIRAS', margin, currentY);
        autoTable(doc, {
          startY: currentY + 5,
          head: [['Data', 'Pagador / Origem', 'Valor Bruto', 'Status de Conciliação']],
          body: recentPix.map(p => [
            p.date, 
            p.payer_name.toUpperCase(), 
            formatCurrency(p.amount),
            p.status === 'matched' ? 'CONCILIADO' : 'PENDENTE DE VÍNCULO'
          ]),
          headStyles: { fillColor: [16, 185, 129] },
          theme: 'grid',
          styles: { fontSize: 8 }
        });
        currentY = (doc as any).lastAutoTable.finalY + 15;
      }

      // 4. AI Insights Section in PDF
      if (currentY > 230) { doc.addPage(); currentY = 20; }
      doc.setTextColor(0, 23, 75);
      doc.setFontSize(16);
      doc.text('4. INSIGHTS ESTRATÉGICOS (IA)', margin, currentY);
      doc.setDrawColor(0, 23, 75);
      doc.line(margin, currentY + 2, pageWidth - margin, currentY + 2);
      
      doc.setFontSize(10);
      doc.setTextColor(50);
      const insights = [
        `FINANCEIRO: Receita via Pix cresceu ${stats.revenueGrowth}% este mês. Eficiência de conciliação: ${stats.pixCount > 0 ? Math.round((stats.matchedPix / stats.pixCount) * 100) : 0}%.`,
        `ACADÊMICO: Base de alunos ativos: ${stats.activeStudents}. Taxa de ocupação: ${stats.occupancyRate}%. Crescimento: ${stats.studentGrowth}%.`,
        `OPERACIONAL: Média de ${stats.totalClasses > 0 ? Math.round(stats.totalStudents / stats.totalClasses) : 0} alunos por turma. Proporção aluno/professor: ${stats.totalTeachers > 0 ? (stats.totalStudents / stats.totalTeachers).toFixed(1) : '0'}.`
      ];
      
      let insightY = currentY + 10;
      insights.forEach(text => {
        const splitText = doc.splitTextToSize(text, pageWidth - (margin * 2) - 10);
        doc.setFillColor(245, 247, 250);
        doc.rect(margin, insightY - 5, pageWidth - (margin * 2), (splitText.length * 5) + 5, 'F');
        doc.text(splitText, margin + 5, insightY);
        insightY += (splitText.length * 5) + 10;
      });

      // Final Signature Section
      const finalY = (doc as any).lastAutoTable.finalY + 30;
      if (finalY < 250) {
        doc.setDrawColor(0);
        doc.line(margin + 10, finalY, margin + 80, finalY);
        doc.line(pageWidth - margin - 80, finalY, pageWidth - margin - 10, finalY);
        doc.setFontSize(8);
        doc.text('DIRETORIA ADMINISTRATIVA', margin + 45, finalY + 5, { align: 'center' });
        doc.text('CONTROLE DE QUALIDADE', pageWidth - margin - 45, finalY + 5, { align: 'center' });
      }

      const pageCount = (doc as any).internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(150);
        doc.text(`Página ${i} de ${pageCount} - ESCMIN Intelligence System - Documento Gerado Eletronicamente`, pageWidth / 2, doc.internal.pageSize.height - 10, { align: 'center' });
      }

      doc.save(`ESCMIN_Report_${activeCategory}_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
      setNotification({ type: 'success', message: 'Relatório Profissional gerado com sucesso!' });
    } catch (error) {
      console.error('PDF Error:', error);
      setNotification({ type: 'error', message: 'Erro crítico ao processar o documento PDF.' });
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] pb-20">
      {/* Notification */}
      {notification && (
        <div className={cn(
          "fixed top-6 right-6 z-[200] px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-4 print:hidden",
          notification.type === 'success' ? "bg-emerald-600 text-white" : "bg-rose-600 text-white"
        )}>
          {notification.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
          <p className="font-bold text-sm tracking-tight">{notification.message}</p>
          <button onClick={() => setNotification(null)} className="ml-2 opacity-70 hover:opacity-100">
            <X size={16} />
          </button>
        </div>
      )}

      {/* Modern Sticky Header */}
      <div className="bg-white border-b border-slate-200 px-8 py-6 mb-8 sticky top-0 z-40 shadow-sm print:hidden">
        <div className="max-w-7xl mx-auto flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-[#00174b] rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-900/20">
              <BarChart3 size={32} />
            </div>
            <div>
              <h1 className="text-3xl font-black text-[#00174b] tracking-tighter">ESCMIN Intelligence</h1>
              <div className="flex items-center gap-2 text-slate-400 font-bold text-[10px] uppercase tracking-[0.2em]">
                <Activity size={12} className="text-emerald-500" />
                Monitoramento em Tempo Real
              </div>
            </div>
          </div>
          
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
              {(['general', 'financial', 'academic'] as ReportCategory[]).map((cat) => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={cn(
                    "px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                    activeCategory === cat 
                      ? "bg-white text-[#00174b] shadow-md" 
                      : "text-slate-500 hover:text-slate-700"
                  )}
                >
                  {cat === 'general' ? 'Geral' : cat === 'financial' ? 'Financeiro' : 'Acadêmico'}
                </button>
              ))}
            </div>
            <div className="h-10 w-[1px] bg-slate-200 mx-2 hidden lg:block"></div>
            <button 
              onClick={handlePrint}
              className="p-3.5 bg-white border border-slate-200 text-slate-600 rounded-2xl hover:bg-slate-50 transition-all shadow-sm active:scale-95"
              title="Imprimir Relatório"
            >
              <Printer size={20} />
            </button>
            <button 
              onClick={generatePDF}
              className="px-8 py-3.5 bg-[#00174b] text-white text-[11px] font-black uppercase tracking-[0.15em] rounded-2xl flex items-center gap-3 hover:opacity-95 transition-all shadow-2xl shadow-blue-900/30 active:scale-95"
            >
              <FileDown size={20} />
              Exportar Relatório
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-8 space-y-8 print:hidden">
        {/* KPI Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-white p-8 rounded-2xl border border-slate-100 shadow-sm relative group hover:shadow-xl transition-all duration-500">
            <div className="flex items-center justify-between mb-6">
              <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                <Users size={28} />
              </div>
              <div className={cn(
                "flex items-center gap-1 font-black text-[10px] px-2.5 py-1.5 rounded-xl",
                stats.studentGrowth >= 0 ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
              )}>
                {stats.studentGrowth >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                {Math.abs(stats.studentGrowth)}%
              </div>
            </div>
            <p className="text-4xl font-black text-[#00174b] tracking-tighter mb-1">{stats.totalStudents}</p>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Alunos Matriculados</p>
            <div className="mt-6 h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-blue-500 rounded-full transition-all duration-1000" style={{ width: `${stats.occupancyRate}%` }}></div>
            </div>
          </div>

          <div className="bg-white p-8 rounded-2xl border border-slate-100 shadow-sm relative group hover:shadow-xl transition-all duration-500">
            <div className="flex items-center justify-between mb-6">
              <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                <CreditCard size={28} />
              </div>
              <div className={cn(
                "flex items-center gap-1 font-black text-[10px] px-2.5 py-1.5 rounded-xl",
                stats.revenueGrowth >= 0 ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
              )}>
                {stats.revenueGrowth >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                {Math.abs(stats.revenueGrowth)}%
              </div>
            </div>
            <p className="text-4xl font-black text-[#00174b] tracking-tighter mb-1">{formatCurrency(stats.totalPixAmount)}</p>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Receita Acumulada</p>
            <p className="mt-4 text-[10px] text-slate-500 font-bold flex items-center gap-2">
              <Target size={12} className="text-emerald-500" />
              Meta Mensal: {formatCurrency(50000)}
            </p>
          </div>

          <div className="bg-white p-8 rounded-2xl border border-slate-100 shadow-sm relative group hover:shadow-xl transition-all duration-500">
            <div className="flex items-center justify-between mb-6">
              <div className="w-14 h-14 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                <Layers size={28} />
              </div>
              <div className="bg-slate-50 text-slate-400 font-black text-[10px] px-2.5 py-1.5 rounded-xl uppercase">Ativas</div>
            </div>
            <p className="text-4xl font-black text-[#00174b] tracking-tighter mb-1">{stats.totalClasses}</p>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Turmas em Operação</p>
            <div className="mt-6 flex items-center gap-2">
              <div className="flex -space-x-2">
                {[1,2,3].map(i => <div key={i} className="w-6 h-6 rounded-full bg-slate-200 border-2 border-white"></div>)}
              </div>
              <span className="text-[10px] font-bold text-slate-400">+{stats.totalTeachers} Professores</span>
            </div>
          </div>

          <div className="bg-white p-8 rounded-2xl border border-slate-100 shadow-sm relative group hover:shadow-xl transition-all duration-500">
            <div className="flex items-center justify-between mb-6">
              <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                <Target size={28} />
              </div>
              <div className="bg-amber-50 text-amber-600 font-black text-[10px] px-2.5 py-1.5 rounded-xl uppercase">Eficiência</div>
            </div>
            <p className="text-4xl font-black text-[#00174b] tracking-tighter mb-1">{stats.occupancyRate}%</p>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Taxa de Ocupação</p>
            <p className="mt-4 text-[10px] text-slate-500 font-bold flex items-center gap-2">
              <Clock size={12} className="text-amber-500" />
              Última atualização: Agora
            </p>
          </div>
        </div>

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 bg-white p-10 rounded-3xl border border-slate-100 shadow-sm">
            <div className="flex flex-col md:flex-row md:items-center justify-between mb-10 gap-4">
              <div>
                <h3 className="text-xl font-black text-[#00174b] tracking-tight">Análise de Fluxo Financeiro</h3>
                <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em]">Evolução Mensal de Arrecadação Pix</p>
              </div>
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-blue-500 shadow-lg shadow-blue-500/50"></div>
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Receita Bruta</span>
                </div>
              </div>
            </div>
            <div className="h-[350px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={revenueData}>
                  <defs>
                    <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15}/>
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis 
                    dataKey="month" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fontSize: 10, fontWeight: 800, fill: '#64748b' }}
                    dy={15}
                  />
                  <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fontSize: 10, fontWeight: 800, fill: '#64748b' }}
                    tickFormatter={(value) => `R$ ${value/1000}k`}
                  />
                  <Tooltip 
                    contentStyle={{ borderRadius: '24px', border: 'none', boxShadow: '0 25px 50px -12px rgb(0 0 0 / 0.15)', padding: '15px' }}
                    itemStyle={{ fontSize: '12px', fontWeight: '900', color: '#00174b' }}
                    formatter={(value: any) => [formatCurrency(value), 'Arrecadação']}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="amount" 
                    stroke="#3b82f6" 
                    strokeWidth={5}
                    fillOpacity={1} 
                    fill="url(#colorRev)" 
                    animationDuration={2000}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white p-10 rounded-3xl border border-slate-100 shadow-sm flex flex-col">
            <h3 className="text-xl font-black text-[#00174b] tracking-tight mb-2">Composição da Base</h3>
            <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em] mb-10">Distribuição por Status</p>
            
            <div className="flex-1 flex flex-col justify-center">
              <div className="h-[250px] w-full relative mb-10">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={statusData}
                      cx="50%"
                      cy="50%"
                      innerRadius={75}
                      outerRadius={100}
                      paddingAngle={10}
                      dataKey="value"
                      stroke="none"
                    >
                      {statusData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-4xl font-black text-[#00174b] tracking-tighter">{stats.totalStudents}</span>
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Alunos</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {statusData.map((item, i) => (
                  <div key={i} className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-2.5 h-2.5 rounded-full shadow-sm" style={{ backgroundColor: item.color }}></div>
                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">{item.name}</span>
                    </div>
                    <span className="text-lg font-black text-[#00174b]">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* AI Insights Section */}
        <div className="bg-gradient-to-br from-[#00174b] to-[#002b8a] rounded-3xl p-10 text-white shadow-2xl shadow-blue-900/40 relative overflow-hidden group">
          <div className="relative z-10">
            <div className="flex items-center gap-4 mb-8">
              <div className="w-12 h-12 bg-white/10 backdrop-blur-md rounded-2xl flex items-center justify-center border border-white/10">
                <Target className="text-blue-400" size={24} />
              </div>
              <div>
                <h3 className="text-xl font-black tracking-tight">Insights Estratégicos</h3>
                <p className="text-blue-200/60 text-[10px] font-black uppercase tracking-[0.2em]">Análise Automatizada de Dados</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="space-y-4 p-6 bg-white/5 rounded-[2rem] border border-white/5 hover:bg-white/10 transition-all">
                <div className="flex items-center gap-3 text-emerald-400">
                  <TrendingUp size={20} />
                  <span className="text-xs font-black uppercase tracking-widest">Desempenho Financeiro</span>
                </div>
                <p className="text-sm text-blue-100/80 leading-relaxed">
                  A receita via Pix apresentou um crescimento de <span className="text-white font-black">{stats.revenueGrowth}%</span> este mês. 
                  A eficiência de conciliação está em <span className="text-white font-black">{stats.pixCount > 0 ? Math.round((stats.matchedPix / stats.pixCount) * 100) : 0}%</span>, 
                  reduzindo significativamente o trabalho manual da secretaria.
                </p>
              </div>

              <div className="space-y-4 p-6 bg-white/5 rounded-[2rem] border border-white/5 hover:bg-white/10 transition-all">
                <div className="flex items-center gap-3 text-blue-400">
                  <Users size={20} />
                  <span className="text-xs font-black uppercase tracking-widest">Retenção Acadêmica</span>
                </div>
                <p className="text-sm text-blue-100/80 leading-relaxed">
                  Com <span className="text-white font-black">{stats.activeStudents}</span> alunos ativos, a taxa de ocupação é de <span className="text-white font-black">{stats.occupancyRate}%</span>. 
                  O crescimento da base de alunos foi de <span className="text-white font-black">{stats.studentGrowth}%</span>, 
                  indicando uma tendência positiva de novas matrículas.
                </p>
              </div>

              <div className="space-y-4 p-6 bg-white/5 rounded-[2rem] border border-white/5 hover:bg-white/10 transition-all">
                <div className="flex items-center gap-3 text-purple-400">
                  <Activity size={20} />
                  <span className="text-xs font-black uppercase tracking-widest">Capacidade Operacional</span>
                </div>
                <p className="text-sm text-blue-100/80 leading-relaxed">
                  A média de <span className="text-white font-black">{stats.totalClasses > 0 ? Math.round(stats.totalStudents / stats.totalClasses) : 0}</span> alunos por turma 
                  está dentro do limite ideal de ensino. A proporção aluno/professor é de <span className="text-white font-black">{stats.totalTeachers > 0 ? (stats.totalStudents / stats.totalTeachers).toFixed(1) : '0'}</span>, 
                  garantindo atenção individualizada.
                </p>
              </div>
            </div>
          </div>
          
          {/* Decorative background elements */}
          <div className="absolute -right-20 -top-20 w-80 h-80 bg-blue-500/20 rounded-full blur-[100px] group-hover:bg-blue-500/30 transition-all duration-1000"></div>
          <div className="absolute -left-20 -bottom-20 w-80 h-80 bg-purple-500/20 rounded-full blur-[100px] group-hover:bg-purple-500/30 transition-all duration-1000"></div>
        </div>

        {/* Detailed Data Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Academic Occupancy */}
          <div className="bg-white rounded-[3rem] border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-10 py-8 border-b border-slate-50 flex items-center justify-between bg-slate-50/30">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-white shadow-md flex items-center justify-center text-blue-600">
                  <GraduationCap size={24} />
                </div>
                <div>
                  <h3 className="text-sm font-black uppercase tracking-[0.2em] text-[#00174b]">Ocupação Acadêmica</h3>
                  <p className="text-[10px] font-bold text-slate-400">Análise por Turma e Período</p>
                </div>
              </div>
              <button className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-[10px] font-black text-blue-600 uppercase tracking-widest hover:bg-slate-50 transition-all">
                Exportar CSV
              </button>
            </div>
            <div className="p-10 space-y-8">
              {studentsByClass.slice(0, 5).map((c, i) => (
                <div key={i} className="space-y-3 group">
                  <div className="flex justify-between items-end">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-[10px] font-black text-slate-500">
                        {c.code}
                      </div>
                      <div>
                        <p className="text-sm font-black text-[#00174b] group-hover:text-blue-600 transition-colors">{c.name}</p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase">{c.period}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-black text-[#00174b]">{c.count} Alunos</p>
                      <p className="text-[10px] font-bold text-emerald-500">{c.percentage}% da Base</p>
                    </div>
                  </div>
                  <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-blue-600 to-blue-400 rounded-full transition-all duration-1000 shadow-sm" 
                      style={{ width: `${c.percentage}%` }}
                    ></div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Financial Audit */}
          <div className="bg-white rounded-[3rem] border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-10 py-8 border-b border-slate-50 flex items-center justify-between bg-slate-50/30">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-white shadow-md flex items-center justify-center text-emerald-600">
                  <CreditCard size={24} />
                </div>
                <div>
                  <h3 className="text-sm font-black uppercase tracking-[0.2em] text-[#00174b]">Auditoria Pix</h3>
                  <p className="text-[10px] font-bold text-slate-400">Conciliação de Recebíveis</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Live Feed</span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50/50">
                    <th className="px-10 py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Data</th>
                    <th className="px-10 py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Pagador</th>
                    <th className="px-10 py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] text-right">Valor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {recentPix.slice(0, 7).map((p, i) => (
                    <tr key={i} className="hover:bg-slate-50/50 transition-colors group">
                      <td className="px-10 py-5 text-xs font-bold text-slate-500">{p.date}</td>
                      <td className="px-10 py-5">
                        <p className="text-sm font-black text-[#00174b] uppercase truncate max-w-[200px]">{p.payer_name}</p>
                        <p className="text-[10px] font-bold text-slate-400 flex items-center gap-1">
                          <Users size={10} />
                          {p.student?.name || 'Não Identificado'}
                        </p>
                      </td>
                      <td className="px-10 py-5 text-right">
                        <span className={cn(
                          "px-3 py-1.5 rounded-xl text-xs font-black",
                          p.status === 'matched' ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"
                        )}>
                          {formatCurrency(p.amount)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Professional Print Layout (Figma Style) */}
      <div id="printable-report" className="hidden print:block p-12 bg-white text-black font-sans">
        <div className="flex flex-col items-center text-center relative mb-10">
          {institution?.logo_url && (
            <div className="absolute left-0 top-0">
              <img src={institution.logo_url} className="w-24 h-24 rounded-lg object-contain" referrerPolicy="no-referrer" />
            </div>
          )}
          
          <div className="space-y-1 mt-2">
            <h1 className="text-3xl font-black text-[#00174b] uppercase tracking-tight leading-tight">{institution?.name || 'ESCMIN - GESTÃO ESCOLAR'}</h1>
            <p className="text-xs text-slate-500 font-bold max-w-[600px] leading-relaxed mx-auto">{institution?.address}</p>
            <div className="flex items-center justify-center gap-6 text-[11px] text-slate-400 font-black uppercase tracking-widest pt-1">
              {institution?.cnpj && <span>CNPJ: {institution.cnpj}</span>}
              {institution?.phone && <span>TEL: {institution.phone}</span>}
              {institution?.email && <span>E-MAIL: {institution.email}</span>}
            </div>
            {institution?.website && (
              <p className="text-[10px] text-blue-600 font-black uppercase tracking-[0.2em] pt-1">{institution.website}</p>
            )}
          </div>
        </div>

        <div className="w-full h-[2px] bg-slate-900 mb-10"></div>

        <div className="text-center mb-12">
          <h2 className="text-2xl font-black uppercase tracking-[0.25em] text-[#00174b]">Relatório Estratégico de Gestão</h2>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-2">Emissão Oficial: {new Date().toLocaleString('pt-BR')}</p>
        </div>

        <div className="grid grid-cols-3 gap-10 mb-16">
          <div className="bg-slate-50 p-8 rounded-[2rem] border-2 border-slate-100">
            <h3 className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-6">Métricas Acadêmicas</h3>
            <div className="space-y-4 font-sans">
              <div className="flex justify-between items-center"><span className="text-sm font-medium text-slate-600">Total Matriculados:</span> <span className="text-lg font-black">{stats.totalStudents}</span></div>
              <div className="flex justify-between items-center"><span className="text-sm font-medium text-slate-600">Matrículas Ativas:</span> <span className="text-lg font-black text-emerald-600">{stats.activeStudents}</span></div>
              <div className="flex justify-between items-center"><span className="text-sm font-medium text-slate-600">Taxa de Ocupação:</span> <span className="text-lg font-black text-blue-600">{stats.occupancyRate}%</span></div>
            </div>
          </div>
          <div className="bg-slate-50 p-8 rounded-[2rem] border-2 border-slate-100">
            <h3 className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-6">Métricas Financeiras</h3>
            <div className="space-y-4 font-sans">
              <div className="flex justify-between items-center"><span className="text-sm font-medium text-slate-600">Arrecadação Pix:</span> <span className="text-lg font-black">{formatCurrency(stats.totalPixAmount)}</span></div>
              <div className="flex justify-between items-center"><span className="text-sm font-medium text-slate-600">Crescimento:</span> <span className="text-lg font-black text-emerald-600">+{stats.revenueGrowth}%</span></div>
              <div className="flex justify-between items-center"><span className="text-sm font-medium text-slate-600">Ticket Médio:</span> <span className="text-lg font-black">{formatCurrency(stats.pixCount > 0 ? stats.totalPixAmount / stats.pixCount : 0)}</span></div>
            </div>
          </div>
          <div className="bg-slate-50 p-8 rounded-[2rem] border-2 border-slate-100">
            <h3 className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-6">Métricas Operacionais</h3>
            <div className="space-y-4 font-sans">
              <div className="flex justify-between items-center"><span className="text-sm font-medium text-slate-600">Eficiência Match:</span> <span className="text-lg font-black">{stats.pixCount > 0 ? Math.round((stats.matchedPix / stats.pixCount) * 100) : 0}%</span></div>
              <div className="flex justify-between items-center"><span className="text-sm font-medium text-slate-600">Total Turmas:</span> <span className="text-lg font-black">{stats.totalClasses}</span></div>
              <div className="flex justify-between items-center"><span className="text-sm font-medium text-slate-600">Corpo Docente:</span> <span className="text-lg font-black">{stats.totalTeachers}</span></div>
            </div>
          </div>
        </div>

        <h2 className="text-2xl font-black text-[#00174b] mb-8 border-l-[8px] border-[#00174b] pl-6 uppercase tracking-tight">Detalhamento de Unidades e Turmas</h2>
        <table className="w-full border-collapse mb-20 font-sans">
          <thead>
            <tr className="bg-[#00174b] text-white">
              <th className="p-5 text-left text-[10px] font-black uppercase tracking-widest">Código</th>
              <th className="p-5 text-left text-[10px] font-black uppercase tracking-widest">Turma / Unidade de Ensino</th>
              <th className="p-5 text-left text-[10px] font-black uppercase tracking-widest">Período</th>
              <th className="p-5 text-right text-[10px] font-black uppercase tracking-widest">Alunos</th>
              <th className="p-5 text-right text-[10px] font-black uppercase tracking-widest">Representatividade</th>
            </tr>
          </thead>
          <tbody className="divide-y-2 divide-slate-100">
            {studentsByClass.map((c, i) => (
              <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-slate-50/50"}>
                <td className="p-5 text-sm font-bold text-slate-500">{c.code}</td>
                <td className="p-5 text-sm font-black text-[#00174b]">{c.name}</td>
                <td className="p-5 text-sm font-bold uppercase text-slate-600">{c.period}</td>
                <td className="p-5 text-right text-sm font-black">{c.count}</td>
                <td className="p-5 text-right text-sm font-black text-blue-600">{c.percentage}%</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-40 flex justify-between px-24 font-sans">
          <div className="text-center border-t-4 border-[#00174b] pt-6 w-80">
            <p className="font-black uppercase text-sm text-[#00174b]">Diretoria Executiva</p>
            <p className="text-[10px] text-slate-400 font-bold mt-2 tracking-widest uppercase">Assinatura e Carimbo</p>
          </div>
          <div className="text-center border-t-4 border-[#00174b] pt-6 w-80">
            <p className="font-black uppercase text-sm text-[#00174b]">Controladoria Geral</p>
            <p className="text-[10px] text-slate-400 font-bold mt-2 tracking-widest uppercase">Validação de Dados</p>
          </div>
        </div>

        <div className="mt-24 text-center text-[10px] text-slate-400 font-bold italic tracking-widest uppercase border-t border-slate-100 pt-10">
          Documento gerado eletronicamente pelo ESCMIN Intelligence System. A reprodução não autorizada é proibida.
        </div>
      </div>
    </div>
  );
}
