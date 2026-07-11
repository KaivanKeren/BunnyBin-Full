<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Carbon;

class UnitResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'code' => $this->code,
            'school' => $this->whenLoaded('school', fn () => [
                'id' => $this->school->id,
                'name' => $this->school->name,
            ]),
            'location_label' => $this->location_label,
            'status' => $this->status,
            'last_seen_at' => $this->last_seen_at,
            'installed_at' => $this->installed_at?->toDateString(),
            'latest_fill' => $this->latest_recorded_at !== null ? [
                'organic_pct' => (int) $this->latest_organic_pct,
                'inorganic_pct' => (int) $this->latest_inorganic_pct,
                'recorded_at' => Carbon::parse($this->latest_recorded_at),
            ] : null,
        ];
    }
}
