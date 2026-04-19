-- SQL para criar as tabelas necessárias no Supabase
-- Copie e cole este código no SQL Editor do seu projeto Supabase

-- Tabela de Alunos (se ainda não existir)
CREATE TABLE IF NOT EXISTS students (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  registration_number TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  cpf TEXT,
  rg TEXT,
  birth_date DATE,
  start_date DATE,
  address_street TEXT,
  address_city TEXT,
  address_state TEXT,
  address_zip TEXT,
  phone_mobile TEXT,
  status TEXT DEFAULT 'Ativo',
  parish TEXT,
  course TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela de Professores
CREATE TABLE IF NOT EXISTS teachers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  cpf TEXT,
  rg TEXT,
  address_street TEXT,
  address_city TEXT,
  address_state TEXT,
  address_zip TEXT,
  phone_mobile TEXT,
  phone TEXT,
  status TEXT DEFAULT 'Ativo',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela de Turmas
CREATE TABLE IF NOT EXISTS classes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  room TEXT,
  semester TEXT,
  period TEXT,
  status TEXT DEFAULT 'Ativo',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela de Disciplinas
CREATE TABLE IF NOT EXISTS subjects (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  program_content TEXT,
  status TEXT DEFAULT 'Ativo',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela de Conciliação de Pix
CREATE TABLE IF NOT EXISTS pix_reconciliations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  transaction_id TEXT UNIQUE NOT NULL,
  date TEXT,
  payer_name TEXT,
  origin_bank TEXT,
  amount DECIMAL(12,2),
  status TEXT,
  matched_student_id UUID REFERENCES students(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela de Perfis de Usuários
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY,
  full_name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  role TEXT DEFAULT 'clerk',
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela de Configurações da Instituição
CREATE TABLE IF NOT EXISTS institution_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  cnpj TEXT,
  address TEXT,
  phone TEXT,
  email TEXT,
  website TEXT,
  logo_url TEXT,
  footer_text TEXT,
  receipt_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela de Contribuições Mensais
CREATE TABLE IF NOT EXISTS contributions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  amount DECIMAL(12,2) NOT NULL,
  reference_month INTEGER NOT NULL CHECK (reference_month >= 1 AND reference_month <= 12),
  reference_year INTEGER NOT NULL,
  payment_date TIMESTAMPTZ DEFAULT NOW(),
  pix_id UUID REFERENCES pix_reconciliations(id),
  user_id UUID REFERENCES auth.users(id),
  payment_method TEXT,
  origin TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_contributions_student_year ON contributions(student_id, reference_year);

-- Desabilitar RLS
ALTER TABLE contributions DISABLE ROW LEVEL SECURITY;

-- Desabilitar RLS (Row Level Security) para facilitar o desenvolvimento
ALTER TABLE students DISABLE ROW LEVEL SECURITY;
ALTER TABLE teachers DISABLE ROW LEVEL SECURITY;
ALTER TABLE classes DISABLE ROW LEVEL SECURITY;
ALTER TABLE subjects DISABLE ROW LEVEL SECURITY;
ALTER TABLE pix_reconciliations DISABLE ROW LEVEL SECURITY;
ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE institution_settings DISABLE ROW LEVEL SECURITY;

-- Caso o DISABLE não funcione por falta de privilégios de superuser, criamos políticas abertas
-- Isso garante que qualquer um possa ler/escrever durante o desenvolvimento
DO $$ 
BEGIN
    -- Students
    DROP POLICY IF EXISTS "Enable all for everyone" ON students;
    CREATE POLICY "Enable all for everyone" ON students FOR ALL USING (true) WITH CHECK (true);
    
    -- Teachers
    DROP POLICY IF EXISTS "Enable all for everyone" ON teachers;
    CREATE POLICY "Enable all for everyone" ON teachers FOR ALL USING (true) WITH CHECK (true);
    
    -- Classes
    DROP POLICY IF EXISTS "Enable all for everyone" ON classes;
    CREATE POLICY "Enable all for everyone" ON classes FOR ALL USING (true) WITH CHECK (true);
    
    -- Subjects
    DROP POLICY IF EXISTS "Enable all for everyone" ON subjects;
    CREATE POLICY "Enable all for everyone" ON subjects FOR ALL USING (true) WITH CHECK (true);
    
    -- Pix Reconciliations
    DROP POLICY IF EXISTS "Enable all for everyone" ON pix_reconciliations;
    CREATE POLICY "Enable all for everyone" ON pix_reconciliations FOR ALL USING (true) WITH CHECK (true);
    
    -- Profiles
    DROP POLICY IF EXISTS "Enable all for everyone" ON profiles;
    CREATE POLICY "Enable all for everyone" ON profiles FOR ALL USING (true) WITH CHECK (true);
    
    -- Institution Settings
    DROP POLICY IF EXISTS "Enable all for everyone" ON institution_settings;
    CREATE POLICY "Enable all for everyone" ON institution_settings FOR ALL USING (true) WITH CHECK (true);
    
    -- Contributions
    DROP POLICY IF EXISTS "Enable all for everyone" ON contributions;
    CREATE POLICY "Enable all for everyone" ON contributions FOR ALL USING (true) WITH CHECK (true);
END $$;

-- ===============================================================
-- CONFIGURAÇÃO DE STORAGE (BALDES E POLÍTICAS)
-- ===============================================================
-- Execute estas linhas para permitir o upload de imagens

-- 1. Criar o bucket 'assets' se não existir
INSERT INTO storage.buckets (id, name, public)
VALUES ('assets', 'assets', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Permitir acesso público para leitura
CREATE POLICY "Public Access"
ON storage.objects FOR SELECT
USING ( bucket_id = 'assets' );

-- 3. Permitir que qualquer pessoa faça upload (apenas para desenvolvimento)
CREATE POLICY "Public Upload"
ON storage.objects FOR INSERT
WITH CHECK ( bucket_id = 'assets' );

-- 4. Permitir que qualquer pessoa atualize ou delete (apenas para desenvolvimento)
CREATE POLICY "Public Update/Delete"
ON storage.objects FOR UPDATE
USING ( bucket_id = 'assets' );

CREATE POLICY "Public Delete"
ON storage.objects FOR DELETE
USING ( bucket_id = 'assets' );
