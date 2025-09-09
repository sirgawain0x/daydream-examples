import { useCallback, useRef, useState } from 'react';

interface RecordingManagerProps {
  playbackId: string | null;
  isStreaming: boolean;
  apiKey?: string;
}

interface RecordingState {
  isRecording: boolean;
  isClipping: boolean;
  duration: number;
  status: string;
}

export function useRecordingManager({ playbackId, isStreaming, apiKey }: RecordingManagerProps) {
  const [recordingState, setRecordingState] = useState<RecordingState>({
    isRecording: false,
    isClipping: false,
    duration: 0,
    status: 'Ready to record'
  });

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const recordingStartTimeRef = useRef<number>(0);
  const recordingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const updateStatus = useCallback((status: string) => {
    setRecordingState(prev => ({ ...prev, status }));
  }, []);

  const startRecording = useCallback(async () => {
    if (!playbackId || !isStreaming) {
      updateStatus('Cannot start recording: No active stream');
      return;
    }

    try {
      // Create a canvas for recording
      const canvas = document.createElement('canvas');
      canvas.width = 1280;
      canvas.height = 720;
      canvasRef.current = canvas;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('Canvas context not available');
      }

      // Create a stream from the canvas
      const stream = canvas.captureStream(30);
      
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
        setRecordingState(prev => ({ ...prev, duration: 0 }));
        updateStatus('Recording downloaded successfully!');
      };

      mediaRecorderRef.current = mediaRecorder;
      recordingChunksRef.current = [];
      recordingStartTimeRef.current = Date.now();
      
      // Start recording
      mediaRecorder.start(1000);
      setRecordingState(prev => ({ ...prev, isRecording: true }));
      updateStatus('Recording started...');
      
      // Start duration timer
      recordingIntervalRef.current = setInterval(() => {
        const duration = Math.floor((Date.now() - recordingStartTimeRef.current) / 1000);
        setRecordingState(prev => ({ ...prev, duration }));
        updateStatus(`Recording... ${Math.floor(duration / 60)}:${(duration % 60).toString().padStart(2, '0')}`);
      }, 1000);

      // Start capturing frames (this is a simplified approach)
      // In a real implementation, you'd need to capture the iframe content
      // which requires server-side proxy or browser extension due to CORS
      const captureFrame = () => {
        if (canvasRef.current && recordingState.isRecording) {
          // Draw a placeholder or try to capture iframe content
          // This is where the CORS limitation comes in
          ctx.fillStyle = '#000';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.fillStyle = '#fff';
          ctx.font = '24px Arial';
          ctx.textAlign = 'center';
          ctx.fillText('AI Output Recording', canvas.width / 2, canvas.height / 2);
          ctx.fillText('(Content capture limited by CORS)', canvas.width / 2, canvas.height / 2 + 40);
          ctx.fillText(`Recording: ${Math.floor(recordingState.duration / 60)}:${(recordingState.duration % 60).toString().padStart(2, '0')}`, canvas.width / 2, canvas.height / 2 + 80);
          
          animationFrameRef.current = requestAnimationFrame(captureFrame);
        }
      };
      
      captureFrame();

    } catch (error) {
      console.error('Recording start error:', error);
      updateStatus(`Failed to start recording: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, [playbackId, isStreaming, recordingState.duration, updateStatus]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && recordingState.isRecording) {
      mediaRecorderRef.current.stop();
      setRecordingState(prev => ({ ...prev, isRecording: false }));
      updateStatus('Processing recording...');
      
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
        recordingIntervalRef.current = null;
      }
      
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    }
  }, [recordingState.isRecording, updateStatus]);

  const createClip = useCallback(async () => {
    if (!playbackId || !isStreaming) {
      updateStatus('Cannot create clip: No active stream');
      return;
    }

    if (!apiKey) {
      updateStatus('API key required for clipping');
      return;
    }

    setRecordingState(prev => ({ ...prev, isClipping: true }));
    updateStatus('Creating clip...');

    try {
      // Get current time for clip (last 30 seconds)
      const endTime = Date.now();
      const startTime = endTime - 30000; // 30 seconds ago

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

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Clip creation failed: ${errorData.message || response.statusText}`);
      }

      const clipData = await response.json();
      updateStatus(`Clip created! Asset ID: ${clipData.asset?.id || 'Unknown'}`);
      
      // Monitor clip status
      if (clipData.asset?.id) {
        monitorClipStatus(clipData.asset.id, apiKey);
      }

    } catch (error) {
      console.error('Clip creation error:', error);
      updateStatus(`Failed to create clip: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setRecordingState(prev => ({ ...prev, isClipping: false }));
    }
  }, [playbackId, isStreaming, apiKey, updateStatus]);

  const monitorClipStatus = useCallback(async (assetId: string, _apiKey: string) => {
    const maxAttempts = 30; // 5 minutes max
    let attempts = 0;

    const checkStatus = async () => {
      try {
        const response = await fetch(`/api/asset-status?assetId=${assetId}`);

        if (response.ok) {
          const assetData = await response.json();
          const status = assetData.status?.phase;

          if (status === 'ready') {
            updateStatus(`Clip ready! Playback ID: ${assetData.playbackId}`);
            return;
          } else if (status === 'failed') {
            updateStatus('Clip processing failed');
            return;
          }
        }

        attempts++;
        if (attempts < maxAttempts) {
          setTimeout(checkStatus, 10000); // Check every 10 seconds
        } else {
          updateStatus('Clip status check timeout');
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
  }, [updateStatus]);

  const cleanup = useCallback(() => {
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    if (mediaRecorderRef.current && recordingState.isRecording) {
      mediaRecorderRef.current.stop();
    }
  }, [recordingState.isRecording]);

  return {
    recordingState,
    startRecording,
    stopRecording,
    createClip,
    cleanup
  };
}
