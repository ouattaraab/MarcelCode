export enum ModelId {
  HAIKU = 'claude-haiku-4-5-20251001',
  SONNET = 'claude-sonnet-4-5-20250929',
  OPUS = 'claude-opus-4-6',
}

export interface ModelConfig {
  id: ModelId;
  displayName: string;
  maxTokens: number;
  inputPricePer1M: number;
  outputPricePer1M: number;
  supportsStreaming: boolean;
}

export const MODEL_CONFIGS: Record<ModelId, ModelConfig> = {
  [ModelId.HAIKU]: {
    id: ModelId.HAIKU,
    displayName: 'Claude Haiku 4.5',
    maxTokens: 8192,
    inputPricePer1M: 0.8,
    outputPricePer1M: 4.0,
    supportsStreaming: true,
  },
  [ModelId.SONNET]: {
    id: ModelId.SONNET,
    displayName: 'Claude Sonnet 4.5',
    maxTokens: 8192,
    inputPricePer1M: 3.0,
    outputPricePer1M: 15.0,
    supportsStreaming: true,
  },
  [ModelId.OPUS]: {
    id: ModelId.OPUS,
    displayName: 'Claude Opus 4.6',
    maxTokens: 32768,
    inputPricePer1M: 15.0,
    outputPricePer1M: 75.0,
    supportsStreaming: true,
  },
};
