export type StudentStatus = 'Ativo' | 'Inativo' | 'Concluído' | 'Suspenso';

export interface Student {
  id: string;
  registration_number: string; // Format: 000000/YYYY
  name: string;
  cpf?: string;
  rg?: string;
  birth_date?: string;
  start_date?: string; // Month/Year
  status: StudentStatus;
  is_former_student: boolean;
  class_id?: string;
  
  // Address
  address_street?: string;
  address_city?: string;
  address_state?: string;
  address_zip?: string;
  
  // Parochial/Course
  parish?: string;
  course?: string;
  pastoral_participates?: string;
  
  // Contacts
  phone_mobile?: string;
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

export interface Class {
  id: string;
  code: string;
  name: string;
  room?: string;
  status: 'Ativo' | 'Inativo';
  period: 'Manhã' | 'Tarde' | 'Noite';
  days_of_week: string[];
  semester: string;
  observations?: string;
  user_id: string;
  created_at: string;
}

export interface Subject {
  id: string;
  code: string;
  name: string;
  program_content?: string;
  user_id: string;
  created_at: string;
}

export interface Teacher {
  id: string;
  code: string;
  name: string;
  email: string;
  phone?: string;
  phone_mobile?: string;
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
  origin_bank?: string;
  amount: number;
  transaction_id: string;
  status: 'matched' | 'unmatched' | 'multiple';
  matched_student_id?: string;
  is_manual?: boolean;
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
  user_id: string;
  created_at: string;
}
