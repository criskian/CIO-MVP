export default function Home() {
  // TODO: Obtener número de WhatsApp desde variables de entorno
  const whatsappNumber = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || '573001234567';
  const whatsappLink = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(
    'Hola CIO, quiero buscar trabajo',
  )}`;

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="max-w-2xl mx-auto p-8 text-center">
        <h1 className="text-5xl font-bold text-gray-900 mb-4">
          CIO - Cazador Inteligente de Oportunidades
        </h1>

        <p className="text-xl text-gray-700 mb-8">
          Tu asistente personal para encontrar las mejores ofertas de empleo en Colombia.
          Conversa con CIO por WhatsApp y recibe alertas diarias personalizadas.
        </p>

        <div className="space-y-6 mb-8 text-left bg-white p-6 rounded-lg shadow-md">
          <div>
            <h2 className="text-lg font-semibold text-gray-800 mb-2">¿Cómo funciona?</h2>
            <ol className="list-decimal list-inside space-y-2 text-gray-600">
              <li>Habla con CIO por WhatsApp</li>
              <li>Cuéntale sobre el trabajo que buscas</li>
              <li>Recibe ofertas personalizadas todos los días</li>
            </ol>
          </div>
        </div>

        <a
          href={whatsappLink}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block bg-green-500 hover:bg-green-600 text-white font-bold py-4 px-8 rounded-lg text-xl transition-colors duration-200 shadow-lg hover:shadow-xl"
        >
          📱 Hablar con CIO en WhatsApp
        </a>

        <p className="text-sm text-gray-500 mt-8">
          MVP en desarrollo - Localizado para Colombia 🇨🇴
        </p>
      </div>
    </main>
  );
}

