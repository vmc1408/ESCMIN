-- Full Schema Migration for INTELLIGENCE ESCMIN
-- Migrating from Firebase to Supabase

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. institution_settings
CREATE TABLE IF NOT EXISTS public.institution_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT,
    logo_url TEXT,
    footer_text TEXT,
    receipt_message TEXT,
    secretary TEXT,
    cep TEXT,
    city_uf TEXT,
    subtitle TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. users
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    name TEXT,
    full_name TEXT,
    avatar_url TEXT,
    role TEXT CHECK (role IN ('admin', 'diretor', 'secretario')),
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. email_registry (for pre-authorization)
CREATE TABLE IF NOT EXISTS public.email_registry (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT UNIQUE NOT NULL,
    role TEXT,
    status TEXT DEFAULT 'pending',
    metadata JSONB,
    registered_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. foraries
CREATE TABLE IF NOT EXISTS public.foraries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    priest_name TEXT,
    user_id UUID REFERENCES public.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. parishes
CREATE TABLE IF NOT EXISTS public.parishes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    forania_id UUID REFERENCES public.foraries(id),
    priest_id UUID, -- References clergy_leity eventually
    priest_name TEXT,
    address_street TEXT,
    address_number TEXT,
    address_neighborhood TEXT,
    address_city TEXT,
    address_state TEXT,
    address_zip TEXT,
    email TEXT,
    phone TEXT,
    user_id UUID REFERENCES public.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. clergy_leity
CREATE TABLE IF NOT EXISTS public.clergy_leity (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    address TEXT,
    address_neighborhood TEXT,
    address_city TEXT,
    address_state TEXT,
    phone_mobile TEXT,
    phone_whatsapp TEXT,
    email TEXT,
    parish_id UUID REFERENCES public.parishes(id),
    role TEXT CHECK (role IN ('pároco', 'vigário', 'diácono', 'seminarista', 'leigo formado')),
    user_id UUID REFERENCES public.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. classes
CREATE TABLE IF NOT EXISTS public.classes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    room TEXT,
    status TEXT DEFAULT 'Ativo' CHECK (status IN ('Ativo', 'Inativo')),
    period TEXT CHECK (period IN ('Manhã', 'Tarde', 'Noite')),
    days_of_week TEXT[], -- Array of strings
    semester TEXT,
    start_date DATE,
    observations TEXT,
    user_id UUID REFERENCES public.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. students
CREATE TABLE IF NOT EXISTS public.students (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    registration_number TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    cpf TEXT,
    rg TEXT,
    birth_date DATE,
    start_date DATE,
    status TEXT DEFAULT 'Ativo',
    is_former_student BOOLEAN DEFAULT FALSE,
    class_id UUID REFERENCES public.classes(id),
    address_street TEXT,
    address_neighborhood TEXT, -- Added based on error report
    address_city TEXT,
    address_state TEXT,
    address_zip TEXT,
    parish TEXT,
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
    user_id UUID REFERENCES public.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. subjects
CREATE TABLE IF NOT EXISTS public.subjects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    program_content TEXT,
    user_id UUID REFERENCES public.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. teachers
CREATE TABLE IF NOT EXISTS public.teachers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
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
    user_id UUID REFERENCES public.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 11. pix_reconciliations
CREATE TABLE IF NOT EXISTS public.pix_reconciliations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    date DATE NOT NULL,
    payer_name TEXT NOT NULL,
    origin_bank TEXT,
    amount NUMERIC(15,2) NOT NULL,
    transaction_id TEXT UNIQUE NOT NULL,
    batch_id TEXT,
    status TEXT DEFAULT 'unmatched' CHECK (status IN ('matched', 'unmatched', 'multiple')),
    matched_student_id UUID REFERENCES public.students(id),
    is_manual BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 12. contributions
CREATE TABLE IF NOT EXISTS public.contributions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id UUID REFERENCES public.students(id),
    amount NUMERIC(15,2) NOT NULL,
    reference_month INTEGER NOT NULL,
    reference_year INTEGER NOT NULL,
    payment_date DATE NOT NULL,
    payment_method TEXT CHECK (payment_method IN ('PIX', 'Cartão', 'Dinheiro')),
    origin TEXT,
    pix_id UUID REFERENCES public.pix_reconciliations(id),
    user_id UUID REFERENCES public.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 13. calendar_events
CREATE TABLE IF NOT EXISTS public.calendar_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    description TEXT,
    start_date DATE NOT NULL,
    end_date DATE,
    type TEXT CHECK (type IN ('holiday', 'exam', 'start_term', 'end_term', 'class_day', 'event')),
    class_id UUID REFERENCES public.classes(id),
    subject_id UUID REFERENCES public.subjects(id),
    user_id UUID REFERENCES public.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 14. attendances
CREATE TABLE IF NOT EXISTS public.attendances (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id UUID REFERENCES public.students(id),
    class_id UUID REFERENCES public.classes(id),
    subject_id UUID REFERENCES public.subjects(id),
    date DATE NOT NULL,
    status TEXT CHECK (status IN ('P', 'F', 'J')),
    observations TEXT,
    user_id UUID REFERENCES public.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 15. grades
CREATE TABLE IF NOT EXISTS public.grades (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id UUID REFERENCES public.students(id),
    class_id UUID REFERENCES public.classes(id),
    subject_id UUID REFERENCES public.subjects(id),
    period TEXT,
    value NUMERIC(4,2), -- 0.00 to 10.00
    status TEXT CHECK (status IN ('Aprovado', 'Reprovado', 'Recuperação')),
    user_id UUID REFERENCES public.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 16. academic_parameters
CREATE TABLE IF NOT EXISTS public.academic_parameters (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    approval_grade NUMERIC(4,2) DEFAULT 7.0,
    recovery_grade NUMERIC(4,2) DEFAULT 5.0,
    failure_grade NUMERIC(4,2) DEFAULT 4.9,
    absence_limit_percentage INTEGER DEFAULT 25,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 17. certificates
CREATE TABLE IF NOT EXISTS public.certificates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id UUID REFERENCES public.students(id),
    type TEXT CHECK (type IN ('conclusão', 'participação', 'honra')),
    issuance_date DATE NOT NULL,
    course TEXT,
    verification_code TEXT UNIQUE,
    user_id UUID REFERENCES public.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS POLICIES (Simplified)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public profiles are viewable by everyone." ON public.users FOR SELECT USING (true);
CREATE POLICY "Users can insert their own profile." ON public.users FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update own profile." ON public.users FOR UPDATE USING (auth.uid() = id);

-- Enable RLS for all tables and add broad access for authenticated users for now
-- In a real production app, we would fine-tune these.
DO $$ 
DECLARE 
    t TEXT;
BEGIN
    FOR t IN 
        SELECT table_name FROM information_schema.tables 
        WHERE table_schema = 'public' 
    LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('DROP POLICY IF EXISTS "Authenticated users access" ON public.%I', t);
        EXECUTE format('CREATE POLICY "Authenticated users access" ON public.%I FOR ALL USING (auth.role() = ''authenticated'')', t);
    END LOOP;
END $$;
