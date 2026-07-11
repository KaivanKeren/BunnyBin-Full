<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreSchoolRequest;
use App\Http\Requests\UpdateSchoolRequest;
use App\Http\Resources\SchoolResource;
use App\Models\School;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;

class SchoolController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        $schools = School::withCount('units')
            ->orderBy('name')
            ->paginate(min((int) $request->integer('per_page', 15), 100));

        return SchoolResource::collection($schools);
    }

    public function store(StoreSchoolRequest $request): SchoolResource
    {
        return new SchoolResource(School::create($request->validated()));
    }

    public function show(School $school): SchoolResource
    {
        return new SchoolResource($school->loadCount('units'));
    }

    public function update(UpdateSchoolRequest $request, School $school): SchoolResource
    {
        $school->update($request->validated());

        return new SchoolResource($school);
    }

    public function destroy(School $school): Response
    {
        $school->delete();

        return response()->noContent();
    }
}
