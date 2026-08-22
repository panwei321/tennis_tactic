/**
 * tactic-preview.js - 浏览器端 ASDL 战术动画播放器（参考实现）
 * 零依赖，暴露全局 TacticPreview 类；协议规范见 docs/asdl-spec.md
 *
 * 用法：
 *   const player = new TacticPreview(canvasEl, { onTimeUpdate, onStateChange, onError });
 *   player.loadScript(asdlJsonObjectOrString);
 *   player.play() / pause() / replay() / seekByProgress(0~1) / toggleSpeed()
 */
(function (global) {
  'use strict';

  // ==================== 缓动函数集 ====================
  const Easing = {
    linear: t => t,
    easeInQuad: t => t * t,
    easeOutQuad: t => t * (2 - t),
    easeInOutQuad: t => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
    easeInCubic: t => t * t * t,
    easeOutCubic: t => (--t) * t * t + 1,
    easeInOutCubic: t => t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1,
    easeOutBack: t => {
      const c1 = 1.70158;
      const c3 = c1 + 1;
      return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    }
  };

  // ==================== 工具函数 ====================
  function lerp(a, b, t) { return a + (b - a) * t; }

  function lerpPoint(p1, p2, t) {
    return [lerp(p1[0], p2[0], t), lerp(p1[1], p2[1], t)];
  }

  /** Catmull-Rom 样条插值：曲线经过所有 waypoints */
  function catmullRomPoint(waypoints, t) {
    if (!waypoints || waypoints.length < 2) return waypoints ? waypoints[0] : [0, 0];
    if (waypoints.length === 2) return lerpPoint(waypoints[0], waypoints[1], t);

    const n = waypoints.length - 1;
    const seg = t * n;
    const i = Math.min(Math.floor(seg), n - 1);
    const localT = seg - i;

    const p0 = waypoints[Math.max(0, i - 1)];
    const p1 = waypoints[i];
    const p2 = waypoints[Math.min(n, i + 1)];
    const p3 = waypoints[Math.min(n, i + 2)];

    const t2 = localT * localT;
    const t3 = t2 * localT;

    return [
      0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * localT + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
      0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * localT + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)
    ];
  }

  // ==================== 脚本校验 ====================
  function validateScript(script) {
    const errors = [];
    if (!script || typeof script !== 'object') return { valid: false, errors: ['脚本格式错误：非 JSON 对象'] };
    if (!script.meta || !script.meta.duration) errors.push('缺少 meta.duration');
    if (!script.court) errors.push('缺少 court 定义');
    if (!script.elements || !Array.isArray(script.elements) || script.elements.length === 0) errors.push('缺少 elements 元素定义');
    if (!script.timeline || !Array.isArray(script.timeline)) errors.push('缺少 timeline 时间轴');
    if (script.timeline) {
      script.timeline.forEach((entry, i) => {
        if (entry.t === undefined || entry.t === null) errors.push(`timeline[${i}]: 缺少 t`);
        if (!entry.actions || !Array.isArray(entry.actions)) errors.push(`timeline[${i}]: 缺少 actions`);
      });
    }
    return { valid: errors.length === 0, errors };
  }

  // ==================== 时间轴索引 ====================
  function buildTimelineIndex(timeline) {
    const timeNodes = [];
    const actionMap = new Map();
    timeline.forEach(entry => {
      if (!actionMap.has(entry.t)) { actionMap.set(entry.t, []); timeNodes.push(entry.t); }
      entry.actions.forEach(a => actionMap.get(entry.t).push(a));
    });
    const sortedTimes = [...new Set(timeNodes)].sort((a, b) => a - b);
    const actionsWithEndTime = [];
    timeline.forEach(entry => {
      entry.actions.forEach(action => {
        actionsWithEndTime.push({ startTime: entry.t, endTime: entry.t + (action.dur || 0), action });
      });
    });
    return { sortedTimes, actionsWithEndTime };
  }

  // ==================== 绘图工具 ====================
  /**
   * 绘制标准网球场（竖向俯视，无半场标签）。
   * 所有点通过 proj(ax, ay) 投影：ASDL x(边线方向) → 屏幕水平，
   * ASDL y(底线方向) → 屏幕竖直。球网 → 横线。
   * 己方在下方（Y 较大），对方在上方（Y 较小）。
   * @param {Function} proj - (ax, ay) => {x, y} 坐标投影
   * @param {Number} scale - 缩放系数（用于文字/尺寸）
   */
  function drawCourt(ctx, courtRect, colors, proj, scale) {
    const { x, y, w, h } = courtRect;
    const netY = y + h / 2;
    const centerX = x + w / 2;
    const singlesLeft = x + w * 0.125;
    const singlesRight = x + w * 0.875;
    const serviceOffset = (h / 2) * 0.538;
    const serviceTop = netY - serviceOffset;
    const serviceBottom = netY + serviceOffset;

    const moveLine = (ax1, ay1, ax2, ay2) => {
      const a = proj(ax1, ay1), b = proj(ax2, ay2);
      ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
    };

    // 场地四角
    const c1 = proj(x, y), c2 = proj(x + w, y), c3 = proj(x + w, y + h), c4 = proj(x, y + h);

    // 场地底色
    ctx.fillStyle = colors.surface;
    ctx.beginPath();
    ctx.moveTo(c1.x, c1.y); ctx.lineTo(c2.x, c2.y); ctx.lineTo(c3.x, c3.y); ctx.lineTo(c4.x, c4.y);
    ctx.closePath(); ctx.fill();

    // 双打边线（外边界）
    ctx.strokeStyle = colors.line; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(c1.x, c1.y); ctx.lineTo(c2.x, c2.y); ctx.lineTo(c3.x, c3.y); ctx.lineTo(c4.x, c4.y);
    ctx.closePath(); ctx.stroke();

    // 单打边线（竖线）
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    moveLine(singlesLeft, y, singlesLeft, y + h);
    moveLine(singlesRight, y, singlesRight, y + h);
    ctx.stroke();

    // 发球线（横线，仅在单打边线之间）
    ctx.beginPath();
    moveLine(singlesLeft, serviceTop, singlesRight, serviceTop);
    moveLine(singlesLeft, serviceBottom, singlesRight, serviceBottom);
    ctx.stroke();

    // 发球中线（竖线，连接两条发球线）
    ctx.beginPath();
    moveLine(centerX, serviceTop, centerX, serviceBottom);
    ctx.stroke();

    // 球网（横向、灰色加粗）
    ctx.lineWidth = 4; ctx.strokeStyle = '#888';
    ctx.beginPath();
    moveLine(x - 10, netY, x + w + 10, netY);
    ctx.stroke();

    // 网柱
    ctx.fillStyle = '#555';
    const postA = proj(x - 10, netY), postB = proj(x + w + 10, netY);
    ctx.fillRect(postA.x - 3, postA.y - 5, 6, 10);
    ctx.fillRect(postB.x - 3, postB.y - 5, 6, 10);
  }

  function drawPlayer(ctx, element, screenPos, scale) {
    const radius = Math.max(8, (element.radius || 18) * scale);
    ctx.beginPath();
    ctx.arc(screenPos.x, screenPos.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = element.color || '#1565C0';
    ctx.fill();
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2;
    ctx.stroke();
    if (element.label) {
      ctx.fillStyle = '#FFFFFF';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(element.label, screenPos.x, screenPos.y + radius + 4);
    }
  }

  function drawTrajectory(ctx, waypoints, progress, proj) {
    if (!waypoints || waypoints.length < 2) return;
    ctx.strokeStyle = 'rgba(204, 255, 0, 0.6)';
    ctx.lineWidth = 2;
    // 用 Catmull-Rom 曲线采样绘制，与球的运动路径完全一致，避免折射和后半段缺失
    var samples = 40;
    var drawSamples = Math.max(1, Math.floor(samples * progress));
    ctx.beginPath();
    for (var i = 0; i <= drawSamples; i++) {
      var t = i / samples;
      var pt = catmullRomPoint(waypoints, t);
      var p = proj(pt[0], pt[1]);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
  }

  // ==================== TacticPreview 类 ====================
  class TacticPreview {
    /**
     * @param {HTMLCanvasElement} canvas - 目标 canvas 元素
     * @param {Object} callbacks - 回调 { onError, onStateChange, onTimeUpdate }
     */
    constructor(canvas, callbacks) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.callbacks = callbacks || {};

      // 离屏 Canvas（静态球场缓存）
      this.offscreen = document.createElement('canvas');
      this.offscreenCtx = this.offscreen.getContext('2d');

      this.scriptData = null;
      this.timeIndex = null;
      this.elements = {};
      this.courtRect = null;
      this.animFrameId = null;
      this.playbackRate = 1;
      this.state = 'idle'; // idle | playing | paused | completed

      this._startTimestamp = 0;
      this._pausedTime = 0;
      this._lastFrameTime = 0;
      this._frameDropCount = 0;
      this._dpr = window.devicePixelRatio || 1;
      this._displayWidth = 0;
      this._displayHeight = 0;
    }

    /** 加载 ASDL 脚本 JSON 字符串 */
    loadScript(jsonStr) {
      try {
        const script = typeof jsonStr === 'string' ? JSON.parse(jsonStr) : jsonStr;
        const validation = validateScript(script);
        if (!validation.valid) {
          this._notifyError(validation.errors.join('; '));
          return false;
        }

        this.scriptData = script;
        this.timeIndex = buildTimelineIndex(script.timeline);

        // 初始化元素
        this.elements = {};
        if (script.elements) {
          script.elements.forEach(el => {
            this.elements[el.id] = { ...el, pos: el.initPos ? [el.initPos[0], el.initPos[1]] : [0, 0], visible: true };
          });
        }

        // 球场矩形
        this.courtRect = script.court && script.court.courtRect
          ? { ...script.court.courtRect }
          : { x: 80, y: 40, w: 560, h: 1200 };

        this._pausedTime = 0;
        this.state = 'paused';
        this._setupCanvas();
        this._renderStaticLayer();
        this._renderFrame(0);

        if (this.callbacks.onTimeUpdate) {
          this.callbacks.onTimeUpdate(0, script.meta.duration || 0);
        }
        if (this.callbacks.onStateChange) {
          this.callbacks.onStateChange('paused');
        }

        return true;
      } catch (e) {
        this._notifyError('脚本解析失败: ' + e.message);
        return false;
      }
    }

    _setupCanvas() {
      const rect = this.canvas.getBoundingClientRect();
      this._displayWidth = rect.width || this.canvas.width;
      this._displayHeight = rect.height || this.canvas.height;
      // Canvas 内部分辨率
      this.canvas.width = this._displayWidth * this._dpr;
      this.canvas.height = this._displayHeight * this._dpr;
      this.ctx.setTransform(this._dpr, 0, 0, this._dpr, 0, 0);

      this.offscreen.width = this.canvas.width;
      this.offscreen.height = this.canvas.height;
      this.offscreenCtx.setTransform(this._dpr, 0, 0, this._dpr, 0, 0);
    }

    /** 计算投影参数（竖向俯视，直接映射） */
    _computeProjection() {
      const script = this.scriptData;
      const cw = script.court.width;   // ASDL x 范围（边线方向）
      const ch = script.court.height;  // ASDL y 范围（底线方向）
      const w = this._displayWidth;
      const h = this._displayHeight;
      // 直接映射：水平=cw, 垂直=ch
      const scale = Math.min(w / cw, h / ch);
      this._proj = {
        scale,
        offsetX: (w - cw * scale) / 2,
        offsetY: (h - ch * scale) / 2
      };
    }

    /** ASDL 坐标 → 屏幕坐标（直接映射：x→水平，y→竖直） */
    _project(ax, ay) {
      const p = this._proj;
      return {
        x: p.offsetX + ax * p.scale,
        y: p.offsetY + ay * p.scale
      };
    }

    /** 静态层：现改为每帧直接绘制球场（成本极低），此处保留空实现以兼容调用 */
    _renderStaticLayer() {
      /* no-op: 球场已在 _renderFrame 中直接绘制 */
    }

    /** 渲染一帧 */
    _renderFrame(currentTime) {
      if (!this.scriptData) return;

      const ctx = this.ctx;
      const script = this.scriptData;
      const w = this._displayWidth;
      const h = this._displayHeight;

      ctx.clearRect(0, 0, w, h);

      // 计算投影
      this._computeProjection();
      const proj = (ax, ay) => this._project(ax, ay);
      const scale = this._proj.scale;

      // 1. 绘制球场（坐标投影，文字正立）
      drawCourt(ctx, this.courtRect, {
        surface: script.court.surfaceColor || '#1F5D3B',
        line: script.court.lineColor || '#FFFFFF'
      }, proj, scale);

      // 2. 计算活跃动作
      const activeActions = this._getActiveActions(currentTime);

      // 3. 补充新元素
      if (script.elements) {
        script.elements.forEach(el => {
          if (!this.elements[el.id]) {
            this.elements[el.id] = { ...el, pos: el.initPos ? [el.initPos[0], el.initPos[1]] : [0, 0], visible: true };
          }
        });
      }

      // 4. 应用动作
      activeActions.forEach(({ action, progress }) => this._processAction(action, progress));

      // 5. 绘制轨迹
      activeActions.forEach(({ action, progress }) => {
        if (action.type === 'trajectory' && action.waypoints) {
          drawTrajectory(ctx, action.waypoints, progress, proj);
        }
      });

      // 6. 绘制元素
      script.elements.forEach(el => {
        const state = this.elements[el.id];
        if (!state || !state.visible) return;
        const sp = proj(state.pos[0], state.pos[1]);
        if (el.type === 'player') {
          drawPlayer(ctx, el, sp, scale);
        } else if (el.type === 'ball') {
          ctx.beginPath();
          ctx.arc(sp.x, sp.y, Math.max(4, (el.radius || 6) * scale + 1), 0, Math.PI * 2);
          ctx.fillStyle = el.color || '#CCFF00';
          ctx.fill();
        }
      });

      // 7. 文字标注（正立）
      activeActions.forEach(({ action, elapsed }) => {
        if (action.type === 'text' && elapsed <= action.dur) {
          const style = action.style || {};
          const sp = proj(action.pos[0], action.pos[1]);
          const fontSize = Math.max(12, (style.fontSize || 16) * scale);
          ctx.font = fontSize + 'px sans-serif';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          const tw = ctx.measureText(action.content).width;
          ctx.fillStyle = style.bg || 'rgba(0,0,0,0.6)';
          ctx.fillRect(sp.x - 8, sp.y - fontSize / 2 - 4, tw + 16, fontSize + 8);
          ctx.fillStyle = style.color || '#FFFFFF';
          ctx.fillText(action.content, sp.x, sp.y);
        }
      });
    }

    _getActiveActions(currentTime) {
      if (!this.timeIndex) return [];
      const { actionsWithEndTime } = this.timeIndex;
      const active = [];
      for (const item of actionsWithEndTime) {
        if (currentTime >= item.startTime && currentTime <= item.endTime) {
          const elapsed = currentTime - item.startTime;
          const progress = item.action.dur > 0 ? Math.min(1, elapsed / item.action.dur) : 1;
          active.push({ action: item.action, progress, elapsed });
        }
      }
      return active;
    }

    _processAction(action, progress) {
      const target = action.target;
      if (!target || !this.elements[target]) return;
      const easingFn = Easing[action.easing] || Easing.linear;
      const t = easingFn(progress);

      if (action.type === 'move' && action.from && action.to) {
        this.elements[target].pos = lerpPoint(action.from, action.to, t);
      } else if (action.type === 'trajectory' && action.waypoints && action.waypoints.length >= 2) {
        this.elements[target].pos = catmullRomPoint(action.waypoints, t);
      }
    }

    // ========== 动画循环 ==========
    _startAnimation() {
      if (this.animFrameId) return;
      this._startTimestamp = performance.now() - this._pausedTime * this.playbackRate;
      this._lastFrameTime = performance.now();
      this._frameDropCount = 0;

      const loop = () => {
        if (this.state !== 'playing') return;
        const now = performance.now();
        const frameInterval = now - this._lastFrameTime;
        this._lastFrameTime = now;
        if (frameInterval > 33) this._frameDropCount++;
        else this._frameDropCount = 0;

        const dt = now - this._startTimestamp;
        const duration = this.scriptData.meta.duration || 0;
        const currentTime = Math.min(dt * this.playbackRate, duration);
        const progress = duration > 0 ? currentTime / duration : 0;

        if (this.callbacks.onTimeUpdate) this.callbacks.onTimeUpdate(currentTime, duration);

        if (this._frameDropCount < 5 || this._frameDropCount % 2 === 0) {
          this._renderFrame(currentTime);
        }

        if (currentTime >= duration) {
          this.state = 'completed';
          this.pause();
          if (this.callbacks.onStateChange) this.callbacks.onStateChange('completed');
          return;
        }
        this.animFrameId = requestAnimationFrame(loop);
      };

      this.animFrameId = requestAnimationFrame(loop);
    }

    _stopAnimation() {
      if (this.animFrameId) { cancelAnimationFrame(this.animFrameId); this.animFrameId = null; }
    }

    // ========== 播放控制 ==========
    play() {
      if (this.state === 'completed') this.seekTo(0);
      this.state = 'playing';
      this._startTimestamp = performance.now() - (this._pausedTime || 0) * this.playbackRate;
      this._lastFrameTime = performance.now();
      this._startAnimation();
      if (this.callbacks.onStateChange) this.callbacks.onStateChange('playing');
    }

    pause() {
      this._pausedTime = this._pausedTime || 0;
      this._stopAnimation();
      if (this.state === 'playing') {
        this.state = 'paused';
        if (this.callbacks.onStateChange) this.callbacks.onStateChange('paused');
      }
    }

    togglePlay() {
      if (this.state === 'playing') this.pause();
      else this.play();
    }

    replay() {
      this._stopAnimation();
      this._pausedTime = 0;
      this.state = 'playing';
      this._startTimestamp = performance.now();
      this._lastFrameTime = performance.now();
      this._renderFrame(0);
      this._startAnimation();
      if (this.callbacks.onTimeUpdate) this.callbacks.onTimeUpdate(0, this.scriptData.meta.duration || 0);
      if (this.callbacks.onStateChange) this.callbacks.onStateChange('playing');
    }

    seekTo(time) {
      this._pausedTime = time;
      this._renderFrame(time);
      const duration = this.scriptData ? this.scriptData.meta.duration || 0 : 0;
      if (this.callbacks.onTimeUpdate) this.callbacks.onTimeUpdate(time, duration);
    }

    /** 进度拖拽 */
    seekByProgress(progress) {
      if (!this.scriptData) return;
      const duration = this.scriptData.meta.duration || 0;
      const time = progress * duration;
      this._pausedTime = time;
      this._renderFrame(time);
      if (this.callbacks.onTimeUpdate) this.callbacks.onTimeUpdate(time, duration);
      if (this.state === 'playing') {
        this._stopAnimation();
        this._startAnimation();
      }
    }

    toggleSpeed() {
      const rates = [0.5, 1, 2];
      const idx = rates.indexOf(this.playbackRate);
      this.playbackRate = rates[(idx + 1) % rates.length];
      if (this.callbacks.onStateChange) this.callbacks.onStateChange('speed_' + this.playbackRate);
      if (this.state === 'playing') {
        this._pausedTime = this._pausedTime || 0;
        this._stopAnimation();
        this._startAnimation();
      }
    }

    destroy() {
      this._stopAnimation();
      this.scriptData = null;
      this.timeIndex = null;
    }

    _notifyError(msg) {
      console.error('[TacticPreview]', msg);
      if (this.callbacks.onError) this.callbacks.onError(msg);
    }
  }

  // 暴露到全局
  global.TacticPreview = TacticPreview;
})(window);
