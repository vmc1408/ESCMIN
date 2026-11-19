import { supabase, isSupabaseConfigured, fetchWithTimeout } from '../lib/supabase';
import {
  fetchAll,
  saveBatch,
  saveData,
  cleanOrphanEnrollments,
  getInstitutionSettings,
  clearAllDatabaseFallbacks
} from '../lib/database';
import {
  getUnits,
  getDeletedUnitIds,
  unmarkUnitAsDeleted,
  pushUnitsToCloudRegistry,
  syncMatrizWithInstitution,
  LOCAL_STORAGE_UNITS_KEY,
  LOCAL_STORAGE_DELETED_UNITS_KEY
} from '../lib/unitService';
import { financialConfigService } from './financialConfigService';

export type BackupCategory =
  | 'Administrativo'
  | 'Segurança'
  | 'Diocese'
  | 'Acadêmico'
  | 'Financeiro'
  | 'Arquivo Morto';

export interface BackupCollectionMeta {
  id: string;
  label: string;
  category: BackupCategory;
  /** Ordem topológica de restauração (pais antes de filhos) */
  restoreOrder: number;
  /** Campos com restrição UNIQUE no PostgreSQL além de id */
  uniqueFields?: string[];
  description?: string;
}

/**
 * TODAS as 30 tabelas do schema mestre (supabase_schema.sql + blueprint.json)
 * ordenadas topologicamente para restauração segura (pais -> filhos).
 * Para limpeza em modo Substituição, utiliza-se exatamente a ordem inversa.
 */
export const BACKUP_COLLECTIONS: BackupCollectionMeta[] = [
  // 1. Base Institucional e Unidades
  { id: 'institution_settings', label: 'Configurações da Instituição', category: 'Administrativo', restoreOrder: 10 },
  { id: 'units', label: 'Unidades / Polos Educacionais', category: 'Administrativo', restoreOrder: 20 },

  // 2. Segurança e Acessos
  { id: 'users', label: 'Usuários do Sistema', category: 'Segurança', restoreOrder: 30, uniqueFields: ['email'] },
  { id: 'email_registry', label: 'Pré-Autorização de Emails', category: 'Segurança', restoreOrder: 40, uniqueFields: ['email'] },

  // 3. Parâmetros Globais
  { id: 'financial_settings', label: 'Configurações Financeiras e Taxas', category: 'Financeiro', restoreOrder: 50 },
  { id: 'academic_parameters', label: 'Parâmetros Acadêmicos Globais', category: 'Acadêmico', restoreOrder: 60 },
  { id: 'academic_settings', label: 'Configurações de Calendário', category: 'Acadêmico', restoreOrder: 70 },
  { id: 'academic_calendar_versions', label: 'Versões de Calendário Anual', category: 'Acadêmico', restoreOrder: 80 },

  // 4. Estrutura Diocesana (Foranias -> Paróquias -> Clero)
  { id: 'foraries', label: 'Foranias', category: 'Diocese', restoreOrder: 90 },
  { id: 'parishes', label: 'Paróquias', category: 'Diocese', restoreOrder: 100 },
  { id: 'clergy_leity', label: 'Clero e Leigos', category: 'Diocese', restoreOrder: 110 },

  // 5. Núcleo Acadêmico (Cursos & Professores -> Turmas & Disciplinas -> Alunos -> Matrículas & Registros)
  { id: 'courses', label: 'Cursos', category: 'Acadêmico', restoreOrder: 120 },
  { id: 'teachers', label: 'Professores', category: 'Acadêmico', restoreOrder: 130 },
  { id: 'classes', label: 'Turmas', category: 'Acadêmico', restoreOrder: 140 },
  { id: 'subjects', label: 'Disciplinas', category: 'Acadêmico', restoreOrder: 150 },
  { id: 'students', label: 'Alunos', category: 'Acadêmico', restoreOrder: 160, uniqueFields: ['registration_number'] },
  { id: 'enrollments', label: 'Matrículas em Turmas', category: 'Acadêmico', restoreOrder: 170 },
  { id: 'assessments', label: 'Avaliações Cadastradas', category: 'Acadêmico', restoreOrder: 180 },
  { id: 'grades', label: 'Notas e Boletins', category: 'Acadêmico', restoreOrder: 190 },
  { id: 'attendances', label: 'Frequência (Chamadas)', category: 'Acadêmico', restoreOrder: 200 },
  { id: 'calendar_events', label: 'Eventos e Cronograma', category: 'Acadêmico', restoreOrder: 210 },

  // 6. Financeiro e Secretaria
  { id: 'contributions', label: 'Contribuições Financeiras', category: 'Financeiro', restoreOrder: 220 },
  { id: 'pix_reconciliations', label: 'Reconciliações Pix', category: 'Financeiro', restoreOrder: 230, uniqueFields: ['transaction_id'] },
  { id: 'receipts', label: 'Recibos Emitidos', category: 'Financeiro', restoreOrder: 240 },
  { id: 'certificates', label: 'Certificados e Diplomas', category: 'Administrativo', restoreOrder: 250 },
  { id: 'import_history', label: 'Histórico de Importações', category: 'Administrativo', restoreOrder: 260 },

  // 7. Arquivo Morto (Espelhos)
  { id: 'archived_teachers', label: 'Professores Históricos (Arquivo)', category: 'Arquivo Morto', restoreOrder: 270 },
  { id: 'archived_classes', label: 'Turmas Encerradas (Arquivo)', category: 'Arquivo Morto', restoreOrder: 280 },
  { id: 'archived_subjects', label: 'Disciplinas Históricas (Arquivo)', category: 'Arquivo Morto', restoreOrder: 290 },
  { id: 'archived_students', label: 'Alunos Desligados (Arquivo)', category: 'Arquivo Morto', restoreOrder: 300 },
];

export interface BackupSystemSnapshot {
  units_reconciled?: any[];
  deleted_unit_ids?: string[];
  institution_settings?: any;
  financial_settings?: any;
  local_academic_settings?: Record<string, any>;
  annual_calendar_drafts?: Record<string, any>;
  user_shortcuts?: Record<string, string[]>;
  selected_global_unit_id?: string | null;
}

export interface BackupManifest {
  app: string;
  version: string;
  schema_version: string;
  timestamp: string;
  generated_by?: string;
  backup_type: 'geral' | 'detalhado';
  records_count: number;
  tables_count: number;
  included_tables: string[];
  table_counts: Record<string, number>;
  integrity_sha256?: string;
  system_snapshot?: BackupSystemSnapshot;
  data: Record<string, any[]>;
}

export interface GeneratedBackupResult {
  manifest: BackupManifest;
  jsonString: string;
  blob: Blob;
  defaultFileName: string;
  sizeBytes: number;
}

export type RestoreMode = 'replace' | 'merge';

export interface RestoreOptions {
  mode: RestoreMode;
  selectedTables: string[];
  clearEmptyTablesInReplace: boolean;
  preserveCurrentAdmin: boolean;
  restoreSystemCaches: boolean;
  runPostRestoreIntegrity: boolean;
  currentAdminProfile?: any;
}

export interface TableRestoreResult {
  tableId: string;
  label: string;
  deletedCount: number;
  attemptedCount: number;
  restoredCount: number;
  failedCount: number;
  warnings: string[];
  status: 'ok' | 'partial' | 'skipped' | 'error';
}

export interface RestoreReport {
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  mode: RestoreMode;
  totalTablesProcessed: number;
  totalRecordsRestored: number;
  totalRecordsDeleted: number;
  totalFailed: number;
  integrityCheckResult?: { deletedEnrollments: number; fixedStudents: number };
  tableResults: TableRestoreResult[];
  globalWarnings: string[];
}

export interface ParsedBackupValidation {
  manifest: BackupManifest;
  isValid: boolean;
  integrityStatus: 'valid' | 'mismatch' | 'legacy';
  availableTables: string[];
  totalRecords: number;
  nonEmptyTablesCount: number;
  emptyTablesCount: number;
  unknownTables: string[];
  hasSystemSnapshot: boolean;
}

const TIMESTAMP_FIELDS = new Set([
  'created_at',
  'updated_at',
  'last_login',
  'registered_at',
  'reverted_at',
  'date'
]);

const NUMERIC_FIELDS = new Set([
  'amount',
  'fee_amount',
  'default_monthly_fee',
  'late_fee_percentage',
  'weight',
  'value',
  'approval_grade',
  'recovery_grade',
  'failure_grade',
  'absence_limit_percentage'
]);

const INTEGER_FIELDS = new Set([
  'due_day',
  'reference_month',
  'reference_year',
  'duration_years',
  'duration_semesters',
  'meetings_per_week',
  'workload_hours',
  'app_lock_timeout',
  'app_inactivity_timeout',
  'class_weekday',
  'version',
  'year',
  'minimum_class_days_target',
  'total_class_days',
  'total_holidays',
  'total_recess_days',
  'manual_overrides_count',
  'record_count'
]);

/**
 * Calcula hash SHA-256 determinístico para verificação de integridade do JSON.
 */
export async function computePayloadChecksum(dataObj: Record<string, any[]>): Promise<string> {
  const canonical = JSON.stringify(dataObj);
  try {
    if (typeof window !== 'undefined' && window.crypto?.subtle) {
      const encoded = new TextEncoder().encode(canonical);
      const hashBuffer = await window.crypto.subtle.digest('SHA-256', encoded);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }
  } catch {}
  // Fallback determinístico FNV-1a 64-bit simulado em hex se WebCrypto indisponível
  let h1 = 0x811c9dc5;
  let h2 = 0x811c9dc5;
  for (let i = 0; i < canonical.length; i++) {
    const ch = canonical.charCodeAt(i);
    h1 ^= ch;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= ch ^ (i & 0xff);
    h2 = Math.imul(h2, 0x01000193);
  }
  return `fnv_${(h1 >>> 0).toString(16).padStart(8, '0')}${(h2 >>> 0).toString(16).padStart(8, '0')}`;
}

/**
 * Coleta snapshot completo de configurações e estados auxiliares do sistema
 * para garantir que o sistema restaurado volte 100% operacional.
 */
async function collectSystemSnapshot(): Promise<BackupSystemSnapshot> {
  const snapshot: BackupSystemSnapshot = {};

  try {
    snapshot.units_reconciled = await getUnits();
  } catch {}

  try {
    snapshot.deleted_unit_ids = Array.from(getDeletedUnitIds());
  } catch {}

  try {
    snapshot.institution_settings = await getInstitutionSettings();
  } catch {}

  try {
    financialConfigService.invalidateCache();
    snapshot.financial_settings = await financialConfigService.getSettings();
  } catch {}

  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      snapshot.selected_global_unit_id = localStorage.getItem('selected_global_unit_id');

      const localAcad: Record<string, any> = {};
      const calDrafts: Record<string, any> = {};
      const shortcuts: Record<string, string[]> = {};

      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key) continue;
        try {
          if (key.startsWith('academic_settings_')) {
            const val = localStorage.getItem(key);
            if (val) localAcad[key] = JSON.parse(val);
          } else if (key.startsWith('annual_calendar_draft_') || key.startsWith('annual_calendar_versions_')) {
            const val = localStorage.getItem(key);
            if (val) calDrafts[key] = JSON.parse(val);
          } else if (key.startsWith('favorite_shortcuts') || key.includes('shortcuts')) {
            const val = localStorage.getItem(key);
            if (val) {
              const parsed = JSON.parse(val);
              if (Array.isArray(parsed)) shortcuts[key] = parsed;
            }
          }
        } catch {}
      }

      if (Object.keys(localAcad).length > 0) snapshot.local_academic_settings = localAcad;
      if (Object.keys(calDrafts).length > 0) snapshot.annual_calendar_drafts = calDrafts;
      if (Object.keys(shortcuts).length > 0) snapshot.user_shortcuts = shortcuts;
    }
  } catch {}

  return snapshot;
}

/**
 * Gera o pacote completo de backup contemplando todas as 30 tabelas, configurações e metadados.
 */
export async function generateBackupPackage(params: {
  backupType: 'geral' | 'detalhado';
  selectedTables: string[];
  generatedBy?: string;
  onProgress?: (info: {
    percent: number;
    currentStep: string;
    completedTablesCount: number;
    totalTablesCount: number;
    recordsProcessed: number;
  }) => void;
}): Promise<GeneratedBackupResult> {
  const { backupType, selectedTables, generatedBy, onProgress } = params;
  const tablesToBackup =
    backupType === 'geral'
      ? BACKUP_COLLECTIONS.map(c => c.id)
      : BACKUP_COLLECTIONS.map(c => c.id).filter(id => selectedTables.includes(id));

  const backupPayload: Record<string, any[]> = {};
  const tableCounts: Record<string, number> = {};
  let totalRecordsProcessed = 0;

  for (let i = 0; i < tablesToBackup.length; i++) {
    const tableId = tablesToBackup[i];
    const tableMeta = BACKUP_COLLECTIONS.find(c => c.id === tableId);

    onProgress?.({
      currentStep: `Extraindo tabela [${i + 1}/${tablesToBackup.length}]: ${tableMeta?.label || tableId}...`,
      percent: Math.round((i / tablesToBackup.length) * 80),
      completedTablesCount: i,
      totalTablesCount: tablesToBackup.length,
      recordsProcessed: totalRecordsProcessed
    });

    let records = (await fetchAll(tableId)) || [];

    // Reconciliação especial para 'units': garante que a Matriz e polos em nuvem constem mesmo se a tabela nativa divergir
    if (tableId === 'units') {
      try {
        const reconciled = await getUnits();
        if (Array.isArray(reconciled) && reconciled.length > 0) {
          const map = new Map<string, any>();
          records.forEach((u: any) => {
            if (u?.id) map.set(u.id, u);
          });
          reconciled.forEach((u: any) => {
            if (u?.id && !map.has(u.id)) {
              map.set(u.id, u);
            } else if (u?.id === 'matriz') {
              map.set('matriz', { ...(map.get('matriz') || {}), ...u });
            }
          });
          records = Array.from(map.values());
        }
      } catch {}
    }

    // Reconciliação especial para 'financial_settings': garante as regras completas inclusive custom_rules/subject_fees
    if (tableId === 'financial_settings') {
      try {
        financialConfigService.invalidateCache();
        const fullFin = await financialConfigService.getSettings();
        if (fullFin) {
          const idx = records.findIndex((r: any) => r?.id === 'current');
          if (idx >= 0) {
            records[idx] = { ...records[idx], ...fullFin, id: 'current' };
          } else {
            records = [{ ...fullFin, id: 'current' }, ...records];
          }
        }
      } catch {}
    }

    // Reconciliação especial para 'institution_settings'
    if (tableId === 'institution_settings' && records.length === 0) {
      try {
        const inst = await getInstitutionSettings();
        if (inst && inst.name) {
          records = [{ ...inst, id: inst.id || '1' }];
        }
      } catch {}
    }

    // SEMPRE registra a chave da tabela mesmo com 0 registros para manter integridade em restauração limpa
    backupPayload[tableId] = records;
    tableCounts[tableId] = records.length;
    totalRecordsProcessed += records.length;

    onProgress?.({
      currentStep: `Extraído ${tableMeta?.label || tableId}: ${records.length} registro(s).`,
      percent: Math.round(((i + 1) / tablesToBackup.length) * 80),
      completedTablesCount: i + 1,
      totalTablesCount: tablesToBackup.length,
      recordsProcessed: totalRecordsProcessed
    });
  }

  onProgress?.({
    currentStep: 'Coletando parâmetros de ambiente e assinatura de integridade...',
    percent: 88,
    completedTablesCount: tablesToBackup.length,
    totalTablesCount: tablesToBackup.length,
    recordsProcessed: totalRecordsProcessed
  });

  const systemSnapshot = await collectSystemSnapshot();
  const checksum = await computePayloadChecksum(backupPayload);

  const manifest: BackupManifest = {
    app: 'SISTEMA ACADEMICO ESCMIN - GESTÃO EDUCACIONAL',
    version: '4.0.0-complete',
    schema_version: '30-tables-v4',
    timestamp: new Date().toISOString(),
    generated_by: generatedBy || undefined,
    backup_type: backupType,
    records_count: totalRecordsProcessed,
    tables_count: tablesToBackup.length,
    included_tables: tablesToBackup,
    table_counts: tableCounts,
    integrity_sha256: checksum,
    system_snapshot: systemSnapshot,
    data: backupPayload
  };

  onProgress?.({
    currentStep: 'Empacotando arquivo JSON de segurança...',
    percent: 96,
    completedTablesCount: tablesToBackup.length,
    totalTablesCount: tablesToBackup.length,
    recordsProcessed: totalRecordsProcessed
  });

  const jsonString = JSON.stringify(manifest, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8' });
  const now = new Date();
  const datePart = now.toISOString().split('T')[0];
  const timePart = `${String(now.getHours()).padStart(2, '0')}h${String(now.getMinutes()).padStart(2, '0')}`;
  const typeLabel = backupType === 'geral' ? 'completo' : 'seletivo';
  const defaultFileName = `escmin-backup-${typeLabel}-${datePart}_${timePart}.json`;

  onProgress?.({
    currentStep: 'Backup gerado! Aguardando escolha de destino para salvamento...',
    percent: 100,
    completedTablesCount: tablesToBackup.length,
    totalTablesCount: tablesToBackup.length,
    recordsProcessed: totalRecordsProcessed
  });

  return {
    manifest,
    jsonString,
    blob,
    defaultFileName,
    sizeBytes: blob.size
  };
}

/**
 * Verifica se o navegador suporta showSaveFilePicker no contexto atual.
 */
export function supportsNativeSavePicker(): boolean {
  if (typeof window === 'undefined') return false;
  return typeof (window as any).showSaveFilePicker === 'function';
}

/**
 * Solicita ao usuário onde salvar usando File System Access API (Diálogo nativo Salvar Como...).
 */
export async function saveBackupWithNativePicker(
  blob: Blob,
  suggestedName: string
): Promise<{ status: 'saved' | 'cancelled' | 'unavailable'; fileName?: string; reason?: string }> {
  if (!supportsNativeSavePicker()) {
    return { status: 'unavailable', reason: 'Navegador sem suporte a seleção de pasta (File System Access API).' };
  }

  const finalName = suggestedName.toLowerCase().endsWith('.json') ? suggestedName : `${suggestedName}.json`;

  try {
    const fileHandle = await (window as any).showSaveFilePicker({
      suggestedName: finalName,
      types: [
        {
          description: 'Backup do Sistema ESCMIN (JSON)',
          accept: { 'application/json': ['.json'] }
        }
      ]
    });
    const writable = await fileHandle.createWritable();
    await writable.write(blob);
    await writable.close();
    return { status: 'saved', fileName: fileHandle.name || finalName };
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      return { status: 'cancelled' };
    }
    return {
      status: 'unavailable',
      reason: err?.message || 'O navegador bloqueou o seletor nativo neste contexto (ex: iframe ou expiração de clique).'
    };
  }
}

/**
 * Dispara download padrão via navegador (usando nome escolhido pelo usuário).
 */
export function triggerFallbackDownload(blob: Blob, fileName: string): string {
  const finalName = fileName.toLowerCase().endsWith('.json') ? fileName : `${fileName}.json`;
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = finalName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  return finalName;
}

/**
 * Faz o parse e validação completa de integridade de um arquivo JSON de backup.
 */
export async function parseAndValidateBackupFile(text: string): Promise<ParsedBackupValidation> {
  const parsed = JSON.parse(text);

  if (!parsed || typeof parsed !== 'object' || !parsed.data || typeof parsed.data !== 'object' || Array.isArray(parsed.data)) {
    throw new Error('Estrutura inválida. O arquivo selecionado não contém o bloco de dados "data" do backup ESCMIN.');
  }

  // Aceita backups ESCMIN v3 e v4, ou qualquer JSON válido que tenha tabelas conhecidas em data
  const knownIds = new Set(BACKUP_COLLECTIONS.map(c => c.id));
  const dataKeys = Object.keys(parsed.data);
  const recognizedKeys = dataKeys.filter(k => knownIds.has(k));

  if (!parsed.app && recognizedKeys.length === 0) {
    throw new Error('Arquivo não reconhecido como um backup válido do Sistema ESCMIN.');
  }

  const unknownTables = dataKeys.filter(k => !knownIds.has(k));

  let totalRecords = 0;
  let nonEmptyTablesCount = 0;
  let emptyTablesCount = 0;

  for (const key of dataKeys) {
    const arr = parsed.data[key];
    if (Array.isArray(arr)) {
      totalRecords += arr.length;
      if (arr.length > 0) nonEmptyTablesCount++;
      else emptyTablesCount++;
    }
  }

  let integrityStatus: 'valid' | 'mismatch' | 'legacy' = 'legacy';
  if (parsed.integrity_sha256) {
    const computed = await computePayloadChecksum(parsed.data);
    integrityStatus = computed === parsed.integrity_sha256 ? 'valid' : 'mismatch';
  }

  const manifest: BackupManifest = {
    app: parsed.app || 'ESCMIN Backup',
    version: parsed.version || '3.x',
    schema_version: parsed.schema_version || 'legacy',
    timestamp: parsed.timestamp || new Date().toISOString(),
    generated_by: parsed.generated_by,
    backup_type: parsed.backup_type || 'geral',
    records_count: parsed.records_count ?? totalRecords,
    tables_count: parsed.tables_count ?? dataKeys.length,
    included_tables: parsed.included_tables || dataKeys,
    table_counts: parsed.table_counts || {},
    integrity_sha256: parsed.integrity_sha256,
    system_snapshot: parsed.system_snapshot,
    data: parsed.data
  };

  return {
    manifest,
    isValid: true,
    integrityStatus,
    availableTables: sortTablesForRestore(dataKeys),
    totalRecords,
    nonEmptyTablesCount,
    emptyTablesCount,
    unknownTables,
    hasSystemSnapshot: Boolean(parsed.system_snapshot)
  };
}

/**
 * Ordena tabelas na ordem topológica correta (pais antes de filhos) para inserção/upsert.
 */
export function sortTablesForRestore(tableIds: string[]): string[] {
  const orderMap = new Map<string, number>();
  BACKUP_COLLECTIONS.forEach(c => orderMap.set(c.id, c.restoreOrder));

  return [...tableIds].sort((a, b) => {
    const oa = orderMap.get(a) ?? 999;
    const ob = orderMap.get(b) ?? 999;
    return oa - ob;
  });
}

/**
 * Ordena tabelas na ordem reversa (filhos antes de pais) para limpeza segura antes de restaurar.
 */
export function sortTablesForClean(tableIds: string[]): string[] {
  return sortTablesForRestore(tableIds).reverse();
}

/**
 * Sanitiza cada registro antes de enviar ao Supabase, prevenindo falhas de tipo
 * (ex: strings vazias "" em campos timestamp/numéricos ou ausência de ID).
 */
function sanitizeRecordForRestore(tableId: string, raw: any, rowIndex: number): any {
  const record: any = { ...raw };

  if (!record.id || String(record.id).trim() === '') {
    record.id = crypto.randomUUID();
  }

  for (const key of Object.keys(record)) {
    const val = record[key];
    if (val === undefined) {
      delete record[key];
      continue;
    }

    if (TIMESTAMP_FIELDS.has(key) && val === '') {
      if (key === 'created_at') {
        record[key] = new Date().toISOString();
      } else {
        record[key] = null;
      }
    }

    if (NUMERIC_FIELDS.has(key)) {
      if (val === '' || val === null) {
        if (key === 'amount' || key === 'value' || key === 'fee_amount' || key === 'late_fee_percentage') {
          record[key] = 0;
        } else {
          delete record[key];
        }
      } else if (typeof val === 'string') {
        const parsed = Number(val);
        if (!Number.isNaN(parsed)) record[key] = parsed;
      }
    }

    if (INTEGER_FIELDS.has(key)) {
      if (val === '' || val === null) {
        delete record[key];
      } else if (typeof val === 'string') {
        const parsed = parseInt(val, 10);
        if (!Number.isNaN(parsed)) record[key] = parsed;
      }
    }
  }

  // Garantias de campos NOT NULL críticos em tabelas específicas
  if (tableId === 'students') {
    const reg = record.registration_number ? String(record.registration_number).trim() : '';
    if (!reg || reg === 'null' || reg === 'undefined') {
      record.registration_number = `${String(rowIndex + 1).padStart(6, '0')}${new Date().getFullYear()}`;
    }
    if (!record.name) record.name = 'Aluno Restaurado';
  } else if (tableId === 'users') {
    if (!record.name && record.full_name) record.name = record.full_name;
    if (!record.name && record.email) record.name = String(record.email).split('@')[0];
    if (!record.role) record.role = 'assistente';
    if (!record.status) record.status = 'active';
  } else if (tableId === 'units') {
    if (record.id === 'matriz' || record.is_main) {
      record.id = 'matriz';
      record.code = record.code || 'MAT';
      record.name = record.name || 'Matriz - Itapegica';
      record.is_main = true;
      record.active = true;
    }
  }

  return record;
}

/**
 * Limpa uma tabela do Supabase em lotes sem disparar loops redundantes de deleteData.
 */
async function clearTableRecords(
  tableId: string,
  options: { protectUnitMatriz?: boolean; protectAdminId?: string | null }
): Promise<{ deletedCount: number; warning?: string }> {
  if (!isSupabaseConfigured) return { deletedCount: 0 };

  try {
    const existingRows = await fetchAll(tableId, 'id', '');
    if (!Array.isArray(existingRows) || existingRows.length === 0) {
      return { deletedCount: 0 };
    }

    const idsToDelete = existingRows
      .map((r: any) => r?.id)
      .filter((id: any) => {
        if (!id) return false;
        if (options.protectUnitMatriz && id === 'matriz') return false;
        if (options.protectAdminId && id === options.protectAdminId) return false;
        return true;
      });

    if (idsToDelete.length === 0) return { deletedCount: 0 };

    const DELETE_CHUNK = 200;
    let deletedTotal = 0;

    for (let i = 0; i < idsToDelete.length; i += DELETE_CHUNK) {
      const chunk = idsToDelete.slice(i, i + DELETE_CHUNK);
      const res = await fetchWithTimeout(
        () => supabase.from(tableId).delete().in('id', chunk),
        30000
      );

      if (res?.error) {
        // Fallback individual se houver alguma linha bloqueada por constraint
        for (const singleId of chunk) {
          const singleRes = await fetchWithTimeout(
            () => supabase.from(tableId).delete().eq('id', singleId),
            10000
          );
          if (!singleRes?.error) deletedTotal++;
        }
      } else {
        deletedTotal += chunk.length;
      }
    }

    return { deletedCount: deletedTotal };
  } catch (err: any) {
    return {
      deletedCount: 0,
      warning: `Aviso ao limpar tabela ${tableId}: ${err?.message || err}`
    };
  }
}

/**
 * Trata conflito de chave única (ex: email em users/email_registry, registration_number em students, transaction_id em pix)
 * em modo de Mesclagem (Upsert) quando o ID difere mas o campo único já existe no banco.
 */
async function resolveUniqueConflictAndSaveRow(tableId: string, row: any): Promise<boolean> {
  const colMeta = BACKUP_COLLECTIONS.find(c => c.id === tableId);
  const uniqueFields = colMeta?.uniqueFields || [];

  for (const field of uniqueFields) {
    const val = row[field];
    if (!val) continue;

    try {
      const { data: existing } = await supabase
        .from(tableId)
        .select('id')
        .eq(field, val)
        .maybeSingle();

      if (existing?.id) {
        // Atualiza o registro existente preservando seu ID no banco para evitar violação UNIQUE
        const updatePayload = { ...row, id: existing.id };
        await saveData(tableId, existing.id, updatePayload, 20000);
        return true;
      }
    } catch {}
  }

  return false;
}

/**
 * Restaura os registros de uma tabela em lotes seguros com fallback linha-a-linha em caso de erro pontual.
 */
async function restoreTableRowsInChunks(
  tableId: string,
  items: any[],
  onChunkProgress?: (processedInTable: number) => void
): Promise<{ restored: number; failed: number; warnings: string[] }> {
  if (!items || items.length === 0) {
    return { restored: 0, failed: 0, warnings: [] };
  }

  const sanitized = items.map((item, idx) => sanitizeRecordForRestore(tableId, item, idx));
  const CHUNK_SIZE = 200;
  let restored = 0;
  let failed = 0;
  const warnings: string[] = [];

  for (let i = 0; i < sanitized.length; i += CHUNK_SIZE) {
    const chunk = sanitized.slice(i, i + CHUNK_SIZE);
    try {
      await saveBatch(tableId, chunk, 35000);
      restored += chunk.length;
    } catch (batchErr: any) {
      // Fallback linha a linha para que 1 registro problemático não invalide o lote inteiro
      for (const row of chunk) {
        try {
          await saveData(tableId, row.id, row, 20000);
          restored++;
        } catch (rowErr: any) {
          const msg = rowErr?.message || String(rowErr);
          // Se erro for UNIQUE constraint (23505), tenta reconciliar pela chave única
          if (msg.includes('23505') || msg.toLowerCase().includes('duplicate key') || msg.toLowerCase().includes('unique')) {
            const resolved = await resolveUniqueConflictAndSaveRow(tableId, row);
            if (resolved) {
              restored++;
              continue;
            }
          }
          failed++;
          if (warnings.length < 5) {
            warnings.push(`ID ${row.id}: ${msg}`);
          }
        }
      }
      if (warnings.length === 5) {
        warnings.push(`... e possíveis avisos adicionais em ${tableId}.`);
      }
      console.warn(`[BackupRestore] Lote parcial em "${tableId}": ${batchErr?.message || batchErr}`);
    }

    onChunkProgress?.(Math.min(i + chunk.length, sanitized.length));
  }

  return { restored, failed, warnings };
}

/**
 * Executa a restauração parametrizada e completa deixando o sistema pronto para funcionar imediatamente.
 */
export async function executeParameterizedRestore(
  manifest: BackupManifest,
  options: RestoreOptions,
  onProgress?: (info: {
    percent: number;
    currentStep: string;
    completedTablesCount: number;
    totalTablesCount: number;
    recordsRestored: number;
  }) => void
): Promise<RestoreReport> {
  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  const dataObj = manifest.data || {};
  const orderedRestoreTables = sortTablesForRestore(
    options.selectedTables.filter(t => Object.prototype.hasOwnProperty.call(dataObj, t))
  );
  const orderedCleanTables = sortTablesForClean(orderedRestoreTables);

  const reportMap = new Map<string, TableRestoreResult>();
  orderedRestoreTables.forEach(tableId => {
    const meta = BACKUP_COLLECTIONS.find(c => c.id === tableId);
    const items = Array.isArray(dataObj[tableId]) ? dataObj[tableId] : [];
    reportMap.set(tableId, {
      tableId,
      label: meta?.label || tableId,
      deletedCount: 0,
      attemptedCount: items.length,
      restoredCount: 0,
      failedCount: 0,
      warnings: [],
      status: 'ok'
    });
  });

  const globalWarnings: string[] = [];
  let totalRestored = 0;
  let totalDeleted = 0;
  let totalFailed = 0;

  // Snapshot de segurança do administrador logado (se habilitado)
  let adminBackupRecord: any = null;
  if (options.preserveCurrentAdmin && options.currentAdminProfile) {
    try {
      const adminId = options.currentAdminProfile.id;
      const adminEmail = options.currentAdminProfile.email;
      const liveUsers = await fetchAll('users').catch(() => []);
      adminBackupRecord =
        liveUsers.find((u: any) => (adminId && u.id === adminId) || (adminEmail && u.email === adminEmail)) ||
        options.currentAdminProfile;
    } catch {
      adminBackupRecord = options.currentAdminProfile;
    }
  }

  const totalSteps =
    (options.mode === 'replace' ? orderedCleanTables.length : 0) + orderedRestoreTables.length + 2;
  let currentStepIdx = 0;

  // ============================================================================
  // FASE 1: LIMPEZA TOPOLÓGICA REVERSA (somente no modo Substituição Limpa)
  // ============================================================================
  if (options.mode === 'replace') {
    for (let i = 0; i < orderedCleanTables.length; i++) {
      const tableId = orderedCleanTables[i];
      const items = Array.isArray(dataObj[tableId]) ? dataObj[tableId] : [];
      const meta = BACKUP_COLLECTIONS.find(c => c.id === tableId);

      currentStepIdx++;
      onProgress?.({
        percent: Math.round((currentStepIdx / totalSteps) * 90),
        currentStep: `Limpando tabela [${i + 1}/${orderedCleanTables.length}]: ${meta?.label || tableId}...`,
        completedTablesCount: i,
        totalTablesCount: orderedRestoreTables.length,
        recordsRestored: totalRestored
      });

      if (items.length === 0 && !options.clearEmptyTablesInReplace) {
        const entry = reportMap.get(tableId)!;
        entry.warnings.push('Tabela vazia no backup mantida sem limpeza (conforme parâmetro).');
        continue;
      }

      const { deletedCount, warning } = await clearTableRecords(tableId, {
        protectUnitMatriz: tableId === 'units' && items.length === 0,
        protectAdminId:
          tableId === 'users' && options.preserveCurrentAdmin && adminBackupRecord?.id
            ? adminBackupRecord.id
            : null
      });

      const entry = reportMap.get(tableId)!;
      entry.deletedCount = deletedCount;
      totalDeleted += deletedCount;
      if (warning) entry.warnings.push(warning);
    }
  }

  // ============================================================================
  // FASE 2: INSERÇÃO / UPSERT EM ORDEM TOPOLÓGICA (PAIS -> FILHOS)
  // ============================================================================
  for (let i = 0; i < orderedRestoreTables.length; i++) {
    const tableId = orderedRestoreTables[i];
    const items = Array.isArray(dataObj[tableId]) ? dataObj[tableId] : [];
    const meta = BACKUP_COLLECTIONS.find(c => c.id === tableId);
    const entry = reportMap.get(tableId)!;

    currentStepIdx++;
    onProgress?.({
      percent: Math.round((currentStepIdx / totalSteps) * 90),
      currentStep: `Restaurando [${i + 1}/${orderedRestoreTables.length}]: ${meta?.label || tableId} (${items.length} reg)...`,
      completedTablesCount: i,
      totalTablesCount: orderedRestoreTables.length,
      recordsRestored: totalRestored
    });

    if (items.length === 0) {
      entry.status = options.mode === 'replace' && options.clearEmptyTablesInReplace ? 'ok' : 'skipped';
      continue;
    }

    const { restored, failed, warnings } = await restoreTableRowsInChunks(tableId, items, (processed) => {
      onProgress?.({
        percent: Math.round((currentStepIdx / totalSteps) * 90),
        currentStep: `Gravando ${meta?.label || tableId}: ${processed}/${items.length} reg...`,
        completedTablesCount: i,
        totalTablesCount: orderedRestoreTables.length,
        recordsRestored: totalRestored + processed
      });
    });

    entry.restoredCount = restored;
    entry.failedCount = failed;
    entry.warnings.push(...warnings);
    if (failed > 0 && restored > 0) entry.status = 'partial';
    else if (failed > 0 && restored === 0) entry.status = 'error';
    else entry.status = 'ok';

    totalRestored += restored;
    totalFailed += failed;
  }

  // ============================================================================
  // FASE 3: RECONCILIAÇÃO DE ADMINISTRADOR, CACHES E CONFIGURAÇÕES DO SISTEMA
  // ============================================================================
  currentStepIdx++;
  onProgress?.({
    percent: 94,
    currentStep: 'Sincronizando parâmetros institucionais, financeiros e polos...',
    completedTablesCount: orderedRestoreTables.length,
    totalTablesCount: orderedRestoreTables.length,
    recordsRestored: totalRestored
  });

  // 3.1 Preservação do administrador ativo caso ausente no backup
  if (options.preserveCurrentAdmin && adminBackupRecord && orderedRestoreTables.includes('users')) {
    try {
      const restoredUsers = Array.isArray(dataObj.users) ? dataObj.users : [];
      const existsInBackup = restoredUsers.some(
        (u: any) =>
          (adminBackupRecord.id && u.id === adminBackupRecord.id) ||
          (adminBackupRecord.email &&
            String(u.email || '').toLowerCase() === String(adminBackupRecord.email || '').toLowerCase())
      );
      if (!existsInBackup && adminBackupRecord.email) {
        await saveData('users', adminBackupRecord.id, adminBackupRecord).catch(() => {});
        globalWarnings.push(
          `Perfil do administrador atual (${adminBackupRecord.email}) preservado para manter o acesso ativo.`
        );
      }
    } catch {}
  }

  // 3.2 Reconciliação de caches e configurações para operação imediata
  if (options.restoreSystemCaches) {
    try {
      clearAllDatabaseFallbacks();
    } catch {}

    // Unidades / Polos
    if (orderedRestoreTables.includes('units')) {
      try {
        const restoredUnits = Array.isArray(dataObj.units) ? dataObj.units : [];
        if (options.mode === 'replace' && Array.isArray(manifest.system_snapshot?.deleted_unit_ids)) {
          localStorage.setItem(
            LOCAL_STORAGE_DELETED_UNITS_KEY,
            JSON.stringify(manifest.system_snapshot.deleted_unit_ids)
          );
        } else {
          // Garante que nenhuma unidade presente no backup fique bloqueada no tombstone local
          restoredUnits.forEach((u: any) => {
            if (u?.id) unmarkUnitAsDeleted(u.id, u.code);
          });
        }

        if (restoredUnits.length > 0) {
          localStorage.setItem(LOCAL_STORAGE_UNITS_KEY, JSON.stringify(restoredUnits));
          await pushUnitsToCloudRegistry(restoredUnits).catch(() => {});
        }
        await getUnits().catch(() => []);
        window.dispatchEvent(new CustomEvent('units-updated'));
      } catch (e: any) {
        globalWarnings.push(`Aviso ao sincronizar polos/unidades: ${e?.message || e}`);
      }
    }

    // Configurações da Instituição
    if (orderedRestoreTables.includes('institution_settings')) {
      try {
        const instList = Array.isArray(dataObj.institution_settings) ? dataObj.institution_settings : [];
        const mainInst = instList[0] || manifest.system_snapshot?.institution_settings;
        if (mainInst) {
          localStorage.setItem('cached_institution_settings', JSON.stringify(mainInst));
          await syncMatrizWithInstitution(mainInst).catch(() => {});
        } else {
          await getInstitutionSettings().catch(() => null);
        }
        window.dispatchEvent(new Event('institution-updated'));
      } catch (e: any) {
        globalWarnings.push(`Aviso ao atualizar cache institucional: ${e?.message || e}`);
      }
    }

    // Configurações Financeiras
    if (orderedRestoreTables.includes('financial_settings')) {
      try {
        financialConfigService.invalidateCache();
        const finList = Array.isArray(dataObj.financial_settings) ? dataObj.financial_settings : [];
        const finRecord =
          finList.find((f: any) => f?.id === 'current') ||
          finList[0] ||
          manifest.system_snapshot?.financial_settings;

        if (finRecord) {
          await financialConfigService.saveSettings(finRecord).catch(() => {});
        } else {
          await financialConfigService.getSettings().catch(() => null);
        }
      } catch (e: any) {
        globalWarnings.push(`Aviso ao sincronizar configurações financeiras: ${e?.message || e}`);
      }
    }

    // Configurações Acadêmicas e Versões de Calendário
    if (
      orderedRestoreTables.includes('academic_settings') ||
      orderedRestoreTables.includes('academic_parameters') ||
      orderedRestoreTables.includes('academic_calendar_versions')
    ) {
      try {
        const acadList = Array.isArray(dataObj.academic_settings) ? dataObj.academic_settings : [];
        acadList.forEach((s: any) => {
          if (s?.id) {
            localStorage.setItem(`academic_settings_${s.id}`, JSON.stringify(s));
            if (s.id === 'current' || s.unit_id === 'matriz') {
              localStorage.setItem('academic_settings_current', JSON.stringify(s));
            }
          }
        });
        if (manifest.system_snapshot?.local_academic_settings) {
          Object.entries(manifest.system_snapshot.local_academic_settings).forEach(([k, v]) => {
            try {
              localStorage.setItem(k, JSON.stringify(v));
            } catch {}
          });
        }
        window.dispatchEvent(new Event('academic-settings-updated'));
      } catch {}
    }

    // Atalhos favoritos se presentes no snapshot
    if (orderedRestoreTables.includes('users') && manifest.system_snapshot?.user_shortcuts) {
      try {
        Object.entries(manifest.system_snapshot.user_shortcuts).forEach(([k, v]) => {
          if (Array.isArray(v)) {
            localStorage.setItem(k, JSON.stringify(v));
          }
        });
      } catch {}
    }
  }

  // ============================================================================
  // FASE 4: INTEGRIDADE REFERENCIAL PÓS-RESTAURAÇÃO
  // ============================================================================
  currentStepIdx++;
  let integrityCheckResult: { deletedEnrollments: number; fixedStudents: number } | undefined;

  if (
    options.runPostRestoreIntegrity &&
    orderedRestoreTables.includes('students') &&
    orderedRestoreTables.includes('classes') &&
    orderedRestoreTables.includes('enrollments')
  ) {
    onProgress?.({
      percent: 98,
      currentStep: 'Verificando integridade referencial (turmas, alunos e matrículas)...',
      completedTablesCount: orderedRestoreTables.length,
      totalTablesCount: orderedRestoreTables.length,
      recordsRestored: totalRestored
    });

    try {
      integrityCheckResult = await cleanOrphanEnrollments();
    } catch {}
  }

  onProgress?.({
    percent: 100,
    currentStep: 'Restauração concluída! Sistema pronto para operação.',
    completedTablesCount: orderedRestoreTables.length,
    totalTablesCount: orderedRestoreTables.length,
    recordsRestored: totalRestored
  });

  const finishedAt = new Date().toISOString();
  return {
    startedAt,
    finishedAt,
    durationMs: Date.now() - t0,
    mode: options.mode,
    totalTablesProcessed: orderedRestoreTables.length,
    totalRecordsRestored: totalRestored,
    totalRecordsDeleted: totalDeleted,
    totalFailed,
    integrityCheckResult,
    tableResults: Array.from(reportMap.values()),
    globalWarnings
  };
}
