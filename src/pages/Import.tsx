import React, { useState, useEffect, useRef } from 'react';
import { 
  CloudUpload, 
  FileText, 
  CheckCircle2, 
  AlertCircle,
  Loader2,
  Users,
  UserSquare2,
  School,
  BookOpen,
  Church,
  Map as MapIcon,
  History,
  RotateCcw,
  Trash2,
  ArrowRight,
  ChevronRight,
  Clock,
  Eye,
  AlertTriangle,
  X,
  FileSpreadsheet,
  Check,
  Terminal,
  Layers,
  GraduationCap
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { cn, detectCourseFromClass } from '../lib/utils';
import { fetchAll, saveData, saveBatch, deleteBatch } from '../lib/database';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useImport, ImportType } from '../contexts/ImportContext';
import { ImportBatchRecord, Course } from '../types';

type ImportStep = 'type' | 'upload' | 'mapping' | 'processing' | 'review';

interface FieldDefinition {
  label: string;
  key: string;
  synonyms: string[];
}

interface LogEntry {
  id: string;
  timestamp: string;
  text: string;
  type: 'info' | 'success' | 'warn' | 'error';
}

const ENTITY_FIELDS: Record<ImportType, FieldDefinition[]> = {
  classes: [
    { label: 'Código da Turma', key: 'code', synonyms: ['codigo', 'código', 'turma', 'code', 'codturma', 'cod_turma', 'sigla', 'id', 'codigo da turma', 'código da turma'] },
    { label: 'Nome da Turma / Curso', key: 'name', synonyms: ['nome da turma', 'nome', 'turma', 'curso', 'descricao', 'descrição', 'nome_turma', 'name', 'turma_nome'] },
    { label: 'Curso Base', key: 'course', synonyms: ['curso', 'grade', 'specialty', 'programa', 'matriz', 'curso base'] },
    { label: 'Ano Letivo (Ex: 2026)', key: 'start_year', synonyms: ['ano letivo', 'anoletivo', 'ano_letivo', 'exercicio', 'ano base', 'ano_base'] },
    { label: 'Ano Acadêmico (Ex: 1º Ano)', key: 'year', synonyms: ['ano academico', 'ano acadêmico', 'ano do curso', 'ano', 'serie', 'modulo', 'etapa', 'ano_curso'] },
    { label: 'Semestre', key: 'semester', synonyms: ['semestre', 'sem', 'periodo_letivo', 'periodo letivo', 'semestre_letivo'] },
    { label: 'Turno / Período', key: 'period', synonyms: ['turno', 'periodo', 'período', 'horario', 'horário', 'period'] },
    { label: 'Sala de Aula', key: 'room', synonyms: ['sala', 'local', 'sala_aula', 'room', 'espaco'] },
    { label: 'Dias da Semana', key: 'days_of_week', synonyms: ['dias da semana', 'dias', 'dia', 'dias_semana', 'dias_da_semana'] },
    { label: 'Status (Ativo/Inativo)', key: 'status', synonyms: ['status', 'situacao', 'situação', 'sit'] },
    { label: 'Observações', key: 'observations', synonyms: ['observacoes', 'observações', 'obs', 'notas', 'comentarios'] }
  ],
  students: [
    { label: 'Nome do Aluno', key: 'name', synonyms: ['nome', 'aluno', 'student', 'full name', 'full_name', 'nome_aluno', 'nome completo'] },
    { label: 'Matrícula', key: 'registration_number', synonyms: ['matricula', 'matrícula', 'codalu', 'codigo', 'id', 'registration', 'registration_number', 'ra', 'cod_aluno'] },
    { label: 'Turma (Código ou Nome)', key: 'class_id', synonyms: ['turma', 'classe', 'class', 'turma_id', 'codturma', 'cod_turma', 'nome_turma'] },
    { label: 'E-mail', key: 'email', synonyms: ['email', 'e-mail', 'mail', 'email_aluno'] },
    { label: 'CPF', key: 'cpf', synonyms: ['cpf', 'documento', 'cpf_aluno'] },
    { label: 'RG', key: 'rg', synonyms: ['rg', 'identidade', 'rg_aluno'] },
    { label: 'Data Nascimento', key: 'birth_date', synonyms: ['nascimento', 'data', 'birth', 'birthday', 'birth_date', 'data_nasc'] },
    { label: 'Data de Início', key: 'start_date', synonyms: ['inicio', 'entrada', 'start', 'start_date', 'data_inicio'] },
    { label: 'Endereço', key: 'address_street', synonyms: ['endereco', 'rua', 'address', 'street', 'address_street', 'logradouro'] },
    { label: 'Bairro', key: 'address_neighborhood', synonyms: ['bairro', 'neighborhood', 'address_neighborhood'] },
    { label: 'Cidade', key: 'address_city', synonyms: ['cidade', 'city', 'address_city'] },
    { label: 'Estado', key: 'address_state', synonyms: ['estado', 'uf', 'state', 'address_state'] },
    { label: 'CEP', key: 'address_zip', synonyms: ['cep', 'zip', 'postal', 'address_zip'] },
    { label: 'Celular', key: 'phone_mobile', synonyms: ['celular', 'mobile', 'phone_mobile', 'telefone_celular'] },
    { label: 'Fone Residencial', key: 'phone_residential', synonyms: ['residencial', 'phone_residential', 'telefone_residencial'] },
    { label: 'Status (SIT)', key: 'status', synonyms: ['sit', 'status', 'situacao', 'situação'] },
    { label: 'Paróquia', key: 'parish', synonyms: ['paroquia', 'paróquia', 'church', 'parish'] },
    { label: 'Curso', key: 'course', synonyms: ['curso', 'grade', 'specialty'] },
    { label: 'Nome do Pai', key: 'guardian_father', synonyms: ['pai', 'father', 'guardian_father', 'nome_pai'] },
    { label: 'Nome da Mãe', key: 'guardian_mother', synonyms: ['mae', 'mãe', 'mother', 'guardian_mother', 'nome_mae'] },
    { label: 'Participa de Pastoral', key: 'pastoral_participates', synonyms: ['pastoral', 'participates', 'pastoral_participates'] }
  ],
  teachers: [
    { label: 'Nome do Professor', key: 'name', synonyms: ['nome', 'professor', 'teacher', 'docente', 'full_name'] },
    { label: 'Código', key: 'code', synonyms: ['codigo', 'id', 'code', 'codprof', 'cod_prof', 'teacher_code'] },
    { label: 'E-mail', key: 'email', synonyms: ['email', 'mail', 'email_professor'] },
    { label: 'CPF', key: 'cpf', synonyms: ['cpf', 'documento'] },
    { label: 'RG', key: 'rg', synonyms: ['rg', 'identidade'] },
    { label: 'Endereço', key: 'address_street', synonyms: ['endereco', 'rua', 'address', 'street', 'logradouro'] },
    { label: 'Cidade', key: 'address_city', synonyms: ['cidade', 'city'] },
    { label: 'Estado', key: 'address_state', synonyms: ['estado', 'uf'] },
    { label: 'CEP', key: 'address_zip', synonyms: ['cep', 'zip'] },
    { label: 'Celular', key: 'phone_mobile', synonyms: ['celular', 'mobile', 'telefone_celular'] },
    { label: 'Fone Fixo', key: 'phone', synonyms: ['fone', 'telefone', 'fixo', 'telefone_residencial'] }
  ],
  subjects: [
    { label: 'Código', key: 'code', synonyms: ['codigo', 'id', 'code', 'coddisc', 'cod_disc', 'disciplina'] },
    { label: 'Nome da Disciplina', key: 'name', synonyms: ['disciplina', 'nome', 'subject', 'materia'] },
    { label: 'Ano do Curso', key: 'year', synonyms: ['ano', 'serie', 'modulo'] },
    { label: 'Semestre', key: 'semester', synonyms: ['semestre', 'sem'] },
    { label: 'Conteúdo Programático', key: 'program_content', synonyms: ['conteudo', 'ementa', 'program'] }
  ],
  parishes: [
    { label: 'Código', key: 'code', synonyms: ['codigo', 'code', 'id', 'paroquia_id'] },
    { label: 'Nome da Paróquia', key: 'name', synonyms: ['paroquia', 'nome', 'parish', 'church'] },
    { label: 'Forania', key: 'forania_id', synonyms: ['forania', 'vicariato', 'region'] },
    { label: 'Padre Responsável', key: 'priest_name', synonyms: ['padre', 'responsavel', 'priest', 'pastor'] },
    { label: 'Logradouro', key: 'address_street', synonyms: ['endereco', 'rua', 'logradouro', 'street'] },
    { label: 'Número', key: 'address_number', synonyms: ['numero', 'number'] },
    { label: 'Bairro', key: 'address_neighborhood', synonyms: ['bairro', 'neighborhood'] },
    { label: 'Cidade', key: 'address_city', synonyms: ['cidade', 'city'] },
    { label: 'Estado', key: 'address_state', synonyms: ['estado', 'uf'] },
    { label: 'CEP', key: 'address_zip', synonyms: ['cep', 'zip'] },
    { label: 'E-mail', key: 'email', synonyms: ['email', 'mail'] },
    { label: 'Telefone', key: 'phone', synonyms: ['telefone', 'phone', 'contato'] }
  ],
  foraries: [
    { label: 'Código', key: 'code', synonyms: ['codigo', 'id'] },
    { label: 'Nome da Forania', key: 'name', synonyms: ['forania', 'nome', 'vicariato'] }
  ],
  clergy_leity: [
    { label: 'Código', key: 'code', synonyms: ['codigo', 'id', 'code'] },
    { label: 'Nome', key: 'name', synonyms: ['nome', 'name', 'clero', 'leigo'] },
    { label: 'E-mail', key: 'email', synonyms: ['email', 'mail'] },
    { label: 'Telefone Celular', key: 'phone_mobile', synonyms: ['celular', 'mobile'] },
    { label: 'WhatsApp', key: 'phone_whatsapp', synonyms: ['whatsapp', 'zap'] },
    { label: 'Paróquia', key: 'parish_id', synonyms: ['paroquia', 'parish'] },
    { label: 'Função/Cargo', key: 'role', synonyms: ['funcao', 'cargo', 'role', 'tipo'] },
    { label: 'Endereço', key: 'address', synonyms: ['endereco', 'address', 'rua'] }
  ],
  courses: [
    { label: 'Código do Curso', key: 'code', synonyms: ['codigo', 'sigla', 'code', 'id'] },
    { label: 'Nome do Curso', key: 'name', synonyms: ['nome', 'curso', 'name', 'titulo'] },
    { label: 'Descrição', key: 'description', synonyms: ['descricao', 'descrição', 'ementa'] },
    { label: 'Duração (Anos)', key: 'duration_years', synonyms: ['duracao', 'anos', 'duracao_anos'] },
    { label: 'Duração (Semestres)', key: 'duration_semesters', synonyms: ['semestres', 'duracao_semestres'] },
    { label: 'Carga Horária (Horas)', key: 'workload_hours', synonyms: ['carga', 'horas', 'ch', 'carga_horaria'] }
  ]
};

const ENTITY_CONFIG: Record<ImportType, { label: string; icon: any; color: string; path: string }> = {
  classes: { label: 'Turmas', icon: School, color: 'bg-orange-500 text-white', path: '/classes' },
  students: { label: 'Alunos', icon: Users, color: 'bg-blue-600 text-white', path: '/students' },
  teachers: { label: 'Professores', icon: UserSquare2, color: 'bg-purple-600 text-white', path: '/teachers' },
  subjects: { label: 'Disciplinas', icon: BookOpen, color: 'bg-emerald-600 text-white', path: '/subjects' },
  courses: { label: 'Cursos', icon: GraduationCap, color: 'bg-indigo-600 text-white', path: '/courses' },
  parishes: { label: 'Paróquias', icon: Church, color: 'bg-cyan-600 text-white', path: '/parishes' },
  foraries: { label: 'Foranias', icon: MapIcon, color: 'bg-rose-600 text-white', path: '/foraries' },
  clergy_leity: { label: 'Clero e Leigos', icon: Users, color: 'bg-amber-600 text-white', path: '/clergy-leity' }
};

export function Import() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { 
    status, 
    startImport: startGlobalImport, 
    updateProgress, 
    setError: setGlobalError, 
    finishImport, 
    resetImport: resetGlobalImport 
  } = useImport();

  const [activeTab, setActiveTab] = useState<'import' | 'history'>('import');
  const [importType, setImportType] = useState<ImportType | null>(null);
  const [step, setStep] = useState<ImportStep>('type');
  const [file, setFile] = useState<File | null>(null);
  const [data, setData] = useState<any[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [mappings, setMappings] = useState<Record<string, string>>({});
  
  // Real-time execution feedback state
  const [currentProgress, setCurrentProgress] = useState(0);
  const [currentStepMessage, setCurrentStepMessage] = useState('');
  const [currentItemDetail, setCurrentItemDetail] = useState('');
  const [processedCount, setProcessedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [importStats, setImportStats] = useState({ total: 0, imported: 0, error: '', batchId: '' });
  const [lastInsertedItems, setLastInsertedItems] = useState<{ id: string; name: string; code?: string }[]>([]);

  // History & Reversal State
  const [batches, setBatches] = useState<ImportBatchRecord[]>([]);
  const [loadingBatches, setLoadingBatches] = useState(false);
  const [revertingBatchId, setRevertingBatchId] = useState<string | null>(null);
  const [showRevertModal, setShowRevertModal] = useState(false);
  const [batchToRevert, setBatchToRevert] = useState<ImportBatchRecord | null>(null);
  const [showBatchDetailsModal, setShowBatchDetailsModal] = useState(false);
  const [selectedBatchDetails, setSelectedBatchDetails] = useState<ImportBatchRecord | null>(null);
  const [coursesList, setCoursesList] = useState<Course[]>([]);
  const [notification, setNotification] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  const logsEndRef = useRef<HTMLDivElement>(null);

  // Auto scroll logs
  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  // Load history from local & database
  const loadBatchHistory = async () => {
    setLoadingBatches(true);
    try {
      let localBatches: ImportBatchRecord[] = [];
      try {
        const cached = localStorage.getItem('db_import_history');
        if (cached) localBatches = JSON.parse(cached);
      } catch (e) {}

      // Try fetching from DB if table exists
      const dbBatches = await fetchAll('import_history').catch(() => []);
      
      const mergedMap = new Map<string, ImportBatchRecord>();
      [...localBatches, ...(dbBatches || [])].forEach((b: any) => {
        if (b && b.id) {
          mergedMap.set(b.id, b);
        }
      });

      const list = Array.from(mergedMap.values()).sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      setBatches(list);
    } catch (e) {
      console.warn('Could not load batch history:', e);
    } finally {
      setLoadingBatches(false);
    }
  };

  const saveBatchHistoryRecord = async (record: ImportBatchRecord) => {
    try {
      // 1. Save locally
      const cached = localStorage.getItem('db_import_history');
      let list: ImportBatchRecord[] = cached ? JSON.parse(cached) : [];
      list = [record, ...list.filter(b => b.id !== record.id)];
      localStorage.setItem('db_import_history', JSON.stringify(list));
      setBatches(list);

      // 2. Try saving to DB
      await saveData('import_history', record.id, record).catch(() => {});
    } catch (e) {
      console.warn('Error saving batch history record:', e);
    }
  };

  // Check URL parameters for direct navigation
  useEffect(() => {
    const typeParam = searchParams.get('type') as ImportType;
    if (typeParam && ENTITY_FIELDS[typeParam]) {
      setImportType(typeParam);
      setStep('upload');
    }
    loadBatchHistory();
    fetchAll('courses').then(res => {
      if (res) setCoursesList(res);
    }).catch(() => {});
  }, [searchParams]);

  const addLog = (text: string, type: 'info' | 'success' | 'warn' | 'error' = 'info') => {
    const timeStr = new Date().toLocaleTimeString('pt-BR');
    setLogs(prev => [...prev, { id: `${Date.now()}-${Math.random()}`, timestamp: timeStr, text, type }]);
  };

  const handleTypeSelect = (type: ImportType) => {
    setImportType(type);
    setStep('upload');
    setData([]);
    setFile(null);
    setMappings({});
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement> | React.DragEvent) => {
    let selectedFile: File | null = null;
    if ('files' in e.target && e.target.files) selectedFile = e.target.files[0];
    else if ('dataTransfer' in e && e.dataTransfer.files) selectedFile = e.dataTransfer.files[0];

    if (selectedFile && importType) {
      setFile(selectedFile);
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const bstr = evt.target?.result;
          const wb = XLSX.read(bstr, { type: 'binary' });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const jsonData = XLSX.utils.sheet_to_json(ws);
          
          if (jsonData.length > 0) {
            const columns = Object.keys(jsonData[0] as object);
            const newMappings: Record<string, string> = {};
            const fields = ENTITY_FIELDS[importType];

            fields.forEach(field => {
              const match = columns.find(col => 
                field.synonyms.some(syn => col.toLowerCase().trim() === syn.toLowerCase().trim() || col.toLowerCase().includes(syn.toLowerCase()))
              );
              if (match) newMappings[field.key] = match;
            });
            setMappings(newMappings);
            setData(jsonData);
            setStep('mapping');
          } else {
            alert('A planilha selecionada está vazia ou não contém linhas de dados válidas.');
          }
        } catch (err: any) {
          alert('Erro ao ler a planilha: ' + (err.message || 'Formato incompatível.'));
        }
      };
      reader.readAsBinaryString(selectedFile);
    }
  };

  // Real-time Chunked Import Engine
  const startImport = async () => {
    if (!importType || data.length === 0) return;

    setStep('processing');
    setLogs([]);
    const total = data.length;
    setTotalCount(total);
    setProcessedCount(0);
    setCurrentProgress(0);

    const batchId = `BATCH-${importType.toUpperCase()}-${new Date().toISOString().replace(/\D/g, '').substring(0, 14)}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    
    startGlobalImport(importType, total);
    addLog(`🚀 Iniciando importação de ${total} registro(s) para "${ENTITY_CONFIG[importType].label}"`, 'info');
    addLog(`📄 Arquivo fonte: ${file?.name || 'planilha.xlsx'}`, 'info');
    addLog(`🛡️ Identificador do Lote: ${batchId}`, 'info');

    setCurrentStepMessage('Carregando identificadores existentes para evitar duplicidade...');
    setCurrentProgress(5);
    updateProgress(0, 5, 'Validando registros existentes no banco...');

    const uniqueField = importType === 'students' ? 'registration_number' : 'code';
    
    let allExisting: any[] = [];
    try {
      allExisting = await fetchAll(importType, uniqueField, uniqueField, true) || [];
      addLog(`✓ ${allExisting.length} registro(s) pré-existente(s) carregados com sucesso.`, 'info');
    } catch (e) {
      addLog(`⚠️ Consulta prévia ao banco rápida. Continuando com validação local.`, 'warn');
    }

    const existingIdentifiers = new Set<string>(allExisting?.map(s => String(s[uniqueField] || '').trim()).filter(Boolean));
    const seenInImport = new Set<string>();

    let maxNumericCode = 0;
    allExisting?.forEach(item => {
      const val = item[uniqueField];
      if (typeof val === 'string' || typeof val === 'number') {
        const strVal = String(val);
        const digits = strVal.replace(/\D/g, '');
        const num = parseInt(digits, 10);
        if (!isNaN(num)) maxNumericCode = Math.max(maxNumericCode, num);
      }
    });

    const insertedIds: string[] = [];
    const insertedItemSummaries: { id: string; name: string; code?: string }[] = [];
    let errorCount = 0;

    // Small chunks of 5 items with UI refresh yield to guarantee 60fps responsive progress
    const chunkSize = 5;
    const currentYear = new Date().getFullYear().toString();

    for (let i = 0; i < total; i += chunkSize) {
      const chunk = data.slice(i, i + chunkSize);
      const chunkEntities: any[] = [];

      for (let j = 0; j < chunk.length; j++) {
        const row = chunk[j];
        const recordIndex = i + j;
        const entity: any = {
          created_at: new Date().toISOString(),
          _import_batch_id: batchId
        };

        // Map column values
        Object.entries(mappings).forEach(([dbField, sheetColumn]) => {
          const colName = sheetColumn as string;
          if (colName && row[colName] !== undefined) {
            entity[dbField] = typeof row[colName] === 'string' ? row[colName].trim() : row[colName];
          }
        });

        // 1. SPECIFIC RULES FOR CLASSES
        if (importType === 'classes') {
          // Status
          if (!entity.status || !['Ativo', 'Inativo', 'Encerrada'].includes(entity.status)) {
            entity.status = 'Ativo';
          }
          // Start Year / Academic Base Year
          if (!entity.start_year || String(entity.start_year).trim().length !== 4) {
            entity.start_year = currentYear;
          }
          // Academic Year
          if (!entity.year) {
            entity.year = '1º Ano';
          }
          // Semester
          if (!entity.semester) {
            entity.semester = '1º Semestre';
          }
          // Period / Turno
          if (!entity.period) {
            entity.period = 'Tarde';
          }
          // Days of Week
          if (!entity.days_of_week) {
            entity.days_of_week = ['Segunda', 'Quarta'];
          } else if (typeof entity.days_of_week === 'string') {
            entity.days_of_week = entity.days_of_week.split(/[,;\/]/).map((d: string) => d.trim()).filter(Boolean);
            if (entity.days_of_week.length === 0) entity.days_of_week = ['Segunda', 'Quarta'];
          }

          // Course auto-detection
          if (!entity.course) {
            entity.course = detectCourseFromClass(entity, coursesList) || 'Teologia e Ministérios';
          }

          // Ensure Class Name
          if (!entity.name || String(entity.name).trim() === '') {
            if (entity.code) {
              entity.name = `Turma ${entity.code} - ${entity.course || 'Formação'}`;
            } else {
              entity.name = `Turma ${entity.year || '1º Ano'} (${entity.start_year || currentYear})`;
            }
          }

          // Ensure Code
          if (!entity.code || String(entity.code).trim() === '') {
            const nextCodeNum = maxNumericCode + recordIndex + 1;
            entity.code = String(nextCodeNum).padStart(3, '0');
          }
        }

        // 2. SPECIFIC RULES FOR STUDENTS
        if (importType === 'students') {
          if (!entity.name || String(entity.name).trim() === '') {
            entity.name = `ALUNO SEM NOME #${recordIndex + 1}`;
          }

          // Status mapping
          if (entity.status !== undefined) {
            const sit = String(entity.status).trim();
            if (sit === '0' || sit.toLowerCase() === 'ativo') entity.status = 'Ativo';
            else if (sit === '1' || sit.toLowerCase() === 'inativo') entity.status = 'Inativo';
            else if (sit === '2' || sit.toLowerCase() === 'concluido' || sit.toLowerCase() === 'concluído') entity.status = 'Concluído';
            else if (sit === '3' || sit.toLowerCase() === 'suspenso') entity.status = 'Suspenso';
            else entity.status = 'Ativo';
          } else {
            entity.status = 'Ativo';
          }

          // Unique registration number
          let rawId = String(entity.registration_number || '').trim();
          if (rawId.length === 10 && /^(19|20)\d{2}/.test(rawId)) {
            const yearPart = rawId.substring(0, 4);
            const seqPart = rawId.substring(4);
            rawId = seqPart + yearPart;
          }
          if (rawId.includes('/')) {
            rawId = rawId.replace(/\//g, '');
          }
          if (!rawId) {
            const nextNum = maxNumericCode + recordIndex + 1;
            rawId = `${String(nextNum).padStart(6, '0')}${currentYear}`;
          }
          entity.registration_number = rawId;
        }

        // Ensure unique identifier
        let finalId = String(entity[uniqueField] || '').trim();
        if (!finalId) {
          finalId = `IMP-${Date.now().toString().slice(-4)}-${recordIndex + 1}`;
          entity[uniqueField] = finalId;
        }

        let suffix = 1;
        const originalId = finalId;
        while (seenInImport.has(finalId)) {
          suffix++;
          finalId = `${originalId}-${suffix}`;
          entity[uniqueField] = finalId;
        }
        seenInImport.add(finalId);

        // Generate robust document ID
        let docId = entity.id;
        if (!docId) {
          const cleanCode = String(entity[uniqueField]).replace(/[^a-zA-Z0-9_-]/g, '-');
          docId = `${importType.substring(0, 3)}-${cleanCode}-${Date.now().toString().slice(-4)}`;
        }
        entity.id = docId;

        chunkEntities.push(entity);
      }

      // Save chunk to database / local fallback
      try {
        setCurrentStepMessage(`Gravando registros ${i + 1} a ${Math.min(i + chunk.length, total)} de ${total}...`);
        const itemDetail = chunkEntities.map(e => e.name || e.code || e.id).join(', ');
        setCurrentItemDetail(itemDetail);

        await saveBatch(importType, chunkEntities, 15000);

        chunkEntities.forEach(ent => {
          insertedIds.push(ent.id);
          insertedItemSummaries.push({
            id: ent.id,
            name: ent.name || ent.code || ent.id,
            code: ent.code || ent.registration_number
          });
          addLog(`✓ [${importType.toUpperCase()}] ${ent.name || ent.id} (${ent[uniqueField] || ent.id}) gravado com sucesso.`, 'success');
        });

        const currentCount = Math.min(i + chunk.length, total);
        const percent = Math.round((currentCount / total) * 95); // Up to 95% before finalize
        setProcessedCount(currentCount);
        setCurrentProgress(percent);
        updateProgress(currentCount, percent, `Processando registros ${currentCount} de ${total}...`, itemDetail);

        // Micro-yield to guarantee smooth UI render
        await new Promise(resolve => setTimeout(resolve, 40));

      } catch (err: any) {
        errorCount++;
        addLog(`❌ Erro no lote ${i + 1}-${i + chunk.length}: ${err.message || 'Falha na gravação'}`, 'error');
      }
    }

    setCurrentStepMessage('Criando ponto de restauração e finalizando...');
    setCurrentProgress(98);

    // Save batch record to history
    const batchRecord: ImportBatchRecord = {
      id: batchId,
      type: importType,
      filename: file?.name || 'arquivo.xlsx',
      record_count: insertedIds.length,
      inserted_ids: insertedIds,
      created_at: new Date().toISOString(),
      status: 'completed',
      summary: `${insertedIds.length} ${ENTITY_CONFIG[importType].label} importado(s) com sucesso.`,
      details: {
        names: insertedItemSummaries.map(x => x.name),
        codes: insertedItemSummaries.map(x => x.code || '')
      }
    };

    await saveBatchHistoryRecord(batchRecord);

    addLog(`🎉 Importação finalizada! ${insertedIds.length} de ${total} registros sincronizados.`, 'success');
    addLog(`🛡️ Ponto de restauração registrado. Você pode reverter esta importação a qualquer momento.`, 'info');

    setCurrentProgress(100);
    setImportStats({
      total,
      imported: insertedIds.length,
      error: errorCount > 0 ? `${errorCount} erro(s) encontrados durante o processamento.` : '',
      batchId
    });
    setLastInsertedItems(insertedItemSummaries);

    finishImport(batchId);
    setStep('review');
  };

  // Revert / Rollback Batch Engine
  const executeRevertBatch = async (batch: ImportBatchRecord) => {
    if (!batch || !batch.inserted_ids || batch.inserted_ids.length === 0) {
      alert('Nenhum identificador gravado neste lote para remoção.');
      return;
    }

    setRevertingBatchId(batch.id);
    try {
      // 1. Delete all records associated with this batch
      await deleteBatch(batch.type, batch.inserted_ids);

      // 2. If it was a class or student import, verify clean removal
      const updatedRecord: ImportBatchRecord = {
        ...batch,
        status: 'reverted',
        reverted_at: new Date().toISOString(),
        summary: `Revertido em ${new Date().toLocaleString('pt-BR')}. ${batch.inserted_ids.length} registros excluídos.`
      };

      await saveBatchHistoryRecord(updatedRecord);

      setShowRevertModal(false);
      setBatchToRevert(null);

      setNotification({
        type: 'success',
        message: `Importação revertida com sucesso! Todos os ${batch.inserted_ids.length} registros foram excluídos permanentemente do banco de dados.`
      });

      // If user was on the review step of this exact batch, step back to upload
      if (step === 'review' && importStats.batchId === batch.id) {
        setStep('type');
        resetGlobalImport();
      }

    } catch (err: any) {
      console.error('Error reverting batch:', err);
      alert('Erro ao reverter lote: ' + (err.message || 'Falha na exclusão.'));
    } finally {
      setRevertingBatchId(null);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-12">
      {/* Toast Notification */}
      {notification && (
        <div className={cn(
          "p-4 border shadow-md flex items-center justify-between gap-3 animate-in fade-in duration-200",
          notification.type === 'success' ? "bg-emerald-50 border-emerald-200 text-emerald-800" :
          notification.type === 'error' ? "bg-red-50 border-red-200 text-red-800" :
          "bg-blue-50 border-blue-200 text-blue-800"
        )}>
          <div className="flex items-center gap-2.5">
            {notification.type === 'success' ? <CheckCircle2 size={18} className="text-emerald-600" /> : <AlertCircle size={18} />}
            <p className="text-xs font-bold uppercase tracking-wide">{notification.message}</p>
          </div>
          <button onClick={() => setNotification(null)} className="p-1 hover:bg-black/5 text-slate-500">
            <X size={16} />
          </button>
        </div>
      )}

      {/* Header & Tabs */}
      <div className="bg-white border border-slate-200 p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-slate-900 text-white">
              <FileSpreadsheet size={20} />
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-900 tracking-tight uppercase">Importação & Sincronização de Dados</h2>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Importe planilhas Excel/CSV com acompanhamento em tempo real e opção de reversão segura.
              </p>
            </div>
          </div>
        </div>

        {/* Tab Selector */}
        <div className="flex items-center border border-slate-200 bg-slate-100 p-1">
          <button
            onClick={() => setActiveTab('import')}
            className={cn(
              "px-4 py-2 text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2",
              activeTab === 'import' ? "bg-white text-slate-900 shadow-xs" : "text-slate-500 hover:text-slate-900"
            )}
          >
            <CloudUpload size={14} />
            <span>Nova Importação</span>
          </button>
          <button
            onClick={() => {
              setActiveTab('history');
              loadBatchHistory();
            }}
            className={cn(
              "px-4 py-2 text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2",
              activeTab === 'history' ? "bg-white text-slate-900 shadow-xs" : "text-slate-500 hover:text-slate-900"
            )}
          >
            <History size={14} />
            <span>Histórico & Reversões</span>
            {batches.length > 0 && (
              <span className="px-1.5 py-0.2 bg-blue-900 text-white text-[10px] font-bold">
                {batches.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* TAB 1: NEW IMPORT */}
      {activeTab === 'import' && (
        <div className="space-y-6">
          {/* Step Breadcrumbs */}
          <div className="bg-white border border-slate-200 p-3 shadow-xs">
            <div className="grid grid-cols-5 gap-2 text-center">
              {[
                { id: 'type', label: '1. Seleção de Tipo' },
                { id: 'upload', label: '2. Envio da Planilha' },
                { id: 'mapping', label: '3. Mapeamento' },
                { id: 'processing', label: '4. Processamento' },
                { id: 'review', label: '5. Conclusão & Rollback' }
              ].map((s, idx) => {
                const isActive = step === s.id;
                const isPast = ['type', 'upload', 'mapping', 'processing', 'review'].indexOf(step) > idx;

                return (
                  <div
                    key={s.id}
                    className={cn(
                      "py-2 px-3 border text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2",
                      isActive ? "bg-slate-900 text-white border-slate-900 shadow-xs" :
                      isPast ? "bg-emerald-50 text-emerald-800 border-emerald-200" :
                      "bg-slate-50 text-slate-400 border-slate-200"
                    )}
                  >
                    {isPast && <Check size={12} className="text-emerald-600 stroke-[3]" />}
                    <span className="truncate">{s.label}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* STEP 1: TYPE SELECTION */}
          {step === 'type' && (
            <div className="space-y-4">
              <div className="border-b border-slate-200 pb-2">
                <h3 className="text-sm font-extrabold text-slate-800 uppercase tracking-wider">
                  Selecione o tipo de registro que deseja importar:
                </h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                {(Object.entries(ENTITY_CONFIG) as [ImportType, any][]).map(([key, config]) => {
                  const Icon = config.icon;
                  return (
                    <button
                      key={key}
                      onClick={() => handleTypeSelect(key)}
                      className="bg-white p-6 border border-slate-200 hover:border-slate-800 hover:shadow-md transition-all text-left flex flex-col justify-between group space-y-4 cursor-pointer"
                    >
                      <div className="flex items-center justify-between">
                        <div className={cn("w-12 h-12 flex items-center justify-center shadow-xs group-hover:scale-105 transition-transform", config.color)}>
                          <Icon size={24} />
                        </div>
                        <ChevronRight size={18} className="text-slate-300 group-hover:text-slate-800 transition-colors" />
                      </div>
                      <div>
                        <h4 className="font-black text-slate-900 text-base uppercase tracking-tight">{config.label}</h4>
                        <p className="text-[11px] text-slate-500 font-semibold uppercase mt-1">
                          {key === 'classes' ? 'Importar turmas, salas, anos e turnos' :
                           key === 'students' ? 'Importar alunos com turma e matrícula' :
                           key === 'courses' ? 'Importar matrizes curriculares de cursos' :
                           `Importar registros de ${config.label.toLowerCase()}`}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* STEP 2: FILE UPLOAD */}
          {step === 'upload' && importType && (
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-extrabold text-slate-400 uppercase">Módulo Selecionado:</span>
                  <span className="px-2 py-0.5 bg-slate-900 text-white text-xs font-black uppercase">
                    {ENTITY_CONFIG[importType].label}
                  </span>
                </div>
                <button
                  onClick={() => setStep('type')}
                  className="text-xs font-bold text-slate-600 hover:text-slate-900 uppercase tracking-wider cursor-pointer"
                >
                  Alterar Tipo
                </button>
              </div>

              <div 
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => { e.preventDefault(); setIsDragging(false); handleFileUpload(e); }}
                className={cn(
                  "bg-white border-2 border-dashed p-12 text-center transition-all flex flex-col items-center justify-center space-y-4",
                  isDragging ? "border-blue-600 bg-blue-50/50" : "border-slate-300 hover:border-slate-800"
                )}
              >
                <div className="w-16 h-16 bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-600">
                  <CloudUpload size={32} />
                </div>
                <div className="max-w-md">
                  <h3 className="text-base font-black text-slate-900 uppercase tracking-tight">
                    Arraste sua planilha ou clique para selecionar
                  </h3>
                  <p className="text-xs text-slate-500 font-medium mt-1">
                    Formatos aceitos: <strong>.XLSX</strong>, <strong>.XLS</strong> ou <strong>.CSV</strong>
                  </p>
                </div>

                <label className="px-6 py-3 bg-slate-900 hover:bg-slate-800 text-white text-xs font-extrabold uppercase tracking-wider cursor-pointer shadow-xs transition-colors">
                  <span>Procurar no Computador</span>
                  <input type="file" className="hidden" accept=".xlsx,.xls,.csv" onChange={handleFileUpload} />
                </label>
              </div>
            </div>
          )}

          {/* STEP 3: MAPPING */}
          {step === 'mapping' && importType && (
            <div className="bg-white border border-slate-200 p-6 shadow-xs space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-4">
                <div>
                  <h3 className="text-base font-black text-slate-900 uppercase tracking-tight">
                    Mapeamento de Colunas ({ENTITY_CONFIG[importType].label})
                  </h3>
                  <p className="text-xs text-slate-500 font-semibold uppercase">
                    Arquivo: <strong>{file?.name}</strong> • <strong>{data.length}</strong> linhas encontradas
                  </p>
                </div>
                <span className="px-3 py-1 bg-blue-50 border border-blue-200 text-blue-900 text-xs font-black uppercase self-start">
                  {data.length} Registros Prontos
                </span>
              </div>

              <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                {ENTITY_FIELDS[importType].map((field) => {
                  const isMapped = !!mappings[field.key];
                  return (
                    <div 
                      key={field.key} 
                      className={cn(
                        "grid grid-cols-1 sm:grid-cols-2 gap-3 items-center p-3 border text-xs transition-colors",
                        isMapped ? "bg-white border-slate-200" : "bg-slate-50/70 border-dashed border-slate-200"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-800 uppercase">{field.label}</span>
                        {isMapped && <Check size={14} className="text-emerald-600 stroke-[3]" />}
                      </div>
                      <select 
                        value={mappings[field.key] || ''}
                        onChange={(e) => setMappings({ ...mappings, [field.key]: e.target.value })}
                        className="bg-white border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-800 outline-none focus:border-slate-900 uppercase"
                      >
                        <option value="">-- Ignorar este campo --</option>
                        {Object.keys(data[0] || {}).map(col => (
                          <option key={col} value={col}>Coluna: {col}</option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-slate-200">
                <button 
                  onClick={() => setStep('upload')} 
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold uppercase tracking-wider cursor-pointer"
                >
                  Voltar
                </button>
                <button 
                  onClick={startImport} 
                  className="px-6 py-2.5 bg-blue-900 hover:bg-blue-950 text-white text-xs font-extrabold uppercase tracking-wider shadow-xs cursor-pointer flex items-center gap-2"
                >
                  <span>Iniciar Importação em Tempo Real</span>
                  <ArrowRight size={14} />
                </button>
              </div>
            </div>
          )}

          {/* STEP 4: REAL-TIME PROCESSING */}
          {step === 'processing' && (
            <div className="bg-white border border-slate-200 p-8 shadow-xs space-y-6">
              <div className="text-center space-y-2">
                <div className="inline-flex p-3 bg-blue-50 border border-blue-200 text-blue-900">
                  <Loader2 size={32} className="animate-spin" />
                </div>
                <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">
                  Importando Registros no Banco de Dados
                </h3>
                <p className="text-xs font-bold text-slate-600 uppercase">
                  {currentStepMessage || 'Processando lote...'}
                </p>
                {currentItemDetail && (
                  <p className="text-[11px] font-mono text-slate-400 truncate max-w-lg mx-auto">
                    {currentItemDetail}
                  </p>
                )}
              </div>

              {/* Progress Bar with Numbers */}
              <div className="space-y-2 max-w-xl mx-auto">
                <div className="flex items-center justify-between text-xs font-black uppercase text-slate-700">
                  <span>Progresso: {processedCount} de {totalCount}</span>
                  <span>{currentProgress}%</span>
                </div>
                <div className="w-full h-4 bg-slate-100 border border-slate-300 overflow-hidden">
                  <div 
                    className="h-full bg-blue-900 transition-all duration-300 ease-out"
                    style={{ width: `${currentProgress}%` }}
                  />
                </div>
              </div>

              {/* Real-time Activity Terminal Log */}
              <div className="border border-slate-800 bg-slate-950 text-slate-100 font-mono text-[11px] p-4 max-w-3xl mx-auto shadow-inner">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-2 text-slate-400 text-[10px] uppercase font-bold tracking-wider">
                  <div className="flex items-center gap-1.5">
                    <Terminal size={12} className="text-emerald-400" />
                    <span>Console de Execução em Tempo Real</span>
                  </div>
                  <span>{logs.length} eventos</span>
                </div>
                <div className="max-h-48 overflow-y-auto space-y-1 pr-1 select-text">
                  {logs.map((log) => (
                    <div key={log.id} className="flex items-start gap-2 leading-relaxed">
                      <span className="text-slate-500 shrink-0">[{log.timestamp}]</span>
                      <span className={cn(
                        log.type === 'success' ? "text-emerald-400" :
                        log.type === 'error' ? "text-red-400 font-bold" :
                        log.type === 'warn' ? "text-amber-300" :
                        "text-slate-200"
                      )}>
                        {log.text}
                      </span>
                    </div>
                  ))}
                  <div ref={logsEndRef} />
                </div>
              </div>
            </div>
          )}

          {/* STEP 5: REVIEW & ROLLBACK OPTION */}
          {step === 'review' && importType && (
            <div className="bg-white border border-slate-200 p-8 shadow-xs space-y-6">
              <div className="text-center space-y-2">
                <div className="inline-flex p-3 bg-emerald-50 border border-emerald-200 text-emerald-700">
                  <CheckCircle2 size={40} />
                </div>
                <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">
                  Importação Concluída com Sucesso!
                </h3>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Os dados foram processados e vinculados ao sistema. Um ponto de restauração foi gerado.
                </p>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-2xl mx-auto">
                <div className="border border-slate-200 bg-slate-50 p-4 text-center">
                  <p className="text-2xl font-black text-slate-900">{importStats.total}</p>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mt-0.5">Total na Planilha</p>
                </div>
                <div className="border border-emerald-200 bg-emerald-50 p-4 text-center">
                  <p className="text-2xl font-black text-emerald-800">{importStats.imported}</p>
                  <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider mt-0.5">Gravados no Banco</p>
                </div>
                <div className="border border-slate-200 bg-slate-50 p-4 text-center">
                  <p className="text-xs font-mono font-bold text-slate-700 truncate">{importStats.batchId.slice(-8)}</p>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mt-0.5">Identificador do Lote</p>
                </div>
              </div>

              {/* List of created records */}
              {lastInsertedItems.length > 0 && (
                <div className="max-w-2xl mx-auto border border-slate-200 p-4 space-y-2">
                  <p className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                    Registros Criados Neste Lote ({lastInsertedItems.length}):
                  </p>
                  <div className="max-h-36 overflow-y-auto border border-slate-100 bg-slate-50 p-2 divide-y divide-slate-200 text-xs font-medium text-slate-700">
                    {lastInsertedItems.map((item, idx) => (
                      <div key={item.id || idx} className="py-1 flex items-center justify-between">
                        <span className="font-bold text-slate-900 truncate">{item.name}</span>
                        {item.code && <span className="font-mono text-[10px] text-slate-500 ml-2">[{item.code}]</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Action Buttons: View Destination vs Rollback */}
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-4 border-t border-slate-200 max-w-2xl mx-auto">
                <button
                  onClick={() => navigate(ENTITY_CONFIG[importType].path)}
                  className="w-full sm:w-auto px-6 py-3 bg-slate-900 hover:bg-slate-800 text-white text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span>Ver {ENTITY_CONFIG[importType].label} no Sistema</span>
                  <ArrowRight size={14} />
                </button>

                <button
                  onClick={() => {
                    const currentBatch = batches.find(b => b.id === importStats.batchId) || {
                      id: importStats.batchId,
                      type: importType,
                      filename: file?.name || 'arquivo.xlsx',
                      record_count: importStats.imported,
                      inserted_ids: lastInsertedItems.map(x => x.id),
                      created_at: new Date().toISOString(),
                      status: 'completed',
                      details: {
                        names: lastInsertedItems.map(x => x.name),
                        codes: lastInsertedItems.map(x => x.code || '')
                      }
                    };
                    setBatchToRevert(currentBatch);
                    setShowRevertModal(true);
                  }}
                  className="w-full sm:w-auto px-5 py-3 bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <RotateCcw size={14} className="text-rose-600" />
                  <span>Desfazer / Reverter Esta Importação</span>
                </button>

                <button
                  onClick={() => {
                    setStep('type');
                    setFile(null);
                    setData([]);
                    resetGlobalImport();
                  }}
                  className="w-full sm:w-auto px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold uppercase tracking-wider cursor-pointer"
                >
                  Nova Importação
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: HISTORY & ROLLBACK */}
      {activeTab === 'history' && (
        <div className="bg-white border border-slate-200 p-6 shadow-xs space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-4">
            <div>
              <h3 className="text-base font-black text-slate-900 uppercase tracking-tight">
                Histórico de Lotes Importados & Reversão
              </h3>
              <p className="text-xs text-slate-500 font-semibold uppercase">
                Consulte todos os lotes gravados no banco e reverta dados com segurança caso queira desfazer importações.
              </p>
            </div>
            <button
              onClick={loadBatchHistory}
              disabled={loadingBatches}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 self-start cursor-pointer"
            >
              <RotateCcw size={12} className={cn(loadingBatches && "animate-spin")} />
              <span>Atualizar Histórico</span>
            </button>
          </div>

          {loadingBatches ? (
            <div className="py-16 text-center text-slate-400 space-y-2">
              <Loader2 size={32} className="animate-spin text-slate-700 mx-auto" />
              <p className="text-xs font-bold uppercase">Carregando histórico de lotes...</p>
            </div>
          ) : batches.length === 0 ? (
            <div className="py-16 text-center text-slate-400 space-y-2 border border-dashed border-slate-200">
              <History size={36} className="mx-auto text-slate-300" />
              <p className="text-xs font-bold uppercase text-slate-600">Nenhum lote importado registrado até o momento</p>
              <p className="text-[11px] text-slate-400">As novas importações que você realizar aparecerão nesta lista com opção de reversão.</p>
            </div>
          ) : (
            <div className="border border-slate-200 overflow-x-auto divide-y divide-slate-200">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-900 text-white uppercase text-[10px] font-black tracking-wider">
                  <tr>
                    <th className="p-3">Data e Hora</th>
                    <th className="p-3">Tipo</th>
                    <th className="p-3">Arquivo</th>
                    <th className="p-3 text-center">Registros</th>
                    <th className="p-3 text-center">Status</th>
                    <th className="p-3 text-right">Ações de Gestão</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                  {batches.map((batch) => {
                    const isReverted = batch.status === 'reverted';
                    const config = ENTITY_CONFIG[batch.type] || { label: batch.type, color: 'bg-slate-800' };

                    return (
                      <tr key={batch.id} className="hover:bg-slate-50 transition-colors">
                        <td className="p-3 font-mono text-[11px] text-slate-900">
                          {new Date(batch.created_at).toLocaleString('pt-BR')}
                        </td>
                        <td className="p-3">
                          <span className="px-2 py-0.5 bg-slate-100 text-slate-900 text-[10px] font-extrabold uppercase border border-slate-200">
                            {config.label}
                          </span>
                        </td>
                        <td className="p-3 font-semibold text-slate-800 truncate max-w-xs" title={batch.filename}>
                          {batch.filename}
                        </td>
                        <td className="p-3 text-center font-bold text-slate-900">
                          {batch.record_count}
                        </td>
                        <td className="p-3 text-center">
                          {isReverted ? (
                            <span className="px-2 py-0.5 bg-rose-50 text-rose-700 text-[10px] font-black uppercase border border-rose-200">
                              Revertido
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 bg-emerald-50 text-emerald-800 text-[10px] font-black uppercase border border-emerald-200">
                              Ativo no Banco
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-right space-x-2">
                          <button
                            onClick={() => {
                              setSelectedBatchDetails(batch);
                              setShowBatchDetailsModal(true);
                            }}
                            className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-extrabold uppercase tracking-wider cursor-pointer"
                            title="Ver detalhes dos registros gravados neste lote"
                          >
                            <Eye size={12} className="inline mr-1" />
                            <span>Detalhes</span>
                          </button>

                          {!isReverted && (
                            <button
                              onClick={() => {
                                setBatchToRevert(batch);
                                setShowRevertModal(true);
                              }}
                              className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-[10px] font-black uppercase tracking-wider cursor-pointer"
                              title="Excluir todos os registros deste lote do banco de dados"
                            >
                              <RotateCcw size={12} className="inline mr-1" />
                              <span>Reverter</span>
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* MODAL: CONFIRM REVERSAL / ROLLBACK */}
      {showRevertModal && batchToRevert && (
        <div className="fixed inset-0 z-[300] bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white border-2 border-rose-400 shadow-2xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-3 bg-rose-100 text-rose-700 shrink-0">
                <AlertTriangle size={24} />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-black text-slate-900 uppercase tracking-tight">
                  Reverter Importação e Excluir Dados?
                </h3>
                <p className="text-xs text-slate-600">
                  Esta ação excluirá permanentemente todos os <strong>{batchToRevert.record_count}</strong> registros criados neste lote ({ENTITY_CONFIG[batchToRevert.type]?.label || batchToRevert.type}), limpando o banco de dados.
                </p>
              </div>
            </div>

            <div className="border border-slate-200 bg-slate-50 p-3 text-xs space-y-1.5">
              <p className="font-bold text-slate-800 uppercase">Resumo do Lote:</p>
              <p className="text-slate-600">• Lote: <strong className="font-mono">{batchToRevert.id}</strong></p>
              <p className="text-slate-600">• Arquivo: <strong>{batchToRevert.filename}</strong></p>
              <p className="text-slate-600">• Importado em: <strong>{new Date(batchToRevert.created_at).toLocaleString('pt-BR')}</strong></p>
              {batchToRevert.details?.names && batchToRevert.details.names.length > 0 && (
                <div className="mt-2 pt-2 border-t border-slate-200">
                  <p className="text-[10px] font-bold text-slate-500 uppercase">Exemplo de itens a serem removidos:</p>
                  <p className="text-[11px] text-slate-700 italic truncate">
                    {batchToRevert.details.names.slice(0, 4).join(', ')} {batchToRevert.details.names.length > 4 ? `e mais ${batchToRevert.details.names.length - 4}...` : ''}
                  </p>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
              <button
                type="button"
                disabled={!!revertingBatchId}
                onClick={() => {
                  setShowRevertModal(false);
                  setBatchToRevert(null);
                }}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold uppercase tracking-wider cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={!!revertingBatchId}
                onClick={() => executeRevertBatch(batchToRevert)}
                className="px-5 py-2 bg-rose-700 hover:bg-rose-800 text-white text-xs font-black uppercase tracking-wider shadow-sm flex items-center gap-2 cursor-pointer"
              >
                {revertingBatchId ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    <span>Excluindo Dados...</span>
                  </>
                ) : (
                  <>
                    <Trash2 size={14} />
                    <span>Confirmar Reversão e Excluir</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: BATCH DETAILS */}
      {showBatchDetailsModal && selectedBatchDetails && (
        <div className="fixed inset-0 z-[300] bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white border border-slate-300 shadow-2xl max-w-xl w-full flex flex-col max-h-[85vh] overflow-hidden">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText size={18} />
                <h3 className="text-xs font-black uppercase tracking-wide">
                  Detalhes do Lote de Importação
                </h3>
              </div>
              <button onClick={() => setShowBatchDetailsModal(false)} className="text-slate-400 hover:text-white">
                <X size={18} />
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto flex-1 text-xs">
              <div className="grid grid-cols-2 gap-3 border border-slate-200 bg-slate-50 p-3">
                <div>
                  <span className="text-[10px] text-slate-500 uppercase font-bold">Tipo:</span>
                  <p className="font-bold text-slate-900 uppercase">{ENTITY_CONFIG[selectedBatchDetails.type]?.label || selectedBatchDetails.type}</p>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 uppercase font-bold">Registros:</span>
                  <p className="font-bold text-slate-900">{selectedBatchDetails.record_count}</p>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 uppercase font-bold">Arquivo:</span>
                  <p className="font-bold text-slate-900 truncate">{selectedBatchDetails.filename}</p>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 uppercase font-bold">Data/Hora:</span>
                  <p className="font-bold text-slate-900">{new Date(selectedBatchDetails.created_at).toLocaleString('pt-BR')}</p>
                </div>
              </div>

              <div>
                <p className="font-extrabold text-slate-800 uppercase mb-1.5">
                  Lista de Nomes e Identificadores ({selectedBatchDetails.details?.names?.length || selectedBatchDetails.inserted_ids.length}):
                </p>
                <div className="border border-slate-200 bg-white max-h-48 overflow-y-auto divide-y divide-slate-100 p-2">
                  {(selectedBatchDetails.details?.names || selectedBatchDetails.inserted_ids).map((name, i) => (
                    <div key={i} className="py-1 text-[11px] font-medium text-slate-700 flex items-center justify-between">
                      <span>{name}</span>
                      {selectedBatchDetails.details?.codes?.[i] && (
                        <span className="font-mono text-[10px] text-slate-400 font-bold">
                          [{selectedBatchDetails.details.codes[i]}]
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-3 bg-slate-100 border-t border-slate-200 flex justify-end">
              <button
                onClick={() => setShowBatchDetailsModal(false)}
                className="px-4 py-2 bg-slate-900 text-white text-xs font-bold uppercase tracking-wider"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
