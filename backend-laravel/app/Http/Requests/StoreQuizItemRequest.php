<?php

namespace App\Http\Requests;

use App\Models\QuizItem;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreQuizItemRequest extends FormRequest
{
    public function rules(): array
    {
        return [
            'category' => ['required', Rule::in([QuizItem::CATEGORY_ORGANIC, QuizItem::CATEGORY_INORGANIC])],
            'item_name' => ['required', 'string', 'max:100'],
            'image_url' => ['nullable', 'string', 'max:2048'],
            'explanation' => ['nullable', 'string'],
            'active' => ['sometimes', 'boolean'],
        ];
    }
}
