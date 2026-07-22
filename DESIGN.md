# 빌리지 (Bill-eazy) — 설계 문서

> 뉴로랩 사내 **개인경비 · 주유대 청구** 웹 서비스.
> 영수증 사진을 드래그앤드롭 → AI가 자동 인식·분류 → 사용자는 **확인·수정만** → 회사 엑셀 양식 그대로 `.xlsx` 다운로드.
> 컨셉: **"AI가 초안, 사람은 승인."**

---

## 1. 아키텍처

```
[브라우저 / web (Next.js · Vercel)]                 [server (Node · Railway)]
  영수증 이미지 base64  ──────────────────────────▶  POST /api/extract
                                                       └ Claude Sonnet 5 vision (structured JSON)
                                                       └ 계정과목 룰 사전 교차 보정 + 라우팅
  ◀───────  추출 JSON(필드+계정과목추천+confidence)  ──┘
  사용자 확인·수정 (개인경비/주유대 탭)
  확정 데이터  ─────────────────────────────────────▶  POST /api/export
                                                       └ ExcelJS로 회사 양식 .xlsx 생성 (별지 영수증 첨부)
  ◀────────────────────  .xlsx 파일  ─────────────────┘
```

- **API 키(`ANTHROPIC_API_KEY`)는 오직 server(Railway)에만 보관.** 프론트/브라우저 노출 금지.
- 카드사/금융망 API는 사용하지 않음 (조건 까다로움). 인식 결과 + 룰 사전으로 계정과목 추천, 애매하면 사용자 입력.
- OCR = 순수 OCR이 아니라 **이미지 → 구조화 JSON 추출 + 계정과목 1차 추천 + 라우팅힌트**를 Claude 한 호출로.

---

## 2. 디자인 시스템 (라이트 테마 전용)

시각 소스 오브 트루스: **`billeazy.pen`** (Pencil). 아래 토큰은 `.pen` 변수와 1:1.

**컬러**
| 토큰 | 값 | 용도 |
|---|---|---|
| primary (Bill Green) | `#12B886` / hover `#0CA678` / tint `#E7F9F1` | 브랜드·주요 액션 |
| accent (Amber) | `#FF922B` | 영수증·첨부 강조 |
| bg / surface / surface-alt | `#F8F9FB` / `#FFFFFF` / `#F1F3F5` | 배경·카드·표헤더 |
| border / border-strong | `#E9ECEF` / `#DEE2E6` | 구분선 |
| text / text-secondary / text-tertiary | `#212529` / `#868E96` / `#ADB5BD` | 본문·보조 |
| success / warning / danger / info | `#12B886` / `#F59F00` / `#FA5252` / `#4DABF7` (+ *-bg) | 상태 |

**계정과목 6색** (12% 틴트 배경 + 원색 텍스트, pill)
| 복리후생비 | 여비교통비 | 접대비 | 통신비 | 지급수수료 | 소모품비 |
|---|---|---|---|---|---|
| `#12B886` | `#4DABF7` | `#F76707` | `#7048E8` | `#F783AC` | `#868E96` |

**Confidence** 높음=success / 보통=warning / 낮음=danger

**타이포** Noto Sans KR (프로덕션 목표: Pretendard). 금액·km·번호는 weight 600.
Display 28/700 · H1 24/700 · H2 20/700 · H3 18/600 · Body 14/500 · Caption 12/500.

**형태** radius 인풋/버튼 10 · 카드 16 · 모달 20 · pill 999. 간격 4·8·12·16·24·32. 카드 패딩 24.

---

## 3. 화면 구성 (5스텝 마법사 + 검토·수정 3분할 작업대)

| # | 화면 | 목적 | 핵심 |
|---|---|---|---|
| S1 | 랜딩·업로드 | 영수증 드래그앤드롭 | 대형 드롭존 + 자동분류/규칙 안내 |
| S2 | 인식중 | 추출 대기 피드백 | 파일별 진행·부분성공·재시도 |
| S3 | 검토·수정 ★ | AI 초안 확인·수정 | 좌 영수증 / 중앙 필드 / 우 요약. 개인경비/주유대 2탭 |
| S4 | 청구정보·미리보기 | 회사 양식 확인 | 엑셀 프리뷰 + 별지 + .xlsx 다운로드 |
| S5 | 완료 | 마무리·재사용 | 다운로드 + 복제·새 청구 |

**라우팅** 일반 카드전표→개인경비. 주유소/주차장 키워드→주유대 탭 자동 이동(근거+되돌리기). 오분류는 삭제 아닌 **탭 간 이동**.
**계정과목 추천** High(≥0.85) 자동확정(초록) / Mid(0.6~0.85) 확인권장(노랑) / Low(<0.6) 셀 하이라이트+후보칩(빨강). 6종 고정 enum(자유입력 금지 → SUMIF 무결성).
**주유대** 금액 = round(거리 × 310원/km). 주유 실결제액은 금액에 안 넣음(증빙만). 주차료·톨비는 실비 자동채움.

전체 화면·컴포넌트·상태 상세는 `billeazy.pen` 참조.

---

## 4. 데이터 모델 & 추출 JSON

`server/src/schema.ts` 참조. Claude가 반환하는 영수증 추출 스키마:

```jsonc
{
  "merchant": "지에이치스토어",
  "biz_no": "123-45-67890",
  "datetime": "2026-06-29T13:27:15",
  "card_type": "신한카드",
  "card_no_masked": "****1234",
  "approval_no": "30021456",
  "items": ["이노스(INNOS) TV리모컨+알카라인건전지"],
  "supply_amount": 13636,
  "vat": 1364,
  "total": 15000,
  "payment_method": "card",
  "routing_hint": "personal_expense",           // "personal_expense" | "fuel"
  "account_suggestion": "소모품비",               // 6종 or ""
  "confidence": 0.91,
  "matched_keywords": ["건전지","리모컨","스토어"]
}
```

계정과목 추천은 `server/src/categories.ts`의 룰 사전으로 confidence를 교차 보정한다.

---

## 5. 엑셀 출력 (`server/templates/`)

원본 양식 2종을 `server/templates/`에 보관.
- **개인경비** `업무관련 개인경비 사용 명세서`: 메타(부서명·성명·지출기간·결재란) + 품목표(사용일자·사용내역·거래처·적요·사용금액·계정과목·비고) + 소계 → 계정과목별 집계(SUMIF) → 합계 + 유의사항 + 별지 영수증.
- **주유대** `주유대 청구 양식`: 메타(성명·작성일자·기간·단가 310원/km) + 표(일자·목적·목적지·거리·금액·톨비·주차료·직접입력·소계) + 합계.

v1은 ExcelJS로 동일 구조를 생성. (TODO: 원본 템플릿 셀 채우기 방식으로 스타일까지 100% 일치)

---

## 6. 개발 구조

```
BillEazy/
├─ billeazy.pen              # 디자인 (Pencil, 시각 소스)
├─ DESIGN.md                 # 이 문서
├─ web/                      # 프론트엔드 (Next.js → Vercel)
│  ├─ app/                   # 라우팅·화면
│  └─ lib/api.ts             # server 호출 클라이언트
└─ server/                   # 백엔드 (Node/Express → Railway)
   ├─ src/
   │  ├─ index.ts            # Express 앱 (/api/extract, /api/export, /health)
   │  ├─ anthropic.ts        # Claude Sonnet 5 vision 추출
   │  ├─ categories.ts       # 계정과목 룰 사전 + 라우팅 + confidence
   │  ├─ schema.ts           # 추출 JSON 스키마 + 타입
   │  └─ export.ts           # ExcelJS xlsx 생성
   └─ templates/             # 회사 원본 엑셀 양식 2종
```

**모델:** `claude-sonnet-5` (사용자 보유 Sonnet API). vision + structured output.

---

## 7. 로드맵 / TODO

- [x] 설계 확정 · 디자인 토큰 · Pencil 화면 (S1~S5)
- [x] server: 추출 API + 계정과목 룰 + xlsx 생성 스캐폴딩
- [x] web: 스캐폴딩 (부팅 + 백엔드 헬스체크)
- [ ] web: S1~S5 화면 구현 (`.pen` 대조)
- [ ] HEIC/PDF 입력 변환 (현재 jpeg/png/webp)
- [ ] xlsx 원본 템플릿 셀 채우기(스타일 100% 일치) + 별지 이미지 첨부
- [ ] 다품목 분할 · 소계/합계 대사 검증
- [ ] 배포: Vercel(web) + Railway(server), 환경변수 연결
