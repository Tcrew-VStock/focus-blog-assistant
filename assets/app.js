/* =========================================================================
   FOCUS AI PROMPT STUDIO — 앱 UI
   ========================================================================= */
(function () {
  'use strict';
  var ENG = window.FocusEngine;
  var STORE = 'focus_prompt_studio_v4';

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function toast(msg) {
    var t = $('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.classList.remove('show'); }, 2600);
  }
  window.__focusToast = toast;

  function loadState() {
    var base = {
      version: 4, apiKey: '', marketApi: '', marketSymbol: '',
      prompts: [],
      defaults: { tone: 'professional', format: 'auto', depth: 'standard', lang: 'ko', framework: 'auto', target: 'universal' }
    };
    try {
      var raw = JSON.parse(localStorage.getItem(STORE) || 'null');
      if (raw && typeof raw === 'object') {
        Object.keys(base).forEach(function (k) { if (raw[k] === undefined) raw[k] = base[k]; });
        if (!Array.isArray(raw.prompts)) raw.prompts = [];
        return raw;
      }
    } catch (e) { /* ignore */ }
    return base;
  }
  var state = loadState();
  function saveState() {
    try { localStorage.setItem(STORE, JSON.stringify(state)); } catch (e) { /* full */ }
    renderLibrary();
  }
  window.__focusSaveState = saveState;

  var current = {
    domainId: 'coding',
    taskId: 'build',
    values: {},
    valuesByDomain: {},
    varValues: {},
    lastBuild: null,
    diag: null
  };

  /* ---------------- 네비게이션 ---------------- */
  var PAGE_TITLES = { builder: '프롬프트 빌더', diagnose: '프롬프트 진단', presets: '프리셋', library: '라이브러리', market: '주식 · 시세', settings: '설정' };

  function nav(page) {
    Array.prototype.forEach.call(document.querySelectorAll('.page'), function (p) {
      p.classList.toggle('active', p.id === 'page-' + page);
    });
    Array.prototype.forEach.call(document.querySelectorAll('.nav button[data-page]'), function (b) {
      b.classList.toggle('active', b.dataset.page === page);
    });
    var sb = $('sidebar');
    if (sb) sb.classList.remove('open');
    if (page === 'library') renderLibrary();
    if (page === 'presets') renderPresets();
    if (page === 'market') { renderMarketPage(); }
    window.scrollTo(0, 0);
  }

  /* ---------------- 빌더 ---------------- */
  function domain() { return ENG.domainById(current.domainId); }
  function taskOf(d) {
    var t = d.tasks.filter(function (x) { return x.id === current.taskId; })[0];
    return t || d.tasks[0];
  }

  function renderDomainGrid() {
    var wrap = $('domainGrid');
    if (!wrap) return;
    wrap.innerHTML = '';
    ENG.DOMAINS.forEach(function (d) {
      var b = document.createElement('button');
      b.className = 'domain-card' + (d.id === current.domainId ? ' active' : '');
      b.setAttribute('data-domain', d.id);
      b.type = 'button';
      b.innerHTML = '<span class="dc-icon">' + d.icon + '</span><span class="dc-name">' + esc(d.name) + '</span><span class="dc-desc">' + esc(d.desc) + '</span>';
      b.onclick = function () { selectDomain(d.id); };
      wrap.appendChild(b);
    });
  }

  function selectDomain(id, carryTopic) {
    if (current.valuesByDomain[current.domainId]) current.valuesByDomain[current.domainId] = current.values;
    current.domainId = id;
    var d = domain();
    current.taskId = d.tasks[0].id;
    current.values = current.valuesByDomain[id] || {};
    if (carryTopic && !String(current.values[d.primary] || '').trim()) {
      current.values[d.primary] = carryTopic;
      current.valuesByDomain[id] = current.values;
    }
    current.varValues = {};
    renderDomainGrid();
    renderTasks();
    renderFields();
    build();
    var fs = $('domainFields');
    if (fs && window.innerWidth < 760) fs.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderTasks() {
    var wrap = $('taskChips');
    if (!wrap) return;
    var d = domain();
    wrap.innerHTML = '';
    d.tasks.forEach(function (t) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip' + (t.id === current.taskId ? ' active' : '');
      b.textContent = t.label;
      b.onclick = function () {
        current.taskId = t.id;
        current.varValues = {};
        renderTasks();
        build();
      };
      wrap.appendChild(b);
    });
  }

  function renderFields() {
    var wrap = $('domainFields');
    if (!wrap) return;
    var d = domain();
    wrap.innerHTML = '';
    d.fields.forEach(function (f) {
      var box = document.createElement('div');
      box.className = 'field' + (f.type === 'textarea' ? ' full' : '');
      var lab = document.createElement('label');
      lab.setAttribute('for', 'f_' + f.id);
      lab.innerHTML = esc(f.label) + (f.req ? ' <em>*</em>' : '');
      box.appendChild(lab);

      var el;
      if (f.type === 'select') {
        el = document.createElement('select');
        el.className = 'control';
        (f.options || []).forEach(function (o) {
          var op = document.createElement('option');
          op.value = o; op.textContent = o;
          el.appendChild(op);
        });
      } else if (f.type === 'textarea') {
        el = document.createElement('textarea');
        el.className = 'control';
        el.rows = 3;
      } else {
        el = document.createElement('input');
        el.className = 'control';
        el.type = 'text';
      }
      el.id = 'f_' + f.id;
      if (f.ph) el.placeholder = f.ph;
      el.value = current.values[f.id] || '';
      var handler = function () {
        current.values[f.id] = el.value;
        scheduleBuild();
      };
      el.addEventListener('input', handler);
      el.addEventListener('change', handler);
      box.appendChild(el);
      wrap.appendChild(box);
    });
    renderMarketCompact();
  }

  function renderMarketCompact() {
    var box = $('marketCompact');
    if (!box) return;
    box.style.display = domain().needsMarket ? '' : 'none';
  }

  function selectedForbids() {
    return Array.prototype.filter.call(document.querySelectorAll('[data-forbid].active'), function (b) { return true; }).map(function (b) { return b.dataset.forbid; });
  }

  function cfg() {
    var d = domain();
    var values = current.values;
    return {
      domainId: current.domainId,
      taskId: current.taskId,
      values: values,
      framework: ($('frameworkSel') || {}).value || 'auto',
      target: ($('targetSel') || {}).value || 'universal',
      tone: ($('toneSel') || {}).value || 'professional',
      format: ($('formatSel') || {}).value || 'auto',
      depth: ($('depthSel') || {}).value || 'standard',
      lang: ($('langSel') || {}).value || 'ko',
      length: (($('lengthInput') || {}).value || '').trim(),
      audience: (($('audienceInput') || {}).value || '').trim(),
      forbid: selectedForbids(),
      customForbid: (($('customForbid') || {}).value || '').trim(),
      marketBlock: (d.needsMarket && window.FocusMarket && window.FocusMarket.hasData()) ? window.FocusMarket.contextBlock() : ''
    };
  }

  var buildTimer = null;
  function scheduleBuild() {
    clearTimeout(buildTimer);
    buildTimer = setTimeout(build, 180);
  }

  function saveQuiet() {
    state.defaults = {
      framework: ($('frameworkSel') || {}).value || 'auto',
      target: ($('targetSel') || {}).value || 'universal',
      tone: ($('toneSel') || {}).value || 'professional',
      format: ($('formatSel') || {}).value || 'auto',
      depth: ($('depthSel') || {}).value || 'standard',
      lang: ($('langSel') || {}).value || 'ko'
    };
    try { localStorage.setItem(STORE, JSON.stringify(state)); } catch (e) { /* ignore */ }
  }

  function cfgSnapshot() {
    var c = cfg();
    delete c.marketBlock;
    return c;
  }

  function renderSuggest() {
    var box = $('domainSuggest');
    if (!box) return;
    var d = domain();
    var primary = String(current.values[d.primary] || '').trim();
    if (primary.length < 6) { box.style.display = 'none'; return; }
    var sug = ENG.autoDomain(primary);
    if (sug === 'meta' || sug === d.id) { box.style.display = 'none'; return; }
    var sd = ENG.domainById(sug);
    box.style.display = '';
    box.innerHTML = '';
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'suggest-btn';
    btn.innerHTML = '<span>💡 이 내용은 <b>' + esc(sd.name) + '</b> 분야가 더 어울려요</span><em>바꾸기 ›</em>';
    btn.onclick = function () { selectDomain(sug, primary); };
    box.appendChild(btn);
  }

  function build() {
    var b;
    try {
      b = ENG.buildPrompt(cfg());
    } catch (e) {
      if ($('promptOut')) $('promptOut').textContent = '프롬프트를 만들지 못했습니다: ' + e.message;
      return;
    }
    current.lastBuild = b;
    current.varValues = {};
    renderPrompt();
    renderStructure();
    renderVars();
    renderSuggest();
    saveQuiet();
  }

  function displayPrompt() {
    var b = current.lastBuild;
    if (!b) return '';
    if (!b.vars.length) return ENG.fixJosa(b.prompt);
    return ENG.fixJosa(ENG.fillVars(b.prompt, current.varValues));
  }

  function renderPrompt() {
    var b = current.lastBuild;
    if (!b) return;
    var out = $('promptOut');
    if (out) out.textContent = displayPrompt();
    var meta = $('promptMeta');
    if (meta) {
      var fwLabel = (ENG.FRAMEWORKS.filter(function (f) { return f.id === b.framework; })[0] || {}).label || b.framework;
      var tgLabel = (ENG.TARGETS.filter(function (t) { return t.id === b.target; })[0] || {}).label || b.target;
      meta.textContent = b.domain.icon + ' ' + b.domain.name + ' · ' + b.task.label + ' · ' + fwLabel + ' · ' + tgLabel;
    }
    var cnt = $('promptChars');
    if (cnt) cnt.textContent = displayPrompt().length.toLocaleString('ko-KR') + '자';
    var vc = $('varCount');
    if (vc) {
      var left = ENG.extractVars(displayPrompt()).length;
      vc.textContent = left ? left : 0;
      vc.style.display = left ? '' : 'none';
    }
    var hint = $('promptHint');
    if (hint) {
      if (b.vars.length) {
        var left2 = ENG.extractVars(displayPrompt()).length;
        hint.className = 'helper warn';
        hint.textContent = left2 ? '⚠ 변수 ' + left2 + '개의 값이 비어 있습니다. [변수] 탭에서 채우면 자동 반영됩니다.' : '✓ 변수를 모두 채웠습니다. 그대로 복사해 쓰세요.';
      } else if (b.domain.id === 'finance' && window.FocusMarket && window.FocusMarket.hasData()) {
        hint.className = 'helper live';
        hint.textContent = '✓ 실제 조회한 시세 데이터가 프롬프트에 포함되어 있습니다.';
      } else {
        hint.className = 'helper';
        hint.textContent = '완성된 프롬프트를 복사해 아래 AI에 붙여넣으면 됩니다.';
      }
    }
  }

  function renderStructure() {
    var b = current.lastBuild;
    var box = $('structureOut');
    if (!box || !b) return;
    var fw = ENG.FRAMEWORKS.filter(function (f) { return f.id === b.framework; })[0] || {};
    var tg = ENG.TARGETS.filter(function (t) { return t.id === b.target; })[0] || {};
    var html = '<div class="struct-head"><div><b>' + esc(fw.label || b.framework) + '</b><span>' + esc(fw.hint || '') + '</span></div><div><b>' + esc(tg.label || b.target) + '</b><span>' + esc(tg.hint || '') + '</span></div></div>';
    html += '<div class="struct-list">';
    (b.sections || []).forEach(function (s, i) {
      var chars = s.lines.join('\n').length;
      html += '<div class="struct-item"><span class="struct-i">' + (i + 1) + '</span><div><b>' + esc(s.t) + '</b><small>' + chars.toLocaleString('ko-KR') + '자</small></div></div>';
    });
    html += '</div>';
    html += '<p class="helper">이 구조가 그대로 프롬프트의 뼈대가 됩니다. 프레임워크를 바꾸면 섹션 구성과 타겟 AI의 문법(예: Claude의 XML 태그)이 함께 바뀝니다.</p>';
    box.innerHTML = html;
  }

  function renderVars() {
    var b = current.lastBuild;
    var box = $('varsOut');
    if (!box || !b) return;
    if (!b.vars.length) {
      box.innerHTML = '<div class="empty"><strong>비어 있는 변수가 없습니다.</strong>모든 항목이 채워진 프롬프트입니다.</div>';
      return;
    }
    box.innerHTML = '<p class="helper" style="margin:0 0 10px">아래 값을 채우면 프롬프트에 즉시 반영됩니다. 비워 두면 <code>{{변수}}</code> 형태로 남습니다.</p><div class="var-form"></div>';
    var form = box.querySelector('.var-form');
    b.vars.forEach(function (name) {
      var row = document.createElement('div');
      row.className = 'field';
      row.innerHTML = '<label>{{' + esc(name) + '}}</label>';
      var inp = document.createElement('input');
      inp.className = 'control';
      inp.type = 'text';
      inp.placeholder = name + ' 입력';
      inp.value = current.varValues[name] || '';
      inp.addEventListener('input', function () {
        current.varValues[name] = inp.value;
        renderPrompt();
        var cnt = $('promptChars');
        if (cnt) cnt.textContent = displayPrompt().length.toLocaleString('ko-KR') + '자';
      });
      row.appendChild(inp);
      form.appendChild(row);
    });
  }

  function switchTab(id) {
    Array.prototype.forEach.call(document.querySelectorAll('.out-tab'), function (b) {
      b.classList.toggle('active', b.dataset.tab === id);
    });
    Array.prototype.forEach.call(document.querySelectorAll('.out-pane'), function (p) {
      p.classList.toggle('active', p.id === id);
    });
  }

  async function copyText(text, okMsg) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        toast(okMsg || '복사했습니다.');
        return true;
      }
    } catch (e) { /* fallback */ }
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:0;left:-9999px;opacity:0';
      document.body.appendChild(ta);
      ta.focus(); ta.select();
      var ok = document.execCommand('copy');
      document.body.removeChild(ta);
      toast(ok ? (okMsg || '복사했습니다.') : '복사가 차단되었습니다. 프롬프트를 길게 눌러 직접 복사해 주세요.');
      return ok;
    } catch (e) {
      toast('복사가 차단되었습니다. 프롬프트를 길게 눌러 직접 복사해 주세요.');
      return false;
    }
  }

  function promptTitle() {
    var b = current.lastBuild;
    if (!b) return '프롬프트';
    var primary = String(current.values[b.domain.primary] || '').trim().replace(/\s+/g, ' ');
    var base = primary ? primary.slice(0, 34) : '';
    return (b.task.label + (base ? ' · ' + base : '')).slice(0, 60);
  }

  function savePrompt() {
    var b = current.lastBuild;
    if (!b) return;
    var text = displayPrompt();
    var item = {
      id: 'p' + Date.now(),
      title: promptTitle(),
      domain: b.domain.id,
      domainName: b.domain.name,
      domainIcon: b.domain.icon,
      task: b.task.label,
      framework: b.framework,
      target: b.target,
      text: text,
      vars: current.varValues,
      cfg: cfgSnapshot(),
      created: new Date().toISOString()
    };
    state.prompts.unshift(item);
    if (state.prompts.length > 300) state.prompts = state.prompts.slice(0, 300);
    saveState();
    toast('라이브러리에 저장했습니다.');
  }

  /* ---------------- 진단 ---------------- */
  function runDiagnose() {
    var text = ($('diagInput') || {}).value || '';
    if (!text.trim()) { toast('진단할 프롬프트를 붙여넣어 주세요.'); $('diagInput').focus(); return; }
    var r = ENG.diagnose(text);
    current.diag = { text: text, result: r };
    var score = $('diagScore');
    if (score) score.textContent = r.score;
    var grade = $('diagGrade');
    if (grade) {
      grade.textContent = r.grade;
      grade.className = 'grade grade-' + (r.score >= 85 ? 'a' : r.score >= 65 ? 'b' : r.score >= 40 ? 'c' : 'd');
    }
    var axes = $('diagAxes');
    if (axes) {
      axes.innerHTML = r.axes.map(function (a) {
        var pct = Math.round(a.score / a.max * 100);
        var tone = pct >= 80 ? 'good' : pct >= 50 ? 'mid' : 'low';
        return '<div class="axis"><div class="axis-top"><span>' + esc(a.label) + '</span><b>' + a.score + '/' + a.max + '</b></div><div class="axis-bar"><i class="' + tone + '" style="width:' + pct + '%"></i></div></div>';
      }).join('');
    }
    var miss = $('diagMissing');
    if (miss) {
      if (!r.missing.length) {
        miss.innerHTML = '<div class="ok-box">✓ 다섯 요소가 모두 충분합니다. 바로 쓸 수 있는 프롬프트입니다.</div>';
      } else {
        miss.innerHTML = r.missing.map(function (m) {
          return '<div class="miss-item"><b>' + esc(m.label) + ' <span>' + m.score + '/' + m.max + '</span></b><p>' + esc(m.tip) + '</p></div>';
        }).join('');
      }
    }
    var up = upgradePrompt(text);
    var upOut = $('diagUpOut');
    if (upOut) upOut.textContent = up;
    var sum = $('diagSummary');
    if (sum) sum.textContent = '점수 ' + r.score + '점 · ' + r.grade + (r.missing.length ? ' · 보완 ' + r.missing.length + '개' : ' · 보완 없음');
  }

  function upgradePrompt(text) {
    var autoD = ENG.autoDomain(text);
    var autoT = ENG.autoTask(autoD, text);
    var d = ENG.domainById(autoD);
    var core = '"' + text.trim().replace(/[.!?。\s]+$/, '') + '"';
    var b = ENG.buildPrompt({
      domainId: autoD,
      taskId: autoT,
      values: { [d.primary]: core },
      framework: ($('diagFramework') || {}).value || 'costar',
      target: ($('diagTarget') || {}).value || 'universal',
      tone: ($('diagTone') || {}).value || 'professional',
      format: 'auto',
      depth: 'deep',
      lang: 'ko',
      forbid: ['nofab', 'nohype', 'nofiller', 'norepeat'],
      customForbid: '',
      extraContext: '이 프롬프트는 사용자가 직접 쓴 한 줄 요청을 재설계한 것이다. 원문의 의도는 유지하되, 원문에 없던 사실을 지어내지 말고 빠진 정보는 [확인 필요]로 표시한다.'
    });
    current.diagBuild = b;
    return b.prompt;
  }

  /* ---------------- 라이브러리 ---------------- */
  function renderLibrary() {
    var box = $('libList');
    if (!box) return;
    var q = (($('libSearch') || {}).value || '').trim().toLowerCase();
    var dom = (($('libDomain') || {}).value || 'all');
    var list = state.prompts.filter(function (p) {
      if (dom !== 'all' && p.domain !== dom) return false;
      if (!q) return true;
      return (p.title + ' ' + p.text + ' ' + p.domainName).toLowerCase().indexOf(q) !== -1;
    });
    var cnt = $('libCount');
    if (cnt) cnt.textContent = list.length + '개 / 전체 ' + state.prompts.length + '개';
    if (!list.length) {
      box.innerHTML = '<div class="empty"><strong>저장된 프롬프트가 없습니다.</strong>빌더에서 프롬프트를 만들고 [저장]을 누르면 이곳에 쌓입니다.</div>';
      return;
    }
    box.innerHTML = '';
    list.forEach(function (p) {
      var row = document.createElement('div');
      row.className = 'lib-item';
      var preview = p.text.replace(/\s+/g, ' ').slice(0, 120);
      row.innerHTML = '<div class="lib-main"><div class="lib-top"><span class="lib-badge">' + esc(p.domainIcon || '') + ' ' + esc(p.domainName || p.domain) + '</span>' +
        '<span class="lib-fw">' + esc(p.framework) + ' · ' + esc(p.target) + '</span></div>' +
        '<div class="lib-title">' + esc(p.title) + '</div>' +
        '<div class="lib-preview">' + esc(preview) + '…</div>' +
        '<div class="lib-date">' + new Date(p.created).toLocaleString('ko-KR') + ' · ' + p.text.length.toLocaleString('ko-KR') + '자</div></div>';
      var acts = document.createElement('div');
      acts.className = 'lib-actions';
      var bCopy = document.createElement('button');
      bCopy.className = 'btn small'; bCopy.textContent = '복사';
      bCopy.onclick = function () { copyText(p.text, '라이브러리에서 복사했습니다.'); };
      var bOpen = document.createElement('button');
      bOpen.className = 'btn small ghost'; bOpen.textContent = '빌더에서 열기';
      bOpen.onclick = function () { openInBuilder(p); };
      var bDel = document.createElement('button');
      bDel.className = 'btn small danger'; bDel.textContent = '삭제';
      bDel.onclick = function () {
        if (!confirm('이 프롬프트를 삭제할까요?')) return;
        state.prompts = state.prompts.filter(function (x) { return x.id !== p.id; });
        saveState();
        toast('삭제했습니다.');
      };
      acts.appendChild(bCopy); acts.appendChild(bOpen); acts.appendChild(bDel);
      row.appendChild(acts);
      box.appendChild(row);
    });
  }

  function openInBuilder(p) {
    nav('builder');
    if (p.cfg) {
      var c = p.cfg;
      current.domainId = c.domainId || p.domain || 'coding';
      current.taskId = c.taskId || 'build';
      current.valuesByDomain[current.domainId] = Object.assign({}, c.values || {});
      current.values = current.valuesByDomain[current.domainId];
      current.varValues = Object.assign({}, p.vars || {});
      renderDomainGrid();
      renderTasks();
      renderFields();
      if ($('frameworkSel')) $('frameworkSel').value = c.framework || 'auto';
      if ($('targetSel')) $('targetSel').value = c.target || 'universal';
      if ($('toneSel')) $('toneSel').value = c.tone || 'professional';
      if ($('formatSel')) $('formatSel').value = c.format || 'auto';
      if ($('depthSel')) $('depthSel').value = c.depth || 'standard';
      if ($('langSel')) $('langSel').value = c.lang || 'ko';
      if ($('lengthInput')) $('lengthInput').value = c.length || '';
      if ($('audienceInput')) $('audienceInput').value = c.audience || '';
      if ($('customForbid')) $('customForbid').value = c.customForbid || '';
      Array.prototype.forEach.call(document.querySelectorAll('[data-forbid]'), function (b) {
        b.classList.toggle('active', (c.forbid || []).indexOf(b.dataset.forbid) !== -1);
      });
      build();
      current.varValues = Object.assign({}, p.vars || {});
      renderPrompt();
      renderVars();
      toast('저장한 설정 그대로 빌더에 불러왔습니다.');
      return;
    }
    if (p.domain) {
      current.domainId = p.domain;
      renderDomainGrid();
      renderTasks();
      renderFields();
    }
    if ($('frameworkSel')) $('frameworkSel').value = p.framework || 'auto';
    if ($('targetSel')) $('targetSel').value = p.target || 'universal';
    build();
    var out = $('promptOut');
    if (out) out.textContent = p.text;
    toast('저장된 프롬프트를 표시합니다.');
  }

  function download(name, content, type) {
    var a = document.createElement('a');
    var url = URL.createObjectURL(new Blob([content], { type: type }));
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 800);
  }

  function exportLibrary(kind) {
    if (!state.prompts.length) { toast('내보낼 프롬프트가 없습니다.'); return; }
    var stamp = new Date().toISOString().slice(0, 10);
    if (kind === 'json') {
      download('focus-prompts-' + stamp + '.json', JSON.stringify(state.prompts, null, 2), 'application/json;charset=utf-8');
    } else {
      var md = state.prompts.map(function (p, i) {
        return '## ' + (i + 1) + '. ' + p.title + '\n\n- 도메인: ' + (p.domainName || p.domain) + '\n- 프레임워크: ' + p.framework + ' / 타겟: ' + p.target + '\n- 저장: ' + new Date(p.created).toLocaleString('ko-KR') + '\n\n```\n' + p.text + '\n```\n';
      }).join('\n');
      download('focus-prompts-' + stamp + '.md', '# FOCUS AI 프롬프트 라이브러리\n\n' + md, 'text/markdown;charset=utf-8');
    }
    toast('내보냈습니다. 다운로드 폴더를 확인하세요.');
  }

  /* ---------------- 프리셋 ---------------- */
  function renderPresets() {
    var box = $('presetGrid');
    if (!box) return;
    var filter = (($('presetFilter') || {}).value || 'all');
    var list = ENG.PRESETS.filter(function (p) { return filter === 'all' || p.domain === filter; });
    box.innerHTML = '';
    list.forEach(function (p) {
      var d = ENG.domainById(p.domain);
      var card = document.createElement('div');
      card.className = 'preset-card';
      card.innerHTML = '<div class="preset-top"><span class="preset-icon">' + p.icon + '</span><span class="lib-badge">' + esc(d.name) + '</span></div>' +
        '<div class="preset-title">' + esc(p.title) + '</div>' +
        '<div class="preset-desc">' + esc(p.desc) + '</div>' +
        '<div class="preset-meta">' + esc((ENG.FRAMEWORKS.filter(function (f) { return f.id === p.framework; })[0] || {}).label || p.framework) +
        ' · ' + esc((ENG.TARGETS.filter(function (t) { return t.id === p.target; })[0] || {}).label || p.target) + '</div>';
      var btn = document.createElement('button');
      btn.className = 'btn primary small';
      btn.textContent = '불러오기';
      btn.onclick = function () { applyPreset(p); };
      card.appendChild(btn);
      box.appendChild(card);
    });
  }

  function applyPreset(p) {
    nav('builder');
    current.domainId = p.domain;
    current.valuesByDomain[p.domain] = Object.assign({}, p.values);
    current.values = current.valuesByDomain[p.domain];
    current.taskId = p.task;
    current.varValues = {};
    if ($('frameworkSel')) $('frameworkSel').value = p.framework || 'auto';
    if ($('targetSel')) $('targetSel').value = p.target || 'universal';
    renderDomainGrid();
    renderTasks();
    renderFields();
    build();
    toast('프리셋을 불러왔습니다. 값을 바꾸면 프롬프트가 즉시 갱신됩니다.');
  }

  /* ---------------- Gemini (선택) ---------------- */
  function hasKey() { return !!(state.apiKey && state.apiKey.trim()); }

  function updateKeyUI() {
    var el = $('geminiStatus');
    if (el) {
      el.textContent = hasKey() ? 'CONNECTED' : 'NOT CONNECTED';
      el.style.background = hasKey() ? '#123729' : '';
      el.style.color = hasKey() ? '#9be9c8' : '';
    }
    if ($('apiKey')) $('apiKey').value = state.apiKey || '';
    ['aiEnhanceBtn', 'diagAiBtn'].forEach(function (id) {
      var b = $(id);
      if (b) b.style.display = hasKey() ? '' : 'none';
    });
  }

  async function callGemini(prompt) {
    var key = (state.apiKey || '').trim();
    if (!key) throw new Error('설정에서 Gemini API 키를 먼저 저장해 주세요.');
    var url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
    var r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.6, maxOutputTokens: 4096 }
      })
    });
    var j = await r.json().catch(function () { return null; });
    if (!r.ok) {
      var msg = j && j.error && j.error.message ? j.error.message : ('API 오류 ' + r.status);
      throw new Error(msg);
    }
    var parts = j && j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts;
    var text = (parts || []).map(function (p) { return p.text || ''; }).join('').trim();
    if (!text) throw new Error('빈 응답을 받았습니다.');
    return text;
  }

  async function enhanceText(sourceText, btn, onDone) {
    var original = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = 'AI가 다듬는 중…'; }
    try {
      var text = await callGemini(
        '당신은 프롬프트 엔지니어입니다. 아래 프롬프트를 의도는 유지하면서 더 정밀하고 전문가 수준으로 다듬어 주세요.\n' +
        '- 없는 사실을 추가하지 말 것. 모르는 정보는 {{변수}} 또는 [확인 필요]로 남길 것.\n' +
        '- 구조와 제약을 더 명확히 하고, 중복을 제거할 것.\n- 결과는 개선된 프롬프트 전문만 출력할 것(설명·머리말 금지).\n\n' +
        '[원본 프롬프트]\n' + sourceText
      );
      if (onDone) onDone(text);
      toast('Gemini로 프롬프트를 다듬었습니다.');
    } catch (e) {
      toast('AI 고도화 실패: ' + e.message.slice(0, 120));
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = original || 'AI로 고도화'; }
    }
  }

  /* ---------------- 시장 페이지 ---------------- */
  function renderMarketPage() {
    if (window.FocusMarket && window.FocusMarket.hasData() && typeof window.FocusMarket.redraw === 'function') {
      window.FocusMarket.redraw();
    }
  }

  /* ---------------- 초기화 ---------------- */
  function fillSelect(id, list, value) {
    var el = $(id);
    if (!el) return;
    el.innerHTML = '';
    list.forEach(function (o) {
      var op = document.createElement('option');
      op.value = o.id;
      op.textContent = o.label;
      el.appendChild(op);
    });
    if (value) el.value = value;
  }

  function init() {
    fillSelect('frameworkSel', ENG.FRAMEWORKS, state.defaults.framework);
    fillSelect('targetSel', ENG.TARGETS, state.defaults.target);
    fillSelect('toneSel', ENG.TONES, state.defaults.tone);
    fillSelect('formatSel', ENG.FORMATS, state.defaults.format);
    fillSelect('depthSel', ENG.DEPTHS, state.defaults.depth);
    fillSelect('langSel', ENG.LANGS, state.defaults.lang);

    fillSelect('diagFramework', ENG.FRAMEWORKS.filter(function (f) { return f.id !== 'auto'; }), 'costar');
    fillSelect('diagTarget', ENG.TARGETS, 'universal');
    fillSelect('diagTone', ENG.TONES, 'professional');

    // 금지사항 칩
    var fw = $('forbidChips');
    if (fw) {
      ENG.FORBIDS.forEach(function (f) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'chip' + (['nofab', 'nohype', 'nofiller'].indexOf(f.id) !== -1 ? ' active' : '');
        b.textContent = f.label;
        b.dataset.forbid = f.id;
        b.onclick = function () { b.classList.toggle('active'); scheduleBuild(); };
        fw.appendChild(b);
      });
    }

    // 도메인 필터 (라이브러리 · 프리셋)
    ['libDomain', 'presetFilter'].forEach(function (id) {
      var el = $(id);
      if (!el) return;
      var all = document.createElement('option');
      all.value = 'all'; all.textContent = '전체 도메인';
      el.appendChild(all);
      ENG.DOMAINS.forEach(function (d) {
        var op = document.createElement('option');
        op.value = d.id; op.textContent = d.icon + ' ' + d.name;
        el.appendChild(op);
      });
    });

    renderDomainGrid();
    renderTasks();
    renderFields();
    renderPresets();
    renderLibrary();
    updateKeyUI();
    build();

    // 이벤트
    Array.prototype.forEach.call(document.querySelectorAll('[data-page]'), function (b) {
      b.addEventListener('click', function () { nav(b.dataset.page); });
    });
    var menuBtn = $('menuBtn');
    if (menuBtn) menuBtn.onclick = function () { $('sidebar').classList.toggle('open'); };

    var buildBtn = $('buildBtn');
    if (buildBtn) buildBtn.onclick = function () { build(); if (window.innerWidth < 760) { var c = $('outputCard'); if (c) c.scrollIntoView({ behavior: 'smooth' }); } toast('프롬프트를 새로 만들었습니다.'); };

    var resetBtn = $('resetBtn');
    if (resetBtn) resetBtn.onclick = function () {
      if (!confirm('입력한 내용을 모두 지울까요?')) return;
      current.values = {};
      current.valuesByDomain[current.domainId] = {};
      current.varValues = {};
      renderFields();
      build();
      toast('입력을 초기화했습니다.');
    };

    ['frameworkSel', 'targetSel', 'toneSel', 'formatSel', 'depthSel', 'langSel'].forEach(function (id) {
      var el = $(id);
      if (el) el.addEventListener('change', function () { build(); });
    });
    ['lengthInput', 'audienceInput', 'customForbid'].forEach(function (id) {
      var el = $(id);
      if (el) el.addEventListener('input', scheduleBuild);
    });

    Array.prototype.forEach.call(document.querySelectorAll('.out-tab'), function (b) {
      b.onclick = function () { switchTab(b.dataset.tab); };
    });

    var copyBtn = $('copyBtn');
    if (copyBtn) copyBtn.onclick = function () {
      var left = ENG.extractVars(displayPrompt());
      copyText(displayPrompt(), left.length ? '변수 ' + left.length + '개가 {{}}로 남은 채 복사했습니다.' : '프롬프트를 복사했습니다. 원하는 AI에 붙여넣으세요.');
    };
    var saveBtn = $('saveBtn');
    if (saveBtn) saveBtn.onclick = savePrompt;
    var aiBtn = $('aiEnhanceBtn');
    if (aiBtn) aiBtn.onclick = function () {
      if (!current.lastBuild) return;
      enhanceText(current.lastBuild.prompt, aiBtn, function (text) {
        current.lastBuild = Object.assign({}, current.lastBuild, { prompt: text, vars: ENG.extractVars(text) });
        var out = $('promptOut');
        if (out) out.textContent = displayPrompt();
        renderVars();
        var hint = $('promptHint');
        if (hint) { hint.className = 'helper live'; hint.textContent = '✓ Gemini가 다듬은 결과입니다. [프롬프트 생성]을 누르면 원래대로 돌아갑니다.'; }
      });
    };

    var diagBtn = $('diagBtn');
    if (diagBtn) diagBtn.onclick = runDiagnose;
    var diagClear = $('diagClear');
    if (diagClear) diagClear.onclick = function () {
      if ($('diagInput')) $('diagInput').value = '';
      if ($('diagUpOut')) $('diagUpOut').textContent = '진단하면 여기에 전문가급으로 재설계한 프롬프트가 나타납니다.';
      if ($('diagScore')) $('diagScore').textContent = '—';
      if ($('diagGrade')) { $('diagGrade').textContent = '대기'; $('diagGrade').className = 'grade'; }
      if ($('diagAxes')) $('diagAxes').innerHTML = '';
      if ($('diagMissing')) $('diagMissing').innerHTML = '';
      if ($('diagSummary')) $('diagSummary').textContent = '';
    };
    var diagCopy = $('diagCopy');
    if (diagCopy) diagCopy.onclick = function () {
      var t = ($('diagUpOut') || {}).textContent || '';
      if (!t || t.indexOf('진단하면') === 0) { toast('먼저 진단을 실행해 주세요.'); return; }
      copyText(t, '업그레이드된 프롬프트를 복사했습니다.');
    };
    var diagSave = $('diagSave');
    if (diagSave) diagSave.onclick = function () {
      var t = ($('diagUpOut') || {}).textContent || '';
      if (!t || !current.diagBuild) { toast('먼저 진단을 실행해 주세요.'); return; }
      var b = current.diagBuild;
      state.prompts.unshift({
        id: 'p' + Date.now(),
        title: '업그레이드 · ' + b.task.label + ' · ' + t.replace(/\s+/g, ' ').slice(0, 36),
        domain: b.domain.id, domainName: b.domain.name, domainIcon: b.domain.icon,
        task: b.task.label, framework: b.framework, target: b.target,
        text: t, vars: {}, created: new Date().toISOString()
      });
      saveState();
      toast('업그레이드 결과를 라이브러리에 저장했습니다.');
    };
    var diagAi = $('diagAiBtn');
    if (diagAi) diagAi.onclick = function () {
      if (!current.diagBuild) { toast('먼저 진단을 실행해 주세요.'); return; }
      var src = ($('diagUpOut') || {}).textContent || current.diagBuild.prompt;
      enhanceText(src, diagAi, function (text) {
        if ($('diagUpOut')) $('diagUpOut').textContent = text;
        current.diagBuild = Object.assign({}, current.diagBuild, { prompt: text });
      });
    };

    var libSearch = $('libSearch');
    if (libSearch) libSearch.addEventListener('input', renderLibrary);
    var libDomain = $('libDomain');
    if (libDomain) libDomain.addEventListener('change', renderLibrary);
    var expJson = $('libExportJson'), expMd = $('libExportMd');
    if (expJson) expJson.onclick = function () { exportLibrary('json'); };
    if (expMd) expMd.onclick = function () { exportLibrary('md'); };

    var presetFilter = $('presetFilter');
    if (presetFilter) presetFilter.addEventListener('change', renderPresets);

    var search = $('globalSearch');
    if (search) {
      search.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        if ($('libSearch')) $('libSearch').value = search.value;
        nav('library');
        renderLibrary();
      });
    }

    // 설정: API 키
    var saveKey = $('saveKey');
    if (saveKey) saveKey.onclick = function () {
      state.apiKey = ($('apiKey').value || '').trim();
      saveState();
      updateKeyUI();
      toast(state.apiKey ? 'API 키를 저장했습니다. AI 고도화를 쓸 수 있습니다.' : 'API 키를 비웠습니다.');
    };
    var showKey = $('showKey');
    if (showKey) showKey.onchange = function () { $('apiKey').type = showKey.checked ? 'text' : 'password'; };
    var testKey = $('testKey');
    if (testKey) testKey.onclick = async function () {
      if (!hasKey()) { toast('먼저 API 키를 저장해 주세요.'); return; }
      testKey.disabled = true; testKey.textContent = '확인 중…';
      try {
        var t = await callGemini('Reply with exactly: OK');
        toast('Gemini 연결 성공: ' + t.slice(0, 40));
      } catch (e) {
        toast('연결 실패: ' + e.message.slice(0, 110));
      } finally { testKey.disabled = false; testKey.textContent = '연결 테스트'; }
    };
    var delKey = $('deleteKey');
    if (delKey) delKey.onclick = function () {
      state.apiKey = '';
      saveState(); updateKeyUI();
      toast('API 키를 삭제했습니다.');
    };
    var clearAll = $('clearAll');
    if (clearAll) clearAll.onclick = function () {
      if (!confirm('저장한 프롬프트, 설정, API 키를 모두 삭제할까요? 되돌릴 수 없습니다.')) return;
      localStorage.removeItem(STORE);
      state.prompts = [];
      state.apiKey = '';
      state.marketApi = '';
      saveState(); updateKeyUI(); renderLibrary();
      toast('로컬 데이터를 삭제했습니다.');
    };

    // 시장 모듈 연결
    if (window.FocusMarket) {
      window.FocusMarket.init({
        state: state,
        onChange: function () {
          if (domain().needsMarket) build();
          var hint = $('builderMktHint');
          if (hint) {
            if (window.FocusMarket.hasData()) {
              hint.className = 'helper live';
              var s = window.FocusMarket.symbol();
              hint.textContent = '✓ ' + s + ' 시세가 프롬프트 [검증된 시장 데이터] 블록에 포함됩니다.';
            } else {
              hint.className = 'helper';
              hint.textContent = '종목을 조회하면 시세·밸류에이션·실적이 프롬프트에 자동으로 들어갑니다.';
            }
          }
          renderMarketPage();
        }
      });
    }

    window.__focusGoFinance = function () {
      nav('builder');
      selectDomain('finance');
    };

    // 검증용 훅 (읽기 전용 정보)
    window.__focusApp = {
      state: function () { return state; },
      current: function () { return current; },
      build: function () { build(); return current.lastBuild; },
      nav: nav,
      selectDomain: selectDomain,
      setValues: function (v) { current.values = v; renderFields(); build(); },
      diag: runDiagnose
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
