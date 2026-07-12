<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SortLog extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'unit_id',
        'quiz_item_id',
        'category_detected',
        'confidence',
        'is_correct',
        'created_at',
    ];

    protected function casts(): array
    {
        return [
            'is_correct' => 'boolean',
            'confidence' => 'float',
            'created_at' => 'datetime',
        ];
    }

    public function unit(): BelongsTo
    {
        return $this->belongsTo(Unit::class);
    }

    public function quizItem(): BelongsTo
    {
        return $this->belongsTo(QuizItem::class);
    }
}
