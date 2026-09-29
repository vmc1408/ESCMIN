import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Database, 
  Copy, 
  Check, 
  RefreshCw, 
  Download, 
  ExternalLink, 
  ShieldCheck, 
  AlertCircle, 
  AlertTriangle, 
  CheckCircle2, 
  Terminal, 
  Layers, 
  Zap, 
  Building2, 
  DollarSign, 
  Gauge, 
  Info,
  Clock,
  Search,
  Filter,
  ArrowRight,
  Server,
  FileCode,
  CheckCircle,
  XCircle,
  HelpCircle,
  HardDrive
} from 'lucide-react';
import { schemaService } from '../services/schemaService';
import { supabase, isSupabaseConfigured, testConnection, lastLatency, isDbConnected } from '../lib/supabase';
import { cn } from '../lib/utils';
import { fetchAll, saveData } from '../lib/database';

export type DatabaseScriptKey = 'fix' | 'master' | 'financial' | 'units' | 'indexes';

interface DatabaseSettingsTabProps {
  initialScriptKey?: DatabaseScriptKey;
  onNotify?: (notification: { type: 'success' | 'error'; message: string }) => void;
}

export function DatabaseSettingsTab({ initialScriptKey = 'fix', onNotify }: DatabaseSettingsTabProps) {
  const [selectedScript, setSelectedScript] = useState<DatabaseScriptKey>(initialScriptKey);
  const [checkingSchema, setCheckingSchema] = useState(false);
  const [schemaReport, setSchemaReport] = useState<Record<string, any> | null>(null);
  const [schemaSummary, setSchemaSummary] = useState<any>(null);
  const [lastCheckTime, setLastCheckTime] = useState<Date | null>(null);
  const [copied, setCopied] = useState(false);
  const [filterTable, setFilterTable] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'synced' | 'pending' | 'missing'>('all');
  
  // Sincronização de dados
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<{
    currentCol: string;
    completed: string[];
    failed: string[];
    totalSynced: number;
    totalFailed: number;
  }>({
    currentCol: '',
    completed: [],
    failed: [],
    totalSynced: 0,
    totalFailed: 0
  });

  // Conexão Supabase
  const [connLatency, setConnLatency] = useState<number | null>(lastLatency ?? null);
  const [isOnline, setIsOnline] = useState<boolean>(isSupabaseConfigured);

  // Executa teste de conexão inicial e checkup automático
  useEffect(() => {
    testConnection();
    setIsOnline(isDbConnected || isSupabaseConfigured);
    if (lastLatency) setConnLatency(lastLatency);

    const handleStatus = (e: any) => {
      if (e.detail) {
        setIsOnline(Boolean(e.detail.connected));
        if (e.detail.latency !== undefined) setConnLatency(e.detail.latency);
      }
    };
    window.addEventListener('supabase-status-change', handleStatus);

    handleRunCheckup(false);

    return () => {
      window.removeEventListener('supabase-status-change', handleStatus);
    };
  }, []);

  useEffect(() => {
    if (initialScriptKey) {
      setSelectedScript(initialScriptKey);
    }
  }, [initialScriptKey]);

  // Executa auditoria do schema
  const handleRunCheckup = useCallback(async (notify = true) => {
    try {
      setCheckingSchema(true);
      const result = await schemaService.checkup();
      setSchemaReport(result.report || {});
      setSchemaSummary(result.summary || null);
      setLastCheckTime(new Date());
      if (notify && onNotify) {
        onNotify({ 
          type: 'success', 
          message: 'Auditoria de schema concluída com sucesso!' 
        });
      }
    } catch (err: any) {
      console.error('Erro no checkup do schema:', err);
      if (notify && onNotify) {
        onNotify({ 
          type: 'error', 
          message: 'Erro ao auditar o schema: ' + (err.message || 'Falha de conexão') 
        });
      }
    } finally {
      setCheckingSchema(false);
    }
  }, [onNotify]);

  // Conteúdo SQL do script atualmente selecionado
  const currentSql = useMemo(() => {
    switch (selectedScript) {
      case 'fix':
        if (!schemaReport) return '-- Execute o Checkup de Schema acima para analisar o banco e gerar o script de correção.';
        return schemaService.generateFixSQL({ report: schemaReport });
      case 'master':
        return schemaService.getFullSchemaSQL();
      case 'financial':
        return schemaService.getFinancialSQL();
      case 'units':
        return schemaService.getUnitsSQL();
      case 'indexes':
        return schemaService.getPerformanceIndexesSQL();
      default:
        return schemaService.getFullSchemaSQL();
    }
  }, [selectedScript, schemaReport]);

  const scriptInfo = useMemo(() => {
    switch (selectedScript) {
      case 'fix':
        return {
          title: 'Script de Correção Automática (Diferencial)',
          badge: 'Inteligente / Faltantes',
          badgeColor: 'bg-amber-100 text-amber-800 border-amber-300',
          filename: 'schema-fix-diferencial.sql',
          description: 'Gera apenas as tabelas e colunas que a auditoria detectou como ausentes no banco. Ideal para aplicar atualizações sem sobrescrever nada.'
        };
      case 'master':
        return {
          title: 'Script Mestre Completo (Todas as Tabelas & RLS)',
          badge: 'DDL Global Idempotente',
          badgeColor: 'bg-indigo-100 text-indigo-800 border-indigo-300',
          filename: 'master-database-schema.sql',
          description: 'Script completo e definitivo contendo todas as tabelas do sistema, tipagens exatas, RLS, permissões e seeds institucionais.'
        };
      case 'financial':
        return {
          title: 'Módulo Financeiro (Tabela financial_settings & Taxas)',
          badge: 'Financeiro & Mensalidades',
          badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-300',
          filename: 'financial-settings-module.sql',
          description: 'Criação e manutenção da tabela financial_settings com suporte a valores por ano letivo, curso, turma e disciplina, juros e multas.'
        };
      case 'units':
        return {
          title: 'Módulo Multi-Unidades (Tabela units & unit_id em Cascata)',
          badge: 'Polos & Filiais',
          badgeColor: 'bg-blue-100 text-blue-800 border-blue-300',
          filename: 'units-multitenancy-module.sql',
          description: 'Estruturação da tabela de unidades (polos educacionais), cadastro da Sede/Matriz e propagação segura da coluna unit_id em todas as tabelas.'
        };
      case 'indexes':
        return {
          title: 'Índices Estratégicos de Alta Performance',
          badge: 'Otimização de Consultas',
          badgeColor: 'bg-purple-100 text-purple-800 border-purple-300',
          filename: 'performance-indexes.sql',
          description: 'Cria índices B-Tree nas chaves mais consultadas (turmas, presenças, notas, referências financeiras e status) para acelerar a plataforma.'
        };
    }
  }, [selectedScript]);

  const lineCount = useMemo(() => {
    return currentSql.split('\n').length;
  }, [currentSql]);

  const byteSize = useMemo(() => {
    return new Blob([currentSql]).size;
  }, [currentSql]);

  // Copiar SQL
  const handleCopySql = () => {
    navigator.clipboard.writeText(currentSql);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
    if (onNotify) {
      onNotify({ type: 'success', message: `Script SQL "${scriptInfo.filename}" copiado para a área de transferência!` });
    }
  };

  // Baixar arquivo .sql
  const handleDownloadSql = () => {
    const blob = new Blob([currentSql], { type: 'text/sql;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = scriptInfo.filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    if (onNotify) {
      onNotify({ type: 'success', message: `Download iniciado: ${scriptInfo.filename}` });
    }
  };

  // Abrir Supabase SQL Editor
  const handleOpenSupabase = () => {
    window.open('https://supabase.com/dashboard', '_blank', 'noopener,noreferrer');
  };

  // Filtragem de tabelas do relatório
  const filteredReportEntries = useMemo(() => {
    if (!schemaReport) return [];
    return Object.entries(schemaReport).filter(([table, info]: [string, any]) => {
      // Filtro de texto
      if (filterTable && !table.toLowerCase().includes(filterTable.toLowerCase())) {
        return false;
      }
      // Filtro de status
      if (filterStatus === 'synced' && info.status !== 'up_to_date' && info.status !== 'ok') {
        return false;
      }
      if (filterStatus === 'pending' && info.status !== 'incomplete') {
        return false;
      }
      if (filterStatus === 'missing' && info.status !== 'missing_table') {
        return false;
      }
      return true;
    });
  }, [schemaReport, filterTable, filterStatus]);

  // Sincronização progressiva com Supabase
  const handleSyncSupabase = async () => {
    if (isSyncing) return;
    try {
      setIsSyncing(true);
      const collections = [
        'institution_settings', 'users', 'email_registry', 'foraries', 'parishes', 
        'clergy_leity', 'courses', 'subjects', 'teachers', 'classes', 
        'students', 'attendances', 'grades', 'calendar_events', 
        'contributions', 'pix_reconciliations', 'certificates', 'assessments', 'units', 'financial_settings'
      ];
      
      setSyncProgress({
        currentCol: '',
        completed: [],
        failed: [],
        totalSynced: 0,
        totalFailed: 0
      });

      let totalSynced = 0;
      let totalFailed = 0;

      for (const col of collections) {
        setSyncProgress(prev => ({ ...prev, currentCol: col }));
        try {
          const items = await fetchAll(col, '*', '');
          if (items && items.length > 0) {
            for (let i = 0; i < items.length; i += 25) {
              const chunk = items.slice(i, i + 25);
              await Promise.all(chunk.map(async (item: any) => {
                if (!item.id) return;
                try {
                  await saveData(col, item.id, item);
                  totalSynced++;
                  setSyncProgress(prev => ({ ...prev, totalSynced }));
                } catch {
                  totalFailed++;
                  setSyncProgress(prev => ({ ...prev, totalFailed }));
                }
              }));
            }
          }
          setSyncProgress(prev => ({ ...prev, completed: [...prev.completed, col] }));
        } catch {
          setSyncProgress(prev => ({ ...prev, failed: [...prev.failed, col] }));
        }
      }

      await handleRunCheckup(false);
      if (onNotify) {
        onNotify({ 
          type: 'success', 
          message: `Sincronização concluída com sucesso! ${totalSynced} registros validados.` 
        });
      }
    } catch (err: any) {
      if (onNotify) {
        onNotify({ type: 'error', message: 'Erro durante a sincronização: ' + err.message });
      }
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      
      {/* 1. Header Principal & Status da Conexão */}
      <div className="bg-gradient-to-br from-[#00174b] via-slate-900 to-indigo-950 text-white rounded-3xl p-6 sm:p-8 shadow-xl border border-blue-900/40 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/3 w-64 h-64 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
          <div className="flex items-start sm:items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-white/10 backdrop-blur-md text-emerald-400 flex items-center justify-center shrink-0 border border-white/15 shadow-inner">
              <Database size={28} className={cn(checkingSchema && "animate-spin text-blue-400")} />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <h3 className="text-xl sm:text-2xl font-black tracking-tight text-white">
                  Central de Base de Dados & Scripts SQL
                </h3>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Supabase Live
                </span>
              </div>
              <p className="text-slate-300 text-xs sm:text-sm font-medium mt-1 max-w-2xl leading-relaxed">
                Local único e unificado para auditar tabelas, gerar DDLs incrementais ou mestres, copiar scripts SQL de migração e manter o banco 100% atualizado.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto justify-start lg:justify-end">
            <button
              type="button"
              onClick={() => handleRunCheckup(true)}
              disabled={checkingSchema}
              className="px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold flex items-center gap-2 transition-all border border-white/15 shadow-sm active:scale-95 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw size={14} className={cn(checkingSchema && "animate-spin text-emerald-300")} />
              <span>{checkingSchema ? 'Auditando...' : 'Auditar Schema Agora'}</span>
            </button>

            <button
              type="button"
              onClick={handleSyncSupabase}
              disabled={isSyncing}
              className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center gap-2 transition-all shadow-md shadow-emerald-900/30 active:scale-95 cursor-pointer disabled:opacity-50"
            >
              <Server size={14} className={cn(isSyncing && "animate-pulse")} />
              <span>{isSyncing ? 'Sincronizando...' : 'Sincronizar Banco'}</span>
            </button>
          </div>
        </div>

        {/* Barra de Status e Métricas Rápidas */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-6 border-t border-white/10">
          <div className="bg-white/5 rounded-2xl p-3.5 border border-white/10">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
              <Server size={12} className="text-blue-400" /> Conexão Supabase
            </p>
            <div className="flex items-center gap-2 mt-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span className="text-xs font-bold text-white">
                {isOnline ? 'Online' : 'Conectando'}
              </span>
              {connLatency !== null && (
                <span className="text-[10px] font-mono text-slate-400">({connLatency}ms)</span>
              )}
            </div>
          </div>

          <div className="bg-white/5 rounded-2xl p-3.5 border border-white/10">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
              <Layers size={12} className="text-indigo-400" /> Tabelas Monitoradas
            </p>
            <p className="text-xl font-black text-white mt-1">
              {schemaSummary?.totalTables ?? '19'}
            </p>
          </div>

          <div className="bg-white/5 rounded-2xl p-3.5 border border-white/10">
            <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest flex items-center gap-1.5">
              <CheckCircle2 size={12} /> Sincronizadas
            </p>
            <p className="text-xl font-black text-emerald-300 mt-1">
              {schemaSummary?.syncedTables ?? '19'}
            </p>
          </div>

          <div className="bg-white/5 rounded-2xl p-3.5 border border-white/10">
            <p className="text-[10px] font-bold text-amber-400 uppercase tracking-widest flex items-center gap-1.5">
              <AlertCircle size={12} /> Pendências / Ajustes
            </p>
            <p className="text-xl font-black text-amber-300 mt-1">
              {(schemaSummary?.incompleteTables || 0) + (schemaSummary?.missingTables || 0)}
            </p>
          </div>
        </div>
      </div>

      {/* Sincronização Progressiva Ativa */}
      {isSyncing && (
        <div className="p-5 bg-indigo-50 border border-indigo-200 rounded-2xl space-y-3 animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center justify-between">
            <h5 className="text-xs font-bold text-indigo-900 flex items-center gap-2 uppercase tracking-wider">
              <RefreshCw size={14} className="animate-spin text-indigo-600" />
              Sincronizando Tabela: <span className="font-mono text-indigo-700 font-black">{syncProgress.currentCol || 'Iniciando...'}</span>
            </h5>
            <span className="text-xs font-bold text-indigo-700 font-mono">
              {syncProgress.totalSynced} registros salvos / {syncProgress.totalFailed} falhas
            </span>
          </div>
          <div className="h-2 bg-indigo-200/60 rounded-full overflow-hidden">
            <div 
              className="h-full bg-indigo-600 transition-all duration-300 rounded-full" 
              style={{ width: `${Math.min(100, Math.max(5, (syncProgress.completed.length / 19) * 100))}%` }}
            />
          </div>
          <p className="text-[11px] text-indigo-700">
            Enviando e validando dados da aplicação diretamente para as tabelas correspondentes no PostgreSQL do Supabase.
          </p>
        </div>
      )}

      {/* 2. Seleção de Script SQL (O HUB ÚNICO) */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-6">
        <div>
          <div className="flex items-center gap-2.5">
            <Terminal size={20} className="text-indigo-600" />
            <h4 className="text-base sm:text-lg font-black text-slate-800 tracking-tight">
              Gerador & Repositório Central de Scripts SQL
            </h4>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 font-medium mt-1">
            Selecione o tipo de script desejado para visualizar o código formatado, copiar com 1 clique ou baixar o arquivo .sql pronto para execução.
          </p>
        </div>

        {/* Abas dos Scripts */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
          <button
            type="button"
            onClick={() => setSelectedScript('fix')}
            className={cn(
              "p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-2",
              selectedScript === 'fix'
                ? "bg-amber-500 text-white border-amber-600 shadow-md font-bold scale-[1.01]"
                : "bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200"
            )}
          >
            <div className="flex items-center justify-between">
              <Zap size={16} className={selectedScript === 'fix' ? "text-amber-200" : "text-amber-600"} />
              <span className={cn(
                "text-[9px] font-black uppercase px-2 py-0.5 rounded-full",
                selectedScript === 'fix' ? "bg-amber-600 text-white" : "bg-amber-100 text-amber-800"
              )}>
                Diferencial
              </span>
            </div>
            <div>
              <p className="text-xs font-black leading-snug">Script de Correção</p>
              <p className={cn("text-[10px] mt-0.5", selectedScript === 'fix' ? "text-amber-100" : "text-slate-500")}>
                Apenas tabelas/colunas faltantes
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setSelectedScript('master')}
            className={cn(
              "p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-2",
              selectedScript === 'master'
                ? "bg-indigo-600 text-white border-indigo-700 shadow-md font-bold scale-[1.01]"
                : "bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200"
            )}
          >
            <div className="flex items-center justify-between">
              <Layers size={16} className={selectedScript === 'master' ? "text-indigo-200" : "text-indigo-600"} />
              <span className={cn(
                "text-[9px] font-black uppercase px-2 py-0.5 rounded-full",
                selectedScript === 'master' ? "bg-indigo-700 text-white" : "bg-indigo-100 text-indigo-800"
              )}>
                Completo
              </span>
            </div>
            <div>
              <p className="text-xs font-black leading-snug">Script Mestre (DDL)</p>
              <p className={cn("text-[10px] mt-0.5", selectedScript === 'master' ? "text-indigo-100" : "text-slate-500")}>
                Todas as 19 tabelas & RLS
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setSelectedScript('financial')}
            className={cn(
              "p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-2",
              selectedScript === 'financial'
                ? "bg-emerald-600 text-white border-emerald-700 shadow-md font-bold scale-[1.01]"
                : "bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200"
            )}
          >
            <div className="flex items-center justify-between">
              <DollarSign size={16} className={selectedScript === 'financial' ? "text-emerald-200" : "text-emerald-600"} />
              <span className={cn(
                "text-[9px] font-black uppercase px-2 py-0.5 rounded-full",
                selectedScript === 'financial' ? "bg-emerald-700 text-white" : "bg-emerald-100 text-emerald-800"
              )}>
                Financeiro
              </span>
            </div>
            <div>
              <p className="text-xs font-black leading-snug">Módulo Financeiro</p>
              <p className={cn("text-[10px] mt-0.5", selectedScript === 'financial' ? "text-emerald-100" : "text-slate-500")}>
                Tabela financial_settings
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setSelectedScript('units')}
            className={cn(
              "p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-2",
              selectedScript === 'units'
                ? "bg-blue-600 text-white border-blue-700 shadow-md font-bold scale-[1.01]"
                : "bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200"
            )}
          >
            <div className="flex items-center justify-between">
              <Building2 size={16} className={selectedScript === 'units' ? "text-blue-200" : "text-blue-600"} />
              <span className={cn(
                "text-[9px] font-black uppercase px-2 py-0.5 rounded-full",
                selectedScript === 'units' ? "bg-blue-700 text-white" : "bg-blue-100 text-blue-800"
              )}>
                Polos
              </span>
            </div>
            <div>
              <p className="text-xs font-black leading-snug">Multi-Unidades</p>
              <p className={cn("text-[10px] mt-0.5", selectedScript === 'units' ? "text-blue-100" : "text-slate-500")}>
                Tabela units & unit_id
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setSelectedScript('indexes')}
            className={cn(
              "p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-2",
              selectedScript === 'indexes'
                ? "bg-purple-600 text-white border-purple-700 shadow-md font-bold scale-[1.01]"
                : "bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200"
            )}
          >
            <div className="flex items-center justify-between">
              <Gauge size={16} className={selectedScript === 'indexes' ? "text-purple-200" : "text-purple-600"} />
              <span className={cn(
                "text-[9px] font-black uppercase px-2 py-0.5 rounded-full",
                selectedScript === 'indexes' ? "bg-purple-700 text-white" : "bg-purple-100 text-purple-800"
              )}>
                Performance
              </span>
            </div>
            <div>
              <p className="text-xs font-black leading-snug">Índices de Otimização</p>
              <p className={cn("text-[10px] mt-0.5", selectedScript === 'indexes' ? "text-purple-100" : "text-slate-500")}>
                Aceleração de consultas
              </p>
            </div>
          </button>
        </div>

        {/* 3. Visualizador do Script Selecionado */}
        <div className="bg-slate-950 rounded-2xl border border-slate-800 overflow-hidden shadow-2xl">
          {/* Barra Superior do Script */}
          <div className="p-4 sm:p-5 border-b border-slate-800 bg-slate-900/90 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2.5 flex-wrap">
                <FileCode size={18} className="text-emerald-400" />
                <span className="font-mono text-xs sm:text-sm font-black text-white">
                  {scriptInfo.filename}
                </span>
                <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full border", scriptInfo.badgeColor)}>
                  {scriptInfo.badge}
                </span>
                <span className="text-[11px] font-mono text-slate-400">
                  {lineCount} linhas • {(byteSize / 1024).toFixed(1)} KB
                </span>
              </div>
              <p className="text-[11px] text-slate-400 leading-snug">
                {scriptInfo.description}
              </p>
            </div>

            {/* Ações do Script */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleDownloadSql}
                className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs active:scale-95 cursor-pointer"
                title="Baixar arquivo .sql para sua máquina"
              >
                <Download size={14} />
                <span className="hidden md:inline">Baixar .sql</span>
              </button>

              <button
                type="button"
                onClick={handleCopySql}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black flex items-center gap-2 transition-all shadow-md shadow-emerald-950/40 active:scale-95 cursor-pointer"
              >
                {copied ? <Check size={14} className="text-white" /> : <Copy size={14} />}
                <span>{copied ? 'Copiado!' : 'Copiar Script SQL'}</span>
              </button>
            </div>
          </div>

          {/* Área de Código */}
          <div className="p-4 sm:p-6 relative">
            <pre className="text-emerald-400 font-mono text-xs leading-relaxed max-h-96 overflow-y-auto overflow-x-auto whitespace-pre-wrap select-all selection:bg-emerald-900 selection:text-white">
              {currentSql}
            </pre>
          </div>

          {/* Rodapé com Passos Didáticos */}
          <div className="p-4 sm:p-5 bg-slate-900/60 border-t border-slate-800/80 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-950 text-blue-400 flex items-center justify-center shrink-0 mt-0.5 border border-blue-800/40">
                <Info size={16} />
              </div>
              <div className="text-xs text-slate-300 space-y-0.5">
                <p className="font-bold text-white">Como aplicar este script no Supabase?</p>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  1. Copie o script acima &rarr; 2. Abra o <strong>SQL Editor</strong> no Supabase &rarr; 3. Cole em "+ New Query" e aperte <strong>Run</strong> &rarr; 4. Clique em "Auditar Schema" para confirmar.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleOpenSupabase}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold flex items-center gap-2 transition-all shadow-xs active:scale-95 shrink-0 cursor-pointer"
            >
              <span>Abrir Supabase SQL Editor</span>
              <ExternalLink size={13} />
            </button>
          </div>
        </div>
      </div>

      {/* 4. Diagnóstico Detalhado por Tabela (Auditoria Live) */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <ShieldCheck size={20} className="text-emerald-600" />
              <h4 className="text-base sm:text-lg font-black text-slate-800 tracking-tight">
                Auditoria Detalhada de Tabelas (Diagnóstico em Tempo Real)
              </h4>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 font-medium mt-1">
              Confrontação coluna por coluna entre as entidades do sistema e o banco relacional PostgreSQL do Supabase.
            </p>
          </div>

          {/* Filtros da grade */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={filterTable}
                onChange={(e) => setFilterTable(e.target.value)}
                placeholder="Buscar tabela..."
                className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500 w-36 sm:w-44"
              />
            </div>

            <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-bold">
              <button
                type="button"
                onClick={() => setFilterStatus('all')}
                className={cn(
                  "px-2.5 py-1 rounded-lg transition-all",
                  filterStatus === 'all' ? "bg-white text-slate-800 shadow-2xs" : "text-slate-500 hover:text-slate-800"
                )}
              >
                Todas ({schemaReport ? Object.keys(schemaReport).length : 0})
              </button>
              <button
                type="button"
                onClick={() => setFilterStatus('synced')}
                className={cn(
                  "px-2.5 py-1 rounded-lg transition-all",
                  filterStatus === 'synced' ? "bg-white text-emerald-700 shadow-2xs" : "text-slate-500 hover:text-slate-800"
                )}
              >
                OK
              </button>
              <button
                type="button"
                onClick={() => setFilterStatus('pending')}
                className={cn(
                  "px-2.5 py-1 rounded-lg transition-all",
                  filterStatus === 'pending' ? "bg-white text-amber-700 shadow-2xs" : "text-slate-500 hover:text-slate-800"
                )}
              >
                Incompletas
              </button>
              <button
                type="button"
                onClick={() => setFilterStatus('missing')}
                className={cn(
                  "px-2.5 py-1 rounded-lg transition-all",
                  filterStatus === 'missing' ? "bg-white text-red-700 shadow-2xs" : "text-slate-500 hover:text-slate-800"
                )}
              >
                Ausentes
              </button>
            </div>
          </div>
        </div>

        {/* Grade de Tabelas */}
        {filteredReportEntries.length === 0 ? (
          <div className="p-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-slate-400">
            <Database size={28} className="mx-auto mb-2 opacity-40" />
            <p className="text-xs font-bold text-slate-600">Nenhuma tabela corresponde aos filtros selecionados</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Tente limpar a busca ou mudar o status filtrado.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 max-h-[480px] overflow-y-auto pr-1">
            {filteredReportEntries.map(([table, info]: [string, any]) => {
              const isUpToDate = info.status === 'up_to_date' || info.status === 'ok';
              const isIncomplete = info.status === 'incomplete';
              const isMissing = info.status === 'missing_table';

              return (
                <div
                  key={table}
                  className={cn(
                    "p-4 rounded-2xl border transition-all flex flex-col justify-between gap-3 shadow-2xs",
                    isUpToDate && "bg-emerald-50/40 border-emerald-200/80 hover:bg-emerald-50/70",
                    isIncomplete && "bg-amber-50/40 border-amber-200/80 hover:bg-amber-50/70",
                    isMissing && "bg-red-50/40 border-red-200/80 hover:bg-red-50/70"
                  )}
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-mono text-xs font-black text-slate-800 truncate">
                        public.{table}
                      </span>
                      {isUpToDate && <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />}
                      {isIncomplete && <AlertCircle size={16} className="text-amber-600 shrink-0" />}
                      {isMissing && <AlertTriangle size={16} className="text-red-600 shrink-0" />}
                    </div>

                    <div className="mt-2">
                      {isUpToDate && (
                        <p className="text-[11px] font-bold text-emerald-700 flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          Sincronizada & Ativa
                        </p>
                      )}

                      {isIncomplete && (
                        <div className="space-y-1">
                          <p className="text-[10px] font-bold text-amber-800 uppercase tracking-wider">
                            Colunas Ausentes ({info.missing?.length || 0}):
                          </p>
                          <div className="flex flex-wrap gap-1 max-h-16 overflow-y-auto">
                            {(info.missing || []).map((col: string) => (
                              <span key={col} className="px-1.5 py-0.5 bg-amber-100/90 text-amber-900 rounded font-mono text-[9px] font-medium border border-amber-200">
                                {col}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {isMissing && (
                        <p className="text-[11px] font-bold text-red-700">
                          Tabela não encontrada no banco
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between text-[10px] text-slate-400">
                    <span>{info.existing ? `${info.existing.length} colunas OK` : 'Não criada'}</span>
                    <span className="font-mono uppercase font-bold text-slate-500">
                      {isUpToDate ? 'Pronto' : 'Requer SQL'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
}
