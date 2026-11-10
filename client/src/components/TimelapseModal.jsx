import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Film, 
  X, 
  Play, 
  Pause, 
  RotateCcw, 
  Download, 
  Check, 
  Video, 
  Gauge 
} from 'lucide-react';
import { 
  formatTime, 
  computeEventsBounds, 
  reconstructElementsAtTime 
} from '../utils/timelapse';
import { renderElement } from '../utils/canvas';
import { loadImage } from '../utils/images';

const SPEED_PRESETS = [1, 2, 4, 8, 16, 32];

export default function TimelapseModal({ 
  isOpen, 
  onClose, 
  data, 
  roomId = 'quadro' 
}) {
  const [speed, setSpeed] = useState(4);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportSuccess, setExportSuccess] = useState(false);

  const canvasRef = useRef(null);
  const animFrameRef = useRef(null);
  const lastFrameTimeRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const shouldCancelExportRef = useRef(false);

  const events = data?.events || [];
  const totalDuration = Math.max(1000, data?.totalDuration || 1000);
  const initialElements = data?.initialElements || [];
  const bg = data?.bg || { color: '#f8fafc', grid: 'dots' };
  const isLiveRecorded = Boolean(data?.isLiveRecorded);

  // Compute bounding box for optimal zoom and framing
  const bounds = useRef(computeEventsBounds(initialElements, events));

  // Render a specific time slice onto player canvas
  const renderFrame = useCallback((timeMs) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const b = bounds.current;
    const cw = canvas.width;
    const ch = canvas.height;

    ctx.save();
    ctx.clearRect(0, 0, cw, ch);

    // Background fill
    ctx.fillStyle = bg.color || '#f8fafc';
    ctx.fillRect(0, 0, cw, ch);

    // Background grid
    if (bg.grid === 'dots') {
      ctx.fillStyle = '#94a3b8';
      ctx.globalAlpha = 0.35;
      const step = 24;
      for (let x = 0; x < cw; x += step) {
        for (let y = 0; y < ch; y += step) {
          ctx.beginPath();
          ctx.arc(x, y, 1.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    } else if (bg.grid === 'lines') {
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.35;
      const step = 28;
      ctx.beginPath();
      for (let x = 0; x < cw; x += step) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, ch);
      }
      for (let y = 0; y < ch; y += step) {
        ctx.moveTo(0, y);
        ctx.lineTo(cw, y);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Scale and translate so the whole drawing fits inside canvas with padding
    const padding = 40;
    const availW = cw - padding * 2;
    const availH = ch - padding * 2;
    const scale = Math.min(availW / b.width, availH / b.height, 1.5);

    const drawW = b.width * scale;
    const drawH = b.height * scale;
    const offsetX = (cw - drawW) / 2 - b.minX * scale;
    const offsetY = (ch - drawH) / 2 - b.minY * scale;

    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);

    // Reconstruct elements at timeMs
    const elementsAtTime = reconstructElementsAtTime(initialElements, events, timeMs);

    // Render elements
    elementsAtTime.forEach(el => {
      renderElement(ctx, el);
    });

    ctx.restore();
  }, [bg, initialElements, events]);

  // Pre-load any images or latex formulas before rendering
  useEffect(() => {
    if (!isOpen) return;

    bounds.current = computeEventsBounds(initialElements, events);

    const allElements = [
      ...initialElements,
      ...events.map(ev => ev.element).filter(Boolean),
      ...events.flatMap(ev => ev.elements || [])
    ];

    const imageSources = allElements
      .filter(el => el.type === 'image' || el.type === 'latex')
      .map(el => (el.type === 'latex' ? el.svg : el.src))
      .filter(Boolean);

    Promise.all(imageSources.map(src => loadImage(src).catch(() => null))).then(() => {
      renderFrame(0);
      setCurrentTime(0);
      setIsPlaying(true);
    });
  }, [isOpen, data, renderFrame, initialElements, events]);

  // Main playback loop
  useEffect(() => {
    if (!isOpen || !isPlaying || isExporting) {
      lastFrameTimeRef.current = null;
      return;
    }

    let isMounted = true;

    const tick = (now) => {
      if (!isMounted) return;

      if (!lastFrameTimeRef.current) {
        lastFrameTimeRef.current = now;
      }

      const delta = now - lastFrameTimeRef.current;
      lastFrameTimeRef.current = now;

      setCurrentTime((prev) => {
        const next = prev + delta * speed;
        if (next >= totalDuration) {
          renderFrame(totalDuration);
          setIsPlaying(false);
          return totalDuration;
        }
        renderFrame(next);
        return next;
      });

      animFrameRef.current = requestAnimationFrame(tick);
    };

    animFrameRef.current = requestAnimationFrame(tick);

    return () => {
      isMounted = false;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isOpen, isPlaying, speed, totalDuration, isExporting, renderFrame]);

  // Scrubber change
  const handleSeek = (e) => {
    const val = Number(e.target.value);
    setCurrentTime(val);
    renderFrame(val);
    lastFrameTimeRef.current = null;
  };

  const handlePlayPause = () => {
    if (currentTime >= totalDuration) {
      setCurrentTime(0);
      renderFrame(0);
      setIsPlaying(true);
    } else {
      setIsPlaying((p) => !p);
    }
  };

  const handleRestart = () => {
    setCurrentTime(0);
    renderFrame(0);
    setIsPlaying(true);
  };

  // Video Export (Save to WebM video)
  const handleExportVideo = async () => {
    if (isExporting) return;
    setIsPlaying(false);
    setIsExporting(true);
    setExportProgress(0);
    shouldCancelExportRef.current = false;

    const canvas = canvasRef.current;
    if (!canvas) {
      alert('Canvas não disponível para exportação.');
      setIsExporting(false);
      return;
    }

    if (typeof canvas.captureStream !== 'function' || typeof MediaRecorder === 'undefined') {
      alert('Seu navegador não suporta exportação direta de vídeo para canvas. Recomendamos o Google Chrome ou Edge.');
      setIsExporting(false);
      return;
    }

    try {
      // Find supported mime type
      const possibleTypes = [
        'video/webm;codecs=vp9',
        'video/webm;codecs=vp8',
        'video/webm',
        'video/mp4'
      ];
      let selectedMime = possibleTypes.find(t => MediaRecorder.isTypeSupported(t)) || '';

      const stream = canvas.captureStream(30);
      const recorder = new MediaRecorder(stream, selectedMime ? { mimeType: selectedMime } : undefined);
      mediaRecorderRef.current = recorder;

      const chunks = [];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };

      const recordPromise = new Promise((resolve, reject) => {
        recorder.onstop = () => {
          if (shouldCancelExportRef.current) {
            resolve(null);
            return;
          }
          const ext = selectedMime.includes('mp4') ? 'mp4' : 'webm';
          const blob = new Blob(chunks, { type: selectedMime || 'video/webm' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `timelapse-${roomId}-${speed}x.${ext}`;
          document.body.appendChild(a);
          a.click();
          setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
          }, 100);
          resolve(url);
        };
        recorder.onerror = (err) => reject(err);
      });

      recorder.start();

      // Render step by step from t = 0 to t = totalDuration
      const targetDurationMs = Math.max(1000, totalDuration / speed);
      const startTime = performance.now();

      await new Promise((resolve) => {
        function renderStep(now) {
          if (shouldCancelExportRef.current) {
            resolve();
            return;
          }

          const elapsed = now - startTime;
          const progress = Math.min(1, elapsed / targetDurationMs);
          const simTime = progress * totalDuration;

          renderFrame(simTime);
          setExportProgress(Math.round(progress * 100));

          if (progress < 1) {
            requestAnimationFrame(renderStep);
          } else {
            // Keep the final frame active for a brief moment in the video
            setTimeout(() => resolve(), 300);
          }
        }
        requestAnimationFrame(renderStep);
      });

      if (!shouldCancelExportRef.current) {
        recorder.stop();
        await recordPromise;
        setExportSuccess(true);
        setTimeout(() => setExportSuccess(false), 3500);
      }
    } catch (err) {
      alert('Erro ao gravar vídeo: ' + err.message);
    } finally {
      setIsExporting(false);
      setCurrentTime(totalDuration);
      renderFrame(totalDuration);
    }
  };

  const handleCancelExport = () => {
    shouldCancelExportRef.current = true;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      try {
        mediaRecorderRef.current.stop();
      } catch {
        // ignore
      }
    }
    setIsExporting(false);
  };

  if (!isOpen) return null;

  const estimatedVideoSeconds = Math.max(1, Math.round(totalDuration / (speed * 1000)));

  return (
    <div 
      className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50 animate-in fade-in duration-150 select-none"
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-2xl shadow-2xl border border-slate-200/90 w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-600 shadow-xs">
              <Film size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-slate-800 text-sm sm:text-base">Time Lapse dos Desenhos</h3>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                  isLiveRecorded 
                    ? 'bg-rose-100 text-rose-700 border-rose-200' 
                    : 'bg-purple-100 text-purple-700 border-purple-200'
                }`}>
                  {isLiveRecorded ? 'Sessão Gravada' : 'Desenho da Página'}
                </span>
              </div>
              <p className="text-[11px] text-slate-500">
                Assista à animação e configure a velocidade. Salvar o vídeo é opcional.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            title="Fechar (Esc)"
          >
            <X size={18} />
          </button>
        </div>

        {/* Export Success Notification */}
        {exportSuccess && (
          <div className="bg-emerald-50 border-b border-emerald-100 text-emerald-800 px-5 py-2 text-xs font-semibold flex items-center gap-2 animate-in fade-in">
            <Check size={15} className="text-emerald-600" />
            <span>Vídeo Time Lapse salvo e baixado com sucesso!</span>
          </div>
        )}

        {/* Canvas Player Display */}
        <div className="relative bg-slate-900/90 flex items-center justify-center overflow-hidden p-2 sm:p-3 min-h-[260px] max-h-[50vh]">
          <canvas
            ref={canvasRef}
            width={1280}
            height={720}
            className="w-full h-full max-h-[46vh] object-contain rounded-lg shadow-lg bg-white"
          />

          {/* Center Play Overlay when paused and not exporting */}
          {!isPlaying && !isExporting && (
            <button
              onClick={handlePlayPause}
              className="absolute inset-0 m-auto w-14 h-14 rounded-full bg-slate-900/70 hover:bg-slate-900/90 text-white flex items-center justify-center shadow-xl backdrop-blur-xs transition-transform hover:scale-110 active:scale-95 cursor-pointer"
              title="Reproduzir"
            >
              <Play size={24} className="ml-1" />
            </button>
          )}

          {/* Exporting Video Overlay */}
          {isExporting && (
            <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-xs flex flex-col items-center justify-center text-white p-4">
              <Video size={36} className="text-purple-400 animate-pulse mb-3" />
              <div className="font-semibold text-sm mb-1">Gravando vídeo em Time Lapse ({speed}x)...</div>
              <div className="w-64 bg-slate-700 rounded-full h-2.5 mb-2 overflow-hidden">
                <div 
                  className="bg-gradient-to-r from-purple-500 to-indigo-500 h-2.5 rounded-full transition-all duration-100" 
                  style={{ width: `${exportProgress}%` }}
                />
              </div>
              <div className="text-xs text-slate-300 font-mono mb-3">{exportProgress}% concluído</div>
              <button
                onClick={handleCancelExport}
                className="px-3 py-1 bg-white/10 hover:bg-white/20 rounded-lg text-xs font-medium cursor-pointer transition-colors"
              >
                Cancelar
              </button>
            </div>
          )}
        </div>

        {/* Timeline Scrubber & Basic Controls */}
        <div className="p-3 sm:px-5 sm:py-3 border-b border-slate-100 bg-white">
          <div className="flex items-center gap-3">
            <button
              onClick={handlePlayPause}
              disabled={isExporting}
              className="w-8 h-8 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white flex items-center justify-center shadow-xs transition-colors cursor-pointer shrink-0"
              title={isPlaying ? 'Pausar' : 'Reproduzir'}
            >
              {isPlaying ? <Pause size={16} /> : <Play size={16} className="ml-0.5" />}
            </button>

            <button
              onClick={handleRestart}
              disabled={isExporting}
              className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer shrink-0"
              title="Reiniciar do começo"
            >
              <RotateCcw size={16} />
            </button>

            {/* Time scrubber slider */}
            <input
              type="range"
              min={0}
              max={totalDuration}
              value={currentTime}
              onChange={handleSeek}
              disabled={isExporting}
              className="flex-1 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
            />

            <span className="text-xs font-mono font-medium text-slate-600 min-w-[75px] text-right shrink-0">
              {formatTime(currentTime)} / {formatTime(totalDuration)}
            </span>
          </div>
        </div>

        {/* Speed Configuration Section */}
        <div className="p-3 sm:px-5 sm:py-3.5 bg-slate-50/70 border-b border-slate-100">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
              <Gauge size={15} className="text-indigo-600" />
              <span>Velocidade do Time Lapse:</span>
              <span className="text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-200/60 font-mono">
                {speed}x
              </span>
            </div>

            <div className="text-[11px] text-slate-500 font-medium">
              Duração estimada do vídeo: <span className="font-bold text-slate-700">~{estimatedVideoSeconds}s</span> (original: {formatTime(totalDuration)})
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {SPEED_PRESETS.map((val) => (
              <button
                key={val}
                onClick={() => setSpeed(val)}
                disabled={isExporting}
                className={`px-2.5 py-1 text-xs font-semibold rounded-lg border transition-all cursor-pointer ${
                  speed === val
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs scale-105'
                    : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200 hover:border-slate-300'
                }`}
              >
                {val}x
              </button>
            ))}

            <div className="h-4 w-px bg-slate-300 mx-1 hidden sm:block" />

            {/* Speed slider for fine-tuning */}
            <div className="flex items-center gap-1.5 flex-1 min-w-[140px]">
              <input
                type="range"
                min="0.5"
                max="50"
                step="0.5"
                value={speed}
                onChange={(e) => setSpeed(Number(e.target.value))}
                disabled={isExporting}
                className="w-full h-1 bg-slate-300 rounded appearance-none cursor-pointer accent-indigo-600"
              />
            </div>
          </div>
        </div>

        {/* Modal Footer (Save is an OPTION) */}
        <div className="px-5 py-3.5 bg-white flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-slate-500">
            <span className="font-semibold text-slate-700">Dica:</span> Salvar o vídeo é opcional. Você pode apenas assistir ou exportar quando quiser.
          </p>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              disabled={isExporting}
              className="px-3.5 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors cursor-pointer"
            >
              Fechar
            </button>

            <button
              onClick={handleExportVideo}
              disabled={isExporting}
              title={`Exportar o time lapse como arquivo de vídeo WebM a ${speed}x`}
              className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 active:scale-95 disabled:opacity-50 rounded-lg shadow-sm shadow-purple-500/20 transition-all cursor-pointer"
            >
              <Download size={15} />
              <span>{isExporting ? 'Renderizando...' : 'Salvar Vídeo (WebM)'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
