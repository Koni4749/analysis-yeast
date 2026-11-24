/**
 * 12시간 수리모델링 분석기 상태 관리 및 인터랙션 컨트롤러
 */

(function () {
  'use strict';

  const CFG = window.ANALYSIS_CONFIG;
  const MODELS = window.ANALYSIS_MODELS;
  const CHART = window.ANALYSIS_CHART;

  const STORAGE_KEY = 'hyomo_analysis_v2';
  const LEGACY_STORAGE_KEY = 'sinsong_hyomo_analysis_v1';

  const $ = (id) => document.getElementById(id);

  const el = {
    saveIndicator: $('saveIndicator'),
    btnResetTeam: $('btnResetTeam'),

    inputTeamName: $('inputTeamName'),
    inputMemberNames: $('inputMemberNames'),
    drugList: $('drugList'),
    btnAddDrug: $('btnAddDrug'),

    inputGasStart: $('inputGasStart'),
    inputGasEnd: $('inputGasEnd'),
    inputPhStart: $('inputPhStart'),
    inputPhEnd: $('inputPhEnd'),

    calcGasDelta: $('calcGasDelta'),
    calcPhDelta: $('calcPhDelta'),
    gasAlert: $('gasAlert'),
    phAlert: $('phAlert'),

    controlStatusNote: $('controlStatusNote'),
    ctrlGasSummary: $('ctrlGasSummary'),
    ctrlPhSummary: $('ctrlPhSummary'),
    ctrlBasisText: $('ctrlBasisText'),
    ctrlGasStart: $('ctrlGasStart'),
    ctrlGasEnd: $('ctrlGasEnd'),
    ctrlPhStart: $('ctrlPhStart'),
    ctrlPhEnd: $('ctrlPhEnd'),
    btnResetControl: $('btnResetControl'),

    kpiGasDelta: $('kpiGasDelta'),
    kpiGasRange: $('kpiGasRange'),
    kpiGasRatio: $('kpiGasRatio'),
    kpiGasRatioSub: $('kpiGasRatioSub'),
    kpiPhDelta: $('kpiPhDelta'),
    kpiPhRange: $('kpiPhRange'),
    kpiPhCompare: $('kpiPhCompare'),
    kpiPhCompareSub: $('kpiPhCompareSub'),

    gasCoreTabs: $('gasCoreTabs'),
    gasExtraTabs: $('gasExtraTabs'),
    phCoreTabs: $('phCoreTabs'),
    phExtraTabs: $('phExtraTabs'),

    gasCanvas: $('gasCanvas'),
    gasTooltip: $('gasTooltip'),
    phCanvas: $('phCanvas'),
    phTooltip: $('phTooltip'),

    gasFormulaName: $('gasFormulaName'),
    gasFormulaSubstituted: $('gasFormulaSubstituted'),
    gasFormulaGeneral: $('gasFormulaGeneral'),
    gasFormulaConstants: $('gasFormulaConstants'),
    gasFormulaNote: $('gasFormulaNote'),
    phFormulaName: $('phFormulaName'),
    phFormulaSubstituted: $('phFormulaSubstituted'),
    phFormulaGeneral: $('phFormulaGeneral'),
    phFormulaConstants: $('phFormulaConstants'),
    phFormulaNote: $('phFormulaNote'),

    gasTable: $('gasTable'),
    phTable: $('phTable'),

    btnExportGasPng: $('btnExportGasPng'),
    btnExportPhPng: $('btnExportPhPng'),
    btnSyncPhModel: $('btnSyncPhModel'),
    btnCopyGasFormula: $('btnCopyGasFormula'),
    btnCopyPhFormula: $('btnCopyPhFormula'),
    btnCopyGasTable: $('btnCopyGasTable'),
    btnCopyPhTable: $('btnCopyPhTable'),

    toast: $('toast'),
  };

  function cloneDefaultTeam() {
    return {
      ...CFG.DEFAULT_TEAM_INPUT,
      drugs: CFG.DEFAULT_TEAM_INPUT.drugs.map((d) => ({ ...d })),
    };
  }

  function defaultState() {
    return {
      team: cloneDefaultTeam(),
      control: {
        gasStart: CFG.CONTROL_BASELINE.gasStart,
        gasEnd: CFG.CONTROL_BASELINE.gasEnd,
        phStart: CFG.CONTROL_BASELINE.phStart,
        phEnd: CFG.CONTROL_BASELINE.phEnd,
      },
    };
  }

  function normalizeDrugs(drugs, legacyName, legacyConc) {
    if (Array.isArray(drugs) && drugs.length > 0) {
      return drugs.map((d) => ({
        name: typeof d.name === 'string' ? d.name : '',
        concentration: typeof d.concentration === 'string' ? d.concentration : '',
      }));
    }
    if (legacyName || legacyConc) {
      return [{ name: legacyName || '', concentration: legacyConc || '' }];
    }
    return [{ name: '', concentration: '' }];
  }

  function loadState() {
    const fallback = defaultState();
    try {
      const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      const savedTeam = parsed.team || {};
      return {
        team: {
          ...fallback.team,
          ...savedTeam,
          drugs: normalizeDrugs(savedTeam.drugs, savedTeam.drugName, savedTeam.concentration),
        },
        control: { ...fallback.control, ...(parsed.control || {}) },
      };
    } catch (_) {
      return fallback;
    }
  }

  let state = loadState();
  let toastTimer = null;
  let lastComputed = null;

  const gasChart = new CHART.InteractiveChart(el.gasCanvas, el.gasTooltip);
  const phChart = new CHART.InteractiveChart(el.phCanvas, el.phTooltip);

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      const now = new Date();
      const hh = String(now.getHours()).padStart(2, '0');
      const mm = String(now.getMinutes()).padStart(2, '0');
      el.saveIndicator.textContent = `저장됨 ${hh}:${mm}`;
    } catch (_) {
      el.saveIndicator.textContent = '';
    }
  }

  function showToast(message) {
    el.toast.textContent = message;
    el.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.toast.hidden = true;
    }, 2400);
  }

  function numOrFallback(raw, fallback) {
    const v = parseFloat(raw);
    return Number.isFinite(v) ? v : fallback;
  }

  function isControlModified() {
    const b = CFG.CONTROL_BASELINE;
    const c = state.control;
    return (
      Math.abs(c.gasStart - b.gasStart) > 1e-6 ||
      Math.abs(c.gasEnd - b.gasEnd) > 1e-6 ||
      Math.abs(c.phStart - b.phStart) > 1e-6 ||
      Math.abs(c.phEnd - b.phEnd) > 1e-6
    );
  }

  function renderDrugRows() {
    const drugs = state.team.drugs;
    const isSingle = drugs.length <= 1;
    el.drugList.innerHTML = '';

    drugs.forEach((drug, idx) => {
      const row = document.createElement('div');
      row.className = isSingle ? 'drug-row single' : 'drug-row';

      const nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.value = drug.name;
      nameInput.placeholder = idx === 0 ? '예: 구강청결제 등' : `약물 ${idx + 1}`;
      nameInput.maxLength = 36;
      nameInput.setAttribute('aria-label', `사용한 약물 ${idx + 1}`);
      nameInput.addEventListener('input', (e) => {
        state.team.drugs[idx].name = e.target.value;
        saveState();
        updateAll();
      });

      const concInput = document.createElement('input');
      concInput.type = 'text';
      concInput.value = drug.concentration;
      concInput.placeholder = '농도 (예: 20%)';
      concInput.maxLength = 20;
      concInput.setAttribute('aria-label', `약물 ${idx + 1} 농도`);
      concInput.addEventListener('input', (e) => {
        state.team.drugs[idx].concentration = e.target.value;
        saveState();
        updateAll();
      });

      row.appendChild(nameInput);
      row.appendChild(concInput);

      if (!isSingle) {
        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'btn-remove-drug';
        removeBtn.textContent = '×';
        removeBtn.title = '이 약물 삭제';
        removeBtn.setAttribute('aria-label', `약물 ${idx + 1} 삭제`);
        removeBtn.addEventListener('click', () => {
          state.team.drugs.splice(idx, 1);
          renderDrugRows();
          saveState();
          updateAll();
        });
        row.appendChild(removeBtn);
      }

      el.drugList.appendChild(row);
    });
  }

  function syncInputsFromState() {
    el.inputTeamName.value = state.team.teamName;
    el.inputMemberNames.value = state.team.memberNames;
    renderDrugRows();

    el.inputGasStart.value = state.team.gasStart;
    el.inputGasStart.dataset.preEdit = String(state.team.gasStart);
    el.inputGasEnd.value = state.team.gasEnd;
    el.inputGasEnd.dataset.preEdit = String(state.team.gasEnd);
    el.inputPhStart.value = state.team.phStart;
    el.inputPhStart.dataset.preEdit = String(state.team.phStart);
    el.inputPhEnd.value = state.team.phEnd;
    el.inputPhEnd.dataset.preEdit = String(state.team.phEnd);

    el.ctrlGasStart.value = state.control.gasStart;
    el.ctrlGasStart.dataset.preEdit = String(state.control.gasStart);
    el.ctrlGasEnd.value = state.control.gasEnd;
    el.ctrlGasEnd.dataset.preEdit = String(state.control.gasEnd);
    el.ctrlPhStart.value = state.control.phStart;
    el.ctrlPhStart.dataset.preEdit = String(state.control.phStart);
    el.ctrlPhEnd.value = state.control.phEnd;
    el.ctrlPhEnd.dataset.preEdit = String(state.control.phEnd);
    el.ctrlBasisText.textContent = CFG.CONTROL_BASELINE.basisSummary;
  }

  function buildModelTabs() {
    const domains = [
      { domain: 'gas', core: el.gasCoreTabs, extra: el.gasExtraTabs },
      { domain: 'ph', core: el.phCoreTabs, extra: el.phExtraTabs },
    ];

    for (const { domain, core, extra } of domains) {
      core.innerHTML = '';
      extra.innerHTML = '';
      for (const m of MODELS.MODEL_CATALOG) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `seg-btn ${domain}`;
        btn.dataset.modelId = m.id;
        btn.dataset.domain = domain;
        btn.textContent = m.name;
        btn.title = m.shortDesc;
        btn.setAttribute('role', 'radio');
        btn.addEventListener('click', () => {
          if (domain === 'gas') state.team.gasModel = m.id;
          else state.team.phModel = m.id;
          saveState();
          updateAll();
        });
        (m.group === 'core' ? core : extra).appendChild(btn);
      }
    }
  }

  function updateTabStates() {
    document.querySelectorAll('.seg-btn').forEach((btn) => {
      const domain = btn.dataset.domain;
      const selected = domain === 'gas' ? state.team.gasModel : state.team.phModel;
      const isActive = btn.dataset.modelId === selected;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-checked', String(isActive));
    });
  }

  function formatDrugsSummary() {
    return state.team.drugs
      .map((d) => [d.name.trim(), d.concentration.trim()].filter(Boolean).join(' '))
      .filter(Boolean)
      .join(' + ');
  }

  function getTeamDisplayPrefix() {
    const parts = [];
    if (state.team.teamName.trim()) parts.push(state.team.teamName.trim());
    const drugSummary = formatDrugsSummary();
    if (drugSummary) parts.push(drugSummary);
    return parts.length ? parts.join(' · ') : '우리 조';
  }

  function getMemberPrefixForSubtitle() {
    const members = state.team.memberNames.trim();
    return members ? `${members}  |  ` : '';
  }

  function sanitizeFilenamePart(str) {
    return (str || '')
      .trim()
      .replace(/[\\/:*?"<>|·+\s]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');
  }

  function validateInputs() {
    const t = state.team;
    const gasDeltaRaw = t.gasEnd - t.gasStart;
    let gasMsg = '';
    let gasLevel = 'error';

    el.inputGasStart.classList.remove('invalid');
    el.inputGasEnd.classList.remove('invalid');
    el.inputPhStart.classList.remove('invalid');
    el.inputPhEnd.classList.remove('invalid');

    if (t.gasStart < 0 || t.gasEnd < 0) {
      gasMsg = '기체 눈금은 0 mL 이상이어야 합니다.';
      if (t.gasStart < 0) el.inputGasStart.classList.add('invalid');
      if (t.gasEnd < 0) el.inputGasEnd.classList.add('invalid');
    } else if (gasDeltaRaw < 0) {
      gasMsg = '최종 눈금(V₁₂)이 시작 눈금(V₀)보다 작습니다. 누적 부피는 0 mL로 표시됩니다.';
      el.inputGasEnd.classList.add('invalid');
    } else if (t.gasEnd > CFG.CONTROL_BASELINE.maxCylinderVolume) {
      gasMsg = '1 L(1000 mL) 메스실린더 최대 눈금을 초과했습니다.';
      gasLevel = 'warn';
    }

    el.gasAlert.hidden = !gasMsg;
    el.gasAlert.textContent = gasMsg;
    el.gasAlert.classList.toggle('warn', gasLevel === 'warn');

    let phMsg = '';
    let phLevel = 'error';
    if (t.phStart < 0 || t.phStart > 14 || t.phEnd < 0 || t.phEnd > 14) {
      phMsg = 'pH 값은 0.00 ~ 14.00 범위로 입력해 주세요.';
      if (t.phStart < 0 || t.phStart > 14) el.inputPhStart.classList.add('invalid');
      if (t.phEnd < 0 || t.phEnd > 14) el.inputPhEnd.classList.add('invalid');
    } else if (t.phEnd > t.phStart + 0.05) {
      phMsg = '최종 pH가 시작 pH보다 높습니다(ΔpH < 0). 입력값을 확인해 주세요.';
      phLevel = 'warn';
    }

    el.phAlert.hidden = !phMsg;
    el.phAlert.textContent = phMsg;
    el.phAlert.classList.toggle('warn', phLevel === 'warn');
  }

  function renderTable(tableEl, domain, teamRows, ctrlRows, digits, unit) {
    tableEl.className = `data-table ${domain}`;
    const theadCells = ['<th>구분</th>']
      .concat(
        teamRows.map((r) => {
          const cls = r.isMeasured ? ' class="measured-col"' : '';
          const tag = r.isMeasured ? '<span class="col-badge">측정</span>' : '';
          return `<th${cls}>${r.hour}h${tag}</th>`;
        })
      )
      .join('');

    const teamCells = [`<td>우리 조 (${unit})</td>`]
      .concat(
        teamRows.map((r) => {
          const cls = r.isMeasured ? ' class="measured-col"' : '';
          return `<td${cls}>${r.value.toFixed(digits)}</td>`;
        })
      )
      .join('');

    const ctrlCells = [`<td>무처리 (${unit})</td>`]
      .concat(
        ctrlRows.map((r) => {
          const cls = r.isMeasured ? ' class="measured-col"' : '';
          return `<td${cls}>${r.value.toFixed(digits)}</td>`;
        })
      )
      .join('');

    const diffCells = ['<td>차이</td>']
      .concat(
        teamRows.map((r, i) => {
          const diff = r.value - ctrlRows[i].value;
          const sign = diff > 0.0005 ? '+' : diff < -0.0005 ? '−' : '';
          return `<td>${sign}${Math.abs(diff).toFixed(digits)}</td>`;
        })
      )
      .join('');

    tableEl.innerHTML =
      `<thead><tr>${theadCells}</tr></thead>` +
      `<tbody>` +
      `<tr class="team-row">${teamCells}</tr>` +
      `<tr class="ctrl-row">${ctrlCells}</tr>` +
      `<tr class="diff-row">${diffCells}</tr>` +
      `</tbody>`;
  }

  function updateAll() {
    validateInputs();
    updateTabStates();

    const t = state.team;
    const c = state.control;

    const teamGasDelta = Math.max(0, t.gasEnd - t.gasStart);
    const ctrlGasDelta = Math.max(1, c.gasEnd - c.gasStart);
    const gasRatioPct = (teamGasDelta / ctrlGasDelta) * 100;

    const teamPhStart = Math.max(0, Math.min(14, t.phStart));
    const teamPhEnd = Math.max(0, Math.min(14, t.phEnd));
    const ctrlPhStart = Math.max(0, Math.min(14, c.phStart));
    const ctrlPhEnd = Math.max(0, Math.min(14, c.phEnd));

    const teamDeltaPh = teamPhStart - teamPhEnd;
    const ctrlDeltaPh = ctrlPhStart - ctrlPhEnd;
    const phComparison = MODELS.compareAcidification(
      teamDeltaPh,
      ctrlDeltaPh,
      CFG.PH_COMPARE_TOLERANCE
    );

    el.calcGasDelta.textContent = `ΔV ${MODELS.fmt(teamGasDelta, 1)} mL`;
    el.calcPhDelta.textContent = `ΔpH ${MODELS.fmt(teamDeltaPh, 2)}`;

    el.ctrlGasSummary.innerHTML =
      `${MODELS.fmtTrim(c.gasStart, 1)} → ${MODELS.fmtTrim(c.gasEnd, 1)} mL (<strong>${MODELS.fmtTrim(ctrlGasDelta, 1)} mL</strong>)`;
    el.ctrlPhSummary.innerHTML =
      `${MODELS.fmt(ctrlPhStart, 2)} → ${MODELS.fmt(ctrlPhEnd, 2)} (<strong>${MODELS.fmt(ctrlDeltaPh, 2)}</strong>)`;
    el.controlStatusNote.hidden = !isControlModified();

    el.kpiGasDelta.textContent = `${MODELS.fmt(teamGasDelta, 1)} mL`;
    el.kpiGasRange.textContent = `V₀ ${MODELS.fmtTrim(t.gasStart, 1)} → V₁₂ ${MODELS.fmtTrim(t.gasEnd, 1)} mL`;
    el.kpiGasRatio.textContent = `${MODELS.fmt(gasRatioPct, 1)}%`;
    el.kpiGasRatioSub.textContent = `무처리군 ${MODELS.fmt(ctrlGasDelta, 1)} mL 기준`;

    el.kpiPhDelta.textContent = MODELS.fmt(teamDeltaPh, 2);
    el.kpiPhRange.textContent = `pH₀ ${MODELS.fmt(teamPhStart, 2)} → pH₁₂ ${MODELS.fmt(teamPhEnd, 2)}`;
    el.kpiPhCompare.textContent = phComparison.label;
    el.kpiPhCompare.className = `ledger-value ${phComparison.tone}`;
    el.kpiPhCompareSub.textContent = phComparison.detail;

    const gasModelId = t.gasModel;
    const gasParams = CFG.STANDARD_PARAMS.gas[gasModelId];
    const gasTeamPts = MODELS.sampleCurve((hr) => MODELS.evaluateGas(gasModelId, hr, teamGasDelta, gasParams));
    const gasCtrlPts = MODELS.sampleCurve((hr) => MODELS.evaluateGas(gasModelId, hr, ctrlGasDelta, gasParams));
    const gasTeamHourly = MODELS.generateHourlyGas(gasModelId, teamGasDelta, gasParams);
    const gasCtrlHourly = MODELS.generateHourlyGas(gasModelId, ctrlGasDelta, gasParams);
    const gasFormula = MODELS.getFormulaInfo('gas', gasModelId, { deltaV: teamGasDelta }, gasParams);

    const phModelId = t.phModel;
    const phParams = CFG.STANDARD_PARAMS.ph[phModelId];
    const phTeamPts = MODELS.sampleCurve((hr) => MODELS.evaluatePh(phModelId, hr, teamPhStart, teamPhEnd, phParams));
    const phCtrlPts = MODELS.sampleCurve((hr) => MODELS.evaluatePh(phModelId, hr, ctrlPhStart, ctrlPhEnd, phParams));
    const phTeamHourly = MODELS.generateHourlyPh(phModelId, teamPhStart, teamPhEnd, phParams);
    const phCtrlHourly = MODELS.generateHourlyPh(phModelId, ctrlPhStart, ctrlPhEnd, phParams);
    const phFormula = MODELS.getFormulaInfo(
      'ph',
      phModelId,
      { phStart: teamPhStart, phEnd: teamPhEnd },
      phParams
    );

    const teamPrefix = getTeamDisplayPrefix();
    const memberPrefix = getMemberPrefixForSubtitle();
    const teamShortLabel = state.team.teamName.trim() || '우리 조';

    gasChart.setConfig({
      domain: 'gas',
      title: `${teamPrefix} — 기체 발생(CO₂) 12시간 모델링 (${gasFormula.meta.name})`,
      subtitle: `${memberPrefix}누적 기체 ΔV = ${MODELS.fmt(teamGasDelta, 1)} mL (무처리군 ${MODELS.fmt(ctrlGasDelta, 1)} mL 대비 ${MODELS.fmt(gasRatioPct, 1)}%)`,
      yAxisLabel: '누적 기체 부피 (mL)',
      unit: ' mL',
      digits: 1,
      teamSeries: {
        label: `${teamShortLabel} (${gasFormula.meta.name})`,
        points: gasTeamPts,
        hourly: gasTeamHourly,
      },
      controlSeries: {
        label: '공통 무처리군 (약물 0%)',
        points: gasCtrlPts,
        hourly: gasCtrlHourly,
      },
      formulaLine: `수식: ${gasFormula.substituted}`,
    });

    phChart.setConfig({
      domain: 'ph',
      title: `${teamPrefix} — 산성화(pH) 12시간 모델링 (${phFormula.meta.name})`,
      subtitle: `${memberPrefix}pH ${MODELS.fmt(teamPhStart, 2)} → ${MODELS.fmt(teamPhEnd, 2)} (ΔpH = ${MODELS.fmt(teamDeltaPh, 2)} · 무처리군 대비 ${phComparison.label})`,
      yAxisLabel: '용액 pH',
      unit: '',
      digits: 2,
      teamSeries: {
        label: `${teamShortLabel} (${phFormula.meta.name})`,
        points: phTeamPts,
        hourly: phTeamHourly,
      },
      controlSeries: {
        label: '공통 무처리군 (약물 0%)',
        points: phCtrlPts,
        hourly: phCtrlHourly,
      },
      formulaLine: `수식: ${phFormula.substituted}`,
    });

    el.gasFormulaName.textContent = `${gasFormula.meta.name} (${gasFormula.meta.english})`;
    el.gasFormulaSubstituted.textContent = gasFormula.substituted;
    el.gasFormulaGeneral.textContent = `일반식: ${gasFormula.general}`;
    el.gasFormulaConstants.textContent = gasFormula.constantsText;
    el.gasFormulaNote.textContent = gasFormula.domainNote;

    el.phFormulaName.textContent = `${phFormula.meta.name} (${phFormula.meta.english})`;
    el.phFormulaSubstituted.textContent = phFormula.substituted;
    el.phFormulaGeneral.textContent = `일반식: ${phFormula.general}`;
    el.phFormulaConstants.textContent = phFormula.constantsText;
    el.phFormulaNote.textContent = phFormula.domainNote;

    renderTable(el.gasTable, 'gas', gasTeamHourly, gasCtrlHourly, 1, 'mL');
    renderTable(el.phTable, 'ph', phTeamHourly, phCtrlHourly, 2, 'pH');

    lastComputed = {
      gasFormula,
      phFormula,
      gasTeamHourly,
      gasCtrlHourly,
      phTeamHourly,
      phCtrlHourly,
    };
  }

  async function copyText(text, successMsg) {
    try {
      await navigator.clipboard.writeText(text);
      showToast(successMsg);
    } catch (_) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      showToast(successMsg);
    }
  }

  function formatTableTsv(teamRows, ctrlRows, digits, unitLabel) {
    const header = ['구분'].concat(teamRows.map((r) => `${r.hour}h`)).join('\t');
    const rowTeam = [`우리 조 (${unitLabel})`]
      .concat(teamRows.map((r) => r.value.toFixed(digits)))
      .join('\t');
    const rowCtrl = [`무처리군 (${unitLabel})`]
      .concat(ctrlRows.map((r) => r.value.toFixed(digits)))
      .join('\t');
    return `${header}\n${rowTeam}\n${rowCtrl}`;
  }

  function bindEvents() {
    el.inputTeamName.addEventListener('input', (e) => {
      state.team.teamName = e.target.value;
      saveState();
      updateAll();
    });

    el.inputMemberNames.addEventListener('input', (e) => {
      state.team.memberNames = e.target.value;
      saveState();
      updateAll();
    });

    el.btnAddDrug.addEventListener('click', () => {
      if (state.team.drugs.length >= 5) {
        showToast('약물은 최대 5개까지 추가할 수 있습니다.');
        return;
      }
      state.team.drugs.push({ name: '', concentration: '' });
      renderDrugRows();
      saveState();
      const inputs = el.drugList.querySelectorAll('.drug-row:last-child input');
      if (inputs[0]) inputs[0].focus();
    });

    const numBindings = [
      [el.inputGasStart, 'team', 'gasStart'],
      [el.inputGasEnd, 'team', 'gasEnd'],
      [el.inputPhStart, 'team', 'phStart'],
      [el.inputPhEnd, 'team', 'phEnd'],
      [el.ctrlGasStart, 'control', 'gasStart'],
      [el.ctrlGasEnd, 'control', 'gasEnd'],
      [el.ctrlPhStart, 'control', 'phStart'],
      [el.ctrlPhEnd, 'control', 'phEnd'],
    ];

    for (const [inputEl, bucket, key] of numBindings) {
      inputEl.addEventListener('focus', () => {
        inputEl.dataset.preEdit = String(state[bucket][key]);
      });

      inputEl.addEventListener('input', (e) => {
        const raw = e.target.value.trim();
        const preEdit = numOrFallback(inputEl.dataset.preEdit, state[bucket][key]);
        if (raw === '') {
          // 백스페이스로 전부 비웠을 때 직전 중간 자리수(예: 50→5→빈칸의 '5')가 남지 않도록 편집 전 정상값 유지
          state[bucket][key] = preEdit;
          saveState();
          updateAll();
          return;
        }
        const parsed = parseFloat(raw);
        if (!Number.isFinite(parsed)) return;
        state[bucket][key] = parsed;
        saveState();
        updateAll();
      });

      inputEl.addEventListener('blur', (e) => {
        const raw = e.target.value.trim();
        const parsed = parseFloat(raw);
        const preEdit = numOrFallback(inputEl.dataset.preEdit, state[bucket][key]);
        if (raw === '' || !Number.isFinite(parsed)) {
          state[bucket][key] = preEdit;
          e.target.value = preEdit;
          saveState();
          updateAll();
        } else {
          inputEl.dataset.preEdit = String(parsed);
        }
      });
    }

    el.btnResetTeam.addEventListener('click', () => {
      state.team = cloneDefaultTeam();
      syncInputsFromState();
      saveState();
      updateAll();
      showToast('입력값을 초기화했습니다.');
    });

    el.btnResetControl.addEventListener('click', () => {
      state.control = {
        gasStart: CFG.CONTROL_BASELINE.gasStart,
        gasEnd: CFG.CONTROL_BASELINE.gasEnd,
        phStart: CFG.CONTROL_BASELINE.phStart,
        phEnd: CFG.CONTROL_BASELINE.phEnd,
      };
      syncInputsFromState();
      saveState();
      updateAll();
      showToast('무처리군 기준값을 복원했습니다.');
    });

    el.btnSyncPhModel.addEventListener('click', () => {
      state.team.phModel = state.team.gasModel;
      saveState();
      updateAll();
      showToast('pH에 기체와 같은 방정식을 적용했습니다.');
    });

    el.btnExportGasPng.addEventListener('click', () => {
      const prefix = sanitizeFilenamePart(getTeamDisplayPrefix()) || '우리조';
      const modelName = sanitizeFilenamePart(lastComputed.gasFormula.meta.name);
      const fname = `${prefix}_기체발생_CO2_${modelName}.png`;
      gasChart.exportPng(fname);
      showToast(`PNG 저장 완료: ${fname}`);
    });

    el.btnExportPhPng.addEventListener('click', () => {
      const prefix = sanitizeFilenamePart(getTeamDisplayPrefix()) || '우리조';
      const modelName = sanitizeFilenamePart(lastComputed.phFormula.meta.name);
      const fname = `${prefix}_산성화_pH_${modelName}.png`;
      phChart.exportPng(fname);
      showToast(`PNG 저장 완료: ${fname}`);
    });

    el.btnCopyGasFormula.addEventListener('click', () => {
      if (!lastComputed) return;
      copyText(lastComputed.gasFormula.substituted, '기체 수식을 복사했습니다.');
    });

    el.btnCopyPhFormula.addEventListener('click', () => {
      if (!lastComputed) return;
      copyText(lastComputed.phFormula.substituted, 'pH 수식을 복사했습니다.');
    });

    el.btnCopyGasTable.addEventListener('click', () => {
      if (!lastComputed) return;
      const tsv = formatTableTsv(lastComputed.gasTeamHourly, lastComputed.gasCtrlHourly, 1, 'mL');
      copyText(tsv, '기체 0~12시간 표를 복사했습니다.');
    });

    el.btnCopyPhTable.addEventListener('click', () => {
      if (!lastComputed) return;
      const tsv = formatTableTsv(lastComputed.phTeamHourly, lastComputed.phCtrlHourly, 2, 'pH');
      copyText(tsv, 'pH 0~12시간 표를 복사했습니다.');
    });

    let resizeRaf = null;
    const syncTopbarHeight = () => {
      const topbar = document.querySelector('.topbar');
      if (!topbar) return;
      const h = Math.ceil(topbar.getBoundingClientRect().height);
      document.documentElement.style.setProperty('--topbar-h', `${h}px`);
    };

    syncTopbarHeight();
    if (typeof ResizeObserver !== 'undefined') {
      const topbar = document.querySelector('.topbar');
      if (topbar) {
        const ro = new ResizeObserver(syncTopbarHeight);
        ro.observe(topbar);
      }
    }

    window.addEventListener('resize', () => {
      syncTopbarHeight();
      cancelAnimationFrame(resizeRaf);
      resizeRaf = requestAnimationFrame(() => {
        gasChart.render();
        phChart.render();
      });
    });

    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => {
        gasChart.render();
        phChart.render();
      });
    }
  }

  buildModelTabs();
  syncInputsFromState();
  bindEvents();
  updateAll();
})();
