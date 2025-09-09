import { useCallback, useEffect, useRef, useState } from "react";
import { createSilentAudioTrack } from "../FluidCanvas/utils/audioTrack";
import { FluidControls } from "../FluidControls";

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
    guidance_scale?: number;
    delta?: number;
    num_inference_steps: number;
    t_index_list: number[];
    use_safety_checker?: boolean;
    width?: number;
    height?: number;
    lora_dict?: Record<string, unknown>;
    use_lcm_lora?: boolean;
    lcm_lora_id?: string;
    acceleration?: string;
    use_denoising_batch?: boolean;
    do_add_noise?: boolean;
    seed: number;
    seed_interpolation_method?: string;
    enable_similar_image_filter?: boolean;
    similar_image_filter_threshold?: number;
    similar_image_filter_max_skip_frame?: number;
    controlnets: ControlNet[];
    ip_adapter?: {
      scale: number;
      enabled: boolean;
    };
    ip_adapter_style_image_url?: string;
    weight_type?: string;
  };
};

const API_BASE_URL = "https://api.daydream.live";

export function StreamRender({ 
  streamId: externalStreamId, 
  apiKey: externalApiKey, 
  onStreamIdChange,
  prompt: externalPrompt,
  onPromptChange
}: { 
  streamId?: string; 
  apiKey?: string; 
  onStreamIdChange?: (id: string | null) => void;
  prompt?: string;
  onPromptChange?: (prompt: string) => void;
}) {
  const [isStreaming, setIsStreaming] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [streamId, setStreamId] = useState<string | null>(null);
  const [whipUrl, setWhipUrl] = useState<string | null>(null);
  const [playbackId, setPlaybackId] = useState<string | null>(null);
  const [connectionQuality, setConnectionQuality] = useState<'excellent' | 'good' | 'poor' | 'failed'>('excellent');
  const [streamMetrics, setStreamMetrics] = useState<{
    video: { jitter: number; packets_lost: number; packets_received: number; packet_loss_pct: number; rtt: number };
    audio: { jitter: number; packets_lost: number; packets_received: number; packet_loss_pct: number; rtt: number };
    bytesReceived: number;
    bytesSent: number;
  } | null>(null);
  const [pipelineInitializing, setPipelineInitializing] = useState(false);

  const apiKeyRef = useRef<HTMLInputElement | null>(null);
  const pipelineIdRef = useRef<HTMLInputElement | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const outputContainerRef = useRef<HTMLDivElement | null>(null);
  const outputPlaceholderRef = useRef<HTMLDivElement | null>(null);

  const localStreamRef = useRef<MediaStream | null>(null);
  const rtcPeerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectionHealthRef = useRef<{
    lastConnected: number;
    connectionAttempts: number;
    consecutiveFailures: number;
    healthCheckInterval: ReturnType<typeof setInterval> | null;
  }>({
    lastConnected: 0,
    connectionAttempts: 0,
    consecutiveFailures: 0,
    healthCheckInterval: null
  });

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

  // Health monitoring
  const healthMonitorRef = useRef<ReturnType<typeof setInterval> | null>(null);
  
  // Connection keepalive
  const keepaliveRef = useRef<ReturnType<typeof setInterval> | null>(null);
  
  // Debug and testing state
  const [debugMode, setDebugMode] = useState(false);
  const [customTurnServer, setCustomTurnServer] = useState("turn:relay1.expressturn.com:3480");
  const [turnUsername, setTurnUsername] = useState("000000002072743325");
  const [turnPassword, setTurnPassword] = useState("vuyZ+Z6uqI0EKMSo0JBl6OTWduI=");

  // Daydream prompt state
  const [daydreamPrompt, setDaydreamPrompt] = useState("");
  const [isSubmittingPrompt, setIsSubmittingPrompt] = useState(false);
  const [promptStatus, setPromptStatus] = useState<string>("");

  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [isClipping, setIsClipping] = useState(false);
  const [clipStatus, setClipStatus] = useState<string>("");
  const [recordingDuration, setRecordingDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const recordingStartTimeRef = useRef<number>(0);
  const recordingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
      guidance_scale: 7.5,
      delta: 1.0,
      num_inference_steps: 50,
      t_index_list: [0, 8, 17],
      use_safety_checker: true,
      width: 512,
      height: 512,
      lora_dict: {},
      use_lcm_lora: true,
      lcm_lora_id: "latent-consistency/lcm-lora-sdv1-5",
      acceleration: "none",
      use_denoising_batch: true,
      do_add_noise: true,
      seed: 42,
      seed_interpolation_method: "linear",
      enable_similar_image_filter: true,
      similar_image_filter_threshold: 0.98,
      similar_image_filter_max_skip_frame: 10,
      controlnets: [
        { name: "Pose Estimation", preprocessor: "pose_tensorrt", conditioning_scale: 0, model_id: "thibaud/controlnet-sd21-openpose-diffusers" },
        { name: "Soft Edges (HED)", preprocessor: "soft_edge", conditioning_scale: 0, model_id: "thibaud/controlnet-sd21-hed-diffusers" },
        { name: "Sharp Edges (Canny)", preprocessor: "canny", conditioning_scale: 0, model_id: "thibaud/controlnet-sd21-canny-diffusers" },
        { name: "Depth Estimation", preprocessor: "depth_tensorrt", conditioning_scale: 0, model_id: "thibaud/controlnet-sd21-depth-diffusers" },
        { name: "Color Preservation", preprocessor: "passthrough", conditioning_scale: 0, model_id: "thibaud/controlnet-sd21-color-diffusers" },
      ].map((cn) => ({ ...cn, control_guidance_end: 1, control_guidance_start: 0, enabled: true, preprocessor_params: {} })),
      ip_adapter: {
        scale: 1.0,
        enabled: false
      },
      ip_adapter_style_image_url: "",
      weight_type: "linear"
    },
  });

  const setStatusWithLoading = useCallback((message: string) => {
    setStatus(message);
    setError(null);
  }, []);

  const startConnectionHealthMonitoring = useCallback(() => {
    // Clear any existing health check
    if (connectionHealthRef.current.healthCheckInterval) {
      clearInterval(connectionHealthRef.current.healthCheckInterval);
    }

    connectionHealthRef.current.healthCheckInterval = setInterval(async () => {
      const pc = rtcPeerConnectionRef.current;
      if (!pc) return;

      const now = Date.now();
      const timeSinceLastConnected = now - connectionHealthRef.current.lastConnected;
      
      // Fetch stream metrics if we have a stream ID
      if (streamId) {
        try {
          const response = await fetch(`https://daydream.live/api/streams/${streamId}/status`, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
            },
          });

          if (response.ok) {
            const data = await response.json();
            if (data.success && data.data?.gateway_status?.ingest_metrics?.stats) {
              const stats = data.data.gateway_status.ingest_metrics.stats;
              const videoTrack = stats.track_stats?.find((track: any) => track.type === 'video');
              const audioTrack = stats.track_stats?.find((track: any) => track.type === 'audio');
              
              if (videoTrack && audioTrack) {
                setStreamMetrics({
                  video: {
                    jitter: videoTrack.jitter || 0,
                    packets_lost: videoTrack.packets_lost || 0,
                    packets_received: videoTrack.packets_received || 0,
                    packet_loss_pct: videoTrack.packet_loss_pct || 0,
                    rtt: videoTrack.rtt || 0
                  },
                  audio: {
                    jitter: audioTrack.jitter || 0,
                    packets_lost: audioTrack.packets_lost || 0,
                    packets_received: audioTrack.packets_received || 0,
                    packet_loss_pct: audioTrack.packet_loss_pct || 0,
                    rtt: audioTrack.rtt || 0
                  },
                  bytesReceived: stats.peer_conn_stats?.BytesReceived || 0,
                  bytesSent: stats.peer_conn_stats?.BytesSent || 0
                });
                
                if (debugMode) {
                  console.log('📊 Stream metrics updated:', {
                    video: videoTrack,
                    audio: audioTrack,
                    bytes: { received: stats.peer_conn_stats?.BytesReceived, sent: stats.peer_conn_stats?.BytesSent }
                  });
                }
              }
            }
          } else {
            if (debugMode) console.warn('Failed to fetch stream status:', response.status);
          }
        } catch (error) {
          if (debugMode) console.warn('Error fetching stream status:', error);
        }
      }
      
      // Update connection quality based on current state, history, and metrics
      if (pc.connectionState === "connected") {
        let quality: 'excellent' | 'good' | 'poor' | 'failed' = 'excellent';
        
        // Check stream metrics if available
        if (streamMetrics) {
          const videoLoss = streamMetrics.video.packet_loss_pct;
          const audioLoss = streamMetrics.audio.packet_loss_pct;
          const videoJitter = streamMetrics.video.jitter;
          const audioJitter = streamMetrics.audio.jitter;
          
          // Determine quality based on packet loss and jitter
          if (videoLoss > 5 || audioLoss > 5 || videoJitter > 50 || audioJitter > 100) {
            quality = 'failed';
          } else if (videoLoss > 2 || audioLoss > 2 || videoJitter > 20 || audioJitter > 50) {
            quality = 'poor';
          } else if (videoLoss > 0.5 || audioLoss > 0.5 || videoJitter > 10 || audioJitter > 20) {
            quality = 'good';
          }
        }
        
        // Override with failure history if needed
        if (connectionHealthRef.current.consecutiveFailures >= 3) {
          quality = 'poor';
        } else if (connectionHealthRef.current.consecutiveFailures >= 1) {
          quality = quality === 'excellent' ? 'good' : quality;
        }
        
        setConnectionQuality(quality);
      } else if (pc.connectionState === "disconnected") {
        setConnectionQuality('poor');
        // If we've been disconnected for more than 60 seconds, try to reconnect
        if (timeSinceLastConnected > 60000) {
          console.warn("Connection health check: Long disconnection detected, attempting reconnection");
          // We'll call attemptReconnection when it's available
          if (typeof attemptReconnection === 'function') {
            attemptReconnection();
          }
        }
      } else if (pc.connectionState === "failed") {
        setConnectionQuality('failed');
      }
      
      // If we've had too many consecutive failures, suggest restart
      if (connectionHealthRef.current.consecutiveFailures >= 5) {
        console.error("Connection health check: Too many consecutive failures, suggesting restart");
        setError("Multiple connection failures detected. Consider restarting the stream or checking your network connection.");
        setConnectionQuality('failed');
      }
    }, 10000); // Check every 10 seconds
  }, [streamId, streamMetrics]);

  const stopConnectionHealthMonitoring = useCallback(() => {
    if (connectionHealthRef.current.healthCheckInterval) {
      clearInterval(connectionHealthRef.current.healthCheckInterval);
      connectionHealthRef.current.healthCheckInterval = null;
    }
  }, []);

  const fetchStreamStatus = useCallback(async (currentStreamId: string) => {
    try {
      const response = await fetch(`https://daydream.live/api/streams/${currentStreamId}/status`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.data?.gateway_status?.ingest_metrics?.stats) {
          const stats = data.data.gateway_status.ingest_metrics.stats;
          const videoTrack = stats.track_stats?.find((track: any) => track.type === 'video');
          const audioTrack = stats.track_stats?.find((track: any) => track.type === 'audio');
          
          if (videoTrack && audioTrack) {
            setStreamMetrics({
              video: {
                jitter: videoTrack.jitter || 0,
                packets_lost: videoTrack.packets_lost || 0,
                packets_received: videoTrack.packets_received || 0,
                packet_loss_pct: videoTrack.packet_loss_pct || 0,
                rtt: videoTrack.rtt || 0
              },
              audio: {
                jitter: audioTrack.jitter || 0,
                packets_lost: audioTrack.packets_lost || 0,
                packets_received: audioTrack.packets_received || 0,
                packet_loss_pct: audioTrack.packet_loss_pct || 0,
                rtt: audioTrack.rtt || 0
              },
              bytesReceived: stats.peer_conn_stats?.BytesReceived || 0,
              bytesSent: stats.peer_conn_stats?.BytesSent || 0
            });
            
            if (debugMode) {
              console.log('📊 Stream metrics updated:', {
                video: videoTrack,
                audio: audioTrack,
                bytes: { received: stats.peer_conn_stats?.BytesReceived, sent: stats.peer_conn_stats?.BytesSent }
              });
            }
          }
        }
      } else {
        if (debugMode) console.warn('Failed to fetch stream status:', response.status);
      }
    } catch (error) {
      if (debugMode) console.warn('Error fetching stream status:', error);
    }
  }, [debugMode]);

  const mountPlayerIframe = useCallback((id: string | null, retryCount = 0) => {
    const container = outputContainerRef.current;
    if (!container) return;
    container.innerHTML = "";
    if (!id) {
      if (outputPlaceholderRef.current) container.appendChild(outputPlaceholderRef.current);
      return;
    }
    const iframe = document.createElement("iframe");
    iframe.allow = "autoplay; fullscreen; picture-in-picture; clipboard-write; camera; microphone";
    iframe.referrerPolicy = "origin";
    iframe.style.width = "100%";
    iframe.style.height = "320px";
    iframe.style.border = "none";
    iframe.style.borderRadius = "8px";
    iframe.src = `https://lvpr.tv/?v=${encodeURIComponent(id)}&lowLatency=force&autoplay=true`;
    
    // Add comprehensive error handling for iframe with improved retry logic
    iframe.onerror = () => {
      console.error("Failed to load iframe player, retry count:", retryCount);
      if (retryCount < 5) { // Increased retry count
        const retryDelay = Math.min(3000 * Math.pow(1.5, retryCount), 15000); // Exponential backoff, max 15s
        console.log(`Retrying iframe load in ${retryDelay/1000} seconds... (${retryCount + 1}/5)`);
        setStatusWithLoading(`Video player failed to load, retrying in ${retryDelay/1000}s... (${retryCount + 1}/5)`);
        setTimeout(() => {
          mountPlayerIframe(id, retryCount + 1);
        }, retryDelay);
      } else {
        setError("Failed to load video player after multiple attempts. This may indicate network connectivity issues or the stream is not ready yet. Try refreshing the page or checking your internet connection.");
        setStatusWithLoading("Video player failed to load");
      }
    };
    
    iframe.onload = () => {
      console.log("Iframe player loaded successfully");
      setStatusWithLoading("Video player loaded - waiting for stream...");
    };
    
    // Add timeout for iframe loading
    const loadTimeout = setTimeout(() => {
      if (!iframe.contentDocument) {
        console.warn("Iframe load timeout after 30 seconds");
        if (iframe.onerror) {
          iframe.onerror(new Event('timeout'));
        }
      }
    }, 30000);
    
    iframe.onload = () => {
      clearTimeout(loadTimeout);
      console.log("Iframe player loaded successfully");
      setStatusWithLoading("Video player loaded - waiting for stream...");
    };
    
    container.appendChild(iframe);
  }, [setStatusWithLoading]);

  const startWhipClient = useCallback(async (whipUrlParam?: string) => {
    const actualWhipUrl = whipUrlParam || whipUrl;
    console.log("startWhipClient called with:", { whipUrl: actualWhipUrl, hasLocalStream: !!localStreamRef.current });
    console.log("WHIP URL type:", typeof actualWhipUrl, "Value:", actualWhipUrl);
    
    if (!actualWhipUrl || !localStreamRef.current) {
      console.error("Missing WHIP URL or local stream:", { 
        whipUrl: actualWhipUrl, 
        whipUrlType: typeof actualWhipUrl,
        whipUrlBool: !!actualWhipUrl,
        localStream: !!localStreamRef.current 
      });
      setError("Missing WHIP URL or local stream. Please restart the stream.");
      return;
    }

    console.log("Starting WHIP connection to:", actualWhipUrl);
    
    // Build ICE servers configuration with custom TURN server support
    const iceServers = [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
      { urls: "stun:stun2.l.google.com:19302" },
      { urls: "stun:stun3.l.google.com:19302" },
      { urls: "stun:stun4.l.google.com:19302" },
      { urls: "stun:stun.cloudflare.com:3478" },
      { urls: "stun:openrelay.metered.ca:80" },
      {
        urls: "turn:turn.livepeer.cloud:80?transport=udp",
        username: "livepeer",
        credential: "livepeer"
      },
      {
        urls: "turn:turn.livepeer.cloud:80?transport=tcp",
        username: "livepeer",
        credential: "livepeer"
      },
      {
        urls: "turn:turn.livepeer.cloud:443?transport=tcp",
        username: "livepeer",
        credential: "livepeer"
      },
      // Add ExpressTURN as a reliable fallback
      {
        urls: "turn:relay1.expressturn.com:3480",
        username: "000000002072743325",
        credential: "vuyZ+Z6uqI0EKMSo0JBl6OTWduI="
      }
    ];
    
    // Add custom TURN server if configured and different from ExpressTURN
    if (customTurnServer && customTurnServer !== "turn:relay1.expressturn.com:3480") {
      if (turnUsername && turnPassword) {
        iceServers.push({ urls: customTurnServer, username: turnUsername, credential: turnPassword });
      } else {
        iceServers.push({ urls: customTurnServer });
      }
      if (debugMode) console.log('Using additional custom TURN server:', customTurnServer);
    } else if (debugMode) {
      console.log('Using pre-configured ExpressTURN server');
    }

    const rtcPeerConnection = new RTCPeerConnection({
      iceServers,
      iceTransportPolicy: "all", // Change to "relay" to force TURN
      bundlePolicy: "max-bundle",
      rtcpMuxPolicy: "require",
      iceCandidatePoolSize: 10
    });
    rtcPeerConnectionRef.current = rtcPeerConnection;

    // Add comprehensive connection state monitoring
    rtcPeerConnection.onconnectionstatechange = () => {
      if (debugMode) console.log("RTC Connection state:", rtcPeerConnection.connectionState);
      
      switch (rtcPeerConnection.connectionState) {
        case "connecting":
          setStatusWithLoading("Establishing connection...");
          break;
        case "connected":
          setStatusWithLoading("Initializing...");
          setPipelineInitializing(true);
          // Start keepalive monitoring when connected
          startConnectionKeepalive();
          // Start connection health monitoring
          startConnectionHealthMonitoring();
          // Update connection health tracking
          connectionHealthRef.current.lastConnected = Date.now();
          connectionHealthRef.current.consecutiveFailures = 0;
          if (debugMode) console.log("✅ WebRTC connection established successfully");
          // Update status after pipeline initialization time
          setTimeout(() => {
            if (rtcPeerConnection.connectionState === "connected") {
              setPipelineInitializing(false);
              setStatusWithLoading("Streaming live!");
            }
          }, 30000);
          break;
        case "disconnected":
          console.warn("WebRTC connection disconnected - attempting to maintain connection");
          setStatusWithLoading("Connection lost - attempting to reconnect...");
          // Don't immediately fail, give it more time to reconnect during AI pipeline initialization
          const reconnectDelay = pipelineInitializing ? 45000 : 15000; // Increased timeouts: 45s if pipeline initializing, 15s otherwise
          setTimeout(() => {
            if (rtcPeerConnection.connectionState === "disconnected") {
              if (debugMode) console.log(`Connection still disconnected after ${reconnectDelay/1000}s, attempting restart`);
              attemptReconnection(0);
            }
          }, reconnectDelay);
          break;
        case "failed":
          console.error("RTC Connection failed - attempting reconnection");
          setStatusWithLoading("Connection failed - attempting reconnection...");
          // Track consecutive failures
          connectionHealthRef.current.consecutiveFailures++;
          connectionHealthRef.current.connectionAttempts++;
          attemptReconnection(0);
          break;
        case "closed":
          setStatusWithLoading("Connection closed");
          break;
      }
    };

    rtcPeerConnection.oniceconnectionstatechange = () => {
      console.log("ICE Connection state:", rtcPeerConnection.iceConnectionState);
      
      switch (rtcPeerConnection.iceConnectionState) {
        case "checking":
          setStatusWithLoading("Checking network connectivity...");
          break;
        case "connected":
        case "completed":
          console.log("ICE connection successful");
          setStatusWithLoading("Network connection established");
          break;
        case "disconnected":
          console.warn("ICE connection disconnected - monitoring for reconnection");
          setStatusWithLoading("Network disconnected - monitoring for reconnection...");
          // Don't immediately fail, ICE can recover
          break;
        case "failed":
          console.error("ICE connection failed - attempting ICE restart");
          setStatusWithLoading("Network connection failed - attempting ICE restart...");
          // Try ICE restart before giving up
          try {
            if (rtcPeerConnection.restartIce) {
              console.log("Attempting ICE restart");
              rtcPeerConnection.restartIce();
              setStatusWithLoading("ICE restart initiated...");
            }
          } catch (e) {
            console.error("ICE restart failed:", e);
            attemptReconnection(0);
          }
          break;
      }
    };

    // Add more detailed monitoring for debugging
    rtcPeerConnection.onicegatheringstatechange = () => {
      console.log("ICE Gathering state:", rtcPeerConnection.iceGatheringState);
      if (rtcPeerConnection.iceGatheringState === "gathering") {
        setStatusWithLoading("Gathering network candidates...");
      }
    };

    rtcPeerConnection.onsignalingstatechange = () => {
      console.log("Signaling state:", rtcPeerConnection.signalingState);
    };

    rtcPeerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        if (debugMode) {
          console.log(`ICE candidate: ${event.candidate.type} - ${event.candidate.protocol} - ${event.candidate.address}:${event.candidate.port}`);
        } else {
          console.log("ICE Candidate:", event.candidate.type);
        }
      } else {
        console.log("ICE gathering complete");
      }
    };

    // Add all available tracks (video + audio) to the WHIP connection
    const tracks = localStreamRef.current.getTracks();
    console.log(`Adding ${tracks.length} tracks to WHIP connection:`, tracks.map(t => `${t.kind}: ${t.readyState}`));
    
    tracks.forEach((track) => {
      rtcPeerConnection.addTrack(track, localStreamRef.current!);
    });

    const offer = await rtcPeerConnection.createOffer();
    await rtcPeerConnection.setLocalDescription(offer);
    
    console.log("Sending WHIP offer, SDP length:", offer.sdp?.length);

    const whipResponse = await fetch(actualWhipUrl, {
      method: "POST",
      // Per guidance: WHIP endpoint does not require Authorization header
      headers: { "Content-Type": "application/sdp" },
      body: rtcPeerConnection.localDescription?.sdp || "",
    });

    console.log("WHIP response status:", whipResponse.status);

    if (whipResponse.status !== 201) {
      const errorText = await whipResponse.text().catch(() => "");
      console.error("WHIP failed:", { status: whipResponse.status, body: errorText });
      setError(`WHIP connection failed with status: ${whipResponse.status}. ${errorText}`);
      throw new Error(`WHIP connection failed with status: ${whipResponse.status}. ${errorText}`);
    }

    const answerSdp = await whipResponse.text();
    console.log("Received WHIP answer, SDP length:", answerSdp.length);
    
    await rtcPeerConnection.setRemoteDescription({ type: "answer", sdp: answerSdp });
    console.log("WHIP connection established successfully");
  }, [whipUrl, setStatusWithLoading, customTurnServer, turnUsername, turnPassword, debugMode]);

  const attemptReconnection = useCallback(async (retryCount = 0) => {
    console.log(`Attempting WebRTC reconnection... (attempt ${retryCount + 1})`);
    setStatusWithLoading(`Reconnecting... (attempt ${retryCount + 1})`);
    
    try {
      // Close existing connection
      if (rtcPeerConnectionRef.current) {
        rtcPeerConnectionRef.current.close();
        rtcPeerConnectionRef.current = null;
      }
      
      // Wait with exponential backoff before reconnecting
      const backoffDelay = Math.min(2000 * Math.pow(1.5, retryCount), 10000); // Max 10s delay
      await new Promise(resolve => setTimeout(resolve, backoffDelay));
      
      // Check if we still have a local stream
      if (!localStreamRef.current) {
        setError("Lost local video stream - please restart");
        return;
      }
      
      // Attempt to restart the WHIP client
      if (whipUrl) {
        console.log("Restarting WHIP client with URL:", whipUrl);
        await startWhipClient(whipUrl);
        setStatusWithLoading("Reconnection successful!");
      } else {
        setError("Lost WHIP URL - please restart stream");
      }
    } catch (error) {
      console.error(`Reconnection attempt ${retryCount + 1} failed:`, error);
      
      // Retry up to 3 times with exponential backoff
      if (retryCount < 2) {
        const nextRetryDelay = Math.min(5000 * Math.pow(1.5, retryCount), 20000); // Max 20s delay
        console.log(`Reconnection failed, retrying in ${nextRetryDelay/1000}s... (${retryCount + 2}/3)`);
        setStatusWithLoading(`Reconnection failed, retrying in ${nextRetryDelay/1000}s... (${retryCount + 2}/3)`);
        setTimeout(() => {
          attemptReconnection(retryCount + 1);
        }, nextRetryDelay);
      } else {
        setError(`Reconnection failed after 3 attempts: ${error instanceof Error ? error.message : 'Unknown error'}. Please restart the stream.`);
        setStatusWithLoading("Reconnection failed - please restart stream");
      }
    }
  }, [whipUrl, startWhipClient, setStatusWithLoading]);

  const testWebRTCConnectivity = useCallback(async () => {
    setStatusWithLoading("Testing WebRTC connectivity...");
    
    try {
      console.log('🧪 Starting WebRTC connectivity test...');
      
      // Test 1: Check WebRTC support
      if (!window.RTCPeerConnection) {
        throw new Error('WebRTC not supported in this browser');
      }
      if (debugMode) console.log('✅ WebRTC is supported');
      
      // Build ICE servers configuration
      const iceServers: RTCIceServer[] = [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' },
        { urls: 'stun:stun.cloudflare.com:3478' },
        { urls: 'stun:openrelay.metered.ca:80' },
        // Add ExpressTURN for reliable connectivity
        {
          urls: 'turn:relay1.expressturn.com:3480',
          username: '000000002072743325',
          credential: 'vuyZ+Z6uqI0EKMSo0JBl6OTWduI='
        }
      ];
      
      // Add custom TURN server if configured and different from ExpressTURN
      if (customTurnServer && customTurnServer !== 'turn:relay1.expressturn.com:3480') {
        if (turnUsername && turnPassword) {
          iceServers.push({ urls: customTurnServer, username: turnUsername, credential: turnPassword });
        } else {
          iceServers.push({ urls: customTurnServer });
        }
        if (debugMode) console.log('✅ Additional custom TURN server configured:', customTurnServer);
      } else if (debugMode) {
        console.log('✅ Using pre-configured ExpressTURN server');
      }
      
      // Test 2: Create peer connection and test ICE gathering
      const pc = new RTCPeerConnection({
        iceServers: iceServers,
        iceCandidatePoolSize: 10
      });
      
      let iceGatheringComplete = false;
      const candidates: RTCIceCandidate[] = [];
      
      pc.onicegatheringstatechange = () => {
        if (debugMode) console.log('ICE gathering state:', pc.iceGatheringState);
        if (pc.iceGatheringState === 'complete') {
          iceGatheringComplete = true;
        }
      };
      
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          candidates.push(event.candidate);
          if (debugMode) {
            console.log(`ICE candidate: ${event.candidate.type} - ${event.candidate.protocol} - ${event.candidate.address}`);
          }
        }
      };
      
      // Create offer to trigger ICE gathering
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      if (debugMode) console.log('✅ Created test offer');
      
      // Wait for ICE gathering to complete
      await new Promise<void>((resolve) => {
        const checkInterval = setInterval(() => {
          if (iceGatheringComplete || pc.iceGatheringState === 'complete') {
            clearInterval(checkInterval);
            resolve();
          }
        }, 100);
        
        // Timeout after 10 seconds
        setTimeout(() => {
          clearInterval(checkInterval);
          resolve();
        }, 10000);
      });
      
      // Analyze candidate types
      const hostCandidates = candidates.filter((c) => c.type === 'host').length;
      const srflxCandidates = candidates.filter((c) => c.type === 'srflx').length;
      const relayCandidates = candidates.filter((c) => c.type === 'relay').length;
      
      if (debugMode) {
        console.log(`✅ Found ${candidates.length} ICE candidates:`);
        console.log(`  - Host: ${hostCandidates}`);
        console.log(`  - STUN (srflx): ${srflxCandidates}`);
        console.log(`  - TURN (relay): ${relayCandidates}`);
      }
      
      // Determine connectivity quality and provide feedback
      if (candidates.length === 0) {
        setError('WebRTC test failed: No ICE candidates found. Check firewall/network settings.');
        setStatusWithLoading('WebRTC test failed - network connectivity issue');
      } else if (relayCandidates > 0) {
        setStatusWithLoading(`WebRTC test passed! TURN relay available (${candidates.length} candidates)`);
      } else if (srflxCandidates > 0) {
        setStatusWithLoading(`WebRTC test passed! STUN connectivity available (${candidates.length} candidates)`);
      } else if (hostCandidates > 0) {
        setStatusWithLoading(`WebRTC test warning: Only local candidates (${hostCandidates}). May need TURN server.`);
      }
      
      // Clean up
      pc.close();
      
    } catch (error) {
      console.error('❌ WebRTC test failed:', error);
      setError(`WebRTC test failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setStatusWithLoading('WebRTC test failed');
    }
  }, [customTurnServer, turnUsername, turnPassword, debugMode, setStatusWithLoading]);

  const checkStreamHealth = useCallback(async () => {
    const currentStreamId = externalStreamId || streamId;
    if (!currentStreamId) return null;
    
    try {
      const rawKey = externalApiKey || apiKeyRef.current?.value || "";
      const apiKey = rawKey.replace(/^Bearer\s+/i, "").trim();
      
      // Use Vercel function to check stream status
      const response = await fetch(`/api/stream-status?streamId=${currentStreamId}`);
      
      if (response.ok) {
        const streamStatus = await response.json();
        console.log("Daydream stream status:", streamStatus);
        return streamStatus;
      } else {
        const errorText = await response.text().catch(() => "");
        console.warn("Stream status check failed:", response.status, errorText);
        console.log("Checking stream status for ID:", currentStreamId);
        console.log("Full URL:", `https://api.daydream.live/v1/streams/${currentStreamId}/status`);
        return null;
      }
    } catch (e) {
      console.warn("Stream health check failed:", e);
      return null;
    }
  }, [externalStreamId, externalApiKey, streamId]);

  const updateApiParams = useCallback(async () => {
    const currentStreamId = externalStreamId || streamId;
    if (!currentStreamId) return;
    setStatusWithLoading("Updating AI parameters...");
    
    try {
      const rawKey = externalApiKey || apiKeyRef.current?.value || "";
      const apiKey = rawKey.replace(/^Bearer\s+/i, "").trim();
      
      // Check stream health first via Livepeer playback API
      const playbackHealth = await checkStreamHealth();
      if (playbackHealth && playbackHealth.type === 'offline') {
        console.warn("Stream is offline, parameters may not take effect");
        setStatusWithLoading("Warning: Stream offline - parameters may not apply");
      }
      
      // Create a clean copy of params and remove UI-only fields
      const payload: StreamParams = JSON.parse(JSON.stringify(params));
      payload.params.controlnets.forEach((cn) => delete cn.name);
      
      console.log("Sending parameters to AI pipeline:");
      console.log("API Endpoint:", `${API_BASE_URL}/beta/streams/${currentStreamId}/prompts`);
      console.log("Payload structure:", JSON.stringify(payload, null, 2));
      console.log("Headers:", {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey.slice(0, 8)}...`
      });
      
      const response = await fetch(`${API_BASE_URL}/beta/streams/${currentStreamId}/prompts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
      });
      
      console.log("API Response status:", response.status);
      console.log("API Response headers:", Object.fromEntries(response.headers.entries()));
      
      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        let errorMessage = `HTTP ${response.status}`;
        
        console.error("API Error response body:", errorText);
        
        try {
          const errorJson = JSON.parse(errorText);
          errorMessage = errorJson.message || errorText || errorMessage;
        } catch {
          errorMessage = errorText || errorMessage;
        }
        
        throw new Error(`API Error: ${errorMessage}`);
      }
      
      const responseData = await response.json().catch(() => null);
      console.log("AI parameters updated successfully:", responseData);
      setStatusWithLoading("AI parameters updated - processing...");
      
      // Give some time for the parameters to take effect
      setTimeout(() => {
        if (isStreaming) {
          setStatusWithLoading("Streaming live! AI effects active.");
        }
      }, 3000);
      
    } catch (e: any) {
      console.error("Parameter update failed:", e);
      setError(e?.message || "Unknown error");
      setStatusWithLoading(`Parameter update failed: ${e?.message || "Unknown error"}`);
    }
  }, [params, setStatusWithLoading, externalStreamId, externalApiKey, streamId, checkStreamHealth, isStreaming]);

  const startStream = useCallback(async () => {
    const rawKey = externalApiKey || apiKeyRef.current?.value || "";
    const apiKey = rawKey.replace(/^Bearer\s+/i, "").trim();
    const pipelineId = pipelineIdRef.current?.value.trim() || "";
    if (!apiKey) { setError("Enter your API key."); return; }
    if (apiKey.length < 16) {
      setError("API key looks too short. Paste the raw key (no 'Bearer').");
      return;
    }
    if (!pipelineId) { setError("Enter a pipeline id."); return; }
    setStatusWithLoading("Starting stream...");
    try {
      try {
        const masked = apiKey.length >= 8 ? `${apiKey.slice(0, 4)}…${apiKey.slice(-4)}` : "(short)";
        console.debug("[Daydream] Using API key (masked):", masked);
      } catch {}
      // Create stream with correct API structure as per Daydream documentation
      const createStreamBody = {
        pipeline_id: pipelineId,
        prompt: daydreamPrompt || params.params.prompt || "green slimey monster",
        pipeline_params: {
          model_id: "stabilityai/sd-turbo",
          prompt: daydreamPrompt || params.params.prompt || "green slimey monster",
          prompt_interpolation_method: "slerp",
          normalize_prompt_weights: true,
          normalize_seed_weights: true,
          negative_prompt: "blurry, low quality, flat, 2d",
          num_inference_steps: 50,
          seed: 42,
          t_index_list: [0, 8, 17],
          controlnets: [
            {
              conditioning_scale: 0,
              control_guidance_end: 1,
              control_guidance_start: 0,
              enabled: true,
              model_id: "thibaud/controlnet-sd21-openpose-diffusers",
              preprocessor: "pose_tensorrt",
              preprocessor_params: {}
            },
            {
              conditioning_scale: 0,
              control_guidance_end: 1,
              control_guidance_start: 0,
              enabled: true,
              model_id: "thibaud/controlnet-sd21-hed-diffusers",
              preprocessor: "soft_edge",
              preprocessor_params: {}
            },
            {
              conditioning_scale: 0,
              control_guidance_end: 1,
              control_guidance_start: 0,
              enabled: true,
              model_id: "thibaud/controlnet-sd21-canny-diffusers",
              preprocessor: "canny",
              preprocessor_params: {
                high_threshold: 200,
                low_threshold: 100
              }
            },
            {
              conditioning_scale: 0,
              control_guidance_end: 1,
              control_guidance_start: 0,
              enabled: true,
              model_id: "thibaud/controlnet-sd21-depth-diffusers",
              preprocessor: "depth_tensorrt",
              preprocessor_params: {}
            },
            {
              conditioning_scale: 0,
              control_guidance_end: 1,
              control_guidance_start: 0,
              enabled: true,
              model_id: "thibaud/controlnet-sd21-color-diffusers",
              preprocessor: "passthrough",
              preprocessor_params: {}
            }
          ]
        }
      };
      
      console.log("Creating stream with params:", createStreamBody);
      
      const response = await fetch(`${API_BASE_URL}/v1/streams`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json", 
          "Authorization": `Bearer ${apiKey}` 
        },
        body: JSON.stringify(createStreamBody),
      });
      if (!response.ok) {
        if (response.status === 401) {
          setError("401 Invalid access token. Paste the raw API key (no 'Bearer') or regenerate it.");
          setStatusWithLoading("Error: Unauthorized (check API key)");
          return;
        }
        const error = await response.json().catch(() => ({}));
        throw new Error(`API Error: ${error.message || response.statusText}`);
      }
      const streamData = await response.json();
      console.log("Stream created successfully:", streamData);
      console.log("Stream ID:", streamData.id);
      console.log("WHIP URL:", streamData.whip_url);
      console.log("Output Playback ID:", streamData.output_playback_id);
      console.log("Full response keys:", Object.keys(streamData));
      console.log("Full response structure:", JSON.stringify(streamData, null, 2));
      
      // Check if the response has the expected structure
      if (!streamData.id) {
        throw new Error(`Missing stream ID in response: ${JSON.stringify(streamData)}`);
      }
      if (!streamData.whip_url) {
        console.error("Missing whip_url in response. Available keys:", Object.keys(streamData));
        console.error("Full response:", JSON.stringify(streamData, null, 2));
        
      // Construct WHIP URL from stream_key if whip_url is missing
      if (streamData.stream_key) {
        const whipUrl = `https://ai.livepeer.com/live/video-to-video/${streamData.stream_key}/whip`;
        console.log(`Constructed WHIP URL from stream_key:`, whipUrl);
        streamData.whip_url = whipUrl;
      } else {
        // Check for alternative field names as fallback
        const possibleWhipFields = ['whipUrl', 'whip_endpoint', 'ingest_url'];
        let foundWhipUrl = null;
        for (const field of possibleWhipFields) {
          if (streamData[field]) {
            console.log(`Found WHIP URL in field '${field}':`, streamData[field]);
            foundWhipUrl = streamData[field];
            break;
          }
        }
        
        if (foundWhipUrl) {
          streamData.whip_url = foundWhipUrl;
        } else {
          throw new Error(`Missing WHIP URL and stream_key in response. Available fields: ${Object.keys(streamData).join(', ')}`);
        }
      }
      }
      if (!streamData.output_playback_id) {
        throw new Error(`Missing output_playback_id in response: ${JSON.stringify(streamData)}`);
      }
      
      setStreamId(streamData.id);
      setWhipUrl(streamData.whip_url);
      setPlaybackId(streamData.output_playback_id);
      try { onStreamIdChange?.(streamData.id); } catch {}

      console.log("Requesting webcam access...");
      const media = await navigator.mediaDevices.getUserMedia({ 
        video: { width: { ideal: 1280 }, height: { ideal: 720 } }, 
        audio: false 
      });

      // Verify we got video tracks
      const videoTracks = media.getVideoTracks();
      const audioTracks = media.getAudioTracks();
      console.log(`Got ${videoTracks.length} video tracks and ${audioTracks.length} audio tracks`);
      
      if (videoTracks.length === 0) {
        throw new Error("No video tracks available from webcam. Please check camera permissions.");
      }

      // Set contentHint on the video track for better motion handling
      try {
        const vtrack = videoTracks[0] as any;
        if (vtrack && vtrack.contentHint !== undefined) {
          vtrack.contentHint = "motion";
        }
        console.log("Video track settings:", vtrack.getSettings());
      } catch {}

      // Add a silent audio track to improve WHIP compatibility and downstream expectations
      try {
        const silent = createSilentAudioTrack();
        media.addTrack(silent);
        console.log("Added silent audio track");
      } catch {}

      localStreamRef.current = media;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = media;
        console.log("Local video element updated with stream");
      }

      // Wait a bit before starting WHIP to ensure stream is ready
      setStatusWithLoading("Preparing stream...");
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Pass the WHIP URL directly instead of relying on state
      await startWhipClient(streamData.whip_url);
      
      // Wait a moment before mounting the player to ensure stream is ready
      setTimeout(() => {
        mountPlayerIframe(streamData.output_playback_id);
      }, 2000);
      
      setIsStreaming(true);
      setPipelineInitializing(true);
      setStatusWithLoading("Initializing AI pipeline (30-60 seconds)...");
      
      // Enhanced AI pipeline initialization with fallback approach
      const initializePipeline = async (retries = 10, delay = 3000) => {
        console.log(`Initializing AI pipeline (attempt ${11 - retries}/10)`);
        setStatusWithLoading(`Initializing AI pipeline... (${11 - retries}/10)`);
        
        try {
          // Check stream status but don't block on it
          let streamReady = false;
          try {
            const streamStatus = await checkStreamHealth();
            if (streamStatus) {
              streamReady = streamStatus.status === 'active' || streamStatus.state === 'ready' || streamStatus.pipeline_status === 'active';
              console.log("Stream status check result:", streamStatus.status || streamStatus.state || 'unknown', "- Ready:", streamReady);
            } else {
              console.log("Stream status not available, proceeding anyway");
            }
          } catch (statusError) {
            console.log("Stream status check failed, proceeding anyway:", statusError);
          }
          
          // Always try to send parameters regardless of status check
          console.log("Sending AI pipeline parameters...");
          await updateApiParams();
          console.log("AI pipeline parameters sent successfully");
          setStatusWithLoading("AI pipeline connected! Processing...");
          
          // Give the pipeline time to process
          setTimeout(() => {
            if (isStreaming) {
              setPipelineInitializing(false);
              setStatusWithLoading("Streaming live! AI effects active.");
              // Start health monitoring once everything is working
              startHealthMonitoring();
            }
          }, 8000);
          
        } catch (e: any) {
          console.error("Pipeline initialization error:", e);
          
          // Retry for certain error types
          const retryableErrors = ['not ready', '404', '503', 'timeout', 'network'];
          const shouldRetry = retries > 0 && retryableErrors.some(errorType => 
            e.message?.toLowerCase().includes(errorType)
          );
          
          if (shouldRetry) {
            console.log(`Pipeline error (${e.message}), retrying in ${delay/1000}s... (${retries} retries left)`);
            setTimeout(() => initializePipeline(retries - 1, Math.min(delay + 1000, 8000)), delay);
          } else {
            console.error("Pipeline initialization failed after all retries:", e.message);
            setError(`AI pipeline initialization failed: ${e.message}`);
            setStatusWithLoading("AI pipeline failed to initialize");
            setPipelineInitializing(false);
          }
        }
      };
      
      // Start pipeline initialization after WebRTC is established
      setTimeout(() => initializePipeline(), 8000);
    } catch (e: any) {
      setError(e?.message || "Unknown error");
      setStatusWithLoading(`Error: ${e?.message || "Unknown error"}`);
      await stopStream();
    }
  }, [mountPlayerIframe, setStatusWithLoading, startWhipClient, updateApiParams, externalApiKey]);

  const startHealthMonitoring = useCallback(() => {
    if (healthMonitorRef.current) {
      clearInterval(healthMonitorRef.current);
    }
    
    console.log("Starting stream health monitoring");
    healthMonitorRef.current = setInterval(async () => {
      const currentStreamId = externalStreamId || streamId;
      if (!currentStreamId || !isStreaming) return;
      
      try {
        const streamStatus = await checkStreamHealth();
        
        if (streamStatus) {
          const isActive = streamStatus.status === 'active' || streamStatus.state === 'ready' || streamStatus.pipeline_status === 'active';
          
          if (!isActive && isStreaming) {
            console.warn("Stream has become inactive");
            setStatusWithLoading("Warning: AI pipeline inactive - effects may not be working");
          } else if (isActive && isStreaming && !pipelineInitializing) {
            setStatusWithLoading("Streaming live! AI effects active.");
          }
        } else {
          console.warn("Stream status not available");
          setStatusWithLoading("Warning: Cannot check stream status");
        }
      } catch (e) {
        console.warn("Health monitoring check failed:", e);
      }
    }, 15000); // Check every 15 seconds
  }, [externalStreamId, streamId, isStreaming, checkStreamHealth, pipelineInitializing]);

  const stopHealthMonitoring = useCallback(() => {
    if (healthMonitorRef.current) {
      clearInterval(healthMonitorRef.current);
      healthMonitorRef.current = null;
      console.log("Stopped stream health monitoring");
    }
  }, []);

  const startConnectionKeepalive = useCallback(() => {
    if (keepaliveRef.current) {
      clearInterval(keepaliveRef.current);
    }
    
    console.log("Starting WebRTC connection keepalive");
    keepaliveRef.current = setInterval(() => {
      if (rtcPeerConnectionRef.current) {
        const pc = rtcPeerConnectionRef.current;
        console.log(`Connection keepalive: ${pc.connectionState} / ${pc.iceConnectionState}`);
        
        // If connection is stable, log stats
        if (pc.connectionState === 'connected') {
          pc.getStats().then(stats => {
            stats.forEach(report => {
              if (report.type === 'outbound-rtp' && report.mediaType === 'video') {
                console.log(`Video stats: ${report.bytesSent} bytes sent, ${report.packetsSent} packets`);
              }
            });
          }).catch(e => console.warn("Stats error:", e));
        }
        
        // Monitor for connection issues
        if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
          console.warn("Keepalive detected connection issue");
        }
      }
    }, 10000); // Check every 10 seconds
  }, []);

  const stopConnectionKeepalive = useCallback(() => {
    if (keepaliveRef.current) {
      clearInterval(keepaliveRef.current);
      keepaliveRef.current = null;
      console.log("Stopped WebRTC connection keepalive");
    }
  }, []);

  const stopStream = useCallback(async () => {
    setStatusWithLoading("Stopping...");
    
    // Stop health monitoring and keepalive
    stopHealthMonitoring();
    stopConnectionKeepalive();
    stopConnectionHealthMonitoring();
    
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
      setPipelineInitializing(false);
      setStreamId(null);
      setWhipUrl(null);
      setPlaybackId(null);
      mountPlayerIframe(null);
      setStatusWithLoading("");
      try { onStreamIdChange?.(null); } catch {}
    }
  }, [mountPlayerIframe, setStatusWithLoading, stopHealthMonitoring, stopConnectionHealthMonitoring]);

  const handleParamChange = useCallback((key: keyof StreamParams["params"], value: any) => {
    setParams((prev) => ({ ...prev, params: { ...prev.params, [key]: value } }));
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    // Update parameters if we have a stream ID (either from external or local streaming)
    const currentStreamId = externalStreamId || streamId;
    if (currentStreamId) {
      debounceTimerRef.current = setTimeout(() => updateApiParams(), 350);
    }
  }, [externalStreamId, streamId, updateApiParams]);

  const handleControlNetChange = useCallback((index: number, value: number) => {
    setParams((prev) => ({
      ...prev,
      params: {
        ...prev.params,
        controlnets: prev.params.controlnets.map((cn, i) => i === index ? { ...cn, conditioning_scale: value } : cn),
      },
    }));
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    // Update parameters if we have a stream ID (either from external or local streaming)
    const currentStreamId = externalStreamId || streamId;
    if (currentStreamId) {
      debounceTimerRef.current = setTimeout(() => updateApiParams(), 350);
    }
  }, [externalStreamId, streamId, updateApiParams]);

  const handleDenoiseIndexChange = useCallback((index: number, value: number) => {
    setParams((prev) => ({
      ...prev,
      params: {
        ...prev.params,
        t_index_list: prev.params.t_index_list.map((v, i) => (i === index ? value : v)),
      },
    }));
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    // Update parameters if we have a stream ID (either from external or local streaming)
    const currentStreamId = externalStreamId || streamId;
    if (currentStreamId) {
      debounceTimerRef.current = setTimeout(() => updateApiParams(), 350);
    }
  }, [externalStreamId, streamId, updateApiParams]);

  // Sync external stream ID and API key with internal state
  useEffect(() => {
    if (externalStreamId && externalStreamId !== streamId) {
      setStreamId(externalStreamId);
      // If we have an external stream ID, we should try to get the playback ID
      // This would require an API call to get stream details, but for now we'll just use the stream ID
      setPlaybackId(externalStreamId); // This is a placeholder - ideally we'd fetch the actual playback ID
    }
  }, [externalStreamId, streamId]);

  // Sync external API key with internal input field
  useEffect(() => {
    if (externalApiKey && apiKeyRef.current) {
      apiKeyRef.current.value = externalApiKey;
    }
  }, [externalApiKey]);

  // Sync external prompt with internal state
  useEffect(() => {
    if (externalPrompt !== undefined && externalPrompt !== daydreamPrompt) {
      setDaydreamPrompt(externalPrompt);
    }
  }, [externalPrompt, daydreamPrompt]);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      stopHealthMonitoring();
      stopConnectionKeepalive();
      stopConnectionHealthMonitoring();
      stopStream();
      
      // Cleanup recording
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
      }
      if (mediaRecorderRef.current && isRecording) {
        mediaRecorderRef.current.stop();
      }
    };
  }, [stopStream, stopHealthMonitoring, stopConnectionKeepalive, stopConnectionHealthMonitoring, isRecording]);

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
    const currentStreamId = externalStreamId || streamId;
    if (!currentStreamId || !isMicActive && !isDemoPlaying) return;
    // Use audio level to drive the last controlnet conditioning scale as a fun demo
    const scaled = Math.min(1, Math.max(0, audioLevel * 2 * audioReactivity));
    setParams((prev) => {
      const newParams = {
        ...prev,
        params: {
          ...prev.params,
          controlnets: prev.params.controlnets.map((cn, i) => 
            i === 4 ? { ...cn, conditioning_scale: scaled } : cn
          ),
        },
      };
      // Only update if value actually changed
      if (prev.params.controlnets[4].conditioning_scale !== scaled) {
        return newParams;
      }
      return prev;
    });
  }, [audioLevel, audioReactivity, externalStreamId, streamId, isMicActive, isDemoPlaying]);

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

  // Recording functionality
  const startRecording = useCallback(async () => {
    if (!playbackId || !isStreaming) {
      setError("Cannot start recording: No active stream");
      return;
    }

    try {
      // Try to use screen capture API first (better quality)
      let stream: MediaStream;
      
      try {
        // Request screen capture permission
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 }
          },
          audio: false
        });
        
        stream = screenStream;
        setClipStatus("Screen recording started - select the AI output window");
        
        // Handle when user stops sharing screen
        screenStream.getVideoTracks()[0].addEventListener('ended', () => {
          if (isRecording) {
            stopRecording();
          }
        });
        
      } catch (screenError) {
        console.log('Screen capture not available, falling back to canvas recording');
        
        // Fallback to canvas recording with placeholder content
        const canvas = document.createElement('canvas');
        canvas.width = 1280;
        canvas.height = 720;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          throw new Error("Canvas context not available");
        }

        stream = canvas.captureStream(30);
        setClipStatus("Canvas recording started - recording placeholder content");
        
        // Draw placeholder content
        const drawPlaceholder = () => {
          if (!isRecording) return;
          
          // Clear canvas
          ctx.fillStyle = '#000';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          
          // Draw recording indicator
          ctx.fillStyle = '#ff0000';
          ctx.beginPath();
          ctx.arc(50, 50, 15, 0, Math.PI * 2);
          ctx.fill();
          
          // Draw text
          ctx.fillStyle = '#fff';
          ctx.font = '24px Arial';
          ctx.textAlign = 'center';
          ctx.fillText('AI Output Recording', canvas.width / 2, canvas.height / 2 - 40);
          ctx.fillText('(Use screen recording for better quality)', canvas.width / 2, canvas.height / 2);
          ctx.fillText(`Recording: ${Math.floor((Date.now() - recordingStartTimeRef.current) / 1000)}s`, canvas.width / 2, canvas.height / 2 + 40);
          ctx.fillText(`Playback ID: ${playbackId}`, canvas.width / 2, canvas.height / 2 + 80);
          
          // Draw timestamp
          ctx.font = '16px Arial';
          ctx.fillText(new Date().toLocaleTimeString(), canvas.width / 2, canvas.height - 20);
          
          if (isRecording) {
            requestAnimationFrame(drawPlaceholder);
          }
        };
        
        drawPlaceholder();
      }
      
      // Set up MediaRecorder
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'video/webm;codecs=vp9'
      });

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordingChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(recordingChunksRef.current, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ai-output-${new Date().toISOString().replace(/[:.]/g, '-')}.webm`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        recordingChunksRef.current = [];
        setRecordingDuration(0);
        setClipStatus("Recording completed and downloaded!");
      };

      mediaRecorderRef.current = mediaRecorder;
      recordingChunksRef.current = [];
      recordingStartTimeRef.current = Date.now();
      
      // Start recording
      mediaRecorder.start(1000); // Collect data every second
      setIsRecording(true);

      // Start duration timer
      recordingIntervalRef.current = setInterval(() => {
        setRecordingDuration(Math.floor((Date.now() - recordingStartTimeRef.current) / 1000));
      }, 1000);

    } catch (error) {
      console.error('Recording start error:', error);
      setError(`Failed to start recording: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, [playbackId, isStreaming, isRecording]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setClipStatus("Recording stopped - processing...");
      
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
        recordingIntervalRef.current = null;
      }
    }
  }, [isRecording]);

  const createClip = useCallback(async () => {
    if (!playbackId || !isStreaming) {
      setError("Cannot create clip: No active stream");
      return;
    }

    setIsClipping(true);
    setClipStatus("Creating clip...");

    try {
      // Try to get Livepeer API key from environment variable first, then from input
      const envToken = import.meta.env.VITE_LIVEPEER_API_KEY as string | undefined;
      const rawKey = externalApiKey || apiKeyRef.current?.value || "";
      const apiKey = rawKey.replace(/^Bearer\s+/i, "").trim() || envToken;
      
      if (!apiKey) {
        throw new Error("Livepeer API key required for clipping. Set VITE_LIVEPEER_API_KEY in .env.local or enter it manually.");
      }

      // Get current time for clip (last 30 seconds)
      const endTime = Date.now();
      const startTime = endTime - 30000; // 30 seconds ago

      console.log('Creating clip with:', {
        startTime,
        endTime,
        playbackId,
        apiKeyPrefix: apiKey.substring(0, 8) + '...'
      });

      // Use Vercel function to avoid CORS issues
      const response = await fetch('/api/create-clip', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          startTime,
          endTime,
          playbackId,
          name: `AI Output Clip ${new Date().toISOString()}`
        })
      });

      console.log('Clip API response:', {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries())
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        console.error('Clip creation error response:', errorText);
        
        let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        try {
          const errorData = JSON.parse(errorText);
          errorMessage = errorData.message || errorData.error || errorMessage;
        } catch {
          errorMessage = errorText || errorMessage;
        }
        
        throw new Error(`Clip creation failed: ${errorMessage}`);
      }

      const clipData = await response.json();
      console.log('Clip creation success:', clipData);
      setClipStatus(`Clip created! Asset ID: ${clipData.asset?.id || 'Unknown'}`);
      
      // Monitor clip status
      if (clipData.asset?.id) {
        monitorClipStatus(clipData.asset.id, apiKey);
      }

    } catch (error) {
      console.error('Clip creation error:', error);
      setError(`Failed to create clip: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setClipStatus("Clip creation failed");
    } finally {
      setIsClipping(false);
    }
  }, [playbackId, isStreaming, externalApiKey]);

  const testLivepeerAPI = useCallback(async () => {
    try {
      const envToken = import.meta.env.VITE_LIVEPEER_API_KEY as string | undefined;
      const rawKey = externalApiKey || apiKeyRef.current?.value || "";
      const apiKey = rawKey.replace(/^Bearer\s+/i, "").trim() || envToken;
      
      if (!apiKey) {
        setError("No Livepeer API key found. Set VITE_LIVEPEER_API_KEY in .env.local or enter manually.");
        return;
      }

      setClipStatus("Testing Livepeer API connection...");
      
      // Use Vercel function to test API connection
      const response = await fetch('/api/test-api');

      console.log('Livepeer API test response:', {
        status: response.status,
        statusText: response.statusText
      });

      if (response.ok) {
        const data = await response.json();
        setClipStatus(`✅ Livepeer API key is valid! Found ${data.length || 0} assets.`);
      } else {
        const errorText = await response.text().catch(() => '');
        setError(`Livepeer API test failed: ${response.status} ${response.statusText} - ${errorText}`);
      }
    } catch (error) {
      console.error('Livepeer API test error:', error);
      setError(`Livepeer API test error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, [externalApiKey]);

  const monitorClipStatus = useCallback(async (assetId: string, apiKey: string) => {
    const maxAttempts = 30; // 5 minutes max
    let attempts = 0;

    const checkStatus = async () => {
      try {
        // Use Vercel function to check asset status
        const response = await fetch(`/api/asset-status?assetId=${assetId}`);

        if (response.ok) {
          const assetData = await response.json();
          const status = assetData.status?.phase;

          if (status === 'ready') {
            setClipStatus(`Clip ready! Playback ID: ${assetData.playbackId}`);
            // You could automatically download or provide a link here
            return;
          } else if (status === 'failed') {
            setClipStatus("Clip processing failed");
            return;
          }
        }

        attempts++;
        if (attempts < maxAttempts) {
          setTimeout(checkStatus, 10000); // Check every 10 seconds
        } else {
          setClipStatus("Clip status check timeout");
        }
      } catch (error) {
        console.error('Clip status check error:', error);
        attempts++;
        if (attempts < maxAttempts) {
          setTimeout(checkStatus, 10000);
        }
      }
    };

    checkStatus();
  }, []);

  // Daydream prompt submission
  const handleSubmitPrompt = useCallback(async () => {
    setPromptStatus("");
    const currentStreamId = externalStreamId || streamId;
    if (!currentStreamId?.trim()) {
      setPromptStatus("Enter a Stream ID.");
      return;
    }
    if (!daydreamPrompt.trim()) {
      setPromptStatus("Enter a prompt.");
      return;
    }
    const envToken = import.meta.env.VITE_DAYDREAM_API_TOKEN as string | undefined;
    const rawKey = externalApiKey || apiKeyRef.current?.value || "";
    const apiKey = rawKey.replace(/^Bearer\s+/i, "").trim() || envToken;
    if (!apiKey) {
      setPromptStatus("Enter an API key or set VITE_DAYDREAM_API_TOKEN.");
      return;
    }
    setIsSubmittingPrompt(true);
    setPromptStatus("Submitting...");
    try {
      const response = await fetch('/api/update-stream-prompts', {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          streamId: currentStreamId,
          prompts: {
            model_id: "streamdiffusion",
            pipeline: "live-video-to-video",
            params: {
              model_id: "stabilityai/sd-turbo",
              prompt: daydreamPrompt || params.params.prompt,
              prompt_interpolation_method: "slerp",
              normalize_prompt_weights: true,
              normalize_seed_weights: true,
              negative_prompt: "blurry, low quality, flat, 2d",
              num_inference_steps: 50,
              seed: 42,
              t_index_list: [0, 8, 17],
              controlnets: [
                {
                  conditioning_scale: 0,
                  control_guidance_end: 1,
                  control_guidance_start: 0,
                  enabled: true,
                  model_id: "thibaud/controlnet-sd21-openpose-diffusers",
                  preprocessor: "pose_tensorrt",
                  preprocessor_params: {}
                },
                {
                  conditioning_scale: 0,
                  control_guidance_end: 1,
                  control_guidance_start: 0,
                  enabled: true,
                  model_id: "thibaud/controlnet-sd21-hed-diffusers",
                  preprocessor: "soft_edge",
                  preprocessor_params: {}
                },
                {
                  conditioning_scale: 0,
                  control_guidance_end: 1,
                  control_guidance_start: 0,
                  enabled: true,
                  model_id: "thibaud/controlnet-sd21-canny-diffusers",
                  preprocessor: "canny",
                  preprocessor_params: {
                    high_threshold: 200,
                    low_threshold: 100
                  }
                },
                {
                  conditioning_scale: 0,
                  control_guidance_end: 1,
                  control_guidance_start: 0,
                  enabled: true,
                  model_id: "thibaud/controlnet-sd21-depth-diffusers",
                  preprocessor: "depth_tensorrt",
                  preprocessor_params: {}
                },
                {
                  conditioning_scale: 0,
                  control_guidance_end: 1,
                  control_guidance_start: 0,
                  enabled: true,
                  model_id: "thibaud/controlnet-sd21-color-diffusers",
                  preprocessor: "passthrough",
                  preprocessor_params: {}
                }
              ]
            }
          }
        }),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(`API Error: ${error.message || response.statusText}`);
      }
      setPromptStatus("Prompt submitted successfully!");
    } catch (e: any) {
      setPromptStatus(`Error: ${e?.message || "Unknown error"}`);
    } finally {
      setIsSubmittingPrompt(false);
    }
  }, [externalStreamId, streamId, daydreamPrompt, externalApiKey]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="lg:col-span-3 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-xl border border-gray-800 overflow-hidden bg-gray-900/70">
            <div className="flex items-center justify-between text-xs text-gray-400 px-3 py-2 border-b border-gray-800">
              <span>Your Webcam</span>
              <span className="inline-flex items-center rounded-full bg-gray-800 px-2 py-0.5 text-[10px] text-gray-300">
                {localStreamRef.current ? "active" : "input"}
              </span>
            </div>
            <div className="relative">
              <video ref={localVideoRef} playsInline autoPlay muted className="w-full h-64 bg-black" />
              {!localStreamRef.current && isStreaming && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                  <div className="text-center text-white">
                    <div className="text-sm mb-1">Waiting for webcam...</div>
                    <div className="text-xs text-gray-300">Check permissions</div>
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="rounded-xl border border-gray-800 overflow-hidden bg-gray-900/70 relative">
            <div className="flex items-center justify-between text-xs text-gray-400 px-3 py-2 border-b border-gray-800">
              <span>AI Output</span>
              <span className="text-[11px] text-gray-500">{playbackId ? `Playback: ${playbackId}` : "No playback"}</span>
            </div>
            <div ref={outputContainerRef} className="w-full h-64 bg-black grid place-items-center">
              <div ref={outputPlaceholderRef} className="text-center">
                {isStreaming && !playbackId ? (
                  <>
                    <div className="text-sm text-gray-400 mb-2">Creating stream...</div>
                    <div className="text-xs text-gray-500">This may take a moment</div>
                  </>
                ) : !isStreaming ? (
                  <div className="text-sm text-gray-500">Start the stream to see output</div>
                ) : null}
              </div>
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

        {/* Right Side Controls */}
        <div className="lg:col-span-1 space-y-4">
          {/* API Configuration Section */}
          <div className="rounded-xl border border-gray-800 bg-gray-900/70 p-4 space-y-3">
            <h4 className="text-sm font-semibold">API Configuration</h4>
            <div className="space-y-2">
              <div>
                <label className="block text-xs text-gray-400 mb-1">API Key</label>
                <input ref={apiKeyRef} type="password" placeholder="REPLACE WITH YOUR API KEY" className="w-full rounded bg-gray-800 border border-gray-700 px-3 py-2 text-sm cursor-pointer" />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Pipeline ID</label>
                <input ref={pipelineIdRef} type="text" defaultValue="pip_qpUgXycjWF6YMeSL" className="w-full rounded bg-gray-800 border border-gray-700 px-3 py-2 text-sm cursor-pointer" />
              </div>
            </div>
          </div>

          {/* Stream Controls */}
          <div className="rounded-xl border border-gray-800 bg-gray-900/70 p-4 space-y-3">
            <h4 className="text-sm font-semibold">Stream Controls</h4>
            <div className="grid grid-cols-1 gap-2">
              <button onClick={() => (isStreaming ? stopStream() : startStream())} className={`w-full py-2 px-4 rounded-lg font-medium transition-colors cursor-pointer bg-gradient-to-r ${isStreaming ? "from-rose-600 to-red-700 hover:from-rose-600/90 hover:to-red-700/90" : "from-indigo-600 to-violet-700 hover:from-indigo-600/90 hover:to-violet-700/90"}`}>{isStreaming ? "Stop" : "Start"}</button>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Status</label>
                <div className="text-xs">
                  {error ? (
                    <span className="inline-flex items-center rounded-full bg-rose-500/15 text-rose-300 border border-rose-500/30 px-2 py-0.5">{error}</span>
                  ) : pipelineInitializing ? (
                    <span className="inline-flex items-center rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 px-2 py-0.5">
                      <svg className="animate-spin -ml-0.5 mr-1.5 h-3 w-3 text-amber-300" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      {status}
                    </span>
                  ) : isStreaming ? (
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 border ${
                      status?.includes("live") && !status?.includes("failed") && !status?.includes("lost") && !status?.includes("reconnect") 
                        ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" 
                        : status?.includes("failed") || status?.includes("lost") || status?.includes("error")
                        ? "bg-red-500/15 text-red-300 border-red-500/30"
                        : "bg-yellow-500/15 text-yellow-300 border-yellow-500/30"
                    }`}>{status || "Streaming live!"}</span>
                  ) : (
                    <span className="inline-flex items-center rounded-full bg-gray-800 text-gray-300 border border-gray-700 px-2 py-0.5">Idle</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Debug and Network Configuration */}
          <div className="rounded-xl border border-gray-800 bg-gray-900/70 p-4 space-y-3">
            <h4 className="text-sm font-semibold">Debug & Network</h4>
            <div className="flex items-center gap-2 mb-3">
              <input
                type="checkbox"
                id="debugMode"
                checked={debugMode}
                onChange={(e) => setDebugMode(e.target.checked)}
                className="rounded cursor-pointer"
              />
              <label htmlFor="debugMode" className="text-xs font-medium text-gray-300">
                🐛 Debug Mode
              </label>
            </div>
            
            <div className="grid grid-cols-2 gap-2 mb-3">
              <button
                onClick={testWebRTCConnectivity}
                className="px-3 py-2 rounded bg-orange-600 hover:bg-orange-700 text-white font-medium text-xs transition-colors cursor-pointer"
              >
                🧪 Test WebRTC
              </button>
              <button
                onClick={() => streamId && fetchStreamStatus(streamId)}
                disabled={!streamId}
                className="px-3 py-2 rounded bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-medium text-xs transition-colors cursor-pointer"
              >
                📊 Refresh Metrics
              </button>
            </div>
            
            {/* Connection Quality Indicator */}
            {isStreaming && (
              <div className="mb-3 p-2 rounded bg-gray-800/50 border border-gray-700">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-400">Connection Quality</span>
                  <span className={`text-xs font-medium ${
                    connectionQuality === 'excellent' ? 'text-green-400' :
                    connectionQuality === 'good' ? 'text-yellow-400' :
                    connectionQuality === 'poor' ? 'text-orange-400' :
                    'text-red-400'
                  }`}>
                    {connectionQuality === 'excellent' ? '🟢 Excellent' :
                     connectionQuality === 'good' ? '🟡 Good' :
                     connectionQuality === 'poor' ? '🟠 Poor' :
                     '🔴 Failed'}
                  </span>
                </div>
                <div className="text-xs text-gray-500 mb-2">
                  {connectionQuality === 'excellent' && 'Stable connection, optimal performance'}
                  {connectionQuality === 'good' && 'Good connection, minor issues may occur'}
                  {connectionQuality === 'poor' && 'Poor connection, frequent issues expected'}
                  {connectionQuality === 'failed' && 'Connection failed, restart recommended'}
                </div>
                
                {/* Detailed Metrics */}
                {streamMetrics && (
                  <details className="text-xs">
                    <summary className="cursor-pointer text-gray-400 hover:text-white mb-1">
                      📊 Network Metrics
                    </summary>
                    <div className="mt-1 space-y-1 text-gray-500">
                      <div className="flex justify-between">
                        <span>Video Loss:</span>
                        <span className={streamMetrics.video.packet_loss_pct > 2 ? 'text-red-400' : streamMetrics.video.packet_loss_pct > 0.5 ? 'text-yellow-400' : 'text-green-400'}>
                          {streamMetrics.video.packet_loss_pct.toFixed(2)}%
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Audio Loss:</span>
                        <span className={streamMetrics.audio.packet_loss_pct > 2 ? 'text-red-400' : streamMetrics.audio.packet_loss_pct > 0.5 ? 'text-yellow-400' : 'text-green-400'}>
                          {streamMetrics.audio.packet_loss_pct.toFixed(2)}%
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Video Jitter:</span>
                        <span className={streamMetrics.video.jitter > 20 ? 'text-red-400' : streamMetrics.video.jitter > 10 ? 'text-yellow-400' : 'text-green-400'}>
                          {streamMetrics.video.jitter.toFixed(1)}ms
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Audio Jitter:</span>
                        <span className={streamMetrics.audio.jitter > 50 ? 'text-red-400' : streamMetrics.audio.jitter > 20 ? 'text-yellow-400' : 'text-green-400'}>
                          {streamMetrics.audio.jitter.toFixed(1)}ms
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Data Received:</span>
                        <span className="text-blue-400">
                          {(streamMetrics.bytesReceived / 1024 / 1024).toFixed(1)}MB
                        </span>
                      </div>
                    </div>
                  </details>
                )}
              </div>
            )}
            
            <details className="text-xs">
              <summary className="cursor-pointer text-gray-400 hover:text-white mb-2">
                ⚙️ Network Settings
              </summary>
              <div className="space-y-2">
                <div>
                  <label className="block text-xs font-medium mb-1 text-gray-400">TURN Server</label>
                  <input
                    type="text"
                    value={customTurnServer}
                    onChange={(e) => setCustomTurnServer(e.target.value)}
                    placeholder="turn:server.com:3478"
                    className="w-full rounded bg-gray-800 border border-gray-700 px-2 py-1 text-xs cursor-pointer"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium mb-1 text-gray-400">Username</label>
                    <input
                      type="text"
                      value={turnUsername}
                      onChange={(e) => setTurnUsername(e.target.value)}
                      placeholder="username"
                      className="w-full rounded bg-gray-800 border border-gray-700 px-2 py-1 text-xs cursor-pointer"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1 text-gray-400">Password</label>
                    <input
                      type="password"
                      value={turnPassword}
                      onChange={(e) => setTurnPassword(e.target.value)}
                      placeholder="password"
                      className="w-full rounded bg-gray-800 border border-gray-700 px-2 py-1 text-xs cursor-pointer"
                    />
                  </div>
                </div>
              </div>
            </details>
          </div>

          {/* Daydream Prompt Section */}
          <div className="rounded-xl border border-gray-800 bg-gray-900/70 p-4 space-y-3">
            <h4 className="text-sm font-semibold">AI Generation</h4>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Prompt</label>
              <textarea
                value={daydreamPrompt}
                onChange={(e) => {
                  setDaydreamPrompt(e.target.value);
                  onPromptChange?.(e.target.value);
                }}
                placeholder="Describe what to generate..."
                rows={3}
                className="w-full rounded bg-gray-800 border border-gray-700 px-3 py-2 text-sm"
              />
            </div>
            <button
              onClick={handleSubmitPrompt}
              disabled={isSubmittingPrompt}
              className={`w-full py-2 px-3 rounded text-sm font-medium transition-colors ${
                isSubmittingPrompt ? "bg-gray-700" : "bg-indigo-600 hover:bg-indigo-700"
              }`}
            >
              {isSubmittingPrompt ? "Submitting..." : "Submit Prompt"}
            </button>
            {promptStatus && (
              <p className="text-xs text-center text-gray-400">{promptStatus}</p>
            )}
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
              <button onClick={() => (isMicActive ? stopMicrophone() : startMicrophone())} className={`w-full py-2 px-3 rounded-lg text-sm font-medium cursor-pointer ${isMicActive ? "bg-rose-600 hover:bg-rose-700" : "bg-gray-800 hover:bg-gray-700"}`}>{isMicActive ? "Stop Microphone" : "Use Microphone"}</button>
              {isDemoPlaying ? (
                <button onClick={stopDemoAudio} className="w-full py-2 px-3 rounded-lg text-sm font-medium cursor-pointer bg-rose-600 hover:bg-rose-700">Stop Audio</button>
              ) : (
                <label className="w-full">
                  <span className="block w-full py-2 px-3 rounded-lg text-sm font-medium text-center cursor-pointer bg-gray-800 hover:bg-gray-700">Upload Audio</span>
                  <input type="file" accept="audio/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleAudioFile(f); }} />
                </label>
              )}
            </div>
            <label className="block text-xs text-gray-400 mb-1">Audio Reactivity: {audioReactivity.toFixed(2)}</label>
            <input type="range" min={0} max={1.5} step={0.01} value={audioReactivity} onChange={(e) => setAudioReactivity(Number(e.target.value))} className="w-full cursor-pointer" />
            <p className="text-[11px] text-gray-500">How much audio affects the AI rendering</p>
          </div>

          {/* Recording & Clipping Controls */}
          <div className="rounded-xl border border-gray-800 bg-gray-900/70 p-4 space-y-3">
            <h4 className="text-sm font-semibold">Recording & Clipping</h4>
            
            {/* Local Recording Controls */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400">Local Recording</span>
                {isRecording && (
                  <span className="text-xs text-red-400 flex items-center gap-1">
                    <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                    {Math.floor(recordingDuration / 60)}:{(recordingDuration % 60).toString().padStart(2, '0')}
                  </span>
                )}
              </div>
               <div className="grid grid-cols-2 gap-2">
                 <button
                   onClick={isRecording ? stopRecording : startRecording}
                   disabled={!isRecording && (!isStreaming || !playbackId)}
                   className={`w-full py-2 px-3 rounded text-sm font-medium transition-colors cursor-pointer ${
                     isRecording 
                       ? "bg-red-600 hover:bg-red-700" 
                       : "bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed"
                   }`}
                 >
                   {isRecording ? "⏹ Stop Recording" : "⏺ Start Recording"}
                 </button>
                 <button
                   onClick={createClip}
                   disabled={!isStreaming || !playbackId || isClipping}
                   className="w-full py-2 px-3 rounded text-sm font-medium bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors cursor-pointer"
                 >
                   {isClipping ? "Creating..." : "📹 Create Clip"}
                 </button>
               </div>
               <div className="grid grid-cols-1 gap-2">
                 <button
                   onClick={testLivepeerAPI}
                   className="w-full py-2 px-3 rounded text-sm font-medium bg-purple-600 hover:bg-purple-700 transition-colors cursor-pointer"
                 >
                   🧪 Test Livepeer API
                 </button>
               </div>
               <p className="text-[11px] text-gray-500">
                 Recording uses screen capture for best quality. Clipping creates a server-side clip of the last 30 seconds.
               </p>
               {import.meta.env.VITE_LIVEPEER_API_KEY && (
                 <p className="text-[11px] text-green-400">
                   ✅ Livepeer API key loaded from environment
                 </p>
               )}
            </div>

            {/* Status Display */}
            {(clipStatus || isRecording) && (
              <div className="p-2 rounded bg-gray-800/50 border border-gray-700">
                <div className="text-xs text-gray-400 mb-1">Status</div>
                <div className="text-xs text-gray-200">
                  {isRecording && (
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                      Recording in progress...
                    </div>
                  )}
                  {clipStatus && (
                    <div className="text-gray-300">{clipStatus}</div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Advanced Parameters */}
          <div className="rounded-xl border border-gray-800 bg-gray-900/70 p-4 space-y-3">
            <h4 className="text-sm font-semibold">Advanced Parameters</h4>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Steps: {params.params.num_inference_steps}</label>
                <input type="range" min={1} max={100} step={1} value={params.params.num_inference_steps} onChange={(e) => handleParamChange("num_inference_steps", Number(e.target.value))} className="w-full cursor-pointer" />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Seed</label>
                <input type="number" value={params.params.seed} onChange={(e) => handleParamChange("seed", Number(e.target.value))} className="w-full rounded bg-gray-800 border border-gray-700 px-3 py-2 text-sm cursor-pointer" />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">t_index_list</label>
                <input type="text" value={params.params.t_index_list.join(",")} onChange={(e) => handleParamChange("t_index_list", e.target.value.split(",").map((v) => Number(v.trim())).filter((v) => Number.isFinite(v)))} className="w-full rounded bg-gray-800 border border-gray-700 px-3 py-2 text-sm cursor-pointer" />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between mb-2">
                <h5 className="text-xs font-semibold">Denoise</h5>
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
              <h5 className="text-xs font-semibold mb-2">ControlNets</h5>
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
                  <input type="range" min={0} max={1} step={0.01} value={params.params.controlnets[i]?.conditioning_scale || 0} onChange={(e) => handleControlNetChange(i, Number(e.target.value))} className="w-full cursor-pointer" />
                </div>
              ))}
            </div>
          </div>

          {/* Fluid Controls Section */}
          <FluidControls 
            onStreamReady={(stream) => {
              // Handle stream ready if needed
              console.log("Fluid controls stream ready:", stream);
            }}
            className="space-y-4"
          />
        </div>

        <div className="lg:col-span-3 space-y-3">
          {/* Speech Recognition & Text Layers */}
          <div className="rounded-xl border w-full border-gray-800 bg-gray-900/70 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold">Speech Recognition & Text Layers</h4>
              <div className="flex gap-2">
                <button onClick={() => (isRecognizing ? stopRecognition() : startRecognition())} className={`py-1.5 px-3 rounded text-xs font-medium cursor-pointer ${isRecognizing ? "bg-rose-600 hover:bg-rose-700" : "bg-gray-800 hover:bg-gray-700"}`}>{isRecognizing ? "Stop" : "Start Recognition"}</button>
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
                <select value={recognitionLang} onChange={(e) => setRecognitionLang(e.target.value)} className="w-full rounded bg-gray-800 border border-gray-700 px-2 py-1 text-xs cursor-pointer">
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
                <select value={fontFamily} onChange={(e) => setFontFamily(e.target.value)} className="w-full rounded bg-gray-800 border border-gray-700 px-2 py-1 text-xs cursor-pointer">
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
                <input type="range" min={10} max={72} value={fontSize} onChange={(e) => setFontSize(Number(e.target.value))} className="w-full cursor-pointer" />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Text Opacity: {(textOpacity * 100).toFixed(0)}%</label>
                <input type="range" min={0} max={1} step={0.01} value={textOpacity} onChange={(e) => setTextOpacity(Number(e.target.value))} className="w-full cursor-pointer" />
              </div>
            </div>
            <label className="inline-flex items-center gap-2 text-xs text-gray-300">
              <input type="checkbox" className="accent-indigo-500 cursor-pointer" checked={showOverlay} onChange={(e) => setShowOverlay(e.target.checked)} />
              Show overlay on output
            </label>
            <div className="grid grid-cols-2 gap-3 items-center">
              <button onClick={() => setRecognizedText("")} className="py-1.5 px-3 rounded text-xs font-medium cursor-pointer bg-gray-800 hover:bg-gray-700">Clear</button>
              <button onClick={() => navigator.clipboard.writeText(recognizedText || "").catch(() => {})} className="py-1.5 px-3 rounded text-xs font-medium cursor-pointer bg-gray-800 hover:bg-gray-700">Copy</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default StreamRender;



