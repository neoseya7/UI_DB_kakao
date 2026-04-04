"use client";

import { useState } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { OrderDeadlineProvider } from "@/components/OrderDeadlineProvider";
import { ProtectedRoute } from "@/components/protected-route";
import { GuideModeProvider } from "@/components/layout/guide-context";
import { PopupManager } from "@/components/PopupManager";

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);

    return (
        <ProtectedRoute>
            <GuideModeProvider>
                <div className={`grid min-h-screen w-full transition-[grid-template-columns] duration-300 ease-in-out ${isSidebarOpen ? 'md:grid-cols-[220px_1fr] lg:grid-cols-[260px_1fr]' : 'md:grid-cols-[0px_1fr] lg:grid-cols-[0px_1fr]'}`}>
                    <div className={`overflow-hidden transition-opacity duration-300 ${isSidebarOpen ? 'opacity-100' : 'opacity-0'}`}>
                        <Sidebar />
                    </div>
                    <div className="flex flex-col h-screen overflow-hidden w-full min-w-0">
                        <Header isSidebarOpen={isSidebarOpen} toggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)} />
                        <main className="flex-1 overflow-auto bg-muted/10 p-4 md:p-6">
                            <OrderDeadlineProvider>
                                {children}
                            </OrderDeadlineProvider>
                            <PopupManager />
                        </main>
                    </div>
                </div>
            </GuideModeProvider>
        </ProtectedRoute>
    );
}
