<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('quiz_items', function (Blueprint $table) {
            $table->id();
            $table->string('category', 20); // organic | inorganic
            $table->string('item_name', 100);
            $table->text('image_url')->nullable();
            $table->text('explanation')->nullable();
            $table->boolean('active')->default(true);
            $table->timestampsTz();

            $table->index(['category', 'active']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('quiz_items');
    }
};
