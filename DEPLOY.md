# 배포 가이드 (Vercel + Railway)

하나의 모노레포에서 **web은 Vercel**, **server는 Railway**에 각각 배포한다.
각 플랫폼은 "Root Directory(하위 폴더)"만 지정하면 됨.

## 1) Railway — `server` (백엔드)
1. New Project → Deploy from GitHub repo → 이 레포 선택
2. Service → Settings → **Root Directory = `server`**
3. 빌드/실행은 자동(Nixpacks): `npm install → npm run build → npm start`
4. **Variables(환경변수)** 등록:
   | 이름 | 값 |
   |---|---|
   | `ANTHROPIC_API_KEY` | Claude API 키 |
   | `ALLOWED_ORIGIN` | `https://<vercel-도메인>` (아래 Vercel 배포 후) |
   | `MOCK_EXTRACT` | `0` |
   > `PORT`는 설정하지 말 것 — Railway가 자동 주입하고 서버가 `process.env.PORT`를 읽음.
5. 배포 후 **서버 도메인**(예: `https://billeazy-server.up.railway.app`) 확보 → Vercel에서 사용.

## 2) Vercel — `web` (프론트)
1. Add New… → Project → 이 레포 Import
2. **Root Directory = `web`** 지정 (Next.js 자동 인식)
3. **Environment Variables**:
   | 이름 | 값 |
   |---|---|
   | `NEXT_PUBLIC_API_BASE` | `https://<railway-서버-도메인>` |
4. Deploy → **web 도메인** 확보.

## 3) 마무리 (CORS 연결)
- Railway `ALLOWED_ORIGIN`을 위에서 확보한 **web 도메인**으로 설정 → 서버 재배포.

### 권장 순서
Railway 먼저 배포(서버 URL 확보) → Vercel 배포(`NEXT_PUBLIC_API_BASE` 입력) → Railway `ALLOWED_ORIGIN`에 web URL 넣고 재배포.

## 참고
- `.env`는 git에 올라가지 않음 → 키/설정은 각 플랫폼 대시보드 Variables에만 입력.
- 이후 `git push` 하면 Vercel·Railway가 자동 재배포됨.
- 로컬 개발: `server`에서 `npm run dev`(:8080), `web`에서 `npm run dev`(:3000).
