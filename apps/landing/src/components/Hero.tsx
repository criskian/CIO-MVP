interface HeroProps {
  whatsappLink: string;
}

export default function Hero({ whatsappLink }: HeroProps) {
  return (
    <section className="text-center px-4 py-12 md:py-20">
      <div className="max-w-4xl mx-auto">
        {/* Logo/Badge */}
        <div className="inline-flex items-center justify-center w-16 h-16 md:w-20 md:h-20 bg-gradient-to-br from-green-400 to-green-600 rounded-2xl mb-6 shadow-lg">
          <span className="text-3xl md:text-4xl">🎯</span>
        </div>

        {/* Título Principal */}
        <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-gray-900 mb-4 md:mb-6 leading-tight">
          CIO
          <span className="block text-3xl md:text-4xl lg:text-5xl mt-2 bg-gradient-to-r from-green-600 to-blue-600 bg-clip-text text-transparent">
            Cazador Inteligente de Oportunidades
          </span>
        </h1>

        {/* Subtítulo */}
        <p className="text-lg md:text-xl lg:text-2xl text-gray-600 mb-8 md:mb-10 max-w-3xl mx-auto leading-relaxed">
          Tu asistente personal para encontrar las mejores ofertas de empleo en Colombia.{' '}
          <span className="font-semibold text-gray-800">
            Conversa con CIO por WhatsApp
          </span>{' '}
          y recibe alertas diarias personalizadas.
        </p>

        {/* CTA Principal */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
          <a
            href={whatsappLink}
            target="_blank"
            rel="noopener noreferrer"
            className="group w-full sm:w-auto inline-flex items-center justify-center gap-3 bg-green-500 hover:bg-green-600 text-white font-bold py-4 px-8 rounded-xl text-lg transition-all duration-200 shadow-lg hover:shadow-xl hover:scale-105 active:scale-95"
          >
            <span className="text-2xl group-hover:animate-bounce">📱</span>
            <span>Hablar con CIO ahora</span>
          </a>
        </div>

        {/* Badge de Colombia */}
        <div className="mt-8 flex items-center justify-center gap-2 text-sm text-gray-500">
          <span className="text-2xl">🇨🇴</span>
          <span>Especializado para Colombia</span>
        </div>
      </div>
    </section>
  );
}

