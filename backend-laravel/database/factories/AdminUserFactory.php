<?php

namespace Database\Factories;

use App\Models\AdminUser;
use App\Models\School;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<AdminUser>
 */
class AdminUserFactory extends Factory
{
    public function definition(): array
    {
        return [
            'school_id' => School::factory(),
            'name' => fake()->name(),
            'email' => fake()->unique()->safeEmail(),
            'password' => 'password',
            'role' => AdminUser::ROLE_SCHOOL_ADMIN,
        ];
    }

    public function superAdmin(): static
    {
        return $this->state(fn () => [
            'school_id' => null,
            'role' => AdminUser::ROLE_SUPER_ADMIN,
        ]);
    }
}
