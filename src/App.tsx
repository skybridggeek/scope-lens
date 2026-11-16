import { useState } from "react";
import TopBar from "./components/TopBar";
import Sidebar from "./components/Sidebar";
import CaseStudiesView from "./views/CaseStudiesView";
import ComparisonView from "./views/ComparisonView";
import MethodologyView from "./views/MethodologyView";
import OptimizerView from "./views/OptimizerView";
import SimulatorView from "./views/SimulatorView";
import { SimProvider } from "./state/SimContext";
import type { ViewKey } from "./views";

export default function App() {
  const [view, setView] = useState<ViewKey>("simulator");

  return (
    <SimProvider navigate={(v) => setView(v as ViewKey)}>
      <div className="flex flex-col h-screen overflow-hidden">
        <TopBar />
        <div className="flex flex-1 min-h-0">
          <Sidebar active={view} onSelect={setView} />
          <main className="flex-1 overflow-y-auto bg-canvas">
            {view === "simulator" && <SimulatorView />}
            {view === "comparison" && <ComparisonView />}
            {view === "optimizer" && <OptimizerView />}
            {view === "cases" && <CaseStudiesView />}
            {view === "methodology" && <MethodologyView />}
          </main>
        </div>
      </div>
    </SimProvider>
  );
}
