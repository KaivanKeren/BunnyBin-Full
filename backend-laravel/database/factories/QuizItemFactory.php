<?php

namespace Database\Factories;

use App\Models\QuizItem;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<QuizItem>
 */
class QuizItemFactory extends Factory
{
    public function definition(): array
    {
        return [
            'category' => fake()->randomElement([QuizItem::CATEGORY_ORGANIC, QuizItem::CATEGORY_INORGANIC]),
            'item_name' => fake()->words(2, true),
            'image_url' => null,
            'explanation' => fake()->sentence(),
            'active' => true,
        ];
    }
}
