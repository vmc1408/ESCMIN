-- Script Profissional para Banco de Dados (Supabase/PostgreSQL)
-- Este script garante que todas as tabelas e colunas necessárias para o formulário de alunos funcionem 100%

-- 1. Tabela de Alunos (students)
-- Adiciona colunas extras para um cadastro completo e profissional
ALTER TABLE students ADD COLUMN IF NOT EXISTS address_neighborhood TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS forany TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS pastoral_participates TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS course TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS parish TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS phone_residential TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS phone_commercial TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS phone_whatsapp TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS guardian_father TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS guardian_mother TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS guardian_cpf TEXT;

-- 2. Tabela de Turmas (classes)
ALTER TABLE classes ADD COLUMN IF NOT EXISTS start_date DATE;

-- 3. Tabela de Configurações da Instituição
-- Se a tabela já existir com UUID, o script lidará com isso
CREATE TABLE IF NOT EXISTS institution_settings (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    logo_url TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Inserir configuração padrão usando um ID compatível com TEXT ou UUID
-- Usamos um valor que parece um UUID técnico para evitar o erro 22P02
INSERT INTO institution_settings (id, name)
SELECT '00000000-0000-0000-0000-000000000000', 'Escola Diocesana de Ministérios'
WHERE NOT EXISTS (SELECT 1 FROM institution_settings);

-- 4. Garantir que as tabelas de apoio existam para os campos de seleção (Selects)
-- Estas tabelas alimentam os seletores de Paróquia e Forania
CREATE TABLE IF NOT EXISTS foraries (
    id TEXT PRIMARY KEY,
    code TEXT,
    name TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS parishes (
    id TEXT PRIMARY KEY,
    code TEXT,
    name TEXT NOT NULL,
    forania_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Configurar Permissões de Storage (Executar no SQL Editor do Supabase)
-- Nota: O bucket 'students' deve ser criado manualmente na aba de STORAGE do Supabase
-- Estamos consolidando todos os uploads no bucket 'students' para facilitar a gestão
INSERT INTO storage.buckets (id, name, public) 
VALUES ('students', 'students', true)
ON CONFLICT (id) DO NOTHING;

-- Liberar acesso público total para o bucket 'students'
-- Isso permite leitura e escrita para o app gerenciar fotos de alunos, logos e avatares
DROP POLICY IF EXISTS "Public Access Photos" ON storage.objects;
CREATE POLICY "Public Access students" ON storage.objects FOR ALL USING (bucket_id = 'students') WITH CHECK (bucket_id = 'students');

-- 6. Recriar políticas de acesso (RLS) - Permite leitura/escrita para todos no modo dev
DO $$ 
DECLARE 
    t TEXT;
BEGIN
    FOR t IN (SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE') 
    LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('DROP POLICY IF EXISTS "Public Access %I" ON public.%I', t, t);
        EXECUTE format('CREATE POLICY "Public Access %I" ON public.%I FOR ALL USING (true) WITH CHECK (true)', t, t);
    END LOOP;
END $$;
