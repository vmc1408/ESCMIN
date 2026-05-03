import React from 'react';
import { motion } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { 
  Shield, 
  BookOpen, 
  Users, 
  GraduationCap, 
  Calendar, 
  ChevronRight,
  LayoutDashboard,
  CheckCircle2,
  Lock,
  ArrowRight,
  MapPin,
  Phone,
  Mail,
  Clock,
  FileText,
  UserCheck,
  CheckSquare
} from 'lucide-react';

export function Welcome() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const isLoggedIn = user && profile;

  return (
    <div className="min-h-screen bg-[#fcfbf9] text-[#00174b] overflow-x-hidden font-sans">
      {/* Navbar */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/90 backdrop-blur-md border-b border-[#00174b]/10 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-[#00174b] rounded-xl flex items-center justify-center shadow-lg shadow-blue-900/20">
              <Shield className="text-white" size={28} />
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[#b4941d]">Diocese de Guarulhos</span>
              <span className="text-xl font-black tracking-tight leading-none">Escola Diocesana de Ministérios</span>
            </div>
          </div>
          
          <div className="hidden md:flex items-center gap-8 mr-8">
            <a href="#sobre" className="text-[11px] font-black uppercase tracking-widest text-[#00174b]/60 hover:text-[#00174b] transition-colors">A Escola</a>
            <a href="#criterios" className="text-[11px] font-black uppercase tracking-widest text-[#00174b]/60 hover:text-[#00174b] transition-colors">Critérios</a>
            <a href="#documentos" className="text-[11px] font-black uppercase tracking-widest text-[#00174b]/60 hover:text-[#00174b] transition-colors">Documentos</a>
            <a href="#contato" className="text-[11px] font-black uppercase tracking-widest text-[#00174b]/60 hover:text-[#00174b] transition-colors">Contato</a>
          </div>

          <button 
            onClick={() => navigate(isLoggedIn ? '/' : '/login')}
            className="px-6 py-2.5 bg-[#00174b] text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-blue-900 transition-all active:scale-95 flex items-center gap-2 shadow-lg shadow-blue-900/20"
          >
            {isLoggedIn ? 'Acessar Dashboard' : 'Área do Aluno'}
            {isLoggedIn ? <ArrowRight size={16} /> : <Lock size={16} />}
          </button>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-40 pb-32 px-6 overflow-hidden">
        {/* Background Patterns */}
        <div className="absolute top-0 right-0 w-1/2 h-full opacity-[0.03] pointer-events-none select-none">
          <Shield size={600} className="translate-x-1/4 -translate-y-1/4" />
        </div>
        
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
          >
            <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-[#b4941d]/10 text-[#7a6414] rounded-full text-[10px] font-black uppercase tracking-widest mb-8 border border-[#b4941d]/20">
              <GraduationCap size={14} />
              Formação Teológica e Ministerial
            </div>
            <h1 className="text-5xl lg:text-7xl font-black leading-[1.05] mb-8 text-[#00174b]">
              Formando <span className="text-[#b4941d]">Discípulos</span> para o Serviço da Igreja
            </h1>
            <p className="text-lg text-slate-500 font-medium leading-relaxed mb-12 max-w-lg">
              A Escola Diocesana de Ministérios (EDM) tem como missão a formação integral dos leigos e leigas, capacitando-os para os diversos ministérios e serviços na vida da nossa Diocese.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-5">
              <button 
                onClick={() => navigate(isLoggedIn ? '/' : '/login')}
                className="px-10 py-5 bg-[#00174b] text-white rounded-2xl font-black text-xs uppercase tracking-[0.2em] hover:bg-blue-900 transition-all shadow-2xl shadow-blue-900/30 active:scale-95 flex items-center justify-center gap-3 group"
              >
                {isLoggedIn ? 'Ir para o Portal' : 'Fazer Matrícula'}
                <ChevronRight size={20} className="group-hover:translate-x-1 transition-transform" />
              </button>
              
              <a 
                href="#sobre"
                className="px-10 py-5 bg-white text-[#00174b] border border-[#00174b]/10 rounded-2xl font-black text-xs uppercase tracking-[0.2em] hover:bg-slate-50 transition-all flex items-center justify-center gap-3"
              >
                Saiba Mais
              </a>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1, delay: 0.2 }}
            className="relative"
          >
            <div className="aspect-[4/5] bg-white rounded-[3rem] p-4 shadow-2xl shadow-slate-200 border border-slate-100 relative overflow-hidden">
               <div className="absolute inset-0 grayscale opacity-20 bg-[url('https://images.unsplash.com/photo-1548625361-1e6727228833?q=80&w=2672&auto=format&fit=crop')] bg-cover bg-center" />
               
               <div className="relative h-full border border-slate-100 rounded-[2.5rem] p-8 flex flex-col justify-between">
                 <div className="space-y-6">
                    <div className="w-16 h-16 bg-[#b4941d]/10 rounded-2xl flex items-center justify-center text-[#b4941d]">
                      <BookOpen size={32} />
                    </div>
                    <div className="space-y-2">
                       <h3 className="text-2xl font-black">Grade Curricular 2024</h3>
                       <p className="text-sm font-medium text-slate-500 uppercase tracking-widest">Matrículas Abertas até Março</p>
                    </div>
                 </div>

                 <div className="space-y-4">
                    <div className="p-4 bg-slate-50/80 backdrop-blur-sm rounded-2xl border border-white">
                       <div className="flex items-center justify-between mb-2">
                          <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Próxima Aula</span>
                          <span className="text-[10px] font-black text-[#b4941d]">Sexta, 19:30</span>
                       </div>
                       <p className="font-bold text-sm">História da Igreja e Patrística</p>
                    </div>
                    <div className="p-4 bg-slate-50/80 backdrop-blur-sm rounded-2xl border border-white">
                       <div className="flex items-center justify-between mb-2">
                          <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Inscrições</span>
                          <span className="text-[10px] font-black text-green-600">Disponível</span>
                       </div>
                       <p className="font-bold text-sm">Escola de Líderes e Ministros</p>
                    </div>
                 </div>
               </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Stats / Info */}
      <section className="bg-white py-16 border-y border-slate-100">
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-2 lg:grid-cols-4 gap-8">
          <div className="text-center lg:border-r border-slate-100 last:border-0 p-4">
             <p className="text-4xl font-black text-[#00174b] mb-1">20+</p>
             <p className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">Cursos Ativos</p>
          </div>
          <div className="text-center lg:border-r border-slate-100 last:border-0 p-4">
             <p className="text-4xl font-black text-[#00174b] mb-1">1.2k</p>
             <p className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">Alunos Formados</p>
          </div>
          <div className="text-center lg:border-r border-slate-100 last:border-0 p-4">
             <p className="text-4xl font-black text-[#00174b] mb-1">45</p>
             <p className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">Paróquias</p>
          </div>
          <div className="text-center lg:border-r border-slate-100 last:border-0 p-4">
             <p className="text-4xl font-black text-[#00174b] mb-1">100%</p>
             <p className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">Presencial</p>
          </div>
        </div>
      </section>

      {/* Main Sections */}
      <section id="sobre" className="py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col lg:flex-row gap-16">
            <div className="lg:w-1/3">
               <h2 className="text-4xl font-black mb-6 leading-tight uppercase">A Escola de Ministérios</h2>
               <p className="text-slate-500 font-medium leading-relaxed">
                 A EDM é o espaço privilegiado de formação da Diocese de Guarulhos. Aqui os fiéis aprofundam sua fé e se preparam tecnicamente e espiritualmente para servir às comunidades em diversos âmbitos pastorais.
               </p>
            </div>
            
            <div className="lg:w-2/3 grid grid-cols-1 md:grid-cols-2 gap-8">
              <InfoCard 
                icon={<UserCheck size={24} />}
                title="Para quem é?"
                desc="Leigos e leigas que desejam servir em suas paróquias como ministros, coordenadores ou agentes de pastoral."
              />
              <InfoCard 
                icon={<CheckSquare size={24} />}
                title="Objetivo"
                desc="Proporcionar formação bíblica, teológica e pastoral sólida em sintonia com as diretrizes da Igreja."
              />
            </div>
          </div>
        </div>
      </section>

      {/* Criteria */}
      <section id="criterios" className="py-24 bg-[#00174b] text-white px-6 rounded-[2rem] lg:rounded-[4rem] mx-4 lg:mx-10 my-10 overflow-hidden relative">
        <div className="absolute top-0 right-0 p-20 opacity-10 rotate-12 pointer-events-none">
           <BookOpen size={400} />
        </div>

        <div className="max-w-7xl mx-auto relative z-10">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-black mb-4 uppercase">Critérios de Admissão</h2>
            <div className="w-20 h-1 bg-[#b4941d] mx-auto rounded-full" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            <CriteriaItem 
              num="01" 
              title="Ser Católico praticante" 
              desc="Participar ativamente da vida sacramental e comunitária de sua Paróquia."
            />
            <CriteriaItem 
              num="02" 
              title="Indicação do Pároco" 
              desc="É indispensável a carta de recomendação assinada pelo seu Pároco."
            />
            <CriteriaItem 
              num="03" 
              title="Engajamento Pastoral" 
              desc="Já atuar ou ter o desejo de atuar em serviços e ministérios paroquiais."
            />
            <CriteriaItem 
              num="04" 
              title="Compromisso de Presença" 
              desc="Ter disponibilidade para as aulas semanais e encontros de formação."
            />
            <CriteriaItem 
              num="05" 
              title="Taxa de Matrícula" 
              desc="Efetuar o pagamento da taxa administrativa para manutenção da escola."
            />
            <CriteriaItem 
              num="06" 
              title="Escolaridade" 
              desc="Possuir, no mínimo, o ensino fundamental completo ou conforme edital."
            />
          </div>
        </div>
      </section>

      {/* Documents */}
      <section id="documentos" className="py-24 px-6 overflow-hidden">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-20 items-center">
           <div className="space-y-10">
             <div>
               <h2 className="text-4xl font-black mb-6 uppercase tracking-tight text-[#00174b]">Documentos Necessários</h2>
               <p className="text-slate-500 font-medium font-sans">Para oficializar sua matrícula, os seguintes documentos originais e cópias devem ser apresentados à secretaria ou anexados ao portal:</p>
             </div>

             <div className="space-y-3">
               {[
                 'RG e CPF (Cópia simples)',
                 'Comprovante de Residência atualizado',
                 'Certificado de Batismo / Crisma',
                 'Carta de Recomendação do Pároco',
                 '1 Foto 3x4 recente',
                 'Certificado de Conclusão Escolar'
               ].map((doc, idx) => (
                 <motion.div 
                   key={idx}
                   initial={{ opacity: 0, x: -20 }}
                   whileInView={{ opacity: 1, x: 0 }}
                   transition={{ delay: idx * 0.1 }}
                   className="flex items-center gap-4 p-4 bg-white border border-slate-100 rounded-2xl shadow-sm hover:border-[#b4941d]/30 transition-all cursor-default"
                 >
                   <div className="w-10 h-10 bg-[#b4941d]/10 text-[#b4941d] rounded-xl flex items-center justify-center shrink-0">
                      <FileText size={20} />
                   </div>
                   <span className="font-bold text-sm text-[#00174b]">{doc}</span>
                 </motion.div>
               ))}
             </div>
           </div>

           <div className="bg-slate-50 p-10 lg:p-16 rounded-[4rem] border border-slate-100">
              <div className="text-center space-y-6">
                 <div className="w-20 h-20 bg-[#00174b] rounded-3xl flex items-center justify-center mx-auto text-white shadow-2xl shadow-blue-900/20">
                    <Shield size={40} />
                 </div>
                 <h3 className="text-2xl font-black uppercase">Matrícula Digital</h3>
                 <p className="text-slate-500 text-sm font-medium leading-relaxed">
                   Você pode iniciar seu processo de matrícula online agora mesmo. Nossa equipe analisará seus dados e entrará em contato para a validação final.
                 </p>
                 <button 
                   onClick={() => navigate(isLoggedIn ? '/' : '/login')}
                   className="w-full py-5 bg-[#b4941d] text-white rounded-2xl font-black text-xs uppercase tracking-[0.2em] hover:bg-[#967b18] transition-all shadow-xl shadow-amber-900/10 active:scale-95 flex items-center justify-center gap-3"
                 >
                   {isLoggedIn ? 'Acessar meu Perfil' : 'Iniciar Pré-Matrícula'}
                   <ChevronRight size={20} />
                 </button>
              </div>
           </div>
        </div>
      </section>

      {/* Footer / Contact */}
      <footer id="contato" className="bg-[#00174b] text-white pt-24 pb-12 px-6 overflow-hidden">
        <div className="max-w-7xl mx-auto space-y-20">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 text-center md:text-left">
            <div className="space-y-6 flex flex-col items-center md:items-start text-center md:text-left">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-[#00174b]">
                  <Shield size={24} />
                </div>
                <span className="text-xl font-black leading-none uppercase">Portal EDM</span>
              </div>
              <p className="text-blue-200/60 text-sm leading-relaxed font-medium">
                Escola Diocesana de Ministérios da Diocese de Guarulhos. Formação para o serviço e missão.
              </p>
            </div>

            <div className="space-y-6 flex flex-col items-center md:items-start text-center md:text-left">
               <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-[#b4941d]">Atendimento</h4>
               <ul className="space-y-4">
                 <li className="flex items-start gap-3 justify-center md:justify-start">
                   <MapPin size={18} className="text-[#b4941d] shrink-0" />
                   <span className="text-sm text-blue-100 font-medium">Praça Tereza Cristina, 01 - Centro, Guarulhos/SP</span>
                 </li>
                 <li className="flex items-center gap-3 justify-center md:justify-start">
                   <Phone size={18} className="text-[#b4941d] shrink-0" />
                   <span className="text-sm text-blue-100 font-medium">(11) 2408-0420</span>
                 </li>
                 <li className="flex items-center gap-3 justify-center md:justify-start">
                   <Mail size={18} className="text-[#b4941d] shrink-0" />
                   <span className="text-sm text-blue-100 font-medium">edm@diocesedeguarulhos.org.br</span>
                 </li>
               </ul>
            </div>

            <div className="space-y-6 flex flex-col items-center md:items-start text-center md:text-left">
               <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-[#b4941d]">Horários Secretaria</h4>
               <ul className="space-y-4">
                 <li className="flex items-center gap-3 justify-center md:justify-start">
                   <Clock size={18} className="text-[#b4941d] shrink-0" />
                   <span className="text-sm text-blue-100 font-medium">Segunda a Sexta: 08:00 - 18:00</span>
                 </li>
                 <li className="flex items-center gap-3 justify-center md:justify-start">
                   <Calendar size={18} className="text-[#b4941d] shrink-0" />
                   <span className="text-sm text-blue-100 font-medium">Sábados: 08:00 - 12:00</span>
                 </li>
               </ul>
            </div>

            <div className="space-y-6 flex flex-col items-center md:items-start text-center md:text-left">
               <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-[#b4941d]">Links Úteis</h4>
               <ul className="space-y-3">
                 <li><a href="#" className="text-sm text-blue-200/60 hover:text-white transition-colors">Diocese de Guarulhos</a></li>
                 <li><a href="#" className="text-sm text-blue-200/60 hover:text-white transition-colors">Cursos Disponíveis</a></li>
                 <li><a href="#" className="text-sm text-blue-200/60 hover:text-white transition-colors">Calendário Acadêmico</a></li>
                 <li><a href="#" className="text-sm text-blue-200/60 hover:text-white transition-colors">Material de Estudo</a></li>
               </ul>
            </div>
          </div>

          <div className="pt-12 border-t border-white/10 flex flex-col md:flex-row items-center justify-between gap-6">
             <p className="text-[10px] font-black uppercase tracking-widest text-blue-200/40 text-center md:text-left">
               &copy; {new Date().getFullYear()} Diocese de Guarulhos. Desenvolvido para o serviço do Reino.
             </p>
             <div className="flex items-center gap-6">
                <a href="#" className="text-[10px] font-black uppercase tracking-widest text-blue-200/40 hover:text-white">Privacidade</a>
                <a href="#" className="text-[10px] font-black uppercase tracking-widest text-blue-200/40 hover:text-white">Termos</a>
             </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

function InfoCard({ icon, title, desc }: { icon: React.ReactNode, title: string, desc: string }) {
  return (
    <div className="p-8 bg-white border border-slate-100 rounded-[2.5rem] shadow-sm hover:shadow-xl transition-all duration-300">
      <div className="w-14 h-14 bg-[#00174b]/5 text-[#00174b] rounded-2xl flex items-center justify-center mb-6">
        {icon}
      </div>
      <h3 className="text-xl font-bold mb-3 uppercase">{title}</h3>
      <p className="text-slate-500 text-sm leading-relaxed font-medium">{desc}</p>
    </div>
  );
}

function CriteriaItem({ num, title, desc }: { num: string, title: string, desc: string }) {
  return (
    <div className="p-8 bg-white/5 border border-white/10 rounded-[2rem] hover:bg-white/10 transition-all group">
      <div className="text-3xl font-black text-[#b4941d] mb-4 group-hover:scale-110 transition-transform inline-block">{num}</div>
      <h3 className="text-lg font-bold mb-3 text-blue-100 uppercase tracking-tight">{title}</h3>
      <p className="text-blue-200/60 text-sm leading-relaxed font-medium">{desc}</p>
    </div>
  );
}
