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
    <header className={cn(
      "sticky top-0 z-30 bg-slate-100/98 backdrop-blur-md -mt-2.5 sm:-mt-4 lg:-mt-6 -mx-2.5 sm:-mx-4 lg:-mx-6 px-2.5 sm:px-4 lg:px-6 pt-3 sm:pt-4 lg:pt-5 pb-4 sm:pb-5 border-b border-slate-200/90 print:hidden mb-6 transition-all shadow-xs",
      className
    )}>
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 max-w-[1440px] mx-auto w-full">
        <div className="flex items-center gap-4 min-w-0">
          {/* Standardized White Frame Icon Container */}
          {Icon && (
            <div className="w-12 h-12 bg-white rounded-none border border-slate-205 flex items-center justify-center overflow-hidden shrink-0 shadow-sm">
              <Icon className="w-6 h-6 text-slate-600" />
            </div>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-xl font-bold text-slate-900 tracking-tight uppercase font-sans truncate">
                {title}
              </h2>
              {badge && (
                <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest bg-slate-100/70 px-3 py-1 border border-slate-200 shrink-0">
                  {badge}
                </span>
              )}
            </div>
            {description && (
              <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-wider leading-relaxed truncate sm:whitespace-normal">
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

