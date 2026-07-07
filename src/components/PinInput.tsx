import React, { useState, useRef } from 'react';
import { Eye, EyeOff } from 'lucide-react';

interface PinInputProps {
  value: string;
  onChange: (value: string) => void;
  length?: number;
  error?: string;
  onEnter?: () => void;
}

export function PinInput({ value, onChange, length = 4, error, onEnter }: PinInputProps) {
  const [showPin, setShowPin] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleContainerClick = () => {
    inputRef.current?.focus();
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawVal = e.target.value.replace(/\D/g, '');
    onChange(rawVal.slice(0, length));
  };

  return (
    <div className="space-y-2">
      <div 
        onClick={handleContainerClick}
        className="relative flex items-center justify-center gap-3 py-3 px-4 bg-slate-50 border border-slate-200 hover:border-slate-300 rounded-2xl cursor-text transition-all duration-200 group focus-within:border-red-500 focus-within:bg-white focus-within:ring-4 focus-within:ring-red-500/10"
      >
        {/* Invisible Input for Native Keyboard & Autocomplete */}
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={length}
          value={value}
          onChange={handleInputChange}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              onEnter?.();
            }
          }}
          className="absolute inset-0 w-full h-full opacity-0 cursor-text z-10"
          autoFocus
        />

        {/* Displaying Individual Digital Slots */}
        <div className="flex gap-2.5 z-0">
          {Array.from({ length }).map((_, idx) => {
            const char = value[idx] || '';
            const isCurrent = idx === value.length;
            const hasValue = char !== '';
            
            return (
              <div
                key={idx}
                className={`w-11 h-12 rounded-xl border flex items-center justify-center font-mono text-lg font-black transition-all duration-150 ${
                  isFocused && isCurrent
                    ? 'border-red-500 bg-white shadow-md shadow-red-500/5 ring-2 ring-red-500/15'
                    : hasValue
                    ? 'border-slate-300 bg-white text-slate-800'
                    : 'border-slate-200 bg-slate-50 text-slate-400'
                }`}
              >
                {hasValue ? (
                  showPin ? (
                    char
                  ) : (
                    <span className="w-2.5 h-2.5 rounded-full bg-slate-800 animate-in zoom-in-50 duration-100" />
                  )
                ) : (
                  <span className={`w-1.5 h-1.5 rounded-full bg-slate-300 ${isFocused && isCurrent ? 'animate-pulse bg-red-400' : ''}`} />
                )}
              </div>
            );
          })}
        </div>

        {/* Eye Toggle Icon */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setShowPin(!showPin);
          }}
          className="absolute right-4 p-1 text-slate-400 hover:text-slate-600 rounded-lg transition-all z-20 cursor-pointer"
        >
          {showPin ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
      
      {error && (
        <p className="text-[10px] text-red-600 font-bold text-center animate-pulse">
          {error}
        </p>
      )}
    </div>
  );
}
