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
    ) {}

    public static function fromArray(array $data): self
    {
        return new self(
            category: $data['category'] ?? null,
            confidence: (float) ($data['confidence'] ?? 0),
            bbox: $data['bbox'] ?? null,
            modelVersion: $data['model_version'] ?? null,
            label: $data['label'] ?? null,
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
        ];
    }
}
