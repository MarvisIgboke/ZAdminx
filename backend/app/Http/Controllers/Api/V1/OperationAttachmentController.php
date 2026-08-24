<?php

namespace App\Http\Controllers\Api\V1;

use App\Models\OperationAttachment;
use App\Services\AuditService;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Authorized media delivery. Files live on the private disk and are never
 * exposed through a public URL — every download is permission-checked and
 * audited.
 */
class OperationAttachmentController extends Controller
{
    public function __construct(private readonly AuditService $audit) {}

    public function download(Request $request, int $attachment): StreamedResponse
    {
        $file = OperationAttachment::findOrFail($attachment);

        $type = str_replace('-', '_', $file->operation_type) ?: $file->operation_type;
        $perm = 'view_'.$type;

        if (! $request->user()->hasPermission($perm) && ! $request->user()->hasPermission('attachments.download')) {
            abort(403, 'You are not authorized to view this attachment.');
        }

        abort_unless(Storage::disk($file->disk)->exists($file->path), 404);

        $this->audit->log('attachment_download', "Attachment #{$file->id} ({$file->label}) downloaded.", null, null);

        return Storage::disk($file->disk)->response($file->path, basename($file->path));
    }
}
