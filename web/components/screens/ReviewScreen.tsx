'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useStore } from '@/lib/store';
import {
  ACCEPT_ATTR, Bucket, BUCKET_COLOR, BUCKET_LABEL, CAT_COLOR, bucketOf, fuelAmount, fuelSubtotal,
  isPdfRow, otherBucket, won, Row,
} from '@/lib/types';
import {
  Badge, Button, Callout, Card, CategorySelect, Checkbox, ChipButton, ConfidenceBadge,
  Divider, Dot, Field, Segmented, TextArea, Toast,
} from '@/components/primitives';
import { AlertTriangle, ArrowLeftRight, ExternalLink, FileText, Fuel, Plus, RotateCcw, Wallet } from '@/components/icons';
import { formatDate, formatDateTime, normalizeDate } from '@/lib/date';

function Thumb({ r, size }: { r: Row; size: number }) {
  return (
    <div
      style={{
        width: size, height: size, borderRadius: 8, flexShrink: 0, overflow: 'hidden',
        background: 'var(--surface-alt)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: size * 0.42, border: '1px solid var(--border)', color: 'var(--text-tertiary)',
      }}
    >
      {r.previewUrl
        ? <img src={r.previewUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : isPdfRow(r) ? <FileText size={Math.round(size * 0.5)} />
        : '🧾'}
    </div>
  );
}

/** 상세 화면의 큰 미리보기. PDF 는 첫 페이지 렌더링 이미지를 쓰고, 원본을 열 수 있게 해준다. */
function Preview({ r, width, height }: { r: Row; width: number; height: number }) {
  const pdf = isPdfRow(r);
  return (
    <div style={{ width, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div
        style={{
          width: '100%', height, borderRadius: 16, background: 'var(--surface-alt)', overflow: 'hidden',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: 8, fontSize: 64, color: 'var(--text-tertiary)', border: '1px solid var(--border)',
        }}
      >
        {r.previewUrl ? (
          // PDF 는 잘리면 확인이 안 되므로 전체가 보이게(contain), 사진은 꽉 차게(cover)
          <img src={r.previewUrl} alt="" style={{ width: '100%', height: '100%', objectFit: pdf ? 'contain' : 'cover' }} />
        ) : pdf ? (
          <>
            <FileText size={44} />
            <span style={{ fontSize: 13 }}>PDF 미리보기를 만들지 못했어요</span>
          </>
        ) : (
          '🧾'
        )}
      </div>
      {pdf && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
          <Badge color="#7048E8">
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <FileText size={11} /> PDF{r.pageCount > 1 ? ` · ${r.pageCount}쪽` : ''}
            </span>
          </Badge>
          {r.fileUrl && (
            <a
              href={r.fileUrl}
              target="_blank"
              rel="noreferrer"
              style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center', gap: 4, textDecoration: 'none' }}
            >
              <ExternalLink size={12} /> 원본 PDF 열기
            </a>
          )}
        </div>
      )}
      {pdf && r.pageCount > 1 && (
        <Callout tone="info">
          {r.pageCount}쪽짜리 PDF예요. 첫 번째 영수증 한 건만 인식했고, 별지에도 1쪽만 첨부돼요.
          여러 건이면 나눠서 올려주세요.
        </Callout>
      )}
    </div>
  );
}

const BUCKET_ICON: Record<Bucket, React.ReactNode> = {
  personal: <Wallet size={15} />,
  fuel: <Fuel size={15} />,
};

/** 이 항목이 들어갈 문서(개인경비/주유대)를 직접 고르는 스위치. */
function BucketSwitch({ row, onMove }: { row: Row; onMove: (to: Bucket) => void }) {
  const current = bucketOf(row);
  const manual = row.routedBy === 'user';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>청구 분류</span>
        {manual ? (
          <Badge color="var(--accent)">
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <ArrowLeftRight size={11} /> 수동 지정
            </span>
          </Badge>
        ) : (
          <Badge color="var(--primary)">AI 자동 분류</Badge>
        )}
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          잘못 들어갔으면 눌러서 옮기세요
        </span>
      </div>
      <Segmented<Bucket>
        full
        options={[
          { label: BUCKET_LABEL.personal, value: 'personal', icon: BUCKET_ICON.personal },
          { label: BUCKET_LABEL.fuel, value: 'fuel', icon: BUCKET_ICON.fuel },
        ]}
        value={current}
        onChange={(to) => { if (to !== current) onMove(to); }}
      />
    </div>
  );
}

export function ReviewScreen() {
  const {
    personal, fuel, failed, subtotal, fuelTotal, categoryTotals, needsReview, movedCount, undo,
    meta, setMeta, updateRow, removeRow, retryRow, moveRow, moveRows, undoMove, dismissUndo,
    addFiles, addFuelEntry, setStep,
  } = useStore();

  const [tab, setTab] = useState<Bucket>('personal');
  const [selId, setSelId] = useState<string | null>(null);
  const [checked, setChecked] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const list = tab === 'personal' ? personal : fuel;
  const sel = list.find((r) => r.id === selId) ?? list[0];
  const checkedHere = list.filter((r) => checked.includes(r.id));
  const allChecked = list.length > 0 && checkedHere.length === list.length;

  // 되돌리기 안내는 잠시 뒤 자동으로 사라진다.
  const undoKey = undo ? `${undo.to}:${undo.rows.map((r) => r.id).join(',')}` : '';
  useEffect(() => {
    if (!undoKey) return;
    const t = setTimeout(() => dismissUndo(), 9000);
    return () => clearTimeout(t);
  }, [undoKey, dismissUndo]);

  function switchTab(next: Bucket) {
    setTab(next);
    setSelId(null);
    setChecked([]);
  }

  // 항목을 옮기고, 옮겨간 탭으로 따라가서 그대로 선택해 준다.
  function move(id: string, to: Bucket) {
    moveRow(id, to);
    setTab(to);
    setSelId(id);
    setChecked([]);
  }

  function moveChecked(to: Bucket) {
    const ids = checkedHere.map((r) => r.id);
    if (!ids.length) return;
    moveRows(ids, to);
    setTab(to);
    setSelId(ids[0]);
    setChecked([]);
  }

  function restore() {
    const back = undo ? otherBucket(undo.to) : tab;
    const first = undo?.rows[0]?.id ?? null;
    undoMove();
    setTab(back);
    setSelId(first);
    setChecked([]);
  }

  const other = otherBucket(tab);

  return (
    <div>
      {/* 상단 바 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, padding: '12px 24px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <Segmented<Bucket>
            options={[
              { label: BUCKET_LABEL.personal, value: 'personal', count: personal.length, icon: BUCKET_ICON.personal },
              { label: BUCKET_LABEL.fuel, value: 'fuel', count: fuel.length, icon: BUCKET_ICON.fuel },
            ]}
            value={tab}
            onChange={switchTab}
          />
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            AI가 자동으로 분류했어요. 탭이 잘못됐으면 <ArrowLeftRight size={12} style={{ verticalAlign: -2 }} /> 로 옮기면 돼요
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {movedCount > 0 && (
            <Badge color="var(--accent)">
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <ArrowLeftRight size={12} /> 수동 지정 {movedCount}건
              </span>
            </Badge>
          )}
          {needsReview > 0 && (
            <Badge color="var(--warning)"><span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><AlertTriangle size={12} /> 확인 필요 {needsReview}건</span></Badge>
          )}
        </div>
      </div>

      {/* 읽지 못한 파일 안내 (청구 목록에는 넣지 않는다) */}
      {failed.length > 0 && (
        <div style={{ padding: '0 24px 12px' }}>
          <Callout tone="danger">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <b>{failed.length}개 파일은 청구에 넣지 못했어요</b>
              {failed.map((f) => (
                <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-secondary)' }}>
                  <span style={{ color: 'var(--text)' }}>{f.fileName || '이름 없는 파일'}</span>
                  <span>— {f.errorMsg || '인식하지 못했어요'}</span>
                  {f.retryable !== false && (
                    <ChipButton tone="primary" onClick={() => void retryRow(f.id)} title="이 파일만 다시 인식">
                      <RotateCcw size={12} /> 다시 시도
                    </ChipButton>
                  )}
                  <ChipButton onClick={() => removeRow(f.id)} title="목록에서 지우기">지우기</ChipButton>
                </div>
              ))}
            </div>
          </Callout>
        </div>
      )}

      {/* 본문 3분할 */}
      <div style={{ display: 'flex', gap: 16, padding: '0 24px 24px', alignItems: 'flex-start' }}>
        {/* A 좌 컬럼: 리스트 */}
        <div style={{ width: 340, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* 목록 헤더: 전체 선택 + 여러 건 한 번에 옮기기 */}
          {list.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '2px 4px' }}>
              <span
                onClick={() => setChecked(allChecked ? [] : list.map((r) => r.id))}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: 'var(--text-secondary)' }}
              >
                <Checkbox checked={allChecked} onChange={() => setChecked(allChecked ? [] : list.map((r) => r.id))} label="전체 선택" />
                {checkedHere.length > 0 ? `${checkedHere.length}건 선택됨` : '전체 선택'}
              </span>
              {checkedHere.length > 0 && (
                <ChipButton tone="primary" onClick={() => moveChecked(other)} title={`선택한 ${checkedHere.length}건을 ${BUCKET_LABEL[other]}(으)로 이동`}>
                  <ArrowLeftRight size={12} /> {BUCKET_LABEL[other]}로 이동
                </ChipButton>
              )}
            </div>
          )}

          {list.length === 0 ? (
            <Card style={{ padding: 32, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.6 }}>
              {tab === 'personal'
                ? '개인경비 항목이 없어요. 주유대 탭에서 영수증을 이쪽으로 옮길 수 있어요'
                : '개인 자차로 출장 이동한 게 있으면 아래에서 추가하거나, 개인경비 탭의 영수증을 주유대로 옮기세요'}
            </Card>
          ) : (
            list.map((r) => {
              const active = sel?.id === r.id;
              const isChecked = checked.includes(r.id);
              return (
                <Card
                  key={r.id}
                  onClick={() => setSelId(r.id)}
                  style={{
                    padding: 14, cursor: 'pointer',
                    borderLeft: active ? '3px solid var(--primary)' : '3px solid transparent',
                    boxShadow: active ? '0 4px 12px #0000001a' : '0 1px 3px #0000000d',
                    display: 'flex', flexDirection: 'column', gap: 10,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', minWidth: 0 }}>
                      <div style={{ paddingTop: 11 }}>
                        <Checkbox
                          checked={isChecked}
                          label="선택"
                          onChange={(v) => setChecked((prev) => (v ? [...prev, r.id] : prev.filter((x) => x !== r.id)))}
                        />
                      </div>
                      <Thumb r={r} size={40} />
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
                        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {r.merchant || (r.fileName ? '(거래처 미확인)' : '직접 추가한 항목')}
                        </span>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                          <Badge color={BUCKET_COLOR[tab]}>{BUCKET_LABEL[tab]}</Badge>
                          {isPdfRow(r) && (
                            <Badge color="#7048E8">
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><FileText size={10} /> PDF</span>
                            </Badge>
                          )}
                          {r.routedBy === 'user' && r.fileName ? (
                            <Badge color="var(--accent)">수동</Badge>
                          ) : (
                            tab === 'personal' && <ConfidenceBadge confidence={r.confidence} />
                          )}
                        </div>
                      </div>
                    </div>
                    <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--primary)', whiteSpace: 'nowrap' }}>
                      {won(tab === 'personal' ? r.total : fuelSubtotal(r))}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <ChipButton onClick={() => move(r.id, other)} title={`${BUCKET_LABEL[other]}(으)로 옮기기`}>
                      <ArrowLeftRight size={12} /> {BUCKET_LABEL[other]}로
                    </ChipButton>
                  </div>
                </Card>
              );
            })
          )}

          <input
            ref={fileRef}
            type="file"
            accept={ACCEPT_ATTR}
            multiple
            style={{ display: 'none' }}
            onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }}
          />
          {tab === 'personal' ? (
            <Button variant="ghost" full onClick={() => fileRef.current?.click()}>
              <Plus size={16} /> 영수증 더 올리기
            </Button>
          ) : (
            <Button variant="ghost" full onClick={() => setSelId(addFuelEntry())}>
              <Plus size={16} /> 주유대 항목 추가
            </Button>
          )}
        </div>

        {/* B 중앙 컬럼: 폼 */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {!sel ? (
            <Card style={{ padding: 48, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 14 }}>
              왼쪽에서 영수증을 선택해 주세요
            </Card>
          ) : tab === 'personal' ? (
            <Card style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <BucketSwitch row={sel} onMove={(to) => move(sel.id, to)} />
              <Divider />
              <div style={{ display: 'flex', gap: 20 }}>
                {/* 영수증 미리보기 (이미지 / PDF 첫 페이지) */}
                <Preview r={sel} width={320} height={460} />
                {/* 폼 우측 */}
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <Field ai label="사용일자" value={formatDateTime(sel.datetime)} readOnly />
                  <Field label="사용내역" value={sel.items.join(', ')} onChange={(v) => updateRow(sel.id, { items: v ? [v] : [] })} />
                  <Field ai label="거래처" value={sel.merchant} readOnly />
                  <div style={{ display: 'flex', gap: 12 }}>
                    <Field ai label="사업자등록번호" value={sel.biz_no} readOnly width="50%" />
                    <Field ai label="승인/카드" value={`${sel.card_type} ${sel.card_no_masked}`} readOnly width="50%" />
                  </div>
                  <Field ai label="사용금액" value={won(sel.total)} readOnly right />

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>계정과목</span>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                      <CategorySelect value={sel.category} onChange={(c) => updateRow(sel.id, { category: c })} />
                      <ConfidenceBadge confidence={sel.confidence} />
                      {sel.matched_keywords.length > 0 && (
                        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                          {sel.matched_keywords.join('·')} 로 추천
                        </span>
                      )}
                    </div>
                  </div>

                  <TextArea
                    label="적요(사유)"
                    value={sel.note}
                    onChange={(v) => updateRow(sel.id, { note: v })}
                    required
                    placeholder="예: 회의실 TV 리모컨 교체"
                  />
                  <Field label="비고" value={sel.remark} onChange={(v) => updateRow(sel.id, { remark: v })} />

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                    <Button variant="secondary" onClick={() => { removeRow(sel.id); setSelId(null); }}>이 영수증 삭제</Button>
                    <Button variant="ghost" onClick={() => move(sel.id, 'fuel')}>
                      <ArrowLeftRight size={16} /> 주유대로 이동
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          ) : (
            <Card style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <BucketSwitch row={sel} onMove={(to) => move(sel.id, to)} />
              <Divider />
              <div style={{ display: 'flex', gap: 20 }}>
                {/* 영수증에서 옮겨온 항목이면 미리보기도 같이 보여준다 */}
                {sel.fileName && <Preview r={sel} width={280} height={400} />}
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {sel.parkingAuto && (
                    <Callout tone="info">
                      영수증 인식 금액 {won(sel.total)} 을 주차료 칸에 자동으로 넣었어요. 톨비·직접입력이 맞다면 옮겨 적어 주세요.
                    </Callout>
                  )}
                  {/* 영수증에서 옮겨온 항목은 인식된 일시가 들어오므로 날짜만 보여준다 */}
                  <Field
                    label="일자"
                    value={formatDate(sel.datetime)}
                    onChange={(v) => updateRow(sel.id, { datetime: normalizeDate(v) || v })}
                    placeholder="예: 2026/06/15"
                  />
                  <Field required label="목적" value={sel.purpose} onChange={(v) => updateRow(sel.id, { purpose: v })} placeholder="예: 미팅" />
                  <Field required label="목적지" value={sel.destination} onChange={(v) => updateRow(sel.id, { destination: v })} placeholder="예: 판교 고객사" />
                  <Field
                    required
                    type="number"
                    label="거리(km)"
                    value={sel.distanceKm ?? ''}
                    onChange={(v) => updateRow(sel.id, { distanceKm: v ? Number(v) : null })}
                    placeholder="예: 32"
                  />
                  <div style={{ display: 'flex', gap: 12 }}>
                    <Field readOnly label="단가" value="310원/km" width="50%" />
                    <Field readOnly right label="금액(거리×단가)" value={won(fuelAmount(sel))} width="50%" />
                  </div>
                  <div style={{ display: 'flex', gap: 12 }}>
                    <Field type="number" label="톨비" value={sel.toll} onChange={(v) => updateRow(sel.id, { toll: Number(v) || 0 })} width="33.33%" />
                    <Field
                      type="number"
                      label="주차료"
                      value={sel.parking}
                      onChange={(v) => updateRow(sel.id, { parking: Number(v) || 0, parkingAuto: false })}
                      width="33.33%"
                    />
                    <Field type="number" label="직접입력" value={sel.etc} onChange={(v) => updateRow(sel.id, { etc: Number(v) || 0 })} width="33.33%" />
                  </div>
                  <Field readOnly right label="소계" value={won(fuelSubtotal(sel))} />
                  <Callout tone="warning" icon="⚠️">
                    톨게이트·주차료 영수증은 첨부 필수예요. 자동으로 별지에 첨부돼요.
                  </Callout>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                    <Button variant="secondary" onClick={() => { removeRow(sel.id); setSelId(null); }}>이 항목 삭제</Button>
                    <Button variant="ghost" onClick={() => move(sel.id, 'personal')}>
                      <ArrowLeftRight size={16} /> 개인경비로 이동
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          )}
        </div>

        {/* C 우 사이드바 */}
        <Card style={{ width: 320, flexShrink: 0, position: 'sticky', top: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>청구 요약</span>
          <Field label="부서명" value={meta.dept} onChange={(v) => setMeta({ dept: v })} />
          <Field label="성명" value={meta.name} onChange={(v) => setMeta({ name: v })} placeholder="이름" />
          <Field label="지출 기간" value={meta.period} onChange={(v) => setMeta({ period: v })} placeholder="2026/06/01 ~ 2026/06/30" />
          <Divider />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, color: 'var(--text-secondary)' }}>
            <span>소계</span>
            <span style={{ color: 'var(--text)', fontWeight: 600 }}>{won(subtotal)}</span>
          </div>
          {categoryTotals.map(({ category, sum }) => (
            <div key={category} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: 'var(--text-secondary)' }}>
                <Dot color={CAT_COLOR[category]} />
                {category}
              </span>
              <span style={{ color: 'var(--text)' }}>{won(sum)}</span>
            </div>
          ))}
          <Divider />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 14, color: 'var(--text)', fontWeight: 600 }}>합계</span>
            <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--primary)' }}>{won(subtotal)}</span>
          </div>
          {fuel.length > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 14, color: 'var(--text-secondary)' }}>
              <span>주유대 합계</span>
              <span style={{ color: 'var(--text)', fontWeight: 600 }}>{won(fuelTotal)}</span>
            </div>
          )}
          <Callout tone="warning" icon="⚠️">
            식대 항목은 인당 8,000원 기준이에요. 인원 수 확인해 주세요.
          </Callout>
          <Button variant="primary" full onClick={() => setStep('preview')}>미리보기 만들기</Button>
        </Card>
      </div>

      {/* 이동 직후 되돌리기 */}
      {undo && (
        <Toast actionLabel="되돌리기" onAction={restore} onClose={dismissUndo}>
          {undo.count}건을 <b>{BUCKET_LABEL[undo.to]}</b>(으)로 옮겼어요
        </Toast>
      )}
    </div>
  );
}
