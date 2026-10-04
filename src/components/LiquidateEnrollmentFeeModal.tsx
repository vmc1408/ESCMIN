import React, { useState, useEffect } from 'react';
import { X, CreditCard, DollarSign, Calendar, Loader2, CheckCircle2 } from 'lucide-react';
import { formatCurrency, parseDateToDB, cn } from '../lib/utils';
import { Student, Class } from '../types';

interface LiquidateEnrollmentFeeModalProps {
  isOpen: boolean;
  onClose: () => void;
  student: Student | null;
  classItem?: Class | null;
  suggestedAmount: number;
  onConfirm: (data: {
    amount: number;
    paymentMethod: string;
    paymentDate: string;
    observations: string;
  }) => Promise<void>;
}

export const LiquidateEnrollmentFeeModal: React.FC<LiquidateEnrollmentFeeModalProps> = ({
  isOpen,
  onClose,
  student,
  classItem,
  suggestedAmount,
  onConfirm
}) => {
  const [amount, setAmount] = useState<number>(suggestedAmount || 100);
  const [amountStr, setAmountStr] = useState<string>((suggestedAmount || 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  const [paymentMethod, setPaymentMethod] = useState<string>('Dinheiro');
  const [paymentDate, setPaymentDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [observations, setObservations] = useState<string>('Quitação da Taxa de Matrícula na secretaria');
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (suggestedAmount !== undefined) {
      setAmount(suggestedAmount);
      setAmountStr(Number(suggestedAmount).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    }
  }, [suggestedAmount]);

  if (!isOpen || !student) return null;

  const handleAmountChange = (val: string) => {
    setErrorMessage(null);
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

    const numAmount = Number(amount);
    if (!numAmount || isNaN(numAmount) || numAmount <= 0) {
      setErrorMessage('Valor incompatível: o valor da quitação deve ser maior que zero (R$ 0,00). O sistema não registrará valores zerados ou negativos.');
      return;
    }
    if (numAmount > 50000) {
      setErrorMessage('Valor incompatível: o valor informado ultrapassa o limite permitido pelo sistema (R$ 50.000,00).');
      return;
    }

    if (!paymentDate) {
      setErrorMessage('Data de quitação incompatível: selecione uma data válida.');
      return;
    }

    const todayStr = new Date().toISOString().split('T')[0];
    if (paymentDate > todayStr) {
      setErrorMessage('Data de quitação incompatível: a data de pagamento não pode ser uma data futura.');
      return;
    }

    if (!paymentMethod) {
      setErrorMessage('Forma de pagamento não selecionada.');
      return;
    }

    setLoading(true);
    try {
      await onConfirm({
        amount: Number(amount) || 0,
        paymentMethod,
        paymentDate,
        observations
      });
      onClose();
    } catch (err) {
      console.error('Erro ao liquidar taxa:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[250] flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-none border border-slate-300 shadow-2xl max-w-lg w-full overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CreditCard size={18} className="text-amber-400" />
            <h3 className="text-sm font-black uppercase tracking-wider">
              Registrar Quitação da Taxa de Matrícula
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
          <div className="bg-slate-50 border border-slate-200 p-3 space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500 font-bold uppercase text-[10px]">Aluno(a)</span>
              <span className="font-mono font-bold text-slate-700">RA: {student.registration_number || 'N/A'}</span>
            </div>
            <p className="text-sm font-black text-slate-900 uppercase">
              {student.name}
            </p>
            {classItem && (
              <p className="text-xs text-slate-600">
                Turma: <strong>{classItem.name}</strong> ({classItem.period || 'Regular'})
              </p>
            )}
          </div>

          <div className="grid grid-cols-12 gap-3">
            <div className="col-span-12 sm:col-span-6 space-y-1">
              <label className="text-xs font-bold text-slate-700">Valor da Taxa (R$)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">R$</span>
                <input
                  type="text"
                  required
                  value={amountStr}
                  onChange={(e) => handleAmountChange(e.target.value)}
                  onBlur={handleAmountBlur}
                  onKeyDown={(e) => e.key === 'Enter' && handleAmountBlur()}
                  className="w-full pl-9 pr-3 py-2 bg-white border border-slate-300 rounded-none text-sm font-black text-slate-900 focus:ring-2 focus:ring-amber-500/20"
                  placeholder="0,00"
                />
              </div>
            </div>

            <div className="col-span-12 sm:col-span-6 space-y-1">
              <label className="text-xs font-bold text-slate-700">Data da Quitação</label>
              <input
                type="date"
                required
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-none text-xs font-bold text-slate-900 focus:ring-2 focus:ring-amber-500/20 h-[38px]"
              />
            </div>

            <div className="col-span-12 space-y-1">
              <label className="text-xs font-bold text-slate-700">Forma de Pagamento</label>
              <div className="grid grid-cols-3 gap-2">
                {(['Dinheiro', 'PIX', 'Cartão'] as const).map((method) => (
                  <button
                    key={method}
                    type="button"
                    onClick={() => setPaymentMethod(method)}
                    className={cn(
                      "py-2 px-3 rounded-none text-xs font-black uppercase tracking-wider transition-all border cursor-pointer flex items-center justify-center",
                      paymentMethod === method
                        ? "bg-[#00174b] border-[#00174b] text-white shadow-xs"
                        : "bg-white border-slate-200 text-slate-600 hover:border-amber-400 hover:text-amber-800"
                    )}
                  >
                    {method}
                  </button>
                ))}
              </div>
            </div>

            <div className="col-span-12 space-y-1">
              <label className="text-xs font-bold text-slate-700">Observações / Recibo</label>
              <input
                type="text"
                value={observations}
                onChange={(e) => setObservations(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-none text-xs text-slate-800 focus:ring-2 focus:ring-amber-500/20"
                placeholder="Ex: Recebido na secretaria"
              />
            </div>
          </div>

          {errorMessage && (
            <div className="p-3 bg-rose-50 border-2 border-rose-300 text-rose-900 text-xs font-bold flex items-center gap-2 animate-in fade-in">
              <X size={16} className="text-rose-600 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          <div className="p-3 bg-emerald-50 border border-emerald-200 text-[11px] text-emerald-800 flex items-center gap-2">
            <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
            <span>
              Ao confirmar a quitação, o registro será gravado no histórico financeiro e o comprovante oficial com recibo será aberto para impressão.
            </span>
          </div>

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
              className="px-5 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-xs font-bold uppercase tracking-wider flex items-center gap-2 shadow-sm transition-all cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  <span>Registrando...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 size={14} />
                  <span>Confirmar Quitação</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
