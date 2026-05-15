import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Lock, Delete, ArrowRight, ShieldCheck, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export const PinLock: React.FC = () => {
  const { isLocked, unlock, profile, logout } = useAuth();
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const [attempts, setAttempts] = useState(0);

  useEffect(() => {
    if (pin.length === 4) {
      handleUnlock();
    }
  }, [pin]);

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
          <div className="w-20 h-20 rounded-3xl bg-blue-600 flex items-center justify-center shadow-2xl shadow-blue-500/20 mb-6 border border-blue-400/30">
            <Lock className="text-white" size={32} />
          </div>
          <h2 className="text-white text-2xl font-bold mb-2">Sistema Bloqueado</h2>
          <p className="text-slate-400 text-center">Olá, <span className="text-blue-400 font-medium">{profile?.name}</span>. Digite seu PIN para acessar.</p>
        </div>

        {/* PIN Indicators */}
        <div className="flex gap-4 mb-12">
          {[0, 1, 2, 3].map((i) => (
            <motion.div
              key={i}
              animate={error ? { x: [0, -10, 10, -10, 10, 0] } : {}}
              transition={{ duration: 0.4 }}
              className={`w-4 h-4 rounded-full border-2 transition-all duration-300 ${
                pin.length > i 
                  ? 'bg-blue-500 border-blue-500 scale-125 shadow-[0_0_15px_rgba(59,130,246,0.5)]' 
                  : 'border-slate-700 bg-transparent'
              } ${error ? 'border-red-500 bg-red-500' : ''}`}
            />
          ))}
        </div>

        {/* Keyboard */}
        <div className="grid grid-cols-3 gap-4 w-full max-w-xs">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 'Limpar', 0, 'delete'].map((item, index) => {
            if (item === 'Limpar') {
              return (
                <motion.button
                  key="clear"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: index * 0.05 }}
                  onClick={() => setPin('')}
                  className="w-full aspect-square rounded-2xl flex items-center justify-center text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-white transition-colors active:scale-95"
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
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: index * 0.05 }}
                  onClick={handleDelete}
                  className="w-full aspect-square rounded-2xl flex items-center justify-center text-slate-500 hover:text-white transition-colors active:scale-95"
                >
                  <Delete size={24} />
                </motion.button>
              );
            }
            return (
              <motion.button
                key={item}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: index * 0.05 }}
                onClick={() => handleKeyPress(item.toString())}
                className="w-full aspect-square rounded-2xl bg-white/5 hover:bg-white/10 active:bg-blue-600/40 text-white text-3xl font-light border border-white/5 transition-all active:scale-90 flex items-center justify-center shadow-lg"
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
