export type UserRole = 'admin' | 'diretor' | 'secretario';
export type UserStatus = 'active' | 'inactive';

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  full_name?: string;
  avatar_url?: string;
  role: UserRole;
  status: UserStatus;
  created_at: string;
  last_login?: string;
  updated_at?: string;
  is_pre_registered?: boolean;
  pin?: string;
  app_lock_enabled?: boolean;
  app_lock_timeout?: number;
}

export type StudentStatus = 'Ativo' | 'Inativo' | 'Concluído' | 'Suspenso';

export interface Student {
  id: string;
  registration_number: string; // Format: 000000/YYYY
  name: string;
  cpf?: string;
  rg?: string;
  birth_date?: string;
  start_date?: string; // DD/MM/YYYY
  status: StudentStatus;
  is_former_student: boolean;
  class_id?: string;
  
  // Address
  address_street?: string;
  address_neighborhood?: string;
  address_city?: string;
  address_state?: string;
  address_zip?: string;
  
  // Parochial/Course
  parish?: string;
  forania?: string;
  course?: string;
  pastoral_participates?: string;
  
  // Contacts
  phone_mobile?: string;
  phone_mobile_is_whatsapp?: boolean;
  phone_residential?: string;
  phone_commercial?: string;
  email: string;
  
  // Guardians
  guardian_father?: string;
  guardian_mother?: string;
  guardian_cpf?: string;
  
  photo_url?: string;
  created_at: string;
  user_id: string;
}

export type EnrollmentStatus = 'Ativo' | 'Concluído' | 'Trancado' | 'Cancelado';

export interface Enrollment {
  id: string;
  student_id: string;
  class_id: string;
  status: EnrollmentStatus;
  enrollment_date: string;
  user_id: string;
  created_at: string;
}

export interface Assessment {
  id: string;
  title: string;
  date: string;
  weight: number;
  period: string;
  class_id: string;
  subject_id: string;
  description?: string;
  user_id?: string;
  created_at: string;
}

export interface Class {
  id: string;
  code: string;
  name: string;
  room?: string;
  status: 'Ativo' | 'Inativo';
  period: 'Manhã' | 'Tarde' | 'Noite';
  days_of_week: string[];
  year?: string;
  semester: string;
  subject_ids?: string[];
  start_date?: string;
  observations?: string;
  is_special?: boolean;
  user_id: string;
  created_at: string;
}

export interface Subject {
  id: string;
  code: string;
  name: string;
  year?: string;
  semester?: string;
  teacher_id?: string;
  status?: 'Ativo' | 'Inativo';
  program_content?: string;
  user_id: string;
  created_at: string;
}

export interface Teacher {
  id: string;
  code: string;
  name: string;
  email: string;
  status?: 'Ativo' | 'Inativo';
  subject_ids?: string[];
  phone?: string;
  phone_mobile?: string;
  phone_mobile_is_whatsapp?: boolean;
  cpf?: string;
  rg?: string;
  address_street?: string;
  address_city?: string;
  address_state?: string;
  address_zip?: string;
  birth_date?: string;
  observations?: string;
  user_id: string;
  created_at: string;
}

export interface PixTransaction {
  id?: string;
  date: string;
  payer_name: string;
  payer_document?: string;
  origin_bank?: string;
  amount: number;
  transaction_id: string;
  status: 'matched' | 'unmatched' | 'multiple';
  matched_student_id?: string;
  batch_id?: string;
  is_manual?: boolean;
  created_at: string;
}

export interface Contribution {
  id: string;
  student_id: string;
  amount: number;
  reference_month: number;
  reference_year: number;
  payment_date: string;
  payment_method?: 'PIX' | 'Cartão' | 'Dinheiro';
  origin?: string;
  pix_id?: string;
  observations?: string;
  user_id: string;
  created_at: string;
}

export type ClergyRole = 'pároco' | 'vigário' | 'diácono' | 'seminarista' | 'leigo formado';

export interface ClergyLeity {
  id: string;
  code: string; // Sequential code
  name: string;
  priest_name?: string;
  address?: string;
  address_number?: string;
  address_neighborhood?: string;
  address_city?: string;
  address_state?: string;
  address_street?: string;
  phone_mobile?: string;
  phone?: string;
  email?: string;
  phone_mobile_is_whatsapp?: boolean;
  phone_whatsapp?: string;
  parish_id?: string;
  forania_id?: string;
  role: ClergyRole;
  user_id: string;
  created_at: string;
}

export interface Foraria {
  id: string;
  code: string; // Sequential code
  name: string;
  priest_id?: string; // ID of the clergyman responsible
  priest_name?: string; // Padre Forâneo
  address?: string;
  foundation_date?: string;
  user_id: string;
  created_at: string;
}

export interface Parish {
  id: string;
  code: string;
  name: string;
  forania_id?: string;
  priest_id?: string; // ID of the clergyman responsible
  priest_name?: string; // Cache for display
  address?: string;
  address_street?: string;
  address_number?: string;
  address_neighborhood?: string;
  address_city?: string;
  address_state?: string;
  address_zip?: string;
  email?: string;
  phone?: string;
  phone_mobile?: string;
  cnpj?: string;
  foundation_date?: string;
  patron_saint?: string;
  vicariate?: string;
  status?: string;
  notes?: string;
  user_id: string;
  created_at: string;
}

export interface InstitutionSettings {
  id?: string;
  name: string;
  cnpj: string;
  address: string;
  phone: string;
  phone_is_whatsapp?: boolean;
  whatsapp?: string;
  email: string;
  website: string;
  logo_url: string;
  footer_text: string;
  receipt_message: string;
  secretary?: string;
  cep?: string;
  city_uf?: string;
  subtitle?: string;
  admission_norms?: string;
  presentation_info?: string;
}

export interface AcademicSettings {
  id?: string;
  term1_start: string;
  term1_end: string;
  term2_start: string;
  term2_end: string;
  class_weekdays: number[];
  weekday_titles?: Record<number, string>;
  target_class_ids: string[];
  weekday_classes?: Record<number, string[]>;
  weekday_terms?: Record<number, { term1_start: string; term1_end: string; term2_start: string; term2_end: string }>;
}

export interface CalendarEvent {
  id: string;
  title: string;
  description: string;
  start_date: string;
  end_date: string;
  type: 'holiday' | 'holiday_nac' | 'holiday_est' | 'holiday_mun' | 'exam' | 'start_term' | 'end_term' | 'class_day' | 'event' | 'excused_class' | 'cancelled_class';
  class_id?: string;
  subject_id?: string;
  user_id: string;
  created_at: string;
  updated_at?: string;
}

export interface AcademicParameters {
  id?: string;
  approval_grade: number;
  recovery_grade: number;
  failure_grade: number;
  absence_limit_percentage: number;
  updated_at: string;
}

export interface Certificate {
  id: string;
  student_id: string;
  student_name?: string;
  type: 'conclusão' | 'participação' | 'honra';
  issuance_date: string;
  course: string;
  verification_code: string;
  user_id?: string;
  created_at?: string;
}

export interface Grade {
  id: string;
  student_id: string;
  class_id: string;
  subject_id: string;
  period: string;
  value: any;
}

export interface Receipt {
  id: string;
  receipt_number: string;
  amount: number;
  payee_name: string;
  description: string;
  payment_date: string;
  signature_label?: string;
  issue_date: string;
  user_id?: string;
  created_at?: string;
}

