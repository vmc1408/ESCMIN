import React, { useState, useEffect } from 'react';
import { 
  Building2, 
  Plus, 
  Edit2, 
  Trash2, 
  MapPin, 
  Phone, 
  Mail, 
  CheckCircle2, 
  AlertCircle, 
  Check, 
  X, 
  School,
  ShieldAlert,
  Loader2,
  Info,
  RefreshCw,
  Database,
  Copy,
  Server,
  AlertTriangle,
  Power,
  FileText,
  Users,
  GraduationCap
} from 'lucide-react';
import { useUnits } from '../contexts/UnitContext';
import { Unit } from '../types';
import { 
  saveUnit, 
  deleteUnit, 
  forceSyncUnits, 
  checkSupabaseUnitsTableStatus, 
  checkUnitLinkedRecords,
  checkAllUnitsLinkedRecords,
  toggleUnitActive,
  UnitLinkedRecordsInfo,
  SUPABASE_UNITS_MIGRATION_SQL 
} from '../lib/unitService';
import { cn, maskPhone, maskCEP, maskCNPJ } from '../lib/utils';

export function UnitsSettingsTab() {
  const { units, refreshUnits, loading } = useUnits();
  const [editingUnit, setEditingUnit] = useState<Partial<Unit> | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSqlModalOpen, setIsSqlModalOpen] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  
  // Status do banco
  const [dbStatus, setDbStatus] = useState<{
    nativeTableExists: boolean;
    cloudSyncActive: boolean;
    message: string;
  } | null>(null);

  // Mapeamento de registros vinculados por unidade
  const [linkedInfoMap, setLinkedInfoMap] = useState<Record<string, UnitLinkedRecordsInfo>>({});
  const [loadingLinkedInfo, setLoadingLinkedInfo] = useState(false);

  // Estados para auto-preenchimento de CEP no modal
  const [loadingCep, setLoadingCep] = useState(false);
  const [cepSuccess, setCepSuccess] = useState(false);

  // Modal de confirmação seguro
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    type: 'delete' | 'blocked';
    unit: Unit | null;
    linkedSummary?: string;
  }>({
    isOpen: false,
    title: '',
    description: '',
    type: 'delete',
    unit: null
  });

  const checkDb = async () => {
    try {
      const status = await checkSupabaseUnitsTableStatus();
      setDbStatus(status);
    } catch {}
  };

  const loadLinkedInfo = async () => {
    if (!units || units.length === 0) return;
    setLoadingLinkedInfo(true);
    try {
      const map = await checkAllUnitsLinkedRecords(units);
      setLinkedInfoMap(map);
    } catch (err) {
      console.warn('Erro ao carregar vínculos das unidades:', err);
    } finally {
      setLoadingLinkedInfo(false);
    }
  };

  useEffect(() => {
    checkDb();
    loadLinkedInfo();
  }, [units]);

  const handleOpenCreate = () => {
    const nextNum = units.length;
    setEditingUnit({
      code: `FIL-${String(nextNum).padStart(2, '0')}`,
      name: '',
      is_main: false,
      active: true,
      address: '',
      city: '',
      state: '',
      cep: '',
      cnpj: '',
      phone: '',
      email: ''
    });
    setCepSuccess(false);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (unit: Unit) => {
    setEditingUnit({ ...unit });
    setCepSuccess(false);
    setIsModalOpen(true);
  };

  // Tratamento automático de CEP com busca no ViaCEP
  const handleCepChange = async (val: string) => {
    const formatted = maskCEP(val);
    setEditingUnit(prev => prev ? { ...prev, cep: formatted } : null);
    
    const cleanDigits = formatted.replace(/\D/g, '');
    if (cleanDigits.length === 8) {
      try {
        setLoadingCep(true);
        const res = await fetch(`https://viacep.com.br/ws/${cleanDigits}/json/`);
        const data = await res.json();
        if (data && !data.erro) {
          const logradouro = data.logradouro || '';
          const bairro = data.bairro ? `, ${data.bairro}` : '';
          const fullAddress = logradouro ? `${logradouro}${bairro}` : '';
          
          setEditingUnit(prev => {
            if (!prev) return null;
            return {
              ...prev,
              address: prev.address?.trim() ? prev.address : fullAddress,
              city: data.localidade || prev.city || '',
              state: data.uf || prev.state || ''
            };
          });
          setCepSuccess(true);
          setTimeout(() => setCepSuccess(false), 4000);
        }
      } catch (e) {
        console.warn('Erro ao consultar ViaCEP:', e);
      } finally {
        setLoadingCep(false);
      }
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUnit || !editingUnit.name?.trim()) {
      setFeedback({ type: 'error', message: 'O nome da unidade é obrigatório.' });
      return;
    }

    setSaving(true);
    setFeedback(null);
    try {
      await saveUnit(editingUnit);
      await refreshUnits();
      await loadLinkedInfo();
      setIsModalOpen(false);
      setEditingUnit(null);
      setFeedback({ 
        type: 'success', 
        message: editingUnit.is_main 
          ? 'Unidade Sede / Matriz e configurações institucionais sincronizadas com sucesso!' 
          : 'Unidade salva e sincronizada com sucesso!' 
      });
      setTimeout(() => setFeedback(null), 4000);
      checkDb();
    } catch (error: any) {
      console.error('Erro ao salvar unidade:', error);
      setFeedback({ type: 'error', message: error.message || 'Falha ao salvar a unidade.' });
    } finally {
      setSaving(false);
    }
  };

  const handleRequestDelete = (unit: Unit) => {
    if (unit.is_main || unit.id === 'matriz') {
      setFeedback({ type: 'error', message: 'A Unidade Sede / Matriz é o polo principal e não pode ser excluída.' });
      return;
    }

    const linkedInfo = linkedInfoMap[unit.id];
    if (linkedInfo && !linkedInfo.canDelete) {
      setConfirmModal({
        isOpen: true,
        title: 'Exclusão não permitida',
        description: `A unidade "${unit.name}" possui ${linkedInfo.summary} vinculados. Para manter o histórico acadêmico e financeiro íntegro, o sistema não permite a exclusão física. Você pode apenas desativá-la.`,
        type: 'blocked',
        unit,
        linkedSummary: linkedInfo.summary
      });
      return;
    }

    setConfirmModal({
      isOpen: true,
      title: 'Confirmar Exclusão de Unidade',
      description: `Tem certeza que deseja excluir definitivamente a unidade "${unit.name}" (${unit.code})? Nenhum registro acadêmico, turma ou aluno está vinculado a ela. Esta ação é irreversível.`,
      type: 'delete',
      unit
    });
  };

  const handleConfirmDelete = async () => {
    if (!confirmModal.unit) return;
    const unitId = confirmModal.unit.id;
    setDeletingId(unitId);
    setConfirmModal(prev => ({ ...prev, isOpen: false }));
    try {
      await deleteUnit(unitId);
      await refreshUnits();
      await loadLinkedInfo();
      setFeedback({ type: 'success', message: 'Unidade excluída e base de dados atualizada com sucesso.' });
      setTimeout(() => setFeedback(null), 4000);
      checkDb();
    } catch (error: any) {
      console.error('Erro ao excluir unidade:', error);
      setFeedback({ type: 'error', message: error.message || 'Falha ao excluir a unidade.' });
    } finally {
      setDeletingId(null);
    }
  };

  const handleToggleActive = async (unit: Unit) => {
    if (unit.is_main || unit.id === 'matriz') {
      setFeedback({ type: 'error', message: 'A Unidade Sede / Matriz não pode ser desativada.' });
      return;
    }

    const nextActive = unit.active === false;
    setTogglingId(unit.id);
    try {
      await toggleUnitActive(unit.id, nextActive);
      await refreshUnits();
      await loadLinkedInfo();
      setFeedback({
        type: 'success',
        message: nextActive 
          ? `Unidade "${unit.name}" reativada com sucesso! Novas matrículas e turmas podem ser abertas neste polo.` 
          : `Unidade "${unit.name}" desativada com sucesso! Nenhuma nova matrícula será aceita, mas o histórico permanece preservado.`
      });
      setTimeout(() => setFeedback(null), 4000);
      checkDb();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Erro ao alterar status da unidade.' });
    } finally {
      setTogglingId(null);
    }
  };

  const handleForceSync = async () => {
    setSyncing(true);
    setFeedback(null);
    try {
      await forceSyncUnits();
      await refreshUnits();
      await checkDb();
      await loadLinkedInfo();
      setFeedback({ type: 'success', message: 'Sincronização em nuvem e integridade de polos concluída com sucesso!' });
      setTimeout(() => setFeedback(null), 4000);
    } catch (err: any) {
      setFeedback({ type: 'error', message: 'Falha ao sincronizar com a nuvem: ' + (err.message || 'Erro de rede') });
    } finally {
      setSyncing(false);
    }
  };

  const handleCopySql = () => {
    navigator.clipboard.writeText(SUPABASE_UNITS_MIGRATION_SQL);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 3000);
  };

  return (
    <div className="space-y-6">
      {/* Feedback Notification */}
      {feedback && (
        <div className={cn(
          "p-4 rounded-xl flex items-center justify-between shadow-sm animate-in fade-in duration-200",
          feedback.type === 'success' ? "bg-emerald-50 text-emerald-800 border border-emerald-200" : "bg-red-50 text-red-800 border border-red-200"
        )}>
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
            <span className="text-xs font-bold">{feedback.message}</span>
          </div>
          <button onClick={() => setFeedback(null)} className="opacity-70 hover:opacity-100 cursor-pointer">
            <X size={16} />
          </button>
        </div>
      )}

      {/* Header Info Card */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 border border-blue-100 flex items-center justify-center shrink-0">
            <Building2 size={24} />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-800">Unidades e Filiais (Polos)</h2>
            <p className="text-xs text-slate-500 mt-1 max-w-2xl leading-relaxed">
              Gerencie a <strong>Sede / Matriz</strong> e os <strong>Polos e Filiais</strong> da instituição. 
              A Matriz é sincronizada automaticamente com os dados da <strong>Instituição</strong>. 
              Polos com registros acadêmicos vinculados não podem ser excluídos, apenas desativados.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleForceSync}
            disabled={syncing}
            className="inline-flex items-center justify-center gap-2 px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold uppercase tracking-wider transition-all border border-slate-200 cursor-pointer disabled:opacity-50"
            title="Forçar sincronização de polos com o Supabase"
          >
            <RefreshCw size={14} className={cn(syncing && "animate-spin text-blue-600")} />
            {syncing ? 'Sincronizando...' : 'Sincronizar'}
          </button>

          <button
            type="button"
            onClick={handleOpenCreate}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold uppercase tracking-wider transition-all shadow-xs active:scale-95 shrink-0 cursor-pointer"
          >
            <Plus size={16} />
            Nova Filial / Polo
          </button>
        </div>
      </div>

      {/* Cloud & Database Status Bar */}
      <div className="bg-gradient-to-r from-slate-50 to-blue-50/40 border border-slate-200 rounded-xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 shadow-2xs">
        <div className="flex items-start md:items-center gap-3">
          <div className={cn(
            "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
            dbStatus?.nativeTableExists 
              ? "bg-emerald-100 text-emerald-700 border border-emerald-200" 
              : "bg-blue-100 text-blue-700 border border-blue-200"
          )}>
            <Database size={16} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-800">
                Sincronismo com a Base de Dados:
              </span>
              <span className={cn(
                "text-[10px] font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1",
                dbStatus?.cloudSyncActive 
                  ? "bg-emerald-100 text-emerald-800 border border-emerald-300" 
                  : "bg-amber-100 text-amber-800 border border-amber-300"
              )}>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
                {dbStatus?.nativeTableExists ? 'Tabela Nativa units Conectada' : 'Sincronização em Nuvem Ativa'}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {dbStatus?.message || 'Verificando integridade da base de unidades...'}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsSqlModalOpen(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 text-blue-600 hover:text-blue-700 border border-blue-200 rounded-lg text-xs font-bold shadow-2xs transition-all cursor-pointer shrink-0"
        >
          <Server size={13} />
          Script SQL Supabase
        </button>
      </div>

      {/* Regra de Proteção e Integridade */}
      <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4 flex items-start gap-3">
        <Info size={18} className="text-blue-600 shrink-0 mt-0.5" />
        <div className="text-xs text-slate-600 space-y-1">
          <p className="font-semibold text-slate-800">
            Regras de Integridade e Funcionamento das Unidades:
          </p>
          <p>
            • <strong>Sede / Matriz:</strong> Seus dados de endereço, telefone, CNPJ e e-mail são preenchidos e sincronizados centralmente com as <em>Configurações da Instituição</em>.
          </p>
          <p>
            • <strong>Exclusão Segura:</strong> Uma filial só pode ser excluída fisicamente se não possuir nenhum registro vinculado (alunos, turmas, professores ou histórico financeiro). Caso possua dados vinculados, ela deve ser <strong>desativada</strong> para garantir a rastreabilidade acadêmica.
          </p>
          <p>
            • <strong>Formatação Automática:</strong> Ao cadastrar ou editar filiais, campos como CEP, CNPJ e Telefone possuem máscara em tempo real e preenchimento inteligente de endereço via ViaCEP.
          </p>
        </div>
      </div>

      {/* Units Grid / List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {units.map((unit) => {
          const isMain = unit.is_main || unit.id === 'matriz';
          const isActive = unit.active !== false;
          const linkedInfo = linkedInfoMap[unit.id];
          const hasLinked = Boolean(linkedInfo && !linkedInfo.canDelete && !isMain);

          return (
            <div 
              key={unit.id}
              className={cn(
                "bg-white rounded-xl border p-5 transition-all flex flex-col justify-between relative",
                isMain 
                  ? "border-blue-200 shadow-xs ring-1 ring-blue-100 bg-linear-to-b from-blue-50/20 to-transparent" 
                  : isActive
                    ? "border-slate-200 hover:border-slate-300 shadow-2xs"
                    : "border-amber-200/80 bg-amber-50/15 shadow-2xs opacity-90"
              )}
            >
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className={cn(
                      "w-10 h-10 rounded-xl flex items-center justify-center font-black text-xs shrink-0 shadow-2xs",
                      isMain ? "bg-blue-600 text-white" : isActive ? "bg-slate-800 text-white" : "bg-slate-300 text-slate-700"
                    )}>
                      {unit.code || (isMain ? 'MAT' : 'FIL')}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold text-slate-900">{unit.name}</h3>
                        {isMain && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-200">
                            Sede / Matriz
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                        Código: <strong className="text-slate-600">{unit.code}</strong>
                        {isMain && ' • Sincronizada com Instituição'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span className={cn(
                      "text-[10px] font-bold px-2.5 py-0.5 rounded-full border",
                      isMain
                        ? "bg-blue-50 text-blue-700 border-blue-200"
                        : isActive 
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200" 
                          : "bg-amber-50 text-amber-700 border-amber-200"
                    )}>
                      {isMain ? 'Sede Institucional' : (isActive ? 'Ativa' : 'Desativada')}
                    </span>
                  </div>
                </div>

                {/* Details */}
                <div className="mt-4 pt-3 border-t border-slate-100 space-y-1.5 text-xs text-slate-600">
                  <div className="flex items-center gap-2 text-slate-500">
                    <MapPin size={13} className="shrink-0 text-slate-400" />
                    <span className="truncate">
                      {unit.address 
                        ? `${unit.address}${unit.cep ? ` • CEP ${unit.cep}` : ''}${unit.city ? ` • ${unit.city}${unit.state ? `-${unit.state}` : ''}` : ''}`
                        : 'Endereço não informado'}
                    </span>
                  </div>

                  {unit.phone && (
                    <div className="flex items-center gap-2 text-slate-500">
                      <Phone size={13} className="shrink-0 text-slate-400" />
                      <span>{unit.phone}</span>
                    </div>
                  )}

                  {unit.email && (
                    <div className="flex items-center gap-2 text-slate-500">
                      <Mail size={13} className="shrink-0 text-slate-400" />
                      <span className="truncate">{unit.email}</span>
                    </div>
                  )}

                  {unit.cnpj && (
                    <div className="flex items-center gap-2 text-slate-500 font-mono text-[11px]">
                      <FileText size={13} className="shrink-0 text-slate-400" />
                      <span>CNPJ: {unit.cnpj}</span>
                    </div>
                  )}
                </div>

                {/* Linked Records Status Badge */}
                {!isMain && (
                  <div className="mt-3 pt-2.5 border-t border-slate-100">
                    {loadingLinkedInfo ? (
                      <span className="text-[11px] text-slate-400 flex items-center gap-1.5">
                        <Loader2 size={12} className="animate-spin" /> Verificando vínculos acadêmicos...
                      </span>
                    ) : linkedInfo && linkedInfo.totalCount > 0 ? (
                      <div className="inline-flex items-center gap-1.5 text-[11px] font-medium text-amber-700 bg-amber-50 px-2.5 py-1 rounded-md border border-amber-200/80">
                        <AlertTriangle size={12} className="shrink-0 text-amber-600" />
                        <span>Possui dados vinculados: <strong>{linkedInfo.summary}</strong></span>
                      </div>
                    ) : (
                      <div className="inline-flex items-center gap-1.5 text-[11px] font-medium text-emerald-700 bg-emerald-50/70 px-2.5 py-1 rounded-md border border-emerald-200/60">
                        <Check size={12} className="shrink-0 text-emerald-600" />
                        <span>Sem dados vinculados • Exclusão permitida</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between">
                <div>
                  {isMain ? (
                    <span className="text-[11px] text-blue-600 font-medium flex items-center gap-1">
                      <School size={13} /> Polo Central do Sistema
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleToggleActive(unit)}
                      disabled={togglingId === unit.id}
                      className={cn(
                        "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer disabled:opacity-50",
                        isActive
                          ? "text-amber-700 hover:bg-amber-100/70 bg-amber-50 border border-amber-200/70"
                          : "text-emerald-700 hover:bg-emerald-100/70 bg-emerald-50 border border-emerald-200/70"
                      )}
                      title={isActive ? "Desativar polo para novas matrículas" : "Reativar polo"}
                    >
                      {togglingId === unit.id ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : (
                        <Power size={13} />
                      )}
                      {isActive ? 'Desativar' : 'Reativar'}
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleOpenEdit(unit)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer border border-slate-200/80 bg-white"
                  >
                    <Edit2 size={13} />
                    Editar
                  </button>

                  {!isMain && (
                    <button
                      type="button"
                      onClick={() => handleRequestDelete(unit)}
                      disabled={deletingId === unit.id}
                      className={cn(
                        "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer disabled:opacity-50",
                        hasLinked 
                          ? "text-slate-400 bg-slate-50 border border-slate-200 hover:bg-slate-100" 
                          : "text-red-600 hover:text-red-700 hover:bg-red-50 border border-red-200/80 bg-white"
                      )}
                      title={hasLinked ? "Esta unidade possui dados vinculados e não pode ser excluída (apenas desativada)" : "Excluir unidade permanentemente"}
                    >
                      {deletingId === unit.id ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : (
                        <Trash2 size={13} />
                      )}
                      Excluir
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal de Confirmação Seguro (Exclusão vs Desativação) */}
      {confirmModal.isOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100">
            <div className="flex items-start gap-3">
              <div className={cn(
                "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                confirmModal.type === 'delete' ? "bg-red-100 text-red-600" : "bg-amber-100 text-amber-700"
              )}>
                {confirmModal.type === 'delete' ? <Trash2 size={20} /> : <AlertTriangle size={20} />}
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {confirmModal.title}
                </h3>
                <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                  {confirmModal.description}
                </p>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                {confirmModal.type === 'blocked' ? 'Entendido' : 'Cancelar'}
              </button>

              {confirmModal.type === 'delete' ? (
                <button
                  type="button"
                  onClick={handleConfirmDelete}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer shadow-xs active:scale-95"
                >
                  Excluir Unidade
                </button>
              ) : (
                confirmModal.unit && (
                  <button
                    type="button"
                    onClick={() => {
                      const u = confirmModal.unit;
                      setConfirmModal(prev => ({ ...prev, isOpen: false }));
                      if (u) handleToggleActive(u);
                    }}
                    className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer shadow-xs active:scale-95"
                  >
                    Desativar Unidade Agora
                  </button>
                )
              )}
            </div>
          </div>
        </div>
      )}

      {/* SQL Migration Modal */}
      {isSqlModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-start justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                  <Database size={20} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-800">
                    Script SQL para Atualização do Supabase
                  </h3>
                  <p className="text-xs text-slate-500">
                    Execute este script no <strong>SQL Editor</strong> do painel Supabase para criar ou atualizar a tabela nativa de polos.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsSqlModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <div className="p-3 bg-blue-50/70 border border-blue-200/80 rounded-xl text-xs text-blue-800 space-y-1">
                <p className="font-semibold">Como aplicar no Supabase:</p>
                <p>1. Clique no botão abaixo para copiar o script SQL completo com suporte a CEP e CNPJ.</p>
                <p>2. Abra seu projeto no painel do Supabase e acesse o menu <strong>SQL Editor</strong>.</p>
                <p>3. Cole o código e clique em <strong>RUN</strong>.</p>
              </div>

              <div className="relative">
                <pre className="p-4 bg-slate-900 text-slate-100 font-mono text-[11px] rounded-xl overflow-x-auto max-h-64 leading-relaxed border border-slate-800 select-all">
                  {SUPABASE_UNITS_MIGRATION_SQL}
                </pre>
              </div>
            </div>

            <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between">
              <span className="text-[11px] text-slate-400">
                O app sincroniza via nuvem de forma redundante e segura.
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsSqlModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 rounded-lg hover:bg-slate-100 cursor-pointer"
                >
                  Fechar
                </button>
                <button
                  type="button"
                  onClick={handleCopySql}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer shadow-xs active:scale-95"
                >
                  {copiedSql ? <Check size={14} /> : <Copy size={14} />}
                  {copiedSql ? 'Copiado!' : 'Copiar Script SQL'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Criar / Editar Unidade */}
      {isModalOpen && editingUnit && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 duration-200 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                  <Building2 size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-800">
                    {editingUnit.is_main || editingUnit.id === 'matriz' 
                      ? 'Editar Sede / Matriz' 
                      : (editingUnit.id ? 'Editar Filial / Polo Educacional' : 'Nova Filial / Polo Educacional')}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    {editingUnit.is_main || editingUnit.id === 'matriz'
                      ? 'Os dados desta unidade são sincronizados com a Instituição'
                      : 'Campos com formatação automática de telefone, CEP e CNPJ'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => { setIsModalOpen(false); setEditingUnit(null); }}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Banner de Sincronia da Matriz */}
            {(editingUnit.is_main || editingUnit.id === 'matriz') && (
              <div className="mt-4 p-3 bg-blue-50/80 border border-blue-200/80 rounded-xl text-xs text-blue-800 flex items-start gap-2.5">
                <Info size={16} className="text-blue-600 shrink-0 mt-0.5" />
                <div>
                  <strong className="block font-semibold">Sincronização com Configurações da Instituição:</strong>
                  Ao alterar os dados da Matriz aqui, os campos de endereço, CEP, CNPJ, telefone e e-mail da Instituição são atualizados de forma sincronizada e automática.
                </div>
              </div>
            )}

            <form onSubmit={handleSave} className="mt-4 space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-1">
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Código <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    disabled={Boolean(editingUnit.is_main || editingUnit.id === 'matriz')}
                    value={editingUnit.code || ''}
                    onChange={(e) => {
                      const formatted = e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '').substring(0, 10);
                      setEditingUnit({ ...editingUnit, code: formatted });
                    }}
                    placeholder="FIL-01"
                    maxLength={10}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 font-mono font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent uppercase disabled:bg-slate-100 disabled:text-slate-500"
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Nome da Unidade / Polo <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={editingUnit.name || ''}
                    onChange={(e) => setEditingUnit({ ...editingUnit, name: e.target.value })}
                    placeholder="Ex: Polo Pimentas, Filial Bonsucesso..."
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-medium"
                  />
                </div>
              </div>

              {/* CNPJ e CEP */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                    CNPJ {editingUnit.is_main ? '' : '(Opcional)'}
                  </label>
                  <input
                    type="text"
                    value={editingUnit.cnpj || ''}
                    onChange={(e) => setEditingUnit({ ...editingUnit, cnpj: maskCNPJ(e.target.value) })}
                    placeholder="00.000.000/0000-00"
                    maxLength={18}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                      CEP
                    </label>
                    {loadingCep && (
                      <span className="text-[10px] text-blue-600 flex items-center gap-1 font-medium">
                        <Loader2 size={10} className="animate-spin" /> Buscando...
                      </span>
                    )}
                    {cepSuccess && (
                      <span className="text-[10px] text-emerald-600 flex items-center gap-1 font-medium">
                        <Check size={10} /> Localizado!
                      </span>
                    )}
                  </div>
                  <input
                    type="text"
                    value={editingUnit.cep || ''}
                    onChange={(e) => handleCepChange(e.target.value)}
                    placeholder="00000-000"
                    maxLength={9}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Endereço Completo
                </label>
                <input
                  type="text"
                  value={editingUnit.address || ''}
                  onChange={(e) => setEditingUnit({ ...editingUnit, address: e.target.value })}
                  placeholder="Rua, número, bairro..."
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Cidade
                  </label>
                  <input
                    type="text"
                    value={editingUnit.city || ''}
                    onChange={(e) => setEditingUnit({ ...editingUnit, city: e.target.value })}
                    placeholder="Guarulhos"
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div className="col-span-1">
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Estado (UF)
                  </label>
                  <input
                    type="text"
                    value={editingUnit.state || ''}
                    onChange={(e) => {
                      const uf = e.target.value.toUpperCase().replace(/[^A-Z]/g, '').substring(0, 2);
                      setEditingUnit({ ...editingUnit, state: uf });
                    }}
                    placeholder="SP"
                    maxLength={2}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent uppercase font-mono font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Telefone / WhatsApp
                  </label>
                  <input
                    type="text"
                    value={editingUnit.phone || ''}
                    onChange={(e) => setEditingUnit({ ...editingUnit, phone: maskPhone(e.target.value) })}
                    placeholder="(11) 98888-7777"
                    maxLength={15}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                    E-mail do Polo
                  </label>
                  <input
                    type="email"
                    value={editingUnit.email || ''}
                    onChange={(e) => setEditingUnit({ ...editingUnit, email: e.target.value.toLowerCase().trim() })}
                    placeholder="polo@exemplo.com"
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>

              {/* Status */}
              <div className="pt-2">
                {editingUnit.is_main || editingUnit.id === 'matriz' ? (
                  <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600 flex items-center gap-2">
                    <CheckCircle2 size={14} className="text-blue-600 shrink-0" />
                    <span>A Sede / Matriz está sempre ativa e operante no sistema.</span>
                  </div>
                ) : (
                  <label className="flex items-start gap-2.5 cursor-pointer select-none p-2.5 rounded-lg bg-slate-50 border border-slate-200 hover:bg-slate-100/70 transition-colors">
                    <input
                      type="checkbox"
                      checked={editingUnit.active !== false}
                      onChange={(e) => setEditingUnit({ ...editingUnit, active: e.target.checked })}
                      className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300 mt-0.5 cursor-pointer"
                    />
                    <div>
                      <span className="text-xs font-bold text-slate-800 block">
                        Unidade Ativa
                      </span>
                      <span className="text-[11px] text-slate-500 block mt-0.5 leading-snug">
                        Permite receber novas matrículas, abertura de turmas e chamadas. Se desmarcada, a unidade é suspensa mantendo todo o histórico preservado.
                      </span>
                    </div>
                  </label>
                )}
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => { setIsModalOpen(false); setEditingUnit(null); }}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 rounded-lg hover:bg-slate-100 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer shadow-xs active:scale-95 disabled:opacity-50"
                >
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                  Salvar Unidade
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
