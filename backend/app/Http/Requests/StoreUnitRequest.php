<?php

namespace App\Http\Requests;

use App\Models\Unit;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreUnitRequest extends FormRequest
{
    public function rules(): array
    {
        return [
            'school_id' => ['required', 'exists:schools,id'],
            'code' => ['required', 'string', 'max:30', 'unique:units,code'],
            'location_label' => ['nullable', 'string', 'max:100'],
            'status' => ['sometimes', Rule::in([Unit::STATUS_ACTIVE, Unit::STATUS_MAINTENANCE, Unit::STATUS_OFFLINE])],
            'installed_at' => ['nullable', 'date'],
            // Geometri sensor — dipakai backend untuk konversi jarak → persen.
            'bin_height_cm' => ['sometimes', 'integer', 'min:10', 'max:400'],
            'sensor_offset_cm' => ['sometimes', 'integer', 'min:0', 'max:100'],
        ];
    }
}
