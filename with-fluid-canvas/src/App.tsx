import { useEffect, useState, useCallback, useRef } from "react";
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
  
  // Audio-reactive motion state
  const [isAudioReactive, setIsAudioReactive] = useState(false);
  const [audioSensitivity, setAudioSensitivity] = useState(0.5);
  const [beatThreshold, setBeatThreshold] = useState(0.3);
  const [audioLevels, setAudioLevels] = useState({ low: 0, mid: 0, high: 0, overall: 0 });
  const [audioError, setAudioError] = useState<string | null>(null);

  // Daydream prompt state
  const [daydreamStreamId, setDaydreamStreamId] = useState("");
  const [daydreamApiKey, setDaydreamApiKey] = useState("");
  const [daydreamPrompt, setDaydreamPrompt] = useState("");
  const [isSubmittingPrompt, setIsSubmittingPrompt] = useState(false);
  const [promptStatus, setPromptStatus] = useState<string>("");

  // Prefill Daydream Stream ID from previous session if available
  useEffect(() => {
    try {
      const saved = localStorage.getItem("dd_stream_id");
      if (saved && !daydreamStreamId) {
        setDaydreamStreamId(saved);
      }
    } catch {}
  }, []);

  const handleStreamReady = (mediaStream: MediaStream) => {
    console.log("Stream ready:", mediaStream);
    setStream(mediaStream);
  };

  // Audio analysis and beat detection
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const lastBeatTimeRef = useRef(0);
  const beatHistoryRef = useRef<number[]>([]);
  const smoothedLevelsRef = useRef({ low: 0, mid: 0, high: 0, overall: 0 });

  const initAudioEngine = useCallback(() => {
    if (!audioContextRef.current) {
      try {
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
        const audioContext = new AudioContext();
        audioContextRef.current = audioContext;

        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.8;
        analyserRef.current = analyser;

        const bufferLength = analyser.frequencyBinCount;
        dataArrayRef.current = new Uint8Array(bufferLength);
      } catch (error) {
        setAudioError("Could not create audio context. Your browser might not support it.");
      }
    }

    if (audioContextRef.current && audioContextRef.current.state === "suspended") {
      audioContextRef.current.resume();
    }
  }, []);

  const analyzeAudio = useCallback(() => {
    if (!analyserRef.current || !dataArrayRef.current) {
      return;
    }

    analyserRef.current.getByteFrequencyData(dataArrayRef.current);

    const dataArray = dataArrayRef.current;
    const bufferLength = dataArray.length;

    // Calculate frequency bands
    const lowFreq = dataArray.slice(0, Math.floor(bufferLength * 0.2));
    const lowAvg = lowFreq.reduce((sum, val) => sum + val, 0) / lowFreq.length / 255;

    const midFreq = dataArray.slice(
      Math.floor(bufferLength * 0.2),
      Math.floor(bufferLength * 0.7)
    );
    const midAvg = midFreq.reduce((sum, val) => sum + val, 0) / midFreq.length / 255;

    const highFreq = dataArray.slice(Math.floor(bufferLength * 0.7));
    const highAvg = highFreq.reduce((sum, val) => sum + val, 0) / highFreq.length / 255;

    const overallVolume = dataArray.reduce((sum, val) => sum + val, 0) / bufferLength / 255;

    // Smooth the levels
    const smoothingFactor = 0.1;
    smoothedLevelsRef.current.low += (lowAvg - smoothedLevelsRef.current.low) * smoothingFactor;
    smoothedLevelsRef.current.mid += (midAvg - smoothedLevelsRef.current.mid) * smoothingFactor;
    smoothedLevelsRef.current.high += (highAvg - smoothedLevelsRef.current.high) * smoothingFactor;
    smoothedLevelsRef.current.overall += (overallVolume - smoothedLevelsRef.current.overall) * smoothingFactor;

    const levels = {
      low: smoothedLevelsRef.current.low,
      mid: smoothedLevelsRef.current.mid,
      high: smoothedLevelsRef.current.high,
      overall: smoothedLevelsRef.current.overall,
    };

    setAudioLevels(levels);

    // Beat detection - look for sudden spikes in low frequencies (bass)
    const currentTime = Date.now();
    const timeSinceLastBeat = currentTime - lastBeatTimeRef.current;
    const minBeatInterval = 200; // Minimum 200ms between beats

    if (timeSinceLastBeat > minBeatInterval) {
      // Calculate average of recent levels for comparison
      const recentLevels = beatHistoryRef.current.slice(-10);
      const avgRecentLevel = recentLevels.length > 0 
        ? recentLevels.reduce((sum, level) => sum + level, 0) / recentLevels.length 
        : 0;

      // Beat detected if current level is significantly higher than recent average
      const beatThresholdValue = beatThreshold * audioSensitivity;
      if (levels.low > avgRecentLevel + beatThresholdValue && levels.low > 0.1) {
        lastBeatTimeRef.current = currentTime;
        beatHistoryRef.current.push(levels.low);
        
        // Keep only last 20 beat levels
        if (beatHistoryRef.current.length > 20) {
          beatHistoryRef.current.shift();
        }

        // Trigger random motion on beat
        if (isAudioReactive) {
          // This will be handled by the FluidCanvas component
          window.dispatchEvent(new CustomEvent('audioBeat', { 
            detail: { 
              intensity: levels.low,
              levels: levels 
            } 
          }));
        }
      }
    }

    // Keep track of recent levels for beat detection
    beatHistoryRef.current.push(levels.low);
    if (beatHistoryRef.current.length > 20) {
      beatHistoryRef.current.shift();
    }

    return levels;
  }, [beatThreshold, audioSensitivity, isAudioReactive]);

  const startMicrophone = useCallback(async () => {
    initAudioEngine();

    if (!audioContextRef.current || !analyserRef.current) {
      setAudioError("Audio engine not initialized.");
      return;
    }

    try {
      setAudioError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      micStreamRef.current = stream;

      const source = audioContextRef.current.createMediaStreamSource(stream);
      const gainNode = audioContextRef.current.createGain();
      gainNode.gain.value = 2.0;

      source.connect(gainNode);
      gainNode.connect(analyserRef.current);

      // Start audio analysis loop
      const analyze = () => {
        analyzeAudio();
        if (isAudioReactive) {
          animationFrameRef.current = requestAnimationFrame(analyze);
        }
      };
      analyze();

    } catch (error) {
      setAudioError(
        error instanceof Error ? error.message : "Failed to access microphone"
      );
    }
  }, [initAudioEngine, analyzeAudio, isAudioReactive]);

  const stopMicrophone = useCallback(() => {
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((track) => track.stop());
      micStreamRef.current = null;
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    setAudioLevels({ low: 0, mid: 0, high: 0, overall: 0 });
  }, []);

  // Handle audio reactivity toggle
  useEffect(() => {
    if (isAudioReactive && !micStreamRef.current) {
      startMicrophone();
    } else if (!isAudioReactive && micStreamRef.current) {
      stopMicrophone();
    }
    
    // Audio reactivity state is now passed as props to FluidCanvas
  }, [isAudioReactive, startMicrophone, stopMicrophone]);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      stopMicrophone();
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, [stopMicrophone]);

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
    const envToken = import.meta.env.VITE_DAYDREAM_API_TOKEN as string | undefined;
    const inputKey = (daydreamApiKey || "").replace(/^Bearer\s+/i, "").trim();
    const token = inputKey || envToken;
    if (!token) {
      setPromptStatus("Enter an API key or set VITE_DAYDREAM_API_TOKEN.");
      return;
    }
    try {
      setIsSubmittingPrompt(true);
      // Live prompts endpoint expects the full StreamDiffusion payload
      const res = await fetch(`https://api.daydream.live/beta/streams/${encodeURIComponent(daydreamStreamId)}/prompts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          model_id: "streamdiffusion",
          pipeline: "live-video-to-video",
          params: {
            model_id: "stabilityai/sd-turbo",
            prompt: daydreamPrompt,
            prompt_interpolation_method: "slerp",
            normalize_prompt_weights: true,
            normalize_seed_weights: true,
            negative_prompt: "blurry, low quality, flat, 2d",
            num_inference_steps: 50,
            seed: 42,
            t_index_list: [0, 8, 17],
            controlnets: [
              { preprocessor: "pose_tensorrt", conditioning_scale: 0, model_id: "thibaud/controlnet-sd21-openpose-diffusers", control_guidance_end: 1, control_guidance_start: 0, enabled: true, preprocessor_params: {} },
              { preprocessor: "soft_edge", conditioning_scale: 0, model_id: "thibaud/controlnet-sd21-hed-diffusers", control_guidance_end: 1, control_guidance_start: 0, enabled: true, preprocessor_params: {} },
              { preprocessor: "canny", conditioning_scale: 0, model_id: "thibaud/controlnet-sd21-canny-diffusers", control_guidance_end: 1, control_guidance_start: 0, enabled: true, preprocessor_params: { low_threshold: 100, high_threshold: 200 } },
              { preprocessor: "depth_tensorrt", conditioning_scale: 0, model_id: "thibaud/controlnet-sd21-depth-diffusers", control_guidance_end: 1, control_guidance_start: 0, enabled: true, preprocessor_params: {} },
              { preprocessor: "passthrough", conditioning_scale: 0, model_id: "thibaud/controlnet-sd21-color-diffusers", control_guidance_end: 1, control_guidance_start: 0, enabled: true, preprocessor_params: {} },
            ],
          },
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

            {/* Audio-Reactive Motion Control */}
            <div className="border-t border-gray-700 pt-4 mt-4">
              <h3 className="text-lg font-semibold mb-3">🎵 Audio-Reactive Motion</h3>
              
              <button
                onClick={() => setIsAudioReactive(!isAudioReactive)}
                className={`w-full py-2 px-4 rounded font-medium transition-colors ${
                  isAudioReactive
                    ? "bg-red-600 hover:bg-red-700"
                    : "bg-blue-600 hover:bg-blue-700"
                }`}
              >
                {isAudioReactive ? "Stop Audio Reactivity" : "Start Audio Reactivity"}
              </button>
              
              {audioError && (
                <p className="text-xs text-red-400 mt-2">{audioError}</p>
              )}
              
              {isAudioReactive && (
                <div className="mt-4 space-y-3">
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Audio Sensitivity: {audioSensitivity.toFixed(1)}
                    </label>
                    <input
                      type="range"
                      min="0.1"
                      max="2.0"
                      step="0.1"
                      value={audioSensitivity}
                      onChange={(e) => setAudioSensitivity(Number(e.target.value))}
                      className="w-full"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Beat Threshold: {beatThreshold.toFixed(1)}
                    </label>
                    <input
                      type="range"
                      min="0.1"
                      max="1.0"
                      step="0.1"
                      value={beatThreshold}
                      onChange={(e) => setBeatThreshold(Number(e.target.value))}
                      className="w-full"
                    />
                  </div>
                  
                  {/* Audio Level Visualization */}
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs text-gray-400">
                      <span>Low</span>
                      <span>Mid</span>
                      <span>High</span>
                      <span>Overall</span>
                    </div>
                    <div className="flex space-x-1">
                      <div className="flex-1 bg-gray-800 rounded h-2">
                        <div 
                          className="bg-green-500 h-full rounded transition-all duration-100"
                          style={{ width: `${audioLevels.low * 100}%` }}
                        />
                      </div>
                      <div className="flex-1 bg-gray-800 rounded h-2">
                        <div 
                          className="bg-yellow-500 h-full rounded transition-all duration-100"
                          style={{ width: `${audioLevels.mid * 100}%` }}
                        />
                      </div>
                      <div className="flex-1 bg-gray-800 rounded h-2">
                        <div 
                          className="bg-red-500 h-full rounded transition-all duration-100"
                          style={{ width: `${audioLevels.high * 100}%` }}
                        />
                      </div>
                      <div className="flex-1 bg-gray-800 rounded h-2">
                        <div 
                          className="bg-blue-500 h-full rounded transition-all duration-100"
                          style={{ width: `${audioLevels.overall * 100}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}
              
              <p className="text-xs text-gray-400 mt-2">
                When active, random motion and mouse interactions will sync to the beat of audio from your microphone
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
                  autoGenerateSplats={isRandomMotionActive && !isAudioReactive}
                  initialSplatCount={isRandomMotionActive ? 3 : 5}
                  randomSplatsIntervalMs={isRandomMotionActive && !isAudioReactive ? 800 : 0}
                  isAudioReactive={isAudioReactive}
                  audioLevels={audioLevels}
                />
                </div>
              </div>
              <div className="mt-4 text-center text-gray-400">
                <p>Click and drag to create fluid effects • Use Random Motion for automated effects • Enable Audio Reactivity to sync with music beats</p>
                {isAudioReactive && (
                  <p className="text-xs text-blue-400 mt-2 animate-pulse">
                    🎵 Audio reactivity active - mouse interactions enhanced by music!
                  </p>
                )}
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
                <label className="block text-sm font-medium mb-1">API Key</label>
                <input
                  type="password"
                  value={daydreamApiKey}
                  onChange={(e) => setDaydreamApiKey(e.target.value)}
                  placeholder="Paste API key or use VITE_DAYDREAM_API_TOKEN"
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
                Uses API Key from input or VITE_DAYDREAM_API_TOKEN env.
              </p>
            </div>
          </div>

          {/* Right: Stream player + controls */}
          <div className="space-y-4">
            <StreamRender onStreamIdChange={(id) => {
              const v = id ?? "";
              setDaydreamStreamId(v);
              try {
                if (v) localStorage.setItem("dd_stream_id", v);
                else localStorage.removeItem("dd_stream_id");
              } catch {}
            }} />
          </div>
        </div>
      </div>
    </div>
  );
}
