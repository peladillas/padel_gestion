<?php

namespace App\Http\Controllers\Api;

use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Models\Player;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\File;
use Intervention\Image\Drivers\Gd\Driver as GdDriver;
use Intervention\Image\Encoders\JpegEncoder;
use Intervention\Image\ImageManager;

/**
 * Direct port of backend/src/api/routes/upload.routes.js.
 */
class UploadController extends Controller
{
    protected const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/webp'];

    protected const MAX_BYTES = 5 * 1024 * 1024;

    public function avatar(Request $request)
    {
        $file = $request->file('avatar');

        if (! $file) {
            throw new ApiException('No se subio ninguna imagen', 400);
        }

        // Express's multer fileFilter rejection bubbled to a generic 500
        // (a latent bug) — reproduced here as a proper 400 instead, per
        // the "fix bugs silently" instruction; same error message either
        // way so the frontend's handling doesn't need to change.
        if (! in_array($file->getMimeType(), self::ALLOWED_MIMES, true) || $file->getSize() > self::MAX_BYTES) {
            throw new ApiException('Solo se permiten imagenes JPG, PNG o WebP', 400);
        }

        $player = Player::where('userId', $request->user()->id)->first();

        if (! $player) {
            throw new ApiException('Jugador no encontrado', 404);
        }

        $filename = "avatar_{$player->id}.jpg";
        $dir = rtrim(config('bonapinta.uploads_path'), '/').'/avatars';

        // Silent bug fix: Express never mkdir's this directory (a latent
        // bug — it only works because it happens to pre-exist on the
        // server); create it defensively here.
        File::ensureDirectoryExists($dir);

        $manager = new ImageManager(GdDriver::class);
        $image = $manager->decodePath($file->getRealPath());
        $image->cover(200, 200);
        $encoded = $image->encode(new JpegEncoder(quality: 85));
        file_put_contents($dir.'/'.$filename, (string) $encoded);

        $avatarUrl = "/uploads/avatars/{$filename}";
        $player->update(['avatarUrl' => $avatarUrl]);

        return response()->json(['avatarUrl' => $avatarUrl, 'message' => 'Avatar actualizado']);
    }

    public function deleteAvatar(Request $request)
    {
        $player = Player::where('userId', $request->user()->id)->first();

        if (! $player) {
            throw new ApiException('Jugador no encontrado', 404);
        }

        if ($player->avatarUrl) {
            $path = rtrim(config('bonapinta.uploads_path'), '/').'/avatars/'.basename($player->avatarUrl);

            if (file_exists($path)) {
                unlink($path);
            }
        }

        $player->update(['avatarUrl' => null]);

        return response()->json(['message' => 'Avatar eliminado']);
    }

    /**
     * Static-file serving for /uploads/{path} — mirrors Express's
     * `app.use('/uploads', express.static('/app/uploads'))`
     * (server.js:40). In production this is expected to be replaced by
     * Nginx's `^~ /uploads/` location block proxying straight to this
     * service; this route exists so local dev (no Nginx in front) and
     * any direct-to-backend access still works identically.
     */
    public function serveUpload(string $path)
    {
        $full = realpath(rtrim(config('bonapinta.uploads_path'), '/').'/'.$path);
        $base = realpath(config('bonapinta.uploads_path'));

        if (! $full || ! $base || ! str_starts_with($full, $base.DIRECTORY_SEPARATOR) || ! is_file($full)) {
            abort(404);
        }

        return response()->file($full);
    }
}
