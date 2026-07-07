<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class School extends Model
{
    use HasFactory;

    protected $fillable = [
        'name',
        'address',
        'city',
        'province',
        'contact_person',
        'contact_phone',
    ];

    public function units(): HasMany
    {
        return $this->hasMany(Unit::class);
    }

    public function adminUsers(): HasMany
    {
        return $this->hasMany(AdminUser::class);
    }
}
