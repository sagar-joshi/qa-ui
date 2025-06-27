import React, { useState } from "react";
import FileSection from "./FileSection";
import QALocalLLM from "./QALocalLLM";

function App() {
  const [useRag, setUseRag] = useState(false);

  return (
    <div className="flex flex-col h-screen bg-gray-100">
      <nav className="bg-slate-900 text-white px-6 py-4 shadow-md">
        <h1 className="text-2xl font-bold tracking-tight">OmniGen</h1>
      </nav>

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-full md:w-1/3 p-4 overflow-y-auto border-r bg-white">
          <FileSection useRag={useRag} setUseRag={setUseRag} />
        </aside>

        <section className="w-full md:w-2/3 flex flex-col overflow-hidden">
          <QALocalLLM useRag={useRag} />
        </section>
      </div>
    </div>
  );
}

export default App;
