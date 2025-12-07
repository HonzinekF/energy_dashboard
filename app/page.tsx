import { DashboardLayout } from "@/components/DashboardLayout";

export default async function Home() {
  return (
    <DashboardLayout
      filters={{
        source: "all",
        range: "24h",
        interval: "15m",
      }}
    >
      <div className="text-center p-10">
        <p>Test: statická stránka bez načítání dat.</p>
      </div>
    </DashboardLayout>
  );
}
