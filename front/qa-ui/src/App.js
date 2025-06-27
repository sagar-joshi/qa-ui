import React, {useState} from "react";
import QALocalLLM from "./QALocalLLM";
import FileSection from "./FileSection";

function App() {
  const [useRag, setUseRag] = useState(false)
  return (
    <div className="flex h-screen overflow-hidden p-2">
      <div className="w-1/5 border-r border-slate-300 bg-white overflow-y-auto p-2">
        <FileSection useRag={useRag} setUseRag={setUseRag}/>
      </div>

      <div className="w-4/5 p-2">
        <QALocalLLM useRag={useRag} />
      </div>
    </div>
  );
}
export default App;
