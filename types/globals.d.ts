/** 第三方全局：微信 JS-SDK 只在微信内置浏览器里由外部脚本注入，未配置时不存在。 */
declare const wx: any;

interface Window {
  /** 调试与真机验收入口，由 app.js 挂载 */
  __music?: any;
  /** browser-check.mjs 用来断言 audio 实例身份的探针 */
  __zxProbe?: any;
}

interface Navigator {
  /** iOS 私有接口，非标准，作为可关闭的实验性增强使用 */
  audioSession?: { type: string };
}

interface MediaSession {
  playbackState?: string;
}

interface CanvasRenderingContext2D {
  roundRect?(x: number, y: number, w: number, h: number, r?: number | number[]): void;
}