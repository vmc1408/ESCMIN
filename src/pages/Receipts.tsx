import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  FileText, 
  Search, 
  Plus, 
  Printer, 
  Trash2, 
  Calendar, 
  Loader2, 
  CheckCircle2, 
  AlertCircle, 
  Download, 
  X, 
  FileDown, 
  DollarSign, 
  ChevronLeft,
  Copy,
  Edit2,
  Save
} from 'lucide-react';
import { cn, formatCurrency, safeFormat, parseSafeDate, formatDateForDisplay, parseDateToDB } from '../lib/utils';
import { PageHeader } from '../components/PageHeader';
import { fetchAll, saveData, deleteData } from '../lib/database';
import { useAuth } from '../contexts/AuthContext';
import { financialService } from '../services/financialService';
import { motion, AnimatePresence } from 'motion/react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

interface Receipt {
  id: string;
  receipt_number: string;
  amount: number;
  payee_name: string;
  description: string;
  payment_date: string;
  signature_label?: string;
  issue_date: string;
  user_id?: string;
  created_at?: string;
}

// Convert monetary number to Portuguese words
function numberToPortugueseWords(value: number): string {
  if (value === 0) return 'zero reais';
  
  const unidades = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove'];
  const dezenas1 = ['dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
  const dezenas = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
  const centenas = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];

  const numeroPorExtenso = (num: number): string => {
    if (num === 0) return '';
    if (num === 100) return 'cem';
    if (num < 10) return unidades[num];
    if (num < 20) return dezenas1[num - 10];
    if (num < 100) {
      const d = Math.floor(num / 10);
      const u = num % 10;
      return dezenas[d] + (u > 0 ? ' e ' + unidades[u] : '');
    }
    const c = Math.floor(num / 100);
    const resto = num % 100;
    return centenas[c] + (resto > 0 ? ' e ' + numeroPorExtenso(resto) : '');
  };

  const parteInteira = Math.floor(value);
  const parteDecimal = Math.round((value - parteInteira) * 100);

  const formatarMilhares = (num: number): string => {
    if (num === 0) return '';
    if (num < 1000) return numeroPorExtenso(num);
    const milhar = Math.floor(num / 1000);
    const resto = num % 1000;
    const milharTexto = milhar === 1 ? 'mil' : numeroPorExtenso(milhar) + ' mil';
    return milharTexto + (resto > 0 ? ' e ' + numeroPorExtenso(resto) : '');
  };

  let textoReais = '';
  if (parteInteira > 0) {
    if (parteInteira >= 1000) {
      textoReais = formatarMilhares(parteInteira);
    } else {
      textoReais = numeroPorExtenso(parteInteira);
    }
    textoReais += parteInteira === 1 ? ' real' : ' reais';
  }

  let textoCentavos = '';
  if (parteDecimal > 0) {
    textoCentavos = numeroPorExtenso(parteDecimal) + (parteDecimal === 1 ? ' centavo' : ' centavos');
  }

  let result = '';
  if (textoReais && textoCentavos) {
    result = `${textoReais} e ${textoCentavos}`;
  } else {
    result = textoReais || textoCentavos || 'zero reais';
  }

  return result.toUpperCase();
}

export function Receipts() {
  const { user } = useAuth();
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [institution, setInstitution] = useState<any>(null);
  
  // Form State
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingReceipt, setEditingReceipt] = useState<Receipt | null>(null);
  const [receiptNumber, setReceiptNumber] = useState('');
  const [amount, setAmount] = useState('');
  const [payeeName, setPayeeName] = useState('');
  const [description, setDescription] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [signatureLabel, setSignatureLabel] = useState('');
  const [issueDate, setIssueDate] = useState(new Date().toISOString().split('T')[0]);

  // Helper to format string into PT-BR currency representation (e.g., 1.056,93)
  const formatAmountValue = (val: string) => {
    if (!val) return '';
    // Strip everything except digits, comma and dot
    let clean = val.replace(/[^0-9,.]/g, '');
    if (!clean) return '';
    
    let hasComma = clean.includes(',');
    let hasDot = clean.includes('.');
    
    let numericVal = 0;
    if (hasComma) {
      // Remove dots, change comma to dot
      const normalized = clean.replace(/\./g, '').replace(',', '.');
      numericVal = parseFloat(normalized) || 0;
    } else if (hasDot) {
      const parts = clean.split('.');
      if (parts.length > 2) {
        numericVal = parseFloat(clean.replace(/\./g, '')) || 0;
      } else {
        numericVal = parseFloat(clean) || 0;
      }
    } else {
      numericVal = parseFloat(clean) || 0;
    }
    
    return numericVal.toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  };

  // Helper to parse standard/formatted PT-BR currency back to float safely
  const parseAmountToFloat = (val: string): number => {
    if (!val) return 0;
    const clean = val.replace(/\./g, '').replace(',', '.');
    return parseFloat(clean) || 0;
  };

  const handleStartEdit = (receipt: Receipt) => {
    setEditingReceipt(receipt);
    setReceiptNumber(receipt.receipt_number);
    setAmount(receipt.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    setPayeeName(receipt.payee_name);
    setDescription(receipt.description);
    setPaymentDate(receipt.payment_date.split('T')[0]);
    setSignatureLabel(receipt.signature_label || '');
    setIssueDate(receipt.issue_date.split('T')[0]);
    setShowAddForm(true);
  };

  const handleStartNewReceipt = () => {
    setEditingReceipt(null);
    setAmount('');
    setPayeeName('');
    setDescription('');
    setSignatureLabel('');
    setPaymentDate(new Date().toISOString().split('T')[0]);
    setIssueDate(new Date().toISOString().split('T')[0]);
    setShowAddForm(true);
  };

  const handleCloseForm = () => {
    setShowAddForm(false);
    setEditingReceipt(null);
    setAmount('');
    setPayeeName('');
    setDescription('');
    setSignatureLabel('');
    setPaymentDate(new Date().toISOString().split('T')[0]);
    setIssueDate(new Date().toISOString().split('T')[0]);
  };

  // Print/Preview State
  const [selectedReceipt, setSelectedReceipt] = useState<Receipt | null>(null);
  const [isPrinting, setIsPrinting] = useState(false);
  const [deleteConfirmationFor, setDeleteConfirmationFor] = useState<Receipt | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [copiesModal, setCopiesModal] = useState<{
    isOpen: boolean;
    receipt: Receipt | null;
    action: 'download' | 'print';
  }>({
    isOpen: false,
    receipt: null,
    action: 'download'
  });

  const handlePrintOrDownload = (receipt: Receipt, action: 'download' | 'print') => {
    setCopiesModal({
      isOpen: true,
      receipt,
      action
    });
  };

  useEffect(() => {
    fetchInitialData();
  }, []);

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => {
        setNotification(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const fetchInitialData = async () => {
    setLoading(true);
    try {
      const [receiptsData, instData] = await Promise.all([
        fetchAll('receipts', '*', 'receipt_number', false),
        financialService.getInstitutionSettings()
      ]);
      
      // Sort receipts descending by numeric receipt_number if possible, otherwise string sort
      const sortedReceipts = (receiptsData || []).sort((a: Receipt, b: Receipt) => {
        const numA = parseInt(a.receipt_number) || 0;
        const numB = parseInt(b.receipt_number) || 0;
        return numB - numA;
      });

      setReceipts(sortedReceipts);
      setInstitution(instData || null);
    } catch (err: any) {
      console.error('Error fetching receipts:', err);
      setNotification({ type: 'error', message: 'Erro ao carregar recibos: ' + err.message });
    } finally {
      setLoading(false);
    }
  };

  // Determine next receipt number
  useEffect(() => {
    if (showAddForm && !editingReceipt) {
      const numbers = receipts.map(r => parseInt(r.receipt_number)).filter(n => !isNaN(n));
      const nextNum = numbers.length > 0 ? Math.max(...numbers) + 1 : 1;
      setReceiptNumber(String(nextNum));
    }
  }, [showAddForm, receipts, editingReceipt]);

  const handleSignatureLabelChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    
    // If user is deleting or cleared the input, let them edit freely
    if (val.length < signatureLabel.length) {
      setSignatureLabel(val);
      return;
    }
    
    // Clean document prefix if present to normalize number formatting
    let cleanVal = val.replace(/^(CPF:\s*|RG:\s*)/i, '');
    const digits = cleanVal.replace(/\D/g, '');
    
    if (digits.length === 0) {
      setSignatureLabel(val);
      return;
    }
    
    // Check if there are other letters like passport
    const hasLetters = /[A-Z]/i.test(cleanVal.replace(/[^A-Z]/gi, ''));
    if (hasLetters) {
      setSignatureLabel(val);
      return;
    }
    
    if (digits.length <= 9) {
      let formatted = '';
      if (digits.length <= 2) {
        formatted = digits;
      } else if (digits.length <= 5) {
        formatted = `${digits.slice(0, 2)}.${digits.slice(2)}`;
      } else if (digits.length <= 8) {
        formatted = `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
      } else {
        formatted = `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}-${digits.slice(8, 9)}`;
      }
      setSignatureLabel(`RG: ${formatted}`);
    } else {
      const cpfDigits = digits.slice(0, 11);
      let formatted = '';
      if (cpfDigits.length <= 3) {
        formatted = cpfDigits;
      } else if (cpfDigits.length <= 6) {
        formatted = `${cpfDigits.slice(0, 3)}.${cpfDigits.slice(3)}`;
      } else if (cpfDigits.length <= 9) {
        formatted = `${cpfDigits.slice(0, 3)}.${cpfDigits.slice(3, 6)}.${cpfDigits.slice(6)}`;
      } else {
        formatted = `${cpfDigits.slice(0, 3)}.${cpfDigits.slice(3, 6)}.${cpfDigits.slice(6, 9)}-${cpfDigits.slice(9)}`;
      }
      setSignatureLabel(`CPF: ${formatted}`);
    }
  };

  const handleSaveReceipt = async (e: React.FormEvent | null, action: 'save' | 'print' | 'pdf' = 'save') => {
    if (e) e.preventDefault();
    if (!receiptNumber || !amount || !payeeName || !description) {
      setNotification({ type: 'error', message: 'Por favor, preencha todos os campos obrigatórios.' });
      return;
    }

    setIsSaving(true);
    try {
      const newReceipt: Partial<Receipt> = {
        receipt_number: receiptNumber.trim(),
        amount: parseAmountToFloat(amount),
        payee_name: payeeName.trim(),
        description: description.trim(),
        payment_date: paymentDate,
        signature_label: signatureLabel.trim() || undefined,
        issue_date: issueDate,
        user_id: user?.uid
      };

      let fullReceipt: Receipt;
      if (editingReceipt) {
        await saveData('receipts', editingReceipt.id, newReceipt);
        fullReceipt = {
          ...newReceipt,
          id: editingReceipt.id
        } as Receipt;
        setNotification({ type: 'success', message: 'Recibo atualizado com sucesso!' });
      } else {
        const savedId = await saveData('receipts', undefined, newReceipt);
        fullReceipt = {
          ...newReceipt,
          id: savedId as string
        } as Receipt;
        setNotification({ type: 'success', message: 'Recibo gerado com sucesso!' });
      }
      
      // Select the newly generated/updated receipt so it is loaded in the preview portal/container
      setSelectedReceipt(fullReceipt);
      
      // Reset form and reload list
      setShowAddForm(false);
      setEditingReceipt(null);
      setAmount('');
      setPayeeName('');
      setDescription('');
      setSignatureLabel('');
      setPaymentDate(new Date().toISOString().split('T')[0]);
      setIssueDate(new Date().toISOString().split('T')[0]);
      
      await fetchInitialData();

      // Trigger immediate printing or download if chosen
      if (action === 'print') {
        setTimeout(() => {
          handlePrintOrDownload(fullReceipt, 'print');
        }, 300);
      } else if (action === 'pdf') {
        setTimeout(() => {
          handlePrintOrDownload(fullReceipt, 'download');
        }, 100);
      }
    } catch (err: any) {
      console.error('Error saving receipt:', err);
      setNotification({ type: 'error', message: `Erro ao ${editingReceipt ? 'atualizar' : 'gerar'} recibo: ` + err.message });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteReceipt = async (id: string) => {
    try {
      await deleteData('receipts', id);
      setNotification({ type: 'success', message: 'Recibo excluído com sucesso!' });
      setDeleteConfirmationFor(null);
      fetchInitialData();
    } catch (err: any) {
      console.error('Error deleting receipt:', err);
      setNotification({ type: 'error', message: 'Erro ao excluir recibo: ' + err.message });
    }
  };

  const generatePDF = (receipt: Receipt, action: 'download' | 'print' = 'download', copies: 1 | 2 = 2) => {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    const drawSingleCopy = (yOffset: number, viaLabel: string) => {
      // Outer Border - Subtle Slate Gray border
      doc.setDrawColor(148, 163, 184); // slate-400
      doc.setLineWidth(0.4);
      doc.rect(10, yOffset + 10, 190, 128, 'S');

      // Logo drawing
      if (institution?.logo_url) {
        try {
          doc.addImage(institution.logo_url, 'auto', 25, yOffset + 15, 18, 18);
        } catch (e) {
          console.error('Error drawing logo in PDF', e);
        }
      }

      // Via description (Top Right)
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(148, 163, 184); // slate-400
      doc.text(viaLabel.toUpperCase(), 185, yOffset + 16, { align: 'right' });

      // Header text centered at 105mm
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(71, 85, 105); // slate-600
      doc.text('MITRA DIOCESANA DE GUARULHOS', 105, yOffset + 20, { align: 'center' });

      doc.setFontSize(13);
      doc.setTextColor(15, 23, 42); // slate-900
      const instName = institution?.name || 'ESCOLA DIOCESANA DE MINISTÉRIOS';
      doc.text(instName.toUpperCase(), 105, yOffset + 25.5, { align: 'center' });
      
      if (institution?.subtitle) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(71, 85, 105); // slate-600
        doc.text(institution.subtitle, 105, yOffset + 30.5, { align: 'center' });
      }

      if (institution?.address) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(100, 116, 139); // slate-500
        doc.text(institution.address, 105, yOffset + 35.5, { align: 'center' });
      }

      // Separator line below header
      doc.setDrawColor(226, 232, 240); // slate-200
      doc.setLineWidth(0.4);
      doc.line(25, yOffset + 41, 185, yOffset + 41);

      // Receipt number
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(30, 41, 59); // slate-800
      doc.text(`RECIBO Nº ${receipt.receipt_number}`, 25, yOffset + 48.5);

      // Amount block
      const amountStr = formatCurrency(receipt.amount);
      const textWidth = doc.getTextWidth(amountStr);
      
      // Amount badge background and border
      doc.setFillColor(248, 250, 252); // slate-50
      doc.setDrawColor(203, 213, 225); // slate-300
      doc.setLineWidth(0.25);
      doc.rect(185 - textWidth - 6, yOffset + 43, textWidth + 8, 8, 'FD');
      
      // Amount text
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(30, 41, 59); // slate-800
      doc.text(amountStr, 185 - 3, yOffset + 48.5, { align: 'right' });

      // Title
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.setTextColor(15, 23, 42); // slate-900
      doc.text('RECIBO DE PAGAMENTO', 105, yOffset + 59, { align: 'center' });

      // Body text with split text formatting
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(51, 65, 85); // slate-700
      
      const amountInWords = numberToPortugueseWords(receipt.amount);
      const institutionName = institution?.name || 'ESCOLA DIOCESANA DE MINISTÉRIOS';
      const institutionCNPJ = institution?.cnpj ? `CNPJ Nº ${institution.cnpj}` : '';
      const institutionAddress = institution?.address || '';
      
      const bodyText = `Recebi da ${institutionName}, ${institutionCNPJ}, ${institutionAddress} a importância de ${formatCurrency(receipt.amount)} (${amountInWords}) referente a ${receipt.description}.`;
      
      const splitText = doc.splitTextToSize(bodyText, 160); // 160mm printable width
      doc.text(splitText, 25, yOffset + 69, { lineHeightFactor: 1.4 });

      // Long Date (Right-aligned)
      const city = institution?.city_uf ? institution.city_uf.split('/')[0] : 'GUARULHOS';
      const paymentDateFormatted = formatLongDate(receipt.payment_date);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(15, 23, 42); // slate-900
      doc.text(`${city.toUpperCase()}, ${paymentDateFormatted}.`, 185, yOffset + 96, { align: 'right' });

      // Signature line and information
      doc.setDrawColor(203, 213, 225); // slate-300
      doc.setLineWidth(0.4);
      doc.line(65, yOffset + 114, 145, yOffset + 114);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(15, 23, 42); // slate-900
      doc.text(receipt.payee_name.toUpperCase(), 105, yOffset + 119, { align: 'center' });
      
      if (receipt.signature_label) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor(100, 116, 139); // slate-500
        doc.text(receipt.signature_label.toUpperCase(), 105, yOffset + 123, { align: 'center' });
      }

      // Emission date at bottom-right corner
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184); // slate-400
      const issueDateFormatted = safeFormat(receipt.issue_date, 'dd/MM/yyyy');
      doc.text(`Emissão em ${issueDateFormatted}`, 185, yOffset + 132, { align: 'right' });
    };

    if (copies === 1) {
      // Draw Single Copy (Top)
      drawSingleCopy(0, 'Via Única');
    } else {
      // Draw First Copy (Top)
      drawSingleCopy(0, '1ª Via - Beneficiário');

      // Draw Cut line in the middle of A4 portrait
      doc.setDrawColor(148, 163, 184); // slate-400
      doc.setLineWidth(0.3);
      doc.setLineDashPattern([2, 2], 0);
      doc.line(10, 148.5, 200, 148.5);

      // Midline cutting text helper
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184); // slate-400
      doc.text('recortar na linha pontilhada', 105, 147.5, { align: 'center' });

      // Draw Second Copy (Bottom)
      drawSingleCopy(148.5, '2ª Via - Arquivo Instituição');
    }

    if (action === 'print') {
      try {
        const blob = doc.output('blob');
        const url = URL.createObjectURL(blob);
        const iframe = document.createElement('iframe');
        iframe.style.position = 'fixed';
        iframe.style.right = '0';
        iframe.style.bottom = '0';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = 'none';
        iframe.src = url;
        document.body.appendChild(iframe);
        iframe.onload = () => {
          iframe.contentWindow?.focus();
          
          const cleanup = () => {
            try {
              if (document.body.contains(iframe)) {
                document.body.removeChild(iframe);
              }
              URL.revokeObjectURL(url);
            } catch (e) {
              console.error("Cleanup error:", e);
            }
          };

          iframe.contentWindow?.addEventListener('afterprint', cleanup);
          iframe.contentWindow?.print();
          
          // Long fallback to clean up iframe in case afterprint doesn't trigger
          setTimeout(cleanup, 300000);
        };
        setNotification({ type: 'success', message: 'Enviando PDF do recibo para a impressora...' });
      } catch (err: any) {
        console.error('Erro ao acionar impressão direta:', err);
        doc.save(`Recibo_N_${receipt.receipt_number}.pdf`);
        setNotification({ type: 'error', message: 'Erro na impressão direta. O PDF foi baixado como alternativa.' });
      }
    } else {
      doc.save(`Recibo_N_${receipt.receipt_number}.pdf`);
      setNotification({ type: 'success', message: `PDF do recibo gerado em ${copies} via(s) com sucesso!` });
    }
  };

  const formatLongDate = (dateString: string) => {
    if (!dateString) return '';
    const dateStr = dateString.split('T')[0];
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const year = parts[0];
      const monthIndex = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      const months = [
        'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
        'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
      ];
      return `${day} de ${months[monthIndex]} de ${year}`;
    }
    return dateString;
  };

  const filteredReceipts = receipts.filter(r => 
    r.payee_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.receipt_number.includes(searchTerm) ||
    r.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 font-sans">
      <PageHeader 
        title="Recibos de Pagamento" 
        description="Gerenciamento e emissão de recibos padrão para professores e prestadores de serviços."
        icon={FileText}
      />

      {notification && (
        <div className={cn(
          "p-4 rounded-xl flex items-start gap-3 border shadow-sm animate-in fade-in slide-in-from-top-4 duration-300",
          notification.type === 'success' ? "bg-emerald-50 border-emerald-200 text-emerald-800" :
          notification.type === 'error' ? "bg-rose-50 border-rose-200 text-rose-800" :
          "bg-blue-50 border-blue-200 text-blue-800"
        )}>
          {notification.type === 'success' ? <CheckCircle2 className="shrink-0" size={20} /> : <AlertCircle className="shrink-0" size={20} />}
          <div>
            <p className="text-xs font-bold uppercase tracking-wider mb-0.5">{notification.type === 'success' ? 'Sucesso' : 'Atenção'}</p>
            <p className="text-xs font-medium leading-relaxed">{notification.message}</p>
          </div>
          <button onClick={() => setNotification(null)} className="ml-auto text-slate-400 hover:text-slate-600">
            <X size={16} />
          </button>
        </div>
      )}

      {/* Main Controls */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 bg-slate-900 text-white p-4 rounded-[2rem] border border-slate-800 shadow-xl">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input 
            type="text"
            placeholder="Pesquisar por favorecido, número ou descrição..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-800 text-white border border-slate-700 rounded-xl text-xs font-semibold uppercase tracking-wider placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
          />
        </div>
        
        <button 
          onClick={handleStartNewReceipt}
          className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs uppercase tracking-widest transition-all flex items-center gap-2 active:scale-95 shadow-lg"
        >
          <Plus size={16} /> Novo Recibo
        </button>
      </div>

      {/* Content Area */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Receipt List */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-white border border-slate-200 rounded-[2rem] shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-sm font-black text-[#00174b] uppercase tracking-wider">Recibos Emitidos</h3>
              <span className="px-3 py-1 bg-slate-100 text-slate-600 rounded-full text-[10px] font-black uppercase">{filteredReceipts.length} recibos</span>
            </div>

            {loading ? (
              <div className="p-12 flex flex-col items-center justify-center text-slate-400 gap-3">
                <Loader2 className="animate-spin text-blue-600" size={32} />
                <p className="text-xs font-black uppercase tracking-wider">Carregando recibos...</p>
              </div>
            ) : filteredReceipts.length === 0 ? (
              <div className="p-12 text-center text-slate-400">
                <FileText className="mx-auto mb-3 opacity-20" size={48} />
                <p className="text-xs font-black uppercase tracking-wider">Nenhum recibo encontrado</p>
                <p className="text-[10px] font-medium text-slate-500 lowercase mt-1">Crie um novo recibo clicando no botão acima.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 max-h-[600px] overflow-y-auto">
                {filteredReceipts.map((receipt) => (
                  <div 
                    key={receipt.id}
                    className={cn(
                      "p-5 flex items-center justify-between gap-4 transition-all hover:bg-slate-50/50 cursor-pointer",
                      selectedReceipt?.id === receipt.id ? "bg-blue-50/30 border-l-4 border-blue-600" : ""
                    )}
                    onClick={() => setSelectedReceipt(receipt)}
                  >
                    <div className="space-y-1 flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 bg-slate-900 text-white rounded text-[10px] font-black tracking-widest">Nº {receipt.receipt_number}</span>
                        <span className="text-xs font-black text-slate-800 uppercase truncate">{receipt.payee_name}</span>
                      </div>
                      <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wide truncate">{receipt.description}</p>
                      <div className="flex items-center gap-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                        <span className="flex items-center gap-1"><Calendar size={12} /> {safeFormat(receipt.payment_date, 'dd/MM/yyyy')}</span>
                        <span>| Emissão: {safeFormat(receipt.issue_date, 'dd/MM/yyyy')}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-sm font-black text-blue-600">{formatCurrency(receipt.amount)}</span>
                      
                      <div className="flex items-center gap-1 print:hidden" onClick={(e) => e.stopPropagation()}>
                        <button 
                          onClick={() => handlePrintOrDownload(receipt, 'download')}
                          className="p-2 hover:bg-slate-100 text-slate-600 rounded-lg transition-colors"
                          title="Baixar PDF"
                        >
                          <FileDown size={16} />
                        </button>
                        <button 
                          onClick={() => handlePrintOrDownload(receipt, 'print')}
                          className="p-2 hover:bg-slate-100 text-slate-600 rounded-lg transition-colors"
                          title="Imprimir"
                        >
                          <Printer size={16} />
                        </button>
                        <button 
                          onClick={() => handleStartEdit(receipt)}
                          className="p-2 hover:bg-blue-50 text-blue-600 rounded-lg transition-colors"
                          title="Editar"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button 
                          onClick={() => setDeleteConfirmationFor(receipt)}
                          className="p-2 hover:bg-rose-50 text-rose-600 rounded-lg transition-colors"
                          title="Excluir"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Live / Printable Receipt Preview */}
        <div className="lg:col-span-5">
          <div className="bg-white border border-slate-200 rounded-[2rem] shadow-sm p-6 sticky top-6 space-y-4">
            <h3 className="text-sm font-black text-[#00174b] uppercase tracking-wider">Visualização do Recibo</h3>
            
            {selectedReceipt ? (
              <div className="space-y-4">
                {/* Simulated A4 preview */}
                <div 
                  id="printable-receipt-container"
                  className="bg-white p-6 border-2 border-slate-800 font-sans text-black space-y-4 select-none relative shadow-md"
                >
                  {/* Header */}
                  <div className="border-b border-black pb-2 flex items-center justify-between gap-4">
                    {institution?.logo_url ? (
                      <div className="w-12 h-12 flex items-center justify-start shrink-0">
                        <img 
                          src={institution.logo_url} 
                          className="h-12 w-12 object-contain" 
                          referrerPolicy="no-referrer" 
                          alt="Logo"
                        />
                      </div>
                    ) : (
                      <div className="w-12 h-12 shrink-0" />
                    )}
                    <div className="flex-1 text-center">
                      <p className="text-[10px] font-black tracking-widest text-slate-600 uppercase">MITRA DIOCESANA DE GUARULHOS</p>
                      <h4 className="text-xs font-bold uppercase leading-tight">{institution?.name || 'ESCOLA DIOCESANA DE MINISTÉRIOS'}</h4>
                      {institution?.subtitle && <p className="text-[9px] font-medium text-slate-500 uppercase leading-none mt-0.5">{institution.subtitle}</p>}
                      {institution?.address && <p className="text-[8px] text-slate-400 mt-1 leading-none">{institution.address}</p>}
                    </div>
                    <div className="w-12 shrink-0" />
                  </div>

                  {/* Num & Value row */}
                  <div className="flex justify-between items-start text-xs font-bold pt-1">
                    <span>Recibo Nº: {selectedReceipt.receipt_number}</span>
                    <span className="px-2 py-0.5 bg-slate-100 border border-slate-300">{formatCurrency(selectedReceipt.amount)}</span>
                  </div>

                  {/* Title */}
                  <h3 className="text-center font-black uppercase text-sm tracking-widest py-1">Recibo de Pagamento</h3>

                  {/* Description Paragraph */}
                  <p className="text-[10px] leading-relaxed text-justify break-words whitespace-pre-wrap">
                    Recebi da <span className="font-bold">{institution?.name || 'ESCOLA DIOCESANA DE MINISTÉRIOS'}</span>
                    {institution?.cnpj ? `, CNPJ Nº ${institution.cnpj}` : ''}
                    {institution?.address ? `, ${institution.address}` : ''}, a importância de <span className="font-bold">{formatCurrency(selectedReceipt.amount)}</span> ({numberToPortugueseWords(selectedReceipt.amount)}) referente a <span className="font-bold">{selectedReceipt.description}</span>.
                  </p>

                  {/* Date line */}
                  <p className="text-right text-[9px] font-bold uppercase tracking-wider pt-2">
                    {institution?.city_uf ? institution.city_uf.split('/')[0] : 'GUARULHOS'}, {formatLongDate(selectedReceipt.payment_date)}.
                  </p>

                  {/* Signature block */}
                  <div className="pt-6 text-center space-y-1">
                    <div className="w-2/3 mx-auto border-b border-black"></div>
                    <p className="text-[10px] font-black uppercase tracking-wider">{selectedReceipt.payee_name}</p>
                    {selectedReceipt.signature_label && (
                      <p className="text-[8px] text-slate-500 font-bold uppercase">{selectedReceipt.signature_label}</p>
                    )}
                  </div>

                  {/* Emission label */}
                  <p className="text-right text-[8px] text-slate-400 font-bold pt-2">
                    Emissão em {safeFormat(selectedReceipt.issue_date, 'dd/MM/yyyy')}
                  </p>
                </div>

                <div className="flex gap-2">
                  <button 
                    onClick={() => handlePrintOrDownload(selectedReceipt, 'download')}
                    className="flex-1 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl font-bold text-[10px] uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-1.5"
                  >
                    <Download size={14} /> PDF
                  </button>
                  <button 
                    onClick={() => handlePrintOrDownload(selectedReceipt, 'print')}
                    className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-[10px] uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-1.5"
                  >
                    <Printer size={14} /> Imprimir
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-8 text-center text-slate-400 border border-dashed border-slate-200 rounded-[1.5rem]">
                <FileText className="mx-auto mb-2 opacity-20" size={36} />
                <p className="text-[11px] font-black uppercase tracking-wider">Selecione um recibo para visualizar o extrato.</p>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* CSS PRINT INLINE SYSTEM */}
      {selectedReceipt && (
        <style dangerouslySetInnerHTML={{ __html: `
          @media print {
            #root {
              display: none !important;
            }
            #printable-receipt-portal {
              display: block !important;
              position: absolute !important;
              left: 10mm !important;
              top: 10mm !important;
              width: 190mm !important;
              height: 130mm !important;
              border: 1px solid #000 !important;
              padding: 10mm 15mm !important;
              background: white !important;
              box-sizing: border-box !important;
            }
            #printable-receipt-portal * {
              visibility: visible !important;
            }
            @page {
              size: A4 portrait;
              margin: 0 !important;
            }
          }
        `}} />
      )}

      {selectedReceipt && createPortal(
        <div 
          id="printable-receipt-portal"
          className="hidden print:block bg-white text-black font-sans"
        >
          {/* Header */}
          <div className="border-b border-black pb-2 flex items-center justify-between gap-4">
            {institution?.logo_url ? (
              <div className="w-12 h-12 flex items-center justify-start shrink-0">
                <img 
                  src={institution.logo_url} 
                  className="h-12 w-12 object-contain" 
                  referrerPolicy="no-referrer" 
                  alt="Logo"
                />
              </div>
            ) : (
              <div className="w-12 h-12 shrink-0" />
            )}
            <div className="flex-1 text-center">
              <p className="text-[10px] font-black tracking-widest text-slate-600 uppercase">MITRA DIOCESANA DE GUARULHOS</p>
              <h4 className="text-xs font-bold uppercase leading-tight">{institution?.name || 'ESCOLA DIOCESANA DE MINISTÉRIOS'}</h4>
              {institution?.subtitle && <p className="text-[9px] font-medium text-slate-500 uppercase leading-none mt-0.5">{institution.subtitle}</p>}
              {institution?.address && <p className="text-[8px] text-slate-400 mt-1 leading-none">{institution.address}</p>}
            </div>
            <div className="w-12 shrink-0" />
          </div>

          {/* Num & Value row */}
          <div className="flex justify-between items-start text-xs font-bold pt-1">
            <span>Recibo Nº: {selectedReceipt.receipt_number}</span>
            <span className="px-2 py-0.5 bg-slate-100 border border-slate-300">{formatCurrency(selectedReceipt.amount)}</span>
          </div>

          {/* Title */}
          <h3 className="text-center font-black uppercase text-sm tracking-widest py-1">Recibo de Pagamento</h3>

          {/* Description Paragraph */}
          <p className="text-[10px] leading-relaxed text-justify break-words whitespace-pre-wrap">
            Recebi da <span className="font-bold">{institution?.name || 'ESCOLA DIOCESANA DE MINISTÉRIOS'}</span>
            {institution?.cnpj ? `, CNPJ Nº ${institution.cnpj}` : ''}
            {institution?.address ? `, ${institution.address}` : ''}, a importância de <span className="font-bold">{formatCurrency(selectedReceipt.amount)}</span> ({numberToPortugueseWords(selectedReceipt.amount)}) referente a <span className="font-bold">{selectedReceipt.description}</span>.
          </p>

          {/* Date line */}
          <p className="text-right text-[9px] font-bold uppercase tracking-wider pt-2">
            {institution?.city_uf ? institution.city_uf.split('/')[0] : 'GUARULHOS'}, {formatLongDate(selectedReceipt.payment_date)}.
          </p>

          {/* Signature block */}
          <div className="pt-6 text-center space-y-1">
            <div className="w-2/3 mx-auto border-b border-black"></div>
            <p className="text-[10px] font-black uppercase tracking-wider">{selectedReceipt.payee_name}</p>
            {selectedReceipt.signature_label && (
              <p className="text-[8px] text-slate-500 font-bold uppercase">{selectedReceipt.signature_label}</p>
            )}
          </div>

          {/* Emission label */}
          <p className="text-right text-[8px] text-slate-400 font-bold pt-2">
            Emissão em {safeFormat(selectedReceipt.issue_date, 'dd/MM/yyyy')}
          </p>
        </div>,
        document.body
      )}

      {/* Add Receipt Form Modal */}
      <AnimatePresence>
        {showAddForm && (
          <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm flex items-center justify-center p-4 z-[200] overflow-y-auto">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-white border border-slate-200 rounded-[2.5rem] shadow-2xl max-w-4xl w-full overflow-hidden flex flex-col my-8"
            >
              {/* Header */}
              <div className="p-6 bg-slate-900 text-white flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-white/10 rounded-xl">
                    <FileText size={20} />
                  </div>
                  <div>
                    <h3 className="text-sm font-black uppercase tracking-wider">{editingReceipt ? 'Alterar Recibo de Pagamento' : 'Novo Recibo de Pagamento'}</h3>
                    <p className="text-[10px] text-slate-400 uppercase tracking-widest leading-none mt-0.5">{editingReceipt ? 'Altere o formulário para atualizar o recibo' : 'Preencha o formulário para emitir'}</p>
                  </div>
                </div>
                <button onClick={handleCloseForm} className="p-2 hover:bg-white/10 rounded-xl text-slate-300 transition-colors">
                  <X size={20} />
                </button>
              </div>

              {/* Dual Pane Body: Form on Left, Live Preview on Right */}
              <form onSubmit={(e) => e.preventDefault()} className="flex flex-col lg:flex-row h-full overflow-y-auto divide-y lg:divide-y-0 lg:divide-x divide-slate-100">
                {/* Form Input Fields */}
                <div className="lg:w-1/2 p-6 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Número do Recibo *</label>
                      <input 
                        type="text" 
                        id="receipt-number-input"
                        required
                        value={receiptNumber} 
                        onChange={(e) => setReceiptNumber(e.target.value)} 
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            document.getElementById('amount-input')?.focus();
                          }
                        }}
                        className="w-full px-4 py-2 border border-slate-200 rounded-xl text-xs font-semibold uppercase focus:outline-none focus:border-blue-500 bg-slate-50"
                      />
                    </div>
                    
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Valor do Recibo (R$) *</label>
                      <div className="relative">
                        <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                        <input 
                          type="text" 
                          id="amount-input"
                          required
                          placeholder="0,00"
                          value={amount} 
                          onChange={(e) => {
                            const val = e.target.value.replace(/[^0-9,.]/g, '');
                            setAmount(val);
                          }} 
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              const formatted = formatAmountValue(amount);
                              setAmount(formatted);
                              document.getElementById('payee-name-input')?.focus();
                            }
                          }}
                          onBlur={() => {
                            setAmount(formatAmountValue(amount));
                          }}
                          className="w-full pl-8 pr-4 py-2 border border-slate-200 rounded-xl text-xs font-semibold uppercase focus:outline-none focus:border-blue-500"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Nome do Favorecido (Quem recebe) *</label>
                    <input 
                      type="text" 
                      id="payee-name-input"
                      required
                      placeholder="Ex: Prof. José da Silva ou João dos Santos"
                      value={payeeName} 
                      onChange={(e) => setPayeeName(e.target.value)} 
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          document.getElementById('signature-label-input')?.focus();
                        }
                      }}
                      className="w-full px-4 py-2 border border-slate-200 rounded-xl text-xs font-semibold uppercase focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between items-center">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Documento de Identificação (Opcional)</label>
                      <span className="text-[9px] text-slate-400 font-bold">{signatureLabel.length}/30</span>
                    </div>
                    <input 
                      type="text" 
                      id="signature-label-input"
                      maxLength={30}
                      placeholder="Ex: CPF: 000.000.000-00 ou RG: 00.000.000-0"
                      value={signatureLabel} 
                      onChange={handleSignatureLabelChange} 
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          document.getElementById('description-input')?.focus();
                        }
                      }}
                      className="w-full px-4 py-2 border border-slate-200 rounded-xl text-xs font-semibold uppercase focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between items-center">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Descrição / Ao que se refere *</label>
                      <span className="text-[9px] text-slate-400 font-bold">{description.length}/150</span>
                    </div>
                    <textarea 
                      required
                      id="description-input"
                      rows={3}
                      maxLength={150}
                      placeholder="Ex: Aulas ministradas no módulo de Teologia Fundamental no semestre corrente ou Ajuda de custo pastoral."
                      value={description} 
                      onChange={(e) => {
                        const val = e.target.value;
                        const lines = val.split('\n');
                        if (lines.length <= 3) {
                          setDescription(val);
                        }
                      }} 
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          const lines = description.split('\n');
                          if (lines.length >= 3) {
                            e.preventDefault();
                            document.getElementById('payment-date-input')?.focus();
                          }
                        }
                      }}
                      className="w-full px-4 py-2 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-blue-500 uppercase"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Data do Pagamento *</label>
                      <input 
                        type="date" 
                        id="payment-date-input"
                        required
                        value={paymentDate} 
                        onChange={(e) => setPaymentDate(e.target.value)} 
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            document.getElementById('issue-date-input')?.focus();
                          }
                        }}
                        className="w-full px-4 py-2 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-blue-500"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Data de Emissão *</label>
                      <input 
                        type="date" 
                        id="issue-date-input"
                        required
                        value={issueDate} 
                        onChange={(e) => setIssueDate(e.target.value)} 
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            document.getElementById('save-receipt-button')?.focus();
                          }
                        }}
                        className="w-full px-4 py-2 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>

                  {/* Modal Controls / Submission Row */}
                  <div className="flex items-center justify-between gap-3 pt-4 border-t border-slate-100">
                    <button 
                      type="button"
                      tabIndex={-1}
                      onClick={handleCloseForm}
                      className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-[10px] uppercase tracking-widest transition-all flex items-center gap-1.5 active:scale-95 shrink-0"
                    >
                      <X size={12} /> Cancelar
                    </button>
                    
                    <div className="flex items-center gap-2 shrink-0">
                      {/* Save Only */}
                      <button 
                        type="button"
                        id="save-receipt-button"
                        disabled={isSaving}
                        onClick={() => handleSaveReceipt(null, 'save')}
                        className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl font-bold text-[10px] uppercase tracking-widest transition-all flex items-center gap-1.5 active:scale-95 disabled:opacity-50 shrink-0"
                      >
                        {isSaving ? <Loader2 className="animate-spin" size={12} /> : <><Save size={12} /> Salvar</>}
                      </button>

                      {/* Save & Print (Default submit) */}
                      <button 
                        type="button"
                        tabIndex={-1}
                        disabled={isSaving}
                        onClick={() => handleSaveReceipt(null, 'print')}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-[10px] uppercase tracking-widest transition-all flex items-center gap-1.5 active:scale-95 disabled:opacity-50 shadow-md shadow-blue-600/10 shrink-0"
                      >
                        {isSaving ? <Loader2 className="animate-spin" size={12} /> : <><Printer size={12} /> Imprimir</>}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Live Print Preview Pane */}
                <div className="hidden lg:flex lg:w-1/2 p-6 bg-slate-100 flex-col justify-between border-l border-slate-100 select-none overflow-y-auto">
                  <div className="space-y-4">
                    <h4 className="text-xs font-black text-slate-400 uppercase tracking-wider">Visualização em Tempo Real</h4>
                    
                    {/* Simulated Receipt paper */}
                    <div className="bg-white p-6 border border-slate-300 rounded-xl shadow-sm space-y-3 font-sans text-black relative">
                      {/* Header */}
                      <div className="border-b border-black pb-1.5 flex items-center justify-between gap-3">
                        {institution?.logo_url ? (
                          <div className="w-8 h-8 flex items-center justify-start shrink-0">
                            <img 
                              src={institution.logo_url} 
                              className="h-8 w-8 object-contain" 
                              referrerPolicy="no-referrer" 
                              alt="Logo"
                            />
                          </div>
                        ) : (
                          <div className="w-8 h-8 shrink-0" />
                        )}
                        <div className="flex-1 text-center">
                          <p className="text-[8px] font-black tracking-widest text-slate-500 uppercase">MITRA DIOCESANA DE GUARULHOS</p>
                          <h4 className="text-[10px] font-bold uppercase leading-tight">{institution?.name || 'ESCOLA DIOCESANA DE MINISTÉRIOS'}</h4>
                          {institution?.subtitle && <p className="text-[8px] font-medium text-slate-400 uppercase leading-none mt-0.5">{institution.subtitle}</p>}
                        </div>
                        <div className="w-8 shrink-0" />
                      </div>

                      {/* Num & Value row */}
                      <div className="flex justify-between items-start text-[10px] font-bold pt-0.5">
                        <span>Recibo Nº: {receiptNumber || '---'}</span>
                        <span className="px-1.5 py-0.5 bg-slate-50 border border-slate-200">
                          {amount ? formatCurrency(parseFloat(amount.replace(',', '.')) || 0) : 'R$ 0,00'}
                        </span>
                      </div>

                      {/* Title */}
                      <h3 className="text-center font-black uppercase text-[10px] tracking-widest leading-none">Recibo de Pagamento</h3>

                      {/* Description Paragraph */}
                      <p className="text-[9px] leading-relaxed text-justify text-slate-800 break-words whitespace-pre-wrap">
                        Recebi da <span className="font-bold">{institution?.name || 'ESCOLA DIOCESANA DE MINISTÉRIOS'}</span>
                        {institution?.cnpj ? `, CNPJ Nº ${institution.cnpj}` : ''}
                        , a importância de <span className="font-bold">{amount ? formatCurrency(parseFloat(amount.replace(',', '.')) || 0) : 'R$ 0,00'}</span> ({amount ? numberToPortugueseWords(parseFloat(amount.replace(',', '.')) || 0) : 'zero reais'}) referente a <span className="font-bold">{description || '...'}</span>.
                      </p>

                      {/* Date line */}
                      <p className="text-right text-[8px] font-bold uppercase tracking-wider">
                        {institution?.city_uf ? institution.city_uf.split('/')[0] : 'GUARULHOS'}, {paymentDate ? formatLongDate(paymentDate) : '---'}.
                      </p>

                      {/* Signature block */}
                      <div className="pt-3 text-center space-y-0.5">
                        <div className="w-1/2 mx-auto border-b border-black"></div>
                        <p className="text-[9px] font-black uppercase tracking-wider">{payeeName || 'NOME DO FAVORECIDO'}</p>
                        {signatureLabel && (
                          <p className="text-[7px] text-slate-400 font-bold uppercase">{signatureLabel}</p>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="text-[9px] text-emerald-700 font-bold bg-emerald-50 px-3 py-2.5 rounded-xl border border-emerald-100 flex items-center gap-2 mt-4 leading-normal">
                    <CheckCircle2 size={12} className="shrink-0 text-emerald-600" />
                    <span>Selecione "Emitir & Imprimir" ou "PDF" acima para salvar e iniciar a impressão imediatamente.</span>
                  </div>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deleteConfirmationFor && (
          <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm flex items-center justify-center p-4 z-[200]">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white border border-slate-200 rounded-[2rem] shadow-2xl max-w-md w-full p-6 space-y-4"
            >
              <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center">
                <AlertCircle size={24} />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">Confirmar Exclusão</h3>
                <p className="text-xs text-slate-500 font-medium leading-relaxed">
                  Tem certeza que deseja excluir o recibo <span className="font-bold text-slate-800">Nº {deleteConfirmationFor.receipt_number}</span> de <span className="font-bold text-slate-800">{deleteConfirmationFor.payee_name}</span> no valor de {formatCurrency(deleteConfirmationFor.amount)}? Esta operação é irreversível.
                </p>
              </div>
              <div className="flex gap-3 pt-2">
                <button 
                  onClick={() => setDeleteConfirmationFor(null)}
                  className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-[10px] uppercase tracking-widest transition-all"
                >
                  Cancelar
                </button>
                <button 
                  onClick={() => handleDeleteReceipt(deleteConfirmationFor.id)}
                  className="flex-1 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold text-[10px] uppercase tracking-widest transition-all active:scale-95 shadow-lg shadow-rose-600/10"
                >
                  Confirmar Exclusão
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Copies Selection Modal */}
      <AnimatePresence>
        {copiesModal.isOpen && copiesModal.receipt && (
          <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm flex items-center justify-center p-4 z-[200]">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white border border-slate-100 rounded-[2rem] shadow-2xl max-w-md w-full p-6 space-y-5"
            >
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center">
                  <Printer size={24} />
                </div>
                <div className="space-y-0.5">
                  <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">Como deseja emitir o recibo?</h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase">Recibo Nº {copiesModal.receipt.receipt_number}</p>
                </div>
              </div>

              <p className="text-xs text-slate-500 font-medium leading-relaxed">
                Escolha a quantidade de vias para gerar o documento de <span className="font-semibold text-slate-700">{copiesModal.receipt.payee_name}</span> no valor de <span className="font-semibold text-slate-700">{formatCurrency(copiesModal.receipt.amount)}</span>:
              </p>

              <div className="grid grid-cols-1 gap-3">
                {/* 1 Copy Button */}
                <button 
                  onClick={() => {
                    if (copiesModal.receipt) {
                      generatePDF(copiesModal.receipt, copiesModal.action, 1);
                      setCopiesModal({ isOpen: false, receipt: null, action: 'download' });
                    }
                  }}
                  className="flex items-start gap-4 p-4 rounded-2xl border border-slate-100 hover:border-blue-500 hover:bg-blue-50/10 text-left transition-all active:scale-[0.98] group"
                >
                  <div className="p-2.5 bg-slate-50 group-hover:bg-blue-50 text-slate-500 group-hover:text-blue-600 rounded-xl transition-colors shrink-0">
                    <FileText size={20} />
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                      1 Via <span className="text-[9px] font-bold bg-slate-100 text-slate-600 py-0.5 px-2 rounded-md">Meia Página</span>
                    </h4>
                    <p className="text-[10px] text-slate-500 leading-normal font-medium">
                      Gera uma única via ocupando exatamente a metade superior de uma folha A4 retrato.
                    </p>
                  </div>
                </button>

                {/* 2 Copies Button */}
                <button 
                  onClick={() => {
                    if (copiesModal.receipt) {
                      generatePDF(copiesModal.receipt, copiesModal.action, 2);
                      setCopiesModal({ isOpen: false, receipt: null, action: 'download' });
                    }
                  }}
                  className="flex items-start gap-4 p-4 rounded-2xl border border-slate-100 hover:border-blue-500 hover:bg-blue-50/10 text-left transition-all active:scale-[0.98] group"
                >
                  <div className="p-2.5 bg-slate-50 group-hover:bg-blue-50 text-slate-500 group-hover:text-blue-600 rounded-xl transition-colors shrink-0">
                    <Copy size={20} />
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                      2 Vias <span className="text-[9px] font-bold bg-blue-50 text-blue-600 py-0.5 px-2 rounded-md">Página Inteira</span>
                    </h4>
                    <p className="text-[10px] text-slate-500 leading-normal font-medium">
                      Gera duas vias idênticas (Beneficiário e Arquivo) na mesma folha A4 com linha tracejada para recorte no meio.
                    </p>
                  </div>
                </button>
              </div>

              <div className="flex gap-3 pt-2">
                <button 
                  onClick={() => setCopiesModal({ isOpen: false, receipt: null, action: 'download' })}
                  className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-[10px] uppercase tracking-widest transition-all"
                >
                  Cancelar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
