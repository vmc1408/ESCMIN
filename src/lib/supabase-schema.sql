-- Schema para Supabase (PostgreSQL) - COMPATÍVEL COM FIREBASE (TEXT IDs)
-- Copie e cole este código no SQL Editor do seu dashboard Supabase.

-- 1. Tabela de Configurações da Instituição
CREATE TABLE IF NOT EXISTS institution_settings (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    logo_url TEXT,
    admission_norms TEXT,
    presentation_info TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Tabela de Usuários
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT,
    avatar_url TEXT,
    role TEXT DEFAULT 'secretario',
    status TEXT DEFAULT 'active',
    pin TEXT,
    app_lock_enabled BOOLEAN DEFAULT true,
    app_lock_timeout INTEGER DEFAULT 300,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Registro de E-mails (Pré-autorização)
CREATE TABLE IF NOT EXISTS email_registry (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    role TEXT,
    status TEXT,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Forarias
CREATE TABLE IF NOT EXISTS foraries (
    id TEXT PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    priest_name TEXT,
    user_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Paróquias
CREATE TABLE IF NOT EXISTS parishes (
    id TEXT PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    forania_id TEXT REFERENCES foraries(id),
    priest_id TEXT,
    priest_name TEXT,
    address_street TEXT,
    address_number TEXT,
    address_neighborhood TEXT,
    address_city TEXT,
    address_state TEXT,
    address_zip TEXT,
    email TEXT,
    phone TEXT,
    user_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. Clero e Leigos
CREATE TABLE IF NOT EXISTS clergy_leity (
    id TEXT PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    address TEXT,
    address_neighborhood TEXT,
    address_city TEXT,
    address_state TEXT,
    phone_mobile TEXT,
    phone_mobile_is_whatsapp BOOLEAN DEFAULT FALSE,
    phone_whatsapp TEXT,
    email TEXT,
    parish_id TEXT REFERENCES parishes(id),
    role TEXT,
    user_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 7. Disciplinas
CREATE TABLE IF NOT EXISTS subjects (
    id TEXT PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    program_content TEXT,
    status TEXT DEFAULT 'Ativo',
    user_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 8. Turmas
CREATE TABLE IF NOT EXISTS classes (
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
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 9. Alunos
CREATE TABLE IF NOT EXISTS students (
    id TEXT PRIMARY KEY,
    registration_number TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    cpf TEXT,
    rg TEXT,
    birth_date TEXT,
    start_date TEXT,
    status TEXT DEFAULT 'Ativo',
    is_former_student BOOLEAN DEFAULT FALSE,
    class_id TEXT REFERENCES classes(id),
    parish_id TEXT,
    address_street TEXT,
    address_city TEXT,
    address_state TEXT,
    address_neighborhood TEXT,
    address_zip TEXT,
    parish TEXT,
    course TEXT,
    pastoral_participates TEXT,
    phone_mobile TEXT,
    phone_mobile_is_whatsapp BOOLEAN DEFAULT FALSE,
    phone_residential TEXT,
    phone_commercial TEXT,
    email TEXT,
    guardian_father TEXT,
    guardian_mother TEXT,
    guardian_cpf TEXT,
    photo_url TEXT,
    user_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 10. Professores
CREATE TABLE IF NOT EXISTS teachers (
    id TEXT PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    phone_mobile TEXT,
    phone_mobile_is_whatsapp BOOLEAN DEFAULT FALSE,
    cpf TEXT,
    rg TEXT,
    address_street TEXT,
    address_city TEXT,
    address_state TEXT,
    address_zip TEXT,
    birth_date TEXT,
    observations TEXT,
    user_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ARQUIVO MORTO (Tabelas de Arquivamento)
CREATE TABLE IF NOT EXISTS archived_students (
    LIKE students INCLUDING ALL
);

CREATE TABLE IF NOT EXISTS archived_classes (
    LIKE classes INCLUDING ALL
);

CREATE TABLE IF NOT EXISTS archived_subjects (
    LIKE subjects INCLUDING ALL
);

CREATE TABLE IF NOT EXISTS archived_teachers (
    LIKE teachers INCLUDING ALL
);

-- 11. Frequência
CREATE TABLE IF NOT EXISTS attendances (
    id TEXT PRIMARY KEY,
    student_id TEXT REFERENCES students(id),
    class_id TEXT REFERENCES classes(id),
    subject_id TEXT REFERENCES subjects(id),
    date TEXT NOT NULL,
    status TEXT,
    observations TEXT,
    user_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 12. Notas
CREATE TABLE IF NOT EXISTS grades (
    id TEXT PRIMARY KEY,
    student_id TEXT REFERENCES students(id),
    class_id TEXT REFERENCES classes(id),
    subject_id TEXT REFERENCES subjects(id),
    period TEXT,
    value NUMERIC(4,2),
    status TEXT,
    user_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 13. Eventos
CREATE TABLE IF NOT EXISTS calendar_events (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    start_date TEXT NOT NULL,
    end_date TEXT,
    type TEXT,
    class_id TEXT REFERENCES classes(id),
    subject_id TEXT REFERENCES subjects(id),
    user_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 14. Contribuições
CREATE TABLE IF NOT EXISTS contributions (
    id TEXT PRIMARY KEY,
    student_id TEXT REFERENCES students(id),
    amount NUMERIC(10,2) NOT NULL,
    reference_month INTEGER NOT NULL,
    reference_year INTEGER NOT NULL,
    payment_date TEXT NOT NULL,
    payment_method TEXT,
    origin TEXT,
    pix_id TEXT,
    user_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 15. Conciliação Pix
CREATE TABLE IF NOT EXISTS pix_reconciliations (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    payer_name TEXT NOT NULL,
    origin_bank TEXT,
    amount NUMERIC(10,2) NOT NULL,
    transaction_id TEXT UNIQUE NOT NULL,
    batch_id TEXT,
    status TEXT,
    matched_student_id TEXT REFERENCES students(id),
    is_manual BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 16. Certificados
CREATE TABLE IF NOT EXISTS certificates (
    id TEXT PRIMARY KEY,
    student_id TEXT REFERENCES students(id),
    type TEXT,
    issuance_date TEXT NOT NULL,
    course TEXT,
    verification_code TEXT UNIQUE,
    user_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 17. Parâmetros Acadêmicos
CREATE TABLE IF NOT EXISTS academic_parameters (
    id TEXT PRIMARY KEY,
    approval_grade NUMERIC(4,2) DEFAULT 7.0,
    recovery_grade NUMERIC(4,2) DEFAULT 5.0,
    failure_grade NUMERIC(4,2) DEFAULT 4.9,
    absence_limit_percentage INTEGER DEFAULT 25,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 18. Avaliações
CREATE TABLE IF NOT EXISTS assessments (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    date DATE NOT NULL,
    weight NUMERIC(4,2) DEFAULT 10.0,
    period TEXT,
    class_id TEXT REFERENCES classes(id),
    subject_id TEXT REFERENCES subjects(id),
    description TEXT,
    user_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 19. Recibos de Pagamento
CREATE TABLE IF NOT EXISTS receipts (
    id TEXT PRIMARY KEY,
    receipt_number TEXT NOT NULL,
    amount NUMERIC(10,2) NOT NULL,
    payee_name TEXT NOT NULL,
    description TEXT,
    payment_date TEXT NOT NULL,
    signature_label TEXT,
    issue_date TEXT NOT NULL,
    user_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Habilitar RLS para todas as tabelas
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
