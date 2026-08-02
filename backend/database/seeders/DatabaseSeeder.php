<?php

namespace Database\Seeders;

use App\Models\AdminUser;
use App\Models\QuizItem;
use App\Models\School;
use App\Models\Unit;
use Illuminate\Database\Seeder;
use Illuminate\Support\Collection;

/**
 * Seed prototype: SATU sekolah, SATU unit (BNB-001) — cerminan hardware yang
 * benar-benar ada. Dashboard admin dan kiosk menunjuk unit yang sama, jadi apa
 * pun yang terjadi di kiosk langsung terlihat di dashboard tanpa salah unit.
 *
 * HANYA DATA MASTER: sekolah, akun admin beserta perannya, bank kuis, dan
 * pendaftaran unit. Tidak ada satu pun baris fill snapshot, sort log, alert,
 * atau maintenance event — semuanya HARUS lahir dari pembacaan ESP32 yang
 * sungguhan lewat pipeline ingest.
 *
 * Sebelumnya seeder mengisi 96 snapshot dan 40 sort log sebagai "pemanas" agar
 * chart tidak kosong. Konsekuensinya angka di dashboard tidak bisa dipercaya:
 * tidak ada cara membedakan mana yang benar-benar dibaca sensor dan mana yang
 * karangan seeder — dan itu justru yang sedang diuji. Dashboard yang kosong di
 * awal adalah harga yang benar untuk dibayar.
 */
class DatabaseSeeder extends Seeder
{
    /** Kode unit prototype — sama dengan VITE_UNIT_CODE di frontend-kiosk. */
    public const UNIT_CODE = 'BNB-001';

    public function run(): void
    {
        $this->seedQuizItems();

        $school = School::create([
            'name' => 'SDN 1 Kudus',
            'address' => 'Jl. Sunan Kudus No. 1',
            'city' => 'Kudus',
            'province' => 'Jawa Tengah',
            'contact_person' => 'Bu Sari',
            'contact_phone' => '0291-123456',
        ]);

        AdminUser::create([
            'school_id' => null,
            'name' => 'Super Admin',
            'email' => 'admin@bunnybin.id',
            'password' => env('SEED_ADMIN_PASSWORD', 'password'),
            'role' => AdminUser::ROLE_SUPER_ADMIN,
        ]);

        AdminUser::create([
            'school_id' => $school->id,
            'name' => 'Admin SDN 1 Kudus',
            'email' => 'admin@sdn1kudus.sch.id',
            'password' => env('SEED_ADMIN_PASSWORD', 'password'),
            'role' => AdminUser::ROLE_SCHOOL_ADMIN,
        ]);

        $unit = Unit::create([
            'school_id' => $school->id,
            'code' => self::UNIT_CODE,
            'location_label' => 'Kantin',
            // Unit terdaftar tapi BELUM pernah mengirim apa pun. Menandainya
            // active + last_seen sekarang adalah klaim palsu bahwa hardware
            // sudah melapor. Pesan pertama dari ESP32 (markSeen) yang akan
            // mengubahnya jadi active — itulah bukti koneksinya hidup.
            'status' => Unit::STATUS_OFFLINE,
            'last_seen_at' => null,
            'installed_at' => now()->subMonths(2)->toDateString(),
            // Geometri unit prototype HARUS sama dengan konstanta firmware
            // (BunnyBin_ESP32.ino: BIN_HEIGHT_CM = 55, sensor menempel di tutup
            // sehingga jarak saat penuh ≈ 0). Kalau berbeda, satu jarak sensor
            // menghasilkan dua persen berbeda: satu di layar kiosk saat offline,
            // satu lagi di dashboard admin.
            'bin_height_cm' => 55,
            'sensor_offset_cm' => 0,
        ]);

        $this->command?->info("Unit prototype {$unit->code} terdaftar (belum pernah melapor).");
        $this->command?->info("Terbitkan token kiosk: php artisan unit:token {$unit->code}");
        $this->command?->info('Fill, sort log, dan alert akan terisi sendiri begitu ESP32 mengirim data.');
    }

    /**
     * Bank kuis = konten ajar, bukan data device: ia harus sudah ada sebelum
     * anak pertama memakai kiosk.
     *
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
}
