import axios from 'axios';
const api = axios.create({ baseURL: '/api', headers: { 'Content-Type': 'application/json' } });
api.interceptors.request.use(config => {
  const token = localStorage.getItem('bp_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
api.interceptors.response.use(res => res, err => {
  if (err.response?.status === 401) {
    const hadToken = !!localStorage.getItem('bp_token');
    localStorage.removeItem('bp_token');
    localStorage.removeItem('bp_user');
    if (hadToken) window.location.href = '/login';
  }
  return Promise.reject(err);
});
export const authService = {
  login:          (data)  => api.post('/auth/login', data),
  register:       (data)  => api.post('/auth/register', data),
  me:             ()      => api.get('/auth/me'),
  verify2FA:      (data)  => api.post('/auth/verify-2fa', data),
  forgotPassword: (email) => api.post('/auth/forgot-password', { email }),
  resetPassword:  (data)  => api.post('/auth/reset-password', data),
  changePassword: (data)  => api.put('/auth/password', data),
  toggle2FA:      (enabled) => api.put('/auth/2fa', { enabled }),
  updatePhone:    (phone) => api.put('/auth/phone', { phone }),
  // currentPassword is now required — changing your login email is
  // sensitive enough to deserve the same confirmation step password
  // changes already have.
  updateEmail:    (email, currentPassword) => api.put('/auth/email', { email, currentPassword }),
  confirmEmailChange: (token) => api.post('/auth/confirm-email-change', { token }),
  activate:              (data)    => api.post('/auth/activate', data),
  resendInvite:          (userId, sendEmail=true) => api.post(`/auth/resend-invite/${userId}`, { sendEmail }),
  generateInviteCode:    (data)    => api.post('/auth/invite-codes', data),
  listInviteCodes:       ()        => api.get('/auth/invite-codes'),
  revokeInviteCode:      (id)      => api.delete(`/auth/invite-codes/${id}`),
  validateInviteCode:    (token)   => api.get(`/auth/invite-codes/validate/${token}`),
  registerWithInvite:    (data)    => api.post('/auth/register-with-invite', data),
  verifyEmail:           (token)   => api.post('/auth/verify-email', { token }),
  checkUsername:         (username, excludeUserId) => api.get(`/auth/check-username/${encodeURIComponent(username)}${excludeUserId ? `?excludeUserId=${excludeUserId}` : ''}`),
  updateUsername:        (username) => api.put('/auth/username', { username }),
};
export const playerService = {
  getAll:          ()         => api.get('/players'),
  // clubId is optional — lets a SUPER_ADMIN narrow the platform-wide
  // directory to one club instead of always getting every player.
  search:          (q, clubId) => api.get(`/players/search?q=${encodeURIComponent(q||'')}${clubId ? `&clubId=${clubId}` : ''}`),
  getById:         (id)       => api.get(`/players/${id}`),
  getPublic:       (id)       => api.get(`/players/${id}/public`),
  update:          (id, data) => api.put(`/players/${id}`, data),
  updateMe:        (data)     => api.put('/players/me', data),
  updatePrivacy:   (data)     => api.put('/players/me/privacy', data),
  setClub:         (clubId)   => api.put('/players/me/club', { clubId }),
  invite:          (data)     => api.post('/players/invite', data),
  getClubPlayers:  ()         => api.get('/players/club-players'),
  getClubMembers:  ()         => api.get('/players/club-members'),
  createClubPlayer:(data)     => api.post('/players/club-players', data),
  delete:          (id)       => api.delete(`/players/${id}`),
  restore:         (id, email) => api.put(`/players/${id}/restore`, { email }),
  changePassword:  (id, password) => api.put(`/players/${id}/password`, { password }),
  import:     (file)   => { const f = new FormData(); f.append('file', file); return api.post('/players/import', f, { headers: { 'Content-Type': 'multipart/form-data' } }); }
};
export const availabilityService = {
  get:         ()         => api.get('/availability'),
  update:      (slots)    => api.put('/availability', { slots }),
  getByPlayer: (playerId) => api.get(`/availability/player/${playerId}`),
};
export const valorationService = {
  getByPlayer: (playerId)  => api.get(`/valorations/player/${playerId}`),
  getPending:   ()          => api.get('/valorations/pending'),
  getReceived:  ()          => api.get('/valorations/received'),
  getEvolution: (playerId) => api.get(`/valorations/player/${playerId}/evolution`),
  create:       (data)     => api.post('/valorations', data),
};

export const tournamentInstanceService = {
  getAll:           ()           => api.get('/tournament-instances'),
  getById:          (id)         => api.get(`/tournament-instances/${id}`),
  create:           (data)       => api.post('/tournament-instances', data),
  addParticipant:   (id, data)   => api.post(`/tournament-instances/${id}/participants`, data),
  removeParticipant:(id, pId)    => api.delete(`/tournament-instances/${id}/participants/${pId}`),
  generateMatches:  (id)         => api.post(`/tournament-instances/${id}/generate`),
  start:            (id)         => api.put(`/tournament-instances/${id}/start`),
  reset:            (id, keepPlayers) => api.post(`/tournament-instances/${id}/reset`, { keepPlayers }),
  archive:          (id)             => api.put(`/tournament-instances/${id}/archive`),
  setResult:        (id, mId, data) => api.put(`/tournament-instances/${id}/matches/${mId}/result`, data),
  proposeResult:    (id, mId, data) => api.put(`/tournament-instances/${id}/matches/${mId}/propose`, data),
  acceptResult:     (id, mId, data) => api.put(`/tournament-instances/${id}/matches/${mId}/accept`, data),
  rejectResult:     (id, mId, data) => api.put(`/tournament-instances/${id}/matches/${mId}/reject`, data),
  getStandings:     (id)         => api.get(`/tournament-instances/${id}/standings`),
  getMyMatches:     ()           => api.get('/tournament-instances/my-matches'),
  updateResultMode: (id, data)   => api.put(`/tournament-instances/${id}/result-mode`, data),
  deleteTournament: (id, confirmed) => api.delete(`/tournament-instances/${id}`, { data: { confirmed } }),
  generateInvite:   (id, data)   => api.post(`/tournament-instances/${id}/invite`, data),
  updateInvite:     (id, data)   => api.put(`/tournament-instances/${id}/invite`, data),
  getJoinInfo:      (token)      => api.get(`/tournament-instances/join/${token}`),
  joinByToken:      (token)      => api.post(`/tournament-instances/join/${token}`),
  getLogs:          (id)         => api.get(`/tournament-instances/${id}/logs`),
  pairParticipants:   (id, data)   => api.put(`/tournament-instances/${id}/participants/pair`, data),
  unpairParticipant:  (id, data)   => api.put(`/tournament-instances/${id}/participants/unpair`, data),
  sendPairRequest:    (id, data)   => api.post(`/tournament-instances/${id}/pair-request`, data),
  acceptPairRequest:  (id, data)   => api.put(`/tournament-instances/${id}/pair-request/accept`, data),
  rejectPairRequest:  (id, data)   => api.put(`/tournament-instances/${id}/pair-request/reject`, data),
  cancelPairRequest:  (id)         => api.delete(`/tournament-instances/${id}/pair-request`),
  setSubstitute:        (id, pid, data) => api.put(`/tournament-instances/${id}/participants/${pid}/substitute`, data),
  updateMaxParticipants:(id, data)      => api.put(`/tournament-instances/${id}/max-participants`, data),
  getTournamentCourts: (id)             => api.get(`/tournament-instances/${id}/courts`),
  setTournamentCourts: (id, courtIds)   => api.put(`/tournament-instances/${id}/courts`, { courtIds }),
  postponeJornada:     (id, data)       => api.put(`/tournament-instances/${id}/schedule/postpone`, data),
  overrideJornadaBBQ:          (id, jornada, coupleIds) => api.put(`/tournament-instances/${id}/jornadas/${jornada}/bbq`, { coupleIds }),
  generateCimaPadelRound:      (id, availableCoupleIds) => api.post(`/tournament-instances/${id}/cima-round`, { availableCoupleIds }),
  setCimaPadelRoundAssignment: (id, jornada, cookingCoupleIds, matchAssignments) => api.put(`/tournament-instances/${id}/cima-round/${jornada}`, { cookingCoupleIds, matchAssignments }),
};

export const clubService = {
  getAll:       ()              => api.get('/clubs'),
  getById:      (id)            => api.get(`/clubs/${id}`),
  create:       (data)          => api.post('/clubs', data),
  update:       (id, data)      => api.put(`/clubs/${id}`, data),
  delete:       (id)            => api.delete(`/clubs/${id}`),
  listPublic:   ()              => api.get('/clubs/public'),
  createAdmin:  (id, data)      => api.post(`/clubs/${id}/admins`, data),
  updateAdmin:  (id, pid, data) => api.put(`/clubs/${id}/admins/${pid}`, data),
  removeAdmin:  (id, pid)       => api.delete(`/clubs/${id}/admins/${pid}`),
  getCourts:    (id)            => api.get(`/clubs/${id}/courts`),
  createCourt:  (id, data)      => api.post(`/clubs/${id}/courts`, data),
  updateCourt:  (id, cId, data) => api.put(`/clubs/${id}/courts/${cId}`, data),
  deleteCourt:          (id, cId)       => api.delete(`/clubs/${id}/courts/${cId}`),
  updateTournamentTypes:(id, data)      => api.put(`/clubs/${id}/tournament-types`, data),
  // Club profile: the club's own admin edits these (name/slug stay super-admin only, via update()).
  getServiceCatalog:    ()              => api.get('/clubs/services'),
  // Directory open to every role: params = q, services, servicesMode, city, country, openDays, openNow,
  // minCourts, maxPrice, lat, lng, radiusKm, sort, dir, page, perPage (see ClubDirectoryService).
  directory:            (params, signal) => api.get('/clubs/directory', { params, signal }),
  card:                 (id, params)    => api.get(`/clubs/directory/${id}`, { params }),
  updateProfile:        (id, data)      => api.put(`/clubs/${id}/profile`, data),
  // Court management (a club's own admin): description of each court, bulk creation and the block calendar.
  getCourtCatalog:      ()              => api.get('/clubs/court-catalog'),
  createCourts:         (id, data)      => api.post(`/clubs/${id}/courts/bulk`, data),
  getCourtBlocks:       (id, params)    => api.get(`/clubs/${id}/court-blocks`, { params }),
  createCourtBlock:     (id, data)      => api.post(`/clubs/${id}/court-blocks`, data),
  updateCourtBlock:     (id, blockId, data) => api.put(`/clubs/${id}/court-blocks/${blockId}`, data),
  // scope: one | occurrence | following | all (see CourtBlockService::delete)
  deleteCourtBlock:     (id, blockId, scope = 'one') => api.delete(`/clubs/${id}/court-blocks/${blockId}`, { params: { scope } }),
  // Any role: which courts can be used in a slot — what a booking screen asks.
  courtAvailability:    (id, params)    => api.get(`/clubs/directory/${id}/availability`, { params }),
  uploadLogo:           (id, file)      => { const f = new FormData(); f.append('logo', file); return api.post(`/clubs/${id}/logo`, f, { headers: { 'Content-Type': 'multipart/form-data' } }); },
  removeLogo:           (id)            => api.delete(`/clubs/${id}/logo`),
};

// Preset creation only — management UI was removed in favour of in-tournament "Guardar como preset"
export const tournamentService = {
  create: (data) => api.post('/tournaments', data),
  delete: (id)   => api.delete(`/tournaments/${id}`),
};

// New configurable tournament-type registry (replaces the old hardcoded
// structure/pairingSystem string enums) — see Clubs.jsx's
// TournamentTypesPanel.
export const tournamentTypeService = {
  getAll: () => api.get('/tournament-types'),
};

// New tournament engine (GenericEngine — roles/rotation
// constraints/match generators/absence, configured per instance, not a
// port of the old Strategy Registry). Kept as its own service object
// rather than folded into `tournamentInstanceService` above: most of
// that object's 30+ methods (invite links, pair-requests, CimaPadel
// round editing, start/reset/archive lifecycle...) have no equivalent
// here yet, and mixing "supported" with "not supported" under one name
// invites calling something that quietly 404s.
export const tournamentEngineService = {
  getAll:            ()           => api.get('/tournament-instances'),
  getById:           (id)         => api.get(`/tournament-instances/${id}`),
  create:            (data)       => api.post('/tournament-instances', data),
  update:            (id, data)   => api.put(`/tournament-instances/${id}`, data),
  // Two-step: a tournament with played matches answers 409 {requiresConfirmation,
  // playedCount, totalMatches}; call again with confirmed=true to really delete it.
  delete:            (id, confirmed = false) => api.delete(`/tournament-instances/${id}`, { data: { confirmed } }),
  addParticipant:    (id, data)   => api.post(`/tournament-instances/${id}/participants`, data),
  removeParticipant: (id, pId)    => api.delete(`/tournament-instances/${id}/participants/${pId}`),
  pairParticipants:  (id, data)   => api.put(`/tournament-instances/${id}/participants/pair`, data),
  unpairParticipant: (id, data)   => api.put(`/tournament-instances/${id}/participants/unpair`, data),
  autoPairParticipants: (id)      => api.post(`/tournament-instances/${id}/participants/auto-pair`),
  setSubstitute:     (id, pid, data) => api.put(`/tournament-instances/${id}/participants/${pid}/substitute`, data),
  start:             (id)         => api.put(`/tournament-instances/${id}/start`),
  generateRound:     (id)         => api.post(`/tournament-instances/${id}/rounds`),
  getStandings:      (id)         => api.get(`/tournament-instances/${id}/standings`),
  setMatchResult:    (id, matchId, data) => api.put(`/tournament-instances/${id}/matches/${matchId}/result`, data),
  getLogs:           (id)         => api.get(`/tournament-instances/${id}/logs`),
  suspend:           (id)         => api.put(`/tournament-instances/${id}/suspend`),
  resume:            (id)         => api.put(`/tournament-instances/${id}/resume`),
  suspendMatch:      (id, matchId) => api.put(`/tournament-instances/${id}/matches/${matchId}/suspend`),
  resumeMatch:       (id, matchId) => api.put(`/tournament-instances/${id}/matches/${matchId}/resume`),
  generateInvite:    (id, data)   => api.post(`/tournament-instances/${id}/invite`, data),
  updateInvite:      (id, data)   => api.put(`/tournament-instances/${id}/invite`, data),
  updateResultMode:  (id, data)   => api.put(`/tournament-instances/${id}/result-mode`, data),
  updateMaxParticipants: (id, data) => api.put(`/tournament-instances/${id}/max-participants`, data),
  reset:             (id, keepPlayers = true) => api.post(`/tournament-instances/${id}/reset`, { keepPlayers }),
  archive:           (id)         => api.put(`/tournament-instances/${id}/archive`),
  getCourts:         (id)         => api.get(`/tournament-instances/${id}/courts`),
  setCourts:         (id, courtIds) => api.put(`/tournament-instances/${id}/courts`, { courtIds }),
};

export const notificationService = {
  getAll:         (archived=false) => api.get(`/notifications${archived ? '?archived=1' : ''}`),
  getUnreadCount: ()   => api.get('/notifications/unread-count'),
  markRead:       (id) => api.put(`/notifications/${id}/read`),
  markAllRead:    ()   => api.put('/notifications/read-all'),
  archive:        (id) => api.put(`/notifications/${id}/archive`),
  unarchive:      (id) => api.put(`/notifications/${id}/unarchive`),
};

export const messagingService = {
  getConversations:    (type)              => api.get(`/messages/conversations?type=${type}`),
  startUserConversation: (otherUserId)     => api.post('/messages/conversations/user', { otherUserId }),
  startClubConversation: (clubId, targetPlayerUserId) => api.post('/messages/conversations/club', { clubId, targetPlayerUserId }),
  getMessages:         (conversationId)    => api.get(`/messages/conversations/${conversationId}/messages`),
  sendMessage:         (conversationId, body) => api.post(`/messages/conversations/${conversationId}/messages`, { body }),
  getUnreadCount:      ()                  => api.get('/messages/unread-count'),
  block:               (targetType, targetId, asClubId) => api.post('/messages/block', { targetType, targetId, asClubId }),
  unblock:             (targetType, targetId, asClubId) => api.post('/messages/unblock', { targetType, targetId, asClubId }),
  getBlocked:          ()                  => api.get('/messages/blocked'),
};

export default api;
