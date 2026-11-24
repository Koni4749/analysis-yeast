/**
 * 0~12시간 정규화 수리모델링 연산 엔진 (기체 부피 CO2 & 산성화 pH 공용)
 */

(function (global) {
  'use strict';

  const T_MAX = 12;

  const MODEL_CATALOG = [
    {
      id: 'hill',
      name: '힐 방정식',
      english: 'Hill',
      group: 'core',
      shortDesc: '반포화 시간 K와 협동 계수 n 기반 포화형 곡선',
      gasNote: '초반 발효가 빠르게 가속된 뒤 기질 소진에 따라 포화되는 S자형 누적 곡선입니다.',
      phNote: '유산균 적응기 이후 젖산 축적이 본격화되다가 산성 환경에서 완만해지는 곡선입니다.',
    },
    {
      id: 'logistic',
      name: '로지스틱 방정식',
      english: 'Logistic',
      group: 'core',
      shortDesc: '변곡 시점 t₀ 중심의 대칭 S자 성장 모델',
      gasNote: '초반 증식과 후반 기질 한계가 대칭을 이루는 표준 S자 발효 곡선입니다.',
      phNote: '변곡 시점(t₀ = 5.5 h) 부근에서 pH가 가장 빠르게 내려가는 대칭 S자 곡선입니다.',
    },
    {
      id: 'gompertz',
      name: '곰페르츠 방정식',
      english: 'Gompertz',
      group: 'core',
      shortDesc: '초반 상승이 빠르고 후반 포화가 완만한 비대칭 S자 모델',
      gasNote: '초반에 빠르게 상승하고 후반부 포화가 완만하게 이어지는 비대칭 성장 곡선입니다.',
      phNote: '초기 지연 뒤 빠르게 산성화되고 후반부로 갈수록 서서히 안정화되는 비대칭 곡선입니다.',
    },
    {
      id: 'expDecay',
      name: '지수적 사멸 방정식',
      english: 'Exponential Decay',
      group: 'core',
      shortDesc: '활성·반응 속도가 e^(-kt)로 지수 감소하는 모델',
      gasNote: '발효 속도(활성 세포)가 e^(-kt)로 지수 감소할 때, 누적 기체 부피는 적분형인 1 − e^(-kt) 형태로 나타납니다.',
      phNote: '시작 pH에서 최종 pH로 e^(-kt) 비율로 지수 감소하는 산성화 곡선입니다.',
    },
    {
      id: 'logarithmic',
      name: '로그 함수',
      english: 'Logarithmic',
      group: 'extra',
      shortDesc: '초기 변화율이 크고 점차 둔화되는 로그 모델',
      gasNote: '시작 직후 변화 폭이 가장 크고 시간이 지날수록 점차 완만해지는 로그 곡선입니다.',
      phNote: '초반에 pH가 비교적 빠르게 내려간 뒤 완만하게 둔화되는 로그 곡선입니다.',
    },
    {
      id: 'polynomial',
      name: '다항 함수 (2차)',
      english: 'Quadratic',
      group: 'extra',
      shortDesc: 't = 12 h에서 기울기가 0이 되는 단조 포화형 2차식',
      gasNote: '12시간 시점에서 꼭짓점(포화)에 도달하도록 정규화한 단조 증가 2차 함수입니다.',
      phNote: '12시간 시점에서 기울기가 0에 수렴하도록 정규화한 단조 감소 2차 함수입니다.',
    },
  ];

  function fmt(num, digits) {
    const d = typeof digits === 'number' ? digits : 2;
    if (!Number.isFinite(num)) return '0';
    const rounded = Number(num.toFixed(d));
    return Object.is(rounded, -0) ? (0).toFixed(d) : rounded.toFixed(d);
  }

  function fmtTrim(num, maxDigits) {
    const d = typeof maxDigits === 'number' ? maxDigits : 3;
    if (!Number.isFinite(num)) return '0';
    const s = Number(num.toFixed(d)).toString();
    return s === '-0' ? '0' : s;
  }

  function evaluateNormalized(modelId, t, params) {
    if (t <= 0) return 0;
    if (t >= T_MAX) return 1;

    switch (modelId) {
      case 'hill': {
        const { K, n } = params;
        const tPow = Math.pow(t, n);
        const kPow = Math.pow(K, n);
        const maxPow = Math.pow(T_MAX, n);
        return (tPow / (kPow + tPow)) / (maxPow / (kPow + maxPow));
      }

      case 'logistic': {
        const { k, t0 } = params;
        const L = (x) => 1 / (1 + Math.exp(-k * (x - t0)));
        const l0 = L(0);
        const l12 = L(T_MAX);
        return (L(t) - l0) / (l12 - l0);
      }

      case 'gompertz': {
        const { b, c } = params;
        const G = (x) => Math.exp(-b * Math.exp(-c * x));
        const g0 = G(0);
        const g12 = G(T_MAX);
        return (G(t) - g0) / (g12 - g0);
      }

      case 'expDecay': {
        const { k } = params;
        return (1 - Math.exp(-k * t)) / (1 - Math.exp(-k * T_MAX));
      }

      case 'logarithmic': {
        const { a } = params;
        return Math.log(1 + a * t) / Math.log(1 + a * T_MAX);
      }

      case 'polynomial': {
        return (2 * T_MAX * t - t * t) / (T_MAX * T_MAX);
      }

      default:
        return t / T_MAX;
    }
  }

  function evaluateGas(modelId, t, deltaV, params) {
    return deltaV * evaluateNormalized(modelId, t, params);
  }

  function evaluatePh(modelId, t, phStart, phEnd, params) {
    const f = evaluateNormalized(modelId, t, params);
    return phStart + (phEnd - phStart) * f;
  }

  function generateHourlyGas(modelId, deltaV, params) {
    const rows = [];
    for (let h = 0; h <= T_MAX; h += 1) {
      rows.push({
        hour: h,
        value: evaluateGas(modelId, h, deltaV, params),
        isMeasured: h === 0 || h === T_MAX,
      });
    }
    return rows;
  }

  function generateHourlyPh(modelId, phStart, phEnd, params) {
    const rows = [];
    for (let h = 0; h <= T_MAX; h += 1) {
      rows.push({
        hour: h,
        value: evaluatePh(modelId, h, phStart, phEnd, params),
        isMeasured: h === 0 || h === T_MAX,
      });
    }
    return rows;
  }

  function sampleCurve(evalFn, steps) {
    const n = steps || 180;
    const pts = [];
    for (let i = 0; i <= n; i += 1) {
      const t = (T_MAX * i) / n;
      pts.push({ t, y: evalFn(t) });
    }
    return pts;
  }

  function getFormulaInfo(domain, modelId, values, params) {
    const isGas = domain === 'gas';
    const dV = isGas ? values.deltaV : values.phStart - values.phEnd;
    const ph0 = values.phStart;
    const ph12 = values.phEnd;

    let general = '';
    let substituted = '';
    let constantsText = '';

    if (modelId === 'hill') {
      const { K, n } = params;
      const scale = (Math.pow(K, n) + Math.pow(T_MAX, n)) / Math.pow(T_MAX, n);
      const effCoeff = dV * scale;
      constantsText = `적용 상수: K = ${K} h, n = ${n}`;
      if (isGas) {
        general = 'V(t) = ΔV · [(Kⁿ + 12ⁿ) / 12ⁿ] · [tⁿ / (Kⁿ + tⁿ)]';
        substituted = `V(t) = ${fmtTrim(effCoeff, 2)} · t^${n} / (${K}^${n} + t^${n})`;
      } else {
        const sign = dV >= 0 ? '−' : '+';
        general = 'pH(t) = pH₀ − ΔpH · [(Kⁿ + 12ⁿ) / 12ⁿ] · [tⁿ / (Kⁿ + tⁿ)]';
        substituted = `pH(t) = ${fmt(ph0, 2)} ${sign} ${fmtTrim(Math.abs(effCoeff), 3)} · t^${n} / (${K}^${n} + t^${n})`;
      }
    } else if (modelId === 'logistic') {
      const { k, t0 } = params;
      const L0 = 1 / (1 + Math.exp(k * t0));
      const L12 = 1 / (1 + Math.exp(-k * (T_MAX - t0)));
      const span = L12 - L0;
      constantsText = `적용 상수: k = ${k} h⁻¹, t₀ = ${t0} h`;
      if (isGas) {
        general = 'V(t) = ΔV · [L(t) − L(0)] / [L(12) − L(0)],  L(t) = 1 / (1 + e^(−k(t − t₀)))';
        substituted = `V(t) = ${fmtTrim(dV, 1)} · [1/(1 + e^(−${k}(t − ${t0}))) − ${fmtTrim(L0, 4)}] / ${fmtTrim(span, 4)}`;
      } else {
        const sign = dV >= 0 ? '−' : '+';
        general = 'pH(t) = pH₀ − ΔpH · [L(t) − L(0)] / [L(12) − L(0)],  L(t) = 1 / (1 + e^(−k(t − t₀)))';
        substituted = `pH(t) = ${fmt(ph0, 2)} ${sign} ${fmtTrim(Math.abs(dV), 2)} · [1/(1 + e^(−${k}(t − ${t0}))) − ${fmtTrim(L0, 4)}] / ${fmtTrim(span, 4)}`;
      }
    } else if (modelId === 'gompertz') {
      const { b, c } = params;
      const G0 = Math.exp(-b);
      const G12 = Math.exp(-b * Math.exp(-c * T_MAX));
      const span = G12 - G0;
      const inflection = Math.log(b) / c;
      constantsText = `적용 상수: b = ${b}, c = ${c} h⁻¹ (변곡 시점 t* ≈ ${fmtTrim(inflection, 2)} h)`;
      if (isGas) {
        general = 'V(t) = ΔV · [G(t) − G(0)] / [G(12) − G(0)],  G(t) = exp(−b · e^(−ct))';
        substituted = `V(t) = ${fmtTrim(dV, 1)} · [exp(−${b}·e^(−${c}t)) − ${fmtTrim(G0, 4)}] / ${fmtTrim(span, 4)}`;
      } else {
        const sign = dV >= 0 ? '−' : '+';
        general = 'pH(t) = pH₀ − ΔpH · [G(t) − G(0)] / [G(12) − G(0)],  G(t) = exp(−b · e^(−ct))';
        substituted = `pH(t) = ${fmt(ph0, 2)} ${sign} ${fmtTrim(Math.abs(dV), 2)} · [exp(−${b}·e^(−${c}t)) − ${fmtTrim(G0, 4)}] / ${fmtTrim(span, 4)}`;
      }
    } else if (modelId === 'expDecay') {
      const { k } = params;
      const den = 1 - Math.exp(-k * T_MAX);
      const halfLife = Math.LN2 / k;
      constantsText = `적용 상수: k = ${k} h⁻¹ (반감기 t₁/₂ ≈ ${fmtTrim(halfLife, 2)} h)`;
      if (isGas) {
        general = 'V(t) = ΔV · (1 − e^(−kt)) / (1 − e^(−12k))';
        substituted = `V(t) = ${fmtTrim(dV / den, 2)} · (1 − e^(−${k}t))`;
      } else {
        const e12 = Math.exp(-k * T_MAX);
        const sign = dV >= 0 ? '+' : '−';
        general = 'pH(t) = pH₁₂ + ΔpH · (e^(−kt) − e^(−12k)) / (1 − e^(−12k))';
        substituted = `pH(t) = ${fmt(ph12, 2)} ${sign} ${fmtTrim(Math.abs(dV) / den, 3)} · (e^(−${k}t) − ${fmtTrim(e12, 4)})`;
      }
    } else if (modelId === 'logarithmic') {
      const { a } = params;
      const den = Math.log(1 + a * T_MAX);
      constantsText = `적용 상수: a = ${a} h⁻¹`;
      if (isGas) {
        general = 'V(t) = ΔV · ln(1 + at) / ln(1 + 12a)';
        substituted = `V(t) = ${fmtTrim(dV / den, 2)} · ln(1 + ${a}t)`;
      } else {
        const sign = dV >= 0 ? '−' : '+';
        general = 'pH(t) = pH₀ − ΔpH · ln(1 + at) / ln(1 + 12a)';
        substituted = `pH(t) = ${fmt(ph0, 2)} ${sign} ${fmtTrim(Math.abs(dV) / den, 3)} · ln(1 + ${a}t)`;
      }
    } else if (modelId === 'polynomial') {
      constantsText = '경계 조건: f(0) = 0, f(12) = 1, f′(12) = 0';
      const c1 = dV / 6;
      const c2 = dV / 144;
      if (isGas) {
        general = 'V(t) = ΔV · (24t − t²) / 144';
        substituted = `V(t) = ${fmtTrim(c1, 2)}t − ${fmtTrim(c2, 3)}t²`;
      } else {
        const sign1 = dV >= 0 ? '−' : '+';
        const sign2 = dV >= 0 ? '+' : '−';
        general = 'pH(t) = pH₀ − ΔpH · (24t − t²) / 144';
        substituted = `pH(t) = ${fmt(ph0, 2)} ${sign1} ${fmtTrim(Math.abs(c1), 3)}t ${sign2} ${fmtTrim(Math.abs(c2), 4)}t²`;
      }
    }

    const meta = MODEL_CATALOG.find((m) => m.id === modelId) || MODEL_CATALOG[0];
    return {
      meta,
      general,
      substituted,
      constantsText,
      domainNote: isGas ? meta.gasNote : meta.phNote,
    };
  }

  function compareAcidification(teamDeltaPh, controlDeltaPh, tolerance) {
    const tol = typeof tolerance === 'number' ? tolerance : 0.15;
    const diff = teamDeltaPh - controlDeltaPh;
    if (teamDeltaPh < controlDeltaPh - tol) {
      return {
        label: '작음',
        tone: 'good',
        detail: `무처리군보다 ${fmt(Math.abs(diff), 2)} 덜 감소`,
      };
    }
    if (teamDeltaPh > controlDeltaPh + tol) {
      return {
        label: '큼',
        tone: 'warn',
        detail: `무처리군보다 ${fmt(Math.abs(diff), 2)} 더 크게 감소`,
      };
    }
    return {
      label: '비슷',
      tone: 'neutral',
      detail: `무처리군과 차이 ${diff >= 0 ? '+' : '−'}${fmt(Math.abs(diff), 2)}`,
    };
  }

  const exported = {
    T_MAX,
    MODEL_CATALOG,
    evaluateNormalized,
    evaluateGas,
    evaluatePh,
    generateHourlyGas,
    generateHourlyPh,
    sampleCurve,
    getFormulaInfo,
    compareAcidification,
    fmt,
    fmtTrim,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exported;
  } else {
    global.ANALYSIS_MODELS = exported;
  }
})(typeof window !== 'undefined' ? window : globalThis);
