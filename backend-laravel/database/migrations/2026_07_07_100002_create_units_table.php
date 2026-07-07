<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('units', function (Blueprint $table) {
            $table->id();
            $table->foreignId('school_id')->constrained()->cascadeOnDelete();
            $table->string('code', 30)->unique();
            $table->string('location_label', 100)->nullable();
            // active | maintenance | offline — enforce di app layer, bukan DB enum
            $table->string('status', 20)->default('active');
            $table->timestampTz('last_seen_at')->nullable();
            $table->date('installed_at')->nullable();
            $table->timestampsTz();

            $table->index('school_id');
            $table->index('status');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('units');
    }
};
