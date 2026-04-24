import React, { useEffect, useState } from 'react';
import { db, saveData } from '../lib/firebase';
import { collection, query, getDocs, orderBy, updateDoc, doc, deleteDoc } from 'firebase/firestore';
import { UserProfile, UserRole, UserStatus } from '../types';
import { 
  Users as UsersIcon, 
  CheckCircle2, 
  XCircle, 
  Shield, 
  UserCog, 
  Search,
  Filter,
  MoreVertical,
  Clock,
  ShieldAlert,
  Loader2,
  Trash2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

export function Users() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState<UserStatus | 'all'>('all');
  const [processingId, setProcessingId] = useState<string | null>(null);

  const fetchUsers = async () => {
    try {
      const q = query(collection(db, 'profiles'), orderBy('created_at', 'desc'));
      const snap = await getDocs(q);
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() })) as UserProfile[];
      setUsers(data || []);
    } catch (e) {
      console.error('Error fetching users:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleUpdateStatus = async (userId: string, status: UserStatus) => {
    setProcessingId(userId);
    try {
      await saveData('profiles', userId, { status });
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, status } : u));
    } catch (e) {
      console.error('Error updating user status:', e);
    } finally {
      setProcessingId(null);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!confirm('Deseja realmente excluir permanentemente este usuário do sistema? Esta ação impedirá o acesso imediato.')) return;
    
    setProcessingId(userId);
    try {
      await deleteDoc(doc(db, 'profiles', userId));
      setUsers(prev => prev.filter(u => u.id !== userId));
    } catch (e) {
      console.error('Error deleting user:', e);
      alert('Erro ao excluir usuário. Verifique suas permissões.');
    } finally {
      setProcessingId(null);
    }
  };

  const handleUpdateRole = async (userId: string, role: UserRole) => {
    setProcessingId(userId);
    try {
      await saveData('profiles', userId, { role });
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, role } : u));
    } catch (e) {
      console.error('Error updating user role:', e);
    } finally {
      setProcessingId(null);
    }
  };

  const filteredUsers = users.filter(user => {
    const matchesSearch = 
      user.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.username?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filter === 'all' || user.status === filter;
    return matchesSearch && matchesFilter;
  });

  const pendingCount = users.filter(u => u.status === 'pending').length;

  return (
    <div className="p-8 max-w-7xl mx-auto min-h-screen bg-slate-50/50">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-2xl bg-[#00174b] flex items-center justify-center text-white shadow-lg shadow-blue-900/20">
              <UserCog size={20} />
            </div>
            <h1 className="text-3xl font-black text-[#00174b] uppercase tracking-tight">Gestão de Usuários</h1>
          </div>
          <p className="text-slate-500 font-bold text-sm ml-13 flex items-center gap-2">
            Controle de acessos e permissões do sistema
            {pendingCount > 0 && (
              <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider animate-pulse">
                {pendingCount} Solicitação{pendingCount > 1 ? 'ões' : ''} Pendente{pendingCount > 1 ? 's' : ''}
              </span>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-600 transition-colors" size={18} />
            <input 
              type="text" 
              placeholder="Buscar por nome ou usuário..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-12 pr-6 py-3 bg-white border border-slate-200 rounded-2xl text-sm font-bold focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500/30 transition-all outline-none w-full md:w-80 shadow-sm"
            />
          </div>

          <div className="flex bg-white px-1.5 py-1.5 rounded-2xl border border-slate-200 shadow-sm">
            {(['all', 'pending', 'authorized', 'rejected'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  "px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                  filter === f 
                    ? "bg-[#00174b] text-white shadow-md" 
                    : "text-slate-400 hover:text-slate-600 hover:bg-slate-50"
                )}
              >
                {f === 'all' ? 'Todos' : f === 'pending' ? 'Pendentes' : f === 'authorized' ? 'Ativos' : 'Recusados'}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4">
        <AnimatePresence mode="popLayout">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 bg-white rounded-[2.5rem] border border-slate-200 shadow-sm">
              <Loader2 size={40} className="text-blue-600 animate-spin mb-4" />
              <p className="text-sm font-black text-slate-400 uppercase tracking-widest">Carregando usuários...</p>
            </div>
          ) : filteredUsers.length === 0 ? (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center py-20 bg-white rounded-[2.5rem] border border-slate-200 shadow-sm"
            >
              <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-300 mb-4">
                <Search size={32} />
              </div>
              <p className="text-sm font-black text-slate-400 uppercase tracking-widest">Nenhum usuário encontrado</p>
            </motion.div>
          ) : (
            filteredUsers.map((user) => (
              <motion.div
                layout
                key={user.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className={cn(
                  "bg-white p-6 rounded-[2rem] border transition-all flex flex-col md:flex-row md:items-center justify-between gap-6 hover:shadow-xl hover:shadow-blue-900/5",
                  user.status === 'pending' ? "border-amber-200 bg-amber-50/10" : "border-slate-100"
                )}
              >
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center text-[#00174b] border border-slate-200">
                    <span className="text-xl font-black">{user.full_name?.charAt(0).toUpperCase()}</span>
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-[#00174b] uppercase tracking-tight">{user.full_name}</h3>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest flex items-center gap-1">
                        <UsersIcon size={12} />
                        @{user.username}
                      </span>
                      <div className="w-1 h-1 rounded-full bg-slate-300"></div>
                      <span className={cn(
                        "text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest",
                        user.status === 'authorized' ? "bg-emerald-100 text-emerald-700" :
                        user.status === 'pending' ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"
                      )}>
                        {user.status === 'authorized' ? 'Autorizado' : 
                         user.status === 'pending' ? 'Pendente' : 'Recusado'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex bg-slate-50 p-1 rounded-xl border border-slate-100 mr-4">
                    {(['admin', 'coordenador', 'secretario'] as const).map((r) => (
                      <button
                        key={r}
                        onClick={() => handleUpdateRole(user.id, r)}
                        disabled={processingId === user.id}
                        className={cn(
                          "px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all",
                          user.role === r 
                            ? "bg-white text-[#00174b] shadow-sm ring-1 ring-slate-200" 
                            : "text-slate-400 hover:text-slate-600"
                        )}
                      >
                        {r === 'admin' ? <Shield size={10} className="inline mr-1" /> : null}
                        {r === 'admin' ? 'Admin' : r === 'coordenador' ? 'Coordenador' : 'Secretário'}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-2">
                    {user.status !== 'authorized' && (
                      <button
                        onClick={() => handleUpdateStatus(user.id, 'authorized')}
                        disabled={processingId === user.id}
                        className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 transition-all active:scale-95 shadow-md shadow-emerald-500/20 disabled:opacity-50"
                      >
                        <CheckCircle2 size={14} />
                        Autorizar
                      </button>
                    )}
                    {user.status !== 'rejected' && (
                      <button
                        onClick={() => handleUpdateStatus(user.id, 'rejected')}
                        disabled={processingId === user.id}
                        className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-red-100 transition-all active:scale-95 disabled:opacity-50"
                      >
                        <XCircle size={14} />
                        Recusar
                      </button>
                    )}
                    <button
                      onClick={() => handleDeleteUser(user.id)}
                      disabled={processingId === user.id}
                      className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                      title="Excluir Usuário"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </motion.div>
            ))
          )}
        </AnimatePresence>
      </div>

      <div className="mt-12 p-8 bg-[#00174b] rounded-[2.5rem] relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/20 rounded-full blur-[80px] translate-x-1/2 -translate-y-1/2"></div>
        <div className="relative z-10 flex flex-col md:flex-row items-center gap-8">
          <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center text-white border border-white/20">
            <ShieldAlert size={32} />
          </div>
          <div className="flex-1 text-center md:text-left">
            <h2 className="text-xl font-black text-white uppercase tracking-tight mb-2">Protocolo de Segurança Ativo</h2>
            <p className="text-blue-200/60 text-sm font-medium">
              Todos os novos cadastros permanecem com acesso restrito até que você aplique a autorização manual. 
              Isso garante que apenas pessoas autorizadas visualizem dados sensíveis dos alunos e financeiro.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
