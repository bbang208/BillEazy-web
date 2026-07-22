'use client';

import React, { useRef, useState } from 'react';
import { useStore } from '@/lib/store';
import { CAT_COLOR, fuelAmount, fuelSubtotal, won, Row } from '@/lib/types';
import {
  Badge, Button, Callout, Card, CategorySelect, ConfidenceBadge,
  Divider, Dot, Field, Segmented, TextArea,
} from '@/components/primitives';
import { AlertTriangle, Plus } from '@/components/icons';

function Thumb({ r, size }: { r: Row; size: number }) {
  return (
    <div
      style={{
        width: size, height: size, borderRadius: 8, flexShrink: 0, overflow: 'hidden',
        background: 'var(--surface-alt)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: size * 0.42, border: '1px solid var(--border)',
      }}
    >
      {r.previewUrl
        ? <img src={r.previewUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : '🧾'}
    </div>
  );
}

export function ReviewScreen() {
  const {
    personal, fuel, subtotal, fuelTotal, categoryTotals, needsReview,
    meta, setMeta, updateRow, removeRow, moveRow, addFiles, setStep,
  } = useStore();

  const [tab, setTab] = useState<'personal' | 'fuel'>('personal');
  const [selId, setSelId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const list = tab === 'personal' ? personal : fuel;
  const sel = list.find((r) => r.id === selId) ?? list[0];

  return (
    <div>
      {/* 상단 바 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, padding: '12px 24px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <Segmented
            options={[
              { label: '개인경비', value: 'personal', count: personal.length },
              { label: '주유대', value: 'fuel', count: fuel.length },
            ]}
            value={tab}
            onChange={(v) => { setTab(v); setSelId(null); }}
          />
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            AI가 채운 값이에요. 확인하고 필요하면 고쳐주세요
          </span>
        </div>
        {needsReview > 0 && (
          <Badge color="var(--warning)"><span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><AlertTriangle size={12} /> 확인 필요 {needsReview}건</span></Badge>
        )}
      </div>

      {/* 본문 3분할 */}
      <div style={{ display: 'flex', gap: 16, padding: '0 24px 24px', alignItems: 'flex-start' }}>
        {/* A 좌 컬럼: 리스트 */}
        <div style={{ width: 340, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {list.length === 0 ? (
            <Card style={{ padding: 32, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 14 }}>
              이 유형 영수증이 없어요
            </Card>
          ) : (
            list.map((r) => {
              const active = sel?.id === r.id;
              return (
                <Card
                  key={r.id}
                  onClick={() => setSelId(r.id)}
                  style={{
                    padding: 14, cursor: 'pointer',
                    borderLeft: active ? '3px solid var(--primary)' : '3px solid transparent',
                    boxShadow: active ? '0 4px 12px #0000001a' : '0 1px 3px #0000000d',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', minWidth: 0 }}>
                      <Thumb r={r} size={40} />
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
                        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {r.merchant || '(거래처 미확인)'}
                        </span>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                          <Badge color={tab === 'personal' ? '#868E96' : '#4DABF7'}>
                            {tab === 'personal' ? '개인경비' : '주유대'}
                          </Badge>
                          {tab === 'personal' && <ConfidenceBadge confidence={r.confidence} />}
                        </div>
                      </div>
                    </div>
                    <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--primary)', whiteSpace: 'nowrap' }}>
                      {won(tab === 'personal' ? r.total : fuelSubtotal(r))}
                    </span>
                  </div>
                </Card>
              );
            })
          )}

          <input
            ref={fileRef}
            type="file"
            accept="image/*,.pdf"
            multiple
            style={{ display: 'none' }}
            onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }}
          />
          <Button variant="ghost" full onClick={() => fileRef.current?.click()}>
            <Plus size={16} /> 영수증 더 올리기
          </Button>
        </div>

        {/* B 중앙 컬럼: 폼 */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {!sel ? (
            <Card style={{ padding: 48, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 14 }}>
              왼쪽에서 영수증을 선택해 주세요
            </Card>
          ) : tab === 'personal' ? (
            <Card style={{ display: 'flex', gap: 20 }}>
              {/* 영수증 이미지 */}
              <div style={{ width: 320, height: 460, borderRadius: 16, background: 'var(--surface-alt)', flexShrink: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 64 }}>
                {sel.previewUrl
                  ? <img src={sel.previewUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : '🧾'}
              </div>
              {/* 폼 우측 */}
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <Field ai label="사용일자" value={sel.datetime} readOnly />
                <Field ai label="사용내역" value={sel.items.join(', ')} readOnly />
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
                  <Button variant="ghost" onClick={() => { moveRow(sel.id, 'fuel'); setSelId(null); }}>주유대로 이동</Button>
                </div>
              </div>
            </Card>
          ) : (
            <Card style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <Field ai label="일자" value={sel.datetime} readOnly />
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
                <Field type="number" label="주차료" value={sel.parking} onChange={(v) => updateRow(sel.id, { parking: Number(v) || 0 })} width="33.33%" />
                <Field type="number" label="직접입력" value={sel.etc} onChange={(v) => updateRow(sel.id, { etc: Number(v) || 0 })} width="33.33%" />
              </div>
              <Field readOnly right label="소계" value={won(fuelSubtotal(sel))} />
              <Callout tone="warning" icon="⚠️">
                톨게이트·주차료 영수증은 첨부 필수예요. 자동으로 별지에 첨부돼요.
              </Callout>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                <Button variant="secondary" onClick={() => { removeRow(sel.id); setSelId(null); }}>이 영수증 삭제</Button>
                <Button variant="ghost" onClick={() => { moveRow(sel.id, 'personal'); setSelId(null); }}>개인경비로 이동</Button>
              </div>
            </Card>
          )}
        </div>

        {/* C 우 사이드바 */}
        <Card style={{ width: 320, flexShrink: 0, position: 'sticky', top: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>청구 요약</span>
          <Field label="부서명" value={meta.dept} onChange={(v) => setMeta({ dept: v })} />
          <Field label="성명" value={meta.name} onChange={(v) => setMeta({ name: v })} placeholder="이름" />
          <Field label="지출 기간" value={meta.period} onChange={(v) => setMeta({ period: v })} placeholder="2026-06-01 ~ 2026-06-30" />
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
    </div>
  );
}
