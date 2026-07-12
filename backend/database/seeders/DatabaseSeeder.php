<?php

namespace Database\Seeders;

use App\Models\AdminUser;
use App\Models\FillSnapshot;
use App\Models\QuizItem;
use App\Models\School;
use App\Models\SortLog;
use App\Models\Unit;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        AdminUser::create([
            'school_id' => null,
            'name' => 'Super Admin',
            'email' => 'admin@bunnybin.id',
            'password' => env('SEED_ADMIN_PASSWORD', 'password'),
            'role' => AdminUser::ROLE_SUPER_ADMIN,
        ]);

        $school = School::create([
            'name' => 'SDN 1 Kudus',
            'address' => 'Jl. Sunan Kudus No. 1',
            'city' => 'Kudus',
            'province' => 'Jawa Tengah',
            'contact_person' => 'Bu Sari',
            'contact_phone' => '0291-123456',
        ]);

        AdminUser::create([
            'school_id' => $school->id,
            'name' => 'Admin SDN 1 Kudus',
            'email' => 'admin@sdn1kudus.sch.id',
            'password' => env('SEED_ADMIN_PASSWORD', 'password'),
            'role' => AdminUser::ROLE_SCHOOL_ADMIN,
        ]);

        $units = collect([
            ['code' => 'BNB-001', 'location_label' => 'Kelas 3A'],
            ['code' => 'BNB-002', 'location_label' => 'Kantin'],
        ])->map(fn (array $attrs) => Unit::create([
            ...$attrs,
            'school_id' => $school->id,
            'status' => Unit::STATUS_ACTIVE,
            'last_seen_at' => now(),
            'installed_at' => now()->subMonths(2)->toDateString(),
        ]));

        $quizItems = $this->seedQuizItems();
        $this->seedFillSnapshots($units);
        $this->seedSortLogs($units, $quizItems);
    }

    /**
     * @return \Illuminate\Support\Collection<int, QuizItem>
     */
    private function seedQuizItems()
    {
        $items = [
            ['organic', 'Kulit pisang', 'Kulit buah membusuk secara alami dan bisa jadi kompos.'],
            ['organic', 'Daun kering', 'Daun berasal dari tumbuhan dan mudah terurai.'],
            ['organic', 'Sisa nasi', 'Sisa makanan bisa diurai mikroorganisme.'],
            ['organic', 'Kulit jeruk', 'Kulit buah termasuk sampah organik yang cepat membusuk.'],
            ['organic', 'Ampas teh', 'Ampas teh berasal dari daun dan bisa menyuburkan tanah.'],
            ['inorganic', 'Botol plastik', 'Plastik butuh ratusan tahun untuk terurai — pisahkan untuk didaur ulang.'],
            ['inorganic', 'Kaleng minuman', 'Logam tidak membusuk dan bernilai daur ulang tinggi.'],
            ['inorganic', 'Sedotan plastik', 'Sedotan plastik tidak bisa membusuk secara alami.'],
            ['inorganic', 'Bungkus snack', 'Kemasan plastik berlapis termasuk sampah anorganik.'],
            ['inorganic', 'Styrofoam', 'Styrofoam sangat sulit terurai dan mencemari lingkungan.'],
        ];

        return collect($items)->map(fn (array $item) => QuizItem::create([
            'category' => $item[0],
            'item_name' => $item[1],
            'explanation' => $item[2],
            'active' => true,
        ]));
    }

    /**
     * 48 jam data per unit, interval 30 menit, tren naik — supaya chart FE langsung terisi.
     *
     * @param  \Illuminate\Support\Collection<int, Unit>  $units
     */
    private function seedFillSnapshots($units): void
    {
        $start = now()->subHours(48)->startOfMinute();

        foreach ($units as $unit) {
            $organic = random_int(3, 10);
            $inorganic = random_int(3, 10);
            $rows = [];

            for ($i = 0; $i < 96; $i++) {
                $organic = min(95, $organic + random_int(0, 2));
                $inorganic = min(95, $inorganic + random_int(0, 2));

                $rows[] = [
                    'unit_id' => $unit->id,
                    'organic_pct' => $organic,
                    'inorganic_pct' => $inorganic,
                    'recorded_at' => $start->copy()->addMinutes(30 * $i),
                ];
            }

            FillSnapshot::insert($rows);
        }
    }

    /**
     * @param  \Illuminate\Support\Collection<int, Unit>  $units
     * @param  \Illuminate\Support\Collection<int, QuizItem>  $quizItems
     */
    private function seedSortLogs($units, $quizItems): void
    {
        $rows = [];

        for ($i = 0; $i < 50; $i++) {
            $quizItem = $quizItems->random();
            $isCorrect = random_int(1, 100) <= 80;

            $rows[] = [
                'unit_id' => $units->random()->id,
                'quiz_item_id' => $quizItem->id,
                'category_detected' => $isCorrect
                    ? $quizItem->category
                    : ($quizItem->category === QuizItem::CATEGORY_ORGANIC
                        ? QuizItem::CATEGORY_INORGANIC
                        : QuizItem::CATEGORY_ORGANIC),
                'confidence' => random_int(60, 99) / 100,
                'is_correct' => $isCorrect,
                'created_at' => now()->subMinutes(random_int(1, 7 * 24 * 60)),
            ];
        }

        SortLog::insert($rows);
    }
}
