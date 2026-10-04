import React, { useState, useEffect } from 'react';
import { X, Printer, Download, CheckCircle2, Copy, FileText } from 'lucide-react';
import { formatCurrency, formatDateForDisplay, numberToPortugueseWords, formatRegistrationNumber, cn, safeFormat } from '../lib/utils';
import { Student, Class } from '../types';
import { jsPDF } from 'jspdf';
import { DEFAULT_LOGO } from '../lib/default-logo';
import { getInstitutionSettings } from '../lib/database';

interface EnrollmentReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  student: Student | null;
  classItem?: Class | null;
  institution?: any;
  feeAmount: number;
  feeStatus: 'paid' | 'pending' | 'exempt';
  paymentMethod?: string;
  paymentDate?: string;
  observations?: string;
  unitName?: string;
  isNew?: boolean;
}

export const EnrollmentReceiptModal: React.FC<EnrollmentReceiptModalProps> = ({
  isOpen,
  onClose,
  student,
  classItem,
  institution,
  feeAmount,
  feeStatus,
  paymentMethod = 'PIX',
  paymentDate,
  observations,
  unitName,
  isNew = false
}) => {
  const [copies, setCopies] = useState<1 | 2>(2);
  const [instSettings, setInstSettings] = useState<any>(institution || null);

  useEffect(() => {
    if (institution) {
      setInstSettings(institution);
    } else {
      getInstitutionSettings()
        .then((data) => {
          if (data) setInstSettings(data);
        })
        .catch((err) => console.warn('Não foi possível carregar dados da instituição:', err));
    }
  }, [institution]);

  if (!isOpen || !student) return null;

  const currentYear = classItem?.start_year || new Date().getFullYear();
  const rawReg = (student.registration_number || student.id.slice(0, 6)).replace(/\//g, '');
  const receiptNumber = `MAT-${rawReg}-${currentYear}`;
  const effectivePaymentDate = paymentDate || new Date().toISOString().split('T')[0];

  const dioceseTitle = instSettings?.city_uf 
    ? `DIOCESE DE ${instSettings.city_uf.split('/')[0].toUpperCase()}`
    : 'DIOCESE DE GUARULHOS';
  const instName = (instSettings?.name || 'ESCOLA DIOCESANA DE MINISTÉRIO').toUpperCase();
  const instSubtitle = (instSettings?.subtitle || 'PE. JOSÉ FERNANDO DE BRITO').toUpperCase();
  const instAddress = instSettings?.address || 'Av. Venus, 195 - Itapegica - Guarulhos - CEP 07044-170';
  const instLogo = instSettings?.logo_url || DEFAULT_LOGO;

  const handleDownloadPDF = () => {
    try {
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });
      const pageWidth = doc.internal.pageSize.width;
      const margin = 12;

      const drawSingleVia = (startY: number, viaLabel: string) => {
        const boxHeight = copies === 1 ? 138 : 132;

        // Moldura externa
        doc.setDrawColor(200, 210, 225);
        doc.setLineWidth(0.3);
        doc.rect(margin, startY, pageWidth - margin * 2, boxHeight);

        // Logo
        let logoWidth = 0;
        try {
          doc.addImage(instLogo, 'auto', margin + 3, startY + 3, 16, 16);
          logoWidth = 20;
        } catch (e) {
          try {
            doc.addImage(DEFAULT_LOGO, 'PNG', margin + 3, startY + 3, 16, 16);
            logoWidth = 20;
          } catch (e2) {}
        }

        const textStartX = margin + logoWidth + 2;

        // Cabeçalho Institucional
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(7);
        doc.setFont('helvetica', 'bold');
        doc.text(dioceseTitle, textStartX, startY + 5);

        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0, 23, 75); // #00174b
        doc.text(instName, textStartX, startY + 10);

        doc.setFontSize(7.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(80, 80, 80);
        doc.text(instSubtitle, textStartX, startY + 14);

        const contactInfo = [
          instAddress,
          instSettings?.phone ? `TEL: ${instSettings.phone}` : '',
          instSettings?.email ? `EMAIL: ${instSettings.email.toLowerCase()}` : ''
        ].filter(Boolean).join('  |  ');
        doc.setFontSize(6);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100, 100, 100);
        doc.text(contactInfo.slice(0, 95), textStartX, startY + 17.5);

        // Etiqueta da Via (Canto superior direito)
        doc.setFontSize(7.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(100, 116, 139);
        doc.text(viaLabel.toUpperCase(), pageWidth - margin - 3, startY + 6, { align: 'right' });

        // Divisória do Cabeçalho
        doc.setDrawColor(0, 23, 75);
        doc.setLineWidth(0.4);
        doc.line(margin + 2, startY + 20, pageWidth - margin - 2, startY + 20);

        // Título Central
        doc.setFontSize(9.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0, 23, 75);
        doc.text('RECIBO DE MATRÍCULA E INSCRIÇÃO', pageWidth / 2, startY + 25, { align: 'center' });

        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(80, 80, 80);
        doc.text(`Nº: ${receiptNumber}    DATA: ${formatDateForDisplay(new Date().toISOString())}`, pageWidth / 2, startY + 29, { align: 'center' });

        // Box Identificação do Aluno
        doc.setFillColor(248, 250, 252);
        doc.rect(margin + 2, startY + 31, pageWidth - margin * 2 - 4, 15, 'F');
        doc.setDrawColor(220, 226, 235);
        doc.rect(margin + 2, startY + 31, pageWidth - margin * 2 - 4, 15, 'S');
        // Faixa azul lateral
        doc.setFillColor(37, 99, 235); // blue-600
        doc.rect(margin + 2, startY + 31, 1.5, 15, 'F');

        doc.setFontSize(6.5);
        doc.setTextColor(100, 100, 100);
        doc.text('MATRÍCULA / ALUNO(A):', margin + 5, startY + 35);
        doc.setFontSize(8.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0, 23, 75);
        doc.text(`${formatRegistrationNumber(student.registration_number)} - ${student.name.toUpperCase()}`, margin + 5, startY + 39.5);

        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(60, 60, 60);
        const docLine = [
          `CPF: ${student.cpf || 'Não informado'}`,
          `RG: ${student.rg || 'Não informado'}`,
          unitName ? `Polo / Unidade: ${unitName}` : ''
        ].filter(Boolean).join('    ');
        doc.text(docLine, margin + 5, startY + 43.5);

        // Box Turma / Curso
        doc.setFillColor(241, 245, 249);
        doc.rect(margin + 2, startY + 48, pageWidth - margin * 2 - 4, 12, 'F');
        doc.setDrawColor(220, 226, 235);
        doc.rect(margin + 2, startY + 48, pageWidth - margin * 2 - 4, 12, 'S');

        const courseName = classItem?.course || student.course || 'Curso Teológico';
        const className = classItem?.name || 'Turma Regular';
        doc.setFontSize(6.5);
        doc.setTextColor(100, 100, 100);
        doc.text('DADOS ACADÊMICOS:', margin + 4, startY + 52);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0, 23, 75);
        doc.text(`${courseName.toUpperCase()} — TURMA: ${className} (${classItem?.period || 'Regular'})`, margin + 4, startY + 56.5);

        // Box Financeiro da Taxa de Matrícula
        doc.setFillColor(236, 253, 245); // emerald-50
        doc.rect(margin + 2, startY + 62, pageWidth - margin * 2 - 4, 25, 'F');
        doc.setDrawColor(167, 243, 208); // emerald-200
        doc.rect(margin + 2, startY + 62, pageWidth - margin * 2 - 4, 25, 'S');

        const statusLabel = feeStatus === 'paid' ? '✓ QUITADO' : feeStatus === 'exempt' ? 'ISENTO' : 'PENDENTE';
        doc.setFontSize(7.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(6, 78, 59); // emerald-900
        doc.text('DETALHAMENTO DA TAXA DE MATRÍCULA', margin + 4, startY + 67);
        doc.text(statusLabel, pageWidth - margin - 5, startY + 67, { align: 'right' });

        doc.setFontSize(10.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0, 23, 75);
        doc.text(formatCurrency(feeAmount), margin + 4, startY + 74);

        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(50, 50, 50);
        doc.text(`Extenso: ${numberToPortugueseWords(feeAmount)}`, margin + 4, startY + 78);
        doc.text(`Forma de Pagamento: ${paymentMethod.toUpperCase()}    Data Quitação: ${formatDateForDisplay(effectivePaymentDate)}`, margin + 4, startY + 82);

        if (observations) {
          doc.text(`Obs: ${observations}`, margin + 4, startY + 85.5);
        }

        // Mensagem / Aviso do Recibo
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(6.5);
        doc.setTextColor(100, 100, 100);
        const msgText = instSettings?.receipt_message || 'Inscrição e matrícula confirmadas com gratidão. O(a) aluno(a) declara estar de acordo com o regimento escolar diocesano.';
        doc.text(msgText, pageWidth / 2, startY + 95, { align: 'center' });

        // Linhas de Assinaturas
        const sigY = startY + 114;
        doc.setDrawColor(160, 160, 160);
        doc.setLineWidth(0.3);
        doc.line(margin + 12, sigY, margin + 75, sigY);
        doc.line(pageWidth - margin - 75, sigY, pageWidth - margin - 12, sigY);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.5);
        doc.setTextColor(60, 60, 60);
        doc.text('ASSINATURA DO ALUNO(A)', margin + 43.5, sigY + 3.5, { align: 'center' });
        doc.text('SECRETARIA ACADÊMICA / RESPONSÁVEL', pageWidth - margin - 43.5, sigY + 3.5, { align: 'center' });

        // Rodapé da Via
        doc.setFontSize(5.5);
        doc.setTextColor(160, 160, 160);
        doc.text(`DOCUMENTO EMITIDO VIA SISTEMA DIOCESANO • ${instName}`, pageWidth / 2, startY + 128, { align: 'center' });
      };

      if (copies === 1) {
        drawSingleVia(15, 'VIA ÚNICA - ALUNO(A)');
      } else {
        // 1ª Via: Escola / Secretaria
        drawSingleVia(6, '1ª VIA - ESCOLA / SECRETARIA');

        // Linha tracejada divisória central para recorte
        doc.setDrawColor(120, 120, 120);
        doc.setLineWidth(0.3);
        (doc as any).setLineDash([2, 2], 0);
        doc.line(0, 148.5, pageWidth, 148.5);
        (doc as any).setLineDash([], 0);

        doc.setFontSize(6);
        doc.setTextColor(120, 120, 120);
        doc.text('- - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  CORTE AQUI  - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -', pageWidth / 2, 148, { align: 'center' });

        // 2ª Via: Aluno
        drawSingleVia(154, '2ª VIA - ALUNO(A)');
      }

      const safeStudentName = student.name.replace(/\s+/g, '_');
      doc.save(`Recibo_Matricula_${safeStudentName}_${copies}Vias.pdf`);
    } catch (err) {
      console.error('Erro ao gerar PDF do recibo de matrícula:', err);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const viasToRender = copies === 1 ? [1] : [1, 2];

  return (
    <div className="fixed inset-0 z-[250] flex items-center justify-center p-2 sm:p-4 bg-slate-950/70 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-200">
      {/* CSS para Impressão Perfeita na Página A4 */}
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          @page {
            size: A4 portrait;
            margin: 6mm 8mm 6mm 8mm !important;
          }
          body * {
            visibility: hidden !important;
          }
          #printable-enrollment-receipt, #printable-enrollment-receipt * {
            visibility: visible !important;
          }
          #printable-enrollment-receipt {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
          }
        }
      `}} />

      <div className="bg-white rounded-none border border-slate-300 shadow-2xl max-w-4xl w-full my-auto overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[95vh]">
        {/* Banner de Sucesso quando recém cadastrado */}
        {isNew && (
          <div className="bg-emerald-600 text-white px-4 py-2 text-xs font-bold uppercase tracking-wider flex items-center justify-between shrink-0">
            <span className="flex items-center gap-2">
              <CheckCircle2 size={16} />
              Aluno Inscrito e Taxa de Matrícula Registrada com Sucesso!
            </span>
            <span className="text-[10px] bg-emerald-700 px-2 py-0.5 rounded">Novo Aluno</span>
          </div>
        )}

        {/* Modal Top Bar */}
        <div className="px-5 py-3 bg-[#00174b] text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <FileText size={18} className="text-amber-400" />
            <h3 className="text-sm font-black uppercase tracking-wider">
              Recibo de Matrícula e Inscrição
            </h3>
          </div>

          {/* Opção de 1 ou 2 Vias (padrão Contribuições) */}
          <div className="flex items-center gap-1.5 bg-slate-900/80 p-1 border border-white/20">
            <span className="text-[10px] font-bold text-slate-300 uppercase px-2 hidden sm:inline">
              Vias:
            </span>
            <button
              type="button"
              onClick={() => setCopies(1)}
              className={cn(
                "px-3 py-1 text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1",
                copies === 1
                  ? "bg-amber-500 text-white shadow-xs"
                  : "text-slate-300 hover:text-white hover:bg-white/10"
              )}
            >
              <FileText size={12} />
              <span>1 Via</span>
            </button>
            <button
              type="button"
              onClick={() => setCopies(2)}
              className={cn(
                "px-3 py-1 text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1",
                copies === 2
                  ? "bg-amber-500 text-white shadow-xs"
                  : "text-slate-300 hover:text-white hover:bg-white/10"
              )}
            >
              <Copy size={12} />
              <span>2 Vias</span>
            </button>
          </div>

          <button
            onClick={onClose}
            className="p-1 hover:bg-white/10 text-slate-300 hover:text-white transition-colors cursor-pointer ml-2"
            title="Fechar"
          >
            <X size={18} />
          </button>
        </div>

        {/* Área do Recibo Rolável no Modal */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 bg-slate-100/70">
          <div id="printable-enrollment-receipt" className="space-y-4">
            {viasToRender.map((via) => (
              <React.Fragment key={via}>
                <div className="bg-white border-2 border-slate-300 p-4 sm:p-5 shadow-xs relative overflow-hidden break-inside-avoid">
                  {/* Cabeçalho Institucional Padrão Contribuição */}
                  <div className="flex items-start justify-between relative mb-2 pb-2 border-b border-slate-200">
                    <div className="flex items-center gap-4">
                      {/* Logotipo da Instituição */}
                      <div className="w-14 h-14 sm:w-16 sm:h-16 flex items-center justify-center shrink-0">
                        <img
                          src={instLogo}
                          alt="Logotipo"
                          className="w-full h-full object-contain"
                          referrerPolicy="no-referrer"
                          onError={(e) => {
                            if ((e.currentTarget as HTMLImageElement).src !== DEFAULT_LOGO) {
                              (e.currentTarget as HTMLImageElement).src = DEFAULT_LOGO;
                            }
                          }}
                        />
                      </div>

                      {/* Dados Institucionais */}
                      <div className="space-y-0.5">
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest leading-none">
                          {dioceseTitle}
                        </p>
                        <h4 className="text-base sm:text-lg font-black text-[#00174b] uppercase tracking-tight leading-tight">
                          {instName}
                        </h4>
                        <p className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">
                          {instSubtitle}
                        </p>
                        <p className="text-[9px] text-slate-500 font-medium max-w-xl leading-relaxed">
                          {instAddress}
                        </p>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[8.5px] text-slate-400 font-bold uppercase tracking-wider">
                          {instSettings?.phone && <span>TEL: {instSettings.phone}</span>}
                          {instSettings?.email && <span className="lowercase">EMAIL: {instSettings.email.toLowerCase()}</span>}
                        </div>
                      </div>
                    </div>

                    {/* Identificador da Via no Canto Superior Direito */}
                    <div className="text-right shrink-0">
                      <span className="inline-block px-2.5 py-1 bg-slate-100 text-slate-700 border border-slate-300 text-[10px] font-black uppercase tracking-wider">
                        {via === 1
                          ? copies === 1
                            ? 'VIA ÚNICA - ALUNO'
                            : 'VIA 1 - ESCOLA / SECRETARIA'
                          : 'VIA 2 - ALUNO'}
                      </span>
                    </div>
                  </div>

                  {/* Título Centralizado do Recibo */}
                  <div className="text-center mb-3">
                    <h2 className="text-sm sm:text-base font-black text-[#00174b] uppercase tracking-[0.2em] inline-block border-b-2 border-[#00174b] pb-0.5">
                      Recibo de Matrícula e Inscrição
                    </h2>
                    <div className="flex items-center justify-between text-xs text-slate-600 font-mono mt-1 pt-1 px-1">
                      <span>Nº: <strong className="text-slate-900">{receiptNumber}</strong></span>
                      <span>Data de Emissão: <strong className="text-slate-900">{formatDateForDisplay(new Date().toISOString())}</strong></span>
                    </div>
                  </div>

                  {/* Identificação do Aluno (Box com faixa lateral azul padrão Contribuições) */}
                  <div className="bg-slate-50 p-3 border border-slate-200 relative overflow-hidden mb-3">
                    <div className="absolute left-0 top-0 w-1.5 h-full bg-blue-600"></div>
                    <div className="grid grid-cols-12 gap-2 text-xs">
                      <div className="col-span-12 sm:col-span-8">
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">
                          Matrícula / Aluno(a)
                        </p>
                        <p className="text-sm font-black text-[#00174b] uppercase">
                          {formatRegistrationNumber(student.registration_number)} - {student.name}
                        </p>
                      </div>
                      <div className="col-span-12 sm:col-span-4 sm:text-right">
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">
                          Situação do Registro
                        </p>
                        <span className="inline-block px-2 py-0.5 bg-blue-100 text-blue-900 font-bold text-[10px] uppercase">
                          {student.status || 'Ativo'}
                        </span>
                      </div>
                      <div className="col-span-12 pt-1 border-t border-slate-200/70 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-600">
                        <span>CPF: <strong className="text-slate-800">{student.cpf || 'Não informado'}</strong></span>
                        <span>RG: <strong className="text-slate-800">{student.rg || 'Não informado'}</strong></span>
                        {unitName && <span>Polo / Unidade: <strong className="text-slate-800">{unitName}</strong></span>}
                      </div>
                    </div>
                  </div>

                  {/* Dados da Turma / Formação Acadêmica */}
                  <div className="bg-blue-50/60 p-2.5 border border-blue-200 text-xs text-blue-950 mb-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[9px] font-black text-blue-800 uppercase tracking-wider">
                        Dados Acadêmicos e Turma Vinculada
                      </span>
                      <span className="text-[10px] font-bold text-blue-900">
                        Ano Letivo: {currentYear}
                      </span>
                    </div>
                    <p className="text-xs sm:text-sm font-black uppercase text-blue-950">
                      {classItem?.course || student.course || 'Curso Regular'}
                    </p>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-blue-900 pt-0.5">
                      <span>Turma: <strong>{classItem?.name || 'Turma Vinculada'}</strong></span>
                      <span>Turno: <strong>{classItem?.period || 'Regular'}</strong></span>
                      <span>Início das Aulas: <strong>{classItem?.start_date ? formatDateForDisplay(classItem.start_date) : 'Conforme cronograma'}</strong></span>
                    </div>
                  </div>

                  {/* Quadro Financeiro da Taxa de Matrícula (Padrão Contribuições) */}
                  <div className="bg-emerald-50/70 border border-emerald-300 p-3 text-xs mb-3">
                    <div className="flex items-center justify-between border-b border-emerald-200 pb-1.5 mb-2">
                      <span className="text-[10px] font-black uppercase text-emerald-950 tracking-wider">
                        Detalhamento Financeiro da Taxa de Matrícula
                      </span>
                      <span className={cn(
                        "px-2 py-0.5 text-[10px] font-black uppercase border",
                        feeStatus === 'paid'
                          ? "bg-emerald-200 text-emerald-950 border-emerald-400"
                          : feeStatus === 'exempt'
                            ? "bg-slate-200 text-slate-800 border-slate-300"
                            : "bg-amber-200 text-amber-950 border-amber-400"
                      )}>
                        {feeStatus === 'paid' ? '✓ QUITADO' : feeStatus === 'exempt' ? 'ISENTO' : 'PENDENTE'}
                      </span>
                    </div>

                    <div className="grid grid-cols-12 gap-2 items-center">
                      <div className="col-span-12 sm:col-span-7">
                        <p className="text-[9px] font-bold text-emerald-800 uppercase">Referência</p>
                        <p className="text-xs font-black text-slate-900">
                          Taxa de Inscrição e Matrícula Acadêmica ({currentYear})
                        </p>
                        <p className="text-[10.5px] text-slate-600 italic pt-0.5">
                          Extenso: {numberToPortugueseWords(feeAmount)}
                        </p>
                      </div>
                      <div className="col-span-12 sm:col-span-5 sm:text-right">
                        <p className="text-[9px] font-bold text-emerald-800 uppercase">Valor do Lançamento</p>
                        <p className="text-lg font-black text-[#00174b] font-mono">
                          {formatCurrency(feeAmount)}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-2 mt-2 border-t border-emerald-200/80 text-[11px] text-emerald-950">
                      <div>Forma de Quitação: <strong>{paymentMethod}</strong></div>
                      <div>Data do Pagamento: <strong>{formatDateForDisplay(effectivePaymentDate)}</strong></div>
                      {observations && (
                        <div className="col-span-2 text-[10px] text-slate-600 pt-0.5">
                          Observações: {observations}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Mensagem / Declaração Institucional */}
                  <div className="bg-slate-50 p-2.5 border border-slate-200 text-center mb-4">
                    <p className="text-[9.5px] text-slate-600 italic leading-snug">
                      &quot;{instSettings?.receipt_message || 'Inscrição e matrícula confirmadas com gratidão. O(a) aluno(a) declara estar de acordo com o regimento escolar diocesano.'}&quot;
                    </p>
                  </div>

                  {/* Linhas de Assinaturas */}
                  <div className="flex justify-between items-end pt-3 text-xs text-slate-700">
                    <div className="text-center w-52 sm:w-60">
                      <div className="border-b border-slate-400 mb-1"></div>
                      <p className="text-[9px] font-black uppercase tracking-wider text-slate-700">
                        Assinatura do Aluno(a)
                      </p>
                    </div>

                    <div className="text-center w-52 sm:w-60">
                      <div className="border-b border-slate-400 mb-1"></div>
                      <p className="text-[9px] font-black uppercase tracking-wider text-slate-700">
                        Secretaria Acadêmica / Carimbo
                      </p>
                    </div>
                  </div>

                  {/* Rodapé da Via */}
                  <div className="pt-3 mt-3 border-t border-slate-100 flex items-center justify-between text-[8px] text-slate-400 font-bold uppercase tracking-wider">
                    <span>SISTEMA {instName}</span>
                    <span>REGISTRO: {formatDateForDisplay(effectivePaymentDate)} • FORMA: {paymentMethod.toUpperCase()}</span>
                    <span>EMISSÃO: {safeFormat(new Date(), 'dd/MM/yyyy HH:mm')}</span>
                  </div>
                </div>

                {/* Linha Divisória de Corte para 2 Vias (Padrão Contribuições) */}
                {via === 1 && copies === 2 && (
                  <div className="py-2.5 flex items-center justify-center my-1 print:my-4">
                    <div className="w-full border-b-2 border-dashed border-slate-400 flex items-center justify-center">
                      <span className="bg-white px-4 text-[9px] font-black text-slate-500 uppercase flex items-center gap-1.5 -translate-y-1/2">
                        ✂️ CORTE AQUI ✂️
                      </span>
                    </div>
                  </div>
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Modal Footer Controls */}
        <div className="px-5 py-3.5 bg-slate-100 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <p className="text-xs text-slate-600 font-medium">
            Recibo configurado para <strong>{copies} {copies === 1 ? 'Via' : 'Vias'}</strong>. Formato padrão para impressão e arquivamento oficial.
          </p>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={handlePrint}
              className="flex-1 sm:flex-initial px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer"
            >
              <Printer size={15} />
              <span>Imprimir ({copies} {copies === 1 ? 'Via' : 'Vias'})</span>
            </button>

            <button
              onClick={handleDownloadPDF}
              className="flex-1 sm:flex-initial px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer"
            >
              <Download size={15} />
              <span>Baixar PDF</span>
            </button>

            <button
              onClick={onClose}
              className="px-4 py-2 bg-white hover:bg-slate-200 border border-slate-300 text-slate-700 text-xs font-bold uppercase tracking-wider transition-all cursor-pointer"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
