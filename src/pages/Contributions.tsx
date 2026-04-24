import React, { useState, useEffect, useCallback } from 'react';
import { CreditCard, Download, Plus, Calendar, User as UserIcon, Loader2, CheckCircle2, FileText, Printer, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, TrendingUp, AlertCircle, Link2Off, X, FileDown, DollarSign, Trash2, Search } from 'lucide-react';
import { financialService } from '../services/financialService';
import { db, fetchAll, saveData } from '../lib/firebase';
import { collection, query, where, getDocs, orderBy, limit, doc, deleteDoc, Timestamp, and, or, startAt, endAt } from 'firebase/firestore';
import { Student, Contribution, Class } from '../types';
import { formatCurrency, cn, safeFormat, parseSafeDate } from '../lib/utils';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useLocation } from 'react-router-dom';

const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

export function Contributions() {
  const location = useLocation();
  const initialStudentId = (location.state as any)?.studentId;
  
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [contributions, setContributions] = useState<Contribution[]>([]);
  const [viewMode, setViewMode] = useState<'individual' | 'period'>('individual');
  const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
  const [periodData, setPeriodData] = useState<(Contribution & { student?: Student })[]>([]);
  const [recentContributions, setRecentContributions] = useState<(Contribution & { student?: Student })[]>([]);
  const [filterType, setFilterType] = useState<'payment' | 'created'>('payment');
  const [searchByName, setSearchByName] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [classes, setClasses] = useState<Class[]>([]);
  const [institution, setInstitution] = useState<any>(null);
  const [selectedForPrint, setSelectedForPrint] = useState<Contribution[]>([]);
  const [notification, setNotification] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [deleteConfirmationFor, setDeleteConfirmationFor] = useState<Contribution | null>(null);
  const [unlinkConfirmationFor, setUnlinkConfirmationFor] = useState<Contribution | null>(null);
  const [receiptPreviewData, setReceiptPreviewData] = useState<Contribution[] | null>(null);
  const [isPrinting, setIsPrinting] = useState(false);
  const [expandedStudents, setExpandedStudents] = useState<string[]>([]);
  
  const toggleStudentExpansion = (studentId: string) => {
    setExpandedStudents(prev => 
      prev.includes(studentId) 
        ? prev.filter(id => id !== studentId) 
        : [...prev, studentId]
    );
  };

  // Estados para Registro Manual
  const [manualMonths, setManualMonths] = useState<number[]>([]);
  const [manualDate, setManualDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [manualAmount, setManualAmount] = useState('100,00');
  const [manualMethod, setManualMethod] = useState<'Dinheiro' | 'PIX' | 'Cartão'>('Dinheiro');
  const [manualObservations, setManualObservations] = useState('');
  const [isSavingManual, setIsSavingManual] = useState(false);

  useEffect(() => {
    fetchInitialData();
    fetchRecentContributions();
    
    // Default to period view with last 15 days if no internal navigation student
    if (!initialStudentId) {
      setViewMode('period');
      fetchPeriodContributions();
    }
  }, []); // Only once on mount

  useEffect(() => {
    // Focus listener for automatic updates
    const handleFocus = () => {
      if (selectedStudent) {
        fetchContributions(selectedStudent.id, selectedYear);
      }
      fetchRecentContributions();
    };
    window.addEventListener('focus', handleFocus);
    
    const handleAfterPrint = () => {
      setIsPrinting(false);
      setReceiptPreviewData(null);
    };
    window.addEventListener('afterprint', handleAfterPrint);

    return () => {
      window.removeEventListener('afterprint', handleAfterPrint);
      window.removeEventListener('focus', handleFocus);
    };
  }, [selectedStudent, selectedYear]);

  const triggerDirectPrint = (data: Contribution[]) => {
    // 1. Sort data chronologically: Year ASC, then Month ASC
    const sortedData = [...data].sort((a, b) => {
      if (a.reference_year !== b.reference_year) {
        return a.reference_year - b.reference_year;
      }
      return a.reference_month - b.reference_month;
    });

    // 2. Prepare data
    setReceiptPreviewData(sortedData);
    setIsPrinting(true);
    
    // 2. Small delay + focus for maximum hardware reliability
    setTimeout(() => {
      window.focus();
      try {
        window.print();
      } catch (e) {
        console.error("Print command failed, user can use manual button.", e);
      }
    }, 300);
  };

  const fetchRecentContributions = async () => {
    const fifteenDaysAgo = new Date();
    fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - 15);
    const fifteenDaysAgoStr = fifteenDaysAgo.toISOString().split('T')[0];

    try {
      const q = query(
        collection(db, 'contributions'),
        where('payment_date', '>=', fifteenDaysAgoStr + 'T00:00:00Z'),
        orderBy('payment_date', 'desc')
      );

      const snap = await getDocs(q);
      const data = await Promise.all(snap.docs.map(async (docSnap) => {
        const c = { id: docSnap.id, ...(docSnap.data() as any) } as any;
        let student = null;
        if (c.student_id) {
          const sSnap = await getDocs(query(collection(db, 'students'), where('__name__', '==', c.student_id)));
          student = sSnap.empty ? null : sSnap.docs[0].data();
        }
        c.student = student;
        return c;
      }));
      setRecentContributions(data);
      if (!selectedStudent && viewMode === 'individual' && !initialStudentId) {
        setPeriodData(data);
        setViewMode('period');
      }
    } catch (error) {
      console.error('Error fetching recent:', error);
    }
  };

  const fetchInitialData = async () => {
    setLoading(true);
    try {
      const [classesData, instData] = await Promise.all([
        fetchAll('classes', '*', 'code', true),
        financialService.getInstitutionSettings()
      ]);

      setClasses(classesData || []);
      setInstitution(instData || null);

      if (initialStudentId) {
        const studentSnap = await getDocs(query(collection(db, 'students'), where('__name__', '==', initialStudentId)));
        const studentData = studentSnap.empty ? null : { id: studentSnap.docs[0].id, ...studentSnap.docs[0].data() } as Student;
        
        if (studentData) {
          setSelectedStudent(studentData);
          setStudents([studentData]);
          setViewMode('individual');
          fetchContributions(studentData.id, selectedYear);
        }
      }
    } catch (error) {
      console.error('Error fetching initial data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearchStudents = async (val: string) => {
    setSearchTerm(val);
    if (val.length < 3) return;

    setIsSearching(true);
    try {
      const q = query(
        collection(db, 'students'),
        where('name', '>=', val),
        where('name', '<=', val + '\uf8ff'),
        limit(20)
      );
      // Firebase doesn't support ilike naturally for multiple fields easily without third party.
      // Search by name is primary.
      const snap = await getDocs(q);
      const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Student[];
      setStudents(data);
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setIsSearching(false);
    }
  };

  const fetchPeriodContributions = async () => {
    setLoading(true);
    try {
      let q;
      const dateField = filterType === 'payment' ? 'payment_date' : 'created_at';
      
      q = query(
        collection(db, 'contributions'),
        where(dateField, '>=', startDate + 'T00:00:00Z'),
        where(dateField, '<=', endDate + 'T23:59:59Z'),
        orderBy(dateField, 'desc')
      );

      const snap = await getDocs(q);
      const docsData = snap.docs.map(docSnap => ({ id: docSnap.id, ...(docSnap.data() as any) })) as any[];
      
      // Batch fetch students for better performance
      const rawStudentIds = docsData.map(c => c.student_id).filter(Boolean);
      const uniqueStudentIds = Array.from(new Set(rawStudentIds));
      const studentMap = new Map();
      
      if (uniqueStudentIds.length > 0) {
        // Query in chunks of 10 (Firebase limitation for 'in' operator)
        for (let i = 0; i < uniqueStudentIds.length; i += 10) {
          const chunk = uniqueStudentIds.slice(i, i + 10);
          const sSnap = await getDocs(query(collection(db, 'students'), where('__name__', 'in', chunk)));
          sSnap.forEach(sDoc => studentMap.set(sDoc.id, { id: sDoc.id, ...sDoc.data() }));
        }
      }

      let data = docsData.map(c => ({
        ...c,
        student: studentMap.get(c.student_id) || null
      }));

      if (searchByName.trim()) {
        const term = searchByName.toLowerCase();
        data = data.filter(c => 
          c.student?.name?.toLowerCase().includes(term) || 
          c.student?.registration_number?.toLowerCase().includes(term)
        );
      }

      setPeriodData(data);
      setViewMode('period');
    } catch (error: any) {
      setNotification({ type: 'error', message: 'Erro ao buscar dados: ' + error.message });
    } finally {
      setLoading(false);
    }
  };

  const fetchContributions = async (studentId: string | undefined, year: number) => {
    if (!studentId) {
      setContributions([]);
      return;
    }
    try {
      const q = query(
        collection(db, 'contributions'),
        where('student_id', '==', studentId),
        where('reference_year', '==', year)
      );
      const snap = await getDocs(q);
      const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Contribution[];
      setContributions(data);
    } catch (error: any) {
      console.error('Error fetching contributions:', error.message);
      // If table doesn't exist yet, we handle it silently or show a warning
      if (error.code === 'PGRST116' || error.message?.includes('relation "contributions" does not exist')) {
        console.warn('Table contributions might not exist yet.');
      }
    }
  };

  useEffect(() => {
    if (selectedStudent) {
      fetchContributions(selectedStudent.id, selectedYear);
    }
  }, [selectedYear, selectedStudent]);

  const handleSelectStudent = (student: Student) => {
    setSelectedStudent(student);
    setSelectedForPrint([]);
  };

  const togglePrintSelection = (contribution: Contribution) => {
    setSelectedForPrint(prev => {
      const isSelected = prev.some(c => c.id === contribution.id);
      if (isSelected) {
        return prev.filter(c => c.id !== contribution.id);
      } else {
        if (prev.length >= 12) {
          alert('Limite de 12 recibos por vez atingido.');
          return prev;
        }
        return [...prev, contribution];
      }
    });
  };

  const handleUnlinkPix = async () => {
    if (!unlinkConfirmationFor) return;
    const contrib = unlinkConfirmationFor;
    setUnlinkConfirmationFor(null);

    try {
      await saveData('contributions', contrib.id, { 
        pix_id: null,
        origin: null
      });

      setContributions(prev => prev.map(c => 
        c.id === contrib.id ? { ...c, pix_id: undefined, origin: undefined } : c
      ));
      
      setNotification({ type: 'success', message: 'Contribuição agora é um registro manual.' });
    } catch (error: any) {
      setNotification({ type: 'error', message: 'Erro ao desvincular: ' + error.message });
    }
  };

  const handleDeleteContribution = async () => {
    if (!deleteConfirmationFor) return;
    const contrib = deleteConfirmationFor;
    setDeleteConfirmationFor(null);

    setIsDeleting(contrib.id);
    try {
      const docRef = doc(db, 'contributions', contrib.id);
      await deleteDoc(docRef);

      setContributions(prev => prev.filter(c => c.id !== contrib.id));
      setNotification({ type: 'success', message: 'Contribuição excluída com sucesso!' });
      
      // Limpa seleção de impressão se estiver nela
      setSelectedForPrint(prev => prev.filter(id => id !== contrib.id));
    } catch (error: any) {
      console.error('Falha ao excluir:', error);
      setNotification({ type: 'error', message: 'Erro ao excluir: ' + error.message });
    } finally {
      setIsDeleting(null);
    }
  };

  const handleAddContribution = (monthIndex: number) => {
    if (!selectedStudent) return;
    setManualMonths([monthIndex]);
    setManualAmount('100,00');
    setManualMethod('Dinheiro');
    setManualDate(format(new Date(), 'yyyy-MM-dd'));
  };

  const formatManualAmount = () => {
    let clean = manualAmount.replace(/[^\d.,]/g, '');
    if (!clean) return;
    
    // Normalize to number string
    let numStr = clean;
    if (numStr.includes(',')) {
      numStr = numStr.replace(/\./g, '').replace(',', '.');
    }
    
    const num = parseFloat(numStr);
    if (!isNaN(num)) {
      // Formata de volta para o padrão brasileiro para exibição
      setManualAmount(num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    }
  };

  const toggleManualMonth = (monthIndex: number) => {
    setManualMonths(prev => 
      prev.includes(monthIndex) 
        ? prev.filter(m => m !== monthIndex) 
        : [...prev, monthIndex].sort((a, b) => a - b)
    );
  };

  const saveManualContribution = async () => {
    if (!selectedStudent || manualMonths.length === 0) {
      setNotification({ type: 'error', message: 'Selecione pelo menos um mês.' });
      return;
    }

    // Limpeza rigorosa do valor monetário
    let clean = manualAmount.replace(/[^\d.,]/g, '');
    if (clean.includes(',')) {
      clean = clean.replace(/\./g, '').replace(',', '.');
    }
    
    const totalAmount = parseFloat(clean);
    if (isNaN(totalAmount) || totalAmount <= 0) {
      setNotification({ type: 'error', message: 'Insira um valor válido.' });
      return;
    }

    setIsSavingManual(true);
    try {
      const amountPerMonth = totalAmount / manualMonths.length;
      const finalDate = parseSafeDate(manualDate).toISOString();

      // Check for existing contributions
      const q = query(
        collection(db, 'contributions'),
        where('student_id', '==', selectedStudent.id),
        where('reference_year', '==', selectedYear),
        where('reference_month', 'in', manualMonths.map(idx => idx + 1))
      );

      const existingSnap = await getDocs(q);
      const existingContribs = existingSnap.docs.map(d => d.data());

      if (existingContribs && existingContribs.length > 0) {
        const duplicateMonths = existingContribs.map((c: any) => MONTHS[c.reference_month - 1]).join(', ');
        setNotification({ 
          type: 'error', 
          message: `Já existe contribuição para ${duplicateMonths}/${selectedYear}. Verifique.` 
        });
        setIsSavingManual(false);
        return;
      }
      
      const recordsToInsert = manualMonths.map(monthIdx => ({
        student_id: selectedStudent.id,
        amount: amountPerMonth,
        reference_month: monthIdx + 1,
        reference_year: selectedYear,
        payment_date: finalDate,
        payment_method: manualMethod,
        observations: manualObservations,
        created_at: new Date().toISOString()
      }));

      const savedDocs = await Promise.all(recordsToInsert.map(async (rec) => {
        const finalId = await saveData('contributions', undefined, rec);
        return { id: finalId, ...rec };
      }));

      setContributions(prev => [...prev, ...savedDocs as any]);
      setManualMonths([]);
      setManualObservations('');
      
      // Force refresh for recent list and any other lists
      fetchRecentContributions();
      
      setNotification({ type: 'success', message: `✅ ${manualMonths.length} lançamento(s) registrado(s) com sucesso!` });
    } catch (error: any) {
      console.error('Erro detalhado:', error);
      setNotification({ type: 'error', message: 'Erro ao registrar: ' + error.message });
    } finally {
      setIsSavingManual(false);
    }
  };

  const generateSelectedReceipts = (specificBatch?: Contribution[], action: 'save' | 'print' = 'save') => {
    const currentContribs = specificBatch || selectedForPrint;
    if (currentContribs.length === 0) return;
    
    // Sort by year then month
    const sortedContribs = [...currentContribs].sort((a, b) => {
      if (a.reference_year !== b.reference_year) {
        return a.reference_year - b.reference_year;
      }
      return a.reference_month - b.reference_month;
    });
    
    if (sortedContribs.length === 1) {
      generateReceipt(sortedContribs[0], action);
    } else {
      generateMultiReceipt(sortedContribs, action);
    }
  };

  const generateMultiReceipt = async (selectedContribs: Contribution[], action: 'save' | 'print' = 'save') => {
    const student = (selectedContribs[0] as any).student || selectedStudent;
    if (!student) return;
    
    const studentClass = classes.find(c => c.id === student.class_id);
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    const margin = 15;

    const drawSection = (startY: number, title: string, currentContribs: Contribution[]) => {
      // Header Section
      const centerX = pageWidth / 2;
      
      // Left Logo
      let textStartX = centerX;
      let textHeaderAlign: "center" | "left" = "center";

      if (institution?.logo_url) {
        try {
          doc.addImage(institution.logo_url, 'auto', margin, startY, 20, 20);
          textStartX = margin + 24;
          textHeaderAlign = "left";
        } catch (e) {}
      }
      
      // Text Content
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0, 23, 75);
      doc.text((institution?.name || 'ESCOLA DIOCESANA DE MINISTÉRIOS').toUpperCase(), textStartX, startY + 6, { align: textHeaderAlign });
      
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100);
      doc.text(institution?.address || '', textStartX, startY + 10, { align: textHeaderAlign });
      
      const contactInfo = [
        institution?.cnpj ? `CNPJ: ${institution.cnpj}` : '',
        institution?.phone ? `Tel: ${institution.phone}` : '',
        institution?.email ? `E-mail: ${institution.email}` : '',
        institution?.website ? `Site: ${institution.website}` : ''
      ].filter(Boolean).join('  |  ');
      doc.text(contactInfo, textStartX, startY + 14, { align: textHeaderAlign });

      // Main Horizontal Divider
      doc.setDrawColor(0, 23, 75);
      doc.setLineWidth(0.4);
      doc.line(margin, startY + 18, pageWidth - margin, startY + 18);
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0);
      doc.text('RECIBO DE CONTRIBUIÇÃO MENSAL (MÚLTIPLO)', centerX, startY + 24, { align: 'center' });
      
      doc.setFontSize(8);
      doc.text(title, pageWidth - margin, startY + 24, { align: 'right' });

      // Student Info Section
      doc.setFillColor(248, 250, 252);
      doc.rect(margin, startY + 28, pageWidth - (margin * 2), 10, 'F');
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor(120);
      doc.text('MATRICULA / ALUNO(A)', margin + 3, startY + 32);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(0);
      doc.text(`${student.registration_number || '---'} - ${student.name.toUpperCase()}`, margin + 3, startY + 36);
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.text('TURMA / CURSO', pageWidth - margin - 50, startY + 32);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.text(`${studentClass?.code || '---'} - ${student.course || '---'}`, pageWidth - margin - 50, startY + 36);

      // Grid for multiple payments
      const tableRows: any[][] = [];
      for (let i = 0; i < currentContribs.length; i += 2) {
        const row = [];
        for (let j = 0; j < 2; j++) {
          const c = currentContribs[i + j];
          if (c) {
            const method = c.payment_method || (c.pix_id ? 'PIX' : 'Dinheiro');
            row.push(`${MONTHS[c.reference_month - 1]} / ${c.reference_year}`);
            row.push(formatCurrency(c.amount));
            row.push(method);
          } else {
            row.push('', '', '');
          }
        }
        tableRows.push(row);
      }

      autoTable(doc, {
        startY: startY + 39,
        head: [['Mês/Ano', 'Valor', 'Metodo', 'Mês/Ano', 'Valor', 'Metodo']],
        body: tableRows,
        theme: 'grid',
        styles: { fontSize: 6, cellPadding: 1, halign: 'center' },
        headStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: 'bold' },
        margin: { left: margin, right: margin }
      });

      const nextY = (doc as any).lastAutoTable.finalY + 3;
      
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'bold');
      const totalBatch = currentContribs.reduce((acc, curr) => acc + curr.amount, 0);
      doc.text(`Recebido em: ${safeFormat(new Date(), 'dd/MM/yyyy')}`, margin, nextY + 3);
      doc.text(`TOTAL ACUMULADO => ${formatCurrency(totalBatch)}`, pageWidth - margin, nextY + 3, { align: 'right' });

      // Box Message / Observations
      doc.setDrawColor(200);
      doc.setLineWidth(0.2);
      doc.rect(margin, nextY + 6, pageWidth - (margin * 2), 18);
      
      const contribObs = currentContribs.map(c => c.observations).filter(Boolean).join('; ');
      const finalMsg = [contribObs, institution?.receipt_message].filter(Boolean).join(' • ');
      
      if (finalMsg) {
        doc.setFontSize(6);
        doc.setTextColor(100);
        const customLines = doc.splitTextToSize(finalMsg, pageWidth - (margin * 2) - 10);
        doc.text(customLines, margin + 5, nextY + 11);
      } else {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(7);
        doc.text('" PAZ E BEM "', pageWidth / 2, nextY + 15, { align: 'center' });
      }

      // Signatures
      const sigY = nextY + 38;
      doc.setDrawColor(200);
      doc.line(margin + 10, sigY, margin + 70, sigY);
      doc.line(pageWidth - margin - 70, sigY, pageWidth - margin - 10, sigY);
      doc.setFontSize(6);
      doc.setFont('helvetica', 'normal');
      doc.text('ASSINATURA DO ALUNO', margin + 40, sigY + 3, { align: 'center' });
      doc.text('CARIMBO E ASSINATURA ESCOLA', pageWidth - margin - 40, sigY + 3, { align: 'center' });

      // Footer
      doc.setFontSize(5.5);
      doc.setTextColor(180);
      const footerText = (institution?.footer_text || 'Documento emitido via INTELLIGENCE ESCMIN').toUpperCase();
      doc.text(footerText, pageWidth / 2, sigY + 8, { align: 'center' });
    };

    // First copy
    drawSection(10, 'VIA - ESCOLA', selectedContribs);
    // Dashed line
    (doc as any).setLineDash([1, 1]);
    doc.line(0, 148.5, pageWidth, 148.5);
    (doc as any).setLineDash([]);
    // Second copy
    drawSection(155, 'VIA - ALUNO', selectedContribs);

    if (action === 'save') {
      doc.save(`Recibo_Multiplo_${student.name.replace(/\s+/g, '_')}.pdf`);
    } else {
      triggerDirectPrint(selectedContribs);
    }
  };

  const generateReceipt = async (contribution: Contribution, action: 'save' | 'print' = 'save') => {
    const student = (contribution as any).student || selectedStudent;
    if (!student) return;
    
    const studentClass = classes.find(c => c.id === student.class_id);
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    const margin = 15;

    const drawSection = (startY: number, title: string) => {
      // Header Section
      const centerX = pageWidth / 2;
      
      // Left Logo
      let textStartX = centerX;
      let textHeaderAlign: "center" | "left" = "center";

      if (institution?.logo_url) {
        try {
          doc.addImage(institution.logo_url, 'auto', margin, startY, 20, 20);
          textStartX = margin + 24;
          textHeaderAlign = "left";
        } catch (e) {}
      }
      
      // Text Content
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0, 23, 75);
      doc.text((institution?.name || 'ESCOLA DIOCESANA DE MINISTÉRIOS').toUpperCase(), textStartX, startY + 6, { align: textHeaderAlign });
      
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100);
      doc.text(institution?.address || '', textStartX, startY + 10, { align: textHeaderAlign });
      
      const contactInfo = [
        institution?.cnpj ? `CNPJ: ${institution.cnpj}` : '',
        institution?.phone ? `Tel: ${institution.phone}` : '',
        institution?.email ? `E-mail: ${institution.email}` : '',
        institution?.website ? `Site: ${institution.website}` : ''
      ].filter(Boolean).join('  |  ');
      doc.text(contactInfo, textStartX, startY + 14, { align: textHeaderAlign });

      // Main Horizontal Divider
      doc.setDrawColor(0, 23, 75);
      doc.setLineWidth(0.4);
      doc.line(margin, startY + 18, pageWidth - margin, startY + 18);
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0);
      doc.text('RECIBO DE CONTRIBUIÇÃO MENSAL', centerX, startY + 24, { align: 'center' });
      
      doc.setFontSize(8);
      doc.text(title, pageWidth - margin, startY + 24, { align: 'right' });

      // Student Info Section
      doc.setFillColor(248, 250, 252);
      doc.rect(margin, startY + 28, pageWidth - (margin * 2), 12, 'F');
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor(120);
      doc.text('MATRICULA / ALUNO(A)', margin + 3, startY + 33);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(0);
      doc.text(`${student.registration_number || '---'} - ${student.name.toUpperCase()}`, margin + 3, startY + 37);
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.text('TURMA / CURSO', pageWidth - margin - 50, startY + 33);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.text(`${studentClass?.code || '---'} - ${student.course || '---'}`, pageWidth - margin - 50, startY + 37);

      const method = contribution.payment_method || (contribution.pix_id ? 'PIX' : 'Dinheiro');
      const origin = contribution.origin ? ` (${contribution.origin})` : '';

      // Main Table
      autoTable(doc, {
        startY: startY + 42,
        head: [['Mês / Ano Referência', 'Valor da Contribuição', 'Meio de Pagamento / Origem']],
        body: [[
          `${MONTHS[contribution.reference_month - 1]} / ${contribution.reference_year}`,
          formatCurrency(contribution.amount),
          `${method}${origin}`
        ]],
        theme: 'grid',
        styles: { fontSize: 8, cellPadding: 3, halign: 'center' },
        headStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: 'bold' },
        margin: { left: margin, right: margin }
      });

      const nextY = (doc as any).lastAutoTable.finalY + 5;
      
      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'bold');
      doc.text(`Recebido em: ${safeFormat(contribution.payment_date, 'dd/MM/yyyy')}`, margin, nextY + 5);
      doc.text(`VALOR TOTAL => ${formatCurrency(contribution.amount)}`, pageWidth - margin, nextY + 5, { align: 'right' });

      // Observations Box
      doc.setDrawColor(220);
      doc.setLineWidth(0.2);
      doc.rect(margin, nextY + 10, pageWidth - (margin * 2), 20);
      
      const finalMsg = [contribution.observations, institution?.receipt_message].filter(Boolean).join(' • ');
      if (finalMsg) {
        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(80);
        const customLines = doc.splitTextToSize(finalMsg, pageWidth - (margin * 2) - 10);
        doc.text(customLines, margin + 5, nextY + 16);
      } else {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(8);
        doc.setTextColor(150);
        doc.text('" PAZ E BEM "', pageWidth / 2, nextY + 22, { align: 'center' });
      }

      // Signatures
      const sigY = nextY + 45;
      doc.setDrawColor(200);
      doc.line(margin + 10, sigY, margin + 70, sigY);
      doc.line(pageWidth - margin - 70, sigY, pageWidth - margin - 10, sigY);
      doc.setFontSize(6);
      doc.setFont('helvetica', 'normal');
      doc.text('ASSINATURA DO ALUNO', margin + 40, sigY + 3, { align: 'center' });
      doc.text('CARIMBO E ASSINATURA ESCOLA', pageWidth - margin - 40, sigY + 3, { align: 'center' });

      // Footer Metadata
      doc.setFontSize(5);
      doc.setTextColor(200);
      doc.text(`SISTEMA INTELLIGENCE ESCMIN - EMISSAO: ${safeFormat(new Date(), 'dd/MM/yyyy HH:mm')}`, margin, sigY + 8);
    };

    // First copy
    drawSection(10, 'VIA - ESCOLA');
    // Dashed line
    (doc as any).setLineDash([1, 1]);
    doc.line(0, 148.5, pageWidth, 148.5);
    (doc as any).setLineDash([]);
    // Second copy
    drawSection(155, 'VIA - ALUNO');

    if (action === 'save') {
      doc.save(`Recibo_${student.name.replace(/\s+/g, '_')}_${contribution.reference_month}.pdf`);
    } else {
      triggerDirectPrint([contribution]);
    }
  };
  const generateStatement = async () => {
    if (!selectedStudent) return;
    
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.width;
      const margin = 15;
      const centerX = pageWidth / 2;
      let y = 15;

      // Professional Header
      let textStartX = centerX;
      let textHeaderAlign: "center" | "left" = "center";

      if (institution?.logo_url) {
        try { 
          doc.addImage(institution.logo_url, 'auto', margin, y, 22, 22); 
          textStartX = margin + 26;
          textHeaderAlign = "left";
        } catch (e) {}
      }

      doc.setTextColor(0, 23, 75);
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text(institution?.name?.toUpperCase() || 'ESCMIN - GESTÃO ESCOLAR', textStartX, y + 8, { align: textHeaderAlign });
      
      doc.setFontSize(8);
      doc.setTextColor(100);
      doc.setFont('helvetica', 'normal');
      doc.text(institution?.address || '', textStartX, y + 13, { align: textHeaderAlign });
      
      const meta = [
        institution?.cnpj ? `CNPJ: ${institution.cnpj}` : '',
        institution?.phone ? `TEL: ${institution.phone}` : '',
        institution?.email ? `EMAIL: ${institution.email}` : ''
      ].filter(Boolean).join('  |  ');
      doc.text(meta, textStartX, y + 17, { align: textHeaderAlign });

      doc.setDrawColor(0, 23, 75);
      doc.setLineWidth(0.6);
      doc.line(margin, y + 22, pageWidth - margin, y + 22);

      y += 32;

      doc.setFontSize(14);
      doc.setTextColor(0);
      doc.setFont('helvetica', 'bold');
      doc.text('EXTRATO ANUAL DE CONTRIBUIÇÕES', centerX, y, { align: 'center' });
      
      y += 10;
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(50);
      doc.text(`ALUNO: ${selectedStudent.name.toUpperCase()}`, margin, y);
      doc.text(`MATRÍCULA: ${selectedStudent.registration_number || '---'}`, margin, y + 5);
      doc.text(`ANO DE REFERÊNCIA: ${selectedYear}`, pageWidth - margin, y, { align: 'right' });

      const statementData = MONTHS.map((month, idx) => {
        const contrib = contributions.find(c => c.reference_month === idx + 1);
        return [
          month.toUpperCase(),
          contrib ? formatCurrency(contrib.amount) : '---',
          contrib ? safeFormat(contrib.payment_date, 'dd/MM/yyyy') : 'PENDENTE',
          contrib?.observations || ''
        ];
      });

      autoTable(doc, {
        startY: y + 10,
        head: [['MÊS DE REFERÊNCIA', 'VALOR PAGO', 'DATA PAGAMENTO', 'OBSERVAÇÕES']],
        body: statementData,
        theme: 'grid',
        headStyles: { fillColor: [0, 23, 75], fontSize: 8 },
        styles: { fontSize: 8, cellPadding: 2 },
        columnStyles: {
          1: { halign: 'right' },
          2: { halign: 'center' }
        }
      });

      const total = contributions.reduce((acc, c) => acc + c.amount, 0);
      let finalY = (doc as any).lastAutoTable.finalY + 10;
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0);
      doc.text(`TOTAL ACUMULADO NO ANO: ${formatCurrency(total)}`, pageWidth - margin, finalY, { align: 'right' });

      // Important notes / Footer
      if (institution?.receipt_message || institution?.footer_text) {
        finalY = doc.internal.pageSize.height - 30;
        doc.setLineWidth(0.2);
        doc.setDrawColor(200);
        doc.line(margin, finalY, pageWidth - margin, finalY);
        
        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(150);
        
        const footerNote = institution?.receipt_message || '';
        const splitNote = doc.splitTextToSize(footerNote, pageWidth - margin * 2);
        doc.text(splitNote, centerX, finalY + 5, { align: 'center' });
        
        const sysInfo = institution?.footer_text || `Documento oficial gerado via INTELLIGENCE ESCMIN em ${new Date().toLocaleString('pt-BR')}`;
        doc.text(sysInfo.toUpperCase(), centerX, finalY + 15, { align: 'center' });
      }

      doc.save(`Extrato_${selectedStudent.name.replace(/\s+/g, '_')}_${selectedYear}.pdf`);
    } catch (error) {
      console.error('Error generating statement:', error);
      alert('Erro ao gerar extrato anual');
    }
  };

  const clearSelection = () => {
    setSelectedStudent(null);
    setContributions([]);
    setSearchTerm('');
    setSearchByName('');
    setStudents([]);
    setViewMode('period');
    fetchRecentContributions();
  };

  const filteredStudents = students;

  return (
    <>
      <div className={cn(
        "h-[calc(100vh-8rem)] flex flex-col gap-6 print:hidden",
        isPrinting && "hidden"
      )}>
      {/* Header Profissional mais compacto */}
      <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#00174b] flex items-center justify-center text-white shadow-lg shadow-blue-900/10">
              <TrendingUp size={20} />
            </div>
            <div>
              <h2 className="text-lg font-black text-[#131b2e] leading-tight">Gestão de Contribuições</h2>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none mt-0.5">Tesouraria & Conferência</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
             <button 
                onClick={clearSelection}
                className="px-4 py-2 bg-slate-50 text-slate-500 rounded-xl hover:bg-red-50 hover:text-red-600 transition-all border border-slate-100 font-black text-[10px] uppercase tracking-wider flex items-center gap-1.5"
              >
                <X size={14} /> Limpar Filtros
              </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 bg-slate-50/50 p-3 rounded-2xl border border-slate-50">
          {/* Busca por Nome */}
          <div className="lg:col-span-4 space-y-1.5">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-3">Nome / Matrícula</label>
            <div className="relative">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center gap-2">
                {isSearching ? <Loader2 size={16} className="text-blue-500 animate-spin" /> : <Search size={16} className="text-slate-400" />}
              </div>
              <input 
                type="text"
                placeholder="Pesquisar..."
                value={searchTerm || searchByName}
                onChange={(e) => {
                  setSearchByName(e.target.value);
                  handleSearchStudents(e.target.value);
                }}
                className="w-full pl-11 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-sm focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all font-bold text-slate-700"
              />
            </div>
          </div>

          {/* Filtro de Tipo de Data */}
          <div className="lg:col-span-2 space-y-1.5">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-3">Tipo</label>
            <select 
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as any)}
              className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-xs font-black uppercase tracking-wider text-slate-600 focus:ring-4 focus:ring-blue-500/10 cursor-pointer"
            >
              <option value="payment">Pagamento</option>
              <option value="created">Importação</option>
            </select>
          </div>

          {/* Intervalo de Datas */}
          <div className="lg:col-span-4 space-y-1.5">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-3">Período</label>
            <div className="flex items-center gap-2 bg-white p-1 rounded-xl border border-slate-200 h-[3.25rem]">
              <div className="flex-1 flex items-center px-3 gap-2">
                <Calendar size={14} className="text-slate-300" />
                <input 
                  type="date" 
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="bg-transparent border-none text-xs font-black uppercase text-[#131b2e] focus:ring-0 w-full p-0"
                />
              </div>
              <div className="w-px h-6 bg-slate-100" />
              <div className="flex-1 flex items-center px-3 gap-2">
                <input 
                  type="date" 
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="bg-transparent border-none text-xs font-black uppercase text-[#131b2e] focus:ring-0 w-full p-0"
                />
              </div>
            </div>
          </div>

          {/* Ação */}
          <div className="lg:col-span-2 flex items-end">
            <button 
              onClick={fetchPeriodContributions}
              className="w-full h-[3.25rem] bg-emerald-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-500/10 flex items-center justify-center gap-2 active:scale-95"
            >
              <Search size={16} />
              Filtrar
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 flex gap-6 overflow-hidden">
        {/* Sidebar - Conditional Results or Recent */}
        <div className={cn(
          "w-80 bg-white rounded-2xl shadow-sm border border-slate-100 flex flex-col overflow-hidden transition-all duration-300",
          searchTerm.length > 0 || students.length > 0 ? "translate-x-0" : "-translate-x-full opacity-0 pointer-events-none w-0"
        )}>
          <div className="p-6 border-b border-slate-50">
            <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest flex items-center justify-between">
              Resultados
              <span className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded-lg text-[10px]">{students.length}</span>
            </h3>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-1">
            {students.length === 0 && searchTerm.length >= 3 && !isSearching && (
              <div className="p-8 text-center space-y-3">
                <Search size={32} className="mx-auto text-slate-200" />
                <p className="text-xs font-bold text-slate-400">Nenhum contribuinte encontrado.</p>
              </div>
            )}
            {students.map((student) => (
              <button
                key={student.id}
                onClick={() => { setViewMode('individual'); handleSelectStudent(student); }}
                className={cn(
                  "w-full flex items-center gap-4 p-4 rounded-2xl transition-all text-left",
                  selectedStudent?.id === student.id 
                    ? "bg-blue-600 text-white shadow-xl shadow-blue-200" 
                    : "hover:bg-slate-50 text-slate-600 border border-transparent"
                )}
              >
                <div className={cn(
                  "w-10 h-10 rounded-xl flex items-center justify-center font-black text-[10px]",
                  selectedStudent?.id === student.id ? "bg-white/20 text-white" : "bg-slate-100 text-slate-400"
                )}>
                  {student.registration_number.split('/')[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-black truncate">{student.name}</p>
                  <p className={cn(
                    "text-[10px] font-bold truncate opacity-60",
                    selectedStudent?.id === student.id ? "text-white" : "text-slate-400"
                  )}>
                    {student.registration_number}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Main Workspace */}
        <div className="flex-1 bg-white rounded-2xl shadow-sm border border-slate-100 flex flex-col overflow-hidden">
          {selectedStudent && viewMode === 'individual' ? (
          <>
            <div className="p-8 border-b border-slate-50 bg-slate-50/50">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-3xl bg-blue-600 flex items-center justify-center text-white text-2xl font-black shadow-xl shadow-blue-200">
                    {selectedStudent.name.charAt(0)}
                  </div>
                  <div>
                    <h3 className="text-2xl font-black text-[#131b2e]">{selectedStudent.name}</h3>
                    <div className="flex items-center gap-3 text-sm font-bold text-slate-500">
                      <span className="flex items-center gap-1"><Calendar size={14} /> {selectedStudent.registration_number}</span>
                      <span className="px-2 py-0.5 bg-green-50 text-green-600 rounded-lg text-[10px] font-black uppercase tracking-wider">{selectedStudent.status}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center bg-white p-1 rounded-xl border border-slate-200 shadow-sm">
                    <button 
                      onClick={() => setSelectedYear(selectedYear - 1)}
                      className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors text-slate-600"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <span className="px-3 text-base font-black text-[#131b2e]">{selectedYear}</span>
                    <button 
                      onClick={() => setSelectedYear(selectedYear + 1)}
                      className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors text-slate-600"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>
                        {selectedForPrint.length > 0 && (
                          <div className="flex gap-2">
                            <button 
                              onClick={() => {
                                triggerDirectPrint(selectedForPrint);
                              }}
                              className="flex items-center gap-2 px-6 py-3 bg-white text-emerald-600 border-2 border-emerald-600 rounded-2xl font-bold hover:bg-emerald-50 transition-all shadow-md active:scale-95 animate-in fade-in slide-in-from-right-4"
                            >
                              <FileDown size={18} />
                              Visualizar ({selectedForPrint.length})
                            </button>
                            <button 
                              onClick={() => {
                                generateSelectedReceipts(selectedForPrint, 'print');
                                setSelectedForPrint([]);
                              }}
                              className="flex items-center gap-2 px-6 py-3 bg-emerald-600 text-white rounded-2xl font-bold hover:bg-emerald-700 transition-all shadow-lg active:scale-95 animate-in fade-in slide-in-from-right-4"
                            >
                              <Printer size={18} />
                              Imprimir ({selectedForPrint.length})
                            </button>
                          </div>
                        )}
                  <button 
                    onClick={generateStatement}
                    className="flex items-center gap-2 px-6 py-3 bg-[#00174b] text-white rounded-2xl font-bold hover:bg-[#002a8a] transition-all shadow-lg active:scale-95"
                  >
                    <FileText size={18} />
                    Extrato Anual
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="bg-white p-3 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center"><TrendingUp size={18} /></div>
                  <div>
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Total no Ano</p>
                    <p className="text-lg font-black text-[#131b2e]">{formatCurrency(contributions.reduce((acc, c) => acc + c.amount, 0))}</p>
                  </div>
                </div>
                <div className="bg-white p-3 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-3">
                  <div className="w-10 h-10 bg-green-50 text-green-600 rounded-xl flex items-center justify-center"><CheckCircle2 size={18} /></div>
                  <div>
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Meses Pagos</p>
                    <p className="text-lg font-black text-[#131b2e]">{contributions.length} / 12</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5 bg-slate-50/20">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {MONTHS.map((month, idx) => {
                  const contrib = contributions.find(c => c.reference_month === idx + 1);
                  return (
                    <div 
                      key={month}
                      className={cn(
                        "group p-3 rounded-xl border transition-all duration-300 flex flex-col gap-2.5 h-full",
                        contrib 
                          ? "bg-emerald-50/50 border-emerald-100 ring-1 ring-emerald-50/50" 
                          : "bg-white border-slate-100 hover:border-blue-200 hover:shadow-lg hover:shadow-blue-500/5"
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          {contrib && (
                            <input 
                              type="checkbox"
                              checked={selectedForPrint.some(c => c.id === contrib.id)}
                              onChange={() => togglePrintSelection(contrib)}
                              className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                            />
                          )}
                          <span className={cn(
                            "text-[10px] font-black uppercase tracking-widest",
                            contrib ? "text-emerald-600" : "text-slate-400"
                          )}>
                            {month}
                          </span>
                        </div>
                        {contrib && (
                          <div className="w-5 h-5 rounded-md bg-emerald-500 text-white flex items-center justify-center shadow-lg shadow-emerald-500/10">
                            <CheckCircle2 size={12} />
                          </div>
                        )}
                      </div>

                      {contrib ? (
                        <>
                          <div className="space-y-0.5">
                            <p className="text-lg font-black text-[#131b2e] leading-none">{formatCurrency(contrib.amount)}</p>
                            <div className="flex items-center gap-2">
                              <p className="text-[9px] font-bold text-slate-400">Pago: {safeFormat(contrib.payment_date, 'dd/MM/yy')}</p>
                              {contrib.payment_method && (
                                <span className="px-1.5 py-px bg-slate-100 text-slate-500 rounded text-[7px] font-black uppercase tracking-wider">
                                  {contrib.payment_method}
                                </span>
                              )}
                            </div>
                            {contrib.observations && (
                              <p className="text-[9px] text-slate-400 italic truncate" title={contrib.observations}>
                                {contrib.observations}
                              </p>
                            )}
                          </div>
                           <div className="flex gap-2 pt-1.5 border-t border-emerald-100/50">
                             <button 
                               onClick={() => setReceiptPreviewData([contrib])}
                               className="p-1.5 bg-white text-slate-400 border border-slate-100 rounded-lg hover:bg-slate-50 transition-all"
                               title="Visualizar Recibo"
                             >
                               <FileText size={14} />
                             </button>
                             <button 
                               onClick={() => generateSelectedReceipts([contrib], 'print')}
                               className="flex-1 py-1.5 bg-emerald-600 text-white rounded-xl text-[9px] font-black uppercase tracking-wider hover:bg-emerald-700 transition-all shadow-sm flex items-center justify-center gap-1.5"
                             >
                               <Printer size={10} />
                               Imprimir
                             </button>
                             {contrib.pix_id && (
                               <button 
                                 onClick={() => setUnlinkConfirmationFor(contrib)}
                                 className="flex-1 py-1.5 bg-slate-50 text-blue-500 border border-slate-100 rounded-xl text-[9px] font-black uppercase tracking-wider hover:bg-blue-600 hover:text-white transition-all shadow-sm flex items-center justify-center gap-1.5"
                                 title="Tornar Manual (Desvincular do Pix)"
                               >
                                 <Link2Off size={10} />
                                 Manual
                               </button>
                             )}
                             <button 
                               onClick={() => setDeleteConfirmationFor(contrib)}
                               disabled={isDeleting === contrib.id}
                               className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 transition-all bg-white border border-red-100 rounded-xl shadow-sm disabled:opacity-50"
                               title="Excluir Registro / Recibo"
                             >
                               {isDeleting === contrib.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                             </button>
                           </div>
                        </>
                      ) : (
                        <>
                          <div className="space-y-0.5 py-1">
                            <p className="text-xs font-bold text-slate-300">Pendente</p>
                          </div>
                          <button 
                            onClick={() => handleAddContribution(idx)}
                            className="w-full py-2 bg-slate-50 text-slate-400 rounded-lg text-[9px] font-black uppercase tracking-wider hover:bg-blue-600 hover:text-white transition-all border border-dashed border-slate-200 flex items-center justify-center gap-1.5"
                          >
                            <Plus size={12} />
                            Registrar
                          </button>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </>
          ) : viewMode === 'period' ? (
            <div className="flex-1 flex flex-col p-4 overflow-hidden">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                    <FileText size={16} />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-[#131b2e] leading-tight">Relatório de Período</h3>
                    <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest leading-tight">
                      {safeFormat(startDate + 'T12:00:00Z', 'dd/MM/yy', '---')} ATÉ {safeFormat(endDate + 'T12:00:00Z', 'dd/MM/yy', '---')}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-100 flex items-center gap-4">
                    <div className="flex flex-col items-center">
                      <p className="text-[9px] font-black text-emerald-600 uppercase tracking-widest leading-none mb-0.5">Total</p>
                      <p className="text-base font-black text-[#131b2e]">{formatCurrency(periodData.reduce((acc, c) => acc + c.amount, 0))}</p>
                    </div>
                    <div className="w-px h-6 bg-emerald-200" />
                    <div className="flex flex-col items-center text-right">
                      <p className="text-[9px] font-black text-emerald-600 uppercase tracking-widest leading-none mb-0.5">Registros</p>
                      <p className="text-base font-black text-[#131b2e]">{periodData.length}</p>
                    </div>
                  </div>

                  {selectedForPrint.length > 0 && (
                    <div className="flex items-center gap-2 animate-in slide-in-from-right-2">
                      <button 
                        onClick={() => {
                          triggerDirectPrint(selectedForPrint);
                        }}
                        className="px-4 py-3 bg-white text-emerald-600 border border-emerald-600 rounded-2xl font-black text-[10px] uppercase tracking-wider hover:bg-emerald-50 transition-all flex items-center gap-2 shadow-sm"
                      >
                        <FileDown size={14} />
                        Ver ({selectedForPrint.length})
                      </button>
                      <button 
                        onClick={() => {
                          generateSelectedReceipts(selectedForPrint, 'print');
                          setSelectedForPrint([]);
                        }}
                        className="px-4 py-3 bg-emerald-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-wider hover:bg-emerald-700 transition-all flex items-center gap-2 shadow-lg shadow-emerald-500/20"
                      >
                        <Printer size={14} />
                        Imprimir Seleção
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto rounded-3xl border border-slate-100 shadow-sm bg-white">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      <th className="px-6 py-4 w-10"></th>
                      <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-widest">Contribuinte / Matrícula</th>
                      <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-widest">Informação do Período</th>
                      <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-widest">Método</th>
                      <th className="px-6 py-4 text-right text-xs font-black text-slate-400 uppercase tracking-widest">Valor Total</th>
                      <th className="px-6 py-4"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {periodData.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-6 py-24 text-center text-slate-300">
                          <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-slate-100">
                            <AlertCircle size={32} className="opacity-20" />
                          </div>
                          <p className="font-black text-slate-400 uppercase tracking-widest text-xs">Nenhum registro encontrado</p>
                          <p className="text-sm text-slate-300 mt-2">Tente ajustar os filtros de data ou nome acima.</p>
                        </td>
                      </tr>
                    ) : (
                      (() => {
                        const grouped = periodData.reduce((acc, curr) => {
                          const studentId = curr.student_id;
                          if (!acc[studentId]) {
                            acc[studentId] = {
                              student: curr.student,
                              contributions: [],
                              total: 0
                            };
                          }
                          acc[studentId].contributions.push(curr);
                          acc[studentId].total += Number(curr.amount);
                          return acc;
                        }, {} as Record<string, { student?: Student; contributions: (Contribution & { student?: Student })[]; total: number }>);

                        return Object.values(grouped).map((group: any) => {
                          const studentId = group.student?.id || '';
                          const isExpanded = expandedStudents.includes(studentId);
                          
                          return (
                            <React.Fragment key={studentId}>
                              <tr 
                                onClick={(e) => {
                                  // Don't toggle if clicking a button
                                  if ((e.target as HTMLElement).closest('button') || (e.target as HTMLElement).closest('input[type="checkbox"]')) return;
                                  toggleStudentExpansion(studentId);
                                }}
                                className={cn(
                                  "border-b border-slate-50 hover:bg-slate-50 transition-all cursor-pointer group relative",
                                  isExpanded ? "bg-slate-50/50" : ""
                                )}
                              >
                                <td className="px-6 py-4">
                                  <div className="flex items-center gap-4">
                                     <input 
                                      type="checkbox"
                                      className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                      checked={group.contributions.every((c: any) => selectedForPrint.some(s => s.id === c.id))}
                                      onChange={(e) => {
                                        e.stopPropagation();
                                        if (e.target.checked) {
                                          setSelectedForPrint(prev => {
                                            const next = [...prev];
                                            group.contributions.forEach((c: any) => {
                                              if (!next.some(s => s.id === c.id)) next.push(c);
                                            });
                                            return next.slice(0, 12);
                                          });
                                        } else {
                                          const groupIds = group.contributions.map((c: any) => c.id);
                                          setSelectedForPrint(prev => prev.filter(c => !groupIds.includes(c.id)));
                                        }
                                      }}
                                    />
                                    <div className={cn(
                                      "p-1.5 rounded-lg transition-all",
                                      isExpanded ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20" : "bg-slate-100 text-slate-400 group-hover:bg-slate-200"
                                    )}>
                                      {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                    </div>
                                  </div>
                                </td>
                                <td className="px-6 py-4">
                                  <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center font-black text-slate-400 text-xs">
                                      {group.student?.name?.charAt(0) || '?'}
                                    </div>
                                    <div>
                                      <p className="text-sm font-black text-[#131b2e] leading-snug">{group.student?.name || 'Contribuinte Deletado'}</p>
                                      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{group.student?.registration_number || 'S/ MATRÍCULA'}</p>
                                    </div>
                                  </div>
                                </td>
                                <td className="px-6 py-4">
                                  <span className="px-3 py-1 bg-blue-50 text-blue-600 rounded-full text-[10px] font-black uppercase tracking-widest">
                                    {group.contributions.length} {group.contributions.length === 1 ? 'Lançamento' : 'Lançamentos'}
                                  </span>
                                </td>
                                <td className="px-6 py-4">
                                  <div className="flex flex-wrap gap-2">
                                    {Array.from(new Set(group.contributions.map((c: any) => c.payment_method || 'PIX'))).map((method: any) => (
                                      <span key={method} className="px-2 py-0.5 bg-slate-100 text-slate-500 rounded-lg text-[9px] font-black uppercase tracking-wider">
                                        {method}
                                      </span>
                                    ))}
                                  </div>
                                </td>
                                <td className="px-6 py-4 text-right">
                                  <span className="text-sm font-black text-blue-600 bg-blue-50 px-3 py-1.5 rounded-xl">{formatCurrency(group.total)}</span>
                                </td>
                                <td className="px-6 py-4">
                                  <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button 
                                      onClick={(e) => { 
                                        e.stopPropagation(); 
                                        const studentWithId = group.student ? { id: studentId, ...group.student } : null;
                                        setSelectedStudent(studentWithId as Student); 
                                        setViewMode('individual'); 
                                        fetchContributions(studentId, group.contributions[0].reference_year); 
                                      }} 
                                      className="p-2.5 text-blue-600 hover:bg-blue-600 hover:text-white rounded-xl transition-all shadow-sm border border-blue-100" 
                                      title="Extrato do Aluno"
                                    >
                                      <FileText size={18} />
                                    </button>
                                    <button 
                                      onClick={(e) => { 
                                        e.stopPropagation(); 
                                        triggerDirectPrint(group.contributions);
                                      }} 
                                      className="p-2.5 text-emerald-600 hover:bg-emerald-600 hover:text-white rounded-xl transition-all shadow-sm border border-emerald-100" 
                                      title="Visualizar Recibos Multiplos"
                                    >
                                      <Printer size={18} />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                              {isExpanded && group.contributions.map((c: any) => (
                                <tr key={c.id} className="bg-slate-50/10 border-b border-slate-50/50 hover:bg-slate-50/40 transition-colors group/inner">
                                  <td className="px-6 py-3 pl-12 flex items-center gap-4">
                                     <input 
                                      type="checkbox"
                                      checked={selectedForPrint.some(s => s.id === c.id)}
                                      onChange={() => togglePrintSelection(c)}
                                      className="w-3.5 h-3.5 rounded border-slate-200 text-blue-500 focus:ring-blue-400"
                                    />
                                  </td>
                                  <td className="px-6 py-4 text-xs font-medium text-slate-500">
                                    {filterType === 'payment' ? 'Pago em' : 'Importado em'} {safeFormat(filterType === 'payment' ? c.payment_date : (c.created_at || c.payment_date), 'dd/MM/yyyy')}
                                  </td>
                                  <td className="px-6 py-4 text-xs font-bold uppercase text-[#131b2e] tracking-wider">
                                    {MONTHS[c.reference_month - 1]} / {c.reference_year}
                                  </td>
                                  <td className="px-6 py-4">
                                    <div className="flex items-center gap-2">
                                      <span className="px-2.5 py-1 bg-slate-100/50 text-slate-600 rounded-lg text-[10px] font-bold uppercase tracking-wider">
                                        {c.payment_method || 'PIX'}
                                      </span>
                                      {c.pix_id && <Link2Off size={11} className="text-blue-500" title="Registro Conciliado" />}
                                      {c.observations && (
                                        <span className="text-[10px] text-slate-400 italic truncate max-w-[150px]" title={c.observations}>
                                          • {c.observations}
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="px-6 py-4 text-right">
                                    <span className="text-sm font-black text-[#131b2e]">{formatCurrency(c.amount)}</span>
                                  </td>
                                  <td className="px-6 py-3 text-right">
                                    <div className="flex items-center justify-end gap-2 opacity-0 group-hover/inner:opacity-100 transition-opacity">
                                      <button 
                                        onClick={(e) => { e.stopPropagation(); setReceiptPreviewData([c]); }} 
                                        className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all" 
                                        title="Visualizar Recibo"
                                      >
                                        <FileText size={16} />
                                      </button>
                                      <button 
                                        onClick={(e) => { e.stopPropagation(); generateSelectedReceipts([c], 'print'); }} 
                                        className="p-2 text-emerald-600 hover:bg-emerald-600 hover:text-white rounded-xl transition-all shadow-sm" 
                                        title="Imprimir Agora"
                                      >
                                        <Printer size={16} />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </React.Fragment>
                          );
                        });
                      })()
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400 bg-slate-50/50">
              <div className="w-24 h-24 rounded-2xl bg-white border border-slate-100 shadow-xl flex items-center justify-center mb-6">
                <Search size={40} className="text-blue-600 opacity-20" />
              </div>
              <h3 className="text-xl font-black text-[#131b2e]">Controle de Contribuições</h3>
              <p className="text-sm text-center max-w-sm mt-2 text-slate-500 font-medium">
                Pesquise por um contribuinte no campo acima ou filtre um período específico para visualizar os recebimentos.
              </p>
            </div>
          )}
        </div>

        {/* Modais de Confirmação Customizados */}
        {(deleteConfirmationFor || unlinkConfirmationFor) && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-sm rounded-[32px] overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200 p-8 space-y-6">
              <div className={cn(
                "w-16 h-16 rounded-3xl flex items-center justify-center mx-auto shadow-lg",
                deleteConfirmationFor ? "bg-red-50 text-red-600" : "bg-blue-50 text-blue-600"
              )}>
                {deleteConfirmationFor ? <Trash2 size={32} /> : <Link2Off size={32} />}
              </div>
              
              <div className="text-center space-y-2">
                <h3 className="text-xl font-black text-[#131b2e]">
                  {deleteConfirmationFor ? 'Excluir Lançamento?' : 'Tornar Manual?'}
                </h3>
                <p className="text-sm text-slate-500 font-medium leading-relaxed">
                  {deleteConfirmationFor 
                    ? `Deseja realmente excluir permanentemente o registro de ${formatCurrency(deleteConfirmationFor.amount)} referente a ${MONTHS[deleteConfirmationFor.reference_month-1]}?`
                    : 'Isso removerá o vínculo com o Pix, tornando este recebimento um registro independente na ficha do aluno.'}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button 
                  onClick={() => { setDeleteConfirmationFor(null); setUnlinkConfirmationFor(null); }}
                  className="py-4 bg-slate-50 text-slate-600 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-slate-100 transition-all"
                >
                  Cancelar
                </button>
                <button 
                  onClick={deleteConfirmationFor ? handleDeleteContribution : handleUnlinkPix}
                  className={cn(
                    "py-4 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-lg transition-all active:scale-95",
                    deleteConfirmationFor ? "bg-red-600 hover:bg-red-700 shadow-red-200" : "bg-blue-600 hover:bg-blue-700 shadow-blue-200"
                  )}
                >
                  {deleteConfirmationFor ? 'Confirmar Exclusão' : 'Confirmar'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Notificações flutuantes */}
        {notification && (
          <div className={cn(
            "fixed bottom-8 right-8 p-4 rounded-2xl shadow-2xl flex items-center gap-3 animate-in slide-in-from-bottom-4 duration-300 z-[200]",
            notification.type === 'success' ? "bg-emerald-600 text-white" : 
            notification.type === 'error' ? "bg-red-600 text-white" : "bg-blue-600 text-white"
          )}>
            {notification.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
            <p className="text-sm font-bold">{notification.message}</p>
            <button onClick={() => setNotification(null)} className="ml-2 hover:opacity-70">
              <X size={16} />
            </button>
          </div>
        )}
      </div>

      {/* Modal de Registro Manual */}
      {manualMonths.length > 0 && (
        <div className="fixed inset-0 bg-[#00174b]/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl border border-slate-100 overflow-hidden animate-in fade-in zoom-in duration-200 flex flex-col max-h-[90vh]">
            <div className="p-8 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-lg shadow-blue-200">
                  <Plus size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-black text-[#00174b]">Registrar Contribuição</h3>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Lançamento na Ficha do Aluno • {selectedYear}</p>
                </div>
              </div>
              <button 
                onClick={() => setManualMonths([])}
                className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-8 space-y-6 overflow-y-auto">
              {/* Seleção de Meses - Estilo mais profissional */}
              <div className="space-y-3">
                <div className="flex items-center justify-between px-2">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Selecione os Meses</label>
                  {manualMonths.length > 0 && (
                    <button 
                      onClick={() => setManualMonths([])}
                      className="text-[10px] font-black text-red-500 uppercase hover:underline"
                    >
                      Limpar Tudo
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-4 gap-2 bg-slate-50 p-3 rounded-2xl border border-slate-100">
                  {MONTHS.map((m, idx) => (
                    <button
                      key={m}
                      onClick={() => toggleManualMonth(idx)}
                      className={cn(
                        "py-3 rounded-xl text-xs font-bold uppercase tracking-wider transition-all border-2",
                        manualMonths.includes(idx) 
                          ? "bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-100 scale-[1.02]" 
                          : "bg-white border-white text-slate-500 hover:border-blue-100 hover:text-blue-600"
                      )}
                    >
                      {m.substring(0, 3)}
                    </button>
                  ))}
                </div>
                {manualMonths.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 px-2">
                    {manualMonths.map(mIdx => (
                      <span key={mIdx} className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded-lg text-[9px] font-black uppercase border border-blue-100">
                        {MONTHS[mIdx]}
                      </span>
                    ))}
                  </div>
                )}
                {manualMonths.length > 1 && (
                  <div className="bg-amber-50 p-3 rounded-xl border border-amber-100 flex items-start gap-2">
                    <AlertCircle size={14} className="text-amber-500 shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-700 font-bold leading-tight">Atenção: O valor total de R$ {manualAmount} será dividido proporcionalmente entre os {manualMonths.length} meses selecionados.</p>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Valor */}
                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-2">Valor Total</label>
                  <div className="relative">
                    <span className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-lg">R$</span>
                    <input 
                      type="text"
                      value={manualAmount}
                      onChange={(e) => setManualAmount(e.target.value)}
                      onBlur={formatManualAmount}
                      onKeyDown={(e) => e.key === 'Enter' && formatManualAmount()}
                      className="w-full bg-slate-50 border-0 rounded-2xl py-4 pl-14 pr-6 text-2xl font-black text-[#00174b] focus:ring-2 focus:ring-blue-500 transition-all placeholder:text-slate-300"
                      placeholder="0,00"
                    />
                  </div>
                </div>

                {/* Data do Pagamento */}
                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-2">Data do Pagamento</label>
                  <input 
                    type="date"
                    value={manualDate}
                    onChange={(e) => setManualDate(e.target.value)}
                    className="w-full bg-slate-50 border-0 rounded-2xl py-4 px-6 text-xl font-black text-[#00174b] focus:ring-2 focus:ring-blue-500 transition-all"
                  />
                </div>
              </div>

              {/* Método */}
              <div className="space-y-2">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-2">Forma de Recebimento</label>
                <div className="grid grid-cols-3 gap-3">
                  {(['Dinheiro', 'PIX', 'Cartão'] as const).map((method) => (
                    <button
                      key={method}
                      onClick={() => setManualMethod(method)}
                      className={cn(
                        "py-3 rounded-2xl text-xs font-black uppercase tracking-wider transition-all border-2",
                        manualMethod === method 
                          ? "bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-200" 
                          : "bg-white border-slate-100 text-slate-400 hover:border-blue-200 hover:text-blue-500"
                      )}
                    >
                      {method}
                    </button>
                  ))}
                </div>
              </div>

              {/* Observações */}
              <div className="space-y-2">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-2">Observações</label>
                <textarea 
                  value={manualObservations}
                  onChange={(e) => setManualObservations(e.target.value)}
                  placeholder="Informações adicionais sobre este pagamento..."
                  className="w-full bg-slate-50 border-0 rounded-2xl py-4 px-6 text-sm font-medium text-[#00174b] focus:ring-2 focus:ring-blue-500 transition-all resize-none h-24"
                />
              </div>
              
              <div className="pt-4">
                <button 
                  onClick={saveManualContribution}
                  disabled={isSavingManual || manualMonths.length === 0}
                  className="w-full bg-[#00174b] text-white py-4 rounded-2xl font-black uppercase tracking-widest flex items-center justify-center gap-3 hover:bg-blue-800 transition-all shadow-xl shadow-blue-900/20 disabled:opacity-50"
                >
                  {isSavingManual ? (
                    <>
                      <Loader2 size={20} className="animate-spin" />
                      Salvando Contribuições...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={20} />
                      Registrar {manualMonths.length > 1 ? `${manualMonths.length} Meses` : 'Pagamento'}
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      </div>

      {/* Modal de Visualização de Recibo Tela */}
      {receiptPreviewData && !isPrinting && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[120] flex items-center justify-center p-4 print:hidden">
          <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 flex flex-col max-h-[95vh]">
            <div className="p-6 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center">
                  <Printer size={20} />
                </div>
                <h3 className="text-lg font-black text-[#131b2e]">Visualização do Recibo</h3>
              </div>
              <button onClick={() => setReceiptPreviewData(null)} className="p-2 text-slate-400 hover:bg-red-50 hover:text-red-500 rounded-xl">
                <X size={24} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-8 bg-slate-100/30">
              <div className="max-w-xl mx-auto space-y-8">
                {[1, 2].map((via) => (
                  <div key={via} className="bg-white p-12 shadow-sm border border-slate-200 rounded-lg relative overflow-hidden">
                    {/* Header Recibo */}
                    <div className={cn(
                      "flex items-start mb-10 relative",
                      institution?.logo_url ? "gap-8" : "justify-center text-center"
                    )}>
                      {institution?.logo_url && (
                        <div className="shrink-0 pt-1">
                          <img src={institution.logo_url} className="w-20 h-20 rounded-lg object-contain" referrerPolicy="no-referrer" />
                        </div>
                      )}
                      
                      <div className={cn(
                        "flex-1 space-y-1",
                        !institution?.logo_url && "text-center"
                      )}>
                        <h4 className="text-xl font-black text-[#00174b] uppercase tracking-tight leading-tight">{institution?.name}</h4>
                        <p className="text-[10px] text-slate-500 font-bold max-w-sm leading-relaxed">{institution?.address}</p>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[9px] text-slate-400 font-bold uppercase tracking-wider pt-1">
                          {institution?.cnpj && <span>CNPJ: {institution.cnpj}</span>}
                          {institution?.phone && <span>TEL: {institution.phone}</span>}
                          {institution?.email && <span className="lowercase underline">email: {institution.email.toLowerCase()}</span>}
                        </div>
                        {institution?.website && (
                          <p className="text-[9px] text-blue-600 font-black uppercase tracking-[0.2em] pt-1 border-t border-slate-50 inline-block">{institution.website}</p>
                        )}
                      </div>
                      
                      <div className="absolute right-0 top-0 text-right h-full flex flex-col justify-center">
                        <span className="text-[10px] font-black text-slate-200 uppercase tracking-widest vertical-text transform rotate-180" style={{ writingMode: 'vertical-lr' }}>
                          {via === 1 ? 'VIA ESCOLA' : 'VIA ALUNO'}
                        </span>
                      </div>
                    </div>

                    <div className="w-full h-px bg-slate-100 mb-8" />
                    
                    <div className="text-center mb-10">
                      <h2 className="text-xl font-black text-[#00174b] uppercase tracking-[0.3em] inline-block border-b-2 border-[#00174b] pb-1">Recibo de Contribuição</h2>
                    </div>

                    <div className="space-y-10">
                      <div className="bg-slate-50 p-6 rounded-xl border border-slate-100 grid grid-cols-2 gap-8 relative overflow-hidden">
                        <div className="absolute left-0 top-0 w-1.5 h-full bg-blue-600"></div>
                        <div>
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Matricula / Aluno(a)</p>
                          <p className="text-sm font-black text-[#00174b]">
                            {((receiptPreviewData[0] as any).student || selectedStudent)?.registration_number} - {((receiptPreviewData[0] as any).student || selectedStudent)?.name}
                          </p>
                        </div>
                        <div>
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Turma Acadêmica</p>
                          <p className="text-sm font-black text-[#00174b]">
                            {classes.find(cl => cl.id === ((receiptPreviewData[0] as any).student || selectedStudent)?.class_id)?.code || '---'}
                          </p>
                        </div>
                      </div>

                      <div className="border border-slate-200 rounded-xl overflow-hidden">
                        <table className="w-full text-[10px] text-center">
                          <thead className="bg-slate-50 border-b border-slate-200">
                            <tr>
                              <th className="py-2 px-4 font-black text-slate-500 uppercase">Mês de Ref.</th>
                              <th className="py-2 px-4 font-black text-slate-500 uppercase border-l border-slate-200">Valor</th>
                              <th className="py-2 px-4 font-black text-slate-500 uppercase border-l border-slate-200">Meio Pagto.</th>
                            </tr>
                          </thead>
                          <tbody>
                            {receiptPreviewData.map((reg) => (
                              <tr key={reg.id} className="border-b border-slate-100 last:border-0 font-bold text-[#131b2e]">
                                <td className="py-2 px-4">{MONTHS[reg.reference_month - 1]} / {reg.reference_year}</td>
                                <td className="py-2 px-4 border-l border-slate-100">{formatCurrency(reg.amount)}</td>
                                <td className="py-2 px-4 border-l border-slate-100 text-[9px] uppercase">{reg.payment_method || (reg.pix_id ? 'PIX' : 'Dinheiro')}</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot className="bg-blue-50 border-t border-slate-200">
                            <tr className="font-black text-blue-900">
                              <td className="py-3 px-4 text-right">TOTAL</td>
                              <td className="py-3 px-4 border-l border-blue-100">{formatCurrency(receiptPreviewData.reduce((acc, c) => acc + c.amount, 0))}</td>
                              <td className="py-3 px-4 border-l border-blue-100"></td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>

                      <div className="flex justify-between items-end pt-4">
                        <div className="space-y-1">
                          <p className="text-[9px] font-bold text-slate-400">Data do Recebimento: {safeFormat(receiptPreviewData[0].payment_date, 'dd/MM/yyyy')}</p>
                          <p className="text-[9px] font-bold text-slate-300">Emissão: {safeFormat(new Date(), 'dd/MM/yyyy HH:mm')}</p>
                        </div>
                        <div className="text-center">
                          <div className="w-48 border-b border-slate-300 mb-2"></div>
                          <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Responsável / Tesouraria</p>
                        </div>
                      </div>
                    </div>

                    {via === 1 && (
                      <div className="absolute left-0 bottom-0 w-full h-[1px] border-b border-dashed border-slate-300 mt-4 flex items-center justify-center">
                        <span className="bg-white px-4 text-[7px] font-black text-slate-300 uppercase -translate-y-[1px]">Corte Aqui</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="p-6 bg-white border-t border-slate-100 grid grid-cols-2 gap-4">
              <button 
                onClick={() => generateSelectedReceipts(receiptPreviewData!, 'save')}
                className="py-4 bg-[#00174b] text-white rounded-xl font-black uppercase tracking-widest flex items-center justify-center gap-3 hover:bg-blue-800 shadow-xl transition-all text-[10px]"
              >
                <FileDown size={18} /> Baixar PDF
              </button>
              <button 
                onClick={() => generateSelectedReceipts(receiptPreviewData!, 'print')}
                className="py-4 bg-emerald-600 text-white rounded-xl font-black uppercase tracking-widest flex items-center justify-center gap-3 hover:bg-emerald-700 shadow-xl transition-all text-[10px]"
              >
                <Printer size={18} /> Imprimir Recibo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Printable Area - THE ONLY THING VISIBLE DURING PRINT */}
      {receiptPreviewData && (
        <div className={cn(
          "bg-white text-black p-0 m-0 w-full min-h-screen",
          isPrinting ? "relative" : "hidden",
          "print:block"
        )}>
          {/* Barra de Controle de Segurança (Não sai na impressão) */}
          <div className="print:hidden sticky top-0 left-0 w-full bg-slate-900 text-white p-4 flex flex-col sm:flex-row items-center justify-between z-[200] shadow-2xl gap-4">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center">
                <Printer size={20} />
              </div>
              <div>
                <h3 className="text-sm font-black uppercase tracking-widest leading-none mb-1">Painel de Impressão</h3>
                <p className="text-[10px] text-slate-400 font-bold uppercase">Utilize os controles abaixo se a janela não abrir.</p>
              </div>
            </div>
            
            <div className="flex items-center flex-wrap justify-center gap-3">
              <button 
                onMouseDown={() => window.print()}
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-black text-[9px] uppercase tracking-widest transition-all shadow-lg flex items-center gap-2"
              >
                <Printer size={16} /> Abrir Impressora
              </button>

              <button 
                onClick={() => generateSelectedReceipts(receiptPreviewData!, 'save')}
                className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-[9px] uppercase tracking-widest transition-all shadow-lg flex items-center gap-2"
              >
                <FileDown size={16} /> Baixar PDF (Reserva)
              </button>

              <div className="w-px h-8 bg-white/10 hidden sm:block mx-1"></div>

              <button 
                onClick={() => {
                  setIsPrinting(false);
                  setReceiptPreviewData(null);
                }}
                className="px-6 py-2.5 bg-white/10 hover:bg-red-500/20 text-white hover:text-red-400 rounded-xl font-black text-[9px] uppercase tracking-widest transition-all flex items-center gap-2"
              >
                <X size={16} /> Voltar ao Sistema
              </button>
            </div>
          </div>

          <div className={cn("space-y-4 p-8", isPrinting && "pt-8")}>
            {[1, 2].map((via) => (
              <div key={via} className="bg-white p-8 border border-slate-200 rounded-lg relative overflow-hidden break-inside-avoid shadow-none mb-4">
                {/* Header Recibo */}
                <div className={cn(
                  "flex items-start mb-6 relative",
                  institution?.logo_url ? "gap-6" : "justify-center text-center"
                )}>
                  {institution?.logo_url && (
                    <div className="shrink-0 pt-1">
                      <img src={institution.logo_url} className="w-16 h-16 rounded-lg object-contain" referrerPolicy="no-referrer" />
                    </div>
                  )}
                  
                  <div className={cn(
                    "flex-1 space-y-0.5",
                    !institution?.logo_url && "text-center"
                  )}>
                    <h4 className="text-lg font-black text-[#00174b] uppercase tracking-tight leading-tight">{institution?.name || 'ESCOLA DIOCESANA DE MINISTÉRIOS'}</h4>
                    <p className="text-[9px] text-slate-500 font-bold max-w-sm leading-relaxed">{institution?.address || 'Av. Venus, 195 - Itapegica - Guarulhos - Cep 07044-170'}</p>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[8px] text-slate-400 font-bold uppercase tracking-wider">
                      {institution?.cnpj && <span>CNPJ: {institution.cnpj}</span>}
                      {institution?.phone && <span>TEL: {institution.phone}</span>}
                      {institution?.email && <span>email: {institution.email.toLowerCase()}</span>}
                    </div>
                  </div>
                  
                  <div className="absolute right-0 top-0 text-right h-full flex flex-col justify-center">
                    <span className="text-[9px] font-black text-slate-200 uppercase tracking-widest transform rotate-180" style={{ writingMode: 'vertical-lr' }}>
                      {via === 1 ? 'VIA ESCOLA' : 'VIA ALUNO'}
                    </span>
                  </div>
                </div>

                <div className="w-full h-px bg-slate-100 mb-6" />
                
                <div className="text-center mb-6">
                  <h2 className="text-lg font-black text-[#00174b] uppercase tracking-[0.2em] inline-block border-b-2 border-[#00174b] pb-0.5">Recibo de Contribuição</h2>
                </div>

                <div className="space-y-6">
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 grid grid-cols-2 gap-6 relative overflow-hidden">
                    <div className="absolute left-0 top-0 w-1 h-full bg-blue-600"></div>
                    <div>
                      <p className="text-[8px] font-black text-slate-400 uppercase tracking-[0.1em] mb-1">Matricula / Aluno(a)</p>
                      <p className="text-xs font-black text-[#00174b]">
                        {((receiptPreviewData[0] as any).student || selectedStudent)?.registration_number} - {((receiptPreviewData[0] as any).student || selectedStudent)?.name}
                      </p>
                    </div>
                    <div>
                      <p className="text-[8px] font-black text-slate-400 uppercase tracking-[0.1em] mb-1">Turma Acadêmica</p>
                      <p className="text-xs font-black text-[#00174b]">
                        {classes.find(cl => cl.id === ((receiptPreviewData[0] as any).student || selectedStudent)?.class_id)?.code || '---'}
                      </p>
                    </div>
                  </div>

                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full text-[9px] text-center">
                      <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                          <th className="py-1.5 px-3 font-black text-slate-500 uppercase">Mês de Ref.</th>
                          <th className="py-1.5 px-3 font-black text-slate-500 uppercase border-l border-slate-200">Valor</th>
                          <th className="py-1.5 px-3 font-black text-slate-500 uppercase border-l border-slate-200">Meio Pagto.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {receiptPreviewData.map((reg) => (
                          <tr key={reg.id} className="border-b border-slate-100 last:border-0 font-bold text-[#131b2e]">
                            <td className="py-1.5 px-3">{MONTHS[reg.reference_month - 1]} / {reg.reference_year}</td>
                            <td className="py-1.5 px-3 border-l border-slate-100">{formatCurrency(reg.amount)}</td>
                            <td className="py-1.5 px-3 border-l border-slate-100 text-[8px] uppercase">{reg.payment_method || (reg.pix_id ? 'PIX' : 'Dinheiro')}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-blue-50 border-t border-slate-200">
                        <tr className="font-black text-blue-900">
                          <td className="py-2 px-3 text-right text-[8px]">TOTAL</td>
                          <td className="py-2 px-3 border-l border-blue-100 font-black">{formatCurrency(receiptPreviewData.reduce((acc, c) => acc + c.amount, 0))}</td>
                          <td className="py-2 px-3 border-l border-blue-100"></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>

                  <div className="flex justify-between items-end pt-2">
                    <div className="space-y-0.5">
                      <p className="text-[8px] font-bold text-slate-400">Recebido em: {safeFormat(receiptPreviewData[0].payment_date, 'dd/MM/yyyy')}</p>
                      <p className="text-[8px] font-bold text-slate-300">Emitido: {safeFormat(new Date(), 'dd/MM/yyyy HH:mm')}</p>
                    </div>
                    <div className="text-center">
                      <div className="w-40 border-b border-slate-300 mb-1"></div>
                      <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest">Responsável / Tesouraria</p>
                    </div>
                  </div>
                </div>

                {via === 1 && (
                  <div className="absolute left-0 bottom-0 w-full h-[1px] border-b border-dashed border-slate-300 mt-4 flex items-center justify-center">
                    <span className="bg-white px-2 text-[6px] font-black text-slate-300 uppercase -translate-y-[1px]">Corte Aqui</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
