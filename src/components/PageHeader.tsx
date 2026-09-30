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
        "sticky top-0 z-[50] w-[calc(100%+1.25rem)] sm:w-[calc(100%+2rem)] lg:w-[calc(100%+3rem)] -mx-2.5 sm:-mx-4 lg:-mx-6 px-2.5 sm:px-4 lg:px-6 py-3 sm:py-3.5 mb-4 sm:mb-6",
        "bg-slate-100/90 backdrop-blur-md border-b border-slate-200/90 shadow-2xs",
        "transition-colors duration-150",
        "print:static print:w-full print:m-0 print:p-0 print:bg-transparent print:border-none print:shadow-none",
        className
      )}
    >
      <div className="max-w-[1440px] mx-auto w-full flex flex-col lg:flex-row lg:items-center justify-between gap-3 sm:gap-4">
        <div className="flex items-center gap-3.5 min-w-0">
          {/* Standardized White Frame Icon Container */}
          {Icon && (
            <div className="w-10 h-10 sm:w-11 sm:h-11 bg-white rounded-none border border-slate-200 flex items-center justify-center overflow-hidden shrink-0 shadow-2xs">
              <Icon className="w-5 h-5 text-slate-700" />
            </div>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2.5 sm:gap-3 flex-wrap">
              <h2 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight uppercase font-sans truncate">
                {title}
              </h2>
              {badge && (
                <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest bg-slate-200/70 px-2.5 py-0.5 border border-slate-300/80 shrink-0">
                  {badge}
                </span>
              )}
            </div>
            {description && (
              <p className="text-[10px] sm:text-[11px] font-bold text-slate-500 mt-0.5 uppercase tracking-wider leading-relaxed truncate sm:whitespace-normal">
                {description}
              </p>
            )}
          </div>
        </div>
        {children && (
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 shrink-0">
            {children}
          </div>
        )}
      </div>
    </header>
  );
}
