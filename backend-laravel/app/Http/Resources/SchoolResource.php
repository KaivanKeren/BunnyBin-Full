<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class SchoolResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'address' => $this->address,
            'city' => $this->city,
            'province' => $this->province,
            'contact_person' => $this->contact_person,
            'contact_phone' => $this->contact_phone,
            'units_count' => $this->whenCounted('units'),
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
