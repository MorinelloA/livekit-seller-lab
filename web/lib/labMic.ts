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
 */

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

  async playClip(url: string): Promise<void> {
    const buffer = await this.loadClip(url);
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.destination);
    source.connect(this.context.destination);
    await new Promise<void>((resolve) => {
      source.onended = () => resolve();
      source.start();
    });
    source.disconnect();
  }

  async close(): Promise<void> {
    if (this.cafeTimer) clearInterval(this.cafeTimer);
    this.cafeSource?.stop();
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
      throw new Error(`Couldn't load ${url}. Run the clip scripts in scripts/ to create the test-caller clips.`);
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
