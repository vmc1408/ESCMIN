import React, { useState, useEffect } from 'react';
import { X, GraduationCap, DollarSign, Plus, CheckCircle2, AlertCircle, Info, BookOpen } from 'lucide-react';
import { formatCurrency, parseDateToDB, cn } from '../lib/utils';
import { Student, Class } from '../types';

interface EnrollClassWithFeeModalProps {
  isOpen: boolean;
  onClose: () => void;
  student: Student | null;
  targetClass: Class | null;
  suggestedFee: number;
  onConfirm: (data: {
    classId: string;
    feeStatus: 'paid' | 'pending' | 'exempt';
    feeAmount: number;
    paymentMethod: string;
    paymentDate: string;
    observations: string;
    exemptionReason: string;
  }) => Promise<void>;
}

export const EnrollClassWithFeeModal: React.FC<EnrollClassWithFeeModalProps> = ({
  isOpen,
  onClose,
  student,
  targetClass,
  suggestedFee,
  onConfirm
}) => {
  const [feeStatus, setFeeStatus] = useState<'exempt' | 'paid' | 'pending'>('exempt');
  const [amount, setAmount] = useState<number>(suggestedFee || 100);
  const [amountStr, setAmountStr] = useState<string>((suggestedFee || 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  const [paymentMethod, setPaymentMethod] = useState<string>('Dinheiro');
  const [paymentDate, setPaymentDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [observations, setObservations] = useState<string>('');
  const [exemptionReason, setExemptionReason] = useState<string>('Segunda turma / Curso adicional em paralelo');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    if (suggestedFee !== undefined) {
      setAmount(suggestedFee);
      setAmountStr(Number(suggestedFee).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    }
  }, [suggestedFee]);

  if (!isOpen || !student || !targetClass) return null;

  const handleAmountChange = (val: string) => {
    setAmountStr(val);
    const clean = val.replace(/[^\d.,]/g, '');
    let numStr = clean;
    if (numStr.includes(',')) {
      numStr = numStr.replace(/\./g, '').replace(',', '.');
    }
    const num = parseFloat(numStr);
    if (!isNaN(num)) {
      setAmount(num);
    }
  };

  const handleAmountBlur = () => {
    let clean = amountStr.replace(/[^\d.,]/g, '');
    if (!clean) {
      setAmountStr('0,00');
      setAmount(0);
      return;
    }
    let numStr = clean;
    if (numStr.includes(',')) {
      numStr = numStr.replace(/\./g, '').replace(',', '.');
    }
    const num = parseFloat(numStr);
    if (!isNaN(num)) {
      setAmount(num);
      setAmountStr(num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (feeStatus === 'paid') {
      const numAmount = Number(amount);
      if (!numAmount || isNaN(numAmount) || numAmount <= 0) {
        setErrorMessage('Valor incompatível: o valor da taxa para pagamento imediato deve ser maior que zero (R$ 0,00). O sistema não registrará valores zerados ou negativos.');
        return;
      }
      if (numAmount > 50000) {
        setErrorMessage('Valor incompatível: o valor informado ultrapassa o limite permitido pelo sistema (R$ 50.000,00).');
        return;
      }
      if (!paymentDate) {
        setErrorMessage('Data de pagamento incompatível: selecione uma data válida de quitação.');
        return;
      }
      const todayStr = new Date().toISOString().split('T')[0];
      if (paymentDate > todayStr) {
        setErrorMessage('Data de pagamento incompatível: a data de pagamento não pode ser uma data futura.');
        return;
      }
      if (!paymentMethod) {
        setErrorMessage('Forma de pagamento não selecionada.');
        return;
      }
    } else if (feeStatus === 'pending') {
      const numAmount = Number(amount);
      if (!numAmount || isNaN(numAmount) || numAmount <= 0) {
        setErrorMessage('Valor incompatível: para taxa com status pendente a receber, informe um valor maior que zero ou marque como "Isento".');
        return;
      }
      if (numAmount > 50000) {
        setErrorMessage('Valor incompatível: o valor da taxa pendente excede o limite permitido.');
        return;
      }
    } else if (feeStatus === 'exempt') {
      if (!exemptionReason) {
        setErrorMessage('Informe o motivo da isenção.');
        return;
      }
    }

    setLoading(true);
    try {
      await onConfirm({
        classId: targetClass.id,
        feeStatus,
        feeAmount: Number(amount) || 0,
        paymentMethod,
        paymentDate,
        observations,
        exemptionReason
      });
      onClose();
    } catch (err: any) {
      console.error('Erro ao matricular em turma adicional:', err);
      setErrorMessage(err.message || 'Erro ao registrar matrícula');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[250] flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-none border border-slate-300 shadow-2xl max-w-lg w-full overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BookOpen size={18} className="text-amber-400" />
            <h3 className="text-sm font-black uppercase tracking-wider">
              Matricular em Turma Adicional
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {errorMessage && (
            <div className="p-3 bg-rose-50 border-l-4 border-rose-500 text-rose-800 text-xs font-bold flex items-center gap-2 animate-in fade-in duration-200">
              <AlertCircle size={16} className="text-rose-600 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}
          <div className="bg-amber-50/70 border border-amber-300 p-3 space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-amber-900 font-bold uppercase text-[10px]">Aluno(a)</span>
              <span className="font-mono font-bold text-amber-950">RA: {student.registration_number || 'N/A'}</span>
            </div>
            <p className="text-sm font-black text-slate-900 uppercase">
              {student.name}
            </p>
            <p className="text-xs text-amber-900 font-semibold pt-1">
              Nova Turma: <strong>{targetClass.name}</strong> ({targetClass.period || 'Regular'})
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-700 block">
              Tratamento da Taxa de Matrícula para esta Turma:
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setFeeStatus('exempt')}
                className={`p-2.5 text-center border text-xs font-bold transition-all cursor-pointer ${
                  feeStatus === 'exempt'
                    ? 'border-indigo-600 bg-indigo-50 text-indigo-900 ring-2 ring-indigo-500/20'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <div className="text-[10px] uppercase font-black">Isento</div>
                <div className="text-[9px] text-slate-500 font-normal">Curso paralelo</div>
              </button>

              <button
                type="button"
                onClick={() => setFeeStatus('paid')}
                className={`p-2.5 text-center border text-xs font-bold transition-all cursor-pointer ${
                  feeStatus === 'paid'
                    ? 'border-emerald-600 bg-emerald-50 text-emerald-900 ring-2 ring-emerald-500/20'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <div className="text-[10px] uppercase font-black text-emerald-700">Pagar Agora</div>
                <div className="text-[9px] text-slate-500 font-normal">Registrar taxa</div>
              </button>

              <button
                type="button"
                onClick={() => setFeeStatus('pending')}
                className={`p-2.5 text-center border text-xs font-bold transition-all cursor-pointer ${
                  feeStatus === 'pending'
                    ? 'border-amber-600 bg-amber-50 text-amber-900 ring-2 ring-amber-500/20'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <div className="text-[10px] uppercase font-black text-amber-700">Pendente</div>
                <div className="text-[9px] text-slate-500 font-normal">Cobrança futura</div>
              </button>
            </div>
          </div>

          {feeStatus === 'paid' && (
            <div className="p-3 bg-emerald-50/70 border border-emerald-300 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-bold text-slate-700 block">Valor da Taxa (R$)</label>
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">R$</span>
                    <input
                      type="text"
                      required
                      value={amountStr}
                      onChange={(e) => handleAmountChange(e.target.value)}
                      onBlur={handleAmountBlur}
                      onKeyDown={(e) => e.key === 'Enter' && handleAmountBlur()}
                      className="w-full pl-7 pr-2.5 py-1.5 bg-white border border-slate-300 text-xs font-black text-slate-900"
                      placeholder="0,00"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-700 block">Data do Pagamento</label>
                  <input
                    type="date"
                    required
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-300 text-xs font-bold text-slate-900 h-[32px]"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-700 block mb-1">Forma de Pagamento</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {(['Dinheiro', 'PIX', 'Cartão'] as const).map((method) => (
                    <button
                      key={method}
                      type="button"
                      onClick={() => setPaymentMethod(method)}
                      className={cn(
                        "py-1.5 px-2 rounded-none text-xs font-black uppercase tracking-wider transition-all border cursor-pointer flex items-center justify-center",
                        paymentMethod === method
                          ? "bg-[#00174b] border-[#00174b] text-white shadow-xs"
                          : "bg-white border-slate-200 text-slate-600 hover:border-emerald-400 hover:text-emerald-800"
                      )}
                    >
                      {method}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-700 block">Observações do Recibo (Opcional)</label>
                <input
                  type="text"
                  placeholder="Ex: Pago na secretaria / Recibo entregue"
                  value={observations}
                  onChange={(e) => setObservations(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 text-xs text-slate-800"
                />
              </div>
            </div>
          )}

          {feeStatus === 'exempt' && (
            <div className="p-3 bg-slate-50 border border-slate-200 text-xs space-y-1">
              <label className="text-[10px] font-bold text-slate-600">Motivo da Isenção:</label>
              <input
                type="text"
                value={exemptionReason}
                onChange={(e) => setExemptionReason(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-white border border-slate-300 text-xs font-medium"
              />
              <p className="text-[10px] text-slate-500 italic">
                A matrícula adicional será efetivada sem cobrança de nova taxa.
              </p>
            </div>
          )}

          {feeStatus === 'pending' && (
            <div className="p-3 bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-1">
              <p className="font-bold">
                Taxa de {formatCurrency(amount)} constará como pendente a receber para esta matrícula.
              </p>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-bold uppercase tracking-wider flex items-center gap-2 shadow-sm transition-all cursor-pointer"
            >
              <Plus size={14} />
              <span>Confirmar Matrícula</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
