import React from 'react';
import { LucideIcon } from 'lucide-react';

interface PageHeaderProps {
  title: string;
  description?: string;
  icon: LucideIcon;
  badge?: string;
  children?: React.ReactNode;
}

export function PageHeader({ title, description, icon: Icon, badge, children }: PageHeaderProps) {
  return (
    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-6 border-b border-slate-200 print:hidden mb-6">
      <div className="flex items-center gap-4">
        {/* Standardized White Frame Icon Container */}
        <div className="w-12 h-12 bg-white rounded-none border border-slate-205 flex items-center justify-center overflow-hidden shrink-0 shadow-sm">
          <Icon className="w-6 h-6 text-slate-600" />
        </div>
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-xl font-bold text-slate-900 tracking-tight uppercase font-sans">
              {title}
            </h2>
            {badge && (
              <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest bg-slate-100/70 px-3 py-1 border border-slate-200">
                {badge}
              </span>
            )}
          </div>
          {description && (
            <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-wider leading-relaxed">
              {description}
            </p>
          )}
        </div>
      </div>
      {children && (
        <div className="flex flex-wrap items-center gap-3 shrink-0">
          {children}
        </div>
      )}
    </div>
  );
}
