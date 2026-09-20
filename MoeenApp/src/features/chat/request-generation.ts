export interface RequestGenerationState {
  generation: number;
}

export function beginLatestRequest(state: RequestGenerationState): number {
  state.generation += 1;
  return state.generation;
}

export function isLatestRequest(
  state: RequestGenerationState,
  requestGeneration: number,
): boolean {
  return state.generation === requestGeneration;
}
