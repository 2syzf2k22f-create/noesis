"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Audio level source for the orb.
 * - Mic: real microphone RMS (used while listening).
 * - attach(node): any WebAudio node, e.g. the TTS output in phase 6.
 * - Until TTS exists, speaking uses a synthetic speech-like envelope so the motion can be judged.
 */
export function useOrbAudio() {
  const ctxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const bufRef = useRef<Float32Array<ArrayBuffer> | null>(null);
  const [micOn, setMicOn] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);

  const stopMic = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    analyserRef.current = null;
    setMicOn(false);
  }, []);

  const startMic = useCallback(async () => {
    setMicError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ctx = ctxRef.current ?? new AudioContext();
      ctxRef.current = ctx;
      await ctx.resume();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      ctx.createMediaStreamSource(stream).connect(analyser);
      streamRef.current = stream;
      analyserRef.current = analyser;
      bufRef.current = new Float32Array(analyser.fftSize);
      setMicOn(true);
      return true;
    } catch {
      setMicError("Microphone unavailable or blocked");
      return false;
    }
  }, []);

  useEffect(() => () => { streamRef.current?.getTracks().forEach((t) => t.stop()); ctxRef.current?.close(); }, []);

  const micLevel = useCallback(() => {
    const a = analyserRef.current, buf = bufRef.current;
    if (!a || !buf) return 0;
    a.getFloatTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
    return Math.min(1, Math.sqrt(sum / buf.length) * 5);
  }, []);

  return { micOn, micError, startMic, stopMic, micLevel };
}

/** Speech-shaped envelope: syllables, phrases and pauses. Demo only. */
export function syntheticSpeech(t: number) {
  const syll = Math.pow(0.5 + 0.5 * Math.sin(t * 11.5 + Math.sin(t * 3.1) * 2), 1.6);
  const phrase = 0.55 + 0.45 * Math.sin(t * 2.1 + 1);
  const pause = Math.sin(t * 0.9) > -0.72 ? 1 : 0.05;
  return Math.min(1, syll * phrase * pause * 0.95);
}
