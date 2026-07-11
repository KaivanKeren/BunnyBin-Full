<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreQuizItemRequest;
use App\Http\Requests\UpdateQuizItemRequest;
use App\Http\Resources\QuizItemResource;
use App\Models\QuizItem;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;

class QuizItemController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        $items = QuizItem::query()
            ->when($request->filled('category'), fn ($q) => $q->where('category', $request->query('category')))
            ->when($request->filled('active'), fn ($q) => $q->where('active', $request->boolean('active')))
            ->orderBy('item_name')
            ->paginate(min((int) $request->integer('per_page', 15), 100));

        return QuizItemResource::collection($items);
    }

    public function store(StoreQuizItemRequest $request): QuizItemResource
    {
        return new QuizItemResource(QuizItem::create($request->validated()));
    }

    public function update(UpdateQuizItemRequest $request, QuizItem $quizItem): QuizItemResource
    {
        $quizItem->update($request->validated());

        return new QuizItemResource($quizItem);
    }

    public function destroy(QuizItem $quizItem): Response
    {
        $quizItem->delete();

        return response()->noContent();
    }
}
