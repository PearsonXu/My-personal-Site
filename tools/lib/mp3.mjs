/**
 * tools/lib/mp3.mjs — 不依赖 ffmpeg 的 MP3 时长估算。
 * 逐帧解析 MPEG 头，累计采样数。对 CBR/VBR 都适用（VBR 也逐帧数）。
 */

import fs from 'node:fs';

// key = `${MPEG 版本组}-${Layer}`；1 = MPEG1，2 = MPEG2/2.5
const BITRATES = {
  '1-1': [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448],
  '1-2': [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384],
  '1-3': [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
  '2-1': [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256],
  '2-2': [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
  '2-3': [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160]
};
const SAMPLE_RATES = { 1: [44100, 48000, 32000], 2: [22050, 24000, 16000], 2.5: [11025, 12000, 8000] };

/** 跳过 ID3v2 头，返回音频数据起点 */
function skipId3(buf) {
  if (buf.length > 10 && buf.toString('ascii', 0, 3) === 'ID3') {
    const size = ((buf[6] & 0x7f) << 21) | ((buf[7] & 0x7f) << 14) | ((buf[8] & 0x7f) << 7) | (buf[9] & 0x7f);
    return 10 + size;
  }
  return 0;
}

/**
 * @param {string} file MP3 路径
 * @returns {{seconds:number, frames:number, sampleRate:number, bitrate:number, channels:number, cbr:boolean}}
 */
export function probeMp3(file) {
  const buf = fs.readFileSync(file);
  let pos = skipId3(buf);
  let frames = 0;
  let samples = 0;
  let sampleRate = 0;
  let channels = 0;
  const bitrates = new Set();

  while (pos + 4 <= buf.length) {
    if (buf[pos] !== 0xff || (buf[pos + 1] & 0xe0) !== 0xe0) { pos++; continue; }
    const b1 = buf[pos + 1];
    const b2 = buf[pos + 2];
    const versionBits = (b1 >> 3) & 0x03;
    const layerBits = (b1 >> 1) & 0x03;
    if (versionBits === 1 || layerBits === 0) { pos++; continue; }
    const version = versionBits === 3 ? 1 : versionBits === 2 ? 2 : 2.5;
    const layer = 4 - layerBits; // 3 = Layer III
    const key = `${version === 1 ? 1 : 2}-${layer}`;
    const table = BITRATES[key];
    const bitrateIndex = (b2 >> 4) & 0x0f;
    const rateIndex = (b2 >> 2) & 0x03;
    const padding = (b2 >> 1) & 0x01;
    if (!table || bitrateIndex === 0 || bitrateIndex === 15 || rateIndex === 3) { pos++; continue; }

    const bitrate = table[bitrateIndex] * 1000;
    const rate = SAMPLE_RATES[version][rateIndex];
    const samplesPerFrame = layer === 1 ? 384 : (layer === 3 && version !== 1 ? 576 : 1152);
    const frameLen = Math.floor((samplesPerFrame / 8) * bitrate / rate) + padding;
    if (frameLen <= 4) { pos++; continue; }

    frames++;
    samples += samplesPerFrame;
    sampleRate = rate;
    channels = ((buf[pos + 3] >> 6) & 0x03) === 3 ? 1 : 2;
    bitrates.add(bitrate);
    pos += frameLen;
  }

  if (!frames) throw new Error(`${file} 里没有找到有效的 MPEG 音频帧`);
  return {
    seconds: Number((samples / sampleRate).toFixed(3)),
    frames,
    sampleRate,
    bitrate: [...bitrates][0] / 1000,
    channels,
    cbr: bitrates.size === 1
  };
}