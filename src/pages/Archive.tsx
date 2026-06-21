import React, { useState, useEffect, useMemo } from 'react';
import { 
  Archive, 
  Trash2, 
  RotateCcw, 
  Loader2, 
  CheckCircle2, 
  AlertCircle, 
  Search, 
  User, 
  UserSquare2, 
  School, 
  BookOpen, 
  HelpCircle, 
  Clock, 
  Play,
  ArrowRight,
  ShieldAlert,
  Info
} from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { fetchAll, saveData } from '../lib/database';
import { motion, AnimatePresence } from 'motion/react';

// Definitions for scan items
interface ScanCandidate {
  id: string;
  name: string;
  type: 'student' | 'teacher' | 'class' | 'subject';
  typeLabel: string;
  currentStatus: string;
  lastInteractionDate: Date;
  lastInteractionLabel: string;
  recommendedAction: 'inactivate' | 'archive';
  originalRecord: any;
  reason: string;
}

export function ArchivePage() {
  const [activeTab, setActiveTab] = useState<'scan' | 'deep_search'>('scan');
  const [loadingScan, setLoadingScan] = useState(false);
  const [candidates, setCandidates] = useState<ScanCandidate[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  
  // Counts of primary data
  const [primaryStats, setPrimaryStats] = useState({
    students: { active: 0, inactive: 0, archived: 0 },
    teachers: { active: 0, inactive: 0, archived: 0 },
    subjects: { active: 0, inactive: 0, archived: 0 },
    classes: { active: 0, inactive: 0, archived: 0 }
  });

  // Deep search states
  const [searchType, setSearchType] = useState<'students' | 'teachers' | 'classes' | 'subjects'>('students');
  const [searchQuery, setSearchQuery] = useState('');
  const [deepSearchResults, setDeepSearchResults] = useState<any[]>([]);
  const [loadingSearch, setLoadingSearch] = useState(false);

  // Notification states
  const [notification, setNotification] = useState<{type: 'success' | 'err' | 'info', message: string} | null>(null);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [loadingTestMigration, setLoadingTestMigration] = useState(false);

  const triggerNotification = (type: 'success' | 'err' | 'info', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 7000);
  };

  // Helper function to bypass standard Supabase 1000-records limit by paginating the fetch.
  const fetchAllFromTable = async <T = any,>(
    tableName: string, 
    selectFields: string = '*', 
    eqFilters?: Record<string, string>
  ): Promise<T[]> => {
    let allData: T[] = [];
    let page = 0;
    const pageSize = 1000;
    let keepFetching = true;

    while (keepFetching) {
      let query = supabase
        .from(tableName)
        .select(selectFields)
        .range(page * pageSize, (page + 1) * pageSize - 1);
      
      if (eqFilters) {
        Object.entries(eqFilters).forEach(([key, val]) => {
          query = query.eq(key, val);
        });
      }

      const { data, error } = await query;
      if (error) {
        console.error(`Error pagination fetching from ${tableName}:`, error);
        break;
      }
      if (!data || data.length === 0) {
        keepFetching = false;
      } else {
        allData = [...allData, ...(data as any[])];
        if (data.length < pageSize) {
          keepFetching = false;
        } else {
          page++;
        }
      }
    }
    return allData;
  };

  // Special test function to move all inactive students, teachers, and classes immediately to the archive.
  const handleRunTestMigration = async () => {
    const confirmMove = window.confirm(
      "Atenção: Esta ação irá transferir IMEDIATAMENTE todos os Alunos, Professores e Turmas atualmente com o status 'Inativo' para a base do Arquivo Morto. As dependências associadas (matrículas, faltas e diários) serão catalogadas e removidas para garantir a integridade do banco de dados. Deseja prosseguir com este teste de limpeza?"
    );
    if (!confirmMove) return;

    setLoadingTestMigration(true);
    let migratedStudents = 0;
    let migratedTeachers = 0;
    let migratedClasses = 0;
    let errorsCount = 0;

    try {
      // 1. Process Students - using the pagination helper to fetch ALL inactive students without 1000-row limits
      const inactiveStudents = await fetchAllFromTable('students', '*', { status: 'Inativo' });
      if (inactiveStudents && inactiveStudents.length > 0) {
        for (const student of inactiveStudents) {
          const clonePayload = { ...student, status: 'Arquivado' };
          const { error: insErr } = await supabase.from('archived_students').insert([clonePayload]);
          if (!insErr) {
            // Delete secondary info
            await Promise.all([
              supabase.from('attendances').delete().eq('student_id', student.id),
              supabase.from('grades').delete().eq('student_id', student.id),
              supabase.from('contributions').delete().eq('student_id', student.id),
              supabase.from('enrollments').delete().eq('student_id', student.id)
            ]);
            // Delete from active
            const { error: delErr } = await supabase.from('students').delete().eq('id', student.id);
            if (!delErr) {
              migratedStudents++;
            } else {
              errorsCount++;
              // Rollback insertion inside archive
              await supabase.from('archived_students').delete().eq('id', student.id);
            }
          } else {
            console.error('Error inserting archived student:', insErr);
            errorsCount++;
          }
        }
      }

      // 2. Process Teachers - fetch ALL inactive teachers
      const inactiveTeachers = await fetchAllFromTable('teachers', '*', { status: 'Inativo' });
      if (inactiveTeachers && inactiveTeachers.length > 0) {
        for (const teacher of inactiveTeachers) {
          const clonePayload = { ...teacher, status: 'Arquivado' };
          const { error: insErr } = await supabase.from('archived_teachers').insert([clonePayload]);
          if (!insErr) {
            // Suppress secondary events
            await supabase.from('calendar_events').delete().eq('user_id', teacher.id);
            // Delete from active
            const { error: delErr } = await supabase.from('teachers').delete().eq('id', teacher.id);
            if (!delErr) {
              migratedTeachers++;
            } else {
              errorsCount++;
              await supabase.from('archived_teachers').delete().eq('id', teacher.id);
            }
          } else {
            console.error('Error inserting archived teacher:', insErr);
            errorsCount++;
          }
        }
      }

      // 3. Process Classes - fetch ALL inactive classes
      const inactiveClasses = await fetchAllFromTable('classes', '*', { status: 'Inativo' });
      if (inactiveClasses && inactiveClasses.length > 0) {
        for (const cls of inactiveClasses) {
          const clonePayload = { ...cls, status: 'Arquivado' };
          const { error: insErr } = await supabase.from('archived_classes').insert([clonePayload]);
          if (!insErr) {
            // Suppress references
            await Promise.all([
              supabase.from('enrollments').delete().eq('class_id', cls.id),
              supabase.from('attendances').delete().eq('class_id', cls.id),
              supabase.from('grades').delete().eq('class_id', cls.id)
            ]);
            // Delete from active
            const { error: delErr } = await supabase.from('classes').delete().eq('id', cls.id);
            if (!delErr) {
              migratedClasses++;
            } else {
              errorsCount++;
              await supabase.from('archived_classes').delete().eq('id', cls.id);
            }
          } else {
            console.error('Error inserting archived class:', insErr);
            errorsCount++;
          }
        }
      }

      triggerNotification(
        'success',
        `Teste de limpeza concluído com sucesso! Transferidos para o arquivo morto: ${migratedStudents} Alunos, ${migratedTeachers} Professores e ${migratedClasses} Turmas.`
      );
      
      // Refresh calculations
      await fetchStats();
      await handleScanSystem();
    } catch (e: any) {
      console.error('Test migration pipeline failed:', e);
      triggerNotification('err', 'Ocorreu um erro ao migrar os dados inativos.');
    } finally {
      setLoadingTestMigration(false);
    }
  };

  // 1. Fetch statistics
  const fetchStats = async () => {
    if (!isSupabaseConfigured) return;
    try {
      // Students count queries bypassing any 1000 records API limit
      const { count: studentsTotal } = await supabase.from('students').select('*', { count: 'exact', head: true });
      const { count: studentsInactive } = await supabase.from('students').select('*', { count: 'exact', head: true }).eq('status', 'Inativo');
      const { count: studentArchived } = await supabase.from('archived_students').select('*', { count: 'exact', head: true });
      const studentsActive = (studentsTotal || 0) - (studentsInactive || 0);

      // Teachers count queries
      const { count: teachersTotal } = await supabase.from('teachers').select('*', { count: 'exact', head: true });
      const { count: teachersInactive } = await supabase.from('teachers').select('*', { count: 'exact', head: true }).eq('status', 'Inativo');
      const { count: teacherArchived } = await supabase.from('archived_teachers').select('*', { count: 'exact', head: true });
      const teachersActive = (teachersTotal || 0) - (teachersInactive || 0);

      // Subjects count queries
      const { count: subjectsTotal } = await supabase.from('subjects').select('*', { count: 'exact', head: true });
      const { count: subjectsInactive } = await supabase.from('subjects').select('*', { count: 'exact', head: true }).eq('status', 'Inativo');
      const { count: subjectArchived } = await supabase.from('archived_subjects').select('*', { count: 'exact', head: true });
      const subjectsActive = (subjectsTotal || 0) - (subjectsInactive || 0);

      // Classes count queries
      const { count: classesTotal } = await supabase.from('classes').select('*', { count: 'exact', head: true });
      const { count: classesInactive } = await supabase.from('classes').select('*', { count: 'exact', head: true }).eq('status', 'Inativo');
      const { count: classArchived } = await supabase.from('archived_classes').select('*', { count: 'exact', head: true });
      const classesActive = (classesTotal || 0) - (classesInactive || 0);

      setPrimaryStats({
        students: { active: studentsActive, inactive: studentsInactive || 0, archived: studentArchived || 0 },
        teachers: { active: teachersActive, inactive: teachersInactive || 0, archived: teacherArchived || 0 },
        subjects: { active: subjectsActive, inactive: subjectsInactive || 0, archived: subjectArchived || 0 },
        classes: { active: classesActive, inactive: classesInactive || 0, archived: classArchived || 0 }
      });
    } catch (e) {
      console.error('Error fetching archive stats:', e);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  // 2. Perform Scanning logic matching the strict user parameters
  const handleScanSystem = async () => {
    setLoadingScan(true);
    setCandidates([]);
    setSelectedIds([]);

    try {
      const now = new Date();
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(now.getFullYear() - 1);
      
      const twoYearsAgo = new Date();
      twoYearsAgo.setFullYear(now.getFullYear() - 2);

      const fourYearsAgo = new Date();
      fourYearsAgo.setFullYear(now.getFullYear() - 4);

      const fiveYearsAgo = new Date();
      fiveYearsAgo.setFullYear(now.getFullYear() - 5);

      // A. Fetch related interactive files to establish actual "last interaction" - paginated to verify all entries completely database-wide
      const [
        studentsList, teachersList, subjectsList, classesList,
        attendances, grades, contributions
      ] = await Promise.all([
        fetchAllFromTable('students', '*'),
        fetchAllFromTable('teachers', '*'),
        fetchAllFromTable('subjects', '*'),
        fetchAllFromTable('classes', '*'),
        fetchAllFromTable('attendances', 'student_id, date, created_at'),
        fetchAllFromTable('grades', 'student_id, created_at'),
        fetchAllFromTable('contributions', 'student_id, payment_date')
      ]);

      // Create maps for fast lookups
      const studentInteractionMap: Record<string, Date> = {};

      // Fill in based on core tables
      studentsList.forEach(s => {
        studentInteractionMap[s.id] = s.updated_at ? new Date(s.updated_at) : (s.created_at ? new Date(s.created_at) : new Date(0));
      });

      // Update maps based on sub-tables
      attendances.forEach(att => {
        if (!att.student_id) return;
        const sDate = att.date ? new Date(att.date) : (att.created_at ? new Date(att.created_at) : null);
        if (sDate && (!studentInteractionMap[att.student_id] || sDate > studentInteractionMap[att.student_id])) {
          studentInteractionMap[att.student_id] = sDate;
        }
      });

      grades.forEach(g => {
        if (!g.student_id) return;
        const gDate = g.created_at ? new Date(g.created_at) : null;
        if (gDate && (!studentInteractionMap[g.student_id] || gDate > studentInteractionMap[g.student_id])) {
          studentInteractionMap[g.student_id] = gDate;
        }
      });

      contributions.forEach(c => {
        if (!c.student_id) return;
        const cDate = c.payment_date ? new Date(c.payment_date) : null;
        if (cDate && (!studentInteractionMap[c.student_id] || cDate > studentInteractionMap[c.student_id])) {
          studentInteractionMap[c.student_id] = cDate;
        }
      });

      const list: ScanCandidate[] = [];

      // 1. Process Alunos (Students)
      studentsList.forEach(student => {
        const lastDate = studentInteractionMap[student.id] || new Date(0);
        const status = student.status || 'Ativo';

        if (status === 'Ativo' && lastDate < oneYearAgo) {
          list.push({
            id: student.id,
            name: student.name,
            type: 'student',
            typeLabel: 'Aluno',
            currentStatus: 'Ativo',
            lastInteractionDate: lastDate,
            lastInteractionLabel: lastDate.getTime() === 0 ? 'Sem registros' : lastDate.toLocaleDateString('pt-BR'),
            recommendedAction: 'inactivate',
            originalRecord: student,
            reason: 'Inativo por ausência de interação nos últimos 12 meses.'
          });
        } else if (status === 'Inativo' && lastDate < twoYearsAgo) {
          list.push({
            id: student.id,
            name: student.name,
            type: 'student',
            typeLabel: 'Aluno',
            currentStatus: 'Inativo',
            lastInteractionDate: lastDate,
            lastInteractionLabel: lastDate.getTime() === 0 ? 'Sem registros' : lastDate.toLocaleDateString('pt-BR'),
            recommendedAction: 'archive',
            originalRecord: student,
            reason: 'Inativo há mais de 1 ano sem re-interação (Arquivo Morto).'
          });
        }
      });

      // 2. Process Professores (Teachers)
      teachersList.forEach(teacher => {
        const lastDate = teacher.updated_at ? new Date(teacher.updated_at) : (teacher.created_at ? new Date(teacher.created_at) : new Date(0));
        const status = teacher.status || 'Ativo';

        if (status === 'Ativo' && lastDate < oneYearAgo) {
          list.push({
            id: teacher.id,
            name: teacher.name,
            type: 'teacher',
            typeLabel: 'Professor',
            currentStatus: 'Ativo',
            lastInteractionDate: lastDate,
            lastInteractionLabel: lastDate.getTime() === 0 ? 'Sem registros' : lastDate.toLocaleDateString('pt-BR'),
            recommendedAction: 'inactivate',
            originalRecord: teacher,
            reason: 'Professor sem atualizações no cadastro ou interação há mais de 1 ano.'
          });
        } else if (status === 'Inativo' && lastDate < twoYearsAgo) {
          list.push({
            id: teacher.id,
            name: teacher.name,
            type: 'teacher',
            typeLabel: 'Professor',
            currentStatus: 'Inativo',
            lastInteractionDate: lastDate,
            lastInteractionLabel: lastDate.getTime() === 0 ? 'Sem registros' : lastDate.toLocaleDateString('pt-BR'),
            recommendedAction: 'archive',
            originalRecord: teacher,
            reason: 'Professor inativo sem movimentação recente por mais de 1 ano.'
          });
        }
      });

      // 3. Process Disciplinas (Subjects)
      subjectsList.forEach(subj => {
        const lastDate = subj.updated_at ? new Date(subj.updated_at) : (subj.created_at ? new Date(subj.created_at) : new Date(0));
        const status = subj.status || 'Ativo';

        if (status === 'Ativo' && lastDate < oneYearAgo) {
          list.push({
            id: subj.id,
            name: subj.name,
            type: 'subject',
            typeLabel: 'Disciplina',
            currentStatus: 'Ativo',
            lastInteractionDate: lastDate,
            lastInteractionLabel: lastDate.getTime() === 0 ? 'Sem registros' : lastDate.toLocaleDateString('pt-BR'),
            recommendedAction: 'inactivate',
            originalRecord: subj,
            reason: 'Sem vínculo novo ou alteração na disciplina há mais de 1 ano.'
          });
        } else if (status === 'Inativo' && lastDate < twoYearsAgo) {
          list.push({
            id: subj.id,
            name: subj.name,
            type: 'subject',
            typeLabel: 'Disciplina',
            currentStatus: 'Inativo',
            lastInteractionDate: lastDate,
            lastInteractionLabel: lastDate.getTime() === 0 ? 'Sem registros' : lastDate.toLocaleDateString('pt-BR'),
            recommendedAction: 'archive',
            originalRecord: subj,
            reason: 'Disciplina inativada sem novas atualizações há mais de 1 ano.'
          });
        }
      });

      // 4. Process Turmas (Classes)
      // Grab enrollment map of student count
      const activeEnrollments = attendances.length > 0; // standard indicator, but let's query the actual active enrollments if any
      // Let's call the enrollments table - paginated helper to avoid 1000 records limit
      const enrollments = await fetchAllFromTable('enrollments', 'class_id, status');
      
      const classEnrollmentCount: Record<string, number> = {};
      classesList.forEach(c => {
        classEnrollmentCount[c.id] = 0;
      });
      enrollments?.forEach(enr => {
        if (enr.status === 'Ativo' && classEnrollmentCount[enr.class_id] !== undefined) {
          classEnrollmentCount[enr.class_id]++;
        }
      });

      classesList.forEach(c => {
        const createDate = c.start_date ? new Date(c.start_date) : (c.created_at ? new Date(c.created_at) : new Date(0));
        const activeStudents = classEnrollmentCount[c.id] || 0;
        const status = c.status || 'Ativo';

        if (status === 'Ativo' && createDate < fourYearsAgo && activeStudents === 0) {
          list.push({
            id: c.id,
            name: c.name || c.code,
            type: 'class',
            typeLabel: 'Turma',
            currentStatus: 'Ativo',
            lastInteractionDate: createDate,
            lastInteractionLabel: createDate.getTime() === 0 ? 'Sem início' : createDate.toLocaleDateString('pt-BR'),
            recommendedAction: 'inactivate',
            originalRecord: c,
            reason: 'Turma criada há mais de 4 anos sem alunos ativos cadastrados.'
          });
        } else if (status === 'Inativo' && createDate < fiveYearsAgo && activeStudents === 0) {
          list.push({
            id: c.id,
            name: c.name || c.code,
            type: 'class',
            typeLabel: 'Turma',
            currentStatus: 'Inativo',
            lastInteractionDate: createDate,
            lastInteractionLabel: createDate.getTime() === 0 ? 'Sem início' : createDate.toLocaleDateString('pt-BR'),
            recommendedAction: 'archive',
            originalRecord: c,
            reason: 'Turma inativada com mais de 5 anos de criação.'
          });
        }
      });

      setCandidates(list);
      triggerNotification('success', `Varredura executada! Encontramos ${list.length} registros que atendem às regras de inatividade.`);
    } catch (error: any) {
      console.error('Failure on system scan:', error);
      triggerNotification('err', 'Ocorreu um erro ao realizar a varredura do banco de dados.');
    } finally {
      setLoadingScan(false);
    }
  };

  // Select helpers
  const handleToggleSelect = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleSelectAll = (action: 'inactivate' | 'archive') => {
    const listForAction = candidates.filter(c => c.recommendedAction === action).map(c => c.id);
    const allSelectedAlready = listForAction.every(id => selectedIds.includes(id));
    
    if (allSelectedAlready) {
      // Unselect only these candidates
      setSelectedIds(prev => prev.filter(id => !listForAction.includes(id)));
    } else {
      // Select all of these candidates
      setSelectedIds(prev => Array.from(new Set([...prev, ...listForAction])));
    }
  };

  // 3. Process execution block (Inactivate selected or Archive selected)
  const handleExecuteSelectedActions = async (action: 'inactivate' | 'archive') => {
    const itemsToProcess = candidates.filter(c => selectedIds.includes(c.id) && c.recommendedAction === action);
    if (itemsToProcess.length === 0) {
      triggerNotification('err', 'Por favor, selecione ao menos um registro correspondente na lista.');
      return;
    }

    setActionInProgress(action);
    let successCount = 0;
    let failCount = 0;

    try {
      for (const item of itemsToProcess) {
        if (action === 'inactivate') {
          // Simply update the status in the primary table to 'Inativo'
          const tableName = item.type === 'student' ? 'students' 
                          : item.type === 'teacher' ? 'teachers' 
                          : item.type === 'class' ? 'classes' 
                          : 'subjects';
          
          const { error } = await supabase
            .from(tableName)
            .update({ status: 'Inativo' })
            .eq('id', item.id);

          if (!error) successCount++;
          else {
            console.error(`Error inactivating ${item.type} ${item.id}:`, error);
            failCount++;
          }
        } else {
          // Archiving action. Must transfer first, resolve foreign key constraints, then delete from primary.
          const sourceTable = item.type === 'student' ? 'students' 
                            : item.type === 'teacher' ? 'teachers' 
                            : item.type === 'class' ? 'classes' 
                            : 'subjects';

          const archiveTable = item.type === 'student' ? 'archived_students' 
                             : item.type === 'teacher' ? 'archived_teachers' 
                             : item.type === 'class' ? 'archived_classes' 
                             : 'archived_subjects';

          const clonePayload = { ...item.originalRecord, status: 'Arquivado' };

          // A. Insert into archive table
          const { error: insertError } = await supabase
            .from(archiveTable)
            .insert([clonePayload]);

          if (insertError) {
            console.error(`Error migrating item ${item.id} to archive:`, insertError);
            failCount++;
            continue;
          }

          // B. Suppress secondary records (frequência, notas, contribuições) to avoid referential errors
          if (item.type === 'student') {
            await Promise.all([
              supabase.from('attendances').delete().eq('student_id', item.id),
              supabase.from('grades').delete().eq('student_id', item.id),
              supabase.from('contributions').delete().eq('student_id', item.id),
              supabase.from('enrollments').delete().eq('student_id', item.id)
            ]);
          } else if (item.type === 'teacher') {
            // Nullify or wipe calendar events or classes linked to this teacher if restrictions occur
            await supabase.from('calendar_events').delete().eq('user_id', item.id);
          } else if (item.type === 'class') {
            await Promise.all([
              supabase.from('enrollments').delete().eq('class_id', item.id),
              supabase.from('attendances').delete().eq('class_id', item.id),
              supabase.from('grades').delete().eq('class_id', item.id)
            ]);
          } else if (item.type === 'subject') {
            await Promise.all([
              supabase.from('attendances').delete().eq('subject_id', item.id),
              supabase.from('grades').delete().eq('subject_id', item.id)
            ]);
          }

          // C. Delete from primary table
          const { error: deleteError } = await supabase
            .from(sourceTable)
            .delete()
            .eq('id', item.id);

          if (!deleteError) {
            successCount++;
          } else {
            console.error(`Error deleting original record ${item.id}:`, deleteError);
            failCount++;
            // Try to clean from archive table if deleted fails to maintain consistency
            await supabase.from(archiveTable).delete().eq('id', item.id);
          }
        }
      }

      triggerNotification(
        'success', 
        `Operação concluída com sucesso! Processados: ${successCount} registros.${failCount > 0 ? ` Erros: ${failCount}.` : ''}`
      );
      
      // Reload stats and scan list
      await fetchStats();
      await handleScanSystem();
    } catch (e: any) {
      console.error('Error executing batch action:', e);
      triggerNotification('err', 'Algo deu errado ao processar os registros selecionados.');
    } finally {
      setActionInProgress(null);
    }
  };

  // 4. Deep search inside archived files (Busca profunda)
  const handleDeepSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setLoadingSearch(true);
    setDeepSearchResults([]);

    try {
      const archiveTable = searchType === 'students' ? 'archived_students' 
                         : searchType === 'teachers' ? 'archived_teachers' 
                         : searchType === 'classes' ? 'archived_classes' 
                         : 'archived_subjects';

      let query = supabase.from(archiveTable).select('*');
      
      if (searchQuery.trim()) {
        if (searchType === 'classes') {
          query = query.or(`name.ilike.%${searchQuery}%,code.ilike.%${searchQuery}%`);
        } else if (searchType === 'subjects') {
          query = query.or(`name.ilike.%${searchQuery}%,code.ilike.%${searchQuery}%`);
        } else {
          // Students or Teachers search name
          query = query.ilike('name', `%${searchQuery}%`);
        }
      }

      const { data, error } = await query.limit(50);

      if (error) throw error;
      setDeepSearchResults(data || []);
      
      if ((data || []).length === 0) {
        triggerNotification('info', 'Nenhum registro encontrado no Arquivo Morto com os filtros especificados.');
      }
    } catch (error: any) {
      console.error('Deep search failed:', error);
      triggerNotification('err', 'Erro ao pesquisar no arquivo selecionado.');
    } finally {
      setLoadingSearch(false);
    }
  };

  // 5. Restore from the dead (Trazer de volta para dados Inativos)
  const handleRestoreFromArchive = async (record: any) => {
    setLoadingSearch(true);
    try {
      const sourceTable = searchType === 'students' ? 'students' 
                        : searchType === 'teachers' ? 'teachers' 
                        : searchType === 'classes' ? 'classes' 
                        : 'subjects';

      const archiveTable = searchType === 'students' ? 'archived_students' 
                         : searchType === 'teachers' ? 'archived_teachers' 
                         : searchType === 'classes' ? 'archived_classes' 
                         : 'archived_subjects';

      // Change status to 'Inativo' as requested by the user ("trazidos de volta para os dados inativos e posteriormente para os ativos")
      const restoredPayload = { ...record, status: 'Inativo' };

      // A. Insert into primary table
      const { error: insertError } = await supabase
        .from(sourceTable)
        .insert([restoredPayload]);

      if (insertError) {
        // If it fails, maybe the primary ID already exists or some core column issues.
        throw insertError;
      }

      // B. Delete from archive table
      const { error: deleteError } = await supabase
        .from(archiveTable)
        .delete()
        .eq('id', record.id);

      if (deleteError) {
        // Suppress or handle. If deleted from archive fails, we might end up with duplication. Let's delete from source to rollback.
        await supabase.from(sourceTable).delete().eq('id', record.id);
        throw deleteError;
      }

      triggerNotification('success', `✔ ${record.name || record.code || 'Registro'} foi restaurado com sucesso para a base com o status "Inativo".`);
      
      // Update lists
      await handleDeepSearch();
      await fetchStats();
    } catch (err: any) {
      console.error('Error restoring record from archive:', err);
      triggerNotification('err', `Erro ao restaurar registro: ${err.message || 'Código duplicado ou violação de chave'}`);
    } finally {
      setLoadingSearch(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 md:p-2">
      {/* Title section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-slate-200 pb-5 gap-4">
        <div>
          <h1 className="text-xl font-black text-[#00174b] uppercase tracking-widest flex items-center gap-2">
            <Archive className="text-slate-700" size={24} />
            Gestão do Arquivo Morto
          </h1>
          <p className="text-slate-500 text-[11px] font-bold uppercase tracking-wider mt-1">
            Mantenha o banco rápido limpando e isolando dados sem movimentação de forma controlada.
          </p>
        </div>
      </div>

      {/* Floating Notifications */}
      {notification && (
        <div className={`p-4 border ${
          notification.type === 'success' 
            ? 'bg-emerald-50 text-emerald-800 border-emerald-200' 
            : notification.type === 'info'
              ? 'bg-blue-50 text-blue-800 border-blue-200'
              : 'bg-red-50 text-red-800 border-red-200'
        } font-bold text-xs uppercase tracking-wider flex items-center justify-between shadow-sm animate-in fade-in zoom-in-95 duration-200`}>
          <div className="flex items-center gap-2">
            {notification.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
            <span>{notification.message}</span>
          </div>
          <button onClick={() => setNotification(null)} className="text-[10px] hover:underline uppercase pl-4 cursor-pointer">Fechar</button>
        </div>
      )}

      {/* General summary row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card Alunos */}
        <div className="bg-white border border-slate-200 p-5 flex flex-col justify-between">
          <div className="flex justify-between items-center">
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-500">Alunos</span>
            <User size={16} className="text-[#00174b]" />
          </div>
          <div className="mt-4 flex flex-col">
            <span className="text-2xl font-black text-slate-900 leading-none">{primaryStats.students.active + primaryStats.students.inactive}</span>
            <div className="flex justify-between text-[10px] font-bold uppercase text-slate-500 tracking-wider mt-2 pt-2 border-t border-slate-100">
              <span className="text-emerald-700">Ativos: {primaryStats.students.active}</span>
              <span className="text-slate-600">Inativos: {primaryStats.students.inactive}</span>
              <span className="text-[#00174b] font-black">Arquivados: {primaryStats.students.archived}</span>
            </div>
          </div>
        </div>

        {/* Card Professores */}
        <div className="bg-white border border-slate-200 p-5 flex flex-col justify-between">
          <div className="flex justify-between items-center">
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-500">Professores</span>
            <UserSquare2 size={16} className="text-[#00174b]" />
          </div>
          <div className="mt-4 flex flex-col">
            <span className="text-2xl font-black text-slate-900 leading-none">{primaryStats.teachers.active + primaryStats.teachers.inactive}</span>
            <div className="flex justify-between text-[10px] font-bold uppercase text-slate-500 tracking-wider mt-2 pt-2 border-t border-slate-100">
              <span className="text-emerald-700">Ativos: {primaryStats.teachers.active}</span>
              <span className="text-slate-600">Inativos: {primaryStats.teachers.inactive}</span>
              <span className="text-[#00174b] font-black">Arquivados: {primaryStats.teachers.archived}</span>
            </div>
          </div>
        </div>

        {/* Card Turmas */}
        <div className="bg-white border border-slate-200 p-5 flex flex-col justify-between">
          <div className="flex justify-between items-center">
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-500">Turmas</span>
            <School size={16} className="text-[#00174b]" />
          </div>
          <div className="mt-4 flex flex-col">
            <span className="text-2xl font-black text-slate-900 leading-none">{primaryStats.classes.active + primaryStats.classes.inactive}</span>
            <div className="flex justify-between text-[10px] font-bold uppercase text-slate-500 tracking-wider mt-2 pt-2 border-t border-slate-100">
              <span className="text-emerald-700">Ativos: {primaryStats.classes.active}</span>
              <span className="text-slate-600">Inativos: {primaryStats.classes.inactive}</span>
              <span className="text-[#00174b] font-black">Arquivados: {primaryStats.classes.archived}</span>
            </div>
          </div>
        </div>

        {/* Card Disciplinas */}
        <div className="bg-white border border-slate-200 p-5 flex flex-col justify-between">
          <div className="flex justify-between items-center">
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-500">Disciplinas</span>
            <BookOpen size={16} className="text-[#00174b]" />
          </div>
          <div className="mt-4 flex flex-col">
            <span className="text-2xl font-black text-slate-900 leading-none">{primaryStats.subjects.active + primaryStats.subjects.inactive}</span>
            <div className="flex justify-between text-[10px] font-bold uppercase text-slate-500 tracking-wider mt-2 pt-2 border-t border-slate-100">
              <span className="text-emerald-700">Ativos: {primaryStats.subjects.active}</span>
              <span className="text-slate-600">Inativos: {primaryStats.subjects.inactive}</span>
              <span className="text-[#00174b] font-black">Arquivados: {primaryStats.subjects.archived}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Selector Tabs */}
      <div className="flex bg-slate-100 p-1 border border-slate-200">
        <button
          onClick={() => setActiveTab('scan')}
          className={`flex-1 py-3 text-[10px] font-bold uppercase tracking-widest transition-all cursor-pointer ${
            activeTab === 'scan' ? 'bg-[#00174b] text-white' : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          Análise e Varredura de Inativos
        </button>
        <button
          onClick={() => setActiveTab('deep_search')}
          className={`flex-1 py-3 text-[10px] font-bold uppercase tracking-widest transition-all cursor-pointer ${
            activeTab === 'deep_search' ? 'bg-[#00174b] text-white' : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          Busca Profunda no Arquivo Morto
        </button>
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'scan' ? (
          <motion.div
            key="scan"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-6"
          >
            {/* Rules explanation banner */}
            <div className="bg-slate-50 p-6 border border-slate-200">
              <h2 className="text-xs font-black text-[#00174b] uppercase tracking-wider flex items-center gap-2 mb-4">
                <Info size={16} />
                Regras Automatizadas de Envelhecimento de Dados
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-[11px] leading-relaxed text-slate-600">
                <div className="space-y-2.5">
                  <div className="flex gap-2">
                    <Clock size={14} className="text-slate-700 shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-slate-800 uppercase tracking-widest block text-[10px] mb-0.5">Alunos, Professores e Disciplinas:</strong>
                      <p className="mb-1"><strong>Estágio 1 - Inativação Autônomo:</strong> Ausência total de qualquer interação, chamadas, notas ou transações financeiras por 1 ano ou mais → Status alterado para <strong>"Inativo"</strong>.</p>
                      <p><strong>Estágio 2 - Arquivo Morto:</strong> Inativos que permaneçam por mais 1 ano ou mais sem nenhuma nova interação → Transferência definitiva para as tabelas de arquivo morto.</p>
                    </div>
                  </div>
                </div>
                <div className="space-y-2.5">
                  <div className="flex gap-2">
                    <Clock size={14} className="text-slate-700 shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-slate-800 uppercase tracking-widest block text-[10px] mb-0.5">Turmas (Segurança Acadêmica):</strong>
                      <p className="mb-1"><strong>Estágio 1 - Inativação:</strong> Turmas criadas há mais de 4 anos de início de aula e com <strong>zero alunos ativos matriculados</strong> → Status vira <strong>"Inativo"</strong>.</p>
                      <p><strong>Estágio 2 - Arquivo Morto:</strong> Turmas inativas elegíveis, após 1 ano completo sem novas matrículas ou diários de frequência → Transferência e remoção para o arquivo.</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-6 pt-5 border-t border-slate-200 flex flex-col sm:flex-row justify-between items-center gap-4">
                <div className="text-left w-full sm:w-auto">
                  <span className="text-[9px] font-black uppercase text-rose-700 tracking-wider block">Área de Teste & Limpeza</span>
                  <p className="text-[10px] text-slate-500 font-bold max-w-sm leading-tight uppercase mt-0.5">
                    Mover todos os Alunos, Professores e Turmas atualmente com status "Inativo" diretamente para o Arquivo Morto.
                  </p>
                </div>
                <div className="flex flex-wrap gap-3 w-full sm:w-auto justify-end">
                  <button
                    onClick={handleRunTestMigration}
                    disabled={loadingTestMigration}
                    className="px-6 py-3 border-2 border-rose-600 text-rose-700 hover:bg-rose-50 disabled:bg-slate-100 disabled:text-slate-400 font-black text-[10px] uppercase tracking-widest flex items-center gap-2 transition-all cursor-pointer"
                  >
                    {loadingTestMigration ? (
                      <>
                        <Loader2 size={14} className="animate-spin" />
                        Migrando Registros de Teste...
                      </>
                    ) : (
                      <>
                        <Trash2 size={14} />
                        Executar Limpeza de Teste (Mover Inativos)
                      </>
                    )}
                  </button>

                  <button
                    onClick={handleScanSystem}
                    disabled={loadingScan}
                    className="px-6 py-3 bg-[#00174b] hover:bg-slate-900 disabled:bg-slate-400 text-white font-black text-[10px] uppercase tracking-widest flex items-center gap-2 transition-all cursor-pointer"
                  >
                    {loadingScan ? (
                      <>
                        <Loader2 size={14} className="animate-spin" />
                        Analisando Banco de Dados...
                      </>
                    ) : (
                      <>
                        <Play size={14} />
                        Iniciar Varredura e Análise de Otimização
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Scan results */}
            {candidates.length > 0 ? (
              <div className="space-y-6">
                {/* Tables split - Recommend Inactivation vs Recommend Archive */}
                {['inactivate', 'archive'].map((actionType) => {
                  const filteredCandidates = candidates.filter(c => c.recommendedAction === actionType);
                  if (filteredCandidates.length === 0) return null;

                  const actionTitle = actionType === 'inactivate' 
                    ? '1. Lançamentos Pendentes para INATIVAÇÃO (1 ano sem registros)' 
                    : '2. Lançamentos Pendentes para ARQUIVO MORTO (2 anos offline)';

                  const actionColor = actionType === 'inactivate' ? 'border-[#00174b]' : 'border-red-600';
                  const actionBtnColor = actionType === 'inactivate' ? 'bg-[#00174b] hover:bg-slate-900' : 'bg-red-700 hover:bg-red-800';

                  return (
                    <div key={actionType} className={`border ${actionColor} bg-white overflow-hidden`}>
                      <div className="p-4 bg-slate-50 border-b border-inherit flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                        <div>
                          <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest">
                            {actionTitle}
                          </h3>
                          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-0.5">
                            {filteredCandidates.length} registros elegíveis para esta mudança de ciclo de vida.
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleSelectAll(actionType as 'inactivate' | 'archive')}
                            className="px-3 py-1.5 border border-slate-350 text-[9px] font-extrabold uppercase tracking-wider hover:bg-slate-100 transition-all cursor-pointer"
                          >
                            {filteredCandidates.every(c => selectedIds.includes(c.id)) ? 'Deselecionar Todos' : 'Selecionar Todos'}
                          </button>
                          <button
                            onClick={() => handleExecuteSelectedActions(actionType as 'inactivate' | 'archive')}
                            disabled={actionInProgress !== null || !filteredCandidates.some(c => selectedIds.includes(c.id))}
                            className={`px-4 py-2 text-white text-[9px] font-extrabold uppercase tracking-widest flex items-center gap-1.5 transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer ${actionBtnColor}`}
                          >
                            {actionInProgress === actionType ? (
                              <>
                                <Loader2 size={12} className="animate-spin" />
                                Processando...
                              </>
                            ) : (
                              <>
                                <CheckCircle2 size={12} />
                                Aplicar Ação Recomendada
                              </>
                            )}
                          </button>
                        </div>
                      </div>

                      <div className="overflow-x-auto min-w-full">
                        <table className="min-w-full divide-y divide-slate-200">
                          <thead>
                            <tr className="bg-slate-50">
                              <th scope="col" className="w-[4%] p-4 text-center"></th>
                              <th scope="col" className="px-6 py-3 text-left text-[9px] font-black uppercase text-slate-500 tracking-wider">Tipo/Tabela</th>
                              <th scope="col" className="px-6 py-3 text-left text-[9px] font-black uppercase text-slate-500 tracking-wider">Nome / Identificação</th>
                              <th scope="col" className="px-6 py-3 text-left text-[9px] font-black uppercase text-slate-500 tracking-wider">Status Atual</th>
                              <th scope="col" className="px-6 py-3 text-left text-[9px] font-black uppercase text-slate-500 tracking-wider">Última Interação/Início</th>
                              <th scope="col" className="px-6 py-3 text-left text-[9px] font-black uppercase text-slate-500 tracking-wider">Motivo Legal</th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-slate-100">
                            {filteredCandidates.map((candidate) => {
                              const isSelected = selectedIds.includes(candidate.id);
                              
                              let typeIcon = <User size={13} className="text-slate-500" />;
                              if (candidate.type === 'teacher') typeIcon = <UserSquare2 size={13} className="text-slate-500" />;
                              if (candidate.type === 'class') typeIcon = <School size={13} className="text-slate-500" />;
                              if (candidate.type === 'subject') typeIcon = <BookOpen size={13} className="text-slate-500" />;

                              return (
                                <tr key={candidate.id} className={`hover:bg-slate-50/70 transition-all ${isSelected ? 'bg-indigo-50/20' : ''}`}>
                                  <td className="p-4 text-center">
                                    <input
                                      type="checkbox"
                                      checked={isSelected}
                                      onChange={() => handleToggleSelect(candidate.id)}
                                      className="h-3.5 w-3.5 text-indigo-600 focus:ring-indigo-500 border-slate-350 cursor-pointer"
                                    />
                                  </td>
                                  <td className="px-6 py-3.5 whitespace-nowrap text-[10px] font-black uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                                    {typeIcon}
                                    {candidate.typeLabel}
                                  </td>
                                  <td className="px-6 py-3.5 whitespace-nowrap text-xs font-bold text-slate-900">
                                    {candidate.name}
                                  </td>
                                  <td className="px-6 py-3.5 whitespace-nowrap">
                                    <span className={`px-2 py-0.5 text-[9px] font-black uppercase tracking-wider border ${
                                      candidate.currentStatus === 'Ativo' ? 'bg-emerald-50 text-emerald-800 border-emerald-250' : 'bg-red-50 text-red-800 border-red-250'
                                    }`}>
                                      {candidate.currentStatus}
                                    </span>
                                  </td>
                                  <td className="px-6 py-3.5 whitespace-nowrap text-[10px] font-mono font-bold text-slate-600">
                                    {candidate.lastInteractionLabel}
                                  </td>
                                  <td className="px-6 py-3.5 text-[10px] text-slate-500 max-w-xs truncate font-medium">
                                    {candidate.reason}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              !loadingScan && (
                <div className="p-12 text-center border-2 border-dashed border-slate-200">
                  <Archive className="mx-auto text-slate-300 mb-4" size={36} />
                  <p className="text-slate-700 text-xs font-bold uppercase tracking-wider">A análise não foi executada ou está em dia.</p>
                  <p className="text-slate-400 text-[10px] uppercase font-bold tracking-widest mt-1">Clique no botão "Iniciar Varredura e Análise de Otimização" acima para avaliar registros inativos.</p>
                </div>
              )
            )}
          </motion.div>
        ) : (
          <motion.div
            key="deep_search"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-6"
          >
            {/* Search selector bar */}
            <form onSubmit={handleDeepSearch} className="bg-white border border-slate-200 p-6 space-y-4">
              <h2 className="text-xs font-black text-slate-800 uppercase tracking-widest flex items-center gap-2 mb-2">
                <Search size={16} />
                Filtros de Pesquisa Profunda no Arquivo Morto
              </h2>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Tabela / Tipo de Arquivo</label>
                  <select
                    value={searchType}
                    onChange={(e) => setSearchType(e.target.value as any)}
                    className="w-full h-11 px-3 bg-slate-50 border border-slate-200 text-xs font-bold uppercase tracking-wider focus:bg-white focus:border-slate-400 transition-all outline-none"
                  >
                    <option value="students">Aluno Desligado (archived_students)</option>
                    <option value="teachers">Professores Históricos (archived_teachers)</option>
                    <option value="classes">Turmas Encerradas (archived_classes)</option>
                    <option value="subjects">Disciplinas Históricas (archived_subjects)</option>
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Termo de Busca (Nome, Código ou Registro)</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Pesquisar por correspondência exata ou aproximada..."
                      className="w-full h-11 pl-10 pr-4 bg-slate-50 border border-slate-200 text-xs font-bold uppercase tracking-wider focus:bg-white focus:border-slate-400 transition-all outline-none"
                    />
                    <Search className="absolute left-3.5 top-3.5 text-slate-400" size={14} />
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={loadingSearch}
                  className="px-6 py-3 bg-[#00174b] hover:bg-slate-950 disabled:bg-slate-400 text-white font-black text-[10px] uppercase tracking-widest flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  {loadingSearch ? (
                    <>
                      <Loader2 size={13} className="animate-spin" />
                      Consultando Arquivo...
                    </>
                  ) : (
                    <>
                      <Search size={13} />
                      Realizar Busca Profunda
                    </>
                  )}
                </button>
              </div>
            </form>

            {/* Results list */}
            <div className="bg-white border border-slate-200">
              <div className="p-4 bg-slate-50 border-b border-slate-200">
                <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest">
                  Resultados da Consulta Direta ({deepSearchResults.length})
                </h3>
              </div>

              {deepSearchResults.length > 0 ? (
                <div className="overflow-x-auto min-w-full">
                  <table className="min-w-full divide-y divide-slate-200">
                    <thead>
                      <tr className="bg-slate-50">
                        <th scope="col" className="px-6 py-3 text-left text-[9px] font-black uppercase text-slate-500 tracking-wider">Identificador Principal</th>
                        <th scope="col" className="px-6 py-3 text-left text-[9px] font-black uppercase text-slate-500 tracking-wider">Nome / Detalhe</th>
                        <th scope="col" className="px-6 py-3 text-left text-[9px] font-black uppercase text-slate-500 tracking-wider">Propriedades Extras</th>
                        <th scope="col" className="px-6 py-3 text-left text-[9px] font-black uppercase text-slate-500 tracking-wider">Status Interno</th>
                        <th scope="col" className="px-6 py-3 text-left text-[9px] font-black uppercase text-slate-500 tracking-wider text-right">Controles de Resgate</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-slate-100">
                      {deepSearchResults.map((record) => {
                        return (
                          <tr key={record.id} className="hover:bg-slate-50 transition-colors">
                            <td className="px-6 py-4 whitespace-nowrap text-[10px] font-mono font-bold text-slate-500">
                              {record.id.slice(0, 8)}... ({record.registration_number || record.code || 'N/A'})
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-xs font-black text-slate-900">{record.name}</div>
                              {record.email && <div className="text-[10px] text-slate-400 font-bold">{record.email}</div>}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-[10px] font-medium text-slate-500">
                              {searchType === 'students' && (record.course ? `Curso: ${record.course}` : 'Cadastrado no arquivo')}
                              {searchType === 'teachers' && (record.cpf ? `Documento CPF: ${record.cpf}` : 'Docente histórico')}
                              {searchType === 'classes' && `Semestre: ${record.semester || 'Único'}`}
                              {searchType === 'subjects' && 'Disciplina em arquivo'}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className="px-2 py-0.5 text-[9px] font-extrabold uppercase bg-slate-900 text-slate-300 border border-black">
                                Arquivo Morto
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right text-xs font-medium">
                              <button
                                onClick={() => handleRestoreFromArchive(record)}
                                disabled={loadingSearch}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#00174b] text-white hover:bg-emerald-700 font-bold text-[9px] uppercase tracking-widest transition-all cursor-pointer"
                              >
                                <RotateCcw size={11} className="shrink-0" />
                                Restaurar Registro
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-12 text-center">
                  <Search className="mx-auto text-slate-300 mb-3" size={30} />
                  <p className="text-slate-500 text-xs font-bold uppercase tracking-wider">Aguardando termo de pesquisa profunda ou nenhum registro encontrado.</p>
                  <p className="text-slate-400 text-[10px] font-semibold uppercase tracking-wide mt-1">Escolha a base correta e faça uma busca específica para resgatar dados.</p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
