import React, { useState, useEffect, useRef } from 'react';

// Nombres de las 12 notas musicales en notación latinoamericana (escala cromática)
const NOTE_NAMES = ["Do", "Do#", "Re", "Re#", "Mi", "Fa", "Fa#", "Sol", "Sol#", "La", "La#", "Si"];

// Convierte la frecuencia exactas a una de las 12 notas cromáticas (sin números de octava)
function frequencyToNote(frequency) {
  if (frequency <= 0) return null;
  const noteNum = 12 * (Math.log(frequency / 440) / Math.log(2)) + 69;
  const roundedNote = Math.round(noteNum);
  const noteIndex = (roundedNote % 12 + 12) % 12;

  return {
    name: NOTE_NAMES[noteIndex],
    frequency: Math.round(frequency * 10) / 10
  };
}

export default function App() {
  const [isListening, setIsListening] = useState(false);
  const [currentNote, setCurrentNote] = useState(null);
  const [detectedNotes, setDetectedNotes] = useState(new Set());
  const [detectedScale, setDetectedScale] = useState("Escuchando notas...");

  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const workerRef = useRef(null);
  const streamRef = useRef(null);
  const animationFrameRef = useRef(null);
  const canvasRef = useRef(null);

  const stableNoteRef = useRef({ name: null, count: 0 });

  useEffect(() => {
    workerRef.current = new Worker(new URL('./audioWorker.js', import.meta.url), { type: 'module' });

    workerRef.current.onmessage = (e) => {
      const { frequency } = e.data;
      if (frequency && frequency > 60 && frequency < 2000) {
        const noteInfo = frequencyToNote(frequency);
        if (noteInfo) {
          setCurrentNote(noteInfo);

          if (stableNoteRef.current.name === noteInfo.name) {
            stableNoteRef.current.count += 1;
          } else {
            stableNoteRef.current = { name: noteInfo.name, count: 1 };
          }

          if (stableNoteRef.current.count >= 3) {
            setDetectedNotes((prev) => new Set(prev).add(noteInfo.name));
          }
        }
      }
    };

    return () => {
      if (workerRef.current) workerRef.current.terminate();
    };
  }, []);

  // Deducción precisa de escalas tonales principales
  useEffect(() => {
    const notesArr = Array.from(detectedNotes);
    if (notesArr.length < 3) {
      setDetectedScale("Canta o toca al menos 3 notas...");
      return;
    }

    const has = (note) => notesArr.includes(note);

    if (has("Do") && has("Mi") && has("Sol")) {
      setDetectedScale("Escala Mayor de Do");
    } else if (has("La") && has("Do") && has("Mi")) {
      setDetectedScale("Escala Menor de La");
    } else if (has("Sol") && has("Si") && has("Re")) {
      setDetectedScale("Escala Mayor de Sol");
    } else if (has("Re") && has("Fa#") && has("La")) {
      setDetectedScale("Escala Mayor de Re");
    } else if (has("Re") && has("Fa") && has("La")) {
      setDetectedScale("Escala Menor de Re");
    } else {
      setDetectedScale(`Notas detectadas: ${notesArr.join(', ')}`);
    }
  }, [detectedNotes]);

  const startAudio = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      audioContextRef.current = audioCtx;

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      analyserRef.current = analyser;

      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);

      setIsListening(true);
      renderLoop();
    } catch (err) {
      alert("Error al acceder al micrófono: " + err.message);
    }
  };

  const renderLoop = () => {
    if (!analyserRef.current || !workerRef.current) return;

    const timeBuffer = new Float32Array(analyserRef.current.fftSize);
    analyserRef.current.getFloatTimeDomainData(timeBuffer);

    workerRef.current.postMessage({
      buffer: Array.from(timeBuffer),
      sampleRate: audioContextRef.current.sampleRate
    });

    const freqData = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(freqData);

    drawFFT(freqData);

    animationFrameRef.current = requestAnimationFrame(renderLoop);
  };

  const drawFFT = (freqData) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);

    const barWidth = (width / 64);
    let x = 0;

    for (let i = 0; i < 64; i++) {
      const barHeight = (freqData[i * 2] / 255) * height;

      const gradient = ctx.createLinearGradient(0, height, 0, 0);
      gradient.addColorStop(0, '#6366f1');
      gradient.addColorStop(1, '#a855f7');

      ctx.fillStyle = gradient;
      ctx.fillRect(x, height - barHeight, barWidth - 2, barHeight);

      x += barWidth;
    }
  };

  const stopAudio = () => {
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    if (streamRef.current) streamRef.current.getTracks().forEach((track) => track.stop());
    if (audioContextRef.current) audioContextRef.current.close();

    setIsListening(false);
    setCurrentNote(null);
  };

  const clearScale = () => {
    setDetectedNotes(new Set());
    setDetectedScale("Escuchando notas...");
    setCurrentNote(null);
    stableNoteRef.current = { name: null, count: 0 };

    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center p-6">
      <div className="max-w-lg w-full bg-slate-800 rounded-2xl shadow-2xl p-8 border border-slate-700 text-center">
        <h1 className="text-3xl font-bold mb-1 text-indigo-400">Reconocedor de Escala Tonal</h1>
        <p className="text-xs text-slate-400 mb-6">Web Audio API + FFT + Autocorrelación en Web Worker</p>

        {/* Visualizador de Espectro FFT */}
        <div className="mb-6 p-3 bg-slate-950 rounded-xl border border-slate-800 flex flex-col items-center">
          <div className="flex justify-between w-full px-2 mb-2">
            <span className="text-[10px] uppercase font-bold tracking-widest text-slate-500">Espectro FFT (Transformada de Fourier)</span>
            <span className="text-[10px] text-indigo-400 font-mono">2048 Bins</span>
          </div>
          <canvas ref={canvasRef} width={380} height={80} className="w-full h-20 rounded-lg bg-slate-900/50" />
        </div>

        {/* Visualizador de Nota Actual */}
        <div className="mb-6 p-4 bg-slate-950 rounded-xl border border-slate-800 flex flex-col items-center justify-center">
          <span className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold mb-1">Nota Detectada</span>
          <div className="text-5xl font-black text-indigo-400 min-h-[60px] flex items-center">
            {currentNote ? currentNote.name : "--"}
          </div>
          <span className="text-xs text-slate-400 mt-1 font-mono">
            {currentNote ? `${currentNote.frequency} Hz` : "0.0 Hz"}
          </span>
        </div>

        {/* Escala Tonal Detectada */}
        <div className="mb-6 p-4 bg-indigo-950/40 border border-indigo-800/50 rounded-lg">
          <span className="text-xs font-semibold text-indigo-300 block mb-1">Escala Tonal Detectada:</span>
          <span className="text-base font-bold text-indigo-200">{detectedScale}</span>
        </div>

        {/* Notas Capturadas */}
        <div className="mb-6">
          <span className="text-xs text-slate-400 block mb-2">Notas capturadas:</span>
          <div className="flex flex-wrap justify-center gap-1.5">
            {Array.from(detectedNotes).map((note) => (
              <span key={note} className="px-3 py-1 bg-slate-700 text-indigo-300 rounded-full text-xs font-semibold">
                {note}
              </span>
            ))}
            {detectedNotes.size === 0 && <span className="text-slate-600 text-xs">Ninguna aún</span>}
          </div>
        </div>

        {/* Botones de Control */}
        <div className="flex gap-3 justify-center">
          {!isListening ? (
            <button
              onClick={startAudio}
              className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 font-semibold rounded-xl transition shadow-lg shadow-indigo-600/30 text-sm"
            >
              Iniciar Micrófono
            </button>
          ) : (
            <button
              onClick={stopAudio}
              className="px-6 py-3 bg-rose-600 hover:bg-rose-500 font-semibold rounded-xl transition shadow-lg shadow-rose-600/30 text-sm"
            >
              Detener
            </button>
          )}

          <button
            onClick={clearScale}
            className="px-4 py-3 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-xl transition text-sm"
          >
            Limpiar
          </button>
        </div>
      </div>
    </div>
  );
}