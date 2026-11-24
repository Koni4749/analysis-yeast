/**
 * 외부 라이브러리 의존성 없는 고해상도 Canvas 그래프 렌더러 & PPT용 PNG 저장 모듈
 */

(function (global) {
  'use strict';

  const FONT_FAMILY = "'IBM Plex Sans KR', 'Pretendard', 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif";

  function niceStep(range, targetTicks) {
    if (range <= 0) return 1;
    const rough = range / targetTicks;
    const exp = Math.floor(Math.log10(rough));
    const base = Math.pow(10, exp);
    const frac = rough / base;
    let nice;
    if (frac <= 1.2) nice = 1;
    else if (frac <= 2.2) nice = 2;
    else if (frac <= 2.8) nice = 2.5;
    else if (frac <= 5.5) nice = 5;
    else nice = 10;
    return nice * base;
  }

  function computeYAxis(domain, seriesList) {
    let minVal = Infinity;
    let maxVal = -Infinity;
    for (const s of seriesList) {
      for (const p of s.points) {
        if (p.y < minVal) minVal = p.y;
        if (p.y > maxVal) maxVal = p.y;
      }
    }

    if (!Number.isFinite(minVal) || !Number.isFinite(maxVal)) {
      return domain === 'gas'
        ? { min: 0, max: 800, step: 200 }
        : { min: 3.5, max: 7.5, step: 0.5 };
    }

    if (domain === 'gas') {
      const topRaw = Math.max(maxVal * 1.12, 100);
      const step = niceStep(topRaw, 5);
      const max = Math.ceil(topRaw / step) * step;
      const min = minVal < 0 ? Math.floor((minVal * 1.1) / step) * step : 0;
      return { min, max, step };
    }

    const pad = Math.max((maxVal - minVal) * 0.16, 0.35);
    const rawMin = Math.max(0, minVal - pad);
    const rawMax = Math.min(14, maxVal + pad);
    const step = niceStep(rawMax - rawMin, 5);
    const min = Math.floor(rawMin / step) * step;
    const max = Math.ceil(rawMax / step) * step;
    return { min, max, step };
  }

  function drawChart(ctx, width, height, config) {
    const {
      domain,
      title,
      subtitle,
      yAxisLabel,
      unit,
      digits,
      teamSeries,
      controlSeries,
      formulaLine,
      hoverHour,
      exportMode,
    } = config;

    const scale = exportMode ? width / 1200 : 1;
    const isNarrow = !exportMode && width < 520;
    const leftPad = exportMode ? 82 * scale : 64;
    const rightPad = exportMode ? 48 * scale : 16;

    const legendLeftX = exportMode ? leftPad : (isNarrow ? 8 : leftPad);
    const legendRightX = width - rightPad;
    const teamColor = domain === 'gas' ? '#004b9b' : '#0f766e';
    const legendLayout = layoutLegend(ctx, {
      leftX: legendLeftX,
      rightX: legendRightX,
      teamLabel: teamSeries.label,
      controlLabel: controlSeries.label,
      teamColor,
      scale: exportMode ? scale : 1,
    });

    const dynamicTopPad = exportMode
      ? 112 * scale
      : Math.max(40, 6 + legendLayout.totalHeight + 12);

    const pad = {
      top: dynamicTopPad,
      right: rightPad,
      bottom: exportMode ? 94 * scale : 48,
      left: leftPad,
    };

    const plotW = Math.max(120, width - pad.left - pad.right);
    const plotH = Math.max(120, height - pad.top - pad.bottom);

    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    const yAxis = computeYAxis(domain, [teamSeries, controlSeries]);
    const xToPx = (t) => pad.left + (t / 12) * plotW;
    const yToPx = (y) => pad.top + ((yAxis.max - y) / (yAxis.max - yAxis.min)) * plotH;

    // PPT용 PNG 상단 제목 (긴 다중 약물명도 잘리지 않도록 폭 자동 맞춤)
    if (exportMode) {
      drawFittedText(ctx, title, pad.left, 24 * scale, plotW, {
        weight: 700,
        baseSize: 23 * scale,
        minSize: 14.5 * scale,
        color: '#141920',
        align: 'left',
        baseline: 'top',
      });

      drawFittedText(ctx, subtitle, pad.left, 56 * scale, plotW, {
        weight: 500,
        baseSize: 14 * scale,
        minSize: 11 * scale,
        color: '#475569',
        align: 'left',
        baseline: 'top',
      });
    }

    // 가로 눈금선 + Y축 눈금
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.font = `500 ${(exportMode ? 13 * scale : 12)}px ${FONT_FAMILY}`;

    const tickCount = Math.round((yAxis.max - yAxis.min) / yAxis.step);
    for (let i = 0; i <= tickCount; i += 1) {
      const val = yAxis.min + i * yAxis.step;
      const py = yToPx(val);
      ctx.beginPath();
      ctx.moveTo(pad.left, py);
      ctx.lineTo(pad.left + plotW, py);
      ctx.strokeStyle = i === 0 ? '#94a3b8' : '#eaeff5';
      ctx.lineWidth = (i === 0 ? 1.2 : 1) * (exportMode ? scale : 1);
      ctx.stroke();

      ctx.fillStyle = '#475569';
      const label = domain === 'gas' ? `${Math.round(val)}` : val.toFixed(1);
      ctx.fillText(label, pad.left - (10 * (exportMode ? scale : 1)), py);
    }

    // 세로 눈금선 + X축 눈금
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let h = 0; h <= 12; h += 1) {
      const px = xToPx(h);
      const isMajor = h % 2 === 0;
      ctx.beginPath();
      ctx.moveTo(px, pad.top);
      ctx.lineTo(px, pad.top + plotH);
      ctx.strokeStyle = isMajor ? '#eaeff5' : '#f4f7fa';
      ctx.lineWidth = (isMajor ? 1 : 0.7) * (exportMode ? scale : 1);
      ctx.stroke();

      if (isMajor) {
        ctx.fillStyle = '#475569';
        ctx.fillText(`${h}h`, px, pad.top + plotH + (8 * (exportMode ? scale : 1)));
      }
    }

    // 축선 (좌측 · 하단)
    ctx.beginPath();
    ctx.moveTo(pad.left, pad.top);
    ctx.lineTo(pad.left, pad.top + plotH);
    ctx.lineTo(pad.left + plotW, pad.top + plotH);
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 1.3 * (exportMode ? scale : 1);
    ctx.stroke();

    // 축 제목
    ctx.fillStyle = '#334155';
    ctx.font = `600 ${(exportMode ? 13.5 * scale : 12)}px ${FONT_FAMILY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('배양 경과 시간 (h)', pad.left + plotW / 2, pad.top + plotH + (exportMode ? 44 * scale : 42));

    ctx.save();
    ctx.translate(exportMode ? 22 * scale : 10, pad.top + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(yAxisLabel, 0, 0);
    ctx.restore();

    // 호버 가이드선
    if (!exportMode && hoverHour !== null && hoverHour >= 0 && hoverHour <= 12) {
      const hx = xToPx(hoverHour);
      ctx.beginPath();
      ctx.moveTo(hx, pad.top);
      ctx.lineTo(hx, pad.top + plotH);
      ctx.strokeStyle = 'rgba(0, 75, 155, 0.25)';
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 1) 공통 무처리군 곡선 (회색 점선)
    drawSeriesCurve(ctx, controlSeries, xToPx, yToPx, {
      color: '#5b6878',
      lineWidth: 2.2 * (exportMode ? scale : 1),
      dash: [7 * (exportMode ? scale : 1), 5 * (exportMode ? scale : 1)],
      markerRadius: 5 * (exportMode ? scale : 1),
      hollowMarker: true,
      exportMode,
      scale,
    });

    // 2) 우리 조 곡선 (진한 실선)
    drawSeriesCurve(ctx, teamSeries, xToPx, yToPx, {
      color: teamColor,
      lineWidth: 2.9 * (exportMode ? scale : 1),
      dash: [],
      markerRadius: 5.5 * (exportMode ? scale : 1),
      hollowMarker: false,
      exportMode,
      scale,
    });

    // 12h 끝점 값 라벨 (겹침 및 경계 이탈 방지)
    const teamEnd = teamSeries.points[teamSeries.points.length - 1];
    const ctrlEnd = controlSeries.points[controlSeries.points.length - 1];
    const s = exportMode ? scale : 1;
    const minYBound = pad.top + 14 * s;
    const maxYBound = pad.top + plotH - 14 * s;
    const clampY = (y) => Math.max(minYBound, Math.min(maxYBound, y));

    let yTeamEndPx = clampY(yToPx(teamEnd.y));
    let yCtrlEndPx = clampY(yToPx(ctrlEnd.y));
    const minGap = 22 * s;
    if (Math.abs(yTeamEndPx - yCtrlEndPx) < minGap) {
      if (yTeamEndPx <= yCtrlEndPx) {
        yTeamEndPx = clampY(yTeamEndPx - minGap / 2);
        yCtrlEndPx = clampY(yTeamEndPx + minGap);
      } else {
        yCtrlEndPx = clampY(yCtrlEndPx - minGap / 2);
        yTeamEndPx = clampY(yCtrlEndPx + minGap);
      }
    }

    drawEndLabel(
      ctx,
      xToPx(12) - 10 * s,
      yCtrlEndPx,
      `무처리 ${ctrlEnd.y.toFixed(digits)}${unit}`,
      '#475569',
      s
    );
    drawEndLabel(
      ctx,
      xToPx(12) - 10 * s,
      yTeamEndPx,
      `우리 조 ${teamEnd.y.toFixed(digits)}${unit}`,
      teamColor,
      s
    );

    // 호버 강조 점
    if (!exportMode && hoverHour !== null) {
      const hTeam = teamSeries.hourly[hoverHour];
      const hCtrl = controlSeries.hourly[hoverHour];
      if (hCtrl) {
        ctx.beginPath();
        ctx.arc(xToPx(hoverHour), yToPx(hCtrl.value), 4.5, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.strokeStyle = '#475569';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      if (hTeam) {
        ctx.beginPath();
        ctx.arc(xToPx(hoverHour), yToPx(hTeam.value), 5, 0, Math.PI * 2);
        ctx.fillStyle = teamColor;
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }

    // 범례
    drawLegend(ctx, legendLayout, exportMode ? 84 * scale : 6, teamColor, exportMode ? scale : 1);

    // PPT용 PNG 하단 수식 및 출처 (서로 겹치지 않도록 최대 폭 계산)
    if (exportMode) {
      const footerY = height - 32 * scale;
      const rightLabel = '인천대학교 수학교육과 · 효모–유산균 항종양 모사 실험';
      ctx.font = `500 ${12.5 * scale}px ${FONT_FAMILY}`;
      const rightW = ctx.measureText(rightLabel).width;
      const leftMaxW = Math.max(200 * scale, plotW - rightW - 24 * scale);

      drawFittedText(ctx, formulaLine, pad.left, footerY, leftMaxW, {
        weight: 500,
        baseSize: 12.5 * scale,
        minSize: 10 * scale,
        color: '#334155',
        align: 'left',
        baseline: 'middle',
      });

      ctx.fillStyle = '#64748b';
      ctx.font = `500 ${12.5 * scale}px ${FONT_FAMILY}`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(rightLabel, pad.left + plotW, footerY);
    }

    ctx.restore();
    return { pad, plotW, plotH, yAxis };
  }

  function drawFittedText(ctx, text, x, y, maxWidth, opts) {
    const { weight, baseSize, minSize, color, align, baseline } = opts;
    ctx.save();
    let size = baseSize;
    ctx.font = `${weight} ${size}px ${FONT_FAMILY}`;
    const measured = ctx.measureText(text).width;
    if (measured > maxWidth && measured > 0) {
      size = Math.max(minSize, baseSize * (maxWidth / measured));
      ctx.font = `${weight} ${size}px ${FONT_FAMILY}`;
    }
    ctx.fillStyle = color;
    ctx.textAlign = align || 'left';
    ctx.textBaseline = baseline || 'top';
    ctx.fillText(text, x, y, maxWidth);
    ctx.restore();
  }

  function drawSeriesCurve(ctx, series, xToPx, yToPx, style) {
    const pts = series.points;
    if (!pts.length) return;

    ctx.save();
    ctx.beginPath();
    pts.forEach((p, idx) => {
      const x = xToPx(p.t);
      const y = yToPx(p.y);
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = style.color;
    ctx.lineWidth = style.lineWidth;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.setLineDash(style.dash);
    ctx.stroke();
    ctx.setLineDash([]);

    const endpoints = [pts[0], pts[pts.length - 1]];
    for (const ep of endpoints) {
      const cx = xToPx(ep.t);
      const cy = yToPx(ep.y);
      ctx.beginPath();
      ctx.arc(cx, cy, style.markerRadius, 0, Math.PI * 2);
      if (style.hollowMarker) {
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.strokeStyle = style.color;
        ctx.lineWidth = 2.2 * (style.exportMode ? style.scale : 1);
        ctx.stroke();
      } else {
        ctx.fillStyle = style.color;
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2 * (style.exportMode ? style.scale : 1);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawEndLabel(ctx, xRight, yMid, text, textColor, scale) {
    ctx.save();
    ctx.font = `600 ${11.5 * scale}px ${FONT_FAMILY}`;
    const tw = ctx.measureText(text).width;
    const ph = 19 * scale;
    const px = 6 * scale;
    const boxW = tw + px * 2;
    const x = xRight - boxW;
    const y = yMid - ph / 2;

    ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
    ctx.fillRect(x, y, boxW, ph);
    ctx.strokeStyle = '#dbe2ea';
    ctx.lineWidth = 1 * scale;
    ctx.strokeRect(x, y, boxW, ph);

    ctx.fillStyle = textColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + boxW / 2, yMid + 0.5 * scale);
    ctx.restore();
  }

  function layoutLegend(ctx, opts) {
    const { leftX, rightX, teamLabel, controlLabel, teamColor, scale } = opts;
    ctx.save();
    const availW = Math.max(160, rightX - leftX);
    const fontSize = (availW < 380 ? 11 : 12) * scale;
    ctx.font = `600 ${fontSize}px ${FONT_FAMILY}`;

    const items = [
      { label: teamLabel, color: teamColor, dashed: false },
      { label: controlLabel, color: '#5b6878', dashed: true },
      { label: '0h·12h 측정값', color: '#1b2129', markerOnly: true },
    ];

    const gap = 14 * scale;
    const lineLen = 18 * scale;
    const itemWidths = items.map(
      (it) => (it.markerOnly ? 14 * scale : lineLen) + 6 * scale + ctx.measureText(it.label).width
    );

    const rows = [];
    let currentRow = [];
    let currentW = 0;
    items.forEach((it, idx) => {
      const w = itemWidths[idx];
      const addW = currentRow.length ? gap + w : w;
      if (currentRow.length && currentW + addW > availW) {
        rows.push({ items: currentRow, width: currentW });
        currentRow = [{ it, w }];
        currentW = w;
      } else {
        currentRow.push({ it, w });
        currentW += addW;
      }
    });
    if (currentRow.length) {
      rows.push({ items: currentRow, width: currentW });
    }
    ctx.restore();

    const rowHeight = 19 * scale;
    return {
      leftX,
      rightX,
      fontSize,
      gap,
      lineLen,
      rowHeight,
      rows,
      totalHeight: rows.length * rowHeight,
    };
  }

  function drawLegend(ctx, layout, topY, teamColor, scale) {
    ctx.save();
    ctx.font = `600 ${layout.fontSize}px ${FONT_FAMILY}`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';

    layout.rows.forEach((row, rIdx) => {
      const y = topY + layout.rowHeight / 2 + rIdx * layout.rowHeight;
      let cursorX = layout.rows.length === 1 ? Math.max(layout.leftX, layout.rightX - row.width) : layout.leftX;

      row.items.forEach(({ it, w }) => {
        if (it.markerOnly) {
          ctx.beginPath();
          ctx.arc(cursorX + 6 * scale, y, 4 * scale, 0, Math.PI * 2);
          ctx.fillStyle = teamColor;
          ctx.fill();
          ctx.fillStyle = '#475569';
          ctx.fillText(it.label, cursorX + 15 * scale, y);
        } else {
          ctx.beginPath();
          ctx.moveTo(cursorX, y);
          ctx.lineTo(cursorX + layout.lineLen, y);
          ctx.strokeStyle = it.color;
          ctx.lineWidth = (it.dashed ? 2.2 : 2.8) * scale;
          ctx.setLineDash(it.dashed ? [5 * scale, 3.5 * scale] : []);
          ctx.stroke();
          ctx.setLineDash([]);

          ctx.fillStyle = '#1b2129';
          ctx.fillText(it.label, cursorX + layout.lineLen + 6 * scale, y);
        }
        cursorX += w + layout.gap;
      });
    });
    ctx.restore();
  }

  class InteractiveChart {
    constructor(canvas, tooltipEl) {
      this.canvas = canvas;
      this.tooltipEl = tooltipEl;
      this.config = null;
      this.layout = null;
      this.hoverHour = null;
      this._bindEvents();
    }

    _bindEvents() {
      const handlePointer = (clientX) => {
        if (!this.config || !this.layout) return;
        const rect = this.canvas.getBoundingClientRect();
        const x = clientX - rect.left;
        const { pad, plotW } = this.layout;
        if (x < pad.left - 8 || x > pad.left + plotW + 8) {
          this._clearHover();
          return;
        }
        const ratio = Math.max(0, Math.min(1, (x - pad.left) / plotW));
        const hour = Math.round(ratio * 12);
        if (hour !== this.hoverHour) {
          this.hoverHour = hour;
          this.render();
        }
        this._updateTooltip(hour, pad.left + (hour / 12) * plotW, rect.width);
      };

      this.canvas.addEventListener('mousemove', (e) => handlePointer(e.clientX));
      this.canvas.addEventListener('mouseleave', () => this._clearHover());
      this.canvas.addEventListener(
        'touchstart',
        (e) => {
          if (e.touches && e.touches[0]) handlePointer(e.touches[0].clientX);
        },
        { passive: true }
      );
      this.canvas.addEventListener(
        'touchmove',
        (e) => {
          if (e.touches && e.touches[0]) handlePointer(e.touches[0].clientX);
        },
        { passive: true }
      );
    }

    _clearHover() {
      if (this.hoverHour !== null) {
        this.hoverHour = null;
        this.render();
      }
      if (this.tooltipEl) {
        this.tooltipEl.hidden = true;
      }
    }

    _updateTooltip(hour, anchorX, containerW) {
      if (!this.tooltipEl || !this.config) return;
      const tRow = this.config.teamSeries.hourly[hour];
      const cRow = this.config.controlSeries.hourly[hour];
      const { digits, unit, domain } = this.config;
      const badge = tRow.isMeasured ? '측정값' : '모델값';

      const diff = tRow.value - cRow.value;
      const sign = diff >= 0 ? '+' : '−';
      const extra =
        domain === 'gas'
          ? `무처리 대비 ${sign}${Math.abs(diff).toFixed(digits)}${unit}`
          : `무처리 대비 ${sign}${Math.abs(diff).toFixed(digits)} pH`;

      this.tooltipEl.innerHTML =
        `<div class="tt-head"><strong>${hour}시간</strong> <span class="tt-tag ${tRow.isMeasured ? 'measured' : ''}">${badge}</span></div>` +
        `<div class="tt-row"><span class="tt-dot ${domain}"></span><span>우리 조</span><strong>${tRow.value.toFixed(digits)}${unit}</strong></div>` +
        `<div class="tt-row"><span class="tt-dot ctrl"></span><span>무처리군</span><strong>${cRow.value.toFixed(digits)}${unit}</strong></div>` +
        `<div class="tt-sub">${extra}</div>`;

      this.tooltipEl.hidden = false;
      const ttW = this.tooltipEl.offsetWidth || 168;
      let left = anchorX + 14;
      if (left + ttW > containerW - 8) {
        left = Math.max(8, anchorX - ttW - 14);
      }
      this.tooltipEl.style.left = `${left}px`;
    }

    setConfig(config) {
      this.config = config;
      this.render();
    }

    render() {
      if (!this.config) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cssW = Math.max(290, Math.floor(this.canvas.parentElement.clientWidth));
      const cssH = cssW < 520 ? 290 : 340;

      this.canvas.width = Math.floor(cssW * dpr);
      this.canvas.height = Math.floor(cssH * dpr);
      this.canvas.style.width = `${cssW}px`;
      this.canvas.style.height = `${cssH}px`;

      const ctx = this.canvas.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.layout = drawChart(ctx, cssW, cssH, {
        ...this.config,
        hoverHour: this.hoverHour,
        exportMode: false,
      });
    }

    exportPng(filename) {
      if (!this.config) return;
      const exportW = 2400;
      const exportH = 1350;
      const offscreen = document.createElement('canvas');
      offscreen.width = exportW;
      offscreen.height = exportH;
      const ctx = offscreen.getContext('2d');

      drawChart(ctx, exportW, exportH, {
        ...this.config,
        hoverHour: null,
        exportMode: true,
      });

      const link = document.createElement('a');
      link.download = filename;
      link.href = offscreen.toDataURL('image/png');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  }

  global.ANALYSIS_CHART = {
    InteractiveChart,
    drawChart,
  };
})(window);
