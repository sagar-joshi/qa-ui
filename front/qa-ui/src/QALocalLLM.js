import React, { useState, useEffect, useRef } from "react";

export default function QALocalLLM({useRag}) {
  const [query, setQuery] = useState("");
  const [model, setModel] = useState("llama3");
  const [loading, setLoading] = useState(false);
  const [chatHistory, setChatHistory] = useState([]);
  const [availableModels, setAvailableModels] = useState([]);
  const [showPullBox, setShowPullBox] = useState(false);
  const [pullModelName, setPullModelName] = useState("");
  const [pullStatus, setPullStatus] = useState("");
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory]);

  useEffect(() => {
    fetch("http://localhost:8000/models")
      .then((res) => res.json())
      .then((data) => {
        if (data.models) setAvailableModels(data.models);
      });
  }, []);

  const handleModelChange = (value) => {
    if (value === "pull") {
      setShowPullBox(true);
    } else {
      setModel(value);
    }
  };

  const handlePullModel = async () => {
    if (!pullModelName.trim()) return;
    setPullStatus("Pulling...");

    try {
      const res = await fetch("http://localhost:8000/pull", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model_name: pullModelName }),
      });
      const data = await res.json();
      setPullStatus(data.success ? "Model pulled successfully!" : "Error: " + data.error);
      fetch("http://localhost:8000/models")
        .then((res) => res.json())
        .then((data) => {
          if (data.models) setAvailableModels(data.models);
        });
    } catch (e) {
      setPullStatus("Failed to pull model.");
    }
  };

  const handleAsk = async () => {
    if (!query.trim()) return;
    setLoading(true);

    const userMessage = { sender: "user", text: query };
    setChatHistory((prev) => [...prev, userMessage]);
    setQuery("");

    const botMessage = { sender: "bot", text: "", model: model };
    setChatHistory((prev) => [...prev, botMessage]);

    try {
      const res = await fetch("http://localhost:8000/qa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: userMessage.text, model, useRag: Boolean(useRag) }),
      });

      if (!res.body) throw new Error("No response stream");

      const reader = res.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let partial = "";
      const usedModel = res.headers.get("X-Model-Used") || model;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        partial += decoder.decode(value);
        setChatHistory((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            ...updated[updated.length - 1],
            text: partial,
            model: usedModel,
          };
          return updated;
        });
      }
    } catch (e) {
      setChatHistory((prev) => [
        ...prev,
        { sender: "bot", text: "Error: Unable to connect to backend." },
      ]);
    }

    setLoading(false);
  };

  return (
    <div className="flex flex-col h-full">
      <header className="p-4 bg-slate-900 text-white">
        <h1 className="text-2xl font-bold">Local Chat with LLM</h1>
        <div className="mt-2">
          <label className="mr-2 font-medium">Model:</label>
          <select
            className="bg-slate-800 text-white border border-slate-700 rounded px-2 py-1"
            value={model}
            onChange={(e) => handleModelChange(e.target.value)}
          >
            {availableModels.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
            <option value="auto">Auto Select</option>
            <option value="pull">Pull from Ollama</option>
          </select>
        </div>
      </header>

      <main className="flex-1 p-4 overflow-y-auto bg-slate-100">
        {chatHistory.map((msg, idx) => (
          <div
            key={idx}
            className={`my-2 flex ${msg.sender === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`rounded-xl px-4 py-2 max-w-[80%] whitespace-pre-wrap ${
                msg.sender === "user"
                  ? "bg-blue-600 text-white"
                  : "bg-white border border-slate-200 text-slate-800"
              }`}
            >
              {msg.text}
            </div>
            {msg.sender === "bot" && msg.model && (
              <div className="text-xs text-slate-500 mt-1 ml-1">
                <strong>{msg.model}</strong>
              </div>
            )}
          </div>
        ))}
        <div ref={bottomRef}></div>
      </main>

      <footer className="p-4 bg-white border-t border-slate-200">
        <div className="flex gap-2">
          <input
            type="text"
            className="flex-1 px-4 py-2 border border-slate-300 rounded-lg shadow-sm"
            placeholder="Type your question..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAsk()}
          />
          <button
            className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            onClick={handleAsk}
            disabled={loading}
          >
            {loading ? "..." : "Send"}
          </button>
        </div>
      </footer>

      {showPullBox && (
        <div className="absolute inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-lg w-96">
            <h2 className="text-lg font-bold mb-2">Pull Model from Ollama</h2>
            <input
              type="text"
              className="w-full border border-slate-300 px-3 py-2 rounded mb-3"
              placeholder="e.g., mistral, llama3, user/custom-model"
              value={pullModelName}
              onChange={(e) => setPullModelName(e.target.value)}
            />
            <div className="flex justify-end gap-2">
              <button
                className="px-4 py-2 bg-gray-300 text-gray-800 rounded"
                onClick={() => {
                  setShowPullBox(false);
                  setPullModelName("");
                  setPullStatus("");
                }}
              >
                Cancel
              </button>
              <button
                className="px-4 py-2 bg-blue-600 text-white rounded"
                onClick={handlePullModel}
              >
                Pull
              </button>
            </div>
            {pullStatus && (
              <p className="mt-3 text-sm text-slate-600">{pullStatus}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
