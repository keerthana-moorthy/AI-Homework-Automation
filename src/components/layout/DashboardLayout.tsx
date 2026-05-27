import React, { useState } from 'react';
import Sidebar from './Sidebar';
import Navbar from './Navbar';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({ children }) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen bg-gray-50/70 overflow-hidden font-nunito">
      {/* Sidebar navigation */}
      <Sidebar isOpen={isSidebarOpen} setIsOpen={setIsSidebarOpen} />

      {/* Main panel content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header toolbar */}
        <Navbar onMenuClick={() => setIsSidebarOpen(true)} />

        {/* Scrollable page canvas */}
        <main className="flex-1 overflow-y-auto bg-gray-50/50 relative">
          <div className="max-w-6xl mx-auto p-4 md:p-6 lg:p-8 animate-[fadeIn_0.2s_ease-out]">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;
