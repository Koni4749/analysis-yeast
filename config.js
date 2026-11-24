/**
 * 공통 무처리군 기준값 및 수리모델 표준 상수 설정
 * ---------------------------------------------------------------------------
 * 무처리군 기준값을 변경할 때는 아래 CONTROL_BASELINE 숫자 4개만 수정한 뒤
 * GitHub에 반영하시면 됩니다. (별도 빌드 불필요)
 *
 * [무처리군 기준값 배합 조건]
 * - 우유 300 mL + 증류수 300 mL (약물 0%) + 효모 10 g + 설탕 10 g + 요거트 스타터 1 g
 * - 40–42 °C 요거트 배양기 12시간, 1 L 메스실린더 수상치환 (유효 포집 상한 750 mL)
 */

window.ANALYSIS_CONFIG = {
  // 1. 공통 무처리군(약물 0%) 기준값
  CONTROL_BASELINE: {
    label: '공통 무처리군 (약물 0%)',
    gasStart: 50,     // V0 (mL): 잉여 공기 배출 후 0h 기준선
    gasEnd: 800,      // V12 (mL): 12h 최종 눈금 (누적 ΔV = 750 mL)
    phStart: 6.55,    // pH0 (0h): 혼합 직후 초기 pH
    phEnd: 4.35,      // pH12 (12h): 12시간 배양 후 최종 pH (ΔpH = 2.20)
    maxCylinderVolume: 1000,
    maxEffectiveDeltaV: 750,
    basisSummary:
      '우유 300 mL · 증류수 300 mL · 효모 10 g · 설탕 10 g · 스타터 1 g · 40–42 °C 12시간 · 1 L 실린더 유효 포집 한계(750 mL)',
  },

  // 2. 첫 접속 시 기본 입력값
  DEFAULT_TEAM_INPUT: {
    teamName: '',
    memberNames: '',
    drugs: [{ name: '', concentration: '' }],
    gasStart: 50,
    gasEnd: 560,      // ΔV = 510 mL (무처리군 대비 68.0%)
    phStart: 6.55,
    phEnd: 5.15,      // ΔpH = 1.40
    gasModel: 'hill',
    phModel: 'hill',
  },

  // 3. pH 무처리군 비교 판정 허용 오차 (±0.15 pH)
  PH_COMPARE_TOLERANCE: 0.15,

  // 4. 배양 시간 (0h ~ 12h)
  DURATION_HOURS: 12,

  // 5. 방정식별 표준 고정 상수
  //    - gas(효모 CO2): 효모 10 g · 설탕 10 g 배합 기준 (초반 빠른 발효 후 후반 포화)
  //    - ph(유산균 산성화): 스타터 1 g 기준 (적응기 후 중반 산성화, 후반 안정화)
  STANDARD_PARAMS: {
    gas: {
      hill:        { K: 3.5, n: 2.2 },
      logistic:    { k: 0.65, t0: 3.8 },
      gompertz:    { b: 3.2, c: 0.42 },
      expDecay:    { k: 0.30 },
      logarithmic: { a: 0.80 },
      polynomial:  { degree: 2 },
    },
    ph: {
      hill:        { K: 5.5, n: 3.0 },
      logistic:    { k: 0.65, t0: 5.5 },
      gompertz:    { b: 5.0, c: 0.36 },
      expDecay:    { k: 0.22 },
      logarithmic: { a: 0.45 },
      polynomial:  { degree: 2 },
    },
  },
};
