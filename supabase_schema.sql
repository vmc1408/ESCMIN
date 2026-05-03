-- Script SQL para Supabase (Database Schema)
-- Este script cria todas as tabelas necessárias e as permissões de acesso público.

-- 1. Registro de Emails (Pre-auth)
CREATE TABLE IF NOT EXISTS public.email_registry (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    role TEXT,
    status TEXT,
    registered_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Perfis de Usuário
CREATE TABLE IF NOT EXISTS public.users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    full_name TEXT,
    role TEXT NOT NULL,
    status TEXT DEFAULT 'active' NOT NULL,
    avatar_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    last_login TIMESTAMP WITH TIME ZONE,
    is_pre_registered BOOLEAN DEFAULT false
);

-- 3. Alunos
CREATE TABLE IF NOT EXISTS public.students (
    id TEXT PRIMARY KEY,
    registration_number TEXT UNIQUE,
    name TEXT NOT NULL,
    cpf TEXT,
    rg TEXT,
    birth_date DATE,
    start_date TEXT,
    status TEXT DEFAULT 'Ativo',
    is_former_student BOOLEAN DEFAULT false,
    class_id TEXT,
    address_street TEXT,
    address_neighborhood TEXT,
    address_city TEXT,
    address_state TEXT,
    address_zip TEXT,
    parish TEXT,
    forany TEXT,
    course TEXT,
    pastoral_participates TEXT,
    phone_mobile TEXT,
    phone_residential TEXT,
    phone_commercial TEXT,
    email TEXT,
    guardian_father TEXT,
    guardian_mother TEXT,
    guardian_cpf TEXT,
    photo_url TEXT,
    user_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. Turmas
CREATE TABLE IF NOT EXISTS public.classes (
    id TEXT PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    room TEXT,
    status TEXT DEFAULT 'Ativo',
    period TEXT,
    days_of_week TEXT[],
    semester TEXT,
    start_date DATE,
    observations TEXT,
    user_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. Disciplinas
CREATE TABLE IF NOT EXISTS public.subjects (
    id TEXT PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    program_content TEXT,
    user_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 6. Professores
CREATE TABLE IF NOT EXISTS public.teachers (
    id TEXT PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    phone_mobile TEXT,
    cpf TEXT,
    rg TEXT,
    address_street TEXT,
    address_city TEXT,
    address_state TEXT,
    address_zip TEXT,
    birth_date DATE,
    observations TEXT,
    user_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 7. Reconciliações PIX
CREATE TABLE IF NOT EXISTS public.pix_reconciliations (
    id TEXT PRIMARY KEY,
    date TIMESTAMP WITH TIME ZONE NOT NULL,
    payer_name TEXT NOT NULL,
    origin_bank TEXT,
    amount NUMERIC(10,2) NOT NULL,
    transaction_id TEXT UNIQUE NOT NULL,
    status TEXT DEFAULT 'unmatched',
    matched_student_id TEXT,
    is_manual BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 8. Contribuições
CREATE TABLE IF NOT EXISTS public.contributions (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL,
    amount NUMERIC(10,2) NOT NULL,
    reference_month INTEGER NOT NULL,
    reference_year INTEGER NOT NULL,
    payment_date DATE NOT NULL,
    payment_method TEXT,
    origin TEXT,
    pix_id TEXT,
    observations TEXT,
    user_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 9. Forarias
CREATE TABLE IF NOT EXISTS public.foraries (
    id TEXT PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Cria uma view para 'foraria' (singular) para retrocompatibilidade
CREATE OR REPLACE VIEW public.foraria AS SELECT * FROM public.foraries;

-- 10. Paróquias
CREATE TABLE IF NOT EXISTS public.parishes (
    id TEXT PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    forania TEXT,
    priest_name TEXT,
    address_street TEXT,
    address_number TEXT,
    address_neighborhood TEXT,
    address_city TEXT,
    address_state TEXT,
    address_zip TEXT,
    email TEXT,
    phone TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 11. Configurações da Instituição
CREATE TABLE IF NOT EXISTS public.institution_settings (
    id TEXT PRIMARY KEY,
    name TEXT,
    cnpj TEXT,
    address TEXT,
    phone TEXT,
    email TEXT,
    website TEXT,
    logo_url TEXT,
    footer_text TEXT,
    receipt_message TEXT,
    secretary TEXT,
    cep TEXT,
    city_uf TEXT,
    subtitle TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 12. Presenças
CREATE TABLE IF NOT EXISTS public.attendances (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL,
    class_id TEXT NOT NULL,
    subject_id TEXT NOT NULL,
    date DATE NOT NULL,
    status TEXT NOT NULL, -- 'P' (presente), 'F' (falta), 'J' (justificada)
    user_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 13. Notas
CREATE TABLE IF NOT EXISTS public.grades (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL,
    class_id TEXT NOT NULL,
    subject_id TEXT NOT NULL,
    period TEXT NOT NULL, -- 'B1', 'B2', etc.
    value NUMERIC(4,2) NOT NULL,
    user_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 14. Eventos do Calendário
CREATE TABLE IF NOT EXISTS public.calendar_events (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    date DATE NOT NULL,
    type TEXT NOT NULL, -- 'academic', 'holiday', etc.
    description TEXT,
    user_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 15. Certificados
CREATE TABLE IF NOT EXISTS public.certificates (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL,
    type TEXT NOT NULL,
    issue_date DATE NOT NULL,
    code TEXT UNIQUE NOT NULL,
    user_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 16. Clero e Leigos
CREATE TABLE IF NOT EXISTS public.clergy_leity (
    id TEXT PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    parish_id TEXT,
    email TEXT,
    phone_mobile TEXT,
    phone_whatsapp TEXT,
    address TEXT,
    status TEXT DEFAULT 'active',
    user_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 17. Matrículas (Multi-turma)
CREATE TABLE IF NOT EXISTS public.enrollments (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL,
    class_id TEXT NOT NULL,
    status TEXT DEFAULT 'Ativo',
    enrollment_date DATE,
    user_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Habilitar RLS e criar políticas de acesso público para todas as tabelas
DO $$
DECLARE
    tables text[] := ARRAY['email_registry', 'users', 'students', 'classes', 'subjects', 'teachers', 'pix_reconciliations', 'contributions', 'foraries', 'parishes', 'institution_settings', 'attendances', 'grades', 'calendar_events', 'certificates', 'clergy_leity', 'enrollments'];
    t text;
BEGIN
    FOREACH t IN ARRAY tables LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('DROP POLICY IF EXISTS "Public Access %I" ON public.%I', t, t);
        EXECUTE format('CREATE POLICY "Public Access %I" ON public.%I FOR ALL USING (true) WITH CHECK (true)', t, t);
    END LOOP;
END $$;
