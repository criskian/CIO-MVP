'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface Conversation {
  userId: string;
  phone: string;
  name: string;
  lastMessage: string;
  lastMessageDate: Date;
  totalMessages: number;
}

export default function ConversacionesPage() {
  const router = useRouter();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchConversations();
  }, []);

  const fetchConversations = async () => {
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      const response = await fetch(`${API_URL}/chat-history/conversations?limit=100`);
      
      if (!response.ok) {
        throw new Error('Error al cargar conversaciones');
      }

      const data = await response.json();
      setConversations(data);
    } catch (error) {
      console.error('Error:', error);
      alert('Error al cargar las conversaciones');
    } finally {
      setLoading(false);
    }
  };

  const filteredConversations = conversations.filter(
    (conv) =>
      conv.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      conv.phone.includes(searchTerm)
  );

  const formatDate = (date: Date) => {
    const d = new Date(date);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Ahora';
    if (diffMins < 60) return `Hace ${diffMins}m`;
    if (diffHours < 24) return `Hace ${diffHours}h`;
    if (diffDays < 7) return `Hace ${diffDays}d`;
    
    return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short' });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Cargando conversaciones...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">💬 Conversaciones</h1>
        <p className="text-gray-600">
          Historial de chats con los usuarios ({conversations.length} conversaciones)
        </p>
      </div>

      {/* Barra de búsqueda */}
      <div className="mb-6">
        <input
          type="text"
          placeholder="Buscar por nombre o teléfono..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      {/* Lista de conversaciones */}
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        {filteredConversations.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500">
              {searchTerm
                ? 'No se encontraron conversaciones'
                : 'No hay conversaciones todavía'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {filteredConversations.map((conv) => (
              <div
                key={conv.userId}
                onClick={() => router.push(`/dashboard/conversaciones/${conv.userId}`)}
                className="p-4 hover:bg-gray-50 cursor-pointer transition-colors flex items-start gap-4"
              >
                {/* Avatar */}
                <div className="flex-shrink-0 w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-bold text-lg">
                  {conv.name.charAt(0).toUpperCase()}
                </div>

                {/* Información */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between mb-1">
                    <h3 className="text-lg font-semibold text-gray-900 truncate">
                      {conv.name}
                    </h3>
                    <span className="text-sm text-gray-500 ml-2 flex-shrink-0">
                      {formatDate(conv.lastMessageDate)}
                    </span>
                  </div>
                  
                  <p className="text-sm text-gray-600 mb-1">{conv.phone}</p>
                  
                  <p className="text-sm text-gray-500 truncate">
                    {conv.lastMessage || 'Sin mensajes'}
                  </p>
                </div>

                {/* Badge de mensajes */}
                {conv.totalMessages > 0 && (
                  <div className="flex-shrink-0">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                      {conv.totalMessages} msgs
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}


