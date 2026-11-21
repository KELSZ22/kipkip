/**
 * Swap a model by editing this file. All three are Qwen2.5 Instruct, Q4_K_M, Apache-2.0.
 * sha256 is the Hugging Face LFS hash of the GGUF bytes.
 * Phones from 8 GB up to 12 GB use the small model. The spec only steps up again at 12 GB.
 * Unknown RAM uses the tiny model so a weak phone is not asked to load a multi-gigabyte file.
 */

export const MODEL_TIERS = ['tiny', 'small', 'large'] as const;

export type ModelTier = (typeof MODEL_TIERS)[number];

export type ModelSpec = {
  id: string;
  tier: ModelTier;
  url: string;
  bytes: number;
  sha256: string;
};

const QWEN = 'https://huggingface.co/Qwen';

export const MODELS: readonly ModelSpec[] = [
  {
    id: 'qwen2.5-0.5b-q4',
    tier: 'tiny',
    url: `${QWEN}/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf`,
    bytes: 491_400_032,
    sha256: '74a4da8c9fdbcd15bd1f6d01d621410d31c6fc00986f5eb687824e7b93d7a9db',
  },
  {
    id: 'qwen2.5-1.5b-q4',
    tier: 'small',
    url: `${QWEN}/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf`,
    bytes: 1_117_320_736,
    sha256: '6a1a2eb6d15622bf3c96857206351ba97e1af16c30d7a74ee38970e434e9407e',
  },
  {
    id: 'qwen2.5-3b-q4',
    tier: 'large',
    url: `${QWEN}/Qwen2.5-3B-Instruct-GGUF/resolve/main/qwen2.5-3b-instruct-q4_k_m.gguf`,
    bytes: 2_104_932_768,
    sha256: '626b4a6678b86442240e33df819e00132d3ba7dddfe1cdc4fbb18e0a9615c62d',
  },
];

const GIBIBYTE = 1024 ** 3;

export function chooseTier(totalMemoryBytes: number | null): ModelTier {
  if (totalMemoryBytes == null || totalMemoryBytes < 6 * GIBIBYTE) return 'tiny';
  if (totalMemoryBytes < 12 * GIBIBYTE) return 'small';
  return 'large';
}

export function modelForTier(tier: ModelTier): ModelSpec {
  const model = MODELS.find((item) => item.tier === tier);
  if (!model) throw new Error(`No model configured for ${tier}`);
  return model;
}

export function modelById(id: string | null): ModelSpec | null {
  if (!id) return null;
  return MODELS.find((item) => item.id === id) ?? null;
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
  return `${Math.round(bytes / 1_000_000)} MB`;
}
