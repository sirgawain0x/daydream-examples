import { useState } from "react";
import { FluidCanvas } from "./components/FluidCanvas";
import StreamRender from "./components/StreamRender";

export default function App() {
  const [selectedColor, setSelectedColor] = useState<string>("#FFA500");
  const [splatForce, setSplatForce] = useState(1000);
  const [curl, setCurl] = useState(18);
  const [velocityDissipation, setVelocityDissipation] = useState(0.86);
  const [glow, setGlow] = useState(2);
  const [stream, setStream] = useState<MediaStream | null>(null);
  
  // Simple random motion state
  const [isRandomMotionActive, setIsRandomMotionActive] = useState(false);

  // Daydream prompt state
  const [daydreamStreamId, setDaydreamStreamId] = useState("");
  const [daydreamPrompt, setDaydreamPrompt] = useState("");
  const [isSubmittingPrompt, setIsSubmittingPrompt] = useState(false);
  const [promptStatus, setPromptStatus] = useState<string>("");

  const handleStreamReady = (mediaStream: MediaStream) => {
    console.log("Stream ready:", mediaStream);
    setStream(mediaStream);
  };

  // Fun UI helpers
  function getRandomHexColor() {
    const r = Math.floor(100 + Math.random() * 155);
    const g = Math.floor(100 + Math.random() * 155);
    const b = Math.floor(100 + Math.random() * 155);
    return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
  }

  function randomizeFluid() {
    setSelectedColor(getRandomHexColor());
    setSplatForce(Math.floor(2000 + Math.random() * 30000));
    setCurl(Math.floor(5 + Math.random() * 60));
    setVelocityDissipation(Number((0.6 + Math.random() * 0.35).toFixed(2)));
    setGlow(Number((0.5 + Math.random() * 1.8).toFixed(1)));
  }

  function applyPreset(name: string) {
    switch (name) {
      case "Light Paint":
        setSelectedColor("#ffd166");
        setSplatForce(12000);
        setCurl(18);
        setVelocityDissipation(0.74);
        setGlow(1.4);
        break;
      case "Nebula":
        setSelectedColor("#8ec5ff");
        setSplatForce(22000);
        setCurl(28);
        setVelocityDissipation(0.82);
        setGlow(2.0);
        break;
      case "Liquid Metal":
        setSelectedColor("#a3a3a3");
        setSplatForce(30000);
        setCurl(50);
        setVelocityDissipation(0.9);
        setGlow(1.1);
        break;
      case "Bubblegum":
        setSelectedColor("#ff6fb8");
        setSplatForce(14000);
        setCurl(22);
        setVelocityDissipation(0.78);
        setGlow(1.8);
        break;
      default:
        randomizeFluid();
    }
  }

  async function handleSubmitPrompt() {
    setPromptStatus("");
    if (!daydreamStreamId.trim()) {
      setPromptStatus("Enter a Stream ID.");
      return;
    }
    if (!daydreamPrompt.trim()) {
      setPromptStatus("Enter a prompt.");
      return;
    }
    const token = import.meta.env.VITE_DAYDREAM_API_TOKEN as string | undefined;
    const endpoint = (import.meta.env.VITE_DAYDREAM_PROMPT_ENDPOINT as string | undefined) || "https://api.daydream.dev/streamdiffusion/prompt";
    if (!token) {
      setPromptStatus("Missing VITE_DAYDREAM_API_TOKEN in env.");
      return;
    }
    try {
      setIsSubmittingPrompt(true);
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          streamId: daydreamStreamId,
          prompt: daydreamPrompt,
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }
      setPromptStatus("Prompt submitted.");
    } catch (err: any) {
      setPromptStatus(`Error: ${err?.message || String(err)}`);
    } finally {
      setIsSubmittingPrompt(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="container mx-auto p-4">
        {/* Playful gradient header */}
        <div className="mb-6 rounded-xl border border-gray-800 bg-gradient-to-r from-indigo-600/20 via-fuchsia-600/10 to-emerald-500/20 px-4 py-3">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Creative Video Playground</h1>
              <p className="text-sm text-gray-300">Fluid Canvas × StreamDiffusion — live, side‑by‑side</p>
            </div>
            <button
              onClick={randomizeFluid}
              className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium bg-gradient-to-r from-pink-500 to-violet-600 hover:from-pink-500/90 hover:to-violet-600/90 focus:outline-none focus:ring-2 focus:ring-pink-400/40"
              aria-label="Randomize fluid settings"
            >
              <span>Randomize ✨</span>
            </button>
          </div>
        </div>

        {/* Two-column layout inspired by dashboard split view */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left: Fluid controls + canvas */}
          <div className="space-y-6">
            {/* Preset chips */}
            <div className="flex flex-wrap items-center gap-2">
              {["Light Paint", "Nebula", "Liquid Metal", "Bubblegum"].map((p) => (
                <button
                  key={p}
                  onClick={() => applyPreset(p)}
                  className="px-3 py-1.5 rounded-full text-xs font-medium border border-gray-700 bg-gray-800 hover:border-gray-600 hover:bg-gray-700"
                >
                  {p}
                </button>
              ))}
              <button
                onClick={randomizeFluid}
                className="px-3 py-1.5 rounded-full text-xs font-semibold border border-pink-600/40 bg-pink-600/10 text-pink-200 hover:bg-pink-600/20"
              >
                Surprise me
              </button>
            </div>
            <div className="space-y-4 rounded-xl border border-gray-800 bg-gray-900/70 p-4">
            <div>
              <label className="block text-sm font-medium mb-2">Color</label>
              <input
                type="color"
                value={selectedColor}
                onChange={(e) => setSelectedColor(e.target.value)}
                className="w-full h-10 rounded cursor-pointer"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Splat Force: {splatForce}
              </label>
              <input
                type="range"
                min="1000"
                max="50000"
                value={splatForce}
                onChange={(e) => setSplatForce(Number(e.target.value))}
                className="w-full"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Curl: {curl}
              </label>
              <input
                type="range"
                min="0"
                max="100"
                value={curl}
                onChange={(e) => setCurl(Number(e.target.value))}
                className="w-full"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Velocity Dissipation: {velocityDissipation}
              </label>
              <input
                type="range"
                min="0.01"
                max="1.0"
                step="0.01"
                value={velocityDissipation}
                onChange={(e) => setVelocityDissipation(Number(e.target.value))}
                className="w-full"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Glow: {glow}
              </label>
              <input
                type="range"
                min="0.0"
                max="2.4"
                step="0.1"
                value={glow}
                onChange={(e) => setGlow(Number(e.target.value))}
                className="w-full"
              />
            </div>


            {/* Simple Random Motion Control */}
            <div className="border-t border-gray-700 pt-4 mt-4">
              <h3 className="text-lg font-semibold mb-3">Random Motion</h3>
              
              <button
                onClick={() => setIsRandomMotionActive(!isRandomMotionActive)}
                className={`w-full py-2 px-4 rounded font-medium transition-colors ${
                  isRandomMotionActive
                    ? "bg-red-600 hover:bg-red-700"
                    : "bg-green-600 hover:bg-green-700"
                }`}
              >
                {isRandomMotionActive ? "Stop Random Motion" : "Start Random Motion"}
              </button>
              
              <p className="text-xs text-gray-400 mt-2">
                When active, the canvas will continuously generate random fluid effects
              </p>
            </div>

            <div className="text-sm text-gray-400">
              <p>Stream Status: {stream ? "Active" : "Inactive"}</p>
              {stream && <p>Tracks: {stream.getTracks().length}</p>}
            </div>
            </div>

            {/* Canvas */}
            <div className="">
              <div className="relative aspect-square w-full max-w-xl mx-auto rounded-xl overflow-hidden">
                <div className="pointer-events-none absolute -inset-0.5 rounded-2xl bg-[radial-gradient(circle_at_30%_20%,rgba(168,85,247,.25),transparent_45%),radial-gradient(circle_at_70%_80%,rgba(20,184,166,.25),transparent_45%)] blur-md" />
                <div className="relative bg-black rounded-xl overflow-hidden">
                <FluidCanvas
                  onStreamReady={handleStreamReady}
                  selectedColor={selectedColor}
                  splatForce={splatForce}
                  curl={curl}
                  width={1024}
                  height={1024}
                  velocityDissipation={velocityDissipation}
                  glow={glow}
                  fps={30}
                  enableBloom={true}
                  bloomIntensity={0.5}
                  enableSunrays={true}
                  autoGenerateSplats={isRandomMotionActive}
                  initialSplatCount={isRandomMotionActive ? 3 : 5}
                  randomSplatsIntervalMs={isRandomMotionActive ? 800 : 0}
                />
                </div>
              </div>
              <div className="mt-4 text-center text-gray-400">
                <p>Click and drag to create fluid effects • Use Random Motion for automated effects</p>
              </div>
            </div>

            {/* Daydream Prompt */}
            <div className="border-t border-gray-700 pt-4 mt-4 space-y-3">
              <h3 className="text-lg font-semibold">AI Generation (Daydream)</h3>
              <div>
                <label className="block text-sm font-medium mb-1">Stream ID</label>
                <input
                  type="text"
                  value={daydreamStreamId}
                  onChange={(e) => setDaydreamStreamId(e.target.value)}
                  placeholder="stream_123..."
                  className="w-full rounded bg-gray-800 border border-gray-700 px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Prompt</label>
                <textarea
                  value={daydreamPrompt}
                  onChange={(e) => setDaydreamPrompt(e.target.value)}
                  placeholder="Describe what to generate..."
                  rows={3}
                  className="w-full rounded bg-gray-800 border border-gray-700 px-3 py-2"
                />
              </div>
              <button
                onClick={handleSubmitPrompt}
                disabled={isSubmittingPrompt}
                className={`w-full py-2 px-4 rounded font-medium transition-colors ${
                  isSubmittingPrompt ? "bg-gray-700" : "bg-indigo-600 hover:bg-indigo-700"
                }`}
              >
                {isSubmittingPrompt ? "Submitting..." : "Submit Prompt"}
              </button>
              {promptStatus && (
                <p className="text-xs text-gray-400">{promptStatus}</p>
              )}
              <p className="text-[11px] text-gray-500">
                Uses VITE_DAYDREAM_API_TOKEN and optional VITE_DAYDREAM_PROMPT_ENDPOINT.
              </p>
            </div>
          </div>

          {/* Right: Stream player + controls */}
          <div className="space-y-4">
            <StreamRender />
          </div>
        </div>
      </div>
    </div>
  );
}
