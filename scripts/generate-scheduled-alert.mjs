import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const sampleRate = 44_100;
const channels = 2;
const durationSeconds = 2.4;
const frameCount = Math.round(sampleRate * durationSeconds);
const pcm = Buffer.alloc(frameCount * channels * 2);

const pulses = [
  { start: 0, end: 0.62, frequency: 740 },
  { start: 0.66, end: 1.28, frequency: 880 },
  { start: 1.32, end: 2.36, frequency: 1_046 }
];

function smoothStep(value) {
  const normalized = Math.max(0, Math.min(1, value));
  return normalized * normalized * (3 - (2 * normalized));
}

function pulseEnvelope(time, pulse) {
  if (time < pulse.start || time >= pulse.end) return 0;
  const localTime = time - pulse.start;
  const remaining = pulse.end - time;
  const attack = smoothStep(localTime / 0.018);
  const release = smoothStep(remaining / 0.045);
  return Math.min(attack, release);
}

const samples = new Float64Array(frameCount * channels);
let peak = 0;

for (let frame = 0; frame < frameCount; frame += 1) {
  const time = frame / sampleRate;
  const pulse = pulses.find((item) => time >= item.start && time < item.end);
  if (!pulse) continue;

  const envelope = pulseEnvelope(time, pulse);
  const urgentModulation = 0.82 + (0.18 * Math.sin(2 * Math.PI * 9 * time));

  for (let channel = 0; channel < channels; channel += 1) {
    const stereoPhase = channel === 0 ? 0 : 0.035;
    const fundamental = Math.sin((2 * Math.PI * pulse.frequency * time) + stereoPhase);
    const brightBell = 0.58 * Math.sin((2 * Math.PI * pulse.frequency * 1.5 * time) + stereoPhase);
    const alarmBody = 0.32 * Math.sin((2 * Math.PI * pulse.frequency * 0.5 * time) - stereoPhase);
    const signal = Math.tanh(2.35 * (fundamental + brightBell + alarmBody));
    const sample = signal * envelope * urgentModulation;
    samples[(frame * channels) + channel] = sample;
    peak = Math.max(peak, Math.abs(sample));
  }
}

const targetPeak = 0.98;
const gain = peak > 0 ? targetPeak / peak : 1;
for (let index = 0; index < samples.length; index += 1) {
  const value = Math.max(-1, Math.min(1, samples[index] * gain));
  pcm.writeInt16LE(Math.round(value * 32_767), index * 2);
}

const header = Buffer.alloc(44);
header.write("RIFF", 0);
header.writeUInt32LE(36 + pcm.length, 4);
header.write("WAVE", 8);
header.write("fmt ", 12);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20);
header.writeUInt16LE(channels, 22);
header.writeUInt32LE(sampleRate, 24);
header.writeUInt32LE(sampleRate * channels * 2, 28);
header.writeUInt16LE(channels * 2, 32);
header.writeUInt16LE(16, 34);
header.write("data", 36);
header.writeUInt32LE(pcm.length, 40);

const outputPath = resolve("scheduled-work-order-alert-max.wav");
writeFileSync(outputPath, Buffer.concat([header, pcm]));
console.log(`Created ${outputPath}`);
