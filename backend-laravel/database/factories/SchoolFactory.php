<?php

namespace Database\Factories;

use App\Models\School;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<School>
 */
class SchoolFactory extends Factory
{
    public function definition(): array
    {
        return [
            'name' => 'SDN '.fake()->numberBetween(1, 20).' '.fake()->city(),
            'address' => fake()->streetAddress(),
            'city' => fake()->city(),
            'province' => 'Jawa Tengah',
            'contact_person' => fake()->name(),
            'contact_phone' => fake()->phoneNumber(),
        ];
    }
}
