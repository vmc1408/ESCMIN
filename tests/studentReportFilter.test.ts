/**
 * Testes Unitários: Filtragem de Alunos Ativos em Turmas e Relatórios
 * Executado via tsx: npx tsx tests/studentReportFilter.test.ts
 */

import {
  isStudentActive,
  isEnrollmentActive,
  isStudentInClass,
  filterStudentsForClass
} from '../src/lib/utils';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FALHA: ${message}`);
    process.exit(1);
  }
  console.log(`✅ SUCESSO: ${message}`);
}

console.log('--- INICIANDO TESTES DE FILTRAGEM DE ALUNOS ATIVOS EM RELATÓRIOS ---\n');

// 1. Testes de isStudentActive
console.log('1. Verificação de status de alunos ativos vs inativos:');
assert(isStudentActive({ id: '1', name: 'Ana', status: 'Ativo' }) === true, 'Aluno Ativo deve ser considerado ativo');
assert(isStudentActive({ id: '2', name: 'Bruno', status: 'Matriculado' }) === true, 'Aluno Matriculado deve ser considerado ativo');
assert(isStudentActive({ id: '3', name: 'Carlos', status: 'Cursando' }) === true, 'Aluno Cursando deve ser considerado ativo');
assert(isStudentActive({ id: '4', name: 'Daniel' }) === true, 'Aluno sem status definido deve ser considerado ativo por padrão');

assert(isStudentActive({ id: '5', name: 'Eduarda', status: 'Inativo' }) === false, 'Aluno Inativo NÃO deve ser considerado ativo');
assert(isStudentActive({ id: '6', name: 'Fabio', status: 'Concluído' }) === false, 'Aluno Concluído NÃO deve ser considerado ativo na turma');
assert(isStudentActive({ id: '7', name: 'Gisele', status: 'Suspenso' }) === false, 'Aluno Suspenso NÃO deve ser considerado ativo na turma');
assert(isStudentActive({ id: '8', name: 'Hugo', status: 'Trancado' }) === false, 'Aluno Trancado NÃO deve ser considerado ativo');
assert(isStudentActive({ id: '9', name: 'Igor', status: 'Cancelado' }) === false, 'Aluno Cancelado NÃO deve ser considerado ativo');
assert(isStudentActive({ id: '10', name: 'Julia', status: 'Evadido' }) === false, 'Aluno Evadido NÃO deve ser considerado ativo');
assert(isStudentActive({ id: '11', name: 'Karen', is_former_student: true }) === false, 'Ex-aluno (is_former_student=true) NÃO deve ser considerado ativo');
assert(isStudentActive({ id: '12', name: 'Lucas', active: false }) === false, 'Aluno com active=false NÃO deve ser considerado ativo');

// 2. Testes de isEnrollmentActive
console.log('\n2. Verificação de status de matrículas (enrollments):');
assert(isEnrollmentActive({ id: 'e1', status: 'Ativo' }) === true, 'Matrícula Ativa');
assert(isEnrollmentActive({ id: 'e2', status: 'Inativo' }) === false, 'Matrícula Inativa');
assert(isEnrollmentActive({ id: 'e3', status: 'Trancado' }) === false, 'Matrícula Trancada');
assert(isEnrollmentActive({ id: 'e4', status: 'Cancelado' }) === false, 'Matrícula Cancelada');
assert(isEnrollmentActive({ id: 'e5', status: 'Concluído' }) === false, 'Matrícula Concluída');
assert(isEnrollmentActive({ id: 'e6', status: 'Suspenso' }) === false, 'Matrícula Suspensa');

// 3. Teste Cenário Real do Usuário: Turma com 16 alunos no cadastro, mas apenas 12 alunos ativos
console.log('\n3. Cenário: Turma de 16 alunos totais onde apenas 12 são ativos');

const classId = 'turma-teo-01';

// 12 alunos ativos
const activeStudents = Array.from({ length: 12 }, (_, i) => ({
  id: `student-active-${i + 1}`,
  name: `Aluno Ativo ${String(i + 1).padStart(2, '0')}`,
  status: 'Ativo',
  class_id: classId
}));

// 4 alunos inativos / ex-alunos / concluídos / suspensos
const inactiveStudents = [
  { id: 'student-inact-1', name: 'Aluno Inativo 01', status: 'Inativo', class_id: classId },
  { id: 'student-inact-2', name: 'Aluno Concluído 02', status: 'Concluído', class_id: classId },
  { id: 'student-inact-3', name: 'Aluno Suspenso 03', status: 'Suspenso', class_id: classId },
  { id: 'student-inact-4', name: 'Aluno Trancado 04', status: 'Trancado', class_id: classId }
];

const all16Students = [...activeStudents, ...inactiveStudents];

assert(all16Students.length === 16, 'Total bruto cadastrado na turma é 16 alunos');

const filteredForReport = filterStudentsForClass(all16Students, classId, [], true);

assert(
  filteredForReport.length === 12,
  `O relatório deve considerar exatamente 12 alunos ativos (obtido: ${filteredForReport.length})`
);

// Verificar se todos os 12 retornados são de fato ativos
const allAreActive = filteredForReport.every(s => isStudentActive(s));
assert(allAreActive === true, 'Todos os alunos retornados no relatório são ativos');

// Quando onlyActive = false, deve trazer todos os 16
const allStudentsReport = filterStudentsForClass(all16Students, classId, [], false);
assert(allStudentsReport.length === 16, 'Com onlyActive=false traz todos os 16 alunos');

// 4. Teste com tabela de enrollments (matrículas cruzadas)
console.log('\n4. Cenário com matrículas na tabela enrollments:');
const studentsWithEnrollments = [
  { id: 's-enrolled-active', name: 'Aluno Matriculado Ativo', status: 'Ativo', class_id: undefined },
  { id: 's-enrolled-inactive', name: 'Aluno Matriculado Inativo', status: 'Ativo', class_id: classId }
];

const enrollmentsList = [
  { id: 'en-1', student_id: 's-enrolled-active', class_id: classId, status: 'Ativo' },
  { id: 'en-2', student_id: 's-enrolled-inactive', class_id: classId, status: 'Inativo' }
];

const reportEnrollmentResults = filterStudentsForClass(studentsWithEnrollments, classId, enrollmentsList, true);
assert(
  reportEnrollmentResults.length === 1 && reportEnrollmentResults[0].id === 's-enrolled-active',
  'Deve incluir aluno com matrícula ativa na turma e excluir aluno com matrícula inativa na turma'
);

console.log('\n🎉 TODOS OS TESTES DE RELATÓRIO E ALUNOS ATIVOS PASSARAM COM SUCESSO!\n');
