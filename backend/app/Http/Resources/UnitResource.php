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
            'bin_height_cm' => $this->bin_height_cm,
            'sensor_offset_cm' => $this->sensor_offset_cm,
            'latest_fill' => $this->latest_recorded_at !== null ? [
                'organic_pct' => (int) $this->latest_organic_pct,
                'inorganic_pct' => (int) $this->latest_inorganic_pct,
                // null untuk device lama yang masih mengirim persen langsung
                'organic_distance_cm' => $this->latest_organic_distance_cm !== null
                    ? (float) $this->latest_organic_distance_cm
                    : null,
                'inorganic_distance_cm' => $this->latest_inorganic_distance_cm !== null
                    ? (float) $this->latest_inorganic_distance_cm
                    : null,
                'recorded_at' => Carbon::parse($this->latest_recorded_at),
            ] : null,
            'maintenance_events' => $this->whenLoaded('maintenanceEvents',
                fn () => $this->maintenanceEvents->map(fn ($event) => [
                    'id' => $event->id,
                    'event_type' => $event->event_type,
                    'note' => $event->note,
                    'resolved' => $event->resolved,
                    'created_at' => $event->created_at,
                ])),
        ];
    }
}
