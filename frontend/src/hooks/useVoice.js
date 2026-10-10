import { useState, useEffect, useRef, useCallback } from 'react';

// ── Voice personas ────────────────────────────────────────────────────────────
export const VOICE_PERSONAS = [
  {
    id: 'soft_female',
    name: 'Aria',
    description: 'Soft & warm',
    emoji: '🌸',
    color: '#ec4899',
    prefer: ['Zira', 'Samantha', 'Victoria', 'Karen', 'Google US English Female', 'Microsoft Zira'],
    gender: 'female',
    rate: 0.88,
    pitch: 1.15,
  },
  {
    id: 'deep_male',
    name: 'Atlas',
    description: 'Deep & calm',
    emoji: '🌊',
    color: '#3b82f6',
    prefer: ['David', 'Mark', 'Alex', 'Daniel', 'Google UK English Male', 'Microsoft David'],
    gender: 'male',
    rate: 0.82,
    pitch: 0.78,
  },
  {
    id: 'calm_neutral',
    name: 'Sage',
    description: 'Clear & neutral',
    emoji: '✨',
    color: '#8b5cf6',
    prefer: ['Google US English', 'Microsoft Mark', 'Fred', 'Tom'],
    gender: 'neutral',
    rate: 0.95,
    pitch: 1.0,
  },
  {
    id: 'energetic_female',
    name: 'Nova',
    description: 'Bright & upbeat',
    emoji: '⚡',
    color: '#f59e0b',
    prefer: ['Moira', 'Tessa', 'Veena', 'Google UK English Female', 'Microsoft Hazel'],
    gender: 'female',
    rate: 1.08,
    pitch: 1.25,
  },
];

// ── Pick the best browser voice for a persona ─────────────────────────────────
function pickVoice(persona, availableVoices) {
  if (!availableVoices.length) return null;

  // 1. Exact name match
  for (const pref of persona.prefer) {
    const v = availableVoices.find(v => v.name.includes(pref));
    if (v) return v;
  }

  // 2. Gender match (en-* voices only)
  const enVoices = availableVoices.filter(v => v.lang.startsWith('en'));
  if (persona.gender === 'female') {
    const f = enVoices.find(v =>
      /female|woman|girl|zira|samantha|karen|victoria|nova|moira|tessa/i.test(v.name)
    );
    if (f) return f;
  }
  if (persona.gender === 'male') {
    const m = enVoices.find(v =>
      /male|man|david|mark|alex|daniel|fred|tom/i.test(v.name)
    );
    if (m) return m;
  }

  // 3. Fallback — first English voice
  return enVoices[0] || availableVoices[0];
}

// ── Main hook ─────────────────────────────────────────────────────────────────
export function useVoice() {
  const [voices, setVoices]             = useState([]);
  const [personaId, setPersonaId]       = useState('soft_female');
  const [isListening, setIsListening]   = useState(false);
  const [isSpeaking, setIsSpeaking]     = useState(false);
  const [transcript, setTranscript]     = useState('');
  const [supported, setSupported]       = useState(true);
  const [volume, setVolume]             = useState(0); // 0-1, mic level

  const recognitionRef  = useRef(null);
  const synthRef        = useRef(window.speechSynthesis);
  const volumeRef       = useRef(null);  // AudioContext for mic level
  const analyserRef     = useRef(null);
  const animFrameRef    = useRef(null);
  const onResultRef     = useRef(null);  // callback for final transcript
  // Single shared AudioContext for all TTS playback — created once, reused every response.
  // Creating a new one per call leaks contexts (Chrome caps ~6) and causes voice to die
  // after several minutes. We resume() before each use to handle browser suspension.
  const ttsCtxRef       = useRef(null);

  const persona = VOICE_PERSONAS.find(p => p.id === personaId) || VOICE_PERSONAS[0];

  // ── Load browser voices ───────────────────────────────────────────────────
  useEffect(() => {
    if (!('speechSynthesis' in window)) {
      setSupported(false);
      return;
    }

    function loadVoices() {
      const v = synthRef.current.getVoices();
      if (v.length) setVoices(v);
    }

    loadVoices();
    synthRef.current.onvoiceschanged = loadVoices;
    return () => { synthRef.current.onvoiceschanged = null; };
  }, []);

  // ── Mic level meter ───────────────────────────────────────────────────────
  async function startMicMeter() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ctx    = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      volumeRef.current  = { ctx, stream };
      analyserRef.current = analyser;

      const data = new Uint8Array(analyser.frequencyBinCount);
      function tick() {
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        setVolume(Math.min(avg / 80, 1));
        animFrameRef.current = requestAnimationFrame(tick);
      }
      tick();
    } catch {
      // Mic permission denied — still works, just no visual meter
    }
  }

  function stopMicMeter() {
    cancelAnimationFrame(animFrameRef.current);
    if (volumeRef.current) {
      volumeRef.current.stream.getTracks().forEach(t => t.stop());
      volumeRef.current.ctx.close();
      volumeRef.current = null;
    }
    setVolume(0);
  }

  // ── Speech recognition ────────────────────────────────────────────────────
  // onEnd(gotResult) — called whenever recognition stops, with whether we got speech
  const startListening = useCallback((onFinalResult, srLang = 'en-US', onEnd) => {
    if (!('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)) {
      setSupported(false);
      onEnd?.(false);
      return;
    }

    onResultRef.current = onFinalResult;

    synthRef.current.cancel();
    setIsSpeaking(false);

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SR();
    recognition.lang = srLang;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.continuous = false;

    let gotResult = false; // did we capture a final transcript?

    recognition.onstart = () => {
      setIsListening(true);
      setTranscript('');
      startMicMeter();
    };

    recognition.onresult = (e) => {
      let interim = '';
      let final   = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) final += t;
        else interim += t;
      }
      setTranscript(final || interim);
      if (final && onResultRef.current) {
        gotResult = true;
        onResultRef.current(final.trim());
      }
    };

    recognition.onend = () => {
      setIsListening(false);
      stopMicMeter();
      recognitionRef.current = null;
      onEnd?.(gotResult); // ← tell caller if we got speech or timed out
    };

    recognition.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        setSupported(false);
      }
      if (e.error !== 'aborted' && e.error !== 'no-speech') {
        console.error('Speech recognition error:', e.error);
      }
      setIsListening(false);
      stopMicMeter();
      recognitionRef.current = null;
      // Pass error type so caller can apply backoff on 'network' errors
      onEnd?.(false, e.error);
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch (err) {
      console.error('Failed to start recognition:', err);
      recognitionRef.current = null;
      onEnd?.(false);
    }
  }, []);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsListening(false);
    stopMicMeter();
  }, []);

  // ── ElevenLabs TTS (high-quality) ────────────────────────────────────────
  const elevenAudioRef = useRef(null);

  // Get (or create) the single shared TTS AudioContext.
  // Reusing one context for the entire session is the correct pattern —
  // creating a new one per call eventually exhausts Chrome's context limit
  // and causes audio + mic to silently die mid-call.
  function getTTSCtx() {
    if (!ttsCtxRef.current || ttsCtxRef.current.state === 'closed') {
      ttsCtxRef.current = new AudioContext();
    }
    // Browser may suspend the context during inactivity — resume before use
    if (ttsCtxRef.current.state === 'suspended') {
      ttsCtxRef.current.resume().catch(() => {});
    }
    return ttsCtxRef.current;
  }

  async function speakElevenLabs(text, personaId, onEnd, userId) {
    const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
    try {
      const resp = await fetch(`${BASE_URL}/api/tts/speak`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('vera_token') || ''}`,
        },
        body: JSON.stringify({ text, persona: personaId }),
      });

      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        if (data.useFallback) return false;
        return false;
      }

      const contentType = resp.headers.get('content-type') || '';
      if (!contentType.includes('audio')) {
        return false;
      }

      const arrayBuffer = await resp.arrayBuffer();

      // Use the shared context — no new context created, no leak possible
      const audioCtx = getTTSCtx();
      let decoded;
      try {
        decoded = await audioCtx.decodeAudioData(arrayBuffer);
      } catch {
        // decodeAudioData failed (corrupt audio) — fall back, shared ctx stays alive
        return false;
      }

      const source = audioCtx.createBufferSource();
      source.buffer = decoded;
      source.connect(audioCtx.destination);
      source.onended = () => {
        setIsSpeaking(false);
        elevenAudioRef.current = null;
        onEnd?.();
      };

      elevenAudioRef.current = { source, ctx: audioCtx };
      setIsSpeaking(true);
      source.start(0);
      return true;
    } catch {
      return false;
    }
  }

  function cancelElevenLabs() {
    if (elevenAudioRef.current) {
      try {
        // Stop the source node only — do NOT close the shared context
        elevenAudioRef.current.source.stop();
      } catch {}
      elevenAudioRef.current = null;
    }
  }

  // ── Text-to-speech (ElevenLabs → browser fallback) ───────────────────────
  const speak = useCallback((text, onEnd, userId) => {
    if (!text) return;

    synthRef.current?.cancel();
    cancelElevenLabs();

    const cleanText = text
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      .replace(/#{1,6}\s/g, '')
      .replace(/\n{2,}/g, '. ')
      .replace(/\n/g, ' ')
      .slice(0, 500);

    // Try ElevenLabs first (gender-aware voice + emotion-tuned settings)
    speakElevenLabs(cleanText, personaId, onEnd, userId).then(success => {
      if (!success) {
        // Browser TTS fallback
        if (!synthRef.current) { onEnd?.(); return; }
        const utterance = new SpeechSynthesisUtterance(cleanText);
        const voiceObj  = pickVoice(persona, voices);
        if (voiceObj) utterance.voice = voiceObj;
        utterance.rate   = persona.rate;
        utterance.pitch  = persona.pitch;
        utterance.volume = 1;
        utterance.onstart = () => setIsSpeaking(true);
        utterance.onend   = () => { setIsSpeaking(false); onEnd?.(); };
        utterance.onerror = () => { setIsSpeaking(false); onEnd?.(); };
        synthRef.current.speak(utterance);
      }
    });
  }, [persona, personaId, voices]);

  const cancelSpeech = useCallback(() => {
    synthRef.current?.cancel();
    cancelElevenLabs();
    setIsSpeaking(false);
  }, []);

  // ── Cleanup ───────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      stopListening();
      cancelSpeech();
      stopMicMeter();
      // Close the shared TTS AudioContext when the hook unmounts (call ends)
      ttsCtxRef.current?.close().catch(() => {});
      ttsCtxRef.current = null;
    };
  }, []);

  return {
    // State
    isListening,
    isSpeaking,
    transcript,
    supported,
    volume,
    personaId,
    persona,
    voices,
    // Actions
    setPersonaId,
    startListening,
    stopListening,
    speak,
    cancelSpeech,
  };
}
