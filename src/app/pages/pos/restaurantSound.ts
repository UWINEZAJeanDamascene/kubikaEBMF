export function playRestaurantAlert() {
  const AudioContextConstructor = window.AudioContext;
  if (!AudioContextConstructor) return;
  const context = new AudioContextConstructor();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = "sine";
  gain.gain.setValueAtTime(0.0001, context.currentTime);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.onended = () => { void context.close(); };
  const startAt = context.currentTime;
  for (const [offset, frequency] of [[0, 880], [0.8, 660], [1.6, 880]] as const) {
    const beepAt = startAt + offset;
    oscillator.frequency.setValueAtTime(frequency, beepAt);
    gain.gain.setValueAtTime(0.0001, beepAt);
    gain.gain.exponentialRampToValueAtTime(0.12, beepAt + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, beepAt + 0.45);
  }
  oscillator.start(startAt);
  oscillator.stop(startAt + 2.1);
}
