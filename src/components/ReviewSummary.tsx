import { CLASS_LABELS, MOVE_CLASSES } from '../review/classify'
import type { ReviewState } from '../hooks/useAnalysis'

interface ReviewSummaryProps {
  review: ReviewState
  moveCount: number
  onStart: () => void
  onCancel: () => void
}

function accuracyText(value: number | null): string {
  return value === null ? '–' : `${value.toFixed(1)}%`
}

export function ReviewSummary({ review, moveCount, onStart, onCancel }: ReviewSummaryProps) {
  const running = review.status === 'running'
  const percent = Math.round(review.progress * 100)
  const { summary } = review

  return (
    <section aria-label="Review" className="review-summary" data-testid="review-summary">
      <div className="review-header">
        <h2>Review</h2>
        {running ? (
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
        ) : (
          <button type="button" onClick={onStart} disabled={moveCount === 0}>
            Review game
          </button>
        )}
      </div>

      {running && (
        <div className="review-progress">
          <progress
            max={100}
            value={percent}
            aria-label="Review progress"
            data-testid="review-progress"
          />
          <span className="muted small">{percent}%</span>
        </div>
      )}

      {summary && (summary.w.moves > 0 || summary.b.moves > 0) && (
        <table className="review-table" data-testid="review-table">
          <caption className="muted small">
            {review.status === 'done' ? 'Review complete' : 'Partial review'}
          </caption>
          <thead>
            <tr>
              <th scope="col">
                <span className="visually-hidden">Measure</span>
              </th>
              <th scope="col">White</th>
              <th scope="col">Black</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">Accuracy</th>
              <td data-testid="accuracy-w">{accuracyText(summary.w.accuracy)}</td>
              <td data-testid="accuracy-b">{accuracyText(summary.b.accuracy)}</td>
            </tr>
            {MOVE_CLASSES.map((cls) => (
              <tr key={cls} className={`cls-${cls}`}>
                <th scope="row">{CLASS_LABELS[cls]}</th>
                <td>{summary.w.counts[cls]}</td>
                <td>{summary.b.counts[cls]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}
