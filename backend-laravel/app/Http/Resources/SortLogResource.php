<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class SortLogResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'unit_id' => $this->unit_id,
            'quiz_item' => $this->whenLoaded('quizItem', fn () => $this->quizItem ? [
                'id' => $this->quizItem->id,
                'item_name' => $this->quizItem->item_name,
                'category' => $this->quizItem->category,
            ] : null),
            'category_detected' => $this->category_detected,
            'confidence' => $this->confidence,
            'is_correct' => $this->is_correct,
            'created_at' => $this->created_at,
        ];
    }
}
