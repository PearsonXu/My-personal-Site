import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { probeMp3 } from '../tools/lib/mp3.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const demo = (name) => path.join(ROOT, 'assets/audio/_demo', name);

test('mp3 · 逐帧解析出的时长与系统解码器一致', () => {
  if (!fs.existsSync(demo('demo-night-ferry.mp3'))) return; // 未生成 demo 音源时跳过
  const a = probeMp3(demo('demo-night-ferry.mp3'));
  // afinfo 实测 36.048938s / 44100Hz / 单声道 / 128kbps
  assert.ok(Math.abs(a.seconds - 36.049) < 0.1, `时长偏差过大：${a.seconds}`);
  assert.equal(a.sampleRate, 44100);
  assert.equal(a.channels, 1);
  assert.equal(a.bitrate, 128);
  assert.equal(a.cbr, true);

  const b = probeMp3(demo('demo-paper-boat.mp3'));
  assert.ok(Math.abs(b.seconds - 28.029) < 0.1, `时长偏差过大：${b.seconds}`);
});

test('mp3 · 非音频文件明确报错', () => {
  const tmp = path.join(ROOT, 'dist/.not-audio.mp3');
  fs.mkdirSync(path.dirname(tmp), { recursive: true });
  fs.writeFileSync(tmp, 'this is not mpeg data at all');
  assert.throws(() => probeMp3(tmp), /没有找到有效的 MPEG 音频帧/);
  fs.rmSync(tmp);
});