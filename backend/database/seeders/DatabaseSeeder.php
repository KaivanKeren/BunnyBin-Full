<?php

namespace Database\Seeders;

use App\Models\AdminUser;
use App\Models\Alert;
use App\Models\FillSnapshot;
use App\Models\MaintenanceEvent;
use App\Models\QuizItem;
use App\Models\School;
use App\Models\SortLog;
use App\Models\Unit;
use Illuminate\Database\Seeder;
use Illuminate\Support\Collection;

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

        $quizItems = $this->seedQuizItems();

        // Dua sekolah supaya super_admin melihat data lintas sekolah dan
        // school-scoping (admin sekolah hanya lihat unitnya) bisa dibuktikan.
        $kudus = $this->seedSchool([
            'name' => 'SDN 1 Kudus',
            'address' => 'Jl. Sunan Kudus No. 1',
            'city' => 'Kudus',
            'province' => 'Jawa Tengah',
            'contact_person' => 'Bu Sari',
            'contact_phone' => '0291-123456',
        ], 'admin@sdn1kudus.sch.id', 'Admin SDN 1 Kudus', [
            ['code' => 'BNB-001', 'location_label' => 'Kelas 3A', 'status' => Unit::STATUS_ACTIVE],
            ['code' => 'BNB-002', 'location_label' => 'Kantin', 'status' => Unit::STATUS_ACTIVE],
            ['code' => 'BNB-003', 'location_label' => 'Perpustakaan', 'status' => Unit::STATUS_MAINTENANCE],
        ]);

        $demak = $this->seedSchool([
            'name' => 'SDN 2 Demak',
            'address' => 'Jl. Sultan Fatah No. 7',
            'city' => 'Demak',
            'province' => 'Jawa Tengah',
            'contact_person' => 'Pak Budi',
            'contact_phone' => '0291-654321',
        ], 'admin@sdn2demak.sch.id', 'Admin SDN 2 Demak', [
            ['code' => 'BNB-004', 'location_label' => 'Lapangan', 'status' => Unit::STATUS_ACTIVE],
            ['code' => 'BNB-005', 'location_label' => 'UKS', 'status' => Unit::STATUS_OFFLINE],
        ]);

        $units = $kudus->concat($demak);

        $this->seedFillSnapshots($units);
        $this->seedSortLogs($units, $quizItems);
        $this->seedMaintenanceAndAlerts($units);
    }

    /**
     * @param  array<string, mixed>  $attrs
     * @param  array<int, array<string, mixed>>  $unitDefs
     * @return Collection<int, Unit>
     */
    private function seedSchool(array $attrs, string $adminEmail, string $adminName, array $unitDefs): Collection
    {
        $school = School::create($attrs);

        AdminUser::create([
            'school_id' => $school->id,
            'name' => $adminName,
            'email' => $adminEmail,
            'password' => env('SEED_ADMIN_PASSWORD', 'password'),
            'role' => AdminUser::ROLE_SCHOOL_ADMIN,
        ]);

        return collect($unitDefs)->map(fn (array $def) => Unit::create([
            ...$def,
            'school_id' => $school->id,
            // Unit offline: terakhir terlihat 40 menit lalu (lewat ambang 15 menit).
            'last_seen_at' => $def['status'] === Unit::STATUS_OFFLINE ? now()->subMinutes(40) : now(),
            'installed_at' => now()->subMonths(random_int(1, 6))->toDateString(),
        ]));
    }

    /**
     * @return Collection<int, QuizItem>
     */
    private function seedQuizItems(): Collection
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
     * Unit offline berhenti 40 menit lalu (konsisten dengan last_seen_at).
     *
     * @param  Collection<int, Unit>  $units
     */
    private function seedFillSnapshots(Collection $units): void
    {
        foreach ($units as $unit) {
            $offline = $unit->status === Unit::STATUS_OFFLINE;
            $stop = $offline ? now()->subMinutes(40) : now();
            $start = $stop->copy()->subHours(48)->startOfMinute();

            $organic = random_int(3, 15);
            $inorganic = random_int(3, 15);
            $rows = [];

            for ($i = 0; $i < 96; $i++) {
                $at = $start->copy()->addMinutes(30 * $i);
                if ($at->greaterThan($stop)) {
                    break;
                }

                // Naik bertahap; bila hampir penuh, "dikosongkan petugas".
                $organic = $organic >= 92 ? random_int(3, 8) : min(100, $organic + random_int(0, 3));
                $inorganic = $inorganic >= 92 ? random_int(3, 8) : min(100, $inorganic + random_int(0, 3));

                $rows[] = [
                    'unit_id' => $unit->id,
                    'organic_pct' => $organic,
                    'inorganic_pct' => $inorganic,
                    'recorded_at' => $at,
                ];
            }

            FillSnapshot::insert($rows);
        }
    }

    /**
     * @param  Collection<int, Unit>  $units
     * @param  Collection<int, QuizItem>  $quizItems
     */
    private function seedSortLogs(Collection $units, Collection $quizItems): void
    {
        $rows = [];

        // ~40 sortiran per unit selama 7 hari terakhir, akurasi ~80%.
        foreach ($units as $unit) {
            $count = $unit->status === Unit::STATUS_OFFLINE ? 15 : 40;

            for ($i = 0; $i < $count; $i++) {
                $quizItem = $quizItems->random();
                $isCorrect = random_int(1, 100) <= 80;

                $rows[] = [
                    'unit_id' => $unit->id,
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
        }

        SortLog::insert($rows);
    }

    /**
     * Baseline maintenance & alert supaya halaman terkait tidak kosong saat
     * pertama dibuka; simulator device akan menambah lebih banyak secara live.
     *
     * @param  Collection<int, Unit>  $units
     */
    private function seedMaintenanceAndAlerts(Collection $units): void
    {
        $byCode = $units->keyBy('code');

        // Unit maintenance punya event jam yang belum selesai.
        if ($maint = $byCode->get('BNB-003')) {
            MaintenanceEvent::create([
                'unit_id' => $maint->id,
                'event_type' => 'jam',
                'note' => 'Servo macet, menunggu teknisi.',
                'resolved' => false,
                'created_at' => now()->subHours(6),
            ]);
        }

        if ($u1 = $byCode->get('BNB-001')) {
            MaintenanceEvent::create([
                'unit_id' => $u1->id,
                'event_type' => 'manual_reset',
                'note' => 'Bin dikosongkan petugas kebersihan.',
                'resolved' => true,
                'created_at' => now()->subDay(),
            ]);
        }

        // Unit offline memicu alert offline yang belum dibaca.
        if ($offline = $byCode->get('BNB-005')) {
            Alert::create([
                'unit_id' => $offline->id,
                'alert_type' => Alert::TYPE_OFFLINE,
                'message' => "Unit {$offline->code} tidak mengirim data lebih dari 15 menit.",
                'is_read' => false,
                'created_at' => now()->subMinutes(35),
            ]);
        }

        if ($u2 = $byCode->get('BNB-002')) {
            Alert::create([
                'unit_id' => $u2->id,
                'alert_type' => Alert::TYPE_FILL_70,
                'message' => "Kompartemen anorganik unit {$u2->code} terisi 74%.",
                'is_read' => false,
                'created_at' => now()->subHours(2),
            ]);
        }
    }
}
