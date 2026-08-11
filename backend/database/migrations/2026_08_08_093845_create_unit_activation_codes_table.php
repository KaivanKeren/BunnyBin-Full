<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Kode aktivasi sekali pakai — jalan agar kiosk bisa MENGAMBIL tokennya sendiri
 * saat runtime, bukan menerimanya ter-inline di dalam bundle JavaScript.
 *
 * Selama token datang dari VITE_KIOSK_API_TOKEN, ia selalu berakhir sebagai teks
 * polos di dalam file .js yang dilayankan ke browser — terbaca siapa pun yang
 * membuka DevTools di tablet kiosk, dan berlaku selamanya. Rotasi hanya
 * memperpendek umur kebocoran; hanya provisioning saat runtime yang benar-benar
 * mengeluarkan rahasianya dari artefak build.
 *
 * Kodenya disimpan sebagai HASH, bukan teks polos: bocornya isi tabel ini tidak
 * boleh langsung berarti bocornya kewenangan menerbitkan token.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('unit_activation_codes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('unit_id')->constrained()->cascadeOnDelete();
            $table->string('code_hash', 64)->unique();
            $table->timestampTz('expires_at');
            $table->timestampTz('used_at')->nullable();
            $table->timestampsTz();

            // Pencarian saat aktivasi selalu lewat hash; index unik di atas sudah
            // menanganinya. Index ini untuk pembersihan kode kedaluwarsa.
            $table->index('expires_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('unit_activation_codes');
    }
};
