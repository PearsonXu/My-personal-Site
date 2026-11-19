#!/usr/bin/env node
/**
 * tools/make-demo-audio.mjs — 生成两条「工程验证用」合成 MP3。
 *
 * ⚠️ 这些音源不是站长的作品，只是正弦叠加的合成音，用来在没有真实歌曲时
 *    验证播放 / 后台 / 歌词 / 分享链路。内容文件里 demo:true，页面有 DEMO 标记，
 *    生产构建（不带 --demo）会自动排除。
 *
 * 用法：node tools/make-demo-audio.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

/**
 * lamejs 1.2.1 的 ESM 入口有已知 bug（MPEGMode is not defined）。
 * 官方合并包 lame.all.js 在同一作用域内定义了全部符号，可正常工作；
 * 它不是标准模块导出，这里显式取出内部构造函数。仅构建期使用，不进前端。
 */
function loadLame() {
  const file = require.resolve('lamejs/lame.all.js');
  const source = fs.readFileSync(file, 'utf8');
  // eslint-disable-next-line no-new-func
  const factory = new Function(`${source}\n;return lamejs;`);
  const lib = factory();
  if (!lib || typeof lib.Mp3Encoder !== 'function') {
    throw new Error('lamejs 加载失败：找不到 Mp3Encoder');
  }
  return lib;
}

const lamejs = loadLame();

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'assets/audio/_demo');
const SAMPLE_RATE = 44100;

function synth(seconds, spec) {
  const total = Math.floor(seconds * SAMPLE_RATE);
  const pcm = new Int16Array(total);
  for (let i = 0; i < total; i++) {
    const t = i / SAMPLE_RATE;
    let v = 0;
    for (const partial of spec.partials) {
      const env = Math.min(1, t / spec.attack) * Math.min(1, (seconds - t) / spec.release);
      const lfo = 1 + partial.detune * Math.sin(2 * Math.PI * partial.lfo * t);
      v += Math.sin(2 * Math.PI * partial.freq * lfo * t) * partial.gain * env;
    }
    // 缓慢的呼吸感包络
    v *= 0.55 + 0.45 * Math.sin(2 * Math.PI * spec.breath * t - Math.PI / 2) ** 2;
    // 软限幅，避免削顶爆音
    v = Math.tanh(v * 1.2) * 0.72;
    pcm[i] = Math.max(-32767, Math.min(32767, Math.round(v * 32767)));
  }
  return pcm;
}

function encodeMp3(pcm) {
  const encoder = new lamejs.Mp3Encoder(1, SAMPLE_RATE, 128);
  const block = 1152;
  const chunks = [];
  for (let i = 0; i < pcm.length; i += block) {
    const slice = pcm.subarray(i, Math.min(i + block, pcm.length));
    const buf = encoder.encodeBuffer(slice);
    if (buf.length) chunks.push(Buffer.from(buf));
  }
  const tail = encoder.flush();
  if (tail.length) chunks.push(Buffer.from(tail));
  return Buffer.concat(chunks);
}

const TRACKS = [
  {
    file: 'demo-night-ferry.mp3',
    seconds: 36,
    spec: {
      attack: 2.5, release: 3.5, breath: 0.06,
      partials: [
        { freq: 110.0, gain: 0.30, detune: 0.0015, lfo: 0.13 },
        { freq: 164.81, gain: 0.22, detune: 0.0020, lfo: 0.09 },
        { freq: 220.0, gain: 0.16, detune: 0.0012, lfo: 0.17 },
        { freq: 329.63, gain: 0.10, detune: 0.0025, lfo: 0.21 }
      ]
    }
  },
  {
    file: 'demo-paper-boat.mp3',
    seconds: 28,
    spec: {
      attack: 1.8, release: 2.8, breath: 0.09,
      partials: [
        { freq: 146.83, gain: 0.28, detune: 0.0018, lfo: 0.15 },
        { freq: 220.0, gain: 0.20, detune: 0.0022, lfo: 0.11 },
        { freq: 293.66, gain: 0.14, detune: 0.0014, lfo: 0.19 },
        { freq: 440.0, gain: 0.08, detune: 0.0030, lfo: 0.24 }
      ]
    }
  }
];

fs.mkdirSync(OUT_DIR, { recursive: true });
const manifest = [];
for (const track of TRACKS) {
  const pcm = synth(track.seconds, track.spec);
  const mp3 = encodeMp3(pcm);
  const dest = path.join(OUT_DIR, track.file);
  fs.writeFileSync(dest, mp3);
  manifest.push({
    file: `audio/_demo/${track.file}`,
    seconds: track.seconds,
    bytes: mp3.length,
    mime: 'audio/mpeg',
    sampleRate: SAMPLE_RATE,
    bitrate: 128,
    channels: 1,
    notice: '合成测试音源，非站长作品'
  });
  console.log(`✓ ${track.file}  ${track.seconds}s  ${(mp3.length / 1024).toFixed(1)} KB`);
}
fs.writeFileSync(path.join(OUT_DIR, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`\n写入 ${OUT_DIR}`);
console.log('提醒：这些是合成测试音，不是真实作品。生产构建请用 npm run build（不带 --demo）。');