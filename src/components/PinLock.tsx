import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Lock, Delete, ArrowRight, ShieldCheck, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export const PinLock: React.FC = () => {
  const { isLocked, unlock, profile, logout } = useAuth();
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const [attempts, setAttempts] = useState(0);

  const [activeKey, setActiveKey] = useState<string | null>(null);

  const triggerAnimation = (key: string) => {
    setActiveKey(key);
    setTimeout(() => setActiveKey(null), 150);
  };

  useEffect(() => {
    if (pin.length === 4) {
      handleUnlock();
    }
  }, [pin]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isLocked) return;
      
      if (e.key >= '0' && e.key <= '9') {
        handleKeyPress(e.key);
        triggerAnimation(e.key);
      } else if (e.key === 'Backspace') {
        handleDelete();
        triggerAnimation('delete');
      } else if (e.key === 'Enter') {
        if (pin.length === 4) handleUnlock();
      } else if (e.key === 'Escape') {
        setPin('');
        triggerAnimation('Limpar');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isLocked, pin]);

  const handleUnlock = () => {
    const success = unlock(pin);
    if (success) {
      setPin('');
      setError(false);
    } else {
      setError(true);
      setPin('');
      setAttempts(prev => prev + 1);
      
      // Haptic feedback simulation
      if (window.navigator.vibrate) {
        window.navigator.vibrate(200);
      }
      
      setTimeout(() => setError(false), 500);
    }
  };

  const handleKeyPress = (num: string) => {
    if (pin.length < 4) {
      setPin(prev => prev + num);
      setError(false);
    }
  };

  const handleDelete = () => {
    setPin(prev => prev.slice(0, -1));
  };

  if (!isLocked) return null;

  return (
    <div className="fixed inset-0 z-[9999] bg-slate-900 flex flex-col items-center justify-center p-4">
      {/* Background Decor */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-20">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-blue-500 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-indigo-500 blur-[120px]" />
      </div>

      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-sm flex flex-col items-center relative z-10"
      >
        <div className="mb-8 flex flex-col items-center">
          <div className="w-16 h-16 rounded-2xl bg-amber-500 flex items-center justify-center shadow-2xl shadow-amber-500/20 mb-6 border border-amber-400/30">
            <Lock className="text-white" size={28} />
          </div>
          <h2 className="text-white text-xl font-bold mb-1">Sistema Bloqueado</h2>
          <p className="text-slate-400 text-sm text-center">Olá, <span className="text-amber-400 font-medium">{profile?.name}</span>. Digite seu PIN para acessar.</p>
        </div>

        {/* PIN Indicators */}
        <div className="flex gap-4 mb-10">
          {[0, 1, 2, 3].map((i) => (
            <motion.div
              key={i}
              animate={error ? { x: [0, -10, 10, -10, 10, 0] } : {}}
              transition={{ duration: 0.4 }}
              className={`w-3 h-3 rounded-full border-2 transition-all duration-300 ${
                pin.length > i 
                  ? 'bg-amber-500 border-amber-500 scale-125 shadow-[0_0_15px_rgba(245,158,11,0.5)]' 
                  : 'border-slate-700 bg-transparent'
              } ${error ? 'border-red-500 bg-red-500' : ''}`}
            />
          ))}
        </div>

        {/* Keyboard */}
        <div className="grid grid-cols-3 gap-2.5 w-full max-w-[220px]">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 'Limpar', 0, 'delete'].map((item, index) => {
            const isActive = activeKey === item.toString();
            
            if (item === 'Limpar') {
              return (
                <motion.button
                  key="clear"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={isActive ? { scale: 0.9, color: '#fbbf24', textShadow: '0 0 8px rgba(251,191,36,0.5)' } : { opacity: 1, scale: 1 }}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95, color: '#fbbf24' }}
                  transition={{ duration: 0.1 }}
                  onClick={() => { setPin(''); triggerAnimation('Limpar'); }}
                  className="w-full aspect-square rounded-lg flex items-center justify-center text-[8px] font-black uppercase tracking-widest text-slate-500 hover:text-slate-300 transition-colors"
                >
                  Limpar
                </motion.button>
              );
            }
            if (item === 'delete') {
              return (
                <motion.button
                  key="delete"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={isActive ? { 
                    scale: 0.9, 
                    backgroundColor: 'rgba(251, 191, 36, 0.4)', 
                    borderColor: 'rgba(251, 191, 36, 0.6)',
                    color: '#fbbf24'
                  } : { opacity: 1, scale: 1 }}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.9, backgroundColor: 'rgba(251, 191, 36, 0.4)', borderColor: 'rgba(251, 191, 36, 0.6)' }}
                  transition={{ duration: 0.1 }}
                  onClick={() => { handleDelete(); triggerAnimation('delete'); }}
                  className="w-full aspect-square rounded-lg flex items-center justify-center text-slate-500 hover:text-white border border-transparent transition-all"
                >
                  <Delete size={18} />
                </motion.button>
              );
            }
            return (
              <motion.button
                key={item}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={isActive ? { 
                  scale: 0.9, 
                  backgroundColor: 'rgba(251, 191, 36, 0.4)', 
                  borderColor: 'rgba(251, 191, 36, 0.8)',
                  boxShadow: '0 0 20px rgba(251, 191, 36, 0.4)',
                  color: '#fbbf24'
                } : { opacity: 1, scale: 1 }}
                whileHover={{ scale: 1.05, backgroundColor: 'rgba(255, 255, 255, 0.08)' }}
                whileTap={{ 
                  scale: 0.9, 
                  backgroundColor: 'rgba(251, 191, 36, 0.6)', 
                  borderColor: 'rgba(251, 191, 36, 1)',
                  boxShadow: '0 0 25px rgba(251, 191, 36, 0.5)',
                  color: '#ffffff'
                }}
                transition={{ duration: 0.1 }}
                onClick={() => { handleKeyPress(item.toString()); triggerAnimation(item.toString()); }}
                className="w-full aspect-square rounded-lg bg-white/5 text-white text-xl font-light border border-white/5 transition-all flex items-center justify-center shadow-lg hover:border-white/10"
              >
                {item}
              </motion.button>
            );
          })}
        </div>

        {attempts > 0 && (
          <p className="mt-8 text-red-400 text-sm font-medium animate-pulse">
            PIN incorreto. Tente novamente.
          </p>
        )}

        <button 
          onClick={logout}
          className="mt-12 text-slate-500 hover:text-slate-300 text-sm font-medium flex items-center gap-2 transition-colors"
        >
          Sair da conta
        </button>
      </motion.div>
    </div>
  );
};
