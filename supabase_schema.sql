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
    pin TEXT,
    app_lock_enabled BOOLEAN DEFAULT true,
    app_lock_timeout INTEGER DEFAULT 300,
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
    class_id TEXT REFERENCES public.classes(id) ON DELETE SET NULL,
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
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
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
    year TEXT,
    subject_ids TEXT[],
    observations TEXT,
    user_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 5. Disciplinas
CREATE TABLE IF NOT EXISTS public.subjects (
    id TEXT PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    status TEXT DEFAULT 'Ativo',
    year TEXT,
    semester TEXT,
    teacher_id TEXT,
    program_content TEXT,
    user_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
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
    subject_ids TEXT[],
    photo_url TEXT,
    user_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 7. Reconciliações PIX
CREATE TABLE IF NOT EXISTS public.pix_reconciliations (
    id TEXT PRIMARY KEY,
    date TIMESTAMP WITH TIME ZONE NOT NULL,
    payer_name TEXT NOT NULL,
    origin_bank TEXT,
    amount NUMERIC(15,2) NOT NULL,
    transaction_id TEXT UNIQUE NOT NULL,
    status TEXT DEFAULT 'unmatched',
    matched_student_id TEXT REFERENCES public.students(id) ON DELETE SET NULL,
    is_manual BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 8. Contribuições
CREATE TABLE IF NOT EXISTS public.contributions (
    id TEXT PRIMARY KEY,
    student_id TEXT REFERENCES public.students(id) ON DELETE SET NULL,
    amount NUMERIC(15,2) NOT NULL,
    reference_month INTEGER NOT NULL,
    reference_year INTEGER NOT NULL,
    payment_date DATE NOT NULL,
    payment_method TEXT,
    origin TEXT,
    pix_id TEXT,
    observations TEXT,
    user_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
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
    forania_id TEXT,
    priest_id TEXT,
    priest_name TEXT,
    address TEXT,
    address_street TEXT,
    address_number TEXT,
    address_neighborhood TEXT,
    address_city TEXT,
    address_state TEXT,
    address_zip TEXT,
    email TEXT,
    phone TEXT,
    phone_mobile TEXT,
    cnpj TEXT,
    foundation_date TEXT,
    user_id TEXT,
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
    student_id TEXT REFERENCES public.students(id) ON DELETE SET NULL,
    class_id TEXT REFERENCES public.classes(id) ON DELETE SET NULL,
    subject_id TEXT REFERENCES public.subjects(id) ON DELETE SET NULL,
    date DATE NOT NULL,
    status TEXT NOT NULL, -- 'P' (presente), 'F' (falta), 'J' (justificada)
    user_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 13. Notas
CREATE TABLE IF NOT EXISTS public.grades (
    id TEXT PRIMARY KEY,
    student_id TEXT REFERENCES public.students(id) ON DELETE SET NULL,
    class_id TEXT REFERENCES public.classes(id) ON DELETE SET NULL,
    subject_id TEXT REFERENCES public.subjects(id) ON DELETE SET NULL,
    period TEXT NOT NULL, -- 'B1', 'B2', etc.
    value NUMERIC(4,2) NOT NULL,
    user_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 14. Eventos do Calendário
CREATE TABLE IF NOT EXISTS public.calendar_events (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE,
    type TEXT NOT NULL, -- 'holiday', 'exam', 'class_day', etc.
    description TEXT,
    class_id TEXT,
    subject_id TEXT,
    user_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 15. Certificados
CREATE TABLE IF NOT EXISTS public.certificates (
    id TEXT PRIMARY KEY,
    student_id TEXT REFERENCES public.students(id) ON DELETE SET NULL,
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
    forania_id TEXT,
    email TEXT,
    phone_mobile TEXT,
    phone_whatsapp TEXT,
    address TEXT,
    address_city TEXT,
    address_state TEXT,
    status TEXT DEFAULT 'active',
    user_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 17. Matrículas (Multi-turma)
CREATE TABLE IF NOT EXISTS public.enrollments (
    id TEXT PRIMARY KEY,
    student_id TEXT REFERENCES public.students(id) ON DELETE SET NULL,
    class_id TEXT REFERENCES public.classes(id) ON DELETE SET NULL,
    status TEXT DEFAULT 'Ativo',
    enrollment_date DATE,
    user_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 18. Arquivo Morto (Tabelas Espelho)
CREATE TABLE IF NOT EXISTS public.archived_students (LIKE public.students INCLUDING ALL);
CREATE TABLE IF NOT EXISTS public.archived_teachers (LIKE public.teachers INCLUDING ALL);
CREATE TABLE IF NOT EXISTS public.archived_classes (LIKE public.classes INCLUDING ALL);
CREATE TABLE IF NOT EXISTS public.archived_subjects (LIKE public.subjects INCLUDING ALL);

-- 19. Configurações Acadêmicas
CREATE TABLE IF NOT EXISTS public.academic_settings (
    id TEXT PRIMARY KEY,
    term1_start TEXT,
    term1_end TEXT,
    term2_start TEXT,
    term2_end TEXT,
    class_weekday INTEGER,
    skip_holiday_neighbors BOOLEAN,
    class_weekdays JSONB,
    weekday_titles JSONB,
    target_class_ids JSONB,
    weekday_classes JSONB,
    weekday_terms JSONB,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 20. Avaliações
CREATE TABLE IF NOT EXISTS public.assessments (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    date DATE NOT NULL,
    weight NUMERIC(5,2) DEFAULT 10.0,
    class_id TEXT REFERENCES public.classes(id) ON DELETE SET NULL,
    subject_id TEXT REFERENCES public.subjects(id) ON DELETE SET NULL,
    period TEXT,
    description TEXT,
    user_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 21. Recibos
CREATE TABLE IF NOT EXISTS public.receipts (
    id TEXT PRIMARY KEY,
    receipt_number TEXT NOT NULL,
    amount NUMERIC(12,2) NOT NULL,
    payee_name TEXT NOT NULL,
    description TEXT,
    payment_date DATE,
    signature_label TEXT,
    issue_date DATE,
    user_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Habilitar RLS e criar políticas de acesso público para todas as tabelas
DO $$
DECLARE
    tables text[] := ARRAY['email_registry', 'users', 'students', 'classes', 'subjects', 'teachers', 'pix_reconciliations', 'contributions', 'foraries', 'parishes', 'institution_settings', 'attendances', 'grades', 'calendar_events', 'certificates', 'clergy_leity', 'enrollments', 'archived_students', 'archived_teachers', 'archived_classes', 'archived_subjects', 'academic_settings', 'assessments', 'receipts'];
    t text;
BEGIN
    FOREACH t IN ARRAY tables LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('DROP POLICY IF EXISTS "Public Access %I" ON public.%I', t, t);
        EXECUTE format('CREATE POLICY "Public Access %I" ON public.%I FOR ALL USING (true) WITH CHECK (true)', t, t);
    END LOOP;
END $$;
