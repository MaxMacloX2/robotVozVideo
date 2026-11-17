const { spawn } = require('child_process');
const EventEmitter = require('events');
const fs = require('fs');

/**
 * Puente persistente de baja latencia entre Node.js y SAPI 5 (System.Speech) en Windows.
 * Soporta tanto procesos de 64-bit como SysWOW64 (32-bit) para detectar voces clásicas
 * de Loquendo TTS 7 ("Jorge", "Carlos", "Carmen", etc.) y mantiene una cola FIFO con
 * ajuste dinámico de velocidad (Dynamic Rate Boost).
 */
class TTSBridge extends EventEmitter {
  constructor() {
    super();
    this.psProcess = null;
    this.queue = []; // Elementos: { id, text, videoTime, resumeAfter, createdAt }
    this.isSpeaking = false;
    this.currentItem = null;
    this.voices = [];
    this.selectedVoice = '';
    this.baseRate = 1;       // Escala SAPI 5: -10 a 10
    this.boostRate = 3;      // Velocidad turbo cuando la cola supera el umbral
    this.boostThreshold = 3; // Si hay > 3 ítems en espera, activa turbo
    this.volume = 100;       // 0 a 100
    this.archMode = 'auto';  // 'x86 (32-bit Loquendo/SAPI5)' o 'x64 (64-bit SAPI5)'
    this.prefer32Bit = true;
    this.stdoutBuffer = '';
  }

  /**
   * Resuelve la ruta del ejecutable de PowerShell.
   * Las voces clásicas de Loquendo TTS 7 son librerías COM de 32 bits, por lo que
   * usar el PowerShell de 32 bits (SysWOW64) en Windows de 64 bits permite verlas
   * junto con las voces SAPI 5 estándar.
   */
  getPowerShellPath(prefer32Bit = true) {
    const sysRoot = process.env.SystemRoot || 'C:\\Windows';
    const wow64Path = `${sysRoot}\\SysWOW64\\WindowsPowerShell\\v1.0\\powershell.exe`;
    if (prefer32Bit && fs.existsSync(wow64Path)) {
      return wow64Path;
    }
    return 'powershell.exe';
  }

  /**
   * Script de PowerShell embebido que se mantiene vivo leyendo comandos JSON en Base64
   * desde STDIN línea por línea y ejecutando la síntesis de forma fiable sin deadlocks.
   */
  getPowerShellScript() {
    return `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::InputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Speech

$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$synth.SetOutputToDefaultAudioDevice()

function Emit-Voices {
    $voiceList = @()
    foreach ($v in $synth.GetInstalledVoices()) {
        if ($v.Enabled) {
            $info = $v.VoiceInfo
            $voiceList += @{
                name = $info.Name
                culture = $info.Culture.Name
                gender = $info.Gender.ToString()
                age = $info.Age.ToString()
                description = $info.Description
                isLoquendo = ($info.Name -match "Loquendo|Jorge|Carlos|Carmen|Diego|Esperanza|Francisca|Juan|Soledad|Ximena|Ludoviko" -or $info.Description -match "Loquendo")
            }
        }
    }
    $json = ConvertTo-Json -InputObject @($voiceList) -Compress
    [Console]::WriteLine("@@VOICES:$json@@")
    [Console]::Out.Flush()
}

Emit-Voices
[Console]::WriteLine("@@READY@@")
[Console]::Out.Flush()

while ($true) {
    $line = [Console]::ReadLine()
    if ($null -eq $line) { break }
    if ([string]::IsNullOrWhiteSpace($line)) { continue }

    try {
        $rawJson = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($line))
        $cmd = ConvertFrom-Json $rawJson

        switch ($cmd.action) {
            "SPEAK" {
                if ($cmd.voice -and $synth.Voice.Name -ne $cmd.voice) {
                    try { $synth.SelectVoice($cmd.voice) } catch {}
                }
                if ($null -ne $cmd.rate) {
                    $r = [Math]::Max(-10, [Math]::Min(10, [int]$cmd.rate))
                    $synth.Rate = $r
                }
                if ($null -ne $cmd.volume) {
                    $v = [Math]::Max(0, [Math]::Min(100, [int]$cmd.volume))
                    $synth.Volume = $v
                }
                $synth.Speak([string]$cmd.text)
                [Console]::WriteLine("@@EVENT:DONE@@")
                [Console]::Out.Flush()
            }
            "SET_VOICE" {
                if ($cmd.voice) {
                    try {
                        $synth.SelectVoice([string]$cmd.voice)
                        [Console]::WriteLine("@@VOICE_CHANGED:$($synth.Voice.Name)@@")
                        [Console]::Out.Flush()
                    } catch {
                        [Console]::WriteLine("@@EVENT:ERROR:No se pudo seleccionar la voz $($cmd.voice)@@")
                        [Console]::Out.Flush()
                    }
                }
            }
            "LIST_VOICES" {
                Emit-Voices
            }
            "EXIT" {
                break
            }
        }
    } catch {
        $e = $_.Exception.Message -replace "[\\r\\n]+", " "
        [Console]::WriteLine("@@EVENT:ERROR:$e@@")
        [Console]::Out.Flush()
    }
}
`;
  }

  /**
   * Inicia el proceso persistente de PowerShell.
   * @param {boolean} prefer32Bit True para usar SysWOW64 (detecta voces Loquendo 32-bit).
   */
  init(prefer32Bit = true) {
    this.dispose();
    this.prefer32Bit = prefer32Bit;

    const psExecutable = this.getPowerShellPath(prefer32Bit);
    this.archMode = prefer32Bit && psExecutable.includes('SysWOW64')
      ? 'x86 (32-bit Loquendo/SAPI5)'
      : 'x64 (64-bit SAPI5)';

    const encodedScript = Buffer.from(this.getPowerShellScript(), 'utf16le').toString('base64');

    this.psProcess = spawn(psExecutable, [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy', 'Bypass',
      '-EncodedCommand', encodedScript
    ], {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    this.psProcess.stdout.setEncoding('utf8');
    this.psProcess.stdout.on('data', (chunk) => this._handleStdout(chunk));

    this.psProcess.stderr.setEncoding('utf8');
    this.psProcess.stderr.on('data', (errChunk) => {
      console.error('[TTSBridge PowerShell Stderr]:', errChunk.trim());
    });

    this.psProcess.on('exit', (code) => {
      this.isSpeaking = false;
      this.emit('status', this.getState());
    });
  }

  _handleStdout(chunk) {
    this.stdoutBuffer += chunk;
    let lines = this.stdoutBuffer.split(/\r?\n/);
    this.stdoutBuffer = lines.pop() || '';

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;

      if (line.startsWith('@@VOICES:') && line.endsWith('@@')) {
        const jsonStr = line.slice('@@VOICES:'.length, -2);
        try {
          const parsed = JSON.parse(jsonStr);
          const list = Array.isArray(parsed) ? parsed : (parsed ? [parsed] : []);
          // Ordenar priorizando voces Loquendo al principio
          this.voices = list.sort((a, b) => Number(b.isLoquendo) - Number(a.isLoquendo));

          if (!this.selectedVoice && this.voices.length > 0) {
            const jorge = this.voices.find(v => /jorge/i.test(v.name)) ||
                          this.voices.find(v => v.isLoquendo) ||
                          this.voices[0];
            this.selectedVoice = jorge ? jorge.name : this.voices[0].name;
          }
          this.emit('voices', { voices: this.voices, selectedVoice: this.selectedVoice, archMode: this.archMode });
          this.emit('status', this.getState());
        } catch (err) {
          console.error('[TTSBridge] Error parseando lista de voces:', err);
        }
      } else if (line === '@@EVENT:DONE@@') {
        const finishedItem = this.currentItem;
        this.isSpeaking = false;
        this.currentItem = null;
        this.emit('item-finished', { item: finishedItem, cancelled: false });
        this.emit('status', this.getState());
        this._processNext();
      } else if (line.startsWith('@@EVENT:ERROR:')) {
        const msg = line.slice('@@EVENT:ERROR:'.length, -2);
        console.error('[TTSBridge Error SAPI]:', msg);
        this.isSpeaking = false;
        this.currentItem = null;
        this.emit('status', this.getState());
        this._processNext();
      } else if (line === '@@READY@@') {
        this.emit('ready', this.getState());
        this._processNext();
      }
    }
  }

  _sendToPS(payload) {
    if (!this.psProcess || !this.psProcess.stdin.writable) return;
    const b64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
    this.psProcess.stdin.write(b64 + '\n');
  }

  /**
   * Encola una palabra o frase en la cola FIFO.
   */
  enqueue({ text, videoTime = 0, resumeAfter = false }) {
    const cleanText = String(text || '').trim();
    if (!cleanText) return null;

    const item = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      text: cleanText,
      videoTime,
      resumeAfter,
      createdAt: Date.now()
    };

    this.queue.push(item);
    this.emit('status', this.getState());
    this._processNext();
    return item;
  }

  /**
   * Despacha el siguiente elemento solo si PowerShell terminó de pronunciar el anterior.
   * Si la cola tiene más de `boostThreshold` (3) elementos pendientes, aplica
   * automáticamente el incremento de velocidad (`boostRate`) hasta vaciar la cola.
   */
  _processNext() {
    if (this.isSpeaking) return;

    if (this.queue.length === 0) {
      this.emit('queue-empty');
      this.emit('status', this.getState());
      return;
    }

    const nextItem = this.queue.shift();
    this.currentItem = nextItem;
    this.isSpeaking = true;

    // Ajuste dinámico de velocidad: si hay > 3 palabras acumuladas, acelera la lectura
    const remainingCount = this.queue.length;
    const isBoosted = remainingCount >= this.boostThreshold;
    const effectiveRate = isBoosted
      ? Math.min(10, Math.max(this.baseRate + 2, this.boostRate))
      : this.baseRate;

    this._sendToPS({
      action: 'SPEAK',
      text: nextItem.text,
      voice: this.selectedVoice,
      rate: effectiveRate,
      volume: this.volume
    });

    this.emit('speaking', {
      item: nextItem,
      effectiveRate,
      isBoosted,
      queueLength: this.queue.length
    });
    this.emit('status', this.getState(effectiveRate, isBoosted));
  }

  /**
   * Botón de pánico (Esc): vacía inmediatamente la cola y corta de inmediato el habla en curso.
   */
  stopAll() {
    this.queue = [];
    if (this.isSpeaking && this.psProcess) {
      // Reiniciar el proceso PowerShell corta el audio de Windows al instante (0 ms)
      this.init(this.prefer32Bit);
    }
    this.isSpeaking = false;
    this.currentItem = null;
    this.emit('panic');
    this.emit('status', this.getState());
  }

  setConfig({ voice, baseRate, boostRate, boostThreshold, volume, prefer32Bit }) {
    if (typeof prefer32Bit === 'boolean' && prefer32Bit !== this.prefer32Bit) {
      this.init(prefer32Bit);
      return this.getState();
    }
    if (voice !== undefined && voice !== this.selectedVoice) {
      this.selectedVoice = voice;
      this._sendToPS({ action: 'SET_VOICE', voice });
    }
    if (baseRate !== undefined) this.baseRate = Number(baseRate);
    if (boostRate !== undefined) this.boostRate = Number(boostRate);
    if (boostThreshold !== undefined) this.boostThreshold = Number(boostThreshold);
    if (volume !== undefined) this.volume = Number(volume);

    const state = this.getState();
    this.emit('status', state);
    return state;
  }

  getState(effectiveRate = this.baseRate, isBoosted = false) {
    return {
      isSpeaking: this.isSpeaking,
      currentItem: this.currentItem,
      queue: this.queue,
      queueLength: this.queue.length,
      voices: this.voices,
      selectedVoice: this.selectedVoice,
      baseRate: this.baseRate,
      boostRate: this.boostRate,
      boostThreshold: this.boostThreshold,
      effectiveRate,
      isBoosted,
      volume: this.volume,
      archMode: this.archMode
    };
  }

  dispose() {
    if (this.psProcess) {
      try {
        this._sendToPS({ action: 'EXIT' });
        this.psProcess.kill();
      } catch (_) {}
      this.psProcess = null;
    }
  }
}

module.exports = { TTSBridge };
