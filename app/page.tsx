import { DashboardLayout } from "@/components/DashboardLayout";
import { DEFAULT_FILTERS } from "@/lib/dashboardFilters";

export default async function Home() {
  return (
    <DashboardLayout
      filters={DEFAULT_FILTERS}
    >
      <div className="text-center p-10">
        <p>Test: statická stránka bez načítání dat.</p>
      </div>
    </DashboardLayout>
  );
}
