import React, { useState, useEffect } from 'react';
import { 
  FileCheck, 
  Search, 
  Plus,
  Printer,
  Trash2,
  Calendar,
  User,
  School,
  Trophy,
  Loader2,
  CheckCircle2,
  Download,
  AlertCircle
} from 'lucide-react';
import { cn, maskDate, formatDateForDisplay, parseDateToDB } from '../lib/utils';
import { fetchAll, saveData, deleteData } from '../lib/database';
import { useAuth } from '../contexts/AuthContext';
import { motion, AnimatePresence } from 'motion/react';

interface Certificate {
  id: string;
  student_id: string;
  student_name?: string;
  type: 'conclusão' | 'participação' | 'honra';
  issuance_date: string;
  course: string;
  verification_code: string;
  user_id: string;
}

interface Student {
  id: string;
  name: string;
  registration_number: string;
}

export function Documents() {
  const { userAuth, isAdmin, isDirector } = useAuth();
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [isIssuing, setIsIssuing] = useState(false);
  const [viewingCertificate, setViewingCertificate] = useState<Certificate | null>(null);
  
  const [formData, setFormData] = useState({
    student_id: '',
    type: 'conclusão' as Certificate['type'],
    issuance_date: new Date().toISOString().split('T')[0],
    course: ''
  });

  const fetchData = React.useCallback(async () => {
    try {
      const [certs, studs] = await Promise.all([
        fetchAll('certificates', '*', 'created_at', true),
        fetchAll('students', '*', 'name')
      ]);
      setCertificates(certs || []);
      setStudents(studs || []);
    } catch (error) {
      console.error('Error fetching documents data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleIssue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userAuth) return;

    const student = students.find(s => s.id === formData.student_id);
    const verificationCode = Math.random().toString(36).substring(2, 10).toUpperCase();

    try {
      const newDocId = crypto.randomUUID();
      await saveData('certificates', newDocId, {
        ...formData,
        id: newDocId,
        issuance_date: parseDateToDB(formData.issuance_date),
        student_name: student?.name,
        verification_code: verificationCode,
        user_id: userAuth.uid,
        created_at: new Date().toISOString()
      });

      setIsIssuing(false);
      setFormData({
        student_id: '',
        type: 'conclusão',
        issuance_date: new Date().toISOString().split('T')[0],
        course: ''
      });
      fetchData();
    } catch (error) {
      console.error("Error issuing certificate:", error);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Deseja realmente cancelar este documento?")) return;
    try {
      await deleteData('certificates', id);
      fetchData();
    } catch (error) {
      console.error("Error deleting document:", error);
    }
  };

  const printCertificate = () => {
    try {
      window.print();
    } catch (err) {
      console.error("Print failed:", err);
      alert('A impressão direta é bloqueada pelo navegador dentro do painel de visualização. Por favor, abra o sistema em uma nova aba para imprimir.');
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 print:hidden">
        <div>
          <h2 className="text-2xl font-black text-slate-800 flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-indigo-200">
              <FileCheck size={20} />
            </div>
            Certificados e Diplomas
          </h2>
          <p className="text-sm font-bold text-slate-400 mt-1 uppercase tracking-widest pl-13">Emissão e Registro de Documentos</p>
        </div>

        {(isAdmin || isDirector) && (
          <button 
            onClick={() => setIsIssuing(true)}
            className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-indigo-700 shadow-xl shadow-indigo-200 transition-all active:scale-95"
          >
            <Plus size={16} />
            Emitir Novo
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 print:hidden">
        {loading ? (
          <div className="col-span-full py-20 flex justify-center">
            <div className="w-10 h-10 border-4 border-indigo-600/20 border-t-indigo-600 rounded-full animate-spin" />
          </div>
        ) : certificates.length > 0 ? (
          certificates.map(cert => (
            <motion.div 
              layout
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              key={cert.id} 
              className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm hover:shadow-xl transition-all group"
            >
              <div className="flex items-start justify-between mb-4">
                <div className={cn(
                  "px-3 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest border",
                  cert.type === 'conclusão' ? "bg-indigo-50 text-indigo-600 border-indigo-100" :
                  cert.type === 'honra' ? "bg-amber-50 text-amber-600 border-amber-100" :
                  "bg-emerald-50 text-emerald-600 border-emerald-100"
                )}>
                  {cert.type}
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button 
                    onClick={() => setViewingCertificate(cert)}
                    className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl"
                  >
                    <Download size={16} />
                  </button>
                  <button 
                    onClick={() => handleDelete(cert.id)}
                    className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <h4 className="text-sm font-black text-slate-800 uppercase tracking-tight line-clamp-1">{cert.student_name}</h4>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{cert.course}</p>
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-slate-50">
                  <div className="flex items-center gap-2 text-slate-400">
                    <Calendar size={12} />
                    <span className="text-[10px] font-bold">{new Date(cert.issuance_date + 'T00:00:00').toLocaleDateString('pt-BR')}</span>
                  </div>
                  <div className="flex items-center gap-2 text-indigo-600">
                    <CheckCircle2 size={12} />
                    <span className="text-[10px] font-black font-mono">{cert.verification_code}</span>
                  </div>
                </div>
              </div>
            </motion.div>
          ))
        ) : (
          <div className="col-span-full py-20 text-center space-y-6">
            <div className="w-20 h-20 bg-slate-50 text-slate-300 rounded-[2rem] flex items-center justify-center mx-auto">
              <FileCheck size={40} />
            </div>
            <div>
              <p className="text-lg font-black text-slate-400">Nenhum certificado emitido</p>
              <p className="text-sm font-bold text-slate-300">Clique em "Emitir Novo" para começar o registro.</p>
            </div>
          </div>
        )}
      </div>

      <AnimatePresence>
        {isIssuing && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 print:hidden">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white max-w-lg w-full rounded-[2.5rem] shadow-2xl overflow-hidden"
            >
              <div className="bg-slate-50 p-8 border-b border-slate-100">
                <h3 className="text-xl font-black text-slate-800 flex items-center gap-3">
                  <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg">
                    <Plus size={20} />
                  </div>
                  Emitir Documento
                </h3>
              </div>

              <form onSubmit={handleIssue} className="p-8 space-y-6">
                <div className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Aluno</label>
                    <select 
                      required
                      value={formData.student_id}
                      onChange={e => setFormData({...formData, student_id: e.target.value})}
                      className="w-full px-4 py-3 bg-slate-50 border border-transparent rounded-2xl text-sm font-medium focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all appearance-none"
                    >
                      <option value="">Selecione o aluno...</option>
                      {students.map(s => <option key={s.id} value={s.id}>{s.name} ({s.registration_number})</option>)}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Tipo de Documento</label>
                    <div className="grid grid-cols-3 gap-2">
                      {['conclusão', 'participação', 'honra'].map(type => (
                        <button
                          key={type}
                          type="button"
                          onClick={() => setFormData({...formData, type: type as any})}
                          className={cn(
                            "px-4 py-3 rounded-xl text-[9px] font-black uppercase tracking-tight border transition-all text-center",
                            formData.type === type 
                              ? "bg-indigo-600 border-indigo-600 text-white shadow-lg" 
                              : "bg-slate-50 border-transparent text-slate-400 hover:border-slate-200"
                          )}
                        >
                          {type}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Curso / Evento</label>
                    <input 
                      required
                      type="text"
                      value={formData.course}
                      onChange={e => setFormData({...formData, course: e.target.value})}
                      placeholder="Ex: Formação em Teologia, Seminário de Catequese..."
                      className="w-full px-4 py-3 bg-slate-50 border border-transparent rounded-2xl text-sm font-medium focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Data de Emissão</label>
                    <input 
                      required
                      type="date"
                      value={formData.issuance_date}
                      onChange={e => setFormData({...formData, issuance_date: e.target.value})}
                      className="w-full px-4 py-3 bg-slate-50 border border-transparent rounded-2xl text-sm font-medium focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
                    />
                  </div>
                </div>

                <div className="flex gap-3 pt-4">
                  <button 
                    type="button"
                    onClick={() => setIsIssuing(false)}
                    className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-200"
                  >
                    Cancelar
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 py-4 bg-indigo-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-700 shadow-xl shadow-indigo-200"
                  >
                    Confirmar Emissão
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {viewingCertificate && (
          <div className="fixed inset-0 bg-white z-[100] flex items-center justify-center overflow-auto p-12">
            <div className="absolute top-8 right-8 flex gap-4 print:hidden">
              <button 
                onClick={printCertificate}
                className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-xl text-xs font-black uppercase tracking-widest"
              >
                <Printer size={16} /> Imprimir Documento
              </button>
              <button 
                onClick={() => setViewingCertificate(null)}
                className="flex items-center gap-2 px-6 py-3 bg-slate-100 text-slate-600 rounded-xl text-xs font-black uppercase tracking-widest"
              >
                Fechar
              </button>
            </div>

            <div className="w-[297mm] h-[210mm] bg-white border-[20px] border-slate-100 p-20 flex flex-col items-center justify-center text-center space-y-12 relative overflow-hidden">
               {/* Decorative Background Elements */}
               <div className="absolute top-0 right-0 w-64 h-64 bg-slate-50 rounded-full -mr-32 -mt-32 opacity-50" />
               <div className="absolute bottom-0 left-0 w-64 h-64 bg-slate-50 rounded-full -ml-32 -mb-32 opacity-50" />

               <div className="space-y-4">
                 <h1 className="text-6xl font-serif text-slate-800 italic">Certificado</h1>
                 <div className="w-32 h-1 bg-indigo-600 mx-auto" />
               </div>

               <div className="space-y-8 max-w-4xl">
                 <p className="text-2xl font-serif text-slate-500 leading-relaxed">
                   Certificamos para os devidos fins que o aluno(a)
                 </p>
                 <h2 className="text-5xl font-black text-slate-900 uppercase tracking-tight">
                   {viewingCertificate.student_name}
                 </h2>
                 <p className="text-2xl font-serif text-slate-500 leading-relaxed">
                   concluiu com êxito o curso de <span className="font-bold text-slate-800">{viewingCertificate.course}</span>, realizado na instituição <span className="font-bold text-indigo-600">ESCMIN</span>, na data de {new Date(viewingCertificate.issuance_date + 'T00:00:00').toLocaleDateString('pt-BR')}.
                 </p>
               </div>

               <div className="pt-20 grid grid-cols-2 gap-40 w-full px-20">
                 <div className="border-t-2 border-slate-200 pt-4 flex flex-col items-center">
                   <p className="text-sm font-black text-slate-800 uppercase">Direção do ESCMIN</p>
                   <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono">Autenticação Digital</p>
                 </div>
                 <div className="border-t-2 border-slate-200 pt-4 flex flex-col items-center">
                   <p className="text-sm font-black text-slate-800 uppercase">Secretaria Acadêmica</p>
                   <p className="text-xs font-black font-mono text-indigo-600 bg-indigo-50 px-3 py-1 rounded-lg mt-2">
                     COD: {viewingCertificate.verification_code}
                   </p>
                 </div>
               </div>

               <div className="absolute bottom-10 text-[8px] font-bold text-slate-300 uppercase tracking-[0.4em]">
                 Sistema de Gestão Escolar ESCMIN • Documento com Verificação Digital Válida em Todo Território Nacional
               </div>
            </div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
