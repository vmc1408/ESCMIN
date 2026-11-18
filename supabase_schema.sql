-- ============================================================================
-- ESCMIN — SCHEMA MESTRE IDEMPOTENTE (SUPABASE / POSTGRESQL)
-- Alinhado com blueprint.json (26 tabelas principais + 4 tabelas de arquivo morto)
-- ============================================================================

-- Limpeza de views legadas não utilizadas pela aplicação
DROP VIEW IF EXISTS public.foraria;

-- 1. Unidades e Polos Educacionais
CREATE TABLE IF NOT EXISTS public.units (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    is_main BOOLEAN DEFAULT false,
    address TEXT,
    city TEXT,
    state TEXT,
    cep TEXT,
    cnpj TEXT,
    phone TEXT,
    email TEXT,
    color TEXT,
    active BOOLEAN DEFAULT true,
    user_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

INSERT INTO public.units (id, code, name, is_main, active)
VALUES ('matriz', 'MAT', 'Sede / Matriz', true, true)
ON CONFLICT (id) DO NOTHING;

-- 2. Registro de Emails (Pré-autorização)
CREATE TABLE IF NOT EXISTS public.email_registry (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    role TEXT,
    status TEXT,
    registered_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    metadata JSONB DEFAULT '{}'::jsonb,
    unit_id TEXT DEFAULT 'all',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Perfis de Usuário
CREATE TABLE IF NOT EXISTS public.users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    full_name TEXT,
    avatar_url TEXT,
    role TEXT NOT NULL,
    status TEXT DEFAULT 'active' NOT NULL,
    pin TEXT,
    app_lock_enabled BOOLEAN DEFAULT true,
    app_lock_timeout INTEGER DEFAULT 300,
    app_inactivity_timeout INTEGER DEFAULT 900,
    unit_id TEXT DEFAULT 'all',
    teacher_id TEXT,
    favorite_shortcuts TEXT[],
    is_pre_registered BOOLEAN DEFAULT false,
    last_login TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS favorite_shortcuts TEXT[];

-- 4. Cursos
CREATE TABLE IF NOT EXISTS public.courses (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    duration_years INTEGER DEFAULT 1,
    duration_semesters INTEGER DEFAULT 2,
    duration_total TEXT,
    meetings_per_week INTEGER DEFAULT 1,
    meeting_days TEXT[],
    status TEXT DEFAULT 'Ativo',
    workload_hours INTEGER,
    unit_id TEXT DEFAULT 'matriz',
    user_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 5. Disciplinas
CREATE TABLE IF NOT EXISTS public.subjects (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    status TEXT DEFAULT 'Ativo',
    year TEXT,
    semester TEXT,
    teacher_id TEXT,
    program_content TEXT,
    unit_id TEXT DEFAULT 'matriz',
    user_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 6. Professores
CREATE TABLE IF NOT EXISTS public.teachers (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    phone_mobile TEXT,
    phone_mobile_is_whatsapp BOOLEAN DEFAULT false,
    cpf TEXT,
    rg TEXT,
    address_street TEXT,
    address_number TEXT,
    address_complement TEXT,
    address_neighborhood TEXT,
    address_city TEXT,
    address_state TEXT,
    address_zip TEXT,
    birth_date TEXT,
    subject_ids TEXT[],
    photo_url TEXT,
    observations TEXT,
    status TEXT DEFAULT 'Ativo',
    unit_id TEXT DEFAULT 'matriz',
    user_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 7. Turmas
CREATE TABLE IF NOT EXISTS public.classes (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    room TEXT,
    status TEXT DEFAULT 'Ativo',
    period TEXT,
    days_of_week TEXT[],
    semester TEXT,
    year TEXT,
    academic_year TEXT,
    subject_id TEXT,
    subject_id_sem1 TEXT,
    subject_id_sem2 TEXT,
    subject_ids TEXT[],
    teacher_id TEXT,
    start_date TEXT,
    observations TEXT,
    course TEXT,
    unit_id TEXT DEFAULT 'matriz',
    user_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 8. Alunos
CREATE TABLE IF NOT EXISTS public.students (
    id TEXT PRIMARY KEY,
    registration_number TEXT,
    name TEXT NOT NULL,
    cpf TEXT,
    rg TEXT,
    birth_date TEXT,
    start_date TEXT,
    status TEXT DEFAULT 'Ativo',
    is_former_student BOOLEAN DEFAULT false,
    class_id TEXT,
    address_street TEXT,
    address_number TEXT,
    address_complement TEXT,
    address_neighborhood TEXT,
    address_city TEXT,
    address_state TEXT,
    address_zip TEXT,
    parish TEXT,
    parish_id TEXT,
    forania TEXT,
    course TEXT,
    pastoral_participates TEXT,
    phone_mobile TEXT,
    phone_mobile_is_whatsapp BOOLEAN DEFAULT false,
    phone_residential TEXT,
    phone_commercial TEXT,
    email TEXT,
    guardian_father TEXT,
    guardian_mother TEXT,
    guardian_cpf TEXT,
    photo_url TEXT,
    observations TEXT,
    notes TEXT,
    unit_id TEXT DEFAULT 'matriz',
    user_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 9. Matrículas (Multi-turma)
CREATE TABLE IF NOT EXISTS public.enrollments (
    id TEXT PRIMARY KEY,
    student_id TEXT,
    class_id TEXT,
    academic_year TEXT,
    status TEXT DEFAULT 'Ativo',
    enrollment_date TEXT,
    fee_status TEXT,
    fee_amount NUMERIC(10,2) DEFAULT 0.00,
    fee_payment_method TEXT,
    fee_payment_date TEXT,
    fee_exemption_reason TEXT,
    fee_contribution_id TEXT,
    unit_id TEXT DEFAULT 'matriz',
    user_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 10. Reconciliações PIX
CREATE TABLE IF NOT EXISTS public.pix_reconciliations (
    id TEXT PRIMARY KEY,
    date TIMESTAMP WITH TIME ZONE NOT NULL,
    payer_name TEXT NOT NULL,
    payer_document TEXT,
    origin_bank TEXT,
    amount NUMERIC(15,2) NOT NULL,
    transaction_id TEXT NOT NULL,
    batch_id TEXT,
    status TEXT DEFAULT 'unmatched',
    matched_student_id TEXT,
    unit_id TEXT DEFAULT 'matriz',
    is_manual BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 11. Contribuições Financeiras
CREATE TABLE IF NOT EXISTS public.contributions (
    id TEXT PRIMARY KEY,
    student_id TEXT,
    amount NUMERIC(15,2) NOT NULL,
    reference_month INTEGER NOT NULL,
    reference_year INTEGER NOT NULL,
    payment_date TEXT NOT NULL,
    payment_method TEXT,
    origin TEXT,
    pix_id TEXT,
    observations TEXT,
    is_waived BOOLEAN DEFAULT false,
    status TEXT,
    waiver_reason TEXT,
    unit_id TEXT DEFAULT 'matriz',
    user_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 12. Configurações Financeiras e Taxas
CREATE TABLE IF NOT EXISTS public.financial_settings (
    id TEXT PRIMARY KEY,
    unit_id TEXT DEFAULT 'matriz',
    default_monthly_fee NUMERIC(10,2) DEFAULT 100.00,
    due_day INTEGER DEFAULT 10,
    late_fee_percentage NUMERIC(5,2) DEFAULT 0.00,
    year_fees JSONB DEFAULT '[]'::jsonb,
    course_fees JSONB DEFAULT '[]'::jsonb,
    class_fees JSONB DEFAULT '[]'::jsonb,
    subject_fees JSONB DEFAULT '[]'::jsonb,
    period_fees JSONB DEFAULT '[]'::jsonb,
    custom_rules JSONB DEFAULT '[]'::jsonb,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

INSERT INTO public.financial_settings (id, default_monthly_fee, due_day, late_fee_percentage, year_fees, course_fees, class_fees, subject_fees, period_fees, custom_rules)
VALUES ('current', 100.00, 10, 0.00, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- 13. Recibos
CREATE TABLE IF NOT EXISTS public.receipts (
    id TEXT PRIMARY KEY,
    receipt_number TEXT NOT NULL,
    amount NUMERIC(12,2) NOT NULL,
    payee_name TEXT NOT NULL,
    description TEXT,
    payment_date TEXT,
    signature_label TEXT,
    issue_date TEXT,
    student_id TEXT,
    unit_id TEXT DEFAULT 'matriz',
    user_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 14. Foranias
CREATE TABLE IF NOT EXISTS public.foraries (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    priest_id TEXT,
    priest_name TEXT,
    address TEXT,
    foundation_date TEXT,
    user_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 15. Paróquias
CREATE TABLE IF NOT EXISTS public.parishes (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    forania TEXT,
    forania_id TEXT,
    priest_id TEXT,
    priest_name TEXT,
    address TEXT,
    address_street TEXT,
    address_number TEXT,
    address_complement TEXT,
    address_neighborhood TEXT,
    address_city TEXT,
    address_state TEXT,
    address_zip TEXT,
    email TEXT,
    phone TEXT,
    phone_mobile TEXT,
    cnpj TEXT,
    foundation_date TEXT,
    patron_saint TEXT,
    vicariate TEXT,
    status TEXT DEFAULT 'active',
    notes TEXT,
    user_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 16. Clero e Leigos
CREATE TABLE IF NOT EXISTS public.clergy_leity (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    priest_name TEXT,
    role TEXT NOT NULL,
    parish_id TEXT,
    forania_id TEXT,
    email TEXT,
    phone TEXT,
    phone_mobile TEXT,
    phone_mobile_is_whatsapp BOOLEAN DEFAULT false,
    phone_whatsapp TEXT,
    address TEXT,
    address_street TEXT,
    address_number TEXT,
    address_complement TEXT,
    address_neighborhood TEXT,
    address_city TEXT,
    address_state TEXT,
    address_zip TEXT,
    status TEXT DEFAULT 'active',
    user_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 17. Configurações da Instituição
CREATE TABLE IF NOT EXISTS public.institution_settings (
    id TEXT PRIMARY KEY,
    name TEXT,
    cnpj TEXT,
    address TEXT,
    phone TEXT,
    phone_is_whatsapp BOOLEAN DEFAULT false,
    whatsapp TEXT,
    email TEXT,
    website TEXT,
    logo_url TEXT,
    footer_text TEXT,
    receipt_message TEXT,
    enrollment_receipt_message TEXT,
    show_enrollment_receipt_message BOOLEAN DEFAULT true,
    secretary TEXT,
    cep TEXT,
    city_uf TEXT,
    subtitle TEXT,
    admission_norms TEXT,
    presentation_info TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 18. Presenças / Frequência
CREATE TABLE IF NOT EXISTS public.attendances (
    id TEXT PRIMARY KEY,
    student_id TEXT,
    class_id TEXT,
    subject_id TEXT,
    date TEXT NOT NULL,
    status TEXT NOT NULL,
    observations TEXT,
    unit_id TEXT DEFAULT 'matriz',
    user_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 19. Avaliações
CREATE TABLE IF NOT EXISTS public.assessments (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    date TEXT NOT NULL,
    weight NUMERIC(5,2) DEFAULT 10.0,
    period TEXT,
    class_id TEXT,
    subject_id TEXT,
    description TEXT,
    unit_id TEXT DEFAULT 'matriz',
    user_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 20. Notas
CREATE TABLE IF NOT EXISTS public.grades (
    id TEXT PRIMARY KEY,
    student_id TEXT,
    class_id TEXT,
    subject_id TEXT,
    period TEXT NOT NULL,
    value NUMERIC(4,2) NOT NULL,
    status TEXT,
    observations TEXT,
    unit_id TEXT DEFAULT 'matriz',
    user_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 21. Eventos do Calendário
CREATE TABLE IF NOT EXISTS public.calendar_events (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    start_date TEXT NOT NULL,
    end_date TEXT,
    type TEXT NOT NULL,
    class_id TEXT,
    subject_id TEXT,
    unit_id TEXT DEFAULT 'matriz',
    user_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 22. Parâmetros Acadêmicos Globais
CREATE TABLE IF NOT EXISTS public.academic_parameters (
    id TEXT PRIMARY KEY,
    approval_grade NUMERIC(5,2) DEFAULT 6.0,
    recovery_grade NUMERIC(5,2) DEFAULT 4.0,
    failure_grade NUMERIC(5,2) DEFAULT 4.0,
    absence_limit_percentage NUMERIC(5,2) DEFAULT 25.0,
    notes TEXT,
    unit_id TEXT DEFAULT 'matriz',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 23. Configurações de Calendário / Sincronização Acadêmica
CREATE TABLE IF NOT EXISTS public.academic_settings (
    id TEXT PRIMARY KEY,
    unit_id TEXT DEFAULT 'matriz',
    term1_start TEXT,
    term1_end TEXT,
    term2_start TEXT,
    term2_end TEXT,
    class_weekday INTEGER,
    class_weekdays INTEGER[],
    skip_holiday_neighbors BOOLEAN,
    weekday_titles JSONB DEFAULT '{}'::jsonb,
    target_class_ids JSONB DEFAULT '[]'::jsonb,
    weekday_classes JSONB DEFAULT '{}'::jsonb,
    weekday_terms JSONB DEFAULT '{}'::jsonb,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 24. Versões de Calendário Anual
CREATE TABLE IF NOT EXISTS public.academic_calendar_versions (
    id TEXT PRIMARY KEY,
    year INTEGER NOT NULL,
    version INTEGER NOT NULL,
    status TEXT DEFAULT 'draft',
    title TEXT,
    state TEXT,
    city TEXT,
    start_date TEXT,
    end_date TEXT,
    weekdays INTEGER[],
    minimum_class_days_target INTEGER DEFAULT 200,
    periods JSONB DEFAULT '[]'::jsonb,
    recesses JSONB DEFAULT '[]'::jsonb,
    holidays JSONB DEFAULT '[]'::jsonb,
    total_class_days INTEGER DEFAULT 0,
    class_days_by_month JSONB DEFAULT '{}'::jsonb,
    class_days_by_period JSONB DEFAULT '{}'::jsonb,
    total_holidays INTEGER DEFAULT 0,
    total_recess_days INTEGER DEFAULT 0,
    manual_overrides_count INTEGER DEFAULT 0,
    days JSONB DEFAULT '{}'::jsonb,
    parameters_snapshot JSONB DEFAULT '{}'::jsonb,
    unit_id TEXT DEFAULT 'matriz',
    created_by TEXT,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 25. Certificados
CREATE TABLE IF NOT EXISTS public.certificates (
    id TEXT PRIMARY KEY,
    student_id TEXT,
    student_name TEXT,
    type TEXT NOT NULL,
    issuance_date TEXT NOT NULL,
    course TEXT,
    verification_code TEXT,
    unit_id TEXT DEFAULT 'matriz',
    user_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 26. Histórico de Importações
CREATE TABLE IF NOT EXISTS public.import_history (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    filename TEXT NOT NULL,
    record_count INTEGER DEFAULT 0,
    inserted_ids JSONB DEFAULT '[]'::jsonb,
    status TEXT DEFAULT 'completed',
    reverted_at TIMESTAMP WITH TIME ZONE,
    summary TEXT,
    details JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 27-30. Arquivo Morto (Tabelas Espelho)
CREATE TABLE IF NOT EXISTS public.archived_students (LIKE public.students INCLUDING ALL);
CREATE TABLE IF NOT EXISTS public.archived_teachers (LIKE public.teachers INCLUDING ALL);
CREATE TABLE IF NOT EXISTS public.archived_classes (LIKE public.classes INCLUDING ALL);
CREATE TABLE IF NOT EXISTS public.archived_subjects (LIKE public.subjects INCLUDING ALL);

-- Índices estratégicos de performance
CREATE INDEX IF NOT EXISTS idx_students_class_id ON public.students(class_id);
CREATE INDEX IF NOT EXISTS idx_students_unit_id ON public.students(unit_id);
CREATE INDEX IF NOT EXISTS idx_students_status ON public.students(status);
CREATE INDEX IF NOT EXISTS idx_classes_unit_id ON public.classes(unit_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_student_id ON public.enrollments(student_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_class_id ON public.enrollments(class_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_unit_id ON public.enrollments(unit_id);
CREATE INDEX IF NOT EXISTS idx_attendances_student_id ON public.attendances(student_id);
CREATE INDEX IF NOT EXISTS idx_attendances_class_id ON public.attendances(class_id);
CREATE INDEX IF NOT EXISTS idx_attendances_date ON public.attendances(date);
CREATE INDEX IF NOT EXISTS idx_attendances_unit_id ON public.attendances(unit_id);
CREATE INDEX IF NOT EXISTS idx_grades_student_id ON public.grades(student_id);
CREATE INDEX IF NOT EXISTS idx_grades_unit_id ON public.grades(unit_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_unit_id ON public.calendar_events(unit_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_start_date ON public.calendar_events(start_date);
CREATE INDEX IF NOT EXISTS idx_calendar_versions_year_unit ON public.academic_calendar_versions(year, unit_id);
CREATE INDEX IF NOT EXISTS idx_contributions_student_id ON public.contributions(student_id);
CREATE INDEX IF NOT EXISTS idx_contributions_ref ON public.contributions(reference_year, reference_month);
CREATE INDEX IF NOT EXISTS idx_contributions_unit_id ON public.contributions(unit_id);

-- Habilitar RLS e criar políticas de acesso público para todas as 30 tabelas
DO $$
DECLARE
    tables text[] := ARRAY[
        'units', 'email_registry', 'users', 'courses', 'subjects', 'teachers',
        'classes', 'students', 'enrollments', 'pix_reconciliations', 'contributions',
        'financial_settings', 'receipts', 'foraries', 'parishes', 'clergy_leity',
        'institution_settings', 'attendances', 'assessments', 'grades', 'calendar_events',
        'academic_parameters', 'academic_settings', 'academic_calendar_versions',
        'certificates', 'import_history', 'archived_students', 'archived_teachers',
        'archived_classes', 'archived_subjects'
    ];
    t text;
BEGIN
    FOREACH t IN ARRAY tables LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('DROP POLICY IF EXISTS "Public Access %I" ON public.%I', t, t);
        EXECUTE format('CREATE POLICY "Public Access %I" ON public.%I FOR ALL USING (true) WITH CHECK (true)', t, t);
        EXECUTE format('GRANT ALL ON TABLE public.%I TO anon, authenticated, service_role', t);
    END LOOP;
END $$;
