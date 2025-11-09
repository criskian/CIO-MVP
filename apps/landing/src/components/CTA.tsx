interface CTAProps {
  whatsappLink: string;
}

export default function CTA({ whatsappLink }: CTAProps) {
  return (
    <section className="py-16 md:py-24 px-4 bg-gradient-to-br from-green-600 to-green-700">
      <div className="max-w-4xl mx-auto text-center">
        <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-4 md:mb-6">
          ¿Listo para encontrar tu próximo empleo?
        </h2>
        <p className="text-lg md:text-xl text-green-50 mb-8 md:mb-10 max-w-2xl mx-auto">
          Empieza ahora mismo. Solo te tomará 2 minutos configurar tu perfil y comenzar a
          recibir ofertas.
        </p>

        <a
          href={whatsappLink}
          target="_blank"
          rel="noopener noreferrer"
          className="group inline-flex items-center justify-center gap-3 bg-white text-green-700 hover:bg-gray-50 font-bold py-4 px-8 md:py-5 md:px-10 rounded-xl text-lg md:text-xl transition-all duration-200 shadow-xl hover:shadow-2xl hover:scale-105 active:scale-95"
        >
          <span className="text-2xl group-hover:animate-bounce">📱</span>
          <span>Comenzar gratis ahora</span>
        </a>

        <p className="text-green-100 text-sm mt-6">
          No se requiere registro • 100% gratuito • Solo WhatsApp
        </p>
      </div>
    </section>
  );
}

