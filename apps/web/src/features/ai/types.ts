export interface SuggestAssigneeSuggestion {
  userId: string;
  score: number;
  reason: string;
}

export interface SuggestAssigneeResult {
  suggestions: SuggestAssigneeSuggestion[];
  fallback: boolean;
}
