import type { AssistantState } from '@murmur/shared';
import { stateVisuals } from '@murmur/design-system';

const STATE: AssistantState = 'idle';

export function App() {
  const visual = stateVisuals[STATE];
  return (
    <div className="pill" role="status" aria-label={`murmur: ${visual.label}`}>
      <span className="dot" style={{ background: visual.color }} />
      <span className="label">murmur · {visual.label}</span>
    </div>
  );
}
