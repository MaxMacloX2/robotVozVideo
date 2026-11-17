import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  FolderOpen,
  Download,
  Zap,
  OctagonAlert,
  Radio,
  Keyboard,
  RefreshCw,
  Edit3,
  Check,
  Sparkles,
  FileText,
  Sliders,
  Trash2,
  Clock,
  Settings,
  X,
  Timer,
  Maximize2,
  Monitor,
  RotateCcw,
  RotateCw,
  Eye,
  EyeOff
} from 'lucide-react';

const DEFAULT_MACROS = [
  { key: 'F1', label: '¿Qué fue eso?', text: '¿Pero qué demonios fue eso?' },
  { key: 'F2', label: '¡Corre!', text: '¡Corre perra, corre!' },
  { key: 'F3', label: 'Ni loco entro', text: 'Ni loco entro ahí, mejor me regreso.' },
  { key: 'F4', label: 'Clásico Loquendo', text: 'Hola amigos de YouTube, hoy les traigo un nuevo gameplay.' },
  { key: 'F5', label: 'Susto / WTF', text: '¡Ay mi madre, casi me da un infarto!' },
  { key: 'F6', label: 'F en el chat', text: 'efe en el chat muchachos, valió madres.' },
  { key: 'F7', label: 'Pro Player', text: 'Mira esa jugada maestra papá, pura habilidad.' },
  { key: 'F8', label: 'Suscríbanse', text: 'No olviden darle like y suscribirse para más videos.' }
];

// Formatea segundos a estándar SubRip: HH:MM:SS,mmm
function formatSrtTime(seconds) {
  const safeSec = Math.max(0, Number(seconds) || 0);
  const hrs = Math.floor(safeSec / 3600);
  const mins = Math.floor((safeSec % 3600) / 60);
  const secs = Math.floor(safeSec % 60);
  const ms = Math.floor((safeSec % 1) * 1000);

  const pad = (n, z = 2) => String(n).padStart(z, '0');
  return `${pad(hrs)}:${pad(mins)}:${pad(secs)},${pad(ms, 3)}`;
}

// Formatea segundos a MM:SS para la interfaz
function formatDisplayTime(seconds) {
  const safeSec = Math.max(0, Number(seconds) || 0);
  const mins = Math.floor(safeSec / 60);
  const secs = Math.floor(safeSec % 60);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

// ============================================================================
// 1. VENTANA DE VIDEO (Dedicada para OBS / Pantalla Completa F11 / Ultra Limpia)
// ============================================================================
function VideoWindow() {
  const videoRef = useRef(null);
  const [videoSource, setVideoSource] = useState(null); // { fileName, fileUrl }
  const [currentCaption, setCurrentCaption] = useState('');
  const [showCaptions, setShowCaptions] = useState(true);
  const [notification, setNotification] = useState('');

  const triggerNotification = (text) => {
    setNotification(text);
    setTimeout(() => setNotification(''), 2200);
  };

  // Escuchar órdenes remotas enviadas desde la consola de estudio
  useEffect(() => {
    if (!window.loquendoAPI) return;

    // Acciones de video (load, play, pause, seek, volume, toggle-captions)
    const unsubVideoAction = window.loquendoAPI.onVideoAction((action) => {
      if (!action) return;

      switch (action.type) {
        case 'load':
          setVideoSource(action.payload);
          triggerNotification(`Video cargado: ${action.payload?.fileName || ''}`);
          break;

        case 'play':
          if (videoRef.current) {
            videoRef.current.play().catch(() => {});
          }
          break;

        case 'pause':
          if (videoRef.current) {
            videoRef.current.pause();
          }
          break;

        case 'seek':
          if (videoRef.current && typeof action.payload?.time === 'number') {
            videoRef.current.currentTime = action.payload.time;
          }
          break;

        case 'volume':
          if (videoRef.current) {
            if (typeof action.payload?.volume === 'number') {
              videoRef.current.volume = action.payload.volume;
            }
            if (typeof action.payload?.muted === 'boolean') {
              videoRef.current.muted = action.payload.muted;
            }
          }
          break;

        case 'toggle-captions':
          setShowCaptions((prev) => (action.payload !== undefined ? Boolean(action.payload) : !prev));
          break;

        default:
          break;
      }
    });

    // Subtítulos flotantes de Loquendo en tiempo real
    const unsubSpeaking = window.loquendoAPI.onEvent('tts:speaking', (data) => {
      if (data?.item?.text) {
        setCurrentCaption(data.item.text);
      }
    });

    const unsubFinished = window.loquendoAPI.onEvent('tts:item-finished', () => {
      setCurrentCaption('');
    });

    const unsubPanic = window.loquendoAPI.onEvent('tts:panic', () => {
      setCurrentCaption('');
    });

    const unsubFullscreen = window.loquendoAPI.onEvent('window:fullscreen-change', (isFull) => {
      triggerNotification(isFull ? 'Pantalla Completa Activa (F11)' : 'Modo Ventana');
    });

    return () => {
      unsubVideoAction();
      unsubSpeaking();
      unsubFinished();
      unsubPanic();
      unsubFullscreen();
    };
  }, []);

  // Enviar estado de reproducción hacia el Estudio periódicamente
  const handleTimeUpdate = () => {
    if (!videoRef.current || !window.loquendoAPI) return;
    window.loquendoAPI.sendVideoStatus({
      isConnected: true,
      currentTime: videoRef.current.currentTime || 0,
      duration: videoRef.current.duration || 0,
      isPlaying: !videoRef.current.paused,
      videoSource
    });
  };

  // Alternar pantalla completa con F11 localmente
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'F11') {
        e.preventDefault();
        if (window.loquendoAPI) {
          window.loquendoAPI.toggleVideoFullScreen();
        } else {
          if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(() => {});
          } else {
            document.exitFullscreen().catch(() => {});
          }
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="w-screen h-screen bg-black overflow-hidden relative flex items-center justify-center select-none">
      {videoSource?.fileUrl ? (
        <video
          ref={videoRef}
          src={videoSource.fileUrl}
          className="w-full h-full object-contain bg-black"
          onTimeUpdate={handleTimeUpdate}
          onPlay={handleTimeUpdate}
          onPause={handleTimeUpdate}
          onLoadedMetadata={handleTimeUpdate}
          autoPlay={false}
        />
      ) : (
        <div className="flex flex-col items-center justify-center text-center p-8 text-zinc-600">
          <Monitor className="w-16 h-16 mb-4 text-zinc-700 animate-pulse" />
          <h2 className="text-lg font-bold text-zinc-400">
            Pantalla de Video para Captura / OBS
          </h2>
          <p className="text-xs text-zinc-600 mt-1 max-w-sm">
            Selecciona un video desde la Consola de Estudio. Presiona <kbd className="px-1.5 py-0.5 bg-zinc-800 text-zinc-400 rounded text-[11px] font-mono">F11</kbd> para pantalla completa limpia.
          </p>
        </div>
      )}

      {/* Subtítulos Flotantes de Loquendo (Alta legibilidad para captura en OBS) */}
      {showCaptions && currentCaption && (
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 max-w-[88%] text-center pointer-events-none z-30 transition-all duration-200">
          <span className="inline-block px-5 py-2.5 rounded-xl bg-black/85 border border-zinc-800/80 shadow-2xl backdrop-blur-md">
            <span className="text-xl md:text-2xl font-extrabold text-amber-300 tracking-wide drop-shadow-[0_2px_10px_rgba(0,0,0,1)] leading-relaxed">
              {currentCaption}
            </span>
          </span>
        </div>
      )}

      {/* Notificación sutil y temporal (se desvanece rápido) */}
      {notification && (
        <div className="absolute top-5 left-1/2 -translate-x-1/2 bg-zinc-900/90 border border-zinc-800 text-zinc-200 text-xs px-3.5 py-1.5 rounded-full shadow-lg pointer-events-none animate-fade-in backdrop-blur-sm z-40">
          {notification}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 2. CONSOLA DE ESTUDIO (Ventana Principal de Control, Redacción y Macros)
// ============================================================================
function StudioWindow() {
  const inputRef = useRef(null);
  const autoPausedByTypingRef = useRef(false);
  const idleTimerRef = useRef(null);

  // Estado sincronizado del reproductor de video en la Ventana 2
  const [videoStatus, setVideoStatus] = useState({
    isConnected: true,
    currentTime: 0,
    duration: 0,
    isPlaying: false,
    videoSource: null
  });
  const [videoVolume, setVideoVolume] = useState(0.8);
  const [isVideoMuted, setIsVideoMuted] = useState(false);
  const [showCaptionsOnVideo, setShowCaptionsOnVideo] = useState(true);

  // Modos de redacción: 'REALTIME' (Habla continua por bloques) | 'SMART_PAUSE' (Pausa al escribir, Enter habla y reanuda)
  const [typingMode, setTypingMode] = useState('REALTIME');
  const [inputText, setInputText] = useState('');
  const [autoPausedIndicator, setAutoPausedIndicator] = useState(false);

  // Tamaño de bloque para habla continua (1 a 8 palabras, default 3)
  const [chunkSize, setChunkSize] = useState(() => {
    try {
      const saved = localStorage.getItem('loquendo_chunk_size');
      return saved ? Math.max(1, Math.min(8, Number(saved))) : 3;
    } catch {
      return 3;
    }
  });

  // Configuración de auto-envío por inactividad
  const [idleAutoSend, setIdleAutoSend] = useState(() => {
    try {
      const saved = localStorage.getItem('loquendo_idle_enabled');
      return saved !== null ? saved === 'true' : true;
    } catch {
      return true;
    }
  });

  const [idleTimeoutSec, setIdleTimeoutSec] = useState(() => {
    try {
      const saved = localStorage.getItem('loquendo_idle_timeout');
      return saved ? Math.max(0.5, Math.min(5.0, parseFloat(saved))) : 1.5;
    } catch {
      return 1.5;
    }
  });

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Persistir ajustes
  useEffect(() => {
    try {
      localStorage.setItem('loquendo_chunk_size', String(chunkSize));
      localStorage.setItem('loquendo_idle_enabled', String(idleAutoSend));
      localStorage.setItem('loquendo_idle_timeout', String(idleTimeoutSec));
    } catch (_) {}
  }, [chunkSize, idleAutoSend, idleTimeoutSec]);

  // Estado del puente TTS (SAPI 5 / Loquendo)
  const [ttsState, setTtsState] = useState({
    isSpeaking: false,
    currentItem: null,
    queue: [],
    queueLength: 0,
    voices: [],
    selectedVoice: '',
    baseRate: 1,
    boostRate: 3,
    boostThreshold: 3,
    effectiveRate: 1,
    isBoosted: false,
    volume: 100,
    archMode: 'x86 (32-bit Loquendo/SAPI5)'
  });
  const [prefer32Bit, setPrefer32Bit] = useState(true);

  // Macros F1-F8 y registro de subtítulos (.SRT)
  const [macros, setMacros] = useState(() => {
    try {
      const saved = localStorage.getItem('loquendo_macros_v1');
      return saved ? JSON.parse(saved) : DEFAULT_MACROS;
    } catch {
      return DEFAULT_MACROS;
    }
  });
  const [editingMacros, setEditingMacros] = useState(false);
  const [subtitlesLog, setSubtitlesLog] = useState([]);

  // Guardar macros en localStorage
  useEffect(() => {
    try {
      localStorage.setItem('loquendo_macros_v1', JSON.stringify(macros));
    } catch (_) {}
  }, [macros]);

  // Enviar ordenes remotas al reproductor de video en la Ventana 2
  const sendVideoCommand = useCallback((type, payload = {}) => {
    if (window.loquendoAPI?.sendVideoAction) {
      window.loquendoAPI.sendVideoAction({ type, payload });
    }
  }, []);

  // Enviar texto a Loquendo y registrar en subtítulos .SRT
  const sendToLoquendo = useCallback(
    async (rawText, options = {}) => {
      const clean = String(rawText || '').trim();
      if (!clean) return;

      const vidTime = videoStatus.currentTime || 0;
      const wordCount = clean.split(/\s+/).length;
      const estimatedDuration = Math.max(1.6, Math.min(8.0, wordCount * 0.42));

      setSubtitlesLog((prev) => [
        ...prev,
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          text: clean,
          startTime: vidTime,
          endTime: vidTime + estimatedDuration
        }
      ]);

      if (window.loquendoAPI) {
        await window.loquendoAPI.enqueue({
          text: clean,
          videoTime: vidTime,
          resumeAfter: Boolean(options.resumeAfter)
        });
      }
    },
    [videoStatus.currentTime]
  );

  // Botón / Atajo de pánico (Esc)
  const triggerPanic = useCallback(async () => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
    if (window.loquendoAPI) {
      await window.loquendoAPI.stopAll();
    }
    autoPausedByTypingRef.current = false;
    setAutoPausedIndicator(false);
  }, []);

  // Temporizador de inactividad: auto-envío si el usuario deja de escribir en Modo Tiempo Real
  useEffect(() => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }

    if (!idleAutoSend || typingMode !== 'REALTIME') return;

    const trimmed = inputText.trim();
    if (trimmed.length === 0) return;

    idleTimerRef.current = setTimeout(() => {
      sendToLoquendo(trimmed, { resumeAfter: false });
      setInputText('');
    }, Math.max(400, Math.round(idleTimeoutSec * 1000)));

    return () => {
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
        idleTimerRef.current = null;
      }
    };
  }, [inputText, idleAutoSend, idleTimeoutSec, typingMode, sendToLoquendo]);

  // Suscripción a eventos IPC del backend y de la Ventana de Video
  useEffect(() => {
    if (!window.loquendoAPI) return;

    // Estado inicial de TTS
    window.loquendoAPI.getState().then((initial) => {
      if (initial) setTtsState(initial);
    });

    // Recepción continua del estado de video desde la Ventana 2
    const unsubVideoStatus = window.loquendoAPI.onVideoStatus((status) => {
      if (status) {
        setVideoStatus((prev) => ({ ...prev, ...status }));
      }
    });

    const unsubVoices = window.loquendoAPI.onEvent('tts:voices', (data) => {
      setTtsState((prev) => ({
        ...prev,
        voices: data.voices || [],
        selectedVoice: data.selectedVoice || prev.selectedVoice,
        archMode: data.archMode || prev.archMode
      }));
    });

    const unsubStatus = window.loquendoAPI.onEvent('tts:status', (state) => {
      setTtsState(state);
    });

    // Si el video fue pausado automáticamente en Modo Pausa Inteligente, reanudarlo cuando la cola termine
    const unsubQueueEmpty = window.loquendoAPI.onEvent('tts:queue-empty', () => {
      if (autoPausedByTypingRef.current) {
        autoPausedByTypingRef.current = false;
        setAutoPausedIndicator(false);
        sendVideoCommand('play');
      }
    });

    return () => {
      unsubVideoStatus();
      unsubVoices();
      unsubStatus();
      unsubQueueEmpty();
    };
  }, [sendVideoCommand]);

  // Atajos globales de teclado: Tab (cambiar modo), Esc (Pánico / Cerrar ajustes), F1-F8 (Macros rápidas)
  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      // ESC: Cerrar modal si está abierto, o disparar pánico
      if (e.key === 'Escape') {
        e.preventDefault();
        if (isSettingsOpen) {
          setIsSettingsOpen(false);
          return;
        }
        triggerPanic();
        return;
      }

      // TAB: Intercambiar entre Modo Tiempo Real y Modo Pausa Inteligente
      if (e.key === 'Tab') {
        e.preventDefault();
        setTypingMode((prev) => (prev === 'REALTIME' ? 'SMART_PAUSE' : 'REALTIME'));
        if (inputRef.current) inputRef.current.focus();
        return;
      }

      // F1 a F8: Disparar Macros Rápidas
      if (/^F([1-8])$/.test(e.key)) {
        e.preventDefault();
        const macro = macros.find((m) => m.key === e.key);
        if (macro && macro.text.trim()) {
          sendToLoquendo(macro.text, { resumeAfter: false });
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [macros, sendToLoquendo, triggerPanic, isSettingsOpen]);

  // Manejo de escritura en el input inferior según el modo activo
  const handleInputKeyDown = (e) => {
    if (typingMode === 'REALTIME') {
      // 1. Tecla Enter: Dispara inmediatamente todo el texto acumulado
      if (e.key === 'Enter') {
        e.preventDefault();
        const currentVal = inputText.trim();
        if (currentVal.length > 0) {
          sendToLoquendo(currentVal, { resumeAfter: false });
          setInputText('');
        }
        return;
      }

      // 2. Signos de puntuación (. ! ?): Disparan el bloque con entonación de Loquendo
      if (['.', '!', '?', ','].includes(e.key)) {
        const currentVal = inputText.trim();
        if (currentVal.length > 0) {
          e.preventDefault();
          sendToLoquendo(`${currentVal}${e.key}`, { resumeAfter: false });
          setInputText('');
        }
        return;
      }

      // 3. Barra espaciadora: Evalúa si se alcanzó el tamaño de bloque (ej. 3 palabras)
      if (e.key === ' ') {
        const words = inputText.trim().split(/\s+/).filter(Boolean);
        if (words.length === 0) {
          e.preventDefault();
          return;
        }

        if (words.length >= chunkSize) {
          e.preventDefault();
          sendToLoquendo(words.join(' '), { resumeAfter: false });
          setInputText('');
        }
      }
    } else if (typingMode === 'SMART_PAUSE') {
      // Modo 2: Pausa Inteligente -> Enter envía toda la oración y reanuda el video al terminar
      if (e.key === 'Enter') {
        e.preventDefault();
        const currentVal = inputText.trim();
        if (currentVal.length > 0) {
          sendToLoquendo(currentVal, { resumeAfter: true });
          setInputText('');
        } else if (autoPausedByTypingRef.current) {
          autoPausedByTypingRef.current = false;
          setAutoPausedIndicator(false);
          sendVideoCommand('play');
        }
      }
    }
  };

  const handleInputChange = (e) => {
    const val = e.target.value;
    setInputText(val);

    // En Modo Pausa Inteligente, al empezar a redactar cualquier letra, pausamos la Ventana de Video
    if (typingMode === 'SMART_PAUSE' && val.trim().length > 0) {
      if (videoStatus.isPlaying) {
        sendVideoCommand('pause');
        autoPausedByTypingRef.current = true;
        setAutoPausedIndicator(true);
      }
    }
  };

  // Selector nativo de video (abre diálogo y envía orden de carga a la Ventana 2)
  const handleOpenVideo = async () => {
    if (window.loquendoAPI) {
      const selected = await window.loquendoAPI.openVideoDialog();
      if (selected) {
        sendVideoCommand('load', selected);
      }
    }
  };

  // Controles de transporte remotos
  const togglePlay = () => {
    if (videoStatus.isPlaying) {
      sendVideoCommand('pause');
    } else {
      autoPausedByTypingRef.current = false;
      setAutoPausedIndicator(false);
      sendVideoCommand('play');
    }
    if (inputRef.current) inputRef.current.focus();
  };

  const handleSeek = (e) => {
    const time = parseFloat(e.target.value);
    sendVideoCommand('seek', { time });
  };

  const handleSkip = (seconds) => {
    const newTime = Math.max(0, Math.min(videoStatus.duration, videoStatus.currentTime + seconds));
    sendVideoCommand('seek', { time: newTime });
  };

  const handleVolumeChange = (e) => {
    const vol = parseFloat(e.target.value);
    setVideoVolume(vol);
    setIsVideoMuted(vol === 0);
    sendVideoCommand('volume', { volume: vol, muted: vol === 0 });
  };

  const toggleMute = () => {
    const nextMuted = !isVideoMuted;
    setIsVideoMuted(nextMuted);
    sendVideoCommand('volume', { volume: videoVolume, muted: nextMuted });
  };

  const toggleCaptionsRemotely = () => {
    const next = !showCaptionsOnVideo;
    setShowCaptionsOnVideo(next);
    sendVideoCommand('toggle-captions', next);
  };

  // Configuración de voz SAPI 5
  const updateTTSConfig = async (patch) => {
    if (!window.loquendoAPI) return;
    const updated = await window.loquendoAPI.setConfig(patch);
    if (updated) setTtsState(updated);
  };

  const toggleArchMode = async () => {
    const nextPrefer32 = !prefer32Bit;
    setPrefer32Bit(nextPrefer32);
    if (window.loquendoAPI) {
      await window.loquendoAPI.refreshVoices(nextPrefer32);
    }
  };

  // Exportar archivo .SRT
  const handleExportSRT = async () => {
    if (subtitlesLog.length === 0) return;

    const srtBlocks = subtitlesLog.map((entry, idx) => {
      const start = formatSrtTime(entry.startTime);
      const end = formatSrtTime(entry.endTime);
      return `${idx + 1}\n${start} --> ${end}\n${entry.text}\n`;
    });
    const srtContent = srtBlocks.join('\n');
    const baseName = videoStatus.videoSource?.fileName
      ? `${videoStatus.videoSource.fileName.replace(/\.[^/.]+$/, '')}.srt`
      : 'reaccion-loquendo.srt';

    if (window.loquendoAPI) {
      await window.loquendoAPI.saveSrtDialog({
        defaultName: baseName,
        content: srtContent
      });
    }
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-zinc-950 text-zinc-100 font-sans select-none overflow-hidden">
      {/* 1. BARRA SUPERIOR DE ESTUDIO */}
      <header className="h-14 border-b border-zinc-800/80 bg-zinc-900/80 px-4 flex items-center justify-between gap-3 shrink-0">
        {/* Identidad + Selector de Video + Botón de Ventana de Video F11 */}
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-2 bg-zinc-950 border border-zinc-800 px-3 py-1.5 rounded-md">
            <Radio className={`w-4 h-4 ${ttsState.isSpeaking ? 'text-emerald-400 animate-pulse' : 'text-zinc-500'}`} />
            <span className="font-bold tracking-tight text-sm text-zinc-100">LOQUENDO</span>
            <span className="text-[11px] font-mono uppercase px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
              Studio
            </span>
          </div>

          <button
            onClick={handleOpenVideo}
            className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-xs font-medium px-3 py-1.5 rounded-md border border-zinc-700 transition"
            title="Seleccionar archivo de gameplay (.mp4, .mkv, .webm)"
          >
            <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
            <span className="max-w-[160px] truncate">
              {videoStatus.videoSource ? videoStatus.videoSource.fileName : 'Cargar Video'}
            </span>
          </button>

          {/* Botón para enfocar / abrir la Ventana de Video y pantalla completa F11 */}
          <button
            onClick={() => window.loquendoAPI?.openVideoWindow()}
            className="flex items-center gap-1.5 bg-zinc-950 hover:bg-zinc-800 text-zinc-200 border border-zinc-800 px-3 py-1.5 rounded-md text-xs font-medium transition"
            title="Abrir o enfocar la Ventana de Video independiente para OBS"
          >
            <Monitor className="w-3.5 h-3.5 text-blue-400" />
            <span>Ventana de Video</span>
          </button>

          <button
            onClick={() => window.loquendoAPI?.toggleVideoFullScreen()}
            className="flex items-center gap-1 bg-zinc-950 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 px-2.5 py-1.5 rounded-md text-xs font-mono transition"
            title="Conmutar Pantalla Completa en la ventana del video (F11)"
          >
            <Maximize2 className="w-3.5 h-3.5 text-amber-400" />
            <span>F11</span>
          </button>

          <button
            onClick={toggleCaptionsRemotely}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium border transition ${
              showCaptionsOnVideo
                ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                : 'bg-zinc-950 text-zinc-500 border-zinc-800'
            }`}
            title="Mostrar u ocultar subtítulos flotantes de Loquendo en la ventana de video"
          >
            {showCaptionsOnVideo ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            <span>Subtítulos</span>
          </button>
        </div>

        {/* Selector de Voz SAPI 5 / Loquendo + Velocidad */}
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5 bg-zinc-950 border border-zinc-800 rounded-md px-2.5 py-1">
            <span className="text-[11px] text-zinc-400 font-medium">Voz:</span>
            <select
              value={ttsState.selectedVoice}
              onChange={(e) => updateTTSConfig({ voice: e.target.value })}
              className="bg-transparent text-xs text-zinc-100 font-medium focus:outline-none max-w-[200px] truncate cursor-pointer"
            >
              {ttsState.voices.length === 0 ? (
                <option value="" className="bg-zinc-900 text-zinc-400">
                  Buscando voces SAPI 5...
                </option>
              ) : (
                ttsState.voices.map((v) => (
                  <option key={v.name} value={v.name} className="bg-zinc-900 text-zinc-100">
                    {v.isLoquendo ? `★ ${v.name} (Loquendo)` : `${v.name} (${v.culture})`}
                  </option>
                ))
              )}
            </select>
            <button
              onClick={toggleArchMode}
              title={`Arquitectura: ${ttsState.archMode}. Haz clic para alternar entre 32-bit (Loquendo clásico) y 64-bit.`}
              className="ml-1 px-1.5 py-0.5 text-[10px] font-mono rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 transition"
            >
              {prefer32Bit ? '32-bit' : '64-bit'}
            </button>
          </div>

          <div className="flex items-center gap-2 bg-zinc-950 border border-zinc-800 rounded-md px-2.5 py-1">
            <Sliders className="w-3.5 h-3.5 text-zinc-400" />
            <span className="text-[11px] text-zinc-400">Rate:</span>
            <input
              type="range"
              min="-5"
              max="8"
              step="1"
              value={ttsState.baseRate}
              onChange={(e) => updateTTSConfig({ baseRate: Number(e.target.value) })}
              className="w-16 accent-amber-500 cursor-pointer"
            />
            <span className="text-xs font-mono w-4 text-center text-zinc-200">{ttsState.baseRate}</span>

            {ttsState.isBoosted && (
              <span className="flex items-center gap-1 text-[10px] font-mono bg-amber-500/20 text-amber-300 border border-amber-500/40 px-1.5 py-0.5 rounded animate-pulse">
                <Zap className="w-3 h-3" /> TURBO
              </span>
            )}
          </div>

          <button
            onClick={triggerPanic}
            className="flex items-center gap-1.5 bg-red-950/80 hover:bg-red-900 text-red-200 border border-red-800/80 px-3 py-1.5 rounded-md text-xs font-semibold transition"
            title="Vaciar cola y callar a Loquendo inmediatamente (Atajo: Esc)"
          >
            <OctagonAlert className="w-3.5 h-3.5 text-red-400" />
            <span>PÁNICO</span>
          </button>

          <button
            onClick={handleExportSRT}
            disabled={subtitlesLog.length === 0}
            className="flex items-center gap-1.5 bg-emerald-950/70 hover:bg-emerald-900/80 disabled:opacity-40 disabled:pointer-events-none text-emerald-200 border border-emerald-800/70 px-3 py-1.5 rounded-md text-xs font-medium transition"
            title="Descargar subtítulos .SRT sincronizados con el gameplay"
          >
            <Download className="w-3.5 h-3.5 text-emerald-400" />
            <span>.SRT ({subtitlesLog.length})</span>
          </button>
        </div>
      </header>

      {/* 2. CUERPO PRINCIPAL: CONSOLA DE TRANSPORTE DE VIDEO + COLA + MACROS + SRT */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* PANEL IZQUIERDO: CONSOLA MAESTRA DE TRANSPORTE DE VIDEO */}
        <div className="flex-1 flex flex-col p-4 bg-zinc-950 overflow-y-auto space-y-4">
          {/* Tarjeta de Estado del Gameplay en la Ventana de Video */}
          <div className="bg-zinc-900/70 border border-zinc-800 rounded-xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className={`w-3 h-3 rounded-full ${videoStatus.isPlaying ? 'bg-emerald-400 animate-ping' : 'bg-amber-500'}`} />
                <div>
                  <h2 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
                    <span>{videoStatus.videoSource ? videoStatus.videoSource.fileName : 'Sin video cargado'}</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">
                      Ventana 2 (F11)
                    </span>
                  </h2>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    {videoStatus.isPlaying ? 'Reproduciendo en ventana externa' : 'Pausado'} • Subtítulos Loquendo: {showCaptionsOnVideo ? 'Visibles' : 'Ocultos'}
                  </p>
                </div>
              </div>

              {/* Atajo rápido de pantalla completa para el video */}
              <button
                onClick={() => window.loquendoAPI?.toggleVideoFullScreen()}
                className="flex items-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs px-3 py-1.5 rounded-lg border border-zinc-700 transition"
                title="Conmutar pantalla completa en la ventana de video"
              >
                <Maximize2 className="w-3.5 h-3.5 text-amber-400" />
                <span>Pantalla Completa (F11)</span>
              </button>
            </div>

            {/* Línea de tiempo interactiva (Seek) */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs font-mono text-zinc-400">
                <span className="text-amber-400 font-semibold">{formatDisplayTime(videoStatus.currentTime)}</span>
                <span>{formatDisplayTime(videoStatus.duration)}</span>
              </div>
              <input
                type="range"
                min="0"
                max={videoStatus.duration || 100}
                step="0.1"
                value={videoStatus.currentTime}
                disabled={!videoStatus.videoSource}
                onChange={handleSeek}
                className="w-full accent-amber-500 h-2 bg-zinc-800 rounded-lg cursor-pointer"
              />
            </div>

            {/* Botones de Control de Transporte */}
            <div className="flex items-center justify-between pt-1">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleSkip(-5)}
                  disabled={!videoStatus.videoSource}
                  className="p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 disabled:opacity-40 transition"
                  title="Retroceder 5 segundos"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>

                <button
                  onClick={togglePlay}
                  disabled={!videoStatus.videoSource}
                  className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-zinc-950 font-bold px-4 py-2 rounded-lg transition shadow-md"
                  title={videoStatus.isPlaying ? 'Pausar Video' : 'Reproducir Video'}
                >
                  {videoStatus.isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-current" />}
                  <span>{videoStatus.isPlaying ? 'PAUSAR' : 'REPRODUCIR'}</span>
                </button>

                <button
                  onClick={() => handleSkip(5)}
                  disabled={!videoStatus.videoSource}
                  className="p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 disabled:opacity-40 transition"
                  title="Avanzar 5 segundos"
                >
                  <RotateCw className="w-4 h-4" />
                </button>
              </div>

              {/* Control de Volumen Independiente del Video */}
              <div className="flex items-center gap-2.5 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5">
                <button onClick={toggleMute} className="text-zinc-400 hover:text-zinc-200">
                  {isVideoMuted || videoVolume === 0 ? (
                    <VolumeX className="w-4 h-4 text-red-400" />
                  ) : (
                    <Volume2 className="w-4 h-4" />
                  )}
                </button>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.02"
                  value={isVideoMuted ? 0 : videoVolume}
                  onChange={handleVolumeChange}
                  className="w-24 accent-amber-500 h-1 bg-zinc-800 rounded-lg cursor-pointer"
                  title="Volumen del gameplay en la ventana de video"
                />
                <span className="text-[11px] font-mono text-zinc-400 w-8 text-right">
                  {Math.round((isVideoMuted ? 0 : videoVolume) * 100)}%
                </span>
              </div>
            </div>

            {/* Aviso sutil de Pausa Inteligente */}
            {autoPausedIndicator && (
              <div className="flex items-center gap-2 bg-amber-950/80 border border-amber-500/40 text-amber-200 px-3.5 py-2 rounded-lg text-xs font-medium">
                <Pause className="w-4 h-4 text-amber-400" />
                <span>Pausa Inteligente activa: El video se pausó mientras escribes. Pulsa Enter para hablar y reanudarlo.</span>
              </div>
            )}
          </div>

          {/* Tarjeta de Guía Rápida para OBS y Dual Monitor */}
          <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-xl p-4 text-xs text-zinc-400 space-y-1.5">
            <h3 className="font-semibold text-zinc-200 flex items-center gap-1.5">
              <Monitor className="w-4 h-4 text-amber-400" />
              Modo Dos Ventanas para Creadores de Contenido
            </h3>
            <p className="leading-relaxed">
              • <strong>Ventana 2 (Pantalla de Video):</strong> Colócala en tu segundo monitor o selecciónala en OBS como <code className="text-zinc-300">Captura de Ventana</code>.
            </p>
            <p className="leading-relaxed">
              • Pulsa <code className="text-amber-400 font-mono font-bold">F11</code> en la ventana del video para dejarla en pantalla completa ultra limpia, mostrando solo el gameplay y los subtítulos de Loquendo sin distracciones.
            </p>
          </div>
        </div>

        {/* PANEL DERECHO: COLA FIFO + MACROS F1-F8 + REGISTRO SRT */}
        <aside className="w-84 border-l border-zinc-800/80 bg-zinc-900/40 flex flex-col shrink-0">
          {/* 1. Cola FIFO Loquendo */}
          <div className="p-3 border-b border-zinc-800/80">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                Cola FIFO Loquendo
              </span>
              <span
                className={`text-[11px] font-mono px-1.5 py-0.5 rounded ${
                  ttsState.queueLength > 3
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    : 'bg-zinc-800 text-zinc-400'
                }`}
              >
                {ttsState.queueLength} en espera
              </span>
            </div>

            <div className="space-y-1.5 max-h-28 overflow-y-auto pr-1">
              {ttsState.currentItem && (
                <div className="bg-emerald-950/50 border border-emerald-700/50 rounded px-2.5 py-1.5 text-xs flex items-center justify-between">
                  <span className="text-emerald-200 font-medium truncate">
                    🔊 {ttsState.currentItem.text}
                  </span>
                  <span className="text-[10px] font-mono text-emerald-400 ml-2 shrink-0">
                    HABLANDO
                  </span>
                </div>
              )}

              {ttsState.queue.map((item, idx) => (
                <div
                  key={item.id}
                  className="bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1 text-xs flex items-center justify-between text-zinc-300"
                >
                  <span className="truncate">
                    {idx + 1}. {item.text}
                  </span>
                  <span className="text-[10px] font-mono text-zinc-500 ml-2 shrink-0">
                    {formatDisplayTime(item.videoTime)}
                  </span>
                </div>
              ))}

              {!ttsState.currentItem && ttsState.queue.length === 0 && (
                <p className="text-[11px] text-zinc-500 italic py-1 text-center">
                  Cola vacía. Escribe abajo o pulsa F1–F8.
                </p>
              )}
            </div>
          </div>

          {/* 2. Panel de Macros Rápidas (F1 a F8) */}
          <div className="p-3 border-b border-zinc-800/80 flex-1 overflow-y-auto">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                <Keyboard className="w-3.5 h-3.5 text-amber-400" />
                Macros Rápidas (F1–F8)
              </span>
              <button
                onClick={() => setEditingMacros(!editingMacros)}
                className="text-[11px] text-zinc-400 hover:text-zinc-200 flex items-center gap-1"
              >
                {editingMacros ? (
                  <>
                    <Check className="w-3 h-3 text-emerald-400" /> Listo
                  </>
                ) : (
                  <>
                    <Edit3 className="w-3 h-3" /> Editar
                  </>
                )}
              </button>
            </div>

            <div className="grid grid-cols-1 gap-1.5">
              {macros.map((m, idx) => (
                <div
                  key={m.key}
                  className="group bg-zinc-900/90 hover:bg-zinc-800/90 border border-zinc-800 rounded-md p-1.5 transition"
                >
                  {editingMacros ? (
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300">
                          {m.key}
                        </span>
                        <input
                          type="text"
                          value={m.label}
                          onChange={(e) => {
                            const copy = [...macros];
                            copy[idx] = { ...copy[idx], label: e.target.value };
                            setMacros(copy);
                          }}
                          className="bg-zinc-950 border border-zinc-700 rounded px-1.5 py-0.5 text-xs text-zinc-200 w-full focus:outline-none"
                        />
                      </div>
                      <input
                        type="text"
                        value={m.text}
                        onChange={(e) => {
                          const copy = [...macros];
                          copy[idx] = { ...copy[idx], text: e.target.value };
                          setMacros(copy);
                        }}
                        className="bg-zinc-950 border border-zinc-700 rounded px-1.5 py-1 text-xs text-zinc-300 w-full focus:outline-none"
                      />
                    </div>
                  ) : (
                    <button
                      onClick={() => sendToLoquendo(m.text, { resumeAfter: false })}
                      className="w-full text-left flex items-start gap-2"
                    >
                      <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-zinc-800 group-hover:bg-amber-500 group-hover:text-zinc-950 text-amber-400 transition shrink-0">
                        {m.key}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-medium text-zinc-200 truncate">{m.label}</div>
                        <div className="text-[11px] text-zinc-500 truncate">{m.text}</div>
                      </div>
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* 3. Historial Teleprompter / Registro SRT */}
          <div className="p-3 h-40 flex flex-col bg-zinc-950/60">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-emerald-400" />
                Teleprompter / Log SRT
              </span>
              {subtitlesLog.length > 0 && (
                <button
                  onClick={() => setSubtitlesLog([])}
                  className="text-[11px] text-zinc-500 hover:text-red-400 flex items-center gap-1"
                >
                  <Trash2 className="w-3 h-3" /> Limpiar
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto space-y-1 pr-1">
              {subtitlesLog.length === 0 ? (
                <p className="text-[11px] text-zinc-600 italic text-center mt-5">
                  Tus reacciones aparecerán aquí con marca de tiempo para exportar a .SRT
                </p>
              ) : (
                subtitlesLog
                  .slice()
                  .reverse()
                  .map((sub) => (
                    <div
                      key={sub.id}
                      className="text-xs bg-zinc-900/70 border border-zinc-800/70 rounded px-2 py-1 flex items-start gap-2"
                    >
                      <span className="text-[10px] font-mono text-emerald-400 shrink-0 mt-0.5 flex items-center gap-0.5">
                        <Clock className="w-2.5 h-2.5" />
                        {formatDisplayTime(sub.startTime)}
                      </span>
                      <span className="text-zinc-300 break-words">{sub.text}</span>
                    </div>
                  ))
              )}
            </div>
          </div>
        </aside>
      </div>

      {/* 3. CONSOLA INFERIOR DE REDACCIÓN EN VIVO */}
      <footer className="h-20 border-t border-zinc-800 bg-zinc-900/95 px-4 flex items-center gap-3 shrink-0">
        {/* Selector de Modo (Intercambiable con TAB) */}
        <button
          onClick={() => setTypingMode((m) => (m === 'REALTIME' ? 'SMART_PAUSE' : 'REALTIME'))}
          className={`h-12 px-3.5 rounded-lg border flex flex-col justify-center shrink-0 transition text-left ${
            typingMode === 'REALTIME'
              ? 'bg-emerald-950/60 border-emerald-700/70 text-emerald-200'
              : 'bg-amber-950/60 border-amber-700/70 text-amber-200'
          }`}
          title="Presiona la tecla TAB para alternar entre Modo Tiempo Real y Modo Pausa Inteligente"
        >
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-mono uppercase px-1.5 py-0.2 bg-black/40 rounded border border-white/10">
              TAB
            </span>
            <span className="text-xs font-bold tracking-wide">
              {typingMode === 'REALTIME' ? 'MODO TIEMPO REAL' : 'MODO PAUSA INTELIGENTE'}
            </span>
          </div>
          <span className="text-[10px] opacity-80 mt-0.5">
            {typingMode === 'REALTIME'
              ? `Ráfagas de ${chunkSize}p o Enter`
              : 'Pausa el video al escribir • Enter habla y reanuda'}
          </span>
        </button>

        {/* Selector de Tamaño de Ráfaga y Ajustes */}
        {typingMode === 'REALTIME' && (
          <div
            className="flex items-center gap-1 bg-zinc-950 border border-zinc-800 rounded-lg p-1 h-12 shrink-0"
            title="Cantidad de palabras acumuladas que disparan el habla automáticamente"
          >
            <span className="text-[10px] text-zinc-400 font-medium px-1.5 uppercase">
              Ráfaga:
            </span>
            {[1, 2, 3, 4].map((size) => (
              <button
                key={size}
                type="button"
                onClick={() => {
                  setChunkSize(size);
                  if (inputRef.current) inputRef.current.focus();
                }}
                className={`h-8 px-2.5 rounded text-xs font-mono font-bold transition flex items-center justify-center ${
                  chunkSize === size
                    ? 'bg-amber-500 text-zinc-950 shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
                }`}
                title={`Disparar automáticamente al escribir ${size} palabra${size > 1 ? 's' : ''} (o antes con Enter)`}
              >
                {size}p
              </button>
            ))}

            <button
              type="button"
              onClick={() => setIsSettingsOpen(true)}
              className="h-8 px-2 rounded text-zinc-400 hover:text-amber-400 hover:bg-zinc-800 transition flex items-center justify-center ml-0.5 border-l border-zinc-800"
              title="Ajustes de ritmo, rango de palabras y tiempo de inactividad"
            >
              <Settings className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Input principal de baja latencia con indicador visual del buffer y barra de inactividad */}
        <div className="flex-1 relative">
          <input
            ref={inputRef}
            type="text"
            value={inputText}
            onChange={handleInputChange}
            onKeyDown={handleInputKeyDown}
            placeholder={
              typingMode === 'REALTIME'
                ? `Escribe continuamente... se envía cada ${chunkSize} palabras${
                    idleAutoSend ? ` o tras ${idleTimeoutSec.toFixed(1)}s de pausa` : ''
                  } (o Enter)`
                : 'Empieza a escribir para pausar la Ventana de Video... presiona Enter para que Loquendo hable y reanude el video'
            }
            className="w-full h-12 bg-zinc-950 border border-zinc-700 focus:border-amber-500 rounded-lg pl-4 pr-52 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none transition shadow-inner"
            autoFocus
          />

          {/* Micro-barra animada de progreso de inactividad en la base del input */}
          {idleAutoSend && inputText.trim().length > 0 && typingMode === 'REALTIME' && (
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-zinc-800 rounded-b-lg overflow-hidden pointer-events-none">
              <div
                key={inputText}
                className="h-full bg-gradient-to-r from-amber-500 to-amber-300"
                style={{
                  animation: `idleProgressAnim ${idleTimeoutSec}s linear forwards`
                }}
              />
            </div>
          )}

          {/* Indicador visual dentro del input a la derecha */}
          {typingMode === 'REALTIME' ? (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2 pointer-events-none select-none">
              <div className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 px-2 py-1 rounded-md">
                <div className="flex items-center gap-1">
                  {Array.from({ length: chunkSize }).map((_, i) => {
                    const currentWordsCount = inputText.trim().split(/\s+/).filter(Boolean).length;
                    return (
                      <span
                        key={i}
                        className={`w-2 h-2 rounded-full transition-all duration-150 ${
                          i < currentWordsCount
                            ? 'bg-amber-400 scale-110 shadow-sm shadow-amber-500/50'
                            : 'bg-zinc-700'
                        }`}
                      />
                    );
                  })}
                </div>
                <span className="text-[10px] font-mono font-medium text-zinc-300 ml-0.5">
                  {inputText.trim().split(/\s+/).filter(Boolean).length}/{chunkSize}
                </span>
              </div>

              {idleAutoSend && (
                <span
                  className="flex items-center gap-0.5 text-[10px] font-mono bg-zinc-900 text-amber-400/90 border border-zinc-800 px-1.5 py-0.5 rounded"
                  title={`Auto-envío activo tras ${idleTimeoutSec.toFixed(1)}s sin teclear`}
                >
                  <Timer className="w-2.5 h-2.5 text-amber-400" />
                  {idleTimeoutSec.toFixed(1)}s
                </span>
              )}

              <span className="text-[10px] font-mono bg-zinc-800 text-zinc-400 border border-zinc-700 px-1.5 py-0.5 rounded">
                Enter ↵
              </span>
            </div>
          ) : (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center pointer-events-none select-none">
              <span className="text-[10px] font-mono bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-1 rounded">
                Enter ↵ Hablar y Reanudar
              </span>
            </div>
          )}
        </div>
      </footer>

      {/* 4. MODAL FLOTANTE DE AJUSTES DE RITMO Y HABLA */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl max-w-md w-full p-6 shadow-2xl relative space-y-6">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center">
                  <Sliders className="w-4 h-4 text-amber-400" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-zinc-100">Ajustes de Ritmo y Habla</h3>
                  <p className="text-[11px] text-zinc-400">Calibra el flujo de escritura y voz de Loquendo</p>
                </div>
              </div>
              <button
                onClick={() => setIsSettingsOpen(false)}
                className="text-zinc-400 hover:text-zinc-100 p-1 rounded-md hover:bg-zinc-800 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Rango de palabras por ráfaga */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-zinc-200">
                  Palabras por ráfaga (Chunk Size):
                </label>
                <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  {chunkSize} {chunkSize === 1 ? 'palabra' : 'palabras'}
                </span>
              </div>
              <input
                type="range"
                min="1"
                max="8"
                step="1"
                value={chunkSize}
                onChange={(e) => setChunkSize(Number(e.target.value))}
                className="w-full accent-amber-500 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-zinc-500 font-mono px-0.5">
                <span>1 (Palabra a palabra)</span>
                <span>3 (Recomendado)</span>
                <span>8 (Frase completa)</span>
              </div>
              <p className="text-[11px] text-zinc-400 leading-relaxed">
                Al escribir N palabras continuas se enviarán juntas a Loquendo automáticamente para darle mejor entonación y prosodia natural.
              </p>
            </div>

            {/* Auto-envío por inactividad */}
            <div className="space-y-3 pt-3 border-t border-zinc-800/80">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Timer className="w-4 h-4 text-amber-400" />
                  <span className="text-xs font-semibold text-zinc-200">
                    Auto-envío tras pausa al escribir:
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setIdleAutoSend(!idleAutoSend)}
                  className={`w-11 h-6 rounded-full transition-colors p-1 flex items-center ${
                    idleAutoSend ? 'bg-amber-500 justify-end' : 'bg-zinc-700 justify-start'
                  }`}
                >
                  <span className="w-4 h-4 rounded-full bg-zinc-950 shadow-md transform transition" />
                </button>
              </div>

              {idleAutoSend ? (
                <div className="space-y-2 bg-zinc-950/60 border border-zinc-800/60 p-3 rounded-lg">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-zinc-400">Tiempo de espera sin teclear:</span>
                    <span className="text-xs font-mono font-bold text-amber-400">
                      {idleTimeoutSec.toFixed(1)} segundos
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0.5"
                    max="4.0"
                    step="0.1"
                    value={idleTimeoutSec}
                    onChange={(e) => setIdleTimeoutSec(parseFloat(e.target.value))}
                    className="w-full accent-amber-500 cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-zinc-500 font-mono">
                    <span>0.5s (Rápido)</span>
                    <span>1.5s (Equilibrado)</span>
                    <span>4.0s (Pausado)</span>
                  </div>
                  <p className="text-[11px] text-zinc-400 leading-relaxed">
                    Si escribes 1 o más palabras y te detienes por {idleTimeoutSec.toFixed(1)}s, Loquendo las dirá tal cual automáticamente sin tener que tocar Enter.
                  </p>
                </div>
              ) : (
                <p className="text-[11px] text-zinc-500 italic">
                  El auto-envío por tiempo está desactivado. Loquendo esperará a que completes el número de palabras o presiones Enter.
                </p>
              )}
            </div>

            <div className="pt-2">
              <button
                onClick={() => setIsSettingsOpen(false)}
                className="w-full bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-xs py-2.5 rounded-lg transition"
              >
                Guardar y Volver al Estudio
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 3. ENRUTADOR PRINCIPAL (Determina si renderiza VideoWindow o StudioWindow)
// ============================================================================
export default function App() {
  const urlParams = new URLSearchParams(window.location.search);
  const viewMode = urlParams.get('view') || 'studio';

  if (viewMode === 'video') {
    return <VideoWindow />;
  }

  return <StudioWindow />;
}
