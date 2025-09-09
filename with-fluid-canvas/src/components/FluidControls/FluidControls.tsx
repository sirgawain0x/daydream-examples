import { useState, useCallback, useRef, useEffect } from "react";
import { FluidCanvas } from "../FluidCanvas";

interface FluidControlsProps {
  onStreamReady?: (stream: MediaStream) => void;
  className?: string;
}

export function FluidControls({ onStreamReady, className = "" }: FluidControlsProps) {
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

    const overallAvg = dataArray.reduce((sum, val) => sum + val, 0) / bufferLength / 255;

    // Smooth the levels
    const smoothingFactor = 0.1;
    smoothedLevelsRef.current = {
      low: smoothedLevelsRef.current.low * (1 - smoothingFactor) + lowAvg * smoothingFactor,
      mid: smoothedLevelsRef.current.mid * (1 - smoothingFactor) + midAvg * smoothingFactor,
      high: smoothedLevelsRef.current.high * (1 - smoothingFactor) + highAvg * smoothingFactor,
      overall: smoothedLevelsRef.current.overall * (1 - smoothingFactor) + overallAvg * smoothingFactor,
    };

    setAudioLevels(smoothedLevelsRef.current);

    // Beat detection
    const currentTime = Date.now();
    const timeSinceLastBeat = currentTime - lastBeatTimeRef.current;
    const minBeatInterval = 200; // Minimum 200ms between beats

    if (timeSinceLastBeat > minBeatInterval) {
      const bassLevel = smoothedLevelsRef.current.low;
      const kickThreshold = beatThreshold * audioSensitivity;

      if (bassLevel > kickThreshold) {
        lastBeatTimeRef.current = currentTime;
        beatHistoryRef.current.push(currentTime);
        
        // Keep only recent beats (last 2 seconds)
        beatHistoryRef.current = beatHistoryRef.current.filter(
          (time) => currentTime - time < 2000
        );
      }
    }
  }, [beatThreshold, audioSensitivity]);

  const startAudioAnalysis = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    const loop = () => {
      analyzeAudio();
      animationFrameRef.current = requestAnimationFrame(loop);
    };

    animationFrameRef.current = requestAnimationFrame(loop);
  }, [analyzeAudio]);

  const stopAudioAnalysis = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  }, []);

  const startMicrophone = useCallback(async () => {
    try {
      setAudioError(null);
      initAudioEngine();

      if (!audioContextRef.current || !analyserRef.current) {
        setAudioError("Audio engine not initialized");
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;

      const source = audioContextRef.current.createMediaStreamSource(stream);
      source.connect(analyserRef.current);

      startAudioAnalysis();
    } catch (error) {
      setAudioError("Could not access microphone. Please check permissions.");
    }
  }, [initAudioEngine, startAudioAnalysis]);

  const stopMicrophone = useCallback(() => {
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((track) => track.stop());
      micStreamRef.current = null;
    }
    stopAudioAnalysis();
  }, [stopAudioAnalysis]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopMicrophone();
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, [stopMicrophone]);

  const handleStreamReady = (mediaStream: MediaStream) => {
    console.log("Stream ready:", mediaStream);
    setStream(mediaStream);
    onStreamReady?.(mediaStream);
  };

  const applyPreset = useCallback((preset: string) => {
    switch (preset) {
      case "Light Paint":
        setSelectedColor("#FFD700");
        setSplatForce(8000);
        setCurl(25);
        setVelocityDissipation(0.9);
        setGlow(1.5);
        break;
      case "Nebula":
        setSelectedColor("#8A2BE2");
        setSplatForce(15000);
        setCurl(35);
        setVelocityDissipation(0.7);
        setGlow(2.2);
        break;
      case "Liquid Metal":
        setSelectedColor("#C0C0C0");
        setSplatForce(25000);
        setCurl(12);
        setVelocityDissipation(0.8);
        setGlow(1.8);
        break;
      case "Bubblegum":
        setSelectedColor("#FF69B4");
        setSplatForce(12000);
        setCurl(40);
        setVelocityDissipation(0.75);
        setGlow(2.0);
        break;
    }
  }, []);

  const randomizeFluid = useCallback(() => {
    const colors = ["#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4", "#FFEAA7", "#DDA0DD", "#98D8C8", "#F7DC6F"];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];
    
    setSelectedColor(randomColor);
    setSplatForce(Math.floor(Math.random() * 40000) + 5000);
    setCurl(Math.floor(Math.random() * 50) + 10);
    setVelocityDissipation(Math.random() * 0.5 + 0.5);
    setGlow(Math.random() * 2 + 0.5);
  }, []);

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Preset chips */}
      <div className="flex flex-wrap items-center gap-2">
        {["Light Paint", "Nebula", "Liquid Metal", "Bubblegum"].map((p) => (
          <button
            key={p}
            onClick={() => applyPreset(p)}
            className="px-3 py-1.5 rounded-full text-xs font-medium border border-gray-700 bg-gray-800 hover:border-gray-600 hover:bg-gray-700 transition-colors cursor-pointer"
          >
            {p}
          </button>
        ))}
        <button
          onClick={randomizeFluid}
          className="px-3 py-1.5 rounded-full text-xs font-semibold border border-pink-600/40 bg-pink-600/10 text-pink-200 hover:bg-pink-600/20 transition-colors cursor-pointer"
        >
          Surprise me
        </button>
      </div>

      {/* Fluid Controls */}
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
            className="w-full cursor-pointer"
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
            className="w-full cursor-pointer"
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
            className="w-full cursor-pointer"
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
            className="w-full cursor-pointer"
          />
        </div>

        {/* Simple Random Motion Control */}
        <div className="border-t border-gray-700 pt-4 mt-4">
          <h3 className="text-lg font-semibold mb-3">Random Motion</h3>
          
          <button
            onClick={() => setIsRandomMotionActive(!isRandomMotionActive)}
            className={`w-full py-2 px-4 rounded font-medium transition-colors cursor-pointer ${
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
            onClick={() => {
              if (isAudioReactive) {
                setIsAudioReactive(false);
                stopMicrophone();
              } else {
                setIsAudioReactive(true);
                startMicrophone();
              }
            }}
            className={`w-full py-2 px-4 rounded font-medium transition-colors cursor-pointer ${
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
                  className="w-full cursor-pointer"
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
                  className="w-full cursor-pointer"
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
    </div>
  );
}
