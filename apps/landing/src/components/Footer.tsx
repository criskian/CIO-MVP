export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-gray-900 text-gray-300 py-8 md:py-12 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
          {/* Columna 1: Sobre CIO */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <span className="text-2xl">🎯</span>
              <span className="text-xl font-bold text-white">CIO</span>
            </div>
            <p className="text-sm text-gray-400 leading-relaxed">
              Cazador Inteligente de Oportunidades. Tu asistente personal para encontrar
              empleo en Colombia.
            </p>
          </div>

          {/* Columna 2: Características */}
          <div>
            <h3 className="text-white font-semibold mb-4">Características</h3>
            <ul className="space-y-2 text-sm">
              <li className="flex items-center gap-2">
                <span className="text-green-400">✓</span>
                <span>Búsqueda personalizada</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="text-green-400">✓</span>
                <span>Alertas diarias</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="text-green-400">✓</span>
                <span>100% gratuito</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="text-green-400">✓</span>
                <span>Vía WhatsApp</span>
              </li>
            </ul>
          </div>

          {/* Columna 3: Contacto */}
          <div>
            <h3 className="text-white font-semibold mb-4">Información</h3>
            <ul className="space-y-2 text-sm">
              <li className="flex items-center gap-2">
                <span>🇨🇴</span>
                <span>Localizado para Colombia</span>
              </li>
              <li className="flex items-center gap-2">
                <span>🔒</span>
                <span>Datos protegidos</span>
              </li>
              <li className="flex items-center gap-2">
                <span>⚡</span>
                <span>MVP en desarrollo</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Línea divisoria */}
        <div className="border-t border-gray-800 pt-6">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-gray-500">
            <p>© {currentYear} CIO - Cazador Inteligente de Oportunidades</p>
            <p>Hecho con 💚 para Colombia</p>
          </div>
        </div>
      </div>
    </footer>
  );
}

