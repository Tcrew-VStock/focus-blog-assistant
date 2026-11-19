/* =========================================================================
   FOCUS AI PROMPT STUDIO — 시장 데이터 모듈
   기존 FOCUS v3.0의 focus-market-api(Cloudflare Worker) 연동을 그대로 유지.
   조회값은 프롬프트에 [검증된 시장 데이터] 블록으로 주입된다.
   ========================================================================= */
(function (global) {
  'use strict';

  var DEFAULT_API = 'https://focus-market-api.tcrewseadona.workers.dev';
  var MKT = { data: null, chart: null, range: '3m', fin: 'annual', symbol: '' };
  var stateRef = null;
  var onChange = function () {};

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function apiUrl() {
    var v = (stateRef && stateRef.marketApi) || DEFAULT_API;
    return String(v).trim().replace(/\/+$/, '');
  }

  function setPill(kind, text) {
    var map = { live: ['#123729', '#9be9c8'], ready: ['#3a2a13', '#efc86b'], error: ['#4a1d26', '#ffa7b3'], idle: ['', ''] };
    var pair = map[kind] || map.idle;
    ['marketStatus', 'settingsMarketStatus', 'builderMktPill'].forEach(function (id) {
      var el = $(id);
      if (!el) return;
      el.textContent = text;
      el.style.background = pair[0];
      el.style.color = pair[1];
    });
  }

  function int(n) { return n == null ? '—' : Math.round(n).toLocaleString('ko-KR'); }
  function fmtPrice(n, cur) {
    if (n == null) return '—';
    var x = Number(n);
    if (!isFinite(x)) return '—';
    if (cur === 'KRW') return Math.round(x).toLocaleString('ko-KR') + '원';
    if (cur === 'USD') return '$' + x.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return x.toLocaleString('ko-KR', { maximumFractionDigits: 2 }) + (cur ? ' ' + cur : '');
  }
  function compact(n) {
    if (n == null) return '—';
    var a = Math.abs(n);
    if (a >= 1e12) return (n / 1e12).toFixed(a >= 1e13 ? 1 : 2).replace(/\.0+$/, '') + '조';
    if (a >= 1e8) return (n / 1e8).toFixed(a >= 1e10 ? 0 : 1).replace(/\.0+$/, '') + '억';
    if (a >= 1e4) return (n / 1e4).toFixed(1).replace(/\.0+$/, '') + '만';
    return Math.round(n).toLocaleString('ko-KR');
  }
  function cls(n) { return n == null ? 'flat' : n > 0 ? 'up' : n < 0 ? 'down' : 'flat'; }
  function recoLabel(r) {
    var x = Number(r);
    if (!isFinite(x)) return '—';
    if (x >= 4.5) return x.toFixed(2) + ' / 5 · 적극 매수';
    if (x >= 3.5) return x.toFixed(2) + ' / 5 · 매수';
    if (x >= 2.5) return x.toFixed(2) + ' / 5 · 중립';
    if (x >= 1.5) return x.toFixed(2) + ' / 5 · 매도';
    return x.toFixed(2) + ' / 5 · 적극 매도';
  }

  async function fetchJson(path) {
    var r = await fetch(apiUrl() + path, { headers: { Accept: 'application/json' } });
    var j = await r.json().catch(function () { return null; });
    if (!r.ok || !j || j.ok === false) throw new Error((j && j.error) || ('시세 API 응답 오류 (' + r.status + ')'));
    return j;
  }

  async function test(silent) {
    try {
      var j = await fetchJson('/api/health');
      setPill('live', 'LIVE');
      var msg = '연결됨 · focus-market-api v' + (j.version || '?') + ' · ' + (j.source || '네이버 금융');
      var el = $('marketApiResult');
      if (el) el.textContent = msg;
      if (!silent) toast('시세 API에 연결했습니다.');
      return true;
    } catch (e) {
      setPill('error', 'ERROR');
      var el2 = $('marketApiResult');
      if (el2) el2.textContent = '연결 실패: ' + e.message.slice(0, 140);
      if (!silent) toast('시세 API 연결 실패: ' + e.message.slice(0, 90));
      return false;
    }
  }

  function toast(msg) {
    if (typeof global.__focusToast === 'function') global.__focusToast(msg);
  }

  async function load(symbol) {
    var sym = String(symbol || '').trim();
    if (!sym) {
      var a = $('marketSymbol'), b = $('builderMktSymbol');
      sym = String((a && a.value) || (b && b.value) || '').trim();
    }
    if (!sym) { toast('종목명이나 티커를 입력해 주세요.'); return; }
    setPill('ready', 'LOADING');
    try {
      var q = await fetchJson('/api/quote?symbol=' + encodeURIComponent(sym));
      var c = await fetchJson('/api/chart?symbol=' + encodeURIComponent(sym) + '&range=' + MKT.range).catch(function () { return null; });
      MKT.data = q; MKT.chart = c; MKT.symbol = sym;
      if (stateRef) { stateRef.marketSymbol = sym; }
      if (typeof global.__focusSaveState === 'function') global.__focusSaveState();
      ['marketSymbol', 'builderMktSymbol'].forEach(function (id) { if ($(id)) $(id).value = sym; });
      render();
      setPill('live', 'LIVE');
      toast((q.quote && q.quote.name ? q.quote.name : sym) + ' 시세를 불러왔습니다. 프롬프트에 자동으로 포함됩니다.');
      onChange();
    } catch (e) {
      setPill('error', 'ERROR');
      if ($('marketBody')) {
        $('marketBody').innerHTML = '<div class="mkt-empty"><b>시세를 불러오지 못했습니다.</b>' + esc(e.message) + '<br>종목명을 정확히 입력하거나 잠시 후 다시 시도해 주세요.</div>';
      }
      toast('시세 조회 실패: ' + e.message.slice(0, 110));
    }
  }

  async function loadChart(range) {
    if (!MKT.symbol) return;
    MKT.range = range;
    try {
      MKT.chart = await fetchJson('/api/chart?symbol=' + encodeURIComponent(MKT.symbol) + '&range=' + range);
      render();
    } catch (e) {
      toast('차트 조회 실패: ' + e.message.slice(0, 100));
    }
  }

  function chartStats() {
    var pts = (MKT.chart && MKT.chart.points) || [];
    if (pts.length < 2) return null;
    var closes = pts.map(function (p) { return p.close; });
    var first = closes[0], last = closes[closes.length - 1];
    return {
      high: Math.max.apply(null, closes), low: Math.min.apply(null, closes),
      change: last - first, changePercent: (last - first) / first * 100,
      from: pts[0].date, to: pts[pts.length - 1].date, count: pts.length
    };
  }

  function render() {
    var d = MKT.data;
    if (!d) return;
    var q = d.quote || {}, v = d.valuation || {}, cur = q.currency || '';
    var fmt = function (n) { return fmtPrice(n, cur); };
    var dirCls = cls(q.change);
    var chg = q.change == null ? '—' : (q.change > 0 ? '▲ ' : (q.change < 0 ? '▼ ' : '- ')) + fmt(Math.abs(q.change));
    var pct = q.changePercent == null ? '' : (q.changePercent > 0 ? '+' : '') + Number(q.changePercent).toFixed(2) + '%';

    // 요약 (빌더 compact)
    if ($('builderMktSummary')) {
      $('builderMktSummary').style.display = 'block';
      $('builderMktSummary').innerHTML =
        '<b>' + esc(q.name || MKT.symbol) + '</b> ' +
        '<span class="' + dirCls + '">' + fmt(q.price) + ' ' + chg + ' ' + pct + '</span>' +
        '<small>기준 ' + esc(q.tradedAt || '확인 불가') + ' · ' + esc(q.marketStatusText || q.marketStatus || '—') + '</small>';
    }

    if (!$('marketBody')) { onChange(); return; }

    var kpi = function (l, val, sub) {
      return '<div class="mkt-kpi"><em>' + l + '</em><b>' + val + '</b>' + (sub ? '<small>' + sub + '</small>' : '') + '</div>';
    };
    var kpis = [
      ['시가', fmt(q.open)], ['고가', fmt(q.high)], ['저가', fmt(q.low)], ['전일 종가', fmt(q.prevClose)],
      ['거래량', q.volume == null ? '—' : int(q.volume) + (q.type === 'domestic' ? '주' : '')],
      ['거래대금', q.tradingValueText || (q.tradingValue == null ? '—' : compact(q.tradingValue) + (cur === 'KRW' ? '원' : ' ' + cur))],
      ['시가총액', q.marketCapText || (q.marketCap == null ? '—' : compact(q.marketCap) + (cur === 'KRW' ? '원' : ' ' + cur))],
      ['52주 최고 · 최저', (q.high52w == null && q.low52w == null) ? '—' : fmt(q.high52w) + ' · ' + fmt(q.low52w)]
    ];
    if (q.listedShares != null) kpis.push(['상장주식수', int(q.listedShares) + '주']);
    if (v.foreignHoldRatio != null) kpis.push(['외국인 보유율', Number(v.foreignHoldRatio).toFixed(2) + '%']);
    if (q.industry) kpis.push(['업종', esc(q.industry)]);
    if (q.marketCapKrw != null && cur !== 'KRW') kpis.push(['시총 원화 환산', compact(q.marketCapKrw) + '원']);

    var vip = [];
    vip.push(['PER', v.per != null ? Number(v.per).toFixed(2) + '배' : '—', v.asOf && v.asOf.per ? v.asOf.per : '']);
    if (v.estPer != null) vip.push(['추정 PER', Number(v.estPer).toFixed(2) + '배', '']);
    vip.push(['PBR', v.pbr != null ? Number(v.pbr).toFixed(2) + '배' : '—', v.asOf && v.asOf.pbr ? v.asOf.pbr : '']);
    vip.push(['EPS', v.eps != null ? fmt(v.eps) : '—', v.asOf && v.asOf.eps ? v.asOf.eps : '']);
    vip.push(['BPS', v.bps != null ? fmt(v.bps) : '—', v.asOf && v.asOf.bps ? v.asOf.bps : '']);
    vip.push(['배당수익률', v.dividendYield != null ? Number(v.dividendYield).toFixed(2) + '%' : '—', v.asOf && v.asOf.dividendYieldRatio ? v.asOf.dividendYieldRatio : '']);
    vip.push(['주당배당금', v.dividendPerShare != null ? fmt(v.dividendPerShare) : '—', '']);
    if (d.consensus && d.consensus.targetPrice != null) vip.push(['목표주가', fmt(d.consensus.targetPrice), d.consensus.asOf || '']);
    if (d.consensus && d.consensus.recommendation != null) vip.push(['투자의견', recoLabel(d.consensus.recommendation), '']);

    var valHtml = vip.map(function (r) {
      return '<div class="mkt-val"><em>' + r[0] + '</em><b>' + r[1] + '</b>' + (r[2] ? '<em>' + esc(r[2]) + '</em>' : '') + '</div>';
    }).join('');

    var flowRows = (d.flows || []).map(function (f) {
      return '<tr><td>' + esc(f.date || '') + '</td><td>' + int(f.close) + '</td>' +
        '<td class="' + cls(f.foreignNet) + '">' + (f.foreignNet == null ? '—' : (f.foreignNet > 0 ? '+' : '') + int(f.foreignNet)) + '</td>' +
        '<td class="' + cls(f.institutionNet) + '">' + (f.institutionNet == null ? '—' : (f.institutionNet > 0 ? '+' : '') + int(f.institutionNet)) + '</td>' +
        '<td class="' + cls(f.individualNet) + '">' + (f.individualNet == null ? '—' : (f.individualNet > 0 ? '+' : '') + int(f.individualNet)) + '</td></tr>';
    }).join('');
    var flowHtml = flowRows
      ? '<div class="mkt-scroll"><table class="mkt-table"><thead><tr><th>날짜</th><th>종가</th><th>외국인</th><th>기관</th><th>개인</th></tr></thead><tbody>' + flowRows + '</tbody></table></div><p class="mkt-note">순매수 수량(주) · 네이버 금융 수급</p>'
      : '<p class="mkt-note">이 시장의 수급 데이터는 제공처에서 제공하지 않습니다.</p>';

    var researchHtml = (d.research && d.research.length)
      ? d.research.map(function (r) {
        return '<a href="' + esc(r.url || '#') + '" target="_blank" rel="noopener">▸ ' + (r.broker ? esc(r.broker) + ' · ' : '') + esc(r.title || '리포트') + '<small>' + esc(r.date || '') + '</small></a>';
      }).join('')
      : '<p class="mkt-note">증권사 리포트 데이터가 없습니다.</p>';

    var newsHtml = (d.news && d.news.length)
      ? '<div class="mkt-news">' + d.news.map(function (n) {
        return '<a href="' + esc(n.url || '#') + '" target="_blank" rel="noopener">' + esc(n.title || '') + '<small>' + esc(n.office || '') + ' · ' + esc(n.publishedAt || '') + '</small></a>';
      }).join('') + '</div>'
      : '<p class="mkt-note">관련 뉴스를 가져오지 못했습니다.</p>';

    var fin = d.financials ? d.financials[MKT.fin] : null;
    var finHtml = '<p class="mkt-note">실적 데이터가 없습니다.</p>';
    if (fin && fin.periods && fin.periods.length) {
      var periods = fin.periods.slice(-4);
      var rows = fin.rows.slice(0, 12);
      finHtml = '<div class="mkt-scroll"><table class="mkt-table"><thead><tr><th>항목</th>' +
        periods.map(function (p) { return '<th>' + esc(p.title) + (p.consensus ? ' (E)' : '') + '</th>'; }).join('') +
        '</tr></thead><tbody>' + rows.map(function (r) {
          return '<tr><td>' + esc(r.title) + '</td>' + periods.map(function (p) {
            return '<td>' + (r.values[p.key] == null ? '—' : Number(r.values[p.key]).toLocaleString('ko-KR')) + '</td>';
          }).join('') + '</tr>';
        }).join('') + '</tbody></table></div><p class="mkt-note">단위: ' + esc(fin.unit || '제공처 원본 단위') + ' · (E)는 컨센서스 추정치</p>';
    }

    var st = chartStats();
    var chartLegend = st
      ? '<div class="mkt-legend"><span>' + esc(st.from) + ' ~ ' + esc(st.to) + ' · ' + st.count + '거래일</span><span>기간 등락 <b class="' + cls(st.change) + '">' + (st.change > 0 ? '+' : '') + Number(st.changePercent).toFixed(2) + '%</b> · 최고 ' + fmt(st.high) + ' · 최저 ' + fmt(st.low) + '</span></div>'
      : '<div class="mkt-legend"><span>차트 데이터가 없습니다.</span></div>';

    var srcHtml = (d.sources || []).map(function (s) {
      return '<a href="' + esc(s.url) + '" target="_blank" rel="noopener">' + esc(s.name) + '</a>';
    }).join(' · ');

    $('marketBody').innerHTML =
      '<div class="mkt-hero"><div><div class="mkt-name">' + esc(q.name || '') +
      (q.nameEn ? ' <span>' + esc(q.nameEn) + '</span>' : '') +
      '<span>' + esc(q.reutersCode || '') + ' · ' + esc(q.market || '') + ' · ' + esc(q.nation || '') + '</span></div>' +
      '<div class="mkt-price-row"><div class="mkt-price ' + dirCls + '">' + fmt(q.price) + '</div><div class="mkt-chg ' + dirCls + '">' + chg + ' ' + pct + '</div></div>' +
      '<div class="mkt-meta"><span class="mkt-badge">' + esc(q.marketStatusText || q.marketStatus || '—') + '</span><span class="mkt-badge">' + esc(q.delay || '지연 정보 없음') + '</span>기준 시각 ' + esc(q.tradedAt || '확인 불가') + ' · 통화 ' + esc(cur || '—') + '</div></div>' +
      '<div style="display:flex;gap:7px;flex-wrap:wrap"><button class="btn small" id="mktRefresh">새로고침</button><button class="btn small ghost" id="mktUse">이 데이터로 프롬프트 만들기</button></div></div>' +
      '<div class="mkt-kpis">' + kpis.map(function (k) { return kpi(k[0], k[1], k[2]); }).join('') + '</div>' +
      '<div class="mkt-two"><div class="mkt-box"><div class="mkt-box-head"><b>가격 차트</b><div class="mkt-range" id="mktRange">' +
      ['1m:1개월', '3m:3개월', '6m:6개월', '1y:1년', '3y:3년', '5y:5년'].map(function (x) {
        var kv = x.split(':');
        return '<button data-range="' + kv[0] + '" class="' + (MKT.range === kv[0] ? 'on' : '') + '">' + kv[1] + '</button>';
      }).join('') + '</div></div><canvas id="marketChart" height="250"></canvas>' + chartLegend + '</div>' +
      '<div class="mkt-box"><div class="mkt-box-head"><b>밸류에이션 · 컨센서스</b></div><div class="mkt-vals">' + valHtml + '</div>' +
      (d.corporateOverview ? '<p class="mkt-note">' + esc(String(d.corporateOverview).slice(0, 180)) + (String(d.corporateOverview).length > 180 ? '…' : '') + '</p>' : '') + '</div></div>' +
      '<div class="mkt-two"><div class="mkt-box"><div class="mkt-box-head"><b>실적</b><div class="mkt-range">' +
      '<button data-fin="annual" class="' + (MKT.fin === 'annual' ? 'on' : '') + '">연간</button>' +
      '<button data-fin="quarter" class="' + (MKT.fin === 'quarter' ? 'on' : '') + '">분기</button></div></div>' + finHtml + '</div>' +
      '<div class="mkt-box"><div class="mkt-box-head"><b>' + (d.flows && d.flows.length ? '수급 (최근 5거래일)' : '증권사 리포트') + '</b></div>' +
      (d.flows && d.flows.length ? flowHtml : '') + '<div style="margin-top:10px;display:grid;gap:6px" class="mkt-news">' + researchHtml + '</div></div></div>' +
      '<div class="mkt-box" style="margin-top:13px"><div class="mkt-box-head"><b>관련 뉴스</b><span class="helper">' + (d.news ? d.news.length : 0) + '건</span></div>' + newsHtml + '</div>' +
      '<p class="mkt-note">출처: ' + (srcHtml || '네이버 금융') + ' · 조회 ' + esc(d.fetchedAtKst || d.fetchedAt || '') + ' · 제공처에 없는 항목은 —로 표시하며 추정값을 넣지 않습니다.</p>';

    var rb = $('mktRange');
    if (rb) Array.prototype.forEach.call(rb.querySelectorAll('button'), function (b) {
      b.onclick = function () { loadChart(b.dataset.range); };
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-fin]'), function (b) {
      b.onclick = function () { MKT.fin = b.dataset.fin; render(); };
    });
    if ($('mktRefresh')) $('mktRefresh').onclick = function () { load(MKT.symbol); };
    if ($('mktUse') && typeof global.__focusGoFinance === 'function') $('mktUse').onclick = global.__focusGoFinance;

    drawChart();
    onChange();
  }

  function drawChart() {
    var cv = $('marketChart');
    if (!cv || !cv.clientWidth) return;
    var pts = ((MKT.chart && MKT.chart.points) || []).filter(function (p) { return p.close != null; });
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = cv.clientWidth || 640, h = 250;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    var ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (pts.length < 2) {
      ctx.fillStyle = '#898a9c'; ctx.font = '12px system-ui,sans-serif';
      ctx.fillText('차트 데이터가 없습니다.', 12, 26);
      return;
    }
    var padL = 8, padR = 64, padT = 12, padB = 26, volH = 38;
    var plotW = Math.max(10, w - padL - padR), plotH = Math.max(10, h - padT - padB - volH);
    var lows = pts.map(function (p) { return p.low == null ? p.close : p.low; });
    var highs = pts.map(function (p) { return p.high == null ? p.close : p.high; });
    var rawLo = Math.min.apply(null, lows), rawHi = Math.max.apply(null, highs);
    var pad = (rawHi - rawLo) * 0.08 || 1;
    var lo = rawLo - pad, hi = rawHi + pad;
    var X = function (i) { return padL + (i / (pts.length - 1)) * plotW; };
    var Y = function (v) { return padT + plotH - ((v - lo) / (hi - lo)) * plotH; };
    var maxVol = Math.max.apply(null, pts.map(function (p) { return p.volume || 0; })) || 1;

    ctx.strokeStyle = '#252634'; ctx.lineWidth = 1;
    ctx.font = '10px system-ui,sans-serif'; ctx.fillStyle = '#767789';
    for (var i = 0; i <= 4; i++) {
      var y = padT + (plotH / 4) * i;
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + plotW, y); ctx.stroke();
      var val = hi - ((hi - lo) / 4) * i;
      ctx.fillText(val >= 1000 ? Math.round(val).toLocaleString('ko-KR') : val.toFixed(2), padL + plotW + 6, y + 3);
    }
    var baseY = padT + plotH;
    pts.forEach(function (p, i) {
      var bh = Math.max(1, ((p.volume || 0) / maxVol) * volH);
      var x = X(i);
      ctx.fillStyle = '#3a2b4d';
      ctx.fillRect(x - 1.6, baseY + volH + 6 - bh, 3.2, bh);
    });
    ctx.beginPath();
    pts.forEach(function (p, i) {
      var x = X(i), yy = Y(p.close);
      if (i) ctx.lineTo(x, yy); else ctx.moveTo(x, yy);
    });
    ctx.strokeStyle = '#c14bff'; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.stroke();
    ctx.lineTo(X(pts.length - 1), baseY); ctx.lineTo(X(0), baseY); ctx.closePath();
    var g = ctx.createLinearGradient(0, padT, 0, baseY);
    g.addColorStop(0, 'rgba(193,75,255,.34)'); g.addColorStop(1, 'rgba(193,75,255,0)');
    ctx.fillStyle = g; ctx.fill();
    var last = pts[pts.length - 1];
    var ly = Y(last.close);
    ctx.beginPath(); ctx.arc(X(pts.length - 1), ly, 3, 0, Math.PI * 2); ctx.fillStyle = '#e6b0ff'; ctx.fill();
    ctx.strokeStyle = '#c14bff44'; ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(padL, ly); ctx.lineTo(padL + plotW, ly); ctx.stroke();
    ctx.setLineDash([]);
    var label = last.close >= 1000 ? Math.round(last.close).toLocaleString('ko-KR') : last.close.toFixed(2);
    ctx.fillStyle = '#f2e6ff'; ctx.fillRect(padL + plotW + 2, ly - 8, padR - 4, 16);
    ctx.fillStyle = '#2a0f3d'; ctx.font = 'bold 10px system-ui,sans-serif';
    ctx.fillText(label, padL + plotW + 6, ly + 4);
    ctx.fillStyle = '#767789'; ctx.font = '10px system-ui,sans-serif';
    var ticks = Math.min(5, pts.length);
    for (var t = 0; t < ticks; t++) {
      var idx = Math.round((pts.length - 1) * t / (ticks - 1));
      var tx = X(idx);
      var tt = String(pts[idx].date).slice(2);
      ctx.fillText(tt, t === 0 ? tx : tx - Math.min(22, tt.length * 3), baseY + volH + 22);
    }
  }

  function contextBlock() {
    var d = MKT.data;
    if (!d) return '';
    var q = d.quote || {}, v = d.valuation || {}, cur = q.currency || '';
    var L = [];
    L.push('');
    L.push('[검증된 시장 데이터 — 시세 API에서 방금 조회한 값]');
    L.push('- 조회 시각: ' + (d.fetchedAtKst || d.fetchedAt) + ' / 제공처 기준 시각: ' + (q.tradedAt || '확인 불가') + ' / 장 상태: ' + (q.marketStatusText || '확인 불가') + ' / 지연: ' + (q.delay || '확인 불가'));
    L.push('- 종목: ' + q.name + (q.nameEn ? ' (' + q.nameEn + ')' : '') + ' · 코드 ' + q.reutersCode + ' · ' + (q.market || '') + ' · ' + (q.nation || '') + ' · 통화 ' + cur);
    L.push('- 현재가: ' + fmtPrice(q.price, cur) + ' (전일 ' + fmtPrice(q.prevClose, cur) + ' 대비 ' + (q.change > 0 ? '+' : '') + q.change + ', ' + (q.changePercent > 0 ? '+' : '') + q.changePercent + '%)');
    L.push('- 시가 ' + fmtPrice(q.open, cur) + ' / 고가 ' + fmtPrice(q.high, cur) + ' / 저가 ' + fmtPrice(q.low, cur) +
      ' / 거래량 ' + (q.volume == null ? '확인 불가' : int(q.volume)) +
      ' / 거래대금 ' + (q.tradingValueText || compact(q.tradingValue)) +
      ' / 시가총액 ' + (q.marketCapText || compact(q.marketCap)) +
      ' / 52주 최고·최저 ' + fmtPrice(q.high52w, cur) + '·' + fmtPrice(q.low52w, cur));
    L.push('- 밸류에이션: PER ' + (v.per != null ? v.per + '배' : '확인 불가') + (v.estPer != null ? ' (추정 ' + v.estPer + '배)' : '') +
      ' / PBR ' + (v.pbr != null ? v.pbr + '배' : '확인 불가') +
      ' / EPS ' + (v.eps != null ? v.eps : '확인 불가') +
      ' / BPS ' + (v.bps != null ? v.bps : '확인 불가') +
      ' / 배당수익률 ' + (v.dividendYield != null ? v.dividendYield + '%' : '확인 불가') +
      (v.foreignHoldRatio != null ? ' / 외국인 보유율 ' + v.foreignHoldRatio + '%' : ''));
    if (d.consensus && (d.consensus.targetPrice != null || d.consensus.recommendation != null)) {
      L.push('- 컨센서스: 목표주가 ' + (d.consensus.targetPrice != null ? fmtPrice(d.consensus.targetPrice, cur) : '확인 불가') +
        ' / 투자의견 ' + (d.consensus.recommendation != null ? recoLabel(d.consensus.recommendation) : '확인 불가') +
        ' (기준 ' + (d.consensus.asOf || '확인 불가') + ')');
    }
    var st = chartStats();
    if (st) L.push('- 최근 차트(' + MKT.range + '): ' + st.from + '~' + st.to + ' ' + st.count + '거래일, 기간 등락 ' + (st.changePercent > 0 ? '+' : '') + st.changePercent.toFixed(2) + '%, 구간 최고 ' + fmtPrice(st.high, cur) + ', 구간 최저 ' + fmtPrice(st.low, cur));
    if (d.flows && d.flows.length) {
      L.push('- 최근 수급(순매수 수량):');
      d.flows.forEach(function (f) {
        L.push('  · ' + f.date + ': 외국인 ' + f.foreignNet + ' / 기관 ' + f.institutionNet + ' / 개인 ' + f.individualNet);
      });
    }
    var want = ['매출액', '영업이익', '당기순이익', '영업이익률', '순이익률', '부채비율', 'ROE'];
    ['annual', 'quarter'].forEach(function (kind) {
      var f2 = d.financials && d.financials[kind];
      if (!f2 || !f2.periods || !f2.periods.length) return;
      var periods = f2.periods.slice(-3);
      L.push('- 실적(' + (kind === 'annual' ? '연간' : '분기') + ', 단위 ' + (f2.unit || '제공처 단위') + '), 컬럼 ' + periods.map(function (p) { return p.title + (p.consensus ? '(E)' : ''); }).join(' / '));
      f2.rows.filter(function (r) { return want.indexOf(r.title) !== -1; }).forEach(function (r) {
        L.push('  · ' + r.title + ': ' + periods.map(function (p) { return r.values[p.key] == null ? '-' : r.values[p.key]; }).join(' / '));
      });
    });
    if (d.news && d.news.length) {
      L.push('- 최근 관련 뉴스 헤드라인:');
      d.news.forEach(function (n) { L.push('  · [' + (n.publishedAt || '') + '] ' + n.title + ' (' + (n.office || '') + ')'); });
    }
    L.push('- 출처: ' + (d.sources || []).map(function (s) { return s.name; }).join(', ') + ' (' + (((d.sources || [])[0] || {}).url || '') + ')');
    L.push('- 작성 규칙: 위 값은 실제 조회된 시장 데이터다. 시세·밸류에이션·실적 숫자는 반드시 위 값과 일치해야 하며, 기준 시각과 장 상태(장중/장마감), 출처(네이버 금융)를 함께 표기하라. 위 목록에 없는 수치는 추정하지 말고 별도 출처를 명시하라.');
    L.push('');
    return L.join('\n');
  }

  function init(opts) {
    opts = opts || {};
    stateRef = opts.state || null;
    onChange = opts.onChange || function () {};

    var a = $('marketLoad'), b = $('builderMktLoad'), c = $('marketAuto');
    if (a) a.onclick = function () { load(); };
    if (b) b.onclick = function () { load(); };
    if (c) c.onclick = autoDetect;

    ['marketSymbol', 'builderMktSymbol'].forEach(function (id) {
      var el = $(id);
      if (!el) return;
      el.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); load(); }
      });
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-quick-symbol]'), function (btn) {
      btn.onclick = function () {
        if ($('marketSymbol')) $('marketSymbol').value = btn.dataset.quickSymbol;
        if ($('builderMktSymbol')) $('builderMktSymbol').value = btn.dataset.quickSymbol;
        load(btn.dataset.quickSymbol);
      };
    });

    var url = $('marketApiUrl');
    if (url) url.value = (stateRef && stateRef.marketApi) || '';
    var saveBtn = $('saveMarketApi');
    if (saveBtn) saveBtn.onclick = function () {
      var v = ($('marketApiUrl').value || '').trim().replace(/\/+$/, '');
      if (stateRef) stateRef.marketApi = v;
      if (typeof global.__focusSaveState === 'function') global.__focusSaveState();
      if (url) url.value = v;
      var el = $('marketApiResult');
      if (el) el.textContent = '주소를 저장했습니다: ' + apiUrl();
      test(true);
      toast('시세 API 주소를 저장했습니다.');
    };
    var resetBtn = $('resetMarketApi');
    if (resetBtn) resetBtn.onclick = function () {
      if (stateRef) stateRef.marketApi = '';
      if (typeof global.__focusSaveState === 'function') global.__focusSaveState();
      if (url) url.value = '';
      var el = $('marketApiResult');
      if (el) el.textContent = '기본 주소로 되돌렸습니다: ' + apiUrl();
      test(true);
      toast('기본 시세 API 주소로 되돌렸습니다.');
    };
    var testBtn = $('testMarketApi');
    if (testBtn) testBtn.onclick = function () { test(false); };

    setPill('ready', 'READY');
    test(true);
    if (stateRef && stateRef.marketSymbol && $('marketSymbol')) $('marketSymbol').value = stateRef.marketSymbol;
    if (stateRef && stateRef.marketSymbol && $('builderMktSymbol')) $('builderMktSymbol').value = stateRef.marketSymbol;
  }

  async function autoDetect() {
    var src = $('marketSymbol') || $('builderMktSymbol');
    var topic = '';
    ['promptFocus', 'businessTopic', 'codingTopic', 'financeTopic', 'studyTopic', 'marketingProduct', 'writingTopic', 'metaOneLine', 'visualScene'].forEach(function (id) {
      var el = $(id);
      if (el && el.value && el.value.trim()) topic = el.value.trim();
    });
    if (!topic) { toast('먼저 주제를 입력해 주세요.'); return; }
    setPill('ready', 'DETECTING');
    try {
      var words = topic.split(/[\s,.·/|()[\]{}'"“”‘’…!:;]+/).map(function (w) { return w.trim(); }).filter(function (w) { return w.length >= 2; });
      var cands = [topic].concat(words.sort(function (a, b) { return b.length - a.length; })).filter(function (x, i, arr) { return arr.indexOf(x) === i; });
      var hit = null;
      for (var i = 0; i < Math.min(cands.length, 6); i++) {
        var items = [];
        try {
          var j = await fetchJson('/api/search?q=' + encodeURIComponent(cands[i]));
          items = j.items || [];
        } catch (e) { items = []; }
        if (!items.length) continue;
        hit = items.filter(function (it) { return topic.indexOf(it.name) !== -1; })[0] || items[0];
        if (hit) break;
      }
      if (!hit) throw new Error('주제에서 종목을 찾지 못했습니다. 종목명을 직접 입력해 주세요.');
      if (src) src.value = hit.symbolCode || hit.code;
      await load(hit.symbolCode || hit.code);
    } catch (e) {
      setPill('error', 'ERROR');
      toast(e.message.slice(0, 120));
    }
  }

  global.FocusMarket = {
    init: init,
    load: load,
    loadChart: loadChart,
    redraw: drawChart,
    hasData: function () { return !!(MKT.data && MKT.data.quote); },
    contextBlock: contextBlock,
    symbol: function () { return MKT.symbol; },
    apiUrl: apiUrl,
    unit: function () { return MKT; }
  };
})(window);
