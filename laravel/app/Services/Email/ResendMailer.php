<?php

namespace App\Services\Email;

use GuzzleHttp\Client;
use Illuminate\Support\Facades\Log;

/**
 * Direct port of backend/src/services/EmailService.js — raw HTTP POST to
 * the Resend REST API (no SDK, mirroring the original architecture).
 *
 * Safety note: when MAIL_MAILER=log (the local .env default), sends are
 * logged instead of actually hitting Resend, so local development never
 * sends real email through the production Resend account/key. Set
 * MAIL_MAILER to anything else to send for real.
 */
class ResendMailer
{
    protected Client $http;

    public function __construct()
    {
        $this->http = new Client(['base_uri' => 'https://api.resend.com']);
    }

    public function send(string $to, string $subject, string $html): ?array
    {
        if (config('mail.default') === 'log') {
            Log::info('[ResendMailer] (log mode, not actually sent)', [
                'to' => $to,
                'subject' => $subject,
            ]);

            return null;
        }

        $from = config('bonapinta.email_from');

        try {
            $response = $this->http->post('/emails', [
                'headers' => [
                    'Authorization' => 'Bearer '.config('bonapinta.resend_api_key'),
                    'Content-Type' => 'application/json',
                ],
                'json' => [
                    'from' => "Bonapinta <{$from}>",
                    'to' => $to,
                    'subject' => $subject,
                    'html' => $html,
                ],
            ]);

            $parsed = json_decode((string) $response->getBody(), true);
            Log::info('Email sent to: '.$to.' | id: '.($parsed['id'] ?? 'unknown'));

            return $parsed;
        } catch (\Throwable $e) {
            Log::error('Email error: '.$e->getMessage());
            throw $e;
        }
    }

    protected function frontendUrl(): string
    {
        return config('bonapinta.frontend_url');
    }

    protected function layout(string $body): string
    {
        return '<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#f8fafc">'
            .'<h1 style="color:#0f172a;font-size:24px;text-align:center">🏓 Bonapinta</h1>'
            .'<div style="background:white;border-radius:16px;padding:24px;border:1px solid #e2e8f0">'
            .$body
            .'</div></div>';
    }

    public function sendPasswordReset(string $to, string $name, string $token): ?array
    {
        $url = $this->frontendUrl().'/reset-password?token='.$token;

        return $this->send($to, 'Bonapinta — Recuperar contrasena', $this->layout(
            "<h2 style=\"font-size:18px;color:#0f172a;margin:0 0 12px\">Hola {$name},</h2>".
            '<p style="color:#64748b;font-size:14px;margin:0 0 20px">Has solicitado recuperar tu contrasena.</p>'.
            "<a href=\"{$url}\" style=\"display:block;text-align:center;background:#0284c7;color:white;padding:14px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px;margin-bottom:16px\">Cambiar contrasena</a>".
            '<p style="color:#94a3b8;font-size:12px;text-align:center">Este enlace expira en 1 hora.</p>'
        ));
    }

    public function send2FACode(string $to, string $name, string $code): ?array
    {
        return $this->send($to, "Bonapinta — Tu codigo: {$code}", $this->layout(
            "<h2 style=\"font-size:18px;color:#0f172a;margin:0 0 12px\">Hola {$name},</h2>".
            '<p style="color:#64748b;font-size:14px;margin:0 0 20px">Tu codigo de verificacion es:</p>'.
            "<div style=\"text-align:center;background:#f0f9ff;border:2px solid #0284c7;border-radius:12px;padding:20px;margin-bottom:16px\"><span style=\"font-size:36px;font-weight:900;letter-spacing:8px;color:#0284c7;font-family:monospace\">{$code}</span></div>".
            '<p style="color:#94a3b8;font-size:12px;text-align:center">Expira en 10 minutos.</p>'
        ));
    }

    /** @param array<int, array{t1:int,t2:int}> $sets */
    public function sendResultProposed(string $to, string $name, string $proposerTeam, string $rivalTeam, array $sets, ?string $matchDate = null): ?array
    {
        $setsStr = implode(', ', array_map(fn ($s) => "{$s['t1']}-{$s['t2']}", $sets));
        $dateHtml = $matchDate ? "<div style=\"font-size:12px;color:#94a3b8;margin-top:4px\">{$matchDate}</div>" : '';
        // Silent bug fix: Express hardcoded https://bonapinta.com here instead
        // of using FRONTEND_URL — use the configured URL instead.
        $url = $this->frontendUrl().'/matches';

        return $this->send($to, "Bonapinta — {$proposerTeam} propone resultado", $this->layout(
            "<h2 style=\"font-size:18px;color:#0f172a;margin:0 0 12px\">Hola {$name},</h2>".
            "<p style=\"color:#64748b;font-size:14px;margin:0 0 16px\"><strong>{$proposerTeam}</strong> ha propuesto el resultado del partido contra <strong>{$rivalTeam}</strong>.</p>".
            "<div style=\"background:#f8fafc;border-radius:10px;padding:16px;margin-bottom:16px;text-align:center\"><div style=\"font-size:13px;color:#64748b;margin-bottom:6px\">Resultado propuesto</div><div style=\"font-size:20px;font-weight:700;color:#0f172a\">{$setsStr}</div>{$dateHtml}</div>".
            "<a href=\"{$url}\" style=\"display:block;text-align:center;background:#0284c7;color:white;padding:14px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px\">Confirmar o rechazar</a>"
        ));
    }

    /** @param array<int, array{t1:int,t2:int}> $sets */
    public function sendResultConfirmed(string $to, string $name, string $team1, string $team2, array $sets): ?array
    {
        $setsStr = implode(', ', array_map(fn ($s) => "{$s['t1']}-{$s['t2']}", $sets));
        $url = $this->frontendUrl().'/valorations'; // silent bug fix, see sendResultProposed

        return $this->send($to, 'Bonapinta — Resultado confirmado', $this->layout(
            "<h2 style=\"font-size:18px;color:#0f172a;margin:0 0 12px\">Hola {$name},</h2>".
            "<p style=\"color:#64748b;font-size:14px;margin:0 0 16px\">El resultado del partido <strong>{$team1} vs {$team2}</strong> ha sido confirmado.</p>".
            "<div style=\"background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:16px;text-align:center;margin-bottom:16px\"><div style=\"font-size:13px;color:#15803d;margin-bottom:4px\">✅ Resultado oficial</div><div style=\"font-size:20px;font-weight:700;color:#0f172a\">{$setsStr}</div></div>".
            "<a href=\"{$url}\" style=\"display:block;text-align:center;background:#22c55e;color:white;padding:14px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px\">Valorar jugadores (24h)</a>"
        ));
    }

    /**
     * $redirectTo (optional): appended as `&next=` so the frontend's
     * /verify-email page can send the user back to whatever they were
     * doing before verifying — e.g. finishing joining a tournament via
     * TournamentJoin.jsx's self-registration, which otherwise dumps
     * them on the dashboard with the invite context lost.
     */
    public function sendEmailVerification(string $to, string $name, string $token, ?string $redirectTo = null): ?array
    {
        $url = $this->frontendUrl().'/verify-email?token='.$token;

        if ($redirectTo) {
            $url .= '&next='.urlencode($redirectTo);
        }

        return $this->send($to, 'Bonapinta — Verifica tu email', $this->layout(
            "<h2 style=\"font-size:18px;color:#0f172a;margin:0 0 12px\">¡Hola {$name}!</h2>".
            '<p style="color:#64748b;font-size:14px;margin:0 0 8px">Ya casi estás dentro de la liga. Solo falta verificar tu email:</p>'.
            "<a href=\"{$url}\" style=\"display:block;text-align:center;background:#0f172a;color:#f59e0b;padding:14px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px;margin:20px 0;border:2px solid #f59e0b\">Verificar mi email</a>".
            '<p style="color:#94a3b8;font-size:12px;text-align:center">Este enlace es válido durante 15 días.</p>'
        ));
    }

    public function sendEmailChangeVerification(string $to, string $name, string $token): ?array
    {
        $url = $this->frontendUrl().'/confirm-email-change?token='.$token;

        return $this->send($to, 'Bonapinta — Confirma tu nuevo email', $this->layout(
            "<h2 style=\"font-size:18px;color:#0f172a;margin:0 0 12px\">Hola {$name},</h2>".
            '<p style="color:#64748b;font-size:14px;margin:0 0 8px">Has pedido cambiar el email con el que inicias sesión en Bonapinta a esta dirección.</p>'.
            '<p style="color:#64748b;font-size:14px;margin:0 0 20px">Confirma que es realmente tuya:</p>'.
            "<a href=\"{$url}\" style=\"display:block;text-align:center;background:#0284c7;color:white;padding:14px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px;margin-bottom:16px\">Confirmar nuevo email</a>".
            '<p style="color:#94a3b8;font-size:12px;text-align:center">Si no fuiste tú, ignora este correo — tu email actual no cambiará. Este enlace es válido durante 15 días.</p>'
        ));
    }

    public function sendInvitation(string $to, string $name, string $token): ?array
    {
        $url = $this->frontendUrl().'/activate?token='.$token;

        return $this->send($to, 'Bonapinta — Activa tu cuenta', $this->layout(
            "<h2 style=\"font-size:18px;color:#0f172a;margin:0 0 12px\">¡Hola {$name}!</h2>".
            '<p style="color:#64748b;font-size:14px;margin:0 0 8px">Has sido invitado/a a unirte a la liga de pádel <strong>Bonapinta</strong>.</p>'.
            '<p style="color:#64748b;font-size:14px;margin:0 0 20px">Activa tu cuenta y elige tu contraseña:</p>'.
            "<a href=\"{$url}\" style=\"display:block;text-align:center;background:#0f172a;color:#f59e0b;padding:14px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px;margin-bottom:16px;border:2px solid #f59e0b\">Activar mi cuenta</a>".
            '<p style="color:#94a3b8;font-size:12px;text-align:center">Este enlace es válido durante 15 días.</p>'
        ));
    }

    public function sendMatchNotification(string $to, string $name, int $matchCount): ?array
    {
        $url = $this->frontendUrl().'/mypair'; // silent bug fix, see sendResultProposed

        return $this->send($to, "Bonapinta — {$matchCount} coincidencias de horario", $this->layout(
            "<h2 style=\"font-size:18px;color:#0f172a;margin:0 0 12px\">Hola {$name},</h2>".
            "<p style=\"color:#64748b;font-size:14px;margin:0 0 20px\">Tu pareja y tu coincidis en <strong>{$matchCount} horarios</strong> disponibles.</p>".
            "<a href=\"{$url}\" style=\"display:block;text-align:center;background:#0284c7;color:white;padding:14px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px\">Ver coincidencias</a>"
        ));
    }
}
