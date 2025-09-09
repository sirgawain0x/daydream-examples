import { useEffect, useState } from "react";
import StreamRender from "./components/StreamRender";

export default function App() {
  // Daydream state for StreamRender integration
  const [daydreamStreamId, setDaydreamStreamId] = useState("");
  const [daydreamApiKey] = useState("");
  const [daydreamPrompt, setDaydreamPrompt] = useState("");

  // Prefill Daydream Stream ID from previous session if available
  useEffect(() => {
    try {
      const saved = localStorage.getItem("dd_stream_id");
      if (saved && !daydreamStreamId) {
        setDaydreamStreamId(saved);
      }
    } catch {}
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black text-white">
      <div className="container mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent mb-2">
            Creative PixelPlay AI
          </h1>
          <p className="text-gray-400">
            Transform your world in real-time.
          </p>
        </div>

        {/* Main StreamRender component with integrated fluid controls */}
        <StreamRender 
          streamId={daydreamStreamId}
          apiKey={daydreamApiKey}
          prompt={daydreamPrompt}
          onStreamIdChange={(id) => {
            const v = id ?? "";
            setDaydreamStreamId(v);
            try {
              if (v) localStorage.setItem("dd_stream_id", v);
              else localStorage.removeItem("dd_stream_id");
            } catch {}
          }}
          onPromptChange={(prompt) => setDaydreamPrompt(prompt)}
        />

      </div>
    </div>
  );
}