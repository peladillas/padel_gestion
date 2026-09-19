import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { messagingService, playerService, clubService } from '../services/api';
import {
  ChatBubbleLeftRightIcon, PlusIcon, ArrowLeftIcon, NoSymbolIcon,
  CheckCircleIcon, PaperAirplaneIcon, XMarkIcon,
} from '@heroicons/react/24/outline';

function timeAgo(iso) {
  if (!iso) return '';
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'ahora';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

function Avatar({ name, avatarUrl, size = 40 }) {
  const initials = (name || '?').split(' ').map(w => w[0]).filter(Boolean).join('').toUpperCase().slice(0, 2);
  if (avatarUrl) {
    return <img src={avatarUrl} alt="" style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />;
  }
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: 'var(--court-soft)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.36, fontWeight: 800, color: 'var(--court-deep)', flexShrink: 0 }}>
      {initials}
    </div>
  );
}

// ── Picker for starting a new conversation ──────────────────────────────────
function NewConversationPicker({ type, onPick, onClose }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        if (type === 'user') {
          const r = await playerService.search(q);
          if (alive) setResults((r.data || []).filter(p => p.user?.id));
        } else {
          const r = await clubService.listPublic();
          const list = r.data || [];
          if (alive) setResults(q ? list.filter(c => c.name.toLowerCase().includes(q.toLowerCase())) : list);
        }
      } catch { if (alive) setResults([]); }
      finally { if (alive) setLoading(false); }
    }, 250);
    return () => { alive = false; clearTimeout(timer); };
  }, [q, type]);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: 'var(--paper)', borderRadius: 16, padding: 20, width: '100%', maxWidth: 400, maxHeight: '80vh', display: 'flex', flexDirection: 'column', border: '1px solid var(--line)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--ink)' }}>{type === 'user' ? 'Nuevo mensaje a un jugador' : 'Nuevo mensaje a un club'}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-soft)' }}><XMarkIcon style={{ width: 18, height: 18 }} /></button>
        </div>
        <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder={type === 'user' ? 'Buscar jugador…' : 'Buscar club…'}
          style={{ border: '1px solid var(--line)', borderRadius: 10, padding: '9px 12px', fontSize: 13, marginBottom: 10, outline: 'none' }} />
        <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {loading ? (
            <div style={{ textAlign: 'center', color: 'var(--ink-soft)', fontSize: 12, padding: 16 }}>Buscando…</div>
          ) : results.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--ink-soft)', fontSize: 12, padding: 16 }}>Sin resultados</div>
          ) : results.map(r => (
            <button key={r.id} onClick={() => onPick(r)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 10, border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left' }}>
              <Avatar name={r.name} avatarUrl={r.avatarUrl || r.logoUrl} size={32} />
              <span style={{ fontSize: 13, color: 'var(--ink)', fontWeight: 600 }}>{r.name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Conversation list ────────────────────────────────────────────────────────
function ConversationList({ type, conversations, selectedId, onSelect, onNew }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '10px 12px', display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={onNew} aria-label="Nueva conversación"
          style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'var(--court-soft)', border: 'none', borderRadius: 10, padding: '6px 12px', color: 'var(--court-deep)', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
          <PlusIcon style={{ width: 14, height: 14 }} /> Nuevo
        </button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        {conversations.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--ink-soft)', fontSize: 13 }}>
            {type === 'user' ? 'No tenés conversaciones con jugadores' : 'No tenés conversaciones con clubes'}
          </div>
        ) : conversations.map(c => (
          <button key={c.id} onClick={() => onSelect(c)}
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', border: 'none',
              borderBottom: '1px solid var(--bone-2)', background: selectedId === c.id ? 'var(--court-soft)' : 'transparent',
              cursor: 'pointer', textAlign: 'left', width: '100%' }}>
            <Avatar name={c.with?.name} avatarUrl={c.with?.avatarUrl} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
                <span style={{ fontSize: 13, fontWeight: c.unread > 0 ? 800 : 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.with?.name}</span>
                <span style={{ fontSize: 10, color: 'var(--ink-soft)', flexShrink: 0 }}>{timeAgo(c.lastMessageAt)}</span>
              </div>
              <div style={{ fontSize: 12, color: c.unread > 0 ? 'var(--ink-mid)' : 'var(--ink-soft)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.lastMessage || 'Sin mensajes todavía'}</div>
            </div>
            {c.unread > 0 && (
              <span style={{ background: 'var(--crimson)', color: 'white', fontSize: 10, fontWeight: 700, borderRadius: 10, minWidth: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px', flexShrink: 0 }}>{c.unread}</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Thread view ───────────────────────────────────────────────────────────────
function Thread({ conversation, myUserId, onBack, onBlockChanged }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const bottomRef = useRef(null);

  const load = useCallback(() => {
    setLoading(true);
    messagingService.getMessages(conversation.id)
      .then(r => setMessages(r.data || []))
      .catch(() => setError('No se pudieron cargar los mensajes'))
      .finally(() => setLoading(false));
  }, [conversation.id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ block: 'nearest' }); }, [messages]);

  const handleSend = async (e) => {
    e.preventDefault();
    const text = body.trim();
    if (!text) return;
    setSending(true); setError('');
    try {
      const r = await messagingService.sendMessage(conversation.id, text);
      setMessages(prev => [...prev, r.data]);
      setBody('');
    } catch (ex) { setError(ex.response?.data?.error || 'Error al enviar'); }
    finally { setSending(false); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderBottom: '1px solid var(--bone-2)' }}>
        <button onClick={onBack} aria-label="Volver" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-soft)', display: 'flex' }}>
          <ArrowLeftIcon style={{ width: 18, height: 18 }} />
        </button>
        <Avatar name={conversation.with?.name} avatarUrl={conversation.with?.avatarUrl} size={32} />
        <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--ink)', flex: 1 }}>{conversation.with?.name}</span>
        <BlockButton conversation={conversation} onChanged={onBlockChanged} />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {loading ? (
          <div style={{ textAlign: 'center', color: 'var(--ink-soft)', fontSize: 12, padding: 20 }}>Cargando…</div>
        ) : messages.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--ink-soft)', fontSize: 12, padding: 20 }}>Todavía no hay mensajes — decí algo.</div>
        ) : messages.map(m => {
          const mine = m.senderUserId === myUserId;
          return (
            <div key={m.id} style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start' }}>
              <div style={{
                maxWidth: '75%', padding: '8px 12px', borderRadius: 14,
                borderBottomRightRadius: mine ? 4 : 14, borderBottomLeftRadius: mine ? 14 : 4,
                background: mine ? 'var(--court)' : 'var(--bone-2)', color: mine ? 'var(--ink)' : 'var(--ink-mid)',
                fontSize: 13, lineHeight: 1.4, wordBreak: 'break-word',
              }}>
                {m.body}
                <div style={{ fontSize: 9, opacity: 0.6, marginTop: 3, textAlign: 'right' }}>{timeAgo(m.createdAt)}</div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {error && <div style={{ fontSize: 11, color: 'var(--crimson)', padding: '0 12px 6px' }}>{error}</div>}
      <form onSubmit={handleSend} style={{ display: 'flex', gap: 8, padding: 10, borderTop: '1px solid var(--bone-2)' }}>
        <input value={body} onChange={e => setBody(e.target.value)} placeholder="Escribí un mensaje…"
          style={{ flex: 1, border: '1px solid var(--line)', borderRadius: 20, padding: '9px 14px', fontSize: 13, outline: 'none' }} />
        <button type="submit" disabled={sending || !body.trim()} aria-label="Enviar"
          style={{ width: 38, height: 38, borderRadius: '50%', border: 'none', background: 'var(--court)', color: 'var(--ink)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: sending ? 'default' : 'pointer', flexShrink: 0, opacity: sending || !body.trim() ? 0.6 : 1 }}>
          <PaperAirplaneIcon style={{ width: 16, height: 16 }} />
        </button>
      </form>
    </div>
  );
}

function BlockButton({ conversation, onChanged }) {
  const [blocked, setBlocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const targetType = conversation.with?.isClub ? 'club' : 'user';
  const targetId = conversation.with?.id;

  // We don't have a direct "am I blocked with this person" endpoint —
  // rely on the send-error surfacing it instead of pre-checking, to
  // avoid an extra request per conversation open. The button just
  // toggles optimistically; a failed send will still explain why.
  const toggle = async () => {
    setBusy(true);
    try {
      if (blocked) await messagingService.unblock(targetType, targetId);
      else await messagingService.block(targetType, targetId);
      setBlocked(!blocked);
      onChanged?.();
    } catch { /* ignore */ }
    finally { setBusy(false); }
  };

  return (
    <button onClick={toggle} disabled={busy} title={blocked ? 'Desbloquear' : 'Bloquear'}
      style={{ background: 'none', border: 'none', cursor: 'pointer', color: blocked ? 'var(--ok)' : 'var(--ink-soft)', padding: 4, flexShrink: 0 }}>
      {blocked ? <CheckCircleIcon style={{ width: 18, height: 18 }} /> : <NoSymbolIcon style={{ width: 18, height: 18 }} />}
    </button>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function Messages() {
  const { user } = useAuth();
  const [type, setType] = useState('user');
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [showPicker, setShowPicker] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await messagingService.getConversations(type);
      setConversations(r.data || []);
    } catch { setConversations([]); }
    finally { setLoading(false); }
  }, [type]);

  useEffect(() => { load(); }, [load]);

  const handleSelect = (conv) => {
    setSelected(conv);
    setConversations(prev => prev.map(c => c.id === conv.id ? { ...c, unread: 0 } : c));
  };

  const handlePick = async (item) => {
    setShowPicker(false);
    try {
      const r = type === 'user'
        ? await messagingService.startUserConversation(item.user.id)
        : await messagingService.startClubConversation(item.id);
      await load();
      setSelected({ id: r.data.id, with: type === 'user' ? { id: item.user.id, name: item.name, avatarUrl: item.avatarUrl } : { id: item.id, name: item.name, avatarUrl: item.logoUrl, isClub: true } });
    } catch (ex) { alert(ex.response?.data?.error || 'Error al iniciar la conversación'); }
  };

  return (
    <div style={{ padding: 16, maxWidth: 900, margin: '0 auto' }}>
      <h1 style={{ fontFamily: 'var(--display)', fontSize: 22, fontWeight: 700, color: 'var(--ink)', letterSpacing: '-0.02em', marginBottom: 12 }}>
        <em style={{ color: 'var(--court-deep)', fontStyle: 'normal' }}>Mensajes.</em>
      </h1>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, background: 'var(--bone-3)', borderRadius: 12, padding: 4, marginBottom: 12 }}>
        {[['user', 'Jugadores'], ['club', 'Clubs']].map(([id, label]) => (
          <button key={id} onClick={() => { setType(id); setSelected(null); }}
            style={{ padding: '8px 2px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
              background: type === id ? 'white' : 'transparent', color: type === id ? 'var(--ink-2)' : 'var(--ink-soft)' }}>
            {label}
          </button>
        ))}
      </div>

      <div style={{ background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 16, height: '65vh', minHeight: 420, overflow: 'hidden' }}>
        {/* Desktop: list + thread side by side. Mobile: one at a time. */}
        <div className="bp-messages-layout" style={{ display: 'grid', gridTemplateColumns: selected ? '0 1fr' : '1fr 0', height: '100%' }}>
          <div style={{ borderRight: '1px solid var(--bone-2)', overflow: 'hidden', display: selected ? 'none' : 'block' }}>
            {loading ? (
              <div style={{ textAlign: 'center', padding: 40, color: 'var(--ink-soft)', fontSize: 13 }}>Cargando…</div>
            ) : (
              <ConversationList type={type} conversations={conversations} selectedId={selected?.id} onSelect={handleSelect} onNew={() => setShowPicker(true)} />
            )}
          </div>
          <div style={{ overflow: 'hidden', display: selected ? 'block' : 'none' }}>
            {selected && (
              <Thread conversation={selected} myUserId={user?.id} onBack={() => { setSelected(null); load(); }} onBlockChanged={load} />
            )}
          </div>
        </div>
      </div>

      {!selected && conversations.length === 0 && !loading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, color: 'var(--ink-soft)', fontSize: 12 }}>
          <ChatBubbleLeftRightIcon style={{ width: 16, height: 16 }} />
          Usá "Nuevo" para empezar una conversación.
        </div>
      )}

      {showPicker && <NewConversationPicker type={type} onPick={handlePick} onClose={() => setShowPicker(false)} />}
    </div>
  );
}
