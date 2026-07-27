// 하이웍스 전자결재 연동: 기안(페이지 연동) + 문서 상태 조회.
// - 기안: POST api.hiworks.com/office/approval/documents → 본문·첨부가 미리 채워진 기안 팝업 URL(login_url)을 받는다.
//   실제 상신은 사용자가 팝업에서 결재선을 지정하고 [기안하기]를 눌러야 완료된다(API 만으로 자동 상신 불가).
// - 상태: 기안/반려/취소/완료 시 하이웍스가 callback_url 로 GET 을 보내고,
//   GET api.hiworks.com/approval/v2/documents/{approval_id} 로 재조회할 수 있다.
// officeToken 은 오피스 전체 권한이므로 이 서버에만 두고 브라우저에는 노출하지 않는다.

const DRAFT_URL = 'https://api.hiworks.com/office/approval/documents';
const DOCUMENT_URL = 'https://api.hiworks.com/approval/v2/documents';

export const hiworksToken = () => (process.env.HIWORKS_OFFICE_TOKEN ?? '').trim();
export const hiworksFormId = () => (process.env.HIWORKS_FORM_ID ?? '').trim();

export class HiworksError extends Error {
  status: number;
  code: string;
  detail?: string;
  constructor(status: number, code: string, message: string, detail?: string) {
    super(message);
    this.name = 'HiworksError';
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

export interface DraftFile {
  file_name: string;
  file: string; // base64
}

export interface DraftRequest {
  subject: string;
  contents: string; // html 또는 text
  callbackUrl: string;
  files?: DraftFile[];
  state?: string; // 콜백 검증용 값. request_hash 로 그대로 회신된다.
}

export interface DraftResult {
  approvalKey: string;
  loginUrl: string; // 새 창으로 열어 결재선 지정 후 [기안하기]
}

function headers() {
  return {
    Authorization: `Bearer ${hiworksToken()}`,
    'Content-Type': 'application/json',
  };
}

function ensureConfigured() {
  if (!hiworksToken()) throw new HiworksError(503, 'no_token', '하이웍스 오피스 토큰이 설정되지 않았어요. (HIWORKS_OFFICE_TOKEN)');
  if (!hiworksFormId()) throw new HiworksError(503, 'no_form', '하이웍스 양식 아이디가 설정되지 않았어요. (HIWORKS_FORM_ID)');
}

// 기안 문서 생성 → 기안하기 팝업 URL 반환
export async function createDraft(req: DraftRequest): Promise<DraftResult> {
  ensureConfigured();
  const r = await fetch(DRAFT_URL, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      form_id: hiworksFormId(),
      subject: req.subject,
      contents: req.contents,
      callback_url: req.callbackUrl,
      // 팝업에서 본문·첨부를 사람이 고칠 수 있게 열어둔다(최종 확인 단계 역할).
      modify_contents_flag: 'Y',
      modify_files_flag: 'Y',
      ...(req.files?.length ? { files: req.files } : {}),
      ...(req.state ? { state: req.state } : {}),
    }),
  });
  const body = (await r.json().catch(() => ({}))) as {
    code?: string;
    message?: string;
    msg?: string;
    data?: { approval_key?: string; login_url?: string };
  };
  if (!r.ok || body.code !== 'SUC' || !body.data?.login_url) {
    const detail = JSON.stringify(body);
    throw new HiworksError(502, 'draft_failed', body.message || body.msg || '전자결재 기안 문서를 만들지 못했어요.', detail);
  }
  return { approvalKey: body.data.approval_key ?? '', loginUrl: body.data.login_url };
}

// 문서 상태 조회: progress(진행)·rejected(반려)·canceled(취소)·complete(완료)·deleted(삭제)
export async function documentState(approvalId: string): Promise<string> {
  if (!hiworksToken()) throw new HiworksError(503, 'no_token', '하이웍스 오피스 토큰이 설정되지 않았어요. (HIWORKS_OFFICE_TOKEN)');
  const r = await fetch(`${DOCUMENT_URL}/${encodeURIComponent(approvalId)}`, { headers: headers() });
  const body = (await r.json().catch(() => ({}))) as {
    code?: string;
    msg?: string;
    message?: string;
    data?: { attributes?: { state?: string } };
  };
  const state = body.data?.attributes?.state;
  if (!state) {
    throw new HiworksError(502, 'status_failed', body.msg || body.message || '문서 상태를 조회하지 못했어요.', JSON.stringify(body));
  }
  return state;
}

// 하이웍스 콜백 수신 기록. 서버 재시작 시 사라지는 메모리 저장이며,
// 필요하면 문서 상태 조회 API 로 언제든 재확인할 수 있다.
export interface ApprovalEvent {
  officeId: string;
  approvalKey: string;
  approvalId: string;
  approvalCode: string; // 예) QW-테스트-근무-2022-0004
  state: string;
  requestHash: string; // 기안 요청 시 보낸 state 값 그대로
  receivedAt: string;
}

const events: ApprovalEvent[] = [];

export function recordCallback(q: Record<string, unknown>): ApprovalEvent {
  const s = (k: string) => String(q[k] ?? '');
  const ev: ApprovalEvent = {
    officeId: s('office_id'),
    approvalKey: s('approval_key'),
    approvalId: s('approval_id'),
    approvalCode: s('approval_code'),
    state: s('state'),
    requestHash: s('request_hash'),
    receivedAt: new Date().toISOString(),
  };
  events.push(ev);
  return ev;
}

export const approvalEvents = () => [...events];
