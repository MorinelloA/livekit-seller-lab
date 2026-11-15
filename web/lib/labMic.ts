/**
 * The learner's "microphone" for the lab: one audio track the page publishes to
 * LiveKit, fed by a small Web Audio mixer.
 *
 * - The real microphone goes through a gain node, so it can be held silent while
 *   the test caller plays and turned on for "try it yourself."
 * - Test-caller clips play straight into the same track, so the agent hears them
 *   exactly as it would hear a person. Every run of a clip is identical, which is
 *   what makes the Baseline and Enhanced runs comparable.
 * - Clips also play on the learner's speakers or headphones, so they hear the call.
 * - "Café noise" mixes a café recording into the same track while the learner
 *   talks, for Experiment 3. It goes to the agent only. It plays only while the
 *   learner's own voice is coming in: voice isolation keeps the loudest nearby
 *   voice, so with nobody talking into the microphone, a café voice would count
 *   as the caller (a real caller's phone is much closer to their mouth).
 * - In development, it can also record a run as a listener hears it (the clips
 *   and Juniper's voice) for the overview's replay. See scripts/capture-server.mjs.
 */

/** A clip that has started: when (performance.now()), how long it runs (seconds), and when it's over. */
export interface PlayingClip {
  startedAt: number;
  duration: number;
  ended: Promise<void>;
}

interface Capture {
  input: GainNode;
  processor: ScriptProcessorNode;
  agent: MediaStreamAudioSourceNode | null;
  chunks: Float32Array[];
}

// Above this level (RMS, 0 to 1, about -40 dBFS) the microphone counts as the
// learner talking. The café keeps playing this long after they stop.
const VOICE_RMS = 0.01;
const CAFE_HANGOVER_MS = 1_200;

export class LabMic {
  readonly track: MediaStreamTrack;
  private readonly context: AudioContext;
  private readonly destination: MediaStreamAudioDestinationNode;
  private readonly micGain: GainNode;
  private readonly cafeGain: GainNode;
  private micStream: MediaStream | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;
  private micLevel: AnalyserNode | null = null;
  private cafeSource: AudioBufferSourceNode | null = null;
  private cafeTimer: ReturnType<typeof setInterval> | null = null;
  private lastVoiceAt = 0;
  private wantMic = false;
  private held = false;
  private readonly clips = new Map<string, AudioBuffer>();
  /** Finishers for clips still playing, so closing mid-clip never leaves a run waiting. */
  private readonly endings = new Set<() => void>();
  private capture: Capture | null = null;

  constructor() {
    this.context = new AudioContext({ sampleRate: 48_000 });
    this.destination = this.context.createMediaStreamDestination();
    this.micGain = this.context.createGain();
    this.micGain.gain.value = 0;
    this.micGain.connect(this.destination);
    this.cafeGain = this.context.createGain();
    this.cafeGain.gain.value = 0;
    this.cafeGain.connect(this.destination);
    this.track = this.destination.stream.getAudioTracks()[0];
  }

  /** Starts the café under the learner's voice, or stops it. */
  async setCafe(url: string | null): Promise<void> {
    this.cafeSource?.stop();
    this.cafeSource?.disconnect();
    this.cafeSource = null;
    if (this.cafeTimer) clearInterval(this.cafeTimer);
    this.cafeTimer = null;
    this.cafeGain.gain.value = 0;
    if (!url) return;
    const source = this.context.createBufferSource();
    source.buffer = await this.loadClip(url);
    source.loop = true;
    source.connect(this.cafeGain);
    source.start();
    this.cafeSource = source;
    this.cafeTimer = setInterval(() => this.gateCafe(), 50);
  }

  /** Browsers start audio suspended until a click; call this from one. */
  async resume(): Promise<void> {
    if (this.context.state !== 'running') await this.context.resume();
  }

  async setMicEnabled(enabled: boolean): Promise<void> {
    if (enabled && !this.micStream) {
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      this.micSource = this.context.createMediaStreamSource(this.micStream);
      this.micSource.connect(this.micGain);
      this.micLevel = this.context.createAnalyser();
      this.micLevel.fftSize = 1024;
      this.micSource.connect(this.micLevel);
    }
    this.wantMic = enabled;
    this.applyMicGain();
  }

  /** Silence the real microphone, and the café, while the test caller plays. */
  setHold(held: boolean): void {
    this.held = held;
    this.applyMicGain();
    if (held) this.cafeGain.gain.setTargetAtTime(0, this.context.currentTime, 0.02);
  }

  /** Starts a clip and says when it started, for the timeline. `ended` settles when it finishes or the mic closes. */
  async startClip(url: string): Promise<PlayingClip> {
    const buffer = await this.loadClip(url);
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.destination);
    source.connect(this.context.destination);
    if (this.capture) source.connect(this.capture.input);
    let finish: () => void = () => undefined;
    const ended = new Promise<void>((resolve) => {
      finish = () => {
        this.endings.delete(finish);
        source.disconnect();
        resolve();
      };
    });
    source.onended = finish;
    this.endings.add(finish);
    source.start();
    return { startedAt: performance.now(), duration: buffer.duration, ended };
  }

  async playClip(url: string): Promise<void> {
    await (await this.startClip(url)).ended;
  }

  /**
   * Development only: records what a listener hears, the clips plus the
   * agent's voice, until stopCapture(). The agent's track must also be playing
   * through an audio element (RoomAudioRenderer), or Chrome feeds silence.
   */
  startCapture(agentTrack: MediaStreamTrack | null): void {
    this.stopCapture();
    const input = this.context.createGain();
    // A script processor is deprecated but tiny, and this never ships to visitors.
    const processor = this.context.createScriptProcessor(4096, 1, 1);
    const chunks: Float32Array[] = [];
    processor.onaudioprocess = (event) => chunks.push(new Float32Array(event.inputBuffer.getChannelData(0)));
    input.connect(processor);
    // It only runs while connected to an output; its output stays silent.
    processor.connect(this.context.destination);
    const agent = agentTrack ? this.context.createMediaStreamSource(new MediaStream([agentTrack])) : null;
    agent?.connect(input);
    this.capture = { input, processor, agent, chunks };
  }

  /** Stops recording and returns the samples (mono, at the context's rate), or null if nothing was recording. */
  stopCapture(): { samples: Float32Array; sampleRate: number } | null {
    const capture = this.capture;
    if (!capture) return null;
    this.capture = null;
    capture.processor.onaudioprocess = null;
    capture.agent?.disconnect();
    capture.input.disconnect();
    capture.processor.disconnect();
    const length = capture.chunks.reduce((n, chunk) => n + chunk.length, 0);
    const samples = new Float32Array(length);
    let offset = 0;
    for (const chunk of capture.chunks) {
      samples.set(chunk, offset);
      offset += chunk.length;
    }
    return { samples, sampleRate: this.context.sampleRate };
  }

  async close(): Promise<void> {
    if (this.cafeTimer) clearInterval(this.cafeTimer);
    this.cafeSource?.stop();
    this.stopCapture();
    // A clip cut off by closing never fires onended; settle it so its run can end.
    [...this.endings].forEach((finish) => finish());
    this.micStream?.getTracks().forEach((t) => t.stop());
    this.track.stop();
    if (this.context.state !== 'closed') await this.context.close();
  }

  /** Opens the café while the learner is talking, and for a moment after. */
  private gateCafe(): void {
    const now = performance.now();
    if (this.micLevel && this.wantMic && !this.held) {
      const samples = new Float32Array(this.micLevel.fftSize);
      this.micLevel.getFloatTimeDomainData(samples);
      let sum = 0;
      for (const s of samples) sum += s * s;
      if (Math.sqrt(sum / samples.length) > VOICE_RMS) this.lastVoiceAt = now;
    }
    const open = !this.held && now - this.lastVoiceAt < CAFE_HANGOVER_MS;
    this.cafeGain.gain.setTargetAtTime(open ? 1 : 0, this.context.currentTime, open ? 0.03 : 0.2);
  }

  private async loadClip(url: string): Promise<AudioBuffer> {
    const cached = this.clips.get(url);
    if (cached) return cached;
    const response = await fetch(url);
    if (!response.ok) {
      // The fix is a developer's, so the console says how; the learner gets plain words.
      console.warn(
        `Couldn't load ${url} (${response.status}). Run scripts/make_clips_livekit.py and scripts/make_clips_exp34.py to create the test-caller clips.`,
      );
      throw new Error('The test caller’s recording couldn’t load. Reload the page and try again.');
    }
    const buffer = await this.context.decodeAudioData(await response.arrayBuffer());
    this.clips.set(url, buffer);
    return buffer;
  }

  private applyMicGain(): void {
    const target = this.wantMic && !this.held ? 1 : 0;
    this.micGain.gain.setTargetAtTime(target, this.context.currentTime, 0.02);
  }
}
