import { useCallback, useEffect, useRef, useState } from "react";

type ControlNet = {
  name?: string;
  preprocessor: string;
  conditioning_scale: number;
  model_id: string;
  control_guidance_end?: number;
  control_guidance_start?: number;
  enabled?: boolean;
  preprocessor_params?: Record<string, unknown>;
};

type StreamParams = {
  model_id: string;
  pipeline: string;
  params: {
    model_id: string;
    prompt: string;
    prompt_interpolation_method: string;
    normalize_prompt_weights: boolean;
    normalize_seed_weights: boolean;
    negative_prompt: string;
    num_inference_steps: number;
    seed: number;
    t_index_list: number[];
    controlnets: ControlNet[];
  };
};

const API_BASE_URL = "https://api.daydream.live";

export function StreamRender() {
  const [isStreaming, setIsStreaming] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [streamId, setStreamId] = useState<string | null>(null);
  const [whipUrl, setWhipUrl] = useState<string | null>(null);
  const [playbackId, setPlaybackId] = useState<string | null>(null);

  const apiKeyRef = useRef<HTMLInputElement | null>(null);
  const pipelineIdRef = useRef<HTMLInputElement | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const outputContainerRef = useRef<HTMLDivElement | null>(null);
  const outputPlaceholderRef = useRef<HTMLDivElement | null>(null);

  const localStreamRef = useRef<MediaStream | null>(null);
  const rtcPeerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Audio input + analysis state (lightweight, no extra deps)
  const [isMicActive, setIsMicActive] = useState(false);
  const [isDemoPlaying, setIsDemoPlaying] = useState(false);
  const [audioReactivity, setAudioReactivity] = useState(0.5);
  const [audioLevel, setAudioLevel] = useState(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioRafRef = useRef<number | null>(null);
  const audioSourceRef = useRef<MediaStreamAudioSourceNode | MediaElementAudioSourceNode | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);

  // Speech recognition state (Web Speech API)
  const [isRecognizing, setIsRecognizing] = useState(false);
  const [recognizedText, setRecognizedText] = useState("");
  const [recognitionLang, setRecognitionLang] = useState("en-US");
  const [fontFamily, setFontFamily] = useState("Arial, Helvetica, sans-serif");
  const [fontSize, setFontSize] = useState<number>(24);
  const [textOpacity, setTextOpacity] = useState<number>(0.9);
  const [showOverlay, setShowOverlay] = useState(true);
  const recognitionRef = useRef<any>(null);

  const [params, setParams] = useState<StreamParams>({
    model_id: "streamdiffusion",
    pipeline: "live-video-to-video",
    params: {
      model_id: "stabilityai/sd-turbo",
      prompt: "green slimey monster",
      prompt_interpolation_method: "slerp",
      normalize_prompt_weights: true,
      normalize_seed_weights: true,
      negative_prompt: "blurry, low quality, flat, 2d",
      num_inference_steps: 50,
      seed: 42,
      t_index_list: [0, 8, 17],
      controlnets: [
        { name: "Pose Estimation", preprocessor: "pose_tensorrt", conditioning_scale: 0, model_id: "thibaud/controlnet-sd21-openpose-diffusers" },
        { name: "Soft Edges (HED)", preprocessor: "soft_edge", conditioning_scale: 0, model_id: "thibaud/controlnet-sd21-hed-diffusers" },
        { name: "Sharp Edges (Canny)", preprocessor: "canny", conditioning_scale: 0, model_id: "thibaud/controlnet-sd21-canny-diffusers" },
        { name: "Depth Estimation", preprocessor: "depth_tensorrt", conditioning_scale: 0, model_id: "thibaud/controlnet-sd21-depth-diffusers" },
        { name: "Color Preservation", preprocessor: "passthrough", conditioning_scale: 0, model_id: "thibaud/controlnet-sd21-color-diffusers" },
      ].map((cn) => ({ ...cn, control_guidance_end: 1, control_guidance_start: 0, enabled: true, preprocessor_params: {} })),
    },
  });

  const setStatusWithLoading = useCallback((message: string) => {
    setStatus(message);
    setError(null);
  }, []);

  const mountPlayerIframe = useCallback((id: string | null) => {
    const container = outputContainerRef.current;
    if (!container) return;
    container.innerHTML = "";
    if (!id) {
      if (outputPlaceholderRef.current) container.appendChild(outputPlaceholderRef.current);
      return;
    }
    const iframe = document.createElement("iframe");
    iframe.allow = "autoplay; fullscreen; picture-in-picture; clipboard-write";
    iframe.referrerPolicy = "origin";
    iframe.style.width = "100%";
    iframe.style.height = "320px";
    iframe.src = `https://lvpr.tv/?v=${encodeURIComponent(id)}&lowLatency=force`;
    container.appendChild(iframe);
  }, []);

  const startWhipClient = useCallback(async () => {
    if (!whipUrl || !localStreamRef.current) return;
    const apiKey = apiKeyRef.current?.value.trim() || "";
    const rtcPeerConnection = new RTCPeerConnection();
    rtcPeerConnectionRef.current = rtcPeerConnection;
    localStreamRef.current.getVideoTracks().forEach((track) => {
      rtcPeerConnection.addTrack(track, localStreamRef.current!);
    });
    const offer = await rtcPeerConnection.createOffer();
    await rtcPeerConnection.setLocalDescription(offer);
    const whipResponse = await fetch(whipUrl, {
      method: "POST",
      headers: { "Content-Type": "application/sdp", Authorization: `Bearer ${apiKey}` },
      body: rtcPeerConnection.localDescription?.sdp || "",
    });
    if (whipResponse.status !== 201) {
      throw new Error(`WHIP connection failed with status: ${whipResponse.status}`);
    }
    const answerSdp = await whipResponse.text();
    await rtcPeerConnection.setRemoteDescription({ type: "answer", sdp: answerSdp });
  }, [whipUrl]);

  const updateApiParams = useCallback(async () => {
    if (!streamId) return;
    setStatusWithLoading("Updating params...");
    try {
      const apiKey = apiKeyRef.current?.value.trim() || "";
      const payload: StreamParams = JSON.parse(JSON.stringify(params));
      payload.params.controlnets.forEach((cn) => delete cn.name);
      const response = await fetch(`${API_BASE_URL}/beta/streams/${streamId}/prompts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(`API Error: ${error.message || response.statusText}`);
      }
      setStatusWithLoading("Streaming live!");
    } catch (e: any) {
      setError(e?.message || "Unknown error");
      setStatusWithLoading(`Update failed: ${e?.message || "Unknown error"}`);
    }
  }, [params, setStatusWithLoading, streamId]);

  const startStream = useCallback(async () => {
    const apiKey = apiKeyRef.current?.value.trim() || "";
    const pipelineId = pipelineIdRef.current?.value.trim() || "";
    if (!apiKey) { setError("Enter your API key."); return; }
    if (!pipelineId) { setError("Enter a pipeline id."); return; }
    setStatusWithLoading("Starting stream...");
    try {
      const response = await fetch(`${API_BASE_URL}/v1/streams`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ pipeline_id: pipelineId }),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(`API Error: ${error.message || response.statusText}`);
      }
      const streamData = await response.json();
      setStreamId(streamData.id);
      setWhipUrl(streamData.whip_url);
      setPlaybackId(streamData.output_playback_id);

      const media = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      localStreamRef.current = media;
      if (localVideoRef.current) localVideoRef.current.srcObject = media;

      await startWhipClient();
      mountPlayerIframe(streamData.output_playback_id);
      setIsStreaming(true);
      setStatusWithLoading("Streaming live!");
      await updateApiParams();
    } catch (e: any) {
      setError(e?.message || "Unknown error");
      setStatusWithLoading(`Error: ${e?.message || "Unknown error"}`);
      await stopStream();
    }
  }, [mountPlayerIframe, setStatusWithLoading, startWhipClient, updateApiParams]);

  const stopStream = useCallback(async () => {
    setStatusWithLoading("Stopping...");
    try {
      if (rtcPeerConnectionRef.current) {
        try { rtcPeerConnectionRef.current.close(); } catch {}
        rtcPeerConnectionRef.current = null;
      }
      if (localStreamRef.current) {
        try { localStreamRef.current.getTracks().forEach((t) => t.stop()); } catch {}
        localStreamRef.current = null;
      }
    } finally {
      setIsStreaming(false);
      setStreamId(null);
      setWhipUrl(null);
      setPlaybackId(null);
      mountPlayerIframe(null);
      setStatusWithLoading("");
    }
  }, [mountPlayerIframe, setStatusWithLoading]);

  const handleParamChange = useCallback((key: keyof StreamParams["params"], value: any) => {
    setParams((prev) => ({ ...prev, params: { ...prev.params, [key]: value } }));
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => { if (isStreaming) updateApiParams(); }, 350);
  }, [isStreaming, updateApiParams]);

  const handleControlNetChange = useCallback((index: number, value: number) => {
    setParams((prev) => ({
      ...prev,
      params: {
        ...prev.params,
        controlnets: prev.params.controlnets.map((cn, i) => i === index ? { ...cn, conditioning_scale: value } : cn),
      },
    }));
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => { if (isStreaming) updateApiParams(); }, 350);
  }, [isStreaming, updateApiParams]);

  const handleDenoiseIndexChange = useCallback((index: number, value: number) => {
    setParams((prev) => ({
      ...prev,
      params: {
        ...prev.params,
        t_index_list: prev.params.t_index_list.map((v, i) => (i === index ? value : v)),
      },
    }));
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => { if (isStreaming) updateApiParams(); }, 350);
  }, [isStreaming, updateApiParams]);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      stopStream();
    };
  }, [stopStream]);

  // --- Audio input helpers ---
  const stopAudioProcessing = useCallback(() => {
    if (audioRafRef.current) {
      cancelAnimationFrame(audioRafRef.current);
      audioRafRef.current = null;
    }
    try { audioSourceRef.current?.disconnect(); } catch {}
    audioSourceRef.current = null;
    try { analyserRef.current?.disconnect(); } catch {}
    analyserRef.current = null;
    if (audioContextRef.current) {
      try { audioContextRef.current.close(); } catch {}
      audioContextRef.current = null;
    }
  }, []);

  const analyzeAudioLoop = useCallback(() => {
    if (!analyserRef.current) return;
    const analyser = analyserRef.current;
    const data = new Uint8Array(analyser.fftSize);
    const tick = () => {
      analyser.getByteTimeDomainData(data);
      // Compute RMS
      let sumSquares = 0;
      for (let i = 0; i < data.length; i++) {
        const v = (data[i] - 128) / 128;
        sumSquares += v * v;
      }
      const rms = Math.sqrt(sumSquares / data.length);
      setAudioLevel(rms);
      audioRafRef.current = requestAnimationFrame(tick);
    };
    tick();
  }, []);

  const setupAnalyser = useCallback((ctx: AudioContext, source: MediaStreamAudioSourceNode | MediaElementAudioSourceNode) => {
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    source.connect(analyser);
    analyserRef.current = analyser;
    analyzeAudioLoop();
  }, [analyzeAudioLoop]);

  const startMicrophone = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = ctx;
      const src = ctx.createMediaStreamSource(stream);
      audioSourceRef.current = src;
      setupAnalyser(ctx, src);
      setIsMicActive(true);
      setIsDemoPlaying(false);
    } catch (e: any) {
      setError(e?.message || "Microphone error");
    }
  }, [setupAnalyser, setError]);

  const stopMicrophone = useCallback(() => {
    setIsMicActive(false);
    stopAudioProcessing();
  }, [stopAudioProcessing]);

  const stopDemoAudio = useCallback(() => {
    if (audioElRef.current) {
      try { audioElRef.current.pause(); } catch {}
      const prevSrc = audioElRef.current.src;
      try { audioElRef.current.removeAttribute("src"); } catch {}
      try { audioElRef.current.load?.(); } catch {}
      if (prevSrc && prevSrc.startsWith("blob:")) {
        try { URL.revokeObjectURL(prevSrc); } catch {}
      }
      audioElRef.current = null;
    }
    setIsDemoPlaying(false);
    stopAudioProcessing();
  }, [stopAudioProcessing]);

  const handleAudioFile = useCallback((file: File) => {
    const url = URL.createObjectURL(file);
    // If a previous demo audio is active or an audio element exists, stop and fully clean it up
    if (isDemoPlaying || audioElRef.current) {
      try { stopDemoAudio(); } catch {}
    }
    // Always create a fresh audio element to avoid Web Audio API limitation
    // that forbids creating multiple MediaElementSourceNodes for the same element
    const audio = document.createElement("audio");
    audio.crossOrigin = "anonymous";
    audio.controls = false;
    // Play through speakers via the media element; we'll also tap it into WebAudio for analysis
    audio.muted = false;
    audio.volume = 1.0;
    audioElRef.current = audio;
    audio.src = url;
    audio.loop = true;
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    audioContextRef.current = ctx;
    const src = ctx.createMediaElementSource(audio);
    audioSourceRef.current = src;
    setupAnalyser(ctx, src);
    // Ensure audible output (element plays, and WebAudio also routes to destination)
    try { src.connect(ctx.destination); } catch {}
    // Ensure context is running, then start playback
    try { ctx.resume().catch(() => {}); } catch {}
    audio.play().catch(() => {});
    setIsDemoPlaying(true);
    setIsMicActive(false);
  }, [setupAnalyser, isDemoPlaying, stopDemoAudio]);

  

  useEffect(() => {
    return () => {
      stopDemoAudio();
      stopMicrophone();
    };
  }, [stopDemoAudio, stopMicrophone]);

  // Map audio level into a subtle param change while streaming
  useEffect(() => {
    if (!isStreaming) return;
    // Use audio level to drive the last controlnet conditioning scale as a fun demo
    const scaled = Math.min(1, Math.max(0, audioLevel * 2 * audioReactivity));
    setParams((prev) => ({
      ...prev,
      params: {
        ...prev.params,
        controlnets: prev.params.controlnets.map((cn, i) => i === 4 ? { ...cn, conditioning_scale: scaled } : cn),
      },
    }));
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => { if (isStreaming) updateApiParams(); }, 350);
  }, [audioLevel, audioReactivity, isStreaming, updateApiParams]);

  // --- Speech recognition ---
  const startRecognition = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) { setError("Speech Recognition not supported in this browser"); return; }
    const rec = new SpeechRecognition();
    recognitionRef.current = rec;
    rec.lang = recognitionLang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e: any) => {
      let text = "";
      for (let i = 0; i < e.results.length; i++) {
        text += e.results[i][0].transcript + (e.results[i].isFinal ? "\n" : "");
      }
      setRecognizedText(text.trim());
    };
    rec.onend = () => setIsRecognizing(false);
    rec.onerror = () => setIsRecognizing(false);
    rec.start();
    setIsRecognizing(true);
  }, [recognitionLang]);

  const stopRecognition = useCallback(() => {
    try { recognitionRef.current?.stop?.(); } catch {}
    setIsRecognizing(false);
  }, []);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-xl border border-gray-800 overflow-hidden bg-gray-900/70">
            <div className="flex items-center justify-between text-xs text-gray-400 px-3 py-2 border-b border-gray-800">
              <span>Your Webcam</span>
              <span className="inline-flex items-center rounded-full bg-gray-800 px-2 py-0.5 text-[10px] text-gray-300">input</span>
            </div>
            <video ref={localVideoRef} playsInline autoPlay muted className="w-full h-64 bg-black" />
          </div>
          <div className="rounded-xl border border-gray-800 overflow-hidden bg-gray-900/70 relative">
            <div className="flex items-center justify-between text-xs text-gray-400 px-3 py-2 border-b border-gray-800">
              <span>AI Output</span>
              <span className="text-[11px] text-gray-500">{playbackId ? `Playback: ${playbackId}` : "No playback"}</span>
            </div>
            <div ref={outputContainerRef} className="w-full h-64 bg-black grid place-items-center">
              <div ref={outputPlaceholderRef} className="text-sm text-gray-500">Start the stream to see output</div>
            </div>
            {/* Speech/Text overlay */}
            {recognizedText && showOverlay && (
              <div
                className="pointer-events-none absolute inset-0 flex items-end justify-center p-3"
                style={{ fontFamily, opacity: textOpacity }}
              >
                <div
                  className="text-center text-white w-full"
                  style={{ fontSize: `${fontSize}px`, textShadow: "0 2px 6px rgba(0,0,0,.7)" }}
                >
                  <div style={{ whiteSpace: "pre-wrap" }}>{recognizedText}</div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-gray-400 mb-1">API Key</label>
              <input ref={apiKeyRef} type="password" placeholder="REPLACE WITH YOUR API KEY" className="w-full rounded bg-gray-800 border border-gray-700 px-3 py-2" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Pipeline ID</label>
              <input ref={pipelineIdRef} type="text" defaultValue="pip_qpUgXycjWF6YMeSL" className="w-full rounded bg-gray-800 border border-gray-700 px-3 py-2" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 items-end">
            <button onClick={() => (isStreaming ? stopStream() : startStream())} className={`w-full py-2 px-4 rounded-lg font-medium transition-colors bg-gradient-to-r ${isStreaming ? "from-rose-600 to-red-700 hover:from-rose-600/90 hover:to-red-700/90" : "from-indigo-600 to-violet-700 hover:from-indigo-600/90 hover:to-violet-700/90"}`}>{isStreaming ? "Stop" : "Start"}</button>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Status</label>
              <div className="text-xs">
                {error ? (
                  <span className="inline-flex items-center rounded-full bg-rose-500/15 text-rose-300 border border-rose-500/30 px-2 py-0.5">{error}</span>
                ) : isStreaming ? (
                  <span className="inline-flex items-center rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 px-2 py-0.5">{status || "Streaming live!"}</span>
                ) : (
                  <span className="inline-flex items-center rounded-full bg-gray-800 text-gray-300 border border-gray-700 px-2 py-0.5">Idle</span>
                )}
              </div>
            </div>
          </div>

          {/* Audio Input */}
          <div className="rounded-xl border border-gray-800 bg-gray-900/70 p-3 space-y-2">
            <div className="flex items-center justify-between mb-1">
              <h4 className="text-sm font-semibold">Audio Input</h4>
              {(isMicActive || isDemoPlaying) && (
                <span className="text-[11px] text-gray-400">Level: {(audioLevel * 100).toFixed(0)}%</span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => (isMicActive ? stopMicrophone() : startMicrophone())} className={`w-full py-2 px-3 rounded-lg text-sm font-medium ${isMicActive ? "bg-rose-600 hover:bg-rose-700" : "bg-gray-800 hover:bg-gray-700"}`}>{isMicActive ? "Stop Microphone" : "Use Microphone"}</button>
              {isDemoPlaying ? (
                <button onClick={stopDemoAudio} className="w-full py-2 px-3 rounded-lg text-sm font-medium bg-rose-600 hover:bg-rose-700">Stop Audio</button>
              ) : (
                <label className="w-full">
                  <span className="block w-full py-2 px-3 rounded-lg text-sm font-medium text-center cursor-pointer bg-gray-800 hover:bg-gray-700">Upload Audio</span>
                  <input type="file" accept="audio/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleAudioFile(f); }} />
                </label>
              )}
            </div>
            <label className="block text-xs text-gray-400 mb-1">Audio Reactivity: {audioReactivity.toFixed(2)}</label>
            <input type="range" min={0} max={1.5} step={0.01} value={audioReactivity} onChange={(e) => setAudioReactivity(Number(e.target.value))} className="w-full" />
            <p className="text-[11px] text-gray-500">How much audio affects the AI rendering</p>
          </div>

          <div className="rounded-xl border border-gray-800 bg-gray-900/70 p-3">
            <label className="block text-xs text-gray-400 mb-1">Prompt</label>
            <input value={params.params.prompt} onChange={(e) => handleParamChange("prompt", e.target.value)} className="w-full rounded bg-gray-800 border border-gray-700 px-3 py-2" />
          </div>
          <div className="rounded-xl border border-gray-800 bg-gray-900/70 p-3">
            <label className="block text-xs text-gray-400 mb-1">Negative Prompt</label>
            <input value={params.params.negative_prompt} onChange={(e) => handleParamChange("negative_prompt", e.target.value)} className="w-full rounded bg-gray-800 border border-gray-700 px-3 py-2" />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Steps: {params.params.num_inference_steps}</label>
              <input type="range" min={1} max={100} step={1} value={params.params.num_inference_steps} onChange={(e) => handleParamChange("num_inference_steps", Number(e.target.value))} className="w-full" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Seed</label>
              <input type="number" value={params.params.seed} onChange={(e) => handleParamChange("seed", Number(e.target.value))} className="w-full rounded bg-gray-800 border border-gray-700 px-3 py-2" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">t_index_list</label>
              <input type="text" value={params.params.t_index_list.join(",")} onChange={(e) => handleParamChange("t_index_list", e.target.value.split(",").map((v) => Number(v.trim())).filter((v) => Number.isFinite(v)))} className="w-full rounded bg-gray-800 border border-gray-700 px-3 py-2" />
            </div>
          </div>

          <div className="rounded-xl border border-gray-800 bg-gray-900/70 p-3">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold">Denoise</h4>
              <span className="text-[11px] text-gray-500">affects speed, style, quality</span>
            </div>
            <div className="space-y-2">
              <div>
                <label className="block text-xs text-gray-400 mb-1">X: {params.params.t_index_list[0] ?? 0}</label>
                <input
                  type="range"
                  min={0}
                  max={30}
                  step={1}
                  value={params.params.t_index_list[0] ?? 0}
                  onChange={(e) => handleDenoiseIndexChange(0, Number(e.target.value))}
                  className="w-full"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Y: {params.params.t_index_list[1] ?? 0}</label>
                <input
                  type="range"
                  min={0}
                  max={30}
                  step={1}
                  value={params.params.t_index_list[1] ?? 0}
                  onChange={(e) => handleDenoiseIndexChange(1, Number(e.target.value))}
                  className="w-full"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Z: {params.params.t_index_list[2] ?? 0}</label>
                <input
                  type="range"
                  min={0}
                  max={30}
                  step={1}
                  value={params.params.t_index_list[2] ?? 0}
                  onChange={(e) => handleDenoiseIndexChange(2, Number(e.target.value))}
                  className="w-full"
                />
              </div>
              <div className="text-[11px] text-gray-400 mt-2">
                Denoising steps values:
                <div className="mt-1 grid grid-cols-3 gap-2">
                  {params.params.t_index_list.slice(0, 3).map((v, i) => (
                    <div key={i} className="rounded border border-gray-700 bg-gray-800 text-center py-1 text-gray-200">{v}</div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="border-t border-gray-800 pt-3">
            <h4 className="text-sm font-semibold mb-2">ControlNets</h4>
            {[
              "Pose Estimation",
              "Soft Edges (HED)",
              "Sharp Edges (Canny)",
              "Depth Estimation",
              "Color Preservation",
            ].map((label, i) => (
              <div key={label} className="mb-2">
                <div className="flex items-center justify-between text-xs text-gray-400">
                  <label>{label}</label>
                  <span className="text-[11px] text-gray-500">{params.params.controlnets[i]?.conditioning_scale.toFixed(2)}</span>
                </div>
                <input type="range" min={0} max={1} step={0.01} value={params.params.controlnets[i]?.conditioning_scale || 0} onChange={(e) => handleControlNetChange(i, Number(e.target.value))} className="w-full" />
              </div>
            ))}
          </div>

          {/* Speech Recognition & Text Layers */}
          <div className="rounded-xl border w-full border-gray-800 bg-gray-900/70 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold">Speech Recognition & Text Layers</h4>
              <div className="flex gap-2">
                <button onClick={() => (isRecognizing ? stopRecognition() : startRecognition())} className={`py-1.5 px-3 rounded text-xs font-medium ${isRecognizing ? "bg-rose-600 hover:bg-rose-700" : "bg-gray-800 hover:bg-gray-700"}`}>{isRecognizing ? "Stop" : "Start Recognition"}</button>
              </div>
            </div>

            {/* Transcript area */}
            <div className="rounded-lg border border-gray-800 bg-gray-800/40 p-3 max-h-36 overflow-auto">
              <pre className="whitespace-pre-wrap text-xs text-gray-200 leading-snug" style={{ fontFamily }}>
                {recognizedText || (isRecognizing ? "Listening…" : "Transcript will appear here")}
              </pre>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Recognition Language</label>
                <select value={recognitionLang} onChange={(e) => setRecognitionLang(e.target.value)} className="w-full rounded bg-gray-800 border border-gray-700 px-2 py-1 text-xs">
                  <option value="en-US">English (US)</option>
                  <option value="en-GB">English (UK)</option>
                  <option value="es-ES">Spanish (ES)</option>
                  <option value="fr-FR">French</option>
                  <option value="de-DE">German</option>
                  <option value="ja-JP">Japanese</option>
                  <option value="zh-CN">Chinese (Simplified)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Font Family</label>
                <select value={fontFamily} onChange={(e) => setFontFamily(e.target.value)} className="w-full rounded bg-gray-800 border border-gray-700 px-2 py-1 text-xs">
                  <option value="Arial, Helvetica, sans-serif">Arial</option>
                  <option value="Inter, system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, Helvetica Neue, Arial, Apple Color Emoji, Segoe UI Emoji, Segoe UI Symbol, Noto Color Emoji">Inter</option>
                  <option value="Times New Roman, Times, serif">Times New Roman</option>
                  <option value="Georgia, serif">Georgia</option>
                  <option value="Courier New, monospace">Courier New</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 items-center">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Font Size: {fontSize}px</label>
                <input type="range" min={10} max={72} value={fontSize} onChange={(e) => setFontSize(Number(e.target.value))} className="w-full" />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Text Opacity: {(textOpacity * 100).toFixed(0)}%</label>
                <input type="range" min={0} max={1} step={0.01} value={textOpacity} onChange={(e) => setTextOpacity(Number(e.target.value))} className="w-full" />
              </div>
            </div>
            <label className="inline-flex items-center gap-2 text-xs text-gray-300">
              <input type="checkbox" className="accent-indigo-500" checked={showOverlay} onChange={(e) => setShowOverlay(e.target.checked)} />
              Show overlay on output
            </label>
            <div className="grid grid-cols-2 gap-3 items-center">
              <button onClick={() => setRecognizedText("")} className="py-1.5 px-3 rounded text-xs font-medium bg-gray-800 hover:bg-gray-700">Clear</button>
              <button onClick={() => navigator.clipboard.writeText(recognizedText || "").catch(() => {})} className="py-1.5 px-3 rounded text-xs font-medium bg-gray-800 hover:bg-gray-700">Copy</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default StreamRender;



