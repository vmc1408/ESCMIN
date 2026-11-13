import React from 'react';
import { LucideIcon } from 'lucide-react';
import { cn } from '../lib/utils';

interface PageHeaderProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  badge?: string;
  children?: React.ReactNode;
  className?: string;
}

export function PageHeader({ title, description, icon: Icon, badge, children, className }: PageHeaderProps) {
  return (
    <header
      className={cn(
        "sticky top-0 z-[50] w-[calc(100%+1rem)] sm:w-[calc(100%+1.75rem)] lg:w-[calc(100%+2.5rem)] -mx-2 sm:-mx-3.5 lg:-mx-5 px-2 sm:px-3.5 lg:px-5 py-2 sm:py-2.5 mb-2.5 sm:mb-3.5",
        "bg-[#E7EEF5]/95 backdrop-blur-md border-b-2 border-slate-300 shadow-xs",
        "transition-colors duration-150",
        "print:static print:w-full print:m-0 print:p-0 print:bg-transparent print:border-none print:shadow-none",
        className
      )}
    >
      <div className="max-w-[1560px] mx-auto w-full flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 sm:gap-3.5">
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          {/* Standardized Modern Teal Icon Container */}
          {Icon && (
            <div className="w-8 h-8 sm:w-9 sm:h-9 bg-teal-600 rounded-lg border border-teal-700 flex items-center justify-center overflow-hidden shrink-0 shadow-xs">
              <Icon className="w-4 h-4 sm:w-4.5 sm:h-4.5 text-white" />
            </div>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2 sm:gap-2.5 flex-wrap">
              <h2 className="text-sm sm:text-base font-bold text-slate-900 tracking-tight uppercase font-sans truncate">
                {title}
              </h2>
              {badge && (
                <span className="text-[9.5px] font-black text-teal-800 uppercase tracking-widest bg-teal-50 px-2 py-0.5 rounded border border-teal-300 shrink-0">
                  {badge}
                </span>
              )}
            </div>
            {description && (
              <p className="text-[9px] sm:text-[9.5px] font-semibold text-slate-600 mt-0.5 uppercase tracking-wider leading-relaxed truncate sm:whitespace-normal">
                {description}
              </p>
            )}
          </div>
        </div>
        {children && (
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 shrink-0">
            {children}
          </div>
        )}
      </div>
    </header>
  );
}
