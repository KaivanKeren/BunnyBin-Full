<?php

namespace Database\Factories;

use App\Models\School;
use App\Models\Unit;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Unit>
 */
class UnitFactory extends Factory
{
    public function definition(): array
    {
        return [
            'school_id' => School::factory(),
            'code' => 'BNB-'.str_pad((string) fake()->unique()->numberBetween(1, 999), 3, '0', STR_PAD_LEFT),
            'location_label' => fake()->randomElement(['Kelas 1A', 'Kelas 3A', 'Kantin', 'Perpustakaan', 'Lapangan']),
            'status' => Unit::STATUS_ACTIVE,
            'last_seen_at' => now(),
            'installed_at' => fake()->dateTimeBetween('-6 months'),
            'bin_height_cm' => 60,
            'sensor_offset_cm' => 5,
        ];
    }
}
