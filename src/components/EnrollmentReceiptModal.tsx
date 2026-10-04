import React from 'react';
import { X, Printer, Download, CheckCircle2, AlertCircle, ShieldCheck, GraduationCap, Building2, Calendar, FileText } from 'lucide-react';
import { formatCurrency, formatDateForDisplay, numberToPortugueseWords, formatRegistrationNumber } from '../lib/utils';
import { Student, Class } from '../types';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

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
  if (!isOpen || !student) return null;

  const currentYear = classItem?.start_year || new Date().getFullYear();
  const receiptNumber = `MAT-${(student.registration_number || student.id.slice(0, 6)).replace(/\//g, '')}-${currentYear}`;
  const effectivePaymentDate = paymentDate || new Date().toISOString().split('T')[0];
  const instName = institution?.name || 'Escola Diocesana de Teologia e Ministérios';
  const instSubtitle = institution?.subtitle || 'Mitra Diocesana de Guarulhos';

  const handleDownloadPDF = () => {
    try {
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      const drawVia = (yOffset: number, viaLabel: string) => {
        // Moldura externa
        doc.setDrawColor(100, 116, 139);
        doc.setLineWidth(0.4);
        doc.rect(10, yOffset + 10, 190, 128, 'S');

        // Logo se disponível
        if (institution?.logo_url) {
          try {
            doc.addImage(institution.logo_url, 'auto', 14, yOffset + 14, 18, 18);
          } catch (e) {}
        }

        // Identificador da via
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(100, 116, 139);
        doc.text(viaLabel.toUpperCase(), 195, yOffset + 16, { align: 'right' });

        // Cabeçalho da Instituição
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(71, 85, 105);
        doc.text(instSubtitle.toUpperCase(), 105, yOffset + 18, { align: 'center' });

        doc.setFontSize(12);
        doc.setTextColor(15, 23, 42);
        doc.text(instName.toUpperCase(), 105, yOffset + 23.5, { align: 'center' });

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10.5);
        doc.setTextColor(30, 58, 138); // Blue
        doc.text('COMPROVANTE DE MATRÍCULA E RECIBO DE TAXA', 105, yOffset + 29.5, { align: 'center' });

        // Faixa de Metadados
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(51, 65, 85);
        doc.text(`Nº COMPROVANTE: ${receiptNumber}`, 14, yOffset + 36);
        doc.text(`DATA EMISSÃO: ${formatDateForDisplay(new Date().toISOString())}`, 195, yOffset + 36, { align: 'right' });

        doc.setDrawColor(203, 213, 225);
        doc.line(14, yOffset + 38, 195, yOffset + 38);

        // Box Aluno
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(15, 23, 42);
        doc.text(`ALUNO(A): ${student.name.toUpperCase()}`, 14, yOffset + 44);
        
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.text(`MATRÍCULA / RA: ${formatRegistrationNumber(student.registration_number)}`, 14, yOffset + 49);
        doc.text(`CPF: ${student.cpf || 'Não informado'}    RG: ${student.rg || 'Não informado'}`, 80, yOffset + 49);
        if (unitName) {
          doc.text(`POLO / UNIDADE: ${unitName}`, 14, yOffset + 54);
        }

        // Box Turma / Curso
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(30, 58, 138);
        const courseName = classItem?.course || student.course || 'Curso Teológico';
        const className = classItem?.name || 'Turma Regular';
        doc.text(`CURSO: ${courseName}  |  TURMA: ${className}`, 14, yOffset + 61);
        
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(51, 65, 85);
        doc.text(`PERÍODO / TURNO: ${classItem?.period || 'Regular'}  |  INÍCIO: ${formatDateForDisplay(classItem?.start_date || student.start_date || '')}`, 14, yOffset + 66);

        // Box Financeiro da Taxa
        doc.setFillColor(248, 250, 252);
        doc.rect(14, yOffset + 70, 181, 26, 'FD');
        doc.setDrawColor(203, 213, 225);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(15, 23, 42);
        doc.text('DISCRIMINAÇÃO FINANCEIRA:', 18, yOffset + 75);

        const statusLabel = feeStatus === 'paid' ? 'QUITADO / PAGO' : feeStatus === 'exempt' ? 'ISENTO' : 'PENDENTE';
        doc.text(`TAXA DE INSCRIÇÃO E MATRÍCULA: ${formatCurrency(feeAmount)} (${statusLabel})`, 18, yOffset + 80);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.text(`EXTENSO: ${numberToPortugueseWords(feeAmount)}`, 18, yOffset + 85);
        doc.text(`FORMA DE PAGTO: ${paymentMethod.toUpperCase()}    DATA QUITAÇÃO: ${formatDateForDisplay(effectivePaymentDate)}`, 18, yOffset + 90);

        if (observations) {
          doc.text(`OBSERVAÇÕES: ${observations}`, 14, yOffset + 101);
        }

        // Termo de Declaração
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(7);
        doc.setTextColor(100, 116, 139);
        doc.text('Declaro que realizei a inscrição/matrícula acadêmica e estou ciente das normas da instituição.', 105, yOffset + 107, { align: 'center' });

        // Assinaturas
        doc.setDrawColor(148, 163, 184);
        doc.line(25, yOffset + 124, 85, yOffset + 124);
        doc.line(125, yOffset + 124, 185, yOffset + 124);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(51, 65, 85);
        doc.text('ASSINATURA DO ALUNO(A)', 55, yOffset + 128, { align: 'center' });
        doc.text('SECRETARIA ACADÊMICA', 155, yOffset + 128, { align: 'center' });
      };

      // Desenhar 1ª via (Aluno)
      drawVia(0, '1ª Via - Aluno(a)');

      // Linha tracejada divisória
      doc.setDrawColor(148, 163, 184);
      doc.setLineDashPattern([2, 2], 0);
      doc.line(5, 148, 205, 148);
      doc.setFontSize(6.5);
      doc.setTextColor(148, 163, 184);
      doc.text('- - - - - - - - - - - - - - - - - - - - - - - - - - - -  CORTE AQUI  - - - - - - - - - - - - - - - - - - - - - - - - - - - -', 105, 147.5, { align: 'center' });
      doc.setLineDashPattern([], 0);

      // Desenhar 2ª via (Secretaria / Arquivo)
      drawVia(140, '2ª Via - Secretaria / Arquivo');

      doc.save(`Comprovante_Matricula_${student.name.replace(/\s+/g, '_')}_${receiptNumber}.pdf`);
    } catch (err) {
      console.error('Erro ao gerar PDF do comprovante de matrícula:', err);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-[250] flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white rounded-none border border-slate-300 shadow-2xl max-w-2xl w-full my-auto overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Banner de Sucesso quando recém cadastrado */}
        {isNew && (
          <div className="bg-emerald-600 text-white px-4 py-2 text-xs font-bold uppercase tracking-wider flex items-center justify-between">
            <span className="flex items-center gap-2">
              <CheckCircle2 size={16} />
              Aluno Inscrito e Taxa de Matrícula Registrada com Sucesso!
            </span>
            <span className="text-[10px] bg-emerald-700 px-2 py-0.5 rounded">Novo Aluno</span>
          </div>
        )}

        {/* Modal Top Bar */}
        <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText size={18} className="text-amber-400" />
            <h3 className="text-sm font-black uppercase tracking-wider">
              Comprovante de Matrícula e Recibo de Inscrição
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
            title="Fechar"
          >
            <X size={18} />
          </button>
        </div>

        {/* Recibo Printable Container */}
        <div className="p-5 sm:p-6 space-y-4 max-h-[75vh] overflow-y-auto bg-slate-50/50">
          <div className="bg-white border-2 border-slate-300 p-5 sm:p-6 shadow-sm space-y-4 text-slate-800">
            {/* Header Instituição */}
            <div className="text-center border-b border-slate-200 pb-3 space-y-0.5">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                {instSubtitle}
              </p>
              <h2 className="text-base font-black text-slate-900 uppercase tracking-tight">
                {instName}
              </h2>
              <div className="inline-block px-3 py-1 bg-blue-50 text-blue-900 border border-blue-200 text-xs font-black uppercase tracking-wider mt-1">
                Comprovante de Inscrição / Matrícula e Recibo
              </div>
            </div>

            {/* Número e Data */}
            <div className="flex items-center justify-between text-xs border-b border-slate-200 pb-2">
              <span className="font-mono font-bold text-slate-700">
                Nº: <strong className="text-slate-900">{receiptNumber}</strong>
              </span>
              <span className="text-slate-500 font-medium">
                Data: <strong>{formatDateForDisplay(new Date().toISOString())}</strong>
              </span>
            </div>

            {/* Dados do Aluno */}
            <div className="space-y-1 bg-slate-50 p-3 border border-slate-200 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-bold uppercase text-[10px]">Identificação do Aluno</span>
                <span className="font-mono font-black text-slate-800">RA: {formatRegistrationNumber(student.registration_number)}</span>
              </div>
              <p className="text-sm font-black text-slate-900 uppercase">
                {student.name}
              </p>
              <div className="grid grid-cols-2 gap-2 pt-1 text-[11px] text-slate-600">
                <div>CPF: <strong>{student.cpf || 'Não informado'}</strong></div>
                <div>RG: <strong>{student.rg || 'Não informado'}</strong></div>
                {unitName && <div className="col-span-2">Polo / Unidade: <strong>{unitName}</strong></div>}
              </div>
            </div>

            {/* Dados da Turma / Curso */}
            <div className="space-y-1 bg-blue-50/60 p-3 border border-blue-200 text-xs text-blue-950">
              <span className="text-blue-700 font-bold uppercase text-[10px]">Dados Acadêmicos</span>
              <p className="text-sm font-black uppercase text-blue-900">
                {classItem?.course || student.course || 'Curso Regular'}
              </p>
              <div className="flex items-center justify-between text-[11px] text-blue-800 pt-0.5">
                <span>Turma: <strong>{classItem?.name || 'Turma Vinculada'}</strong></span>
                <span>Turno: <strong>{classItem?.period || 'Regular'}</strong></span>
              </div>
            </div>

            {/* Detalhamento da Taxa de Matrícula */}
            <div className="space-y-2 bg-emerald-50/70 p-3.5 border-2 border-emerald-300 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-emerald-900 font-black uppercase text-[10px] tracking-wider">
                  Detalhamento da Taxa de Matrícula
                </span>
                <span className="px-2 py-0.5 bg-emerald-200 text-emerald-950 font-black text-[10px] uppercase border border-emerald-400">
                  {feeStatus === 'paid' ? '✓ QUITADO' : feeStatus === 'exempt' ? 'ISENTO' : 'PENDENTE'}
                </span>
              </div>
              <div className="flex items-baseline justify-between pt-1">
                <span className="text-sm font-bold text-slate-700">Valor da Taxa:</span>
                <span className="text-lg font-black text-emerald-900 font-mono">
                  {formatCurrency(feeAmount)}
                </span>
              </div>
              <p className="text-[11px] text-slate-600 italic">
                Extenso: {numberToPortugueseWords(feeAmount)}
              </p>
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-emerald-200/80 text-[11px] text-emerald-950">
                <div>Forma de Quitação: <strong>{paymentMethod}</strong></div>
                <div>Data do Pagamento: <strong>{formatDateForDisplay(effectivePaymentDate)}</strong></div>
              </div>
              {observations && (
                <div className="text-[10px] text-slate-600 pt-1">
                  Obs: {observations}
                </div>
              )}
            </div>

            {/* Declaração e Assinaturas */}
            <div className="pt-4 space-y-6">
              <p className="text-[9.5px] text-slate-500 italic text-center">
                O(a) aluno(a) declara estar de acordo com o regimento escolar e as normas acadêmicas da instituição diocesana.
              </p>
              <div className="grid grid-cols-2 gap-6 pt-3 text-center text-xs text-slate-700">
                <div className="border-t border-slate-400 pt-1.5 font-bold">
                  Assinatura do Aluno(a)
                </div>
                <div className="border-t border-slate-400 pt-1.5 font-bold">
                  Secretaria Acadêmica
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer Actions */}
        <div className="px-5 py-3.5 bg-slate-100 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-[11px] text-slate-500 font-medium">
            Imprima ou faça o download para entrega ao aluno e arquivo.
          </p>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={handlePrint}
              className="flex-1 sm:flex-initial px-3.5 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer"
            >
              <Printer size={14} />
              Imprimir
            </button>
            <button
              onClick={handleDownloadPDF}
              className="flex-1 sm:flex-initial px-3.5 py-2 bg-indigo-700 hover:bg-indigo-800 text-white text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer"
            >
              <Download size={14} />
              Baixar PDF
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
