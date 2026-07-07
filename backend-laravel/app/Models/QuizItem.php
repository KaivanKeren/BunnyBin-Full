<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class QuizItem extends Model
{
    use HasFactory;

    public const CATEGORY_ORGANIC = 'organic';
    public const CATEGORY_INORGANIC = 'inorganic';

    protected $fillable = [
        'category',
        'item_name',
        'image_url',
        'explanation',
        'active',
    ];

    protected function casts(): array
    {
        return [
            'active' => 'boolean',
        ];
    }
}
