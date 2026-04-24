import React, { useState, useEffect } from 'react';
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
  Map
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { cn } from '../lib/utils';
import { db, fetchAll, saveData } from '../lib/firebase';
import { collection, setDoc, doc } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { useImport } from '../contexts/ImportContext';

type ImportType = 'students' | 'teachers' | 'classes' | 'subjects' | 'parishes' | 'foraries';
type ImportStep = 'type' | 'upload' | 'mapping' | 'review' | 'processing';

interface FieldDefinition {
  label: string;
  key: string;
  synonyms: string[];
}

const ENTITY_FIELDS: Record<ImportType, FieldDefinition[]> = {
  students: [
    { label: 'Nome do Aluno', key: 'name', synonyms: ['nome', 'aluno', 'student', 'full name', 'full_name', 'nome_aluno'] },
    { label: 'Matrícula', key: 'registration_number', synonyms: ['matricula', 'codalu', 'codigo', 'id', 'registration', 'registration_number', 'ra'] },
    { label: 'E-mail', key: 'email', synonyms: ['email', 'e-mail', 'mail', 'email_aluno'] },
    { label: 'CPF', key: 'cpf', synonyms: ['cpf', 'documento', 'cpf_aluno'] },
    { label: 'RG', key: 'rg', synonyms: ['rg', 'identidade', 'rg_aluno'] },
    { label: 'Data Nascimento', key: 'birth_date', synonyms: ['nascimento', 'data', 'birth', 'birthday', 'birth_date', 'data_nasc'] },
    { label: 'Data de Início', key: 'start_date', synonyms: ['inicio', 'entrada', 'start', 'start_date', 'data_inicio'] },
    { label: 'Endereço', key: 'address_street', synonyms: ['endereco', 'rua', 'address', 'street', 'address_street', 'logradouro'] },
    { label: 'Cidade', key: 'address_city', synonyms: ['cidade', 'city', 'address_city'] },
    { label: 'Estado', key: 'address_state', synonyms: ['estado', 'uf', 'state', 'address_state'] },
    { label: 'CEP', key: 'address_zip', synonyms: ['cep', 'zip', 'postal', 'address_zip'] },
    { label: 'Celular', key: 'phone_mobile', synonyms: ['celular', 'mobile', 'phone_mobile', 'telefone_celular'] },
    { label: 'Fone Residencial', key: 'phone_residential', synonyms: ['residencial', 'phone_residential', 'telefone_residencial'] },
    { label: 'Fone Comercial', key: 'phone_commercial', synonyms: ['comercial', 'phone_commercial', 'telefone_comercial'] },
    { label: 'Status (SIT)', key: 'status', synonyms: ['sit', 'status', 'situacao'] },
    { label: 'Paróquia', key: 'parish', synonyms: ['paroquia', 'church', 'parish'] },
    { label: 'Curso', key: 'course', synonyms: ['curso', 'grade', 'specialty'] },
    { label: 'Nome do Pai', key: 'guardian_father', synonyms: ['pai', 'father', 'guardian_father', 'nome_pai'] },
    { label: 'Nome da Mãe', key: 'guardian_mother', synonyms: ['mae', 'mother', 'guardian_mother', 'nome_mae'] },
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
  classes: [
    { label: 'Código da Turma', key: 'code', synonyms: ['turma', 'codigo', 'code', 'codturma', 'cod_turma'] },
    { label: 'Nome do Curso', key: 'name', synonyms: ['curso', 'nome', 'name', 'descricao'] },
    { label: 'Sala', key: 'room', synonyms: ['sala', 'room'] },
    { label: 'Semestre', key: 'semester', synonyms: ['semestre', 'periodo'] },
    { label: 'Período', key: 'period', synonyms: ['turno', 'periodo'] }
  ],
  subjects: [
    { label: 'Código', key: 'code', synonyms: ['codigo', 'id', 'code', 'coddisc', 'cod_disc', 'disciplina'] },
    { label: 'Nome da Disciplina', key: 'name', synonyms: ['disciplina', 'nome', 'subject', 'materia'] },
    { label: 'Conteúdo Programático', key: 'program_content', synonyms: ['conteudo', 'ementa', 'program'] }
  ],
  parishes: [
    { label: 'Código', key: 'code', synonyms: ['codigo', 'code', 'id', 'paroquia_id'] },
    { label: 'Nome da Paróquia', key: 'name', synonyms: ['paroquia', 'nome', 'parish', 'church'] },
    { label: 'Forania', key: 'forania', synonyms: ['forania', 'vicariato', 'region'] },
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
  ]
};

export function Import() {
  const navigate = useNavigate();
  const { status, startImport: startGlobalImport, updateProgress, setError: setGlobalError, finishImport, resetImport: resetGlobalImport } = useImport();
  const [importType, setImportType] = useState<ImportType | null>(null);
  const [step, setStep] = useState<ImportStep>('type');
  const [file, setFile] = useState<File | null>(null);
  const [data, setData] = useState<any[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [mappings, setMappings] = useState<Record<string, string>>({});
  const [importStats, setImportStats] = useState({ total: 0, imported: 0, error: '' });

  // Sync internal stats with global status
  useEffect(() => {
    if (status.isProcessing || (status.progress === 100 && status.type)) {
      setImportStats({
        total: status.total,
        imported: status.imported,
        error: status.error
      });
    }
  }, [status.imported, status.total, status.error, status.isProcessing, status.progress, status.type]);

  const handleTypeSelect = (type: ImportType) => {
    setImportType(type);
    setStep('upload');
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement> | React.DragEvent) => {
    let selectedFile: File | null = null;
    if ('files' in e.target && e.target.files) selectedFile = e.target.files[0];
    else if ('dataTransfer' in e && e.dataTransfer.files) selectedFile = e.dataTransfer.files[0];

    if (selectedFile && importType) {
      setFile(selectedFile);
      const reader = new FileReader();
      reader.onload = (evt) => {
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
              field.synonyms.some(syn => col.toLowerCase().includes(syn.toLowerCase()))
            );
            if (match) newMappings[field.key] = match;
          });
          setMappings(newMappings);
        }
        setData(jsonData);
        setStep('mapping');
      };
      reader.readAsBinaryString(selectedFile);
    }
  };

  const startImport = async () => {
    if (!importType) return;
    setStep('processing');
    const total = data.length;
    startGlobalImport(importType, total);

    setImportStats({ total, imported: 0, error: '' });

    const uniqueField = importType === 'students' ? 'registration_number' : 'code';
    
    // Get ALL existing unique identifiers to ensure absolute uniqueness
    const allExisting = await fetchAll(importType, uniqueField, uniqueField, true);
    
    const existingIdentifiers = new Set<string>(allExisting?.map(s => s[uniqueField]) || []);
    const seenInImport = new Set<string>();

    // Find max numeric code for auto-generation if needed
    let maxNumericCode = 0;
    allExisting?.forEach(item => {
      const val = item[uniqueField];
      if (typeof val === 'string') {
        let numPart = '';
        if (val.includes('/')) {
          numPart = val.split('/')[0];
        } else if (val.length === 10) {
          // Check if it's NNNNNNYYYY
          numPart = val.substring(0, 6);
        } else {
          numPart = val;
        }
        const num = parseInt(numPart.replace(/\D/g, ''));
        if (!isNaN(num)) maxNumericCode = Math.max(maxNumericCode, num);
      }
    });

    const batchSize = 50;
    let processed = 0;

    for (let i = 0; i < total; i += batchSize) {
      const batch = data.slice(i, i + batchSize);
      const toInsert = batch.map((row: any, index: number) => {
        const entity: any = { 
          created_at: new Date().toISOString() 
        };

        // Map fields from sheet to DB
        Object.entries(mappings).forEach(([dbField, sheetColumn]) => {
          const column = sheetColumn as string;
          if (column && row[column] !== undefined) {
            entity[dbField] = row[column];
          }
        });

        // Status mapping for students (SIT column)
        if (importType === 'students' && entity.status !== undefined) {
          const sit = String(entity.status);
          if (sit === '0') entity.status = 'Ativo';
          else if (sit === '1') entity.status = 'Inativo';
          else if (sit === '2') entity.status = 'Concluído';
          else if (sit === '3') entity.status = 'Suspenso';
          else if (!['Ativo', 'Inativo', 'Concluído', 'Suspenso'].includes(entity.status)) {
            entity.status = 'Ativo';
          }
        }

        // Ensure name exists
        if (!entity.name || String(entity.name).trim() === '') {
          entity.name = 'REGISTRO SEM NOME';
        }

        // Ensure unique identifier exists
        let rawId = String(entity[uniqueField] || '').trim();

        // Student registration number refinement
        if (importType === 'students' && rawId !== '') {
          // Fix inverted format (YYYYNNNNNN -> NNNNNNYYYY)
          // If it has 10 digits and starts with a year (19xx or 20xx)
          if (rawId.length === 10 && /^(19|20)\d{2}/.test(rawId)) {
            const yearPart = rawId.substring(0, 4);
            const seqPart = rawId.substring(4);
            rawId = seqPart + yearPart;
            entity[uniqueField] = rawId;
          }
          // Remove slashes if present (NNNNNN/YYYY -> NNNNNNYYYY)
          if (rawId.includes('/')) {
            rawId = rawId.replace(/\//g, '');
            entity[uniqueField] = rawId;
          }
        }

        if (rawId === '') {
          const nextNum = maxNumericCode + processed + index + 1;
          if (importType === 'students') {
            const yearStr = new Date().getFullYear().toString();
            entity[uniqueField] = `${String(nextNum).padStart(6, '0')}${yearStr}`;
          } else {
            entity[uniqueField] = String(nextNum).padStart(4, '0');
          }
        }

        // Handle duplicates within the file or against DB
        let finalId = String(entity[uniqueField]).trim();
        let suffix = 1;
        const originalId = finalId;
        
        while (seenInImport.has(finalId) || existingIdentifiers.has(finalId)) {
          // If we are upserting and the ID matches exactly what's in DB, we might want to allow it if we are updating
          // But seenInImport is definitely a conflict within the same batch
          if (seenInImport.has(finalId)) {
            suffix++;
            if (originalId.includes('/')) {
              const parts = originalId.split('/');
              finalId = `${parts[0]}-${suffix}/${parts[1]}`;
            } else {
              finalId = `${originalId}-${suffix}`;
            }
          } else {
            // It's in DB, so upsert will handle it (update)
            break;
          }
        }
        entity[uniqueField] = finalId;
        seenInImport.add(finalId);

        return entity;
      });

      if (toInsert.length > 0) {
        try {
          const collRef = collection(db, importType);
          for (const entity of toInsert) {
            // Sanitise docId: Firestore IDs cannot contain '/'
            const docId = String(entity[uniqueField]).replace(/\//g, '-');
            
            // Sync both Supabase and Firebase
            await saveData(importType, docId, entity);
          }
          const currentImported = (processed + batch.length) > total ? total : (processed + batch.length);
          updateProgress(currentImported, Math.round((currentImported / total) * 100));
        } catch (error: any) {
          console.error(`Import error in batch starting at ${i}:`, error);
          setGlobalError(error.message);
        }
      }

      processed += batch.length;
    }

    finishImport();
    setStep('review');
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <header>
        <h2 className="text-3xl font-extrabold text-[#131b2e] tracking-tight mb-2">Importação de Dados</h2>
        <p className="text-slate-500">Sincronize seus registros Excel com o sistema de forma inteligente.</p>
      </header>

      {/* Steps Indicator */}
      <div className="flex items-center gap-4 bg-white p-4 rounded-3xl shadow-sm border border-slate-100">
        {[
          { id: 'type', label: 'Tipo' },
          { id: 'upload', label: 'Arquivo' },
          { id: 'mapping', label: 'Campos' },
          { id: 'processing', label: 'Processando' },
          { id: 'review', label: 'Concluído' }
        ].map((s, i) => (
          <React.Fragment key={s.id}>
            <div className={cn(
              "flex items-center gap-2",
              step === s.id ? "opacity-100" : "opacity-40"
            )}>
              <div className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold",
                step === s.id ? "bg-blue-600 text-white" : "bg-slate-200 text-slate-500"
              )}>
                {i + 1}
              </div>
              <span className="text-xs font-bold text-[#131b2e]">{s.label}</span>
            </div>
            {i < 4 && <div className="flex-1 h-px bg-slate-100"></div>}
          </React.Fragment>
        ))}
      </div>

      {step === 'type' && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {[
            { id: 'students', label: 'Alunos', icon: Users, color: 'bg-blue-50 text-blue-600' },
            { id: 'teachers', label: 'Professores', icon: UserSquare2, color: 'bg-purple-50 text-purple-600' },
            { id: 'classes', label: 'Turmas', icon: School, color: 'bg-orange-50 text-orange-600' },
            { id: 'subjects', label: 'Disciplinas', icon: BookOpen, color: 'bg-green-50 text-green-600' },
            { id: 'parishes', label: 'Paróquias', icon: Church, color: 'bg-indigo-50 text-indigo-600' },
            { id: 'foraries', label: 'Foranias', icon: Map, color: 'bg-rose-50 text-rose-600' }
          ].map((type) => (
            <button
              key={type.id}
              onClick={() => handleTypeSelect(type.id as ImportType)}
              className="bg-white p-8 rounded-2xl border border-slate-100 shadow-sm hover:shadow-xl hover:scale-[1.02] transition-all group text-center space-y-4"
            >
              <div className={cn("w-16 h-16 mx-auto rounded-3xl flex items-center justify-center group-hover:scale-110 transition-transform", type.color)}>
                <type.icon size={32} />
              </div>
              <h3 className="font-bold text-[#131b2e]">{type.label}</h3>
            </button>
          ))}
        </div>
      )}

      {step === 'upload' && (
        <div 
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => { e.preventDefault(); setIsDragging(false); handleFileUpload(e); }}
          className={cn(
            "bg-white rounded-3xl border-2 border-dashed p-20 text-center transition-all duration-300",
            isDragging ? "border-blue-500 bg-blue-50" : "border-slate-200 hover:border-blue-500"
          )}
        >
          <div className="flex flex-col items-center">
            <div className="w-20 h-20 bg-blue-50 rounded-3xl flex items-center justify-center mb-6">
              <CloudUpload size={40} className="text-blue-600" />
            </div>
            <h3 className="text-2xl font-bold text-[#131b2e] mb-2">Importar {
              importType === 'students' ? 'Alunos' : 
              importType === 'teachers' ? 'Professores' : 
              importType === 'classes' ? 'Turmas' : 
              importType === 'subjects' ? 'Disciplinas' : 
              importType === 'parishes' ? 'Paróquias' : 'Foranias'
            }</h3>
            <p className="text-slate-500 mb-8">Arraste seu arquivo Excel ou CSV aqui</p>
            <label className="px-8 py-4 bg-[#00174b] text-white rounded-2xl font-bold cursor-pointer hover:scale-105 transition-all shadow-xl">
              Selecionar Arquivo
              <input type="file" className="hidden" accept=".xlsx,.xls,.csv" onChange={handleFileUpload} />
            </label>
          </div>
        </div>
      )}

      {step === 'mapping' && importType && (
        <div className="bg-white rounded-3xl p-8 border border-slate-100 space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold text-[#131b2e]">Mapeamento de Colunas</h3>
            <span className="px-4 py-1 bg-blue-50 text-blue-600 rounded-full text-xs font-bold">{data.length} registros</span>
          </div>
          <div className="space-y-3">
            {ENTITY_FIELDS[importType].map((field) => (
              <div key={field.key} className="grid grid-cols-2 gap-4 items-center p-4 bg-slate-50 rounded-2xl">
                <span className="text-sm font-bold text-[#131b2e]">{field.label}</span>
                <select 
                  value={mappings[field.key] || ''}
                  onChange={(e) => setMappings({ ...mappings, [field.key]: e.target.value })}
                  className="bg-white border-none rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20"
                >
                  <option value="">Ignorar</option>
                  {Object.keys(data[0] || {}).map(k => <option key={k} value={k}>{k}</option>)}
                </select>
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-4 pt-4">
            <button onClick={() => setStep('upload')} className="px-6 py-2 text-slate-500 font-bold">Voltar</button>
            <button onClick={startImport} className="px-8 py-3 bg-blue-600 text-white rounded-2xl font-bold shadow-lg hover:bg-blue-700 transition-all">Iniciar Importação</button>
          </div>
        </div>
      )}

      {step === 'processing' && (
        <div className="bg-white rounded-3xl p-20 text-center space-y-6 shadow-sm border border-slate-100">
          <Loader2 className="w-16 h-16 text-blue-600 animate-spin mx-auto" />
          <h3 className="text-2xl font-bold text-[#131b2e]">Processando Dados...</h3>
          <div className="max-w-md mx-auto h-3 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-blue-600 transition-all duration-300" style={{ width: `${status.progress}%` }}></div>
          </div>
          <p className="text-sm font-bold text-slate-400">{status.progress}% concluído</p>
        </div>
      )}

      {step === 'review' && (
        <div className="bg-white rounded-3xl p-12 text-center space-y-6 shadow-sm border border-slate-100">
          <div className="w-20 h-20 bg-green-50 text-green-600 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle2 size={48} />
          </div>
          <h3 className="text-2xl font-bold text-[#131b2e]">Importação Concluída!</h3>
          
          {importStats.error && (
            <div className="p-4 bg-red-50 border border-red-100 rounded-2xl flex items-center gap-3 text-red-600 text-sm font-medium max-w-md mx-auto">
              <AlertCircle size={20} />
              <p className="text-left">{importStats.error}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4 max-w-sm mx-auto">
            <div className="p-4 bg-slate-50 rounded-2xl">
              <p className="text-2xl font-black text-[#131b2e]">{importStats.total}</p>
              <p className="text-xs font-bold text-slate-400 uppercase">Processados</p>
            </div>
            <div className="p-4 bg-green-50 rounded-2xl">
              <p className="text-2xl font-black text-green-600">{importStats.imported}</p>
              <p className="text-xs font-bold text-green-400 uppercase">Sincronizados</p>
            </div>
          </div>
          <button 
            onClick={() => navigate(`/${importType}`)}
            className="px-8 py-3 bg-[#00174b] text-white rounded-2xl font-bold shadow-xl hover:scale-105 transition-all"
          >
            Ver {
              importType === 'students' ? 'Alunos' : 
              importType === 'teachers' ? 'Professores' : 
              importType === 'classes' ? 'Turmas' : 
              importType === 'subjects' ? 'Disciplinas' : 
              importType === 'parishes' ? 'Paróquias' : 'Foranias'
            }
          </button>
        </div>
      )}
    </div>
  );
}
