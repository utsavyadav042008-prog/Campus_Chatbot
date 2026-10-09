import { useMemo, useState } from 'react';
import { LogOut, MessageSquarePlus, Search, SearchX } from 'lucide-react';
import Avatar from '../ui/Avatar.jsx';
import Button from '../ui/Button.jsx';
import Input from '../ui/Input.jsx';
import Logo from '../ui/Logo.jsx';
import { Badge, EmptyState } from '../ui/Feedback.jsx';
import ConversationItem from './ConversationItem.jsx';
import { getConversationTitle } from '../../lib/conversation.js';

function Section({ label, children }) {
  return (
    <section className="mb-2">
      <h2 className="px-3 pt-3 pb-1 text-[11px] font-semibold tracking-wider text-ink-subtle uppercase">{label}</h2>
      <div className="space-y-0.5">{children}</div>
    </section>
  );
}

export default function Sidebar({ me, myId, conversations, onLogout, loggingOut, isPreview }) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((c) => getConversationTitle(c, myId).toLowerCase().includes(q));
  }, [conversations, query, myId]);

  const starred = filtered.filter((c) => c.isStarred);
  const others = filtered.filter((c) => !c.isStarred);

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <Logo />
        <Button variant="ghost" size="icon" onClick={onLogout} loading={loggingOut} aria-label="Log out" title="Log out">
          {loggingOut ? null : <LogOut className="h-4.5 w-4.5" aria-hidden="true" />}
        </Button>
      </header>

      <div className="flex items-center gap-3 px-4 py-3">
        <Avatar name={me?.name} src={me?.profilePicture} size="sm" online />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{me?.name}</p>
          <p className="truncate text-xs text-ink-subtle">{me?.email}</p>
        </div>
        {isPreview ? <Badge tone="warning">Preview</Badge> : null}
      </div>

      <div className="flex items-center gap-2 px-4 pb-2">
        <Input
          icon={Search}
          placeholder="Search chats"
          aria-label="Search chats"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1"
        />
        <Button variant="secondary" size="icon" aria-label="New conversation" title="New conversation (Part 2)" disabled>
          <MessageSquarePlus className="h-4.5 w-4.5" aria-hidden="true" />
        </Button>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 pb-4" aria-label="Conversations">
        {filtered.length === 0 ? (
          <EmptyState
            icon={SearchX}
            title={query ? 'No chats match' : 'No conversations yet'}
            description={query ? `Nothing found for "${query}".` : 'Search for a classmate to start chatting.'}
          />
        ) : (
          <>
            {starred.length ? (
              <Section label="Starred">
                {starred.map((c) => <ConversationItem key={c._id} conversation={c} myId={myId} />)}
              </Section>
            ) : null}
            <Section label="All chats">
              {others.map((c) => <ConversationItem key={c._id} conversation={c} myId={myId} />)}
            </Section>
          </>
        )}
      </nav>
    </div>
  );
}
