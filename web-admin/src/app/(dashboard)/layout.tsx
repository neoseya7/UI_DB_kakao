import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { OrderDeadlineProvider } from "@/components/OrderDeadlineProvider";

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="grid min-h-screen w-full md:grid-cols-[220px_1fr] lg:grid-cols-[260px_1fr]">
            <Sidebar />
            <div className="flex flex-col h-screen overflow-hidden">
                <Header />
                <main className="flex-1 overflow-auto bg-muted/10 p-4 md:p-6">
                    <OrderDeadlineProvider>
                        {children}
                    </OrderDeadlineProvider>
                </main>
            </div>
        </div>
    );
}
