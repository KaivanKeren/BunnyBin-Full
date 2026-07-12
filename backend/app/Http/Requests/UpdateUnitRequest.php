<?php

namespace App\Http\Requests;

use App\Models\Unit;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateUnitRequest extends FormRequest
{
    public function rules(): array
    {
        return [
            'school_id' => ['sometimes', 'exists:schools,id'],
            'code' => [
                'sometimes', 'required', 'string', 'max:30',
                Rule::unique('units', 'code')->ignore($this->route('unit')),
            ],
            'location_label' => ['nullable', 'string', 'max:100'],
            'status' => ['sometimes', Rule::in([Unit::STATUS_ACTIVE, Unit::STATUS_MAINTENANCE, Unit::STATUS_OFFLINE])],
            'installed_at' => ['nullable', 'date'],
        ];
    }
}
