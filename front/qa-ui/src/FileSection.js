import React, { useState, useEffect, useRef } from "react";

export default function FileSection({ useRag, setUseRag }) {
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState("");
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const fileInputRef = useRef(null);

  useEffect(() => {
    fetchUploadedFiles();
  }, []);

  const fetchUploadedFiles = async () => {
    try {
      const res = await fetch("http://localhost:8000/uploaded-files");
      const data = await res.json();
      if (data.files) setUploadedFiles(data.files);
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
      await fetchUploadedFiles();
    } catch (e) {
      console.error("Upload failed:", e);
      setStatus("Upload failed");
    }

    setFiles([]);
    if (fileInputRef.current) {
    fileInputRef.current.value = "";
  }
    setUploading(false);
  };

  const handleReset = () => {
    setFiles([]);
    setStatus("");
    if (fileInputRef.current) {
    fileInputRef.current.value = "";
  }
  };

  const handleRemoveFile = async (filename) => {
    try {
      const res = await fetch(`http://localhost:8000/delete-file`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename }),
      });

      const data = await res.json();
      if (data.success) {
        setUploadedFiles((prev) => prev.filter((f) => f !== filename));
      } else {
        console.error("Failed to delete:", data.error);
      }
    } catch (e) {
      console.error("Delete failed:", e);
    }
  };

  return (
    <div className="space-y-6">
      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input
          type="checkbox"
          checked={useRag}
          onChange={(e) => setUseRag(e.target.checked)}
          className="w-4 h-4 accent-blue-600"
        />
        <span className="font-medium">Enable RAG (Use uploaded files)</span>
      </label>

      <div className="bg-white rounded-xl shadow p-4 space-y-4">
        <h2 className="text-lg font-semibold text-gray-800">Upload Documents</h2>
        <input
          type="file"
          accept=".pdf,.docx,.xlsx,.txt"
          multiple
          onChange={handleFileChange}
          ref={fileInputRef}
          className="file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
        />

        {files.length > 0 && (
          <ul className="text-sm text-gray-600 space-y-1">
            {files.map((f, i) => (
              <li key={i} className="truncate">{f.name}</li>
            ))}
          </ul>
        )}

        <div className="flex gap-2">
          <button
            onClick={handleUpload}
            disabled={uploading}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg shadow hover:bg-blue-700 disabled:opacity-50"
          >
            {uploading ? "Uploading..." : "Upload"}
          </button>
          <button
            onClick={handleReset}
            disabled={uploading}
            className="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-300"
          >
            Cancel
          </button>
        </div>

        {status && <p className="text-sm text-green-600">{status}</p>}
      </div>

      <div className="bg-white rounded-xl shadow p-4">
        <h3 className="font-semibold text-gray-800 mb-2">Indexed Files:</h3>
        {uploadedFiles.length === 0 ? (
          <p className="text-sm text-gray-500">No files indexed yet.</p>
        ) : (
          <ul className="space-y-1 text-sm text-gray-700">
            {uploadedFiles.map((f, i) => (
              <li key={i} className="flex justify-between items-center">
                {f}
                <button
                  onClick={() => handleRemoveFile(f)}
                  className="text-red-500 hover:text-red-700 text-sm ml-2"
                  title="Remove"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
