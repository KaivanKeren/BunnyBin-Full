<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\AlertResource;
use App\Models\AdminUser;
use App\Models\Alert;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class AlertController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        $alerts = $this->scoped($request->user())
            ->with('unit')
            ->when($request->boolean('unread'), fn ($q) => $q->where('is_read', false))
            ->orderByDesc('created_at')
            ->paginate(min((int) $request->integer('per_page', 15), 100));

        return AlertResource::collection($alerts);
    }

    public function markRead(Request $request, string $alert): AlertResource
    {
        $alert = $this->scoped($request->user())->findOrFail($alert);

        $alert->update(['is_read' => true]);

        return new AlertResource($alert->load('unit'));
    }

    /**
     * Alert tidak punya school_id sendiri — scope lewat unit pemiliknya.
     */
    private function scoped(AdminUser $user): Builder
    {
        return Alert::query()->when(! $user->isSuperAdmin(),
            fn ($q) => $q->whereHas('unit', fn ($u) => $u->where('school_id', $user->school_id)));
    }
}
