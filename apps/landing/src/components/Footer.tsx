export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-gray-300 py-16 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12 mb-12">
          {/* Columna 1: Sobre CIO */}
          <div>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-xl flex items-center justify-center">
                <span className="text-white font-bold text-lg">C</span>
              </div>
              <span className="text-2xl font-bold text-white">CIO</span>
            </div>
            <p className="text-gray-400 leading-relaxed">
              Cazador Inteligente de Oportunidades. Tu asistente personal para encontrar
              empleo en Colombia.
            </p>
          </div>

          {/* Columna 2: Características */}
          <div>
            <h3 className="text-white font-bold text-lg mb-6">Características</h3>
            <ul className="space-y-3">
              <li className="flex items-center gap-3 text-gray-400 hover:text-white transition-colors">
                <div className="w-5 h-5 bg-purple-500/20 rounded-lg flex items-center justify-center">
                  <svg className="w-3 h-3 text-purple-400" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
                <span>Búsqueda personalizada</span>
              </li>
              <li className="flex items-center gap-3 text-gray-400 hover:text-white transition-colors">
                <div className="w-5 h-5 bg-purple-500/20 rounded-lg flex items-center justify-center">
                  <svg className="w-3 h-3 text-purple-400" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
                <span>Alertas diarias automáticas</span>
              </li>
              <li className="flex items-center gap-3 text-gray-400 hover:text-white transition-colors">
                <div className="w-5 h-5 bg-purple-500/20 rounded-lg flex items-center justify-center">
                  <svg className="w-3 h-3 text-purple-400" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
                <span>100% gratuito</span>
              </li>
              <li className="flex items-center gap-3 text-gray-400 hover:text-white transition-colors">
                <div className="w-5 h-5 bg-purple-500/20 rounded-lg flex items-center justify-center">
                  <svg className="w-3 h-3 text-purple-400" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
                <span>Vía WhatsApp</span>
              </li>
            </ul>
          </div>

          {/* Columna 3: Información */}
          <div>
            <h3 className="text-white font-bold text-lg mb-6">Información</h3>
            <ul className="space-y-3">
              <li className="flex items-start gap-3 text-gray-400">
                <span className="text-2xl">🇨🇴</span>
                <div>
                  <p className="font-medium text-white">Colombia</p>
                  <p className="text-sm">Especializado para el mercado colombiano</p>
                </div>
              </li>
              <li className="flex items-start gap-3 text-gray-400">
                <span className="text-2xl">🔒</span>
                <div>
                  <p className="font-medium text-white">Seguro</p>
                  <p className="text-sm">Tus datos están protegidos</p>
                </div>
              </li>
              <li className="flex items-start gap-3 text-gray-400">
                <span className="text-2xl">⚡</span>
                <div>
                  <p className="font-medium text-white">Rápido</p>
                  <p className="text-sm">Configuración en 2 minutos</p>
                </div>
              </li>
            </ul>
          </div>
        </div>

        {/* Línea divisoria */}
        <div className="border-t border-gray-700/50 pt-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-gray-500">
            <p>© {currentYear} CIO - Cazador Inteligente de Oportunidades</p>
            <p className="flex items-center gap-2">
              Hecho con
              <span className="text-purple-400">♥</span>
              para Colombia
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
