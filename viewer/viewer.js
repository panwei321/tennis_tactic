// viewer.js - 战术库预览器页面逻辑
// 读取 tactics.json（由 tools/build-index.js 生成），渲染列表并提供播放
(function () {
  'use strict';

  const state = {
    tactics: [],       // 全部战术（wrapped 格式）
    filtered: [],      // 过滤后
    current: null,     // 当前选中的战术
    player: null,      // TacticPreview 实例
    seeking: false     // 进度条拖动中，暂停时间回写
  };

  const els = {
    list: document.getElementById('tacticList'),
    search: document.getElementById('searchBox'),
    loadError: document.getElementById('loadError'),
    playerPanel: document.getElementById('playerPanel'),
    canvas: document.getElementById('courtCanvas'),
    btnPlay: document.getElementById('btnPlay'),
    btnReplay: document.getElementById('btnReplay'),
    btnSpeed: document.getElementById('btnSpeed'),
    timeLabel: document.getElementById('timeLabel'),
    progressBar: document.getElementById('progressBar'),
    tacticName: document.getElementById('tacticName'),
    tacticCategory: document.getElementById('tacticCategory')
  };

  // ============ 初始化 ============
  async function init() {
    if (location.protocol === 'file:') {
      showError(
        '直接双击打开无法加载数据（浏览器限制）。\n' +
        '请在仓库根目录运行：  python3 -m http.server 8080\n' +
        '然后访问  http://localhost:8080/viewer/'
      );
      return;
    }
    try {
      const res = await fetch('tactics.json');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      state.tactics = await res.json();
    } catch (e) {
      showError('加载 tactics.json 失败：' + e.message + '\n请先运行 node tools/build-index.js 生成索引。');
      return;
    }
    if (!Array.isArray(state.tactics) || state.tactics.length === 0) {
      showError('tactics.json 为空。请先运行 node tools/build-index.js 生成索引，或按 docs/asdl-spec.md 添加脚本。');
      return;
    }

    state.player = new TacticPreview(els.canvas, {
      onTimeUpdate: (cur, dur) => {
        if (!state.seeking && dur > 0) els.progressBar.value = Math.round(cur / dur * 1000);
        els.timeLabel.textContent = (cur / 1000).toFixed(1) + 's / ' + (dur / 1000).toFixed(1) + 's';
      },
      onStateChange: (s) => {
        if (s === 'playing') els.btnPlay.textContent = '⏸';
        else if (s.startsWith('speed_')) els.btnSpeed.textContent = parseFloat(s.slice(6)) + 'x';
        else els.btnPlay.textContent = '▶';
      },
      onError: (msg) => showError('脚本播放失败：' + msg)
    });

    renderList('');
    selectTactic(state.filtered[0]);

    els.search.addEventListener('input', () => renderList(els.search.value.trim()));
    els.btnPlay.addEventListener('click', () => state.player && state.player.togglePlay());
    els.btnReplay.addEventListener('click', () => state.player && state.player.replay());
    els.btnSpeed.addEventListener('click', () => state.player && state.player.toggleSpeed());

    els.progressBar.addEventListener('input', () => {
      state.seeking = true;
      if (state.player) state.player.seekByProgress(els.progressBar.value / 1000);
    });
    els.progressBar.addEventListener('change', () => { state.seeking = false; });
  }

  // ============ 列表渲染 ============
  function renderList(keyword) {
    const kw = keyword.toLowerCase();
    state.filtered = state.tactics.filter(t =>
      !kw || (t.name || '').toLowerCase().includes(kw) || (t.category || '').toLowerCase().includes(kw)
    );

    const groups = new Map(); // category -> tactics（保持导入顺序）
    state.filtered.forEach(t => {
      const key = t.category || '未分类';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(t);
    });

    els.list.innerHTML = '';
    if (state.filtered.length === 0) {
      els.list.innerHTML = '<p class="list-group-title">没有匹配的战术</p>';
      return;
    }
    groups.forEach((items, category) => {
      const title = document.createElement('p');
      title.className = 'list-group-title';
      title.textContent = category;
      els.list.appendChild(title);
      items.forEach(t => {
        const btn = document.createElement('button');
        btn.className = 'list-item';
        btn.textContent = t.name || t.id;
        if (state.current && state.current.id === t.id) btn.classList.add('active');
        btn.addEventListener('click', () => selectTactic(t));
        els.list.appendChild(btn);
      });
    });
  }

  // ============ 选中并播放 ============
  function selectTactic(tactic) {
    if (!tactic) return;
    state.current = tactic;
    els.playerPanel.hidden = false;
    els.loadError.hidden = true;

    els.tacticName.textContent = tactic.name || tactic.id;
    els.tacticCategory.textContent = tactic.category || '';

    fillInfo('blockIntroduction', tactic.introduction);
    fillInfo('blockPurpose', tactic.purpose);
    fillInfo('blockScenarios', tactic.scenarios);
    fillInfo('blockTips', tactic.tips);

    const ok = state.player.loadScript(tactic.script);
    if (ok) state.player.play();

    // 刷新列表高亮
    els.list.querySelectorAll('.list-item').forEach(btn => {
      btn.classList.toggle('active', btn.textContent === (tactic.name || tactic.id));
    });
  }

  function fillInfo(blockId, value) {
    const block = document.getElementById(blockId);
    const text = (value == null) ? '' : String(value).trim();
    block.classList.toggle('empty', !text);
    block.querySelector('p').textContent = text;
  }

  function showError(msg) {
    els.loadError.textContent = msg;
    els.loadError.hidden = false;
    els.playerPanel.hidden = true;
  }

  init();
})();
