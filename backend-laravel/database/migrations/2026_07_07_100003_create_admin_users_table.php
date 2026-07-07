<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('admin_users', function (Blueprint $table) {
            $table->id();
            // NULL = super_admin
            $table->foreignId('school_id')->nullable()->constrained('schools')->nullOnDelete();
            $table->string('name', 100);
            $table->string('email', 150)->unique();
            $table->string('password');
            $table->string('role', 20); // super_admin | school_admin
            $table->timestampsTz();
        });

        if (DB::getDriverName() === 'pgsql') {
            DB::statement(
                "ALTER TABLE admin_users ADD CONSTRAINT admin_users_role_school_check ".
                "CHECK (role = 'super_admin' OR school_id IS NOT NULL)"
            );
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('admin_users');
    }
};
