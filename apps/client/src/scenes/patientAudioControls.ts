import { SoftPatientAudio } from './patientAlertAudio.js';

const SETTINGS_KEY = 'pokecenter.patient-audio';

export function bindPatientAudioControls(audio: SoftPatientAudio, button: HTMLButtonElement,
  volume: HTMLInputElement, storage: Storage | null, gestures: EventTarget, visibility: Document): () => void {
  try {
    const saved: unknown = JSON.parse(storage?.getItem(SETTINGS_KEY) ?? 'null');
    if (saved && typeof saved === 'object') {
      if ('muted' in saved && typeof saved.muted === 'boolean') audio.setMuted(saved.muted);
      if ('volume' in saved && typeof saved.volume === 'number') audio.setVolume(saved.volume);
    }
  } catch { /* Storage is optional in restricted browser sessions. */ }
  const render = () => {
    const enabled = !audio.muted && audio.volume > 0;
    button.textContent = enabled ? 'SOUND ON' : 'SOUND OFF';
    button.setAttribute('aria-pressed', String(enabled));
    button.title = enabled ? 'Mute patient alerts' : 'Enable patient alerts';
    volume.value = String(Math.round(audio.volume * 100));
    volume.setAttribute('aria-valuetext', `${volume.value} percent`);
    volume.title = `Alert volume: ${volume.value}%`;
  };
  const save = () => {
    render();
    try { storage?.setItem(SETTINGS_KEY, JSON.stringify({ muted: audio.muted, volume: audio.volume })); }
    catch { /* The controls still work without persistent storage. */ }
  };
  const unlock = () => { void audio.unlock(); };
  const toggle = () => {
    const enable = audio.muted || audio.volume === 0;
    audio.setMuted(!enable);
    if (enable && audio.volume === 0) audio.setVolume(0.35);
    if (enable) unlock();
    save();
  };
  const adjust = () => { audio.setVolume(Number(volume.value) / 100); save(); };
  const controlKey = (event: Event) => {
    if (event.type === 'keydown') unlock();
    event.stopPropagation();
  };
  const hide = () => { if (visibility.hidden) audio.stop(); };
  button.addEventListener('click', toggle);
  volume.addEventListener('input', adjust);
  for (const control of [button, volume]) {
    control.addEventListener('keydown', controlKey);
    control.addEventListener('keyup', controlKey);
  }
  gestures.addEventListener('pointerdown', unlock);
  gestures.addEventListener('keydown', unlock);
  visibility.addEventListener('visibilitychange', hide);
  render();
  return () => {
    button.removeEventListener('click', toggle);
    volume.removeEventListener('input', adjust);
    for (const control of [button, volume]) {
      control.removeEventListener('keydown', controlKey);
      control.removeEventListener('keyup', controlKey);
    }
    gestures.removeEventListener('pointerdown', unlock);
    gestures.removeEventListener('keydown', unlock);
    visibility.removeEventListener('visibilitychange', hide);
  };
}
