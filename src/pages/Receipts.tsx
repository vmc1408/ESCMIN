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
  ChevronLeft 
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
  const [receiptNumber, setReceiptNumber] = useState('');
  const [amount, setAmount] = useState('');
  const [payeeName, setPayeeName] = useState('');
  const [description, setDescription] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [signatureLabel, setSignatureLabel] = useState('');
  const [issueDate, setIssueDate] = useState(new Date().toISOString().split('T')[0]);

  // Print/Preview State
  const [selectedReceipt, setSelectedReceipt] = useState<Receipt | null>(null);
  const [isPrinting, setIsPrinting] = useState(false);
  const [deleteConfirmationFor, setDeleteConfirmationFor] = useState<Receipt | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  useEffect(() => {
    fetchInitialData();
  }, []);

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
    if (showAddForm) {
      const numbers = receipts.map(r => parseInt(r.receipt_number)).filter(n => !isNaN(n));
      const nextNum = numbers.length > 0 ? Math.max(...numbers) + 1 : 1;
      setReceiptNumber(String(nextNum));
    }
  }, [showAddForm, receipts]);

  const handleSaveReceipt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!receiptNumber || !amount || !payeeName || !description) {
      setNotification({ type: 'error', message: 'Por favor, preencha todos os campos obrigatórios.' });
      return;
    }

    setIsSaving(true);
    try {
      const newReceipt: Partial<Receipt> = {
        receipt_number: receiptNumber.trim(),
        amount: parseFloat(amount.replace(',', '.')),
        payee_name: payeeName.trim(),
        description: description.trim(),
        payment_date: paymentDate,
        signature_label: signatureLabel.trim() || undefined,
        issue_date: issueDate,
        user_id: user?.uid
      };

      await saveData('receipts', undefined, newReceipt);
      setNotification({ type: 'success', message: 'Recibo gerado com sucesso!' });
      
      // Reset form and reload
      setShowAddForm(false);
      setAmount('');
      setPayeeName('');
      setDescription('');
      setSignatureLabel('');
      setPaymentDate(new Date().toISOString().split('T')[0]);
      setIssueDate(new Date().toISOString().split('T')[0]);
      
      fetchInitialData();
    } catch (err: any) {
      console.error('Error saving receipt:', err);
      setNotification({ type: 'error', message: 'Erro ao gerar recibo: ' + err.message });
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

  const generatePDF = (receipt: Receipt) => {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    // Outer Border
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.5);
    doc.rect(10, 10, 190, 130);

    // Header logo placeholder or basic layout
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text('MITRA DIOCESANA DE GUARULHOS', 105, 20, { align: 'center' });
    doc.setFontSize(11);
    doc.text(institution?.name || 'ESCOLA DIOCESANA DE MINISTÉRIOS', 105, 26, { align: 'center' });
    
    if (institution?.subtitle) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text(institution.subtitle, 105, 31, { align: 'center' });
    }

    if (institution?.address) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.text(institution.address, 105, 36, { align: 'center' });
    }

    // Border line below header
    doc.setLineWidth(0.2);
    doc.line(15, 42, 195, 42);

    // Receipt number & value block
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(`Recibo Nº: ${receipt.receipt_number}`, 150, 49);
    doc.text(formatCurrency(receipt.amount), 150, 54);

    // Title
    doc.setFontSize(14);
    doc.text('Recibo de Pagamento', 105, 62, { align: 'center' });

    // Body text
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10.5);
    
    const amountInWords = numberToPortugueseWords(receipt.amount);
    const institutionName = institution?.name || 'ESCOLA DIOCESANA DE MINISTÉRIOS';
    const institutionCNPJ = institution?.cnpj ? `CNPJ Nº ${institution.cnpj}` : '';
    const institutionAddress = institution?.address || '';
    
    const bodyText = `Recebi da ${institutionName}, ${institutionCNPJ}, ${institutionAddress} a importância de ${formatCurrency(receipt.amount)} (${amountInWords}) referente a ${receipt.description}.`;
    
    const splitText = doc.splitTextToSize(bodyText, 170);
    doc.text(splitText, 20, 72);

    // Date
    const city = institution?.city_uf ? institution.city_uf.split('/')[0] : 'GUARULHOS';
    const paymentDateFormatted = formatLongDate(receipt.payment_date);
    doc.text(`${city.toUpperCase()}, ${paymentDateFormatted}.`, 190, 102, { align: 'right' });

    // Signature Line
    doc.line(55, 118, 155, 118);
    doc.setFont('helvetica', 'bold');
    doc.text(receipt.payee_name.toUpperCase(), 105, 123, { align: 'center' });
    
    if (receipt.signature_label) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.text(receipt.signature_label.toUpperCase(), 105, 127, { align: 'center' });
    }

    // Emission Date
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    const issueDateFormatted = safeFormat(receipt.issue_date, 'dd/MM/yyyy');
    doc.text(`Emissão em ${issueDateFormatted}`, 190, 134, { align: 'right' });

    doc.save(`Recibo_N_${receipt.receipt_number}.pdf`);
    setNotification({ type: 'success', message: 'PDF do recibo baixado com sucesso!' });
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
          onClick={() => setShowAddForm(true)}
          className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs uppercase tracking-widest transition-all flex items-center gap-2 active:scale-95 shadow-lg"
        >
          <Plus size={16} /> Novo Recibo
        </button>
      </div>

      {/* Content Area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Receipt List */}
        <div className="lg:col-span-2 space-y-4">
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
                          onClick={() => generatePDF(receipt)}
                          className="p-2 hover:bg-slate-100 text-slate-600 rounded-lg transition-colors"
                          title="Baixar PDF"
                        >
                          <FileDown size={16} />
                        </button>
                        <button 
                          onClick={() => {
                            setSelectedReceipt(receipt);
                            setTimeout(() => {
                              try {
                                window.print();
                              } catch (err) {
                                console.error(err);
                              }
                            }, 100);
                          }}
                          className="p-2 hover:bg-slate-100 text-slate-600 rounded-lg transition-colors"
                          title="Imprimir"
                        >
                          <Printer size={16} />
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
        <div className="lg:col-span-1">
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
                  <div className="text-center border-b border-black pb-2">
                    <p className="text-[10px] font-black tracking-widest text-slate-600 uppercase">MITRA DIOCESANA DE GUARULHOS</p>
                    <h4 className="text-xs font-bold uppercase">{institution?.name || 'ESCOLA DIOCESANA DE MINISTÉRIOS'}</h4>
                    {institution?.subtitle && <p className="text-[9px] font-medium text-slate-500 uppercase leading-none mt-0.5">{institution.subtitle}</p>}
                    {institution?.address && <p className="text-[8px] text-slate-400 mt-1 leading-none">{institution.address}</p>}
                  </div>

                  {/* Num & Value row */}
                  <div className="flex justify-between items-start text-xs font-bold pt-1">
                    <span>Recibo Nº: {selectedReceipt.receipt_number}</span>
                    <span className="px-2 py-0.5 bg-slate-100 border border-slate-300">{formatCurrency(selectedReceipt.amount)}</span>
                  </div>

                  {/* Title */}
                  <h3 className="text-center font-black uppercase text-sm tracking-widest py-1">Recibo de Pagamento</h3>

                  {/* Description Paragraph */}
                  <p className="text-[10px] leading-relaxed text-justify">
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
                    onClick={() => generatePDF(selectedReceipt)}
                    className="flex-1 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl font-bold text-[10px] uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-1.5"
                  >
                    <Download size={14} /> PDF
                  </button>
                  <button 
                    onClick={() => {
                      try {
                        window.print();
                      } catch (err) {
                        console.error(err);
                      }
                    }}
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
          <div className="text-center border-b border-black pb-2">
            <p className="text-[10px] font-black tracking-widest text-slate-600 uppercase">MITRA DIOCESANA DE GUARULHOS</p>
            <h4 className="text-xs font-bold uppercase">{institution?.name || 'ESCOLA DIOCESANA DE MINISTÉRIOS'}</h4>
            {institution?.subtitle && <p className="text-[9px] font-medium text-slate-500 uppercase leading-none mt-0.5">{institution.subtitle}</p>}
            {institution?.address && <p className="text-[8px] text-slate-400 mt-1 leading-none">{institution.address}</p>}
          </div>

          {/* Num & Value row */}
          <div className="flex justify-between items-start text-xs font-bold pt-1">
            <span>Recibo Nº: {selectedReceipt.receipt_number}</span>
            <span className="px-2 py-0.5 bg-slate-100 border border-slate-300">{formatCurrency(selectedReceipt.amount)}</span>
          </div>

          {/* Title */}
          <h3 className="text-center font-black uppercase text-sm tracking-widest py-1">Recibo de Pagamento</h3>

          {/* Description Paragraph */}
          <p className="text-[10px] leading-relaxed text-justify">
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
              className="bg-white border border-slate-200 rounded-[2.5rem] shadow-2xl max-w-xl w-full overflow-hidden flex flex-col my-8"
            >
              <div className="p-6 bg-slate-900 text-white flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-white/10 rounded-xl">
                    <FileText size={20} />
                  </div>
                  <div>
                    <h3 className="text-sm font-black uppercase tracking-wider">Novo Recibo de Pagamento</h3>
                    <p className="text-[10px] text-slate-400 uppercase tracking-widest leading-none mt-0.5">Preencha o formulário para emitir</p>
                  </div>
                </div>
                <button onClick={() => setShowAddForm(false)} className="p-2 hover:bg-white/10 rounded-xl text-slate-300 transition-colors">
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleSaveReceipt} className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Número do Recibo *</label>
                    <input 
                      type="text" 
                      required
                      value={receiptNumber} 
                      onChange={(e) => setReceiptNumber(e.target.value)} 
                      className="w-full px-4 py-2 border border-slate-200 rounded-xl text-xs font-semibold uppercase focus:outline-none focus:border-blue-500 bg-slate-50"
                    />
                  </div>
                  
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Valor do Recibo (R$) *</label>
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                      <input 
                        type="text" 
                        required
                        placeholder="0,00"
                        value={amount} 
                        onChange={(e) => {
                          // Allow only numbers and commas
                          const val = e.target.value.replace(/[^0-9,.]/g, '');
                          setAmount(val);
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
                    required
                    placeholder="Ex: Prof. José da Silva ou João dos Santos"
                    value={payeeName} 
                    onChange={(e) => setPayeeName(e.target.value)} 
                    className="w-full px-4 py-2 border border-slate-200 rounded-xl text-xs font-semibold uppercase focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Descrição / Ao que se refere *</label>
                  <textarea 
                    required
                    rows={2}
                    placeholder="Ex: Aulas ministradas no módulo de Teologia Fundamental no semestre corrente ou Ajuda de custo pastoral."
                    value={description} 
                    onChange={(e) => setDescription(e.target.value)} 
                    className="w-full px-4 py-2 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-blue-500 uppercase"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Data do Pagamento *</label>
                    <input 
                      type="date" 
                      required
                      value={paymentDate} 
                      onChange={(e) => setPaymentDate(e.target.value)} 
                      className="w-full px-4 py-2 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Data de Emissão *</label>
                    <input 
                      type="date" 
                      required
                      value={issueDate} 
                      onChange={(e) => setIssueDate(e.target.value)} 
                      className="w-full px-4 py-2 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Subtítulo da Assinatura (Opcional)</label>
                  <input 
                    type="text" 
                    placeholder=""
                    value={signatureLabel} 
                    onChange={(e) => setSignatureLabel(e.target.value)} 
                    className="w-full px-4 py-2 border border-slate-200 rounded-xl text-xs font-semibold uppercase focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                  <button 
                    type="button"
                    onClick={() => setShowAddForm(false)}
                    className="px-6 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs uppercase tracking-widest transition-all"
                  >
                    Cancelar
                  </button>
                  <button 
                    type="submit"
                    disabled={isSaving}
                    className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs uppercase tracking-widest transition-all flex items-center gap-2 active:scale-95 shadow-lg disabled:opacity-50"
                  >
                    {isSaving ? <Loader2 className="animate-spin" size={14} /> : 'Emitir Recibo'}
                  </button>
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
    </div>
  );
}
