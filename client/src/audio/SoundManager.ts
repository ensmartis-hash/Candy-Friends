// Candy Friends — Sound Manager
// Web Audio API for procedural sound effects

export class SoundManager {
  private audioContext: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private enabled = true;
  private readonly soundCache: Map<string, AudioBuffer> = new Map();

  async init(): Promise<void> {
    if (this.audioContext) return;
    
    this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    this.masterGain = this.audioContext.createGain();
    this.masterGain.connect(this.audioContext.destination);
    this.masterGain.gain.value = 0.5;
    
    // Resume on user interaction (required by browsers)
    const resume = async () => {
      if (this.audioContext?.state === 'suspended') {
        await this.audioContext.resume();
      }
      document.removeEventListener('click', resume);
      document.removeEventListener('keydown', resume);
      document.removeEventListener('touchstart', resume);
    };
    document.addEventListener('click', resume);
    document.addEventListener('keydown', resume);
    document.addEventListener('touchstart', resume);
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (this.masterGain) {
      this.masterGain.gain.value = enabled ? 0.5 : 0;
    }
  }

  setVolume(volume: number): void {
    if (this.masterGain) {
      this.masterGain.gain.value = Math.max(0, Math.min(1, volume));
    }
  }

  // Generate procedural sounds
  private createOscillator(type: OscillatorType, frequency: number, duration: number, gainValue: number = 0.3): AudioBuffer {
    if (!this.audioContext) throw new Error('AudioContext not initialized');
    
    const sampleRate = this.audioContext.sampleRate;
    const length = Math.ceil(sampleRate * duration);
    const buffer = this.audioContext.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);
    
    const oscillator = this.audioContext.createOscillator();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    
    const gain = this.audioContext.createGain();
    gain.gain.value = gainValue;
    
    // Offline rendering
    const offlineCtx = new OfflineAudioContext(1, length, sampleRate);
    const offlineOsc = offlineCtx.createOscillator();
    offlineOsc.type = type;
    offlineOsc.frequency.value = frequency;
    
    const offlineGain = offlineCtx.createGain();
    offlineGain.gain.value = gainValue;
    offlineGain.gain.setValueAtTime(gainValue, 0);
    offlineGain.gain.exponentialRampToValueAtTime(0.001, duration);
    
    offlineOsc.connect(offlineGain).connect(offlineCtx.destination);
    offlineOsc.start(0);
    offlineOsc.stop(duration);
    
    return offlineCtx.startRendering();
  }

  async playSound(name: string): Promise<void> {
    if (!this.enabled || !this.audioContext) return;
    
    let buffer = this.soundCache.get(name);
    if (!buffer) {
      buffer = await this.generateSound(name);
      this.soundCache.set(name, buffer);
    }
    
    const source = this.audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(this.masterGain!);
    source.start(0);
  }

  private async generateSound(name: string): Promise<AudioBuffer> {
    switch (name) {
      case 'move':
        return this.createTone(200, 0.1, 'square', 0.1);
      case 'jump':
        return this.createTone(400, 0.2, 'sine', 0.2);
      case 'ability':
        return this.createTone(600, 0.3, 'triangle', 0.25);
      case 'core_collect':
        return this.createTone(800, 0.4, 'sine', 0.3);
      case 'substation':
        return this.createTone(500, 0.5, 'sine', 0.3);
      case 'stun':
        return this.createNoise(0.2, 0.3);
      case 'hurt':
        return this.createTone(150, 0.3, 'sawtooth', 0.4);
      case 'match_start':
        return this.createArpeggio([440, 554, 659], 0.15, 0.2);
      case 'match_win':
        return this.createArpeggio([523, 659, 784, 1047], 0.1, 0.3);
      case 'match_lose':
        return this.createArpeggio([392, 349, 330, 294], 0.15, 0.2);
      case 'button':
        return this.createTone(800, 0.05, 'square', 0.15);
      default:
        return this.createTone(440, 0.1, 'sine', 0.2);
    }
  }

  private async createTone(frequency: number, duration: number, type: OscillatorType, gain: number): Promise<AudioBuffer> {
    if (!this.audioContext) throw new Error('AudioContext not initialized');
    
    const offlineCtx = new OfflineAudioContext(1, Math.ceil(this.audioContext.sampleRate * duration), this.audioContext.sampleRate);
    const osc = offlineCtx.createOscillator();
    osc.type = type;
    osc.frequency.value = frequency;
    
    const gainNode = offlineCtx.createGain();
    gainNode.gain.value = gain;
    gainNode.gain.setValueAtTime(gain, 0);
    gainNode.gain.exponentialRampToValueAtTime(0.001, duration);
    
    osc.connect(gainNode).connect(offlineCtx.destination);
    osc.start(0);
    osc.stop(duration);
    
    return offlineCtx.startRendering();
  }

  private async createNoise(duration: number, gain: number): Promise<AudioBuffer> {
    if (!this.audioContext) throw new Error('AudioContext not initialized');
    
    const offlineCtx = new OfflineAudioContext(1, Math.ceil(this.audioContext.sampleRate * duration), this.audioContext.sampleRate);
    const buffer = offlineCtx.createBuffer(1, offlineCtx.length, offlineCtx.sampleRate);
    const data = buffer.getChannelData(0);
    
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * gain;
    }
    
    const source = offlineCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(offlineCtx.destination);
    source.start(0);
    
    return offlineCtx.startRendering();
  }

  private async createArpeggio(frequencies: number[], noteDuration: number, gain: number): Promise<AudioBuffer> {
    if (!this.audioContext) throw new Error('AudioContext not initialized');
    
    const totalDuration = frequencies.length * noteDuration;
    const offlineCtx = new OfflineAudioContext(1, Math.ceil(this.audioContext.sampleRate * totalDuration), this.audioContext.sampleRate);
    
    for (let i = 0; i < frequencies.length; i++) {
      const osc = offlineCtx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = frequencies[i];
      
      const gainNode = offlineCtx.createGain();
      gainNode.gain.value = gain;
      gainNode.gain.setValueAtTime(gain, i * noteDuration);
      gainNode.gain.exponentialRampToValueAtTime(0.001, (i + 1) * noteDuration);
      
      osc.connect(gainNode).connect(offlineCtx.destination);
      osc.start(i * noteDuration);
      osc.stop((i + 1) * noteDuration);
    }
    
    return offlineCtx.startRendering();
  }

  // Convenience methods
  async playMove(): Promise<void> { await this.playSound('move'); }
  async playJump(): Promise<void> { await this.playSound('jump'); }
  async playAbility(): Promise<void> { await this.playSound('ability'); }
  async playCoreCollect(): Promise<void> { await this.playSound('core_collect'); }
  async playSubstation(): Promise<void> { await this.playSound('substation'); }
  async playStun(): Promise<void> { await this.playSound('stun'); }
  async playHurt(): Promise<void> { await this.playSound('hurt'); }
  async playMatchStart(): Promise<void> { await this.playSound('match_start'); }
  async playMatchWin(): Promise<void> { await this.playSound('match_win'); }
  async playMatchLose(): Promise<void> { await this.playSound('match_lose'); }
  async playButton(): Promise<void> { await this.playSound('button'); }
}

// Singleton instance
export const soundManager = new SoundManager();