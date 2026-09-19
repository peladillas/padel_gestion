<?php

namespace App\Services\Tournament;

use App\Exceptions\ApiException;

/**
 * Pure result validation, shared by every path that can finish a match:
 * the admin/responsable/referee `setResult()` and the player
 * propose → accept flow (and its 24h auto-confirm). One rule set, so a
 * result a player proposes is held to exactly the same standard as one
 * an admin registers.
 */
class ResultEvaluator
{
    /**
     * @param array{sets?: ?array, retired?: ?array} $payload
     * @return array{outcome: string, played: bool, sets: ?array, retired: ?array}
     */
    public function evaluate(array $payload, int $bestOf = 3): array
    {
        $retired = $payload['retired'] ?? null;
        $sets = $payload['sets'] ?? null;

        if ($retired) {
            $team = $retired['team'] ?? null;

            if (! in_array($team, ['team1', 'team2'], true)) {
                throw new ApiException("retired.team debe ser 'team1' o 'team2'", 400);
            }

            if (trim($retired['reason'] ?? '') === '') {
                throw new ApiException('El motivo del abandono es obligatorio', 400);
            }

            return [
                'outcome' => $team === 'team1' ? 'team2' : 'team1',
                'played' => false,
                'sets' => null,
                'retired' => $retired,
            ];
        }

        if (! $sets) {
            throw new ApiException('Debés indicar los sets jugados o un abandono.', 400);
        }

        $setsToWin = (int) ceil($bestOf / 2);
        $t1Sets = 0;
        $t2Sets = 0;

        foreach ($sets as $i => $set) {
            $g1 = $set['t1'] ?? null;
            $g2 = $set['t2'] ?? null;

            if (! is_numeric($g1) || ! is_numeric($g2)) {
                throw new ApiException('Set '.($i + 1).' incompleto', 400);
            }

            $g1 = (int) $g1;
            $g2 = (int) $g2;

            if ($g1 === $g2) {
                throw new ApiException('Set '.($i + 1).' no puede terminar en empate', 400);
            }

            $g1 > $g2 ? $t1Sets++ : $t2Sets++;
        }

        if ($t1Sets < $setsToWin && $t2Sets < $setsToWin) {
            throw new ApiException("Partido incompleto — falta el set decisivo (mejor de {$bestOf}) o registrá un abandono.", 400);
        }

        if ($t1Sets === $t2Sets) {
            throw new ApiException('Resultado inconsistente — revisá los sets cargados.', 400);
        }

        return [
            'outcome' => $t1Sets > $t2Sets ? 'team1' : 'team2',
            'played' => true,
            'sets' => $sets,
            'retired' => null,
        ];
    }
}
