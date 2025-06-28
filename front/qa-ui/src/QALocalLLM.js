// QALocalLLM.jsx
import React, { useState, useEffect, useRef } from "react";

export default function QALocalLLM({ useRag }) {
  const [query, setQuery] = useState("");
  const [model, setModel] = useState("");
  const [loading, setLoading] = useState(false);
  const [chatHistory, setChatHistory] = useState([]);
  const [availableModels, setAvailableModels] = useState([]);
  const [loadingModels, setLoadingModels] = useState(true);
  const [showPullBox, setShowPullBox] = useState(false);
  const [pullModelName, setPullModelName] = useState("");
  const [pullStatus, setPullStatus] = useState("");
  const [pullProgress, setPullProgress] = useState(null);
  const [pullStarted, setPullStarted] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory]);

  useEffect(() => {
    fetch("http://localhost:8000/models")
      .then((res) => res.json())
      .then((data) => {
        if (data.models) {
          setAvailableModels(data.models);
          if (!model) setModel(data.models[0]);
        }
      })
      .catch((err) => {
        console.error("Failed to load models", err);
        setAvailableModels([]);
      })
      .finally(() => setLoadingModels(false));
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
    setPullStarted(true);
    setPullStatus("Pulling...");
    setPullProgress(0);

    try {
      const res = await fetch("http://localhost:8000/pull", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model_name: pullModelName }),
      });

      const reader = res.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let progressText = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        progressText += chunk;

        const match = chunk.match(/(\d+)%/);
        if (match) {
          const percent = parseInt(match[1], 10);
          setPullProgress(percent);
        }
      }

      setPullStatus("Model pulled successfully!");
      setTimeout(() => {
        setShowPullBox(false);
        setPullModelName("");
        setPullStatus("");
        setPullProgress(null);
        setPullStarted(false);
      }, 1000);

      const updated = await fetch("http://localhost:8000/models").then((res) =>
        res.json()
      );
      if (updated.models) {
        setAvailableModels(updated.models);
        setModel(updated.models[0]);
      }
    } catch (e) {
      setPullStatus("Failed to pull model.");
      setPullStarted(false);
    }
  };

  const handleAsk = async () => {
    if (!query.trim() || loading) return;
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
        const chunk = decoder.decode(value, { stream: true });
        partial += chunk;

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
    <div className="flex flex-col h-screen bg-slate-50 text-slate-800 font-sans">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex justify-between items-center shadow-sm shrink-0">
        <h1 className="text-xl font-semibold tracking-tight">Chat</h1>
        <div className="flex items-center space-x-2">
          <label htmlFor="model" className="text-sm font-medium text-slate-600">Model:</label>
          <select
            id="model"
            className="text-sm bg-slate-100 border border-slate-300 rounded-lg px-3 py-1.5"
            value={model}
            onChange={(e) => handleModelChange(e.target.value)}
            disabled={loadingModels}
          >
            {loadingModels ? (
              <option value="">Loading...</option>
            ) : availableModels.length > 0 ? (
              <>
                {availableModels.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
                <option value="auto">Auto Select</option>
                <option value="pull">Pull from Ollama</option>
              </>
            ) : (
              <option value="">No models found</option>
            )}
          </select>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {chatHistory.map((msg, idx) => (
          <div
            key={idx}
            className={`flex ${msg.sender === "user" ? "justify-end" : "justify-start"}`}
          >
            <div className={`max-w-[75%] px-4 py-3 rounded-2xl shadow-sm text-sm leading-relaxed ${
              msg.sender === "user"
                ? "bg-blue-600 text-white"
                : "bg-white border border-slate-200 text-slate-800"
            }`}>
              {msg.text}
              {msg.sender === "bot" && msg.model && (
                <div className="mt-1 text-xs text-slate-400 font-medium">
                  Model: {msg.model}
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </main>

      <footer className="bg-white px-6 py-4 border-t border-slate-200 shrink-0">
        <div className="flex items-center gap-2">
          <input
            type="text"
            className="flex-1 px-4 py-2 rounded-lg border border-slate-300"
            placeholder="Type your question..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAsk()}
            disabled={loading}
          />
          <button
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition"
            onClick={handleAsk}
            disabled={loading}
          >
            {loading ? "..." : "Send"}
          </button>
        </div>
      </footer>

      {/* Pull Modal */}
      {showPullBox && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold mb-3">Pull Model from Ollama</h2>
            <input
              type="text"
              className="w-full border border-slate-300 px-3 py-2 rounded mb-3"
              placeholder="e.g. mistral, llama3, user/custom-model"
              value={pullModelName}
              onChange={(e) => setPullModelName(e.target.value)}
            />
            <div className="flex justify-end space-x-2 mb-2">
              <button
                className="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300"
                onClick={() => {
                  setShowPullBox(false);
                  setPullModelName("");
                  setPullStatus("");
                  setPullProgress(null);
                  setPullStarted(false);
                }}
              >
                Cancel
              </button>
              <button
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                onClick={handlePullModel}
              >
                Pull
              </button>
            </div>
            {pullStarted && (
              <>
                <div className="w-full bg-slate-200 rounded-full h-2.5 mb-2">
                  <div
                    className="bg-green-500 h-2.5 rounded-full"
                    style={{ width: `${pullProgress || 0}%` }}
                  ></div>
                </div>
                <p className="text-sm text-slate-600">
                  {pullStatus} {pullProgress !== null ? `(${pullProgress}%)` : ""}
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
