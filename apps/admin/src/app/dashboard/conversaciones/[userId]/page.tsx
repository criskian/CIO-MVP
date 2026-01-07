'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, User, Phone, Calendar, MessageSquare } from 'lucide-react';

interface ChatMessage {
  id: string;
  userId: string;
  direction: 'inbound' | 'outbound';
  content: string;
  conversationState: string | null;
  intent: string | null;
  isError: boolean;
  errorMessage: string | null;
  createdAt: string;
}

interface UserInfo {
  id: string;
  phone: string;
  name: string;
  email: string | null;
  createdAt: string;
}

interface Stats {
  totalMessages: number;
  errorMessages: number;
  byState: Array<{ state: string | null; count: number }>;
}

export default function ConversacionDetailPage() {
  const params = useParams();
  const router = useRouter();
  const userId = params?.userId as string;
  
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (userId) {
      fetchData();
    }
  }, [userId]);

  useEffect(() => {
    // Auto-scroll al final
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const fetchData = async () => {
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      
      // Cargar mensajes, info del usuario y estadísticas en paralelo
      const [messagesRes, statsRes, userRes] = await Promise.all([
        fetch(`${API_URL}/chat-history/user/${userId}?limit=500`),
        fetch(`${API_URL}/chat-history/user/${userId}/stats`),
        fetch(`${API_URL}/users/${userId}`),
      ]);

      if (!messagesRes.ok || !statsRes.ok) {
        throw new Error('Error al cargar datos');
      }

      const messagesData = await messagesRes.json();
      const statsData = await statsRes.json();
      
      setMessages(messagesData);
      setStats(statsData);

      if (userRes.ok) {
        const userData = await userRes.json();
        setUserInfo(userData);
      }
    } catch (error) {
      console.error('Error:', error);
      alert('Error al cargar la conversación');
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('es-CO', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Hoy';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Ayer';
    } else {
      return date.toLocaleDateString('es-CO', { 
        day: '2-digit', 
        month: 'short', 
        year: 'numeric' 
      });
    }
  };

  const groupMessagesByDate = () => {
    const groups: { [key: string]: ChatMessage[] } = {};
    
    messages.forEach((msg) => {
      const dateKey = new Date(msg.createdAt).toDateString();
      if (!groups[dateKey]) {
        groups[dateKey] = [];
      }
      groups[dateKey].push(msg);
    });

    return Object.entries(groups).map(([date, msgs]) => ({
      date: new Date(date),
      messages: msgs,
    }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Cargando conversación...</p>
        </div>
      </div>
    );
  }

  const messageGroups = groupMessagesByDate();

  return (
    <div className="h-screen flex flex-col bg-gray-100">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 shadow-sm">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push('/dashboard/conversaciones')}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>

          <div className="flex-shrink-0 w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-bold">
            {userInfo?.name?.charAt(0).toUpperCase() || '?'}
          </div>

          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold text-gray-900 truncate">
              {userInfo?.name || 'Usuario'}
            </h2>
            <p className="text-sm text-gray-600">{userInfo?.phone || userId}</p>
          </div>

          {/* Stats rápidas */}
          <div className="hidden md:flex items-center gap-4 text-sm text-gray-600">
            <div className="flex items-center gap-1">
              <MessageSquare className="w-4 h-4" />
              <span>{stats?.totalMessages || 0} mensajes</span>
            </div>
            {stats && stats.errorMessages > 0 && (
              <div className="flex items-center gap-1 text-red-600">
                <span>⚠️ {stats.errorMessages} errores</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        {messages.length === 0 ? (
          <div className="text-center py-12">
            <MessageSquare className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No hay mensajes en esta conversación</p>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto space-y-6">
            {messageGroups.map((group) => (
              <div key={group.date.toISOString()}>
                {/* Separador de fecha */}
                <div className="flex justify-center mb-4">
                  <span className="bg-white px-3 py-1 rounded-full text-xs font-medium text-gray-600 shadow-sm">
                    {formatDate(group.date.toISOString())}
                  </span>
                </div>

                {/* Mensajes del día */}
                <div className="space-y-2">
                  {group.messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex ${msg.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[70%] rounded-lg px-4 py-2 shadow-sm ${
                          msg.isError
                            ? 'bg-red-100 border border-red-200'
                            : msg.direction === 'outbound'
                            ? 'bg-green-500 text-white'
                            : 'bg-white text-gray-900'
                        }`}
                      >
                        <div className="whitespace-pre-wrap break-words text-sm">
                          {msg.content}
                        </div>
                        
                        <div className={`flex items-center justify-between gap-2 mt-1 text-xs ${
                          msg.direction === 'outbound' && !msg.isError
                            ? 'text-green-100'
                            : 'text-gray-500'
                        }`}>
                          <span>{formatTime(msg.createdAt)}</span>
                          {msg.conversationState && (
                            <span className="text-[10px] opacity-70 uppercase">
                              {msg.conversationState}
                            </span>
                          )}
                        </div>

                        {msg.isError && msg.errorMessage && (
                          <div className="mt-2 text-xs text-red-700 italic">
                            Error: {msg.errorMessage}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Footer - Info adicional */}
      <div className="bg-white border-t border-gray-200 px-4 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between text-sm text-gray-600">
          <div className="flex items-center gap-4">
            {userInfo?.email && (
              <span className="flex items-center gap-1">
                📧 {userInfo.email}
              </span>
            )}
            {userInfo?.createdAt && (
              <span className="flex items-center gap-1">
                <Calendar className="w-4 h-4" />
                Registrado: {new Date(userInfo.createdAt).toLocaleDateString('es-CO')}
              </span>
            )}
          </div>
          
          <button
            onClick={() => router.push(`/dashboard/usuarios/${userId}`)}
            className="text-blue-600 hover:text-blue-700 font-medium"
          >
            Ver perfil completo →
          </button>
        </div>
      </div>
    </div>
  );
}

