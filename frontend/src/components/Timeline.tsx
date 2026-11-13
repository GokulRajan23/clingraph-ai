import { useMemo } from 'react'
import { CATEGORY, FIELD, FLAGS, formatTime, RELATION, SIDE } from '../labels'
import { buildTimeline, DEFAULT_FILTERS, LEGEND, summarize, UNDATED, type Card, type Filters, type Row } from '../lib/timeline'
import type { Category, Doc, FindingsPayload } from '../types'
import { CATEGORIES } from '../types'
import { ReviewBadge, StateChip } from './common'

interface Props {
  docs: Doc[]
  linked: FindingsPayload
  filters: Filters
  onFilters: (filters: Filters) => void
  selected: string | null
  onSelect: (observationId: string) => void
  onDocuments: () => void
}

export function Timeline({ docs, linked, filters, onFilters, selected, onSelect, onDocuments }: Props) {
  const model = useMemo(() => buildTimeline(docs, linked, filters), [docs, linked, filters])
  const totals = summarize(linked)
  const stale = linked.corrections.filter((c) => c.stale)
  // Phase 4 flags live on the extracted event, not on the linker observation.
  const flags = useMemo(() => {
    const index = new Map<string, string[]>()
    for (const d of docs) for (const e of d.extraction?.events ?? []) index.set(e.id, e.flags)
    return index
  }, [docs])
  const toggle = (category: Category) =>
    onFilters({
      ...filters,
      categories: filters.categories.includes(category) ? filters.categories.filter((c) => c !== category) : [...filters.categories, category],
    })
  const filtered = JSON.stringify(filters) !== JSON.stringify(DEFAULT_FILTERS)

  return (
    <section className="timeline-view" aria-label="Timeline">
      <div className="top">
        <div>
          <div className="eyebrow">Follow. Verify. Correct.</div>
          <h1>Every finding, report by report.</h1>
          <p className="muted">
            {totals.findings} findings · {totals.links} links · {totals.needReview} need review · {totals.corrections} corrections
            {totals.stale ? ` · ${totals.stale} stale` : ''}
          </p>
        </div>
      </div>
      <p className="muted explain">
        Rows are findings; cards sit under the report that documents them, by report date. Links come from fixed rules: an explicit comparison
        date in the report, or the same finding and side in an earlier report (always flagged for review). Not mentioned ≠ resolved. First
        documented ≠ onset.
      </p>

      <div className="filters" role="group" aria-label="Timeline filters">
        <div className="chips">
          {CATEGORIES.map((c) => (
            <button key={c} className={`chip ${filters.categories.includes(c) ? 'on' : ''}`} aria-pressed={filters.categories.includes(c)} onClick={() => toggle(c)}>
              {filters.categories.includes(c) ? '✓ ' : ''}
              {CATEGORY[c]}
            </button>
          ))}
        </div>
        <label>
          From <input type="date" value={filters.from} onChange={(e) => onFilters({ ...filters, from: e.target.value })} />
        </label>
        <label>
          To <input type="date" value={filters.to} onChange={(e) => onFilters({ ...filters, to: e.target.value })} />
        </label>
        <label className="check">
          <input type="checkbox" checked={filters.showRejected} onChange={(e) => onFilters({ ...filters, showRejected: e.target.checked })} /> Show
          rejected events
        </label>
        {filtered && (
          <button className="link-button" onClick={() => onFilters(DEFAULT_FILTERS)}>
            Reset filters
          </button>
        )}
      </div>

      <ul className="legend" aria-label="Legend">
        {LEGEND.map((s) => (
          <li key={s}>
            <StateChip state={s} />
          </li>
        ))}
      </ul>

      {linked.unresolved.length > 0 && (
        <div className="notice">
          {linked.unresolved.map((u) => (
            <p key={`${u.observation}:${u.comparison_date}`}>⚠ {u.message}</p>
          ))}
        </div>
      )}
      {stale.length > 0 && (
        <details className="notice stale">
          <summary>
            {stale.length} stale correction{stale.length > 1 ? 's' : ''}: target no longer present
          </summary>
          <p className="muted">These corrections were made on evidence that a later extraction no longer contains. They are kept, not applied.</p>
          {stale.map((c) => (
            <p key={c.id} className="detail">
              {c.target.filename ?? 'Report'} · {c.target.report_date ?? 'date unknown'} · “{c.target.quote}” · {c.action}
              {Object.entries(c.changes).map(([f, v]) => ` · ${FIELD[f as keyof typeof FIELD] ?? f} → ${v ?? 'not stated'}`)} · {formatTime(c.at)}
            </p>
          ))}
        </details>
      )}

      {!model.columns.length ? (
        <div className="viewer empty">
          <h2>No extracted reports yet.</h2>
          <p className="muted">Extract events in the Documents view; the timeline is built from them.</p>
          <button className="primary" onClick={onDocuments}>
            Go to documents
          </button>
        </div>
      ) : (
        <>
          {model.hiddenFindings > 0 && (
            <p className="muted">
              {model.hiddenFindings} finding{model.hiddenFindings > 1 ? 's' : ''} hidden by filters.
            </p>
          )}
          <div className="timeline-scroll">
            <table className="timeline">
              <thead>
                <tr>
                  <th scope="col" className="corner">
                    Finding
                  </th>
                  {model.columns.map((c) => (
                    <th key={c.key} scope="col" className={c.key === UNDATED ? 'undated' : ''}>
                      <span className="col-date">{c.date ?? 'Undated'}</span>
                      <span className="col-file">{c.key === UNDATED ? 'Order unknown' : c.reports[0].filename}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {model.rows.map((row) => (
                  <TimelineRow key={row.key} row={row} columns={model.columns} selected={selected} onSelect={onSelect} flags={flags} />
                ))}
                {model.rejectedRow && (
                  <TimelineRow row={model.rejectedRow} columns={model.columns} selected={selected} onSelect={onSelect} flags={flags} />
                )}
              </tbody>
            </table>
          </div>
          {!model.rows.length && <p className="muted">No findings match the filters.</p>}
        </>
      )}
    </section>
  )
}

function TimelineRow({ row, columns, selected, onSelect, flags }: {
  row: Row
  columns: ReturnType<typeof buildTimeline>['columns']
  selected: string | null
  onSelect: (id: string) => void
  flags: Map<string, string[]>
}) {
  const f = row.finding
  return (
    <tr className={f ? '' : 'rejected-row'}>
      <th scope="row">
        {f ? (
          <>
            <span className="row-concept">{f.concept}</span>
            {f.laterality && <span className="muted"> · {SIDE[f.laterality]}</span>}
            {f.review_required && <span className="review-flag">⚑ needs review</span>}
            <span className="row-first">
              First documented in this collection: {f.first_documented ?? 'not documented as present'}
              {f.first_documented_uncertain && ' (uncertain: an undated report also mentions it)'}
            </span>
          </>
        ) : (
          <>
            <span className="row-concept">Rejected events</span>
            <span className="row-first">Excluded from linking</span>
          </>
        )}
      </th>
      {columns.map((c) => (
        <td key={c.key} className={c.key === UNDATED ? 'undated' : ''}>
          {(row.cells[c.key] ?? []).map((card) => (
            <TimelineCard
              key={card.observation.id}
              card={card}
              rowLabel={f?.concept ?? null}
              undated={c.key === UNDATED}
              selected={selected === card.observation.id}
              onSelect={onSelect}
              flags={flags.get(card.observation.event_id) ?? []}
            />
          ))}
        </td>
      ))}
    </tr>
  )
}

function TimelineCard({ card, rowLabel, undated, selected, onSelect, flags }: {
  card: Card
  rowLabel: string | null
  undated: boolean
  selected: boolean
  onSelect: (id: string) => void
  flags: string[]
}) {
  const o = card.observation
  return (
    <button className={`card card-${card.state} ${selected ? 'selected' : ''}`} aria-pressed={selected} onClick={() => onSelect(o.id)}>
      <StateChip state={card.state} short />
      {o.concept !== rowLabel && <strong className="card-concept">{o.concept}</strong>}
      {undated && <span className="card-meta">{o.filename}</span>}
      {card.markers.map((m) => (
        <span key={m} className="marker">
          {m}
        </span>
      ))}
      {o.measurements.length > 0 && <span className="card-meta">{o.measurements.join(', ')}</span>}
      <span className="card-meta">{o.event_date ? `Event date ${o.event_date}` : 'Event date not stated'}</span>
      {card.incoming.map((l) => (
        <span key={l.id} className={`card-link ${l.review_required ? 'pending' : ''}`}>
          ↳ {RELATION[l.relationship] ?? l.relationship}
          {l.comparison_date ? ` vs ${l.comparison_date}` : ''}
          {l.review_required ? ' · needs review' : ''}
        </span>
      ))}
      {o.unresolved.map((u) => (
        <span key={u.comparison_date} className="flag">
          ⚠ {u.message}
        </span>
      ))}
      {flags.map((f) => (
        <span key={f} className="flag">
          ⚠ {FLAGS[f] ?? f}
        </span>
      ))}
      <ReviewBadge status={o.review_status} />
    </button>
  )
}
