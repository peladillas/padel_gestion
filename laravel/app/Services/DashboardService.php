<?php

namespace App\Services;

use App\Enums\Role;
use App\Exceptions\ApiException;
use App\Models\ClassicMatch;
use App\Models\Player;
use App\Models\TournamentInstance;
use App\Models\TournamentMatch;
use Illuminate\Support\Facades\DB;

/**
 * Direct port of backend/src/api/routes/dashboard.routes.js.
 */
class DashboardService
{
    protected function withNestedCount($model, array $map): array
    {
        $data = $model->toArray();
        $nested = [];

        foreach ($map as $countKey => $outputKey) {
            $nested[$outputKey] = $model->{$countKey} ?? 0;
            unset($data[$countKey]);
        }

        $data['_count'] = $nested;

        return $data;
    }

    public function admin(): array
    {
        $matchInclude = ['team1.players.player', 'team2.players.player'];

        $playerCount = Player::whereHas('user', fn ($q) => $q->where('role', Role::PLAYER))
            ->where('active', true)->count();
        $matchCount = ClassicMatch::count();
        $completedCount = ClassicMatch::where('completed', true)->count();
        $pendingCount = ClassicMatch::where('completed', false)->count();
        $activeTournaments = TournamentInstance::where('status', 'active')->count();

        $recentMatches = ClassicMatch::where('completed', true)
            ->orderByDesc('createdAt')
            ->limit(5)
            ->with($matchInclude)
            ->get();

        $pendingResults = ClassicMatch::where('completed', false)
            ->whereNotNull('result')
            ->where('createdAt', '<', now()->subDays(2))
            ->limit(5)
            ->with($matchInclude)
            ->get();

        $mostActive = DB::select(<<<'SQL'
            SELECT p.name, p."avatarUrl", p.id,
              COUNT(DISTINCT m.id)::int as matches
            FROM "Player" p
            JOIN "TeamPlayer" tp ON tp."playerId" = p.id
            JOIN "Team" t ON t.id = tp."teamId"
            JOIN "Match" m ON (m."team1Id" = t.id OR m."team2Id" = t.id)
            WHERE m.completed = true
            GROUP BY p.id, p.name, p."avatarUrl"
            ORDER BY matches DESC
            LIMIT 5
        SQL);

        // Pending tournament matches where the admin must register the
        // result themselves (resultMode='creador').
        $pendingGrouped = TournamentMatch::query()
            ->select('tournamentId')
            ->selectRaw('COUNT(id) as count')
            ->where('status', '!=', 'completed')
            ->whereHas('tournament', fn ($q) => $q->where('status', 'active')->where('resultMode', 'creador'))
            ->groupBy('tournamentId')
            ->get();

        $pendingTIds = $pendingGrouped->pluck('tournamentId');
        $pendingNames = $pendingTIds->isNotEmpty()
            ? TournamentInstance::whereIn('id', $pendingTIds)->pluck('name', 'id')
            : collect();

        $pendingTournamentCount = (int) $pendingGrouped->sum('count');

        return [
            'kpis' => [
                'playerCount' => $playerCount,
                'matchCount' => $matchCount,
                'completedCount' => $completedCount,
                'pendingCount' => $pendingCount,
                'activeTournaments' => $activeTournaments,
            ],
            'recentMatches' => $recentMatches,
            'alerts' => [
                'pendingResults' => $pendingResults,
                'pendingTournamentCount' => $pendingTournamentCount,
            ],
            'mostActive' => $mostActive,
        ];
    }

    public function player(string $userId): array
    {
        $player = Player::with('user')->where('userId', $userId)->first();

        if (! $player) {
            throw new ApiException('Jugador no encontrado', 404);
        }

        $myStats = app(ValorationService::class)->statsForPlayer($player->id);

        $myTournaments = TournamentInstance::whereIn('status', ['active', 'pending'])
            ->whereHas('participants', fn ($q) => $q->where('playerId', $player->id))
            ->withCount(['participants', 'matches'])
            ->orderBy('startDate')
            ->get(['id', 'name', 'status', 'structure', 'startDate', 'endDate'])
            ->map(fn ($t) => $this->withNestedCount($t, [
                'participants_count' => 'participants',
                'matches_count' => 'matches',
            ]))
            ->all();

        $arbitroTournaments = TournamentInstance::where('arbitroId', $userId)
            ->where('status', 'active')
            ->where('resultMode', 'arbitro')
            ->withCount(['matches' => fn ($q) => $q->where('status', '!=', 'completed')])
            ->get(['id', 'name', 'status', 'structure'])
            ->map(fn ($t) => $this->withNestedCount($t, ['matches_count' => 'matches']))
            ->all();

        return [
            'player' => $player,
            'kpis' => [
                'activeTournaments' => count($myTournaments) + count($arbitroTournaments),
                'valorations' => $myStats['total'] ?? 0,
            ],
            'myStats' => $myStats,
            'myTournaments' => $myTournaments,
            'arbitroTournaments' => $arbitroTournaments,
        ];
    }
}
