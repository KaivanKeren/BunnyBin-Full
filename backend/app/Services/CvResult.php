<?php

namespace App\Services;

readonly class CvResult
{
    public function __construct(
        public ?string $category,
        public float $confidence,
        public ?array $bbox,
        public ?string $modelVersion,
        public ?string $label = null,
        // Jawaban datang dari jalur cadangan, bukan model utama. Diteruskan apa
        // adanya ke kiosk: tanpa ini, kuota cloud yang habis terlihat persis
        // seperti klasifikasi yang berhasil di sepanjang jalur, dan satu-satunya
        // yang tahu bedanya adalah log FastAPI yang tak pernah dibuka siapa pun.
        public bool $degraded = false,
        public ?string $degradedReason = null,
    ) {}

    public static function fromArray(array $data): self
    {
        return new self(
            category: $data['category'] ?? null,
            confidence: (float) ($data['confidence'] ?? 0),
            bbox: $data['bbox'] ?? null,
            modelVersion: $data['model_version'] ?? null,
            label: $data['label'] ?? null,
            degraded: (bool) ($data['degraded'] ?? false),
            degradedReason: $data['degraded_reason'] ?? null,
        );
    }

    public function toArray(): array
    {
        return [
            'category' => $this->category,
            'label' => $this->label,
            'confidence' => $this->confidence,
            'bbox' => $this->bbox,
            'model_version' => $this->modelVersion,
            'degraded' => $this->degraded,
            'degraded_reason' => $this->degradedReason,
        ];
    }
}
