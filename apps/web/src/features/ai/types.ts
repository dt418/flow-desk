export interface SuggestAssigneeSuggestion {
  userId: string;
  score: number;
  reason: string;
}

export type SuggestFallbackReason = 'timeout' | 'error';

export interface SuggestAssigneeResult {
  suggestions: SuggestAssigneeSuggestion[];
  fallback: boolean;
  /** Present when fallback is true — why rule-based ranking was used. */
  fallbackReason?: SuggestFallbackReason;
}
