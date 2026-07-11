<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\QuizItem;
use App\Models\Unit;
use App\Services\CvClientService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CvProxyController extends Controller
{
    /**
     * POST /api/cv/classify — dipanggil kiosk/device, BUKAN admin dashboard.
     * Body: multipart `image` ATAU {image_base64}. Jika unit_code + quiz_item_id
     * disertakan, hasil klasifikasi disimpan ke sort_logs (mode quiz).
     */
    public function classify(Request $request, CvClientService $cv): JsonResponse
    {
        // Sanctum session admin juga lolos auth:sanctum — pastikan pemanggil
        // adalah token unit dengan ability kiosk.
        $caller = $request->user();
        abort_unless($caller instanceof Unit && $caller->tokenCan('kiosk'), 403);

        $validated = $request->validate([
            'image' => ['required_without:image_base64', 'file', 'image', 'max:5120'],
            'image_base64' => ['required_without:image', 'string'],
            'unit_code' => ['sometimes', 'required', 'exists:units,code'],
            'quiz_item_id' => ['sometimes', 'required', 'exists:quiz_items,id'],
        ]);

        $imageBase64 = $request->hasFile('image')
            ? base64_encode($request->file('image')->getContent())
            : $validated['image_base64'];

        $result = $cv->classify($imageBase64);

        if (isset($validated['unit_code'], $validated['quiz_item_id'])) {
            $unit = Unit::where('code', $validated['unit_code'])->firstOrFail();
            $quizItem = QuizItem::findOrFail($validated['quiz_item_id']);

            $unit->sortLogs()->create([
                'quiz_item_id' => $quizItem->id,
                'category_detected' => $result->category,
                'confidence' => $result->confidence,
                'is_correct' => $result->category === null
                    ? null
                    : $result->category === $quizItem->category,
            ]);
        }

        return response()->json($result->toArray());
    }
}
