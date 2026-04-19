import React from 'react';
import { Sidebar } from './Sidebar';
import { Navbar } from './Navbar';
import { Outlet } from 'react-router-dom';

export function Layout() {
  return (
    <div className="min-h-screen bg-[#faf8ff]">
      <Sidebar />
      <div className="ml-60 print:ml-0">
        <Navbar />
        <main className="pt-16 p-6 print:pt-0 print:p-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
