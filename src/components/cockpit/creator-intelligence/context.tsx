// ── Creator Intelligence Context ──
// Sprint FYV-3.2A: single shared context so all tabs consume the same
// computed CreatorIntelligenceResult without recomputing.

import { createContext, useContext } from 'react';
import type { CreatorIntelligenceContextValue } from './types';

export const CreatorIntelligenceContext = createContext<CreatorIntelligenceContextValue | null>(null);

export function useCreatorIntelligence(): CreatorIntelligenceContextValue {
  const ctx = useContext(CreatorIntelligenceContext);
  if (!ctx) {
    throw new Error('useCreatorIntelligence must be used within a CreatorIntelligence page');
  }
  return ctx;
}
