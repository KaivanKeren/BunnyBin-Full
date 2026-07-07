<?php

namespace App\Models\Concerns;

use App\Models\AdminUser;
use Illuminate\Database\Eloquent\Builder;

trait BelongsToSchoolScope
{
    public function scopeForUser(Builder $query, AdminUser $user): Builder
    {
        return $user->role === 'super_admin'
            ? $query
            : $query->where($this->qualifyColumn('school_id'), $user->school_id);
    }
}
