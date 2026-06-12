# 코스 & 기믹 시스템 설계 (2026-06-12)

V8 Kart Rush에 신규 코스 4종을 추가하고, 재사용 가능한 기믹 시스템을 구축하며, 기존 5코스에도 기믹을 심어 전체 완성도를 올린다. 모바일·저사양 PC에서도 쾌적해야 한다.

## 목표

- 코스 9종 (기존 5 + 신규 4: 볼케이노 런, 기어 팩토리, 정글 템플, 스카이 하이웨이)
- 기믹 8계열을 하나의 데이터 기반 시스템으로 — 코스당 2~4개만 배치, 코스마다 시그니처가 다르게
- 멀티플레이·고스트·AI가 모두 동일한 기믹 상태를 보는 결정론적 동작
- 저사양 자동 대응 (품질 3단계)

## 비목표

- 코스 에디터, 사용자 제작 코스
- 기믹의 서버 권한 동기화 (시간 기반 결정론으로 대체)
- 신규 물리 엔진 — 기존 kart.step() 이벤트/효과를 재사용

## 파일 구조

```
src/game/
├── gimmicks.ts          # 기믹 시스템 전체: GimmickDef 타입 + GimmickManager
├── courses/
│   ├── index.ts         # COURSES 조립 + getCourse() (기존 import 경로 재수출 유지)
│   ├── types.ts         # CourseDef, CourseTheme 등 인터페이스
│   ├── sunny.ts         # 코스 1개 = 파일 1개 (스플라인 포인트 + 기믹 배치 + 테마)
│   ├── canyon.ts, ice.ts, beach.ts, neon.ts
│   └── volcano.ts, factory.ts, jungle.ts, sky.ts   # 신규 (하나씩 추가)
└── perf.ts              # 품질 감지/프리셋 (low/mid/high)
```

- 기존 `courses.ts`는 `courses/`로 분해하고 같은 경로로 재수출해 기존 import를 깨지 않는다.
- 코스 파일은 순수 데이터만 담는다. 기믹 로직은 전부 `gimmicks.ts`.

## 기믹 시스템 아키텍처

### 데이터 모델

`CourseDef`에 `gimmicks: GimmickDef[]` 추가. GimmickDef는 discriminated union:

```ts
type GimmickDef =
  | { type: 'hammer';    t: number; lane: number; period: number; variant?: 'hammer'|'log' } // A 진자 해머/흔들리는 통나무
  | { type: 'spinbar';   t: number; period: number }                        // A 회전 바
  | { type: 'press';     t: number; lane: number; period: number }          // A 프레스
  | { type: 'sinkroad';  t0: number; t1: number; period: number; duty: number } // B 가라앉는 구간
  | { type: 'platform';  t0: number; t1: number; period: number; axis: 'y'|'lateral' } // B 움직이는 플랫폼
  | { type: 'shortcut';  entryT: number; exitT: number; points: [number,number][]; width: number } // C 샛길
  | { type: 'cannon';    t: number; landT: number; flightSec: number }      // D 대포
  | { type: 'teleport';  t: number; exitT: number }                         // D 텔레포트
  | { type: 'mud';       t0: number; t1: number; side?: 1|-1|0 }            // E 머드존
  | { type: 'conveyor';  t0: number; t1: number; dir: 1|-1; push: number }  // E 컨베이어/급류
  | { type: 'geyser';    t: number; lane: number; period: number; warnSec: number } // F 간헐천
  | { type: 'rockfall';  t: number; lane: number; period: number; warnSec: number } // F 낙석
  | { type: 'tide';      period: number; range: number }                    // F 밀물/썰물 (open 맵)
  | { type: 'bumper';    t: number; lane: number }                          // G 핀볼 범퍼
  | { type: 'crates';    t: number; lane: number; count: number }           // G 부서지는 상자
  | { type: 'turntable'; t: number; lane: number; radius: number; spin: number } // G 턴테이블
```

H(수직)는 기믹 객체가 아니라 코스 데이터 확장: `elevation?: {t, h}[]` (스플라인 높이 프로필)과 `bank?: {t0, t1, angle}[]` (뱅크 코너). 트랙 메시 생성과 kart의 지면 높이 계산이 이를 반영한다.

### GimmickManager (gimmicks.ts)

- **생성**: 코스 로드(카운트다운) 중 모든 기믹 메시를 만들어 첫 프레임 히치 방지. 같은 종류는 지오메트리/머티리얼 공유, 다수 인스턴스(상자, 범퍼)는 InstancedMesh.
- **갱신**: 매 프레임 `update(raceTime, kart)` — 모든 가동부 상태는 **레이스 경과시간의 순수 함수** (`phase = (raceTime / period) % 1`). 랜덤 없음 → 멀티·고스트·AI 전원이 동일 상태. 네트워크 동기화 불필요.
- **충돌/효과**: 로컬 플레이어(및 로컬 AI)만 판정 — 기존 "피해자 권한" 패턴. 효과는 기존 시스템 재사용:
  - 타격(해머·프레스·낙석) → 스핀 (번개 효과와 동일 경로)
  - 범퍼 → 튕김 (벽 반사 로직 재사용)
  - 가라앉은 구간·간헐천 위 낙하 → 기존 pit/구조대(구름이) 재사용
  - 머드/컨베이어 → 노면 속도 배율/외력 (오프로드 시스템 확장)
  - 대포/텔레포트 → 입력 잠금 + 고정 궤적 이동 후 trackIdx 점프 (역주행 오탐 방지를 위해 checkpoint를 함께 갱신)
- **AI 대응**: AI는 기믹을 회피하지 않는다(맞으면 똑같이 스핀) — 단, 가라앉는 구간·간헐천 직전에서는 racing line이 살짝 흔들리는 정도의 cheap 회피만. 지름길(C)은 상위 난이도 AI만 일정 확률로 진입.
- **경고 연출**: F계열은 발동 `warnSec`(약 1초) 전에 경고(낙석 그림자, 간헐천 거품)를 보여줘 "이유 있는 죽음"으로 만든다.

### 지름길(C) 구현 노트

가드레일에 틈을 내고, 서브 스플라인(`points`)으로 좁은 샛길 메시를 깐다. 샛길 위는 정상 주행(폭이 좁고 장애물 배치로 리스크). 진행도 계산은 본선 `t` 기준 보간(entryT→exitT)으로 처리해 순위/체크포인트 시스템을 건드리지 않는다. 역주행 감지는 샛길 위에서 일시 완화.

## 코스별 기믹 배치

### 기존 5코스 (분리하면서 추가)

| 코스 | 난이도 | 기믹 (시그니처 굵게) |
|---|---|---|
| 써니 서킷 | ★ | **E 머드존 1** + G 상자 — 입문용 소개 |
| 선셋 비치 | ★ | **F 밀물/썰물(수면선 이동)** + E 급류 |
| 캐니언 트위스트 | ★★ | **F 낙석** + C 지름길 1 (+기존 절벽) |
| 아이스 밸리 | ★★ | **G 핀볼 범퍼** + C 지름길 1 (+기존 저그립) |
| 네온 나이트 | ★★★ | **D 텔레포트 게이트** + A 회전 바 + G 턴테이블 |

### 신규 4코스 (제작 순서)

| # | 코스 | 난이도 | 기믹 | 테마 |
|---|---|---|---|---|
| 1 | 볼케이노 런 | ★★ | **B 무너지는 용암 다리** + F 간헐천(점프 활용 가능) + A 진자 해머 | 용암·화산재 하늘 |
| 2 | 기어 팩토리 | ★★ | **A 프레스 타이밍 통과** + E 컨베이어(순방향 가속/역방향 감속) + G 상자 | 공장 내부·금속 |
| 3 | 정글 템플 | ★★★ | **C 갈림길 2개(유적 샛길 vs 강변 큰길)** + B 출렁다리 + A 흔들리는 통나무 | 정글 유적 |
| 4 | 스카이 하이웨이 | ★★★ | **D 대포 비행** + **H 뱅크 코너·고저차** + B 움직이는 플랫폼 | 하늘 위 도로, 낙하 시 구조 |

난이도 곡선: ★ 써니/비치 → ★★ 캐니언/아이스/볼케이노/팩토리 → ★★★ 네온/정글/스카이.

신규 코스 풍경은 기존 파이프라인 재사용: Kenney/CC0 키트에서 코스별 SCENERY_MODELS 추가, 테마 색상은 CourseTheme.

## 성능 전략 (perf.ts)

- 시작 시 1회 감지(모바일 UA, hardwareConcurrency, 해상도)로 **low/mid/high** 자동 선택 + 설정 화면에서 수동 변경(localStorage 저장, i18n 키 추가).
- low: `pixelRatio=1`, 파티클 수 ½, 데코 밀도 ½, 원거리 기믹 애니메이션 갱신 생략(거리 컬링), 안개 가까이.
- 기믹 메시: 지오메트리/머티리얼 공유, 동종 다수는 InstancedMesh. 코스당 가동부 ≤ 약 12개 유지.
- 그림자 미사용(현행 유지). 드로우콜 목표: 기믹 추가분 +20 이하.

## 구현 순서

1. **기반**: courses/ 분리(동작 변화 없음 확인) → perf.ts → gimmicks.ts 골격(E·G 같은 쉬운 계열부터)
2. **기존 코스 기믹**: 써니→비치→캐니언→아이스→네온 (가벼운 것부터)
3. **신규 코스**: 볼케이노 → 팩토리 → 정글(지름길 시스템 포함) → 스카이(H 수직 시스템 포함)
4. 각 단계마다 프리뷰 검증 + 커밋 (코스 1개 = PR 단위 1개 느낌으로)

H(수직)와 C(지름길)는 트랙 시스템을 건드리는 큰 작업이라 마지막 신규 코스 2개에 묶어 단계적으로 도입한다.

## 테스트/검증

- 결정론 검증: 같은 raceTime을 넣은 두 GimmickManager 인스턴스의 상태 일치 확인 (동기 시뮬레이션)
- 물리 검증: 기존 `window.__game` 동기 시뮬레이션 패턴으로 기믹 충돌·효과(스핀/튕김/낙하/구조) 이벤트 확인
- 고스트 호환: 기믹 코스에서 고스트 기록→재생이 어긋나지 않는지 (시간 기반이므로 통과해야 정상)
- 성능: low 프리셋에서 프레임 타임 확인 (CPU 스로틀 시뮬레이션)
- 각 코스 추가 시 3랩 완주 + AI 레이스 + 미니맵/순위 정상 확인
