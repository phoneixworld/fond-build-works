import type { InstantTemplate } from "../instantTemplates";

export const CHAT_APP: InstantTemplate = {
  id: "chat-app",
  matchIds: ["chat-app"],
  deps: { "lucide-react": "^0.400.0" },
  files: {
    "/App.jsx": `import React, { useState } from "react";
import ConversationList from "./components/ConversationList";
import ChatArea from "./components/ChatArea";
import UserProfile from "./components/UserProfile";

const initialConversations = [
  { id: 1, name: "Design Team", avatar: "DT", color: "from-blue-500 to-indigo-500", lastMessage: "The new mockups look great!", time: "2m ago", unread: 3, online: true, isGroup: true },
  { id: 2, name: "Sarah Chen", avatar: "SC", color: "from-pink-500 to-rose-500", lastMessage: "Can you review the PR?", time: "15m ago", unread: 1, online: true },
  { id: 3, name: "Marcus Williams", avatar: "MW", color: "from-emerald-500 to-teal-500", lastMessage: "Meeting at 3pm confirmed", time: "1h ago", unread: 0, online: false },
  { id: 4, name: "Product Launch", avatar: "PL", color: "from-amber-500 to-orange-500", lastMessage: "Timeline updated in the doc", time: "2h ago", unread: 0, online: true, isGroup: true },
  { id: 5, name: "Priya Patel", avatar: "PP", color: "from-violet-500 to-purple-500", lastMessage: "Thanks for the feedback!", time: "3h ago", unread: 0, online: false },
  { id: 6, name: "Dev Channel", avatar: "DC", color: "from-cyan-500 to-sky-500", lastMessage: "Deployed v2.4.1 to staging", time: "5h ago", unread: 12, online: true, isGroup: true },
];

const initialMessages = {
  1: [
    { id: 1, sender: "Alex Kim", avatar: "AK", text: "Hey team! I just pushed the new component library updates.", time: "10:30 AM", isMine: false },
    { id: 2, sender: "You", text: "Awesome! I'll review them this afternoon.", time: "10:32 AM", isMine: true },
    { id: 3, sender: "Lisa Park", avatar: "LP", text: "The new mockups look great! Love the color system changes.", time: "10:35 AM", isMine: false },
  ],
};

export default function App() {
  const [conversations] = useState(initialConversations);
  const [activeConvo, setActiveConvo] = useState(1);
  const [messages, setMessages] = useState(initialMessages);
  const [profileOpen, setProfileOpen] = useState(false);

  const sendMessage = (text) => {
    const msg = { id: Date.now(), sender: "You", text, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), isMine: true };
    setMessages(prev => ({ ...prev, [activeConvo]: [...(prev[activeConvo] || []), msg] }));
  };

  const active = conversations.find(c => c.id === activeConvo);

  return (
    <div className="h-screen flex bg-white">
      <ConversationList conversations={conversations} activeId={activeConvo} onSelect={setActiveConvo} />
      <ChatArea conversation={active} messages={messages[activeConvo] || []} onSend={sendMessage} onProfileClick={() => setProfileOpen(true)} />
      {profileOpen && <UserProfile conversation={active} onClose={() => setProfileOpen(false)} />}
    </div>
  );
}`,

    "/components/ConversationList.jsx": `import React, { useState } from "react";
import { Search, Edit, Settings } from "lucide-react";

export default function ConversationList({ conversations, activeId, onSelect }) {
  const [search, setSearch] = useState("");
  const filtered = conversations.filter(c => c.name.toLowerCase().includes(search.toLowerCase()));
  return (
    <div className="w-80 border-r border-gray-100 flex flex-col bg-white flex-shrink-0">
      <div className="p-4 border-b border-gray-100">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold text-gray-900">Messages</h1>
          <div className="flex gap-1">
            <button className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"><Edit className="w-4 h-4" /></button>
            <button className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"><Settings className="w-4 h-4" /></button>
          </div>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search conversations..." className="w-full pl-10 pr-4 py-2.5 bg-gray-100 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-200 transition-all" />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {filtered.map(c => (
          <button key={c.id} onClick={() => onSelect(c.id)} className={"w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-gray-50 " + (c.id === activeId ? "bg-blue-50 border-r-2 border-blue-500" : "")}>
            <div className="relative flex-shrink-0">
              <div className={"w-11 h-11 rounded-full bg-gradient-to-br " + c.color + " flex items-center justify-center text-white text-sm font-bold"}>{c.avatar}</div>
              {c.online && <span className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-emerald-400 border-2 border-white rounded-full" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex justify-between items-baseline">
                <span className="font-semibold text-sm text-gray-900 truncate">{c.name}</span>
                <span className="text-[11px] text-gray-400 ml-2 flex-shrink-0">{c.time}</span>
              </div>
              <p className="text-xs text-gray-500 truncate mt-0.5">{c.lastMessage}</p>
            </div>
            {c.unread > 0 && <span className="w-5 h-5 bg-blue-500 text-white text-[10px] rounded-full flex items-center justify-center font-bold flex-shrink-0">{c.unread}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}`,

    "/components/ChatArea.jsx": `import React, { useState, useRef, useEffect } from "react";
import { Send, Paperclip, Smile, Phone, Video, MoreVertical, Image } from "lucide-react";

export default function ChatArea({ conversation, messages, onSend, onProfileClick }) {
  const [input, setInput] = useState("");
  const bottomRef = useRef(null);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const handleSend = () => { if (input.trim()) { onSend(input.trim()); setInput(""); } };
  const handleKeyDown = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } };

  if (!conversation) return <div className="flex-1 flex items-center justify-center text-gray-400">Select a conversation</div>;

  return (
    <div className="flex-1 flex flex-col">
      <div className="h-16 border-b border-gray-100 flex items-center justify-between px-6">
        <button onClick={onProfileClick} className="flex items-center gap-3 hover:opacity-80 transition-opacity">
          <div className={"w-9 h-9 rounded-full bg-gradient-to-br " + conversation.color + " flex items-center justify-center text-white text-xs font-bold"}>{conversation.avatar}</div>
          <div>
            <p className="font-semibold text-sm text-gray-900">{conversation.name}</p>
            <p className="text-[11px] text-emerald-500 font-medium">{conversation.online ? "Online" : "Offline"}</p>
          </div>
        </button>
        <div className="flex items-center gap-1">
          <button className="p-2.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"><Phone className="w-4 h-4" /></button>
          <button className="p-2.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"><Video className="w-4 h-4" /></button>
          <button className="p-2.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"><MoreVertical className="w-4 h-4" /></button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 bg-gray-50/50">
        {messages.map(m => (
          <div key={m.id} className={"flex " + (m.isMine ? "justify-end" : "justify-start")}>
            <div className={"max-w-[70%] " + (m.isMine ? "" : "flex gap-2.5")}>
              {!m.isMine && <div className="w-8 h-8 rounded-full bg-gradient-to-br from-gray-300 to-gray-400 flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0 mt-1">{m.avatar}</div>}
              <div>
                {!m.isMine && <p className="text-[11px] text-gray-500 mb-1 font-medium">{m.sender}</p>}
                <div className={"px-4 py-2.5 rounded-2xl text-sm leading-relaxed " + (m.isMine ? "bg-blue-500 text-white rounded-br-md" : "bg-white text-gray-800 border border-gray-100 rounded-bl-md shadow-sm")}>
                  {m.text}
                </div>
                <p className={"text-[10px] text-gray-400 mt-1 " + (m.isMine ? "text-right" : "")}>{m.time}</p>
              </div>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="p-4 border-t border-gray-100 bg-white">
        <div className="flex items-center gap-2 bg-gray-100 rounded-2xl px-4 py-1">
          <button className="p-2 text-gray-400 hover:text-gray-600"><Paperclip className="w-4 h-4" /></button>
          <button className="p-2 text-gray-400 hover:text-gray-600"><Image className="w-4 h-4" /></button>
          <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKeyDown} placeholder="Type a message..." className="flex-1 bg-transparent py-2.5 text-sm outline-none text-gray-800 placeholder:text-gray-400" />
          <button className="p-2 text-gray-400 hover:text-gray-600"><Smile className="w-4 h-4" /></button>
          <button onClick={handleSend} disabled={!input.trim()} className="p-2 text-blue-500 hover:text-blue-600 disabled:opacity-30 transition-colors">
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}`,

    "/components/UserProfile.jsx": `import React from "react";
import { X, Mail, Phone, MapPin, Star } from "lucide-react";

export default function UserProfile({ conversation, onClose }) {
  if (!conversation) return null;
  return (
    <div className="w-72 border-l border-gray-100 bg-white flex flex-col">
      <div className="flex items-center justify-between p-4 border-b border-gray-100">
        <h3 className="font-semibold text-sm">Profile</h3>
        <button onClick={onClose}><X className="w-4 h-4 text-gray-400" /></button>
      </div>
      <div className="p-6 text-center">
        <div className={"w-20 h-20 rounded-full bg-gradient-to-br " + conversation.color + " flex items-center justify-center text-white text-xl font-bold mx-auto mb-4"}>{conversation.avatar}</div>
        <h2 className="font-bold text-gray-900">{conversation.name}</h2>
        <p className="text-sm text-emerald-500 font-medium mt-1">{conversation.online ? "Online" : "Offline"}</p>
      </div>
      <div className="px-6 space-y-4">
        <div className="flex items-center gap-3 text-sm text-gray-600"><Mail className="w-4 h-4 text-gray-400" /> {conversation.name.toLowerCase().replace(/ /g, ".")}@email.com</div>
        <div className="flex items-center gap-3 text-sm text-gray-600"><Phone className="w-4 h-4 text-gray-400" /> +1 (555) 123-4567</div>
        <div className="flex items-center gap-3 text-sm text-gray-600"><MapPin className="w-4 h-4 text-gray-400" /> San Francisco, CA</div>
      </div>
      <div className="px-6 mt-6">
        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Shared Files</h4>
        <div className="space-y-2">
          {["design-v3.fig", "requirements.pdf", "wireframes.png"].map(f => (
            <div key={f} className="flex items-center gap-2 p-2.5 bg-gray-50 rounded-lg text-sm text-gray-600 hover:bg-gray-100 cursor-pointer">{f}</div>
          ))}
        </div>
      </div>
    </div>
  );
}`,

    "/styles/globals.css": `@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
@tailwind base;
@tailwind components;
@tailwind utilities;
@layer base {
  body { font-family: 'Inter', system-ui, sans-serif; @apply bg-white text-gray-800 antialiased; }
}`,
  },
};
