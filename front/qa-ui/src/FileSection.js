import React, { useState, useEffect } from "react";

export default function FileSection({useRag, setUseRag}) {
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState("");
  const [uploadedFiles, setUploadedFiles] = useState([]);

  useEffect(() => {
    fetchUploadedFiles();
  }, []);

  const fetchUploadedFiles = async () => {
    try {
      const res = await fetch("http://localhost:8000/uploaded-files");
      const data = await res.json();
      if (data.files) {
        setUploadedFiles(data.files);
      }
    } catch (err) {
      console.error("Failed to fetch uploaded files:", err);
    }
  };

  const handleFileChange = (e) => {
    setFiles([...e.target.files]);
    setStatus("");
  };

  const handleUpload = async () => {
    if (!files.length) return;

    setUploading(true);
    setStatus("");

    const formData = new FormData();
    files.forEach((file) => formData.append("files", file));

    try {
      const res = await fetch("http://localhost:8000/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      setStatus(data.message || "Upload complete");
      await fetchUploadedFiles(); // after upload completes
    } catch (e) {
      setStatus("Upload failed");
    }

    setUploading(false);
  };

  const handleReset = () => {
    setFiles([]);
    setStatus("");
  };

  return (
    <div className="p-4 border border-slate-300 rounded-lg bg-white shadow-md max-w-xl mx-auto mt-4">
      <div className="p-4 bg-white border-r border-slate-200 h-full w-full">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={useRag}
            onChange={(e) => setUseRag(e.target.checked)}
          />
          Enable RAG (Use uploaded files to answer)
        </label>
      </div>
      <h2 className="text-xl font-semibold mb-2">Upload Documents</h2>
      <input
        type="file"
        accept=".pdf,.docx,.xlsx,.txt"
        multiple
        onChange={handleFileChange}
        className="mb-2"
      />
      <ul className="text-sm text-slate-600 mb-2">
        {files.map((f, i) => (
          <li key={i}>{f.name}</li>
        ))}
      </ul>
      <div className="flex gap-2">
        <button
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
          onClick={handleUpload}
          disabled={uploading}
        >
          {uploading ? "Uploading..." : "Upload"}
        </button>
        <button
          className="bg-gray-300 px-4 py-2 rounded hover:bg-gray-400"
          onClick={handleReset}
          disabled={uploading}
        >
          Cancel
        </button>
      </div>
      {status && <div className="mt-2 text-sm text-green-600">{status}</div>}
      <div className="mt-4">
        <h3 className="font-semibold mb-1">Indexed Files:</h3>
        {uploadedFiles.length === 0 ? (
          <p className="text-sm text-gray-500">No files indexed yet.</p>
        ) : (
          <ul className="text-sm text-gray-800 list-disc list-inside">
            {uploadedFiles.map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
