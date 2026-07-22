# 빌리지 · Bill-eazy

영수증만 던지면 AI가 청구서를 만들어주는 사내 경비·주유대 청구 웹 서비스.
설계·화면 구성은 [`DESIGN.md`](./DESIGN.md), 디자인 시안은 `billeazy.pen`(Pencil) 참조.

## 구성
- `web/` — 프론트엔드 (Next.js, Vercel 배포 대상)
- `server/` — 백엔드 (Node/Express, Railway 배포 대상). Claude Sonnet 5 vision으로 영수증 추출 + 계정과목 추천 + xlsx 생성.

## 로컬 실행

### 1) server (백엔드)
```bash
cd server
cp .env.example .env        # ANTHROPIC_API_KEY 입력
npm install
npm run dev                 # http://localhost:8080
```

### 2) web (프론트엔드)
```bash
cd web
npm install
npm run dev                 # http://localhost:3000
```

`web`은 `NEXT_PUBLIC_API_BASE`(기본 `http://localhost:8080`)로 server를 호출한다.

## 환경변수
| 위치 | 변수 | 설명 |
|---|---|---|
| server | `ANTHROPIC_API_KEY` | Claude API 키 (**여기에만** 보관) |
| server | `PORT` | 기본 8080 |
| server | `ALLOWED_ORIGIN` | CORS 허용 오리진 (기본 `http://localhost:3000`) |
| web | `NEXT_PUBLIC_API_BASE` | server 주소 (기본 `http://localhost:8080`) |
